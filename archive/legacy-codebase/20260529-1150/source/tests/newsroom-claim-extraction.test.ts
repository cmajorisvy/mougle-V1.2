import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clusterArticles,
  type ClusterableArticle,
} from "../server/services/newsroom/clusteringService";
import { extractClusterClaims } from "../server/services/newsroom/claimExtractionService";

const fx = (overrides: Partial<ClusterableArticle>): ClusterableArticle => ({
  id: overrides.id ?? Math.floor(Math.random() * 1e9),
  sourceName: overrides.sourceName ?? "Generic News",
  sourceUrl: overrides.sourceUrl ?? "https://example.com/a",
  title: overrides.title ?? "Untitled",
  summary: overrides.summary ?? null,
  category: overrides.category ?? null,
  publishedAt: overrides.publishedAt ?? "2026-05-15T12:00:00.000Z",
});

async function singleCluster(articles: ClusterableArticle[]) {
  const clusters = await clusterArticles(articles, {
    similarityThreshold: 0,
  });
  assert.equal(clusters.length, 1);
  return clusters[0];
}

describe("extractClusterClaims — deterministic", () => {
  it("produces a headline claim from the anchor article", async () => {
    const articles = [
      fx({
        id: 1,
        sourceName: "OpenAI Blog",
        sourceUrl: "https://openai.com/x",
        title: "OpenAI releases GPT-5.5 with 1,000,000 token context window",
        summary:
          "On 2026-05-15, OpenAI announced GPT-5.5 in San Francisco. The model supports 1,000,000 tokens of context.",
        publishedAt: "2026-05-15T10:00:00Z",
      }),
      fx({
        id: 2,
        sourceName: "TechCrunch",
        sourceUrl: "https://techcrunch.com/x",
        title: "OpenAI launches GPT-5.5 model with extended context",
        summary:
          "TechCrunch reports that OpenAI launched GPT-5.5 on 2026-05-15 in San Francisco.",
        publishedAt: "2026-05-15T11:00:00Z",
      }),
    ];
    const cluster = await singleCluster(articles);
    const byId = new Map(articles.map((a) => [a.id, a]));
    const ex = await extractClusterClaims(cluster, byId);
    assert.equal(ex.clusterId, cluster.id);
    assert.ok(ex.headlineClaim.includes("OpenAI"));
    assert.ok(ex.claims.length >= 1);
    assert.equal(ex.claims[0].evidence.length, 2);
    assert.equal(ex.claims[0].evidence[0].supports, true);
  });

  it("extracts ISO and Month-Day dates", async () => {
    const articles = [
      fx({
        id: 1,
        title: "Election scheduled",
        summary: "Voters head to the polls on 2026-05-15. Results expected May 16, 2026.",
      }),
    ];
    const cluster = await singleCluster(articles);
    const ex = await extractClusterClaims(cluster, new Map([[1, articles[0]]]));
    assert.ok(ex.dates.includes("2026-05-15"));
    assert.ok(ex.dates.some((d) => /May/i.test(d)));
  });

  it("extracts locations from the seed lexicon", async () => {
    const articles = [
      fx({
        id: 1,
        title: "Tech summit opens in San Francisco",
        summary:
          "Leaders from London, Tokyo, and New York gathered. The summit took place in San Francisco.",
      }),
    ];
    const cluster = await singleCluster(articles);
    const ex = await extractClusterClaims(cluster, new Map([[1, articles[0]]]));
    assert.ok(ex.locations.includes("San Francisco"));
    assert.ok(ex.locations.includes("London"));
    assert.ok(ex.locations.includes("Tokyo"));
  });

  it("extracts named entities and ranks by mentions", async () => {
    const articles = [
      fx({
        id: 1,
        title: "OpenAI and Microsoft expand partnership",
        summary:
          "OpenAI announced a new deal. Microsoft confirmed the partnership. OpenAI plans to release further models.",
      }),
    ];
    const cluster = await singleCluster(articles);
    const ex = await extractClusterClaims(cluster, new Map([[1, articles[0]]]));
    const top = ex.entities[0];
    assert.equal(top.text, "OpenAI");
    assert.ok(top.mentions >= 2);
  });

  it("records source references for every cluster member", async () => {
    const articles = [
      fx({ id: 1, sourceName: "A", sourceUrl: "https://a.com/1", title: "Story" }),
      fx({ id: 2, sourceName: "B", sourceUrl: "https://b.com/1", title: "Story" }),
      fx({ id: 3, sourceName: "C", sourceUrl: "https://c.com/1", title: "Story" }),
    ];
    const cluster = await singleCluster(articles);
    const byId = new Map(articles.map((a) => [a.id, a]));
    const ex = await extractClusterClaims(cluster, byId);
    assert.equal(ex.sourceReferences.length, 3);
    assert.deepEqual(
      ex.sourceReferences.map((r) => r.sourceName).sort(),
      ["A", "B", "C"],
    );
  });

  it("marks disputed metrics when sources disagree", async () => {
    const articles = [
      fx({
        id: 1,
        sourceName: "Reuters",
        sourceUrl: "https://reuters.com/1",
        title: "Earthquake casualties reported",
        summary: "Officials say casualties reached 200 people.",
      }),
      fx({
        id: 2,
        sourceName: "AP",
        sourceUrl: "https://ap.com/1",
        title: "Earthquake casualties update",
        summary: "Officials say casualties reached 350 people.",
      }),
    ];
    const cluster = await singleCluster(articles);
    const byId = new Map(articles.map((a) => [a.id, a]));
    const ex = await extractClusterClaims(cluster, byId);
    assert.ok(ex.disputedMarkers.length >= 1);
    const d = ex.disputedMarkers[0];
    assert.ok(d.values.length >= 2);
    assert.ok(d.articleIds.length >= 2);
  });

  it("places a confidence placeholder in 0..1", async () => {
    const articles = [
      fx({ id: 1, title: "Solo source story", summary: "Some text with numbers 42." }),
    ];
    const cluster = await singleCluster(articles);
    const ex = await extractClusterClaims(cluster, new Map([[1, articles[0]]]));
    assert.ok(ex.confidencePlaceholder >= 0);
    assert.ok(ex.confidencePlaceholder <= 1);
  });

  it("respects maxClaims", async () => {
    const articles = [
      fx({
        id: 1,
        title: "Many key facts",
        summary:
          "Apple sold 100,000 units. Microsoft reported $50 billion revenue. Google launched 5 new products on 2026-01-01. Meta hired 1,000 engineers in 2026. Amazon opened 20 warehouses.",
      }),
    ];
    const cluster = await singleCluster(articles);
    const ex = await extractClusterClaims(cluster, new Map([[1, articles[0]]]), {
      maxClaims: 2,
    });
    assert.ok(ex.claims.length <= 2);
  });

  it("DOES NOT invoke extractor by default", async () => {
    let calls = 0;
    const articles = [fx({ id: 1, title: "Test", summary: "Some summary text." })];
    const cluster = await singleCluster(articles);
    await extractClusterClaims(cluster, new Map([[1, articles[0]]]), {
      extractor: () => {
        calls++;
        return {} as any;
      },
      // useExtractor not set => OFF
    });
    assert.equal(calls, 0);
  });

  it("invokes extractor when useExtractor=true", async () => {
    let calls = 0;
    const articles = [fx({ id: 1, title: "Test", summary: "Some summary text." })];
    const cluster = await singleCluster(articles);
    const ex = await extractClusterClaims(
      cluster,
      new Map([[1, articles[0]]]),
      {
        useExtractor: true,
        extractor: (draft) => {
          calls++;
          return { ...draft, headlineClaim: "REWRITTEN" };
        },
      },
    );
    assert.equal(calls, 1);
    assert.equal(ex.headlineClaim, "REWRITTEN");
  });

  it("extractor failure falls back to deterministic draft", async () => {
    const articles = [fx({ id: 1, title: "Test", summary: "Some summary." })];
    const cluster = await singleCluster(articles);
    const ex = await extractClusterClaims(
      cluster,
      new Map([[1, articles[0]]]),
      {
        useExtractor: true,
        extractor: () => {
          throw new Error("provider down");
        },
      },
    );
    // Falls back: headlineClaim is the deterministic one, not undefined.
    assert.ok(ex.headlineClaim.length > 0);
  });

  it("output is stable across runs (deterministic)", async () => {
    const articles = [
      fx({
        id: 1,
        title: "OpenAI releases GPT-5.5 in San Francisco on 2026-05-15",
        summary: "1,000,000 token context window announced.",
      }),
    ];
    const cluster = await singleCluster(articles);
    const byId = new Map([[1, articles[0]]]);
    const a = await extractClusterClaims(cluster, byId);
    const b = await extractClusterClaims(cluster, byId);
    assert.deepEqual(a, b);
  });
});
