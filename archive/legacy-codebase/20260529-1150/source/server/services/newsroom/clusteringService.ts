/**
 * Phase 1B — Verified Newsroom — Clustering Service (deterministic, pure).
 *
 * SAFETY:
 *   - Pure function. No DB I/O. No HTTP. No provider calls.
 *   - LLM extraction is OPT-IN via `opts.extractor` injection only. There is
 *     no default LLM path and no module-level OpenAI import. If the caller
 *     does not pass `extractor`, behavior is fully deterministic.
 *   - No autonomous promotion. Clustering produces previews only.
 *
 * Grounded in:
 *   - docs/architecture/CODEX_PHASE_1B_VERIFIED_NEWSROOM_ARCHITECTURE.md §6
 */

export interface ClusterableArticle {
  id: number | string;
  sourceName: string;
  sourceUrl: string;
  title: string;
  summary?: string | null;
  category?: string | null;
  publishedAt?: Date | string | null;
}

export type ClusterMemberRole = "anchor" | "supporting" | "contradicting";

export interface ClusterMember {
  articleId: number | string;
  similarity: number;
  role: ClusterMemberRole;
}

export interface EventCluster {
  id: string;
  canonicalTitle: string;
  topicTags: string[];
  signatureTokens: string[];
  members: ClusterMember[];
  distinctSources: number;
  earliestPublishedAt: string;
  latestPublishedAt: string;
  confidence: number; // pre-claim cluster cohesion 0..1
  singleSource: boolean;
}

export interface ClusterOptions {
  windowMinutes?: number; // default 4320 (72h)
  similarityThreshold?: number; // default 0.3 Jaccard (first-pass, tunable)
  signatureSize?: number; // default 6 tokens
  minClusterSize?: number; // default 1 (allow singletons for preview)
  /**
   * Optional LLM-backed extractor for canonical title rewrite. When omitted,
   * the deterministic path is used. This is the only LLM hook.
   */
  extractor?: (input: { titles: string[]; summaries: string[] }) =>
    | string
    | Promise<string>;
}

const STOPWORDS = new Set<string>([
  "a","an","and","are","as","at","be","but","by","for","from","has","have",
  "he","her","his","i","in","into","is","it","its","of","on","or","our",
  "she","that","the","their","them","they","this","to","was","we","were",
  "what","when","where","which","who","will","with","you","your","over",
  "after","before","new","says","said","report","reports","update","news",
  "vs","via","amid","could","would","should",
]);

const PUNCT_RE = /[^\p{L}\p{N}\s]/gu;

export function normalizeTitle(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(PUNCT_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(text: string): string[] {
  return normalizeTitle(text)
    .split(" ")
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Deterministic signature: top-N tokens by length desc then alpha asc. */
export function signature(text: string, size: number): string[] {
  const uniq = Array.from(new Set(tokenize(text)));
  uniq.sort((a, b) => b.length - a.length || a.localeCompare(b));
  return uniq.slice(0, size).sort();
}

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersect = 0;
  for (const t of setA) if (setB.has(t)) intersect++;
  const union = setA.size + setB.size - intersect;
  if (union === 0) return 0;
  return intersect / union;
}

function toDate(d: Date | string | null | undefined): Date {
  if (!d) return new Date(0);
  if (d instanceof Date) return d;
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Greedy deterministic clustering by token Jaccard + time window.
 *
 * Ordering: articles sorted by publishedAt asc → earliest article in a
 * cluster becomes the anchor. Within a tie on similarity, the cluster
 * with the closest centroid time wins.
 */
export async function clusterArticles(
  articles: ClusterableArticle[],
  opts: ClusterOptions = {},
): Promise<EventCluster[]> {
  const windowMs = (opts.windowMinutes ?? 4320) * 60_000;
  const threshold = opts.similarityThreshold ?? 0.3;
  const sigSize = opts.signatureSize ?? 6;
  const minSize = opts.minClusterSize ?? 1;

  type Working = EventCluster & {
    _tokens: Set<string>;
    _centroidMs: number;
    _hosts: Set<string>;
    _titles: string[];
    _summaries: string[];
  };

  const sorted = [...articles].sort(
    (a, b) => toDate(a.publishedAt).getTime() - toDate(b.publishedAt).getTime(),
  );

  const clusters: Working[] = [];
  let nextId = 1;

  for (const art of sorted) {
    const sig = signature(`${art.title} ${art.summary ?? ""}`, sigSize);
    const tokens = new Set(sig);
    const publishedMs = toDate(art.publishedAt).getTime();

    // Find best candidate cluster.
    // Tie-break (per algorithm contract): on equal similarity, prefer the
    // cluster whose centroid time is closest to this article's publishedAt.
    let best: { cluster: Working; sim: number; delta: number } | null = null;
    for (const c of clusters) {
      const sim = jaccard(Array.from(tokens), Array.from(c._tokens));
      const timeDelta = Math.abs(publishedMs - c._centroidMs);
      if (sim >= threshold && timeDelta <= windowMs) {
        if (
          !best ||
          sim > best.sim ||
          (sim === best.sim && timeDelta < best.delta)
        ) {
          best = { cluster: c, sim, delta: timeDelta };
        }
      }
    }

    if (best) {
      const c = best.cluster;
      c.members.push({
        articleId: art.id,
        similarity: round3(best.sim),
        role: "supporting",
      });
      for (const t of tokens) c._tokens.add(t);
      const n = c.members.length;
      // If the new article has no parseable timestamp, keep the existing
      // centroid (deterministic — never read wall-clock time).
      const sample = publishedMs > 0 ? publishedMs : c._centroidMs;
      c._centroidMs = (c._centroidMs * (n - 1) + sample) / n;
      c._hosts.add(hostnameOf(art.sourceUrl));
      c._titles.push(art.title);
      if (art.summary) c._summaries.push(art.summary);
      if (publishedMs) {
        const latest = new Date(c.latestPublishedAt).getTime();
        if (publishedMs > latest) c.latestPublishedAt = isoOf(publishedMs);
      }
    } else {
      const id = `cl_${nextId++}`;
      const isoTime = isoOf(publishedMs);
      clusters.push({
        id,
        canonicalTitle: art.title,
        topicTags: art.category ? [art.category] : [],
        signatureTokens: sig,
        members: [{ articleId: art.id, similarity: 1, role: "anchor" }],
        distinctSources: 0,
        earliestPublishedAt: isoTime,
        latestPublishedAt: isoTime,
        confidence: 0,
        singleSource: true,
        _tokens: tokens,
        // Deterministic: use parsed timestamp or epoch-0 (never wall-clock).
        _centroidMs: publishedMs > 0 ? publishedMs : 0,
        _hosts: new Set([hostnameOf(art.sourceUrl)]),
        _titles: [art.title],
        _summaries: art.summary ? [art.summary] : [],
      });
    }
  }

  // Optional LLM canonical-title rewrite (opt-in only).
  if (opts.extractor) {
    for (const c of clusters) {
      try {
        const rewritten = await opts.extractor({
          titles: c._titles,
          summaries: c._summaries,
        });
        if (typeof rewritten === "string" && rewritten.trim().length > 0) {
          c.canonicalTitle = rewritten.trim().slice(0, 200);
        }
      } catch {
        // Deterministic fallback — keep existing canonicalTitle.
      }
    }
  }

  // Finalize: distinct source count, single-source flag, cohesion confidence.
  const finalized = clusters
    .filter((c) => c.members.length >= minSize)
    .map((c) => {
      c.distinctSources = c._hosts.size;
      c.singleSource = c._hosts.size <= 1;
      // Cohesion: mean similarity of non-anchor members, blended with
      // a source-diversity bonus and a base floor for any cluster.
      const supporting = c.members.filter((m) => m.role !== "anchor");
      const meanSim =
        supporting.length === 0
          ? 1
          : supporting.reduce((s, m) => s + m.similarity, 0) /
            supporting.length;
      const diversityBonus = c._hosts.size >= 2 ? 0.3 : 0.0;
      c.confidence = clamp01(0.1 + 0.6 * meanSim + diversityBonus);
      const { _tokens, _centroidMs, _hosts, _titles, _summaries, ...pub } = c;
      return pub as EventCluster;
    });

  return finalized;
}

function isoOf(ms: number): string {
  if (!ms || Number.isNaN(ms)) return new Date(0).toISOString();
  return new Date(ms).toISOString();
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
