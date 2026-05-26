import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  LEGACY_TOKEN_DISPATCH_ALERT_URL,
  buildLegacyTokenDispatchAlertPayload,
} from "../omni-channel-audience-forms";
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
import type {
  LegacyTokenStatusResponse,
  LegacyTokenStatusConnectorRow,
} from "./LegacyTokenStatusCard";

interface LegacyTokenDispatchAlertConfig {
  enabled: boolean;
  recipients: string[];
  dedupWindowMs: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export function LegacyTokenDispatchAlertCard() {
  const qc = useQueryClient();
  const configQuery = useQuery<{ config: LegacyTokenDispatchAlertConfig }>({
    queryKey: ["/api/admin/newsroom/audience/legacy-token-dispatch-alert"],
  });
  const statusQuery = useQuery<LegacyTokenStatusResponse>({
    queryKey: ["/api/admin/newsroom/audience/legacy-token-status"],
    refetchInterval: 60_000,
  });

  const [enabled, setEnabled] = useState(false);
  const [recipientsText, setRecipientsText] = useState("");
  const [dedupHoursText, setDedupHoursText] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const c = configQuery.data?.config;
    if (c && !hydrated) {
      setEnabled(c.enabled);
      setRecipientsText(c.recipients.join(", "));
      setDedupHoursText(
        c.dedupWindowMs === null
          ? ""
          : String(Math.round((c.dedupWindowMs / (60 * 60 * 1000)) * 100) / 100),
      );
      setHydrated(true);
    }
  }, [configQuery.data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildLegacyTokenDispatchAlertPayload({
        enabled,
        recipientsText,
        dedupHoursText,
      });
      const res = await apiRequest(
        "PUT",
        LEGACY_TOKEN_DISPATCH_ALERT_URL,
        payload,
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `request_failed_${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({
        queryKey: [LEGACY_TOKEN_DISPATCH_ALERT_URL],
      });
    },
    onError: (e: any) => setSaveError(e?.message ?? "save failed"),
  });

  const config = configQuery.data?.config;
  const legacyConnectors = (statusQuery.data?.connectors ?? []).filter(
    (c) => c.tokenSource === "legacy_env_fallback",
  );
  const approvedLegacyConnectors = legacyConnectors.filter(
    (c) => c.platformSendApproved && c.apiAccessMode === "official_api",
  );

  return (
    <Card
      data-testid="card-legacy-token-dispatch-alert"
      id="legacy-token-dispatch-alert"
    >
      <CardHeader>
        <CardTitle>Legacy Token Dispatch Alerts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Email founder / security the moment an approved{" "}
          <code>official_api</code> connector successfully dispatches a real
          moderation command via the shared{" "}
          <code>AUDIENCE_GATEWAY_&lt;PLATFORM&gt;_TOKEN</code> env fallback. A
          single dedup&apos;d alert per connector tells you exactly which
          connector still needs a per-connector encrypted secret installed
          before you can flip{" "}
          <code>AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_&lt;PLATFORM&gt;=true</code>.
          Token material is never included in the email.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Enabled</span>
            <select
              value={enabled ? "1" : "0"}
              onChange={(e) => setEnabled(e.target.value === "1")}
              className="w-full h-9 rounded border bg-background px-2 text-sm"
              data-testid="select-legacy-dispatch-alert-enabled"
            >
              <option value="0">Off</option>
              <option value="1">On</option>
            </select>
          </label>
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">
              Dedup window (hours, blank = default 24h, 0 = disable)
            </span>
            <Input
              value={dedupHoursText}
              onChange={(e) => setDedupHoursText(e.target.value)}
              placeholder="24"
              inputMode="decimal"
              data-testid="input-legacy-dispatch-alert-dedup-hours"
            />
          </label>
          <div className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Last updated</span>
            <div
              className="h-9 rounded border bg-muted/30 px-2 text-sm flex items-center"
              data-testid="text-legacy-dispatch-alert-updated"
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
            data-testid="input-legacy-dispatch-alert-recipients"
            placeholder="founder@example.com, security@example.com"
          />
        </label>
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-legacy-dispatch-alert-save"
          >
            {saveMutation.isPending ? "Saving…" : "Save settings"}
          </Button>
          {config && (
            <Badge
              variant="outline"
              data-testid="badge-legacy-dispatch-alert-status"
            >
              {config.enabled ? "Enabled" : "Disabled"} ·{" "}
              {config.recipients.length} recipient
              {config.recipients.length === 1 ? "" : "s"}
              {config.dedupWindowMs !== null
                ? ` · dedup ${config.dedupWindowMs === 0 ? "off" : `${Math.round((config.dedupWindowMs / (60 * 60 * 1000)) * 100) / 100}h`}`
                : " · dedup default"}
            </Badge>
          )}
          {saveError && (
            <span
              className="text-xs text-destructive"
              data-testid="text-legacy-dispatch-alert-error"
            >
              {saveError}
            </span>
          )}
        </div>
        <div className="pt-2">
          <div className="text-xs uppercase text-muted-foreground mb-2 flex items-center gap-2">
            <span>Connectors still using the shared env token</span>
            <Badge
              variant="outline"
              data-testid="badge-legacy-dispatch-alert-count"
            >
              {legacyConnectors.length} total ·{" "}
              {approvedLegacyConnectors.length} would trigger this alert
            </Badge>
          </div>
          {statusQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : legacyConnectors.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="text-legacy-dispatch-alert-empty"
            >
              No connectors are still on the shared env token. Nothing can
              trigger this alert.
            </p>
          ) : (
            <div className="space-y-1.5">
              {legacyConnectors.map((c) => (
                <div
                  key={c.connectorId}
                  className="text-xs flex items-center justify-between gap-2 border rounded px-2 py-1"
                  data-testid={`row-legacy-dispatch-alert-connector-${c.connectorId}`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="font-medium truncate">{c.displayName}</span>
                    <Badge variant="outline">{c.platform}</Badge>
                    <Badge variant="outline">{c.apiAccessMode}</Badge>
                    {c.platformSendApproved &&
                    c.apiAccessMode === "official_api" ? (
                      <Badge
                        variant="default"
                        data-testid={`badge-legacy-dispatch-alert-eligible-${c.connectorId}`}
                      >
                        will alert on next legacy dispatch
                      </Badge>
                    ) : (
                      <Badge variant="secondary">won&apos;t alert</Badge>
                    )}
                    {c.envFallbackDisabled && (
                      <Badge variant="secondary">platform env OFF</Badge>
                    )}
                  </div>
                  <span className="font-mono text-muted-foreground truncate">
                    {c.connectorId}
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
