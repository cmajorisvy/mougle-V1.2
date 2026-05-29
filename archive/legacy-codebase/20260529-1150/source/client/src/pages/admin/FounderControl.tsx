import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Shield, ArrowLeft, AlertTriangle, Loader2,
  Gauge, Zap, Compass, Settings, FileText,
  AlertOctagon, Bot, Battery, Power, CheckCircle,
  Sliders, Radio, ExternalLink
} from "lucide-react";

function formatRelativeTime(ms: number | null | undefined): string {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function LiveBroadcastAlertsCard() {
  const [, navigate] = useLocation();
  const { data: alertsData, isLoading: alertsLoading } = useQuery({
    queryKey: ["founder-live-broadcast-alerts"],
    queryFn: () => api.admin.panicButton.alerts({ limit: 50 }),
    refetchInterval: 10000,
  });
  const { data: statusData } = useQuery({
    queryKey: ["founder-live-broadcast-status"],
    queryFn: () => api.admin.liveBroadcastAlert.status(),
    refetchInterval: 10000,
  });

  const openAlerts = (alertsData || []).filter(
    (a: any) => a.type === "broadcast_live_detected" && !a.acknowledged,
  );

  const ackMutation = useMutation({
    mutationFn: (id: string) => api.admin.panicButton.acknowledgeAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["founder-live-broadcast-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["founder-live-broadcast-status"] });
    },
  });

  const status = statusData?.status;
  const hasOpen = openAlerts.length > 0;

  return (
    <Card
      className={`mb-8 p-6 border-2 ${
        hasOpen ? "bg-amber-950/30 border-amber-700/50" : "bg-gray-900/60 border-gray-800/50"
      }`}
      data-testid="live-broadcast-alerts-card"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              hasOpen ? "bg-amber-500/30" : "bg-gray-800"
            }`}
          >
            <Radio className={`w-6 h-6 ${hasOpen ? "text-amber-400" : "text-gray-400"}`} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              Live Broadcast Alerts
              {hasOpen && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-200 font-bold uppercase tracking-wider"
                  data-testid="live-broadcast-alert-count"
                >
                  {openAlerts.length} open
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {hasOpen
                ? "Unacknowledged warnings from the scheduled live-broadcast scan."
                : "No unacknowledged live-broadcast warnings."}
            </p>
            <p className="text-[11px] text-gray-600 mt-1" data-testid="live-broadcast-last-scan">
              Last scan: {formatRelativeTime(status?.lastScanAt)}
              {status?.lastLiveCount != null && ` · live count ${status.lastLiveCount}`}
              {status?.threshold != null && ` · threshold ${status.threshold}`}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/admin/broadcast-preview")}
          className="border-gray-700 text-gray-300 hover:bg-gray-800"
          data-testid="button-open-broadcast-preview"
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Broadcast Preview
        </Button>
      </div>

      {alertsLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
        </div>
      ) : hasOpen ? (
        <div className="space-y-2">
          {openAlerts.map((alert: any) => {
            const details = alert.details || {};
            const liveCount = details.liveCount ?? "?";
            const threshold = details.threshold ?? status?.threshold ?? 0;
            return (
              <div
                key={alert.id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-900/80 border border-amber-900/30"
                data-testid={`live-broadcast-alert-${alert.id}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-amber-100 truncate">{alert.message}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    live count <span className="text-white font-medium">{liveCount}</span>
                    {" · threshold "}
                    <span className="text-white font-medium">{threshold}</span>
                    {" · "}
                    {formatRelativeTime(alert.createdAt ? new Date(alert.createdAt).getTime() : null)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-3 border-amber-700/50 text-amber-200 hover:bg-amber-900/40"
                  onClick={() => ackMutation.mutate(alert.id)}
                  disabled={ackMutation.isPending}
                  data-testid={`button-ack-live-broadcast-${alert.id}`}
                >
                  {ackMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Acknowledge
                    </>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
          <CheckCircle className="w-4 h-4 text-green-500/70" />
          All clear — no live broadcasts currently breach the threshold.
        </div>
      )}
    </Card>
  );
}

function useAdminAuth() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-verify"],
    queryFn: () => api.admin.verify(),
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!isLoading && (isError || !data?.valid)) {
      navigate("/admin/login");
    }
  }, [isLoading, isError, data, navigate]);

  return { isAuthenticated: !!data?.valid, isLoading };
}

const CATEGORY_ICONS: Record<string, any> = {
  growth: Gauge,
  intelligence: Compass,
  operations: Settings,
  content: FileText,
  safety: AlertOctagon,
};

const CATEGORY_COLORS: Record<string, string> = {
  growth: "text-green-400 bg-green-500/20",
  intelligence: "text-purple-400 bg-purple-500/20",
  operations: "text-blue-400 bg-blue-500/20",
  content: "text-yellow-400 bg-yellow-500/20",
  safety: "text-red-400 bg-red-500/20",
};

const CATEGORY_LABELS: Record<string, string> = {
  growth: "Growth & Promotion",
  intelligence: "AI Intelligence",
  operations: "Operations",
  content: "Content Policy",
  safety: "Safety Controls",
};

function SliderControl({
  config,
  localValue,
  onValueChange,
  onCommit,
  isPending,
}: {
  config: any;
  localValue: number;
  onValueChange: (v: number) => void;
  onCommit: () => void;
  isPending: boolean;
}) {
  const percentage = ((localValue - config.minValue) / (config.maxValue - config.minValue)) * 100;
  const isModified = localValue !== config.value;

  if (config.key === "emergency_stop") return null;

  return (
    <Card
      className="bg-gray-900/60 border-gray-800/50 p-5 hover:border-gray-700/50 transition-colors"
      data-testid={`control-${config.key}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">{config.label}</span>
          {isModified && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
              MODIFIED
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-white" data-testid={`value-${config.key}`}>
            {config.step >= 1 ? localValue : localValue.toFixed(2)}
          </span>
          {isModified && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] border-green-800 text-green-400 hover:bg-green-900/40"
              onClick={onCommit}
              disabled={isPending}
              data-testid={`apply-${config.key}`}
            >
              {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-3">{config.description}</p>
      <div className="relative">
        <input
          type="range"
          min={config.minValue}
          max={config.maxValue}
          step={config.step}
          value={localValue}
          onChange={(e) => onValueChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-gray-800 rounded-full appearance-none cursor-pointer accent-cyan-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-cyan-500/30"
          data-testid={`slider-${config.key}`}
        />
        <div
          className="absolute top-0 left-0 h-2 rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400 pointer-events-none"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-gray-600">{config.minValue}</span>
        <span className="text-[10px] text-gray-600">{config.maxValue}</span>
      </div>
    </Card>
  );
}

export default function FounderControl() {
  const { isAuthenticated, isLoading: authLoading } = useAdminAuth();
  const [, navigate] = useLocation();
  const [localValues, setLocalValues] = useState<Record<string, number>>({});

  const { data: configs, isLoading } = useQuery({
    queryKey: ["founder-configs"],
    queryFn: () => api.admin.founderControl.configs(),
    refetchInterval: 10000,
    enabled: isAuthenticated,
  });

  const { data: status } = useQuery({
    queryKey: ["founder-status"],
    queryFn: () => api.admin.founderControl.status(),
    refetchInterval: 5000,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (configs) {
      const initial: Record<string, number> = {};
      configs.forEach((c: any) => {
        if (localValues[c.key] === undefined) {
          initial[c.key] = c.value;
        }
      });
      if (Object.keys(initial).length > 0) {
        setLocalValues((prev) => ({ ...initial, ...prev }));
      }
    }
  }, [configs]);

  const updateMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: number }) =>
      api.admin.founderControl.updateConfig(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["founder-configs"] });
      queryClient.invalidateQueries({ queryKey: ["founder-status"] });
    },
  });

  const emergencyStopMutation = useMutation({
    mutationFn: () => api.admin.founderControl.emergencyStop(),
    onSuccess: () => {
      setLocalValues((prev) => ({ ...prev, emergency_stop: 1 }));
      queryClient.invalidateQueries({ queryKey: ["founder-configs"] });
      queryClient.invalidateQueries({ queryKey: ["founder-status"] });
    },
  });

  const emergencyReleaseMutation = useMutation({
    mutationFn: () => api.admin.founderControl.emergencyRelease(),
    onSuccess: () => {
      setLocalValues((prev) => ({ ...prev, emergency_stop: 0 }));
      queryClient.invalidateQueries({ queryKey: ["founder-configs"] });
      queryClient.invalidateQueries({ queryKey: ["founder-status"] });
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  const isEmergencyStopped = status?.emergencyStopped || false;

  const grouped: Record<string, any[]> = {};
  (configs || []).forEach((c: any) => {
    if (!grouped[c.category]) grouped[c.category] = [];
    grouped[c.category].push(c);
  });

  const categoryOrder = ["growth", "intelligence", "operations", "content", "safety"];

  return (
    <div className="min-h-screen bg-gray-950">
      {isEmergencyStopped && (
        <div className="bg-red-900/80 border-b border-red-700 px-4 py-3 flex items-center justify-center gap-3" data-testid="emergency-banner">
          <AlertTriangle className="w-5 h-5 text-red-300 animate-pulse" />
          <span className="text-red-200 font-medium text-sm">
            EMERGENCY STOP ACTIVE — All automated systems are paused
          </span>
          <AlertTriangle className="w-5 h-5 text-red-300 animate-pulse" />
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/admin")}
              className="text-gray-400 hover:text-white"
              data-testid="button-back-admin"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Admin
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white" data-testid="heading-founder-control">Founder Control Layer</h1>
                <p className="text-xs text-gray-500">Platform-wide AI behavior management</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/admin/safe-mode")}
              className="border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/10"
            >
              Safe Mode
            </Button>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
              isEmergencyStopped
                ? "bg-red-500/20 text-red-400"
                : "bg-green-500/20 text-green-400"
            }`} data-testid="system-status">
              {isEmergencyStopped ? (
                <>
                  <Power className="w-3 h-3" /> SYSTEMS PAUSED
                </>
              ) : (
                <>
                  <CheckCircle className="w-3 h-3" /> SYSTEMS ACTIVE
                </>
              )}
            </div>
          </div>
        </div>

        <Card className={`mb-8 p-6 border-2 ${
          isEmergencyStopped
            ? "bg-red-950/40 border-red-800/60"
            : "bg-gray-900/60 border-gray-800/50"
        }`} data-testid="emergency-control-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isEmergencyStopped ? "bg-red-500/30" : "bg-gray-800"
              }`}>
                <AlertOctagon className={`w-6 h-6 ${isEmergencyStopped ? "text-red-400" : "text-gray-400"}`} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Emergency Stop</h2>
                <p className="text-xs text-gray-500">
                  {isEmergencyStopped
                    ? "All automated pipelines, AI agents, and scheduled workers are paused."
                    : "Instantly pause all automated systems. Use in case of unexpected behavior."}
                </p>
              </div>
            </div>
            {isEmergencyStopped ? (
              <Button
                onClick={() => emergencyReleaseMutation.mutate()}
                disabled={emergencyReleaseMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white px-6"
                data-testid="button-emergency-release"
              >
                {emergencyReleaseMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Power className="w-4 h-4 mr-2" />
                )}
                Release & Resume
              </Button>
            ) : (
              <Button
                onClick={() => {
                  if (window.confirm("Are you sure you want to activate the emergency stop? This will pause ALL automated systems immediately.")) {
                    emergencyStopMutation.mutate();
                  }
                }}
                disabled={emergencyStopMutation.isPending}
                variant="destructive"
                className="bg-red-600 hover:bg-red-700 px-6"
                data-testid="button-emergency-stop"
              >
                {emergencyStopMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <AlertOctagon className="w-4 h-4 mr-2" />
                )}
                Emergency Stop
              </Button>
            )}
          </div>
        </Card>

        <LiveBroadcastAlertsCard />

        {categoryOrder.map((category) => {
          const items = grouped[category];
          if (!items || items.length === 0) return null;
          const Icon = CATEGORY_ICONS[category] || Sliders;
          const colorClass = CATEGORY_COLORS[category] || "text-gray-400 bg-gray-500/20";
          const label = CATEGORY_LABELS[category] || category;

          return (
            <div key={category} className="mb-8" data-testid={`category-${category}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClass}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">{label}</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {items.map((config: any) => (
                  <SliderControl
                    key={config.key}
                    config={config}
                    localValue={localValues[config.key] ?? config.value}
                    onValueChange={(v) => setLocalValues((prev) => ({ ...prev, [config.key]: v }))}
                    onCommit={() => updateMutation.mutate({ key: config.key, value: localValues[config.key] })}
                    isPending={updateMutation.isPending}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {status?.config && (
          <Card className="bg-gray-900/60 border-gray-800/50 p-5 mt-4" data-testid="live-config-summary">
            <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" /> Live Configuration Summary
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(status.config)
                .filter(([key]) => key !== "emergency_stop")
                .map(([key, val]) => (
                  <div key={key} className="bg-gray-800/50 rounded-lg p-3">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                      {key.replace(/_/g, " ")}
                    </p>
                    <p className="text-lg font-bold text-white mt-0.5">
                      {typeof val === "number" ? (val as number).toFixed(2) : String(val)}
                    </p>
                  </div>
                ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
