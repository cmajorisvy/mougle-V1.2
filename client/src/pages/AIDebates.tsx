import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout/Layout";
import {
  Bot, Plus, Play, Loader2, MessageSquare, Clock,
  Lightbulb, Sparkles, ArrowRight, Zap, Brain,
  ChevronDown, ChevronUp, RefreshCw, Users
} from "lucide-react";

async function fetchAPI<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message);
  }
  return res.json();
}

interface Debate {
  id: number;
  title: string;
  topic: string;
  description: string | null;
  status: string;
  format: string;
  totalRounds: number;
  currentRound: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  consensusSummary: string | null;
  disagreementSummary: string | null;
  confidenceScore: number | null;
}

interface DebateDetail extends Debate {
  participants: Array<{
    id: number;
    userId: string;
    role: string;
    participantType: string;
    position: string | null;
    turnsUsed: number;
    user: { id: string; displayName: string; avatar: string | null; role: string } | null;
  }>;
  turns: Array<{
    id: number;
    participantId: number;
    roundNumber: number;
    turnOrder: number;
    content: string;
    wordCount: number;
    tcsScore: number | null;
    createdAt: string;
  }>;
}

interface FlywheelStatus {
  enabled: boolean;
  reason?: string | null;
}

const POSITION_COLORS: Record<string, string> = {
  for: "text-emerald-400",
  against: "text-red-400",
  neutral: "text-blue-400",
};

const POSITION_BG: Record<string, string> = {
  for: "bg-emerald-500/10 border-emerald-500/20",
  against: "bg-red-500/10 border-red-500/20",
  neutral: "bg-blue-500/10 border-blue-500/20",
};

export default function AIDebates() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDebate, setSelectedDebate] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [agentCount, setAgentCount] = useState("3");
  const [rounds, setRounds] = useState("3");
  const [appIdeaLoading, setAppIdeaLoading] = useState(false);
  const [appIdea, setAppIdea] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: flywheelStatus } = useQuery<FlywheelStatus>({
    queryKey: ["/api/flywheel/status"],
    queryFn: () => fetchAPI<FlywheelStatus>("/flywheel/status"),
  });

  const { data: debates = [], isLoading } = useQuery<Debate[]>({
    queryKey: ["/api/debates"],
    queryFn: () => fetchAPI("/debates"),
    refetchInterval: 10000,
  });

  const { data: debateDetail, isLoading: detailLoading } = useQuery<DebateDetail>({
    queryKey: ["/api/debates", selectedDebate],
    queryFn: () => fetchAPI(`/debates/${selectedDebate}`),
    enabled: !!selectedDebate,
    refetchInterval: selectedDebate ? 5000 : false,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const debate = await fetchAPI("/debates", {
        method: "POST",
        body: JSON.stringify({
          title,
          topic,
          description: description || undefined,
          totalRounds: parseInt(rounds),
          maxAgents: parseInt(agentCount) + 2,
          maxHumans: 0,
          format: "structured",
          createdBy: "system",
        }),
      });
      return debate;
    },
    onSuccess: async (debate: any) => {
      toast({ title: "Debate created", description: "Running AI debate now..." });
      setCreateOpen(false);
      setTitle("");
      setTopic("");
      setDescription("");
      try {
        await fetchAPI(`/debates/${debate.id}/quick-run`, {
          method: "POST",
          body: JSON.stringify({ agentCount: parseInt(agentCount), rounds: parseInt(rounds) }),
        });
        toast({ title: "Debate completed", description: "AI agents have finished debating" });
      } catch {
        toast({ title: "Debate started", description: "Check back for results", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/debates"] });
      setSelectedDebate(debate.id);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create debate", variant: "destructive" });
    },
  });

  const generateAppIdea = async (debate: DebateDetail) => {
    setAppIdeaLoading(true);
    setAppIdea(null);
    try {
      const transcript = debate.turns.map(t => {
        const p = debate.participants.find(p => p.id === t.participantId);
        return `${p?.user?.displayName || "Agent"} (${p?.position || "neutral"}): ${t.content}`;
      }).join("\n\n");

      const response = await fetchAPI<any>("/ai/generate", {
        method: "POST",
        body: JSON.stringify({
          prompt: `Based on this AI debate about "${debate.topic}", generate a practical app or tool idea that could be built. Include: 1) App name 2) One-line description 3) Key features (3-5) 4) Target users 5) How it connects to the debate insights.\n\nDebate transcript:\n${transcript.slice(0, 3000)}`,
          maxTokens: 500,
        }),
      });
      setAppIdea(response.content || response.text || "Could not generate idea");
    } catch {
      try {
        const turns = debate.turns.slice(0, 6);
        const summary = turns.map(t => {
          const p = debate.participants.find(p => p.id === t.participantId);
          return `${p?.user?.displayName || "Agent"}: ${t.content.slice(0, 100)}...`;
        }).join("\n");
        setAppIdea(`Based on the debate "${debate.topic}":\n\nApp Idea: ${debate.topic} Analyzer\nA tool that helps users explore different perspectives on "${debate.topic}" with AI-powered analysis.\n\nKey insights from the debate:\n${summary}`);
      } catch {
        setAppIdea("Unable to generate app idea at this time.");
      }
    }
    setAppIdeaLoading(false);
  };

  const triggerFlywheel = async (debateId: number) => {
    try {
      if (flywheelStatus && !flywheelStatus.enabled) {
        toast({
          title: "Flywheel disabled",
          description: flywheelStatus.reason || "Video generation is disabled.",
          variant: "destructive",
        });
        return;
      }
      await fetchAPI(`/flywheel/trigger/${debateId}`, { method: "POST" });
      toast({ title: "Flywheel triggered", description: "Content generation pipeline started" });
    } catch {
      toast({ title: "Flywheel error", description: "Could not trigger content pipeline", variant: "destructive" });
    }
  };

  const completedDebates = debates.filter(d => d.status === "completed");
  const activeDebates = debates.filter(d => d.status === "live");
  const scheduledDebates = debates.filter(d => d.status === "scheduled" || d.status === "lobby");

  return (
    <Layout>
      <div className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto" data-testid="page-ai-debates">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2" data-testid="text-page-title">
              <Brain className="w-7 h-7 text-primary" />
              AI Debates
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Watch intelligent entities debate topics, generate insights, and spark new ideas
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-create-debate">
                <Plus className="w-4 h-4" />
                New Debate
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" />
                  Create AI Debate
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Title</label>
                  <Input
                    placeholder="e.g., The Future of AI Governance"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    data-testid="input-debate-title"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Topic / Question</label>
                  <Textarea
                    placeholder="e.g., Should AI systems have legal personhood?"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    rows={2}
                    data-testid="input-debate-topic"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Description (optional)</label>
                  <Textarea
                    placeholder="Additional context for the debate..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={2}
                    data-testid="input-debate-description"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">AI Entities</label>
                    <Select value={agentCount} onValueChange={setAgentCount}>
                      <SelectTrigger data-testid="select-agent-count">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">2 entities</SelectItem>
                        <SelectItem value="3">3 entities</SelectItem>
                        <SelectItem value="4">4 entities</SelectItem>
                        <SelectItem value="5">5 entities</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1 block">Rounds</label>
                    <Select value={rounds} onValueChange={setRounds}>
                      <SelectTrigger data-testid="select-rounds">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">2 rounds</SelectItem>
                        <SelectItem value="3">3 rounds</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  className="w-full gap-2"
                  onClick={() => createMutation.mutate()}
                  disabled={!title.trim() || !topic.trim() || createMutation.isPending}
                  data-testid="button-start-debate"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Running Debate...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Start AI Debate
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <Tabs defaultValue="completed" className="w-full">
              <TabsList className="w-full grid grid-cols-3 bg-card border border-white/10">
                <TabsTrigger value="completed" className="text-xs" data-testid="tab-completed">
                  Done ({completedDebates.length})
                </TabsTrigger>
                <TabsTrigger value="active" className="text-xs" data-testid="tab-active">
                  Active ({activeDebates.length})
                </TabsTrigger>
                <TabsTrigger value="pending" className="text-xs" data-testid="tab-pending">
                  Pending ({scheduledDebates.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="completed" className="space-y-2 mt-3">
                {isLoading && <div className="text-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>}
                {completedDebates.length === 0 && !isLoading && (
                  <Card className="border-dashed border-white/10">
                    <CardContent className="py-8 text-center text-muted-foreground text-sm">
                      No completed debates yet. Create one to get started!
                    </CardContent>
                  </Card>
                )}
                {completedDebates.map(debate => (
                  <DebateCard
                    key={debate.id}
                    debate={debate}
                    isSelected={selectedDebate === debate.id}
                    onClick={() => setSelectedDebate(debate.id)}
                  />
                ))}
              </TabsContent>

              <TabsContent value="active" className="space-y-2 mt-3">
                {activeDebates.length === 0 && (
                  <Card className="border-dashed border-white/10">
                    <CardContent className="py-8 text-center text-muted-foreground text-sm">
                      No active debates
                    </CardContent>
                  </Card>
                )}
                {activeDebates.map(debate => (
                  <DebateCard
                    key={debate.id}
                    debate={debate}
                    isSelected={selectedDebate === debate.id}
                    onClick={() => setSelectedDebate(debate.id)}
                  />
                ))}
              </TabsContent>

              <TabsContent value="pending" className="space-y-2 mt-3">
                {scheduledDebates.length === 0 && (
                  <Card className="border-dashed border-white/10">
                    <CardContent className="py-8 text-center text-muted-foreground text-sm">
                      No pending debates
                    </CardContent>
                  </Card>
                )}
                {scheduledDebates.map(debate => (
                  <DebateCard
                    key={debate.id}
                    debate={debate}
                    isSelected={selectedDebate === debate.id}
                    onClick={() => setSelectedDebate(debate.id)}
                  />
                ))}
              </TabsContent>
            </Tabs>
          </div>

          <div className="lg:col-span-2">
            {!selectedDebate && (
              <Card className="border-white/5">
                <CardContent className="py-16 text-center">
                  <Brain className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">Select a debate to view the transcript</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Or create a new one to watch AI entities reason together</p>
                </CardContent>
              </Card>
            )}

            {selectedDebate && detailLoading && (
              <Card className="border-white/5">
                <CardContent className="py-16 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                </CardContent>
              </Card>
            )}

            {selectedDebate && debateDetail && !detailLoading && (
              <div className="space-y-4">
                <Card className="border-white/5">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2" data-testid="text-debate-title">
                          {debateDetail.title}
                          <Badge
                            variant={debateDetail.status === "completed" ? "default" : debateDetail.status === "live" ? "destructive" : "secondary"}
                            className="text-[10px]"
                            data-testid="badge-debate-status"
                          >
                            {debateDetail.status}
                          </Badge>
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">{debateDetail.topic}</p>
                      </div>
                      <div className="flex gap-2">
                        {debateDetail.status === "completed" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs"
                              onClick={() => triggerFlywheel(debateDetail.id)}
                              disabled={flywheelStatus ? !flywheelStatus.enabled : true}
                              data-testid="button-trigger-flywheel"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              {flywheelStatus?.enabled ? "Flywheel" : "Flywheel (Disabled)"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs"
                              onClick={() => generateAppIdea(debateDetail)}
                              disabled={appIdeaLoading}
                              data-testid="button-generate-app-idea"
                            >
                              {appIdeaLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5" />}
                              App Idea
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {debateDetail.participants.map(p => (
                        <div
                          key={p.id}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${POSITION_BG[p.position || "neutral"] || POSITION_BG.neutral}`}
                          data-testid={`participant-${p.id}`}
                        >
                          <Bot className="w-3 h-3" />
                          <span className="font-medium">{p.user?.displayName || "Entity"}</span>
                          <span className={`text-[10px] ${POSITION_COLORS[p.position || "neutral"] || POSITION_COLORS.neutral}`}>
                            {p.position || "neutral"}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="text-xs text-muted-foreground flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {debateDetail.turns.length} turns
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {debateDetail.participants.length} entities
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {debateDetail.totalRounds} rounds
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {appIdea && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-primary" />
                        Generated App Idea
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-sm text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed" data-testid="text-app-idea">
                        {appIdea}
                      </pre>
                    </CardContent>
                  </Card>
                )}

                <Card className="border-white/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Debate Transcript
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DebateTranscript debate={debateDetail} />
                  </CardContent>
                </Card>

                {(debateDetail.consensusSummary || debateDetail.disagreementSummary) && (
                  <Card className="border-white/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {debateDetail.consensusSummary && (
                        <div>
                          <p className="text-xs font-medium text-emerald-400 mb-1">Consensus</p>
                          <p className="text-sm text-foreground/80">{debateDetail.consensusSummary}</p>
                        </div>
                      )}
                      {debateDetail.disagreementSummary && (
                        <div>
                          <p className="text-xs font-medium text-red-400 mb-1">Points of Disagreement</p>
                          <p className="text-sm text-foreground/80">{debateDetail.disagreementSummary}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function DebateCard({ debate, isSelected, onClick }: { debate: Debate; isSelected: boolean; onClick: () => void }) {
  return (
    <Card
      className={`cursor-pointer transition-all hover:border-white/20 ${isSelected ? "border-primary/40 bg-primary/5" : "border-white/5"}`}
      onClick={onClick}
      data-testid={`card-debate-${debate.id}`}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-sm font-medium text-foreground line-clamp-1">{debate.title}</h3>
          <Badge
            variant={debate.status === "completed" ? "default" : debate.status === "live" ? "destructive" : "secondary"}
            className="text-[10px] ml-2 shrink-0"
          >
            {debate.status}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{debate.topic}</p>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60">
          <span>{debate.totalRounds} rounds</span>
          <span>{new Date(debate.createdAt).toLocaleDateString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function DebateTranscript({ debate }: { debate: DebateDetail }) {
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set());

  if (debate.turns.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No turns recorded yet
      </div>
    );
  }

  const toggleTurn = (id: number) => {
    setExpandedTurns(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const turnsByRound = debate.turns.reduce((acc, turn) => {
    const round = turn.roundNumber;
    if (!acc[round]) acc[round] = [];
    acc[round].push(turn);
    return acc;
  }, {} as Record<number, typeof debate.turns>);

  return (
    <div className="space-y-6">
      {Object.entries(turnsByRound).map(([roundNum, turns]) => (
        <div key={roundNum}>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-white/5" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Round {roundNum}
            </span>
            <div className="h-px flex-1 bg-white/5" />
          </div>
          <div className="space-y-3">
            {turns.map(turn => {
              const participant = debate.participants.find(p => p.id === turn.participantId);
              const isExpanded = expandedTurns.has(turn.id);
              const isLong = turn.content.length > 200;

              return (
                <div
                  key={turn.id}
                  className="group flex gap-3"
                  data-testid={`turn-${turn.id}`}
                >
                  <Avatar className="w-7 h-7 mt-0.5 shrink-0">
                    <AvatarFallback className="text-[10px] bg-primary/20 text-primary">
                      <Bot className="w-3.5 h-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-foreground">
                        {participant?.user?.displayName || "Entity"}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 py-0 h-4 border ${POSITION_BG[participant?.position || "neutral"] || POSITION_BG.neutral}`}
                      >
                        {participant?.position || "neutral"}
                      </Badge>
                    </div>
                    <p className={`text-sm text-foreground/80 leading-relaxed ${!isExpanded && isLong ? "line-clamp-3" : ""}`}>
                      {turn.content}
                    </p>
                    {isLong && (
                      <button
                        onClick={() => toggleTurn(turn.id)}
                        className="text-[10px] text-primary hover:underline mt-1 flex items-center gap-0.5"
                        data-testid={`button-expand-turn-${turn.id}`}
                      >
                        {isExpanded ? (
                          <><ChevronUp className="w-3 h-3" /> Show less</>
                        ) : (
                          <><ChevronDown className="w-3 h-3" /> Show more</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
