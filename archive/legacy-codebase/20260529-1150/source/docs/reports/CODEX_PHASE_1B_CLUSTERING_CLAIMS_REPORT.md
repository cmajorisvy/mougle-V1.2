# Phase 1B — Clustering & Claim Extraction (First Pass)

Status: **Merged, services-only, dry-run admin preview only. No DB writes. No autonomous publishing. No real provider calls.**

Grounded in `docs/architecture/CODEX_PHASE_1B_VERIFIED_NEWSROOM_ARCHITECTURE.md` §6 (clustering) and §7 (claim extraction).

---

## 1. Files changed

| File | Kind | Purpose |
|---|---|---|
| `server/services/newsroom/clusteringService.ts` | new (pure) | Deterministic event clustering over raw articles. |
| `server/services/newsroom/claimExtractionService.ts` | new (pure) | Deterministic claim / fact / entity / contradiction extraction. |
| `server/routes/newsroom-preview-routes.ts` | new | Two admin-only, dry-run preview routes. |
| `server/routes.ts` | +2 lines | Imports and registers preview routes inside `registerRoutes`. |
| `tests/newsroom-clustering.test.ts` | new | 12 node:test sub-tests across 2 suites. |
| `tests/newsroom-claim-extraction.test.ts` | new | 12 node:test sub-tests across 1 suite. |
| `package.json` | 1-line edit | Adds the two new test files to the `test` script. |
| `docs/reports/CODEX_PHASE_1B_CLUSTERING_CLAIMS_REPORT.md` | new | This report. |

No changes to `shared/schema.ts`, `drizzle.config.ts`, or any schema/migration file.

---

## 1a. Approved first-pass deviations from architecture §6

The architecture document specifies a richer scoring function (weighted title-token + hashtag + domain + time-bucket + category features, threshold 0.55, union-find grouping). This PR ships a **deliberately simpler first-pass** that uses Jaccard on title+summary tokens with greedy nearest-cluster attachment. Justification:

- The current `news_articles` table populates titles reliably but hashtag/category quality is uneven, and there is no per-article entity field yet — feeding noisy/empty features into a weighted score would *reduce* precision, not improve it.
- Greedy attachment with a small Jaccard threshold produces stable, inspectable clusters that admins can validate via the dry-run preview before we commit to a more complex scorer.
- Union-find and weighted features land in a follow-up PR (after a real corpus is observed in `cluster-preview`); this PR’s service signature and admin route shapes are forward-compatible.

These deviations are listed here explicitly so the next pass can amend or restore §6 semantics without surprise.

## 2. Clustering service

Pure function `clusterArticles(articles, opts)`. Input shape `ClusterableArticle` (DB-row-shaped but not bound to Drizzle).

Algorithm (deterministic):

1. Normalize each title (lowercase, strip punctuation, drop stopwords, length > 2).
2. Build a top-N signature (default 6 tokens, sorted alpha for stability).
3. Sort all articles by `publishedAt` ascending (earliest first).
4. Greedy attach: for each article, find the best existing cluster where:
   - Jaccard token similarity ≥ threshold (default **0.3**, configurable), AND
   - `|publishedAt − cluster centroid time|` ≤ window (default **72 h**, configurable).
5. New cluster otherwise. **Anchor = earliest article in the cluster**, others = `supporting`.
6. Track distinct source hostnames; `singleSource` flips when ≥ 2 distinct hosts contribute.
7. Cluster confidence = clamp(0.1 + 0.6 · meanSupportingSim + 0.3·[≥2 sources], 0..1).

LLM is **off** by default. The only LLM hook is an optional `opts.extractor({ titles, summaries }) => string` injected by the caller, used solely to rewrite the canonical title. Failures fall back to the deterministic title. There is no module-level OpenAI import.

---

## 3. Claim-extraction service

Pure function `extractClusterClaims(cluster, articlesById, opts)`.

Per cluster it produces:

- **headlineClaim** — anchor article title (capped at 280 chars).
- **keyFacts** — up to 5 sentences scored by presence of numbers, dates, and ≥ 2 capitalised tokens.
- **dates** — ISO `YYYY-MM-DD`, `Mon D, YYYY`, `D Mon YYYY`, and bare-year regex.
- **locations** — capitalised phrases that hit a small seed lexicon (extensible by caller).
- **entities** — capitalised sequences, broken by punctuation so comma-lists surface individually; classified into `person | org | location | other`; ranked by mention count.
- **claims[]** — headline + key-fact claims, each carrying `evidence[]`, `contradictedBy[]`, `subject`, `metric`, `timeReference`, and a confidence placeholder.
- **sourceReferences[]** — one entry per cluster member with `articleId`, `sourceName`, `url`.
- **disputedMarkers[]** — when two or more articles assert different numeric values against the same coarse metric, the metric, distinct values, and contributing article IDs are recorded. Affected claims get `contradictedBy` populated and confidence reduced by 0.2.
- **confidencePlaceholder** — `0.4·clusterConfidence + 0.3·sourceDiversity + 0.2·(facts/5) − 0.1·hasContradictions`, clamped 0..1.

LLM is **off** by default. An optional enricher (`opts.extractor`, gated by `opts.useExtractor === true`) may rewrite the draft. Failure falls back to the deterministic draft. No module-level OpenAI import.

---

## 4. Admin preview routes (DRY-RUN ONLY)

Both routes are registered on the existing Express app inside `registerRoutes`:

| Method | Path | Auth | Mutates DB? |
|---|---|---|---|
| POST | `/api/admin/newsroom/cluster-preview` | `requireRootAdmin` | **No** |
| POST | `/api/admin/newsroom/claims-preview`   | `requireRootAdmin` | **No** |

Both:

- Require `dryRun: true` in the body (Zod literal).
- Accept up to 200 inline articles per request — no DB read or write.
- Return `{ ok, dryRun: true, promoted: false, ... }` so the contract makes the absence of side effects explicit.
- Inherit global CSRF enforcement from `server/index.ts:141` (`app.use("/api", csrfMiddleware)`), so any non-GET requires `x-csrf-token`.

No public-route exposure. No autonomous promotion to verified knowledge. No write paths added anywhere.

---

## 5. Tests

- `tests/newsroom-clustering.test.ts` — normalization/tokenize/signature/jaccard helpers + clustering behaviour: groups near-duplicates across sources, keeps unrelated articles separate, respects time window and threshold, anchor = earliest, no LLM by default, opt-in extractor invocation count, extractor-failure fallback, run-to-run determinism.
- `tests/newsroom-claim-extraction.test.ts` — headline-from-anchor, ISO + Month-Day date extraction, seed-lexicon locations, entity dedup + mention ranking, source references, multi-source contradiction detection, confidence placeholder bounds, `maxClaims` cap, default extractor OFF, opt-in extractor ON, extractor-failure fallback, run-to-run determinism.

Result: `npm run check` → **tsc clean**, **140/140** tests pass (was 115; +25 new).

---

## 6. Hard-constraint matrix

| Constraint | How honoured |
|---|---|
| No autonomous publishing | No promotion path. Preview routes return `promoted: false`. |
| No public route exposure | Both routes gated by `requireRootAdmin`. |
| No real provider calls | No OpenAI/SDK imports in either service. LLM hook is an injected callback the caller controls, defaults OFF. |
| No `db:push` | Not executed. `drizzle.config.ts` unchanged. |
| No YouTube/social/live | None introduced. |
| No schema change | `shared/schema.ts` unchanged. `shared/newsroom-schema.ts` unchanged and still un-imported. |

---

## 7. Rollback

Revert these files and the `package.json` + `server/routes.ts` edits:

```
git rm server/services/newsroom/clusteringService.ts \
      server/services/newsroom/claimExtractionService.ts \
      server/routes/newsroom-preview-routes.ts \
      tests/newsroom-clustering.test.ts \
      tests/newsroom-claim-extraction.test.ts \
      docs/reports/CODEX_PHASE_1B_CLUSTERING_CLAIMS_REPORT.md
git checkout HEAD~1 -- server/routes.ts package.json
```

Zero database impact (no migrations, no rows written).

---

## 8. Out of scope (deferred to future Phase 1B PRs)

- Persistence of clusters/claims to `verified_*` tables (schema still un-applied per prior task).
- Verification queue UI + the manual approval action that flips a draft to `verified`.
- LLM-based canonical-title rewrite and claim enrichment (hook exists; provider gate not yet plumbed).
- Entity normalisation against Wikidata/Wikipedia IDs.
- Cross-cluster deduplication across longer time horizons.
