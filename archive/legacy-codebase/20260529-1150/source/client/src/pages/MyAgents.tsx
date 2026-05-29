import { Layout } from "@/components/layout/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { Bot, Plus, Trash2, Rocket, Activity, Star, Lock, Globe, Zap, Loader2, BarChart3, Settings, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { GluonHowItWorksPanel, GluonPassportCard } from "@/components/gluon/GluonPublic";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/30",
  active_private: "bg-green-500/10 text-green-400 border-green-500/30",
  training: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  needs_memory_confirmation: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  draft: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  paused: "bg-gray-500/10 text-gray-400 border-gray-500/30",
};

export default function MyAgents() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const [packetAgentId, setPacketAgentId] = useState("");
  const [packetForm, setPacketForm] = useState({
    title: "",
    summary: "",
    abstractedContent: "",
    vaultType: "business",
    businessKnowledgeApproved: false,
  });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth/signin", { replace: true });
    }
  }, [authLoading, navigate, user]);

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["/api/user-agents"],
    queryFn: () => api.userAgents.list(user?.id),
    enabled: !!user?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.userAgents.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-agents"] });
    },
  });

  const { data: packets = [] } = useQuery({
    queryKey: ["/api/knowledge-economy/packets"],
    queryFn: () => api.knowledgeEconomy.packets(),
    enabled: !!user?.id,
  });

  const createPacketMutation = useMutation({
    mutationFn: () => api.knowledgeEconomy.createPacket({
      creatorAgentId: packetAgentId,
      title: packetForm.title,
      summary: packetForm.summary,
      abstractedContent: packetForm.abstractedContent,
      sourceType: "abstracted_experience",
      vaultType: packetForm.vaultType,
      sensitivity: packetForm.vaultType === "public" ? "public" : packetForm.vaultType === "verified" ? "internal" : "restricted",
      privacyLevel: "internal",
      consentPolicy: {
        creatorConsent: true,
        crossAgentLearningConsent: true,
        businessKnowledgeApproved: packetForm.businessKnowledgeApproved,
        rawMemoryShared: false,
      },
      evidenceStrength: packetForm.vaultType === "verified" ? 0.75 : 0.45,
      noveltyScore: 0.5,
      usefulnessPrediction: 0.5,
      riskScore: 0.25,
      complianceScore: 0.6,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge-economy/packets"] });
      setPacketForm({ title: "", summary: "", abstractedContent: "", vaultType: "business", businessKnowledgeApproved: false });
      setPacketAgentId("");
    },
  });

  const activeAgents = agents.filter((a: any) => a.status === "active" || a.status === "active_private");
  const privateAgents = agents.filter((a: any) => a.visibility === "private");
  const totalUsage = agents.reduce((sum: number, a: any) => sum + (a.totalUsageCount || 0), 0);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" data-testid="loading-spinner" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="relative rounded-2xl overflow-hidden p-6 md:p-8 bg-gradient-to-br from-violet-600/20 via-indigo-600/10 to-transparent border border-white/5">
          <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 to-transparent" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
                <Bot className="w-6 h-6 text-violet-400" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-display font-bold" data-testid="text-page-title">My Entities</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Manage your private user-owned agent fleet</p>
              </div>
            </div>
            <Button
              data-testid="button-create-agent"
              className="h-10 bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white font-medium shadow-lg shadow-violet-500/20 gap-2"
              onClick={() => navigate("/agent-builder")}
            >
              <Plus className="w-4 h-4" />
              Create Agent
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="section-stats">
          <div className="glass-card rounded-xl p-4 border border-white/5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Bot className="w-3.5 h-3.5" />
              Total Agents
            </div>
            <span className="font-semibold text-lg" data-testid="text-total-agents">{agents.length}</span>
          </div>
          <div className="glass-card rounded-xl p-4 border border-white/5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Activity className="w-3.5 h-3.5" />
              Active Agents
            </div>
            <span className="font-semibold text-lg text-green-400" data-testid="text-active-agents">{activeAgents.length}</span>
          </div>
          <div className="glass-card rounded-xl p-4 border border-white/5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <BarChart3 className="w-3.5 h-3.5" />
              Total Usage
            </div>
            <span className="font-semibold text-lg" data-testid="text-total-usage">{totalUsage.toLocaleString()}</span>
          </div>
          <div className="glass-card rounded-xl p-4 border border-white/5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Shield className="w-3.5 h-3.5" />
              Private Agents
            </div>
            <span className="font-semibold text-lg text-emerald-400" data-testid="text-private-agents">{privateAgents.length}</span>
          </div>
        </div>

        <div className="glass-card rounded-2xl border border-white/5 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-display font-bold">Knowledge Packets</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Draft abstracted, consent-controlled learning packets from your own private agents. Public Gluon views show contribution identity only; raw memory, scoring internals, and marketplace transactions stay disabled.
              </p>
            </div>
            <Badge variant="outline" className="w-fit bg-violet-500/10 border-violet-500/20 text-violet-300">
              {packets.length} packet{packets.length === 1 ? "" : "s"}
            </Badge>
          </div>

          {packetAgentId ? (
            <div className="mt-5 grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  value={packetForm.title}
                  onChange={(event) => setPacketForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Packet title"
                  className="bg-background/40"
                />
                <select
                  value={packetForm.vaultType}
                  onChange={(event) => setPacketForm((prev) => ({ ...prev, vaultType: event.target.value }))}
                  className="h-9 rounded-md border border-input bg-background/40 px-3 text-sm"
                >
                  <option value="business">Business / restricted</option>
                  <option value="public">Public knowledge</option>
                  <option value="behavioral">Behavioral style only</option>
                  <option value="verified">Verified source-backed</option>
                </select>
              </div>
              <Input
                value={packetForm.summary}
                onChange={(event) => setPacketForm((prev) => ({ ...prev, summary: event.target.value }))}
                placeholder="Short abstracted summary"
                className="bg-background/40"
              />
              <Textarea
                value={packetForm.abstractedContent}
                onChange={(event) => setPacketForm((prev) => ({ ...prev, abstractedContent: event.target.value }))}
                placeholder="Abstract the lesson or pattern. Do not paste private memory, secrets, credentials, or customer data."
                className="min-h-28 bg-background/40"
              />
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={packetForm.businessKnowledgeApproved}
                  onChange={(event) => setPacketForm((prev) => ({ ...prev, businessKnowledgeApproved: event.target.checked }))}
                  className="mt-0.5"
                />
                I approve supervised business-vault use for this abstracted packet. Personal/private memory is still blocked.
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-500 text-white"
                  disabled={createPacketMutation.isPending || !packetForm.title || !packetForm.summary || !packetForm.abstractedContent}
                  onClick={() => createPacketMutation.mutate()}
                >
                  {createPacketMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  Create Draft Packet
                </Button>
                <Button size="sm" variant="outline" className="border-white/10" onClick={() => setPacketAgentId("")}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-4">Use “Draft packet” on one of your private agents below.</p>
          )}

          {packets.length > 0 && (
            <div className="mt-5 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Contribution Timeline</h3>
                <p className="text-xs text-muted-foreground">
                  Reviewed contribution records are shown as safe Gluon IDs, not scores, balances, or estimates.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {packets.slice(0, 4).map((packet: any) => {
                  const gluon = packet.publicGluon || packet.gluon;
                  if (!gluon?.displayId) return null;
                  return <GluonPassportCard key={packet.id || gluon.displayId} gluon={gluon} />;
                })}
              </div>
            </div>
          )}

          <div className="mt-5">
            <GluonHowItWorksPanel audience="user" topic="gluon" />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" data-testid="loading-spinner" />
          </div>
        ) : agents.length === 0 ? (
          <div className="glass-card rounded-2xl border border-white/5 p-12 text-center" data-testid="empty-state">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-violet-400" />
            </div>
            <h2 className="text-xl font-display font-bold mb-2">No agents yet</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Create your first private agent and train it with vault-aware text or link sources.
            </p>
            <Button
              data-testid="button-create-first-agent"
              className="h-10 bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white font-medium shadow-lg shadow-violet-500/20 gap-2"
              onClick={() => navigate("/agent-builder")}
            >
              <Plus className="w-4 h-4" />
              Create Your First Agent
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="agents-grid">
            {agents.map((agent: any) => (
              <div
                key={agent.id}
                data-testid={`card-agent-${agent.id}`}
                className="glass-card rounded-xl border border-white/5 p-5 space-y-4 hover:border-white/10 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-full bg-violet-500/20 border border-violet-500/20 flex items-center justify-center text-violet-400 font-semibold text-lg flex-shrink-0">
                    {agent.name?.charAt(0)?.toUpperCase() || "A"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate" data-testid={`text-agent-name-${agent.id}`}>{agent.name}</span>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] px-1.5 py-0 capitalize", STATUS_STYLES[agent.status] || STATUS_STYLES.draft)}
                        data-testid={`badge-status-${agent.id}`}
                      >
                        {agent.status || "draft"}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 bg-white/5 border-white/10 gap-1"
                        data-testid={`badge-visibility-${agent.id}`}
                      >
                        {agent.visibility === "private" ? <Lock className="w-2.5 h-2.5" /> : <Globe className="w-2.5 h-2.5" />}
                        {agent.visibility || "public"}
                      </Badge>
                    </div>
                    {agent.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{agent.description}</p>
                    )}
                  </div>
                </div>

                {agent.skills && agent.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" data-testid={`skills-${agent.id}`}>
                    {agent.skills.map((skill: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0 bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                )}

                {(agent.model || agent.provider) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span>{agent.provider || "openai"}</span>
                    {agent.model && <span className="font-mono text-[10px] bg-white/5 px-1.5 py-0.5 rounded">{agent.model}</span>}
                  </div>
                )}

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1" data-testid={`stat-usage-${agent.id}`}>
                    <BarChart3 className="w-3 h-3" />
                    <span>{(agent.totalUsageCount || 0).toLocaleString()} uses</span>
                  </div>
                  <div className="flex items-center gap-1" data-testid={`stat-privacy-${agent.id}`}>
                    <Shield className="w-3 h-3 text-emerald-400" />
                    <span>{agent.visibility === "private" ? "private" : "review"}</span>
                  </div>
                  {agent.rating != null && (
                    <div className="flex items-center gap-1" data-testid={`stat-rating-${agent.id}`}>
                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      <span>{Number(agent.rating).toFixed(1)}</span>
                    </div>
                  )}
                </div>

                {agent.deploymentModes && agent.deploymentModes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5" data-testid={`deploy-modes-${agent.id}`}>
                    {agent.deploymentModes.filter((mode: string) => mode === "private").map((mode: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-400 border-green-500/20 gap-1">
                        <Rocket className="w-2.5 h-2.5" />
                        {mode}
                      </Badge>
                    ))}
                    {agent.deploymentModes.some((mode: string) => mode !== "private") && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-400 border-amber-500/20">
                        public modes deferred
                      </Badge>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs bg-white/[0.02] border-white/10 hover:bg-white/[0.06] gap-1"
                    onClick={() => navigate("/agent-builder")}
                    data-testid={`button-edit-${agent.id}`}
                  >
                    <Settings className="w-3 h-3" />
                    Builder
                  </Button>
                  <Badge variant="outline" className="h-7 border-emerald-500/20 bg-emerald-500/10 px-2 text-[10px] text-emerald-300">
                    Private only
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs bg-white/[0.02] border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 gap-1"
                    onClick={() => navigate("/agent-marketplace/safe-clone")}
                    data-testid={`button-safe-clone-${agent.id}`}
                  >
                    <Shield className="w-3 h-3" />
                    Safe clone
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs bg-white/[0.02] border-white/10 hover:bg-violet-500/10 hover:border-violet-500/30 gap-1"
                    onClick={() => setPacketAgentId(agent.id)}
                    data-testid={`button-draft-packet-${agent.id}`}
                  >
                    <Zap className="w-3 h-3" />
                    Draft packet
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs bg-white/[0.02] border-white/10 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 gap-1 ml-auto"
                    onClick={() => deleteMutation.mutate(agent.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-${agent.id}`}
                  >
                    {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
