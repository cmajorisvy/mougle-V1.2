import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Eye, Compass, MessageSquare, BadgeCheck, ShieldCheck, Brain, Crown,
  RefreshCw, Lock, Unlock, TrendingUp, Shield, Star, AlertTriangle, CheckCircle2, ChevronRight
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const LEVEL_ICONS: Record<string, any> = {
  Eye, Compass, MessageSquare, BadgeCheck, ShieldCheck, Brain, Crown,
};

function apiRequest(url: string, options?: RequestInit) {
  return fetch(url, { headers: { "Content-Type": "application/json" }, ...options }).then(r => {
    if (!r.ok) throw new Error("Request failed");
    return r.json();
  });
}

const LEVEL_ORDER = ["visitor", "explorer", "participant", "verified_creator", "trusted_publisher", "intelligence_builder", "ecosystem_partner"];

export default function TrustLadder() {
  const queryClient = useQueryClient();
  const [showAllLevels, setShowAllLevels] = useState(false);
  const { user } = useAuth();
  const userId = user?.id || null;

  const { data: status, isLoading } = useQuery({
    queryKey: ["/api/trust-ladder/status", userId],
    queryFn: () => apiRequest(`/api/trust-ladder/status/${userId}`),
    enabled: !!userId,
  });

  const { data: levels } = useQuery({
    queryKey: ["/api/trust-ladder/levels"],
    queryFn: () => apiRequest("/api/trust-ladder/levels"),
  });

  const recomputeMutation = useMutation({
    mutationFn: () => apiRequest("/api/trust-ladder/recompute", {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trust-ladder/status", userId] });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  const currentLevelIdx = status ? LEVEL_ORDER.indexOf(status.trustLevel) : 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-5xl mx-auto p-6 space-y-8">
        <div className="flex items-center justify-between" data-testid="section-header">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-trust-ladder-title">Trust Ladder</h1>
            <p className="text-zinc-400 mt-1">Your trust journey on Mougle</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => recomputeMutation.mutate()}
            disabled={recomputeMutation.isPending}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            data-testid="button-recompute"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${recomputeMutation.isPending ? "animate-spin" : ""}`} />
            Recompute
          </Button>
        </div>

        {status && (
          <>
            <Card className="bg-zinc-900 border-zinc-800" data-testid="card-current-level">
              <CardContent className="p-6">
                <div className="flex items-center gap-6">
                  <div
                    className="w-20 h-20 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: status.levelConfig.color + "20", border: `2px solid ${status.levelConfig.color}` }}
                  >
                    {(() => {
                      const IconComponent = LEVEL_ICONS[status.levelConfig.icon] || Shield;
                      return <IconComponent className="w-10 h-10" style={{ color: status.levelConfig.color }} />;
                    })()}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-bold" data-testid="text-current-level">{status.levelConfig.label}</h2>
                      <Badge
                        className="text-xs"
                        style={{ backgroundColor: status.levelConfig.color + "30", color: status.levelConfig.color, border: `1px solid ${status.levelConfig.color}50` }}
                        data-testid="badge-trust-score"
                      >
                        Score: {status.trustScore}
                      </Badge>
                    </div>
                    <p className="text-zinc-400 mt-1" data-testid="text-level-description">{status.levelConfig.description}</p>
                  </div>
                </div>

                {status.nextLevel && (
                  <div className="mt-6 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700" data-testid="section-next-level">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-zinc-400">Progress to {status.nextLevel.label}</span>
                      <span className="text-sm font-mono text-zinc-300" data-testid="text-progress-percent">
                        {status.nextLevel.progress}%
                      </span>
                    </div>
                    <Progress value={status.nextLevel.progress} className="h-2 bg-zinc-700" data-testid="progress-bar" />
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-zinc-500">Score: {status.trustScore}</span>
                      <span className="text-xs text-zinc-500">Required: {status.nextLevel.minScore}</span>
                    </div>
                    {status.nextLevel.requirements.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-xs text-zinc-400 font-medium">Requirements:</p>
                        {status.nextLevel.requirements.map((req: string, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-zinc-500">
                            <ChevronRight className="w-3 h-3" />
                            <span>{req}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4" data-testid="section-signals">
              {Object.entries(status.signals).map(([key, signal]: [string, any]) => (
                <Card key={key} className="bg-zinc-900 border-zinc-800" data-testid={`signal-${key}`}>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold mb-1" style={{ color: signal.score >= 70 ? "#10b981" : signal.score >= 40 ? "#f59e0b" : "#ef4444" }}>
                      {signal.score}
                    </div>
                    <p className="text-xs text-zinc-400 mb-2">{signal.label}</p>
                    <div className="w-full bg-zinc-700 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{
                          width: `${signal.score}%`,
                          backgroundColor: signal.score >= 70 ? "#10b981" : signal.score >= 40 ? "#f59e0b" : "#ef4444",
                        }}
                      />
                    </div>
                    <p className="text-xs text-zinc-600 mt-1">{Math.round(signal.weight * 100)}% weight</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="bg-zinc-900 border-zinc-800" data-testid="section-capabilities">
              <CardHeader>
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Your Capabilities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { key: "canPublish", label: "Publish Apps", icon: CheckCircle2 },
                    { key: "canSell", label: "Sell Apps", icon: Star },
                    { key: "canPromote", label: "Promote Apps", icon: TrendingUp },
                    { key: "canBuildEntities", label: "Build Entities", icon: Brain },
                    { key: "canPartner", label: "Partner Access", icon: Crown },
                  ].map(({ key, label, icon: Icon }) => {
                    const enabled = status.capabilities[key];
                    return (
                      <div
                        key={key}
                        className={`flex items-center gap-3 p-3 rounded-lg border ${enabled ? "bg-emerald-950/30 border-emerald-800" : "bg-zinc-800/30 border-zinc-700"}`}
                        data-testid={`capability-${key}`}
                      >
                        {enabled ? (
                          <Unlock className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Lock className="w-4 h-4 text-zinc-600" />
                        )}
                        <div>
                          <p className={`text-sm font-medium ${enabled ? "text-emerald-300" : "text-zinc-500"}`}>{label}</p>
                        </div>
                        <Icon className={`w-4 h-4 ml-auto ${enabled ? "text-emerald-400" : "text-zinc-600"}`} />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800" data-testid="section-ladder-visualization">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-white">Trust Ladder</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllLevels(!showAllLevels)}
                    className="text-zinc-400 hover:text-white"
                    data-testid="button-toggle-levels"
                  >
                    {showAllLevels ? "Collapse" : "Show All Levels"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {levels && LEVEL_ORDER.map((levelKey, idx) => {
                    const level = levels[levelKey];
                    if (!level) return null;
                    const isCurrent = idx === currentLevelIdx;
                    const isAchieved = idx <= currentLevelIdx;
                    const isNext = idx === currentLevelIdx + 1;

                    if (!showAllLevels && !isCurrent && !isNext && idx > currentLevelIdx + 1 && idx < LEVEL_ORDER.length - 1) return null;

                    const IconComponent = LEVEL_ICONS[level.icon] || Shield;

                    return (
                      <div
                        key={levelKey}
                        className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                          isCurrent
                            ? "border-2 bg-zinc-800/80"
                            : isAchieved
                            ? "border-zinc-700 bg-zinc-800/30"
                            : "border-zinc-800 bg-zinc-900/50 opacity-60"
                        }`}
                        style={isCurrent ? { borderColor: level.color } : {}}
                        data-testid={`ladder-level-${levelKey}`}
                      >
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: isAchieved ? level.color + "20" : "transparent",
                            border: `1.5px solid ${isAchieved ? level.color : "#3f3f46"}`,
                          }}
                        >
                          <IconComponent className="w-6 h-6" style={{ color: isAchieved ? level.color : "#52525b" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${isAchieved ? "text-white" : "text-zinc-500"}`}>
                              {level.label}
                            </span>
                            {isCurrent && (
                              <Badge className="text-xs bg-emerald-950 text-emerald-400 border-emerald-800">Current</Badge>
                            )}
                            {isAchieved && !isCurrent && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5">{level.description}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-xs text-zinc-500 font-mono">Score: {level.minScore}+</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800" data-testid="section-how-to-improve">
              <CardHeader>
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  How to Improve Your Trust Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { title: "Activity Quality", tips: ["Create quality posts and comments", "Engage in debates constructively", "Build reputation over time"], icon: MessageSquare, weight: "25%" },
                    { title: "Identity Verification", tips: ["Verify your email address", "Complete your profile", "Add a bio and avatar"], icon: BadgeCheck, weight: "25%" },
                    { title: "Publisher Agreement", tips: ["Create publisher profile", "Accept publisher agreement", "Submit promotion declaration"], icon: ShieldCheck, weight: "20%" },
                    { title: "Community Ratings", tips: ["Get positive feedback on your content", "Build consistent reputation", "Earn intelligence XP"], icon: Star, weight: "15%" },
                    { title: "Policy Compliance", tips: ["Follow platform guidelines", "Avoid spam and violations", "Maintain clean record"], icon: AlertTriangle, weight: "15%" },
                  ].map(({ title, tips, icon: Icon, weight }) => (
                    <div key={title} className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                      <div className="flex items-center gap-2 mb-3">
                        <Icon className="w-4 h-4 text-zinc-400" />
                        <span className="text-sm font-medium text-white">{title}</span>
                        <Badge variant="outline" className="text-xs text-zinc-500 border-zinc-700 ml-auto">{weight}</Badge>
                      </div>
                      <ul className="space-y-1.5">
                        {tips.map((tip, i) => (
                          <li key={i} className="text-xs text-zinc-400 flex items-center gap-2">
                            <div className="w-1 h-1 bg-zinc-600 rounded-full" />
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
