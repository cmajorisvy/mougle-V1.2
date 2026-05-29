import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import {
  BarChart3, Bot, Coins, DollarSign, TrendingUp, Users, Star,
  Shield, Pause, Play, Calculator, Layers, Zap, Activity,
  ChevronRight, Clock, CreditCard, Loader2
} from "lucide-react";

type Tab = "overview" | "agents" | "sales" | "costs";

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "agents", label: "Entities", icon: Bot },
  { id: "sales", label: "Sales", icon: CreditCard },
  { id: "costs", label: "Cost Control", icon: Calculator },
];

const CREDIT_COSTS: { action: string; credits: number; description: string }[] = [
  { action: "interaction", credits: 1, description: "Single interaction message" },
  { action: "research", credits: 3, description: "Research task" },
  { action: "analysis", credits: 5, description: "Deep analysis" },
  { action: "coding", credits: 4, description: "Code generation" },
  { action: "debate", credits: 2, description: "Debate participation" },
  { action: "training", credits: 10, description: "Knowledge training" },
  { action: "image", credits: 8, description: "Image generation" },
];

export default function CreatorDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [estimateModel, setEstimateModel] = useState("gpt-4o");
  const [estimateAction, setEstimateAction] = useState("interaction");

  const { user } = useAuth();
  const currentUserId = user?.id || null;

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["/api/creator-analytics", currentUserId],
    queryFn: () => api.creatorAnalytics.get(currentUserId!),
    enabled: !!currentUserId,
  });

  const { data: costData, isLoading: costsLoading } = useQuery({
    queryKey: ["/api/agent-costs", currentUserId],
    queryFn: () => api.agentCosts.logs(currentUserId!, 100),
    enabled: !!currentUserId,
  });

  const { data: estimate } = useQuery({
    queryKey: ["/api/agent-runner/estimate", estimateModel, estimateAction],
    queryFn: () => api.agentRunner.estimate(estimateModel, estimateAction),
  });

  const stats = analytics || {
    totalAgents: 0, activeAgents: 0, pausedAgents: 0,
    totalUsage: 0, totalEarnings: 0, totalCosts: 0,
    netRevenue: 0, avgRating: 0, totalReviews: 0, totalSales: 0,
    agentStats: [], recentSales: [],
  };

  const costs = costData || { totalSpent: 0, byModel: {}, byAction: {}, logs: [] };

  if (!currentUserId) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20" data-testid="page-creator-dashboard">
          <p className="text-gray-400">Please sign in to view your creator dashboard.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 pb-12" data-testid="page-creator-dashboard">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600/20 via-blue-600/15 to-purple-600/10 border border-white/[0.06] p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.15),transparent_60%)]" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-full blur-3xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white" data-testid="text-dashboard-title">Creator Hub</h1>
                <p className="text-gray-400 text-sm" data-testid="text-dashboard-subtitle">Analytics, performance & cost control for your intelligent entities</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mt-6">
              <StatMini icon={Bot} label="Total Entities" value={stats.totalAgents} testId="stat-total-agents" />
              <StatMini icon={Play} label="Active" value={stats.activeAgents} color="text-green-400" testId="stat-active-agents" />
              <StatMini icon={Pause} label="Paused" value={stats.pausedAgents} color="text-yellow-400" testId="stat-paused-agents" />
              <StatMini icon={Users} label="Total Usage" value={stats.totalUsage} testId="stat-total-usage" />
              <StatMini icon={DollarSign} label="Earnings" value={stats.totalEarnings} color="text-green-400" prefix="" suffix=" cr" testId="stat-earnings" />
              <StatMini icon={Coins} label="Costs" value={stats.totalCosts} color="text-red-400" prefix="" suffix=" cr" testId="stat-costs" />
              <StatMini icon={TrendingUp} label="Net Revenue" value={stats.netRevenue} color={stats.netRevenue >= 0 ? "text-green-400" : "text-red-400"} prefix="" suffix=" cr" testId="stat-net-revenue" />
            </div>
          </div>
        </div>

        <div className="flex gap-1 p-1 rounded-xl bg-[#141422]/80 border border-white/[0.06]" data-testid="tab-bar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center",
                activeTab === tab.id
                  ? "bg-gradient-to-r from-emerald-600 to-blue-600 text-white shadow-lg"
                  : "text-gray-400 hover:text-white hover:bg-white/[0.04]"
              )}
              data-testid={`tab-${tab.id}`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {analyticsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === "overview" && <OverviewTab stats={stats} />}
            {activeTab === "agents" && <AgentsTab agents={stats.agentStats} />}
            {activeTab === "sales" && <SalesTab sales={stats.recentSales} totalSales={stats.totalSales} totalEarnings={stats.totalEarnings} />}
            {activeTab === "costs" && (
              <CostsTab
                costs={costs}
                costsLoading={costsLoading}
                estimate={estimate}
                estimateModel={estimateModel}
                estimateAction={estimateAction}
                setEstimateModel={setEstimateModel}
                setEstimateAction={setEstimateAction}
              />
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

function StatMini({ icon: Icon, label, value, color, prefix, suffix, testId }: {
  icon: any; label: string; value: number; color?: string; prefix?: string; suffix?: string; testId: string;
}) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.04] border border-white/[0.04]" data-testid={testId}>
      <Icon className={cn("w-4 h-4 flex-shrink-0", color || "text-gray-400")} />
      <div className="min-w-0">
        <div className={cn("text-sm font-bold truncate", color || "text-white")}>
          {prefix}{typeof value === "number" ? value.toLocaleString() : value}{suffix}
        </div>
        <div className="text-[10px] text-gray-500 truncate">{label}</div>
      </div>
    </div>
  );
}

function OverviewTab({ stats }: { stats: any }) {
  return (
    <div className="space-y-6" data-testid="tab-content-overview">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RevenueCard title="Total Earnings" value={stats.totalEarnings} icon={DollarSign} color="text-green-400" bgColor="bg-green-500/10" testId="card-total-earnings" />
        <RevenueCard title="Total Costs" value={stats.totalCosts} icon={Coins} color="text-red-400" bgColor="bg-red-500/10" testId="card-total-costs" />
        <RevenueCard title="Net Revenue" value={stats.netRevenue} icon={TrendingUp} color={stats.netRevenue >= 0 ? "text-green-400" : "text-red-400"} bgColor={stats.netRevenue >= 0 ? "bg-green-500/10" : "bg-red-500/10"} testId="card-net-revenue" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-xl bg-[#141422]/80 border border-white/[0.06]" data-testid="card-performance-summary">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Performance Summary
          </h3>
          <div className="space-y-3">
            <SummaryRow label="Average Rating" value={`${(stats.avgRating || 0).toFixed(1)} / 5.0`} icon={Star} color="text-amber-400" testId="text-avg-rating" />
            <SummaryRow label="Total Reviews" value={stats.totalReviews} icon={Users} color="text-blue-400" testId="text-total-reviews" />
            <SummaryRow label="Total Sales" value={stats.totalSales} icon={CreditCard} color="text-purple-400" testId="text-total-sales" />
            <SummaryRow label="Total Usage" value={stats.totalUsage} icon={Zap} color="text-amber-400" testId="text-overview-usage" />
          </div>
        </div>

        <div className="p-5 rounded-xl bg-[#141422]/80 border border-white/[0.06]" data-testid="card-agent-distribution">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-400" />
            Entity Distribution
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">Active</span>
                <span className="text-green-400 font-semibold" data-testid="text-active-count">{stats.activeAgents}</span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all"
                  style={{ width: `${stats.totalAgents ? (stats.activeAgents / stats.totalAgents) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">Paused</span>
                <span className="text-yellow-400 font-semibold" data-testid="text-paused-count">{stats.pausedAgents}</span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-amber-400 transition-all"
                  style={{ width: `${stats.totalAgents ? (stats.pausedAgents / stats.totalAgents) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {stats.agentStats?.length > 0 && (
        <div className="p-5 rounded-xl bg-[#141422]/80 border border-white/[0.06]" data-testid="card-top-agents">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400" />
            Top Performing Entities
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.agentStats.slice(0, 3).map((agent: any, i: number) => (
              <div key={agent.agentId || i} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]" data-testid={`card-top-agent-${i}`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-white truncate">{agent.name || "Entity"}</div>
                    <div className="text-[10px] text-gray-500">{agent.usageCount || 0} uses</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-green-400">{agent.earnings || 0} cr earned</span>
                  <span className="text-gray-600">·</span>
                  <span className="text-amber-400 flex items-center gap-0.5">
                    <Star className="w-3 h-3 fill-amber-400" />
                    {(agent.rating || 0).toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RevenueCard({ title, value, icon: Icon, color, bgColor, testId }: {
  title: string; value: number; icon: any; color: string; bgColor: string; testId: string;
}) {
  return (
    <div className="p-5 rounded-xl bg-[#141422]/80 border border-white/[0.06]" data-testid={testId}>
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", bgColor)}>
          <Icon className={cn("w-5 h-5", color)} />
        </div>
        <span className="text-xs text-gray-400 font-medium">{title}</span>
      </div>
      <div className={cn("text-2xl font-bold", color)}>{value.toLocaleString()} <span className="text-sm font-normal text-gray-500">credits</span></div>
    </div>
  );
}

function SummaryRow({ label, value, icon: Icon, color, testId }: {
  label: string; value: any; icon: any; color: string; testId: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
      <div className="flex items-center gap-2">
        <Icon className={cn("w-3.5 h-3.5", color)} />
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <span className="text-sm font-semibold text-white" data-testid={testId}>{value}</span>
    </div>
  );
}

function AgentsTab({ agents }: { agents: any[] }) {
  return (
    <div className="space-y-4" data-testid="tab-content-agents">
      <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-agents">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">Entity</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-400">Status</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400">Usage</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400">Earnings</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-400">Rating</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400">Reviews</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400">Trust</th>
              </tr>
            </thead>
            <tbody>
              {agents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500">
                    <Bot className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                    <p>No entities yet. Create your first entity to see performance data.</p>
                  </td>
                </tr>
              ) : (
                agents.map((agent: any, i: number) => (
                  <tr key={agent.agentId || i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors" data-testid={`row-agent-${i}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                          <Bot className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="text-white font-medium text-xs truncate max-w-[140px]" data-testid={`text-agent-name-${i}`}>{agent.name || "Unnamed Entity"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Badge
                        className={cn(
                          "text-[10px]",
                          agent.status === "active"
                            ? "bg-green-500/10 text-green-400 border-green-500/20"
                            : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                        )}
                        data-testid={`badge-status-${i}`}
                      >
                        {agent.status === "active" ? "Active" : "Paused"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right text-xs text-white" data-testid={`text-usage-${i}`}>{(agent.usageCount || 0).toLocaleString()}</td>
                    <td className="px-3 py-3 text-right text-xs text-green-400 font-medium" data-testid={`text-earnings-${i}`}>{(agent.earnings || 0).toLocaleString()} cr</td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-xs text-amber-400" data-testid={`text-rating-${i}`}>
                        <Star className="w-3 h-3 fill-amber-400" />
                        {(agent.rating || 0).toFixed(1)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-xs text-gray-400" data-testid={`text-reviews-${i}`}>{agent.reviews || 0}</td>
                    <td className="px-3 py-3 text-right">
                      <span className={cn("text-xs font-medium", (agent.trustScore || 0) >= 70 ? "text-green-400" : (agent.trustScore || 0) >= 40 ? "text-yellow-400" : "text-red-400")} data-testid={`text-trust-${i}`}>
                        {agent.trustScore || 0}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SalesTab({ sales, totalSales, totalEarnings }: { sales: any[]; totalSales: number; totalEarnings: number }) {
  return (
    <div className="space-y-4" data-testid="tab-content-sales">
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-[#141422]/80 border border-white/[0.06]" data-testid="card-sales-total">
          <div className="text-xs text-gray-400 mb-1">Total Sales</div>
          <div className="text-xl font-bold text-white">{totalSales}</div>
        </div>
        <div className="p-4 rounded-xl bg-[#141422]/80 border border-white/[0.06]" data-testid="card-sales-earnings">
          <div className="text-xs text-gray-400 mb-1">Total Earnings</div>
          <div className="text-xl font-bold text-green-400">{totalEarnings.toLocaleString()} cr</div>
        </div>
      </div>

      <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-400" />
            Recent Sales
          </h3>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {sales.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <CreditCard className="w-8 h-8 mx-auto mb-2 text-gray-600" />
              <p className="text-sm">No sales yet.</p>
            </div>
          ) : (
            sales.map((sale: any, i: number) => (
              <div key={sale.id || i} className="px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors" data-testid={`row-sale-${i}`}>
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                  <CreditCard className="w-4 h-4 text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white truncate" data-testid={`text-sale-agent-${i}`}>{sale.agentName || "Entity Sale"}</div>
                  <div className="text-[10px] text-gray-500" data-testid={`text-sale-buyer-${i}`}>Buyer: {sale.buyerName || sale.buyerId || "Anonymous"}</div>
                </div>
                <div className="text-right flex-shrink-0 space-y-0.5">
                  <div className="text-xs font-semibold text-white" data-testid={`text-sale-credits-${i}`}>{sale.creditsPaid || sale.price || 0} cr</div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-green-400" data-testid={`text-sale-earnings-${i}`}>+{sale.sellerEarnings || Math.round((sale.creditsPaid || sale.price || 0) * 0.7)} earned</span>
                    <span className="text-gray-600">|</span>
                    <span className="text-red-400" data-testid={`text-sale-fee-${i}`}>-{sale.platformFee || Math.round((sale.creditsPaid || sale.price || 0) * 0.3)} fee</span>
                  </div>
                </div>
                <div className="text-[10px] text-gray-500 flex-shrink-0" data-testid={`text-sale-date-${i}`}>
                  {sale.date ? new Date(sale.date).toLocaleDateString() : "—"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function CostsTab({ costs, costsLoading, estimate, estimateModel, estimateAction, setEstimateModel, setEstimateAction }: {
  costs: any; costsLoading: boolean; estimate: any;
  estimateModel: string; estimateAction: string;
  setEstimateModel: (v: string) => void; setEstimateAction: (v: string) => void;
}) {
  const models = ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo", "claude-3-opus", "claude-3-sonnet"];
  const actions = ["interaction", "research", "analysis", "coding", "debate", "training", "image"];

  return (
    <div className="space-y-6" data-testid="tab-content-costs">
      <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] p-5" data-testid="card-pricing-table">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-400" />
          Credit Costs per Action
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CREDIT_COSTS.map((item) => (
            <div key={item.action} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]" data-testid={`pricing-row-${item.action}`}>
              <div>
                <span className="text-xs font-medium text-white capitalize">{item.action}</span>
                <span className="text-[10px] text-gray-500 ml-2">{item.description}</span>
              </div>
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">
                {item.credits} cr
              </Badge>
            </div>
          ))}
        </div>
      </div>

      {costsLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] p-5" data-testid="card-cost-by-model">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Bot className="w-4 h-4 text-purple-400" />
              Cost by Model
            </h3>
            <div className="space-y-2">
              {Object.keys(costs.byModel || {}).length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">No cost data yet</p>
              ) : (
                Object.entries(costs.byModel || {}).map(([model, amount]: [string, any]) => (
                  <div key={model} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0" data-testid={`cost-model-${model}`}>
                    <span className="text-xs text-gray-300">{model}</span>
                    <span className="text-xs font-semibold text-red-400">{Number(amount).toLocaleString()} cr</span>
                  </div>
                ))
              )}
              <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                <span className="text-xs font-semibold text-gray-300">Total Spent</span>
                <span className="text-sm font-bold text-red-400" data-testid="text-total-spent">{(costs.totalSpent || 0).toLocaleString()} cr</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] p-5" data-testid="card-cost-by-action">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Cost by Action
            </h3>
            <div className="space-y-2">
              {Object.keys(costs.byAction || {}).length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">No cost data yet</p>
              ) : (
                Object.entries(costs.byAction || {}).map(([action, amount]: [string, any]) => (
                  <div key={action} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0" data-testid={`cost-action-${action}`}>
                    <span className="text-xs text-gray-300 capitalize">{action}</span>
                    <span className="text-xs font-semibold text-red-400">{Number(amount).toLocaleString()} cr</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-[#141422]/80 border border-white/[0.06] p-5" data-testid="card-cost-calculator">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-emerald-400" />
          Estimated Cost Calculator
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 block">Model</label>
            <select
              value={estimateModel}
              onChange={(e) => setEstimateModel(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
              data-testid="select-estimate-model"
            >
              {models.map((m) => (
                <option key={m} value={m} className="bg-[#141422] text-white">{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 block">Action Type</label>
            <select
              value={estimateAction}
              onChange={(e) => setEstimateAction(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
              data-testid="select-estimate-action"
            >
              {actions.map((a) => (
                <option key={a} value={a} className="bg-[#141422] text-white capitalize">{a}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.04] flex items-center justify-between" data-testid="estimate-result">
          <div>
            <div className="text-xs text-gray-400">Estimated cost per call</div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              Model: <span className="text-gray-300">{estimate?.model || estimateModel}</span> · Action: <span className="text-gray-300 capitalize">{estimate?.actionType || estimateAction}</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-400" data-testid="text-estimate-credits">
            {estimate?.credits ?? "—"} <span className="text-sm font-normal text-gray-500">credits</span>
          </div>
        </div>
      </div>
    </div>
  );
}
