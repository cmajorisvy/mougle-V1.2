/**
 * T7 — HeyGen adapter (dry-run default).
 *
 * Wraps the (future) HeyGen client. In Phase 31 there is no live
 * HeyGen integration; this adapter:
 *  - validates inputs,
 *  - re-asserts the sensitivity gate (defence-in-depth),
 *  - writes a small placeholder MP4 stub into
 *    `PRIVATE_OBJECT_DIR/anchors/` (or the local fallback),
 *  - returns the local path and rich generation metadata.
 *
 * The adapter NEVER calls a live external service unless
 * `dryRun=false` AND `HEYGEN_API_KEY` is configured. Today the
 * non-dry-run path is intentionally a stub that throws, because
 * there's no approved live provider for this phase.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ANCHOR_MODE_REGISTRY,
  AnchorModeError,
  assertModeAllowedForSensitivity,
  type AnchorMode,
} from "./modes";

const LOCAL_FALLBACK_ROOT = resolve(process.cwd(), ".local/media-assets/anchors");
const SAFE_NAME_RE = /[^a-z0-9_]/g;

export interface HeyGenRenderInput {
  packageId: string;
  beatIndex: number;
  mode: AnchorMode;
  sensitive: boolean;
  text: string;
  durationMs?: number;
  dryRun?: boolean;
}

export interface HeyGenRenderResult {
  clipPath: string;
  clipUrl: string | null;
  presetId: string;
  framing: string;
  promptPrefix: string;
  promptText: string;
  durationMs: number;
  dryRun: boolean;
  generationMetadata: {
    provider: "heygen_stub" | "heygen_live";
    presetId: string;
    framing: string;
    mode: AnchorMode;
    sensitive: boolean;
    requestedAt: string;
    bytes: number;
    note: string;
  };
}

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function resolveAnchorsRoot(): string {
  const envDir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (envDir) {
    try {
      const root = join(envDir, "anchors");
      ensureDir(root);
      return root;
    } catch {
      /* fall through to local */
    }
  }
  ensureDir(LOCAL_FALLBACK_ROOT);
  return LOCAL_FALLBACK_ROOT;
}

function safeFilename(packageId: string, beatIndex: number, mode: string): string {
  const id = packageId.toLowerCase().replace(SAFE_NAME_RE, "").slice(0, 24) || "pkg";
  const m = mode.toLowerCase().replace(SAFE_NAME_RE, "").slice(0, 20);
  const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `anchor_${id}_b${beatIndex}_${m}_${seed}.mp4`;
}

/** A 1KB placeholder file so admin preview routes have something to stream. */
function writeStubClip(filePath: string): number {
  const stub = Buffer.alloc(1024, 0);
  // ASCII header so the file is clearly a placeholder, not random video bytes.
  const header = Buffer.from("MOUGLE_ANCHOR_STUB_T7_DRY_RUN", "utf8");
  header.copy(stub, 0);
  writeFileSync(filePath, stub);
  return stub.length;
}

/**
 * Render (or dry-run plan) a single beat's anchor clip.
 *
 * Always re-checks the sensitivity gate so a buggy caller cannot
 * sneak through a forbidden mode.
 */
export async function renderAnchorBeat(input: HeyGenRenderInput): Promise<HeyGenRenderResult> {
  const def = ANCHOR_MODE_REGISTRY[input.mode];
  if (!def) {
    throw new AnchorModeError("unknown_mode", `Unknown anchor mode "${input.mode}"`);
  }

  // Defence-in-depth: even if the director already checked, re-assert here.
  assertModeAllowedForSensitivity(input.mode, input.sensitive);

  const dryRun = input.dryRun !== false; // default true
  const text = (input.text || "").trim();
  const promptText = `${def.promptPrefix}\n\n${text}`.trim();
  const durationMs = Math.max(2000, Math.min(30_000, input.durationMs ?? 6000));

  if (!dryRun) {
    // T10 cost gate — premium anchor render is cost-bearing.
    const { canSpend: costCanSpend } = await import("../cost-control-service");
    const gate = await costCanSpend({
      kind: "anchor_premium",
      estUsd: 0.5,
      metadata: { packageId: input.packageId, beatIndex: input.beatIndex, mode: input.mode },
    });
    if (!gate.allowed) {
      throw new AnchorModeError(
        "cost_blocked",
        `Cost control refused anchor render: ${gate.reasons.join(", ")}`,
        403,
      );
    }
    if (!process.env.HEYGEN_API_KEY) {
      throw new AnchorModeError(
        "live_render_not_configured",
        "Live HeyGen render requested but HEYGEN_API_KEY is not configured. Live anchor rendering is disabled in this phase.",
        501,
      );
    }
    // Even with a key, this phase does not perform a live call.
    throw new AnchorModeError(
      "live_render_disabled",
      "Live anchor rendering is intentionally disabled in this phase. Use dryRun=true.",
      403,
    );
  }

  const root = resolveAnchorsRoot();
  const filename = safeFilename(input.packageId, input.beatIndex, input.mode);
  const clipPath = join(root, filename);
  const bytes = writeStubClip(clipPath);

  return {
    clipPath,
    clipUrl: null,
    presetId: def.presetId,
    framing: def.framing,
    promptPrefix: def.promptPrefix,
    promptText,
    durationMs,
    dryRun: true,
    generationMetadata: {
      provider: "heygen_stub",
      presetId: def.presetId,
      framing: def.framing,
      mode: input.mode,
      sensitive: input.sensitive,
      requestedAt: new Date().toISOString(),
      bytes,
      note: "Dry-run anchor clip stub. No external HeyGen call was made.",
    },
  };
}
