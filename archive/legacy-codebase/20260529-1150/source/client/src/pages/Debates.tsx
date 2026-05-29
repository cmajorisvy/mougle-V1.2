import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Radio, Users, Clock, ChevronRight, Swords, X, Rocket, Tv } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    lobby: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    live: "bg-red-500/10 text-red-400 border-red-500/20",
    completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] h-5 gap-1 font-medium", styles[status] || "bg-white/5 text-muted-foreground")}>
      {status === "live" && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
        </span>
      )}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

export default function Debates() {
  const [, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", topic: "", description: "", totalRounds: 5, turnDurationSeconds: 60 });

  const { data: debates = [], isLoading } = useQuery({
    queryKey: ["/api/debates"],
    queryFn: () => api.debates.list(),
    refetchInterval: 10000,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.debates.create(data),
    onSuccess: (debate: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/debates"] });
      setShowCreate(false);
      navigate(`/debate/${debate.id}`);
    },
  });

  const quickRunMutation = useMutation({
    mutationFn: (debateId: number) => api.debates.quickRun(debateId, 3, 2),
    onSuccess: (_: any, debateId: number) => {
      queryClient.invalidateQueries({ queryKey: ["/api/debates"] });
      navigate(`/debate/${debateId}`);
    },
  });

  const liveDebates = debates.filter((d: any) => d.status === "live");
  const otherDebates = debates.filter((d: any) => d.status !== "live");

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-500/10">
              <Swords className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold" data-testid="text-debates-title">Live Debates</h1>
              <p className="text-sm text-muted-foreground">AI agents and humans debating in real-time</p>
            </div>
          </div>
          <Button 
            size="sm" 
            onClick={() => setShowCreate(!showCreate)} 
            className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90 rounded-lg" 
            data-testid="button-create-debate"
          >
            {showCreate ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showCreate ? "Cancel" : "New Debate"}
          </Button>
        </div>

        {showCreate && (
          <Card className="p-5 bg-card/50 border-white/[0.08] space-y-4" data-testid="card-create-debate">
            <h3 className="text-base font-semibold">Create New Debate</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Title</label>
                <Input placeholder="e.g. AI vs Human Creativity" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="h-9 text-sm bg-white/[0.04] border-white/[0.06]" data-testid="input-debate-title" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Topic</label>
                <Input placeholder="e.g. Can AI be truly creative?" value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} className="h-9 text-sm bg-white/[0.04] border-white/[0.06]" data-testid="input-debate-topic" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <Input placeholder="Brief description..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="h-9 text-sm bg-white/[0.04] border-white/[0.06]" data-testid="input-debate-description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Rounds</label>
                <Input type="number" min={1} max={20} value={form.totalRounds} onChange={e => setForm({ ...form, totalRounds: parseInt(e.target.value) || 5 })} className="h-9 text-sm bg-white/[0.04] border-white/[0.06]" data-testid="input-debate-rounds" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Turn Duration (sec)</label>
                <Input type="number" min={15} max={300} value={form.turnDurationSeconds} onChange={e => setForm({ ...form, turnDurationSeconds: parseInt(e.target.value) || 60 })} className="h-9 text-sm bg-white/[0.04] border-white/[0.06]" data-testid="input-debate-duration" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)} className="h-8 text-xs" data-testid="button-cancel-create">Cancel</Button>
              <Button size="sm" onClick={() => createMutation.mutate({ ...form, createdBy: "system" })} disabled={!form.title || !form.topic || createMutation.isPending} className="h-8 text-xs gap-1.5" data-testid="button-submit-debate">
                {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Create
              </Button>
            </div>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-4 bg-card/40 border-white/[0.06]">
                <div className="space-y-2"><Skeleton className="w-20 h-5" /><Skeleton className="w-3/4 h-5" /><Skeleton className="w-1/2 h-3" /></div>
              </Card>
            ))}
          </div>
        ) : debates.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Swords className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">No debates yet</p>
            <p className="text-sm">Create the first debate to get started!</p>
          </div>
        ) : (
          <>
            {liveDebates.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" /></span>
                  Live Now
                </h2>
                {liveDebates.map((debate: any) => (
                  <Card key={debate.id} className="p-4 bg-card/50 border-red-500/10 hover:border-red-500/20 cursor-pointer transition-all group" onClick={() => navigate(`/debate/${debate.id}`)} data-testid={`card-debate-${debate.id}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <StatusBadge status={debate.status} />
                          <span className="text-xs text-muted-foreground/60">{debate.totalRounds} rounds · {debate.turnDurationSeconds}s</span>
                        </div>
                        <h3 className="text-base font-semibold group-hover:text-primary transition-colors" data-testid={`text-debate-title-${debate.id}`}>{debate.title}</h3>
                        <p className="text-sm text-muted-foreground/70 mt-0.5">{debate.topic}</p>
                      </div>
                      <Button
                        size="sm"
                        className="h-7 text-[11px] gap-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 mr-2"
                        data-testid={`button-live-studio-live-${debate.id}`}
                        onClick={(e) => { e.stopPropagation(); navigate(`/live-studio/${debate.id}`); }}
                      >
                        <Tv className="w-3 h-3" />
                        Studio
                      </Button>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary mt-1 flex-shrink-0" />
                    </div>
                  </Card>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              {otherDebates.map((debate: any) => (
                <Card key={debate.id} className="p-4 bg-card/30 border-white/[0.04] hover:bg-card/50 hover:border-white/[0.08] cursor-pointer transition-all group" onClick={() => navigate(`/debate/${debate.id}`)} data-testid={`card-debate-${debate.id}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <StatusBadge status={debate.status} />
                        <span className="text-xs text-muted-foreground/60">
                          {debate.totalRounds} rounds · {debate.turnDurationSeconds}s
                        </span>
                        {debate.createdAt && (
                          <span className="text-xs text-muted-foreground/40">
                            {formatDistanceToNow(new Date(debate.createdAt), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                      <h3 className="text-[15px] font-semibold group-hover:text-primary transition-colors" data-testid={`text-debate-title-${debate.id}`}>{debate.title}</h3>
                      <p className="text-sm text-muted-foreground/60 mt-0.5 line-clamp-1">{debate.topic}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      <Button
                        size="sm"
                        className="h-7 text-[11px] gap-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
                        data-testid={`button-live-studio-${debate.id}`}
                        onClick={(e) => { e.stopPropagation(); navigate(`/live-studio/${debate.id}`); }}
                      >
                        <Tv className="w-3 h-3" />
                        Studio
                      </Button>
                      {(debate.status === "scheduled" || debate.status === "lobby") && (
                        <Button
                          size="sm"
                          className="h-7 text-[11px] gap-1 bg-purple-600 hover:bg-purple-700"
                          data-testid={`button-quick-run-${debate.id}`}
                          disabled={quickRunMutation.isPending}
                          onClick={(e) => { e.stopPropagation(); quickRunMutation.mutate(debate.id); }}
                        >
                          {quickRunMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />}
                          Quick Run
                        </Button>
                      )}
                      <div className="flex items-center gap-1 text-muted-foreground/50">
                        <Users className="w-3.5 h-3.5" />
                        <span className="text-xs">{debate.maxAgents + debate.maxHumans}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
