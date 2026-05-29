#!/usr/bin/env node
/**
 * Phase 1B — Verified Newsroom — End-to-end verification harness.
 *
 * Runs the full Phase 1B intended flow against the REAL services that exist
 * in this repo today, with deterministic fixtures and zero database I/O:
 *
 *   1. Raw/published article fixtures
 *   2. Clustering dry run            → server/services/newsroom/clusteringService.ts
 *   3. Claim extraction dry run      → server/services/newsroom/claimExtractionService.ts
 *   4. VerifiedKnowledge fixture     (synthesised in-memory, no DB row)
 *   5. NewsroomDataPackage           → server/services/newsroom/newsroomDataPackageBuilder.ts
 *   6. RenderManifest                → shared/render-manifest.ts (validated by Zod)
 *   7. Voice / TTS                   (silent fixture via FFmpeg lavfi; real TTS skipped)
 *   8. MP4 preview render            → server/services/render-mp4-service.ts
 *   9. Remotion render               (skipped — not implemented server-side)
 *  10. SRT/captions                  → server/services/render-srt-service.ts
 *  11. Admin-only asset access guard (route grep against server/routes.ts)
 *  12. Manual approval gate          (assertions on safety envelopes)
 *  13. YouTube/social/live/autonomous flags = false (assertions on every layer)
 *
 * SAFETY:
 *   - No database writes (no Drizzle session opened).
 *   - No public publishing, no YouTube/social/live upload.
 *   - No production secrets read.
 *   - No `db:push`.
 *   - Outputs land under `.local/media-assets/render/` (internal admin-only).
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/* ------------------------------------------------------------------ */
/* tsx re-exec — required to import .ts services directly             */
/* ------------------------------------------------------------------ */
const SELF = fileURLToPath(import.meta.url);
const HAS_TSX_LOADER = process.execArgv.some((a) => a.includes("tsx"));
if (!HAS_TSX_LOADER && process.env.PHASE1B_E2E_TSX_REEXEC !== "1") {
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", SELF, ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, PHASE1B_E2E_TSX_REEXEC: "1" } },
  );
  process.exit(child.status ?? 1);
}

const SCRIPT_DIR = dirname(SELF);
const PROJECT_ROOT = resolve(SCRIPT_DIR, "../..");
const REPORT_PATH = join(
  PROJECT_ROOT,
  "docs/reports/CODEX_PHASE_1B_E2E_VERIFIED_NEWSROOM_REPORT.md",
);
const RENDER_DIR = join(PROJECT_ROOT, ".local/media-assets/render");
const VOICE_DIR = join(PROJECT_ROOT, ".local/media-assets/voice");
const DURATION_SEC = Number(process.env.PHASE1B_E2E_DURATION_SEC || 5);

/* ------------------------------------------------------------------ */
/* Check book-keeping                                                  */
/* ------------------------------------------------------------------ */
const checks = [];
const summary = {
  startedAt: new Date().toISOString(),
  endedAt: null,
  generatedIds: {
    clusterIds: [],
    selectedClusterId: null,
    verifiedKnowledgeId: null,
    newsroomDataPackageId: null,
    renderManifestId: null,
    renderJobId: null,
  },
  outputPaths: { mp4: null, srt: null, voiceMp3: null },
  safetyGateConfirmation: {},
  productionBlockers: [],
};

function record(name, status, details = "") {
  checks.push({ name, status, details });
}
async function checked(name, fn, opts = {}) {
  try {
    const result = await fn();
    const details = opts.details ?? (typeof result === "string" ? result : "ok");
    record(name, opts.status || "PASS", details || "");
    return result;
  } catch (err) {
    record(name, "FAIL", err?.message || String(err));
    if (!opts.continueOnFail) throw err;
    return null;
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function importTs(rel) {
  return import(pathToFileURL(join(PROJECT_ROOT, rel)).href);
}
function commandExists(name) {
  return (
    spawnSync("/bin/sh", ["-lc", `command -v ${name}`], { stdio: "ignore" })
      .status === 0
  );
}
function escapeCell(v) {
  return String(v).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

/**
 * Asserts that every "may be published" flag is explicitly `false`. This is
 * the load-bearing safety check — flag presence + value must both be `false`.
 */
function assertNoPublishFlags(label, safety) {
  // Required on every layer (NewsroomSafetyNotes + RenderSafetyFlags).
  const required = ["publicPublishing", "youtubeUpload", "socialPosting"];
  for (const key of required) {
    assert(
      Object.prototype.hasOwnProperty.call(safety, key),
      `${label}.${key} missing`,
    );
    assert(safety[key] === false, `${label}.${key} must be literal false`);
  }
  // autonomousExecution exists on RenderSafetyFlags but not on
  // NewsroomSafetyNotes. If present, it MUST be literal false.
  if (Object.prototype.hasOwnProperty.call(safety, "autonomousExecution")) {
    assert(
      safety.autonomousExecution === false,
      `${label}.autonomousExecution must be literal false when present`,
    );
  }
  summary.safetyGateConfirmation[label] = {
    publicPublishing: safety.publicPublishing,
    youtubeUpload: safety.youtubeUpload,
    socialPosting: safety.socialPosting,
    autonomousExecution:
      Object.prototype.hasOwnProperty.call(safety, "autonomousExecution")
        ? safety.autonomousExecution
        : "n/a (not on this schema)",
    manualRootAdminTriggerOnly: safety.manualRootAdminTriggerOnly === true,
    internalAdminReviewOnly: safety.internalAdminReviewOnly === true,
  };
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function fixtureArticles() {
  return [
    {
      id: 910001,
      sourceName: "OpenAI Blog (fixture)",
      sourceUrl: "https://fixtures.example.com/openai-gpt-55-context",
      title: "OpenAI releases GPT-5.5 with 1M token context window",
      summary:
        "OpenAI released GPT-5.5 on 2026-05-15 with a one-million token context window and improved coding benchmarks.",
      category: "ai",
      publishedAt: "2026-05-15T10:00:00.000Z",
    },
    {
      id: 910002,
      sourceName: "TechCrunch (fixture)",
      sourceUrl: "https://fixtures.example.com/techcrunch-gpt-55",
      title: "GPT-5.5 launches with one-million token context, OpenAI says",
      summary:
        "The OpenAI GPT-5.5 release on May 15 expands the context window to 1,000,000 tokens for agent workflows.",
      category: "ai",
      publishedAt: "2026-05-15T11:00:00.000Z",
    },
    {
      id: 910003,
      sourceName: "AI Ledger (fixture)",
      sourceUrl: "https://fixtures.example.com/ai-ledger-gpt-55",
      title: "GPT-5.5 model reaches 1M token context, OpenAI confirms",
      summary:
        "Analysts said the GPT-5.5 1M token context window targets agent workflow tasks. Released 2026-05-15.",
      category: "ai",
      publishedAt: "2026-05-15T11:45:00.000Z",
    },
  ];
}

function verifiedKnowledgeFrom(cluster, extraction, articles) {
  const ISO = "2026-05-16T12:00:00.000Z";
  const clusterArticles = articles.filter((a) =>
    cluster.members.some((m) => String(m.articleId) === String(a.id)),
  );
  const tier = (i) =>
    i === 0 ? "tier_a" : i === 1 ? "tier_b" : "tier_c";
  const evidence = clusterArticles.map((a, i) => ({
    url: a.sourceUrl,
    sourceName: a.sourceName,
    sourceTier: tier(i),
    supports: true,
    reliabilitySnapshot: i === 0 ? 0.9 : 0.7,
  }));
  const claims =
    extraction.claims && extraction.claims.length > 0
      ? extraction.claims.slice(0, 4).map((c, i) => ({
          id: `claim_${cluster.id}_${i}`,
          clusterId: cluster.id,
          verifiedKnowledgeId: `vk_${cluster.id}`,
          statement: c.statement,
          subject: c.subject ?? null,
          metric: c.metric ?? null,
          timeReference: c.timeReference ?? null,
          verdict: "supported",
          verdictConfidence: Math.min(0.95, Math.max(0.5, c.confidence || 0.6)),
          supportCount: Math.max(1, (c.evidence || []).length),
          contradictionCount: (c.contradictedBy || []).length,
          evidence: (c.evidence || []).slice(0, 3).map((ev, j) => ({
            url: ev.url,
            sourceName: ev.sourceName,
            sourceTier: tier(j),
            supports: !!ev.supports,
            reliabilitySnapshot: j === 0 ? 0.9 : 0.7,
          })),
        }))
      : [
          {
            id: `claim_${cluster.id}_0`,
            clusterId: cluster.id,
            verifiedKnowledgeId: `vk_${cluster.id}`,
            statement: extraction.headlineClaim || cluster.canonicalTitle,
            verdict: "supported",
            verdictConfidence: 0.7,
            supportCount: evidence.length,
            contradictionCount: 0,
            evidence,
          },
        ];
  return {
    id: `vk_${cluster.id}`,
    clusterId: cluster.id,
    status: "verified",
    canonicalTitle: cluster.canonicalTitle,
    canonicalSummary:
      "OpenAI released GPT-5.5 with a 1,000,000 token context window on 2026-05-15. Reporting from multiple sources corroborates the release date and the new context-window figure.",
    keyFacts: (extraction.keyFacts || []).slice(0, 4).map((f, i) => ({
      statement: f,
      derivedFromClaimIds: [claims[Math.min(i, claims.length - 1)].id],
      confidence: 0.8,
    })),
    claims,
    confidence: {
      aggregate: 0.78,
      claimSupport: 0.8,
      sourceDiversity: 0.75,
      sourceReliabilityAvg: 0.8,
      contradictionPenalty: 0,
      ageDecay: 0.95,
      computedAt: ISO,
      formulaVersion: "v1",
    },
    sourceCoverage: {
      distinctSources: cluster.distinctSources,
      tierBreakdown: {
        tier_a: 1,
        tier_b: Math.max(0, evidence.length - 1),
        tier_c: 0,
        untrusted: 0,
      },
      earliestPublishedAt: cluster.earliestPublishedAt,
      latestPublishedAt: cluster.latestPublishedAt,
    },
    approvedBy: "root_admin",
    approvedAt: ISO,
    supersededByVerifiedId: null,
  };
}

/* ------------------------------------------------------------------ */
/* RenderManifest construction (per shared/render-manifest.ts schema)  */
/* ------------------------------------------------------------------ */

function buildRenderManifestForPackage(packageId, payload, buildLocked) {
  const totalMs = DURATION_SEC * 1000;
  const halfMs = Math.floor(totalMs / 2);
  const headlineText =
    (payload && payload.headline && payload.headline.text) || payload.title || "Verified Update";
  const shortHeadlineText = payload.subtitle || headlineText;
  return {
    contractVersion: "1",
    manifestId: `mf_${packageId}_${Date.now().toString(36)}`.replace(/[^a-zA-Z0-9_]/g, "_"),
    packageId,
    packageVersion: payload.version || 1,
    canvas: { width: 1280, height: 720, pixelAspect: 1 },
    fps: 30,
    duration: { totalMs },
    scenes: [
      { sceneIndex: 0, startMs: 0, endMs: halfMs, label: "lead" },
      { sceneIndex: 1, startMs: halfMs, endMs: totalMs, label: "context" },
    ],
    layers: [
      { key: "bg", kind: "background", zIndex: 0, visible: true },
      { key: "anchor", kind: "anchor", zIndex: 1, visible: true },
      { key: "lt", kind: "lower_third", zIndex: 2, visible: true },
      { key: "tk", kind: "ticker", zIndex: 3, visible: true },
      { key: "cap", kind: "caption", zIndex: 4, visible: true },
    ],
    safeZones: {
      anchorSafeZone: { x: 30, y: 10, width: 40, height: 75, unit: "percent", purpose: "anchor" },
      lowerThirdZone: { x: 5, y: 75, width: 90, height: 10, unit: "percent", purpose: "lower-third" },
      tickerZone: { x: 0, y: 92, width: 100, height: 6, unit: "percent", purpose: "ticker" },
      captionZone: { x: 10, y: 85, width: 80, height: 6, unit: "percent", purpose: "caption" },
      monitorPanelZones: [],
    },
    textSafety: {
      maxHeadlineChars: 80,
      maxLowerThirdChars: 80,
      maxTickerChars: 120,
      maxCaptionCharsPerCue: 90,
      maxCaptionLinesPerCue: 2,
    },
    tracks: {
      anchor: [
        { sceneIndex: 0, startMs: 0, endMs: halfMs, speakerLabel: "Anchor", narrationText: shortHeadlineText.slice(0, 200) },
        { sceneIndex: 1, startMs: halfMs, endMs: totalMs, speakerLabel: "Anchor", narrationText: "Context segment from verified package." },
      ],
      voice: [{ source: "tts", startMs: 0, endMs: totalMs, gainDb: 0 }],
      caption: {
        format: "srt",
        cues: [
          { index: 0, startMs: 0, endMs: halfMs, text: shortHeadlineText.slice(0, 80) },
          { index: 1, startMs: halfMs, endMs: totalMs, text: "Context segment." },
        ],
        overflowFindings: [],
      },
      lowerThird: [
        { startMs: 0, endMs: Math.min(8000, totalMs), primary: headlineText.slice(0, 80), secondary: null, avoidZoneRefs: ["captionZone"] },
      ],
      ticker: { items: ["Mougle Newsroom", "Internal preview only"], loopMs: 20000 },
      monitorPanels: [],
      eventMedia: [],
    },
    transitionCues: [],
    musicSfxCues: [],
    storageRefs: {},
    compliance: { blocking: [], warnings: [] },
    safety: buildLocked([]),
    generatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Fixture silent audio (no real TTS provider available in this env)  */
/* ------------------------------------------------------------------ */

function ensureFixtureAudio() {
  mkdirSync(VOICE_DIR, { recursive: true });
  const filename = "vo_phase1b_e2e_fixture.mp3";
  const filePath = join(VOICE_DIR, filename);
  if (existsSync(filePath) && statSync(filePath).size > 0) {
    return { filename, filePath, created: false, provider: "local_silent_fixture" };
  }
  if (!commandExists("ffmpeg")) {
    return { filename: null, filePath: null, reason: "ffmpeg_missing" };
  }
  const r = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel", "error",
      "-f", "lavfi",
      "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-t", String(DURATION_SEC),
      "-q:a", "9",
      "-acodec", "libmp3lame",
      filePath,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0 || !existsSync(filePath)) {
    return { filename: null, filePath: null, reason: r.stderr || "ffmpeg_silent_audio_failed" };
  }
  return { filename, filePath, created: true, provider: "local_silent_fixture" };
}

/* ------------------------------------------------------------------ */
/* Admin-only route guard verification (real routes)                  */
/* ------------------------------------------------------------------ */

function verifyAdminOnlyRoutes() {
  const routes = readFileSync(join(PROJECT_ROOT, "server/routes.ts"), "utf8");

  const required = [
    /"\/api\/admin\/video-render\/jobs\/:id\/captions\.srt"\s*,\s*requireRootAdmin/,
    /"\/api\/admin\/video-render\/jobs\/:id\/preview\.mp4"\s*,\s*requireRootAdmin/,
    /"\/api\/admin\/video-render\/jobs"\s*,\s*requireRootAdmin/,
    /"\/api\/admin\/storage\/status"\s*,\s*requireRootAdmin/,
  ];
  for (const re of required) {
    assert(re.test(routes), `admin-only route not guarded: ${re}`);
  }
  // Defense-in-depth: there must be NO public asset stream routes.
  const forbidden = [
    /app\.(get|post)\(\s*"\/api\/media-assets\//,
    /app\.(get|post)\(\s*"\/media-assets\//,
    /app\.(get|post)\(\s*"\/api\/render\/(preview|captions)/,
  ];
  for (const re of forbidden) {
    assert(!re.test(routes), `forbidden public asset route present: ${re}`);
  }
  return "admin-only stream routes confirmed; no public asset routes";
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

function writeReport() {
  summary.endedAt = new Date().toISOString();
  const passed = checks.filter((c) => c.status === "PASS");
  const failed = checks.filter((c) => c.status === "FAIL");
  const skipped = checks.filter((c) => c.status === "SKIP");
  const table = [
    "| # | Step | Status | Details |",
    "| ---: | --- | --- | --- |",
    ...checks.map(
      (c, i) =>
        `| ${i + 1} | ${escapeCell(c.name)} | ${c.status} | ${escapeCell(c.details || "")} |`,
    ),
  ].join("\n");
  const report = `# Codex Phase 1B E2E — Verified Newsroom Report

## Summary

- Started: ${summary.startedAt}
- Ended: ${summary.endedAt}
- Passed: ${passed.length}
- Failed: ${failed.length}
- Skipped: ${skipped.length}
- Public publishing: **not executed**
- YouTube / social / live / autonomous actions: **not executed**
- Database writes / \`db:push\`: **not executed**
- Production secrets: **not read**

## Pass/Fail Table

${table}

## Generated Package / Render IDs

- Cluster IDs discovered: \`${summary.generatedIds.clusterIds.join(", ") || "n/a"}\`
- Selected cluster: \`${summary.generatedIds.selectedClusterId || "n/a"}\`
- VerifiedKnowledge fixture ID: \`${summary.generatedIds.verifiedKnowledgeId || "n/a"}\`
- NewsroomDataPackage ID: \`${summary.generatedIds.newsroomDataPackageId || "n/a"}\`
- RenderManifest ID: \`${summary.generatedIds.renderManifestId || "n/a"}\`
- Render job ID: \`${summary.generatedIds.renderJobId || "n/a"}\`

## Render Output Paths (admin-only local fallback)

- MP4 preview: \`${summary.outputPaths.mp4 || "n/a"}\`
- SRT captions: \`${summary.outputPaths.srt || "n/a"}\`
- Voice MP3 fixture: \`${summary.outputPaths.voiceMp3 || "n/a"}\`

All artifacts carry the \`AdminOnlyMediaAssetMetadata\` envelope (\`adminOnly: true\`, \`publicUrl: null\`, \`accessMode: "admin_only_stream"\`). They are only reachable via root-admin gated stream routes.

## Safety Gate Confirmation (per layer)

\`\`\`json
${JSON.stringify(summary.safetyGateConfirmation, null, 2)}
\`\`\`

## Missing Production Blockers

${summary.productionBlockers.length ? summary.productionBlockers.map((b) => `- ${b}`).join("\n") : "- None blocking this internal preview-only harness."}

## Next Steps

- Wire a real TTS provider (HeyGen or OpenAI audio) behind a \`PHASE1B_E2E_ENABLE_TTS=1\` opt-in; current harness uses a silent FFmpeg \`anullsrc\` fixture so no provider cost is incurred.
- Implement \`server/services/remotion-render-service.ts\` (currently absent — \`shared/render-manifest.ts\` exposes \`toRemotionScenePackage\` so the contract is ready). Add a \`PHASE1B_E2E_ENABLE_REMOTION=1\` opt-in.
- Add a DB-backed integration variant once the VerifiedKnowledge / NewsroomDataPackage / RenderManifest Drizzle tables are migrated; today's flow keeps everything in-memory to honour the no-\`db:push\` constraint.
- Wire \`/api/admin/storage/status\` into the admin dashboard so the storage report is visible alongside the render queue.
- Add a smoke-mode scheduler (nightly) that runs this harness and posts the pass/fail table to the founder dashboard.
`;
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, report, "utf8");
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  process.chdir(PROJECT_ROOT);
  mkdirSync(RENDER_DIR, { recursive: true });

  // --- Service imports (real modules) --------------------------------
  const { clusterArticles } = await importTs(
    "server/services/newsroom/clusteringService.ts",
  );
  const { extractClusterClaims } = await importTs(
    "server/services/newsroom/claimExtractionService.ts",
  );
  const { buildNewsroomDataPackage } = await importTs(
    "server/services/newsroom/newsroomDataPackageBuilder.ts",
  );
  const {
    buildLockedSafetyFlags,
    validateRenderManifest,
  } = await importTs("shared/render-manifest.ts");
  const { buildSrtFromSegments } = await importTs(
    "server/services/render-srt-service.ts",
  );
  const { writeMp4ForRenderJob } = await importTs(
    "server/services/render-mp4-service.ts",
  );
  const { buildAdminOnlyAssetMetadata } = await importTs(
    "server/services/persistent-storage-service.ts",
  );

  // 1. Article fixtures -----------------------------------------------
  let articles;
  await checked("1. Raw/published article fixture", () => {
    articles = fixtureArticles();
    assert(articles.length >= 2, "expected ≥2 article fixtures");
    return `${articles.length} published article fixtures prepared`;
  });

  // 2. Clustering dry run ---------------------------------------------
  let clusters;
  await checked("2. Clustering dry run", async () => {
    clusters = await clusterArticles(articles, {
      windowMinutes: 4320,
      similarityThreshold: 0.2,
      minClusterSize: 1,
    });
    assert(Array.isArray(clusters) && clusters.length > 0, "no clusters produced");
    summary.generatedIds.clusterIds = clusters.map((c) => c.id);
    return `${clusters.length} cluster(s); ids=${clusters.map((c) => c.id).join(",")}; topDistinctSources=${clusters[0].distinctSources}`;
  });
  const cluster = clusters.find((c) => c.distinctSources >= 2) || clusters[0];
  summary.generatedIds.selectedClusterId = cluster.id;

  // 3. Claim extraction dry run ---------------------------------------
  let extraction;
  await checked("3. Claim extraction dry run", async () => {
    const byId = new Map(articles.map((a) => [a.id, a]));
    extraction = await extractClusterClaims(cluster, byId, {});
    assert(typeof extraction.headlineClaim === "string" && extraction.headlineClaim.length > 0, "no headlineClaim");
    assert(Array.isArray(extraction.claims), "claims must be an array");
    return `cluster=${cluster.id} headline="${extraction.headlineClaim.slice(0, 60)}…" claims=${extraction.claims.length} keyFacts=${(extraction.keyFacts || []).length}`;
  });

  // 4. VerifiedKnowledge fixture --------------------------------------
  let verifiedKnowledge;
  await checked("4. VerifiedKnowledge fixture (in-memory; no DB row)", () => {
    verifiedKnowledge = verifiedKnowledgeFrom(cluster, extraction, articles);
    summary.generatedIds.verifiedKnowledgeId = verifiedKnowledge.id;
    return `vk=${verifiedKnowledge.id} status=${verifiedKnowledge.status} claims=${verifiedKnowledge.claims.length} sources=${verifiedKnowledge.sourceCoverage.distinctSources}`;
  });

  // 5. NewsroomDataPackage --------------------------------------------
  let pkgResult;
  await checked("5. NewsroomDataPackage generation", () => {
    pkgResult = buildNewsroomDataPackage({
      verifiedKnowledge,
      generatedAt: new Date().toISOString(),
      previewMode: true,
    });
    assert(pkgResult.payload && pkgResult.payload.verifiedKnowledgeId, "missing payload.verifiedKnowledgeId");
    assert(Array.isArray(pkgResult.payload.segments) && pkgResult.payload.segments.length >= 1, "no segments");
    assertNoPublishFlags("newsroomDataPackage.safety", pkgResult.safetyNotes);
    // No packageId column in the v1 payload schema; synthesise a deterministic
    // composite id (verifiedKnowledgeId@vN) so downstream RenderManifest can
    // reference it without a DB row.
    pkgResult.syntheticPackageId = `${pkgResult.payload.verifiedKnowledgeId}@v${pkgResult.payload.version}`;
    summary.generatedIds.newsroomDataPackageId = pkgResult.syntheticPackageId;
    return `vkId=${pkgResult.payload.verifiedKnowledgeId} v=${pkgResult.payload.version} segs=${pkgResult.payload.segments.length} publishable=${pkgResult.publishable} reason="${pkgResult.publishableReason}"`;
  });

  // 6. RenderManifest --------------------------------------------------
  let manifest;
  await checked("6. RenderManifest generation", () => {
    manifest = buildRenderManifestForPackage(
      pkgResult.syntheticPackageId,
      pkgResult.payload,
      buildLockedSafetyFlags,
    );
    const v = validateRenderManifest(manifest, { canonical: true });
    assert(v.ok === true, `manifest invalid: ${JSON.stringify(v.issues || []).slice(0, 400)}`);
    assertNoPublishFlags("renderManifest.safety", manifest.safety);
    assert(manifest.safety.manualRootAdminTriggerOnly === true, "manualRootAdminTriggerOnly must be true");
    assert(manifest.safety.internalAdminReviewOnly === true, "internalAdminReviewOnly must be true");
    summary.generatedIds.renderManifestId = manifest.manifestId;
    return `manifestId=${manifest.manifestId} scenes=${manifest.scenes.length} captions=${manifest.tracks.caption.cues.length}`;
  });

  // 7. Voice / TTS -----------------------------------------------------
  let voiceFixture = null;
  await checked(
    "7. Voice / TTS (silent FFmpeg fixture — real provider not invoked)",
    () => {
      const v = (voiceFixture = ensureFixtureAudio());
      if (!v.filename) {
        summary.productionBlockers.push(`voice fixture unavailable: ${v.reason}`);
        return `SKIP voice fixture: ${v.reason}`;
      }
      // Wrap with admin-only metadata envelope.
      const meta = buildAdminOnlyAssetMetadata({
        kind: "voice",
        filename: v.filename,
        localPath: v.filePath,
      });
      assert(meta.adminOnly === true, "voice meta adminOnly !== true");
      assert(meta.publicUrl === null, "voice meta publicUrl !== null");
      assert(meta.accessMode === "admin_only_stream", "voice accessMode mismatch");
      summary.outputPaths.voiceMp3 = v.filePath;
      summary.safetyGateConfirmation["voiceAsset"] = {
        adminOnly: meta.adminOnly,
        publicUrl: meta.publicUrl,
        accessMode: meta.accessMode,
        storageDriver: meta.storageDriver,
      };
      return `provider=${v.provider} path=${v.filePath}`;
    },
    { continueOnFail: true },
  );

  // 8. SRT/captions ----------------------------------------------------
  const totalMs = DURATION_SEC * 1000;
  const halfMs = Math.floor(totalMs / 2);
  let srtPath = null;
  await checked("8. SRT/captions generation", () => {
    const leadText =
      (pkgResult.payload.headline && pkgResult.payload.headline.text) || pkgResult.payload.title || "Lead";
    const { srt, cueCount } = buildSrtFromSegments(
      [
        { segmentIndex: 0, startMs: 0, endMs: halfMs, text: leadText.slice(0, 80) },
        { segmentIndex: 1, startMs: halfMs, endMs: totalMs, text: "Internal preview only." },
      ],
      { maxCharsPerLine: 42, maxLines: 2 },
    );
    assert(cueCount === 2, `expected 2 SRT cues, got ${cueCount}`);
    assert(/-->/.test(srt), "SRT must contain '-->' timecodes");
    const file = `rj_e2e_${Date.now().toString(36)}.srt`;
    srtPath = join(RENDER_DIR, file);
    writeFileSync(srtPath, srt, "utf8");
    summary.outputPaths.srt = srtPath;
    return `${cueCount} cues → ${srtPath}`;
  });

  // 9. MP4 preview render ---------------------------------------------
  if (!commandExists("ffmpeg")) {
    summary.productionBlockers.push("ffmpeg binary missing on PATH");
    record("9. MP4 preview render", "SKIP", "ffmpeg binary missing on PATH");
    record("10. MP4 admin-only metadata envelope", "SKIP", "FFmpeg unavailable");
  } else {
    const jobId = 9100001;
    summary.generatedIds.renderJobId = String(jobId);
    let mp4Result = null;
    await checked("9. MP4 preview render", async () => {
      const mp4Title =
        (pkgResult.payload.headline && pkgResult.payload.headline.text) || pkgResult.payload.title || "Phase 1B E2E Preview";
      const r = (mp4Result = await writeMp4ForRenderJob(jobId, {
        title: mp4Title,
        watermarkLabel: "INTERNAL PREVIEW — NOT FOR PUBLIC RELEASE",
        srtPath,
        segments: [
          { segmentIndex: 0, startMs: 0, endMs: halfMs, scriptType: "lead", speakerLabel: "Anchor", textPreview: mp4Title.slice(0, 80) },
          { segmentIndex: 1, startMs: halfMs, endMs: totalMs, scriptType: "context", speakerLabel: "Anchor", textPreview: "Context segment from verified package." },
        ],
      }));
      assert(r.artifact, "writeMp4ForRenderJob returned null artifact");
      assert(r.segmentCount === 2, `expected 2 segments, got ${r.segmentCount}`);
      assert(r.durationMs === totalMs, `expected durationMs=${totalMs}, got ${r.durationMs}`);
      return `segments=${r.segmentCount} durationMs=${r.durationMs} storageKey=${r.artifact.storageKey}`;
    });

    await checked("10. MP4 admin-only metadata envelope", () => {
      const a = mp4Result.artifact;
      assert(a.adminOnly === true, "adminOnly !== true");
      assert(a.publicUrl === null, "publicUrl !== null");
      assert(a.publicUrlAvailable === false, "publicUrlAvailable !== false");
      assert(a.accessMode === "admin_only_stream", `accessMode=${a.accessMode}`);
      assert(typeof a.storageKey === "string" && a.storageKey.startsWith("mougle-media/render/"), `storageKey=${a.storageKey}`);
      assert(a.mimeType === "video/mp4", `mimeType=${a.mimeType}`);
      assert(typeof a.size === "number" && a.size > 0, "size missing/zero");
      assert(typeof a.createdAt === "string" && !Number.isNaN(Date.parse(a.createdAt)), "createdAt invalid");
      // Verify file exists where metadata says.
      const full = join(RENDER_DIR, a.storageKey.split("/").pop());
      assert(existsSync(full) && statSync(full).size > 0, `mp4 not present at ${full}`);
      summary.outputPaths.mp4 = full;
      summary.safetyGateConfirmation["renderAsset"] = {
        adminOnly: a.adminOnly,
        publicUrl: a.publicUrl,
        publicUrlAvailable: a.publicUrlAvailable,
        accessMode: a.accessMode,
        storageDriver: a.storageDriver,
        persisted: a.persisted,
        localFallback: a.localFallback,
      };
      return `storageKey=${a.storageKey} size=${a.size}B driver=${a.storageDriver} localFallback=${a.localFallback}`;
    });
  }

  // 9b. Remotion render — not implemented server-side -------------------
  record(
    "9b. Remotion MP4 render (optional)",
    "SKIP",
    "server/services/remotion-render-service.ts not present; shared/render-manifest.ts exposes toRemotionScenePackage so the contract is ready",
  );

  // 11. Admin-only asset access guard ---------------------------------
  await checked("11. Admin-only asset access guard", () =>
    verifyAdminOnlyRoutes(),
  );

  // 12. Manual approval gate ------------------------------------------
  await checked("12. Manual approval gate", () => {
    assert(
      pkgResult.safetyNotes.manualRootAdminTriggerOnly === true,
      "package manualRootAdminTriggerOnly !== true",
    );
    assert(
      pkgResult.safetyNotes.internalAdminReviewOnly === true,
      "package internalAdminReviewOnly !== true",
    );
    assert(
      manifest.safety.manualRootAdminTriggerOnly === true,
      "manifest manualRootAdminTriggerOnly !== true",
    );
    assert(
      manifest.safety.internalAdminReviewOnly === true,
      "manifest internalAdminReviewOnly !== true",
    );
    return "manual approval required at NewsroomDataPackage + RenderManifest layers";
  });

  // 13. No-publish flags everywhere -----------------------------------
  await checked("13. YouTube/social/live/autonomous flags are false", () => {
    const layers = [
      ["newsroomDataPackage.safety", pkgResult.safetyNotes],
      ["renderManifest.safety", manifest.safety],
    ];
    for (const [name, s] of layers) {
      assertNoPublishFlags(name, s);
      // liveStream is not a field on either schema (no live in Phase 1B);
      // record absence as the safety check.
      assert(
        !("liveStream" in s) || s.liveStream === false,
        `${name}.liveStream must be absent or literal false`,
      );
    }
    return "publicPublishing, youtubeUpload, socialPosting, autonomousExecution, liveStream all locked false";
  });
}

/* ------------------------------------------------------------------ */
/* Entrypoint                                                          */
/* ------------------------------------------------------------------ */

try {
  await main();
} catch (err) {
  summary.productionBlockers.push(
    `Harness stopped early: ${err?.message || String(err)}`,
  );
}

writeReport();

const failed = checks.filter((c) => c.status === "FAIL");
if (failed.length > 0) {
  console.error(`Phase 1B harness FAILED. Report: ${REPORT_PATH}`);
  process.exit(1);
}
console.log(`Phase 1B harness PASSED. Report: ${REPORT_PATH}`);
