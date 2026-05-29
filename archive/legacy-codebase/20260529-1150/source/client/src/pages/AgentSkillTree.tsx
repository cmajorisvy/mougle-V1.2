import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useParams } from "wouter";
import {
  Zap, Star, Lock, Unlock, Award, TrendingUp, Shield, Brain,
  ArrowLeft, CheckCircle, Loader2, Trophy, BookOpen, Target
} from "lucide-react";

const TIER_LABELS: Record<number, string> = {
  1: "Foundation",
  2: "Advanced",
  3: "Expert",
  4: "Master",
};

const TIER_COLORS: Record<number, string> = {
  1: "from-blue-500/20 to-blue-600/10",
  2: "from-purple-500/20 to-purple-600/10",
  3: "from-amber-500/20 to-amber-600/10",
  4: "from-red-500/20 to-red-600/10",
};

function getSkillIcon(icon: string | undefined) {
  const iconMap: Record<string, any> = {
    zap: Zap, star: Star, shield: Shield, brain: Brain,
    award: Award, target: Target, book: BookOpen, trophy: Trophy,
    trending: TrendingUp, unlock: Unlock, check: CheckCircle,
  };
  const Icon = icon ? iconMap[icon.toLowerCase()] || Zap : Zap;
  return Icon;
}

export default function AgentSkillTree() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [unlocking, setUnlocking] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/agent-progression", id],
    queryFn: () => api.agentProgression.get(id!),
    enabled: !!id,
  });

  const unlockMutation = useMutation({
    mutationFn: (skillSlug: string) => api.agentProgression.unlockSkill(id!, skillSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-progression", id] });
      setUnlocking(null);
    },
    onError: () => setUnlocking(null),
  });

  const checkCertsMutation = useMutation({
    mutationFn: () => api.agentProgression.checkCertifications(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-progression", id] });
    },
  });

  const handleUnlock = (skillSlug: string) => {
    setUnlocking(skillSlug);
    unlockMutation.mutate(skillSlug);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20" data-testid="loading-skill-tree">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-20 gap-4" data-testid="error-skill-tree">
          <p className="text-gray-400">Failed to load agent progression data.</p>
          <a href="/dashboard" className="text-blue-400 hover:underline flex items-center gap-1" data-testid="link-back">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </a>
        </div>
      </Layout>
    );
  }

  const {
    skillTree = [],
    certifications = [],
    recentXp = [],
    level = 1,
    xp = 0,
    currentLevel = { level: 1, xpRequired: 0 },
    nextLevelXp = 100,
    progress = 0,
    agentName,
  } = data;

  const unlockedCount = skillTree.filter((s: any) => s.unlocked).length;
  const tiers = [1, 2, 3, 4];
  const skillsByTier: Record<number, any[]> = {};
  tiers.forEach((t) => {
    skillsByTier[t] = skillTree.filter((s: any) => s.treeTier === t);
  });

  return (
    <Layout>
      <div className="space-y-6 pb-12" data-testid="page-agent-skill-tree">
        <a href="/dashboard" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors" data-testid="link-back-dashboard">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </a>

        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600/20 via-purple-600/15 to-amber-600/10 border border-white/[0.06] p-8" data-testid="header-section">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.15),transparent_60%)]" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-purple-500/10 to-transparent rounded-full blur-3xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Brain className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold text-white" data-testid="text-agent-name">{agentName || "Agent"}</h1>
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs" data-testid="badge-level">
                    Level {level}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 max-w-md">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">XP Progress</span>
                      <span className="text-blue-400 font-medium" data-testid="text-xp-progress">{xp.toLocaleString()} / {nextLevelXp.toLocaleString()} XP</span>
                    </div>
                    <div className="h-3 rounded-full bg-white/[0.08] overflow-hidden" data-testid="xp-bar">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                        style={{ width: `${Math.min(progress, 100)}%` }}
                        data-testid="xp-bar-fill"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="stats-row">
          <StatCard icon={Zap} label="Total XP" value={xp.toLocaleString()} color="text-blue-400" bgColor="bg-blue-500/10" testId="stat-total-xp" />
          <StatCard icon={Star} label="Level" value={level.toString()} color="text-amber-400" bgColor="bg-amber-500/10" testId="stat-level" />
          <StatCard icon={Unlock} label="Skills Unlocked" value={`${unlockedCount} / ${skillTree.length}`} color="text-green-400" bgColor="bg-green-500/10" testId="stat-skills-unlocked" />
          <StatCard icon={Award} label="Certifications" value={certifications.length.toString()} color="text-purple-400" bgColor="bg-purple-500/10" testId="stat-certifications" />
        </div>

        <div className="rounded-2xl bg-[#141422]/80 border border-white/[0.06] p-6" data-testid="skill-tree-section">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-400" />
              Skill Tree
            </h2>
            <Badge className="bg-white/[0.06] text-gray-400 border-white/[0.06] text-xs" data-testid="text-total-skills">
              {skillTree.length} Skills
            </Badge>
          </div>

          <div className="space-y-8">
            {tiers.map((tier) => {
              const skills = skillsByTier[tier];
              if (!skills || skills.length === 0) return null;
              return (
                <div key={tier} data-testid={`tier-${tier}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={cn("px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r", TIER_COLORS[tier])}>
                      <span className="text-white/80">Tier {tier}</span>
                    </div>
                    <span className="text-xs text-gray-500">{TIER_LABELS[tier]}</span>
                    {tier > 1 && (
                      <div className="flex-1 flex items-center gap-1 ml-2">
                        <div className="h-px flex-1 bg-gradient-to-r from-white/[0.06] to-transparent" />
                        <span className="text-[10px] text-gray-600">requires tier {tier - 1}</span>
                        <div className="h-px flex-1 bg-gradient-to-l from-white/[0.06] to-transparent" />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {skills.map((skill: any) => (
                      <SkillNode
                        key={skill.slug}
                        skill={skill}
                        onUnlock={handleUnlock}
                        isUnlocking={unlocking === skill.slug}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {skillTree.length === 0 && (
            <div className="text-center py-12 text-gray-500" data-testid="empty-skill-tree">
              <Target className="w-10 h-10 mx-auto mb-3 text-gray-600" />
              <p className="text-sm">No skills available yet.</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-[#141422]/80 border border-white/[0.06] p-6" data-testid="certifications-section">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-purple-400" />
              Certifications
            </h2>
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-white/[0.08] text-gray-400 hover:text-white"
              onClick={() => checkCertsMutation.mutate()}
              disabled={checkCertsMutation.isPending}
              data-testid="button-check-certs"
            >
              {checkCertsMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
              Check New
            </Button>
          </div>

          {certifications.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {certifications.map((cert: any, i: number) => (
                <div
                  key={cert.slug || i}
                  className="p-4 rounded-xl bg-gradient-to-br from-purple-500/10 to-amber-500/5 border border-purple-500/20 hover:border-purple-500/40 transition-all"
                  data-testid={`cert-card-${cert.slug || i}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <Trophy className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate" data-testid={`text-cert-name-${i}`}>{cert.name}</div>
                      <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]" data-testid={`badge-cert-rank-${i}`}>
                        +{cert.rankBoost || cert.rank_boost || 0} Rank
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2" data-testid={`text-cert-desc-${i}`}>{cert.description}</p>
                  {cert.earnedAt && (
                    <div className="text-[10px] text-gray-600 mt-2" data-testid={`text-cert-date-${i}`}>
                      Earned {new Date(cert.earnedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500" data-testid="empty-certifications">
              <Award className="w-8 h-8 mx-auto mb-2 text-gray-600" />
              <p className="text-sm">No certifications earned yet.</p>
              <p className="text-xs text-gray-600 mt-1">Unlock skills and gain XP to earn certifications.</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-[#141422]/80 border border-white/[0.06] p-6" data-testid="xp-history-section">
          <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-green-400" />
            XP History
          </h2>

          {recentXp.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-xp-history">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">Source</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400">Amount</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentXp.map((entry: any, i: number) => (
                    <tr key={entry.id || i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors" data-testid={`row-xp-${i}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Zap className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                          <span className="text-xs text-white" data-testid={`text-xp-source-${i}`}>{entry.source || entry.action || "Unknown"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs font-semibold text-green-400" data-testid={`text-xp-amount-${i}`}>+{entry.amount || entry.xp || 0} XP</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-gray-500" data-testid={`text-xp-date-${i}`}>
                          {entry.createdAt || entry.date ? new Date(entry.createdAt || entry.date).toLocaleDateString() : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500" data-testid="empty-xp-history">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 text-gray-600" />
              <p className="text-sm">No XP history yet.</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ icon: Icon, label, value, color, bgColor, testId }: {
  icon: any; label: string; value: string; color: string; bgColor: string; testId: string;
}) {
  return (
    <div className="p-4 rounded-xl bg-[#141422]/80 border border-white/[0.06]" data-testid={testId}>
      <div className="flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", bgColor)}>
          <Icon className={cn("w-5 h-5", color)} />
        </div>
        <div>
          <div className={cn("text-lg font-bold", color)}>{value}</div>
          <div className="text-xs text-gray-500">{label}</div>
        </div>
      </div>
    </div>
  );
}

function SkillNode({ skill, onUnlock, isUnlocking }: {
  skill: any; onUnlock: (slug: string) => void; isUnlocking: boolean;
}) {
  const Icon = getSkillIcon(skill.icon);
  const isUnlocked = skill.unlocked;
  const canUnlock = skill.canUnlock;

  const borderClass = isUnlocked
    ? "border-green-500/40 bg-green-500/5"
    : canUnlock
      ? "border-blue-500/40 bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.15)]"
      : "border-white/[0.06] bg-white/[0.02]";

  return (
    <div
      className={cn(
        "relative p-4 rounded-xl border transition-all hover:scale-[1.02]",
        borderClass
      )}
      data-testid={`skill-node-${skill.slug}`}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
          isUnlocked ? "bg-green-500/20" : canUnlock ? "bg-blue-500/20" : "bg-white/[0.06]"
        )}>
          {isUnlocked ? (
            <CheckCircle className="w-5 h-5 text-green-400" />
          ) : canUnlock ? (
            <Icon className="w-5 h-5 text-blue-400" />
          ) : (
            <Lock className="w-5 h-5 text-gray-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate" data-testid={`text-skill-name-${skill.slug}`}>{skill.name}</div>
          <p className="text-[10px] text-gray-500 line-clamp-2 mt-0.5" data-testid={`text-skill-desc-${skill.slug}`}>{skill.description}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <Badge className="bg-white/[0.04] text-gray-400 border-white/[0.06] text-[10px]" data-testid={`badge-skill-xp-${skill.slug}`}>
          {skill.xpCost} XP
        </Badge>
        <Badge className="bg-white/[0.04] text-gray-400 border-white/[0.06] text-[10px]" data-testid={`badge-skill-level-${skill.slug}`}>
          Lv. {skill.levelRequired}
        </Badge>
        {isUnlocked && (
          <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-[10px]" data-testid={`badge-skill-unlocked-${skill.slug}`}>
            Unlocked
          </Badge>
        )}
      </div>

      {canUnlock && !isUnlocked && (
        <Button
          size="sm"
          className="w-full mt-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-xs"
          onClick={() => onUnlock(skill.slug)}
          disabled={isUnlocking}
          data-testid={`button-unlock-${skill.slug}`}
        >
          {isUnlocking ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
          ) : (
            <Unlock className="w-3 h-3 mr-1" />
          )}
          Unlock Skill
        </Button>
      )}

      {!canUnlock && !isUnlocked && (
        <div className="mt-3 text-[10px] text-gray-600 flex items-center gap-1" data-testid={`text-skill-locked-${skill.slug}`}>
          <Lock className="w-3 h-3" />
          {skill.prerequisiteSlugs?.length > 0
            ? `Requires: ${skill.prerequisiteSlugs.join(", ")}`
            : `Reach Level ${skill.levelRequired}`}
        </div>
      )}
    </div>
  );
}
