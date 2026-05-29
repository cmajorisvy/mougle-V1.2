import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Users, Plus, CheckCircle, Clock, Activity, Award, ChevronDown, ChevronUp, MessageSquare, Database, Bot, Loader2, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_COLORS: Record<string, string> = {
  coordinator: "text-yellow-400",
  researcher: "text-blue-400",
  analyst: "text-cyan-400",
  validator: "text-green-400",
  summarizer: "text-purple-400",
  debater: "text-red-400",
};

const ROLE_BG: Record<string, string> = {
  coordinator: "bg-yellow-500/10 border-yellow-500/20",
  researcher: "bg-blue-500/10 border-blue-500/20",
  analyst: "bg-cyan-500/10 border-cyan-500/20",
  validator: "bg-green-500/10 border-green-500/20",
  summarizer: "bg-purple-500/10 border-purple-500/20",
  debater: "bg-red-500/10 border-red-500/20",
};

const STATUS_STYLES: Record<string, string> = {
  forming: "bg-yellow-500/20 text-yellow-400",
  active: "bg-blue-500/20 text-blue-400",
  completed: "bg-green-500/20 text-green-400",
  needs_review: "bg-orange-500/20 text-orange-400",
};

const TASK_TYPES = ["research", "debate", "analysis"] as const;

export default function AITeams() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [taskDescription, setTaskDescription] = useState("");
  const [taskType, setTaskType] = useState<string>("research");
  const [expandedTeamId, setExpandedTeamId] = useState<number | null>(null);

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const res = await fetch("/api/teams");
      if (!res.ok) throw new Error("Failed to fetch teams");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["teams-analytics"],
    queryFn: async () => {
      const res = await fetch("/api/teams/analytics/overview");
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const { data: teamDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["team-detail", expandedTeamId],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${expandedTeamId}`);
      if (!res.ok) throw new Error("Failed to fetch team details");
      return res.json();
    },
    enabled: expandedTeamId !== null,
  });

  const createMutation = useMutation({
    mutationFn: async (body: { taskDescription: string; taskType: string }) => {
      const res = await fetch("/api/teams/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to create team" }));
        throw new Error(err.error || "Failed to create team");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["teams-analytics"] });
      setDialogOpen(false);
      setTaskDescription("");
      setTaskType("research");
    },
  });

  const handleCreate = () => {
    if (!taskDescription.trim()) return;
    createMutation.mutate({ taskDescription: taskDescription.trim(), taskType });
  };

  const toggleExpand = (teamId: number) => {
    setExpandedTeamId((prev) => (prev === teamId ? null : teamId));
  };

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="relative rounded-2xl overflow-hidden p-6 md:p-8 bg-gradient-to-br from-cyan-600/20 via-purple-600/10 to-transparent border border-white/5">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                <Users className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-display font-bold" data-testid="text-page-title">Intelligence Teams</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Autonomous multi-entity collaboration system</p>
              </div>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  data-testid="button-create-team"
                  className="h-10 bg-gradient-to-r from-cyan-600 to-purple-600 hover:opacity-90 text-white font-medium shadow-lg shadow-cyan-500/20 gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create Team
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-white/10">
                <DialogHeader>
                  <DialogTitle>Create New Team</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Task Description</label>
                    <Input
                      data-testid="input-task-description"
                      placeholder="Describe the task for the team..."
                      value={taskDescription}
                      onChange={(e) => setTaskDescription(e.target.value)}
                      className="bg-gray-800 border-white/10"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Task Type</label>
                    <div className="flex gap-2">
                      {TASK_TYPES.map((type) => (
                        <button
                          key={type}
                          data-testid={`button-type-${type}`}
                          onClick={() => setTaskType(type)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-sm capitalize border transition-colors",
                            taskType === type
                              ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                              : "bg-white/[0.02] border-white/10 text-muted-foreground hover:border-white/20"
                          )}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button
                    data-testid="button-submit-create"
                    className="w-full bg-gradient-to-r from-cyan-600 to-purple-600 hover:opacity-90 text-white"
                    onClick={handleCreate}
                    disabled={!taskDescription.trim() || createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    Create Team
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="section-stats">
          <div className="glass-card rounded-xl p-4 border border-white/5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Users className="w-3.5 h-3.5" />
              Total Teams
            </div>
            <span className="font-semibold text-lg" data-testid="text-total-teams">
              {analyticsLoading ? "..." : analytics?.totalTeams ?? 0}
            </span>
          </div>
          <div className="glass-card rounded-xl p-4 border border-white/5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Activity className="w-3.5 h-3.5" />
              Active Teams
            </div>
            <span className="font-semibold text-lg text-blue-400" data-testid="text-active-teams">
              {analyticsLoading ? "..." : analytics?.activeTeams ?? 0}
            </span>
          </div>
          <div className="glass-card rounded-xl p-4 border border-white/5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CheckCircle className="w-3.5 h-3.5" />
              Completed Teams
            </div>
            <span className="font-semibold text-lg text-green-400" data-testid="text-completed-teams">
              {analyticsLoading ? "..." : analytics?.completedTeams ?? 0}
            </span>
          </div>
          <div className="glass-card rounded-xl p-4 border border-white/5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Award className="w-3.5 h-3.5" />
              Avg Quality
            </div>
            <span className="font-semibold text-lg text-purple-400" data-testid="text-avg-quality">
              {analyticsLoading ? "..." : analytics?.avgQualityScore != null ? `${(analytics.avgQualityScore * 100).toFixed(0)}%` : "N/A"}
            </span>
          </div>
        </div>

        {teamsLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" data-testid="loading-spinner" />
          </div>
        ) : teams.length === 0 ? (
          <div className="glass-card rounded-2xl border border-white/5 p-12 text-center" data-testid="empty-state">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-cyan-400" />
            </div>
            <h2 className="text-xl font-display font-bold mb-2">No teams yet</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Create your first AI team to start multi-agent collaboration on complex tasks.
            </p>
          </div>
        ) : (
          <div className="space-y-4" data-testid="teams-list">
            {teams.map((team: any) => {
              const isExpanded = expandedTeamId === team.id;
              const progressPercent = team.totalTasks > 0 ? (team.completedTasks / team.totalTasks) * 100 : 0;

              return (
                <div
                  key={team.id}
                  data-testid={`card-team-${team.id}`}
                  className="glass-card rounded-xl border border-white/5 hover:border-white/10 transition-colors"
                >
                  <div
                    className="p-5 cursor-pointer"
                    onClick={() => toggleExpand(team.id)}
                    data-testid={`button-expand-team-${team.id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-base" data-testid={`text-team-name-${team.id}`}>
                            {team.name || `Team #${team.id}`}
                          </span>
                          <Badge
                            className={cn("text-[10px] px-1.5 py-0 border-0 capitalize", STATUS_STYLES[team.status] || STATUS_STYLES.forming)}
                            data-testid={`badge-status-${team.id}`}
                          >
                            {team.status?.replace("_", " ") || "forming"}
                          </Badge>
                          {team.taskType && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-white/5 border-white/10 capitalize">
                              {team.taskType}
                            </Badge>
                          )}
                        </div>

                        {team.taskDescription && (
                          <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-task-${team.id}`}>
                            {team.taskDescription}
                          </p>
                        )}

                        {team.members && team.members.length > 0 && (
                          <div className="flex flex-wrap gap-2" data-testid={`members-${team.id}`}>
                            {team.members.map((member: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-1.5">
                                <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-medium">
                                  {member.displayName?.charAt(0) || member.agentName?.charAt(0) || "A"}
                                </div>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[10px] px-1.5 py-0 capitalize border",
                                    ROLE_BG[member.role] || "bg-white/5 border-white/10",
                                    ROLE_COLORS[member.role] || "text-muted-foreground"
                                  )}
                                >
                                  {member.role}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}

                        {team.roles && team.roles.length > 0 && !team.members?.length && (
                          <div className="flex flex-wrap gap-1.5">
                            {team.roles.map((role: string, idx: number) => (
                              <Badge
                                key={idx}
                                variant="outline"
                                className={cn(
                                  "text-[10px] px-1.5 py-0 capitalize border",
                                  ROLE_BG[role] || "bg-white/5 border-white/10",
                                  ROLE_COLORS[role] || "text-muted-foreground"
                                )}
                              >
                                {role}
                              </Badge>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-4">
                          <div className="flex-1 max-w-xs">
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                              <span>Progress</span>
                              <span data-testid={`text-progress-${team.id}`}>
                                {team.completedTasks || 0} / {team.totalTasks || 0}
                              </span>
                            </div>
                            <Progress value={progressPercent} className="h-1.5" />
                          </div>

                          {team.qualityScore != null && (
                            <div className="flex items-center gap-1 text-xs">
                              <Award className="w-3 h-3 text-purple-400" />
                              <span className="text-purple-400" data-testid={`text-quality-${team.id}`}>
                                {(team.qualityScore * 100).toFixed(0)}%
                              </span>
                            </div>
                          )}

                          {team.creditsRewarded != null && team.creditsRewarded > 0 && (
                            <div className="flex items-center gap-1 text-xs">
                              <Coins className="w-3 h-3 text-amber-400" />
                              <span className="text-amber-400" data-testid={`text-credits-${team.id}`}>
                                {team.creditsRewarded}
                              </span>
                            </div>
                          )}

                          {team.memberCount != null && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Users className="w-3 h-3" />
                              <span>{team.memberCount}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-1">
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-white/5 p-5 space-y-6" data-testid={`detail-team-${team.id}`}>
                      {detailLoading ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        </div>
                      ) : teamDetail ? (
                        <>
                          {teamDetail.members && teamDetail.members.length > 0 && (
                            <div className="space-y-3">
                              <h3 className="text-sm font-semibold flex items-center gap-2">
                                <Bot className="w-4 h-4 text-cyan-400" />
                                Team Members
                              </h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                {teamDetail.members.map((member: any, idx: number) => (
                                  <div
                                    key={idx}
                                    data-testid={`member-${idx}`}
                                    className="glass-card rounded-lg p-3 border border-white/5 flex items-center gap-3"
                                  >
                                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-medium">
                                      {member.displayName?.charAt(0) || member.agentName?.charAt(0) || "A"}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium truncate">
                                          {member.displayName || member.agentName || "Agent"}
                                        </span>
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            "text-[10px] px-1.5 py-0 capitalize border",
                                            ROLE_BG[member.role] || "bg-white/5 border-white/10",
                                            ROLE_COLORS[member.role] || "text-muted-foreground"
                                          )}
                                        >
                                          {member.role}
                                        </Badge>
                                      </div>
                                      {member.selectionScore != null && (
                                        <div className="text-[10px] text-muted-foreground mt-0.5">
                                          Score: {(member.selectionScore * 100).toFixed(0)}%
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {teamDetail.tasks && teamDetail.tasks.length > 0 && (
                            <div className="space-y-3">
                              <h3 className="text-sm font-semibold flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-green-400" />
                                Tasks
                              </h3>
                              <div className="space-y-2">
                                {teamDetail.tasks.map((task: any, idx: number) => (
                                  <div
                                    key={idx}
                                    data-testid={`task-${idx}`}
                                    className="glass-card rounded-lg p-3 border border-white/5"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-sm font-medium">{task.description || task.type || `Task ${idx + 1}`}</span>
                                          <Badge
                                            className={cn("text-[10px] px-1.5 py-0 border-0 capitalize", STATUS_STYLES[task.status] || "bg-white/5 text-muted-foreground")}
                                          >
                                            {task.status || "pending"}
                                          </Badge>
                                        </div>
                                        {task.assignedAgent && (
                                          <div className="text-xs text-muted-foreground mt-1">
                                            Assigned to: {task.assignedAgent}
                                          </div>
                                        )}
                                        {task.result && (
                                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                            {typeof task.result === "string" ? task.result : JSON.stringify(task.result).slice(0, 200)}
                                          </p>
                                        )}
                                      </div>
                                      {task.confidence != null && (
                                        <div className="text-xs text-cyan-400 whitespace-nowrap">
                                          {(task.confidence * 100).toFixed(0)}% conf
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {teamDetail.messages && teamDetail.messages.length > 0 && (
                            <div className="space-y-3">
                              <h3 className="text-sm font-semibold flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-blue-400" />
                                Messages
                              </h3>
                              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                {teamDetail.messages.map((msg: any, idx: number) => (
                                  <div
                                    key={idx}
                                    data-testid={`message-${idx}`}
                                    className="glass-card rounded-lg p-3 border border-white/5"
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs font-medium">{msg.senderName || msg.sender || "Agent"}</span>
                                      {msg.role && (
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            "text-[9px] px-1 py-0 capitalize",
                                            ROLE_COLORS[msg.role] || "text-muted-foreground"
                                          )}
                                        >
                                          {msg.role}
                                        </Badge>
                                      )}
                                      {msg.createdAt && (
                                        <span className="text-[10px] text-muted-foreground ml-auto">
                                          {new Date(msg.createdAt).toLocaleTimeString()}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-3">{msg.content || msg.message}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {teamDetail.workspace && teamDetail.workspace.length > 0 && (
                            <div className="space-y-3">
                              <h3 className="text-sm font-semibold flex items-center gap-2">
                                <Database className="w-4 h-4 text-purple-400" />
                                Workspace
                              </h3>
                              <div className="space-y-2">
                                {teamDetail.workspace.map((entry: any, idx: number) => (
                                  <div
                                    key={idx}
                                    data-testid={`workspace-${idx}`}
                                    className="glass-card rounded-lg p-3 border border-white/5"
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs font-medium">{entry.key || entry.title || `Entry ${idx + 1}`}</span>
                                      {entry.contributor && (
                                        <span className="text-[10px] text-muted-foreground">by {entry.contributor}</span>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-3">
                                      {typeof entry.value === "string" ? entry.value : typeof entry.content === "string" ? entry.content : JSON.stringify(entry.value || entry.content || entry).slice(0, 300)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {teamDetail.stats && (
                            <div className="space-y-3">
                              <h3 className="text-sm font-semibold flex items-center gap-2">
                                <Activity className="w-4 h-4 text-cyan-400" />
                                Team Stats
                              </h3>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {Object.entries(teamDetail.stats).map(([key, value]) => (
                                  <div key={key} className="glass-card rounded-lg p-3 border border-white/5">
                                    <div className="text-[10px] text-muted-foreground capitalize">
                                      {key.replace(/([A-Z])/g, " $1").trim()}
                                    </div>
                                    <div className="text-sm font-semibold mt-0.5">
                                      {typeof value === "number" ? (value < 1 && value > 0 ? `${(value * 100).toFixed(0)}%` : value.toLocaleString()) : String(value)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center py-6 text-muted-foreground text-sm">
                          No detailed data available
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}