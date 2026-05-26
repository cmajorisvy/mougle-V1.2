import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Compass, UserCheck, Zap, Bot, Briefcase, Users2, Crown,
  Lock, Unlock, ChevronRight, TrendingUp, Star, Trophy,
  Sparkles, ArrowUp, CheckCircle
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const STAGE_ICONS: Record<string, any> = {
  explorer: Compass,
  assistant_user: UserCheck,
  power_user: Zap,
  agent_creator: Bot,
  agent_entrepreneur: Briefcase,
  ai_collaborator: Users2,
  digital_architect: Crown,
};

const STAGE_COLORS: Record<string, string> = {
  explorer: "from-slate-500 to-slate-600",
  assistant_user: "from-blue-500 to-blue-600",
  power_user: "from-violet-500 to-violet-600",
  agent_creator: "from-purple-500 to-purple-600",
  agent_entrepreneur: "from-amber-500 to-amber-600",
  ai_collaborator: "from-emerald-500 to-emerald-600",
  digital_architect: "from-rose-500 to-pink-600",
};

const STAGE_TEXT: Record<string, string> = {
  explorer: "text-slate-400",
  assistant_user: "text-blue-400",
  power_user: "text-violet-400",
  agent_creator: "text-purple-400",
  agent_entrepreneur: "text-amber-400",
  ai_collaborator: "text-emerald-400",
  digital_architect: "text-rose-400",
};

const STAGE_BG: Record<string, string> = {
  explorer: "bg-slate-500/20 border-slate-500/30",
  assistant_user: "bg-blue-500/20 border-blue-500/30",
  power_user: "bg-violet-500/20 border-violet-500/30",
  agent_creator: "bg-purple-500/20 border-purple-500/30",
  agent_entrepreneur: "bg-amber-500/20 border-amber-500/30",
  ai_collaborator: "bg-emerald-500/20 border-emerald-500/30",
  digital_architect: "bg-rose-500/20 border-rose-500/30",
};

const STAGES_PREVIEW = [
  { id: "explorer", label: "Explorer", xpRequired: 0, description: "Discovering the platform and its basic features", features: ["Browse topics", "Read posts", "Basic profile", "View debates"] },
  { id: "assistant_user", label: "Intelligence User", xpRequired: 100, description: "Using intelligence features for discussions and insights", features: ["AI-powered insights", "Post creation", "Comment with analysis", "Join debates"] },
  { id: "power_user", label: "Power User", xpRequired: 500, description: "Advanced engagement with reputation and verification", features: ["Trust scoring", "Verification voting", "Reputation tracking", "Advanced analytics"] },
  { id: "agent_creator", label: "Agent Creator", xpRequired: 1500, description: "Building and training custom intelligent agents", features: ["Create agents", "Agent training", "Custom system prompts", "Agent skill trees"] },
  { id: "agent_entrepreneur", label: "Safe-Clone Creator", xpRequired: 4000, description: "Preparing reviewed agent packages and sandbox readiness signals", features: ["Safe clone sandbox", "Compute credits", "Review analytics", "Trust signals"] },
  { id: "ai_collaborator", label: "Intelligence Collaborator", xpRequired: 8000, description: "Orchestrating multi-entity collaboration teams", features: ["Multi-entity teams", "Collaboration workflows", "Task orchestration", "Team analytics"] },
  { id: "digital_architect", label: "Digital Architect", xpRequired: 15000, description: "Full platform mastery with governance and architecture access", features: ["Governance voting", "Network dashboard", "Founder analytics", "Platform flywheel", "Civilization metrics"] },
];

function GuestProgressView({ stages, defaultStage }: { stages: any[]; defaultStage: any }) {
  const Icon = STAGE_ICONS[defaultStage.id] || Compass;
  const colorClass = STAGE_COLORS[defaultStage.id] || "from-slate-500 to-slate-600";
  const textClass = STAGE_TEXT[defaultStage.id] || "text-slate-400";
  const stageList = stages.length > 0 ? stages : STAGES_PREVIEW;

  return (
    <div className="space-y-6" data-testid="progress-tab-content">
      <Card className={`${STAGE_BG[defaultStage.id]} border overflow-hidden`}>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className={`p-4 rounded-xl bg-gradient-to-br ${colorClass} shadow-lg`}>
              <Icon className="h-8 w-8 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Current Intelligence Stage</p>
              <h2 className={`text-2xl font-bold ${textClass}`} data-testid="text-current-stage">{defaultStage.label}</h2>
              <p className="text-sm text-zinc-400 mt-0.5">{defaultStage.description}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-white" data-testid="text-total-xp">0</p>
              <p className="text-xs text-zinc-500">Total XP</p>
            </div>
          </div>
          <div className="mt-5">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-zinc-500">Progress to {stageList[1]?.label || "Next Stage"}</span>
              <span className={textClass}>0%</span>
            </div>
            <div className="h-2.5 bg-black/30 rounded-full overflow-hidden">
              <div className={`h-full bg-gradient-to-r ${colorClass} rounded-full`} style={{ width: "0%" }} data-testid="progress-bar" />
            </div>
            <p className="text-[10px] text-zinc-600 mt-1">Sign in to start earning XP and unlock features</p>
          </div>
        </CardContent>
      </Card>

      <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
        <Star className="h-4 w-4 text-amber-400" /> Intelligence Roadmap
      </h3>

      <div className="space-y-2">
        {stageList.map((stage: any, idx: number) => {
          const SIcon = STAGE_ICONS[stage.id] || Compass;
          const isFirst = idx === 0;
          const bgClass = isFirst ? STAGE_BG[stage.id] : "bg-zinc-900/40 border-zinc-800";
          const sTextClass = isFirst ? STAGE_TEXT[stage.id] : "text-zinc-600";

          return (
            <Card key={stage.id} className={`${bgClass} border transition-all ${isFirst ? "ring-1 ring-white/10" : ""}`} data-testid={`stage-${stage.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isFirst ? `bg-gradient-to-br ${STAGE_COLORS[stage.id]}` : "bg-zinc-800"}`}>
                    {isFirst ? <SIcon className="h-5 w-5 text-white" /> : <Lock className="h-5 w-5 text-zinc-600" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${sTextClass}`}>{stage.label}</span>
                      {isFirst && <Badge className="bg-white/10 text-white text-[9px]">Current</Badge>}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{stage.description}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${sTextClass}`}>{stage.xpRequired.toLocaleString()} XP</p>
                  </div>
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {stage.features.map((f: string) => (
                    <Badge key={f} variant="outline" className={`text-[9px] ${isFirst ? "border-white/15 text-zinc-400" : "border-zinc-800 text-zinc-700"}`}>
                      {isFirst ? <Unlock className="h-2 w-2 mr-0.5" /> : <Lock className="h-2 w-2 mr-0.5" />}
                      {f}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ProgressTab() {
  const { user } = useAuth();
  const userId = user?.id || "";
  const queryClient = useQueryClient();

  const { data: progress, isLoading } = useQuery({
    queryKey: ["intelligence-progress", userId],
    queryFn: () => fetch("/api/intelligence/progress", { credentials: "include" }).then(r => r.json()),
    enabled: !!userId,
  });

  const { data: stages } = useQuery({
    queryKey: ["intelligence-stages"],
    queryFn: () => fetch("/api/intelligence/stages").then(r => r.json()),
  });

  const awardMutation = useMutation({
    mutationFn: (source: string) =>
      fetch("/api/intelligence/award-xp", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ source, description: "Manual XP claim" }),
      }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["intelligence-progress"] }),
  });

  if (!userId) {
    const defaultStage = STAGES_PREVIEW[0];
    return <GuestProgressView stages={stages || STAGES_PREVIEW} defaultStage={defaultStage} />;
  }

  if (isLoading) return <div className="text-zinc-400 p-4">Loading your intelligence level...</div>;
  if (!progress?.currentStage) return <div className="text-zinc-400 p-4">Could not load progress.</div>;

  const currentStageId = progress.currentStage.id;
  const Icon = STAGE_ICONS[currentStageId] || Compass;
  const colorClass = STAGE_COLORS[currentStageId] || "from-slate-500 to-slate-600";
  const textClass = STAGE_TEXT[currentStageId] || "text-slate-400";

  return (
    <div className="space-y-6" data-testid="progress-tab-content">
      <Card className={`${STAGE_BG[currentStageId]} border overflow-hidden`}>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className={`p-4 rounded-xl bg-gradient-to-br ${colorClass} shadow-lg`}>
              <Icon className="h-8 w-8 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Current Intelligence Stage</p>
              <h2 className={`text-2xl font-bold ${textClass}`} data-testid="text-current-stage">{progress.currentStage.label}</h2>
              <p className="text-sm text-zinc-400 mt-0.5">{progress.currentStage.description}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-white" data-testid="text-total-xp">{progress.currentXp.toLocaleString()}</p>
              <p className="text-xs text-zinc-500">Total XP</p>
            </div>
          </div>

          {progress.nextStage && (
            <div className="mt-5">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-500">Progress to {progress.nextStage.label}</span>
                <span className={textClass}>{progress.progressPercent}%</span>
              </div>
              <div className="h-2.5 bg-black/30 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${colorClass} rounded-full transition-all duration-500`}
                  style={{ width: `${progress.progressPercent}%` }}
                  data-testid="progress-bar"
                />
              </div>
              <p className="text-[10px] text-zinc-600 mt-1">
                {progress.xpToNext.toLocaleString()} XP needed to reach {progress.nextStage.label}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
        <Star className="h-4 w-4 text-amber-400" /> Intelligence Roadmap
      </h3>

      <div className="space-y-2">
        {(stages || []).map((stage: any, idx: number) => {
          const SIcon = STAGE_ICONS[stage.id] || Compass;
          const stageIdx = (stages || []).findIndex((s: any) => s.id === currentStageId);
          const isUnlocked = idx <= stageIdx;
          const isCurrent = stage.id === currentStageId;
          const bgClass = isUnlocked ? STAGE_BG[stage.id] : "bg-zinc-900/40 border-zinc-800";
          const sTextClass = isUnlocked ? STAGE_TEXT[stage.id] : "text-zinc-600";

          return (
            <Card key={stage.id} className={`${bgClass} border transition-all ${isCurrent ? "ring-1 ring-white/10" : ""}`} data-testid={`stage-${stage.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isUnlocked ? `bg-gradient-to-br ${STAGE_COLORS[stage.id]}` : "bg-zinc-800"}`}>
                    {isUnlocked ? <SIcon className="h-5 w-5 text-white" /> : <Lock className="h-5 w-5 text-zinc-600" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${sTextClass}`}>{stage.label}</span>
                      {isCurrent && <Badge className="bg-white/10 text-white text-[9px]">Current</Badge>}
                      {isUnlocked && !isCurrent && <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{stage.description}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${sTextClass}`}>{stage.xpRequired.toLocaleString()} XP</p>
                  </div>
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {stage.features.map((f: string) => (
                    <Badge key={f} variant="outline" className={`text-[9px] ${isUnlocked ? "border-white/15 text-zinc-400" : "border-zinc-800 text-zinc-700"}`}>
                      {isUnlocked ? <Unlock className="h-2 w-2 mr-0.5" /> : <Lock className="h-2 w-2 mr-0.5" />}
                      {f}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300">Quick XP Actions</CardTitle>
          <CardDescription className="text-xs text-zinc-500">Earn XP by engaging with the platform</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {["daily_login", "conversation", "post_create"].map((src) => (
              <Button
                key={src}
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => awardMutation.mutate(src)}
                disabled={awardMutation.isPending}
                data-testid={`btn-xp-${src}`}
              >
                <ArrowUp className="h-3 w-3 mr-1" /> {src.replace("_", " ")}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function XpBreakdownTab() {
  const { user } = useAuth();
  const userId = user?.id || "";

  const { data: breakdown, isLoading } = useQuery({
    queryKey: ["intelligence-xp-breakdown", userId],
    queryFn: () => fetch("/api/intelligence/xp-breakdown", { credentials: "include" }).then(r => r.json()),
    enabled: !!userId,
  });

  if (isLoading) return <div className="text-zinc-400 p-4">Loading XP breakdown...</div>;

  return (
    <div className="space-y-6" data-testid="xp-breakdown-tab-content">
      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-purple-400" /> XP Sources (Last 30 Days)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="space-y-3">
            {Object.entries(breakdown?.sources || {}).map(([key, src]: [string, any]) => {
              const pct = src.dailyLimit > 0 ? Math.min(100, Math.round((src.total / src.dailyLimit) * 100)) : 0;
              return (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-400">{src.label}</span>
                    <span className="text-zinc-500">{src.total} XP</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-500 to-violet-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300">Recent XP Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {(!breakdown?.recentLogs || breakdown.recentLogs.length === 0) && (
            <p className="text-zinc-500 text-sm">No XP activity yet. Start engaging with the platform to earn XP!</p>
          )}
          <div className="space-y-2">
            {(breakdown?.recentLogs || []).map((log: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-zinc-800/50">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3 w-3 text-purple-400" />
                  <div>
                    <p className="text-xs text-zinc-300">{log.description || log.source}</p>
                    <p className="text-[10px] text-zinc-600">{log.createdAt ? new Date(log.createdAt).toLocaleDateString() : ""}</p>
                  </div>
                </div>
                <Badge className="bg-purple-500/20 text-purple-400 text-xs">+{log.xpAmount} XP</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FeaturesTab() {
  const { user } = useAuth();
  const userId = user?.id || "";

  const { data, isLoading } = useQuery({
    queryKey: ["intelligence-features", userId],
    queryFn: () => fetch("/api/intelligence/features", { credentials: "include" }).then(r => r.json()),
    enabled: !!userId,
  });

  if (isLoading) return <div className="text-zinc-400 p-4">Loading features...</div>;

  const flags = data?.flags || {};
  const unlocked = Object.entries(flags).filter(([, v]) => v);
  const locked = Object.entries(flags).filter(([, v]) => !v);

  return (
    <div className="space-y-6" data-testid="features-tab-content">
      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
            <Unlock className="h-4 w-4 text-emerald-400" /> Unlocked Features ({unlocked.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {unlocked.map(([key]) => (
              <div key={key} className="flex items-center gap-2 p-2 rounded bg-emerald-500/5 border border-emerald-500/10">
                <CheckCircle className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                <span className="text-xs text-zinc-300 capitalize">{key.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {locked.length > 0 && (
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
              <Lock className="h-4 w-4 text-zinc-500" /> Locked Features ({locked.length})
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500">Keep earning XP to unlock these</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {locked.map(([key]) => (
                <div key={key} className="flex items-center gap-2 p-2 rounded bg-zinc-800/50 border border-zinc-800">
                  <Lock className="h-3 w-3 text-zinc-600 flex-shrink-0" />
                  <span className="text-xs text-zinc-600 capitalize">{key.replace(/_/g, " ")}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LeaderboardTab() {
  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ["intelligence-leaderboard"],
    queryFn: () => fetch("/api/intelligence/leaderboard").then(r => r.json()),
  });

  if (isLoading) return <div className="text-zinc-400 p-4">Loading leaderboard...</div>;

  return (
    <div className="space-y-4" data-testid="leaderboard-tab-content">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-amber-400" />
        <h3 className="text-sm font-medium text-zinc-300">Intelligence Leaderboard</h3>
      </div>

      <div className="space-y-2">
        {(leaderboard || []).map((user: any, i: number) => {
          const sColor = STAGE_TEXT[user.stage] || "text-zinc-400";
          const SIcon = STAGE_ICONS[user.stage] || Compass;
          return (
            <Card key={user.id} className="bg-zinc-900/60 border-zinc-800">
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i < 3 ? "bg-amber-500/20 text-amber-400" : "bg-zinc-800 text-zinc-500"}`}>
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-zinc-300">{user.displayName}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <SIcon className={`h-3 w-3 ${sColor}`} />
                    <span className={`text-[10px] capitalize ${sColor}`}>{user.stage?.replace("_", " ")}</span>
                  </div>
                </div>
                <p className="text-sm font-bold text-white">{(user.xp || 0).toLocaleString()} XP</p>
              </CardContent>
            </Card>
          );
        })}
        {(!leaderboard || leaderboard.length === 0) && (
          <p className="text-zinc-500 text-sm">No users on the leaderboard yet.</p>
        )}
      </div>
    </div>
  );
}

export default function IntelligenceRoadmap() {
  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Sparkles className="h-8 w-8 text-purple-400" />
          <div>
            <h1 className="text-2xl font-bold text-white" data-testid="text-intelligence-title">Intelligence Roadmap</h1>
            <p className="text-sm text-zinc-500">Unlock platform capabilities as you grow</p>
          </div>
        </div>

        <Tabs defaultValue="progress">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="progress" data-testid="tab-progress">Progress</TabsTrigger>
            <TabsTrigger value="xp" data-testid="tab-xp">XP Breakdown</TabsTrigger>
            <TabsTrigger value="features" data-testid="tab-features">Features</TabsTrigger>
            <TabsTrigger value="leaderboard" data-testid="tab-leaderboard">Leaderboard</TabsTrigger>
          </TabsList>
          <TabsContent value="progress"><ProgressTab /></TabsContent>
          <TabsContent value="xp"><XpBreakdownTab /></TabsContent>
          <TabsContent value="features"><FeaturesTab /></TabsContent>
          <TabsContent value="leaderboard"><LeaderboardTab /></TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
