import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Network, Layers, Bot, Shield, Coins, Database,
  CheckCircle, XCircle, AlertTriangle, Activity,
  Cpu, Eye, Lock, Zap, ArrowDown, Users,
  TrendingUp, Clock
} from "lucide-react";

const LAYER_ICONS: Record<string, any> = {
  user_experience: Users,
  agent_intelligence: Bot,
  trust_privacy: Shield,
  economy_governance: Coins,
  core_platform: Database,
};

const LAYER_COLORS: Record<string, string> = {
  user_experience: "from-blue-500/20 to-blue-600/10 border-blue-500/30",
  agent_intelligence: "from-purple-500/20 to-purple-600/10 border-purple-500/30",
  trust_privacy: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30",
  economy_governance: "from-amber-500/20 to-amber-600/10 border-amber-500/30",
  core_platform: "from-zinc-500/20 to-zinc-600/10 border-zinc-500/30",
};

const LAYER_TEXT: Record<string, string> = {
  user_experience: "text-blue-400",
  agent_intelligence: "text-purple-400",
  trust_privacy: "text-emerald-400",
  economy_governance: "text-amber-400",
  core_platform: "text-zinc-300",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "healthy") return <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]"><CheckCircle className="h-3 w-3 mr-1" />Healthy</Badge>;
  if (status === "degraded") return <Badge className="bg-amber-500/20 text-amber-400 text-[10px]"><AlertTriangle className="h-3 w-3 mr-1" />Degraded</Badge>;
  return <Badge className="bg-red-500/20 text-red-400 text-[10px]"><XCircle className="h-3 w-3 mr-1" />Down</Badge>;
}

function StageBadge({ status }: { status: string }) {
  if (status === "passed") return <span className="text-emerald-400"><CheckCircle className="h-3.5 w-3.5" /></span>;
  if (status === "failed") return <span className="text-red-400"><XCircle className="h-3.5 w-3.5" /></span>;
  if (status === "skipped") return <span className="text-zinc-500"><Clock className="h-3.5 w-3.5" /></span>;
  return <span className="text-zinc-600"><Clock className="h-3.5 w-3.5" /></span>;
}

function ArchitectureTab() {
  const { data: status, isLoading } = useQuery({
    queryKey: ["network-status"],
    queryFn: () => fetch("/api/network/status").then(r => r.json()),
    refetchInterval: 30000,
  });

  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);

  const { data: layerDetail } = useQuery({
    queryKey: ["network-layer", selectedLayer],
    queryFn: () => fetch(`/api/network/layers/${selectedLayer}`).then(r => r.json()),
    enabled: !!selectedLayer,
  });

  if (isLoading) return <div className="text-zinc-400 p-4">Loading network status...</div>;

  const layers = status?.layers || [];

  return (
    <div className="space-y-6" data-testid="architecture-tab-content">
      <div className="text-center mb-6">
        <h3 className="text-lg font-medium text-zinc-300 mb-1">Evolving Intelligence Network Architecture</h3>
        <p className="text-xs text-zinc-500">5-layer architecture powering the AI ecosystem</p>
      </div>

      <div className="space-y-3">
        {layers.map((layer: any, index: number) => {
          const Icon = LAYER_ICONS[layer.name] || Layers;
          const colorClass = LAYER_COLORS[layer.name] || "";
          const textClass = LAYER_TEXT[layer.name] || "text-zinc-400";
          const isSelected = selectedLayer === layer.name;

          return (
            <div key={layer.name}>
              <Card
                className={`bg-gradient-to-r ${colorClass} border cursor-pointer transition-all hover:scale-[1.01] ${isSelected ? "ring-1 ring-white/20" : ""}`}
                onClick={() => setSelectedLayer(isSelected ? null : layer.name)}
                data-testid={`layer-${layer.name}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-black/20">
                        <Icon className={`h-5 w-5 ${textClass}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-500 font-mono">L{index + 1}</span>
                          <h4 className={`font-medium ${textClass}`} data-testid={`layer-label-${layer.name}`}>{layer.label}</h4>
                        </div>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          {layer.activeComponents.map((c: string) => (
                            <Badge key={c} variant="outline" className="text-[9px] border-white/10 text-zinc-500">{c}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        {Object.entries(layer.metrics).slice(0, 2).map(([key, val]) => (
                          <p key={key} className="text-[10px] text-zinc-500">
                            {key.replace(/([A-Z])/g, " $1").trim()}: <span className="text-zinc-300">{val as any}</span>
                          </p>
                        ))}
                      </div>
                      <StatusBadge status={layer.status} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {isSelected && layerDetail && (
                <Card className="bg-zinc-900/80 border-zinc-800 ml-8 mt-1">
                  <CardContent className="p-4">
                    <h5 className="text-xs font-medium text-zinc-400 mb-2">Active Services</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {layerDetail.services?.map((svc: any) => (
                        <div key={svc.name} className="flex items-center gap-2 p-2 rounded bg-zinc-800/50">
                          <CheckCircle className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-zinc-300">{svc.name}</p>
                            <p className="text-[10px] text-zinc-600">{svc.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {index < layers.length - 1 && (
                <div className="flex justify-center py-1">
                  <ArrowDown className="h-4 w-4 text-zinc-600" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricsTab() {
  const { data: status } = useQuery({
    queryKey: ["network-status"],
    queryFn: () => fetch("/api/network/status").then(r => r.json()),
    refetchInterval: 15000,
  });

  const metrics = status?.metrics;
  const agentTypes = status?.agentTypes || {};

  return (
    <div className="space-y-6" data-testid="metrics-tab-content">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 text-center">
            <Zap className="h-5 w-5 text-purple-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white" data-testid="metric-total-executions">{metrics?.totalExecutions || 0}</p>
            <p className="text-xs text-zinc-500">Total Executions</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white" data-testid="metric-success-rate">
              {metrics?.totalExecutions > 0 ? Math.round((metrics.successfulExecutions / metrics.totalExecutions) * 100) : 100}%
            </p>
            <p className="text-xs text-zinc-500">Success Rate</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 text-center">
            <Shield className="h-5 w-5 text-red-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white" data-testid="metric-privacy-blocked">{metrics?.privacyBlocked || 0}</p>
            <p className="text-xs text-zinc-500">Privacy Blocked</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 text-center">
            <Coins className="h-5 w-5 text-amber-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white" data-testid="metric-credit-blocked">{metrics?.creditBlocked || 0}</p>
            <p className="text-xs text-zinc-500">Credit Blocked</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 text-center">
            <Bot className="h-5 w-5 text-blue-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white" data-testid="metric-active-agents">{metrics?.activeAgents || 0}</p>
            <p className="text-xs text-zinc-500">Active Agents</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 text-cyan-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white" data-testid="metric-avg-latency">{metrics?.averageLatencyMs || 0}ms</p>
            <p className="text-xs text-zinc-500">Avg Latency</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300">Agent Type Distribution</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(agentTypes).map(([type, count]) => (
              <div key={type} className="text-center p-3 rounded bg-zinc-800/50">
                <p className="text-lg font-bold text-white">{count as number}</p>
                <p className="text-[10px] text-zinc-500 capitalize">{type.replace("_", " ")}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PipelineTab() {
  const { data: status } = useQuery({
    queryKey: ["network-status"],
    queryFn: () => fetch("/api/network/status").then(r => r.json()),
    refetchInterval: 10000,
  });

  const executions = status?.recentExecutions || [];

  return (
    <div className="space-y-4" data-testid="pipeline-tab-content">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="h-5 w-5 text-purple-400" />
        <h3 className="text-sm font-medium text-zinc-300">Execution Pipeline</h3>
      </div>

      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300">Pipeline Stages</CardTitle>
          <CardDescription className="text-xs text-zinc-500">Every agent execution passes through these 5 gates</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex items-center justify-between gap-2">
            {[
              { name: "Privacy Gate", icon: Lock, color: "text-emerald-400", layer: "Trust & Privacy" },
              { name: "Trust Check", icon: Eye, color: "text-emerald-400", layer: "Trust & Privacy" },
              { name: "Credit Gate", icon: Coins, color: "text-amber-400", layer: "Economy" },
              { name: "Entity Runner", icon: Cpu, color: "text-purple-400", layer: "Intelligence" },
              { name: "Output Filter", icon: Shield, color: "text-emerald-400", layer: "Trust & Privacy" },
            ].map((stage, i) => (
              <div key={stage.name} className="flex items-center gap-2">
                <div className="text-center p-3 rounded-lg bg-zinc-800/70 border border-zinc-700/50 min-w-[90px]">
                  <stage.icon className={`h-5 w-5 mx-auto mb-1 ${stage.color}`} />
                  <p className="text-[10px] text-zinc-300 font-medium">{stage.name}</p>
                  <p className="text-[8px] text-zinc-600">{stage.layer}</p>
                </div>
                {i < 4 && <ArrowDown className="h-3 w-3 text-zinc-600 rotate-[-90deg]" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <h4 className="text-xs font-medium text-zinc-400 mt-4">Recent Executions</h4>
      {executions.length === 0 && <p className="text-zinc-500 text-sm">No executions recorded yet. Execute an agent through the network to see pipeline results.</p>}
      <div className="space-y-2">
        {executions.map((exec: any) => (
          <Card key={exec.id} className="bg-zinc-900/60 border-zinc-800">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{exec.agentType}</Badge>
                  <span className="text-xs text-zinc-400 font-mono">{exec.id}</span>
                </div>
                <Badge className={`text-[10px] ${
                  exec.status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
                  exec.status === "blocked" ? "bg-red-500/20 text-red-400" :
                  exec.status === "failed" ? "bg-red-500/20 text-red-400" :
                  "bg-amber-500/20 text-amber-400"
                }`}>
                  {exec.status}
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                {exec.stages?.map((stage: any) => (
                  <div key={stage.name} className="flex items-center gap-1" title={stage.detail || ""}>
                    <StageBadge status={stage.status} />
                    <span className="text-[9px] text-zinc-500">{stage.name}</span>
                    {stage.durationMs !== undefined && <span className="text-[8px] text-zinc-600">{stage.durationMs}ms</span>}
                  </div>
                ))}
              </div>
              {exec.error && <p className="text-[10px] text-red-400 mt-1">{exec.error}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AgentRegistryTab() {
  const { data: registry, isLoading } = useQuery({
    queryKey: ["network-agents"],
    queryFn: () => fetch("/api/network/agents").then(r => r.json()),
  });

  if (isLoading) return <div className="text-zinc-400 p-4">Loading agent registry...</div>;

  return (
    <div className="space-y-4" data-testid="registry-tab-content">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Bot className="h-4 w-4 text-purple-400" /> Agent Registry
        </h3>
        <Badge variant="outline" className="text-xs" data-testid="registry-total">{registry?.totalAgents || 0} agents</Badge>
      </div>

      {registry?.byType && Object.keys(registry.byType).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(registry.byType).map(([type, count]) => (
            <Badge key={type} variant="outline" className="text-[10px] capitalize">{type}: {count as number}</Badge>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {(registry?.agents || []).length === 0 && <p className="text-zinc-500 text-sm">No agents registered in the network.</p>}
        {(registry?.agents || []).map((agent: any) => (
          <Card key={agent.id} className="bg-zinc-900/60 border-zinc-800">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bot className="h-4 w-4 text-purple-400" />
                <div>
                  <p className="text-sm text-zinc-300">{agent.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[9px] capitalize">{agent.type}</Badge>
                    {agent.hasPrivacyVault && <Badge className="bg-emerald-500/10 text-emerald-400 text-[9px]"><Lock className="h-2.5 w-2.5 mr-0.5" />Privacy</Badge>}
                    {agent.hasTrustVault && <Badge className="bg-blue-500/10 text-blue-400 text-[9px]"><Shield className="h-2.5 w-2.5 mr-0.5" />Trust</Badge>}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-400">{agent.creditBalance} credits</p>
                <Badge className="bg-emerald-500/20 text-emerald-400 text-[9px]">{agent.status}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function NetworkDashboard() {
  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Network className="h-8 w-8 text-purple-400" />
          <div>
            <h1 className="text-2xl font-bold text-white" data-testid="text-network-title">Evolving Intelligence Network</h1>
            <p className="text-sm text-zinc-500">Scalable, privacy-first, economically sustainable AI ecosystem</p>
          </div>
        </div>

        <Tabs defaultValue="architecture">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="architecture" data-testid="tab-architecture">Architecture</TabsTrigger>
            <TabsTrigger value="metrics" data-testid="tab-metrics">Metrics</TabsTrigger>
            <TabsTrigger value="pipeline" data-testid="tab-pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="registry" data-testid="tab-registry">Agent Registry</TabsTrigger>
          </TabsList>
          <TabsContent value="architecture"><ArchitectureTab /></TabsContent>
          <TabsContent value="metrics"><MetricsTab /></TabsContent>
          <TabsContent value="pipeline"><PipelineTab /></TabsContent>
          <TabsContent value="registry"><AgentRegistryTab /></TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
