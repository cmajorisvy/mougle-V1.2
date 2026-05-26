import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertCircle, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import {
  useAiOpsNotificationDismissals,
  type AiOpsNotification,
} from "@/hooks/use-ai-ops-notification-dismissals";

type Summary = {
  jobs: {
    pendingJobs: number;
    runningJobs: number;
    failedJobsLast24h: number;
  };
  workers: {
    onlineWorkers: number;
    staleWorkers: number;
    offlineWorkers: number;
  };
  audit?: {
    cleanupEligibleCounts?: {
      completedJobs: number;
      failedJobs: number;
      auditEvents: number;
      staleWorkers: number;
    };
    csvExportsLast24h?: number;
    failedCsvExportsLast24h?: number;
  };
  health: {
    healthStatus: "healthy" | "degraded" | "attention_needed";
    healthReasons: string[];
  };
};

/**
 * Compact AI ops health card for the founder dashboard hero.
 * Self-contained: failure of these queries must not block the rest
 * of the dashboard.
 */
export function AiOpsHeroCard() {
  const { admin } = useAdminAuth();
  const adminId = admin?.actor?.id ?? null;

  const summaryQ = useQuery<Summary>({
    queryKey: ["admin-ai-ops-summary-hero"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ai-ops/summary", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const notifQ = useQuery<{ notifications: AiOpsNotification[] }>({
    queryKey: ["admin-ai-ops-notifications-hero"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ai-ops/notifications", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { visibleNotifications } = useAiOpsNotificationDismissals(
    notifQ.data?.notifications,
    adminId,
  );

  return (
    <Card className="rounded-2xl border-border/60 bg-card/60 p-4" data-theme-surface data-testid="card-ai-ops-hero">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-primary">
          <Activity className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">AI Operations</p>
            <HealthBadge data={summaryQ.data} isLoading={summaryQ.isLoading} isError={summaryQ.isError} />
            {visibleNotifications.length > 0 && (
              <Badge variant="destructive" data-testid="badge-ai-ops-nudges">
                {visibleNotifications.length} nudge{visibleNotifications.length === 1 ? "" : "s"}
              </Badge>
            )}
          </div>

          {summaryQ.isLoading && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground" data-testid="text-ai-ops-loading">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading metrics…
            </div>
          )}
          {summaryQ.isError && (
            <div className="mt-2 text-xs text-muted-foreground" data-testid="text-ai-ops-error">
              AI ops summary unavailable.
            </div>
          )}

          {summaryQ.data && (
            <>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-sm">
                <Metric
                  label="Pending"
                  value={summaryQ.data.jobs.pendingJobs}
                  testId="stat-hero-pending"
                  to="/admin/ai-jobs?status=pending"
                  title="View pending AI jobs"
                />
                <Metric
                  label="Running"
                  value={summaryQ.data.jobs.runningJobs}
                  testId="stat-hero-running"
                  to="/admin/ai-jobs?status=running"
                  title="View running AI jobs"
                />
                <Metric
                  label="Failed 24h"
                  value={summaryQ.data.jobs.failedJobsLast24h}
                  testId="stat-hero-failed-24h"
                  to="/admin/ai-jobs?status=failed&since=24h"
                  title="View AI jobs that failed in the last 24h"
                />
                <Metric
                  label="Workers online"
                  value={summaryQ.data.workers.onlineWorkers}
                  testId="stat-hero-online"
                  to="/admin/ai-workers?derivedStatus=online"
                  title="View online AI workers"
                />
                <Metric
                  label="Stale/offline"
                  value={summaryQ.data.workers.staleWorkers + summaryQ.data.workers.offlineWorkers}
                  testId="stat-hero-stale-offline"
                  to="/admin/ai-workers?derivedStatus=offline"
                  title="View stale and offline AI workers"
                />
                <Metric
                  label="Nudges"
                  value={notifQ.isError ? 0 : visibleNotifications.length}
                  testId="stat-hero-nudges"
                  to="/admin/ai-ops"
                  title="View AI ops nudges and notifications"
                />
                <Metric
                  label="Cleanup eligible"
                  value={cleanupEligibleTotal(summaryQ.data)}
                  testId="stat-hero-cleanup-eligible"
                  to="/admin/ai-retention?section=history"
                  title="View retention cleanup history"
                />
                <Metric
                  label="CSV exports 24h"
                  value={summaryQ.data.audit?.csvExportsLast24h ?? null}
                  testId="stat-hero-csv-exports"
                  to="/admin/ai-retention?section=exports"
                  title="View CSV export history"
                />
              </div>

              {summaryQ.data.health.healthStatus !== "healthy" && summaryQ.data.health.healthReasons.length > 0 && (
                <ul className="mt-3 text-xs text-muted-foreground list-disc pl-5 space-y-0.5" data-testid="list-ai-ops-reasons">
                  {summaryQ.data.health.healthReasons.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link href="/admin/ai-ops">
              <Button size="sm" variant="default" data-testid="link-hero-ai-ops">View AI Ops</Button>
            </Link>
            {summaryQ.data && summaryQ.data.jobs.failedJobsLast24h > 0 ? (
              <Link href="/admin/ai-jobs?status=failed&since=24h">
                <Button size="sm" variant="outline" data-testid="link-hero-ai-jobs-failed">Failed jobs (24h)</Button>
              </Link>
            ) : (
              <Link href="/admin/ai-jobs">
                <Button size="sm" variant="outline" data-testid="link-hero-ai-jobs">AI Jobs</Button>
              </Link>
            )}
            {summaryQ.data && (summaryQ.data.workers.staleWorkers + summaryQ.data.workers.offlineWorkers) > 0 ? (
              <Link href="/admin/ai-workers?derivedStatus=offline">
                <Button size="sm" variant="outline" data-testid="link-hero-ai-workers-offline">Stale/offline workers</Button>
              </Link>
            ) : (
              <Link href="/admin/ai-workers">
                <Button size="sm" variant="outline" data-testid="link-hero-ai-workers">Workers</Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function HealthBadge({
  data, isLoading, isError,
}: {
  data: Summary | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) return <Badge variant="outline" data-testid="badge-ai-ops-health">…</Badge>;
  if (isError || !data) return <Badge variant="outline" data-testid="badge-ai-ops-health">unknown</Badge>;
  const s = data.health.healthStatus;
  if (s === "healthy") {
    return (
      <Badge variant="default" className="gap-1" data-testid="badge-ai-ops-health">
        <CheckCircle2 className="w-3 h-3" /> healthy
      </Badge>
    );
  }
  if (s === "degraded") {
    return (
      <Badge variant="secondary" className="gap-1" data-testid="badge-ai-ops-health">
        <AlertCircle className="w-3 h-3" /> degraded
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1" data-testid="badge-ai-ops-health">
      <AlertTriangle className="w-3 h-3" /> attention needed
    </Badge>
  );
}

function cleanupEligibleTotal(s: Summary | undefined): number | null {
  const c = s?.audit?.cleanupEligibleCounts;
  if (!c) return null;
  return (c.completedJobs ?? 0) + (c.failedJobs ?? 0) + (c.auditEvents ?? 0) + (c.staleWorkers ?? 0);
}

function Metric({
  label, value, testId, to, title,
}: {
  label: string;
  value: number | null;
  testId: string;
  to?: string;
  title?: string;
}) {
  const display = value === null ? "—" : value.toLocaleString();
  const ariaValue = value === null ? "not available" : value.toLocaleString();
  const body = (
    <>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-mono">{display}</div>
    </>
  );
  if (!to) {
    return <div data-testid={testId}>{body}</div>;
  }
  return (
    <Link
      href={to}
      data-testid={testId}
      title={title ?? label}
      aria-label={`${label}: ${ariaValue}. ${title ?? "Open filtered view"}`}
      className="block rounded-md -m-1 p-1 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  );
}
