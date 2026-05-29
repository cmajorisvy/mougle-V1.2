import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface BackfillSummary {
  totalNull: number;
  matched: number;
  updated: number;
  unmatchedNoCommandId: number;
  unmatchedCommandMissing: number;
  remainingNull: number;
}

interface BackfillStatus {
  ranAt: string | null;
  version: number;
  trigger: "deploy" | "manual" | null;
  summary: BackfillSummary | null;
  error: string | null;
  consecutiveFailures?: number;
  triggeredBy?: string | null;
}

interface SnoozeConfig {
  snoozeUntil: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface SnoozeHistoryEntry {
  id: string;
  alertKey: string;
  action: "set" | "cleared" | "expired";
  snoozeUntil: string | null;
  updatedBy: string | null;
  occurredAt: string;
}

interface SnoozeResponse {
  snooze: SnoozeConfig;
  history: SnoozeHistoryEntry[];
}

const STATUS_URL = "/api/admin/newsroom/audience/retention/connector-backfill";
const RUN_URL = "/api/admin/newsroom/audience/retention/connector-backfill/run";
const SNOOZE_URL =
  "/api/admin/newsroom/audience/retention/connector-backfill/alert-snooze";

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function isSnoozeActive(snoozeUntil: string | null): boolean {
  if (!snoozeUntil) return false;
  const t = Date.parse(snoozeUntil);
  return Number.isFinite(t) && t > Date.now();
}

export function ConnectorBackfillCard() {
  const qc = useQueryClient();
  const statusQuery = useQuery<{
    status: BackfillStatus;
    currentNullCount: number | null;
    failureAlertThreshold?: number | null;
  }>({
    queryKey: [STATUS_URL],
    refetchOnMount: "always",
  });
  const snoozeQuery = useQuery<SnoozeResponse>({ queryKey: [SNOOZE_URL] });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", RUN_URL, {});
      return (await res.json()) as {
        status: BackfillStatus;
        currentNullCount: number | null;
        failureAlertThreshold?: number | null;
      };
    },
    onSuccess: (data) => {
      qc.setQueryData([STATUS_URL], data);
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: async (snoozeUntil: string | null) => {
      const res = await apiRequest("PUT", SNOOZE_URL, { snoozeUntil });
      return (await res.json()) as SnoozeResponse;
    },
    onSuccess: (data) => {
      qc.setQueryData([SNOOZE_URL], data);
    },
  });

  const status = statusQuery.data?.status ?? null;
  const currentNullCount = statusQuery.data?.currentNullCount ?? null;
  const failureAlertThreshold =
    statusQuery.data?.failureAlertThreshold ?? null;
  const summary = status?.summary ?? null;
  const hasRun = !!status?.ranAt;
  const remaining = summary?.remainingNull ?? null;
  const consecutiveFailures = status?.consecutiveFailures ?? 0;

  const snooze = snoozeQuery.data?.snooze ?? null;
  const history = snoozeQuery.data?.history ?? [];
  const snoozeActive = isSnoozeActive(snooze?.snoozeUntil ?? null);

  const snoozeFor = (ms: number) => {
    const until = new Date(Date.now() + ms).toISOString();
    snoozeMutation.mutate(until);
  };

  return (
    <Card data-testid="card-connector-backfill">
      <CardHeader>
        <CardTitle>Gateway-event Connector Backfill</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Attributes a connector to pre-Task-#532 rows in{" "}
          <code>audience_gateway_events</code>. Runs automatically once after
          each deploy.
        </p>

        <div
          className="rounded border bg-muted/30 p-2"
          data-testid="text-backfill-current-null"
        >
          <div className="text-xs text-muted-foreground">
            Rows currently with no connector attached
          </div>
          <div className="text-lg font-semibold">
            {currentNullCount === null
              ? "—"
              : `${currentNullCount} row${currentNullCount === 1 ? "" : "s"}`}
          </div>
          <div className="text-xs text-muted-foreground">
            Live count, refreshed each time this tile loads. A non-zero value
            after a successful run means new NULL rows have appeared since.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasRun ? (
            status?.error ? (
              <Badge variant="destructive" data-testid="badge-backfill-status">
                Last run failed
              </Badge>
            ) : (
              <Badge variant="secondary" data-testid="badge-backfill-status">
                Last run OK
              </Badge>
            )
          ) : (
            <Badge variant="outline" data-testid="badge-backfill-status">
              Not yet run
            </Badge>
          )}
          {consecutiveFailures > 0 && (
            <Badge
              variant="destructive"
              data-testid="badge-backfill-consecutive-failures"
            >
              Failed {consecutiveFailures} deploy
              {consecutiveFailures === 1 ? "" : "s"} in a row
              {failureAlertThreshold && failureAlertThreshold > 0
                ? ` (alerts at ${failureAlertThreshold})`
                : ""}
            </Badge>
          )}
          {status?.trigger && (
            <Badge variant="outline" data-testid="badge-backfill-trigger">
              {status.trigger}
            </Badge>
          )}
          <span
            className="text-muted-foreground"
            data-testid="text-backfill-ran-at"
          >
            {formatTimestamp(status?.ranAt ?? null)}
          </span>
        </div>

        {summary && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Rows updated</div>
              <div
                className="text-lg font-semibold"
                data-testid="text-backfill-updated"
              >
                {summary.updated}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Matched</div>
              <div
                className="text-lg font-semibold"
                data-testid="text-backfill-matched"
              >
                {summary.matched}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Remaining NULL</div>
              <div
                className="text-lg font-semibold"
                data-testid="text-backfill-remaining"
              >
                {remaining}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">No command_id</div>
              <div data-testid="text-backfill-no-cmd">
                {summary.unmatchedNoCommandId}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Missing command</div>
              <div data-testid="text-backfill-missing-cmd">
                {summary.unmatchedCommandMissing}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total NULL seen</div>
              <div data-testid="text-backfill-total-null">
                {summary.totalNull}
              </div>
            </div>
          </div>
        )}

        {status?.error && (
          <div
            className="rounded border border-destructive/40 bg-destructive/10 p-2 text-destructive"
            data-testid="text-backfill-error"
          >
            {status.error}
          </div>
        )}

        <div>
          <Button
            size="sm"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            data-testid="button-backfill-run"
          >
            {runMutation.isPending ? "Running…" : "Run backfill now"}
          </Button>
        </div>

        <div className="space-y-2 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Founder alert snooze</span>
            {snoozeActive ? (
              <Badge variant="destructive" data-testid="badge-backfill-alert-snoozed">
                Snoozed until {formatTimestamp(snooze?.snoozeUntil ?? null)}
              </Badge>
            ) : (
              <Badge variant="outline" data-testid="badge-backfill-alert-snoozed">
                Alerts active
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Mute the post-deploy "backfill keeps failing" email during
            planned Supabase maintenance. The failure counter keeps ticking
            so the first send after the window expires carries the real
            count.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => snoozeFor(24 * 60 * 60 * 1000)}
              disabled={snoozeMutation.isPending}
              data-testid="button-backfill-alert-snooze-1d"
            >
              Snooze 1 day
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => snoozeFor(7 * 24 * 60 * 60 * 1000)}
              disabled={snoozeMutation.isPending}
              data-testid="button-backfill-alert-snooze-7d"
            >
              Snooze 1 week
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => snoozeMutation.mutate(null)}
              disabled={snoozeMutation.isPending || !snoozeActive}
              data-testid="button-backfill-alert-unsnooze"
            >
              Unsnooze
            </Button>
          </div>
          {history.length > 0 && (
            <div
              className="space-y-1 text-xs text-muted-foreground"
              data-testid="list-backfill-alert-snooze-history"
            >
              <div className="font-medium text-foreground">
                Past snooze actions (last {history.length})
              </div>
              {history.map((h) => (
                <div key={h.id} data-testid={`row-backfill-alert-snooze-${h.id}`}>
                  <span className="font-mono">{h.action}</span>
                  {" · "}
                  {formatTimestamp(h.occurredAt)}
                  {h.snoozeUntil && (
                    <> {" · until "} {formatTimestamp(h.snoozeUntil)}</>
                  )}
                  {h.updatedBy && <> {" · by "} {h.updatedBy}</>}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
