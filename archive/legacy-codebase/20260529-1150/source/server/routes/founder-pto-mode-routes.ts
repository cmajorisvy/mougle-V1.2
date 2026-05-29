/**
 * Founder PTO mode admin routes (Task #563).
 *
 * Mounted under `/api/admin/founder-pto-mode`. All endpoints require
 * root-admin auth; CSRF is enforced by the global admin middleware.
 */

import type { Express, RequestHandler } from "express";
import { z } from "zod";
import {
  PTO_NOTIFIER_REGISTRY,
  getFounderPtoModeConfig,
  setFounderPtoEnrollment,
  setFounderPtoSnooze,
  evaluateAndMaybeAutoExtendFounderPtoSnooze,
  getFounderPtoSuppressionLog,
  getAllFounderPtoSuppressionLogForExport,
  clearFounderPtoSuppressionLog,
  FOUNDER_PTO_SUPPRESSION_LOG_MAX_LIMIT,
  FOUNDER_PTO_SUPPRESSION_LOG_DEFAULT_LIMIT,
  getFounderPtoSuppressionStats,
  FOUNDER_PTO_SUPPRESSION_STATS_DEFAULT_DAYS,
  FOUNDER_PTO_SUPPRESSION_STATS_MAX_DAYS,
  FOUNDER_PTO_SUPPRESSION_LOG_EXPORT_MAX,
} from "../services/founder-pto-mode-service";
import { getAudienceArchiveDeletionNotifierConfig } from "../services/audience-archive-deletion-notifier";
import { getAudienceAuditExportNotifierConfig } from "../services/audience-audit-export-notifier";

const SnoozePolicySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixed") }),
  z.object({
    kind: z.literal("auto_extend"),
    extendDays: z.number().int().min(1).max(30),
  }),
  z.object({
    kind: z.literal("weekday_mute"),
    days: z.array(z.number().int().min(0).max(6)).min(1),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(0).max(23),
  }),
]);

const EnrollmentSchema = z.object({
  enabled: z.boolean(),
  enrolledNotifiers: z.array(z.string()),
});

const SnoozeSchema = z.object({
  snoozeUntil: z.string().datetime().nullable(),
  snoozePolicy: SnoozePolicySchema.nullable().optional(),
});

async function loadPerNotifierStatus(): Promise<
  Array<{
    id: string;
    label: string;
    description: string;
    ownSnoozeUntil: string | null;
    ownEnabled: boolean;
  }>
> {
  const out: Array<{
    id: string;
    label: string;
    description: string;
    ownSnoozeUntil: string | null;
    ownEnabled: boolean;
  }> = [];
  for (const n of PTO_NOTIFIER_REGISTRY) {
    let ownSnoozeUntil: string | null = null;
    let ownEnabled = false;
    try {
      if (n.id === "audience_archive_deletion") {
        const c = await getAudienceArchiveDeletionNotifierConfig();
        ownSnoozeUntil = c.snoozeUntil;
        ownEnabled = c.enabled;
      } else if (n.id === "audience_audit_export") {
        const c = await getAudienceAuditExportNotifierConfig();
        ownEnabled = c.enabled;
      }
    } catch {
      // Status read failures are non-fatal; surface a neutral row.
    }
    out.push({
      id: n.id,
      label: n.label,
      description: n.description,
      ownSnoozeUntil,
      ownEnabled,
    });
  }
  return out;
}

export function registerFounderPtoModeRoutes(
  app: Express,
  requireRootAdmin: RequestHandler,
): void {
  const base = "/api/admin/founder-pto-mode";

  app.get(base, requireRootAdmin, async (_req, res) => {
    const config = await getFounderPtoModeConfig();
    const evaluated = await evaluateAndMaybeAutoExtendFounderPtoSnooze(
      config,
      new Date(),
    );
    const notifiers = await loadPerNotifierStatus();
    res.json({
      config: evaluated.cfg,
      currentlySnoozed: evaluated.snoozed,
      effectiveSnoozeUntil: evaluated.effectiveUntil,
      snoozeSource: evaluated.source,
      notifiers,
    });
  });

  app.put(base, requireRootAdmin, async (req, res) => {
    const parsed = EnrollmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    try {
      const updatedBy =
        (req as any).user?.id || (req as any).session?.userId || "root_admin";
      const config = await setFounderPtoEnrollment({
        enabled: parsed.data.enabled,
        enrolledNotifiers: parsed.data.enrolledNotifiers,
        updatedBy,
      });
      res.json({ config });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "save_failed" });
    }
  });

  // Task #621 — read-only history of when PTO mode swallowed an alert.
  // Bounded by FOUNDER_PTO_SUPPRESSION_LOG_MAX_LIMIT (defensive — the
  // service also clamps internally). Optional `notifierId` filter
  // matches the registry ids (audience_archive_deletion / audience_audit_export).
  app.get(`${base}/suppression-log`, requireRootAdmin, async (req, res) => {
    const limitRaw = Number(req.query.limit);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(
            FOUNDER_PTO_SUPPRESSION_LOG_MAX_LIMIT,
            Math.floor(limitRaw),
          )
        : FOUNDER_PTO_SUPPRESSION_LOG_DEFAULT_LIMIT;
    const notifierIdRaw = req.query.notifierId;
    const notifierId =
      typeof notifierIdRaw === "string" && notifierIdRaw.trim().length > 0
        ? notifierIdRaw.trim()
        : null;
    const entries = await getFounderPtoSuppressionLog({ limit, notifierId });
    res.json({ entries, limit });
  });

  // Task #685 — per-notifier / per-source / per-day suppression counts
  // for the chart above the history list. Bounded to the same retention
  // window as the underlying log so the chart never claims more data
  // than is actually persisted.
  app.get(`${base}/suppression-stats`, requireRootAdmin, async (req, res) => {
    const daysRaw = Number(req.query.days);
    const days =
      Number.isFinite(daysRaw) && daysRaw > 0
        ? Math.min(
            FOUNDER_PTO_SUPPRESSION_STATS_MAX_DAYS,
            Math.floor(daysRaw),
          )
        : FOUNDER_PTO_SUPPRESSION_STATS_DEFAULT_DAYS;
    const notifierIdRaw = req.query.notifierId;
    const notifierId =
      typeof notifierIdRaw === "string" && notifierIdRaw.trim().length > 0
        ? notifierIdRaw.trim()
        : null;
    const stats = await getFounderPtoSuppressionStats({ days, notifierId });
    res.json(stats);
  });

  // Task #684 — CSV export of the suppression log so the founder can
  // attach the full history to a postmortem. Bounded by the retention
  // window (rows older than the audience-retention cutoff are pruned
  // daily) and an absolute row cap so the response can't go unbounded.
  app.get(
    `${base}/suppression-log/export`,
    requireRootAdmin,
    async (req, res) => {
      const notifierIdRaw = req.query.notifierId;
      const notifierId =
        typeof notifierIdRaw === "string" && notifierIdRaw.trim().length > 0
          ? notifierIdRaw.trim()
          : null;
      const rows = await getAllFounderPtoSuppressionLogForExport({ notifierId });
      const esc = (v: unknown): string => {
        if (v === null || v === undefined) return "";
        const s = typeof v === "string" ? v : JSON.stringify(v);
        if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const header = [
        "id",
        "occurredAt",
        "notifierId",
        "snoozeSource",
        "effectiveUntil",
        "summary",
        "payload",
      ].join(",");
      const body = rows
        .map((r) =>
          [
            r.id,
            r.occurredAt,
            r.notifierId,
            r.snoozeSource ?? "",
            r.effectiveUntil ?? "",
            r.summary ?? "",
            r.payload ? JSON.stringify(r.payload) : "",
          ]
            .map(esc)
            .join(","),
        )
        .join("\n");
      const csv = body ? `${header}\n${body}\n` : `${header}\n`;
      const filename = `founder-pto-suppression-log-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.setHeader("X-Export-Row-Count", String(rows.length));
      res.setHeader(
        "X-Export-Row-Cap",
        String(FOUNDER_PTO_SUPPRESSION_LOG_EXPORT_MAX),
      );
      res.status(200).send(csv);
    },
  );

  // Task #684 — founder-only wipe of the suppression log. The route
  // requires root-admin auth + CSRF (the global admin middleware adds
  // CSRF to non-GET admin routes), and the service emits a structured
  // audit log line tagged with the actor id.
  app.delete(
    `${base}/suppression-log`,
    requireRootAdmin,
    async (req, res) => {
      try {
        const clearedBy =
          (req as any).user?.id ||
          (req as any).session?.userId ||
          "root_admin";
        const result = await clearFounderPtoSuppressionLog({ clearedBy });
        res.json({
          deletedCount: result.deletedCount,
          clearedBy: result.clearedBy,
          clearedAt: result.clearedAt,
        });
      } catch (e: any) {
        res.status(500).json({ message: e?.message ?? "clear_failed" });
      }
    },
  );

  app.post(`${base}/snooze`, requireRootAdmin, async (req, res) => {
    const parsed = SnoozeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "invalid input", errors: parsed.error.flatten() });
    }
    try {
      const updatedBy =
        (req as any).user?.id || (req as any).session?.userId || "root_admin";
      const config = await setFounderPtoSnooze({
        snoozeUntil: parsed.data.snoozeUntil,
        snoozePolicy: parsed.data.snoozePolicy ?? undefined,
        updatedBy,
      });
      res.json({ config });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "snooze_failed" });
    }
  });
}
