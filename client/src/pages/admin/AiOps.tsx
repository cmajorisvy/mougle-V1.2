import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, AlertCircle, Bell, Camera, X, RotateCcw, ChevronDown, ChevronRight } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useAiOpsNotificationDismissals } from "@/hooks/use-ai-ops-notification-dismissals";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Notification = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  count: number;
  actionLabel: string;
  actionUrl: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

type Summary = {
  jobs: {
    pendingJobs: number;
    runningJobs: number;
    succeededJobsLast24h: number;
    failedJobsLast24h: number;
    rejectedJobsLast24h: number;
    staleRunningJobs: number;
    retryableFailedJobs: number;
    totalJobsLast24h: number;
  };
  workers: {
    totalWorkers: number;
    onlineWorkers: number;
    staleWorkers: number;
    offlineWorkers: number;
    unhealthyWorkers: number;
    busyWorkers: number;
    idleWorkers: number;
  };
  audit: {
    auditEventsLast24h: number;
    lastCleanupAt: string | null;
    lastCleanupStatus: string | null;
    rowsDeletedLastCleanup: number | null;
    rowsDeletedLast7d: number;
    cleanupEligibleCounts: {
      completedJobs: number;
      failedJobs: number;
      auditEvents: number;
      staleWorkers: number;
    };
  };
  health: {
    healthStatus: "healthy" | "degraded" | "attention_needed";
    healthReasons: string[];
  };
};

export default function AiOps() {
  const qc = useQueryClient();
  const q = useQuery<Summary>({
    queryKey: ["admin-ai-ops-summary"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ai-ops/summary", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const notes = useQuery<{ notifications: Notification[] }>({
    queryKey: ["admin-ai-ops-notifications"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ai-ops/notifications", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-ai-ops-summary"] });
    qc.invalidateQueries({ queryKey: ["admin-ai-ops-notifications"] });
    qc.invalidateQueries({ queryKey: ["admin-ai-ops-snapshots"] });
  };

  return (
    <div className="container max-w-6xl py-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">AI Operations</h1>
          <p className="text-sm text-muted-foreground">Compact health view across jobs, workers, audit, and retention.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/ai-jobs"><Button variant="outline" size="sm" data-testid="link-ai-jobs">AI Jobs</Button></Link>
          <Link href="/admin/ai-workers"><Button variant="outline" size="sm" data-testid="link-ai-workers">Workers</Button></Link>
          <Link href="/admin/ai-retention"><Button variant="outline" size="sm" data-testid="link-ai-retention">Retention</Button></Link>
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={q.isFetching || notes.isFetching} data-testid="button-refresh">
            {q.isFetching || notes.isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
            Refresh
          </Button>
        </div>
      </div>

      {q.isLoading && <div className="text-muted-foreground text-sm" data-testid="text-loading">Loading…</div>}
      {q.isError && <div className="text-red-400 text-sm" data-testid="text-error">{(q.error as Error)?.message}</div>}

      <NotificationsPanel
        data={notes.data?.notifications}
        isLoading={notes.isLoading}
        isError={notes.isError}
        error={notes.error as Error | null}
      />

      <SnapshotsPanel />


      {q.data && (
        <>
          <HealthCard health={q.data.health} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card data-testid="card-jobs">
              <CardHeader className="pb-2"><CardTitle className="text-base">Jobs</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Pending" value={q.data.jobs.pendingJobs} testId="stat-pending" />
                <Stat label="Running" value={q.data.jobs.runningJobs} testId="stat-running" />
                <Stat label="Failed (24h)" value={q.data.jobs.failedJobsLast24h} testId="stat-failed-24h" />
                <Stat label="Succeeded (24h)" value={q.data.jobs.succeededJobsLast24h} testId="stat-succeeded-24h" />
                <Stat label="Stale running" value={q.data.jobs.staleRunningJobs} testId="stat-stale-running" />
                <Stat label="Retryable failures" value={q.data.jobs.retryableFailedJobs} testId="stat-retryable" />
              </CardContent>
            </Card>

            <Card data-testid="card-workers">
              <CardHeader className="pb-2"><CardTitle className="text-base">Workers</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Online" value={q.data.workers.onlineWorkers} testId="stat-online" />
                <Stat label="Busy" value={q.data.workers.busyWorkers} testId="stat-busy" />
                <Stat label="Stale" value={q.data.workers.staleWorkers} testId="stat-stale" />
                <Stat label="Offline" value={q.data.workers.offlineWorkers} testId="stat-offline" />
                <Stat label="Unhealthy" value={q.data.workers.unhealthyWorkers} testId="stat-unhealthy" />
                <Stat label="Total" value={q.data.workers.totalWorkers} testId="stat-total-workers" />
              </CardContent>
            </Card>

            <Card data-testid="card-retention">
              <CardHeader className="pb-2"><CardTitle className="text-base">Retention</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="text-xs text-muted-foreground">Last cleanup</div>
                <div className="font-mono text-sm" data-testid="text-last-cleanup">
                  {q.data.audit.lastCleanupAt ? new Date(q.data.audit.lastCleanupAt).toLocaleString() : "never"}
                  {q.data.audit.lastCleanupStatus ? ` · ${q.data.audit.lastCleanupStatus}` : ""}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Deleted last run" value={q.data.audit.rowsDeletedLastCleanup ?? 0} testId="stat-deleted-last" />
                  <Stat label="Deleted last 7d" value={q.data.audit.rowsDeletedLast7d} testId="stat-deleted-7d" />
                </div>
                <div className="text-xs text-muted-foreground pt-1">Eligible now</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Inline label="succeeded jobs" value={q.data.audit.cleanupEligibleCounts.completedJobs} />
                  <Inline label="failed jobs"    value={q.data.audit.cleanupEligibleCounts.failedJobs} />
                  <Inline label="audit events"   value={q.data.audit.cleanupEligibleCounts.auditEvents} />
                  <Inline label="stale workers"  value={q.data.audit.cleanupEligibleCounts.staleWorkers} />
                </div>
                <div className="text-xs text-muted-foreground pt-1" data-testid="stat-audit-events">
                  Audit events (24h): <span className="font-mono">{q.data.audit.auditEventsLast24h.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function NotificationRow({
  n, dismissed, onDismiss, onRestore,
}: {
  n: Notification;
  dismissed: boolean;
  onDismiss?: (n: Notification) => void;
  onRestore?: (n: Notification) => void;
}) {
  return (
    <div
      className={`border border-border rounded p-2 flex flex-wrap items-start gap-2 ${dismissed ? "opacity-60" : ""}`}
      data-testid={`notification-${n.id}`}
    >
      <Badge
        variant={n.severity === "critical" ? "destructive" : n.severity === "warning" ? "secondary" : "outline"}
        data-testid={`badge-severity-${n.id}`}
      >
        {n.severity}
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{n.title}</div>
        <div className="text-xs text-muted-foreground">{n.message}</div>
      </div>
      <Link href={n.actionUrl}>
        <Button size="sm" variant="outline" data-testid={`action-${n.id}`}>{n.actionLabel}</Button>
      </Link>
      {dismissed ? (
        <Button
          size="sm" variant="ghost"
          onClick={() => onRestore?.(n)}
          data-testid={`button-restore-${n.id}`}
          title="Restore"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </Button>
      ) : (
        <Button
          size="sm" variant="ghost"
          onClick={() => onDismiss?.(n)}
          data-testid={`button-dismiss-${n.id}`}
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}

function NotificationsPanel({
  data, isLoading, isError, error,
}: {
  data: Notification[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}) {
  const { admin } = useAdminAuth();
  const adminId = admin?.actor?.id ?? null;
  const {
    visibleNotifications, dismissedNotifications,
    dismissNotification, restoreNotification, clearAllDismissals,
  } = useAiOpsNotificationDismissals(data, adminId);
  const [showDismissed, setShowDismissed] = useState(false);

  const totalRaw = data?.length ?? 0;

  return (
    <Card data-testid="card-notifications">
      <CardHeader className="pb-2 flex flex-row items-center gap-2">
        <Bell className="w-4 h-4" />
        <CardTitle className="text-base">Attention needed</CardTitle>
        {visibleNotifications.length > 0 && (
          <Badge variant="destructive" data-testid="badge-notifications-count">
            {visibleNotifications.length}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {isLoading && <div className="text-muted-foreground" data-testid="text-notifications-loading">Loading…</div>}
        {isError && <div className="text-red-400" data-testid="text-notifications-error">{error?.message}</div>}

        {data && totalRaw === 0 && (
          <div className="text-muted-foreground" data-testid="text-notifications-empty">
            No AI ops issues detected.
          </div>
        )}
        {data && totalRaw > 0 && visibleNotifications.length === 0 && (
          <div className="text-muted-foreground" data-testid="text-notifications-all-dismissed">
            All current AI ops nudges are dismissed.
          </div>
        )}

        {visibleNotifications.map((n) => (
          <NotificationRow key={n.id + ":" + n.severity + ":" + n.count} n={n} dismissed={false} onDismiss={dismissNotification} />
        ))}

        {dismissedNotifications.length > 0 && (
          <div className="pt-2 border-t border-border" data-testid="section-dismissed">
            <div className="flex items-center justify-between gap-2 mb-1">
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowDismissed((v) => !v)}
                data-testid="button-toggle-dismissed"
              >
                {showDismissed ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Dismissed ({dismissedNotifications.length})
              </button>
              <Button
                size="sm" variant="ghost"
                onClick={clearAllDismissals}
                data-testid="button-clear-dismissed"
              >
                Clear dismissed
              </Button>
            </div>
            {showDismissed && (
              <div className="space-y-2">
                {dismissedNotifications.map((n) => (
                  <NotificationRow
                    key={"dismissed:" + n.id + ":" + n.severity + ":" + n.count}
                    n={n}
                    dismissed
                    onRestore={restoreNotification}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type Snapshot = {
  snapshotId: string;
  snapshotDate: string;
  healthStatus: "healthy" | "degraded" | "attention_needed";
  healthReasons: string[];
  jobMetrics: Record<string, number>;
  workerMetrics: Record<string, number>;
  retentionMetrics: {
    rowsDeletedLastCleanup: number | null;
    rowsDeletedLast7d: number;
    [k: string]: unknown;
  };
  notificationMetrics: { info: number; warning: number; critical: number; total: number } | null;
  createdAt: string;
};

function SnapshotsPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const list = useQuery<{ snapshots: Snapshot[] }>({
    queryKey: ["admin-ai-ops-snapshots"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ai-ops/snapshots?limit=14", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const capture = useMutation({
    mutationFn: async (force: boolean) => {
      const res = await fetch("/api/admin/ai-ops/snapshots", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json() as Promise<{ snapshot: Snapshot; created: boolean }>;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["admin-ai-ops-snapshots"] });
      toast({ title: r.created ? "Snapshot captured" : "Snapshot already existed for today" });
    },
    onError: (e: Error) => toast({ title: "Snapshot failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card data-testid="card-snapshots">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4" />
          <CardTitle className="text-base">AI Ops Trends</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm" variant="outline"
            onClick={() => capture.mutate(false)}
            disabled={capture.isPending}
            data-testid="button-capture-snapshot"
          >
            {capture.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : null}
            Capture today
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={() => {
              if (confirm("Force-replace today's snapshot with fresh metrics?")) capture.mutate(true);
            }}
            disabled={capture.isPending}
            data-testid="button-force-snapshot"
          >
            Force refresh today
          </Button>
          <a href="/api/admin/ai-ops/snapshots.csv" download>
            <Button size="sm" variant="outline" data-testid="button-export-snapshots-csv">
              Export CSV
            </Button>
          </a>
        </div>
      </CardHeader>
      <CardContent className="text-sm">
        {list.isLoading && <div className="text-muted-foreground" data-testid="text-snapshots-loading">Loading…</div>}
        {list.isError && <div className="text-red-400" data-testid="text-snapshots-error">{(list.error as Error)?.message}</div>}
        {list.data && list.data.snapshots.length === 0 && (
          <div className="text-muted-foreground" data-testid="text-snapshots-empty">
            No snapshots yet. Capture today to start tracking trends.
          </div>
        )}
        {list.data && list.data.snapshots.length > 0 && (
          <div className="overflow-x-auto" data-testid="table-snapshots">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="py-1 pr-3">Date</th>
                  <th className="py-1 pr-3">Health</th>
                  <th className="py-1 pr-3">Jobs (total/failed 24h)</th>
                  <th className="py-1 pr-3">Workers (on/stale/off)</th>
                  <th className="py-1 pr-3">Rows deleted (last/7d)</th>
                  <th className="py-1 pr-3">Nudges (c/w/i)</th>
                </tr>
              </thead>
              <tbody>
                {list.data.snapshots.map((s) => (
                  <tr key={s.snapshotId} className="border-t border-border" data-testid={`row-snapshot-${s.snapshotDate}`}>
                    <td className="py-1 pr-3 font-mono">{s.snapshotDate}</td>
                    <td className="py-1 pr-3">
                      <Badge
                        variant={s.healthStatus === "healthy" ? "default" : s.healthStatus === "attention_needed" ? "destructive" : "secondary"}
                        data-testid={`badge-snapshot-health-${s.snapshotDate}`}
                      >
                        {s.healthStatus}
                      </Badge>
                    </td>
                    <td className="py-1 pr-3 font-mono">
                      {s.jobMetrics.totalJobsLast24h ?? 0} / {s.jobMetrics.failedJobsLast24h ?? 0}
                    </td>
                    <td className="py-1 pr-3 font-mono">
                      {s.workerMetrics.onlineWorkers ?? 0} / {s.workerMetrics.staleWorkers ?? 0} / {s.workerMetrics.offlineWorkers ?? 0}
                    </td>
                    <td className="py-1 pr-3 font-mono">
                      {(s.retentionMetrics.rowsDeletedLastCleanup ?? 0)} / {s.retentionMetrics.rowsDeletedLast7d ?? 0}
                    </td>
                    <td className="py-1 pr-3 font-mono">
                      {s.notificationMetrics
                        ? `${s.notificationMetrics.critical}/${s.notificationMetrics.warning}/${s.notificationMetrics.info}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HealthCard({ health }: { health: Summary["health"] }) {
  const cfg = health.healthStatus === "healthy"
    ? { Icon: CheckCircle2, color: "text-green-400", border: "border-green-500/30 bg-green-500/5", label: "Healthy" }
    : health.healthStatus === "degraded"
    ? { Icon: AlertCircle, color: "text-yellow-400", border: "border-yellow-500/30 bg-yellow-500/5", label: "Degraded" }
    : { Icon: AlertTriangle, color: "text-red-400", border: "border-red-500/30 bg-red-500/5", label: "Attention needed" };
  return (
    <Card className={cfg.border} data-testid="card-health">
      <CardContent className="py-3 flex items-start gap-3">
        <cfg.Icon className={`w-5 h-5 mt-0.5 ${cfg.color}`} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Badge variant={health.healthStatus === "healthy" ? "default" : "destructive"} data-testid="badge-health">
              {cfg.label}
            </Badge>
          </div>
          {health.healthReasons.length > 0 ? (
            <ul className="mt-2 text-xs text-muted-foreground list-disc pl-5 space-y-0.5" data-testid="list-health-reasons">
              {health.healthReasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          ) : (
            <div className="mt-1 text-xs text-muted-foreground" data-testid="text-health-ok">
              All AI subsystems nominal.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div data-testid={testId}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-mono">{value.toLocaleString()}</div>
    </div>
  );
}

function Inline({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value.toLocaleString()}</span>
    </div>
  );
}
