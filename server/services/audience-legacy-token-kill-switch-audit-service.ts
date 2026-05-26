/**
 * Legacy-token kill-switch audit log (Task #558).
 *
 * Records every change root admins make to the per-platform legacy-token
 * env-fallback kill-switch via `setEnvFallbackDisabledOverride` / the
 * `PUT .../legacy-token-status/:platform/env-fallback-disabled` route
 * (Task #501). Founders use the history panel under the legacy-token
 * status card to review who flipped which platform when investigating
 * a security incident.
 *
 * Failures to insert / read are swallowed so a broken audit log can
 * never block an actual kill-switch change or break the dashboard.
 */

import { and, desc, eq, gte, lt, lte } from "drizzle-orm";
import { db } from "../db";
import {
  audienceLegacyTokenKillSwitchAudit,
  type AudienceLegacyTokenKillSwitchAuditRow,
  type AudiencePlatform,
} from "../../shared/omni-channel-audience-schema";

export type LegacyTokenKillSwitchAuditValue = "true" | "false" | "cleared";

export interface LegacyTokenKillSwitchAuditEntryInput {
  platform: AudiencePlatform;
  previousValue: LegacyTokenKillSwitchAuditValue;
  newValue: LegacyTokenKillSwitchAuditValue;
  updatedBy: string;
  batchId?: string | null;
}

export interface LegacyTokenKillSwitchAuditListFilters {
  platform?: AudiencePlatform | null;
  limit?: number;
}

export interface LegacyTokenKillSwitchAuditListFilteredFilters {
  platform?: AudiencePlatform | null;
  updatedBy?: string | null;
  fromDate?: Date | null;
  toDate?: Date | null;
}

export function encodeKillSwitchValue(
  resolved: boolean | null | undefined,
): LegacyTokenKillSwitchAuditValue {
  if (resolved === null || resolved === undefined) return "cleared";
  return resolved ? "true" : "false";
}

class LegacyTokenKillSwitchAuditService {
  async record(entry: LegacyTokenKillSwitchAuditEntryInput): Promise<void> {
    try {
      await db.insert(audienceLegacyTokenKillSwitchAudit).values({
        platform: entry.platform,
        previousValue: entry.previousValue,
        newValue: entry.newValue,
        updatedBy: entry.updatedBy,
        batchId: entry.batchId ?? null,
      });
    } catch (err) {
      // Never let an audit-log failure break the actual setting change.
      // eslint-disable-next-line no-console
      console.error("[legacy-token-kill-switch-audit] record failed", err);
    }
  }

  async list(
    filters: LegacyTokenKillSwitchAuditListFilters = {},
  ): Promise<AudienceLegacyTokenKillSwitchAuditRow[]> {
    const lim = Math.max(1, Math.min(Math.floor(filters.limit ?? 50), 200));
    try {
      const conditions = [] as any[];
      if (filters.platform) {
        conditions.push(
          eq(audienceLegacyTokenKillSwitchAudit.platform, filters.platform),
        );
      }
      const q = db
        .select()
        .from(audienceLegacyTokenKillSwitchAudit)
        .orderBy(desc(audienceLegacyTokenKillSwitchAudit.updatedAt))
        .limit(lim);
      return await (conditions.length > 0 ? q.where(and(...conditions)) : q);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[legacy-token-kill-switch-audit] list failed", err);
      return [];
    }
  }

  /**
   * Task #607 — return every audit row matching the optional filters,
   * newest first. Mirrors `gatewayAlertSettingsAuditService.listFiltered`
   * so founders can download the full kill-switch history as CSV for
   * long compliance reviews. No row-cap because the audit log is
   * bounded by how often a founder flips a per-platform kill-switch
   * and is pruned on the standard audience retention cadence.
   */
  async listFiltered(
    filters: LegacyTokenKillSwitchAuditListFilteredFilters = {},
  ): Promise<AudienceLegacyTokenKillSwitchAuditRow[]> {
    try {
      const conditions = [] as any[];
      if (filters.platform) {
        conditions.push(
          eq(audienceLegacyTokenKillSwitchAudit.platform, filters.platform),
        );
      }
      if (filters.updatedBy && filters.updatedBy.trim().length > 0) {
        conditions.push(
          eq(audienceLegacyTokenKillSwitchAudit.updatedBy, filters.updatedBy.trim()),
        );
      }
      if (filters.fromDate) {
        conditions.push(
          gte(audienceLegacyTokenKillSwitchAudit.updatedAt, filters.fromDate),
        );
      }
      if (filters.toDate) {
        conditions.push(
          lte(audienceLegacyTokenKillSwitchAudit.updatedAt, filters.toDate),
        );
      }
      const q = db
        .select()
        .from(audienceLegacyTokenKillSwitchAudit)
        .orderBy(desc(audienceLegacyTokenKillSwitchAudit.updatedAt));
      return await (conditions.length > 0 ? q.where(and(...conditions)) : q);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        "[legacy-token-kill-switch-audit] listFiltered failed",
        err,
      );
      return [];
    }
  }
}

export const legacyTokenKillSwitchAuditService =
  new LegacyTokenKillSwitchAuditService();

/**
 * Task #558 — prune very old kill-switch audit rows on the standard
 * audience retention cadence so the table can't grow forever. Called
 * from `audience-retention-service` alongside the other audit-table
 * prunes. Errors are surfaced as the return rejection; the caller logs
 * and reports them on the sweep result.
 */
export async function pruneLegacyTokenKillSwitchAuditOlderThan(
  cutoff: Date,
): Promise<number> {
  const res = await db
    .delete(audienceLegacyTokenKillSwitchAudit)
    .where(lt(audienceLegacyTokenKillSwitchAudit.updatedAt, cutoff));
  return (res as any).rowCount ?? 0;
}
