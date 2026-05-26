/**
 * Fallback-preset audit retention settings.
 *
 * The fallback-default-preset audit log (`broadcast-fallback-default-preset.jsonl`)
 * rotates the same way as the cover- and media-sweep audit logs. This small
 * service mirrors the retention-cache pattern used by
 * `cover-orphan-alert-service` so the synchronous rotation path in
 * `server/routes/broadcasts.ts` can read DB-persisted values without an
 * awaited DB hit on every append.
 *
 * Resolution order:
 *   cached DB value → env var (FALLBACK_PRESET_AUDIT_MAX_BYTES /
 *   FALLBACK_PRESET_AUDIT_MAX_ARCHIVES) → platform default.
 *
 * Decision (task #334, see `docs/RELEASE_NOTES.md`) — zero archives is NOT honoured.
 * The legacy env var `FALLBACK_PRESET_AUDIT_MAX_ARCHIVES=0` meant
 * "rotate and immediately delete the old file" (no archives kept). The
 * DB-backed setting and the cover/media sweep services all enforce a
 * minimum of 1 because an audit log with zero retained archives defeats
 * the purpose of auditing — every rotation wipes the prior evidence and
 * leaves only the live tail. We intentionally reject 0 here too:
 *   - `envPositiveInt` below treats 0 (and any non-positive value) as
 *     "unset", so on upgrade a deployment that had the env set to 0
 *     silently falls through to the platform default (4 archives) rather
 *     than getting the surprising "1 archive kept after first rotation"
 *     behaviour that the new minimum would otherwise produce.
 *   - `setAuditMaxArchives` rejects any value < AUDIT_MAX_ARCHIVES_MIN
 *     (1) via the `out_of_range` error.
 * Founders who genuinely want "rotate and delete" should disable the
 * audit log at the source rather than configuring zero retention.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { systemSettings } from "@shared/schema";

const AUDIT_MAX_BYTES_KEY = "fallback_preset_audit_max_bytes";
const AUDIT_MAX_ARCHIVES_KEY = "fallback_preset_audit_max_archives";

const AUDIT_MAX_BYTES_DEFAULT = 1024 * 1024; // 1 MiB
const AUDIT_MAX_ARCHIVES_DEFAULT = 4;

// Guardrails so a bad admin value can't make the audit unbounded or so
// small that every line rotates. Matches cover/media sweep limits.
const AUDIT_MAX_BYTES_MIN = 64 * 1024;
const AUDIT_MAX_BYTES_MAX = 100 * 1024 * 1024;
const AUDIT_MAX_ARCHIVES_MIN = 1;
const AUDIT_MAX_ARCHIVES_MAX = 100;

export const FALLBACK_PRESET_AUDIT_LIMITS = {
  bytesMin: AUDIT_MAX_BYTES_MIN,
  bytesMax: AUDIT_MAX_BYTES_MAX,
  archivesMin: AUDIT_MAX_ARCHIVES_MIN,
  archivesMax: AUDIT_MAX_ARCHIVES_MAX,
  bytesDefault: AUDIT_MAX_BYTES_DEFAULT,
  archivesDefault: AUDIT_MAX_ARCHIVES_DEFAULT,
} as const;

function envPositiveInt(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const n = Number(raw);
  // `n <= 0` deliberately includes 0: see file header (task #334).
  // The legacy env var accepted 0 to mean "rotate and delete"; we no
  // longer honour that — 0 is treated as unset so callers fall through
  // to the platform default rather than the new minimum of 1.
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export interface FallbackPresetAuditRetentionStatus {
  auditMaxBytes: number;
  auditMaxArchives: number;
  auditMaxBytesSource: "db" | "env" | "default";
  auditMaxArchivesSource: "db" | "env" | "default";
  auditLimits: typeof FALLBACK_PRESET_AUDIT_LIMITS;
}

class FallbackPresetAuditSettingsService {
  private cachedAuditMaxBytes: number | null = null;
  private cachedAuditMaxArchives: number | null = null;
  private auditCacheLoadPromise: Promise<void> | null = null;

  private async loadAuditRetentionCache(): Promise<void> {
    try {
      const rows = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, AUDIT_MAX_BYTES_KEY))
        .limit(1);
      if (rows.length > 0) {
        const n = Number.parseInt(rows[0].value, 10);
        if (
          Number.isFinite(n) &&
          n >= AUDIT_MAX_BYTES_MIN &&
          n <= AUDIT_MAX_BYTES_MAX
        ) {
          this.cachedAuditMaxBytes = n;
        }
      }
    } catch {
      /* leave cache untouched; sync getter will fall back to env/default */
    }
    try {
      const rows = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, AUDIT_MAX_ARCHIVES_KEY))
        .limit(1);
      if (rows.length > 0) {
        const n = Number.parseInt(rows[0].value, 10);
        if (
          Number.isFinite(n) &&
          n >= AUDIT_MAX_ARCHIVES_MIN &&
          n <= AUDIT_MAX_ARCHIVES_MAX
        ) {
          this.cachedAuditMaxArchives = n;
        }
      }
    } catch {
      /* leave cache untouched */
    }
  }

  ensureAuditCacheLoaded(): Promise<void> {
    if (!this.auditCacheLoadPromise) {
      this.auditCacheLoadPromise = this.loadAuditRetentionCache();
    }
    return this.auditCacheLoadPromise;
  }

  getAuditMaxBytesSync(): number {
    if (this.cachedAuditMaxBytes != null) return this.cachedAuditMaxBytes;
    return (
      envPositiveInt("FALLBACK_PRESET_AUDIT_MAX_BYTES") ??
      AUDIT_MAX_BYTES_DEFAULT
    );
  }

  getAuditMaxArchivesSync(): number {
    if (this.cachedAuditMaxArchives != null) return this.cachedAuditMaxArchives;
    return (
      envPositiveInt("FALLBACK_PRESET_AUDIT_MAX_ARCHIVES") ??
      AUDIT_MAX_ARCHIVES_DEFAULT
    );
  }

  getAuditMaxBytesSource(): "db" | "env" | "default" {
    if (this.cachedAuditMaxBytes != null) return "db";
    return envPositiveInt("FALLBACK_PRESET_AUDIT_MAX_BYTES") != null
      ? "env"
      : "default";
  }

  getAuditMaxArchivesSource(): "db" | "env" | "default" {
    if (this.cachedAuditMaxArchives != null) return "db";
    return envPositiveInt("FALLBACK_PRESET_AUDIT_MAX_ARCHIVES") != null
      ? "env"
      : "default";
  }

  async setAuditMaxBytes(value: number, updatedBy?: string): Promise<number> {
    if (!Number.isFinite(value)) throw new Error("invalid_value");
    const v = Math.floor(value);
    if (v < AUDIT_MAX_BYTES_MIN || v > AUDIT_MAX_BYTES_MAX) {
      throw new Error("out_of_range");
    }
    await db
      .insert(systemSettings)
      .values({ key: AUDIT_MAX_BYTES_KEY, value: String(v), updatedBy })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: String(v), updatedBy, updatedAt: new Date() },
      });
    this.cachedAuditMaxBytes = v;
    return v;
  }

  async setAuditMaxArchives(
    value: number,
    updatedBy?: string,
  ): Promise<number> {
    if (!Number.isFinite(value)) throw new Error("invalid_value");
    const v = Math.floor(value);
    if (v < AUDIT_MAX_ARCHIVES_MIN || v > AUDIT_MAX_ARCHIVES_MAX) {
      throw new Error("out_of_range");
    }
    await db
      .insert(systemSettings)
      .values({ key: AUDIT_MAX_ARCHIVES_KEY, value: String(v), updatedBy })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: String(v), updatedBy, updatedAt: new Date() },
      });
    this.cachedAuditMaxArchives = v;
    return v;
  }

  async getStatus(): Promise<FallbackPresetAuditRetentionStatus> {
    await this.ensureAuditCacheLoaded();
    return {
      auditMaxBytes: this.getAuditMaxBytesSync(),
      auditMaxArchives: this.getAuditMaxArchivesSync(),
      auditMaxBytesSource: this.getAuditMaxBytesSource(),
      auditMaxArchivesSource: this.getAuditMaxArchivesSource(),
      auditLimits: FALLBACK_PRESET_AUDIT_LIMITS,
    };
  }
}

export const fallbackPresetAuditSettingsService =
  new FallbackPresetAuditSettingsService();
