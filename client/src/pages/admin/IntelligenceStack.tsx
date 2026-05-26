import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Loader2, Layers, Users, Bot, Globe, Coins,
  Gavel, Building2, ChevronRight, Shield, AlertTriangle,
  CheckCircle, Activity, Server, Sparkles, Heart
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/hooks/use-admin-auth";

async function adminGet(url: string) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

const LAYER_ICONS: Record<string, any> = {
  human_interaction: Users,
  agent_intelligence: Bot,
  reality_alignment: Globe,
  economy: Coins,
  governance: Gavel,
  civilization: Building2,
};

const LAYER_GRADIENTS: Record<string, string> = {
  human_interaction: "from-blue-500/20 to-blue-600/5",
  agent_intelligence: "from-purple-500/20 to-purple-600/5",
  reality_alignment: "from-emerald-500/20 to-emerald-600/5",
  economy: "from-amber-500/20 to-amber-600/5",
  governance: "from-red-500/20 to-red-600/5",
  civilization: "from-cyan-500/20 to-cyan-600/5",
};

const LAYER_BORDER: Record<string, string> = {
  human_interaction: "border-blue-500/30",
  agent_intelligence: "border-purple-500/30",
  reality_alignment: "border-emerald-500/30",
  economy: "border-amber-500/30",
  governance: "border-red-500/30",
  civilization: "border-cyan-500/30",
};

const LAYER_TEXT: Record<string, string> = {
  human_interaction: "text-blue-400",
  agent_intelligence: "text-purple-400",
  reality_alignment: "text-emerald-400",
  economy: "text-amber-400",
  governance: "text-red-400",
  civilization: "text-cyan-400",
};

function HealthBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-gray-400">{value}%</span>
    </div>
  );
}

function LayerCard({ layer, expanded, onToggle }: { layer: any; expanded: boolean; onToggle: () => void }) {
  const Icon = LAYER_ICONS[layer.key] || Layers;
  const gradient = LAYER_GRADIENTS[layer.key] || "from-gray-500/20 to-gray-600/5";
  const border = LAYER_BORDER[layer.key] || "border-gray-500/30";
  const textColor = LAYER_TEXT[layer.key] || "text-gray-400";
  const healthColor = layer.health >= 70 ? "bg-green-500" : layer.health >= 40 ? "bg-yellow-500" : "bg-red-500";

  const kpiEntries = Object.entries(layer.kpis || {});

  return (
    <Card className={cn("bg-gradient-to-br border overflow-hidden transition-all duration-300", gradient, border, expanded && "ring-1 ring-white/10")} data-testid={`layer-card-${layer.key}`}>
      <button className="w-full text-left p-5" onClick={onToggle} data-testid={`button-toggle-${layer.key}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-black/30", textColor)}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-500">L{layer.key === "human_interaction" ? 1 : layer.key === "agent_intelligence" ? 2 : layer.key === "reality_alignment" ? 3 : layer.key === "economy" ? 4 : layer.key === "governance" ? 5 : 6}</span>
                <h3 className="text-sm font-semibold text-white">{layer.name}</h3>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-gray-500">{layer.serviceCount} services</span>
                <span className="text-[10px] text-gray-500">{layer.featureCount} features</span>
                <HealthBar value={layer.health} color={healthColor} />
              </div>
            </div>
          </div>
          <ChevronRight className={cn("w-4 h-4 text-gray-500 transition-transform", expanded && "rotate-90")} />
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/5 pt-4" data-testid={`layer-detail-${layer.key}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {kpiEntries.map(([key, value]) => (
              <div key={key} className="bg-black/20 rounded-lg p-3" data-testid={`kpi-${layer.key}-${key}`}>
                <span className="text-[10px] text-gray-500 block mb-1">{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
                <span className="text-lg font-bold text-white">{String(value)}</span>
              </div>
            ))}
          </div>

          {layer.features && layer.features.length > 0 && (
            <div>
              <span className="text-[10px] text-gray-500 block mb-2">Features</span>
              <div className="flex flex-wrap gap-1.5">
                {layer.features.map((f: string) => (
                  <span key={f} className={cn("text-[10px] px-2 py-0.5 rounded-full bg-black/30", textColor)}>{f}</span>
                ))}
              </div>
            </div>
          )}

          {layer.services && layer.services.length > 0 && (
            <div>
              <span className="text-[10px] text-gray-500 block mb-2">Services</span>
              <div className="flex flex-wrap gap-1.5">
                {layer.services.map((s: string) => (
                  <span key={s} className="text-[10px] px-2 py-0.5 rounded bg-gray-800/50 text-gray-400 font-mono">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function IntelligenceStack() {
  const { isLoading: authLoading, isAuthenticated } = useAdminAuth();
  const [, navigate] = useLocation();
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);

  const { data: stackData, isLoading: stackLoading } = useQuery({
    queryKey: ["intelligence-stack-layers"],
    queryFn: () => adminGet("/api/intelligence-stack/layers"),
    enabled: isAuthenticated,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["intelligence-stack-analytics"],
    queryFn: () => adminGet("/api/intelligence-stack/analytics"),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  });

  if (authLoading || stackLoading || analyticsLoading) {
    return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-purple-400" /></div>;
  }
  if (!isAuthenticated) return null;

  const overall = analytics?.overall || {};
  const analyticsLayers = analytics?.layers || [];
  const registryLayers = stackData?.layers || [];

  const mergedLayers = registryLayers.map((rl: any) => {
    const al = analyticsLayers.find((a: any) => a.key === rl.key);
    return { ...rl, ...(al || {}), features: rl.features, services: rl.services };
  });

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-6" data-testid="intelligence-stack-page">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} data-testid="button-back-admin">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500/30 to-cyan-500/30 rounded-lg">
              <Layers className="w-6 h-6 text-purple-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-stack-title">Intelligence Stack</h1>
              <p className="text-sm text-gray-400">Architecture overview — {overall.totalServices || 0} services across {overall.totalLayers || 6} layers</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-total-layers">
            <div className="flex items-center gap-2 mb-1 text-gray-500"><Layers className="w-3.5 h-3.5" /><span className="text-[10px]">Layers</span></div>
            <span className="text-xl font-bold">{overall.totalLayers || 6}</span>
          </Card>
          <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-total-services">
            <div className="flex items-center gap-2 mb-1 text-gray-500"><Server className="w-3.5 h-3.5" /><span className="text-[10px]">Services</span></div>
            <span className="text-xl font-bold">{overall.totalServices || 0}</span>
          </Card>
          <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-avg-health">
            <div className="flex items-center gap-2 mb-1 text-gray-500"><Heart className="w-3.5 h-3.5" /><span className="text-[10px]">Avg Health</span></div>
            <span className="text-xl font-bold">{overall.averageHealth || 0}%</span>
          </Card>
          <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-violations">
            <div className="flex items-center gap-2 mb-1 text-gray-500"><AlertTriangle className="w-3.5 h-3.5" /><span className="text-[10px]">Violations</span></div>
            <span className="text-xl font-bold">{overall.dependencyViolations || 0}</span>
          </Card>
          <Card className="bg-[#12121a] border-gray-800 p-4" data-testid="card-integrity">
            <div className="flex items-center gap-2 mb-1 text-gray-500">
              {overall.stackIntegrity === "healthy" ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />}
              <span className="text-[10px]">Integrity</span>
            </div>
            <span className={cn("text-xl font-bold", overall.stackIntegrity === "healthy" ? "text-green-400" : "text-yellow-400")}>
              {overall.stackIntegrity === "healthy" ? "Healthy" : "Warnings"}
            </span>
          </Card>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-gray-400" />
              Stack Layers
            </h2>
            <span className="text-[10px] text-gray-500">Higher layers depend on lower layers: L6 → L5 → L4 → L3 → L2 → L1</span>
          </div>

          <div className="relative">
            <div className="absolute left-7 top-0 bottom-0 w-px bg-gradient-to-b from-blue-500/30 via-purple-500/30 via-emerald-500/30 via-amber-500/30 via-red-500/30 to-cyan-500/30 z-0" />
            <div className="space-y-3 relative z-10">
              {mergedLayers.map((layer: any) => (
                <LayerCard
                  key={layer.key}
                  layer={layer}
                  expanded={expandedLayer === layer.key}
                  onToggle={() => setExpandedLayer(expandedLayer === layer.key ? null : layer.key)}
                />
              ))}
            </div>
          </div>
        </div>

        <Card className="bg-[#12121a] border-gray-800 p-5 border-l-2 border-l-purple-500/50" data-testid="card-architecture-info">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-purple-400 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-white mb-1">Architecture Principles</h4>
              <ul className="text-xs text-gray-400 space-y-1">
                <li>Each service maps to exactly one layer — no cross-layer ownership</li>
                <li>Dependencies flow upward only: higher layers may call lower layers, never the reverse</li>
                <li>Higher-layer logic cannot bypass Governance (L5) or Economy (L4) layers</li>
                <li>All inter-layer calls are validated and violations are logged for remediation</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
