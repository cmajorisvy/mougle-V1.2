/**
 * T6 — Admin broadcast routes.
 *
 * SAFETY:
 *  - All routes require root admin (`requireRootAdmin`).
 *  - CSRF is enforced globally on `/api/*` in `server/index.ts`.
 *  - Streaming endpoint only serves files under PRIVATE_OBJECT_DIR/broadcasts
 *    (or the local fallback). No public/signed URLs are generated here.
 *  - Render endpoint defaults to dryRun=true. A non-dry-run render requires
 *    the explicit founder approval flag value from broadcast-compositor-service.
 */

import { appendFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve, dirname, extname, basename } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import {
  broadcastCompositorService,
  BroadcastSafetyError,
  FOUNDER_APPROVAL_FLAG_VALUE,
  type BroadcastRenderInput,
  type BroadcastSourceItem,
} from "../services/broadcast-compositor-service";
import { safeImageFetch, SafeFetchError } from "../lib/safe-image-fetch";
import { coverOrphanAlertService } from "../services/cover-orphan-alert-service";
import { liveBroadcastAlertService } from "../services/live-broadcast-alert-service";
import { mediaOrphanAlertService } from "../services/media-orphan-alert-service";
import { fallbackPresetAuditSettingsService } from "../services/fallback-preset-audit-settings-service";
import { runMediaSweep } from "../services/broadcast-sweep-service";
import { listAudit } from "../services/production-house-service";
import {
  getEffectiveApplyMode,
  getLastRunSummary,
  runScheduledSweep,
  setApplyOverride,
} from "../services/broadcast-sweep-scheduler";
import { db } from "../db";
import {
  adminBroadcastFallbackDefaultPreset,
  adminBroadcastSavedView,
  adminStaff,
  broadcastLiveAlertEvents,
} from "@shared/schema";
import { and, asc, desc, eq, inArray, ne, or, sql as drizzleSql } from "drizzle-orm";
import { getAdminVerification, isRootAdmin } from "../middleware/admin-auth";

const COVER_MAX_BYTES = 8 * 1024 * 1024;
const COVER_MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const COVER_EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

const LOCAL_COVERS_FALLBACK = resolve(
  process.cwd(),
  ".local/media-assets/broadcasts/covers",
);

// Short-lived confirm token used to guard destructive cover sweeps.
const COVER_SWEEP_TOKEN_TTL_MS = 5 * 60 * 1000;

type MediaSweepResult = Awaited<ReturnType<typeof runMediaSweep>>;

function isMediaSweepHashMismatch(
  result: MediaSweepResult,
): result is Extract<MediaSweepResult, { error: "orphan_set_changed" }> {
  return !result.ok && result.error === "orphan_set_changed";
}

// Parse `key=value` pairs from a scheduled-sweep audit `detail` string into
// a structured shape. Values that can't be parsed are returned as null so
// the UI can decide how to render them (e.g. for failed runs that just
// carry an error message).
function parseSweepDetail(detail: string): {
  orphanCount: number | null;
  removed: number | null;
  bytesRemoved: number | null;
  dryRun: boolean | null;
} {
  const out: Record<string, string> = {};
  for (const token of detail.split(/\s+/)) {
    const idx = token.indexOf("=");
    if (idx <= 0) continue;
    out[token.slice(0, idx)] = token.slice(idx + 1);
  }
  const num = (k: string): number | null => {
    const v = out[k];
    if (v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const bool = (k: string): boolean | null => {
    const v = out[k];
    if (v === undefined) return null;
    if (v === "true") return true;
    if (v === "false") return false;
    return null;
  };
  return {
    orphanCount: num("orphans"),
    removed: num("removed"),
    bytesRemoved: num("bytesRemoved"),
    dryRun: bool("dryRun"),
  };
}

function hashOrphanFileList(files: string[]): string {
  const sorted = [...files].sort();
  return createHash("sha256")
    .update(JSON.stringify(sorted))
    .digest("hex")
    .slice(0, 32);
}

function parseCoverSweepToken(
  token: string,
): { issuedAt: number; hash: string } | null {
  const idx = token.indexOf(".");
  if (idx <= 0) return null;
  const issuedAt = Number(token.slice(0, idx));
  const hash = token.slice(idx + 1);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;
  if (!/^[a-f0-9]{8,64}$/.test(hash)) return null;
  return { issuedAt, hash };
}

function coversTrashDir(): string {
  const root = coversDir();
  const trash = resolve(root, ".trash");
  mkdirSync(trash, { recursive: true });
  return trash;
}

function coversDir(): string {
  const envDir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (envDir) {
    try {
      const root = resolve(envDir, "broadcasts", "covers");
      mkdirSync(root, { recursive: true });
      return root;
    } catch (err) {
      console.warn(
        `[broadcasts] cover storage in PRIVATE_OBJECT_DIR not writable (${(err as Error).message}); using local fallback ${LOCAL_COVERS_FALLBACK}.`,
      );
    }
  }
  mkdirSync(LOCAL_COVERS_FALLBACK, { recursive: true });
  return LOCAL_COVERS_FALLBACK;
}

function findCoverFile(broadcastId: string): { path: string; ext: string } | null {
  const dir = coversDir();
  const safeId = broadcastId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId || safeId !== broadcastId) return null;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const prefix = `${safeId}.`;
  for (const name of entries) {
    if (!name.startsWith(prefix)) continue;
    const ext = extname(name).slice(1).toLowerCase();
    if (!COVER_EXT_TO_MIME[ext]) continue;
    const abs = resolve(dir, name);
    if (basename(abs) !== name) continue;
    if (!abs.startsWith(dir + "/")) continue;
    return { path: abs, ext };
  }
  return null;
}

// Removes every cover file (any extension) belonging to a broadcast id.
// Safe to call when no file exists. Used by the cover-clear PATCH, broadcast
// deletion, and the orphan sweep.
function deleteCoverFilesFor(broadcastId: string): number {
  const safeId = broadcastId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId || safeId !== broadcastId) return 0;
  const dir = coversDir();
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  const prefix = `${safeId}.`;
  for (const name of entries) {
    if (!name.startsWith(prefix)) continue;
    const ext = extname(name).slice(1).toLowerCase();
    if (!COVER_EXT_TO_MIME[ext]) continue;
    const abs = resolve(dir, name);
    if (basename(abs) !== name) continue;
    if (!abs.startsWith(dir + "/")) continue;
    try {
      unlinkSync(abs);
      removed += 1;
    } catch {
      /* ignore — best effort cleanup */
    }
  }
  return removed;
}

// Append-only audit log of cover-sweep runs. Lives next to the cover
// storage so a single PRIVATE_OBJECT_DIR override (e.g. in tests) keeps
// the audit trail co-located with the files it describes. Each line is
// a JSON object so tooling can `tail`/`jq` it without parsing the whole
// file. Falls back to .local/audit when PRIVATE_OBJECT_DIR is unavailable.
const LOCAL_AUDIT_FALLBACK = resolve(process.cwd(), ".local/audit");

function coverSweepAuditPath(): string {
  const envDir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (envDir) {
    try {
      const root = resolve(envDir, "audit");
      mkdirSync(root, { recursive: true });
      return resolve(root, "broadcast-cover-sweep.jsonl");
    } catch (err) {
      console.warn(
        `[broadcasts] audit dir in PRIVATE_OBJECT_DIR not writable (${(err as Error).message}); using local fallback ${LOCAL_AUDIT_FALLBACK}.`,
      );
    }
  }
  mkdirSync(LOCAL_AUDIT_FALLBACK, { recursive: true });
  return resolve(LOCAL_AUDIT_FALLBACK, "broadcast-cover-sweep.jsonl");
}

interface CoverSweepAuditEntry {
  id: string;
  ts: string;
  actorId: string;
  mode: "dry_run" | "apply" | "restore";
  dir: string;
  orphans: { file: string; id: string; ext: string; bytes?: number }[];
  removed: string[];
  errors: { file: string; message: string }[];
  // Present on "apply" entries: subdir under the trash root that holds the
  // moved-aside cover files (relative to coversDir). Lets the restore flow
  // find them later.
  trashDir?: string;
  // Present on "restore" entries: the apply audit id this restore is from,
  // and the file(s) put back in place.
  restoredFrom?: string;
  restored?: string[];
}

// Rotation tuning. Defaults keep the audit footprint to ~5MB worst case
// (1MB active + 4 × 1MB archives) which is well under any disk budget while
// still preserving months of history for a typical sweep cadence. Both values
// are now admin-tunable from the Cover File Sweep panel; the resolution order
// is DB-persisted setting → `COVER_SWEEP_AUDIT_MAX_BYTES` /
// `COVER_SWEEP_AUDIT_MAX_ARCHIVES` env var → default. The DB values live in
// `system_settings` and are managed by `coverOrphanAlertService` (which also
// caches them so the rotation path stays synchronous).
const COVER_SWEEP_AUDIT_ARCHIVE_SUFFIX_RE =
  /^broadcast-cover-sweep\.jsonl\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)(?:-[a-f0-9]{4})?$/;

function coverSweepAuditMaxBytes(): number {
  return coverOrphanAlertService.getAuditMaxBytesSync();
}

function coverSweepAuditMaxArchives(): number {
  return coverOrphanAlertService.getAuditMaxArchivesSync();
}

// Returns the rotated archive filenames in the audit directory, sorted
// oldest-first by their embedded timestamp suffix.
function listCoverSweepAuditArchives(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const matches: { name: string; ts: string }[] = [];
  for (const name of entries) {
    const m = COVER_SWEEP_AUDIT_ARCHIVE_SUFFIX_RE.exec(name);
    if (!m) continue;
    matches.push({ name, ts: m[1] });
  }
  matches.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  return matches.map((m) => m.name);
}

// If the active audit file is over the configured size, rename it to a
// timestamped archive and prune older archives so at most N are kept.
function rotateCoverSweepAuditIfNeeded(activePath: string): void {
  const maxBytes = coverSweepAuditMaxBytes();
  let size = 0;
  try {
    size = statSync(activePath).size;
  } catch {
    return;
  }
  if (size < maxBytes) return;
  const dir = dirname(activePath);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let archiveName = `broadcast-cover-sweep.jsonl.${stamp}`;
  let archivePath = resolve(dir, archiveName);
  // Extremely unlikely collision (same-millisecond rotation): disambiguate.
  if (existsSync(archivePath)) {
    const suffix = randomUUID().slice(0, 4);
    archiveName = `broadcast-cover-sweep.jsonl.${stamp}-${suffix}`;
    archivePath = resolve(dir, archiveName);
  }
  try {
    renameSync(activePath, archivePath);
  } catch (err) {
    console.warn(
      `[broadcasts] cover-sweep audit rotation failed: ${(err as Error).message}`,
    );
    return;
  }
  const maxArchives = coverSweepAuditMaxArchives();
  const archives = listCoverSweepAuditArchives(dir);
  const excess = archives.length - maxArchives;
  if (excess > 0) {
    for (const old of archives.slice(0, excess)) {
      try {
        unlinkSync(resolve(dir, old));
      } catch {
        /* best effort */
      }
    }
  }
}

function appendCoverSweepAudit(entry: CoverSweepAuditEntry): void {
  try {
    const p = coverSweepAuditPath();
    appendFileSync(p, JSON.stringify(entry) + "\n", "utf8");
    rotateCoverSweepAuditIfNeeded(p);
  } catch (err) {
    console.error("[broadcasts] cover-sweep audit append failed", err);
  }
}

function parseAuditLines(raw: string): CoverSweepAuditEntry[] {
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const out: CoverSweepAuditEntry[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as CoverSweepAuditEntry);
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}

interface MediaSweepAuditEntry {
  id: string;
  ts: string;
  actorId: string;
  mode: "apply";
  orphanCount: number;
  removed: number;
  bytesRemoved: number;
  orphans: { file: string; kind: "mp4" | "manifest"; bytes: number }[];
}

function mediaSweepAuditPath(): string {
  const envDir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (envDir) {
    try {
      const root = resolve(envDir, "audit");
      mkdirSync(root, { recursive: true });
      return resolve(root, "broadcast-media-sweep.jsonl");
    } catch (err) {
      console.warn(
        `[broadcasts] audit dir in PRIVATE_OBJECT_DIR not writable (${(err as Error).message}); using local fallback ${LOCAL_AUDIT_FALLBACK}.`,
      );
    }
  }
  mkdirSync(LOCAL_AUDIT_FALLBACK, { recursive: true });
  return resolve(LOCAL_AUDIT_FALLBACK, "broadcast-media-sweep.jsonl");
}

// Mirrors the cover-sweep audit-log rotation. Without this, the media-sweep
// audit grows unbounded as broadcasts come and go. Both values are admin-
// tunable from the Render File Sweep panel; the resolution order is
// DB-persisted setting → `MEDIA_SWEEP_AUDIT_MAX_BYTES` /
// `MEDIA_SWEEP_AUDIT_MAX_ARCHIVES` env var → default. The DB values live in
// `system_settings` and are managed by `mediaOrphanAlertService` (which
// caches them so the rotation path stays synchronous).
const MEDIA_SWEEP_AUDIT_ARCHIVE_SUFFIX_RE =
  /^broadcast-media-sweep\.jsonl\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)(?:-[a-f0-9]{4})?$/;

function mediaSweepAuditMaxBytes(): number {
  return mediaOrphanAlertService.getAuditMaxBytesSync();
}

function mediaSweepAuditMaxArchives(): number {
  return mediaOrphanAlertService.getAuditMaxArchivesSync();
}

function listMediaSweepAuditArchives(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const matches: { name: string; ts: string }[] = [];
  for (const name of entries) {
    const m = MEDIA_SWEEP_AUDIT_ARCHIVE_SUFFIX_RE.exec(name);
    if (!m) continue;
    matches.push({ name, ts: m[1] });
  }
  matches.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  return matches.map((m) => m.name);
}

function rotateMediaSweepAuditIfNeeded(activePath: string): void {
  const maxBytes = mediaSweepAuditMaxBytes();
  let size = 0;
  try {
    size = statSync(activePath).size;
  } catch {
    return;
  }
  if (size < maxBytes) return;
  const dir = dirname(activePath);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let archiveName = `broadcast-media-sweep.jsonl.${stamp}`;
  let archivePath = resolve(dir, archiveName);
  if (existsSync(archivePath)) {
    const suffix = randomUUID().slice(0, 4);
    archiveName = `broadcast-media-sweep.jsonl.${stamp}-${suffix}`;
    archivePath = resolve(dir, archiveName);
  }
  try {
    renameSync(activePath, archivePath);
  } catch (err) {
    console.warn(
      `[broadcasts] media-sweep audit rotation failed: ${(err as Error).message}`,
    );
    return;
  }
  const maxArchives = mediaSweepAuditMaxArchives();
  const archives = listMediaSweepAuditArchives(dir);
  const excess = archives.length - maxArchives;
  if (excess > 0) {
    for (const old of archives.slice(0, excess)) {
      try {
        unlinkSync(resolve(dir, old));
      } catch {
        /* best effort */
      }
    }
  }
}

function appendMediaSweepAudit(entry: MediaSweepAuditEntry): void {
  try {
    const p = mediaSweepAuditPath();
    appendFileSync(p, JSON.stringify(entry) + "\n", "utf8");
    rotateMediaSweepAuditIfNeeded(p);
  } catch (err) {
    console.error("[broadcasts] media-sweep audit append failed", err);
  }
}

function parseMediaAuditLines(raw: string): MediaSweepAuditEntry[] {
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const out: MediaSweepAuditEntry[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as MediaSweepAuditEntry);
    } catch {
      /* skip malformed line */
    }
  }
  return out;
}

function readMediaSweepAudit(limit: number): MediaSweepAuditEntry[] {
  let p: string;
  try {
    p = mediaSweepAuditPath();
  } catch {
    return [];
  }
  const dir = dirname(p);
  let entries: MediaSweepAuditEntry[] = [];
  try {
    entries = parseMediaAuditLines(readFileSync(p, "utf8"));
  } catch {
    entries = [];
  }
  // If the active file alone can't satisfy the requested limit, pull in
  // rotated archives newest-first until we have enough (or run out). Mirrors
  // `readCoverSweepAudit` so admins still see history after rotation.
  if (entries.length < limit) {
    const archives = listMediaSweepAuditArchives(dir).reverse();
    for (const name of archives) {
      if (entries.length >= limit) break;
      try {
        const prev = parseMediaAuditLines(
          readFileSync(resolve(dir, name), "utf8"),
        );
        entries = prev.concat(entries);
      } catch {
        /* skip unreadable archive */
      }
    }
  }
  const tail = entries.slice(-limit);
  return tail.reverse();
}

// Summary stats about the on-disk audit log: size of the active file,
// number of rotated archives, and total bytes used across all of them.
// Surfaced in the Cover File Sweep panel so admins can confirm retention
// settings are working without SSHing into the box.
// T359 — `archives` (newest first, with bytes + parsed rotation timestamp)
// is included so the panel can list rotated files for the per-archive
// Inspect dialog, mirroring the fallback-preset audit surface.
// T366 — `keptCount` / `deletedCount` mirror the fallback-preset
// per-archive set/clear breakdown so the cover-/media-sweep panels can
// surface at-a-glance action totals on every rotated archive row.
type SweepArchiveSummary = {
  name: string;
  rotatedAt: string | null;
  bytes: number;
  keptCount: number;
  deletedCount: number;
};
function suffixToIso(suffix: string): string | null {
  // Suffix shape: "2024-01-31T12-34-56-789Z" → restore the ":" and "." that
  // `:`/`.` are illegal on Windows filesystems so rotation replaces them.
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(
    suffix,
  );
  if (!m) return null;
  const iso = `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? iso : null;
}
// T366 — Per-archive kept/deleted count caches. Key includes mtimeMs+size
// so the unlikely case of a rotated archive being rewritten (e.g. manual
// repair) invalidates the entry. Cache lives for the process lifetime; the
// working set is bounded by `maxArchives` per surface.
const coverSweepAuditCountCache = new Map<
  string,
  { keptCount: number; deletedCount: number }
>();
const mediaSweepAuditCountCache = new Map<
  string,
  { keptCount: number; deletedCount: number }
>();
export function countCoverSweepArchiveActions(
  fullPath: string,
  mtimeMs: number,
  size: number,
): { keptCount: number; deletedCount: number } {
  const key = `${fullPath}|${mtimeMs}|${size}`;
  const cached = coverSweepAuditCountCache.get(key);
  if (cached) return cached;
  let keptCount = 0;
  let deletedCount = 0;
  try {
    const raw = readFileSync(fullPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const e = JSON.parse(trimmed) as Partial<CoverSweepAuditEntry>;
        const orphans = Array.isArray(e.orphans) ? e.orphans.length : 0;
        const removed = Array.isArray(e.removed) ? e.removed.length : 0;
        if (e.mode === "apply") {
          deletedCount += removed;
          keptCount += Math.max(0, orphans - removed);
        } else if (e.mode === "dry_run") {
          // Dry runs flag orphans without deleting any of them.
          keptCount += orphans;
        }
        // "restore" entries put files back in place; they contribute to
        // neither kept nor deleted in the orphan-triage sense.
      } catch {
        /* skip malformed line */
      }
    }
  } catch {
    return { keptCount: 0, deletedCount: 0 };
  }
  const result = { keptCount, deletedCount };
  coverSweepAuditCountCache.set(key, result);
  return result;
}
export function countMediaSweepArchiveActions(
  fullPath: string,
  mtimeMs: number,
  size: number,
): { keptCount: number; deletedCount: number } {
  const key = `${fullPath}|${mtimeMs}|${size}`;
  const cached = mediaSweepAuditCountCache.get(key);
  if (cached) return cached;
  let keptCount = 0;
  let deletedCount = 0;
  try {
    const raw = readFileSync(fullPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const e = JSON.parse(trimmed) as Partial<MediaSweepAuditEntry>;
        const orphans =
          typeof e.orphanCount === "number" ? e.orphanCount : 0;
        const removed = typeof e.removed === "number" ? e.removed : 0;
        deletedCount += removed;
        keptCount += Math.max(0, orphans - removed);
      } catch {
        /* skip malformed line */
      }
    }
  } catch {
    return { keptCount: 0, deletedCount: 0 };
  }
  const result = { keptCount, deletedCount };
  mediaSweepAuditCountCache.set(key, result);
  return result;
}
function archivesWithStats(
  dir: string,
  archives: string[],
  suffixRe: RegExp,
  // T366 — Per-archive counter so each surface can report its own
  // domain-appropriate action breakdown (kept/deleted for sweeps).
  counter: (
    fullPath: string,
    mtimeMs: number,
    size: number,
  ) => { keptCount: number; deletedCount: number },
): SweepArchiveSummary[] {
  // Newest first so the UI doesn't have to reverse it itself.
  const reversed = [...archives].reverse();
  return reversed.map((name) => {
    let bytes = 0;
    let mtimeMs = 0;
    const fullPath = resolve(dir, name);
    try {
      const s = statSync(fullPath);
      bytes = s.size;
      mtimeMs = s.mtimeMs;
    } catch {
      /* best effort */
    }
    const m = suffixRe.exec(name);
    const rotatedAt = m ? suffixToIso(m[1]) : null;
    const { keptCount, deletedCount } = counter(fullPath, mtimeMs, bytes);
    return { name, bytes, rotatedAt, keptCount, deletedCount };
  });
}
function coverSweepAuditStats(): {
  activeBytes: number;
  activeExists: boolean;
  archiveCount: number;
  archiveBytes: number;
  totalBytes: number;
  archives: SweepArchiveSummary[];
} {
  let activePath: string;
  try {
    activePath = coverSweepAuditPath();
  } catch {
    return {
      activeBytes: 0,
      activeExists: false,
      archiveCount: 0,
      archiveBytes: 0,
      totalBytes: 0,
      archives: [],
    };
  }
  let activeBytes = 0;
  let activeExists = false;
  try {
    const s = statSync(activePath);
    activeBytes = s.size;
    activeExists = true;
  } catch {
    /* missing → 0 */
  }
  const dir = dirname(activePath);
  const archiveNames = listCoverSweepAuditArchives(dir);
  const archives = archivesWithStats(
    dir,
    archiveNames,
    COVER_SWEEP_AUDIT_ARCHIVE_SUFFIX_RE,
    countCoverSweepArchiveActions,
  );
  const archiveBytes = archives.reduce((acc, a) => acc + a.bytes, 0);
  return {
    activeBytes,
    activeExists,
    archiveCount: archives.length,
    archiveBytes,
    totalBytes: activeBytes + archiveBytes,
    archives,
  };
}

// T359 — Mirror of `coverSweepAuditStats` for the media-sweep audit log so
// the Render File Sweep panel can list rotated archives and open the same
// inspect dialog as the cover-sweep / fallback-preset surfaces.
function mediaSweepAuditStats(): {
  activeBytes: number;
  activeExists: boolean;
  archiveCount: number;
  archiveBytes: number;
  totalBytes: number;
  archives: SweepArchiveSummary[];
} {
  let activePath: string;
  try {
    activePath = mediaSweepAuditPath();
  } catch {
    return {
      activeBytes: 0,
      activeExists: false,
      archiveCount: 0,
      archiveBytes: 0,
      totalBytes: 0,
      archives: [],
    };
  }
  let activeBytes = 0;
  let activeExists = false;
  try {
    const s = statSync(activePath);
    activeBytes = s.size;
    activeExists = true;
  } catch {
    /* missing → 0 */
  }
  const dir = dirname(activePath);
  const archiveNames = listMediaSweepAuditArchives(dir);
  const archives = archivesWithStats(
    dir,
    archiveNames,
    MEDIA_SWEEP_AUDIT_ARCHIVE_SUFFIX_RE,
    countMediaSweepArchiveActions,
  );
  const archiveBytes = archives.reduce((acc, a) => acc + a.bytes, 0);
  return {
    activeBytes,
    activeExists,
    archiveCount: archives.length,
    archiveBytes,
    totalBytes: activeBytes + archiveBytes,
    archives,
  };
}

function readCoverSweepAudit(limit: number): CoverSweepAuditEntry[] {
  let p: string;
  try {
    p = coverSweepAuditPath();
  } catch {
    return [];
  }
  const dir = dirname(p);
  let entries: CoverSweepAuditEntry[] = [];
  try {
    entries = parseAuditLines(readFileSync(p, "utf8"));
  } catch {
    entries = [];
  }
  // If the active file alone can't satisfy the requested limit, pull in
  // rotated archives newest-first until we have enough (or run out).
  if (entries.length < limit) {
    const archives = listCoverSweepAuditArchives(dir).reverse();
    for (const name of archives) {
      if (entries.length >= limit) break;
      try {
        const prev = parseAuditLines(readFileSync(resolve(dir, name), "utf8"));
        // Prepend older entries so chronological order in `entries` is preserved.
        entries = prev.concat(entries);
      } catch {
        /* skip unreadable archive */
      }
    }
  }
  const tail = entries.slice(-limit);
  return tail.reverse();
}

const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: COVER_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || "").toLowerCase();
    if (COVER_MIME_TO_EXT[mime]) {
      cb(null, true);
    } else {
      cb(new Error("invalid_mime"));
    }
  },
});

const SourceSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url().nullable().optional(),
  license: z.string().min(1).max(120),
  attribution: z.string().max(500).nullable().optional(),
  tier: z.string().max(80).nullable().optional(),
});

// `packageApproved` is INTENTIONALLY NOT accepted from the client.
// Approval is determined server-side via broadcastCompositorService.isPackageApproved()
// so a request body field cannot bypass review.
const RenderBodySchema = z.object({
  packageId: z.string().min(1).max(120),
  brollPlanId: z.string().max(120).nullable().optional(),
  // Local file path under PRIVATE_OBJECT_DIR or .local/media-assets — never a URL.
  anchorVideoUrl: z.string().max(1024).nullable().optional(),
  backgroundImageUrl: z.string().max(1024).nullable().optional(),
  backgroundAttribution: z.string().max(300).nullable().optional(),
  brandLabel: z.string().min(1).max(16).default("MOUGLE"),
  kicker: z.string().min(1).max(60),
  headline: z.string().min(1).max(200),
  speakerName: z.string().max(120).nullable().optional(),
  speakerRole: z.string().max(120).nullable().optional(),
  tickerItems: z.array(z.string().max(200)).max(20).default([]),
  breaking: z.object({
    enabled: z.boolean(),
    label: z.string().max(40).default("BREAKING"),
    headline: z.string().max(200).default(""),
  }).default({ enabled: false, label: "BREAKING", headline: "" }),
  confidence: z.enum(["high", "medium", "low"]),
  confidenceScore: z.number().min(0).max(1),
  sources: z.array(SourceSchema).min(1).max(12),
  durationSec: z.number().int().min(2).max(60).default(8),
  title: z.string().max(200).nullable().optional(),
  coverImageUrl: z.string().max(1024).nullable().optional(),
  dryRun: z.boolean().optional(),
  founderApprovalFlag: z.string().max(120).nullable().optional(),
});

// T322 — Reserved single-segment sub-route names under
// `/api/admin/broadcasts/`. Both PATCH `:id` and DELETE `:id` are registered
// earlier in the file than these sibling sub-routes, and Express matches
// routes in registration order. Without this allowlist, e.g.
// `DELETE /api/admin/broadcasts/fallback-default-preset` would match the
// broadcast `:id` handler first and never reach its real handler, returning
// 500 (or silently mutating the wrong row) instead of clearing the preset.
//
// The `:id` PATCH/DELETE handlers consult this set and `next()` past
// themselves when the id matches, so the later, more specific route still
// fires. Update this set whenever a new single-segment sibling sub-route is
// added under `/api/admin/broadcasts/` to keep the same class of bug from
// recurring.
export const RESERVED_BROADCAST_SUBROUTE_NAMES: ReadonlySet<string> = new Set([
  "render",
  "approvals",
  "saved-views",
  "saved-view-schedule-audit",
  "fallback-default-preset",
  "fallback-default-preset-audit",
  "cover-proxy",
  // Defensive: these are currently only used as multi-segment prefixes
  // (e.g. `covers/sweep`, `sweep/history`, `live-alert/status`,
  // `live-alerts/events`), but reserving the bare names guards against a
  // future single-segment route under the same prefix being shadowed.
  // The `tests/broadcast-reserved-subroutes.test.ts` structural guard
  // enforces that every first segment used under `/api/admin/broadcasts/`
  // is present here, so this set must stay in sync with the routes
  // registered below.
  "covers",
  "media",
  "sweep",
  "live-alert",
  "live-alerts",
  "_meta",
]);

const UpdateBroadcastBodySchema = z.object({
  title: z.string().max(200).nullable().optional(),
  coverImageUrl: z.string().max(1024).nullable().optional(),
}).refine(
  (v) => v.title !== undefined || v.coverImageUrl !== undefined,
  { message: "at least one of title or coverImageUrl is required" },
);

function ensureInsidePrivateRoot(filePath: string): boolean {
  const envDir = process.env.PRIVATE_OBJECT_DIR?.trim();
  const root = envDir
    ? resolve(envDir, "broadcasts")
    : resolve(process.cwd(), ".local/media-assets/broadcasts");
  const abs = resolve(filePath);
  return abs === root || abs.startsWith(root + "/");
}

const coverUploadMiddleware: RequestHandler = (req, res, next) => {
  coverUpload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const msg = (err as Error)?.message || "upload_failed";
      if (msg === "invalid_mime") {
        return res.status(400).json({
          ok: false,
          error: "invalid_mime",
          message: "Only PNG, JPEG, WebP, or GIF images are accepted",
        });
      }
      if ((err as { code?: string })?.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          ok: false,
          error: "upload_too_large",
          message: `Cover image must be ≤ ${Math.round(COVER_MAX_BYTES / 1024 / 1024)}MB`,
        });
      }
      return res.status(400).json({ ok: false, error: "upload_failed", message: msg });
    }
    next();
  });
};

export function registerBroadcastRoutes(app: Express, requireRootAdmin: RequestHandler): void {
  // Public cover image — readable by the public Live Channel viewer. Path is
  // strictly confined to PRIVATE_OBJECT_DIR/broadcasts/covers/<id>.<ext>. The
  // upload route is admin-only; this read-side path lets unauthenticated
  // viewers see the cover that an admin explicitly chose to publish.
  app.get("/api/public/broadcasts/:id/cover", async (req, res) => {
    const id = String(req.params.id || "");
    if (!id || id.length > 120) return res.status(404).end();
    const found = findCoverFile(id);
    if (!found) return res.status(404).end();
    res.setHeader("Content-Type", COVER_EXT_TO_MIME[found.ext] || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=60");
    createReadStream(found.path).pipe(res);
  });

  // Server-side proxy used by the admin re-crop flow to fetch the bytes of a
  // saved cover image (or any external image URL stored in
  // broadcasts.coverImageUrl) without tainting the client canvas with CORS.
  // Admin-only. Only http/https URLs returning image/* content are allowed,
  // with a hard size cap matching the upload limit.
  app.get("/api/admin/broadcasts/cover-proxy", requireRootAdmin, async (req, res) => {
    const raw = String(req.query.url || "").trim();
    if (!raw || raw.length > 2048) {
      return res.status(400).json({ ok: false, error: "invalid_url" });
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(raw);
    } catch {
      return res.status(400).json({ ok: false, error: "invalid_url" });
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return res.status(400).json({ ok: false, error: "invalid_protocol" });
    }
    try {
      const upstream = await safeImageFetch(parsedUrl.toString(), {
        maxBytes: COVER_MAX_BYTES,
        timeoutMs: 15_000,
        maxRedirects: 5,
        acceptHeader: "image/*",
      });
      if (upstream.status < 200 || upstream.status >= 300) {
        return res
          .status(502)
          .json({ ok: false, error: "upstream_failed", status: upstream.status });
      }
      const contentType = (upstream.headers["content-type"] || "")
        .toLowerCase()
        .split(";")[0]
        .trim();
      if (!contentType.startsWith("image/")) {
        return res.status(415).json({ ok: false, error: "not_an_image", contentType });
      }
      if (upstream.body.byteLength > COVER_MAX_BYTES) {
        return res.status(413).json({ ok: false, error: "upload_too_large" });
      }
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, no-store");
      res.end(upstream.body);
    } catch (err) {
      if (err instanceof SafeFetchError) {
        return res.status(err.status).json({ ok: false, error: err.code });
      }
      const msg = (err as Error)?.message || "fetch_failed";
      res.status(502).json({ ok: false, error: "fetch_failed", message: msg });
    }
  });

  app.get("/api/admin/broadcasts", requireRootAdmin, async (_req, res) => {
    const rows = await broadcastCompositorService.listBroadcasts();
    res.json({ ok: true, broadcasts: rows });
  });

  app.post("/api/admin/broadcasts/render", requireRootAdmin, async (req: any, res) => {
    const parsed = RenderBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    }
    const actorId =
      req.session?.adminActorId ||
      req.session?.userId ||
      "root_admin";
    const sources: BroadcastSourceItem[] = parsed.data.sources.map((source) => ({
      ...source,
      url: source.url ?? null,
      attribution: source.attribution ?? null,
      tier: source.tier ?? null,
    }));
    const input: BroadcastRenderInput = {
      ...parsed.data,
      brollPlanId: parsed.data.brollPlanId ?? null,
      anchorVideoUrl: parsed.data.anchorVideoUrl ?? null,
      backgroundImageUrl: parsed.data.backgroundImageUrl ?? null,
      backgroundAttribution: parsed.data.backgroundAttribution ?? null,
      speakerName: parsed.data.speakerName ?? null,
      speakerRole: parsed.data.speakerRole ?? null,
      sources,
      title: parsed.data.title ?? null,
      coverImageUrl: parsed.data.coverImageUrl ?? null,
      founderApprovalFlag: parsed.data.founderApprovalFlag ?? null,
      actorId,
    };
    // Defence-in-depth: even though the schema doesn't accept it, scrub any
    // attempt to inject the field through a typo or older client.
    delete (input as unknown as Record<string, unknown>).packageApproved;
    try {
      const result = await broadcastCompositorService.renderBroadcast(input);
      res.json({
        ok: true,
        broadcast: result.broadcast,
        previewUrl: `/api/admin/broadcasts/${result.broadcast.id}/preview`,
        manifestUrl: `/api/admin/broadcasts/${result.broadcast.id}/manifest`,
      });
    } catch (err) {
      if (err instanceof BroadcastSafetyError) {
        return res.status(err.status).json({ ok: false, error: err.code, message: err.message });
      }
      console.error("[broadcasts] render failed", err);
      res.status(500).json({ ok: false, error: "render_failed", message: (err as Error).message });
    }
  });

  app.patch("/api/admin/broadcasts/:id", requireRootAdmin, async (req, res, next) => {
    const id = String(req.params.id || "");
    // T322 — Forward reserved sub-route names (registered later in this
    // file) so they aren't accidentally treated as broadcast ids. See
    // RESERVED_BROADCAST_SUBROUTE_NAMES for the full list and rationale.
    if (RESERVED_BROADCAST_SUBROUTE_NAMES.has(id)) return next();
    const parsed = UpdateBroadcastBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    }
    const row = await broadcastCompositorService.updateBroadcastMeta(id, parsed.data);
    if (!row) return res.status(404).json({ ok: false, error: "not_found" });
    // If the cover was explicitly cleared, remove any stored cover file too.
    const clearingCover =
      parsed.data.coverImageUrl !== undefined &&
      (parsed.data.coverImageUrl === null || parsed.data.coverImageUrl.trim() === "");
    if (clearingCover && /^[a-zA-Z0-9_-]+$/.test(id)) {
      deleteCoverFilesFor(id);
    }
    res.json({ ok: true, broadcast: row });
  });

  app.delete("/api/admin/broadcasts/:id", requireRootAdmin, async (req, res, next) => {
    const id = String(req.params.id || "");
    // T322 — Forward reserved sub-route names (registered later in this
    // file) so they aren't accidentally treated as broadcast ids and 5xx'd
    // by the delete-broadcast handler. Without this guard, e.g.
    // `DELETE /api/admin/broadcasts/fallback-default-preset` would match
    // this `:id` route first and never reach its real handler. See
    // RESERVED_BROADCAST_SUBROUTE_NAMES for the full list and rationale.
    if (RESERVED_BROADCAST_SUBROUTE_NAMES.has(id)) return next();
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 120) {
      return res.status(400).json({ ok: false, error: "invalid_id" });
    }
    const row = await broadcastCompositorService.deleteBroadcast(id);
    if (!row) return res.status(404).json({ ok: false, error: "not_found" });
    // Best-effort filesystem cleanup. DB row is already gone; FK cascades
    // handle dependent rows (shorts, broadcast_events).
    const coversRemoved = deleteCoverFilesFor(id);
    let mp4Removed = false;
    let manifestRemoved = false;
    try {
      if (row.mp4Path && ensureInsidePrivateRoot(row.mp4Path) && existsSync(row.mp4Path)) {
        unlinkSync(row.mp4Path);
        mp4Removed = true;
      }
    } catch (err) {
      console.warn(`[broadcasts] mp4 cleanup failed for ${id}: ${(err as Error).message}`);
    }
    try {
      if (row.manifestPath && ensureInsidePrivateRoot(row.manifestPath) && existsSync(row.manifestPath)) {
        unlinkSync(row.manifestPath);
        manifestRemoved = true;
      }
    } catch (err) {
      console.warn(`[broadcasts] manifest cleanup failed for ${id}: ${(err as Error).message}`);
    }
    res.json({ ok: true, deleted: { id, coversRemoved, mp4Removed, manifestRemoved } });
  });

  // Reconcile orphaned cover files against the broadcasts table. Returns the
  // list of files that have no matching broadcast row, optionally deleting
  // them when `?apply=1` is supplied.
  //
  // To prevent accidental destructive sweeps, `apply=1` requires the caller
  // to echo back the `confirmToken` returned by an earlier dry-run. The token
  // commits to the exact orphan set and an issue time; the server re-verifies
  // the orphan list is unchanged before deleting anything.
  //
  // Every sweep (dry-run or apply) is appended to the cover-sweep audit log
  // so founders can later answer "why is this cover missing?".
  app.post("/api/admin/broadcasts/covers/sweep", requireRootAdmin, async (req: any, res) => {
    const apply = String(req.query.apply ?? "") === "1";
    const dir = coversDir();
    const actorId =
      req.session?.adminActorId ||
      req.session?.userId ||
      "root_admin";
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (err) {
      return res
        .status(500)
        .json({ ok: false, error: "read_dir_failed", message: (err as Error).message });
    }
    const knownIds = new Set(await broadcastCompositorService.listBroadcastIds());
    const orphans: { file: string; id: string; ext: string; bytes: number }[] = [];
    let orphanBytes = 0;
    for (const name of entries) {
      const ext = extname(name).slice(1).toLowerCase();
      if (!COVER_EXT_TO_MIME[ext]) continue;
      const id = name.slice(0, -(ext.length + 1));
      if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) continue;
      if (knownIds.has(id)) continue;
      let bytes = 0;
      try {
        const st = statSync(resolve(dir, name));
        if (st.isFile()) bytes = st.size;
      } catch {
        /* file vanished between readdir and stat; treat as 0 bytes */
      }
      orphanBytes += bytes;
      orphans.push({ file: name, id, ext, bytes });
    }
    const currentHash = hashOrphanFileList(orphans.map((o) => o.file));
    const issueToken = () => `${Date.now()}.${currentHash}`;
    if (!apply) {
      const dryAudit: CoverSweepAuditEntry = {
        id: randomUUID(),
        ts: new Date().toISOString(),
        actorId,
        mode: "dry_run",
        dir,
        orphans,
        removed: [],
        errors: [],
      };
      appendCoverSweepAudit(dryAudit);
      return res.json({
        ok: true,
        dryRun: true,
        orphanCount: orphans.length,
        orphanBytes,
        removed: 0,
        orphans,
        confirmToken: issueToken(),
        confirmTokenTtlMs: COVER_SWEEP_TOKEN_TTL_MS,
        auditId: dryAudit.id,
      });
    }
    const rawToken =
      typeof req.body?.confirmToken === "string" ? req.body.confirmToken.trim() : "";
    if (!rawToken) {
      return res.status(400).json({
        ok: false,
        error: "missing_confirm_token",
        message:
          "apply=1 requires a confirmToken in the request body. Run a dry-run first and echo back its confirmToken.",
        orphanCount: orphans.length,
        orphans,
        confirmToken: issueToken(),
        confirmTokenTtlMs: COVER_SWEEP_TOKEN_TTL_MS,
      });
    }
    const parsed = parseCoverSweepToken(rawToken);
    if (!parsed) {
      return res.status(400).json({
        ok: false,
        error: "invalid_confirm_token",
        message: "confirmToken is malformed.",
        orphanCount: orphans.length,
        orphans,
        confirmToken: issueToken(),
        confirmTokenTtlMs: COVER_SWEEP_TOKEN_TTL_MS,
      });
    }
    if (Date.now() - parsed.issuedAt > COVER_SWEEP_TOKEN_TTL_MS) {
      return res.status(400).json({
        ok: false,
        error: "expired_confirm_token",
        message: "confirmToken has expired. Re-run the dry-run and try again.",
        orphanCount: orphans.length,
        orphans,
        confirmToken: issueToken(),
        confirmTokenTtlMs: COVER_SWEEP_TOKEN_TTL_MS,
      });
    }
    if (parsed.hash !== currentHash) {
      return res.status(409).json({
        ok: false,
        error: "orphan_set_changed",
        message:
          "The orphan file list has changed since the dry-run. Re-scan and confirm the new list before deleting.",
        orphanCount: orphans.length,
        orphans,
        confirmToken: issueToken(),
        confirmTokenTtlMs: COVER_SWEEP_TOKEN_TTL_MS,
      });
    }
    let removed = 0;
    const removedFiles: string[] = [];
    const errors: { file: string; message: string }[] = [];
    const auditId = randomUUID();
    // Move-aside trash directory specific to this sweep run. Files are moved
    // here instead of unlinked so the founder dashboard can restore them
    // later from the audit trail. The trash root lives under coversDir as
    // ".trash" — that subdir is ignored by the orphan scan because it has no
    // allowed-extension suffix.
    let trashRunDir: string | null = null;
    try {
      trashRunDir = resolve(coversTrashDir(), auditId);
      mkdirSync(trashRunDir, { recursive: true });
    } catch (err) {
      console.warn(
        `[broadcasts] cover sweep trash dir unavailable (${(err as Error).message}); falling back to permanent delete.`,
      );
      trashRunDir = null;
    }
    for (const o of orphans) {
      const abs = resolve(dir, o.file);
      if (basename(abs) !== o.file) {
        errors.push({ file: o.file, message: "unsafe_basename" });
        continue;
      }
      if (!abs.startsWith(dir + "/")) {
        errors.push({ file: o.file, message: "outside_root" });
        continue;
      }
      try {
        if (trashRunDir) {
          const dest = resolve(trashRunDir, o.file);
          if (basename(dest) !== o.file || !dest.startsWith(trashRunDir + "/")) {
            errors.push({ file: o.file, message: "unsafe_trash_path" });
            continue;
          }
          renameSync(abs, dest);
        } else {
          unlinkSync(abs);
        }
        removed += 1;
        removedFiles.push(o.file);
      } catch (err) {
        errors.push({ file: o.file, message: (err as Error).message || "unlink_failed" });
      }
    }
    const auditEntry: CoverSweepAuditEntry = {
      id: auditId,
      ts: new Date().toISOString(),
      actorId,
      mode: "apply",
      dir,
      orphans,
      removed: removedFiles,
      errors,
      trashDir: trashRunDir ? `.trash/${auditId}` : undefined,
    };
    appendCoverSweepAudit(auditEntry);
    res.json({
      ok: true,
      dryRun: false,
      orphanCount: orphans.length,
      orphanBytes,
      removed,
      orphans,
      removedFiles,
      errors,
      auditId: auditEntry.id,
    });
  });

  // Returns the most recent cover-sweep audit entries (newest first). Used by
  // the admin dashboard to explain why a cover file is missing and to drive
  // the per-file Restore action. For each "apply" entry we also report which
  // of its removed files are still recoverable from the move-aside trash dir.
  app.get("/api/admin/broadcasts/covers/sweep/audit", requireRootAdmin, async (req, res) => {
    const rawLimit = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(500, Math.max(1, Math.floor(rawLimit)))
      : 50;
    const entries = readCoverSweepAudit(limit);
    const stats = coverSweepAuditStats();
    const maxBytes = coverSweepAuditMaxBytes();
    const maxArchives = coverSweepAuditMaxArchives();
    const root = coversDir();
    const decorated = entries.map((e) => {
      if (e.mode !== "apply" || !e.trashDir || !e.removed.length) {
        return { ...e, restorableFiles: [] as string[] };
      }
      const trashAbs = resolve(root, e.trashDir);
      // Defence-in-depth: trashDir must stay inside the covers root.
      if (!trashAbs.startsWith(root + "/")) {
        return { ...e, restorableFiles: [] as string[] };
      }
      const restorable: string[] = [];
      for (const f of e.removed) {
        if (basename(f) !== f) continue;
        const p = resolve(trashAbs, f);
        if (!p.startsWith(trashAbs + "/")) continue;
        // Skip if a file with this name is already live in the covers dir —
        // restoring would collide and would be rejected anyway.
        const liveExists = existsSync(resolve(root, f));
        if (liveExists) continue;
        if (existsSync(p)) restorable.push(f);
      }
      return { ...e, restorableFiles: restorable };
    });
    res.json({
      ok: true,
      count: decorated.length,
      entries: decorated,
      stats: {
        ...stats,
        maxBytes,
        maxArchives,
      },
    });
  });

  // Download the active cover-sweep audit JSONL file. Used by the
  // Cover File Sweep panel's "Export audit" button so admins can grab a
  // copy of recent runs without SSHing into the box. Only the active
  // file is exported; rotated archives stay on disk.
  app.get(
    "/api/admin/broadcasts/covers/sweep/audit/download",
    requireRootAdmin,
    async (_req, res) => {
      let p: string;
      try {
        p = coverSweepAuditPath();
      } catch {
        return res.status(500).json({ ok: false, error: "audit_path_unavailable" });
      }
      if (!existsSync(p)) {
        return res.status(404).json({ ok: false, error: "audit_empty" });
      }
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="broadcast-cover-sweep.jsonl"`,
      );
      const stream = createReadStream(p);
      stream.on("error", (err) => {
        if (!res.headersSent) {
          res.status(500).json({ ok: false, error: (err as Error).message });
        } else {
          res.end();
        }
      });
      stream.pipe(res);
    },
  );

  // Restore a single cover file that a previous sweep moved to the trash.
  // Moves the file from .trash/<auditId>/<file> back to covers/<file> and
  // appends a "restore" audit entry referencing the original apply run.
  app.post(
    "/api/admin/broadcasts/covers/sweep/restore",
    requireRootAdmin,
    async (req: any, res) => {
      const schema = z.object({
        auditId: z.string().min(1).max(120),
        file: z.string().min(1).max(200),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
      }
      const { auditId, file } = parsed.data;
      if (basename(file) !== file || file.startsWith(".")) {
        return res.status(400).json({ ok: false, error: "unsafe_file" });
      }
      const ext = extname(file).slice(1).toLowerCase();
      if (!COVER_EXT_TO_MIME[ext]) {
        return res.status(400).json({ ok: false, error: "invalid_ext" });
      }
      const baseId = file.slice(0, -(ext.length + 1));
      if (!baseId || !/^[a-zA-Z0-9_-]+$/.test(baseId)) {
        return res.status(400).json({ ok: false, error: "unsafe_file" });
      }
      // Find the matching apply entry. Scan a generous window so restores
      // are still possible for older sweeps.
      const entries = readCoverSweepAudit(500);
      const applyEntry = entries.find(
        (e) => e.id === auditId && e.mode === "apply" && Array.isArray(e.removed),
      );
      if (!applyEntry) {
        return res.status(404).json({ ok: false, error: "audit_not_found" });
      }
      if (!applyEntry.removed.includes(file)) {
        return res.status(404).json({ ok: false, error: "file_not_in_audit" });
      }
      if (!applyEntry.trashDir) {
        return res.status(410).json({ ok: false, error: "not_restorable" });
      }
      const root = coversDir();
      const trashAbs = resolve(root, applyEntry.trashDir);
      if (!trashAbs.startsWith(root + "/")) {
        return res.status(400).json({ ok: false, error: "unsafe_trash_path" });
      }
      const src = resolve(trashAbs, file);
      if (basename(src) !== file || !src.startsWith(trashAbs + "/")) {
        return res.status(400).json({ ok: false, error: "unsafe_trash_path" });
      }
      const dest = resolve(root, file);
      if (basename(dest) !== file || !dest.startsWith(root + "/")) {
        return res.status(400).json({ ok: false, error: "unsafe_dest" });
      }
      // Destination check first so a repeated restore is reported as a
      // collision rather than "trash file missing" (which would be true,
      // but misleading — the file is already back in place).
      if (existsSync(dest)) {
        return res.status(409).json({ ok: false, error: "destination_exists" });
      }
      if (!existsSync(src)) {
        return res.status(410).json({ ok: false, error: "trash_file_missing" });
      }
      try {
        renameSync(src, dest);
      } catch (err) {
        return res
          .status(500)
          .json({ ok: false, error: "restore_failed", message: (err as Error).message });
      }
      const actorId =
        req.session?.adminActorId || req.session?.userId || "root_admin";
      const restoreEntry: CoverSweepAuditEntry = {
        id: randomUUID(),
        ts: new Date().toISOString(),
        actorId,
        mode: "restore",
        dir: root,
        orphans: [],
        removed: [],
        errors: [],
        restoredFrom: auditId,
        restored: [file],
      };
      appendCoverSweepAudit(restoreEntry);
      res.json({ ok: true, restored: file, auditId: restoreEntry.id });
    },
  );

  // Bulk restore: walk every file in a given apply audit entry that is still
  // restorable and move it back into the covers directory. Reports per-file
  // outcomes ("restored" | "destination_exists" | "trash_file_missing" |
  // "unsafe_file" | "rename_failed") and writes a single "restore" audit
  // entry summarising the run.
  app.post(
    "/api/admin/broadcasts/covers/sweep/restore-all",
    requireRootAdmin,
    async (req: any, res) => {
      const schema = z.object({ auditId: z.string().min(1).max(120) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
      }
      const { auditId } = parsed.data;
      const entries = readCoverSweepAudit(500);
      const applyEntry = entries.find(
        (e) => e.id === auditId && e.mode === "apply" && Array.isArray(e.removed),
      );
      if (!applyEntry) {
        return res.status(404).json({ ok: false, error: "audit_not_found" });
      }
      if (!applyEntry.trashDir) {
        return res.status(410).json({ ok: false, error: "not_restorable" });
      }
      const root = coversDir();
      const trashAbs = resolve(root, applyEntry.trashDir);
      if (!trashAbs.startsWith(root + "/")) {
        return res.status(400).json({ ok: false, error: "unsafe_trash_path" });
      }
      const results: { file: string; status: string; message?: string }[] = [];
      const restored: string[] = [];
      for (const file of applyEntry.removed) {
        if (basename(file) !== file || file.startsWith(".")) {
          results.push({ file, status: "unsafe_file" });
          continue;
        }
        const ext = extname(file).slice(1).toLowerCase();
        if (!COVER_EXT_TO_MIME[ext]) {
          results.push({ file, status: "unsafe_file" });
          continue;
        }
        const baseId = file.slice(0, -(ext.length + 1));
        if (!baseId || !/^[a-zA-Z0-9_-]+$/.test(baseId)) {
          results.push({ file, status: "unsafe_file" });
          continue;
        }
        const src = resolve(trashAbs, file);
        if (basename(src) !== file || !src.startsWith(trashAbs + "/")) {
          results.push({ file, status: "unsafe_file" });
          continue;
        }
        const dest = resolve(root, file);
        if (basename(dest) !== file || !dest.startsWith(root + "/")) {
          results.push({ file, status: "unsafe_file" });
          continue;
        }
        if (existsSync(dest)) {
          results.push({ file, status: "destination_exists" });
          continue;
        }
        if (!existsSync(src)) {
          results.push({ file, status: "trash_file_missing" });
          continue;
        }
        try {
          renameSync(src, dest);
          results.push({ file, status: "restored" });
          restored.push(file);
        } catch (err) {
          results.push({
            file,
            status: "rename_failed",
            message: (err as Error).message,
          });
        }
      }
      const actorId =
        req.session?.adminActorId || req.session?.userId || "root_admin";
      const restoreEntry: CoverSweepAuditEntry = {
        id: randomUUID(),
        ts: new Date().toISOString(),
        actorId,
        mode: "restore",
        dir: root,
        orphans: [],
        removed: [],
        errors: results
          .filter((r) => r.status !== "restored")
          .map((r) => ({ file: r.file, message: r.message || r.status })),
        restoredFrom: auditId,
        restored,
      };
      appendCoverSweepAudit(restoreEntry);
      res.json({
        ok: true,
        auditId: restoreEntry.id,
        attempted: applyEntry.removed.length,
        restored: restored.length,
        results,
      });
    },
  );

  // Reconcile orphaned broadcast MP4s and JSON manifests against the
  // broadcasts table. Files in PRIVATE_OBJECT_DIR/broadcasts/ whose
  // basename is not referenced by any row's mp4Path/manifestPath are
  // listed. With ?apply=1 they are deleted. Cover images are handled
  // by /covers/sweep above; this route ignores any non-mp4 / non-
  // manifest entries.
  app.post("/api/admin/broadcasts/media/sweep", requireRootAdmin, async (req: any, res) => {
    const apply = String(req.query.apply ?? "") === "1";
    const actorId =
      req.session?.adminActorId ||
      req.session?.userId ||
      "root_admin";
    // Dry-run first to get the current orphan set; used to compute the
    // confirm-token hash and (on apply) to validate the caller's token
    // before re-invoking the service with apply=true.
    const dryResult = await runMediaSweep(false);
    if (!dryResult.ok) {
      return res.status(500).json(dryResult);
    }
    if (!("orphans" in dryResult)) {
      // Defensive: a non-orphan-bearing success would be a service bug.
      return res.status(500).json({ ok: false, error: "unexpected_sweep_shape" });
    }
    const orphans = dryResult.orphans;
    const currentHash = hashOrphanFileList(orphans.map((o) => o.file));
    const issueToken = () => `${Date.now()}.${currentHash}`;
    if (!apply) {
      return res.json({
        ok: true,
        dryRun: true,
        orphanCount: orphans.length,
        removed: 0,
        bytesRemoved: 0,
        orphans,
        confirmToken: issueToken(),
        confirmTokenTtlMs: COVER_SWEEP_TOKEN_TTL_MS,
      });
    }
    const rawToken =
      typeof req.body?.confirmToken === "string" ? req.body.confirmToken.trim() : "";
    if (!rawToken) {
      return res.status(400).json({
        ok: false,
        error: "missing_confirm_token",
        message:
          "apply=1 requires a confirmToken in the request body. Run a dry-run first and echo back its confirmToken.",
        orphanCount: orphans.length,
        orphans,
        confirmToken: issueToken(),
        confirmTokenTtlMs: COVER_SWEEP_TOKEN_TTL_MS,
      });
    }
    const parsed = parseCoverSweepToken(rawToken);
    if (!parsed) {
      return res.status(400).json({
        ok: false,
        error: "invalid_confirm_token",
        message: "confirmToken is malformed.",
        orphanCount: orphans.length,
        orphans,
        confirmToken: issueToken(),
        confirmTokenTtlMs: COVER_SWEEP_TOKEN_TTL_MS,
      });
    }
    if (Date.now() - parsed.issuedAt > COVER_SWEEP_TOKEN_TTL_MS) {
      return res.status(400).json({
        ok: false,
        error: "expired_confirm_token",
        message: "confirmToken has expired. Re-run the dry-run and try again.",
        orphanCount: orphans.length,
        orphans,
        confirmToken: issueToken(),
        confirmTokenTtlMs: COVER_SWEEP_TOKEN_TTL_MS,
      });
    }
    if (parsed.hash !== currentHash) {
      return res.status(409).json({
        ok: false,
        error: "orphan_set_changed",
        message:
          "The orphan file list has changed since the dry-run. Re-scan and confirm the new list before deleting.",
        orphanCount: orphans.length,
        orphans,
        confirmToken: issueToken(),
        confirmTokenTtlMs: COVER_SWEEP_TOKEN_TTL_MS,
      });
    }
    // Delegate the actual deletion to the shared service, which re-lists
    // the orphan set and re-verifies the hash atomically before unlinking.
    const applyResult = await runMediaSweep(true, { expectedHash: parsed.hash });
    if (!applyResult.ok) {
      if (isMediaSweepHashMismatch(applyResult)) {
        return res.status(409).json({
          ok: false,
          error: "orphan_set_changed",
          message:
            "The orphan file list changed between confirmation and deletion. Re-scan and try again.",
          orphanCount: applyResult.orphanCount,
          orphans: applyResult.orphans,
          confirmToken: `${Date.now()}.${applyResult.currentHash}`,
          confirmTokenTtlMs: COVER_SWEEP_TOKEN_TTL_MS,
        });
      }
      return res.status(500).json(applyResult);
    }
    // Audit every confirmed apply so founders can answer "who deleted these
    // render files?" without scraping server logs. Dry-runs are not audited
    // here because they are non-destructive and would dominate the log.
    const auditEntry: MediaSweepAuditEntry = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      actorId,
      mode: "apply",
      orphanCount: applyResult.orphanCount,
      removed: applyResult.removed,
      bytesRemoved: applyResult.bytesRemoved,
      orphans: applyResult.orphans,
    };
    appendMediaSweepAudit(auditEntry);
    res.json({ ...applyResult, auditId: auditEntry.id });
  });

  // History of recent scheduled-sweep runs, parsed from the production-house
  // audit log. Used by the "Scheduled cleanup history" panel so admins can
  // see at a glance whether the background sweep is finding/removing files
  // and surface any failed runs without spelunking through the full audit
  // log.
  app.get(
    "/api/admin/broadcasts/sweep/history",
    requireRootAdmin,
    async (req, res) => {
      const limitRaw = Number(req.query.limit);
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 200
          ? Math.floor(limitRaw)
          : 20;
      // Scan a generous window of audit entries so we can return `limit`
      // sweep rows even when interleaved with other audit traffic.
      const all = listAudit(2000);
      const entries = all
        .filter((a) => a.action.startsWith("broadcasts.sweep."))
        .slice(-limit)
        .reverse()
        .map((a) => {
          const action = a.action;
          let kind: "covers" | "media" | "error" = "error";
          if (action.startsWith("broadcasts.sweep.covers")) kind = "covers";
          else if (action.startsWith("broadcasts.sweep.media")) kind = "media";
          const failed = action.endsWith(".failed") || action === "broadcasts.sweep.error";
          const parsed = parseSweepDetail(a.detail);
          return {
            id: a.id,
            at: a.at,
            actor: a.actor,
            action,
            kind,
            failed,
            orphanCount: parsed.orphanCount,
            removed: parsed.removed,
            bytesRemoved: parsed.bytesRemoved,
            dryRun: parsed.dryRun,
            errorMessage: failed ? a.detail : null,
            detail: a.detail,
          };
        });
      res.json({ ok: true, entries });
    },
  );

  // Returns the most recent media-sweep audit entries (newest first). Used by
  // the admin dashboard to explain why a rendered MP4/manifest is missing.
  // T359 — `stats` (including rotated `archives`) mirrors the cover-sweep
  // audit response so the panel can render the per-archive Inspect dialog.
  app.get("/api/admin/broadcasts/media/sweep/audit", requireRootAdmin, async (req, res) => {
    const rawLimit = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(500, Math.max(1, Math.floor(rawLimit)))
      : 50;
    const entries = readMediaSweepAudit(limit);
    const stats = mediaSweepAuditStats();
    const maxBytes = mediaSweepAuditMaxBytes();
    const maxArchives = mediaSweepAuditMaxArchives();
    res.json({
      ok: true,
      count: entries.length,
      entries,
      stats: { ...stats, maxBytes, maxArchives },
    });
  });

  // T359 — Founder-gated preview of a rotated cover-sweep / media-sweep audit
  // archive. Mirrors `/fallback-default-preset-audit/archives/:n/preview` so
  // admins can search inside the JSONL (actor + date filters, pagination)
  // without downloading the whole archive. Factored into a shared helper
  // because both surfaces only differ in path-helper, regex and entry shape.
  type SweepArchivePreviewEntry = {
    id: string | null;
    ts: string | null;
    actorId: string;
    mode: string | null;
    raw: Record<string, unknown>;
  };
  type SweepArchivePreviewActor = { actorId: string; displayName: string };
  async function handleSweepArchivePreview(
    req: any,
    res: any,
    opts: {
      label: string;
      pathFn: () => string;
      archiveSuffixRe: RegExp;
    },
  ) {
    const actor = actorFromReq(req);
    if (!actor) return res.status(401).json({ ok: false, error: "unauthorized" });
    if (!actor.isFounder) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: `Only a founder can preview ${opts.label} audit archives.`,
      });
    }
    const rawName = String(req.params.archiveName ?? "");
    if (!opts.archiveSuffixRe.test(rawName)) {
      return res.status(400).json({
        ok: false,
        error: "invalid_archive_name",
        message: "That archive name is not a recognized rotated audit file.",
      });
    }
    let activePath: string;
    try {
      activePath = opts.pathFn();
    } catch {
      return res.status(404).json({
        ok: false,
        error: "no_audit_dir",
        message: "No audit directory exists yet.",
      });
    }
    const dir = dirname(activePath);
    const target = resolve(dir, rawName);
    if (dirname(target) !== dir) {
      return res.status(400).json({
        ok: false,
        error: "invalid_archive_name",
        message: "Archive name resolved outside the audit directory.",
      });
    }
    if (!existsSync(target)) {
      return res.status(404).json({
        ok: false,
        error: "archive_not_found",
        message: "That archive no longer exists (already deleted?).",
      });
    }
    let raw: string;
    try {
      raw = readFileSync(target, "utf8");
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: "read_failed",
        message: (err as Error).message,
      });
    }

    const PREVIEW_LIMIT_DEFAULT = 50;
    const PREVIEW_LIMIT_MAX = 200;
    const limitRaw = Number(req.query.limit);
    const offsetRaw = Number(req.query.offset);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(PREVIEW_LIMIT_MAX, Math.floor(limitRaw)))
      : PREVIEW_LIMIT_DEFAULT;
    const offset = Number.isFinite(offsetRaw)
      ? Math.max(0, Math.floor(offsetRaw))
      : 0;
    const actorIdFilter =
      typeof req.query.actorId === "string" &&
      req.query.actorId.trim().length > 0
        ? String(req.query.actorId).trim()
        : null;
    const parseTsParam = (v: unknown): number | null => {
      if (typeof v !== "string" || v.trim().length === 0) return null;
      const n = Date.parse(v.trim());
      return Number.isFinite(n) ? n : null;
    };
    const fromMs = parseTsParam(req.query.from);
    const toMs = parseTsParam(req.query.to);

    const lines = raw.split("\n");
    let totalLines = 0;
    let corruptLines = 0;
    const parsedAll: Record<string, unknown>[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      totalLines += 1;
      try {
        parsedAll.push(JSON.parse(trimmed) as Record<string, unknown>);
      } catch {
        corruptLines += 1;
      }
    }
    parsedAll.reverse();

    const distinctActors = new Map<string, string>();
    for (const e of parsedAll) {
      const id = typeof e.actorId === "string" ? e.actorId : "unknown";
      if (!distinctActors.has(id)) distinctActors.set(id, id);
    }

    const dateRangeActive = fromMs !== null || toMs !== null;
    const inRange = (e: Record<string, unknown>) => {
      if (!dateRangeActive) return true;
      const tsRaw = typeof e.ts === "string" ? e.ts : null;
      const t = tsRaw ? Date.parse(tsRaw) : NaN;
      if (!Number.isFinite(t)) return false;
      if (fromMs !== null && t < fromMs) return false;
      if (toMs !== null && t > toMs) return false;
      return true;
    };
    let parsed = parsedAll;
    if (dateRangeActive) parsed = parsed.filter(inRange);
    if (actorIdFilter)
      parsed = parsed.filter(
        (e) => (typeof e.actorId === "string" ? e.actorId : "unknown") === actorIdFilter,
      );
    const matchedEntries = parsed.length;
    const slice = parsed.slice(offset, offset + limit);

    // Best-effort staff resolution for actorIds that look like staff rows.
    // Cover/media-sweep entries store only `actorId` (no actorType), so we
    // attempt to resolve every distinct id against `adminStaff`.
    const candidateIds = new Set<string>();
    for (const id of distinctActors.keys()) {
      if (id && id !== "unknown" && id !== "root_admin") candidateIds.add(id);
    }
    const staffNames = new Map<string, string>();
    if (candidateIds.size > 0) {
      try {
        const rows = await db
          .select({ id: adminStaff.id, displayName: adminStaff.displayName })
          .from(adminStaff)
          .where(inArray(adminStaff.id, Array.from(candidateIds)));
        for (const r of rows) staffNames.set(r.id, r.displayName);
      } catch {
        /* best-effort actor resolution */
      }
    }
    const labelFor = (id: string): string => {
      if (id === "root_admin") return "Founder";
      if (staffNames.has(id)) return staffNames.get(id)!;
      const shortId = id.length > 10 ? `${id.slice(0, 8)}…` : id;
      return id === "unknown" ? "Unknown" : `Admin (${shortId})`;
    };

    const entries: SweepArchivePreviewEntry[] = slice.map((e) => ({
      id: typeof e.id === "string" ? e.id : null,
      ts: typeof e.ts === "string" ? e.ts : null,
      actorId: typeof e.actorId === "string" ? e.actorId : "unknown",
      mode: typeof e.mode === "string" ? e.mode : null,
      raw: e,
    }));

    const actors: SweepArchivePreviewActor[] = Array.from(distinctActors.keys())
      .map((id) => ({ actorId: id, displayName: labelFor(id) }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    let bytes = 0;
    try {
      bytes = statSync(target).size;
    } catch {
      /* best-effort */
    }

    res.json({
      ok: true,
      archiveName: rawName,
      bytes,
      totalEntries: totalLines,
      matchedEntries,
      corruptLines,
      previewLimit: limit,
      limit,
      offset,
      hasMore: offset + entries.length < matchedEntries,
      actorId: actorIdFilter,
      from: fromMs !== null ? new Date(fromMs).toISOString() : null,
      to: toMs !== null ? new Date(toMs).toISOString() : null,
      actors,
      entries,
    });
  }

  app.get(
    "/api/admin/broadcasts/covers/sweep/audit/archives/:archiveName/preview",
    requireRootAdmin,
    (req, res) =>
      handleSweepArchivePreview(req, res, {
        label: "cover-sweep",
        pathFn: coverSweepAuditPath,
        archiveSuffixRe: COVER_SWEEP_AUDIT_ARCHIVE_SUFFIX_RE,
      }),
  );

  app.get(
    "/api/admin/broadcasts/media/sweep/audit/archives/:archiveName/preview",
    requireRootAdmin,
    (req, res) =>
      handleSweepArchivePreview(req, res, {
        label: "media-sweep",
        pathFn: mediaSweepAuditPath,
        archiveSuffixRe: MEDIA_SWEEP_AUDIT_ARCHIVE_SUFFIX_RE,
      }),
  );

  // T364 — Founder-gated raw download of a rotated sweep audit archive
  // (cover-sweep or media-sweep). Mirrors the fallback-preset archive
  // download so founders can grab the raw JSONL for offline analysis or
  // to attach to a compliance ticket.
  function handleSweepArchiveDownload(
    req: any,
    res: any,
    cfg: {
      label: "cover-sweep" | "media-sweep";
      pathFn: () => string;
      archiveSuffixRe: RegExp;
    },
  ) {
    const actor = actorFromReq(req);
    if (!actor) return res.status(401).json({ ok: false, error: "unauthorized" });
    if (!actor.isFounder) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: `Only a founder can download ${cfg.label} audit archives.`,
      });
    }
    const rawName = String(req.params.archiveName ?? "");
    if (!cfg.archiveSuffixRe.test(rawName)) {
      return res.status(400).json({
        ok: false,
        error: "invalid_archive_name",
        message: "That archive name is not a recognized rotated audit file.",
      });
    }
    let activePath: string;
    try {
      activePath = cfg.pathFn();
    } catch {
      return res.status(404).json({
        ok: false,
        error: "no_audit_dir",
        message: "No audit directory exists yet.",
      });
    }
    const dir = dirname(activePath);
    const target = resolve(dir, rawName);
    if (dirname(target) !== dir) {
      return res.status(400).json({
        ok: false,
        error: "invalid_archive_name",
        message: "Archive name resolved outside the audit directory.",
      });
    }
    if (!existsSync(target)) {
      return res.status(404).json({
        ok: false,
        error: "archive_not_found",
        message: "That archive no longer exists (already deleted?).",
      });
    }
    let size = 0;
    try {
      size = statSync(target).size;
    } catch {
      /* fall through — Content-Length is optional */
    }
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${rawName}"`,
    );
    if (size > 0) res.setHeader("Content-Length", String(size));
    res.setHeader("Cache-Control", "no-store");
    const stream = createReadStream(target);
    stream.on("error", (err) => {
      if (!res.headersSent) {
        res.status(500).json({
          ok: false,
          error: "stream_failed",
          message: (err as Error).message,
        });
      } else {
        res.destroy(err);
      }
    });
    stream.pipe(res);
  }

  app.get(
    "/api/admin/broadcasts/covers/sweep/audit/archives/:archiveName",
    requireRootAdmin,
    (req, res) =>
      handleSweepArchiveDownload(req, res, {
        label: "cover-sweep",
        pathFn: coverSweepAuditPath,
        archiveSuffixRe: COVER_SWEEP_AUDIT_ARCHIVE_SUFFIX_RE,
      }),
  );

  app.get(
    "/api/admin/broadcasts/media/sweep/audit/archives/:archiveName",
    requireRootAdmin,
    (req, res) =>
      handleSweepArchiveDownload(req, res, {
        label: "media-sweep",
        pathFn: mediaSweepAuditPath,
        archiveSuffixRe: MEDIA_SWEEP_AUDIT_ARCHIVE_SUFFIX_RE,
      }),
  );

  // Status of the scheduled background sweep: when it last ran, the current
  // orphan count it saw, and the configurable alert threshold. The Cover
  // File Sweep panel uses this to show "last scheduled scan ran at …".
  app.get(
    "/api/admin/broadcasts/covers/sweep/status",
    requireRootAdmin,
    async (_req, res) => {
      const status = await coverOrphanAlertService.getStatus();
      // Surface the current rotated-archive count + active-file size so the
      // UI can warn admins before they shrink retention enough to immediately
      // prune existing history on the next rotation.
      let currentArchiveCount = 0;
      let activeAuditBytes: number | null = null;
      try {
        const auditPath = coverSweepAuditPath();
        const dir = dirname(auditPath);
        currentArchiveCount = listCoverSweepAuditArchives(dir).length;
        try {
          activeAuditBytes = statSync(auditPath).size;
        } catch {
          activeAuditBytes = 0;
        }
      } catch {
        /* best-effort — leave defaults */
      }
      res.json({
        ok: true,
        status: { ...status, currentArchiveCount, activeAuditBytes },
      });
    },
  );

  // Manually trigger the scheduled sweep + alert path. Same code path as the
  // background scheduler — useful right after admins clean up orphans so the
  // alert state catches up immediately instead of waiting up to 24h.
  app.post(
    "/api/admin/broadcasts/covers/sweep/run-now",
    requireRootAdmin,
    async (_req, res) => {
      try {
        const result = await coverOrphanAlertService.check();
        const status = await coverOrphanAlertService.getStatus();
        res.json({ ok: true, result, status });
      } catch (err) {
        res.status(500).json({
          ok: false,
          error: "sweep_failed",
          message: (err as Error).message,
        });
      }
    },
  );

  // History of recently auto-cleared cover sweep alerts so admins can audit
  // the sweep's behaviour (and spot flapping) without querying the DB.
  app.get(
    "/api/admin/broadcasts/covers/sweep/recent-auto-clears",
    requireRootAdmin,
    async (req, res) => {
      const raw = Number((req.query as any)?.limit);
      const limit = Number.isFinite(raw) && raw > 0 ? Math.min(50, Math.floor(raw)) : 10;
      const items = await coverOrphanAlertService.listRecentAutoResolved(limit);
      res.json({ ok: true, items });
    },
  );

  // Audit list of cover-sweep alerts that were auto-cleared and then
  // re-opened by an admin. Surfaced in CoverSweepPanel right under the
  // "Recent auto-clears" list so the audit loop stays in-panel (who
  // re-opened what, when, and what the original auto-clear time was).
  app.get(
    "/api/admin/broadcasts/covers/sweep/recent-auto-clears/reopened",
    requireRootAdmin,
    async (req, res) => {
      const raw = Number((req.query as any)?.limit);
      const limit = Number.isFinite(raw) && raw > 0 ? Math.min(50, Math.floor(raw)) : 10;
      const items = await coverOrphanAlertService.listRecentReopened(limit);
      res.json({ ok: true, items });
    },
  );

  // Re-open an auto-cleared cover-sweep alert. Used when an admin spots a
  // suspicious auto-clear in the audit list and wants the alert back on
  // the founder dashboard for human review. Records who re-opened it in
  // the alert's `details` so the audit trail stays intact.
  app.post(
    "/api/admin/broadcasts/covers/sweep/recent-auto-clears/:id/reopen",
    requireRootAdmin,
    async (req: any, res) => {
      const id = String(req.params.id || "");
      if (!id || id.length > 120) {
        return res.status(400).json({ ok: false, error: "invalid_id" });
      }
      const actorId =
        req.session?.adminActorId ||
        req.session?.userId ||
        "root_admin";
      try {
        const result = await coverOrphanAlertService.reopenAutoResolved(id, actorId);
        if (!result) {
          return res
            .status(404)
            .json({ ok: false, error: "not_found_or_not_auto_resolved" });
        }
        res.json({ ok: true, reopened: result });
      } catch (err) {
        res.status(500).json({
          ok: false,
          error: "reopen_failed",
          message: (err as Error).message,
        });
      }
    },
  );

  // Update the threshold at which the background sweep alerts founders.
  app.patch(
    "/api/admin/broadcasts/covers/sweep/threshold",
    requireRootAdmin,
    async (req: any, res) => {
      const raw = (req.body ?? {}) as { threshold?: unknown };
      const n = Number(raw.threshold);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
        return res.status(400).json({ ok: false, error: "invalid_threshold" });
      }
      try {
        const updatedBy =
          req.session?.adminActorId || req.session?.userId || "root_admin";
        const v = await coverOrphanAlertService.setThreshold(n, updatedBy);
        const status = await coverOrphanAlertService.getStatus();
        res.json({ ok: true, threshold: v, status });
      } catch (err) {
        res
          .status(400)
          .json({ ok: false, error: "update_failed", message: (err as Error).message });
      }
    },
  );

  // Task #804 — Update the flapping threshold (auto-clears within window
  // that flip the latch). Mirrors the production-asset orphan sweep route.
  app.patch(
    "/api/admin/broadcasts/covers/sweep/flapping-threshold",
    requireRootAdmin,
    async (req: any, res) => {
      const raw = (req.body ?? {}) as { value?: unknown };
      const n = Number(raw.value);
      if (!Number.isFinite(n)) {
        return res
          .status(400)
          .json({ ok: false, error: "invalid_flapping_threshold" });
      }
      try {
        const updatedBy =
          req.session?.adminActorId || req.session?.userId || "root_admin";
        const v = await coverOrphanAlertService.setFlappingThreshold(
          n,
          updatedBy,
        );
        const status = await coverOrphanAlertService.getStatus();
        res.json({ ok: true, value: v, status });
      } catch (err) {
        const message = (err as Error).message;
        res.status(400).json({
          ok: false,
          error: message || "update_failed",
        });
      }
    },
  );

  // Task #804 — Update the flapping window (how far back to count
  // recent auto-clears). Bounded 1m–90d. Mirrors the production-asset
  // orphan sweep route.
  app.patch(
    "/api/admin/broadcasts/covers/sweep/flapping-window-ms",
    requireRootAdmin,
    async (req: any, res) => {
      const raw = (req.body ?? {}) as { value?: unknown };
      const n = Number(raw.value);
      if (!Number.isFinite(n)) {
        return res
          .status(400)
          .json({ ok: false, error: "invalid_flapping_window_ms" });
      }
      try {
        const updatedBy =
          req.session?.adminActorId || req.session?.userId || "root_admin";
        const v = await coverOrphanAlertService.setFlappingWindowMs(
          n,
          updatedBy,
        );
        const status = await coverOrphanAlertService.getStatus();
        res.json({ ok: true, value: v, status });
      } catch (err) {
        const message = (err as Error).message;
        res.status(400).json({
          ok: false,
          error: message || "update_failed",
        });
      }
    },
  );

  // Task #837 — Acknowledge the cover-sweep flapping latch without
  // re-saving the threshold or window. Flips `wasFlapping=false` and
  // writes a fresh `lastReArmedAt` via the same helper used by the
  // threshold/window PATCH routes.
  app.post(
    "/api/admin/broadcasts/covers/sweep/flapping/rearm",
    requireRootAdmin,
    async (req: any, res) => {
      try {
        const updatedBy =
          req.session?.adminActorId || req.session?.userId || "root_admin";
        const ts = await coverOrphanAlertService.reArmFlapping(updatedBy);
        const status = await coverOrphanAlertService.getStatus();
        res.json({ ok: true, lastReArmedAt: ts, status });
      } catch (err) {
        res.status(500).json({
          ok: false,
          error: "rearm_failed",
          message: (err as Error).message,
        });
      }
    },
  );

  // Update the audit-log retention tuning (active file size + archive count).
  // Either or both fields may be supplied. Validation lives in the service;
  // out-of-range values surface as 400s so the admin UI can show a message.
  app.patch(
    "/api/admin/broadcasts/covers/sweep/audit-retention",
    requireRootAdmin,
    async (req: any, res) => {
      const body = (req.body ?? {}) as {
        maxBytes?: unknown;
        maxArchives?: unknown;
      };
      const updates: Array<"bytes" | "archives"> = [];
      const updatedBy =
        req.session?.adminActorId || req.session?.userId || "root_admin";
      try {
        if (body.maxBytes !== undefined && body.maxBytes !== null && body.maxBytes !== "") {
          const n = Number(body.maxBytes);
          if (!Number.isFinite(n)) {
            return res.status(400).json({ ok: false, error: "invalid_max_bytes" });
          }
          await coverOrphanAlertService.setAuditMaxBytes(n, updatedBy);
          updates.push("bytes");
        }
        if (
          body.maxArchives !== undefined &&
          body.maxArchives !== null &&
          body.maxArchives !== ""
        ) {
          const n = Number(body.maxArchives);
          if (!Number.isFinite(n)) {
            return res.status(400).json({ ok: false, error: "invalid_max_archives" });
          }
          await coverOrphanAlertService.setAuditMaxArchives(n, updatedBy);
          updates.push("archives");
        }
        if (updates.length === 0) {
          return res.status(400).json({ ok: false, error: "no_fields" });
        }
        const status = await coverOrphanAlertService.getStatus();
        res.json({ ok: true, updated: updates, status });
      } catch (err) {
        const message = (err as Error).message;
        const code = message === "out_of_range" ? 400 : 400;
        res.status(code).json({ ok: false, error: message || "update_failed" });
      }
    },
  );

  // Status of the scheduled live-broadcast alert: when it last scanned, the
  // current live (non-dry-run) broadcast count, and the configurable alert
  // threshold. Used by the Broadcast Compositor admin UI to surface server-
  // side detection state so admins know an alert path exists even when no
  // one is on the page.
  app.get(
    "/api/admin/broadcasts/live-alert/status",
    requireRootAdmin,
    async (_req, res) => {
      const status = await liveBroadcastAlertService.getStatus();
      res.json({ ok: true, status });
    },
  );

  // Manually trigger the live-broadcast scan + alert path. Same code path as
  // the background scheduler — useful after admins resolve a live broadcast
  // so the latch resets immediately instead of waiting for the next tick.
  app.post(
    "/api/admin/broadcasts/live-alert/run-now",
    requireRootAdmin,
    async (_req, res) => {
      try {
        const result = await liveBroadcastAlertService.check();
        const status = await liveBroadcastAlertService.getStatus();
        res.json({ ok: true, result, status });
      } catch (err) {
        res.status(500).json({
          ok: false,
          error: "scan_failed",
          message: (err as Error).message,
        });
      }
    },
  );

  // Update the server-side threshold at which live broadcasts alert admins.
  // Threshold of 0 means any live broadcast triggers the alert.
  app.patch(
    "/api/admin/broadcasts/live-alert/threshold",
    requireRootAdmin,
    async (req: any, res) => {
      const raw = (req.body ?? {}) as { threshold?: unknown };
      const n = Number(raw.threshold);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
        return res.status(400).json({ ok: false, error: "invalid_threshold" });
      }
      try {
        const updatedBy =
          req.session?.adminActorId || req.session?.userId || "root_admin";
        const v = await liveBroadcastAlertService.setThreshold(n, updatedBy);
        const status = await liveBroadcastAlertService.getStatus();
        res.json({ ok: true, threshold: v, status });
      } catch (err) {
        res
          .status(400)
          .json({ ok: false, error: "update_failed", message: (err as Error).message });
      }
    },
  );

  // Status of the scheduled background media sweep.
  app.get(
    "/api/admin/broadcasts/media/sweep/status",
    requireRootAdmin,
    async (_req, res) => {
      const status = await mediaOrphanAlertService.getStatus();
      // Surface the current rotated-archive count + active-file size so the
      // UI can warn admins before they shrink retention enough to immediately
      // prune existing history on the next rotation. Mirrors the cover-sweep
      // status payload.
      let currentArchiveCount = 0;
      let activeAuditBytes: number | null = null;
      try {
        const auditPath = mediaSweepAuditPath();
        const dir = dirname(auditPath);
        currentArchiveCount = listMediaSweepAuditArchives(dir).length;
        try {
          activeAuditBytes = statSync(auditPath).size;
        } catch {
          activeAuditBytes = 0;
        }
      } catch {
        /* best-effort — leave defaults */
      }
      res.json({
        ok: true,
        status: { ...status, currentArchiveCount, activeAuditBytes },
      });
    },
  );

  // Manually trigger the scheduled media sweep + alert path immediately.
  app.post(
    "/api/admin/broadcasts/media/sweep/run-now",
    requireRootAdmin,
    async (_req, res) => {
      try {
        const result = await mediaOrphanAlertService.check();
        const status = await mediaOrphanAlertService.getStatus();
        res.json({ ok: true, result, status });
      } catch (err) {
        res.status(500).json({
          ok: false,
          error: "sweep_failed",
          message: (err as Error).message,
        });
      }
    },
  );

  // Recent auto-cleared media-orphan alerts for the panel's flapping history.
  app.get(
    "/api/admin/broadcasts/media/sweep/recent-auto-clears",
    requireRootAdmin,
    async (req, res) => {
      const raw = Number((req.query as any)?.limit);
      const limit =
        Number.isFinite(raw) && raw > 0 ? Math.min(50, Math.floor(raw)) : 10;
      const items = await mediaOrphanAlertService.listRecentAutoResolved(limit);
      res.json({ ok: true, items });
    },
  );

  // Audit list of media-sweep alerts that were auto-cleared and then
  // re-opened by an admin. Mirrors the cover-sweep route so the Render
  // File Sweep panel can show a parallel "Recently re-opened" sub-section
  // (who re-opened what, when, and the original auto-clear time).
  app.get(
    "/api/admin/broadcasts/media/sweep/recent-auto-clears/reopened",
    requireRootAdmin,
    async (req, res) => {
      const raw = Number((req.query as any)?.limit);
      const limit =
        Number.isFinite(raw) && raw > 0 ? Math.min(50, Math.floor(raw)) : 10;
      const items = await mediaOrphanAlertService.listRecentReopened(limit);
      res.json({ ok: true, items });
    },
  );

  // Re-open an auto-cleared media-sweep alert so it reappears on the
  // founder dashboard as unacknowledged. Mirrors the cover-sweep route.
  app.post(
    "/api/admin/broadcasts/media/sweep/recent-auto-clears/:id/reopen",
    requireRootAdmin,
    async (req: any, res) => {
      const id = String(req.params.id || "");
      if (!id || id.length > 120) {
        return res.status(400).json({ ok: false, error: "invalid_id" });
      }
      const actorId =
        req.session?.adminActorId ||
        req.session?.userId ||
        "root_admin";
      try {
        const result = await mediaOrphanAlertService.reopenAutoResolved(
          id,
          actorId,
        );
        if (!result) {
          return res
            .status(404)
            .json({ ok: false, error: "not_found_or_not_auto_resolved" });
        }
        res.json({ ok: true, reopened: result });
      } catch (err) {
        res.status(500).json({
          ok: false,
          error: "reopen_failed",
          message: (err as Error).message,
        });
      }
    },
  );

  // Update the threshold at which the background media sweep alerts founders.
  app.patch(
    "/api/admin/broadcasts/media/sweep/threshold",
    requireRootAdmin,
    async (req: any, res) => {
      const raw = (req.body ?? {}) as { threshold?: unknown };
      const n = Number(raw.threshold);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
        return res.status(400).json({ ok: false, error: "invalid_threshold" });
      }
      try {
        const updatedBy =
          req.session?.adminActorId || req.session?.userId || "root_admin";
        const v = await mediaOrphanAlertService.setThreshold(n, updatedBy);
        const status = await mediaOrphanAlertService.getStatus();
        res.json({ ok: true, threshold: v, status });
      } catch (err) {
        res.status(400).json({
          ok: false,
          error: "update_failed",
          message: (err as Error).message,
        });
      }
    },
  );

  // Task #811 — Update the media-sweep flapping threshold (auto-clears
  // within window that flip the latch). Mirrors the cover-sweep +
  // production-asset orphan sweep flapping routes.
  app.patch(
    "/api/admin/broadcasts/media/sweep/flapping-threshold",
    requireRootAdmin,
    async (req: any, res) => {
      const raw = (req.body ?? {}) as { value?: unknown };
      const n = Number(raw.value);
      if (!Number.isFinite(n)) {
        return res
          .status(400)
          .json({ ok: false, error: "invalid_flapping_threshold" });
      }
      try {
        const updatedBy =
          req.session?.adminActorId || req.session?.userId || "root_admin";
        const v = await mediaOrphanAlertService.setFlappingThreshold(
          n,
          updatedBy,
        );
        const status = await mediaOrphanAlertService.getStatus();
        res.json({ ok: true, value: v, status });
      } catch (err) {
        const message = (err as Error).message;
        res.status(400).json({ ok: false, error: message || "update_failed" });
      }
    },
  );

  // Task #811 — Update the media-sweep flapping window (how far back to
  // count recent auto-clears). Bounded 1m–90d.
  app.patch(
    "/api/admin/broadcasts/media/sweep/flapping-window-ms",
    requireRootAdmin,
    async (req: any, res) => {
      const raw = (req.body ?? {}) as { value?: unknown };
      const n = Number(raw.value);
      if (!Number.isFinite(n)) {
        return res
          .status(400)
          .json({ ok: false, error: "invalid_flapping_window_ms" });
      }
      try {
        const updatedBy =
          req.session?.adminActorId || req.session?.userId || "root_admin";
        const v = await mediaOrphanAlertService.setFlappingWindowMs(
          n,
          updatedBy,
        );
        const status = await mediaOrphanAlertService.getStatus();
        res.json({ ok: true, value: v, status });
      } catch (err) {
        const message = (err as Error).message;
        res.status(400).json({ ok: false, error: message || "update_failed" });
      }
    },
  );

  // Task #837 — Acknowledge the media-sweep flapping latch without
  // re-saving the threshold or window. Mirrors the cover-sweep
  // re-arm route.
  app.post(
    "/api/admin/broadcasts/media/sweep/flapping/rearm",
    requireRootAdmin,
    async (req: any, res) => {
      try {
        const updatedBy =
          req.session?.adminActorId || req.session?.userId || "root_admin";
        const ts = await mediaOrphanAlertService.reArmFlapping(updatedBy);
        const status = await mediaOrphanAlertService.getStatus();
        res.json({ ok: true, lastReArmedAt: ts, status });
      } catch (err) {
        res.status(500).json({
          ok: false,
          error: "rearm_failed",
          message: (err as Error).message,
        });
      }
    },
  );

  // Update the media-sweep audit-log retention tuning (active file size +
  // archive count). Mirrors the cover-sweep audit-retention route. Either or
  // both fields may be supplied. Validation lives in the service; out-of-
  // range values surface as 400s so the admin UI can show a message.
  app.patch(
    "/api/admin/broadcasts/media/sweep/audit-retention",
    requireRootAdmin,
    async (req: any, res) => {
      const body = (req.body ?? {}) as {
        maxBytes?: unknown;
        maxArchives?: unknown;
      };
      const updates: Array<"bytes" | "archives"> = [];
      const updatedBy =
        req.session?.adminActorId || req.session?.userId || "root_admin";
      try {
        if (
          body.maxBytes !== undefined &&
          body.maxBytes !== null &&
          body.maxBytes !== ""
        ) {
          const n = Number(body.maxBytes);
          if (!Number.isFinite(n)) {
            return res
              .status(400)
              .json({ ok: false, error: "invalid_max_bytes" });
          }
          await mediaOrphanAlertService.setAuditMaxBytes(n, updatedBy);
          updates.push("bytes");
        }
        if (
          body.maxArchives !== undefined &&
          body.maxArchives !== null &&
          body.maxArchives !== ""
        ) {
          const n = Number(body.maxArchives);
          if (!Number.isFinite(n)) {
            return res
              .status(400)
              .json({ ok: false, error: "invalid_max_archives" });
          }
          await mediaOrphanAlertService.setAuditMaxArchives(n, updatedBy);
          updates.push("archives");
        }
        if (updates.length === 0) {
          return res.status(400).json({ ok: false, error: "no_fields" });
        }
        const status = await mediaOrphanAlertService.getStatus();
        res.json({ ok: true, updated: updates, status });
      } catch (err) {
        const message = (err as Error).message;
        res.status(400).json({ ok: false, error: message || "update_failed" });
      }
    },
  );

  // Apply-mode toggle for the scheduled background sweep. Returns the
  // current effective mode (DB override or env-var fallback) plus the
  // most recent scheduler tick summary so the admin panel can show
  // "last run removed X files".
  app.get(
    "/api/admin/broadcasts/sweep/apply-mode",
    requireRootAdmin,
    async (_req, res) => {
      const mode = await getEffectiveApplyMode();
      res.json({ ok: true, ...mode, lastRun: getLastRunSummary() });
    },
  );

  // PATCH body: { apply: boolean | null }. `null` clears the override and
  // restores the env-var fallback. Anything else is rejected.
  app.patch(
    "/api/admin/broadcasts/sweep/apply-mode",
    requireRootAdmin,
    async (req: any, res) => {
      const raw = (req.body ?? {}) as { apply?: unknown };
      let next: boolean | null;
      if (raw.apply === null) next = null;
      else if (raw.apply === true || raw.apply === false) next = raw.apply;
      else {
        return res.status(400).json({
          ok: false,
          error: "invalid_apply",
          message: "apply must be true, false, or null",
        });
      }
      try {
        const updatedBy =
          req.session?.adminActorId || req.session?.userId || "root_admin";
        const mode = await setApplyOverride(next, updatedBy);
        res.json({ ok: true, ...mode, lastRun: getLastRunSummary() });
      } catch (err) {
        res.status(500).json({
          ok: false,
          error: "update_failed",
          message: (err as Error).message,
        });
      }
    },
  );

  // Trigger a one-off scheduler run immediately, using the current effective
  // apply mode. Useful when an admin flips the toggle and wants to see the
  // resulting summary without waiting for the next tick.
  app.post(
    "/api/admin/broadcasts/sweep/run-now",
    requireRootAdmin,
    async (_req, res) => {
      void runScheduledSweep();
      res.json({ ok: true });
    },
  );

  // Upload a cover image. Stores under PRIVATE_OBJECT_DIR/broadcasts/covers/
  // and writes the public served URL into broadcasts.coverImageUrl so the
  // public Live Channel can render it.
  app.post(
    "/api/admin/broadcasts/:id/cover/upload",
    requireRootAdmin,
    coverUploadMiddleware,
    async (req: any, res) => {
      const id = String(req.params.id || "");
      if (!id || !/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 120) {
        return res.status(400).json({ ok: false, error: "invalid_id" });
      }
      const existing = await broadcastCompositorService.getBroadcast(id);
      if (!existing) return res.status(404).json({ ok: false, error: "not_found" });

      const file = req.file as { buffer: Buffer; mimetype: string } | undefined;
      if (!file) {
        return res
          .status(400)
          .json({ ok: false, error: "missing_file", message: "Expected a 'file' field" });
      }
      const ext = COVER_MIME_TO_EXT[file.mimetype.toLowerCase()];
      if (!ext) {
        return res.status(400).json({ ok: false, error: "invalid_mime" });
      }

      const dir = coversDir();
      // Remove any previous cover for this broadcast (could differ in ext).
      try {
        const entries = readdirSync(dir);
        for (const name of entries) {
          if (name.startsWith(`${id}.`)) {
            try { unlinkSync(resolve(dir, name)); } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }

      const filename = `${id}.${ext}`;
      const abs = resolve(dir, filename);
      if (!abs.startsWith(dir + "/")) {
        return res.status(400).json({ ok: false, error: "path_escape" });
      }
      try {
        writeFileSync(abs, file.buffer);
      } catch (err) {
        console.error("[broadcasts] cover write failed", err);
        return res
          .status(500)
          .json({ ok: false, error: "write_failed", message: (err as Error).message });
      }

      // Cache-bust the served URL so the Live Channel picks up new uploads.
      const servedUrl = `/api/public/broadcasts/${id}/cover?v=${Date.now()}`;
      const row = await broadcastCompositorService.updateBroadcastMeta(id, {
        coverImageUrl: servedUrl,
      });
      res.json({ ok: true, broadcast: row, coverImageUrl: servedUrl });
    },
  );

  // Live-broadcast alert audit log. The Broadcast Compositor page POSTs
  // here when the live count crosses above the configured threshold
  // ("triggered") and again when it falls back to/below the threshold
  // ("cleared"). The GET endpoint powers a small "Recent live alerts"
  // panel so admins can audit brief flaps that auto-resolved.
  app.post(
    "/api/admin/broadcasts/live-alerts/events",
    requireRootAdmin,
    async (req: any, res) => {
      const raw = (req.body ?? {}) as {
        kind?: unknown;
        liveCount?: unknown;
        threshold?: unknown;
      };
      const kind = raw.kind === "triggered" || raw.kind === "cleared" ? raw.kind : null;
      const liveCount = Number(raw.liveCount);
      const threshold = Number(raw.threshold);
      if (
        !kind ||
        !Number.isFinite(liveCount) || liveCount < 0 ||
        !Number.isFinite(threshold) || threshold < 0
      ) {
        return res.status(400).json({ ok: false, error: "invalid_event" });
      }
      try {
        const recordedBy =
          req.session?.adminActorId || req.session?.userId || null;
        const [row] = await db
          .insert(broadcastLiveAlertEvents)
          .values({
            kind,
            liveCount: Math.floor(liveCount),
            threshold: Math.floor(threshold),
            recordedBy,
          })
          .returning();
        res.json({ ok: true, event: row });
      } catch (err) {
        console.error("[broadcasts] live alert event write failed", err);
        res
          .status(500)
          .json({ ok: false, error: "write_failed", message: (err as Error).message });
      }
    },
  );

  app.get(
    "/api/admin/broadcasts/live-alerts/events",
    requireRootAdmin,
    async (req, res) => {
      const rawLimit = Number((req.query as any)?.limit);
      const limit =
        Number.isFinite(rawLimit) && rawLimit > 0
          ? Math.min(100, Math.floor(rawLimit))
          : 20;
      try {
        const rows = await db
          .select()
          .from(broadcastLiveAlertEvents)
          .orderBy(desc(broadcastLiveAlertEvents.createdAt))
          .limit(limit);
        res.json({ ok: true, events: rows });
      } catch (err) {
        console.error("[broadcasts] live alert event read failed", err);
        res
          .status(500)
          .json({ ok: false, error: "read_failed", message: (err as Error).message });
      }
    },
  );

  app.get("/api/admin/broadcasts/:id/manifest", requireRootAdmin, async (req, res) => {
    const row = await broadcastCompositorService.getBroadcast(String(req.params.id || ""));
    if (!row) return res.status(404).json({ ok: false, error: "not_found" });
    res.json({ ok: true, manifest: row.manifestJson, broadcast: row });
  });

  app.get("/api/admin/broadcasts/:id/preview", requireRootAdmin, async (req, res) => {
    const row = await broadcastCompositorService.getBroadcast(String(req.params.id || ""));
    if (!row) return res.status(404).json({ ok: false, error: "not_found" });
    if (!ensureInsidePrivateRoot(row.mp4Path)) {
      return res.status(403).json({ ok: false, error: "path_outside_private_root" });
    }
    if (!existsSync(row.mp4Path)) {
      return res.status(410).json({ ok: false, error: "mp4_missing" });
    }
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Broadcast-Dry-Run", row.dryRun ? "true" : "false");
    createReadStream(row.mp4Path).pipe(res);
  });

  // Approval registry — server-owned. The render route consults this.
  app.get("/api/admin/broadcasts/approvals", requireRootAdmin, async (_req, res) => {
    const rows = await broadcastCompositorService.listApprovedPackages();
    res.json({ ok: true, approvals: rows });
  });

  app.post("/api/admin/broadcasts/approvals", requireRootAdmin, async (req: any, res) => {
    const schema = z.object({
      packageId: z.string().min(1).max(120),
      reason: z.string().max(500).nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    }
    const actorId = req.session?.adminActorId || req.session?.userId || "root_admin";
    try {
      await broadcastCompositorService.approvePackage(parsed.data.packageId, actorId, parsed.data.reason ?? null);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof BroadcastSafetyError) {
        return res.status(err.status).json({ ok: false, error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.delete("/api/admin/broadcasts/approvals/:packageId", requireRootAdmin, async (req: any, res) => {
    const actorId = req.session?.adminActorId || req.session?.userId || "root_admin";
    await broadcastCompositorService.revokePackageApproval(String(req.params.packageId || ""), actorId);
    res.json({ ok: true });
  });

  app.get("/api/admin/broadcasts/_meta/founder-approval-flag-name", requireRootAdmin, (_req, res) => {
    // Tells the admin UI what value to send for non-dry-run renders.
    // The value itself is constant and intentionally not a secret — its
    // purpose is to force a deliberate two-step confirmation, not access
    // control (which is provided by requireRootAdmin).
    res.json({ ok: true, flagValue: FOUNDER_APPROVAL_FLAG_VALUE });
  });

  // ---------------------------------------------------------------------
  // T202 — Saved broadcast filter views (shareable team-wide).
  // GET   /api/admin/broadcasts/saved-views          → list own + shared
  // POST  /api/admin/broadcasts/saved-views          → create (private|shared)
  // PATCH /api/admin/broadcasts/saved-views/:id      → rename / change scope
  // DELETE /api/admin/broadcasts/saved-views/:id     → delete
  // Mutations to shared views are restricted to the creator or a founder
  // (root admin). All endpoints require root admin (matches page gating).
  // ---------------------------------------------------------------------
  const savedViewScope = z.enum(["private", "shared"]);
  const savedViewDryRun = z.enum(["all", "dry", "live"]);
  // T263 — Schedule shape: a list of weekly time windows during which a
  // shared view is eligible to win first-load auto-apply. Days are
  // 0=Sun..6=Sat; minutes are 0..1440 since midnight. End <= start means the
  // window wraps midnight (e.g. 18:00–02:00 covers an overnight rotation).
  const savedViewSchedule = z.object({
    enabled: z.boolean(),
    timezone: z.literal("local"),
    windows: z.array(z.object({
      days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
      startMinute: z.number().int().min(0).max(1440),
      endMinute: z.number().int().min(0).max(1440),
    })).max(20),
  }).nullable();
  const savedViewBody = z.object({
    name: z.string().trim().min(1).max(120),
    scope: savedViewScope.optional().default("private"),
    dryRun: savedViewDryRun.optional().default("all"),
    status: z.string().trim().max(60).optional().default("all"),
    packageId: z.string().trim().max(120).optional().default(""),
  });
  const savedViewPatchBody = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    scope: savedViewScope.optional(),
    isTeamDefault: z.boolean().optional(),
    schedule: savedViewSchedule.optional(),
  }).refine((v) =>
    v.name !== undefined ||
    v.scope !== undefined ||
    v.isTeamDefault !== undefined ||
    v.schedule !== undefined,
  {
    message: "Provide at least one of: name, scope, isTeamDefault, schedule",
  });

  // T263 — Append-only audit log of saved-view schedule changes. One JSON
  // object per line so ops can `tail`/`jq` it. Co-located with the cover
  // sweep audit under PRIVATE_OBJECT_DIR/audit (fallback: .local/audit).
  function savedViewScheduleAuditPath(): string {
    const envDir = process.env.PRIVATE_OBJECT_DIR?.trim();
    if (envDir) {
      try {
        const root = resolve(envDir, "audit");
        mkdirSync(root, { recursive: true });
        return resolve(root, "broadcast-saved-view-schedule.jsonl");
      } catch (err) {
        console.warn(
          `[broadcasts] audit dir in PRIVATE_OBJECT_DIR not writable (${(err as Error).message}); using local fallback ${LOCAL_AUDIT_FALLBACK}.`,
        );
      }
    }
    mkdirSync(LOCAL_AUDIT_FALLBACK, { recursive: true });
    return resolve(LOCAL_AUDIT_FALLBACK, "broadcast-saved-view-schedule.jsonl");
  }

  function appendSavedViewScheduleAudit(entry: {
    viewId: string;
    viewName: string;
    actorId: string;
    actorType: string;
    before: unknown;
    after: unknown;
  }): void {
    try {
      const line = JSON.stringify({
        id: randomUUID(),
        ts: new Date().toISOString(),
        ...entry,
      }) + "\n";
      appendFileSync(savedViewScheduleAuditPath(), line, "utf8");
    } catch (err) {
      console.warn(
        `[broadcasts] failed to write saved-view schedule audit: ${(err as Error).message}`,
      );
    }
  }

  function schedulesEqual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  }

  // T271 — Coverage diagnostics across all enabled scheduled shared views.
  // Mirrors `computeScheduleDiagnostics` on the client; kept self-contained
  // here so the server can flag overlap/gap warnings on PATCH responses.
  type SchedWindow = { days: number[]; startMinute: number; endMinute: number };
  type SchedShape = { enabled: boolean; timezone: "local"; windows: SchedWindow[] };
  const SCHED_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  function hhmmFromMinutes(min: number): string {
    const m = Math.max(0, Math.min(1440, Math.round(min)));
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  function expandSchedWindow(w: SchedWindow): Array<{ day: number; start: number; end: number }> {
    const out: Array<{ day: number; start: number; end: number }> = [];
    for (const day of w.days) {
      if (w.endMinute > w.startMinute) {
        out.push({ day, start: w.startMinute, end: w.endMinute });
      } else {
        // Wrapping window (end <= start, including end === start) mirrors
        // `scheduleMatchesNow` on the client: covers [start, 1440) on `day`
        // plus [0, end) on the next day.
        out.push({ day, start: w.startMinute, end: 1440 });
        if (w.endMinute > 0) out.push({ day: (day + 1) % 7, start: 0, end: w.endMinute });
      }
    }
    return out;
  }
  function computeServerScheduleDiagnostics(
    sources: Array<{ id: string; name: string; schedule: SchedShape }>,
  ): {
    conflicts: Array<{ day: number; start: number; end: number; viewIds: string[]; viewNames: string[]; label: string }>;
    gaps: Array<{ day: number; start: number; end: number; label: string }>;
    hasAnyEnabled: boolean;
  } {
    const enabled = sources.filter(
      (s) => s.schedule.enabled && s.schedule.windows.length > 0,
    );
    if (!enabled.length) return { conflicts: [], gaps: [], hasAnyEnabled: false };
    const coverage: string[][] = Array.from({ length: 7 * 1440 }, () => []);
    for (const s of enabled) {
      for (const w of s.schedule.windows) {
        if (!w.days.length) continue;
        for (const r of expandSchedWindow(w)) {
          const base = r.day * 1440;
          for (let m = r.start; m < r.end; m++) {
            const cell = coverage[base + m];
            if (!cell.includes(s.id)) cell.push(s.id);
          }
        }
      }
    }
    const nameOf = new Map(enabled.map((s) => [s.id, s.name]));
    const conflicts: Array<{ day: number; start: number; end: number; viewIds: string[]; viewNames: string[]; label: string }> = [];
    const gaps: Array<{ day: number; start: number; end: number; label: string }> = [];
    const rangeLabel = (d: number, st: number, en: number) =>
      `${SCHED_DAY_LABELS[d]} ${hhmmFromMinutes(st)}–${en >= 1440 ? "24:00" : hhmmFromMinutes(en)}`;
    for (let day = 0; day < 7; day++) {
      const base = day * 1440;
      let runStart = 0;
      let runSig = coverage[base].slice().sort().join("|");
      for (let m = 1; m <= 1440; m++) {
        const sig = m < 1440 ? coverage[base + m].slice().sort().join("|") : "__END__";
        if (sig === runSig) continue;
        const ids = runSig ? runSig.split("|") : [];
        if (ids.length >= 2) {
          conflicts.push({
            day,
            start: runStart,
            end: m,
            viewIds: ids,
            viewNames: ids.map((id) => nameOf.get(id) ?? id),
            label: rangeLabel(day, runStart, m),
          });
        } else if (ids.length === 0) {
          gaps.push({ day, start: runStart, end: m, label: rangeLabel(day, runStart, m) });
        }
        runStart = m;
        runSig = sig;
      }
    }
    return { conflicts, gaps, hasAnyEnabled: true };
  }

  function actorFromReq(req: any): { id: string; type: string; isFounder: boolean } | null {
    const admin = getAdminVerification(req);
    if (!admin) return null;
    return {
      id: admin.actor.id,
      type: admin.actor.type,
      isFounder: isRootAdmin(admin),
    };
  }

  type CreatorAccountStatus = "active" | "disabled" | "removed" | "unknown";

  type CreatorProfile = {
    actorId: string;
    actorType: string;
    displayName: string;
    email: string | null;
    role: string | null;
    status: CreatorAccountStatus;
    disabledAt: string | null;
  };

  function rootAdminCreatorProfile(actorId: string): CreatorProfile {
    return {
      actorId,
      actorType: "root_admin",
      displayName: "Founder",
      email: process.env.FOUNDER_EMAIL || null,
      role: "Founder (root admin)",
      status: "active",
      disabledAt: null,
    };
  }

  function unknownCreatorProfile(actorId: string, actorType: string): CreatorProfile {
    const shortId = actorId.length > 10 ? `${actorId.slice(0, 8)}…` : actorId;
    return {
      actorId,
      actorType,
      displayName: `Unknown admin (${shortId})`,
      email: null,
      role: null,
      status: actorType === "staff" ? "removed" : "unknown",
      disabledAt: null,
    };
  }

  function creatorKey(actorType: string, actorId: string) {
    return `${actorType}:${actorId}`;
  }

  async function resolveCreatorProfiles(
    rows: Array<typeof adminBroadcastSavedView.$inferSelect>,
  ): Promise<Map<string, CreatorProfile>> {
    const result = new Map<string, CreatorProfile>();
    const staffIds = new Set<string>();
    for (const r of rows) {
      if (r.createdByActorType === "staff") staffIds.add(r.createdByActorId);
      if (r.teamDefaultSetByActorType === "staff" && r.teamDefaultSetByActorId) {
        staffIds.add(r.teamDefaultSetByActorId);
      }
    }
    if (staffIds.size > 0) {
      const staffRows = await db
        .select({
          id: adminStaff.id,
          email: adminStaff.email,
          displayName: adminStaff.displayName,
          role: adminStaff.role,
          active: adminStaff.active,
          disabledAt: adminStaff.disabledAt,
        })
        .from(adminStaff)
        .where(inArray(adminStaff.id, Array.from(staffIds)));
      for (const s of staffRows) {
        result.set(creatorKey("staff", s.id), {
          actorId: s.id,
          actorType: "staff",
          displayName: s.displayName,
          email: s.email,
          role: s.role,
          status: s.active ? "active" : "disabled",
          disabledAt: s.disabledAt
            ? (s.disabledAt as Date).toISOString?.() ?? String(s.disabledAt)
            : null,
        });
      }
    }
    for (const r of rows) {
      const key = creatorKey(r.createdByActorType, r.createdByActorId);
      if (result.has(key)) continue;
      if (r.createdByActorType === "root_admin") {
        result.set(key, rootAdminCreatorProfile(r.createdByActorId));
      } else {
        result.set(
          key,
          unknownCreatorProfile(r.createdByActorId, r.createdByActorType),
        );
      }
    }
    return result;
  }

  function serializeSavedView(
    row: typeof adminBroadcastSavedView.$inferSelect,
    viewer: { id: string; isFounder: boolean },
    creators: Map<string, CreatorProfile>,
  ) {
    const canModify = row.createdByActorId === viewer.id || viewer.isFounder;
    const creator =
      creators.get(creatorKey(row.createdByActorType, row.createdByActorId)) ??
      (row.createdByActorType === "root_admin"
        ? rootAdminCreatorProfile(row.createdByActorId)
        : unknownCreatorProfile(row.createdByActorId, row.createdByActorType));
    let teamDefaultSetBy: CreatorProfile | null = null;
    if (row.isTeamDefault && row.teamDefaultSetByActorId && row.teamDefaultSetByActorType) {
      teamDefaultSetBy =
        creators.get(creatorKey(row.teamDefaultSetByActorType, row.teamDefaultSetByActorId)) ??
        (row.teamDefaultSetByActorType === "root_admin"
          ? rootAdminCreatorProfile(row.teamDefaultSetByActorId)
          : unknownCreatorProfile(row.teamDefaultSetByActorId, row.teamDefaultSetByActorType));
    }
    return {
      id: row.id,
      name: row.name,
      scope: row.scope as "private" | "shared",
      dryRun: row.dryRun as "all" | "dry" | "live",
      status: row.status,
      packageId: row.packageId,
      createdByActorId: row.createdByActorId,
      createdByActorType: row.createdByActorType,
      creator,
      createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
      updatedAt: row.updatedAt?.toISOString?.() ?? String(row.updatedAt),
      isOwn: row.createdByActorId === viewer.id,
      canModify,
      isTeamDefault: !!row.isTeamDefault,
      teamDefaultSetBy,
      teamDefaultSetAt: row.teamDefaultSetAt
        ? (row.teamDefaultSetAt as Date).toISOString?.() ?? String(row.teamDefaultSetAt)
        : null,
      schedule: row.schedule ?? null,
    };
  }

  async function resolveViewerDisplayName(actor: {
    id: string;
    type: string;
  }): Promise<string> {
    if (actor.type === "staff") {
      const [row] = await db
        .select({ displayName: adminStaff.displayName })
        .from(adminStaff)
        .where(eq(adminStaff.id, actor.id))
        .limit(1);
      if (row?.displayName) return row.displayName;
      return unknownCreatorProfile(actor.id, actor.type).displayName;
    }
    if (actor.type === "root_admin") {
      return rootAdminCreatorProfile(actor.id).displayName;
    }
    return unknownCreatorProfile(actor.id, actor.type).displayName;
  }

  app.get("/api/admin/broadcasts/saved-views", requireRootAdmin, async (req, res) => {
    const actor = actorFromReq(req);
    if (!actor) return res.status(401).json({ ok: false, error: "unauthorized" });
    const rows = await db
      .select()
      .from(adminBroadcastSavedView)
      .where(or(
        eq(adminBroadcastSavedView.scope, "shared"),
        eq(adminBroadcastSavedView.createdByActorId, actor.id),
      ))
      .orderBy(asc(adminBroadcastSavedView.scope), desc(adminBroadcastSavedView.createdAt));
    const creators = await resolveCreatorProfiles(rows);
    const viewerDisplayName = await resolveViewerDisplayName(actor);
    // T292 — Expose a lightweight contact directory of currently active admin
    // staff (plus the founder) so the shared-preview banner can resolve the
    // `?sharedBy=<name>` URL hint to an email and offer a "Message <name>"
    // mailto action. Restricted to this admin-only endpoint, so we're not
    // leaking contacts publicly. Inactive/removed staff are omitted because
    // contacting them wouldn't reach a real person.
    const staffRows = await db
      .select({
        displayName: adminStaff.displayName,
        email: adminStaff.email,
        active: adminStaff.active,
        // T298 — Optional Slack handle so the shared-preview banner can offer
        // a "Slack <name>" deep-link button alongside the mailto fallback.
        slackHandle: adminStaff.slackHandle,
      })
      .from(adminStaff);
    const staffDirectory: Array<{
      displayName: string;
      email: string;
      slackHandle: string | null;
    }> = [];
    for (const s of staffRows) {
      if (!s.active) continue;
      if (!s.email || !s.displayName) continue;
      const slackHandle = s.slackHandle?.trim() || null;
      staffDirectory.push({
        displayName: s.displayName,
        email: s.email,
        slackHandle,
      });
    }
    const founderEmail = process.env.FOUNDER_EMAIL?.trim();
    if (founderEmail) {
      const founderName = rootAdminCreatorProfile("founder").displayName;
      if (!staffDirectory.some((s) => s.email.toLowerCase() === founderEmail.toLowerCase())) {
        const founderSlack = process.env.FOUNDER_SLACK_HANDLE?.trim() || null;
        staffDirectory.push({
          displayName: founderName,
          email: founderEmail,
          slackHandle: founderSlack,
        });
      }
    }
    res.json({
      ok: true,
      views: rows.map((r) => serializeSavedView(r, actor, creators)),
      viewerActorId: actor.id,
      viewerIsFounder: actor.isFounder,
      viewerDisplayName,
      staffDirectory,
    });
  });

  app.post("/api/admin/broadcasts/saved-views", requireRootAdmin, async (req, res) => {
    const actor = actorFromReq(req);
    if (!actor) return res.status(401).json({ ok: false, error: "unauthorized" });
    const parsed = savedViewBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    }
    const data = parsed.data;
    const [created] = await db.insert(adminBroadcastSavedView).values({
      name: data.name,
      scope: data.scope,
      dryRun: data.dryRun,
      status: data.status || "all",
      packageId: data.packageId || "",
      createdByActorId: actor.id,
      createdByActorType: actor.type,
    }).returning();
    const creators = await resolveCreatorProfiles([created]);
    res.json({ ok: true, view: serializeSavedView(created, actor, creators) });
  });

  app.patch("/api/admin/broadcasts/saved-views/:id", requireRootAdmin, async (req, res) => {
    const actor = actorFromReq(req);
    if (!actor) return res.status(401).json({ ok: false, error: "unauthorized" });
    const parsed = savedViewPatchBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", details: parsed.error.flatten() });
    }
    const [existing] = await db
      .select()
      .from(adminBroadcastSavedView)
      .where(eq(adminBroadcastSavedView.id, String(req.params.id)));
    if (!existing) return res.status(404).json({ ok: false, error: "not_found" });
    if (existing.createdByActorId !== actor.id && !actor.isFounder) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Only the creator or a founder can modify this view." });
    }
    if (parsed.data.isTeamDefault !== undefined && !actor.isFounder) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Only a founder can set the team default view." });
    }
    if (parsed.data.schedule !== undefined && !actor.isFounder) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Only a founder can schedule the team default view." });
    }
    const effectiveScope = parsed.data.scope ?? existing.scope;
    if (parsed.data.isTeamDefault === true && effectiveScope !== "shared") {
      return res.status(400).json({ ok: false, error: "invalid_request", message: "Only shared views can be set as the team default." });
    }
    // A schedule (with enabled=true or any windows) only makes sense on a shared
    // view — private views never participate in team auto-apply. Demoting a view
    // to private below also clears any schedule.
    if (
      parsed.data.schedule &&
      (parsed.data.schedule.enabled || parsed.data.schedule.windows.length > 0) &&
      effectiveScope !== "shared"
    ) {
      return res.status(400).json({ ok: false, error: "invalid_request", message: "Only shared views can carry a schedule." });
    }
    // Validate each window: a 0-length non-wrapping window is meaningless.
    if (parsed.data.schedule) {
      for (const w of parsed.data.schedule.windows) {
        if (w.startMinute === w.endMinute) {
          return res.status(400).json({ ok: false, error: "invalid_request", message: "Schedule windows must have a non-zero duration." });
        }
      }
    }
    const patch: Partial<typeof adminBroadcastSavedView.$inferInsert> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.scope !== undefined) patch.scope = parsed.data.scope;
    if (parsed.data.isTeamDefault !== undefined) patch.isTeamDefault = parsed.data.isTeamDefault;
    if (parsed.data.schedule !== undefined) patch.schedule = parsed.data.schedule;
    // If we just demoted this view from shared to private, it can no longer be the team default
    // and any schedule attached to it stops mattering — clear both for clarity.
    if (parsed.data.scope === "private" && existing.isTeamDefault) {
      patch.isTeamDefault = false;
    }
    // T263: Demoting a shared view to private also strips its schedule —
    // private views never participate in team auto-apply.
    if (parsed.data.scope === "private" && existing.schedule) {
      patch.schedule = null;
    }
    // T264: Record who pinned/unpinned the team default and when. Pinning sets
    // both fields; unpinning (or any path that ends with isTeamDefault=false)
    // clears them so stale accountability never lingers on an unpinned row.
    if (patch.isTeamDefault === true && !existing.isTeamDefault) {
      patch.teamDefaultSetByActorId = actor.id;
      patch.teamDefaultSetByActorType = actor.type;
      patch.teamDefaultSetAt = new Date();
    } else if (patch.isTeamDefault === false) {
      patch.teamDefaultSetByActorId = null;
      patch.teamDefaultSetByActorType = null;
      patch.teamDefaultSetAt = null;
    }
    const targetId = String(req.params.id);
    const updated = await db.transaction(async (tx) => {
      if (patch.isTeamDefault === true) {
        await tx
          .update(adminBroadcastSavedView)
          .set({
            isTeamDefault: false,
            teamDefaultSetByActorId: null,
            teamDefaultSetByActorType: null,
            teamDefaultSetAt: null,
            updatedAt: new Date(),
          })
          .where(and(
            eq(adminBroadcastSavedView.isTeamDefault, true),
            ne(adminBroadcastSavedView.id, targetId),
          ));
      }
      const [row] = await tx
        .update(adminBroadcastSavedView)
        .set(patch)
        .where(eq(adminBroadcastSavedView.id, targetId))
        .returning();
      return row;
    });
    // T263 — Audit-log schedule changes. We log whenever the effective
    // schedule field actually changed (either because the caller set
    // `schedule` to something new, or because a scope demotion auto-cleared it).
    if (!schedulesEqual(existing.schedule, updated.schedule)) {
      appendSavedViewScheduleAudit({
        viewId: updated.id,
        viewName: updated.name,
        actorId: actor.id,
        actorType: actor.type,
        before: existing.schedule ?? null,
        after: updated.schedule ?? null,
      });
    }
    const creators = await resolveCreatorProfiles([updated]);
    // T271 — Compute coverage diagnostics across all enabled scheduled shared
    // views after this update so the client can surface overlap/gap warnings.
    // We flag (not reject) so founders can deliberately stage overlapping
    // rotations during a handoff without being blocked.
    let scheduleWarnings: {
      conflicts: Array<{ label: string; viewNames: string[] }>;
      gaps: Array<{ label: string }>;
    } | undefined;
    try {
      const allRows = await db
        .select()
        .from(adminBroadcastSavedView)
        .where(eq(adminBroadcastSavedView.scope, "shared"));
      const sources = allRows
        .map((r) => {
          const sched = r.schedule as SchedShape | null;
          if (!sched || !sched.enabled || !sched.windows?.length) return null;
          return { id: r.id, name: r.name, schedule: sched };
        })
        .filter((x): x is { id: string; name: string; schedule: SchedShape } => !!x);
      const diag = computeServerScheduleDiagnostics(sources);
      if (diag.conflicts.length || diag.gaps.length) {
        scheduleWarnings = {
          conflicts: diag.conflicts.slice(0, 20).map((c) => ({
            label: c.label,
            viewNames: c.viewNames,
          })),
          gaps: diag.gaps.slice(0, 20).map((g) => ({ label: g.label })),
        };
      }
    } catch (err) {
      console.warn(
        `[broadcasts] schedule diagnostics failed: ${(err as Error).message}`,
      );
    }
    res.json({
      ok: true,
      view: serializeSavedView(updated, actor, creators),
      ...(scheduleWarnings ? { scheduleWarnings } : {}),
    });
  });

  // T270 — Admin reader for the saved-view schedule audit log written by
  // T263. Returns entries newest-first with simple offset/limit pagination
  // (and an optional viewId filter). Actor display names are resolved from
  // adminStaff when possible so the UI can label rows nicely.
  app.get(
    "/api/admin/broadcasts/saved-view-schedule-audit",
    requireRootAdmin,
    async (req, res) => {
      const actor = actorFromReq(req);
      if (!actor) return res.status(401).json({ ok: false, error: "unauthorized" });
      const limitRaw = Number(req.query.limit);
      const offsetRaw = Number(req.query.offset);
      const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(200, Math.floor(limitRaw)))
        : 50;
      const offset = Number.isFinite(offsetRaw)
        ? Math.max(0, Math.floor(offsetRaw))
        : 0;
      const viewIdFilter = typeof req.query.viewId === "string" && req.query.viewId.trim().length > 0
        ? String(req.query.viewId).trim()
        : null;

      type RawEntry = {
        id?: string;
        ts?: string;
        viewId?: string;
        viewName?: string;
        actorId?: string;
        actorType?: string;
        before?: unknown;
        after?: unknown;
      };

      const p = savedViewScheduleAuditPath();
      let parsed: RawEntry[] = [];
      if (existsSync(p)) {
        const raw = readFileSync(p, "utf8");
        for (const line of raw.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            parsed.push(JSON.parse(trimmed) as RawEntry);
          } catch {
            /* skip malformed line */
          }
        }
      }
      // Newest first.
      parsed.reverse();
      if (viewIdFilter) {
        parsed = parsed.filter((e) => e.viewId === viewIdFilter);
      }
      const total = parsed.length;
      const slice = parsed.slice(offset, offset + limit);

      // Resolve staff actor display names in one query.
      const staffIds = new Set<string>();
      for (const e of slice) {
        if (e.actorType === "staff" && e.actorId) staffIds.add(e.actorId);
      }
      const actorMap = new Map<string, CreatorProfile>();
      if (staffIds.size > 0) {
        const staffRows = await db
          .select({
            id: adminStaff.id,
            email: adminStaff.email,
            displayName: adminStaff.displayName,
            role: adminStaff.role,
            active: adminStaff.active,
            disabledAt: adminStaff.disabledAt,
          })
          .from(adminStaff)
          .where(inArray(adminStaff.id, Array.from(staffIds)));
        for (const s of staffRows) {
          actorMap.set(creatorKey("staff", s.id), {
            actorId: s.id,
            actorType: "staff",
            displayName: s.displayName,
            email: s.email,
            role: s.role,
            status: s.active ? "active" : "disabled",
            disabledAt: s.disabledAt
              ? (s.disabledAt as Date).toISOString?.() ?? String(s.disabledAt)
              : null,
          });
        }
      }

      const entries = slice.map((e) => {
        const actorId = e.actorId ?? "unknown";
        const actorType = e.actorType ?? "unknown";
        let actorProfile: CreatorProfile;
        const key = creatorKey(actorType, actorId);
        if (actorMap.has(key)) {
          actorProfile = actorMap.get(key)!;
        } else if (actorType === "root_admin") {
          actorProfile = rootAdminCreatorProfile(actorId);
        } else {
          actorProfile = unknownCreatorProfile(actorId, actorType);
        }
        return {
          id: e.id ?? null,
          ts: e.ts ?? null,
          viewId: e.viewId ?? null,
          viewName: e.viewName ?? null,
          actorId,
          actorType,
          actor: actorProfile,
          before: e.before ?? null,
          after: e.after ?? null,
        };
      });

      res.json({
        ok: true,
        entries,
        total,
        limit,
        offset,
        hasMore: offset + entries.length < total,
        viewId: viewIdFilter,
      });
    },
  );

  app.delete("/api/admin/broadcasts/saved-views/:id", requireRootAdmin, async (req, res) => {
    const actor = actorFromReq(req);
    if (!actor) return res.status(401).json({ ok: false, error: "unauthorized" });
    const [existing] = await db
      .select()
      .from(adminBroadcastSavedView)
      .where(eq(adminBroadcastSavedView.id, String(req.params.id)));
    if (!existing) return res.status(404).json({ ok: false, error: "not_found" });
    if (existing.createdByActorId !== actor.id && !actor.isFounder) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Only the creator or a founder can delete this view." });
    }
    await db.delete(adminBroadcastSavedView).where(eq(adminBroadcastSavedView.id, String(req.params.id)));
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------
  // T310 — Team-default fallback filter preset.
  // Founders can pin a preferred dryRun/status/packageId combo so the
  // "Create new fallback view" form in the Suggest fix dialog always
  // starts there, instead of inheriting whatever filters happen to be
  // applied on the dashboard at that moment.
  //
  // GET    /api/admin/broadcasts/fallback-default-preset → current preset or null
  // PUT    /api/admin/broadcasts/fallback-default-preset → upsert (founder-only)
  // DELETE /api/admin/broadcasts/fallback-default-preset → clear  (founder-only)
  // ---------------------------------------------------------------------
  const FALLBACK_PRESET_SINGLETON_ID = "singleton";
  const fallbackPresetBody = z.object({
    dryRun: z.enum(["all", "dry", "live"]).optional().default("all"),
    status: z.string().trim().max(60).optional().default("all"),
    packageId: z.string().trim().max(120).optional().default(""),
  });

  async function fetchFallbackPresetRow() {
    const [row] = await db
      .select()
      .from(adminBroadcastFallbackDefaultPreset)
      .where(eq(adminBroadcastFallbackDefaultPreset.id, FALLBACK_PRESET_SINGLETON_ID));
    return row ?? null;
  }

  async function serializeFallbackPreset(
    row: typeof adminBroadcastFallbackDefaultPreset.$inferSelect | null,
  ) {
    if (!row) return null;
    let updatedBy: CreatorProfile;
    if (row.updatedByActorType === "staff") {
      const [s] = await db
        .select({
          id: adminStaff.id,
          email: adminStaff.email,
          displayName: adminStaff.displayName,
          role: adminStaff.role,
          active: adminStaff.active,
          disabledAt: adminStaff.disabledAt,
        })
        .from(adminStaff)
        .where(eq(adminStaff.id, row.updatedByActorId))
        .limit(1);
      if (s) {
        updatedBy = {
          actorId: s.id,
          actorType: "staff",
          displayName: s.displayName,
          email: s.email,
          role: s.role,
          status: s.active ? "active" : "disabled",
          disabledAt: s.disabledAt
            ? (s.disabledAt as Date).toISOString?.() ?? String(s.disabledAt)
            : null,
        };
      } else {
        updatedBy = unknownCreatorProfile(row.updatedByActorId, row.updatedByActorType);
      }
    } else if (row.updatedByActorType === "root_admin") {
      updatedBy = rootAdminCreatorProfile(row.updatedByActorId);
    } else {
      updatedBy = unknownCreatorProfile(row.updatedByActorId, row.updatedByActorType);
    }
    return {
      dryRun: row.dryRun as "all" | "dry" | "live",
      status: row.status,
      packageId: row.packageId,
      updatedAt: row.updatedAt?.toISOString?.() ?? String(row.updatedAt),
      updatedBy,
    };
  }

  app.get(
    "/api/admin/broadcasts/fallback-default-preset",
    requireRootAdmin,
    async (req, res) => {
      const actor = actorFromReq(req);
      if (!actor) return res.status(401).json({ ok: false, error: "unauthorized" });
      const row = await fetchFallbackPresetRow();
      const preset = await serializeFallbackPreset(row);
      res.json({ ok: true, preset, viewerIsFounder: actor.isFounder });
    },
  );

  // T316 — Append-only audit log of fallback-default-preset changes. One
  // JSON object per line, co-located with the other broadcast audit logs
  // under PRIVATE_OBJECT_DIR/audit (fallback: .local/audit). Mirrors
  // `appendSavedViewScheduleAudit` so the Manage views surface can show
  // "who changed it, when, and what the previous values were" before a
  // founder updates the team-wide preset.
  type FallbackPresetSnapshot = {
    dryRun: string;
    status: string;
    packageId: string;
  } | null;
  function fallbackPresetAuditPath(): string {
    const envDir = process.env.PRIVATE_OBJECT_DIR?.trim();
    if (envDir) {
      try {
        const root = resolve(envDir, "audit");
        mkdirSync(root, { recursive: true });
        return resolve(root, "broadcast-fallback-default-preset.jsonl");
      } catch (err) {
        console.warn(
          `[broadcasts] audit dir in PRIVATE_OBJECT_DIR not writable (${(err as Error).message}); using local fallback ${LOCAL_AUDIT_FALLBACK}.`,
        );
      }
    }
    mkdirSync(LOCAL_AUDIT_FALLBACK, { recursive: true });
    return resolve(LOCAL_AUDIT_FALLBACK, "broadcast-fallback-default-preset.jsonl");
  }

  // T321 — Rotation tuning for the fallback-preset audit log. Mirrors the
  // cover-/media-sweep audit rotation: defaults keep the footprint at ~5MB
  // worst case (1MB active + 4 × 1MB archives) so the JSONL can't grow
  // unbounded in long-running deployments. T324 — Both values are admin-
  // tunable from the fallback-preset panel; the resolution order is
  // DB-persisted setting → `FALLBACK_PRESET_AUDIT_MAX_BYTES` /
  // `FALLBACK_PRESET_AUDIT_MAX_ARCHIVES` env var → default. The DB values
  // live in `system_settings` and are managed by
  // `fallbackPresetAuditSettingsService` (which caches them so the rotation
  // path stays synchronous).
  const FALLBACK_PRESET_AUDIT_ARCHIVE_SUFFIX_RE =
    /^broadcast-fallback-default-preset\.jsonl\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)(?:-[a-f0-9]{4})?$/;
  function fallbackPresetAuditMaxBytes(): number {
    return fallbackPresetAuditSettingsService.getAuditMaxBytesSync();
  }
  function fallbackPresetAuditMaxArchives(): number {
    return fallbackPresetAuditSettingsService.getAuditMaxArchivesSync();
  }
  // T323 — Summary stats about the on-disk fallback-preset audit log,
  // mirroring `coverSweepAuditStats`/`mediaSweepAuditStats`. Surfaced in the
  // Broadcasts admin panel so founders can confirm audit-log retention is
  // doing its job without SSHing into the box.
  type FallbackPresetAuditArchiveSummary = {
    name: string;
    rotatedAt: string | null;
    bytes: number;
    // T363 — set/clear counts so the dashboard can show the breakdown on
    // each row without opening it. Cached per (name, mtimeMs, size) since
    // rotated archives are immutable.
    setCount: number;
    clearCount: number;
  };
  // T363 — Per-archive set/clear count cache. Key includes mtimeMs+size so
  // the unlikely case of an archive being rewritten (e.g. manual repair)
  // invalidates the entry. Cache lives for the process lifetime; the
  // working set is tiny (one entry per rotated file, capped by
  // maxArchives).
  const fallbackPresetAuditCountCache = new Map<
    string,
    { setCount: number; clearCount: number }
  >();
  function countFallbackPresetAuditArchiveActions(
    fullPath: string,
    mtimeMs: number,
    size: number,
  ): { setCount: number; clearCount: number } {
    const key = `${fullPath}|${mtimeMs}|${size}`;
    const cached = fallbackPresetAuditCountCache.get(key);
    if (cached) return cached;
    let setCount = 0;
    let clearCount = 0;
    try {
      const raw = readFileSync(fullPath, "utf8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const e = JSON.parse(trimmed) as { action?: "set" | "clear" };
          if ((e.action ?? "set") === "clear") clearCount += 1;
          else setCount += 1;
        } catch {
          /* skip malformed line */
        }
      }
    } catch {
      /* unreadable — return zeros (uncached) */
      return { setCount: 0, clearCount: 0 };
    }
    const result = { setCount, clearCount };
    fallbackPresetAuditCountCache.set(key, result);
    return result;
  }
  // T365 — Recompute set/clear counts for the active (mutable) audit file.
  // Reuses the same per-file cache as rotated archives; because the cache
  // key already includes mtimeMs+size, edits naturally invalidate the
  // entry. We additionally prune any stale (different mtime/size) entries
  // for the same path on each call so the cache can't grow unbounded as
  // the active file is appended to over time.
  function countFallbackPresetAuditActiveActions(
    activePath: string,
  ): { setCount: number; clearCount: number; exists: boolean } {
    let mtimeMs = 0;
    let size = 0;
    let exists = false;
    try {
      const s = statSync(activePath);
      mtimeMs = s.mtimeMs;
      size = s.size;
      exists = true;
    } catch {
      return { setCount: 0, clearCount: 0, exists: false };
    }
    const currentKey = `${activePath}|${mtimeMs}|${size}`;
    const prefix = `${activePath}|`;
    for (const k of fallbackPresetAuditCountCache.keys()) {
      if (k.startsWith(prefix) && k !== currentKey) {
        fallbackPresetAuditCountCache.delete(k);
      }
    }
    const counts = countFallbackPresetAuditArchiveActions(
      activePath,
      mtimeMs,
      size,
    );
    return { ...counts, exists };
  }

  function fallbackPresetAuditStats(): {
    activeBytes: number;
    activeExists: boolean;
    activeSetCount: number;
    activeClearCount: number;
    archiveCount: number;
    archiveBytes: number;
    totalBytes: number;
    archives: FallbackPresetAuditArchiveSummary[];
    lastRotatedAt: string | null;
  } {
    let activePath: string;
    try {
      activePath = fallbackPresetAuditPath();
    } catch {
      return {
        activeBytes: 0,
        activeExists: false,
        activeSetCount: 0,
        activeClearCount: 0,
        archiveCount: 0,
        archiveBytes: 0,
        totalBytes: 0,
        archives: [],
        lastRotatedAt: null,
      };
    }
    let activeBytes = 0;
    let activeExists = false;
    try {
      const s = statSync(activePath);
      activeBytes = s.size;
      activeExists = true;
    } catch {
      /* missing → 0 */
    }
    // T365 — Per-row "N set · N clear" breakdown for the active file,
    // matching what rotated archives already show. Counts are recomputed
    // on demand but cached by (path, mtime, size) so unchanged files
    // re-use the cached parse.
    const activeCounts = activeExists
      ? countFallbackPresetAuditActiveActions(activePath)
      : { setCount: 0, clearCount: 0, exists: false };
    const dir = dirname(activePath);
    const details = listFallbackPresetAuditArchiveDetails(dir);
    let archiveBytes = 0;
    for (const a of details) archiveBytes += a.bytes;
    // T337 — Newest-first list so the admin panel can render a short
    // "Archives (newest first)" mini-list and surface the most recent
    // rotation timestamp without an extra round-trip.
    const newestFirst = [...details].reverse();
    const lastRotatedAt = newestFirst[0]?.rotatedAt ?? null;
    return {
      activeBytes,
      activeExists,
      activeSetCount: activeCounts.setCount,
      activeClearCount: activeCounts.clearCount,
      archiveCount: details.length,
      archiveBytes,
      totalBytes: activeBytes + archiveBytes,
      archives: newestFirst.map((a) => ({
        name: a.name,
        rotatedAt: a.rotatedAt,
        bytes: a.bytes,
        // T363 — set/clear breakdown per archive (cached on the server).
        setCount: a.setCount,
        clearCount: a.clearCount,
      })),
      lastRotatedAt,
    };
  }

  // T337 — Convert the dash-only timestamp suffix stamped onto rotated
  // archive filenames (e.g. `2024-01-15T10-20-30-456Z`) back into a real
  // ISO 8601 string (`2024-01-15T10:20:30.456Z`) so the UI can render it
  // with the same Date formatting as everything else.
  function parseFallbackPresetAuditArchiveTs(stamp: string): string | null {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(
      stamp,
    );
    if (!m) return null;
    const iso = `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
    return Number.isFinite(Date.parse(iso)) ? iso : null;
  }
  function listFallbackPresetAuditArchives(dir: string): string[] {
    return listFallbackPresetAuditArchiveDetails(dir).map((a) => a.name);
  }
  function listFallbackPresetAuditArchiveDetails(
    dir: string,
  ): Array<{
    name: string;
    rotatedAt: string | null;
    bytes: number;
    setCount: number;
    clearCount: number;
  }> {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return [];
    }
    const matches: { name: string; ts: string }[] = [];
    for (const name of entries) {
      const m = FALLBACK_PRESET_AUDIT_ARCHIVE_SUFFIX_RE.exec(name);
      if (!m) continue;
      matches.push({ name, ts: m[1] });
    }
    matches.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    return matches.map((m) => {
      const fullPath = resolve(dir, m.name);
      let bytes = 0;
      let mtimeMs = 0;
      try {
        const s = statSync(fullPath);
        bytes = s.size;
        mtimeMs = s.mtimeMs;
      } catch {
        /* best effort */
      }
      // T363 — Cached set/clear breakdown so each row can show the
      // counters without an extra round-trip.
      const { setCount, clearCount } =
        countFallbackPresetAuditArchiveActions(fullPath, mtimeMs, bytes);
      return {
        name: m.name,
        rotatedAt: parseFallbackPresetAuditArchiveTs(m.ts),
        bytes,
        setCount,
        clearCount,
      };
    });
  }
  function rotateFallbackPresetAuditIfNeeded(activePath: string): void {
    const maxBytes = fallbackPresetAuditMaxBytes();
    let size = 0;
    try {
      size = statSync(activePath).size;
    } catch {
      return;
    }
    if (size < maxBytes) return;
    const dir = dirname(activePath);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    let archiveName = `broadcast-fallback-default-preset.jsonl.${stamp}`;
    let archivePath = resolve(dir, archiveName);
    if (existsSync(archivePath)) {
      const suffix = randomUUID().slice(0, 4);
      archiveName = `broadcast-fallback-default-preset.jsonl.${stamp}-${suffix}`;
      archivePath = resolve(dir, archiveName);
    }
    try {
      renameSync(activePath, archivePath);
    } catch (err) {
      console.warn(
        `[broadcasts] fallback-preset audit rotation failed: ${(err as Error).message}`,
      );
      return;
    }
    const maxArchives = fallbackPresetAuditMaxArchives();
    const archives = listFallbackPresetAuditArchives(dir);
    const excess = archives.length - maxArchives;
    if (excess > 0) {
      for (const old of archives.slice(0, excess)) {
        try {
          unlinkSync(resolve(dir, old));
        } catch {
          /* best effort */
        }
      }
    }
  }

  function snapshotFromPresetRow(
    row: typeof adminBroadcastFallbackDefaultPreset.$inferSelect | null,
  ): FallbackPresetSnapshot {
    if (!row) return null;
    return {
      dryRun: row.dryRun,
      status: row.status,
      packageId: row.packageId,
    };
  }
  function presetSnapshotsEqual(
    a: FallbackPresetSnapshot,
    b: FallbackPresetSnapshot,
  ): boolean {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    return (
      a.dryRun === b.dryRun &&
      a.status === b.status &&
      a.packageId === b.packageId
    );
  }
  function appendFallbackPresetAudit(entry: {
    actorId: string;
    actorType: string;
    action: "set" | "clear";
    before: FallbackPresetSnapshot;
    after: FallbackPresetSnapshot;
  }): void {
    try {
      const line = JSON.stringify({
        id: randomUUID(),
        ts: new Date().toISOString(),
        ...entry,
      }) + "\n";
      const p = fallbackPresetAuditPath();
      appendFileSync(p, line, "utf8");
      rotateFallbackPresetAuditIfNeeded(p);
    } catch (err) {
      console.warn(
        `[broadcasts] failed to write fallback-preset audit: ${(err as Error).message}`,
      );
    }
  }

  // T337 — Force a rotation of the active fallback-preset audit log
  // regardless of its current size, so admins can verify their retention
  // settings produced the expected archive without waiting for the active
  // file to organically fill up. Mirrors the regular rotation: stamps the
  // rotated archive with an ISO-derived suffix, prunes oldest archives
  // beyond the configured max, and returns the fresh stats so the UI can
  // update in place.
  function forceRotateFallbackPresetAudit():
    | { rotated: false; reason: "no_active_file" }
    | { rotated: false; reason: "rename_failed"; message: string }
    | { rotated: true; archiveName: string } {
    let activePath: string;
    try {
      activePath = fallbackPresetAuditPath();
    } catch {
      return { rotated: false, reason: "no_active_file" };
    }
    if (!existsSync(activePath)) {
      return { rotated: false, reason: "no_active_file" };
    }
    const dir = dirname(activePath);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    let archiveName = `broadcast-fallback-default-preset.jsonl.${stamp}`;
    let archivePath = resolve(dir, archiveName);
    if (existsSync(archivePath)) {
      const suffix = randomUUID().slice(0, 4);
      archiveName = `broadcast-fallback-default-preset.jsonl.${stamp}-${suffix}`;
      archivePath = resolve(dir, archiveName);
    }
    try {
      renameSync(activePath, archivePath);
    } catch (err) {
      return {
        rotated: false,
        reason: "rename_failed",
        message: (err as Error).message,
      };
    }
    const maxArchives = fallbackPresetAuditMaxArchives();
    const archives = listFallbackPresetAuditArchives(dir);
    const excess = archives.length - maxArchives;
    if (excess > 0) {
      for (const old of archives.slice(0, excess)) {
        try {
          unlinkSync(resolve(dir, old));
        } catch {
          /* best effort */
        }
      }
    }
    return { rotated: true, archiveName };
  }

  app.post(
    "/api/admin/broadcasts/fallback-default-preset-audit/force-rotate",
    requireRootAdmin,
    async (req, res) => {
      const actor = actorFromReq(req);
      if (!actor) return res.status(401).json({ ok: false, error: "unauthorized" });
      if (!actor.isFounder) {
        return res.status(403).json({
          ok: false,
          error: "forbidden",
          message:
            "Only a founder can force-rotate the fallback-preset audit log.",
        });
      }
      const result = forceRotateFallbackPresetAudit();
      const stats = fallbackPresetAuditStats();
      if (!result.rotated) {
        const status =
          result.reason === "rename_failed" ? 500 : 400;
        return res.status(status).json({
          ok: false,
          error: result.reason,
          message:
            result.reason === "no_active_file"
              ? "There is no active audit file to rotate yet (no preset changes recorded)."
              : (result as { message: string }).message,
          stats: {
            ...stats,
            maxBytes: fallbackPresetAuditMaxBytes(),
            maxArchives: fallbackPresetAuditMaxArchives(),
          },
        });
      }
      res.json({
        ok: true,
        archiveName: result.archiveName,
        stats: {
          ...stats,
          maxBytes: fallbackPresetAuditMaxBytes(),
          maxArchives: fallbackPresetAuditMaxArchives(),
        },
      });
    },
  );

  // T354 — Peek at the parsed contents of a single rotated fallback-preset
  // audit archive without downloading the JSONL. Returns up to the last 50
  // entries (newest-first) so admins can confirm they're grabbing the right
  // file before downloading — or skip the download entirely for casual
  // investigations. Mirrors the founder-gating and strict allow-list of the
  // sibling download/delete routes.
  // T357 — Also accepts `actorId`, `from`, `to`, `limit`, `offset` so admins
  // can search within a noisy archive (mirrors the full-history filters) and
  // page through the entire archive without leaving the dashboard.
  app.get(
    "/api/admin/broadcasts/fallback-default-preset-audit/archives/:archiveName/preview",
    requireRootAdmin,
    async (req, res) => {
      const actor = actorFromReq(req);
      if (!actor) return res.status(401).json({ ok: false, error: "unauthorized" });
      if (!actor.isFounder) {
        return res.status(403).json({
          ok: false,
          error: "forbidden",
          message:
            "Only a founder can preview fallback-preset audit archives.",
        });
      }
      const rawName = String(req.params.archiveName ?? "");
      if (!FALLBACK_PRESET_AUDIT_ARCHIVE_SUFFIX_RE.test(rawName)) {
        return res.status(400).json({
          ok: false,
          error: "invalid_archive_name",
          message: "That archive name is not a recognized rotated audit file.",
        });
      }
      let activePath: string;
      try {
        activePath = fallbackPresetAuditPath();
      } catch {
        return res.status(404).json({
          ok: false,
          error: "no_audit_dir",
          message: "No audit directory exists yet.",
        });
      }
      const dir = dirname(activePath);
      const target = resolve(dir, rawName);
      if (dirname(target) !== dir) {
        return res.status(400).json({
          ok: false,
          error: "invalid_archive_name",
          message: "Archive name resolved outside the audit directory.",
        });
      }
      if (!existsSync(target)) {
        return res.status(404).json({
          ok: false,
          error: "archive_not_found",
          message: "That archive no longer exists (already deleted?).",
        });
      }
      let raw: string;
      try {
        raw = readFileSync(target, "utf8");
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: "read_failed",
          message: (err as Error).message,
        });
      }

      // T357 — Parse optional filter + pagination params. Defaults preserve
      // the original T354 behavior (last 50 entries, no filters).
      const PREVIEW_LIMIT_DEFAULT = 50;
      const PREVIEW_LIMIT_MAX = 200;
      const limitRaw = Number(req.query.limit);
      const offsetRaw = Number(req.query.offset);
      const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(PREVIEW_LIMIT_MAX, Math.floor(limitRaw)))
        : PREVIEW_LIMIT_DEFAULT;
      const offset = Number.isFinite(offsetRaw)
        ? Math.max(0, Math.floor(offsetRaw))
        : 0;
      const actorIdFilter =
        typeof req.query.actorId === "string" &&
        req.query.actorId.trim().length > 0
          ? String(req.query.actorId).trim()
          : null;
      const parseTsParam = (v: unknown): number | null => {
        if (typeof v !== "string" || v.trim().length === 0) return null;
        const n = Date.parse(v.trim());
        return Number.isFinite(n) ? n : null;
      };
      const fromMs = parseTsParam(req.query.from);
      const toMs = parseTsParam(req.query.to);
      // T358 — Optional action-class filter (set / clear). Composes with the
      // T357 actor + date-range filters so admins can isolate "who *cleared*
      // the pin last Tuesday" without skimming every entry. Unknown values
      // collapse to "all" to keep the endpoint forgiving for older clients.
      const actionRaw =
        typeof req.query.action === "string"
          ? req.query.action.trim().toLowerCase()
          : "";
      const actionFilter: "set" | "clear" | null =
        actionRaw === "set" || actionRaw === "clear" ? actionRaw : null;

      type RawEntry = {
        id?: string;
        ts?: string;
        actorId?: string;
        actorType?: string;
        action?: "set" | "clear";
        before?: FallbackPresetSnapshot;
        after?: FallbackPresetSnapshot;
      };

      const lines = raw.split("\n");
      let totalLines = 0;
      let corruptLines = 0;
      const parsedAll: RawEntry[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        totalLines += 1;
        try {
          parsedAll.push(JSON.parse(trimmed) as RawEntry);
        } catch {
          corruptLines += 1;
        }
      }
      parsedAll.reverse();

      // Build the distinct-actor list from the *unfiltered* set so the UI
      // dropdown still lists every actor even when a filter is active.
      const distinctActors = new Map<
        string,
        { actorId: string; actorType: string }
      >();
      for (const e of parsedAll) {
        const aId = e.actorId ?? "unknown";
        const aType = e.actorType ?? "unknown";
        const key = creatorKey(aType, aId);
        if (!distinctActors.has(key))
          distinctActors.set(key, { actorId: aId, actorType: aType });
      }

      const dateRangeActive = fromMs !== null || toMs !== null;
      const inRange = (e: RawEntry) => {
        if (!dateRangeActive) return true;
        const t = e.ts ? Date.parse(e.ts) : NaN;
        if (!Number.isFinite(t)) return false;
        if (fromMs !== null && t < fromMs) return false;
        if (toMs !== null && t > toMs) return false;
        return true;
      };
      let parsed = parsedAll;
      if (dateRangeActive) parsed = parsed.filter(inRange);
      if (actorIdFilter)
        parsed = parsed.filter((e) => (e.actorId ?? "unknown") === actorIdFilter);
      // T361 — Compute set/clear counts *before* applying the action filter so
      // the inspect-dialog summary can show the breakdown (e.g. "Updates: 2 ·
      // Cleared: 20") that respects the current actor + date investigation
      // scope. We deliberately ignore the action filter itself — otherwise
      // toggling the filter would zero out one side of the breakdown.
      let setCount = 0;
      let clearCount = 0;
      for (const e of parsed) {
        if ((e.action ?? "set") === "clear") clearCount += 1;
        else setCount += 1;
      }
      if (actionFilter)
        parsed = parsed.filter((e) => (e.action ?? "set") === actionFilter);
      const matchedEntries = parsed.length;
      const slice = parsed.slice(offset, offset + limit);

      const staffIds = new Set<string>();
      for (const e of slice) {
        if (e.actorType === "staff" && e.actorId) staffIds.add(e.actorId);
      }
      for (const { actorId, actorType } of distinctActors.values()) {
        if (actorType === "staff" && actorId) staffIds.add(actorId);
      }
      const actorMap = new Map<string, CreatorProfile>();
      if (staffIds.size > 0) {
        try {
          const staffRows = await db
            .select({
              id: adminStaff.id,
              email: adminStaff.email,
              displayName: adminStaff.displayName,
              role: adminStaff.role,
              active: adminStaff.active,
              disabledAt: adminStaff.disabledAt,
            })
            .from(adminStaff)
            .where(inArray(adminStaff.id, Array.from(staffIds)));
          for (const s of staffRows) {
            actorMap.set(creatorKey("staff", s.id), {
              actorId: s.id,
              actorType: "staff",
              displayName: s.displayName,
              email: s.email,
              role: s.role,
              status: s.active ? "active" : "disabled",
              disabledAt: s.disabledAt
                ? (s.disabledAt as Date).toISOString?.() ?? String(s.disabledAt)
                : null,
            });
          }
        } catch {
          /* best-effort actor resolution */
        }
      }

      const resolveProfile = (
        actorId: string,
        actorType: string,
      ): CreatorProfile => {
        const key = creatorKey(actorType, actorId);
        if (actorMap.has(key)) return actorMap.get(key)!;
        if (actorType === "root_admin") return rootAdminCreatorProfile(actorId);
        return unknownCreatorProfile(actorId, actorType);
      };

      const entries = slice.map((e) => {
        const actorId = e.actorId ?? "unknown";
        const actorType = e.actorType ?? "unknown";
        return {
          id: e.id ?? null,
          ts: e.ts ?? null,
          actorId,
          actorType,
          actor: resolveProfile(actorId, actorType),
          action: e.action ?? "set",
          before: e.before ?? null,
          after: e.after ?? null,
        };
      });

      const actors = Array.from(distinctActors.values())
        .map(({ actorId, actorType }) => ({
          actorId,
          actorType,
          actor: resolveProfile(actorId, actorType),
        }))
        .sort((a, b) => a.actor.displayName.localeCompare(b.actor.displayName));

      let bytes = 0;
      try {
        bytes = statSync(target).size;
      } catch {
        /* best-effort */
      }

      res.json({
        ok: true,
        archiveName: rawName,
        bytes,
        totalEntries: totalLines,
        matchedEntries,
        // T361 — set/clear breakdown for the current actor + date scope,
        // *ignoring* the action filter so both sides remain visible.
        setCount,
        clearCount,
        corruptLines,
        previewLimit: limit,
        limit,
        offset,
        hasMore: offset + entries.length < matchedEntries,
        actorId: actorIdFilter,
        from: fromMs !== null ? new Date(fromMs).toISOString() : null,
        to: toMs !== null ? new Date(toMs).toISOString() : null,
        action: actionFilter,
        actors,
        entries,
      });
    },
  );

  // T352 — Download a single rotated fallback-preset audit archive before
  // deleting it. Founders sometimes want to keep a local copy of noisy or
  // test data they're about to prune. The endpoint streams the raw JSONL
  // file with its original archive filename so the local copy is named
  // identically to what the dashboard shows. Founder-gated to match the
  // sibling delete/rotate/retention controls.
  app.get(
    "/api/admin/broadcasts/fallback-default-preset-audit/archives/:archiveName",
    requireRootAdmin,
    async (req, res) => {
      const actor = actorFromReq(req);
      if (!actor) return res.status(401).json({ ok: false, error: "unauthorized" });
      if (!actor.isFounder) {
        return res.status(403).json({
          ok: false,
          error: "forbidden",
          message:
            "Only a founder can download fallback-preset audit archives.",
        });
      }
      const rawName = String(req.params.archiveName ?? "");
      if (!FALLBACK_PRESET_AUDIT_ARCHIVE_SUFFIX_RE.test(rawName)) {
        return res.status(400).json({
          ok: false,
          error: "invalid_archive_name",
          message: "That archive name is not a recognized rotated audit file.",
        });
      }
      let activePath: string;
      try {
        activePath = fallbackPresetAuditPath();
      } catch {
        return res.status(404).json({
          ok: false,
          error: "no_audit_dir",
          message: "No audit directory exists yet.",
        });
      }
      const dir = dirname(activePath);
      const target = resolve(dir, rawName);
      if (dirname(target) !== dir) {
        return res.status(400).json({
          ok: false,
          error: "invalid_archive_name",
          message: "Archive name resolved outside the audit directory.",
        });
      }
      if (!existsSync(target)) {
        return res.status(404).json({
          ok: false,
          error: "archive_not_found",
          message: "That archive no longer exists (already deleted?).",
        });
      }
      let size = 0;
      try {
        size = statSync(target).size;
      } catch {
        /* fall through — Content-Length is optional */
      }
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${rawName}"`,
      );
      if (size > 0) res.setHeader("Content-Length", String(size));
      res.setHeader("Cache-Control", "no-store");
      const stream = createReadStream(target);
      stream.on("error", (err) => {
        if (!res.headersSent) {
          res.status(500).json({
            ok: false,
            error: "stream_failed",
            message: (err as Error).message,
          });
        } else {
          res.destroy(err);
        }
      });
      stream.pipe(res);
    },
  );

  // T355 — Bundle every rotated fallback-preset audit archive (and,
  // optionally, the current active JSONL) into a single ZIP for evidence
  // retention or quarterly audits. Without this, grabbing every archive
  // one click at a time gets tedious. The ZIP filename is timestamped so
  // consecutive snapshots don't collide. Founder-gated to match the
  // sibling single-archive download / delete / force-rotate controls.
  app.get(
    "/api/admin/broadcasts/fallback-default-preset-audit/archives-bundle",
    requireRootAdmin,
    async (req, res) => {
      const actor = actorFromReq(req);
      if (!actor) return res.status(401).json({ ok: false, error: "unauthorized" });
      if (!actor.isFounder) {
        return res.status(403).json({
          ok: false,
          error: "forbidden",
          message:
            "Only a founder can download the fallback-preset audit bundle.",
        });
      }
      const includeActive =
        String(req.query.includeActive ?? "1") !== "0" &&
        String(req.query.includeActive ?? "1").toLowerCase() !== "false";
      let activePath: string;
      try {
        activePath = fallbackPresetAuditPath();
      } catch {
        return res.status(404).json({
          ok: false,
          error: "no_audit_dir",
          message: "No audit directory exists yet.",
        });
      }
      const dir = dirname(activePath);
      const archives = listFallbackPresetAuditArchives(dir);
      const activeExists = existsSync(activePath);
      if (archives.length === 0 && !(includeActive && activeExists)) {
        return res.status(404).json({
          ok: false,
          error: "no_files",
          message:
            "There are no rotated archives (and no active file) to bundle yet.",
        });
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const zipName = `broadcast-fallback-default-preset-audit-${stamp}.zip`;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${zipName}"`,
      );
      res.setHeader("Cache-Control", "no-store");
      // Lazy import so we don't pay the archiver cost on every request to
      // an unrelated broadcasts route.
      const archiver = (await import("archiver")).default;
      const zip = archiver("zip", { zlib: { level: 9 } });
      zip.on("error", (err: Error) => {
        if (!res.headersSent) {
          res.status(500).json({
            ok: false,
            error: "zip_failed",
            message: err.message,
          });
        } else {
          res.destroy(err);
        }
      });
      zip.pipe(res);
      // Newest-first inside the ZIP so unpacking surfaces the most
      // recent rotation at the top, matching the dashboard ordering.
      const orderedArchives = [...archives].reverse();
      for (const name of orderedArchives) {
        const p = resolve(dir, name);
        if (dirname(p) !== dir) continue;
        if (!existsSync(p)) continue;
        zip.file(p, { name: `archives/${name}` });
      }
      if (includeActive && activeExists) {
        zip.file(activePath, {
          name: `active/${basename(activePath)}`,
        });
      }
      await zip.finalize();
    },
  );

  // T351 — Targeted deletion of a single rotated fallback-preset audit
  // archive. Without this, admins can only prune archives indirectly by
  // lowering "Max archives kept" or by force-rotating until the oldest
  // falls off. When a specific archive contains noisy/test data the admin
  // wants gone right now, this gives them a one-click path. Mirrors the
  // founder-only gating used by force-rotate so it shares the same trust
  // boundary as the rest of the audit-retention controls.
  app.delete(
    "/api/admin/broadcasts/fallback-default-preset-audit/archives/:archiveName",
    requireRootAdmin,
    async (req, res) => {
      const actor = actorFromReq(req);
      if (!actor) return res.status(401).json({ ok: false, error: "unauthorized" });
      if (!actor.isFounder) {
        return res.status(403).json({
          ok: false,
          error: "forbidden",
          message:
            "Only a founder can delete fallback-preset audit archives.",
        });
      }
      const rawName = String(req.params.archiveName ?? "");
      // Validate against the same suffix regex used to list archives so
      // we can never be tricked into deleting the active file, an unrelated
      // file, or anything outside the audit directory.
      if (!FALLBACK_PRESET_AUDIT_ARCHIVE_SUFFIX_RE.test(rawName)) {
        return res.status(400).json({
          ok: false,
          error: "invalid_archive_name",
          message: "That archive name is not a recognized rotated audit file.",
        });
      }
      let activePath: string;
      try {
        activePath = fallbackPresetAuditPath();
      } catch {
        return res.status(404).json({
          ok: false,
          error: "no_audit_dir",
          message: "No audit directory exists yet.",
        });
      }
      const dir = dirname(activePath);
      const target = resolve(dir, rawName);
      // Defense-in-depth: ensure the resolved path stays inside the audit
      // directory even though the regex already rules out path separators.
      if (dirname(target) !== dir) {
        return res.status(400).json({
          ok: false,
          error: "invalid_archive_name",
          message: "Archive name resolved outside the audit directory.",
        });
      }
      if (!existsSync(target)) {
        return res.status(404).json({
          ok: false,
          error: "archive_not_found",
          message: "That archive no longer exists (already deleted?).",
          stats: {
            ...fallbackPresetAuditStats(),
            maxBytes: fallbackPresetAuditMaxBytes(),
            maxArchives: fallbackPresetAuditMaxArchives(),
          },
        });
      }
      try {
        unlinkSync(target);
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: "unlink_failed",
          message: (err as Error).message,
        });
      }
      res.json({
        ok: true,
        deleted: rawName,
        stats: {
          ...fallbackPresetAuditStats(),
          maxBytes: fallbackPresetAuditMaxBytes(),
          maxArchives: fallbackPresetAuditMaxArchives(),
        },
      });
    },
  );

  app.put(
    "/api/admin/broadcasts/fallback-default-preset",
    requireRootAdmin,
    async (req, res) => {
      const actor = actorFromReq(req);
      if (!actor) return res.status(401).json({ ok: false, error: "unauthorized" });
      if (!actor.isFounder) {
        return res.status(403).json({
          ok: false,
          error: "forbidden",
          message: "Only a founder can pin the team-default fallback filters.",
        });
      }
      const parsed = fallbackPresetBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          error: "invalid_body",
          details: parsed.error.flatten(),
        });
      }
      const data = parsed.data;
      const before = snapshotFromPresetRow(await fetchFallbackPresetRow());
      const now = new Date();
      const [row] = await db
        .insert(adminBroadcastFallbackDefaultPreset)
        .values({
          id: FALLBACK_PRESET_SINGLETON_ID,
          dryRun: data.dryRun,
          status: data.status || "all",
          packageId: data.packageId || "",
          updatedByActorId: actor.id,
          updatedByActorType: actor.type,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: adminBroadcastFallbackDefaultPreset.id,
          set: {
            dryRun: data.dryRun,
            status: data.status || "all",
            packageId: data.packageId || "",
            updatedByActorId: actor.id,
            updatedByActorType: actor.type,
            updatedAt: now,
          },
        })
        .returning();
      const after = snapshotFromPresetRow(row);
      if (!presetSnapshotsEqual(before, after)) {
        appendFallbackPresetAudit({
          actorId: actor.id,
          actorType: actor.type,
          action: "set",
          before,
          after,
        });
      }
      const preset = await serializeFallbackPreset(row);
      res.json({ ok: true, preset });
    },
  );

  app.delete(
    "/api/admin/broadcasts/fallback-default-preset",
    requireRootAdmin,
    async (req, res) => {
      const actor = actorFromReq(req);
      if (!actor) return res.status(401).json({ ok: false, error: "unauthorized" });
      if (!actor.isFounder) {
        return res.status(403).json({
          ok: false,
          error: "forbidden",
          message: "Only a founder can clear the team-default fallback filters.",
        });
      }
      const before = snapshotFromPresetRow(await fetchFallbackPresetRow());
      await db
        .delete(adminBroadcastFallbackDefaultPreset)
        .where(eq(adminBroadcastFallbackDefaultPreset.id, FALLBACK_PRESET_SINGLETON_ID));
      if (before !== null) {
        appendFallbackPresetAudit({
          actorId: actor.id,
          actorType: actor.type,
          action: "clear",
          before,
          after: null,
        });
      }
      res.json({ ok: true, preset: null });
    },
  );

  // T316 — Admin reader for the fallback-preset audit log. Returns entries
  // newest-first with simple limit pagination. Staff actor display names
  // are resolved from adminStaff so the UI can label rows.
  app.get(
    "/api/admin/broadcasts/fallback-default-preset-audit",
    requireRootAdmin,
    async (req, res) => {
      const actor = actorFromReq(req);
      if (!actor) return res.status(401).json({ ok: false, error: "unauthorized" });
      const limitRaw = Number(req.query.limit);
      const offsetRaw = Number(req.query.offset);
      const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(200, Math.floor(limitRaw)))
        : 20;
      const offset = Number.isFinite(offsetRaw)
        ? Math.max(0, Math.floor(offsetRaw))
        : 0;
      const actorIdFilter =
        typeof req.query.actorId === "string" && req.query.actorId.trim().length > 0
          ? String(req.query.actorId).trim()
          : null;
      // T326 — Optional ISO timestamp range filter so admins can narrow the
      // history to a specific incident window ("what changed last week",
      // "during yesterday's outage"). Invalid values are ignored (treated as
      // unset) rather than erroring so a malformed query never blanks the UI.
      const parseTsParam = (v: unknown): number | null => {
        if (typeof v !== "string" || v.trim().length === 0) return null;
        const n = Date.parse(v.trim());
        return Number.isFinite(n) ? n : null;
      };
      const fromMs = parseTsParam(req.query.from);
      const toMs = parseTsParam(req.query.to);

      type RawEntry = {
        id?: string;
        ts?: string;
        actorId?: string;
        actorType?: string;
        action?: "set" | "clear";
        before?: FallbackPresetSnapshot;
        after?: FallbackPresetSnapshot;
      };

      const parseRawLines = (raw: string): RawEntry[] => {
        const out: RawEntry[] = [];
        for (const line of raw.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            out.push(JSON.parse(trimmed) as RawEntry);
          } catch {
            /* skip malformed line */
          }
        }
        return out;
      };

      const p = fallbackPresetAuditPath();
      // T325 — Load the active log and every rotated archive so admins can
      // page through the entire fallback preset history (not just the latest
      // 10). Archives are listed oldest→newest, so we concat them first then
      // the active file, then reverse to get newest-first. We must load all
      // archives (not just enough to fill the requested limit) so the
      // returned `total` is accurate across the whole history and so the
      // client can keep paging deeper than the per-page limit cap.
      // T326 — If a date range is active, drop out-of-range entries as we
      // read each file so the in-memory set stays small.
      const dir = dirname(p);
      const dateRangeActive = fromMs !== null || toMs !== null;
      const inRange = (e: RawEntry) => {
        if (!dateRangeActive) return true;
        const t = e.ts ? Date.parse(e.ts) : NaN;
        if (!Number.isFinite(t)) return false;
        if (fromMs !== null && t < fromMs) return false;
        if (toMs !== null && t > toMs) return false;
        return true;
      };
      let parsed: RawEntry[] = [];
      const archives = listFallbackPresetAuditArchives(dir);
      for (const name of archives) {
        try {
          const fromArchive = parseRawLines(
            readFileSync(resolve(dir, name), "utf8"),
          );
          parsed = parsed.concat(
            dateRangeActive ? fromArchive.filter(inRange) : fromArchive,
          );
        } catch {
          /* skip unreadable archive */
        }
      }
      if (existsSync(p)) {
        const fromActive = parseRawLines(readFileSync(p, "utf8"));
        parsed = parsed.concat(
          dateRangeActive ? fromActive.filter(inRange) : fromActive,
        );
      }
      parsed.reverse();

      // Collect distinct actors across the entire (unfiltered) log so the UI
      // can populate an actor dropdown even when a filter is currently active.
      const distinctActors = new Map<string, { actorId: string; actorType: string }>();
      for (const e of parsed) {
        const aId = e.actorId ?? "unknown";
        const aType = e.actorType ?? "unknown";
        const key = creatorKey(aType, aId);
        if (!distinctActors.has(key)) distinctActors.set(key, { actorId: aId, actorType: aType });
      }

      if (actorIdFilter) {
        parsed = parsed.filter((e) => (e.actorId ?? "unknown") === actorIdFilter);
      }
      const total = parsed.length;
      const slice = parsed.slice(offset, offset + limit);

      const staffIds = new Set<string>();
      for (const e of slice) {
        if (e.actorType === "staff" && e.actorId) staffIds.add(e.actorId);
      }
      for (const { actorId, actorType } of distinctActors.values()) {
        if (actorType === "staff" && actorId) staffIds.add(actorId);
      }
      const actorMap = new Map<string, CreatorProfile>();
      if (staffIds.size > 0) {
        const staffRows = await db
          .select({
            id: adminStaff.id,
            email: adminStaff.email,
            displayName: adminStaff.displayName,
            role: adminStaff.role,
            active: adminStaff.active,
            disabledAt: adminStaff.disabledAt,
          })
          .from(adminStaff)
          .where(inArray(adminStaff.id, Array.from(staffIds)));
        for (const s of staffRows) {
          actorMap.set(creatorKey("staff", s.id), {
            actorId: s.id,
            actorType: "staff",
            displayName: s.displayName,
            email: s.email,
            role: s.role,
            status: s.active ? "active" : "disabled",
            disabledAt: s.disabledAt
              ? (s.disabledAt as Date).toISOString?.() ?? String(s.disabledAt)
              : null,
          });
        }
      }

      const entries = slice.map((e) => {
        const actorId = e.actorId ?? "unknown";
        const actorType = e.actorType ?? "unknown";
        let actorProfile: CreatorProfile;
        const key = creatorKey(actorType, actorId);
        if (actorMap.has(key)) {
          actorProfile = actorMap.get(key)!;
        } else if (actorType === "root_admin") {
          actorProfile = rootAdminCreatorProfile(actorId);
        } else {
          actorProfile = unknownCreatorProfile(actorId, actorType);
        }
        return {
          id: e.id ?? null,
          ts: e.ts ?? null,
          actorId,
          actorType,
          actor: actorProfile,
          action: e.action ?? "set",
          before: e.before ?? null,
          after: e.after ?? null,
        };
      });

      // Build the actors list (sorted by displayName) for the UI dropdown.
      const actors = Array.from(distinctActors.values())
        .map(({ actorId, actorType }) => {
          const key = creatorKey(actorType, actorId);
          let profile: CreatorProfile;
          if (actorMap.has(key)) {
            profile = actorMap.get(key)!;
          } else if (actorType === "root_admin") {
            profile = rootAdminCreatorProfile(actorId);
          } else {
            profile = unknownCreatorProfile(actorId, actorType);
          }
          return { actorId, actorType, actor: profile };
        })
        .sort((a, b) => a.actor.displayName.localeCompare(b.actor.displayName));

      // T323 — Include on-disk audit-log stats so the Broadcasts admin panel
      // can show the same active/archive/total breakdown that the cover- and
      // media-sweep panels already surface.
      const stats = fallbackPresetAuditStats();
      const maxBytes = fallbackPresetAuditMaxBytes();
      const maxArchives = fallbackPresetAuditMaxArchives();
      res.json({
        ok: true,
        entries,
        total,
        limit,
        offset,
        hasMore: offset + entries.length < total,
        actorId: actorIdFilter,
        from: fromMs !== null ? new Date(fromMs).toISOString() : null,
        to: toMs !== null ? new Date(toMs).toISOString() : null,
        actors,
        stats: { ...stats, maxBytes, maxArchives },
      });
    },
  );

  // T324 — Admin-tunable retention for the fallback-preset audit log. Mirrors
  // the cover- and media-sweep `audit-retention` routes so founders can
  // configure all three audit logs the same way from the dashboard. The GET
  // also reports the active file size + rotated archive count so the UI can
  // warn before shrinking retention enough to immediately prune history.
  app.get(
    "/api/admin/broadcasts/fallback-default-preset-audit/retention",
    requireRootAdmin,
    async (_req, res) => {
      const status = await fallbackPresetAuditSettingsService.getStatus();
      let currentArchiveCount = 0;
      let activeAuditBytes: number | null = null;
      try {
        const auditPath = fallbackPresetAuditPath();
        const dir = dirname(auditPath);
        currentArchiveCount = listFallbackPresetAuditArchives(dir).length;
        try {
          activeAuditBytes = statSync(auditPath).size;
        } catch {
          activeAuditBytes = 0;
        }
      } catch {
        /* best-effort — leave defaults */
      }
      res.json({
        ok: true,
        status: { ...status, currentArchiveCount, activeAuditBytes },
      });
    },
  );

  app.patch(
    "/api/admin/broadcasts/fallback-default-preset-audit/retention",
    requireRootAdmin,
    async (req: any, res) => {
      const actor = actorFromReq(req);
      if (!actor) return res.status(401).json({ ok: false, error: "unauthorized" });
      if (!actor.isFounder) {
        return res.status(403).json({
          ok: false,
          error: "forbidden",
          message:
            "Only a founder can change fallback-preset audit retention.",
        });
      }
      const body = (req.body ?? {}) as {
        maxBytes?: unknown;
        maxArchives?: unknown;
      };
      const updates: Array<"bytes" | "archives"> = [];
      const updatedBy =
        req.session?.adminActorId || req.session?.userId || actor.id;
      try {
        if (
          body.maxBytes !== undefined &&
          body.maxBytes !== null &&
          body.maxBytes !== ""
        ) {
          const n = Number(body.maxBytes);
          if (!Number.isFinite(n)) {
            return res
              .status(400)
              .json({ ok: false, error: "invalid_max_bytes" });
          }
          await fallbackPresetAuditSettingsService.setAuditMaxBytes(
            n,
            updatedBy,
          );
          updates.push("bytes");
        }
        if (
          body.maxArchives !== undefined &&
          body.maxArchives !== null &&
          body.maxArchives !== ""
        ) {
          const n = Number(body.maxArchives);
          if (!Number.isFinite(n)) {
            return res
              .status(400)
              .json({ ok: false, error: "invalid_max_archives" });
          }
          await fallbackPresetAuditSettingsService.setAuditMaxArchives(
            n,
            updatedBy,
          );
          updates.push("archives");
        }
        if (updates.length === 0) {
          return res.status(400).json({ ok: false, error: "no_fields" });
        }
        const status = await fallbackPresetAuditSettingsService.getStatus();
        let currentArchiveCount = 0;
        let activeAuditBytes: number | null = null;
        try {
          const auditPath = fallbackPresetAuditPath();
          const dir = dirname(auditPath);
          currentArchiveCount = listFallbackPresetAuditArchives(dir).length;
          try {
            activeAuditBytes = statSync(auditPath).size;
          } catch {
            activeAuditBytes = 0;
          }
        } catch {
          /* best-effort */
        }
        res.json({
          ok: true,
          updated: updates,
          status: { ...status, currentArchiveCount, activeAuditBytes },
        });
      } catch (err) {
        const message = (err as Error).message;
        res.status(400).json({ ok: false, error: message || "update_failed" });
      }
    },
  );

  // Note: dirname is imported but reserved for future per-broadcast assets dir.
  // Note: `and` and `drizzleSql` are imported for potential future filters.
  void dirname;
  void drizzleSql;
}
