/**
 * Gateway alert settings audit log (Task #454).
 *
 * Records every change root admins make to the gateway block-alert
 * thresholds (threshold / windowMs / dedupMs / recovery) via
 * `PATCH /api/admin/newsroom/audience/gateway/alert-settings` and the
 * `reset` button. Founders use the history panel under the settings
 * card to figure out who tuned an alert when investigating a misfire.
 *
 * Failures to insert / read are swallowed so a broken audit log can
 * never block an actual threshold change or break the dashboard.
 */

import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db";
import {
  gatewayAlertSettingsAudit,
  type GatewayAlertSettingsAuditRow,
} from "@shared/omni-channel-audience-schema";

export type GatewayAlertAuditField =
  | "threshold"
  | "windowMs"
  | "dedupMs"
  | "recovery"
  | "all";

export type GatewayAlertAuditAction = "update" | "reset" | "export";

export interface GatewayAlertAuditListFilters {
  fromDate?: Date | null;
  toDate?: Date | null;
  updatedBy?: string | null;
}

export interface GatewayAlertAuditEntryInput {
  field: GatewayAlertAuditField;
  oldValue: string | null;
  newValue: string | null;
  action: GatewayAlertAuditAction;
  updatedBy: string;
}

class GatewayAlertSettingsAuditService {
  async record(entry: GatewayAlertAuditEntryInput): Promise<void> {
    try {
      await db.insert(gatewayAlertSettingsAudit).values({
        field: entry.field,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        action: entry.action,
        updatedBy: entry.updatedBy,
      });
    } catch (err) {
      // Never let an audit-log failure break the actual setting change.
      // eslint-disable-next-line no-console
      console.error("[gateway-alert-settings-audit] record failed", err);
    }
  }

  async recordMany(entries: GatewayAlertAuditEntryInput[]): Promise<void> {
    for (const entry of entries) {
      await this.record(entry);
    }
  }

  async list(limit = 20): Promise<GatewayAlertSettingsAuditRow[]> {
    const lim = Math.max(1, Math.min(Math.floor(limit), 200));
    try {
      return await db
        .select()
        .from(gatewayAlertSettingsAudit)
        .orderBy(desc(gatewayAlertSettingsAudit.updatedAt))
        .limit(lim);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[gateway-alert-settings-audit] list failed", err);
      return [];
    }
  }

  /**
   * Task #489 — return every audit row matching the optional filters,
   * newest first. Used by the CSV export route so founders can download
   * the full history for long compliance reviews. No row-cap because the
   * audit log is bounded by how often a founder tunes thresholds.
   */
  async listFiltered(
    filters: GatewayAlertAuditListFilters = {},
  ): Promise<GatewayAlertSettingsAuditRow[]> {
    try {
      const conditions = [] as any[];
      if (filters.fromDate) {
        conditions.push(gte(gatewayAlertSettingsAudit.updatedAt, filters.fromDate));
      }
      if (filters.toDate) {
        conditions.push(lte(gatewayAlertSettingsAudit.updatedAt, filters.toDate));
      }
      if (filters.updatedBy && filters.updatedBy.trim().length > 0) {
        conditions.push(eq(gatewayAlertSettingsAudit.updatedBy, filters.updatedBy.trim()));
      }
      const q = db
        .select()
        .from(gatewayAlertSettingsAudit)
        .orderBy(desc(gatewayAlertSettingsAudit.updatedAt));
      return await (conditions.length > 0
        ? q.where(and(...conditions))
        : q);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[gateway-alert-settings-audit] listFiltered failed", err);
      return [];
    }
  }
}

export const gatewayAlertSettingsAuditService =
  new GatewayAlertSettingsAuditService();

/**
 * Format a settings value as the canonical string we persist in the
 * audit log. `null` means "derive from threshold / 2" for the recovery
 * field, encoded as the literal "derive".
 */
export function formatAuditValue(
  field: GatewayAlertAuditField,
  value: number | null | undefined,
): string | null {
  if (value === undefined) return null;
  if (field === "recovery" && value === null) return "derive";
  if (value === null) return null;
  return String(value);
}
