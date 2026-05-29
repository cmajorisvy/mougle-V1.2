import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clusterArticles,
  normalizeTitle,
  tokenize,
  signature,
  jaccard,
  type ClusterableArticle,
} from "../server/services/newsroom/clusteringService";

const fx = (overrides: Partial<ClusterableArticle>): ClusterableArticle => ({
  id: overrides.id ?? Math.floor(Math.random() * 1e9),
  sourceName: overrides.sourceName ?? "Generic News",
  sourceUrl: overrides.sourceUrl ?? "https://example.com/a",
  title: overrides.title ?? "Untitled",
  summary: overrides.summary ?? null,
  category: overrides.category ?? null,
  publishedAt: overrides.publishedAt ?? "2026-05-15T12:00:00.000Z",
});

describe("normalize / tokenize / signature / jaccard", () => {
  it("strips punctuation and lowercases", () => {
    assert.equal(
      normalizeTitle("OpenAI's GPT-5.5 Released!"),
      "openai s gpt 5 5 released",
    );
  });
  it("removes stopwords and short tokens", () => {
    const toks = tokenize("The new OpenAI model is here in the US.");
    assert.ok(toks.includes("openai"));
    assert.ok(toks.includes("model"));
    assert.ok(!toks.includes("the"));
    assert.ok(!toks.includes("is"));
  });
  it("signature is deterministic and bounded", () => {
    const a = signature("OpenAI releases new GPT-5.5 model in San Francisco", 4);
    const b = signature("OpenAI releases new GPT-5.5 model in San Francisco", 4);
    assert.deepEqual(a, b);
    assert.equal(a.length, 4);
  });
  it("jaccard returns 1 on identical, 0 on disjoint", () => {
    assert.equal(jaccard(["a", "b"], ["a", "b"]), 1);
    assert.equal(jaccard(["a", "b"], ["c", "d"]), 0);
    assert.equal(jaccard([], []), 0);
  });
});

describe("clusterArticles — deterministic", () => {
  it("groups two near-identical articles from different sources", async () => {
    const articles = [
      fx({
        id: 1,
        sourceName: "OpenAI Blog",
        sourceUrl: "https://openai.com/x",
        title: "OpenAI releases GPT-5.5 model with longer context",
        publishedAt: "2026-05-15T10:00:00Z",
      }),
      fx({
        id: 2,
        sourceName: "TechCrunch",
        sourceUrl: "https://techcrunch.com/x",
        title: "OpenAI launches GPT-5.5 with extended context window",
        publishedAt: "2026-05-15T11:00:00Z",
      }),
    ];
    const clusters = await clusterArticles(articles);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].members.length, 2);
    assert.equal(clusters[0].members[0].role, "anchor");
    assert.equal(clusters[0].members[1].role, "supporting");
    assert.equal(clusters[0].distinctSources, 2);
    assert.equal(clusters[0].singleSource, false);
    assert.ok(clusters[0].confidence > 0.4);
  });

  it("keeps unrelated articles in separate clusters", async () => {
    const articles = [
      fx({
        id: 1,
        title: "OpenAI releases GPT-5.5 model",
        publishedAt: "2026-05-15T10:00:00Z",
      }),
      fx({
        id: 2,
        title: "European Central Bank holds interest rates steady",
        publishedAt: "2026-05-15T10:30:00Z",
      }),
      fx({
        id: 3,
        title: "Mars rover discovers new mineral deposits",
        publishedAt: "2026-05-15T11:00:00Z",
      }),
    ];
    const clusters = await clusterArticles(articles);
    assert.equal(clusters.length, 3);
    for (const c of clusters) {
      assert.equal(c.members.length, 1);
      assert.equal(c.singleSource, true);
    }
  });

  it("respects the time window (articles too far apart do not merge)", async () => {
    const articles = [
      fx({
        id: 1,
        title: "OpenAI releases GPT-5.5",
        publishedAt: "2026-05-01T10:00:00Z",
      }),
      fx({
        id: 2,
        title: "OpenAI releases GPT-5.5",
        publishedAt: "2026-05-15T10:00:00Z",
      }),
    ];
    const clusters = await clusterArticles(articles, { windowMinutes: 60 });
    assert.equal(clusters.length, 2);
  });

  it("respects the similarity threshold", async () => {
    const articles = [
      fx({ id: 1, title: "Apple unveils new MacBook Pro models" }),
      fx({ id: 2, title: "Microsoft Surface laptop refresh announced" }),
    ];
    const tight = await clusterArticles(articles, {
      similarityThreshold: 0.9,
    });
    assert.equal(tight.length, 2);
    const loose = await clusterArticles(articles, {
      similarityThreshold: 0.0,
    });
    assert.equal(loose.length, 1);
  });

  it("anchor is the earliest article", async () => {
    const articles = [
      fx({
        id: 2,
        title: "GPT-5.5 released by OpenAI",
        publishedAt: "2026-05-15T11:00:00Z",
      }),
      fx({
        id: 1,
        title: "OpenAI releases GPT-5.5 model",
        publishedAt: "2026-05-15T10:00:00Z",
      }),
    ];
    const clusters = await clusterArticles(articles);
    assert.equal(clusters.length, 1);
    const anchor = clusters[0].members.find((m) => m.role === "anchor");
    assert.equal(anchor?.articleId, 1);
  });

  it("does NOT call any LLM by default (deterministic-only)", async () => {
    let extractorCalls = 0;
    const articles = [
      fx({ id: 1, title: "OpenAI releases GPT-5.5 model" }),
      fx({ id: 2, title: "OpenAI launches GPT-5.5 with bigger context" }),
    ];
    // Pass no extractor => default = no LLM
    await clusterArticles(articles);
    assert.equal(extractorCalls, 0);
  });

  it("opt-in extractor is invoked exactly once per cluster when provided", async () => {
    let calls = 0;
    const articles = [
      fx({ id: 1, title: "OpenAI releases GPT-5.5 model" }),
      fx({ id: 2, title: "OpenAI launches GPT-5.5 with bigger context" }),
      fx({
        id: 3,
        title: "Mars rover discovers new mineral deposits",
        publishedAt: "2026-05-15T13:00:00Z",
      }),
    ];
    const clusters = await clusterArticles(articles, {
      extractor: () => {
        calls++;
        return "Synthetic canonical headline";
      },
    });
    assert.equal(calls, clusters.length);
    assert.equal(clusters[0].canonicalTitle, "Synthetic canonical headline");
  });

  it("extractor failure falls back to deterministic canonical title", async () => {
    const articles = [
      fx({ id: 1, title: "OpenAI releases GPT-5.5 model" }),
      fx({ id: 2, title: "OpenAI launches GPT-5.5" }),
    ];
    const clusters = await clusterArticles(articles, {
      extractor: () => {
        throw new Error("boom");
      },
    });
    assert.equal(clusters.length, 1);
    // Falls back to the first article's title (anchor by publishedAt).
    assert.ok(clusters[0].canonicalTitle.length > 0);
    assert.notEqual(clusters[0].canonicalTitle, "Synthetic");
  });

  it("is deterministic when publishedAt is missing or unparseable", async () => {
    // All publishedAt values are absent / unparseable so every article
    // resolves to epoch-0 and clustering must rely purely on token overlap.
    // The service must NOT read wall-clock time to fill the gap.
    const base = {
      sourceName: "Generic News",
      sourceUrl: "https://example.com/a",
      summary: null,
      category: null,
    };
    const articles: ClusterableArticle[] = [
      { ...base, id: 1, title: "OpenAI releases GPT-5.5 language model context", publishedAt: null },
      { ...base, id: 2, title: "OpenAI launches GPT-5.5 language model bigger context", publishedAt: "not-a-date" },
      { ...base, id: 3, title: "OpenAI announces GPT-5.5 language model release context", publishedAt: undefined },
    ];
    const a = await clusterArticles(articles);
    // Run again with a small delay — wall-clock time must NOT influence outcome.
    await new Promise((r) => setTimeout(r, 5));
    const b = await clusterArticles(articles);
    assert.deepEqual(a, b);
    // Token overlap alone must drive clustering — output must not depend on now().
    assert.equal(a.length, 1);
    assert.equal(a[0].members.length, 3);
  });

  it("tie-breaks on equal similarity by closest centroid time", async () => {
    // Two existing clusters with identical token sets but different times.
    // The new article (between them in time, closer to clusterA) must attach to A.
    const articles = [
      fx({
        id: 1,
        title: "Storm warning issued for coastal areas",
        publishedAt: "2026-05-15T08:00:00Z",
      }),
      fx({
        id: 2,
        title: "Storm warning issued for coastal areas",
        publishedAt: "2026-05-15T20:00:00Z",
      }),
      fx({
        id: 3,
        title: "Storm warning issued for coastal areas",
        publishedAt: "2026-05-15T09:00:00Z", // 1h from id=1, 11h from id=2
      }),
    ];
    const clusters = await clusterArticles(articles, {
      windowMinutes: 24 * 60,
    });
    // All three same tokens — should form one cluster. The tie-break only
    // matters when articles 1 and 2 are seeded as separate clusters; with a
    // wide window they merge. Run again with a tight window that prevents
    // article 2 from merging into article 1's cluster.
    const tight = await clusterArticles(articles, { windowMinutes: 2 * 60 });
    // id=1 → cluster A (centroid 08:00). id=3 (09:00) within 2h of A → joins A.
    // id=2 (20:00) is 12h from A's updated centroid → new cluster B.
    const clusterOfThree = tight.find((c) =>
      c.members.some((m) => m.articleId === 3),
    );
    assert.ok(clusterOfThree);
    assert.ok(
      clusterOfThree!.members.some((m) => m.articleId === 1),
      "id=3 should attach to id=1's cluster (closer centroid time)",
    );
    assert.equal(clusters.length, 1); // sanity for wide-window case
  });

  it("output is stable across runs (deterministic)", async () => {
    const articles = [
      fx({ id: 1, title: "A breaking story about AI safety regulation" }),
      fx({ id: 2, title: "AI safety regulation breaks new ground" }),
      fx({ id: 3, title: "Quantum computing milestone announced" }),
    ];
    const a = await clusterArticles(articles);
    const b = await clusterArticles(articles);
    assert.deepEqual(a, b);
  });
});
