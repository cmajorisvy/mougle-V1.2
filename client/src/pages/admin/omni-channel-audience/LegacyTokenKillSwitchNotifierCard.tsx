import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const NOTIFIER_URL =
  "/api/admin/newsroom/audience/legacy-token-kill-switch-notifier";
const HISTORY_URL = `${NOTIFIER_URL}/history?limit=20`;
const TEST_URL = `${NOTIFIER_URL}/test`;

interface NotifierConfig {
  enabled: boolean;
  recipients: string[];
  suppressedActorIds: string[];
  dedupWindowMs: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface HistoryEntry {
  id: string;
  notified: boolean;
  reason:
    | "sent"
    | "disabled"
    | "no_recipients"
    | "actor_suppressed"
    | "deduplicated"
    | "send_failed";
  recipients: string[];
  event: {
    platform: string;
    previousValue: "true" | "false" | "cleared";
    newValue: "true" | "false" | "cleared";
    updatedBy: string;
    batchId?: string | null;
    flippedAt: string;
  };
  errorMessage: string | null;
  isTest: boolean;
  occurredAt: string;
  suppressedCount?: number;
  suppressedSince?: string | null;
}

function parseList(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  );
}

export function LegacyTokenKillSwitchNotifierCard() {
  const qc = useQueryClient();
  const configQuery = useQuery<{ config: NotifierConfig }>({
    queryKey: [NOTIFIER_URL],
  });
  const historyQuery = useQuery<{ history: HistoryEntry[] }>({
    queryKey: [HISTORY_URL],
    refetchInterval: 30_000,
  });

  const [enabled, setEnabled] = useState(false);
  const [recipientsText, setRecipientsText] = useState("");
  const [suppressedText, setSuppressedText] = useState("");
  const [dedupText, setDedupText] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    const c = configQuery.data?.config;
    if (c && !hydrated) {
      setEnabled(c.enabled);
      setRecipientsText(c.recipients.join(", "));
      setSuppressedText(c.suppressedActorIds.join(", "));
      setDedupText(c.dedupWindowMs === null ? "" : String(c.dedupWindowMs));
      setHydrated(true);
    }
  }, [configQuery.data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const recipients = parseList(recipientsText).map((s) => s.toLowerCase());
      const suppressedActorIds = parseList(suppressedText);
      const dedupTrim = dedupText.trim();
      const dedupWindowMs =
        dedupTrim === "" ? null : Math.max(0, Math.floor(Number(dedupTrim)));
      if (dedupTrim !== "" && !Number.isFinite(Number(dedupTrim))) {
        throw new Error("Dedup window must be a number (ms).");
      }
      return await apiRequest("PUT", NOTIFIER_URL, {
        enabled,
        recipients,
        suppressedActorIds,
        dedupWindowMs,
      });
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: [NOTIFIER_URL] });
    },
    onError: (e: any) => setSaveError(e?.message ?? "save failed"),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", TEST_URL);
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
      qc.invalidateQueries({ queryKey: [HISTORY_URL] });
    },
    onError: (e: any) => {
      setTestResult(null);
      setSaveError(e?.message ?? "test send failed");
    },
  });

  const config = configQuery.data?.config;
  const history = historyQuery.data?.history ?? [];

  return (
    <Card data-testid="card-legacy-token-kill-switch-notifier">
      <CardHeader>
        <CardTitle>Legacy-Token Kill-Switch Email Alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Email founder / security the moment a root admin flips the
          per-platform legacy-token env-fallback kill-switch. Turning it OFF
          can instantly break every connector still relying on the shared
          env token; turning it ON re-opens a known attack surface.
          Suppress your own root-admin actor IDs so routine founder flips
          stay quiet. Dedup window collapses repeated identical flips into
          one email (leave blank for the 5-minute default; 0 disables).
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Enabled</span>
            <select
              value={enabled ? "1" : "0"}
              onChange={(e) => setEnabled(e.target.value === "1")}
              className="w-full h-9 rounded border bg-background px-2 text-sm"
              data-testid="select-kill-switch-notifier-enabled"
            >
              <option value="0">Off</option>
              <option value="1">On</option>
            </select>
          </label>
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">
              Dedup window ms (blank = 5 min, 0 = off)
            </span>
            <Input
              value={dedupText}
              onChange={(e) => setDedupText(e.target.value)}
              data-testid="input-kill-switch-notifier-dedup"
              inputMode="numeric"
              placeholder="300000"
            />
          </label>
          <div className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Last updated</span>
            <div
              className="h-9 rounded border bg-muted/30 px-2 text-sm flex items-center"
              data-testid="text-kill-switch-notifier-updated"
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
          <span className="text-muted-foreground">
            Recipients (comma or space separated)
          </span>
          <Input
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            data-testid="input-kill-switch-notifier-recipients"
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
            data-testid="input-kill-switch-notifier-suppressed"
            placeholder="admin_founder, admin_other_root"
          />
        </label>
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-kill-switch-notifier-save"
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
            data-testid="button-kill-switch-notifier-test"
          >
            {testMutation.isPending ? "Sending…" : "Send test email"}
          </Button>
          {config && (
            <Badge variant="outline" data-testid="badge-kill-switch-notifier-status">
              {config.enabled ? "Enabled" : "Disabled"} ·{" "}
              {config.recipients.length} recipient
              {config.recipients.length === 1 ? "" : "s"}
            </Badge>
          )}
          {config && config.suppressedActorIds.length > 0 && (
            <Badge
              variant="secondary"
              data-testid="badge-kill-switch-notifier-suppressed"
            >
              {config.suppressedActorIds.length} suppressed
            </Badge>
          )}
          {testResult && (
            <span
              className="text-xs text-muted-foreground"
              data-testid="text-kill-switch-notifier-test-result"
            >
              {testResult}
            </span>
          )}
          {saveError && (
            <span
              className="text-xs text-destructive"
              data-testid="text-kill-switch-notifier-error"
            >
              {saveError}
            </span>
          )}
        </div>
        <div className="pt-2">
          <div className="text-xs uppercase text-muted-foreground mb-2">
            Recent notifications
          </div>
          {historyQuery.isLoading ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="text-kill-switch-notifier-history-loading"
            >
              Loading…
            </p>
          ) : history.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="text-no-kill-switch-notifier-history"
            >
              No notifications yet. Flip a kill-switch (or click "Send test
              email") to populate this list.
            </p>
          ) : (
            <div className="space-y-1">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between text-xs rounded border p-2 gap-2"
                  data-testid={`row-kill-switch-notifier-history-${h.id}`}
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
                    {h.isTest && <Badge variant="secondary">test</Badge>}
                    <Badge variant="outline">{h.event.platform}</Badge>
                    <span className="text-muted-foreground">
                      {h.event.previousValue} → {h.event.newValue}
                    </span>
                    <span className="text-muted-foreground">
                      by {h.event.updatedBy}
                    </span>
                    {typeof h.suppressedCount === "number" &&
                      h.suppressedCount > 0 && (
                        <Badge variant="outline">
                          {h.suppressedCount} suppressed
                        </Badge>
                      )}
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
      </CardContent>
    </Card>
  );
}
