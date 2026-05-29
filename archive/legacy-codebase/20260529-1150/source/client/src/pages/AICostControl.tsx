import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import {
  Shield, Bot, Play, Pause, AlertTriangle, Key,
  Unplug, DollarSign, BarChart3, Layers, Calculator,
  Clock, Loader2, Zap, ChevronDown, Table2, Info
} from "lucide-react";

const CREDIT_COSTS: { action: string; credits: number; description: string }[] = [
  { action: "chat", credits: 1, description: "Single chat message" },
  { action: "research", credits: 3, description: "Research task" },
  { action: "analysis", credits: 5, description: "Deep analysis" },
  { action: "coding", credits: 4, description: "Code generation" },
  { action: "debate", credits: 2, description: "Debate participation" },
  { action: "training", credits: 10, description: "Knowledge training" },
  { action: "image", credits: 8, description: "Image generation" },
];

const MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo", "claude-3-opus", "claude-3-sonnet"];
const ACTIONS = ["chat", "research", "analysis", "coding", "debate", "training", "image"];
const PROVIDERS = ["OpenAI", "Together", "Groq"];

export default function AICostControl() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentUserId = user?.id || null;
  const [estimateModel, setEstimateModel] = useState("gpt-4o");
  const [estimateAction, setEstimateAction] = useState("chat");
  const [byoaiProvider, setByoaiProvider] = useState("OpenAI");
  const [byoaiKey, setByoaiKey] = useState("");

  const { data: walletStatus, isLoading: walletLoading } = useQuery({
    queryKey: ["/api/wallet-status", currentUserId],
    queryFn: () => api.walletStatus.get(currentUserId!),
    enabled: !!currentUserId,
  });

  const { data: costData, isLoading: costsLoading } = useQuery({
    queryKey: ["/api/agent-costs", currentUserId],
    queryFn: () => api.agentCosts.logs(currentUserId!, 100),
    enabled: !!currentUserId,
  });

  const { data: byoaiStatus } = useQuery({
    queryKey: ["/api/byoai/status", currentUserId],
    queryFn: () => api.byoai.status(currentUserId!),
    enabled: !!currentUserId,
  });

  const { data: estimate } = useQuery({
    queryKey: ["/api/agent-runner/estimate", estimateModel, estimateAction],
    queryFn: () => api.agentRunner.estimate(estimateModel, estimateAction),
  });

  const resumeMutation = useMutation({
    mutationFn: () => api.agentRunner.resume(currentUserId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet-status"] });
    },
  });

  const connectByoai = useMutation({
    mutationFn: () => api.byoai.set(currentUserId!, byoaiProvider, byoaiKey),
    onSuccess: () => {
      setByoaiKey("");
      queryClient.invalidateQueries({ queryKey: ["/api/byoai/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet-status"] });
    },
  });

  const disconnectByoai = useMutation({
    mutationFn: () => api.byoai.remove(currentUserId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/byoai/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet-status"] });
    },
  });

  const wallet = walletStatus || { creditWallet: 0, byoaiEnabled: false, byoaiProvider: null, activeAgents: 0, pausedAgents: 0, totalSpent: 0 };
  const costs = costData || { totalSpent: 0, byModel: {}, byAction: {}, logs: [] };
  const byoai = byoaiStatus || { enabled: false, provider: null, hasKey: false };

  if (!currentUserId) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20" data-testid="page-cost-control">
          <p className="text-gray-400">Please sign in to view cost control settings.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 pb-12" data-testid="page-cost-control">
        {/* Gradient Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600/20 via-blue-600/15 to-purple-600/10 border border-white/[0.06] p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.15),transparent_60%)]" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-full blur-3xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white" data-testid="text-page-title">AI Cost Control</h1>
                <p className="text-gray-400 text-sm" data-testid="text-page-subtitle">Monitor spending, manage BYOAI keys & control agent costs</p>
              </div>
            </div>

            {walletLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.04]" data-testid="stat-credit-balance">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-green-400" />
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Credit Balance</span>
                  </div>
                  <div className="text-3xl font-bold text-green-400" data-testid="text-credit-balance">
                    {wallet.creditWallet.toLocaleString()}
                  </div>
                  <span className="text-xs text-gray-500">credits</span>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.04]" data-testid="stat-byoai-status">
                  <div className="flex items-center gap-2 mb-1">
                    <Key className="w-4 h-4 text-purple-400" />
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">BYOAI</span>
                  </div>
                  <Badge
                    className={cn(
                      "mt-1",
                      wallet.byoaiEnabled
                        ? "bg-green-500/10 text-green-400 border-green-500/20"
                        : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                    )}
                    data-testid="badge-byoai-status"
                  >
                    {wallet.byoaiEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                  {wallet.byoaiProvider && (
                    <div className="text-xs text-gray-500 mt-1" data-testid="text-byoai-provider">{wallet.byoaiProvider}</div>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.04]" data-testid="stat-active-agents">
                  <div className="flex items-center gap-2 mb-1">
                    <Play className="w-4 h-4 text-green-400" />
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Active</span>
                  </div>
                  <div className="text-2xl font-bold text-green-400" data-testid="text-active-agents">{wallet.activeAgents}</div>
                  <span className="text-xs text-gray-500">agents</span>
                </div>

                <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.04]" data-testid="stat-paused-agents">
                  <div className="flex items-center gap-2 mb-1">
                    <Pause className="w-4 h-4 text-orange-400" />
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Paused</span>
                  </div>
                  <div className={cn("text-2xl font-bold", wallet.pausedAgents > 0 ? "text-orange-400" : "text-gray-400")} data-testid="text-paused-agents">
                    {wallet.pausedAgents}
                  </div>
                  <span className="text-xs text-gray-500">agents</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Auto-Pause Alert */}
        {wallet.pausedAgents > 0 && (
          <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 p-5 flex items-center gap-4" data-testid="alert-auto-pause">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-orange-400" data-testid="text-pause-warning">
                {wallet.pausedAgents} agent{wallet.pausedAgents > 1 ? "s" : ""} paused due to insufficient credits
              </h3>
              <p className="text-xs text-orange-300/70 mt-0.5">
                Add compute credits or enable BYOAI to resume operations automatically.
              </p>
            </div>
            <Button
              size="sm"
              className="bg-orange-500 hover:bg-orange-600 text-white font-medium flex-shrink-0"
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
              data-testid="button-resume-all"
            >
              {resumeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Play className="w-4 h-4 mr-1" />}
              Resume All Agents
            </Button>
          </div>
        )}

        {/* BYOAI Section */}
        <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] p-5" data-testid="card-byoai">
          <div className="flex items-center gap-2 mb-4">
            <Key className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-white">Bring Your Own AI (BYOAI)</h3>
            <Badge
              className={cn(
                "ml-auto text-[10px]",
                byoai.enabled
                  ? "bg-green-500/10 text-green-400 border-green-500/20"
                  : "bg-gray-500/10 text-gray-400 border-gray-500/20"
              )}
              data-testid="badge-byoai-section-status"
            >
              {byoai.enabled ? "Connected" : "Not Connected"}
            </Badge>
          </div>

          <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/10 mb-4" data-testid="text-byoai-info">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-300/80 leading-relaxed">
                BYOAI mode routes all AI calls through your own API key. This means <strong className="text-blue-300">no credit charges</strong> for AI calls — you only pay your provider directly.
              </p>
            </div>
          </div>

          {byoai.enabled ? (
            <div className="flex items-center justify-between p-4 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Key className="w-4 h-4 text-green-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white" data-testid="text-connected-provider">{byoai.provider || "Provider"}</div>
                  <div className="text-xs text-gray-500">API key connected</div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                onClick={() => disconnectByoai.mutate()}
                disabled={disconnectByoai.isPending}
                data-testid="button-disconnect-byoai"
              >
                {disconnectByoai.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Unplug className="w-3 h-3 mr-1" />}
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">Provider</label>
                  <div className="relative">
                    <select
                      value={byoaiProvider}
                      onChange={(e) => setByoaiProvider(e.target.value)}
                      className="w-full h-9 px-3 pr-8 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white appearance-none focus:outline-none focus:border-purple-500/40"
                      data-testid="select-byoai-provider"
                    >
                      {PROVIDERS.map((p) => (
                        <option key={p} value={p} className="bg-[#141422] text-white">{p}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  </div>
                </div>
                <div className="flex-[2]">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">API Key</label>
                  <input
                    type="password"
                    value={byoaiKey}
                    onChange={(e) => setByoaiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/40"
                    data-testid="input-byoai-key"
                  />
                </div>
              </div>
              <Button
                size="sm"
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90 text-white font-medium"
                onClick={() => connectByoai.mutate()}
                disabled={!byoaiKey || connectByoai.isPending}
                data-testid="button-connect-byoai"
              >
                {connectByoai.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Key className="w-4 h-4 mr-1" />}
                Connect API Key
              </Button>
            </div>
          )}
        </div>

        {/* Spending Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 rounded-xl bg-[#141422]/80 border border-white/[0.06]" data-testid="card-total-spent">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-red-400" />
              </div>
              <span className="text-xs text-gray-400 font-medium">Total Credits Spent</span>
            </div>
            <div className="text-2xl font-bold text-red-400" data-testid="text-total-spent">
              {costs.totalSpent.toLocaleString()} <span className="text-sm font-normal text-gray-500">credits</span>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-[#141422]/80 border border-white/[0.06]" data-testid="card-by-model">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              By Model
            </h3>
            {costsLoading ? (
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            ) : Object.keys(costs.byModel).length === 0 ? (
              <p className="text-xs text-gray-500">No model data yet</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(costs.byModel).map(([model, amount]: [string, any]) => {
                  const maxVal = Math.max(...Object.values(costs.byModel as Record<string, number>));
                  const pct = maxVal > 0 ? (amount / maxVal) * 100 : 0;
                  return (
                    <div key={model} data-testid={`bar-model-${model}`}>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-gray-400 truncate">{model}</span>
                        <span className="text-white font-medium">{amount} cr</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-5 rounded-xl bg-[#141422]/80 border border-white/[0.06]" data-testid="card-by-action">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              By Action Type
            </h3>
            {costsLoading ? (
              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
            ) : Object.keys(costs.byAction).length === 0 ? (
              <p className="text-xs text-gray-500">No action data yet</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(costs.byAction).map(([action, amount]: [string, any]) => {
                  const maxVal = Math.max(...Object.values(costs.byAction as Record<string, number>));
                  const pct = maxVal > 0 ? (amount / maxVal) * 100 : 0;
                  return (
                    <div key={action} data-testid={`bar-action-${action}`}>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-gray-400 capitalize">{action}</span>
                        <span className="text-white font-medium">{amount} cr</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Cost Estimation Calculator */}
        <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] p-5" data-testid="card-estimator">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-emerald-400" />
            Cost Estimation Calculator
          </h3>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">Model</label>
              <div className="relative">
                <select
                  value={estimateModel}
                  onChange={(e) => setEstimateModel(e.target.value)}
                  className="h-9 px-3 pr-8 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white appearance-none focus:outline-none focus:border-emerald-500/40"
                  data-testid="select-estimate-model"
                >
                  {MODELS.map((m) => (
                    <option key={m} value={m} className="bg-[#141422] text-white">{m}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 block">Action</label>
              <div className="relative">
                <select
                  value={estimateAction}
                  onChange={(e) => setEstimateAction(e.target.value)}
                  className="h-9 px-3 pr-8 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white appearance-none focus:outline-none focus:border-emerald-500/40"
                  data-testid="select-estimate-action"
                >
                  {ACTIONS.map((a) => (
                    <option key={a} value={a} className="bg-[#141422] text-white capitalize">{a}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
            </div>
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2" data-testid="text-estimate-result">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-bold text-emerald-400">{estimate?.credits ?? "—"}</span>
              <span className="text-xs text-gray-500">credits/call</span>
            </div>
          </div>
        </div>

        {/* Usage Logs */}
        <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] overflow-hidden" data-testid="card-usage-logs">
          <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">Recent Usage Logs</h3>
            <span className="text-[10px] text-gray-500 ml-auto">{costs.logs.length} entries</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-usage-logs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase">Date</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-500 uppercase">Agent</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-500 uppercase">Action</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-gray-500 uppercase">Model</th>
                  <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-gray-500 uppercase">Credits</th>
                  <th className="text-center px-3 py-2.5 text-[10px] font-semibold text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {costsLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12">
                      <Loader2 className="w-6 h-6 text-blue-400 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : costs.logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-500">
                      <Table2 className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                      <p className="text-sm">No usage logs yet.</p>
                    </td>
                  </tr>
                ) : (
                  costs.logs.map((log: any, i: number) => (
                    <tr key={log.id || i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors" data-testid={`row-log-${i}`}>
                      <td className="px-4 py-2.5 text-xs text-gray-400" data-testid={`text-log-date-${i}`}>
                        {log.createdAt ? new Date(log.createdAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs font-medium text-white truncate max-w-[120px] inline-block" data-testid={`text-log-agent-${i}`}>
                          {log.agentName || log.agentId || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-gray-400 capitalize" data-testid={`text-log-action-${i}`}>{log.actionType || "—"}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs text-gray-400" data-testid={`text-log-model-${i}`}>{log.model || "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-xs font-semibold text-red-400" data-testid={`text-log-credits-${i}`}>{log.creditsCharged ?? log.credits ?? 0} cr</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge
                          className={cn(
                            "text-[9px]",
                            (log.status === "success" || log.status === "completed")
                              ? "bg-green-500/10 text-green-400 border-green-500/20"
                              : log.status === "failed"
                              ? "bg-red-500/10 text-red-400 border-red-500/20"
                              : "bg-gray-500/10 text-gray-400 border-gray-500/20"
                          )}
                          data-testid={`badge-log-status-${i}`}
                        >
                          {log.status || "unknown"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Credit Pricing Table */}
        <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] p-5" data-testid="card-pricing-table">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            Credit Pricing Table
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CREDIT_COSTS.map((item) => (
              <div key={item.action} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]" data-testid={`pricing-row-${item.action}`}>
                <div>
                  <span className="text-xs font-medium text-white capitalize">{item.action}</span>
                  <span className="text-[10px] text-gray-500 ml-2">{item.description}</span>
                </div>
                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]" data-testid={`badge-price-${item.action}`}>
                  {item.credits} cr
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
