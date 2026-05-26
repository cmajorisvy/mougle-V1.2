import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { buildGatewayBlockAlertSettingsPayload } from "../omni-channel-audience-forms";
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

interface GatewayBlockAlertSettings {
  threshold: number;
  windowMs: number;
  dedupMs: number;
  recovery: number;
  effectiveRecovery: number;
  autoPauseEnabled: boolean;
  autoPauseWindows: number;
  thresholdSource: "db" | "env" | "default";
  windowMsSource: "db" | "env" | "default";
  dedupMsSource: "db" | "env" | "default";
  recoverySource: "db" | "env" | "default";
  autoPauseEnabledSource: "db" | "env" | "default";
  autoPauseWindowsSource: "db" | "env" | "default";
  recoveryIsDerived: boolean;
  envFallback: {
    threshold: number | null;
    windowMs: number | null;
    dedupMs: number | null;
    recovery: number | null;
    autoPauseEnabled: boolean | null;
    autoPauseWindows: number | null;
  };
  defaults: {
    threshold: number;
    windowMs: number;
    dedupMs: number;
    recovery: number | null;
    autoPauseEnabled: boolean;
    autoPauseWindows: number;
  };
  limits: {
    thresholdMin: number;
    thresholdMax: number;
    windowMsMin: number;
    windowMsMax: number;
    dedupMsMin: number;
    dedupMsMax: number;
    recoveryMin: number;
    recoveryMax: number;
    autoPauseWindowsMin: number;
    autoPauseWindowsMax: number;
  };
}

function sourceBadge(s: "db" | "env" | "default") {
  if (s === "db") return <Badge variant="default">Admin</Badge>;
  if (s === "env") return <Badge variant="secondary">Env</Badge>;
  return <Badge variant="outline">Default</Badge>;
}

export function GatewayBlockAlertSettingsCard() {
  const qc = useQueryClient();
  const settingsQuery = useQuery<{ settings: GatewayBlockAlertSettings }>({
    queryKey: ["/api/admin/newsroom/audience/gateway/alert-settings"],
  });

  const [thresholdInput, setThresholdInput] = useState<string>("");
  const [windowSecInput, setWindowSecInput] = useState<string>("");
  const [dedupMinInput, setDedupMinInput] = useState<string>("");
  const [recoveryInput, setRecoveryInput] = useState<string>("");
  const [recoveryDerived, setRecoveryDerived] = useState<boolean>(true);
  const [autoPauseEnabledInput, setAutoPauseEnabledInput] = useState<boolean>(false);
  const [autoPauseWindowsInput, setAutoPauseWindowsInput] = useState<string>("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const s = settingsQuery.data?.settings;
  useEffect(() => {
    if (!s) return;
    setThresholdInput(String(s.threshold));
    setWindowSecInput(String(Math.round(s.windowMs / 1000)));
    setDedupMinInput(String(Math.round(s.dedupMs / 60_000)));
    setRecoveryDerived(s.recoveryIsDerived);
    setRecoveryInput(s.recoveryIsDerived ? "" : String(s.recovery));
    setAutoPauseEnabledInput(s.autoPauseEnabled);
    setAutoPauseWindowsInput(String(s.autoPauseWindows));
  }, [
    s?.threshold,
    s?.windowMs,
    s?.dedupMs,
    s?.recovery,
    s?.recoveryIsDerived,
    s?.autoPauseEnabled,
    s?.autoPauseWindows,
  ]);

  const saveMutation = useMutation({
    mutationFn: async (body: {
      threshold?: number;
      windowMs?: number;
      dedupMs?: number;
      recovery?: number | null;
      autoPauseEnabled?: boolean;
      autoPauseWindows?: number;
    }) => {
      return await apiRequest(
        "PATCH",
        "/api/admin/newsroom/audience/gateway/alert-settings",
        body,
      );
    },
    onSuccess: () => {
      setSaveError(null);
      setSaveNotice("Saved.");
      qc.invalidateQueries({
        queryKey: ["/api/admin/newsroom/audience/gateway/alert-settings"],
      });
      qc.invalidateQueries({
        queryKey: ["/api/admin/newsroom/audience/gateway/alert-settings/audit-log"],
      });
    },
    onError: (e: any) => {
      setSaveNotice(null);
      setSaveError(e?.message ?? "save failed");
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/admin/newsroom/audience/gateway/alert-settings/reset", {}),
    onSuccess: () => {
      setSaveError(null);
      setSaveNotice("Reset to env / default.");
      qc.invalidateQueries({
        queryKey: ["/api/admin/newsroom/audience/gateway/alert-settings"],
      });
      qc.invalidateQueries({
        queryKey: ["/api/admin/newsroom/audience/gateway/alert-settings/audit-log"],
      });
    },
    onError: (e: any) => {
      setSaveNotice(null);
      setSaveError(e?.message ?? "reset failed");
    },
  });

  const handleSave = () => {
    if (!s) return;
    setSaveError(null);
    setSaveNotice(null);
    try {
      const payload = buildGatewayBlockAlertSettingsPayload({
        thresholdInput,
        windowSecInput,
        dedupMinInput,
        recoveryDerived,
        recoveryInput,
        autoPauseEnabledInput,
        autoPauseWindowsInput,
        limits: s.limits,
      });
      saveMutation.mutate(payload);
    } catch (e: any) {
      setSaveError(e?.message ?? "invalid input");
    }
  };

  return (
    <Card data-testid="card-gateway-alert-settings">
      <CardHeader>
        <CardTitle>Gateway block alert thresholds</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Controls when the founder is paged about a flood of
          <code className="mx-1">audience.gateway_send_blocked</code>
          events on a single platform. Saved here overrides the matching
          Replit Secret on the next event — no server restart needed.
        </p>

        {s ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded border p-3 text-xs space-y-1" data-testid="row-current-threshold">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Block threshold</span>
                {sourceBadge(s.thresholdSource)}
              </div>
              <div>
                <strong data-testid="text-current-threshold">{s.threshold}</strong> blocks
                per platform per window
              </div>
            </div>
            <div className="rounded border p-3 text-xs space-y-1" data-testid="row-current-window">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rolling window</span>
                {sourceBadge(s.windowMsSource)}
              </div>
              <div>
                <strong data-testid="text-current-window">{Math.round(s.windowMs / 1000)}</strong> seconds
              </div>
            </div>
            <div className="rounded border p-3 text-xs space-y-1" data-testid="row-current-dedup">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Dedup cooldown</span>
                {sourceBadge(s.dedupMsSource)}
              </div>
              <div>
                <strong data-testid="text-current-dedup">{Math.round(s.dedupMs / 60_000)}</strong> minutes
                {s.dedupMs === 0 && <span className="ml-1 text-muted-foreground">(disabled)</span>}
              </div>
            </div>
            <div className="rounded border p-3 text-xs space-y-1" data-testid="row-current-recovery">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Recovery threshold</span>
                {sourceBadge(s.recoverySource)}
              </div>
              <div>
                <strong data-testid="text-current-recovery">{s.effectiveRecovery}</strong> blocks
                {s.recoveryIsDerived && (
                  <span className="ml-1 text-muted-foreground">
                    (derived: floor(threshold / 2))
                  </span>
                )}
              </div>
            </div>
            <div className="rounded border p-3 text-xs space-y-1" data-testid="row-current-auto-pause">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Auto-pause connector</span>
                {sourceBadge(s.autoPauseEnabledSource)}
              </div>
              <div>
                <strong data-testid="text-current-auto-pause-enabled">
                  {s.autoPauseEnabled ? "On" : "Off"}
                </strong>
                <span className="ml-1 text-muted-foreground">
                  after{" "}
                  <strong data-testid="text-current-auto-pause-windows">
                    {s.autoPauseWindows}
                  </strong>{" "}
                  consecutive over-threshold window(s)
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">
              Threshold (blocks / window / platform)
            </span>
            <Input
              type="number"
              min={s?.limits.thresholdMin ?? 1}
              max={s?.limits.thresholdMax ?? 1000}
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              data-testid="input-alert-threshold"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Window (seconds)</span>
            <Input
              type="number"
              min={(s?.limits.windowMsMin ?? 1000) / 1000}
              max={(s?.limits.windowMsMax ?? 3_600_000) / 1000}
              value={windowSecInput}
              onChange={(e) => setWindowSecInput(e.target.value)}
              data-testid="input-alert-window-sec"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Dedup cooldown (minutes, 0 = disabled)</span>
            <Input
              type="number"
              min={(s?.limits.dedupMsMin ?? 0) / 60_000}
              max={(s?.limits.dedupMsMax ?? 86_400_000) / 60_000}
              value={dedupMinInput}
              onChange={(e) => setDedupMinInput(e.target.value)}
              data-testid="input-alert-dedup-min"
            />
          </label>
          <div className="text-xs space-y-1">
            <span className="text-muted-foreground">Recovery threshold</span>
            <label
              className="flex items-center gap-2 cursor-pointer"
              data-testid="label-recovery-derive"
            >
              <input
                type="checkbox"
                checked={recoveryDerived}
                onChange={(e) => setRecoveryDerived(e.target.checked)}
                data-testid="checkbox-recovery-derive"
              />
              <span>Derive from threshold (floor / 2)</span>
            </label>
            <Input
              type="number"
              min={s?.limits.recoveryMin ?? 0}
              max={s?.limits.recoveryMax ?? 1000}
              value={recoveryInput}
              disabled={recoveryDerived}
              onChange={(e) => setRecoveryInput(e.target.value)}
              data-testid="input-alert-recovery"
              placeholder={recoveryDerived ? "(derived)" : ""}
            />
          </div>
          <div className="text-xs space-y-1">
            <span className="text-muted-foreground">Auto-pause connector (opt-in)</span>
            <label
              className="flex items-center gap-2 cursor-pointer"
              data-testid="label-auto-pause-enabled"
            >
              <input
                type="checkbox"
                checked={autoPauseEnabledInput}
                onChange={(e) => setAutoPauseEnabledInput(e.target.checked)}
                data-testid="checkbox-auto-pause-enabled"
              />
              <span>
                Auto-flip platformSendApproved=false after N consecutive over-threshold
                windows
              </span>
            </label>
          </div>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">
              Consecutive windows before auto-pause
            </span>
            <Input
              type="number"
              min={s?.limits.autoPauseWindowsMin ?? 1}
              max={s?.limits.autoPauseWindowsMax ?? 100}
              value={autoPauseWindowsInput}
              disabled={!autoPauseEnabledInput}
              onChange={(e) => setAutoPauseWindowsInput(e.target.value)}
              data-testid="input-auto-pause-windows"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saveMutation.isPending || !s}
            data-testid="button-save-alert-settings"
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (!window.confirm("Clear admin overrides and fall back to env / defaults?")) return;
              resetMutation.mutate();
            }}
            disabled={resetMutation.isPending || !s}
            data-testid="button-reset-alert-settings"
          >
            {resetMutation.isPending ? "Resetting…" : "Reset to env / default"}
          </Button>
          {saveError && (
            <span className="text-xs text-destructive" data-testid="text-alert-settings-error">
              {saveError}
            </span>
          )}
          {saveNotice && !saveError && (
            <span className="text-xs text-muted-foreground" data-testid="text-alert-settings-notice">
              {saveNotice}
            </span>
          )}
        </div>

        {s && (
          <div className="text-[11px] text-muted-foreground space-y-1">
            <div>
              Defaults: threshold {s.defaults.threshold} · window{" "}
              {Math.round(s.defaults.windowMs / 1000)}s · dedup{" "}
              {Math.round(s.defaults.dedupMs / 60_000)}m · recovery floor(threshold / 2)
            </div>
            <div>
              Env fallback:{" "}
              threshold {s.envFallback.threshold ?? "—"} · window{" "}
              {s.envFallback.windowMs != null ? `${Math.round(s.envFallback.windowMs / 1000)}s` : "—"}{" "}
              · dedup{" "}
              {s.envFallback.dedupMs != null ? `${Math.round(s.envFallback.dedupMs / 60_000)}m` : "—"}{" "}
              · recovery {s.envFallback.recovery ?? "—"}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
