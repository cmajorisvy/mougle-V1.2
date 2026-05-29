import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, ArrowLeft, AlertTriangle, Loader2,
  Activity, DollarSign, Eye, Globe, Scale,
  CheckCircle, Clock, Download, Trash2,
  Zap, Lock, Server, TrendingUp, Settings,
  Database, ShieldCheck, ToggleLeft, ToggleRight
} from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";

async function adminGet(url: string) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

async function adminPost(url: string, body?: any) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}


const CATEGORY_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  technical: { icon: Activity, color: "text-blue-400 bg-blue-500/20", label: "Technical" },
  economic: { icon: DollarSign, color: "text-green-400 bg-green-500/20", label: "Economic" },
  privacy: { icon: Eye, color: "text-purple-400 bg-purple-500/20", label: "Privacy" },
  ecosystem: { icon: Globe, color: "text-yellow-400 bg-yellow-500/20", label: "Ecosystem" },
  legal: { icon: Scale, color: "text-red-400 bg-red-500/20", label: "Legal" },
};

const STATUS_STYLES: Record<string, string> = {
  healthy: "bg-green-500/20 text-green-400 border-green-500/30",
  warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
};

type TabId = "overview" | "gateway" | "memory" | "mitigations" | "audit" | "data-requests";

const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: "overview", label: "Risk Overview", icon: Shield },
  { id: "gateway", label: "AI Gateway", icon: Server },
  { id: "memory", label: "Memory Isolation", icon: Lock },
  { id: "mitigations", label: "Mitigations", icon: Settings },
  { id: "audit", label: "Audit Logs", icon: Activity },
  { id: "data-requests", label: "Data Requests", icon: Download },
];

export default function RiskControlCenter() {
  const { isLoading: authLoading, isAuthenticated } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["risk-dashboard"],
    queryFn: () => adminGet("/api/risk/dashboard"),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const { data: auditLogs } = useQuery({
    queryKey: ["risk-audit-logs"],
    queryFn: () => adminGet("/api/risk/audit-logs?limit=50"),
    enabled: isAuthenticated && activeTab === "audit",
  });

  const { data: dataRequests } = useQuery({
    queryKey: ["risk-data-requests"],
    queryFn: () => adminGet("/api/risk/data-requests"),
    enabled: isAuthenticated && activeTab === "data-requests",
  });

  const snapshotMutation = useMutation({
    mutationFn: () => adminPost("/api/risk/snapshot"),
    onSuccess: () => {
      toast({ title: "Snapshot created" });
      queryClient.invalidateQueries({ queryKey: ["risk-dashboard"] });
    },
  });

  const processExportMutation = useMutation({
    mutationFn: (id: string) => adminPost(`/api/risk/process-export/${id}`),
    onSuccess: () => {
      toast({ title: "Export processed" });
      queryClient.invalidateQueries({ queryKey: ["risk-data-requests"] });
    },
  });

  const processDeletionMutation = useMutation({
    mutationFn: (id: string) => adminPost(`/api/risk/process-deletion/${id}`),
    onSuccess: () => {
      toast({ title: "Deletion processed" });
      queryClient.invalidateQueries({ queryKey: ["risk-data-requests"] });
    },
  });

  const mitigationMutation = useMutation({
    mutationFn: ({ id, enabled, threshold }: { id: string; enabled?: boolean; threshold?: number }) =>
      adminPost(`/api/risk/mitigations/${id}`, { enabled, threshold }),
    onSuccess: () => {
      toast({ title: "Mitigation updated" });
      queryClient.invalidateQueries({ queryKey: ["risk-dashboard"] });
    },
  });

  if (authLoading || isLoading) {
    return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-purple-400" /></div>;
  }
  if (!isAuthenticated) return null;

  const overview = dashboard?.overview;
  const gatewayHealth = dashboard?.gatewayHealth;
  const memoryIsolation = dashboard?.memoryIsolation;
  const mitigations = dashboard?.mitigations || [];
  const trends = dashboard?.trends || [];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} data-testid="button-back-admin">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg"><Shield className="w-6 h-6 text-red-400" /></div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-risk-title">Risk Control Center</h1>
              <p className="text-sm text-gray-400">Platform Risk Management Framework</p>
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => snapshotMutation.mutate()} disabled={snapshotMutation.isPending} data-testid="button-take-snapshot">
              {snapshotMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Take Snapshot"}
            </Button>
          </div>
        </div>

        {overview && (
          <div className="mb-6">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border ${STATUS_STYLES[overview.overallStatus] || STATUS_STYLES.healthy}`} data-testid="text-overall-risk">
              {overview.overallStatus === "critical" || overview.overallStatus === "warning"
                ? <AlertTriangle className="w-5 h-5" />
                : <CheckCircle className="w-5 h-5" />}
              <span className="font-semibold">Overall Risk: {overview.overallScore}/100</span>
              <span className="capitalize">({overview.overallStatus})</span>
            </div>
          </div>
        )}

        <div className="flex gap-1 mb-6 border-b border-gray-800 pb-2 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} data-testid={`tab-${tab.id}`}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.id ? "bg-white/10 text-white" : "text-gray-400 hover:text-gray-200"}`}>
                <Icon className="w-3.5 h-3.5" /> {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "overview" && overview && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
              {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
                const Icon = config.icon;
                const score = overview.categoryScores?.[key] || 0;
                const status = score > 60 ? "critical" : score > 30 ? "warning" : "healthy";
                return (
                  <Card key={key} className="bg-[#12121a] border-gray-800 p-4" data-testid={`card-risk-${key}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`p-1.5 rounded ${config.color}`}><Icon className="w-4 h-4" /></div>
                      <span className="text-sm font-medium text-gray-300">{config.label}</span>
                    </div>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold">{score}</span>
                      <span className="text-xs text-gray-400 mb-1">/100</span>
                    </div>
                    <div className={`mt-2 text-xs px-2 py-0.5 rounded inline-block ${STATUS_STYLES[status]}`}>{status}</div>
                  </Card>
                );
              })}
            </div>

            {trends.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-blue-400" /> Risk Trends</h3>
                <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-risk-trends">
                  <div className="flex items-end gap-1 h-32">
                    {trends.map((t: any, i: number) => {
                      const height = Math.max(4, (t.overall / 100) * 100);
                      const color = t.overall > 60 ? "bg-red-500" : t.overall > 30 ? "bg-yellow-500" : "bg-green-500";
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1" data-testid={`trend-bar-${i}`}>
                          <span className="text-[10px] text-gray-500">{Math.round(t.overall)}</span>
                          <div className={`w-full rounded-t ${color}`} style={{ height: `${height}%` }} />
                          <span className="text-[9px] text-gray-600">{new Date(t.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>
            )}

            <h3 className="text-lg font-semibold mb-4">Risk Indicators</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {overview.indicators?.map((ind: any, i: number) => {
                const config = CATEGORY_CONFIG[ind.category];
                const Icon = config?.icon || Activity;
                return (
                  <Card key={i} className="bg-[#12121a] border-gray-800 p-4" data-testid={`indicator-${ind.name.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium">{ind.name}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[ind.status]}`}>{ind.status}</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold">{ind.value}</span>
                      {ind.threshold > 0 && <span className="text-xs text-gray-500">threshold: {ind.threshold}</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{ind.description}</p>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {activeTab === "gateway" && gatewayHealth && (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`px-3 py-1.5 rounded-lg text-sm font-medium ${STATUS_STYLES[gatewayHealth.status]}`} data-testid="text-gateway-status">
                Gateway: {gatewayHealth.status}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Requests", value: gatewayHealth.metrics.totalRequests, icon: Zap, color: "text-blue-400" },
                { label: "Failed Requests", value: gatewayHealth.metrics.failedRequests, icon: AlertTriangle, color: "text-red-400" },
                { label: "Fail Rate", value: `${gatewayHealth.metrics.failRate}%`, icon: Activity, color: "text-orange-400" },
                { label: "Tokens Used", value: gatewayHealth.metrics.totalTokensUsed.toLocaleString(), icon: Database, color: "text-purple-400" },
                { label: "Credits Charged", value: gatewayHealth.metrics.totalCreditsCharged, icon: DollarSign, color: "text-green-400" },
                { label: "Credit Blocks", value: gatewayHealth.metrics.blockedByCredits, icon: DollarSign, color: "text-yellow-400" },
                { label: "Rate Limit Blocks", value: gatewayHealth.metrics.blockedByRateLimit, icon: Clock, color: "text-orange-400" },
                { label: "Active Chains", value: gatewayHealth.metrics.activeChains, icon: Activity, color: "text-cyan-400" },
              ].map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <Card key={i} className="bg-[#12121a] border-gray-800 p-4" data-testid={`gateway-stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`w-4 h-4 ${stat.color}`} />
                      <span className="text-xs text-gray-400">{stat.label}</span>
                    </div>
                    <span className="text-xl font-bold">{stat.value}</span>
                  </Card>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-rate-limits">
                <h4 className="text-sm font-semibold mb-3 text-gray-300">Rate Limits</h4>
                <div className="space-y-2">
                  {Object.entries(gatewayHealth.limits.rateLimits).map(([key, limits]: [string, any]) => (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="text-gray-400 capitalize">{key}</span>
                      <span className="text-white">{limits.perMinute}/min, {limits.perHour}/hr</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-cost-config">
                <h4 className="text-sm font-semibold mb-3 text-gray-300">Cost per Model</h4>
                <div className="space-y-2">
                  {Object.entries(gatewayHealth.costConfig.costPerModel).map(([model, cost]: [string, any]) => (
                    <div key={model} className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">{model}</span>
                      <span className="text-white">{cost} credits</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-action-costs">
              <h4 className="text-sm font-semibold mb-3 text-gray-300">Action Costs</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {Object.entries(gatewayHealth.costConfig.actionCosts).map(([action, cost]: [string, any]) => (
                  <div key={action} className="flex items-center justify-between p-2 bg-gray-900/50 rounded text-sm">
                    <span className="text-gray-400 capitalize">{action.replace(/_/g, ' ')}</span>
                    <span className="text-white font-medium">{cost}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {activeTab === "memory" && memoryIsolation && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="stat-total-vaults">
                <div className="flex items-center gap-2 mb-2"><Lock className="w-4 h-4 text-purple-400" /><span className="text-xs text-gray-400">Total Vaults</span></div>
                <span className="text-2xl font-bold">{memoryIsolation.vaults.total}</span>
              </Card>
              <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="stat-active-vaults">
                <div className="flex items-center gap-2 mb-2"><ShieldCheck className="w-4 h-4 text-green-400" /><span className="text-xs text-gray-400">Active Vaults</span></div>
                <span className="text-2xl font-bold">{memoryIsolation.vaults.active}</span>
              </Card>
              <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="stat-total-violations">
                <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-red-400" /><span className="text-xs text-gray-400">Violations</span></div>
                <span className="text-2xl font-bold">{memoryIsolation.violations.total}</span>
              </Card>
              <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="stat-unresolved">
                <div className="flex items-center gap-2 mb-2"><Clock className="w-4 h-4 text-yellow-400" /><span className="text-xs text-gray-400">Unresolved</span></div>
                <span className="text-2xl font-bold">{memoryIsolation.violations.unresolved}</span>
              </Card>
            </div>

            <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-mode-distribution">
              <h4 className="text-sm font-semibold mb-4 text-gray-300">Privacy Mode Distribution</h4>
              <div className="grid grid-cols-4 gap-3">
                {Object.entries(memoryIsolation.vaults.modeDistribution).map(([mode, count]: [string, any]) => {
                  const colors: Record<string, string> = {
                    ultra_private: "bg-red-500/20 text-red-400 border-red-500/30",
                    personal: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                    collaborative: "bg-blue-500/20 text-blue-400 border-blue-500/30",
                    open: "bg-green-500/20 text-green-400 border-green-500/30",
                  };
                  return (
                    <div key={mode} className={`p-3 rounded-lg border ${colors[mode] || "border-gray-700"}`}>
                      <div className="text-2xl font-bold">{count}</div>
                      <div className="text-xs capitalize mt-1">{mode.replace(/_/g, ' ')}</div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-severity-breakdown">
              <h4 className="text-sm font-semibold mb-4 text-gray-300">Violation Severity</h4>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Critical", count: memoryIsolation.violations.severity?.critical || 0, color: "bg-red-500" },
                  { label: "High", count: memoryIsolation.violations.severity?.high || 0, color: "bg-orange-500" },
                  { label: "Medium", count: memoryIsolation.violations.severity?.medium || 0, color: "bg-yellow-500" },
                  { label: "Low", count: memoryIsolation.violations.severity?.low || 0, color: "bg-blue-500" },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2 p-2 bg-gray-900/50 rounded">
                    <div className={`w-3 h-3 rounded-full ${s.color}`} />
                    <span className="text-sm text-gray-300">{s.label}: <span className="font-bold text-white">{s.count}</span></span>
                  </div>
                ))}
              </div>
            </Card>

            {memoryIsolation.violations.recent?.length > 0 && (
              <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-recent-violations">
                <h4 className="text-sm font-semibold mb-3 text-gray-300">Recent Violations</h4>
                <div className="space-y-2">
                  {memoryIsolation.violations.recent.map((v: any, i: number) => (
                    <div key={v.id || i} className="p-3 bg-gray-900/50 rounded-lg flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${v.severity === "critical" ? "bg-red-500" : v.severity === "high" ? "bg-orange-500" : "bg-yellow-500"}`} />
                      <div className="flex-1">
                        <span className="text-sm text-white">{v.violationType}</span>
                        <p className="text-xs text-gray-400">{v.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-gateway-rules">
              <h4 className="text-sm font-semibold mb-3 text-gray-300">Active Privacy Gateway Rules ({memoryIsolation.rules.active})</h4>
              {memoryIsolation.rules.list.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">No gateway rules configured</p>
              ) : (
                <div className="space-y-2">
                  {memoryIsolation.rules.list.map((rule: any, i: number) => (
                    <div key={rule.id || i} className="flex items-center justify-between p-2 bg-gray-900/50 rounded">
                      <div>
                        <span className="text-sm text-white">{rule.name}</span>
                        {rule.description && <p className="text-xs text-gray-400">{rule.description}</p>}
                      </div>
                      <span className="text-xs text-gray-500 capitalize">{rule.action}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {activeTab === "mitigations" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Settings className="w-5 h-5 text-gray-400" /> Mitigation Controls</h3>
            <p className="text-sm text-gray-400 mb-6">Configure automatic risk mitigation policies. Enable or disable controls and set thresholds for automated responses.</p>
            <div className="space-y-3">
              {mitigations.map((m: any) => (
                <Card key={m.id} className="bg-[#12121a] border-gray-800 p-4" data-testid={`mitigation-${m.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-sm font-medium text-white capitalize">{m.id.replace(/_/g, ' ')}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${m.enabled ? "bg-green-500/20 text-green-400" : "bg-gray-700 text-gray-400"}`}>
                          {m.enabled ? "Active" : "Disabled"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">{m.action}</p>
                      <p className="text-xs text-gray-500 mt-1">Threshold: {m.threshold}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={m.enabled}
                        onCheckedChange={(checked) => mitigationMutation.mutate({ id: m.id, enabled: checked })}
                        data-testid={`toggle-${m.id}`}
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {activeTab === "audit" && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Recent Audit Logs</h3>
            {!auditLogs || auditLogs.length === 0 ? (
              <Card className="bg-[#12121a] border-gray-800 p-8 text-center text-gray-400" data-testid="text-no-audit-logs">No audit logs yet</Card>
            ) : (
              <div className="space-y-2">
                {auditLogs.map((log: any) => (
                  <Card key={log.id} className="bg-[#12121a] border-gray-800 p-3 flex items-center gap-3" data-testid={`audit-log-${log.id}`}>
                    <div className={`w-2 h-2 rounded-full ${log.riskLevel === "critical" ? "bg-red-400" : log.riskLevel === "high" ? "bg-orange-400" : log.riskLevel === "medium" ? "bg-yellow-400" : "bg-green-400"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{log.action}</span>
                        <span className="text-xs text-gray-500">{log.resourceType}</span>
                      </div>
                      <div className="text-xs text-gray-400">Actor: {log.actorId} ({log.actorType}) - {log.outcome}</div>
                    </div>
                    <span className="text-xs text-gray-500">{new Date(log.createdAt).toLocaleString()}</span>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "data-requests" && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Data Export & Deletion Requests</h3>
            {(!dataRequests || dataRequests.length === 0) ? (
              <Card className="bg-[#12121a] border-gray-800 p-8 text-center text-gray-400" data-testid="text-no-data-requests">No data requests</Card>
            ) : (
              <div className="space-y-2">
                {dataRequests.map((req: any) => (
                  <Card key={req.id} className="bg-[#12121a] border-gray-800 p-4" data-testid={`data-request-${req.id}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {req.requestType === "export" ? <Download className="w-4 h-4 text-blue-400" /> : <Trash2 className="w-4 h-4 text-red-400" />}
                        <div>
                          <span className="text-sm font-medium capitalize">{req.requestType}</span>
                          <span className="text-xs text-gray-400 ml-2">User: {req.userId}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-1 rounded ${req.status === "completed" ? "bg-green-500/20 text-green-400" : req.status === "processing" ? "bg-blue-500/20 text-blue-400" : req.status === "failed" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                          {req.status}
                        </span>
                        {req.status === "pending" && (
                          <Button size="sm" variant="outline"
                            onClick={() => req.requestType === "export" ? processExportMutation.mutate(req.id) : processDeletionMutation.mutate(req.id)}
                            disabled={processExportMutation.isPending || processDeletionMutation.isPending}
                            data-testid={`button-process-${req.id}`}>
                            Process
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Requested: {new Date(req.requestedAt).toLocaleString()}</div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
