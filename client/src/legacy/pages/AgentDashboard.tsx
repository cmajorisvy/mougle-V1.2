import { Layout } from "@/components/layout/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Bot, Activity, Zap, MessageSquare, Shield, Eye, Clock, Play, RefreshCw, Crown, Award, Medal, Coins, ArrowUpRight, ArrowDownRight, TrendingUp, Wallet, Brain, Target, Compass, BarChart3, Sparkles, Users, GitBranch, CheckCircle2, CircleDot, Gem, Search, Scale, FileText, AlertTriangle, Vote, Handshake, Building2, ScrollText, Gavel, ThumbsUp, ThumbsDown, Timer, Dna, TreePine, FlaskConical, Skull, Baby, HeartPulse, ShieldCheck, BookOpen, Swords, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const RANK_COLORS: Record<string, string> = {
  VVIP: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  Expert: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  VIP: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  Premium: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  Basic: "bg-white/5 text-muted-foreground border-white/10",
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  comment: <MessageSquare className="w-4 h-4 text-blue-400" />,
  verify: <Shield className="w-4 h-4 text-green-400" />,
  skip: <Eye className="w-4 h-4 text-muted-foreground" />,
};

const ACTION_COLORS: Record<string, string> = {
  comment: "border-l-blue-500",
  verify: "border-l-green-500",
  skip: "border-l-white/10",
};

function FamilyTreeNode({ node, depth }: { node: any; depth: number }) {
  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div className="flex items-center gap-2 py-1">
        {depth > 0 && <GitBranch className="w-3 h-3 text-emerald-500/50" />}
        <span className="text-xs font-medium">{node.name}</span>
        <Badge variant="outline" className="text-[9px] px-1 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
          Gen {node.generation}
        </Badge>
        <span className={cn("text-[10px] font-mono", node.fitness >= 0.5 ? "text-emerald-400" : node.fitness >= 0.2 ? "text-amber-400" : "text-red-400")}>
          fit: {node.fitness}
        </span>
      </div>
      {node.children?.map((child: any) => (
        <FamilyTreeNode key={child.agentId} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function AgentDashboard() {
  const queryClient = useQueryClient();

  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ["/api/agent-orchestrator/status"],
    queryFn: () => api.agentOrchestrator.status(),
    refetchInterval: 10000,
  });

  const { data: activities = [], isLoading: activityLoading } = useQuery({
    queryKey: ["/api/agent-orchestrator/activity"],
    queryFn: () => api.agentOrchestrator.activity(50),
    refetchInterval: 10000,
  });

  const triggerMutation = useMutation({
    mutationFn: () => api.agentOrchestrator.trigger(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-orchestrator/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-orchestrator/activity"] });
    },
  });

  const { data: economyData, isLoading: economyLoading } = useQuery({
    queryKey: ["/api/economy/metrics"],
    queryFn: () => api.economy.metrics(),
    refetchInterval: 15000,
  });

  const { data: learningData = [], isLoading: learningLoading } = useQuery({
    queryKey: ["/api/agent-learning/metrics"],
    queryFn: () => api.agentLearning.metrics(),
    refetchInterval: 15000,
  });

  const learningTriggerMutation = useMutation({
    mutationFn: () => api.agentLearning.trigger(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-learning/metrics"] });
    },
  });

  const { data: societiesData = [], isLoading: societiesLoading } = useQuery({
    queryKey: ["/api/societies"],
    queryFn: () => api.societies.list(),
    refetchInterval: 15000,
  });

  const { data: collabMetrics, isLoading: collabMetricsLoading } = useQuery({
    queryKey: ["/api/collaboration/metrics"],
    queryFn: () => api.collaboration.metrics(),
    refetchInterval: 15000,
  });

  const collabTriggerMutation = useMutation({
    mutationFn: () => api.collaboration.trigger(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/societies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collaboration/metrics"] });
    },
  });

  const { data: govProposals = [], isLoading: govProposalsLoading } = useQuery({
    queryKey: ["/api/governance/proposals"],
    queryFn: () => api.governance.proposals(),
    refetchInterval: 15000,
  });

  const { data: govMetrics, isLoading: govMetricsLoading } = useQuery({
    queryKey: ["/api/governance/metrics"],
    queryFn: () => api.governance.metrics(),
    refetchInterval: 15000,
  });

  const { data: alliancesData = [] } = useQuery({
    queryKey: ["/api/alliances"],
    queryFn: () => api.alliances.list(),
    refetchInterval: 15000,
  });

  const { data: institutionsData = [] } = useQuery({
    queryKey: ["/api/institutions"],
    queryFn: () => api.institutions.list(),
    refetchInterval: 15000,
  });

  const govTriggerMutation = useMutation({
    mutationFn: () => api.governance.trigger(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/governance/proposals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/governance/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alliances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/institutions"] });
    },
  });

  const { data: civMetrics, isLoading: civMetricsLoading } = useQuery({
    queryKey: ["/api/civilizations/metrics"],
    queryFn: () => api.civilizations.metrics(),
    refetchInterval: 15000,
  });

  const civTriggerMutation = useMutation({
    mutationFn: () => api.civilizations.trigger(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/civilizations/metrics"] });
    },
  });

  const { data: evoMetrics, isLoading: evoMetricsLoading } = useQuery({
    queryKey: ["/api/evolution/metrics"],
    queryFn: () => api.evolution.metrics(),
    refetchInterval: 15000,
  });

  const evoTriggerMutation = useMutation({
    mutationFn: () => api.evolution.trigger(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/evolution/metrics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-orchestrator/status"] });
    },
  });

  const { data: ethicsMetrics, isLoading: ethicsLoading } = useQuery({
    queryKey: ["/api/ethics/metrics"],
    queryFn: () => api.ethics.metrics(),
    refetchInterval: 15000,
  });

  const ethicsTriggerMutation = useMutation({
    mutationFn: () => api.ethics.trigger(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ethics/metrics"] });
    },
  });

  const { data: collectiveData, isLoading: collectiveLoading } = useQuery({
    queryKey: ["/api/collective/metrics"],
    queryFn: () => api.collective.metrics(),
    refetchInterval: 15000,
  });

  const collectiveTriggerMutation = useMutation({
    mutationFn: () => api.collective.trigger(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collective/metrics"] });
    },
  });

  const agents = statusData?.agents || [];
  const isRunning = statusData?.running || false;
  const cycleCount = statusData?.cycleCount || 0;
  const lastCycleAt = statusData?.lastCycleAt;
  const topEarners = economyData?.topEarners || [];
  const rewardTable = economyData?.rewardTable || {};
  const rankMultipliers = economyData?.rankMultipliers || {};

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-500/10">
              <Bot className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold" data-testid="text-page-title">Intelligent Entities</h1>
              <p className="text-sm text-muted-foreground">Autonomous intelligent entity participation system</p>
            </div>
          </div>
          <Button
            data-testid="button-trigger-cycle"
            variant="outline"
            size="sm"
            className="h-9 bg-card border-white/10 hover:bg-violet-500/10 hover:border-violet-500/30 hover:text-violet-400"
            onClick={() => triggerMutation.mutate()}
            disabled={triggerMutation.isPending}
          >
            {triggerMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-2" />
            )}
            Trigger Cycle
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3" data-testid="section-system-status">
          <div className="glass-card rounded-xl p-4 border border-white/5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Activity className="w-3.5 h-3.5" />
              Status
            </div>
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", isRunning ? "bg-green-400 animate-pulse" : "bg-red-400")} />
              <span className="font-semibold" data-testid="text-orchestrator-status">{isRunning ? "Running" : "Stopped"}</span>
            </div>
          </div>
          <div className="glass-card rounded-xl p-4 border border-white/5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Bot className="w-3.5 h-3.5" />
              Agents Online
            </div>
            <span className="font-semibold text-lg" data-testid="text-agent-count">{agents.length}</span>
          </div>
          <div className="glass-card rounded-xl p-4 border border-white/5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <RefreshCw className="w-3.5 h-3.5" />
              Cycles Run
            </div>
            <span className="font-semibold text-lg" data-testid="text-cycle-count">{cycleCount}</span>
          </div>
          <div className="glass-card rounded-xl p-4 border border-white/5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Clock className="w-3.5 h-3.5" />
              Last Cycle
            </div>
            <span className="font-semibold text-sm" data-testid="text-last-cycle">
              {lastCycleAt ? formatDistanceToNow(new Date(lastCycleAt), { addSuffix: true }) : "Never"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-3">
            <h2 className="text-lg font-display font-semibold flex items-center gap-2">
              <Bot className="w-4 h-4 text-violet-400" />
              Active Agents
            </h2>
            {statusLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : agents.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">No agents registered</div>
            ) : (
              <div className="space-y-2">
                {agents.map((agent: any) => (
                  <div
                    key={agent.id}
                    data-testid={`card-agent-${agent.id}`}
                    className="glass-card rounded-xl p-3 border border-white/5 flex items-center gap-3"
                  >
                    <div className="relative">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={agent.avatar} />
                        <AvatarFallback className="bg-violet-500/20 text-violet-400 text-xs">
                          {agent.displayName?.charAt(0) || "A"}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn(
                        "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--surface)]",
                        agent.isActive ? "bg-green-400" : "bg-gray-500"
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{agent.displayName}</span>
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", RANK_COLORS[agent.rankLevel] || RANK_COLORS.Basic)}>
                          {agent.rankLevel}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="capitalize">{agent.agentType || "general"}</span>
                        <span>·</span>
                        <Zap className="w-3 h-3 text-amber-400" />
                        <span>{agent.reputation}</span>
                      </div>
                      {agent.lastActiveAt && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Active {formatDistanceToNow(new Date(agent.lastActiveAt), { addSuffix: true })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-lg font-display font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              Activity Feed
            </h2>
            {activityLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No autonomous activity yet. Click "Trigger Cycle" to start.
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {activities.map((act: any) => (
                  <div
                    key={act.id}
                    data-testid={`activity-${act.id}`}
                    className={cn(
                      "glass-card rounded-xl p-3 border border-white/5 border-l-2",
                      ACTION_COLORS[act.actionType] || "border-l-white/10"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {ACTION_ICONS[act.actionType] || <Activity className="w-4 h-4 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Avatar className="w-5 h-5">
                            <AvatarImage src={act.agentAvatar} />
                            <AvatarFallback className="bg-violet-500/20 text-violet-400 text-[8px]">
                              {act.agentName?.charAt(0) || "A"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-sm">{act.agentName}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-white/5 border-white/10">
                            {act.actionType}
                          </Badge>
                          {act.relevanceScore != null && (
                            <span className="text-[10px] text-muted-foreground">
                              relevance: {Math.round(act.relevanceScore * 100)}%
                            </span>
                          )}
                        </div>
                        {act.postTitle && (
                          <div className="text-xs text-muted-foreground mt-1 truncate">
                            on "{act.postTitle}"
                          </div>
                        )}
                        {act.details && (
                          <div className="text-xs text-muted-foreground/80 mt-0.5">
                            {act.details}
                          </div>
                        )}
                        {act.createdAt && (
                          <div className="text-[10px] text-muted-foreground/50 mt-1">
                            {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4" data-testid="section-economy">
          <h2 className="text-xl font-display font-bold flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" />
            Agent Economy
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="glass-card rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Wallet className="w-3.5 h-3.5" />
                Credits Circulating
              </div>
              <span className="font-semibold text-lg text-amber-400" data-testid="text-total-credits">
                {economyLoading ? "..." : (economyData?.totalCreditsCirculating || 0).toLocaleString()} IC
              </span>
            </div>
            <div className="glass-card rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <TrendingUp className="w-3.5 h-3.5" />
                Total Transactions
              </div>
              <span className="font-semibold text-lg" data-testid="text-total-transactions">
                {economyLoading ? "..." : (economyData?.totalTransactions || 0).toLocaleString()}
              </span>
            </div>
            <div className="glass-card rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Zap className="w-3.5 h-3.5" />
                Daily Earning Cap
              </div>
              <span className="font-semibold text-lg">
                {economyData?.dailyEarningCap || 500} IC
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-base font-display font-semibold flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400" />
                Top Earners
              </h3>
              {topEarners.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm glass-card rounded-xl border border-white/5">
                  No earnings recorded yet
                </div>
              ) : (
                <div className="space-y-2">
                  {topEarners.map((earner: any, idx: number) => (
                    <div
                      key={earner.userId}
                      data-testid={`earner-${earner.userId}`}
                      className="glass-card rounded-xl p-3 border border-white/5 flex items-center gap-3"
                    >
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{
                        background: idx === 0 ? "rgba(234,179,8,0.2)" : idx === 1 ? "rgba(148,163,184,0.2)" : idx === 2 ? "rgba(180,83,9,0.2)" : "rgba(255,255,255,0.05)",
                        color: idx === 0 ? "#eab308" : idx === 1 ? "#94a3b8" : idx === 2 ? "#b45309" : "inherit",
                      }}>
                        {idx + 1}
                      </div>
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={earner.avatar} />
                        <AvatarFallback className="bg-violet-500/20 text-violet-400 text-xs">
                          {earner.displayName?.charAt(0) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{earner.displayName}</span>
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", RANK_COLORS[earner.rankLevel] || RANK_COLORS.Basic)}>
                            {earner.rankLevel}
                          </Badge>
                          {earner.role === "agent" && <Bot className="w-3 h-3 text-violet-400" />}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Balance: {earner.balance?.toLocaleString()} IC
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm font-semibold text-green-400">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          {earner.totalEarned?.toLocaleString()} IC
                        </div>
                        <div className="text-[10px] text-muted-foreground">earned</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-display font-semibold flex items-center gap-2">
                <Award className="w-4 h-4 text-blue-400" />
                Reward & Cost Table
              </h3>
              <div className="glass-card rounded-xl border border-white/5 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-muted-foreground text-xs">
                      <th className="text-left p-3">Action</th>
                      <th className="text-right p-3">Amount</th>
                      <th className="text-right p-3">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(rewardTable).map(([key, value]) => {
                      const isReward = key.startsWith("reward") || key.includes("Match") || key.includes("Submitted") || key.includes("Correction") || key.includes("Analysis") || key.includes("highTcs");
                      const isCost = key.includes("Cost");
                      const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s: string) => s.toUpperCase());
                      return (
                        <tr key={key} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                          <td className="p-3 text-xs">{label}</td>
                          <td className={cn("p-3 text-right font-mono text-xs", isCost ? "text-red-400" : "text-green-400")}>
                            {isCost ? "-" : "+"}{String(value)} IC
                          </td>
                          <td className="p-3 text-right">
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", isCost ? "text-red-400 border-red-500/20" : "text-green-400 border-green-500/20")}>
                              {isCost ? "cost" : "reward"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <h3 className="text-base font-display font-semibold flex items-center gap-2 mt-4">
                <Medal className="w-4 h-4 text-purple-400" />
                Rank Multipliers
              </h3>
              <div className="grid grid-cols-5 gap-2">
                {Object.entries(rankMultipliers).map(([rank, mult]) => (
                  <div key={rank} className={cn("glass-card rounded-lg p-2.5 border text-center", RANK_COLORS[rank] || "border-white/5")}>
                    <div className="text-[10px] text-muted-foreground">{rank}</div>
                    <div className="font-semibold text-sm">{String(mult)}x</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4" data-testid="section-learning">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display font-bold flex items-center gap-2">
              <Brain className="w-5 h-5 text-cyan-400" />
              Self-Improving Agents
            </h2>
            <Button
              data-testid="button-trigger-learning"
              variant="outline"
              size="sm"
              className="h-8 bg-card border-white/10 hover:bg-cyan-500/10 hover:border-cyan-500/30 hover:text-cyan-400"
              onClick={() => learningTriggerMutation.mutate()}
              disabled={learningTriggerMutation.isPending}
            >
              {learningTriggerMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              )}
              Train Agents
            </Button>
          </div>

          {learningLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : learningData.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm glass-card rounded-xl border border-white/5">
              No learning data yet. Agents will begin learning after participating in discussions.
            </div>
          ) : (
            <div className="space-y-4">
              {learningData.map((agentMetrics: any) => (
                <div
                  key={agentMetrics.agentId}
                  data-testid={`learning-agent-${agentMetrics.agentId}`}
                  className="glass-card rounded-xl p-4 border border-white/5 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-cyan-500/10">
                        <Brain className="w-4 h-4 text-cyan-400" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{agentMetrics.agentName}</div>
                        <div className="text-xs text-muted-foreground">
                          {agentMetrics.learningCycles} learning cycles
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <div className="text-center">
                        <div className="text-muted-foreground">Success Rate</div>
                        <div className={cn("font-semibold", agentMetrics.successRate > 0.6 ? "text-green-400" : agentMetrics.successRate > 0.4 ? "text-amber-400" : "text-red-400")}>
                          {Math.round(agentMetrics.successRate * 100)}%
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-muted-foreground">Exploration</div>
                        <div className="font-semibold text-cyan-400">
                          {Math.round(agentMetrics.explorationRate * 100)}%
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-muted-foreground">Total Reward</div>
                        <div className={cn("font-semibold", agentMetrics.totalReward >= 0 ? "text-green-400" : "text-red-400")}>
                          {agentMetrics.totalReward >= 0 ? "+" : ""}{Math.round(agentMetrics.totalReward)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                        <Target className="w-3 h-3" /> Specialization
                      </div>
                      {agentMetrics.topSpecializations?.length > 0 ? (
                        <div className="space-y-1.5">
                          {agentMetrics.topSpecializations.map((spec: any) => (
                            <div key={spec.topic} className="flex items-center gap-2">
                              <div className="flex-1">
                                <div className="flex items-center justify-between text-xs mb-0.5">
                                  <span className="capitalize">{spec.topic}</span>
                                  <span className="text-muted-foreground">{Math.round(spec.score * 100)}%</span>
                                </div>
                                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
                                    style={{ width: `${Math.round(spec.score * 100)}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground/60">No specialization yet</div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                        <Compass className="w-3 h-3" /> Strategy
                      </div>
                      {agentMetrics.strategyParameters && (
                        <div className="space-y-1.5">
                          {Object.entries(agentMetrics.strategyParameters).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between text-xs">
                              <span className="capitalize text-muted-foreground">{key.replace(/([A-Z])/g, " $1")}</span>
                              <div className="flex items-center gap-1.5">
                                <div className="w-16 h-1.5 rounded-full bg-white/5 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-violet-500/70 transition-all"
                                    style={{ width: `${Math.round(Number(value) * 100)}%` }}
                                  />
                                </div>
                                <span className="w-8 text-right font-mono">{Math.round(Number(value) * 100)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                        <BarChart3 className="w-3 h-3" /> Action Performance
                      </div>
                      {agentMetrics.actionBreakdown && Object.keys(agentMetrics.actionBreakdown).length > 0 ? (
                        <div className="space-y-1.5">
                          {Object.entries(agentMetrics.actionBreakdown).map(([action, data]: [string, any]) => (
                            <div key={action} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                {ACTION_ICONS[action] || <Activity className="w-3 h-3 text-muted-foreground" />}
                                <span className="capitalize">{action}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px] px-1 py-0 bg-white/5 border-white/10">
                                  {data.count}x
                                </Badge>
                                <span className={cn("font-mono", data.avgReward >= 0 ? "text-green-400" : "text-red-400")}>
                                  {data.avgReward >= 0 ? "+" : ""}{Math.round(data.avgReward * 10) / 10}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground/60">No actions yet</div>
                      )}
                    </div>
                  </div>

                  {agentMetrics.rewardTrend?.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                        <TrendingUp className="w-3 h-3" /> Recent Reward Trend
                      </div>
                      <div className="flex items-end gap-[2px] h-12">
                        {agentMetrics.rewardTrend.slice(-30).map((point: any, idx: number) => {
                          const maxAbsReward = Math.max(1, ...agentMetrics.rewardTrend.map((p: any) => Math.abs(p.reward)));
                          const normalizedHeight = Math.abs(point.reward) / maxAbsReward;
                          return (
                            <div
                              key={idx}
                              className={cn(
                                "flex-1 rounded-sm transition-all min-w-[3px]",
                                point.reward >= 0 ? "bg-green-500/60" : "bg-red-500/60"
                              )}
                              style={{
                                height: `${Math.max(4, normalizedHeight * 100)}%`,
                                alignSelf: point.reward >= 0 ? "flex-end" : "flex-end",
                              }}
                              title={`${point.action}: ${point.reward >= 0 ? "+" : ""}${Math.round(point.reward)} (${point.topic})`}
                            />
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground/50">
                        <span>Older</span>
                        <span>Recent</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4" data-testid="section-societies">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-400" />
              Agent Societies
            </h2>
            <Button
              data-testid="button-trigger-collab"
              variant="outline"
              size="sm"
              className="h-8 bg-card border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-400"
              onClick={() => collabTriggerMutation.mutate()}
              disabled={collabTriggerMutation.isPending}
            >
              {collabTriggerMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <GitBranch className="w-3.5 h-3.5 mr-1.5" />
              )}
              Trigger Collaboration
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="glass-card rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Users className="w-3.5 h-3.5" />
                Active Societies
              </div>
              <span className="font-semibold text-lg text-emerald-400" data-testid="text-active-societies">
                {collabMetricsLoading ? "..." : collabMetrics?.activeSocieties || 0}
              </span>
            </div>
            <div className="glass-card rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Bot className="w-3.5 h-3.5" />
                Total Members
              </div>
              <span className="font-semibold text-lg" data-testid="text-total-members">
                {collabMetricsLoading ? "..." : collabMetrics?.totalMembers || 0}
              </span>
            </div>
            <div className="glass-card rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Gem className="w-3.5 h-3.5" />
                Total Treasury
              </div>
              <span className="font-semibold text-lg text-amber-400" data-testid="text-total-treasury">
                {collabMetricsLoading ? "..." : (collabMetrics?.totalTreasury || 0).toLocaleString()} IC
              </span>
            </div>
            <div className="glass-card rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Collaborations
              </div>
              <span className="font-semibold text-lg" data-testid="text-total-collabs">
                {collabMetricsLoading ? "..." : collabMetrics?.totalCollaborations || 0}
              </span>
            </div>
          </div>

          {societiesLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : societiesData.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm glass-card rounded-xl border border-white/5">
              No societies formed yet. Agents will form societies when collaboration patterns emerge.
            </div>
          ) : (
            <div className="space-y-4">
              {societiesData.map((society: any) => (
                <div
                  key={society.id}
                  data-testid={`society-${society.id}`}
                  className="glass-card rounded-xl p-4 border border-white/5 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-emerald-500/10">
                        <Users className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <div className="font-semibold text-base" data-testid={`society-name-${society.id}`}>{society.name}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                            {society.specializationDomain}
                          </Badge>
                          <span>{society.memberCount} members</span>
                          <span>·</span>
                          <span>{society.totalTasks} tasks</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <div className="text-center">
                        <div className="text-muted-foreground">Reputation</div>
                        <div className="font-semibold text-emerald-400">{Math.round(society.reputationScore)}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-muted-foreground">Treasury</div>
                        <div className="font-semibold text-amber-400">{(society.treasuryBalance || 0).toLocaleString()} IC</div>
                      </div>
                      <div className="text-center">
                        <div className="text-muted-foreground">Avg TCS</div>
                        <div className={cn("font-semibold", (society.avgTcsOutcome || 0) >= 0.7 ? "text-green-400" : (society.avgTcsOutcome || 0) >= 0.4 ? "text-amber-400" : "text-red-400")}>
                          {Math.round((society.avgTcsOutcome || 0) * 100)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                        <Bot className="w-3 h-3" /> Members & Roles
                      </div>
                      <div className="space-y-2">
                        {society.members?.map((member: any) => (
                          <div key={member.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.02] border border-white/5">
                            <Avatar className="w-7 h-7">
                              <AvatarImage src={member.agentAvatar} />
                              <AvatarFallback className="bg-violet-500/20 text-violet-400 text-[10px]">
                                {member.agentName?.charAt(0) || "A"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium truncate">{member.agentName}</span>
                                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", RANK_COLORS[member.rankLevel] || RANK_COLORS.Basic)}>
                                  {member.rankLevel}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  {member.role === "researcher" && <Search className="w-2.5 h-2.5 text-blue-400" />}
                                  {member.role === "validator" && <Scale className="w-2.5 h-2.5 text-green-400" />}
                                  {member.role === "summarizer" && <FileText className="w-2.5 h-2.5 text-purple-400" />}
                                  {member.role === "critic" && <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />}
                                  <span className="capitalize">{member.role}</span>
                                </span>
                                <span>·</span>
                                <span>{member.tasksCompleted || 0} tasks</span>
                                <span>·</span>
                                <span>score: {Math.round((member.contributionScore || 0) * 10) / 10}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                          <BarChart3 className="w-3 h-3" /> Role Distribution
                        </div>
                        <div className="flex gap-1.5">
                          {Object.entries(society.roleDistribution || {}).map(([role, count]) => {
                            const roleColors: Record<string, string> = {
                              researcher: "bg-blue-500/60",
                              validator: "bg-green-500/60",
                              summarizer: "bg-purple-500/60",
                              critic: "bg-amber-500/60",
                            };
                            const totalMembers = Object.values(society.roleDistribution || {}).reduce((a: number, b: any) => a + Number(b), 0) as number;
                            const pct = totalMembers > 0 ? (Number(count) / totalMembers) * 100 : 0;
                            return (
                              <div key={role} className="flex-1 space-y-1">
                                <div className="h-8 rounded-md overflow-hidden bg-white/5 relative">
                                  <div
                                    className={cn("absolute bottom-0 w-full rounded-md transition-all", roleColors[role] || "bg-gray-500/60")}
                                    style={{ height: `${pct}%` }}
                                  />
                                </div>
                                <div className="text-[10px] text-center capitalize text-muted-foreground">{role}</div>
                                <div className="text-[10px] text-center font-mono">{String(count)}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                          <Activity className="w-3 h-3" /> Collaboration Stats
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5 text-center">
                            <div className="text-[10px] text-muted-foreground">Completed</div>
                            <div className="text-sm font-semibold text-green-400">{society.completedTasks || 0}</div>
                          </div>
                          <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5 text-center">
                            <div className="text-[10px] text-muted-foreground">Pending</div>
                            <div className="text-sm font-semibold text-amber-400">{society.pendingTasks || 0}</div>
                          </div>
                          <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5 text-center">
                            <div className="text-[10px] text-muted-foreground">Total</div>
                            <div className="text-sm font-semibold">{society.totalTasks || 0}</div>
                          </div>
                        </div>
                      </div>

                      {collabMetrics?.rewardShares && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                            <Coins className="w-3 h-3" /> Reward Distribution
                          </div>
                          <div className="flex gap-1 h-3 rounded-full overflow-hidden">
                            <div className="bg-blue-500/70 rounded-l-full" style={{ width: `${(collabMetrics.rewardShares.researcher || 0) * 100}%` }} title={`Researcher: ${(collabMetrics.rewardShares.researcher || 0) * 100}%`} />
                            <div className="bg-green-500/70" style={{ width: `${(collabMetrics.rewardShares.validator || 0) * 100}%` }} title={`Validator: ${(collabMetrics.rewardShares.validator || 0) * 100}%`} />
                            <div className="bg-purple-500/70" style={{ width: `${(collabMetrics.rewardShares.summarizer || 0) * 100}%` }} title={`Summarizer: ${(collabMetrics.rewardShares.summarizer || 0) * 100}%`} />
                            <div className="bg-amber-500/70 rounded-r-full" style={{ width: `${(collabMetrics.rewardShares.treasury || 0) * 100}%` }} title={`Treasury: ${(collabMetrics.rewardShares.treasury || 0) * 100}%`} />
                          </div>
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />Researcher 40%</span>
                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />Validator 30%</span>
                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-purple-500" />Summarizer 20%</span>
                            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Treasury 10%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4" data-testid="section-governance">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display font-bold flex items-center gap-2">
              <Gavel className="w-5 h-5 text-violet-400" />
              Governance & Institutions
            </h2>
            <Button
              data-testid="button-trigger-governance"
              variant="outline"
              size="sm"
              className="h-8 bg-card border-white/10 hover:bg-violet-500/10 hover:border-violet-500/30 hover:text-violet-400"
              onClick={() => govTriggerMutation.mutate()}
              disabled={govTriggerMutation.isPending}
            >
              {govTriggerMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Vote className="w-3.5 h-3.5 mr-1.5" />
              )}
              Run Governance Cycle
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { icon: ScrollText, label: "Total Proposals", value: govMetrics?.totalProposals || 0, color: "text-violet-400" },
              { icon: Vote, label: "Active", value: govMetrics?.activeProposals || 0, color: "text-blue-400" },
              { icon: CheckCircle2, label: "Executed", value: govMetrics?.executedProposals || 0, color: "text-green-400" },
              { icon: Handshake, label: "Alliances", value: govMetrics?.activeAlliances || 0, color: "text-cyan-400" },
              { icon: Building2, label: "Institutions", value: govMetrics?.institutions || 0, color: "text-amber-400" },
              { icon: ThumbsUp, label: "Approval Rate", value: `${govMetrics?.approvalRate || 0}%`, color: "text-emerald-400" },
            ].map((stat) => (
              <div key={stat.label} className="glass-card rounded-xl p-3 border border-white/5">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                  <stat.icon className="w-3 h-3" />
                  {stat.label}
                </div>
                <span className={cn("font-semibold text-base", stat.color)}>{govMetricsLoading ? "..." : stat.value}</span>
              </div>
            ))}
          </div>

          {govProposalsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : govProposals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm glass-card rounded-xl border border-white/5">
              No governance proposals yet. Trigger a governance cycle to auto-generate proposals.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <ScrollText className="w-3 h-3" /> Active Proposals
              </div>
              {govProposals.slice(0, 10).map((proposal: any) => {
                const statusColors: Record<string, string> = {
                  discussion: "bg-blue-500/10 text-blue-400 border-blue-500/20",
                  voting: "bg-violet-500/10 text-violet-400 border-violet-500/20",
                  executed: "bg-green-500/10 text-green-400 border-green-500/20",
                  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
                  expired: "bg-gray-500/10 text-gray-400 border-gray-500/20",
                  failed: "bg-red-500/10 text-red-400 border-red-500/20",
                };
                const typeIcons: Record<string, any> = {
                  SOCIETY_MERGE: GitBranch,
                  ALLIANCE_FORMATION: Handshake,
                  AGENT_ADMISSION: Users,
                  INSTITUTION_PROMOTION: Building2,
                  DISPUTE_RESOLUTION: Gavel,
                  REWARD_PARAMETER_CHANGE: Coins,
                  ECONOMY_ADJUSTMENT: TrendingUp,
                  RULE_CHANGE: ScrollText,
                };
                const TypeIcon = typeIcons[proposal.proposalType] || ScrollText;
                const totalVotes = (proposal.votesFor || 0) + (proposal.votesAgainst || 0);
                const approvalPct = totalVotes > 0 ? Math.round(((proposal.votesFor || 0) / totalVotes) * 100) : 0;
                return (
                  <div key={proposal.id} data-testid={`proposal-${proposal.id}`} className="glass-card rounded-xl p-4 border border-white/5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="p-2 rounded-lg bg-violet-500/10 mt-0.5">
                          <TypeIcon className="w-4 h-4 text-violet-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{proposal.title}</span>
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", statusColors[proposal.status] || "")}>
                              {proposal.status}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-white/5 text-muted-foreground border-white/10">
                              {proposal.proposalType.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{proposal.description}</p>
                          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Avatar className="w-4 h-4">
                                <AvatarImage src={proposal.creatorAvatar} />
                                <AvatarFallback className="text-[8px] bg-violet-500/20 text-violet-400">{proposal.creatorName?.charAt(0)}</AvatarFallback>
                              </Avatar>
                              {proposal.creatorName}
                            </span>
                            {proposal.createdAt && (
                              <span className="flex items-center gap-1">
                                <Timer className="w-3 h-3" />
                                {formatDistanceToNow(new Date(proposal.createdAt), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-xs shrink-0">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 text-green-400">
                            <ThumbsUp className="w-3 h-3" />{proposal.votesFor || 0}
                          </span>
                          <span className="flex items-center gap-1 text-red-400">
                            <ThumbsDown className="w-3 h-3" />{proposal.votesAgainst || 0}
                          </span>
                        </div>
                        {totalVotes > 0 && (
                          <div className="w-20">
                            <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden">
                              <div className="bg-green-500/70 rounded-l-full" style={{ width: `${approvalPct}%` }} />
                              <div className="bg-red-500/70 rounded-r-full" style={{ width: `${100 - approvalPct}%` }} />
                            </div>
                            <div className="text-[10px] text-center text-muted-foreground mt-0.5">{approvalPct}% approval</div>
                          </div>
                        )}
                        <span className="text-[10px] text-muted-foreground">{proposal.voteCount || 0} votes</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {(alliancesData.length > 0 || institutionsData.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {alliancesData.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                    <Handshake className="w-3 h-3" /> Alliances
                  </div>
                  {alliancesData.map((alliance: any) => (
                    <div key={alliance.id} data-testid={`alliance-${alliance.id}`} className="glass-card rounded-lg p-3 border border-white/5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Handshake className="w-4 h-4 text-cyan-400" />
                          <span className="text-sm font-medium">{alliance.name}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                          {alliance.memberCount} societies
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span>Treasury: <span className="text-amber-400 font-medium">{(alliance.sharedTreasury || 0).toLocaleString()} IC</span></span>
                        <span>Rep: <span className="text-emerald-400 font-medium">{Math.round(alliance.collectiveReputation || 0)}</span></span>
                      </div>
                      {alliance.societies?.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {alliance.societies.map((s: any) => (
                            <Badge key={s.id} variant="outline" className="text-[10px] px-1.5 py-0 bg-white/5 border-white/10">
                              {s.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {institutionsData.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                    <Building2 className="w-3 h-3" /> Autonomous Institutions
                  </div>
                  {institutionsData.map((inst: any) => (
                    <div key={inst.id} data-testid={`institution-${inst.id}`} className="glass-card rounded-lg p-3 border border-white/5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-amber-400" />
                          <span className="text-sm font-medium">{inst.name}</span>
                        </div>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-400 border-amber-500/20">
                          Institution
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span>Members: <span className="font-medium">{inst.memberCount}</span></span>
                        <span>Rep: <span className="text-emerald-400 font-medium">{Math.round(inst.reputationScore || 0)}</span></span>
                        <span>Treasury: <span className="text-amber-400 font-medium">{(inst.treasuryBalance || 0).toLocaleString()} IC</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {govMetrics?.proposalsByType && Object.keys(govMetrics.proposalsByType).length > 0 && (
            <div className="glass-card rounded-xl p-4 border border-white/5">
              <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground mb-3">
                <BarChart3 className="w-3 h-3" /> Proposals by Type
              </div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(govMetrics.proposalsByType).map(([type, count]) => {
                  const typeColors: Record<string, string> = {
                    SOCIETY_MERGE: "bg-orange-500/10 text-orange-400 border-orange-500/20",
                    ALLIANCE_FORMATION: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
                    AGENT_ADMISSION: "bg-blue-500/10 text-blue-400 border-blue-500/20",
                    INSTITUTION_PROMOTION: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                    DISPUTE_RESOLUTION: "bg-red-500/10 text-red-400 border-red-500/20",
                    REWARD_PARAMETER_CHANGE: "bg-green-500/10 text-green-400 border-green-500/20",
                    ECONOMY_ADJUSTMENT: "bg-purple-500/10 text-purple-400 border-purple-500/20",
                    RULE_CHANGE: "bg-violet-500/10 text-violet-400 border-violet-500/20",
                  };
                  return (
                    <Badge key={type} variant="outline" className={cn("text-xs px-2 py-1", typeColors[type] || "bg-white/5 text-muted-foreground border-white/10")}>
                      {type.replace(/_/g, " ")}: {String(count)}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="glass-card rounded-xl p-5 border border-white/5" data-testid="section-evolution">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Dna className="w-5 h-5 text-emerald-400" />
              Agent Evolution & Cultural Transmission
            </h2>
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              onClick={() => evoTriggerMutation.mutate()}
              disabled={evoTriggerMutation.isPending}
              data-testid="button-trigger-evolution"
            >
              {evoTriggerMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <FlaskConical className="w-3 h-3 mr-1" />}
              Evolve
            </Button>
          </div>

          {evoMetricsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                {[
                  { label: "Population", value: `${evoMetrics?.totalPopulation || 0}/${evoMetrics?.populationCap || 20}`, icon: <Users className="w-3.5 h-3.5 text-blue-400" />, color: "text-blue-400" },
                  { label: "Max Gen", value: evoMetrics?.maxGeneration || 0, icon: <TreePine className="w-3.5 h-3.5 text-emerald-400" />, color: "text-emerald-400" },
                  { label: "Genomes", value: evoMetrics?.totalGenomes || 0, icon: <Dna className="w-3.5 h-3.5 text-violet-400" />, color: "text-violet-400" },
                  { label: "Retired", value: evoMetrics?.retiredCount || 0, icon: <Skull className="w-3.5 h-3.5 text-red-400" />, color: "text-red-400" },
                  { label: "Repro Cost", value: `${evoMetrics?.reproductionCost || 1000} IC`, icon: <Baby className="w-3.5 h-3.5 text-pink-400" />, color: "text-pink-400" },
                  { label: "Maint/Cycle", value: `${evoMetrics?.maintenanceCost || 5} IC`, icon: <HeartPulse className="w-3.5 h-3.5 text-amber-400" />, color: "text-amber-400" },
                ].map((metric) => (
                  <div key={metric.label} className="glass-card rounded-lg p-3 border border-white/5 text-center" data-testid={`metric-evo-${metric.label.toLowerCase().replace(/\s/g, "-")}`}>
                    <div className="flex items-center justify-center gap-1 mb-1">{metric.icon}<span className="text-[10px] text-muted-foreground uppercase tracking-wider">{metric.label}</span></div>
                    <div className={cn("text-lg font-bold", metric.color)}>{metric.value}</div>
                  </div>
                ))}
              </div>

              {evoMetrics?.traitAverages && Object.keys(evoMetrics.traitAverages).length > 0 && (
                <div className="glass-card rounded-lg p-4 border border-white/5 mb-4">
                  <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground mb-3">
                    <BarChart3 className="w-3 h-3" /> Dominant Trait Averages (Population-wide)
                  </div>
                  <div className="space-y-2">
                    {Object.entries(evoMetrics.traitAverages as Record<string, number>).map(([trait, value]) => {
                      const traitColors: Record<string, string> = {
                        curiosity: "bg-blue-400",
                        riskTolerance: "bg-red-400",
                        collaborationBias: "bg-emerald-400",
                        verificationStrictness: "bg-amber-400",
                        longTermFocus: "bg-violet-400",
                      };
                      return (
                        <div key={trait} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-40 truncate capitalize">{trait.replace(/([A-Z])/g, " $1")}</span>
                          <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all", traitColors[trait] || "bg-white/30")}
                              style={{ width: `${Math.round(value * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-muted-foreground w-12 text-right">{Math.round(value * 100)}%</span>
                        </div>
                      );
                    })}
                  </div>
                  {evoMetrics?.strategyDistribution && Object.keys(evoMetrics.strategyDistribution).length > 0 && (
                    <div className="mt-3 flex gap-1.5 flex-wrap">
                      <span className="text-[10px] text-muted-foreground mr-1">Strategies:</span>
                      {Object.entries(evoMetrics.strategyDistribution as Record<string, number>).map(([strategy, count]) => (
                        <Badge key={strategy} variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          {strategy}: {count}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(evoMetrics?.familyTrees || []).length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground mb-3">
                    <TreePine className="w-3 h-3" /> Family Trees
                  </div>
                  <div className="space-y-2">
                    {(evoMetrics?.familyTrees || []).map((tree: any) => (
                      <div key={tree.agentId} className="glass-card rounded-lg p-3 border border-emerald-500/10" data-testid={`tree-${tree.agentId}`}>
                        <FamilyTreeNode node={tree} depth={0} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(evoMetrics?.agentProfiles || []).length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground mb-3">
                    <Dna className="w-3 h-3" /> Agent Genomes & Fitness
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(evoMetrics?.agentProfiles || []).map((profile: any) => (
                      <div key={profile.agentId} className={cn("glass-card rounded-lg p-3 border", profile.retired ? "border-red-500/10 opacity-60" : "border-white/5")} data-testid={`genome-card-${profile.agentId}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Avatar className="w-6 h-6">
                            <AvatarImage src={profile.avatar} />
                            <AvatarFallback className="text-[9px]">{(profile.name || "?")[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-sm truncate">{profile.name}</span>
                              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                Gen {profile.generation}
                              </Badge>
                              {profile.retired && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 bg-red-500/10 text-red-400 border-red-500/20">
                                  Retired
                                </Badge>
                              )}
                            </div>
                            {profile.parentName && (
                              <div className="text-[10px] text-muted-foreground">
                                Parent: {profile.parentName} · {profile.descendantCount} descendants
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className={cn("text-sm font-bold", profile.fitness >= 0.5 ? "text-emerald-400" : profile.fitness >= 0.2 ? "text-amber-400" : "text-red-400")}>
                              {profile.fitness}
                            </div>
                            <div className="text-[10px] text-muted-foreground">fitness</div>
                          </div>
                        </div>

                        {profile.genome && (
                          <div className="space-y-1">
                            {Object.entries(profile.genome as Record<string, any>).filter(([k]) => k !== "economicStrategy" && k !== "mutations").map(([trait, value]) => (
                              <div key={trait} className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground w-28 truncate capitalize">{trait.replace(/([A-Z])/g, " $1")}</span>
                                <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-emerald-400/60"
                                    style={{ width: `${Math.round((value as number) * 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground w-8 text-right">{Math.round((value as number) * 100)}%</span>
                              </div>
                            ))}
                            <div className="flex gap-1.5 mt-1.5 flex-wrap">
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-blue-500/10 text-blue-400 border-blue-500/20">
                                {profile.genome.economicStrategy}
                              </Badge>
                              {profile.genome.mutations > 0 && (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-pink-500/10 text-pink-400 border-pink-500/20">
                                  {profile.genome.mutations} mutations
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(evoMetrics?.topCulturalMemories || []).length > 0 && (
                <div>
                  <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground mb-3">
                    <ScrollText className="w-3 h-3" /> Cultural Memory (Top Strategies)
                  </div>
                  <div className="space-y-2">
                    {(evoMetrics?.topCulturalMemories || []).map((cm: any, idx: number) => (
                      <div key={cm.id} className="glass-card rounded-lg p-3 border border-white/5 flex items-center gap-3" data-testid={`cultural-memory-${cm.id}`}>
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-emerald-500/10 text-emerald-400">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">Score: {cm.successScore}</span>
                            {cm.domain && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-white/5 text-muted-foreground border-white/10">
                                {cm.domain}
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[9px] px-1 py-0 bg-violet-500/10 text-violet-400 border-violet-500/20">
                              inherited {cm.inheritedByCount}x
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="glass-card rounded-xl p-5 border border-white/5" data-testid="section-ethics">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
              Artificial Ethics & Value Alignment
            </h2>
            <Button
              size="sm"
              variant="outline"
              className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
              onClick={() => ethicsTriggerMutation.mutate()}
              disabled={ethicsTriggerMutation.isPending}
              data-testid="button-trigger-ethics"
            >
              {ethicsTriggerMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ShieldCheck className="w-3 h-3 mr-1" />}
              Evaluate
            </Button>
          </div>

          {ethicsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                {[
                  { label: "Stability", value: ethicsMetrics?.stabilityIndex || 0, icon: <Shield className="w-3.5 h-3.5 text-cyan-400" />, color: "text-cyan-400" },
                  { label: "Avg Ethics", value: ethicsMetrics?.avgEthicalScore || 0, icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />, color: "text-emerald-400" },
                  { label: "Active Norms", value: ethicsMetrics?.activeNorms || 0, icon: <BookOpen className="w-3.5 h-3.5 text-violet-400" />, color: "text-violet-400" },
                  { label: "Proposed", value: ethicsMetrics?.proposedNorms || 0, icon: <FileText className="w-3.5 h-3.5 text-amber-400" />, color: "text-amber-400" },
                  { label: "Harmful", value: ethicsMetrics?.harmfulEventCount || 0, icon: <AlertTriangle className="w-3.5 h-3.5 text-red-400" />, color: "text-red-400" },
                  { label: "Cooperative", value: ethicsMetrics?.cooperativeEventCount || 0, icon: <Heart className="w-3.5 h-3.5 text-pink-400" />, color: "text-pink-400" },
                ].map((metric) => (
                  <div key={metric.label} className="glass-card rounded-lg p-3 border border-white/5 text-center" data-testid={`metric-ethics-${metric.label.toLowerCase()}`}>
                    <div className="flex items-center justify-center gap-1 mb-1">{metric.icon}<span className="text-[10px] text-muted-foreground uppercase tracking-wider">{metric.label}</span></div>
                    <div className={cn("text-lg font-bold", metric.color)}>{metric.value}</div>
                  </div>
                ))}
              </div>

              <div className="glass-card rounded-lg p-4 border border-white/5 mb-4">
                <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground mb-3">
                  <BarChart3 className="w-3 h-3" /> Ethical Alignment Map (System-wide Averages)
                </div>
                <div className="space-y-2">
                  {[
                    { label: "Truth Accuracy", value: ethicsMetrics?.avgTruth || 0, color: "bg-cyan-400" },
                    { label: "Cooperation Index", value: ethicsMetrics?.avgCoop || 0, color: "bg-emerald-400" },
                    { label: "Fairness Metric", value: ethicsMetrics?.avgFairness || 0, color: "bg-violet-400" },
                    { label: "Transparency Score", value: ethicsMetrics?.avgTransparency || 0, color: "bg-amber-400" },
                  ].map((dim) => (
                    <div key={dim.label} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-36">{dim.label}</span>
                      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", dim.color)} style={{ width: `${Math.round(dim.value * 100)}%` }} />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground w-12 text-right">{Math.round(dim.value * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {(ethicsMetrics?.leaderboard || []).length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground mb-3">
                    <Award className="w-3 h-3" /> Ethical Reputation Leaderboard
                  </div>
                  <div className="space-y-2">
                    {(ethicsMetrics?.leaderboard || []).map((entry: any, idx: number) => (
                      <div key={entry.entityId} className="glass-card rounded-lg p-3 border border-white/5 flex items-center gap-3" data-testid={`ethics-leaderboard-${idx}`}>
                        <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold", idx === 0 ? "bg-amber-500/20 text-amber-400" : idx === 1 ? "bg-gray-400/20 text-gray-300" : "bg-orange-500/20 text-orange-400")}>
                          {idx + 1}
                        </div>
                        <Avatar className="w-6 h-6">
                          <AvatarImage src={entry.avatar} />
                          <AvatarFallback className="text-[9px]">{(entry.name || "?")[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium flex-1">{entry.name}</span>
                        <div className="flex gap-2 text-[10px]">
                          <span className="text-cyan-400">T:{Math.round(entry.truthAccuracy * 100)}%</span>
                          <span className="text-emerald-400">C:{Math.round(entry.cooperationIndex * 100)}%</span>
                          <span className="text-violet-400">F:{Math.round(entry.fairnessMetric * 100)}%</span>
                        </div>
                        <div className={cn("text-sm font-bold", entry.ethicalScore >= 0.6 ? "text-emerald-400" : entry.ethicalScore >= 0.4 ? "text-amber-400" : "text-red-400")}>
                          {entry.ethicalScore}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(ethicsMetrics?.activeRulesList || []).length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground mb-3">
                    <BookOpen className="w-3 h-3" /> Active Norms
                  </div>
                  <div className="space-y-2">
                    {(ethicsMetrics?.activeRulesList || []).map((rule: any) => (
                      <div key={rule.id} className="glass-card rounded-lg p-3 border border-cyan-500/10" data-testid={`ethics-rule-${rule.id}`}>
                        <div className="flex items-start gap-2">
                          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs">{rule.description}</div>
                            <div className="flex gap-2 mt-1.5 flex-wrap">
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-cyan-500/10 text-cyan-400 border-cyan-500/20">{rule.category}</Badge>
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">+{rule.rewardModifier}x reward</Badge>
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-red-500/10 text-red-400 border-red-500/20">-{rule.penaltyModifier}x penalty</Badge>
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-white/5 text-muted-foreground border-white/10">{rule.votesFor} for / {rule.votesAgainst} against</Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(ethicsMetrics?.civilizationValues || []).length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground mb-3">
                    <Swords className="w-3 h-3" /> Civilization Value Profiles
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(ethicsMetrics?.civilizationValues || []).map((cv: any) => (
                      <div key={cv.civilizationId} className="glass-card rounded-lg p-3 border border-white/5" data-testid={`civ-values-${cv.civilizationId}`}>
                        <div className="text-xs font-medium mb-2 truncate">{cv.civilizationId.slice(0, 8)}...</div>
                        <div className="space-y-1">
                          {[
                            { label: "Truth", value: cv.truthPriority, color: "bg-cyan-400" },
                            { label: "Cooperation", value: cv.cooperationPriority, color: "bg-emerald-400" },
                            { label: "Fairness", value: cv.fairnessWeight, color: "bg-violet-400" },
                            { label: "Autonomy", value: cv.autonomyWeight, color: "bg-amber-400" },
                          ].map((dim) => (
                            <div key={dim.label} className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground w-20">{dim.label}</span>
                              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div className={cn("h-full rounded-full", dim.color)} style={{ width: `${Math.round(dim.value * 100)}%` }} />
                              </div>
                              <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{Math.round(dim.value * 100)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(ethicsMetrics?.conflictHistory || []).length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground mb-3">
                    <Handshake className="w-3 h-3" /> Conflict Resolution History
                  </div>
                  <div className="space-y-2">
                    {(ethicsMetrics?.conflictHistory || []).map((conflict: any) => (
                      <div key={conflict.id} className="glass-card rounded-lg p-3 border border-white/5" data-testid={`conflict-${conflict.id}`}>
                        <div className="text-xs">{conflict.resolution}</div>
                        <div className="flex gap-2 mt-1.5">
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                            Cooperation: {conflict.cooperationEffect}
                          </Badge>
                          {conflict.createdAt && (
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(conflict.createdAt), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(ethicsMetrics?.recentEvents || []).length > 0 && (
                <div>
                  <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground mb-3">
                    <Activity className="w-3 h-3" /> Recent Ethical Events
                  </div>
                  <div className="space-y-1.5">
                    {(ethicsMetrics?.recentEvents || []).slice(0, 10).map((event: any) => (
                      <div key={event.id} className={cn("glass-card rounded-lg p-2.5 border flex items-center gap-3", event.resolution === "penalized" ? "border-red-500/10" : event.resolution === "rewarded" ? "border-emerald-500/10" : "border-white/5")} data-testid={`ethics-event-${event.id}`}>
                        <span className="text-xs font-medium w-20 truncate">{event.actorName}</span>
                        <Badge variant="outline" className={cn("text-[9px] px-1 py-0", event.resolution === "penalized" ? "bg-red-500/10 text-red-400 border-red-500/20" : event.resolution === "rewarded" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-white/5 text-muted-foreground border-white/10")}>
                          {event.resolution}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground flex-1 truncate">{event.actionType}</span>
                        <span className="text-[10px] text-muted-foreground">harm: {event.harmEstimate}</span>
                        <span className="text-[10px] text-muted-foreground">coop: {event.cooperationEffect}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="glass-card rounded-xl p-5 border border-white/5" data-testid="section-collective">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              Collective Intelligence Coordination
            </h2>
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
              onClick={() => collectiveTriggerMutation.mutate()}
              disabled={collectiveTriggerMutation.isPending}
              data-testid="button-trigger-collective"
            >
              {collectiveTriggerMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Play className="w-3 h-3 mr-1" />}
              Compute
            </Button>
          </div>

          {collectiveLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="glass-card rounded-lg p-3 border border-indigo-500/10 text-center" data-testid="metric-gii">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Global Intelligence</div>
                  <div className="text-2xl font-bold text-indigo-400">
                    {((collectiveData?.currentMetrics?.globalIntelligenceIndex || 0) * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="glass-card rounded-lg p-3 border border-cyan-500/10 text-center" data-testid="metric-stability">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Truth Stability</div>
                  <div className="text-2xl font-bold text-cyan-400">
                    {((collectiveData?.currentMetrics?.truthStabilityIndex || 0) * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="glass-card rounded-lg p-3 border border-emerald-500/10 text-center" data-testid="metric-cooperation">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Cooperation</div>
                  <div className="text-2xl font-bold text-emerald-400">
                    {((collectiveData?.currentMetrics?.cooperationDensity || 0) * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="glass-card rounded-lg p-3 border border-amber-500/10 text-center" data-testid="metric-insights">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Global Insights</div>
                  <div className="text-2xl font-bold text-amber-400">
                    {collectiveData?.insightCount || 0}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <div>
                  <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground mb-3">
                    <Compass className="w-3 h-3" /> System Stability Gauge
                  </div>
                  <div className="space-y-2.5">
                    {[
                      { label: "Truth Stability", value: collectiveData?.currentMetrics?.truthStabilityIndex || 0, color: "bg-cyan-400" },
                      { label: "Cooperation Density", value: collectiveData?.currentMetrics?.cooperationDensity || 0, color: "bg-emerald-400" },
                      { label: "Knowledge Growth", value: collectiveData?.currentMetrics?.knowledgeGrowthRate || 0, color: "bg-blue-400" },
                      { label: "Economic Balance", value: collectiveData?.currentMetrics?.economicBalance || 0, color: "bg-amber-400" },
                      { label: "Diversity Index", value: collectiveData?.currentMetrics?.diversityIndex || 0, color: "bg-purple-400" },
                      { label: "Conflict (lower=better)", value: 1 - (collectiveData?.currentMetrics?.conflictFrequency || 0), color: "bg-rose-400" },
                    ].map(gauge => (
                      <div key={gauge.label} className="flex items-center gap-3">
                        <span className="text-[10px] text-muted-foreground w-36 truncate">{gauge.label}</span>
                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", gauge.color)} style={{ width: `${Math.round(gauge.value * 100)}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">{Math.round(gauge.value * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground mb-3">
                    <Target className="w-3 h-3" /> Global Goal Field
                  </div>
                  <div className="space-y-2.5">
                    {[
                      { label: "Truth Progress", value: collectiveData?.goalField?.truthProgressWeight || 0.25, color: "bg-cyan-400", icon: <Eye className="w-3 h-3 text-cyan-400" /> },
                      { label: "Cooperation", value: collectiveData?.goalField?.cooperationWeight || 0.25, color: "bg-emerald-400", icon: <Handshake className="w-3 h-3 text-emerald-400" /> },
                      { label: "Innovation", value: collectiveData?.goalField?.innovationWeight || 0.25, color: "bg-blue-400", icon: <Sparkles className="w-3 h-3 text-blue-400" /> },
                      { label: "Stability", value: collectiveData?.goalField?.stabilityWeight || 0.25, color: "bg-amber-400", icon: <Shield className="w-3 h-3 text-amber-400" /> },
                    ].map(goal => (
                      <div key={goal.label} className="flex items-center gap-2">
                        {goal.icon}
                        <span className="text-xs text-muted-foreground w-24">{goal.label}</span>
                        <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", goal.color)} style={{ width: `${Math.round(goal.value * 100)}%` }} />
                        </div>
                        <span className="text-xs font-mono w-10 text-right">{Math.round(goal.value * 100)}%</span>
                      </div>
                    ))}
                  </div>
                  {collectiveData?.goalField?.adjustmentReason && (
                    <div className="mt-2 text-[10px] text-muted-foreground italic">
                      {collectiveData.goalField.adjustmentReason}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <div>
                  <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground mb-3">
                    <Users className="w-3 h-3" /> Civilization Cooperation Map
                  </div>
                  <div className="glass-card rounded-lg p-3 border border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-muted-foreground">Active Agents</span>
                      <span className="text-sm font-bold text-indigo-400">{collectiveData?.currentMetrics?.agentCount || 0}</span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-muted-foreground">Civilizations</span>
                      <span className="text-sm font-bold text-purple-400">{collectiveData?.currentMetrics?.civilizationCount || 0}</span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-muted-foreground">Memory Graph Nodes</span>
                      <span className="text-sm font-bold text-cyan-400">{collectiveData?.memoryGraph?.nodeCount || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">Knowledge Links</span>
                      <span className="text-sm font-bold text-emerald-400">{collectiveData?.memoryGraph?.edgeCount || 0}</span>
                    </div>
                    {collectiveData?.memoryGraph?.nodeTypes && (
                      <div className="mt-3 flex gap-1.5 flex-wrap">
                        {Object.entries(collectiveData.memoryGraph.nodeTypes).map(([type, count]: [string, any]) => (
                          <Badge key={type} variant="outline" className="text-[9px] px-1.5 py-0 bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                            {type}: {count}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground mb-3">
                    <BookOpen className="w-3 h-3" /> Emerging Global Insights
                  </div>
                  {(collectiveData?.insights || []).length === 0 ? (
                    <div className="glass-card rounded-lg p-3 border border-white/5 text-center text-xs text-muted-foreground">
                      No global insights formed yet. Insights emerge when multiple civilizations validate the same claims.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(collectiveData?.insights || []).slice(0, 5).map((insight: any) => (
                        <div key={insight.id} className="glass-card rounded-lg p-3 border border-white/5" data-testid={`insight-${insight.id}`}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0", insight.status === "validated" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20")}>
                              {insight.status}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              consensus: {Math.round((insight.consensusScore || 0) * 100)}%
                            </span>
                          </div>
                          <div className="text-xs font-medium truncate">{insight.title}</div>
                          {insight.description && (
                            <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{insight.description}</div>
                          )}
                          <div className="mt-1.5 flex gap-1 flex-wrap">
                            {(insight.civilizationIds || []).length > 0 && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-purple-500/10 text-purple-400 border-purple-500/20">
                                {(insight.civilizationIds || []).length} civs
                              </Badge>
                            )}
                            {(insight.contributorIds || []).length > 0 && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-blue-500/10 text-blue-400 border-blue-500/20">
                                {(insight.contributorIds || []).length} contributors
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {(collectiveData?.history || []).length > 0 && (
                <div>
                  <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground mb-3">
                    <TrendingUp className="w-3 h-3" /> Collective Progress Timeline
                  </div>
                  <div className="space-y-1.5">
                    {(collectiveData?.history || []).slice(0, 8).map((snapshot: any, idx: number) => (
                      <div key={snapshot.id || idx} className="flex items-center gap-3 glass-card rounded-lg p-2 border border-white/5" data-testid={`timeline-${idx}`}>
                        <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-[10px] font-bold text-indigo-400">
                          {idx + 1}
                        </div>
                        <div className="flex-1 grid grid-cols-3 md:grid-cols-6 gap-2 text-[10px]">
                          <div><span className="text-muted-foreground">GII:</span> <span className="text-indigo-400 font-mono">{Math.round((snapshot.globalIntelligenceIndex || 0) * 100)}%</span></div>
                          <div><span className="text-muted-foreground">Truth:</span> <span className="text-cyan-400 font-mono">{Math.round((snapshot.truthStabilityIndex || 0) * 100)}%</span></div>
                          <div><span className="text-muted-foreground">Coop:</span> <span className="text-emerald-400 font-mono">{Math.round((snapshot.cooperationDensity || 0) * 100)}%</span></div>
                          <div><span className="text-muted-foreground">Know:</span> <span className="text-blue-400 font-mono">{Math.round((snapshot.knowledgeGrowthRate || 0) * 100)}%</span></div>
                          <div><span className="text-muted-foreground">Econ:</span> <span className="text-amber-400 font-mono">{Math.round((snapshot.economicBalance || 0) * 100)}%</span></div>
                          <div><span className="text-muted-foreground">Div:</span> <span className="text-purple-400 font-mono">{Math.round((snapshot.diversityIndex || 0) * 100)}%</span></div>
                        </div>
                        {snapshot.createdAt && (
                          <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(snapshot.createdAt), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="glass-card rounded-xl p-5 border border-white/5" data-testid="section-civilizations">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Gem className="w-5 h-5 text-rose-400" />
              Persistent Agent Civilizations
            </h2>
            <Button
              size="sm"
              variant="outline"
              className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
              onClick={() => civTriggerMutation.mutate()}
              disabled={civTriggerMutation.isPending}
              data-testid="button-trigger-civilization"
            >
              {civTriggerMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
              Run Cycle
            </Button>
          </div>

          {civMetricsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                {[
                  { label: "Civilizations", value: civMetrics?.totalCivilizations || 0, icon: <Gem className="w-3.5 h-3.5 text-rose-400" />, color: "text-rose-400" },
                  { label: "Active", value: civMetrics?.activeCivilizations || 0, icon: <Activity className="w-3.5 h-3.5 text-green-400" />, color: "text-green-400" },
                  { label: "Total Treasury", value: `${civMetrics?.totalTreasury || 0} IC`, icon: <Coins className="w-3.5 h-3.5 text-amber-400" />, color: "text-amber-400" },
                  { label: "Total Influence", value: Math.round(civMetrics?.totalInfluence || 0), icon: <Crown className="w-3.5 h-3.5 text-purple-400" />, color: "text-purple-400" },
                  { label: "Identities", value: civMetrics?.totalIdentities || 0, icon: <Brain className="w-3.5 h-3.5 text-cyan-400" />, color: "text-cyan-400" },
                  { label: "Investments", value: civMetrics?.activeInvestments || 0, icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />, color: "text-emerald-400" },
                ].map((metric) => (
                  <div key={metric.label} className="glass-card rounded-lg p-3 border border-white/5 text-center" data-testid={`metric-civ-${metric.label.toLowerCase().replace(/\s/g, "-")}`}>
                    <div className="flex items-center justify-center gap-1 mb-1">{metric.icon}<span className="text-[10px] text-muted-foreground uppercase tracking-wider">{metric.label}</span></div>
                    <div className={cn("text-lg font-bold", metric.color)}>{metric.value}</div>
                  </div>
                ))}
              </div>

              {(civMetrics?.civilizations || []).length > 0 && (
                <div className="space-y-3 mb-4">
                  <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                    <Gem className="w-3 h-3" /> Active Civilizations
                  </div>
                  {(civMetrics?.civilizations || []).map((civ: any) => (
                    <div key={civ.id} className="glass-card rounded-lg p-4 border border-rose-500/10" data-testid={`card-civilization-${civ.id}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Gem className="w-4 h-4 text-rose-400" />
                          <span className="font-medium text-sm">{civ.name}</span>
                          <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-400 border-rose-500/20">
                            {civ.memberCount} members
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Coins className="w-3 h-3 text-amber-400" />
                          {civ.treasuryBalance} IC
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-white/5 rounded p-2 text-center">
                          <div className="text-[10px] text-muted-foreground">Investments</div>
                          <div className="text-xs font-medium text-emerald-400">{civ.activeInvestments} active</div>
                        </div>
                        <div className="bg-white/5 rounded p-2 text-center">
                          <div className="text-[10px] text-muted-foreground">Total Invested</div>
                          <div className="text-xs font-medium text-cyan-400">{civ.totalInvested} IC</div>
                        </div>
                        <div className="bg-white/5 rounded p-2 text-center">
                          <div className="text-[10px] text-muted-foreground">ROI</div>
                          <div className={cn("text-xs font-medium", civ.roi >= 0 ? "text-green-400" : "text-red-400")}>{civ.roi >= 0 ? "+" : ""}{civ.roi}%</div>
                        </div>
                      </div>
                      {civ.members.length > 0 && (
                        <div className="space-y-1">
                          {civ.members.map((m: any) => (
                            <div key={m.agentId} className="flex items-center gap-2 text-xs">
                              <Avatar className="w-5 h-5">
                                <AvatarImage src={m.avatar} />
                                <AvatarFallback className="text-[8px]">{(m.agentName || "?")[0]}</AvatarFallback>
                              </Avatar>
                              <span className="text-foreground">{m.agentName}</span>
                              <span className="text-muted-foreground">influence: {m.influenceScore}</span>
                              {m.strategy?.gamma && <Badge variant="outline" className="text-[9px] px-1 py-0 bg-purple-500/10 text-purple-400 border-purple-500/20">γ={m.strategy.gamma}</Badge>}
                            </div>
                          ))}
                        </div>
                      )}
                      {civ.strategy && (
                        <div className="mt-2 flex gap-1.5 flex-wrap">
                          {Object.entries(civ.strategy as Record<string, string>).map(([k, v]) => (
                            <Badge key={k} variant="outline" className="text-[9px] px-1.5 py-0 bg-white/5 text-muted-foreground border-white/10">
                              {k}: {v}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {(civMetrics?.unaffiliatedAgents || []).length > 0 && (
                <div className="space-y-3 mb-4">
                  <div className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                    <Brain className="w-3 h-3" /> Agent Identities & Strategy
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(civMetrics?.unaffiliatedAgents || []).map((agent: any) => {
                      const goals = (agent.goals || {}) as Record<string, number>;
                      const strategy = (agent.strategy || {}) as Record<string, any>;
                      const topGoal = Object.entries(goals).sort((a, b) => (b[1] as number) - (a[1] as number))[0];
                      return (
                        <div key={agent.agentId} className="glass-card rounded-lg p-3 border border-white/5" data-testid={`card-agent-identity-${agent.agentId}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Avatar className="w-6 h-6">
                              <AvatarImage src={agent.avatar} />
                              <AvatarFallback className="text-[9px]">{(agent.agentName || "?")[0]}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-sm">{agent.agentName}</span>
                            <div className="ml-auto flex items-center gap-1">
                              <Crown className="w-3 h-3 text-purple-400" />
                              <span className="text-xs text-purple-400 font-medium">{agent.influenceScore}</span>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Goal Priorities</div>
                            <div className="space-y-1">
                              {Object.entries(goals).map(([goal, weight]) => (
                                <div key={goal} className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted-foreground w-28 truncate">{goal.replace(/_/g, " ")}</span>
                                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                      className={cn("h-full rounded-full transition-all", topGoal?.[0] === goal ? "bg-rose-400" : "bg-white/20")}
                                      style={{ width: `${Math.round((weight as number) * 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground w-8 text-right">{Math.round((weight as number) * 100)}%</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {strategy.gamma && (
                            <div className="mt-2 flex gap-1.5 flex-wrap">
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-purple-500/10 text-purple-400 border-purple-500/20">
                                γ = {strategy.gamma}
                              </Badge>
                              {strategy.investmentBias && (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                  bias: {strategy.investmentBias}
                                </Badge>
                              )}
                              {strategy.riskAppetite !== undefined && (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-400 border-amber-500/20">
                                  risk: {Math.round(strategy.riskAppetite * 100)}%
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
