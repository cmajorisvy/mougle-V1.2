import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Shield, Bot, Coins, DollarSign, TrendingUp, Users, Activity,
  Pause, Play, Zap, Layers, CheckCircle2, AlertTriangle,
  BarChart3, Loader2, ArrowLeft, Key, Cpu
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

export default function AgentCostAnalytics() {
  const { isAuthenticated, isLoading: authLoading } = useAdminAuth();
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-agent-cost-analytics"],
    queryFn: () => api.admin.agentCostAnalytics(),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  const { data: creditCosts } = useQuery({
    queryKey: ["billing-credit-costs"],
    queryFn: () => api.billing.creditCosts(),
    enabled: isAuthenticated,
  });

  if (authLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
        </div>
      </Layout>
    );
  }

  const analytics = data || {
    totalAgents: 0,
    activeAgents: 0,
    pausedAgents: 0,
    totalUsage: 0,
    totalCreditsCharged: 0,
    byoaiUsers: 0,
    totalUsers: 0,
    costsByModel: {},
    costsByAction: {},
  };

  const totalAgents = analytics.totalAgents || 0;
  const activeAgents = analytics.activeAgents || 0;
  const pausedAgents = analytics.pausedAgents || 0;
  const totalUsage = analytics.totalUsage || 0;
  const totalCreditsCharged = analytics.totalCreditsCharged || 0;
  const byoaiUsers = analytics.byoaiUsers || 0;
  const totalUsers = analytics.totalUsers || 1;
  const costsByModel = analytics.costsByModel || {};
  const costsByAction = analytics.costsByAction || {};

  const byoaiRate = totalUsers > 0 ? ((byoaiUsers / totalUsers) * 100).toFixed(1) : "0.0";
  const autoPauseRate = totalAgents > 0 ? ((pausedAgents / totalAgents) * 100).toFixed(1) : "0.0";

  const modelEntries = Object.entries(costsByModel).sort((a: any, b: any) => b[1] - a[1]);
  const actionEntries = Object.entries(costsByAction).sort((a: any, b: any) => b[1] - a[1]);
  const maxModelCost = modelEntries.length > 0 ? Math.max(...modelEntries.map(([, v]: any) => v)) : 1;
  const maxActionCost = actionEntries.length > 0 ? Math.max(...actionEntries.map(([, v]: any) => v)) : 1;

  const pricingData = creditCosts?.costs || creditCosts?.actionCosts || [];
  const pricingArray = Array.isArray(pricingData)
    ? pricingData
    : Object.entries(pricingData).map(([action, credits]) => ({ action, credits }));

  return (
    <Layout>
      <div className="space-y-6 pb-12" data-testid="page-agent-cost-analytics">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600/20 via-indigo-600/15 to-cyan-600/10 border border-white/[0.06] p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.15),transparent_60%)]" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-full blur-3xl" />
          <div className="relative z-10">
            <button
              onClick={() => navigate("/admin")}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-white mb-4 transition-colors"
              data-testid="button-back-admin"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Admin
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white" data-testid="text-page-title">AI Cost Control Analytics</h1>
                <p className="text-gray-400 text-sm" data-testid="text-page-subtitle">Platform-wide agent cost monitoring & safety dashboard</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-6">
              <StatMini icon={Bot} label="Total Agents" value={totalAgents} testId="stat-total-agents" />
              <StatMini icon={Play} label="Active" value={activeAgents} color="text-green-400" testId="stat-active-agents" />
              <StatMini icon={Pause} label="Paused" value={pausedAgents} color="text-yellow-400" testId="stat-paused-agents" />
              <StatMini icon={Zap} label="Total Usage" value={totalUsage} testId="stat-total-usage" />
              <StatMini icon={Coins} label="Credits Charged" value={totalCreditsCharged} color="text-amber-400" testId="stat-credits-charged" />
              <StatMini icon={Key} label="BYOAI Users" value={byoaiUsers} color="text-cyan-400" testId="stat-byoai-users" />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" data-testid="loading-spinner" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="section-safety-indicators">
              <div className="p-5 rounded-xl bg-[#141422]/80 border border-white/[0.06]" data-testid="card-zero-platform-cost">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium">Platform Cost Status</span>
                </div>
                <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-sm px-3 py-1" data-testid="badge-zero-cost">
                  ✓ Zero Platform Cost
                </Badge>
                <p className="text-[11px] text-gray-500 mt-2" data-testid="text-zero-cost-desc">Platform never pays for user agent activity. All AI costs are user-funded via credits or BYOAI keys.</p>
              </div>

              <div className="p-5 rounded-xl bg-[#141422]/80 border border-white/[0.06]" data-testid="card-byoai-adoption">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                    <Key className="w-5 h-5 text-cyan-400" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium">BYOAI Adoption Rate</span>
                </div>
                <div className="text-2xl font-bold text-cyan-400" data-testid="text-byoai-rate">{byoaiRate}%</div>
                <div className="mt-2">
                  <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-400 transition-all"
                      style={{ width: `${Math.min(parseFloat(byoaiRate), 100)}%` }}
                      data-testid="bar-byoai-rate"
                    />
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">{byoaiUsers} of {totalUsers} users bring their own AI keys</p>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-[#141422]/80 border border-white/[0.06]" data-testid="card-auto-pause">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-yellow-400" />
                  </div>
                  <span className="text-xs text-gray-400 font-medium">Auto-Pause Effectiveness</span>
                </div>
                <div className="text-2xl font-bold text-yellow-400" data-testid="text-auto-pause-rate">{autoPauseRate}%</div>
                <div className="mt-2">
                  <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-amber-400 transition-all"
                      style={{ width: `${Math.min(parseFloat(autoPauseRate), 100)}%` }}
                      data-testid="bar-auto-pause-rate"
                    />
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">{pausedAgents} paused out of {totalAgents} total agents</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 rounded-xl bg-[#141422]/80 border border-white/[0.06]" data-testid="card-costs-by-model">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  Costs by Model
                </h3>
                {modelEntries.length === 0 ? (
                  <p className="text-xs text-gray-500 py-4 text-center" data-testid="text-no-model-data">No model cost data available</p>
                ) : (
                  <div className="space-y-3">
                    {modelEntries.map(([model, amount]: [string, any]) => (
                      <div key={model} data-testid={`bar-model-${model}`}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-300 font-medium">{model}</span>
                          <span className="text-purple-400 font-semibold">{Number(amount).toLocaleString()} cr</span>
                        </div>
                        <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-all"
                            style={{ width: `${(Number(amount) / maxModelCost) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-5 rounded-xl bg-[#141422]/80 border border-white/[0.06]" data-testid="card-costs-by-action">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  Costs by Action Type
                </h3>
                {actionEntries.length === 0 ? (
                  <p className="text-xs text-gray-500 py-4 text-center" data-testid="text-no-action-data">No action cost data available</p>
                ) : (
                  <div className="space-y-3">
                    {actionEntries.map(([action, amount]: [string, any]) => (
                      <div key={action} data-testid={`bar-action-${action}`}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-300 font-medium capitalize">{action}</span>
                          <span className="text-emerald-400 font-semibold">{Number(amount).toLocaleString()} cr</span>
                        </div>
                        <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all"
                            style={{ width: `${(Number(amount) / maxActionCost) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 rounded-xl bg-[#141422]/80 border border-white/[0.06]" data-testid="card-credit-pricing">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-400" />
                Credit Pricing Table
              </h3>
              {pricingArray.length === 0 ? (
                <p className="text-xs text-gray-500 py-4 text-center" data-testid="text-no-pricing-data">No pricing data available</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {pricingArray.map((item: any, i: number) => (
                    <div
                      key={item.action || i}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                      data-testid={`pricing-row-${item.action || i}`}
                    >
                      <div>
                        <span className="text-xs font-medium text-white capitalize">{item.action || item.type || "Unknown"}</span>
                        {item.description && (
                          <span className="text-[10px] text-gray-500 ml-2">{item.description}</span>
                        )}
                      </div>
                      <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]" data-testid={`badge-price-${item.action || i}`}>
                        {item.credits || item.cost || 0} cr
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function StatMini({ icon: Icon, label, value, color, testId }: {
  icon: any; label: string; value: number; color?: string; testId: string;
}) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.04] border border-white/[0.04]" data-testid={testId}>
      <Icon className={cn("w-4 h-4 flex-shrink-0", color || "text-gray-400")} />
      <div className="min-w-0">
        <div className={cn("text-sm font-bold truncate", color || "text-white")}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        <div className="text-[10px] text-gray-500 truncate">{label}</div>
      </div>
    </div>
  );
}
