import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Shield, ArrowLeft, AlertTriangle, Loader2,
  Activity, Radio, Eye, Zap, Power,
  CheckCircle, XCircle, Clock, Brain,
  ToggleLeft, ToggleRight, AlertOctagon,
  ShieldAlert, ShieldCheck, RefreshCw, Scan,
  TrendingUp, MessageSquare, Swords, Megaphone,
  DollarSign, Users
} from "lucide-react";

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

const SEVERITY_COLORS: Record<string, string> = {
  HIGH: "bg-red-500/20 text-red-400 border-red-500/30",
  MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  LOW: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const METRIC_ICONS: Record<string, any> = {
  posting_frequency: TrendingUp,
  engagement_velocity: MessageSquare,
  debate_creation_rate: Swords,
  promotion_rate: Megaphone,
  ai_usage_cost: DollarSign,
  traffic_spikes: Users,
};

const METRIC_LABELS: Record<string, string> = {
  posting_frequency: "Posting Frequency",
  engagement_velocity: "Engagement Velocity",
  debate_creation_rate: "Debate Creation",
  promotion_rate: "Promotion Rate",
  ai_usage_cost: "AI Usage Cost",
  traffic_spikes: "Traffic",
};

function SystemHealthBanner({ health }: { health: any }) {
  if (!health) return null;

  const { policy, systemHealthy, founderControl, pendingDecisionCount, openAnomalyCount } = health;

  const isKillSwitch = policy?.killSwitch;
  const isSafeMode = policy?.safeMode;
  const isFounderMode = policy?.mode === "founder";
  const isEmergencyStopped = founderControl?.emergencyStopped;

  let bannerClass = "border-green-500/30 bg-green-500/10";
  let bannerIcon = <ShieldCheck className="w-5 h-5 text-green-400" />;
  let bannerText = "All Systems Operational — Autopilot Mode";

  if (isKillSwitch || isEmergencyStopped) {
    bannerClass = "border-red-500/30 bg-red-500/10";
    bannerIcon = <AlertOctagon className="w-5 h-5 text-red-400 animate-pulse" />;
    bannerText = "KILL SWITCH ACTIVE — All Automation Halted";
  } else if (isSafeMode) {
    bannerClass = "border-yellow-500/30 bg-yellow-500/10";
    bannerIcon = <ShieldAlert className="w-5 h-5 text-yellow-400" />;
    bannerText = "Safe Mode — Critical Actions Require Approval";
  } else if (isFounderMode) {
    bannerClass = "border-purple-500/30 bg-purple-500/10";
    bannerIcon = <Eye className="w-5 h-5 text-purple-400" />;
    bannerText = "Founder Mode — Manual Oversight Active";
  } else if (!systemHealthy) {
    bannerClass = "border-orange-500/30 bg-orange-500/10";
    bannerIcon = <AlertTriangle className="w-5 h-5 text-orange-400" />;
    bannerText = "Anomalies Detected — Review Required";
  }

  return (
    <div data-testid="system-health-banner" className={`border rounded-lg p-4 flex items-center justify-between ${bannerClass}`}>
      <div className="flex items-center gap-3">
        {bannerIcon}
        <span className="font-semibold text-sm">{bannerText}</span>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <span data-testid="text-pending-count" className="text-zinc-400">
          {pendingDecisionCount} pending decision{pendingDecisionCount !== 1 ? 's' : ''}
        </span>
        <span data-testid="text-anomaly-count" className="text-zinc-400">
          {openAnomalyCount} open alert{openAnomalyCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

function ModeToggle({ policy, onUpdate }: { policy: any; onUpdate: (data: any) => void }) {
  const mode = policy?.mode || "autopilot";
  const isAutopilot = mode === "autopilot";

  return (
    <Card className="bg-zinc-900/80 border-zinc-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <Radio className="w-4 h-4 text-cyan-400" />
          Operating Mode
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          data-testid="button-autopilot-mode"
          onClick={() => onUpdate({ mode: "autopilot" })}
          className={`p-4 rounded-lg border text-left transition-all ${
            isAutopilot
              ? "border-cyan-500/50 bg-cyan-500/10 shadow-lg shadow-cyan-500/5"
              : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <ToggleRight className={`w-5 h-5 ${isAutopilot ? "text-cyan-400" : "text-zinc-500"}`} />
            <span className={`font-semibold text-sm ${isAutopilot ? "text-cyan-300" : "text-zinc-400"}`}>
              Autopilot
            </span>
          </div>
          <p className="text-xs text-zinc-500">AI operates freely. Auto-escalates on HIGH anomalies.</p>
        </button>
        <button
          data-testid="button-founder-mode"
          onClick={() => onUpdate({ mode: "founder" })}
          className={`p-4 rounded-lg border text-left transition-all ${
            !isAutopilot
              ? "border-purple-500/50 bg-purple-500/10 shadow-lg shadow-purple-500/5"
              : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Eye className={`w-5 h-5 ${!isAutopilot ? "text-purple-400" : "text-zinc-500"}`} />
            <span className={`font-semibold text-sm ${!isAutopilot ? "text-purple-300" : "text-zinc-400"}`}>
              Founder Mode
            </span>
          </div>
          <p className="text-xs text-zinc-500">AI requests approval for all critical actions.</p>
        </button>
      </div>
    </Card>
  );
}

function SafetyControls({ policy, health, onKillSwitch, onReleaseKillSwitch, onSafeMode }: {
  policy: any; health: any; onKillSwitch: () => void; onReleaseKillSwitch: () => void; onSafeMode: (enabled: boolean) => void;
}) {
  const isKillSwitch = policy?.killSwitch;
  const isSafeMode = policy?.safeMode;

  return (
    <Card className="bg-zinc-900/80 border-zinc-800 p-6">
      <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4 text-red-400" />
        Safety Controls
      </h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-700 bg-zinc-800/50">
          <div>
            <div className="font-medium text-sm text-zinc-200">Kill Switch</div>
            <div className="text-xs text-zinc-500">Halt ALL automated systems immediately</div>
          </div>
          {isKillSwitch ? (
            <Button data-testid="button-release-kill-switch" size="sm" variant="outline"
              className="border-green-500/50 text-green-400 hover:bg-green-500/10" onClick={onReleaseKillSwitch}>
              <Power className="w-3 h-3 mr-1" /> Release
            </Button>
          ) : (
            <Button data-testid="button-kill-switch" size="sm" variant="destructive" onClick={onKillSwitch}>
              <AlertOctagon className="w-3 h-3 mr-1" /> Activate
            </Button>
          )}
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-700 bg-zinc-800/50">
          <div>
            <div className="font-medium text-sm text-zinc-200">Safe Mode</div>
            <div className="text-xs text-zinc-500">Require approval for critical actions only</div>
          </div>
          <Button data-testid="button-safe-mode" size="sm"
            variant={isSafeMode ? "outline" : "secondary"}
            className={isSafeMode ? "border-yellow-500/50 text-yellow-400" : ""}
            onClick={() => onSafeMode(!isSafeMode)}>
            {isSafeMode ? (
              <><ToggleRight className="w-3 h-3 mr-1" /> On</>
            ) : (
              <><ToggleLeft className="w-3 h-3 mr-1" /> Off</>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function MetricsGrid({ metrics }: { metrics: any[] }) {
  if (!metrics || metrics.length === 0) {
    return (
      <Card className="bg-zinc-900/80 border-zinc-800 p-6">
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-cyan-400" />
          Activity Metrics
        </h3>
        <p className="text-xs text-zinc-500">No metrics collected yet. Run a scan to start monitoring.</p>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900/80 border-zinc-800 p-6">
      <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-cyan-400" />
        Activity Metrics
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {metrics.map((m: any) => {
          const Icon = METRIC_ICONS[m.metric_key || m.metricKey] || Activity;
          const label = METRIC_LABELS[m.metric_key || m.metricKey] || m.metric_key || m.metricKey;
          return (
            <div key={m.metric_key || m.metricKey} data-testid={`metric-${m.metric_key || m.metricKey}`}
              className="p-3 rounded-lg border border-zinc-700 bg-zinc-800/50">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-xs text-zinc-400">{label}</span>
              </div>
              <div className="text-lg font-bold text-zinc-100">{Number(m.value).toFixed(1)}</div>
              <div className="text-xs text-zinc-600">window: {m.window || "1h"}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function AlertsList({ alerts, onAcknowledge, onResolve }: {
  alerts: any[]; onAcknowledge: (id: number) => void; onResolve: (id: number) => void;
}) {
  return (
    <Card className="bg-zinc-900/80 border-zinc-800 p-6">
      <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-4">
        <AlertTriangle className="w-4 h-4 text-yellow-400" />
        Anomaly Alerts
      </h3>
      {(!alerts || alerts.length === 0) ? (
        <div className="text-center py-8 text-zinc-500 text-sm">
          <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-green-500/40" />
          No anomalies detected. System operating normally.
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {alerts.map((alert: any) => (
            <div key={alert.id} data-testid={`alert-${alert.id}`}
              className={`p-3 rounded-lg border ${SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.LOW}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-black/30">{alert.severity}</span>
                  <span className="text-xs font-medium">{METRIC_LABELS[alert.metric_key || alert.metricKey] || alert.metric_key || alert.metricKey}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-black/20">{alert.status}</span>
                </div>
              </div>
              <p className="text-xs opacity-80 mb-2">{alert.message}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs opacity-50">
                  {alert.detected_at || alert.detectedAt ? new Date(alert.detected_at || alert.detectedAt).toLocaleString() : ""}
                </span>
                {alert.status === "open" && (
                  <div className="flex gap-1">
                    <Button data-testid={`button-ack-alert-${alert.id}`} size="sm" variant="ghost"
                      className="h-6 text-xs" onClick={() => onAcknowledge(alert.id)}>
                      Acknowledge
                    </Button>
                    <Button data-testid={`button-resolve-alert-${alert.id}`} size="sm" variant="ghost"
                      className="h-6 text-xs" onClick={() => onResolve(alert.id)}>
                      Resolve
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function DecisionsList({ decisions, onApprove, onReject }: {
  decisions: any[]; onApprove: (id: number) => void; onReject: (id: number) => void;
}) {
  const pending = decisions?.filter((d: any) => d.status === "pending") || [];
  const resolved = decisions?.filter((d: any) => d.status !== "pending") || [];

  return (
    <Card className="bg-zinc-900/80 border-zinc-800 p-6">
      <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-4">
        <Brain className="w-4 h-4 text-purple-400" />
        Pending Decisions
        {pending.length > 0 && (
          <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full">{pending.length}</span>
        )}
      </h3>
      {pending.length === 0 ? (
        <div className="text-center py-6 text-zinc-500 text-sm">
          <CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-500/40" />
          No decisions pending. AI is operating within bounds.
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((d: any) => {
            let context: any = {};
            try { context = JSON.parse(d.context || "{}"); } catch {}
            return (
              <div key={d.id} data-testid={`decision-${d.id}`}
                className="p-4 rounded-lg border border-purple-500/20 bg-purple-500/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-purple-300">
                    {(d.action_key || d.actionKey || "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                  </span>
                  <span className="text-xs text-zinc-500">
                    <Clock className="w-3 h-3 inline mr-1" />
                    {d.requested_at || d.requestedAt ? new Date(d.requested_at || d.requestedAt).toLocaleString() : ""}
                  </span>
                </div>
                {(d.ai_recommendation || d.aiRecommendation) && (
                  <div className="p-2 rounded bg-zinc-800/80 border border-zinc-700 mb-3">
                    <div className="flex items-center gap-1 mb-1">
                      <Brain className="w-3 h-3 text-cyan-400" />
                      <span className="text-xs font-medium text-cyan-400">AI Recommendation</span>
                    </div>
                    <p className="text-xs text-zinc-300">{d.ai_recommendation || d.aiRecommendation}</p>
                  </div>
                )}
                {context.severity && (
                  <div className="text-xs text-zinc-500 mb-2">
                    Severity: <span className={`font-bold ${context.severity === "HIGH" ? "text-red-400" : "text-yellow-400"}`}>{context.severity}</span>
                    {context.metricKey && <> | Metric: {METRIC_LABELS[context.metricKey] || context.metricKey}</>}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button data-testid={`button-approve-${d.id}`} size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white" onClick={() => onApprove(d.id)}>
                    <CheckCircle className="w-3 h-3 mr-1" /> Approve
                  </Button>
                  <Button data-testid={`button-reject-${d.id}`} size="sm" variant="destructive" onClick={() => onReject(d.id)}>
                    <XCircle className="w-3 h-3 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {resolved.length > 0 && (
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <h4 className="text-xs font-medium text-zinc-500 mb-2">Recent Resolved ({resolved.length})</h4>
          <div className="space-y-1">
            {resolved.slice(0, 5).map((d: any) => (
              <div key={d.id} className="flex items-center justify-between text-xs text-zinc-500 py-1">
                <span>{(d.action_key || d.actionKey || "").replace(/_/g, " ")}</span>
                <span className={d.status === "approved" ? "text-green-500" : "text-red-500"}>
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function CommandCenter() {
  const { isAuthenticated, isLoading: authLoading } = useAdminAuth();
  const [, navigate] = useLocation();

  const healthQuery = useQuery({
    queryKey: ["command-center-health"],
    queryFn: () => api.admin.commandCenter.health(),
    refetchInterval: 10000,
    enabled: isAuthenticated,
  });

  const alertsQuery = useQuery({
    queryKey: ["command-center-alerts"],
    queryFn: () => api.admin.commandCenter.alerts(),
    refetchInterval: 15000,
    enabled: isAuthenticated,
  });

  const decisionsQuery = useQuery({
    queryKey: ["command-center-decisions"],
    queryFn: () => api.admin.commandCenter.decisions(),
    refetchInterval: 10000,
    enabled: isAuthenticated,
  });

  const policyMutation = useMutation({
    mutationFn: (data: any) => api.admin.commandCenter.updatePolicy(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["command-center-health"] });
    },
  });

  const killSwitchMutation = useMutation({
    mutationFn: () => api.admin.commandCenter.killSwitch(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["command-center-health"] });
    },
  });

  const releaseKillSwitchMutation = useMutation({
    mutationFn: () => api.admin.commandCenter.releaseKillSwitch(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["command-center-health"] });
    },
  });

  const safeModeMutation = useMutation({
    mutationFn: (enabled: boolean) => api.admin.commandCenter.safeMode(enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["command-center-health"] });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: number) => api.admin.commandCenter.acknowledgeAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["command-center-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["command-center-health"] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) => api.admin.commandCenter.resolveAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["command-center-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["command-center-health"] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => api.admin.commandCenter.approveDecision(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["command-center-decisions"] });
      queryClient.invalidateQueries({ queryKey: ["command-center-health"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => api.admin.commandCenter.rejectDecision(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["command-center-decisions"] });
      queryClient.invalidateQueries({ queryKey: ["command-center-health"] });
    },
  });

  const scanMutation = useMutation({
    mutationFn: () => api.admin.commandCenter.scan(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["command-center-health"] });
      queryClient.invalidateQueries({ queryKey: ["command-center-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["command-center-decisions"] });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const health = healthQuery.data;
  const policy = health?.policy;
  const metrics = health?.metrics || [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button data-testid="button-back" variant="ghost" size="sm" onClick={() => navigate("/admin/dashboard")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 data-testid="text-page-title" className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                Founder Command Center
              </h1>
              <p className="text-xs text-zinc-500">Autopilot vs Founder Mode — Supervised Autonomy</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/10" onClick={() => navigate("/admin/safe-mode")}>
              Safe Mode
            </Button>
            <Button data-testid="button-scan" size="sm" variant="outline"
              className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}>
              {scanMutation.isPending ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Scan className="w-3 h-3 mr-1" />
              )}
              Run Scan
            </Button>
            <Button data-testid="button-refresh" size="sm" variant="ghost" onClick={() => {
              healthQuery.refetch();
              alertsQuery.refetch();
              decisionsQuery.refetch();
            }}>
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <SystemHealthBanner health={health} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          <div className="lg:col-span-1 space-y-4">
            <ModeToggle policy={policy} onUpdate={(data) => policyMutation.mutate(data)} />
            <SafetyControls
              policy={policy}
              health={health}
              onKillSwitch={() => killSwitchMutation.mutate()}
              onReleaseKillSwitch={() => releaseKillSwitchMutation.mutate()}
              onSafeMode={(enabled) => safeModeMutation.mutate(enabled)}
            />
          </div>
          <div className="lg:col-span-2 space-y-4">
            <MetricsGrid metrics={metrics} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AlertsList
                alerts={alertsQuery.data || []}
                onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
                onResolve={(id) => resolveMutation.mutate(id)}
              />
              <DecisionsList
                decisions={decisionsQuery.data || []}
                onApprove={(id) => approveMutation.mutate(id)}
                onReject={(id) => rejectMutation.mutate(id)}
              />
            </div>
          </div>
        </div>

        {scanMutation.data && (
          <Card className="bg-zinc-900/80 border-zinc-800 p-4 mt-4">
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-2">
              <Scan className="w-4 h-4 text-cyan-400" />
              Last Scan Results
            </h3>
            <div className="flex items-center gap-4 text-xs text-zinc-400">
              <span>{scanMutation.data.metricsCollected} metrics collected</span>
              <span>{scanMutation.data.anomaliesDetected} anomalies detected</span>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
