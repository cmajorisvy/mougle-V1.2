import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBytes } from "./_shared";

const BASE = "/api/admin/newsroom/audience/retention/archive/trash-bin-notifier";
const HISTORY_URL = `${BASE}/history?limit=20`;

type Reason =
  | "disabled"
  | "no_recipients"
  | "below_threshold"
  | "deduplicated"
  | "snoozed"
  | "send_failed"
  | "stats_failed"
  | "sent";

interface TrashBinNotifierConfig {
  enabled: boolean;
  recipients: string[];
  alertIntervalHours: number;
  lastAlertAt: string | null;
  lastAlertSignature: string | null;
  snoozeUntil: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface TrashBinNotifierHistoryEntry {
  kind: "alert" | "test";
  reason: Reason;
  notified: boolean;
  recipients: string[];
  trashFileCount: number;
  totalTrashBytes: number;
  trashFileCountExceeded: boolean;
  trashBytesExceeded: boolean;
  errorMessage: string | null;
  occurredAt: string;
}

export function RecycleBinAlertNotifierCard() {
  const qc = useQueryClient();
  const configQuery = useQuery<{ config: TrashBinNotifierConfig }>({
    queryKey: [BASE],
  });
  const historyQuery = useQuery<{ history: TrashBinNotifierHistoryEntry[] }>({
    queryKey: [HISTORY_URL],
    refetchInterval: 30_000,
  });

  const [enabled, setEnabled] = useState(false);
  const [recipientsText, setRecipientsText] = useState("");
  const [alertHoursText, setAlertHoursText] = useState("24");
  const [snoozeUntilText, setSnoozeUntilText] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  useEffect(() => {
    const c = configQuery.data?.config;
    if (c && !hydrated) {
      setEnabled(c.enabled);
      setRecipientsText(c.recipients.join(", "));
      setAlertHoursText(String(c.alertIntervalHours));
      setHydrated(true);
    }
  }, [configQuery.data, hydrated]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: [BASE] });
    qc.invalidateQueries({ queryKey: [HISTORY_URL] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const recipients = recipientsText
        .split(/[\s,]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
      const alertIntervalHours = Math.max(
        1,
        Math.min(24 * 30, Math.floor(Number(alertHoursText) || 24)),
      );
      const res = await apiRequest("PUT", BASE, {
        enabled,
        recipients,
        alertIntervalHours,
      });
      return (await res.json()) as { config: TrashBinNotifierConfig };
    },
    onSuccess: () => {
      setSaveError(null);
      setActionResult("Settings saved");
      invalidateAll();
    },
    onError: (e: any) => setSaveError(e?.message ?? "save failed"),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${BASE}/test`);
      return (await res.json()) as {
        ok: boolean;
        recipients: string[];
        errorMessage: string | null;
      };
    },
    onSuccess: (data) => {
      setSaveError(null);
      setActionResult(
        data.ok
          ? `Test sent to ${data.recipients.join(", ")}`
          : `Test failed: ${data.errorMessage ?? "unknown error"}`,
      );
      invalidateAll();
    },
    onError: (e: any) => {
      setActionResult(null);
      setSaveError(e?.message ?? "test send failed");
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${BASE}/run`);
      return (await res.json()) as {
        result: { notified: boolean; reason: Reason };
      };
    },
    onSuccess: (data) => {
      setSaveError(null);
      setActionResult(
        data.result.notified
          ? `Alert sent (${data.result.reason})`
          : `Alert skipped (${data.result.reason})`,
      );
      invalidateAll();
    },
    onError: (e: any) => setSaveError(e?.message ?? "alert run failed"),
  });

  const snoozeMutation = useMutation({
    mutationFn: async (snoozeUntil: string | null) => {
      const res = await apiRequest("POST", `${BASE}/snooze`, { snoozeUntil });
      return (await res.json()) as { config: TrashBinNotifierConfig };
    },
    onSuccess: (data) => {
      setSaveError(null);
      setActionResult(
        data.config.snoozeUntil
          ? `Snoozed until ${new Date(data.config.snoozeUntil).toLocaleString()}`
          : "Snooze cleared",
      );
      invalidateAll();
    },
    onError: (e: any) => setSaveError(e?.message ?? "snooze failed"),
  });

  const snoozeFor = (ms: number) => {
    const until = new Date(Date.now() + ms).toISOString();
    snoozeMutation.mutate(until);
  };

  const snoozeUntilDate = () => {
    const v = snoozeUntilText.trim();
    if (!v) {
      setSaveError("pick a date/time first");
      return;
    }
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      setSaveError("invalid date/time");
      return;
    }
    if (d.getTime() <= Date.now()) {
      setSaveError("snooze must be in the future");
      return;
    }
    snoozeMutation.mutate(d.toISOString());
  };

  const config = configQuery.data?.config;
  const history = historyQuery.data?.history ?? [];
  const snoozedActive =
    !!config?.snoozeUntil && new Date(config.snoozeUntil).getTime() > Date.now();

  return (
    <Card data-testid="card-recycle-bin-alert-notifier">
      <CardHeader>
        <CardTitle>Recycle Bin Alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Email founder / ops when the audience archive recycle bin
          (<code className="font-mono text-[11px]">.trash/</code>) crosses your
          configured file-count or byte thresholds. The notifier dedups
          repeated breaches within the alert interval. Toggle off to mute
          entirely.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Enabled</span>
            <select
              value={enabled ? "1" : "0"}
              onChange={(e) => setEnabled(e.target.value === "1")}
              className="w-full h-9 rounded border bg-background px-2 text-sm"
              data-testid="select-trash-bin-notifier-enabled"
            >
              <option value="0">Off</option>
              <option value="1">On</option>
            </select>
          </label>
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">
              Alert interval (hours)
            </span>
            <Input
              value={alertHoursText}
              onChange={(e) => setAlertHoursText(e.target.value)}
              data-testid="input-trash-bin-notifier-interval-hours"
              inputMode="numeric"
              placeholder="24"
            />
          </label>
          <div className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Last alert sent</span>
            <div
              className="h-9 rounded border bg-muted/30 px-2 text-sm flex items-center"
              data-testid="text-trash-bin-notifier-last-alert"
            >
              {config?.lastAlertAt
                ? new Date(config.lastAlertAt).toLocaleString()
                : "Never"}
            </div>
          </div>
        </div>
        <label className="text-xs space-y-1 block">
          <span className="text-muted-foreground">
            Recipients (comma or space separated)
          </span>
          <Input
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            data-testid="input-trash-bin-notifier-recipients"
            placeholder="founder@example.com, ops@example.com"
          />
        </label>
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-trash-bin-notifier-save"
          >
            {saveMutation.isPending ? "Saving…" : "Save settings"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={
              testMutation.isPending ||
              !config ||
              config.recipients.length === 0
            }
            data-testid="button-trash-bin-notifier-test"
          >
            {testMutation.isPending ? "Sending…" : "Send test email"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending || !config?.enabled}
            data-testid="button-trash-bin-notifier-run"
          >
            {runMutation.isPending ? "Running…" : "Run alert now"}
          </Button>
          {config && (
            <Badge variant="outline" data-testid="badge-trash-bin-notifier-status">
              {config.enabled ? "Enabled" : "Disabled"} ·{" "}
              {config.recipients.length} recipient
              {config.recipients.length === 1 ? "" : "s"} · every{" "}
              {config.alertIntervalHours}h
            </Badge>
          )}
          {snoozedActive && (
            <Badge
              variant="destructive"
              data-testid="badge-trash-bin-notifier-snoozed-until"
            >
              Snoozed until{" "}
              {new Date(config!.snoozeUntil!).toLocaleString()}
            </Badge>
          )}
          {actionResult && (
            <span
              className="text-xs text-muted-foreground"
              data-testid="text-trash-bin-notifier-action-result"
            >
              {actionResult}
            </span>
          )}
          {saveError && (
            <span
              className="text-xs text-destructive"
              data-testid="text-trash-bin-notifier-error"
            >
              {saveError}
            </span>
          )}
        </div>
        <div
          className="flex gap-2 flex-wrap items-center pt-3 border-t"
          data-testid="block-trash-bin-notifier-snooze"
        >
          <span className="text-xs text-muted-foreground">
            Snooze alerts (recipients & interval stay configured):
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => snoozeFor(24 * 60 * 60 * 1000)}
            disabled={snoozeMutation.isPending}
            data-testid="button-trash-bin-notifier-snooze-1d"
          >
            Snooze 1 day
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => snoozeFor(7 * 24 * 60 * 60 * 1000)}
            disabled={snoozeMutation.isPending}
            data-testid="button-trash-bin-notifier-snooze-1w"
          >
            Snooze 1 week
          </Button>
          <Input
            type="datetime-local"
            value={snoozeUntilText}
            onChange={(e) => setSnoozeUntilText(e.target.value)}
            className="h-9 w-auto"
            data-testid="input-trash-bin-notifier-snooze-until"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={snoozeUntilDate}
            disabled={snoozeMutation.isPending || !snoozeUntilText}
            data-testid="button-trash-bin-notifier-snooze-until"
          >
            Snooze until date
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => snoozeMutation.mutate(null)}
            disabled={snoozeMutation.isPending || !snoozedActive}
            data-testid="button-trash-bin-notifier-unsnooze"
          >
            Unsnooze
          </Button>
        </div>
        <div className="pt-2">
          <div className="text-xs uppercase text-muted-foreground mb-2">
            Recent notifications
          </div>
          {historyQuery.isLoading ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="text-trash-bin-notifier-history-loading"
            >
              Loading…
            </p>
          ) : history.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="text-no-trash-bin-notifier-history"
            >
              No notifications yet. Enable the notifier and the next retention
              sweep (or a manual run) will populate this list.
            </p>
          ) : (
            <div className="space-y-1">
              {history.map((h, idx) => {
                const flags: string[] = [];
                if (h.trashFileCountExceeded) flags.push("files over");
                if (h.trashBytesExceeded) flags.push("bytes over");
                const trailing =
                  h.errorMessage ??
                  (h.recipients.length > 0 ? h.recipients.join(", ") : "—");
                return (
                  <div
                    key={`${h.occurredAt}-${idx}`}
                    className="flex items-center justify-between text-xs rounded border p-2 gap-2"
                    data-testid={`row-trash-bin-notifier-history-${idx}`}
                  >
                    <div className="flex gap-2 items-center flex-wrap">
                      <Badge
                        variant={
                          h.notified
                            ? "default"
                            : h.reason === "send_failed" ||
                                h.reason === "stats_failed"
                              ? "destructive"
                              : "secondary"
                        }
                        data-testid={`badge-trash-bin-notifier-reason-${idx}`}
                      >
                        {h.reason}
                      </Badge>
                      <Badge variant="outline">{h.kind}</Badge>
                      {flags.map((f) => (
                        <Badge key={f} variant="outline">
                          {f}
                        </Badge>
                      ))}
                      <span className="text-muted-foreground">
                        files:{h.trashFileCount.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground">
                        bytes:{formatBytes(h.totalTrashBytes)}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(h.occurredAt).toLocaleString()}
                      </span>
                    </div>
                    <div
                      className={`truncate max-w-[40%] ${
                        h.reason === "send_failed" || h.reason === "stats_failed"
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                    >
                      {trailing}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
