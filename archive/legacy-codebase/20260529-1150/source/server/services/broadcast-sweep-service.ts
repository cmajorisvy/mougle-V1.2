/**
 * Broadcast orphan-file sweep service.
 *
 * Centralises the cover + media reconciliation logic that previously lived
 * inline in `server/routes/broadcasts.ts`. Both the admin "Rescan / Clean up"
 * routes and the scheduled `broadcast-sweep-scheduler` call into here so the
 * behaviour (and safety checks) stays identical between manual and automated
 * runs.
 *
 * SAFETY:
 *  - Only basenames matching known extensions/suffixes are considered.
 *  - Every absolute path is re-resolved and confirmed to live under its
 *    sweep directory before any unlink is attempted (defence-in-depth
 *    against symlink-smuggled path separators).
 *  - `apply=false` (dry-run) is the default for the scheduled runs.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { broadcastCompositorService } from "./broadcast-compositor-service";

const COVER_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

const LOCAL_COVERS_FALLBACK = resolve(
  process.cwd(),
  ".local/media-assets/broadcasts/covers",
);

export function coversDir(): string {
  const envDir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (envDir) {
    try {
      const root = resolve(envDir, "broadcasts", "covers");
      mkdirSync(root, { recursive: true });
      return root;
    } catch {
      /* fall through to local */
    }
  }
  mkdirSync(LOCAL_COVERS_FALLBACK, { recursive: true });
  return LOCAL_COVERS_FALLBACK;
}

export interface CoversSweepResult {
  ok: true;
  dryRun: boolean;
  orphanCount: number;
  removed: number;
  orphans: { file: string; id: string; ext: string }[];
}

export interface MediaSweepResult {
  ok: true;
  dryRun: boolean;
  orphanCount: number;
  removed: number;
  bytesRemoved: number;
  orphans: { file: string; kind: "mp4" | "manifest"; bytes: number }[];
}

export type SweepError = { ok: false; error: string; message?: string };

export async function runCoversSweep(
  apply: boolean,
): Promise<CoversSweepResult | SweepError> {
  const dir = coversDir();
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    return { ok: false, error: "read_dir_failed", message: (err as Error).message };
  }
  const knownIds = new Set(await broadcastCompositorService.listBroadcastIds());
  const orphans: { file: string; id: string; ext: string }[] = [];
  for (const name of entries) {
    const ext = extname(name).slice(1).toLowerCase();
    if (!COVER_EXTENSIONS.has(ext)) continue;
    const id = name.slice(0, -(ext.length + 1));
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) continue;
    if (knownIds.has(id)) continue;
    orphans.push({ file: name, id, ext });
  }
  let removed = 0;
  if (apply) {
    for (const o of orphans) {
      const abs = resolve(dir, o.file);
      if (basename(abs) !== o.file) continue;
      if (!abs.startsWith(dir + "/")) continue;
      try {
        if (existsSync(abs)) {
          unlinkSync(abs);
          removed += 1;
        }
      } catch {
        /* ignore */
      }
    }
  }
  return { ok: true, dryRun: !apply, orphanCount: orphans.length, removed, orphans };
}

export function hashOrphanFileList(files: string[]): string {
  const sorted = [...files].sort();
  return createHash("sha256")
    .update(JSON.stringify(sorted))
    .digest("hex")
    .slice(0, 32);
}

export type MediaSweepHashMismatch = {
  ok: false;
  error: "orphan_set_changed";
  orphans: { file: string; kind: "mp4" | "manifest"; bytes: number }[];
  orphanCount: number;
  currentHash: string;
};

export async function runMediaSweep(
  apply: boolean,
  opts?: { expectedHash?: string },
): Promise<MediaSweepResult | MediaSweepHashMismatch | SweepError> {
  const dir = broadcastCompositorService.getBroadcastStorageRoot();
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    return { ok: false, error: "read_dir_failed", message: (err as Error).message };
  }
  const known = await broadcastCompositorService.listBroadcastMediaBasenames();
  const orphans: { file: string; kind: "mp4" | "manifest"; bytes: number }[] = [];
  for (const name of entries) {
    let kind: "mp4" | "manifest" | null = null;
    if (name.endsWith(".manifest.json")) kind = "manifest";
    else if (name.endsWith(".mp4")) kind = "mp4";
    if (!kind) continue;
    if (basename(name) !== name) continue;
    const abs = resolve(dir, name);
    if (!abs.startsWith(dir + "/")) continue;
    const refSet = kind === "mp4" ? known.mp4 : known.manifest;
    if (refSet.has(name)) continue;
    let bytes = 0;
    try {
      bytes = statSync(abs).size;
    } catch {
      /* ignore — file may have vanished between readdir and stat */
    }
    orphans.push({ file: name, kind, bytes });
  }
  let removed = 0;
  let bytesRemoved = 0;
  if (apply) {
    // Re-verify the orphan set has not changed since the dry-run that
    // produced the caller's confirm token. Mirrors the covers/sweep guard.
    if (opts?.expectedHash !== undefined) {
      const currentHash = hashOrphanFileList(orphans.map((o) => o.file));
      if (currentHash !== opts.expectedHash) {
        return {
          ok: false,
          error: "orphan_set_changed",
          orphans,
          orphanCount: orphans.length,
          currentHash,
        };
      }
    }
    for (const o of orphans) {
      const abs = resolve(dir, o.file);
      if (basename(abs) !== o.file) continue;
      if (!abs.startsWith(dir + "/")) continue;
      try {
        unlinkSync(abs);
        removed += 1;
        bytesRemoved += o.bytes;
      } catch {
        /* ignore */
      }
    }
  }
  return {
    ok: true,
    dryRun: !apply,
    orphanCount: orphans.length,
    removed,
    bytesRemoved,
    orphans,
  };
}
