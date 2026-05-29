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
import { CONNECTOR_ROTATION_NOTIFIER_URL, buildConnectorRotationNotifierPayload } from "../omni-channel-audience-forms";

interface ConnectorRotationNotifierConfig {
  enabled: boolean;
  recipients: string[];
  suppressedActions: Array<"set" | "rotate" | "delete">;
  dedupWindowMs: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface ConnectorRotationHistoryEntry {
  id: string;
  notified: boolean;
  reason:
    | "sent"
    | "disabled"
    | "no_recipients"
    | "action_suppressed"
    | "deduplicated"
    | "send_failed";
  recipients: string[];
  event: {
    connectorId: string;
    platform: string;
    action: "set" | "rotate" | "delete";
    rotatedBy: string | null;
    rotatedAt: string;
    rotationCount: number;
    keyVersion: number;
  };
  errorMessage: string | null;
  suppressedCount?: number;
  suppressedSince?: string | null;
  dedupWindowMs?: number;
  isTest: boolean;
  occurredAt: string;
}

export function ConnectorRotationNotifierCard() {
  const qc = useQueryClient();
  const configQuery = useQuery<{ config: ConnectorRotationNotifierConfig }>({
    queryKey: ["/api/admin/newsroom/audience/connector-rotation-notifier"],
  });
  const historyQuery = useQuery<{ history: ConnectorRotationHistoryEntry[] }>({
    queryKey: [
      "/api/admin/newsroom/audience/connector-rotation-notifier/history?limit=20",
    ],
    refetchInterval: 30_000,
  });

  const [enabled, setEnabled] = useState(false);
  const [recipientsText, setRecipientsText] = useState("");
  const [suppressSet, setSuppressSet] = useState(false);
  const [suppressRotate, setSuppressRotate] = useState(false);
  const [suppressDelete, setSuppressDelete] = useState(false);
  const [dedupWindowSecText, setDedupWindowSecText] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    const c = configQuery.data?.config;
    if (c && !hydrated) {
      setEnabled(c.enabled);
      setRecipientsText(c.recipients.join(", "));
      setSuppressSet(c.suppressedActions.includes("set"));
      setSuppressRotate(c.suppressedActions.includes("rotate"));
      setSuppressDelete(c.suppressedActions.includes("delete"));
      setDedupWindowSecText(
        c.dedupWindowMs === null || c.dedupWindowMs === undefined
          ? ""
          : String(Math.floor(c.dedupWindowMs / 1000)),
      );
      setHydrated(true);
    }
  }, [configQuery.data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildConnectorRotationNotifierPayload({
        enabled,
        recipientsText,
        suppressSet,
        suppressRotate,
        suppressDelete,
        dedupWindowSecText,
      });
      return await apiRequest(
        "PUT",
        CONNECTOR_ROTATION_NOTIFIER_URL,
        payload,
      );
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({
        queryKey: [CONNECTOR_ROTATION_NOTIFIER_URL],
      });
    },
    onError: (e: any) => setSaveError(e?.message ?? "save failed"),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/connector-rotation-notifier/test",
      );
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
        queryKey: [
          "/api/admin/newsroom/audience/connector-rotation-notifier/history?limit=20",
        ],
      });
    },
    onError: (e: any) => {
      setTestResult(null);
      setSaveError(e?.message ?? "test send failed");
    },
  });

  const config = configQuery.data?.config;
  const history = historyQuery.data?.history ?? [];

  return (
    <Card data-testid="card-connector-rotation-notifier" id="connector-rotation-notifier">
      <CardHeader>
        <CardTitle>Connector Token Rotation Alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Email founder / security the moment a per-connector platform access
          token is installed, rotated, or deleted on the omni-channel audience
          gateway. The plaintext token is never included in the email — only
          the connector id, platform, action, who did it, when, and the new
          rotation count. Use this as a compromise-response channel: any
          unexpected rotation should be investigated immediately.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Enabled</span>
            <select
              value={enabled ? "1" : "0"}
              onChange={(e) => setEnabled(e.target.value === "1")}
              className="w-full h-9 rounded border bg-background px-2 text-sm"
              data-testid="select-rotation-notifier-enabled"
            >
              <option value="0">Off</option>
              <option value="1">On</option>
            </select>
          </label>
          <div className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Last updated</span>
            <div
              className="h-9 rounded border bg-muted/30 px-2 text-sm flex items-center"
              data-testid="text-rotation-notifier-updated"
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
            data-testid="input-rotation-notifier-recipients"
            placeholder="founder@example.com, security@example.com"
          />
        </label>
        <div className="text-xs space-y-1">
          <span className="text-muted-foreground">
            Suppress these actions (no email; still recorded)
          </span>
          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={suppressSet}
                onChange={(e) => setSuppressSet(e.target.checked)}
                data-testid="checkbox-rotation-suppress-set"
              />
              <span>set (first install)</span>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={suppressRotate}
                onChange={(e) => setSuppressRotate(e.target.checked)}
                data-testid="checkbox-rotation-suppress-rotate"
              />
              <span>rotate</span>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={suppressDelete}
                onChange={(e) => setSuppressDelete(e.target.checked)}
                data-testid="checkbox-rotation-suppress-delete"
              />
              <span>delete</span>
            </label>
          </div>
        </div>
        <label className="text-xs space-y-1 block">
          <span className="text-muted-foreground">
            Dedup window (seconds) — repeat events on the same connector within
            this window collapse into one email. Leave blank for the default
            (300s / 5 min). Set to 0 to disable dedup.
          </span>
          <Input
            type="number"
            min={0}
            step={1}
            value={dedupWindowSecText}
            onChange={(e) => setDedupWindowSecText(e.target.value)}
            data-testid="input-rotation-notifier-dedup-window"
            placeholder="300"
          />
        </label>
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-rotation-notifier-save"
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
            data-testid="button-rotation-notifier-test"
          >
            {testMutation.isPending ? "Sending…" : "Send test email"}
          </Button>
          {config && (
            <Badge variant="outline" data-testid="badge-rotation-notifier-status">
              {config.enabled ? "Enabled" : "Disabled"} ·{" "}
              {config.recipients.length} recipient
              {config.recipients.length === 1 ? "" : "s"}
              {config.suppressedActions.length > 0
                ? ` · ${config.suppressedActions.length} muted action${config.suppressedActions.length === 1 ? "" : "s"}`
                : ""}
              {" · dedup "}
              {config.dedupWindowMs === null || config.dedupWindowMs === undefined
                ? "default"
                : config.dedupWindowMs === 0
                ? "off"
                : `${Math.floor(config.dedupWindowMs / 1000)}s`}
            </Badge>
          )}
          {testResult && (
            <span
              className="text-xs text-muted-foreground"
              data-testid="text-rotation-notifier-test-result"
            >
              {testResult}
            </span>
          )}
          {saveError && (
            <span
              className="text-xs text-destructive"
              data-testid="text-rotation-notifier-error"
            >
              {saveError}
            </span>
          )}
        </div>
        <div className="pt-2">
          <div className="text-xs uppercase text-muted-foreground mb-2">
            Recent rotation notifications
          </div>
          {historyQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : history.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="text-rotation-notifier-history-empty"
            >
              No rotations recorded yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="text-xs flex items-center justify-between gap-2 border rounded px-2 py-1"
                  data-testid={`row-rotation-notifier-history-${h.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge
                      variant={h.notified ? "default" : "secondary"}
                      data-testid={`badge-rotation-reason-${h.id}`}
                    >
                      {h.reason}
                    </Badge>
                    <span className="font-mono truncate">
                      {h.event.action.toUpperCase()} · {h.event.platform} ·{" "}
                      {h.event.connectorId} (#{h.event.rotationCount})
                    </span>
                    {h.isTest && <Badge variant="outline">test</Badge>}
                    {(h.suppressedCount ?? 0) > 0 && (
                      <Badge
                        variant="destructive"
                        data-testid={`badge-rotation-suppressed-${h.id}`}
                      >
                        {h.reason === "deduplicated"
                          ? `+${h.suppressedCount} suppressed`
                          : `${h.suppressedCount} prior suppressed`}
                        {h.suppressedSince
                          ? ` since ${new Date(h.suppressedSince).toLocaleTimeString()}`
                          : ""}
                      </Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground">
                    {new Date(h.occurredAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
