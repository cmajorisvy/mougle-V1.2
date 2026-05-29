/**
 * R10 — Complete 3D / 4D / R3F Safety + Performance E2E Suite (Task #752)
 *
 * Verification-only. No new product surfaces, no schema, no behavior change.
 *
 * This Node test asserts the hard safety invariants for every R3F / 3D / 4D
 * surface delivered by R3 → R9:
 *
 *   - R3  : /admin/r3f-preview-sandbox + ProductionCanvasSandbox
 *   - R5B : sandbox-cube.glb demo loader (toggle inside the R3 sandbox)
 *   - R5C–R5K : 3D Asset Library (production_assets) + routes/admin/production-assets.ts
 *   - R5J : signed-preview-url + R3F sandbox approved_internal loader
 *   - R6  : /admin/virtual-set-preview + production-house/virtual-sets
 *   - R7  : /admin/avatar-rig-preview + AvatarRigCanvas
 *   - R8  : /admin/unity-webgl-sandbox (sandboxed iframe shell only)
 *   - R9  : Production House Package 3D Preview tab (Package3DPreviewSection)
 *
 * The invariants asserted here come from the R5C plan §9 and the R10 task brief:
 *
 *   1. publicUrl is ALWAYS null in R5C-and-later code:
 *      - DB CHECK constraint enforces NULL
 *      - the route serializer overrides any value to null
 *      - no setter touches publicUrl
 *      - no client R3F surface relies on a non-null publicUrl
 *
 *   2. Signed preview URLs are ephemeral (TTL ≤ 900s) and NEVER persisted:
 *      - the storage helper clamps TTL to 900
 *      - the audit-log payload records {adminUserId, ttlSeconds, expiresAt}
 *        only — never the URL string
 *      - no DB column carries a signed-URL value
 *      - the R3F sandbox holds the URL in component state only
 *
 *   3. No realSendAllowed=true and no executionEnabled=true is set anywhere
 *      across the 3D/R3F/4D client and server surface.
 *
 *   4. No public-bucket writes from R3F/3D code (static + runtime probe via
 *      the storage helper's STORAGE_KEY_RE + PUBLIC_OBJECT_SEARCH_PATHS guard).
 *
 *   5. No provider API calls (OpenAI / Meshy / Runway / ElevenLabs / HeyGen /
 *      Anthropic) from any R3F / 3D / 4D client surface or from the asset
 *      library route module.
 *
 *   6. Approval gate is one-way: not_approved → approved_internal only.
 *      The string "approved_public" must not appear anywhere in R5C code
 *      paths (column values, route bodies, validators, serializers).
 *
 *   7. Validator caps hold (≤25 MB / ≤200 nodes / ≤200 meshes /
 *      ≤2000 accessors / ≤2000 bufferViews) and a 0-byte upload is rejected
 *      with the stable reason `glb_bad_magic`.
 *
 *   8. R3F canvases use the documented performance defaults:
 *      `dpr={[1, 1.5]}`, `frameloop="demand"`, `gl.powerPreference="low-power"`.
 *
 *   9. Every admin 3D route is registered in client/src/App.tsx behind a
 *      lazy import and reachable via the AdminDashboard 3D/4D/Unreal zone.
 *
 * Test failures here MUST block merge.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  validateGlbOrGltf,
  type ValidatorFailureReason,
} from "../server/services/gltf-validator";
import {
  __test__ as storageInternals,
  __setBackendForTests,
  putAssetBytes,
  issueSignedPreviewUrl,
  type ProductionAssetStorageBackend,
} from "../server/services/production-asset-storage";

const REPO = process.cwd();

function read(rel: string): string {
  return readFileSync(resolve(REPO, rel), "utf8");
}

// -------------------------------------------------------------------------
// 0. Surface inventory (R3 → R9)
// -------------------------------------------------------------------------

const R3F_3D_CLIENT_SURFACES: string[] = [
  // R3 sandbox page + canvas
  "client/src/pages/admin/R3FPreviewSandbox.tsx",
  "client/src/components/production-house/r3f/ProductionCanvasSandbox.tsx",
  // R5I 3D Asset Library admin pages
  "client/src/pages/admin/3d-assets/AssetLibraryList.tsx",
  "client/src/pages/admin/3d-assets/AssetUpload.tsx",
  "client/src/pages/admin/3d-assets/AssetDetail.tsx",
  "client/src/pages/admin/3d-assets/AssetSafetyReview.tsx",
  "client/src/pages/admin/3d-assets/safety-badges.tsx",
  // R6 virtual sets
  "client/src/pages/admin/VirtualSetPreview.tsx",
  // R7 avatar rig
  "client/src/pages/admin/AvatarRigPreview.tsx",
  "client/src/components/production-house/r3f/AvatarRigCanvas.tsx",
  // R8 Unity WebGL sandbox shell
  "client/src/pages/admin/UnityWebGLSandbox.tsx",
  // R9 Production House 3D Preview tab
  "client/src/components/production-house/Package3DPreviewSection.tsx",
];

const R3F_3D_SERVER_SURFACES: string[] = [
  "server/routes/admin/production-assets.ts",
  "server/services/gltf-validator.ts",
  "server/services/production-asset-storage.ts",
];

const ADMIN_3D_ROUTE_PATHS: string[] = [
  "/admin/r3f-preview-sandbox",
  "/admin/3d-assets",
  "/admin/3d-assets/upload",
  "/admin/3d-assets/:id",
  "/admin/3d-assets/:id/safety-review",
  "/admin/virtual-set-preview",
  "/admin/avatar-rig-preview",
  "/admin/unity-webgl-sandbox",
];

// -------------------------------------------------------------------------
// 1. Surface inventory — every file exists
// -------------------------------------------------------------------------

describe("R10 §0 — surface inventory", () => {
  it("every R3 → R9 client surface file exists", () => {
    for (const rel of R3F_3D_CLIENT_SURFACES) {
      const st = statSync(resolve(REPO, rel));
      assert.ok(st.isFile(), `${rel} is not a file`);
      assert.ok(st.size > 0, `${rel} is empty`);
    }
  });

  it("every R3 → R9 server surface file exists", () => {
    for (const rel of R3F_3D_SERVER_SURFACES) {
      const st = statSync(resolve(REPO, rel));
      assert.ok(st.isFile(), `${rel} is not a file`);
      assert.ok(st.size > 0, `${rel} is empty`);
    }
  });

  it("every admin 3D route is registered in client/src/App.tsx", () => {
    const app = read("client/src/App.tsx");
    for (const path of ADMIN_3D_ROUTE_PATHS) {
      assert.ok(
        app.includes(`path="${path}"`),
        `App.tsx is missing route registration for ${path}`,
      );
    }
  });
});

// -------------------------------------------------------------------------
// 2. publicUrl invariant — DB CHECK + serializer + no setter
// -------------------------------------------------------------------------

describe("R10 §1 — publicUrl always null", () => {
  it("shared/schema.ts declares the CHECK constraint and default NULL", () => {
    const schema = read("shared/schema.ts");
    assert.match(
      schema,
      /publicUrl:\s*text\("public_url"\)\.default\(sql`NULL`\)/,
      "publicUrl column missing or default not NULL",
    );
    assert.match(
      schema,
      /\$\{table\.publicUrl\}\s*IS\s*NULL/,
      "publicUrl CHECK constraint missing",
    );
  });

  it("routes/admin/production-assets.ts forces publicUrl: null in serializer", () => {
    const routes = read("server/routes/admin/production-assets.ts");
    assert.match(
      routes,
      /publicUrl:\s*null/,
      "route serializer does not force publicUrl: null",
    );
    // The serializer signature should pin publicUrl to null at the type level.
    assert.match(
      routes,
      /serializeAsset\([^)]*\):\s*ProductionAsset\s*&\s*\{\s*publicUrl:\s*null\s*\}/,
      "serializeAsset return type does not pin publicUrl to null",
    );
  });

  it("no server file exposes a publicUrl setter or accepts publicUrl on write", () => {
    // Storage methods and route bodies must never contain a writeable
    // publicUrl path. We allow read paths (column declaration, serializer
    // overrides, comments).
    const ROUTES = read("server/routes/admin/production-assets.ts");
    assert.doesNotMatch(
      ROUTES,
      /publicUrl\s*:\s*z\.string/,
      "route Zod schemas accept publicUrl as a string input",
    );
    assert.doesNotMatch(
      ROUTES,
      /\.set\(\s*\{[^}]*publicUrl\s*:/,
      "route writes publicUrl via Drizzle .set({...})",
    );
  });

  it("approved_public never appears in any R3F/3D/server surface", () => {
    const files = [...R3F_3D_CLIENT_SURFACES, ...R3F_3D_SERVER_SURFACES];
    for (const rel of files) {
      const src = read(rel);
      assert.ok(
        !/approved_public/.test(src),
        `${rel} references the reserved 'approved_public' string`,
      );
    }
  });
});

// -------------------------------------------------------------------------
// 3. Signed-URL invariant — TTL clamped, never persisted
// -------------------------------------------------------------------------

describe("R10 §2 — signed preview URLs are ephemeral and never persisted", () => {
  it("storage helper clamps TTL to ≤900s", () => {
    assert.equal(storageInternals.MAX_TTL_SECONDS, 900);
  });

  it("issueSignedPreviewUrl clamps a 9999s request to 900s", async () => {
    const signCalls: Array<{ ttl: number }> = [];
    const fake: ProductionAssetStorageBackend = {
      async putBytes() {
        /* unused */
      },
      async headObject() {
        return { exists: false };
      },
      async signGetUrl(_bucket, _obj, ttlSeconds) {
        signCalls.push({ ttl: ttlSeconds });
        return `https://signed.test/?ttl=${ttlSeconds}`;
      },
      async deleteObject() {
        return { deleted: false };
      },
    };
    const origPriv = process.env.PRIVATE_OBJECT_DIR;
    const origPub = process.env.PUBLIC_OBJECT_SEARCH_PATHS;
    process.env.PRIVATE_OBJECT_DIR = "/r10-bucket/.private";
    process.env.PUBLIC_OBJECT_SEARCH_PATHS = "/r10-bucket/public";
    __setBackendForTests(fake);
    try {
      const out = await issueSignedPreviewUrl(
        "production-assets/00000000-0000-0000-0000-000000000abc.glb",
        { adminUserId: "r10-test", ttlSeconds: 9999 },
      );
      assert.equal(signCalls.length, 1);
      assert.equal(signCalls[0].ttl, 900);
      assert.ok(out.url.startsWith("https://signed.test/"));
      const ttlMs = out.expiresAt.getTime() - Date.now();
      assert.ok(
        ttlMs <= 900_000 + 1000 && ttlMs > 0,
        `expiresAt ${out.expiresAt.toISOString()} not within ~900s window`,
      );
    } finally {
      __setBackendForTests(null);
      if (origPriv === undefined) delete process.env.PRIVATE_OBJECT_DIR;
      else process.env.PRIVATE_OBJECT_DIR = origPriv;
      if (origPub === undefined) delete process.env.PUBLIC_OBJECT_SEARCH_PATHS;
      else process.env.PUBLIC_OBJECT_SEARCH_PATHS = origPub;
    }
  });

  it("the audit-log payload for signed_url_issued never contains the URL", () => {
    const routes = read("server/routes/admin/production-assets.ts");
    // Find the signed-preview-url handler body.
    const idx = routes.indexOf("/:id/signed-preview-url");
    assert.ok(idx > 0, "signed-preview-url route not found");
    const handler = routes.slice(idx, idx + 4000);
    assert.match(
      handler,
      /signed_url_issued/,
      "signed_url_issued audit event not appended",
    );
    // The handler must not pass `url` or `signedUrl` into the audit-log payload.
    const payloadMatch = handler.match(/payload\s*:\s*\{[^}]*\}/g) || [];
    for (const p of payloadMatch) {
      assert.ok(
        !/\burl\b\s*:/.test(p) && !/signedUrl\s*:/.test(p),
        `audit-log payload includes a URL field: ${p}`,
      );
    }
  });

  it("shared/schema.ts has no signed-URL column on production_assets", () => {
    const schema = read("shared/schema.ts");
    const tableStart = schema.indexOf("productionAssets =");
    assert.ok(tableStart > 0);
    const tableBlock = schema.slice(tableStart, tableStart + 4000);
    assert.doesNotMatch(
      tableBlock,
      /signedUrl|signed_url|previewUrl|preview_url/i,
      "production_assets table has a signed/preview URL column (forbidden)",
    );
  });

  it("R3F sandbox never persists the signed URL to localStorage/sessionStorage/cookie", () => {
    const sandbox = read("client/src/pages/admin/R3FPreviewSandbox.tsx");
    assert.doesNotMatch(
      sandbox,
      /localStorage\.setItem\([^)]*signed/i,
      "sandbox persists signed URL to localStorage",
    );
    assert.doesNotMatch(
      sandbox,
      /sessionStorage\.setItem\([^)]*signed/i,
      "sandbox persists signed URL to sessionStorage",
    );
    assert.doesNotMatch(
      sandbox,
      /document\.cookie\s*=\s*[^;]*signed/i,
      "sandbox persists signed URL to cookie",
    );
  });
});

// -------------------------------------------------------------------------
// 4. realSendAllowed / executionEnabled invariants
// -------------------------------------------------------------------------

describe("R10 §3 — no realSendAllowed=true / executionEnabled=true on any 3D surface", () => {
  it("no R3F/3D client surface sets either flag to true", () => {
    const re =
      /(realSendAllowed|executionEnabled)\s*[:=]\s*true\b/;
    for (const rel of R3F_3D_CLIENT_SURFACES) {
      const src = read(rel);
      assert.ok(
        !re.test(src),
        `${rel} sets realSendAllowed/executionEnabled to true`,
      );
    }
  });

  it("no R3F/3D server surface sets either flag to true", () => {
    const re =
      /(realSendAllowed|executionEnabled)\s*[:=]\s*true\b/;
    for (const rel of R3F_3D_SERVER_SURFACES) {
      const src = read(rel);
      assert.ok(
        !re.test(src),
        `${rel} sets realSendAllowed/executionEnabled to true`,
      );
    }
  });
});

// -------------------------------------------------------------------------
// 5. No public-bucket writes from the storage helper
// -------------------------------------------------------------------------

describe("R10 §4 — no public-bucket writes from production-asset-storage", () => {
  it("STORAGE_KEY_RE rejects any key outside production-assets/<uuid>.<glb|gltf>", () => {
    const ok = "production-assets/abc-123-def-456-789.glb";
    const bad = [
      "public/foo.glb",
      "production-assets/../escape.glb",
      "production-assets/foo.exe",
      "PRODUCTION-ASSETS/foo.glb",
      "production-assets/foo.GLB",
    ];
    assert.ok(storageInternals.STORAGE_KEY_RE.test(ok), `regex must accept ${ok}`);
    for (const b of bad) {
      assert.ok(
        !storageInternals.STORAGE_KEY_RE.test(b),
        `regex must reject ${b}`,
      );
    }
  });

  it("putAssetBytes refuses a key that would resolve under PUBLIC_OBJECT_SEARCH_PATHS", async () => {
    const writes: string[] = [];
    const fake: ProductionAssetStorageBackend = {
      async putBytes(bucket, obj) {
        writes.push(`${bucket}/${obj}`);
      },
      async headObject() {
        return { exists: false };
      },
      async signGetUrl() {
        return "https://nope";
      },
      async deleteObject() {
        return { deleted: false };
      },
    };
    const origPriv = process.env.PRIVATE_OBJECT_DIR;
    const origPub = process.env.PUBLIC_OBJECT_SEARCH_PATHS;
    // Deliberately set PRIVATE_OBJECT_DIR to a path INSIDE the public search
    // path; the helper must refuse the write.
    process.env.PRIVATE_OBJECT_DIR = "/r10-bucket/public/private";
    process.env.PUBLIC_OBJECT_SEARCH_PATHS = "/r10-bucket/public";
    __setBackendForTests(fake);
    try {
      await assert.rejects(
        () =>
          putAssetBytes(
            "production-assets/00000000-0000-0000-0000-000000000abc.glb",
            Buffer.from([0]),
          ),
        /refusing to write under PUBLIC_OBJECT_SEARCH_PATHS/,
      );
      assert.equal(writes.length, 0, "write should not have been attempted");
    } finally {
      __setBackendForTests(null);
      if (origPriv === undefined) delete process.env.PRIVATE_OBJECT_DIR;
      else process.env.PRIVATE_OBJECT_DIR = origPriv;
      if (origPub === undefined) delete process.env.PUBLIC_OBJECT_SEARCH_PATHS;
      else process.env.PUBLIC_OBJECT_SEARCH_PATHS = origPub;
    }
  });
});

// -------------------------------------------------------------------------
// 6. No provider API calls from any R3F / 3D / 4D client surface
// -------------------------------------------------------------------------

describe("R10 §5 — no provider API calls from any 3D client surface", () => {
  const PROVIDER_HOSTS = [
    "api.openai.com",
    "api.anthropic.com",
    "api.elevenlabs.io",
    "api.heygen.com",
    "api.runwayml.com",
    "api.meshy.ai",
    "api.stability.ai",
    "api.replicate.com",
  ];
  const PROVIDER_IMPORTS = [
    /from\s+["']openai["']/,
    /from\s+["']@anthropic-ai\/sdk["']/,
    /from\s+["']elevenlabs["']/,
    /from\s+["']runwayml["']/,
    /from\s+["']meshy["']/,
  ];

  it("no R3F/3D client surface fetches any provider host", () => {
    for (const rel of R3F_3D_CLIENT_SURFACES) {
      const src = read(rel);
      for (const host of PROVIDER_HOSTS) {
        assert.ok(
          !src.includes(host),
          `${rel} references provider host ${host}`,
        );
      }
      for (const re of PROVIDER_IMPORTS) {
        assert.ok(!re.test(src), `${rel} imports a provider SDK (${re})`);
      }
    }
  });

  it("server asset-library routes import no provider SDK and call no provider host", () => {
    for (const rel of R3F_3D_SERVER_SURFACES) {
      const src = read(rel);
      for (const host of PROVIDER_HOSTS) {
        assert.ok(
          !src.includes(host),
          `${rel} references provider host ${host}`,
        );
      }
      for (const re of PROVIDER_IMPORTS) {
        assert.ok(!re.test(src), `${rel} imports a provider SDK (${re})`);
      }
    }
  });
});

// -------------------------------------------------------------------------
// 7. Validator — caps + reasons + happy path against committed demo GLB
// -------------------------------------------------------------------------

describe("R10 §6 — GLB/GLTF validator caps and failure modes", () => {
  it("rejects a 0-byte upload with reason 'glb_bad_magic'", () => {
    const res = validateGlbOrGltf(Buffer.alloc(0));
    assert.equal(res.ok, false);
    if (!res.ok) {
      const reason: ValidatorFailureReason = res.reason;
      assert.equal(reason, "glb_bad_magic");
    }
  });

  it("rejects a buffer with bad magic", () => {
    const buf = Buffer.alloc(64);
    buf.write("NOPE", 0);
    const res = validateGlbOrGltf(buf);
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.reason, "glb_bad_magic");
  });

  it("accepts the committed R5B demo GLB (sandbox-cube.glb)", () => {
    const buf = readFileSync(
      resolve(REPO, "client/public/demo-assets/sandbox-cube.glb"),
    );
    const res = validateGlbOrGltf(buf);
    assert.equal(res.ok, true, `validator rejected demo GLB`);
    if (res.ok) {
      assert.equal(res.metadata.format, "glb");
      assert.ok(res.metadata.byteSize > 0);
      assert.ok(res.metadata.nodeCount <= 200);
      assert.ok(res.metadata.meshCount <= 200);
      assert.ok(res.metadata.accessorCount <= 2000);
      assert.ok(res.metadata.bufferViewCount <= 2000);
    }
  });
});

// -------------------------------------------------------------------------
// 8. Approval gate is one-way (static reading of storage layer)
// -------------------------------------------------------------------------

describe("R10 §7 — approval gate one-way (not_approved → approved_internal only)", () => {
  it("storage.advanceAssetApprovalGate refuses any other transition", () => {
    const src = read("server/storage.ts");
    // Use the implementation (async ...), not the interface declaration.
    const idx = src.indexOf("async advanceAssetApprovalGate");
    assert.ok(idx > 0, "advanceAssetApprovalGate implementation not found");
    const block = src.slice(idx, idx + 4000);
    // Must include the guard that rejects when existing.approvalGate !== 'not_approved'.
    assert.match(
      block,
      /existing\.approvalGate\s*!==\s*["']not_approved["']/,
      "advanceAssetApprovalGate is missing the guard rejecting non-not_approved transitions",
    );
    // Must set the target gate to approved_internal (never approved_public).
    assert.match(block, /approvalGate:\s*["']approved_internal["']/);
    assert.ok(
      !/approved_public/.test(block),
      "advanceAssetApprovalGate references approved_public (forbidden in R5C)",
    );
  });
});

// -------------------------------------------------------------------------
// 9. R3F canvas performance defaults (dpr / frameloop / powerPreference)
// -------------------------------------------------------------------------

describe("R10 §8 — R3F canvas performance defaults", () => {
  const R3F_CANVASES = [
    "client/src/components/production-house/r3f/ProductionCanvasSandbox.tsx",
    "client/src/components/production-house/r3f/AvatarRigCanvas.tsx",
  ];

  it("every R3F Canvas uses dpr={[1, 1.5]}, frameloop=\"demand\", powerPreference=\"low-power\"", () => {
    for (const rel of R3F_CANVASES) {
      const src = read(rel);
      assert.match(src, /dpr=\{\s*\[\s*1\s*,\s*1\.5\s*\]\s*\}/, `${rel}: dpr cap missing`);
      assert.match(src, /frameloop=["']demand["']/, `${rel}: frameloop="demand" missing`);
      assert.match(
        src,
        /powerPreference:\s*["']low-power["']/,
        `${rel}: gl.powerPreference="low-power" missing`,
      );
    }
  });
});

// -------------------------------------------------------------------------
// 10. No render / live / Unreal / 4D-hardware / publishing trigger
//     from the asset-library route module.
// -------------------------------------------------------------------------

describe("R10 §9 — asset-library route module triggers no render/live/publish/Unreal/4D-hardware", () => {
  it("server/routes/admin/production-assets.ts imports none of those services", () => {
    const src = read("server/routes/admin/production-assets.ts");
    const FORBIDDEN_IMPORTS = [
      /from\s+["'][^"']*unreal-bridge/,
      /from\s+["'][^"']*four-d-sandbox/,
      /from\s+["'][^"']*avatar-video-render-service/,
      /from\s+["'][^"']*broadcast-render/,
      /from\s+["'][^"']*youtube-publishing-service/,
      /from\s+["'][^"']*social-distribution/,
    ];
    for (const re of FORBIDDEN_IMPORTS) {
      assert.ok(!re.test(src), `production-assets routes import a forbidden module: ${re}`);
    }
  });
});

// -------------------------------------------------------------------------
// 11. Dashboard wiring — every 3D admin page is linkable from AdminDashboard
// -------------------------------------------------------------------------

describe("R10 §10 — AdminDashboard exposes every 3D admin surface", () => {
  it("AdminDashboard.tsx references the 3D/4D/Unreal zone and links to the surfaces", () => {
    const dash = read("client/src/pages/admin/AdminDashboard.tsx");
    // The 3D/4D/Unreal zone label is part of the navigation block.
    assert.ok(
      /3D|R3F|Unreal|Unity|Avatar|Virtual Set/i.test(dash),
      "AdminDashboard is missing the 3D/4D/Unreal zone labels",
    );
    // The most important surfaces should be linked.
    const REQUIRED_LINKS = [
      "/admin/r3f-preview-sandbox",
      "/admin/3d-assets",
      "/admin/virtual-set-preview",
      "/admin/avatar-rig-preview",
      "/admin/unity-webgl-sandbox",
    ];
    for (const link of REQUIRED_LINKS) {
      assert.ok(
        dash.includes(link),
        `AdminDashboard is missing a link to ${link}`,
      );
    }
  });
});
