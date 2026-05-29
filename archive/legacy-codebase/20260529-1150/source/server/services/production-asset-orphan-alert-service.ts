/**
 * Task #782 — Production-asset orphan alert + reconcile helpers.
 *
 * The DELETE /api/admin/production-assets/:id route deletes object-storage
 * bytes BEFORE the DB row. If `storage.deleteArchivedAsset()` throws AFTER
 * the bytes were already removed, the row is left orphaned: status still
 * `archived`, but the underlying object is gone. Without explicit
 * recovery this only surfaces as a 500 to the admin who tried the delete.
 *
 * This service:
 *  - Fires a one-shot platform_alerts row + emails active root admins
 *    when the gap is hit (`fireOrphanedRowAlert`).
 *  - Scans archived rows whose object bytes are missing
 *    (`listOrphanedRows`) so the founder console can show a backlog.
 *  - Reconciles a single orphan (`reconcileOrphan`) by either
 *    hard-deleting the DB row + cascade audit-log (`hard_delete`) or
 *    confirming the bytes have come back (`relink_object`, no-op when
 *    they have, error otherwise).
 *
 * Modeled on `cover-orphan-alert-service.ts`. Failures inside the alert
 * path are swallowed (and logged) so they cannot turn a "delete worked
 * but cleanup failed" into "delete and alert both crashed."
 */

import { createHash } from "node:crypto";
import { and, count, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  adminStaff,
  moderationLogs,
  platformAlerts,
  productionAssetAuditLog,
  productionAssetOrphanSweepFlappingConfigHistory,
  productionAssetOrphanSweepFlappingSnoozes,
  productionAssetOrphanSweepThresholdChanges,
  productionAssetSweepFlappingConfigChanges,
  productionAssets,
  systemSettings,
} from "@shared/schema";
import { panicButtonService } from "./panic-button-service";
import { EmailService } from "./email-service";
import { downloadAssetBytes, headAsset } from "./production-asset-storage";
import {
  getAuditEmailFailureAlertSnooze,
  isAuditEmailFailureAlertSnoozed,
  listAuditEmailFailureAlertSnoozeHistory,
  setAuditEmailFailureAlertSnooze,
  type AuditEmailFailureAlertSnoozeConfig,
  type AuditEmailFailureAlertSnoozeHistoryEntry,
} from "./audit-email-failure-alert-snooze";

export const PRODUCTION_ASSET_ORPHAN_ALERT_TYPE =
  "production_asset_delete_orphaned";

/**
 * Task #785 — scheduled-sweep alert type. Distinct from the post-failed-
 * delete alert above so the founder dashboard does not conflate a single
 * crashed delete with "the daily sweep keeps finding orphans."
 */
export const PRODUCTION_ASSET_ORPHAN_SWEEP_ALERT_TYPE =
  "production_asset_orphan_sweep";

/**
 * Task #792 — flapping alert type. Fired when the scheduled sweep keeps
 * auto-clearing because something is repeatedly leaving orphans behind.
 * Distinct from the per-crossing sweep alert so the founder console can
 * tell "one bad day" apart from "the sweep itself is unhealthy."
 */
export const PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_ALERT_TYPE =
  "production_asset_orphan_sweep_flapping";

/**
 * Task #805 — recurring digest fired while the flapping latch stays
 * stuck. The one-shot flapping alert above only pages on the
 * false → true transition; without this digest a sweep that has been
 * flapping for days would silently sit unnoticed because nobody
 * re-checks the founder dashboard.
 *
 * Distinct alert type so the founder console can tell "the latch just
 * flipped" apart from "the latch has been stuck for N days." Snooze is
 * persisted via the shared audit-email failure-alert snooze helper
 * (Task #560/613) under `FLAPPING_DIGEST_SNOOZE_KEY`, which inherits
 * the same 90-day cap + append-only history table.
 */
export const PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_ALERT_TYPE =
  "production_asset_orphan_sweep_flapping_digest";

export const PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_SNOOZE_KEY =
  "production_asset_orphan_sweep_flapping_digest_snooze";

const FLAPPING_DIGEST_LAST_SENT_AT_KEY =
  "production_asset_orphan_sweep_flapping_digest_last_sent_at";
const FLAPPING_DIGEST_INTERVAL_MS_DEFAULT = 24 * 60 * 60 * 1000;
function flappingDigestIntervalMs(): number {
  const raw = Number(
    process.env.PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_INTERVAL_MS,
  );
  if (Number.isFinite(raw) && raw >= 60_000) return Math.floor(raw);
  return FLAPPING_DIGEST_INTERVAL_MS_DEFAULT;
}

const THRESHOLD_KEY = "production_asset_orphan_alert_threshold";
const THRESHOLD_DEFAULT = 1;

/**
 * Task #789 — id used to enroll the scheduled-sweep alert in founder
 * PTO mode. Aligned with the sweep alert type so the admin UI label
 * matches what actually gets muted.
 */
export const PRODUCTION_ASSET_ORPHAN_SWEEP_PTO_NOTIFIER_ID =
  "production_asset_orphan_sweep";

/**
 * Task #806 — founders can snooze the flapping banner (Task #793) for a
 * bounded window when they know ops are intentionally causing the sweep
 * to oscillate (e.g. a storage migration). Live snooze state lives in
 * `system_settings`; every snooze/unsnooze/expiry is also written to
 * `production_asset_orphan_sweep_flapping_snoozes` for the audit trail.
 */
const FLAPPING_SNOOZE_UNTIL_KEY =
  "production_asset_orphan_sweep_flapping_snooze_until";
export const FLAPPING_SNOOZE_MAX_MS = 24 * 60 * 60 * 1000;

// Flapping latch — N+ auto-clears inside the window flips the latch and
// fires a one-shot alert. Mirrors the cover-orphan heuristic.
//
// Task #794 — both values are now DB-backed via system_settings so a
// founder can calm a noisy sweep (raise threshold / shrink window) or
// tighten it (lower threshold / widen window) without a redeploy.
const FLAPPING_THRESHOLD_KEY =
  "production_asset_orphan_sweep_flapping_threshold";
const FLAPPING_WINDOW_MS_KEY =
  "production_asset_orphan_sweep_flapping_window_ms";
const FLAPPING_THRESHOLD_DEFAULT = 3;
const FLAPPING_WINDOW_MS_DEFAULT = 24 * 60 * 60 * 1000;
// Guardrails: at least 2 auto-clears before we call it flapping, never
// more than 1,000 (sane upper bound). Window is between 1 minute and
// 90 days (matches the snooze cap used elsewhere in the system).
const FLAPPING_THRESHOLD_MIN = 2;
const FLAPPING_THRESHOLD_MAX = 1000;
const FLAPPING_WINDOW_MS_MIN = 60_000;
const FLAPPING_WINDOW_MS_MAX = 90 * 24 * 60 * 60 * 1000;

export interface ProductionAssetOrphanSweepStatus {
  lastScanAt: number | null;
  lastOrphanCount: number | null;
  threshold: number;
  wasAboveThreshold: boolean;
  nextScanAt: number | null;
  intervalMs: number | null;
  lastAutoResolvedAt: number | null;
  lastAutoResolvedCount: number | null;
  flapping: boolean;
  flappingCount: number;
  flappingWindowMs: number;
  flappingThreshold: number;
  /** Task #805 — recurring flapping-digest cadence + last-sent receipt. */
  flappingDigestIntervalMs: number;
  flappingDigestLastSentAt: number | null;
  flappingDigestNextEligibleAt: number | null;
  flappingDigestSnoozeUntil: string | null;
  /** Task #806 — flapping banner snooze. `null` when not snoozed. */
  flappingSnoozeUntil: number | null;
  flappingSnoozeActive: boolean;
  flappingSnoozeMaxMs: number;
}

async function readThreshold(): Promise<number> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, THRESHOLD_KEY))
      .limit(1);
    if (rows.length === 0) return THRESHOLD_DEFAULT;
    const parsed = Number.parseInt(rows[0].value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return THRESHOLD_DEFAULT;
    return parsed;
  } catch {
    return THRESHOLD_DEFAULT;
  }
}

async function readRawSetting(key: string): Promise<string | null> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    return rows.length === 0 ? null : rows[0].value;
  } catch {
    return null;
  }
}

async function readBoundedSetting(
  key: string,
  defaultValue: number,
  min: number,
  max: number,
): Promise<number> {
  try {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    if (rows.length === 0) return defaultValue;
    const parsed = Number.parseInt(rows[0].value, 10);
    if (!Number.isFinite(parsed)) return defaultValue;
    if (parsed < min || parsed > max) return defaultValue;
    return parsed;
  } catch {
    return defaultValue;
  }
}

async function readFlappingThreshold(): Promise<number> {
  return readBoundedSetting(
    FLAPPING_THRESHOLD_KEY,
    FLAPPING_THRESHOLD_DEFAULT,
    FLAPPING_THRESHOLD_MIN,
    FLAPPING_THRESHOLD_MAX,
  );
}

async function readFlappingWindowMs(): Promise<number> {
  return readBoundedSetting(
    FLAPPING_WINDOW_MS_KEY,
    FLAPPING_WINDOW_MS_DEFAULT,
    FLAPPING_WINDOW_MS_MIN,
    FLAPPING_WINDOW_MS_MAX,
  );
}

export interface OrphanedRowSummary {
  id: string;
  name: string;
  storageKey: string;
  byteSize: number;
  sha256: string;
  archivedAt: Date | null;
  status: string;
}

export interface FireOrphanedRowAlertInput {
  assetId: string;
  storageKey: string;
  actorUserId: string;
  error: unknown;
}

export type ReconcileAction = "hard_delete" | "relink_object";

export interface ReconcileResult {
  action: ReconcileAction;
  assetId: string;
  objectExists: boolean;
  hardDeleted: boolean;
  deletedAuditRows: number;
  // Task #812 — populated when relink_object updated the row's
  // storageKey to point at a restored copy under a new path.
  storageKeyUpdated?: boolean;
  oldStorageKey?: string;
  newStorageKey?: string;
}

class ProductionAssetOrphanAlertService {
  private emailService = new EmailService();
  private wasAboveThreshold = false;
  private lastScanAt: number | null = null;
  private lastOrphanCount: number | null = null;
  private intervalHandle: NodeJS.Timeout | null = null;
  private intervalMs: number | null = null;
  private lastAutoResolvedAt: number | null = null;
  private lastAutoResolvedCount: number | null = null;
  private wasFlapping = false;

  /**
   * Fires a one-shot platform_alerts row + emails root admins. Caller is
   * the DELETE route when `deleteAssetBytes` succeeded but
   * `storage.deleteArchivedAsset` then threw.
   *
   * Never throws — alert failures must not mask the original gap.
   */
  async fireOrphanedRowAlert(input: FireOrphanedRowAlertInput): Promise<void> {
    const errorMessage =
      input.error instanceof Error
        ? input.error.message
        : String(input.error ?? "unknown_error");
    const message =
      `3D asset ${input.assetId} is orphaned: object bytes were deleted ` +
      `but the DB row delete failed (${errorMessage}). The row is still ` +
      `marked 'archived' but the underlying file is gone. Reconcile from ` +
      `the production-assets admin panel.`;

    try {
      await panicButtonService.createAlert({
        type: PRODUCTION_ASSET_ORPHAN_ALERT_TYPE,
        severity: "critical",
        message,
        details: {
          assetId: input.assetId,
          storageKey: input.storageKey,
          actorUserId: input.actorUserId,
          errorMessage,
          source: "production-asset-orphan-alert-service",
          link: `/admin/3d-assets/${input.assetId}`,
        },
        autoTriggered: true,
      });
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to create platform alert:",
        err,
      );
    }

    try {
      const recipients = await db
        .select({ email: adminStaff.email })
        .from(adminStaff)
        .where(and(eq(adminStaff.role, "root_admin"), eq(adminStaff.active, true)));
      for (const r of recipients) {
        if (!r.email) continue;
        await this.emailService.sendAdminAlert(r.email, {
          title: "3D asset deletion left an orphan row",
          severity: "high",
          message,
          actionUrl: `/admin/3d-assets/${input.assetId}`,
        });
      }
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to email admins:",
        err,
      );
    }
  }

  /**
   * Scan all `archived` production_assets rows and return the ones whose
   * object bytes are missing in storage. Used by the admin reconcile
   * panel + GET /api/admin/production-assets/orphans.
   */
  async listOrphanedRows(opts: { limit?: number } = {}): Promise<OrphanedRowSummary[]> {
    const limit = Math.max(1, Math.min(500, Math.floor(opts.limit ?? 100)));
    const rows = await db
      .select()
      .from(productionAssets)
      .where(eq(productionAssets.status, "archived"))
      .limit(limit);
    const result: OrphanedRowSummary[] = [];
    for (const row of rows) {
      let exists = false;
      try {
        const head = await headAsset(row.storageKey);
        exists = head.exists;
      } catch (err) {
        console.error(
          `[ProductionAssetOrphanAlert] headAsset failed for ${row.id}:`,
          err,
        );
        // If the head probe itself fails we cannot say the row is
        // orphaned — skip it so we don't accidentally hard-delete a
        // healthy row because of a transient storage hiccup.
        continue;
      }
      if (!exists) {
        result.push({
          id: row.id,
          name: row.name,
          storageKey: row.storageKey,
          byteSize: row.byteSize,
          sha256: row.sha256,
          archivedAt: row.updatedAt ?? null,
          status: row.status,
        });
      }
    }
    return result;
  }

  /**
   * Reconcile one orphan. `hard_delete` removes the DB row + cascade
   * audit-log and writes a moderation_logs entry. `relink_object`
   * verifies the bytes are present (and is a no-op when they are);
   * it errors out when the bytes are still missing because re-linking
   * cannot conjure data that doesn't exist.
   */
  async reconcileOrphan(input: {
    assetId: string;
    action: ReconcileAction;
    actorUserId: string;
    reason?: string;
    // Task #812 — when set on a `relink_object` request, the server
    // verifies that the orphaned row's bytes have come back under THIS
    // (different) storageKey, then atomically rewrites the row to
    // point at it. Refused if sha256/byteSize don't match the row's
    // own claims. Ignored on hard_delete.
    newStorageKey?: string;
  }): Promise<ReconcileResult> {
    const [existing] = await db
      .select()
      .from(productionAssets)
      .where(eq(productionAssets.id, input.assetId))
      .limit(1);
    if (!existing) {
      throw new Error(`asset_not_found:${input.assetId}`);
    }
    if (existing.status !== "archived") {
      throw new Error(
        `asset_not_archived:${input.assetId} (status=${existing.status})`,
      );
    }

    if (input.action === "relink_object") {
      const requestedNewKey =
        typeof input.newStorageKey === "string" && input.newStorageKey.trim().length > 0
          ? input.newStorageKey.trim()
          : null;

      // Path A — caller supplied a NEW storageKey. Verify the bytes
      // there match the row's sha256 + byteSize, then atomically
      // rewrite the row + write an audit-log entry.
      if (requestedNewKey && requestedNewKey !== existing.storageKey) {
        let newHead;
        try {
          newHead = await headAsset(requestedNewKey);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("invalid storageKey")) {
            throw new Error(`invalid_new_storage_key: ${msg}`);
          }
          throw new Error(`head_probe_failed: ${msg}`);
        }
        if (!newHead.exists) {
          throw new Error("new_storage_key_not_found");
        }
        if (
          typeof newHead.byteSize === "number" &&
          newHead.byteSize !== existing.byteSize
        ) {
          throw new Error(
            `new_storage_key_byte_size_mismatch: expected ${existing.byteSize}, got ${newHead.byteSize}`,
          );
        }

        let bytes: Buffer;
        try {
          bytes = await downloadAssetBytes(requestedNewKey);
        } catch (err) {
          throw new Error(
            `new_storage_key_download_failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        if (bytes.byteLength !== existing.byteSize) {
          throw new Error(
            `new_storage_key_byte_size_mismatch: expected ${existing.byteSize}, got ${bytes.byteLength}`,
          );
        }
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        if (sha256 !== existing.sha256) {
          throw new Error(
            `new_storage_key_sha256_mismatch: expected ${existing.sha256}, got ${sha256}`,
          );
        }

        const oldKey = existing.storageKey;
        await db.transaction(async (tx) => {
          await tx
            .update(productionAssets)
            .set({ storageKey: requestedNewKey, updatedAt: new Date() as any })
            .where(eq(productionAssets.id, input.assetId));
          await tx.insert(productionAssetAuditLog).values({
            assetId: input.assetId,
            actorUserId: input.actorUserId,
            event: "relinked_to_new_storage_key",
            payload: {
              oldStorageKey: oldKey,
              newStorageKey: requestedNewKey,
              byteSize: existing.byteSize,
              sha256: existing.sha256,
              reason: input.reason ?? null,
            } as any,
          } as any);
        });

        return {
          action: "relink_object",
          assetId: input.assetId,
          objectExists: true,
          hardDeleted: false,
          deletedAuditRows: 0,
          storageKeyUpdated: true,
          oldStorageKey: oldKey,
          newStorageKey: requestedNewKey,
        };
      }

      // Path B — no new key, fall back to the original behaviour:
      // confirm the bytes have come back at the existing storageKey.
      let objectExists = false;
      try {
        const head = await headAsset(existing.storageKey);
        objectExists = head.exists;
      } catch (err) {
        throw new Error(
          `head_probe_failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (!objectExists) {
        throw new Error("object_still_missing");
      }
      return {
        action: "relink_object",
        assetId: input.assetId,
        objectExists: true,
        hardDeleted: false,
        deletedAuditRows: 0,
      };
    }

    // hard_delete path still needs the head-probe up front.
    let objectExists = false;
    try {
      const head = await headAsset(existing.storageKey);
      objectExists = head.exists;
    } catch (err) {
      throw new Error(
        `head_probe_failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // hard_delete — only meaningful when the object truly is gone.
    if (objectExists) {
      throw new Error("object_still_present_refusing_hard_delete");
    }

    const deletedAuditRows = await db.transaction(async (tx) => {
      await tx.insert(moderationLogs).values({
        userId: input.actorUserId,
        contentType: "production_asset",
        contentId: input.assetId,
        contentSnippet:
          `${existing.name} (${existing.format}, ${existing.byteSize}B, ` +
          `sha256=${existing.sha256}, storageKey=${existing.storageKey})`,
        reason:
          input.reason ??
          "reconcile: hard-delete orphaned archived asset (object bytes already gone)",
        category: "asset_deletion",
        actionTaken: "production_asset_orphan_hard_deleted",
        severity: "high",
      } as any);
      const removed = await tx
        .delete(productionAssetAuditLog)
        .where(eq(productionAssetAuditLog.assetId, input.assetId))
        .returning({ id: productionAssetAuditLog.id });
      await tx
        .delete(productionAssets)
        .where(eq(productionAssets.id, input.assetId));
      return removed.length;
    });

    return {
      action: "hard_delete",
      assetId: input.assetId,
      objectExists: false,
      hardDeleted: true,
      deletedAuditRows,
    };
  }

  /**
   * Task #795 — bulk hard-delete reconcile.
   *
   * Validates every id is actually an orphan (archived row whose object
   * bytes are missing), then in a SINGLE transaction:
   *  - writes ONE moderation_logs entry referencing the shared reason
   *    and the full list of affected asset ids, and
   *  - deletes the cascade audit-log rows + asset rows for every
   *    successfully-validated id.
   *
   * Per-id validation failures (not found / not archived / bytes still
   * present / head-probe failure) are returned in the `results` array
   * with `ok:false` and a `message`, and are simply skipped in the
   * transaction — they never abort the batch.
   *
   * Returns one `{ id, ok, message? }` per input id, matching the
   * per-row reconcile result shape used by the client.
   */
  async bulkReconcileOrphans(input: {
    assetIds: string[];
    actorUserId: string;
    reason: string;
  }): Promise<{
    results: Array<{ id: string; ok: boolean; message?: string }>;
    deletedAuditRows: number;
    moderationLogId: string | null;
  }> {
    const uniqueIds = Array.from(new Set(input.assetIds.filter((s) => typeof s === "string" && s.length > 0)));
    const results = new Map<string, { id: string; ok: boolean; message?: string }>();
    for (const id of uniqueIds) {
      results.set(id, { id, ok: false, message: "not_processed" });
    }

    if (uniqueIds.length === 0) {
      return { results: [], deletedAuditRows: 0, moderationLogId: null };
    }

    const existingRows = await db
      .select()
      .from(productionAssets)
      .where(inArray(productionAssets.id, uniqueIds));
    const existingById = new Map(existingRows.map((r) => [r.id, r] as const));

    for (const id of uniqueIds) {
      if (!existingById.has(id)) {
        results.set(id, { id, ok: false, message: `asset_not_found:${id}` });
      }
    }

    const deletable: typeof existingRows = [];
    for (const row of existingRows) {
      if (row.status !== "archived") {
        results.set(row.id, {
          id: row.id,
          ok: false,
          message: `asset_not_archived:${row.id} (status=${row.status})`,
        });
        continue;
      }
      let exists = false;
      try {
        const head = await headAsset(row.storageKey);
        exists = head.exists;
      } catch (err) {
        results.set(row.id, {
          id: row.id,
          ok: false,
          message: `head_probe_failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }
      if (exists) {
        results.set(row.id, {
          id: row.id,
          ok: false,
          message: "object_still_present_refusing_hard_delete",
        });
        continue;
      }
      deletable.push(row);
    }

    let deletedAuditRows = 0;
    let moderationLogId: string | null = null;
    if (deletable.length > 0) {
      const deletableIds = deletable.map((r) => r.id);
      const summaryLines = deletable.map(
        (r) =>
          `${r.id} | ${r.name} (${r.format}, ${r.byteSize}B, sha256=${r.sha256}, storageKey=${r.storageKey})`,
      );
      const contentSnippet =
        `Bulk hard-delete of ${deletable.length} orphaned production asset row(s):\n` +
        summaryLines.join("\n");

      const txOut = await db.transaction(async (tx) => {
        const [logRow] = await tx
          .insert(moderationLogs)
          .values({
            userId: input.actorUserId,
            contentType: "production_asset_bulk",
            contentId: null,
            contentSnippet,
            reason: input.reason,
            category: "asset_deletion",
            actionTaken: "production_asset_orphan_bulk_hard_deleted",
            severity: "high",
          } as any)
          .returning({ id: moderationLogs.id });
        const removed = await tx
          .delete(productionAssetAuditLog)
          .where(inArray(productionAssetAuditLog.assetId, deletableIds))
          .returning({ id: productionAssetAuditLog.id });
        await tx
          .delete(productionAssets)
          .where(inArray(productionAssets.id, deletableIds));
        return { auditCount: removed.length, logId: logRow?.id ?? null };
      });
      deletedAuditRows = txOut.auditCount;
      moderationLogId = txOut.logId;
      for (const id of deletableIds) {
        results.set(id, { id, ok: true });
      }
    }

    return {
      results: uniqueIds.map((id) => results.get(id)!),
      deletedAuditRows,
      moderationLogId,
    };
  }

  /**
   * Task #802 — bulk relink reconcile.
   *
   * For every input id: load the row, head-probe its storageKey, and
   * report whether the object bytes have come back. No DB writes — this
   * mirrors the per-row `relink_object` action which is also a pure
   * presence check. Per-id failures (not found / not archived / head
   * probe error / bytes still missing) are returned with `ok:false`
   * and never abort the batch.
   */
  async bulkRelinkOrphans(input: {
    assetIds: string[];
    actorUserId: string;
    /**
     * Task #818 — optional per-id map of new storageKeys. When set for
     * a given id, the row is rewritten to point at the new key after
     * sha256/byteSize verification (mirrors the single-row Task #812
     * `relink_object` path). Empty / whitespace-only values are
     * ignored. Takes precedence over `prefixRewrite` for the same id.
     */
    newStorageKeys?: Record<string, string | null | undefined>;
    /**
     * Task #818 — optional shared rewrite rule. When set, any row whose
     * current `storageKey` starts with `from` gets rewritten to
     * `to + key.slice(from.length)` and re-verified. Per-id entries in
     * `newStorageKeys` win. `from` must be non-empty; `to` may be empty
     * (collapses the prefix). Rule is skipped for rows that don't
     * match `from`.
     */
    prefixRewrite?: { from: string; to: string } | null;
    /** Optional reason logged on every successful rewrite audit row. */
    reason?: string | null;
  }): Promise<{
    results: Array<{
      id: string;
      ok: boolean;
      message?: string;
      storageKeyUpdated?: boolean;
      oldStorageKey?: string;
      newStorageKey?: string;
    }>;
  }> {
    const uniqueIds = Array.from(
      new Set(input.assetIds.filter((s) => typeof s === "string" && s.length > 0)),
    );
    type Result = {
      id: string;
      ok: boolean;
      message?: string;
      storageKeyUpdated?: boolean;
      oldStorageKey?: string;
      newStorageKey?: string;
    };
    const results = new Map<string, Result>();
    for (const id of uniqueIds) {
      results.set(id, { id, ok: false, message: "not_processed" });
    }
    if (uniqueIds.length === 0) {
      return { results: [] };
    }

    const perIdMap = input.newStorageKeys ?? {};
    const prefixRewrite =
      input.prefixRewrite &&
      typeof input.prefixRewrite.from === "string" &&
      input.prefixRewrite.from.length > 0 &&
      typeof input.prefixRewrite.to === "string"
        ? { from: input.prefixRewrite.from, to: input.prefixRewrite.to }
        : null;

    const existingRows = await db
      .select()
      .from(productionAssets)
      .where(inArray(productionAssets.id, uniqueIds));
    const existingById = new Map(existingRows.map((r) => [r.id, r] as const));

    for (const id of uniqueIds) {
      if (!existingById.has(id)) {
        results.set(id, { id, ok: false, message: `asset_not_found:${id}` });
      }
    }

    for (const row of existingRows) {
      if (row.status !== "archived") {
        results.set(row.id, {
          id: row.id,
          ok: false,
          message: `asset_not_archived:${row.id} (status=${row.status})`,
        });
        continue;
      }

      // Resolve target storageKey for this row.
      const perIdRaw = perIdMap[row.id];
      const perIdTrimmed =
        typeof perIdRaw === "string" && perIdRaw.trim().length > 0
          ? perIdRaw.trim()
          : null;
      let targetKey = row.storageKey;
      if (perIdTrimmed) {
        targetKey = perIdTrimmed;
      } else if (
        prefixRewrite &&
        row.storageKey.startsWith(prefixRewrite.from)
      ) {
        targetKey =
          prefixRewrite.to + row.storageKey.slice(prefixRewrite.from.length);
      }

      // No-op path: target === existing key → original behavior
      // (head-probe only, no DB writes).
      if (targetKey === row.storageKey) {
        let exists = false;
        try {
          const head = await headAsset(row.storageKey);
          exists = head.exists;
        } catch (err) {
          results.set(row.id, {
            id: row.id,
            ok: false,
            message: `head_probe_failed: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }
        if (!exists) {
          results.set(row.id, {
            id: row.id,
            ok: false,
            message: "object_still_missing",
          });
          continue;
        }
        results.set(row.id, { id: row.id, ok: true });
        continue;
      }

      // Rewrite path: verify bytes at new key match the row's
      // sha256/byteSize, then atomically update + audit-log. Per-id
      // failures stay isolated to this row.
      let newHead;
      try {
        newHead = await headAsset(targetKey);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("invalid storageKey")) {
          results.set(row.id, {
            id: row.id,
            ok: false,
            message: `invalid_new_storage_key: ${msg}`,
          });
        } else {
          results.set(row.id, {
            id: row.id,
            ok: false,
            message: `head_probe_failed: ${msg}`,
          });
        }
        continue;
      }
      if (!newHead.exists) {
        results.set(row.id, {
          id: row.id,
          ok: false,
          message: "new_storage_key_not_found",
        });
        continue;
      }
      if (
        typeof newHead.byteSize === "number" &&
        newHead.byteSize !== row.byteSize
      ) {
        results.set(row.id, {
          id: row.id,
          ok: false,
          message: `new_storage_key_byte_size_mismatch: expected ${row.byteSize}, got ${newHead.byteSize}`,
        });
        continue;
      }

      let bytes: Buffer;
      try {
        bytes = await downloadAssetBytes(targetKey);
      } catch (err) {
        results.set(row.id, {
          id: row.id,
          ok: false,
          message: `new_storage_key_download_failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }
      if (bytes.byteLength !== row.byteSize) {
        results.set(row.id, {
          id: row.id,
          ok: false,
          message: `new_storage_key_byte_size_mismatch: expected ${row.byteSize}, got ${bytes.byteLength}`,
        });
        continue;
      }
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (sha256 !== row.sha256) {
        results.set(row.id, {
          id: row.id,
          ok: false,
          message: `new_storage_key_sha256_mismatch: expected ${row.sha256}, got ${sha256}`,
        });
        continue;
      }

      const oldKey = row.storageKey;
      try {
        await db.transaction(async (tx) => {
          await tx
            .update(productionAssets)
            .set({ storageKey: targetKey, updatedAt: new Date() as any })
            .where(eq(productionAssets.id, row.id));
          await tx.insert(productionAssetAuditLog).values({
            assetId: row.id,
            actorUserId: input.actorUserId,
            event: "relinked_to_new_storage_key",
            payload: {
              oldStorageKey: oldKey,
              newStorageKey: targetKey,
              byteSize: row.byteSize,
              sha256: row.sha256,
              reason: input.reason ?? null,
              source: prefixRewrite && !perIdTrimmed ? "bulk_prefix_rewrite" : "bulk_per_id_map",
            } as any,
          } as any);
        });
      } catch (err) {
        results.set(row.id, {
          id: row.id,
          ok: false,
          message: `relink_write_failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }

      results.set(row.id, {
        id: row.id,
        ok: true,
        storageKeyUpdated: true,
        oldStorageKey: oldKey,
        newStorageKey: targetKey,
      });
    }

    return { results: uniqueIds.map((id) => results.get(id)!) };
  }

  /**
   * Task #785 — scheduled sweep. Calls `listOrphanedRows()` and fires a
   * one-shot `production_asset_orphan_sweep` alert (+ emails root admins)
   * when the orphan count crosses the configured threshold. Mirrors the
   * cover-orphan / media-orphan pattern: only re-fires on the
   * <=threshold → >threshold transition, and auto-resolves any open
   * sweep alerts as the system on the next clean scan.
   */
  async check(): Promise<{
    orphanCount: number;
    scannedAt: number;
    threshold: number;
    alerted: boolean;
  }> {
    const scannedAt = Date.now();
    let orphanCount = 0;
    try {
      const orphans = await this.listOrphanedRows({ limit: 500 });
      orphanCount = orphans.length;
    } catch (err) {
      console.error("[ProductionAssetOrphanAlert] scheduled scan failed:", err);
      return {
        orphanCount: this.lastOrphanCount ?? 0,
        scannedAt,
        threshold: await readThreshold(),
        alerted: false,
      };
    }
    this.lastScanAt = scannedAt;
    this.lastOrphanCount = orphanCount;

    const threshold = await readThreshold();
    const above = orphanCount > threshold;
    let alerted = false;
    if (above && !this.wasAboveThreshold) {
      await this.fireSweepAlert(orphanCount, threshold);
      alerted = true;
    }
    if (!above) {
      await this.autoResolveOpenSweepAlerts(orphanCount, threshold);
    }
    this.wasAboveThreshold = above;

    // Flapping latch: after each scan recount recent auto-clears and fire
    // a one-shot alert the first time we cross into "flapping" territory.
    // Re-arms only after the count drops back below the threshold.
    try {
      const flappingWindowMs = await readFlappingWindowMs();
      const flappingThreshold = await readFlappingThreshold();
      const flappingCount = await this.countRecentAutoClears(flappingWindowMs);
      const flapping = flappingCount >= flappingThreshold;
      if (flapping && !this.wasFlapping) {
        await this.fireFlappingAlert(
          flappingCount,
          flappingThreshold,
          flappingWindowMs,
        );
      }
      this.wasFlapping = flapping;

      // Task #805 — recurring digest. While the latch is stuck (flapping
      // === true) re-page founders once per `flappingDigestIntervalMs`.
      // When the latch releases, auto-resolve any open digest alerts and
      // clear the last-sent receipt so the next stuck episode starts
      // from a clean slate.
      if (flapping) {
        await this.maybeFireFlappingDigest(
          flappingCount,
          flappingThreshold,
          flappingWindowMs,
        );
      } else {
        await this.resetFlappingDigestOnRecovery();
      }
    } catch (err) {
      console.error("[ProductionAssetOrphanAlert] flapping check failed:", err);
    }

    return { orphanCount, scannedAt, threshold, alerted };
  }

  start(intervalMs = 24 * 60 * 60 * 1000) {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    this.intervalMs = intervalMs;
    setTimeout(() => {
      this.check().catch((err) =>
        console.error(
          "[ProductionAssetOrphanAlert] initial scheduled check failed:",
          err,
        ),
      );
    }, 15_000).unref?.();
    this.intervalHandle = setInterval(() => {
      this.check().catch((err) =>
        console.error(
          "[ProductionAssetOrphanAlert] scheduled check failed:",
          err,
        ),
      );
    }, intervalMs);
    this.intervalHandle.unref?.();
    console.log(
      `[ProductionAssetOrphanAlert] scheduler started (every ${Math.round(
        intervalMs / 60_000,
      )}m)`,
    );
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.intervalMs = null;
      console.log("[ProductionAssetOrphanAlert] scheduler stopped");
    }
  }

  async getSweepStatus(): Promise<ProductionAssetOrphanSweepStatus> {
    const threshold = await readThreshold();
    const flappingThreshold = await readFlappingThreshold();
    const flappingWindowMs = await readFlappingWindowMs();
    const flappingCount = await this.countRecentAutoClears(flappingWindowMs);
    const intervalMs = flappingDigestIntervalMs();
    const lastSentAt = await this.readFlappingDigestLastSentAt();
    const snooze = await getAuditEmailFailureAlertSnooze(
      PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_SNOOZE_KEY,
    );
    const snoozeUntilMs = await this.getFlappingSnoozeUntilMs();
    const now = Date.now();
    const snoozeActive = snoozeUntilMs != null && snoozeUntilMs > now;
    return {
      lastScanAt: this.lastScanAt,
      lastOrphanCount: this.lastOrphanCount,
      threshold,
      wasAboveThreshold: this.wasAboveThreshold,
      nextScanAt:
        this.lastScanAt && this.intervalMs
          ? this.lastScanAt + this.intervalMs
          : null,
      intervalMs: this.intervalMs,
      lastAutoResolvedAt: this.lastAutoResolvedAt,
      lastAutoResolvedCount: this.lastAutoResolvedCount,
      flapping: flappingCount >= flappingThreshold,
      flappingCount,
      flappingWindowMs,
      flappingThreshold,
      flappingDigestIntervalMs: intervalMs,
      flappingDigestLastSentAt: lastSentAt,
      flappingDigestNextEligibleAt:
        lastSentAt != null ? lastSentAt + intervalMs : null,
      flappingDigestSnoozeUntil: snooze.snoozeUntil,
      flappingSnoozeUntil: snoozeUntilMs,
      flappingSnoozeActive: snoozeActive,
      flappingSnoozeMaxMs: FLAPPING_SNOOZE_MAX_MS,
    };
  }

  /**
   * Task #806 — read the persisted snooze deadline, lazily expiring an
   * elapsed window: when the stored timestamp is in the past we delete
   * the system_settings row and append an `expired` audit row so the
   * trail captures natural expiry too.
   */
  private async getFlappingSnoozeUntilMs(): Promise<number | null> {
    let raw: string | null = null;
    try {
      const rows = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, FLAPPING_SNOOZE_UNTIL_KEY))
        .limit(1);
      raw = rows[0]?.value ?? null;
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to read flapping snooze:",
        err,
      );
      return null;
    }
    if (!raw) return null;
    const ts = Number.parseInt(raw, 10);
    if (!Number.isFinite(ts)) return null;
    if (ts <= Date.now()) {
      // Lazy expiry — clear the live row and record the expiry once.
      // Task #815 — copy the final suppressed count from the active
      // `set` row onto the `expired` audit row.
      try {
        const active = await this.getActiveFlappingSnoozeSetRow();
        await db
          .delete(systemSettings)
          .where(eq(systemSettings.key, FLAPPING_SNOOZE_UNTIL_KEY));
        await db
          .insert(productionAssetOrphanSweepFlappingSnoozes)
          .values({
            action: "expired",
            snoozeUntil: new Date(ts),
            updatedBy: null,
            reason: null,
            suppressedCount: active?.suppressedCount ?? 0,
          } as any);
      } catch (err) {
        console.error(
          "[ProductionAssetOrphanAlert] failed to lazily expire flapping snooze:",
          err,
        );
      }
      return null;
    }
    return ts;
  }

  async isFlappingSnoozed(): Promise<boolean> {
    const ts = await this.getFlappingSnoozeUntilMs();
    return ts != null && ts > Date.now();
  }

  /**
   * Task #815 — find the most recent `set` row for the currently-active
   * snooze window. Used to bump the running suppressed counter on each
   * swallowed flapping alert, and to copy the final tally onto the
   * `cleared` / `expired` / `replaced` end-of-window row.
   */
  private async getActiveFlappingSnoozeSetRow(): Promise<
    | {
        id: string;
        suppressedCount: number;
        snoozeUntil: Date | null;
      }
    | null
  > {
    try {
      const rows = await db
        .select({
          id: productionAssetOrphanSweepFlappingSnoozes.id,
          suppressedCount:
            productionAssetOrphanSweepFlappingSnoozes.suppressedCount,
          snoozeUntil: productionAssetOrphanSweepFlappingSnoozes.snoozeUntil,
        })
        .from(productionAssetOrphanSweepFlappingSnoozes)
        .where(eq(productionAssetOrphanSweepFlappingSnoozes.action, "set"))
        .orderBy(desc(productionAssetOrphanSweepFlappingSnoozes.occurredAt))
        .limit(1);
      return rows[0] ?? null;
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to read active flapping snooze row:",
        err,
      );
      return null;
    }
  }

  /**
   * Task #815 — increment `suppressedCount` on the active `set` row.
   * Called from `fireFlappingAlert` whenever a would-be alert is
   * swallowed by an in-window snooze. Returns the new count, or `null`
   * when there is no active row to bump (e.g. snooze was cleared in
   * between the suppression check and the bump).
   */
  private async bumpActiveFlappingSnoozeSuppressedCount(): Promise<number | null> {
    const active = await this.getActiveFlappingSnoozeSetRow();
    if (!active) return null;
    const next = active.suppressedCount + 1;
    try {
      await db
        .update(productionAssetOrphanSweepFlappingSnoozes)
        .set({ suppressedCount: next })
        .where(eq(productionAssetOrphanSweepFlappingSnoozes.id, active.id));
      return next;
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to bump flapping snooze suppressed count:",
        err,
      );
      return null;
    }
  }

  /**
   * Task #806 — set the flapping-banner snooze. `untilMs` is clamped to
   * the 24h policy ceiling; any value <= now is treated as a clear.
   */
  async setFlappingSnooze(input: {
    untilMs: number;
    updatedBy?: string | null;
    reason?: string | null;
  }): Promise<number> {
    const now = Date.now();
    if (!Number.isFinite(input.untilMs) || input.untilMs <= now) {
      throw new Error("invalid_snooze_until");
    }
    const ceiling = now + FLAPPING_SNOOZE_MAX_MS;
    const effective = Math.min(Math.floor(input.untilMs), ceiling);

    // Task #815 — if a snooze is already active, close it out with a
    // `replaced` audit row carrying the final suppressed count BEFORE
    // we upsert the new window.
    const existingActiveMs = await this.getFlappingSnoozeUntilMs();
    if (existingActiveMs != null) {
      try {
        const prior = await this.getActiveFlappingSnoozeSetRow();
        await db
          .insert(productionAssetOrphanSweepFlappingSnoozes)
          .values({
            action: "replaced",
            snoozeUntil: new Date(existingActiveMs),
            updatedBy: input.updatedBy ?? null,
            reason: null,
            suppressedCount: prior?.suppressedCount ?? 0,
          } as any);
      } catch (err) {
        console.error(
          "[ProductionAssetOrphanAlert] failed to log flapping snooze replacement:",
          err,
        );
      }
    }

    await db
      .insert(systemSettings)
      .values({
        key: FLAPPING_SNOOZE_UNTIL_KEY,
        value: String(effective),
        updatedBy: input.updatedBy ?? undefined,
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: String(effective),
          updatedBy: input.updatedBy ?? undefined,
          updatedAt: new Date(),
        },
      });
    try {
      await db
        .insert(productionAssetOrphanSweepFlappingSnoozes)
        .values({
          action: "set",
          snoozeUntil: new Date(effective),
          updatedBy: input.updatedBy ?? null,
          reason: input.reason ?? null,
          suppressedCount: 0,
        } as any);
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to log flapping snooze set:",
        err,
      );
    }
    return effective;
  }

  async clearFlappingSnooze(updatedBy?: string | null): Promise<void> {
    const existing = await this.getFlappingSnoozeUntilMs();
    // Task #815 — read the final suppressed count BEFORE we delete the
    // live row so the `cleared` audit entry records what the snooze
    // actually swallowed.
    const active =
      existing == null ? null : await this.getActiveFlappingSnoozeSetRow();
    await db
      .delete(systemSettings)
      .where(eq(systemSettings.key, FLAPPING_SNOOZE_UNTIL_KEY));
    if (existing == null) return; // already cleared / expired — nothing to audit.
    try {
      await db
        .insert(productionAssetOrphanSweepFlappingSnoozes)
        .values({
          action: "cleared",
          snoozeUntil: new Date(existing),
          updatedBy: updatedBy ?? null,
          reason: null,
          suppressedCount: active?.suppressedCount ?? 0,
        } as any);
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to log flapping snooze clear:",
        err,
      );
    }
  }

  async listFlappingSnoozeLog(
    optsOrLimit: number | {
      limit?: number;
      offset?: number;
      actor?: string | null;
      from?: Date | null;
      to?: Date | null;
    } = 20,
  ): Promise<{
    entries: Array<{
      id: string;
      action: string;
      snoozeUntil: string | null;
      updatedBy: string | null;
      reason: string | null;
      suppressedCount: number;
      occurredAt: string;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const opts =
      typeof optsOrLimit === "number" ? { limit: optsOrLimit } : optsOrLimit;
    const limit = Math.max(1, Math.min(200, Math.floor(opts.limit ?? 20)));
    const offset = Math.max(0, Math.floor(opts.offset ?? 0));
    const actor =
      typeof opts.actor === "string" && opts.actor.trim().length > 0
        ? opts.actor.trim()
        : null;
    const from = opts.from instanceof Date && !Number.isNaN(opts.from.getTime())
      ? opts.from
      : null;
    const to = opts.to instanceof Date && !Number.isNaN(opts.to.getTime())
      ? opts.to
      : null;

    const conditions: any[] = [];
    if (actor) {
      conditions.push(
        eq(productionAssetOrphanSweepFlappingSnoozes.updatedBy, actor),
      );
    }
    if (from) {
      conditions.push(
        gte(productionAssetOrphanSweepFlappingSnoozes.occurredAt, from),
      );
    }
    if (to) {
      conditions.push(
        lte(productionAssetOrphanSweepFlappingSnoozes.occurredAt, to),
      );
    }
    const whereExpr =
      conditions.length === 0
        ? undefined
        : conditions.length === 1
          ? conditions[0]
          : and(...conditions);

    const baseQuery = db
      .select()
      .from(productionAssetOrphanSweepFlappingSnoozes);
    const filteredQuery = whereExpr ? baseQuery.where(whereExpr) : baseQuery;
    const rows = await filteredQuery
      .orderBy(desc(productionAssetOrphanSweepFlappingSnoozes.occurredAt))
      .limit(limit)
      .offset(offset);

    const countBase = db
      .select({ id: productionAssetOrphanSweepFlappingSnoozes.id })
      .from(productionAssetOrphanSweepFlappingSnoozes);
    const countRows = await (whereExpr ? countBase.where(whereExpr) : countBase);
    const total = countRows.length;

    return {
      entries: rows.map((r) => ({
        id: r.id,
        action: r.action,
        snoozeUntil: r.snoozeUntil ? r.snoozeUntil.toISOString() : null,
        updatedBy: r.updatedBy ?? null,
        reason: r.reason ?? null,
        // Task #815 — surface the per-window suppressed counter to the UI.
        suppressedCount: r.suppressedCount ?? 0,
        occurredAt: (r.occurredAt ?? new Date()).toISOString(),
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * Count how many `production_asset_orphan_sweep` alerts auto-cleared
   * inside the recent flapping window. Used by the flapping latch + the
   * sweep status payload.
   */
  private async countRecentAutoClears(windowMs: number): Promise<number> {
    try {
      const since = new Date(Date.now() - windowMs);
      const rows = await db
        .select({ id: platformAlerts.id, details: platformAlerts.details })
        .from(platformAlerts)
        .where(
          and(
            eq(platformAlerts.type, PRODUCTION_ASSET_ORPHAN_SWEEP_ALERT_TYPE),
            eq(platformAlerts.acknowledged, true),
            eq(platformAlerts.acknowledgedBy, "system"),
            gte(platformAlerts.acknowledgedAt, since),
          ),
        );
      let n = 0;
      for (const row of rows) {
        const d =
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, any>)
            : {};
        if (d.autoResolved === true) n += 1;
      }
      return n;
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to count recent auto-clears:",
        err,
      );
      return 0;
    }
  }

  /**
   * One-shot alert when the sweep starts flapping (≥ FLAPPING_THRESHOLD
   * auto-clears inside FLAPPING_WINDOW_MS). Mirrors `fireSweepAlert` but
   * uses a distinct type + subject so it isn't conflated with the
   * per-crossing sweep alert.
   */
  private async fireFlappingAlert(
    flappingCount: number,
    flappingThreshold: number,
    flappingWindowMs: number,
  ) {
    // Task #806 — founder snooze swallows the alert (no platform_alerts
    // row, no email). The latch still flips, so we won't re-fire on
    // every tick during the snooze window.
    try {
      if (await this.isFlappingSnoozed()) {
        // Task #815 — bump the running suppressed-count on the active
        // snooze row so founders can tell, after the window closes,
        // whether the snooze actually muted anything.
        const newCount =
          await this.bumpActiveFlappingSnoozeSuppressedCount();
        console.log(
          `[ProductionAssetOrphanAlert] flapping alert suppressed by snooze (count=${newCount ?? "?"})`,
        );
        return;
      }
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] flapping snooze check failed:",
        err,
      );
    }
    const windowHours = Math.round(flappingWindowMs / (60 * 60 * 1000));
    const message =
      `3D asset orphan sweep is flapping: ${flappingCount} auto-clears ` +
      `in the last ${windowHours}h (threshold ${flappingThreshold}). ` +
      `Something is repeatedly leaving archived rows with missing object ` +
      `bytes — investigate the DELETE path.`;
    try {
      await panicButtonService.createAlert({
        type: PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_ALERT_TYPE,
        severity: "warning",
        message,
        details: {
          flappingCount,
          flappingThreshold,
          flappingWindowMs,
          source: "production-asset-orphan-alert-service",
          link: "/admin/3d-assets",
        },
        autoTriggered: true,
      });
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to create flapping alert:",
        err,
      );
    }

    try {
      const recipients = await db
        .select({ email: adminStaff.email })
        .from(adminStaff)
        .where(
          and(eq(adminStaff.role, "root_admin"), eq(adminStaff.active, true)),
        );
      for (const r of recipients) {
        if (!r.email) continue;
        await this.emailService.sendAdminAlert(r.email, {
          title: "3D asset orphan sweep is flapping",
          severity: "medium",
          message,
          actionUrl: "/admin/3d-assets",
        });
      }
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to email admins about flapping:",
        err,
      );
    }
  }

  /**
   * Task #805 — read the last-sent timestamp for the recurring
   * flapping digest. Stored as a plain millisecond-epoch string in
   * `system_settings`. Returns `null` when no digest has fired yet
   * for the current stuck episode (or when the stored value is
   * unparseable / from the future, which we treat as missing).
   */
  private async readFlappingDigestLastSentAt(): Promise<number | null> {
    try {
      const rows = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, FLAPPING_DIGEST_LAST_SENT_AT_KEY))
        .limit(1);
      if (rows.length === 0) return null;
      const parsed = Number.parseInt(rows[0].value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) return null;
      if (parsed > Date.now() + 60_000) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async writeFlappingDigestLastSentAt(ts: number): Promise<void> {
    await db
      .insert(systemSettings)
      .values({
        key: FLAPPING_DIGEST_LAST_SENT_AT_KEY,
        value: String(ts),
        updatedBy: "system",
      })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: {
          value: String(ts),
          updatedBy: "system",
          updatedAt: new Date(),
        },
      });
  }

  private async clearFlappingDigestLastSentAt(): Promise<void> {
    try {
      await db
        .delete(systemSettings)
        .where(eq(systemSettings.key, FLAPPING_DIGEST_LAST_SENT_AT_KEY));
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to clear flapping digest receipt:",
        err,
      );
    }
  }

  /**
   * Task #805 — decide whether to fire a recurring digest and do so.
   * Skipped when the founder-controlled snooze window is active or when
   * the previous digest fired less than `flappingDigestIntervalMs` ago.
   */
  private async maybeFireFlappingDigest(
    flappingCount: number,
    flappingThreshold: number,
    flappingWindowMs: number,
  ): Promise<void> {
    const intervalMs = flappingDigestIntervalMs();
    const now = Date.now();
    const lastSentAt = await this.readFlappingDigestLastSentAt();
    if (lastSentAt != null && now - lastSentAt < intervalMs) return;

    try {
      const snoozed = await isAuditEmailFailureAlertSnoozed(
        PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_SNOOZE_KEY,
      );
      if (snoozed.snoozed) {
        console.info(
          `[ProductionAssetOrphanAlert] flapping digest snoozed until ${snoozed.snoozeUntil} — skipping (flappingCount=${flappingCount})`,
        );
        return;
      }
    } catch (err) {
      // Err on the side of paging: a noisy digest is better than silent.
      console.error(
        "[ProductionAssetOrphanAlert] failed to read flapping-digest snooze, defaulting to NOT snoozed:",
        (err as Error)?.message ?? err,
      );
    }

    await this.fireFlappingDigestAlert(
      flappingCount,
      flappingThreshold,
      flappingWindowMs,
      lastSentAt,
    );
    await this.writeFlappingDigestLastSentAt(now);
  }

  private async fireFlappingDigestAlert(
    flappingCount: number,
    flappingThreshold: number,
    flappingWindowMs: number,
    lastSentAt: number | null,
  ): Promise<void> {
    const windowHours = Math.round(flappingWindowMs / (60 * 60 * 1000));
    const sinceText = lastSentAt
      ? ` Previous digest fired ${new Date(lastSentAt).toISOString()}.`
      : " First digest for this stuck episode.";
    const message =
      `3D asset orphan sweep is STILL flapping: ${flappingCount} auto-clears ` +
      `in the last ${windowHours}h (threshold ${flappingThreshold}). The ` +
      `latch has not released since it first flipped — something in the ` +
      `DELETE path is repeatedly leaving archived rows with missing object ` +
      `bytes.${sinceText}`;
    try {
      await panicButtonService.createAlert({
        type: PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_ALERT_TYPE,
        severity: "warning",
        message,
        details: {
          flappingCount,
          flappingThreshold,
          flappingWindowMs,
          digestIntervalMs: flappingDigestIntervalMs(),
          previousDigestAt: lastSentAt
            ? new Date(lastSentAt).toISOString()
            : null,
          source: "production-asset-orphan-alert-service",
          link: "/admin/3d-assets",
        },
        autoTriggered: true,
      });
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to create flapping-digest alert:",
        err,
      );
    }

    try {
      const recipients = await db
        .select({ email: adminStaff.email })
        .from(adminStaff)
        .where(
          and(eq(adminStaff.role, "root_admin"), eq(adminStaff.active, true)),
        );
      for (const r of recipients) {
        if (!r.email) continue;
        await this.emailService.sendAdminAlert(r.email, {
          title: "3D asset orphan sweep still flapping (daily digest)",
          severity: "medium",
          message,
          actionUrl: "/admin/3d-assets",
        });
      }
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to email admins about flapping digest:",
        err,
      );
    }
  }

  /**
   * Task #805 — once the flapping latch releases, auto-acknowledge any
   * open digest alerts and clear the last-sent receipt so a future
   * stuck episode starts cleanly. No-op when no receipt was ever
   * written (the common, healthy case).
   */
  private async resetFlappingDigestOnRecovery(): Promise<void> {
    const lastSentAt = await this.readFlappingDigestLastSentAt();
    if (lastSentAt == null) return;
    try {
      const open = await db
        .select()
        .from(platformAlerts)
        .where(
          and(
            eq(
              platformAlerts.type,
              PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_ALERT_TYPE,
            ),
            eq(platformAlerts.acknowledged, false),
          ),
        )
        .orderBy(desc(platformAlerts.createdAt));
      const resolvedAt = new Date();
      for (const row of open) {
        const prevDetails =
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, any>)
            : {};
        const mergedDetails = {
          ...prevDetails,
          autoResolved: true,
          autoResolvedAt: resolvedAt.toISOString(),
          autoResolvedNote:
            "Auto-cleared after flapping latch released (sweep is stable again).",
        };
        await db
          .update(platformAlerts)
          .set({
            acknowledged: true,
            acknowledgedBy: "system",
            acknowledgedAt: resolvedAt,
            details: mergedDetails,
          })
          .where(eq(platformAlerts.id, row.id));
      }
      if (open.length > 0) {
        console.log(
          `[ProductionAssetOrphanAlert] auto-resolved ${open.length} open flapping-digest alert(s) after recovery`,
        );
      }
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to auto-resolve flapping-digest alerts on recovery:",
        err,
      );
    }
    await this.clearFlappingDigestLastSentAt();
  }

  async setSweepThreshold(value: number, updatedBy?: string): Promise<number> {
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000) {
      throw new Error("invalid_threshold");
    }
    const v = Math.floor(value);
    // Task #845 — snapshot the previous live value BEFORE the upsert so the
    // audit row records the real prev → next diff.
    const previous = await readRawSetting(THRESHOLD_KEY);
    await db
      .insert(systemSettings)
      .values({ key: THRESHOLD_KEY, value: String(v), updatedBy })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: String(v), updatedBy, updatedAt: new Date() },
      });
    if (previous !== String(v)) {
      try {
        await db.insert(productionAssetOrphanSweepThresholdChanges).values({
          previousValue: previous,
          newValue: String(v),
          actorUserId: updatedBy ?? null,
        });
      } catch (err) {
        // Best-effort audit — never let a stale audit insert mask the
        // actual config change the founder just made.
        console.error(
          "[ProductionAssetOrphanAlert] failed to record sweep-threshold change:",
          err,
        );
      }
    }
    if (this.lastOrphanCount != null) {
      this.wasAboveThreshold = this.lastOrphanCount > v;
    }
    return v;
  }

  /**
   * Task #845 — newest-first history of orphan-sweep threshold changes
   * for the 3D-assets admin UI. Caller clamps `limit`; we also clamp
   * server-side to [1, 50].
   *
   * Task #849 — adds `offset`, `from`, `to`, `actorUserId` filters +
   * `total` count so the card can paginate / narrow by actor or date,
   * mirroring the Task #810 flapping-config history surface.
   */
  async listSweepThresholdChanges(
    opts: {
      limit?: number;
      offset?: number;
      from?: Date | null;
      to?: Date | null;
      actorUserId?: string | null;
    } = {},
  ): Promise<{
    items: Array<{
      id: string;
      previousValue: string | null;
      newValue: string;
      actorUserId: string | null;
      changedAt: string;
    }>;
    total: number;
  }> {
    const limit = Math.max(1, Math.min(50, Math.floor(opts.limit ?? 10)));
    const offset = Math.max(0, Math.floor(opts.offset ?? 0));
    const conds: any[] = [];
    if (opts.from instanceof Date && !Number.isNaN(opts.from.getTime())) {
      conds.push(
        gte(productionAssetOrphanSweepThresholdChanges.changedAt, opts.from),
      );
    }
    if (opts.to instanceof Date && !Number.isNaN(opts.to.getTime())) {
      conds.push(
        lte(productionAssetOrphanSweepThresholdChanges.changedAt, opts.to),
      );
    }
    if (typeof opts.actorUserId === "string" && opts.actorUserId.length > 0) {
      conds.push(
        eq(
          productionAssetOrphanSweepThresholdChanges.actorUserId,
          opts.actorUserId,
        ),
      );
    }
    const whereClause = conds.length === 0 ? undefined : and(...conds);
    try {
      const baseQuery = db
        .select()
        .from(productionAssetOrphanSweepThresholdChanges);
      const filteredQuery = whereClause
        ? baseQuery.where(whereClause)
        : baseQuery;
      const rows = await filteredQuery
        .orderBy(desc(productionAssetOrphanSweepThresholdChanges.changedAt))
        .limit(limit)
        .offset(offset);
      const countBase = db
        .select({ id: productionAssetOrphanSweepThresholdChanges.id })
        .from(productionAssetOrphanSweepThresholdChanges);
      const countRows = whereClause
        ? await countBase.where(whereClause)
        : await countBase;
      return {
        items: rows.map((r) => ({
          id: r.id,
          previousValue: r.previousValue,
          newValue: r.newValue,
          actorUserId: r.actorUserId,
          changedAt: r.changedAt.toISOString(),
        })),
        total: countRows.length,
      };
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to list sweep-threshold changes:",
        err,
      );
      return { items: [], total: 0 };
    }
  }

  /**
   * Task #885 — sibling of `exportSweepThresholdChanges` for the
   * orphan-sweep flapping-config audit trail. Same filters
   * (`from` / `to` / `actorUserId`), newest-first, soft-capped so a
   * runaway export can't OOM the server. Includes the `setting` column
   * (e.g. `flapping_threshold` / `flapping_window_ms`) since that
   * table — unlike the threshold one — multiplexes multiple knobs.
   */
  async exportSweepFlappingConfigChanges(
    opts: {
      from?: Date | null;
      to?: Date | null;
      actorUserId?: string | null;
    } = {},
  ): Promise<{
    items: Array<{
      id: string;
      setting: string;
      previousValue: string | null;
      newValue: string;
      actorUserId: string | null;
      changedAt: string;
    }>;
    truncated: boolean;
  }> {
    const EXPORT_MAX = 100000;
    const conds: any[] = [];
    if (opts.from instanceof Date && !Number.isNaN(opts.from.getTime())) {
      conds.push(
        gte(productionAssetSweepFlappingConfigChanges.changedAt, opts.from),
      );
    }
    if (opts.to instanceof Date && !Number.isNaN(opts.to.getTime())) {
      conds.push(
        lte(productionAssetSweepFlappingConfigChanges.changedAt, opts.to),
      );
    }
    if (typeof opts.actorUserId === "string" && opts.actorUserId.length > 0) {
      conds.push(
        eq(
          productionAssetSweepFlappingConfigChanges.actorUserId,
          opts.actorUserId,
        ),
      );
    }
    const whereClause = conds.length === 0 ? undefined : and(...conds);
    try {
      const baseQuery = db
        .select()
        .from(productionAssetSweepFlappingConfigChanges);
      const filteredQuery = whereClause
        ? baseQuery.where(whereClause)
        : baseQuery;
      const rows = await filteredQuery
        .orderBy(desc(productionAssetSweepFlappingConfigChanges.changedAt))
        .limit(EXPORT_MAX + 1);
      const truncated = rows.length > EXPORT_MAX;
      const trimmed = truncated ? rows.slice(0, EXPORT_MAX) : rows;
      return {
        items: trimmed.map((r) => ({
          id: r.id,
          setting: r.setting,
          previousValue: r.previousValue,
          newValue: r.newValue,
          actorUserId: r.actorUserId,
          changedAt: r.changedAt.toISOString(),
        })),
        truncated,
      };
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to export sweep-flapping-config changes:",
        err,
      );
      return { items: [], truncated: false };
    }
  }

  async exportSweepThresholdChanges(opts: { from?: Date | null; to?: Date | null; actorUserId?: string | null } = {}): Promise<{ items: Array<{ id: string; previousValue: string | null; newValue: string; actorUserId: string | null; changedAt: string }>; truncated: boolean }> {
    const EXPORT_MAX = 100000;
    const conds: any[] = [];
    if (opts.from instanceof Date && !Number.isNaN(opts.from.getTime())) {
      conds.push(gte(productionAssetOrphanSweepThresholdChanges.changedAt, opts.from));
    }
    if (opts.to instanceof Date && !Number.isNaN(opts.to.getTime())) {
      conds.push(lte(productionAssetOrphanSweepThresholdChanges.changedAt, opts.to));
    }
    if (typeof opts.actorUserId === "string" && opts.actorUserId.length > 0) {
      conds.push(eq(productionAssetOrphanSweepThresholdChanges.actorUserId, opts.actorUserId));
    }
    const whereClause = conds.length === 0 ? undefined : and(...conds);
    try {
      const baseQuery = db.select().from(productionAssetOrphanSweepThresholdChanges);
      const filteredQuery = whereClause ? baseQuery.where(whereClause) : baseQuery;
      const rows = await filteredQuery
        .orderBy(desc(productionAssetOrphanSweepThresholdChanges.changedAt))
        .limit(EXPORT_MAX + 1);
      const truncated = rows.length > EXPORT_MAX;
      const trimmed = truncated ? rows.slice(0, EXPORT_MAX) : rows;
      return {
        items: trimmed.map((r) => ({
          id: r.id,
          previousValue: r.previousValue,
          newValue: r.newValue,
          actorUserId: r.actorUserId,
          changedAt: r.changedAt.toISOString(),
        })),
        truncated,
      };
    } catch (err) {
      console.error("[ProductionAssetOrphanAlert] failed to export sweep-threshold changes:", err);
      return { items: [], truncated: false };
    }
  }

  /**
   * Task #794 — DB-backed flapping threshold. Mirrors
   * `setSweepThreshold`: validates against the bounded guardrails,
   * upserts the `system_settings` row, and returns the effective value.
   * Re-arms the in-memory latch so a tightened threshold can fire on
   * the next scan without waiting for a fresh below→above transition.
   */
  async setSweepFlappingThreshold(
    value: number,
    updatedBy?: string,
  ): Promise<number> {
    if (
      !Number.isFinite(value) ||
      value < FLAPPING_THRESHOLD_MIN ||
      value > FLAPPING_THRESHOLD_MAX
    ) {
      throw new Error("invalid_flapping_threshold");
    }
    const v = Math.floor(value);
    const previous = await readRawSetting(FLAPPING_THRESHOLD_KEY);
    // Task #825 — snapshot the previous config BEFORE we upsert so the
    // history row captures the real prev → next diff.
    const prev = await readFlappingConfig();
    await db
      .insert(systemSettings)
      .values({ key: FLAPPING_THRESHOLD_KEY, value: String(v), updatedBy })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: String(v), updatedBy, updatedAt: new Date() },
      });
    if (previous !== String(v)) {
      await this.recordFlappingConfigChange({
        setting: "flapping_threshold",
        previousValue: previous,
        newValue: String(v),
        actorUserId: updatedBy ?? null,
      });
    }
    this.wasFlapping = false;
    await recordFlappingConfigChange({
      previous: prev,
      next: { ...prev, flappingThreshold: v },
      updatedBy: updatedBy ?? null,
    });
    return v;
  }

  /**
   * Task #794 — DB-backed flapping window. Same shape as
   * `setSweepFlappingThreshold`; bounded between 1 minute and 90 days.
   */
  async setSweepFlappingWindowMs(
    value: number,
    updatedBy?: string,
  ): Promise<number> {
    if (
      !Number.isFinite(value) ||
      value < FLAPPING_WINDOW_MS_MIN ||
      value > FLAPPING_WINDOW_MS_MAX
    ) {
      throw new Error("invalid_flapping_window_ms");
    }
    const v = Math.floor(value);
    const previous = await readRawSetting(FLAPPING_WINDOW_MS_KEY);
    const prev = await readFlappingConfig();
    await db
      .insert(systemSettings)
      .values({ key: FLAPPING_WINDOW_MS_KEY, value: String(v), updatedBy })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: String(v), updatedBy, updatedAt: new Date() },
      });
    if (previous !== String(v)) {
      await this.recordFlappingConfigChange({
        setting: "flapping_window_ms",
        previousValue: previous,
        newValue: String(v),
        actorUserId: updatedBy ?? null,
      });
    }
    this.wasFlapping = false;
    await recordFlappingConfigChange({
      previous: prev,
      next: { ...prev, flappingWindowMs: v },
      updatedBy: updatedBy ?? null,
    });
    return v;
  }

  /**
   * Task #810 — append-only audit row for every flapping-config change.
   * Failures are swallowed (and logged) so a stale audit insert can't
   * mask the actual config update the founder just made.
   */
  private async recordFlappingConfigChange(input: {
    setting: "flapping_threshold" | "flapping_window_ms";
    previousValue: string | null;
    newValue: string;
    actorUserId: string | null;
  }): Promise<void> {
    try {
      await db.insert(productionAssetSweepFlappingConfigChanges).values({
        setting: input.setting,
        previousValue: input.previousValue,
        newValue: input.newValue,
        actorUserId: input.actorUserId,
      });
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to record flapping-config change:",
        err,
      );
    }
  }

  /**
   * Task #810 — newest-first history of flapping-config changes for the
   * 3D-assets admin UI. Caller clamps `limit` to a sane upper bound.
   */
  async listFlappingConfigChanges(
    opts: {
      limit?: number;
      offset?: number;
      from?: Date | null;
      to?: Date | null;
      actorUserId?: string | null;
    } = {},
  ): Promise<{
    items: Array<{
      id: string;
      setting: string;
      previousValue: string | null;
      newValue: string;
      actorUserId: string | null;
      changedAt: string;
    }>;
    total: number;
  }> {
    const limit = Math.max(1, Math.min(100, Math.floor(opts.limit ?? 10)));
    const offset = Math.max(0, Math.floor(opts.offset ?? 0));
    const conds: any[] = [];
    if (opts.from instanceof Date && !Number.isNaN(opts.from.getTime())) {
      conds.push(
        gte(productionAssetSweepFlappingConfigChanges.changedAt, opts.from),
      );
    }
    if (opts.to instanceof Date && !Number.isNaN(opts.to.getTime())) {
      conds.push(
        lte(productionAssetSweepFlappingConfigChanges.changedAt, opts.to),
      );
    }
    if (typeof opts.actorUserId === "string" && opts.actorUserId.length > 0) {
      conds.push(
        eq(
          productionAssetSweepFlappingConfigChanges.actorUserId,
          opts.actorUserId,
        ),
      );
    }
    const whereClause = conds.length === 0 ? undefined : and(...conds);
    try {
      const baseQuery = db
        .select()
        .from(productionAssetSweepFlappingConfigChanges);
      const filteredQuery = whereClause
        ? baseQuery.where(whereClause)
        : baseQuery;
      const rows = await filteredQuery
        .orderBy(desc(productionAssetSweepFlappingConfigChanges.changedAt))
        .limit(limit)
        .offset(offset);
      const countBase = db
        .select({ id: productionAssetSweepFlappingConfigChanges.id })
        .from(productionAssetSweepFlappingConfigChanges);
      const countRows = whereClause
        ? await countBase.where(whereClause)
        : await countBase;
      return {
        items: rows.map((r) => ({
          id: r.id,
          setting: r.setting,
          previousValue: r.previousValue,
          newValue: r.newValue,
          actorUserId: r.actorUserId,
          changedAt: r.changedAt.toISOString(),
        })),
        total: countRows.length,
      };
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to list flapping-config changes:",
        err,
      );
      return { items: [], total: 0 };
    }
  }

  /**
   * Task #825 — combined setter so callers can change both knobs in one
   * round-trip and get a single history row with both fields in
   * `changedFields`. Individual route handlers may keep calling the
   * single-field setters above.
   */
  async setSweepFlappingConfig(input: {
    flappingThreshold?: number;
    flappingWindowMs?: number;
    updatedBy?: string | null;
  }): Promise<FlappingConfigSnapshot> {
    const prev = await readFlappingConfig();
    const next: FlappingConfigSnapshot = { ...prev };

    if (input.flappingThreshold !== undefined) {
      if (
        !Number.isFinite(input.flappingThreshold) ||
        input.flappingThreshold < FLAPPING_THRESHOLD_MIN ||
        input.flappingThreshold > FLAPPING_THRESHOLD_MAX
      ) {
        throw new Error("invalid_flapping_threshold");
      }
      next.flappingThreshold = Math.floor(input.flappingThreshold);
    }
    if (input.flappingWindowMs !== undefined) {
      if (
        !Number.isFinite(input.flappingWindowMs) ||
        input.flappingWindowMs < FLAPPING_WINDOW_MS_MIN ||
        input.flappingWindowMs > FLAPPING_WINDOW_MS_MAX
      ) {
        throw new Error("invalid_flapping_window_ms");
      }
      next.flappingWindowMs = Math.floor(input.flappingWindowMs);
    }

    const updatedBy = input.updatedBy ?? undefined;
    if (next.flappingThreshold !== prev.flappingThreshold) {
      await db
        .insert(systemSettings)
        .values({
          key: FLAPPING_THRESHOLD_KEY,
          value: String(next.flappingThreshold),
          updatedBy,
        })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: {
            value: String(next.flappingThreshold),
            updatedBy,
            updatedAt: new Date(),
          },
        });
    }
    if (next.flappingWindowMs !== prev.flappingWindowMs) {
      await db
        .insert(systemSettings)
        .values({
          key: FLAPPING_WINDOW_MS_KEY,
          value: String(next.flappingWindowMs),
          updatedBy,
        })
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: {
            value: String(next.flappingWindowMs),
            updatedBy,
            updatedAt: new Date(),
          },
        });
    }
    this.wasFlapping = false;
    await recordFlappingConfigChange({
      previous: prev,
      next,
      updatedBy: input.updatedBy ?? null,
    });
    return next;
  }

  private async fireSweepAlert(count: number, threshold: number) {
    const message =
      `Scheduled 3D asset orphan sweep found ${count} archived row(s) ` +
      `whose object bytes are missing (threshold ${threshold}). Reconcile ` +
      `from the production-assets admin panel.`;
    // Task #789 — founder PTO mode swallows the alert (no platform_alerts
    // row, no email). The crossing event is still consumed by the caller
    // so we don't re-fire every tick during PTO.
    try {
      const { isNotifierMutedByPto, bumpFounderPtoSuppressedCount } =
        await import("./founder-pto-mode-service");
      const ptoSnooze = await isNotifierMutedByPto(
        PRODUCTION_ASSET_ORPHAN_SWEEP_PTO_NOTIFIER_ID,
      );
      if (ptoSnooze) {
        await bumpFounderPtoSuppressedCount({
          notifierId: PRODUCTION_ASSET_ORPHAN_SWEEP_PTO_NOTIFIER_ID,
          source: ptoSnooze.source,
          effectiveUntil: ptoSnooze.effectiveUntil,
          summary: `3D asset orphan sweep crossed threshold: ${count} > ${threshold}`,
          payload: { orphanCount: count, threshold },
        });
        return;
      }
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] PTO mode check failed:",
        (err as Error)?.message ?? err,
      );
    }
    try {
      await panicButtonService.createAlert({
        type: PRODUCTION_ASSET_ORPHAN_SWEEP_ALERT_TYPE,
        severity: "warning",
        message,
        details: {
          orphanCount: count,
          threshold,
          source: "production-asset-orphan-alert-service",
          link: "/admin/3d-assets",
        },
        autoTriggered: true,
      });
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to create sweep alert:",
        err,
      );
    }
    try {
      const recipients = await db
        .select({ email: adminStaff.email })
        .from(adminStaff)
        .where(
          and(eq(adminStaff.role, "root_admin"), eq(adminStaff.active, true)),
        );
      for (const r of recipients) {
        if (!r.email) continue;
        await this.emailService.sendAdminAlert(r.email, {
          title: "3D asset orphan sweep crossed threshold",
          severity: "medium",
          message,
          actionUrl: "/admin/3d-assets",
        });
      }
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to email admins about sweep:",
        err,
      );
    }
  }

  private async autoResolveOpenSweepAlerts(count: number, threshold: number) {
    try {
      const open = await db
        .select()
        .from(platformAlerts)
        .where(
          and(
            eq(platformAlerts.type, PRODUCTION_ASSET_ORPHAN_SWEEP_ALERT_TYPE),
            eq(platformAlerts.acknowledged, false),
          ),
        )
        .orderBy(desc(platformAlerts.createdAt));
      if (open.length === 0) return;
      const resolvedAt = new Date();
      for (const row of open) {
        const prevDetails =
          row.details && typeof row.details === "object"
            ? (row.details as Record<string, any>)
            : {};
        const mergedDetails = {
          ...prevDetails,
          autoResolved: true,
          autoResolvedAt: resolvedAt.toISOString(),
          autoResolvedOrphanCount: count,
          autoResolvedThreshold: threshold,
          autoResolvedNote: `Auto-cleared by scheduled sweep: orphan count ${count} ≤ threshold ${threshold}.`,
        };
        await db
          .update(platformAlerts)
          .set({
            acknowledged: true,
            acknowledgedBy: "system",
            acknowledgedAt: resolvedAt,
            details: mergedDetails,
          })
          .where(eq(platformAlerts.id, row.id));
      }
      this.lastAutoResolvedAt = resolvedAt.getTime();
      this.lastAutoResolvedCount = open.length;
      console.log(
        `[ProductionAssetOrphanAlert] auto-resolved ${open.length} open sweep alert(s) (count=${count}, threshold=${threshold})`,
      );
    } catch (err) {
      console.error(
        "[ProductionAssetOrphanAlert] failed to auto-resolve sweep alerts:",
        err,
      );
    }
  }
}

export const productionAssetOrphanAlertService =
  new ProductionAssetOrphanAlertService();

/* ------------------------------------------------------------------ */
/* Task #805 — flapping-digest snooze controls                         */
/* ------------------------------------------------------------------ */

/**
 * Read the current snooze config for the recurring flapping digest.
 * Returns the shared shape used by the audit-email snooze helper so
 * the admin UI can reuse the same display logic.
 */
export async function getProductionAssetOrphanSweepFlappingDigestSnooze(): Promise<AuditEmailFailureAlertSnoozeConfig> {
  return getAuditEmailFailureAlertSnooze(
    PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_SNOOZE_KEY,
  );
}

/**
 * Set or clear the snooze window for the recurring flapping digest.
 * `snoozeUntil:null` clears an active snooze. ISO timestamps must be
 * strictly in the future and are clamped to the shared 90-day cap.
 * Audit history is logged automatically via
 * `audience_audit_email_failure_alert_snoozes`.
 */
export async function setProductionAssetOrphanSweepFlappingDigestSnooze(input: {
  snoozeUntil: string | null;
  updatedBy?: string | null;
}): Promise<AuditEmailFailureAlertSnoozeConfig> {
  return setAuditEmailFailureAlertSnooze(
    PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_SNOOZE_KEY,
    { snoozeUntil: input.snoozeUntil, updatedBy: input.updatedBy ?? null },
  );
}

/**
 * Newest-first audit history of snooze actions (set / cleared /
 * expired) for the flapping digest. `limit` is bounded to [1, 50] by
 * the underlying helper.
 */
export async function listProductionAssetOrphanSweepFlappingDigestSnoozeHistory(
  limit = 10,
): Promise<AuditEmailFailureAlertSnoozeHistoryEntry[]> {
  return listAuditEmailFailureAlertSnoozeHistory(
    PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_SNOOZE_KEY,
    limit,
  );
}

/* ------------------------------------------------------------------ */
/* Task #825 — flapping config-change history                          */
/* ------------------------------------------------------------------ */

export type FlappingConfigSnapshot = {
  flappingThreshold: number;
  flappingWindowMs: number;
};

export type FlappingConfigChangedField =
  | "flappingThreshold"
  | "flappingWindowMs";

export type FlappingConfigChangeAction = "updated" | "restored_default";

export type FlappingConfigHistoryEntry = {
  id: string;
  occurredAt: string;
  updatedBy: string | null;
  action: FlappingConfigChangeAction;
  previousConfig: FlappingConfigSnapshot | null;
  newConfig: FlappingConfigSnapshot | null;
  changedFields: FlappingConfigChangedField[];
};

const FLAPPING_CONFIG_HISTORY_MAX = 50;
const FLAPPING_CONFIG_DEFAULTS: FlappingConfigSnapshot = {
  flappingThreshold: FLAPPING_THRESHOLD_DEFAULT,
  flappingWindowMs: FLAPPING_WINDOW_MS_DEFAULT,
};

export async function readFlappingConfig(): Promise<FlappingConfigSnapshot> {
  const [t, w] = await Promise.all([
    readFlappingThreshold(),
    readFlappingWindowMs(),
  ]);
  return { flappingThreshold: t, flappingWindowMs: w };
}

export function diffFlappingConfig(
  previous: FlappingConfigSnapshot,
  next: FlappingConfigSnapshot,
): FlappingConfigChangedField[] {
  const changed: FlappingConfigChangedField[] = [];
  if (previous.flappingThreshold !== next.flappingThreshold)
    changed.push("flappingThreshold");
  if (previous.flappingWindowMs !== next.flappingWindowMs)
    changed.push("flappingWindowMs");
  return changed;
}

function classifyFlappingConfigChange(
  next: FlappingConfigSnapshot,
): FlappingConfigChangeAction {
  return next.flappingThreshold === FLAPPING_CONFIG_DEFAULTS.flappingThreshold &&
    next.flappingWindowMs === FLAPPING_CONFIG_DEFAULTS.flappingWindowMs
    ? "restored_default"
    : "updated";
}

/**
 * Task #825 — append a sanitized history row for a flapping config
 * change. Best-effort: a write failure must NOT break the live config
 * setter (mirrors `recordAuditExportNotifierConfigChange` from
 * Task #728). No-op when nothing actually changed.
 */
export async function recordFlappingConfigChange(input: {
  previous: FlappingConfigSnapshot;
  next: FlappingConfigSnapshot;
  updatedBy: string | null;
  occurredAt?: Date;
}): Promise<FlappingConfigHistoryEntry | null> {
  const changed = diffFlappingConfig(input.previous, input.next);
  if (changed.length === 0) return null;
  const action = classifyFlappingConfigChange(input.next);
  const occurredAt = input.occurredAt ?? new Date();
  try {
    const inserted = await db
      .insert(productionAssetOrphanSweepFlappingConfigHistory)
      .values({
        occurredAt,
        updatedBy: input.updatedBy ?? undefined,
        action,
        previousConfig: input.previous as unknown as object,
        newConfig: input.next as unknown as object,
        changedFields: changed as unknown as string[],
      } as any)
      .returning();
    const row = inserted[0];
    return row ? rowToFlappingConfigHistoryEntry(row) : null;
  } catch (err) {
    console.error(
      "[ProductionAssetOrphanAlert] failed to persist flapping-config history:",
      (err as Error)?.message ?? err,
    );
    return null;
  }
}

function rowToFlappingConfigHistoryEntry(row: {
  id: string;
  occurredAt: Date | string | null;
  updatedBy: string | null;
  action: string;
  previousConfig: unknown;
  newConfig: unknown;
  changedFields: unknown;
}): FlappingConfigHistoryEntry {
  return {
    id: row.id,
    occurredAt: (row.occurredAt instanceof Date
      ? row.occurredAt
      : new Date((row.occurredAt as any) ?? Date.now())
    ).toISOString(),
    updatedBy: row.updatedBy ?? null,
    action: row.action as FlappingConfigChangeAction,
    previousConfig:
      (row.previousConfig as FlappingConfigSnapshot | null) ?? null,
    newConfig: (row.newConfig as FlappingConfigSnapshot | null) ?? null,
    changedFields: Array.isArray(row.changedFields)
      ? (row.changedFields as FlappingConfigChangedField[])
      : [],
  };
}

export async function listFlappingConfigHistory(
  limit = 10,
  options: { actorUserId?: string | null } = {},
): Promise<FlappingConfigHistoryEntry[]> {
  const bounded = Math.max(
    1,
    Math.min(FLAPPING_CONFIG_HISTORY_MAX, Math.floor(limit) || 10),
  );
  const actor =
    typeof options.actorUserId === "string"
      ? options.actorUserId.trim()
      : "";
  try {
    const baseQuery = db
      .select()
      .from(productionAssetOrphanSweepFlappingConfigHistory);
    const filtered = actor
      ? baseQuery.where(
          eq(productionAssetOrphanSweepFlappingConfigHistory.updatedBy, actor),
        )
      : baseQuery;
    const rows = await filtered
      .orderBy(desc(productionAssetOrphanSweepFlappingConfigHistory.occurredAt))
      .limit(bounded);
    return rows.map((r) => rowToFlappingConfigHistoryEntry(r as any));
  } catch (err) {
    console.error(
      "[ProductionAssetOrphanAlert] failed to list flapping-config history:",
      (err as Error)?.message ?? err,
    );
    return [];
  }
}

/**
 * Task #848 — "Top changers" leaderboard for the flapping-config audit
 * trail. Aggregates the Task #825 history table by `updatedBy` over a
 * caller-bounded lookback window (1..90 days) and returns the most
 * frequent actors newest-first. Rows where `updatedBy` is NULL are
 * surfaced under the literal string "system" so founders can still see
 * automatic restores. Limit is clamped to 1..20 server-side.
 */
export const FLAPPING_CONFIG_HISTORY_ACTOR_STATS_MAX_WINDOW_DAYS = 90;
export const FLAPPING_CONFIG_HISTORY_ACTOR_STATS_MAX_LIMIT = 20;

export type FlappingConfigHistoryActorStat = {
  actorUserId: string | null;
  changeCount: number;
  lastChangeAt: string;
};

export async function listFlappingConfigHistoryActorStats(
  windowDays: number,
  limit = 5,
): Promise<{
  items: FlappingConfigHistoryActorStat[];
  windowDays: number;
  since: string;
  limit: number;
}> {
  const days = Math.max(
    1,
    Math.min(
      FLAPPING_CONFIG_HISTORY_ACTOR_STATS_MAX_WINDOW_DAYS,
      Math.floor(windowDays) || 7,
    ),
  );
  const bounded = Math.max(
    1,
    Math.min(
      FLAPPING_CONFIG_HISTORY_ACTOR_STATS_MAX_LIMIT,
      Math.floor(limit) || 5,
    ),
  );
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    const rows = await db
      .select({
        updatedBy: productionAssetOrphanSweepFlappingConfigHistory.updatedBy,
        changeCount: count(),
        lastChangeAt: sql<Date>`max(${productionAssetOrphanSweepFlappingConfigHistory.occurredAt})`,
      })
      .from(productionAssetOrphanSweepFlappingConfigHistory)
      .where(
        gte(
          productionAssetOrphanSweepFlappingConfigHistory.occurredAt,
          since,
        ),
      )
      .groupBy(productionAssetOrphanSweepFlappingConfigHistory.updatedBy)
      .orderBy(desc(count()))
      .limit(bounded);
    const items: FlappingConfigHistoryActorStat[] = rows.map((r) => ({
      actorUserId: r.updatedBy ?? null,
      changeCount: Number(r.changeCount ?? 0),
      lastChangeAt: (r.lastChangeAt instanceof Date
        ? r.lastChangeAt
        : new Date((r.lastChangeAt as any) ?? Date.now())
      ).toISOString(),
    }));
    return {
      items,
      windowDays: days,
      since: since.toISOString(),
      limit: bounded,
    };
  } catch (err) {
    console.error(
      "[ProductionAssetOrphanAlert] failed to aggregate flapping-config history actor stats:",
      (err as Error)?.message ?? err,
    );
    return { items: [], windowDays: days, since: since.toISOString(), limit: bounded };
  }
}

/**
 * Task #851 — Per-day change counts for the flapping-config audit trail.
 * Aggregates the Task #825 history table by UTC day over a caller-bounded
 * lookback window (1..90 days) so the founder UI can render a small
 * spark/bar chart of WHEN tuning is happening. Days inside the window
 * with zero changes are returned with `count: 0` so the rendered chart
 * has a stable bar count.
 */
export const FLAPPING_CONFIG_HISTORY_DAILY_STATS_MAX_WINDOW_DAYS = 90;
export const FLAPPING_CONFIG_HISTORY_DAILY_STATS_DEFAULT_WINDOW_DAYS = 14;
export const FLAPPING_CONFIG_HISTORY_DAILY_STATS_DEFAULT_TIME_ZONE = "UTC";

export type FlappingConfigHistoryDailyStatBucket = {
  day: string;
  count: number;
};

/**
 * Task #859 — Validate an IANA time-zone string by feeding it to
 * `Intl.DateTimeFormat`. Returns the normalized zone if accepted,
 * `null` if rejected (callers fall back to UTC). Bounded to 64 chars
 * to keep the SQL parameter from being weaponized as a payload.
 */
export function normalizeFlappingDailyStatsTimeZone(
  tz: string | null | undefined,
): string | null {
  if (!tz || typeof tz !== "string") return null;
  const trimmed = tz.trim();
  if (!trimmed || trimmed.length > 64) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: trimmed })
      .resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

// Returns the wall-clock {y,m,d,H,M,S} of `instantMs` as observed in `tz`.
function wallClockInTimeZone(
  instantMs: number,
  tz: string,
): { y: number; m: number; d: number; H: number; M: number; S: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(instantMs));
  const get = (t: string) => {
    const p = parts.find((p) => p.type === t);
    return p ? Number(p.value) : 0;
  };
  let H = get("hour");
  if (H === 24) H = 0; // Intl quirk for some locales
  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    H,
    M: get("minute"),
    S: get("second"),
  };
}

// Returns the UTC ms for "00:00:00 local on (y, m, d) in `tz`".
function utcMsForLocalDayStart(
  y: number,
  m: number,
  d: number,
  tz: string,
): number {
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const wall = wallClockInTimeZone(guess, tz);
  const wallMs = Date.UTC(wall.y, wall.m - 1, wall.d, wall.H, wall.M, wall.S);
  const offset = wallMs - guess; // how far tz is ahead of UTC at that instant
  return guess - offset;
}

export async function listFlappingConfigHistoryDailyStats(
  windowDays: number = FLAPPING_CONFIG_HISTORY_DAILY_STATS_DEFAULT_WINDOW_DAYS,
  timeZoneInput: string | null | undefined = FLAPPING_CONFIG_HISTORY_DAILY_STATS_DEFAULT_TIME_ZONE,
): Promise<{
  windowDays: number;
  timeZone: string;
  since: string;
  totalCount: number;
  buckets: FlappingConfigHistoryDailyStatBucket[];
  queryFailed: boolean;
  errorReason: string | null;
}> {
  const days = Math.max(
    1,
    Math.min(
      FLAPPING_CONFIG_HISTORY_DAILY_STATS_MAX_WINDOW_DAYS,
      Math.floor(windowDays) ||
        FLAPPING_CONFIG_HISTORY_DAILY_STATS_DEFAULT_WINDOW_DAYS,
    ),
  );
  const tz =
    normalizeFlappingDailyStatsTimeZone(timeZoneInput) ??
    FLAPPING_CONFIG_HISTORY_DAILY_STATS_DEFAULT_TIME_ZONE;
  const now = Date.now();
  // Anchor `since` to the start of today *in the requested time zone*
  // minus `days - 1` days, so the returned series always contains exactly
  // `days` buckets ending on today (as the founder experiences it).
  const today = wallClockInTimeZone(now, tz);
  const todayLocalMs = utcMsForLocalDayStart(today.y, today.m, today.d, tz);
  const sinceMs = (() => {
    // Walk back `days - 1` calendar days in `tz`, re-anchoring each step
    // to local midnight so DST transitions don't shift the window.
    let cursor = todayLocalMs;
    for (let i = 0; i < days - 1; i++) {
      const w = wallClockInTimeZone(cursor - 12 * 60 * 60 * 1000, tz);
      cursor = utcMsForLocalDayStart(w.y, w.m, w.d, tz);
    }
    return cursor;
  })();
  const since = new Date(sinceMs);
  const empty = (): FlappingConfigHistoryDailyStatBucket[] => {
    const out: FlappingConfigHistoryDailyStatBucket[] = [];
    let cursor = sinceMs;
    for (let i = 0; i < days; i++) {
      const w = wallClockInTimeZone(cursor, tz);
      const yyyy = String(w.y).padStart(4, "0");
      const mm = String(w.m).padStart(2, "0");
      const dd = String(w.d).padStart(2, "0");
      out.push({ day: `${yyyy}-${mm}-${dd}`, count: 0 });
      // Advance to the next local midnight; nudge forward 36h then re-anchor.
      const next = wallClockInTimeZone(cursor + 36 * 60 * 60 * 1000, tz);
      cursor = utcMsForLocalDayStart(next.y, next.m, next.d, tz);
    }
    return out;
  };
  try {
    // `occurred_at` is `timestamp without time zone` but holds UTC wall time
    // (defaultNow() at insert time). Re-tag it as UTC, convert to the
    // requested zone, then truncate to the day in that zone.
    const dayCol = sql<string>`to_char(date_trunc('day', (${productionAssetOrphanSweepFlappingConfigHistory.occurredAt} AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD')`;
    const countCol = sql<number>`count(*)::int`;
    // Group/order by the SELECT position rather than re-binding the
    // `${tz}` parameter — Postgres treats each placeholder as a distinct
    // expression and would otherwise reject `occurred_at` as missing
    // from GROUP BY. See Task #865.
    const rows = await db
      .select({ day: dayCol, count: countCol })
      .from(productionAssetOrphanSweepFlappingConfigHistory)
      .where(
        gte(
          productionAssetOrphanSweepFlappingConfigHistory.occurredAt,
          since,
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`);
    const byDay = new Map<string, number>();
    for (const r of rows) {
      byDay.set(String(r.day), Number(r.count) || 0);
    }
    const buckets = empty();
    let total = 0;
    for (const b of buckets) {
      const c = byDay.get(b.day) ?? 0;
      b.count = c;
      total += c;
    }
    return {
      windowDays: days,
      timeZone: tz,
      since: since.toISOString(),
      totalCount: total,
      buckets,
      queryFailed: false,
      errorReason: null,
    };
  } catch (err) {
    // Task #871 — Do NOT silently fall back to all-zero buckets. The
    // Task #865 GROUP BY regression slipped through because this catch
    // returned the same shape as "no rows in window", so the founder
    // chart rendered empty bars instead of a visible failure. Surface
    // the failure explicitly: keep the loud log AND attach an
    // `queryFailed` flag + `errorReason` to the payload so the admin
    // UI can distinguish "no changes" from "query crashed".
    const reason = (err as Error)?.message ?? String(err);
    console.error(
      "[ProductionAssetOrphanAlert] failed to aggregate flapping-config history daily stats (surfacing to admin UI as queryFailed):",
      reason,
    );
    return {
      windowDays: days,
      timeZone: tz,
      since: since.toISOString(),
      totalCount: 0,
      buckets: empty(),
      queryFailed: true,
      errorReason: reason,
    };
  }
}

/**
 * Task #858 — Per-day flapping alert counts (one-shot + digest) for the
 * SAME window as the Task #851 config-change daily stats. Lets the
 * founder UI overlay alert markers on the changes-per-day chart so a
 * tuning spike can be confirmed against an actual alert storm. Counts
 * `platform_alerts` rows by the two flapping alert types, bucketed by
 * UTC day. `windowDays` is bounded server-side to 1..90 to match
 * `listFlappingConfigHistoryDailyStats`.
 */
export const FLAPPING_ALERT_DAILY_STATS_MAX_WINDOW_DAYS =
  FLAPPING_CONFIG_HISTORY_DAILY_STATS_MAX_WINDOW_DAYS;
export const FLAPPING_ALERT_DAILY_STATS_DEFAULT_WINDOW_DAYS =
  FLAPPING_CONFIG_HISTORY_DAILY_STATS_DEFAULT_WINDOW_DAYS;

export type FlappingAlertDailyStatBucket = {
  day: string;
  alertCount: number;
  digestCount: number;
  total: number;
};

export async function listFlappingAlertDailyStats(
  windowDays: number = FLAPPING_ALERT_DAILY_STATS_DEFAULT_WINDOW_DAYS,
  timeZoneInput: string | null | undefined = FLAPPING_CONFIG_HISTORY_DAILY_STATS_DEFAULT_TIME_ZONE,
): Promise<{
  windowDays: number;
  timeZone: string;
  since: string;
  totalAlertCount: number;
  totalDigestCount: number;
  totalCount: number;
  buckets: FlappingAlertDailyStatBucket[];
}> {
  const days = Math.max(
    1,
    Math.min(
      FLAPPING_ALERT_DAILY_STATS_MAX_WINDOW_DAYS,
      Math.floor(windowDays) ||
        FLAPPING_ALERT_DAILY_STATS_DEFAULT_WINDOW_DAYS,
    ),
  );
  // Task #877 — Mirror `listFlappingConfigHistoryDailyStats` so the
  // alert-storm overlay buckets by the SAME founder-chosen calendar day
  // as the underlying config-history series. Without this, a non-UTC
  // founder sees the overlay markers slide off the bars they belong to
  // whenever a spike straddles local midnight.
  const tz =
    normalizeFlappingDailyStatsTimeZone(timeZoneInput) ??
    FLAPPING_CONFIG_HISTORY_DAILY_STATS_DEFAULT_TIME_ZONE;
  const now = Date.now();
  const today = wallClockInTimeZone(now, tz);
  const todayLocalMs = utcMsForLocalDayStart(today.y, today.m, today.d, tz);
  const sinceMs = (() => {
    let cursor = todayLocalMs;
    for (let i = 0; i < days - 1; i++) {
      const w = wallClockInTimeZone(cursor - 12 * 60 * 60 * 1000, tz);
      cursor = utcMsForLocalDayStart(w.y, w.m, w.d, tz);
    }
    return cursor;
  })();
  const since = new Date(sinceMs);
  const empty = (): FlappingAlertDailyStatBucket[] => {
    const out: FlappingAlertDailyStatBucket[] = [];
    let cursor = sinceMs;
    for (let i = 0; i < days; i++) {
      const w = wallClockInTimeZone(cursor, tz);
      const yyyy = String(w.y).padStart(4, "0");
      const mm = String(w.m).padStart(2, "0");
      const dd = String(w.d).padStart(2, "0");
      out.push({
        day: `${yyyy}-${mm}-${dd}`,
        alertCount: 0,
        digestCount: 0,
        total: 0,
      });
      const next = wallClockInTimeZone(cursor + 36 * 60 * 60 * 1000, tz);
      cursor = utcMsForLocalDayStart(next.y, next.m, next.d, tz);
    }
    return out;
  };
  try {
    // Re-tag `created_at` as UTC then convert to the requested zone,
    // matching the Task #865 fix on the config-history function. Group
    // by the SELECT position so the `${tz}` parameter is not re-bound
    // (Postgres treats each placeholder as a distinct expression and
    // would otherwise reject `created_at` as missing from GROUP BY).
    const dayCol = sql<string>`to_char(date_trunc('day', (${platformAlerts.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD')`;
    const countCol = sql<number>`count(*)::int`;
    const rows = await db
      .select({
        day: dayCol,
        type: platformAlerts.type,
        count: countCol,
      })
      .from(platformAlerts)
      .where(
        and(
          gte(platformAlerts.createdAt, since),
          inArray(platformAlerts.type, [
            PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_ALERT_TYPE,
            PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_ALERT_TYPE,
          ]),
        ),
      )
      .groupBy(sql`1`, platformAlerts.type)
      .orderBy(sql`1`);
    const byDay = new Map<string, { alert: number; digest: number }>();
    for (const r of rows) {
      const day = String(r.day);
      const cur = byDay.get(day) ?? { alert: 0, digest: 0 };
      const c = Number(r.count) || 0;
      if (r.type === PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_ALERT_TYPE) {
        cur.digest += c;
      } else {
        cur.alert += c;
      }
      byDay.set(day, cur);
    }
    const buckets = empty();
    let totalAlert = 0;
    let totalDigest = 0;
    for (const b of buckets) {
      const c = byDay.get(b.day);
      if (c) {
        b.alertCount = c.alert;
        b.digestCount = c.digest;
        b.total = c.alert + c.digest;
        totalAlert += c.alert;
        totalDigest += c.digest;
      }
    }
    return {
      windowDays: days,
      timeZone: tz,
      since: since.toISOString(),
      totalAlertCount: totalAlert,
      totalDigestCount: totalDigest,
      totalCount: totalAlert + totalDigest,
      buckets,
    };
  } catch (err) {
    console.error(
      "[ProductionAssetOrphanAlert] failed to aggregate flapping alert daily stats:",
      (err as Error)?.message ?? err,
    );
    return {
      windowDays: days,
      timeZone: tz,
      since: since.toISOString(),
      totalAlertCount: 0,
      totalDigestCount: 0,
      totalCount: 0,
      buckets: empty(),
    };
  }
}

/**
 * Task #861 — Per-day drill-down for the flapping alert/digest markers
 * surfaced by `listFlappingAlertDailyStats`. Returns every
 * `platform_alerts` row of the two flapping types whose `created_at`
 * falls inside the given UTC day, newest-first, so the founder UI can
 * open the raw rows behind a clicked marker.
 *
 * `day` must be ISO `YYYY-MM-DD`. Returned rows expose the founder-
 * relevant fields only (no internal columns added later are leaked).
 */
const FLAPPING_ALERT_BY_DAY_TYPES = [
  PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_ALERT_TYPE,
  PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_ALERT_TYPE,
] as const;

export const FLAPPING_ALERT_BY_DAY_MAX_LIMIT = 200;
export const FLAPPING_ALERT_BY_DAY_DEFAULT_LIMIT = 50;

export type FlappingAlertByDayKind = "alert" | "digest";

export type FlappingAlertByDayRow = {
  id: string;
  type: string;
  kind: FlappingAlertByDayKind;
  severity: string;
  message: string;
  details: unknown;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  autoTriggered: boolean;
  createdAt: string;
};

export async function listFlappingAlertsForDay(
  day: string,
  options: { limit?: number } = {},
): Promise<{
  day: string;
  dayStart: string;
  dayEnd: string;
  limit: number;
  total: number;
  alertCount: number;
  digestCount: number;
  items: FlappingAlertByDayRow[];
}> {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) {
    throw new Error("invalid_day");
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const startMs = Date.UTC(y, mo - 1, d);
  const startDate = new Date(startMs);
  if (
    Number.isNaN(startDate.getTime()) ||
    startDate.getUTCFullYear() !== y ||
    startDate.getUTCMonth() !== mo - 1 ||
    startDate.getUTCDate() !== d
  ) {
    throw new Error("invalid_day");
  }
  const endDate = new Date(startMs + 24 * 60 * 60 * 1000);
  const limit = Math.max(
    1,
    Math.min(
      FLAPPING_ALERT_BY_DAY_MAX_LIMIT,
      Math.floor(options.limit ?? FLAPPING_ALERT_BY_DAY_DEFAULT_LIMIT) ||
        FLAPPING_ALERT_BY_DAY_DEFAULT_LIMIT,
    ),
  );
  const whereClause = and(
    gte(platformAlerts.createdAt, startDate),
    lt(platformAlerts.createdAt, endDate),
    inArray(platformAlerts.type, [...FLAPPING_ALERT_BY_DAY_TYPES]),
  );
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: platformAlerts.id,
        type: platformAlerts.type,
        severity: platformAlerts.severity,
        message: platformAlerts.message,
        details: platformAlerts.details,
        acknowledged: platformAlerts.acknowledged,
        acknowledgedBy: platformAlerts.acknowledgedBy,
        acknowledgedAt: platformAlerts.acknowledgedAt,
        autoTriggered: platformAlerts.autoTriggered,
        createdAt: platformAlerts.createdAt,
      })
      .from(platformAlerts)
      .where(whereClause)
      .orderBy(desc(platformAlerts.createdAt))
      .limit(limit),
    db
      .select({ c: count() })
      .from(platformAlerts)
      .where(whereClause),
  ]);
  let alertCount = 0;
  let digestCount = 0;
  const items: FlappingAlertByDayRow[] = rows.map((r) => {
    const kind: FlappingAlertByDayKind =
      r.type === PRODUCTION_ASSET_ORPHAN_SWEEP_FLAPPING_DIGEST_ALERT_TYPE
        ? "digest"
        : "alert";
    if (kind === "digest") digestCount += 1;
    else alertCount += 1;
    return {
      id: r.id,
      type: r.type,
      kind,
      severity: r.severity,
      message: r.message,
      details: r.details ?? null,
      acknowledged: r.acknowledged,
      acknowledgedBy: r.acknowledgedBy ?? null,
      acknowledgedAt: r.acknowledgedAt
        ? new Date(r.acknowledgedAt).toISOString()
        : null,
      autoTriggered: r.autoTriggered,
      createdAt: r.createdAt
        ? new Date(r.createdAt).toISOString()
        : new Date(0).toISOString(),
    };
  });
  return {
    day,
    dayStart: startDate.toISOString(),
    dayEnd: endDate.toISOString(),
    limit,
    total: Number(totalRows[0]?.c ?? 0),
    alertCount,
    digestCount,
    items,
  };
}

export async function clearFlappingConfigHistoryForTests(): Promise<void> {
  try {
    await db.delete(productionAssetOrphanSweepFlappingConfigHistory);
  } catch {
    /* best-effort test cleanup */
  }
}

/**
 * Task #840 — Retention helpers for the two append-only flapping audit
 * tables. Mirrors `pruneAuditExportNotifierConfigHistoryOlderThan`
 * (Task #728): deletes rows strictly older than `cutoff` and returns
 * the number removed. Wired into the daily audience-retention sweep so
 * the tables can't grow without bound.
 */
export async function pruneFlappingConfigHistoryOlderThan(
  cutoff: Date,
): Promise<number> {
  const deleted = await db
    .delete(productionAssetOrphanSweepFlappingConfigHistory)
    .where(lt(productionAssetOrphanSweepFlappingConfigHistory.occurredAt, cutoff))
    .returning({ id: productionAssetOrphanSweepFlappingConfigHistory.id });
  return deleted.length;
}

export async function pruneFlappingSnoozeLogOlderThan(
  cutoff: Date,
): Promise<number> {
  const deleted = await db
    .delete(productionAssetOrphanSweepFlappingSnoozes)
    .where(lt(productionAssetOrphanSweepFlappingSnoozes.occurredAt, cutoff))
    .returning({ id: productionAssetOrphanSweepFlappingSnoozes.id });
  return deleted.length;
}

/**
 * Task #850 — Retention helper for the orphan-sweep alert threshold
 * change history table created in Task #845. Mirrors
 * `pruneFlappingConfigHistoryOlderThan`: deletes rows strictly older
 * than `cutoff` and returns the number removed. Wired into the daily
 * audience-retention sweep so the table can't grow without bound.
 */
export async function pruneSweepThresholdChangesOlderThan(
  cutoff: Date,
): Promise<number> {
  const deleted = await db
    .delete(productionAssetOrphanSweepThresholdChanges)
    .where(lt(productionAssetOrphanSweepThresholdChanges.changedAt, cutoff))
    .returning({ id: productionAssetOrphanSweepThresholdChanges.id });
  return deleted.length;
}

export async function clearSweepThresholdChangesForTests(): Promise<void> {
  try {
    await db.delete(productionAssetOrphanSweepThresholdChanges);
  } catch {
    /* best-effort test cleanup */
  }
}
