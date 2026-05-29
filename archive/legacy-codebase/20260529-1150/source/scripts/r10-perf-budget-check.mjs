#!/usr/bin/env node
/**
 * R10 — Performance budget probe for the 3D / R3F / 4D admin surfaces.
 *
 * Static (no browser) measurements:
 *
 *  1. Sum of the gzipped on-disk source bytes of every R3F-bearing client
 *     module (R3 sandbox + R5I library + R6 virtual sets + R7 avatar rig +
 *     R8 Unity shell + R9 package preview tab). This is an UPPER bound on
 *     the lazy-chunk size — actual Vite output is smaller after dead-code
 *     elimination and shared-chunk extraction.
 *
 *  2. Asserts that every R3F Canvas in the surface list pins:
 *       - dpr={[1, 1.5]}
 *       - frameloop="demand"
 *       - gl.powerPreference="low-power"
 *
 *  3. Asserts the committed R5B demo GLB stays under 25 KB (cap is 25 MB
 *     in the validator; we hold the demo itself to a much tighter budget
 *     because it ships in client/public).
 *
 * Usage:
 *   node scripts/r10-perf-budget-check.mjs            # human report
 *   node scripts/r10-perf-budget-check.mjs --json     # JSON payload to stdout
 *
 * Exit code is non-zero on any budget breach.
 */

import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";

const REPO = process.cwd();
const wantJson = process.argv.includes("--json");
const wantBuilt = process.argv.includes("--built");

const BUDGETS = {
  // Gzipped source bytes (sum across modules below).
  totalR3FSourceGzipMaxBytes: 90 * 1024, // 90 KB
  // Each module's individual gzipped source.
  perModuleGzipMaxBytes: 30 * 1024, // 30 KB
  // Committed demo GLB on disk.
  demoGlbMaxBytes: 25 * 1024, // 25 KB
  // Sum of gzipped built lazy chunks that contain any R3F-bearing module
  // basename. Opt-in via --built; requires a prior `npm run build` so that
  // dist/public/assets/*.js exists.
  totalBuiltR3FChunksGzipMaxBytes: 256 * 1024, // 256 KB
};

const R3F_BEARING_MODULES = [
  "client/src/pages/admin/R3FPreviewSandbox.tsx",
  "client/src/components/production-house/r3f/ProductionCanvasSandbox.tsx",
  "client/src/components/production-house/r3f/AvatarRigCanvas.tsx",
  "client/src/pages/admin/VirtualSetPreview.tsx",
  "client/src/pages/admin/AvatarRigPreview.tsx",
  "client/src/pages/admin/UnityWebGLSandbox.tsx",
  "client/src/components/production-house/Package3DPreviewSection.tsx",
  "client/src/pages/admin/3d-assets/AssetLibraryList.tsx",
  "client/src/pages/admin/3d-assets/AssetUpload.tsx",
  "client/src/pages/admin/3d-assets/AssetDetail.tsx",
  "client/src/pages/admin/3d-assets/AssetSafetyReview.tsx",
];

const R3F_CANVASES = [
  "client/src/components/production-house/r3f/ProductionCanvasSandbox.tsx",
  "client/src/components/production-house/r3f/AvatarRigCanvas.tsx",
];

const DEMO_GLB = "client/public/demo-assets/sandbox-cube.glb";

function read(rel) {
  return readFileSync(resolve(REPO, rel));
}

const failures = [];
const modules = [];
let totalGzip = 0;

for (const rel of R3F_BEARING_MODULES) {
  const buf = read(rel);
  const gzip = gzipSync(buf).byteLength;
  totalGzip += gzip;
  modules.push({ file: rel, rawBytes: buf.byteLength, gzipBytes: gzip });
  if (gzip > BUDGETS.perModuleGzipMaxBytes) {
    failures.push(
      `MODULE_OVER_BUDGET: ${rel} gzip=${gzip}B > ${BUDGETS.perModuleGzipMaxBytes}B`,
    );
  }
}

if (totalGzip > BUDGETS.totalR3FSourceGzipMaxBytes) {
  failures.push(
    `TOTAL_OVER_BUDGET: total gzip=${totalGzip}B > ${BUDGETS.totalR3FSourceGzipMaxBytes}B`,
  );
}

const canvasChecks = [];
for (const rel of R3F_CANVASES) {
  const src = read(rel).toString("utf8");
  const dpr = /dpr=\{\s*\[\s*1\s*,\s*1\.5\s*\]\s*\}/.test(src);
  const frameloop = /frameloop=["']demand["']/.test(src);
  const lowPower = /powerPreference:\s*["']low-power["']/.test(src);
  canvasChecks.push({ file: rel, dpr, frameloop, lowPower });
  if (!dpr) failures.push(`CANVAS_DPR_MISSING: ${rel}`);
  if (!frameloop) failures.push(`CANVAS_FRAMELOOP_MISSING: ${rel}`);
  if (!lowPower) failures.push(`CANVAS_POWERPREF_MISSING: ${rel}`);
}

// Optional: measure built lazy-chunk gzip sizes against the budget. Opt-in
// because `npm run build` is expensive; CI/post-merge can wire this in.
const builtChunks = [];
let builtTotalGzip = 0;
let builtError = null;
if (wantBuilt) {
  try {
    const { readdirSync } = await import("node:fs");
    const assetsDir = resolve(REPO, "dist/public/assets");
    const moduleBasenames = R3F_BEARING_MODULES.map((p) =>
      p.split("/").pop().replace(/\.tsx?$/, ""),
    );
    // Vite emits one lazy chunk per dynamic-import boundary, named
    // <ModuleBasename>-<hash>.js — match by filename prefix so we measure
    // the per-surface lazy chunk rather than the giant shared index bundle
    // that incidentally inlines a basename string.
    const files = readdirSync(assetsDir).filter((f) => f.endsWith(".js"));
    for (const f of files) {
      const hits = moduleBasenames.filter((b) => f.startsWith(`${b}-`) || f === `${b}.js`);
      if (hits.length === 0) continue;
      const buf = readFileSync(resolve(assetsDir, f));
      const gzip = gzipSync(buf).byteLength;
      builtChunks.push({ file: `dist/public/assets/${f}`, gzipBytes: gzip, matches: hits });
      builtTotalGzip += gzip;
    }
    if (builtTotalGzip > BUDGETS.totalBuiltR3FChunksGzipMaxBytes) {
      failures.push(
        `BUILT_TOTAL_OVER_BUDGET: built R3F-bearing chunks gzip=${builtTotalGzip}B > ${BUDGETS.totalBuiltR3FChunksGzipMaxBytes}B`,
      );
    }
  } catch (err) {
    builtError = `built-chunk probe skipped: ${err.message} (run \`npm run build\` first)`;
  }
}

const demoStat = statSync(resolve(REPO, DEMO_GLB));
if (demoStat.size > BUDGETS.demoGlbMaxBytes) {
  failures.push(
    `DEMO_GLB_OVER_BUDGET: ${DEMO_GLB} size=${demoStat.size}B > ${BUDGETS.demoGlbMaxBytes}B`,
  );
}

const result = {
  generatedAt: new Date().toISOString(),
  budgets: BUDGETS,
  totalGzipBytes: totalGzip,
  demoGlbBytes: demoStat.size,
  modules,
  canvases: canvasChecks,
  builtChunks,
  builtTotalGzipBytes: builtTotalGzip,
  builtError,
  failures,
  status: failures.length === 0 ? "pass" : "fail",
};

if (wantJson) {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} else {
  console.log(`R10 perf-budget probe — status: ${result.status.toUpperCase()}`);
  console.log(
    `  total R3F source gzip: ${totalGzip} B / cap ${BUDGETS.totalR3FSourceGzipMaxBytes} B`,
  );
  console.log(
    `  demo GLB size:         ${demoStat.size} B / cap ${BUDGETS.demoGlbMaxBytes} B`,
  );
  console.log("  modules:");
  for (const m of modules) {
    console.log(`    - ${m.file}  raw=${m.rawBytes}B  gzip=${m.gzipBytes}B`);
  }
  console.log("  canvases:");
  for (const c of canvasChecks) {
    console.log(
      `    - ${c.file}  dpr=${c.dpr}  frameloop=${c.frameloop}  lowPower=${c.lowPower}`,
    );
  }
  if (wantBuilt) {
    if (builtError) {
      console.log(`  built chunks: ${builtError}`);
    } else {
      console.log(
        `  built R3F-bearing chunks gzip: ${builtTotalGzip} B / cap ${BUDGETS.totalBuiltR3FChunksGzipMaxBytes} B`,
      );
      for (const c of builtChunks) {
        console.log(`    - ${c.file}  gzip=${c.gzipBytes}B  matches=${c.matches.join(",")}`);
      }
    }
  }
  if (failures.length) {
    console.log("  failures:");
    for (const f of failures) console.log(`    - ${f}`);
  }
}

process.exit(failures.length === 0 ? 0 : 1);
