/**
 * AI ops notifications — read-only nudges derived from the existing
 * summary metrics. No persistence, no dismissal, no scheduling.
 * Severity tiers: info, warning, critical.
 */

import { aiOpsSummaryService, type AiOpsSummary } from "./aiOpsSummaryService";

export type NotificationSeverity = "info" | "warning" | "critical";

export interface AiOpsNotification {
  id: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  count: number;
  actionLabel: string;
  actionUrl: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

const STALE_RUNNING_MINUTES = 10;

function buildNotifications(s: AiOpsSummary, now: Date): AiOpsNotification[] {
  const out: AiOpsNotification[] = [];
  const iso = now.toISOString();

  if (s.jobs.staleRunningJobs > 0) {
    out.push({
      id: "stale-running-jobs",
      severity: "warning",
      title: "Stale running jobs detected",
      message: `${s.jobs.staleRunningJobs} AI job(s) have been running longer than ${STALE_RUNNING_MINUTES} minutes.`,
      count: s.jobs.staleRunningJobs,
      actionLabel: "View jobs",
      actionUrl: "/admin/ai-jobs?status=running",
      createdAt: iso,
      metadata: {},
    });
  }

  if (s.jobs.pendingJobs > 0 && s.workers.onlineWorkers === 0) {
    out.push({
      id: "pending-with-no-workers",
      severity: "critical",
      title: "Pending jobs but no online workers",
      message: `${s.jobs.pendingJobs} job(s) are waiting and no worker has reported in.`,
      count: s.jobs.pendingJobs,
      actionLabel: "View workers",
      actionUrl: "/admin/ai-workers",
      createdAt: iso,
      metadata: { totalWorkers: s.workers.totalWorkers },
    });
  }

  if (s.jobs.failedJobsLast24h >= 25) {
    out.push({
      id: "failure-spike",
      severity: "critical",
      title: "Failure spike in last 24h",
      message: `${s.jobs.failedJobsLast24h} job failures in the last 24 hours.`,
      count: s.jobs.failedJobsLast24h,
      actionLabel: "View failed jobs",
      actionUrl: "/admin/ai-jobs?status=failed&since=24h",
      createdAt: iso,
      metadata: {},
    });
  } else if (s.jobs.failedJobsLast24h >= 10) {
    out.push({
      id: "failure-spike",
      severity: "warning",
      title: "Elevated job failures",
      message: `${s.jobs.failedJobsLast24h} job failures in the last 24 hours.`,
      count: s.jobs.failedJobsLast24h,
      actionLabel: "View failed jobs",
      actionUrl: "/admin/ai-jobs?status=failed&since=24h",
      createdAt: iso,
      metadata: {},
    });
  }

  const eligibleTotal =
    s.audit.cleanupEligibleCounts.completedJobs +
    s.audit.cleanupEligibleCounts.failedJobs +
    s.audit.cleanupEligibleCounts.auditEvents +
    s.audit.cleanupEligibleCounts.staleWorkers;
  if (eligibleTotal > 1000) {
    out.push({
      id: "cleanup-overdue",
      severity: "warning",
      title: "Large cleanup backlog",
      message: `${eligibleTotal.toLocaleString()} rows are eligible for retention cleanup.`,
      count: eligibleTotal,
      actionLabel: "Open retention",
      actionUrl: "/admin/ai-retention?section=history",
      createdAt: iso,
      metadata: { eligible: s.audit.cleanupEligibleCounts },
    });
  }

  if (s.workers.unhealthyWorkers > 0) {
    out.push({
      id: "workers-unhealthy",
      severity: "warning",
      title: "Unhealthy workers",
      message: `${s.workers.unhealthyWorkers} worker(s) reporting unhealthy status.`,
      count: s.workers.unhealthyWorkers,
      actionLabel: "View workers",
      actionUrl: "/admin/ai-workers?status=unhealthy",
      createdAt: iso,
      metadata: {},
    });
  }

  if (s.audit.lastCleanupAt === null) {
    out.push({
      id: "no-cleanup-history",
      severity: "info",
      title: "No cleanup has ever run",
      message: "Run a dry-run from the retention page to see what would be pruned.",
      count: 0,
      actionLabel: "Open retention",
      actionUrl: "/admin/ai-retention",
      createdAt: iso,
      metadata: {},
    });
  } else if (s.audit.lastCleanupStatus === "failed") {
    out.push({
      id: "last-cleanup-failed",
      severity: "critical",
      title: "Last cleanup failed",
      message: "The most recent retention cleanup ended in failure. Review history.",
      count: 1,
      actionLabel: "Open retention",
      actionUrl: "/admin/ai-retention?status=failed&section=history",
      createdAt: iso,
      metadata: { lastCleanupAt: s.audit.lastCleanupAt },
    });
  }

  const order: Record<NotificationSeverity, number> = { critical: 0, warning: 1, info: 2 };
  out.sort((a, b) => order[a.severity] - order[b.severity]);
  return out;
}

class AiOpsNotificationsService {
  async list(): Promise<AiOpsNotification[]> {
    const summary = await aiOpsSummaryService.getSummary();
    return buildNotifications(summary, new Date());
  }
}

export const aiOpsNotificationsService = new AiOpsNotificationsService();
