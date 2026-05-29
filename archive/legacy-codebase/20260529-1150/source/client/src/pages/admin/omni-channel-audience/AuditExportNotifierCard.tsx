import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EXPORT_NOTIFIER_URL, buildExportNotifierPayload } from "../omni-channel-audience-forms";

interface AuditExportNotifierConfig {
  enabled: boolean;
  recipients: string[];
  minRowCount: number;
  suppressedActorIds: string[];
  updatedAt: string | null;
  updatedBy: string | null;
}

interface AuditExportNotifierConfigSnapshot {
  enabled: boolean;
  recipientCount: number;
  recipients: string[];
  minRowCount: number;
  suppressedActorIdCount: number;
  suppressedActorIds: string[];
  dedupWindowMs: number | null;
}

interface AuditExportNotifierConfigHistoryEntry {
  id: string;
  occurredAt: string;
  updatedBy: string | null;
  action: "updated" | "cleared" | "restored_default";
  previousConfig: AuditExportNotifierConfigSnapshot | null;
  newConfig: AuditExportNotifierConfigSnapshot | null;
  changedFields: string[];
}

const CONFIG_HISTORY_URL =
  "/api/admin/newsroom/audience/export-notifier/config-history?limit=20";

interface AuditExportNotificationHistoryEntry {
  id: string;
  exportId: string;
  actorId: string;
  actorType: string;
  actorRole: string | null;
  actorDisplayName: string | null;
  actorEmail: string | null;
  format: "json" | "csv";
  totalRowCount: number;
  thresholdRowCount: number;
  thresholdExceeded: boolean;
  recipients: string[];
  notified: boolean;
  reason:
    | "sent"
    | "disabled"
    | "no_recipients"
    | "actor_suppressed"
    | "below_threshold"
    | "deduplicated"
    | "send_failed"
    | "history_format_skipped";
  isTest: boolean;
  errorMessage: string | null;
  occurredAt: string;
}

const AUDIT_HISTORY_REASONS: Array<AuditExportNotificationHistoryEntry["reason"]> = [
  "sent",
  "disabled",
  "no_recipients",
  "actor_suppressed",
  "below_threshold",
  "deduplicated",
  "send_failed",
  "history_format_skipped",
];

function buildAuditHistoryUrl(filters: {
  actorId: string;
  fromDate: string;
  toDate: string;
  reason: string;
}): string {
  const params = new URLSearchParams();
  params.set("limit", "20");
  if (filters.actorId.trim()) params.set("actorId", filters.actorId.trim());
  if (filters.fromDate) {
    const d = new Date(filters.fromDate);
    if (!Number.isNaN(d.getTime())) params.set("fromDate", d.toISOString());
  }
  if (filters.toDate) {
    const d = new Date(filters.toDate);
    if (!Number.isNaN(d.getTime())) params.set("toDate", d.toISOString());
  }
  if (filters.reason) params.set("reason", filters.reason);
  return `/api/admin/newsroom/audience/export-notifier/history?${params.toString()}`;
}

export function AuditExportNotifierCard() {
  const qc = useQueryClient();
  const configQuery = useQuery<{ config: AuditExportNotifierConfig }>({
    queryKey: ["/api/admin/newsroom/audience/export-notifier"],
  });
  const [historyActorFilter, setHistoryActorFilter] = useState("");
  const [historyFromFilter, setHistoryFromFilter] = useState("");
  const [historyToFilter, setHistoryToFilter] = useState("");
  const [historyReasonFilter, setHistoryReasonFilter] = useState<string>("");
  const historyUrl = buildAuditHistoryUrl({
    actorId: historyActorFilter,
    fromDate: historyFromFilter,
    toDate: historyToFilter,
    reason: historyReasonFilter,
  });
  const historyQuery = useQuery<{ history: AuditExportNotificationHistoryEntry[] }>({
    queryKey: [historyUrl],
    refetchInterval: 30_000,
  });
  const hasHistoryFilters = Boolean(
    historyActorFilter.trim() ||
      historyFromFilter ||
      historyToFilter ||
      historyReasonFilter,
  );

  const [enabled, setEnabled] = useState(false);
  const [recipientsText, setRecipientsText] = useState("");
  const [minRowCountText, setMinRowCountText] = useState("0");
  const [suppressedText, setSuppressedText] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Task #676: notify-on-weakening toggle for the audit-export notifier.
  const NOTIFY_ON_WEAKENING_URL =
    "/api/admin/newsroom/audience/export-notifier/notify-on-weakening";
  const notifyOnWeakeningQuery = useQuery<{ enabled: boolean }>({
    queryKey: [NOTIFY_ON_WEAKENING_URL],
  });
  const notifyOnWeakeningMutation = useMutation({
    mutationFn: async (next: boolean) =>
      apiRequest("POST", NOTIFY_ON_WEAKENING_URL, { enabled: next }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [NOTIFY_ON_WEAKENING_URL] });
    },
  });

  useEffect(() => {
    const c = configQuery.data?.config;
    if (c && !hydrated) {
      setEnabled(c.enabled);
      setRecipientsText(c.recipients.join(", "));
      setMinRowCountText(String(c.minRowCount));
      setSuppressedText(c.suppressedActorIds.join(", "));
      setHydrated(true);
    }
  }, [configQuery.data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildExportNotifierPayload({
        enabled,
        recipientsText,
        minRowCountText,
        suppressedText,
      });
      return await apiRequest("PUT", EXPORT_NOTIFIER_URL, payload);
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: [EXPORT_NOTIFIER_URL] });
    },
    onError: (e: any) => setSaveError(e?.message ?? "save failed"),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/newsroom/audience/export-notifier/test");
      return (await res.json()) as {
        ok: boolean;
        recipients: string[];
        errorMessage: string | null;
      };
    },
    onSuccess: (data) => {
      setSaveError(null);
      setTestResult(
        data.ok
          ? `Test sent to ${data.recipients.join(", ")}`
          : `Test failed: ${data.errorMessage ?? "unknown error"}`,
      );
      qc.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0] as string).startsWith(
            "/api/admin/newsroom/audience/export-notifier/history",
          ),
      });
    },
    onError: (e: any) => {
      setTestResult(null);
      setSaveError(e?.message ?? "test send failed");
    },
  });

  const config = configQuery.data?.config;
  const history = historyQuery.data?.history ?? [];
  const configHistoryQuery = useQuery<{
    history: AuditExportNotifierConfigHistoryEntry[];
  }>({
    queryKey: [CONFIG_HISTORY_URL],
    refetchInterval: 60_000,
  });
  const configHistory = configHistoryQuery.data?.history ?? [];

  useEffect(() => {
    if (saveMutation.isSuccess) {
      qc.invalidateQueries({ queryKey: [CONFIG_HISTORY_URL] });
    }
  }, [saveMutation.isSuccess, qc]);

  return (
    <Card data-testid="card-export-notifier">
      <CardHeader>
        <CardTitle>Audit Export Email Alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Email founder / security the moment someone pulls the audience audit
          trail. Set a row-count threshold to silence small pulls, and
          suppress your own root-admin actor IDs so routine founder exports
          stay quiet. Set the threshold to 0 to notify on every export.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Enabled</span>
            <select
              value={enabled ? "1" : "0"}
              onChange={(e) => setEnabled(e.target.value === "1")}
              className="w-full h-9 rounded border bg-background px-2 text-sm"
              data-testid="select-notifier-enabled"
            >
              <option value="0">Off</option>
              <option value="1">On</option>
            </select>
          </label>
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Min row count (0 = always)</span>
            <Input
              value={minRowCountText}
              onChange={(e) => setMinRowCountText(e.target.value)}
              data-testid="input-notifier-min-rows"
              inputMode="numeric"
              placeholder="0"
            />
          </label>
          <div className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Last updated</span>
            <div
              className="h-9 rounded border bg-muted/30 px-2 text-sm flex items-center"
              data-testid="text-notifier-updated"
            >
              {config?.updatedAt
                ? `${new Date(config.updatedAt).toLocaleString()}${
                    config.updatedBy ? ` · ${config.updatedBy}` : ""
                  }`
                : "Never"}
            </div>
          </div>
        </div>
        <label className="text-xs space-y-1 block">
          <span className="text-muted-foreground">Recipients (comma or space separated)</span>
          <Input
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            data-testid="input-notifier-recipients"
            placeholder="founder@example.com, security@example.com"
          />
        </label>
        <label className="text-xs space-y-1 block">
          <span className="text-muted-foreground">
            Suppressed actor IDs (no email for these admin user IDs)
          </span>
          <Input
            value={suppressedText}
            onChange={(e) => setSuppressedText(e.target.value)}
            data-testid="input-notifier-suppressed"
            placeholder="admin_founder, admin_other_root"
          />
        </label>
        <label
          className="flex items-center gap-2 text-[11px] cursor-pointer select-none"
          data-testid="label-export-notifier-notify-on-weakening"
        >
          <input
            type="checkbox"
            className="h-3 w-3"
            checked={notifyOnWeakeningQuery.data?.enabled ?? true}
            disabled={
              notifyOnWeakeningQuery.isLoading ||
              notifyOnWeakeningMutation.isPending
            }
            onChange={(e) =>
              notifyOnWeakeningMutation.mutate(e.target.checked)
            }
            data-testid="checkbox-export-notifier-notify-on-weakening"
          />
          <span>
            Notify on weakening (email all root admins when this notifier is
            turned off or the row-count threshold is loosened by 2x+)
          </span>
        </label>
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-notifier-save"
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
            data-testid="button-notifier-test"
          >
            {testMutation.isPending ? "Sending…" : "Send test email"}
          </Button>
          {config && (
            <Badge variant="outline" data-testid="badge-notifier-status">
              {config.enabled ? "Enabled" : "Disabled"} · {config.recipients.length}{" "}
              recipient{config.recipients.length === 1 ? "" : "s"} ·
              {" "}threshold {config.minRowCount}
            </Badge>
          )}
          {config && config.suppressedActorIds.length > 0 && (
            <Badge variant="secondary" data-testid="badge-notifier-suppressed">
              {config.suppressedActorIds.length} suppressed
            </Badge>
          )}
          {testResult && (
            <span
              className="text-xs text-muted-foreground"
              data-testid="text-notifier-test-result"
            >
              {testResult}
            </span>
          )}
          {saveError && (
            <span
              className="text-xs text-destructive"
              data-testid="text-notifier-error"
            >
              {saveError}
            </span>
          )}
        </div>
        <div className="pt-2">
          <div className="text-xs uppercase text-muted-foreground mb-2">
            Recent notifications
          </div>
          <div className="grid gap-2 md:grid-cols-4 mb-2">
            <label className="text-xs space-y-1 flex flex-col">
              <span className="text-muted-foreground">Actor ID</span>
              <Input
                value={historyActorFilter}
                onChange={(e) => setHistoryActorFilter(e.target.value)}
                data-testid="input-notifier-history-actor"
                placeholder="admin_founder"
              />
            </label>
            <label className="text-xs space-y-1 flex flex-col">
              <span className="text-muted-foreground">From</span>
              <Input
                type="datetime-local"
                value={historyFromFilter}
                onChange={(e) => setHistoryFromFilter(e.target.value)}
                data-testid="input-notifier-history-from"
              />
            </label>
            <label className="text-xs space-y-1 flex flex-col">
              <span className="text-muted-foreground">To</span>
              <Input
                type="datetime-local"
                value={historyToFilter}
                onChange={(e) => setHistoryToFilter(e.target.value)}
                data-testid="input-notifier-history-to"
              />
            </label>
            <label className="text-xs space-y-1 flex flex-col">
              <span className="text-muted-foreground">Outcome</span>
              <select
                value={historyReasonFilter}
                onChange={(e) => setHistoryReasonFilter(e.target.value)}
                className="w-full h-9 rounded border bg-background px-2 text-sm"
                data-testid="select-notifier-history-reason"
              >
                <option value="">All outcomes</option>
                {AUDIT_HISTORY_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {hasHistoryFilters && (
            <div className="mb-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setHistoryActorFilter("");
                  setHistoryFromFilter("");
                  setHistoryToFilter("");
                  setHistoryReasonFilter("");
                }}
                data-testid="button-notifier-history-clear"
              >
                Clear filters
              </Button>
            </div>
          )}
          {historyQuery.isLoading ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="text-notifier-history-loading"
            >
              Loading…
            </p>
          ) : history.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="text-no-notifier-history"
            >
              {hasHistoryFilters
                ? "No notifications match the current filters."
                : "No notifications yet. Pull the audit trail (or click \"Send test email\") to populate this list."}
            </p>
          ) : (
            <div className="space-y-1">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between text-xs rounded border p-2 gap-2"
                  data-testid={`row-notifier-history-${h.id}`}
                >
                  <div className="flex gap-2 items-center flex-wrap">
                    <Badge
                      variant={
                        h.notified
                          ? "default"
                          : h.reason === "send_failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {h.reason}
                    </Badge>
                    {h.isTest && (
                      <Badge variant="secondary">test</Badge>
                    )}
                    {h.thresholdExceeded && (
                      <Badge variant="outline">threshold exceeded</Badge>
                    )}
                    <Badge variant="outline">{h.format}</Badge>
                    <span className="text-muted-foreground font-mono truncate max-w-[200px]">
                      {h.exportId}
                    </span>
                    <span
                      className="text-muted-foreground"
                      title={h.actorId}
                    >
                      actor:
                      {h.actorDisplayName
                        ? `${h.actorDisplayName}${h.actorEmail ? ` (${h.actorEmail})` : ""}`
                        : h.actorEmail ?? h.actorId}
                    </span>
                    <span className="text-muted-foreground">
                      rows:{h.totalRowCount}
                      {h.thresholdRowCount > 0 ? `/${h.thresholdRowCount}` : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(h.occurredAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-muted-foreground truncate max-w-[40%]">
                    {h.errorMessage ?? h.recipients.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="pt-2" data-testid="panel-audit-export-notifier-config-history">
          <div className="text-xs uppercase text-muted-foreground mb-2">
            Past config changes
          </div>
          {configHistoryQuery.isLoading ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="text-audit-export-notifier-config-history-loading"
            >
              Loading…
            </p>
          ) : configHistory.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="text-audit-export-notifier-config-history-empty"
            >
              No config changes recorded yet.
            </p>
          ) : (
            <div className="space-y-1">
              {configHistory.map((h) => {
                const changed = new Set(h.changedFields);
                const prev = h.previousConfig;
                const next = h.newConfig;
                return (
                  <div
                    key={h.id}
                    className="text-xs rounded border p-2 space-y-1"
                    data-testid={`item-audit-export-notifier-config-history-${h.id}`}
                  >
                    <div className="flex gap-2 items-center flex-wrap">
                      <Badge
                        variant={
                          h.action === "cleared"
                            ? "destructive"
                            : h.action === "restored_default"
                              ? "secondary"
                              : "default"
                        }
                        data-testid={`badge-audit-export-notifier-config-history-action-${h.id}`}
                      >
                        {h.action.replace("_", " ")}
                      </Badge>
                      <span className="text-muted-foreground">
                        {new Date(h.occurredAt).toLocaleString()}
                      </span>
                      <span className="text-muted-foreground">
                        by {h.updatedBy ?? "unknown"}
                      </span>
                      {h.changedFields.length > 0 && (
                        <span className="text-muted-foreground">
                          fields: {h.changedFields.join(", ")}
                        </span>
                      )}
                    </div>
                    {prev && next && (
                      <div className="text-muted-foreground space-y-0.5">
                        {changed.has("enabled") && (
                          <div>
                            enabled: {String(prev.enabled)} → {String(next.enabled)}
                          </div>
                        )}
                        {changed.has("recipients") && (
                          <div>
                            recipients: {prev.recipientCount} → {next.recipientCount}
                          </div>
                        )}
                        {changed.has("minRowCount") && (
                          <div>
                            min row count: {prev.minRowCount} → {next.minRowCount}
                          </div>
                        )}
                        {changed.has("suppressedActorIds") && (
                          <div>
                            suppressed actors: {prev.suppressedActorIdCount} →{" "}
                            {next.suppressedActorIdCount}
                          </div>
                        )}
                        {changed.has("dedupWindowMs") && (
                          <div>
                            dedup window: {prev.dedupWindowMs ?? "default"} →{" "}
                            {next.dedupWindowMs ?? "default"}
                          </div>
                        )}
                      </div>
                    )}
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
