/**
 * Phase 1B — Verified Newsroom — Claim Extraction Service (deterministic).
 *
 * SAFETY:
 *   - Pure function. No DB I/O. No HTTP. No provider calls.
 *   - LLM is OPT-IN via `opts.extractor` injection only. Default path is
 *     fully deterministic and uses regex + simple lexical heuristics.
 *   - Output is a *draft*; verification happens later and is gated by an
 *     explicit root-admin action (NOT in scope for this service).
 *
 * Grounded in:
 *   - docs/architecture/CODEX_PHASE_1B_VERIFIED_NEWSROOM_ARCHITECTURE.md §7
 */

import type { ClusterableArticle, EventCluster } from "./clusteringService";

export interface ExtractedClaim {
  statement: string;
  subject: string | null;
  metric: string | null;
  timeReference: string | null;
  evidence: Array<{
    articleId: number | string;
    sourceName: string;
    url: string;
    supports: boolean;
  }>;
  contradictedBy: Array<{
    articleId: number | string;
    sourceName: string;
    url: string;
    conflictingValue: string;
  }>;
  confidence: number; // 0..1 placeholder — see formula below
}

export interface ExtractedNamedEntity {
  text: string;
  kind: "person" | "org" | "location" | "other";
  mentions: number;
}

export interface ClusterExtraction {
  clusterId: string;
  headlineClaim: string;
  keyFacts: string[];
  dates: string[];
  locations: string[];
  entities: ExtractedNamedEntity[];
  claims: ExtractedClaim[];
  sourceReferences: Array<{
    articleId: number | string;
    sourceName: string;
    url: string;
  }>;
  disputedMarkers: Array<{
    metric: string;
    values: string[];
    articleIds: Array<number | string>;
  }>;
  confidencePlaceholder: number;
}

export interface ExtractionOptions {
  maxClaims?: number;
  /**
   * Optional LLM-backed enricher. When provided AND `useExtractor === true`
   * it is invoked once per cluster with the deterministic draft and may
   * return a refined claim list. Default is OFF.
   */
  extractor?: (draft: ClusterExtraction) =>
    | ClusterExtraction
    | Promise<ClusterExtraction>;
  useExtractor?: boolean;
}

/* --------------------------------------------------------------------- */
/* Lexical helpers                                                        */
/* --------------------------------------------------------------------- */

const DATE_PATTERNS: RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}\b/g, // ISO
  /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{4})?\b/g,
  /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b/g,
  /\b\d{4}\b(?=\s*(?:[A-Z]|$))/g, // bare 4-digit year preceding a capitalised word
];

const NUMBER_PATTERN =
  /(?:US\$|USD\s?|\$|€|£|¥)?\s?\d[\d,]*(?:\.\d+)?\s?(?:%|percent|million|billion|trillion|thousand|k|m|bn|tn|users|people|deaths|cases|tonnes|tons|kg|mph|km\/h)?\b/gi;

// Tiny seed lexicon — extensible by caller via fixtures.
const LOCATION_SEEDS = new Set<string>([
  "United States","USA","U.S.","UK","United Kingdom","London","Washington",
  "New York","San Francisco","Beijing","Tokyo","Paris","Berlin","Moscow",
  "Brussels","Geneva","Sydney","Mumbai","Delhi","Dubai","Toronto","Ottawa",
  "Israel","Gaza","Ukraine","Russia","China","India","Japan","Germany",
  "France","Italy","Spain","Canada","Mexico","Brazil","Australia",
  "California","Texas","Florida","Silicon Valley",
]);

const ORG_SUFFIXES = /\b(?:Inc|Corp|Corporation|Ltd|LLC|PLC|GmbH|SA|AG|Co|Group|Holdings|Foundation|Labs|Lab|University|Bank|Bank of)\b/;

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function extractDates(text: string): string[] {
  const out = new Set<string>();
  for (const re of DATE_PATTERNS) {
    const m = text.match(re);
    if (m) for (const v of m) out.add(v.trim());
  }
  return Array.from(out);
}

function extractNumbers(text: string): string[] {
  const m = text.match(NUMBER_PATTERN);
  if (!m) return [];
  return Array.from(new Set(m.map((v) => v.trim()))).filter(
    (v) => /\d/.test(v),
  );
}

function extractCapitalSequences(text: string): string[] {
  // Capitalised multi-word phrases, broken by punctuation (commas, periods,
  // semicolons, etc.) so comma-separated lists like "London, Tokyo, New York"
  // surface as three entities rather than a single glued span.
  const seqs: string[] = [];
  const tokens = text.split(/\s+/);
  let i = 0;
  while (i < tokens.length) {
    const buf: string[] = [];
    let breakAfter = false;
    while (i < tokens.length) {
      const raw = tokens[i];
      const trailingPunct = /[.,;:!?]$/.test(raw);
      const clean = raw.replace(/[.,;:!?]+$/, "");
      if (!/^[A-Z][\p{L}.&'-]*$/u.test(clean)) break;
      buf.push(clean);
      i++;
      if (trailingPunct) {
        breakAfter = true;
        break;
      }
      if (buf.length >= 5) break;
    }
    if (buf.length >= 1) seqs.push(buf.join(" "));
    if (!breakAfter) i++;
  }
  return seqs.filter((s) => s.length >= 2);
}

function classifyEntity(text: string): ExtractedNamedEntity["kind"] {
  if (LOCATION_SEEDS.has(text)) return "location";
  if (ORG_SUFFIXES.test(text)) return "org";
  if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(text)) return "person";
  return "other";
}

/* --------------------------------------------------------------------- */
/* Main entry                                                             */
/* --------------------------------------------------------------------- */

export async function extractClusterClaims(
  cluster: EventCluster,
  articlesById: Map<number | string, ClusterableArticle>,
  opts: ExtractionOptions = {},
): Promise<ClusterExtraction> {
  const maxClaims = opts.maxClaims ?? 8;

  const memberArticles = cluster.members
    .map((m) => articlesById.get(m.articleId))
    .filter((a): a is ClusterableArticle => Boolean(a));

  const anchorMember = cluster.members.find((m) => m.role === "anchor");
  const anchor =
    (anchorMember && articlesById.get(anchorMember.articleId)) ||
    memberArticles[0];

  const allText = memberArticles
    .map((a) => `${a.title}. ${a.summary ?? ""}`)
    .join(" ");

  const sentences = splitSentences(allText);
  const dates = extractDates(allText);
  const entitiesRaw = extractCapitalSequences(allText);

  // Dedupe + count mentions
  const entityCounts = new Map<string, number>();
  for (const e of entitiesRaw) entityCounts.set(e, (entityCounts.get(e) ?? 0) + 1);

  const entities: ExtractedNamedEntity[] = Array.from(entityCounts.entries())
    .map(([text, mentions]) => ({ text, kind: classifyEntity(text), mentions }))
    .sort((a, b) => b.mentions - a.mentions);

  const locations = entities.filter((e) => e.kind === "location").map((e) => e.text);

  // Key facts: sentences with ≥1 number OR ≥1 date OR ≥2 capitalised tokens.
  const keyFacts: string[] = [];
  for (const s of sentences) {
    const score =
      (extractNumbers(s).length > 0 ? 1 : 0) +
      (extractDates(s).length > 0 ? 1 : 0) +
      (extractCapitalSequences(s).length >= 2 ? 1 : 0);
    if (score >= 1 && !keyFacts.includes(s)) keyFacts.push(s);
    if (keyFacts.length >= 5) break;
  }

  // Per-numeric-metric disagreement detection across articles.
  const metricMap = new Map<
    string,
    Array<{ value: string; articleId: number | string }>
  >();
  for (const a of memberArticles) {
    const t = `${a.title}. ${a.summary ?? ""}`;
    for (const s of splitSentences(t)) {
      for (const num of extractNumbers(s)) {
        // Group by the leading non-numeric word (a coarse "metric")
        const key = s
          .toLowerCase()
          .split(/\s+/)
          .find((w) => /^[a-z]{4,}$/.test(w)) ?? "value";
        const arr = metricMap.get(key) ?? [];
        arr.push({ value: num, articleId: a.id });
        metricMap.set(key, arr);
      }
    }
  }

  const disputedMarkers: ClusterExtraction["disputedMarkers"] = [];
  for (const [metric, vals] of metricMap.entries()) {
    const distinct = Array.from(new Set(vals.map((v) => v.value)));
    const distinctArticles = Array.from(new Set(vals.map((v) => v.articleId)));
    if (distinct.length >= 2 && distinctArticles.length >= 2) {
      disputedMarkers.push({
        metric,
        values: distinct,
        articleIds: distinctArticles,
      });
    }
  }

  // Build claims: anchor headline first, then up to (maxClaims-1) key-fact claims.
  const claims: ExtractedClaim[] = [];
  const supportEvidence = memberArticles.map((a) => ({
    articleId: a.id,
    sourceName: a.sourceName,
    url: a.sourceUrl,
    supports: true,
  }));

  claims.push({
    statement: (anchor?.title ?? cluster.canonicalTitle).slice(0, 280),
    subject: entities[0]?.text ?? null,
    metric: null,
    timeReference: dates[0] ?? null,
    evidence: supportEvidence,
    contradictedBy: [],
    confidence: 0.5,
  });

  for (const fact of keyFacts) {
    if (claims.length >= maxClaims) break;
    const factNumbers = extractNumbers(fact);
    const factDates = extractDates(fact);
    claims.push({
      statement: fact.slice(0, 280),
      subject:
        entities.find((e) =>
          fact.toLowerCase().includes(e.text.toLowerCase()),
        )?.text ?? null,
      metric: factNumbers[0] ?? null,
      timeReference: factDates[0] ?? null,
      evidence: supportEvidence,
      contradictedBy: [],
      confidence: 0.5,
    });
  }

  // Mark contradictions on claims whose statement contains a disputed metric.
  for (const claim of claims) {
    const stmt = claim.statement.toLowerCase();
    for (const d of disputedMarkers) {
      if (stmt.includes(d.metric)) {
        claim.contradictedBy = d.articleIds
          .filter((id) => id !== claim.evidence[0]?.articleId)
          .map((id) => {
            const a = articlesById.get(id);
            return {
              articleId: id,
              sourceName: a?.sourceName ?? "unknown",
              url: a?.sourceUrl ?? "",
              conflictingValue: d.values.join(" vs "),
            };
          });
        // Penalize confidence on contradicted claims.
        claim.confidence = Math.max(0, claim.confidence - 0.2);
      }
    }
  }

  // Confidence placeholder for the whole extraction:
  //   0.4 * cluster.confidence
  // + 0.3 * (distinctSources >= 2 ? 1 : 0.4)
  // + 0.2 * (keyFacts.length / 5)
  // - 0.1 * (disputedMarkers.length > 0 ? 1 : 0)
  const placeholder =
    0.4 * cluster.confidence +
    0.3 * (cluster.distinctSources >= 2 ? 1 : 0.4) +
    0.2 * Math.min(1, keyFacts.length / 5) -
    0.1 * (disputedMarkers.length > 0 ? 1 : 0);

  const draft: ClusterExtraction = {
    clusterId: cluster.id,
    headlineClaim: claims[0]?.statement ?? cluster.canonicalTitle,
    keyFacts,
    dates,
    locations,
    entities: entities.slice(0, 20),
    claims,
    sourceReferences: memberArticles.map((a) => ({
      articleId: a.id,
      sourceName: a.sourceName,
      url: a.sourceUrl,
    })),
    disputedMarkers,
    confidencePlaceholder: Math.max(0, Math.min(1, placeholder)),
  };

  if (opts.useExtractor && opts.extractor) {
    try {
      return await opts.extractor(draft);
    } catch {
      // Deterministic fallback on extractor failure.
      return draft;
    }
  }
  return draft;
}
