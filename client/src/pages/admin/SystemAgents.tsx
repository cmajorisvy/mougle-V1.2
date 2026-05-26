import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, adminAgentActionTypes, type AdminAgentActionType, type AdminAgentMemoryScope, type AdminSystemAgent, type AdminSystemAgentSeedResult, type UnifiedEvolutionScore } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, ArrowLeft, Bot, BrainCircuit, CheckCircle, Database, HeartPulse, Loader2, PlayCircle, Power, RefreshCw, ShieldCheck, Sparkles, XCircle } from "lucide-react";

function formatScore(value: unknown) {
  if (typeof value !== "number") return "n/a";
  return value > 1 ? value.toFixed(0) : value.toFixed(2);
}

function enabledFor(agent: AdminSystemAgent) {
  return agent.blueprint.enabled !== false;
}

function labelFor(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function valueFor(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return formatScore(value);
  if (typeof value === "string") return value;
  return "n/a";
}

function decisionBadgeClass(status: string) {
  if (status === "approved") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (status === "request_admin_review") return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
  return "bg-red-500/10 text-red-300 border-red-500/20";
}

function sourceQualityBadgeClass(quality: string) {
  if (quality === "calculated") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (quality === "partial") return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
  return "bg-zinc-500/10 text-zinc-300 border-zinc-500/20";
}

function collapseRiskBadgeClass(level: string) {
  if (level === "critical" || level === "high") return "bg-red-500/10 text-red-300 border-red-500/20";
  if (level === "medium") return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
  return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
}

function MetadataPanel({ title, entries }: { title: string; entries: [string, unknown][] }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">{title}</p>
      <div className="grid grid-cols-2 gap-2">
        {entries.map(([key, value]) => (
          <div key={key} className="min-w-0">
            <p className="text-[10px] text-zinc-500">{labelFor(key)}</p>
            <p className="text-xs text-zinc-200 font-medium truncate">{valueFor(value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BehaviorSimulationPanel({ agent }: { agent: AdminSystemAgent }) {
  const userId = agent.user?.id;
  const [actionType, setActionType] = useState<AdminAgentActionType>("research_topic");
  const [memoryScope, setMemoryScope] = useState<AdminAgentMemoryScope>("behavioral");
  const [topic, setTopic] = useState(agent.blueprint.role);
  const [includeGraphContext, setIncludeGraphContext] = useState(true);
  const [includeKnowledgePackets, setIncludeKnowledgePackets] = useState(true);
  const [allowHypotheses, setAllowHypotheses] = useState(true);
  const [explicitBusinessPermission, setExplicitBusinessPermission] = useState(false);

  const simulateMutation = useMutation({
    mutationFn: () => api.admin.simulateAgentBehavior({
      agentId: userId!,
      actionType,
      memoryScope,
      includeGraphContext,
      graphQuery: topic.trim() || agent.blueprint.role,
      graphAllowHypotheses: allowHypotheses,
      graphExplicitBusinessPermission: explicitBusinessPermission,
      includeKnowledgePacketContext: includeKnowledgePackets,
      knowledgePacketQuery: topic.trim() || agent.blueprint.role,
      knowledgePacketAllowHypotheses: allowHypotheses,
      knowledgePacketExplicitBusinessPermission: explicitBusinessPermission,
      knowledgePacketLimit: 6,
      event: {
        type: "admin_inspector_simulation",
        topic: topic.trim() || agent.blueprint.role,
      },
    }),
  });

  const result = simulateMutation.data;

  return (
    <div className="mt-5 rounded-lg bg-violet-500/[0.04] border border-violet-500/10 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-violet-300" />
            <p className="text-sm font-semibold text-white">Behavior Engine MVP</p>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Simulates one controlled decision, scores policy, and logs the outcome without autonomous publishing.
          </p>
        </div>
        <Button
          size="sm"
          disabled={!userId || simulateMutation.isPending}
          onClick={() => simulateMutation.mutate()}
          className="bg-violet-600 hover:bg-violet-700"
          data-testid={`button-simulate-agent-behavior-${agent.key}`}
        >
          {simulateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
          Simulate
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-3 mt-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Action</p>
          <Select value={actionType} onValueChange={(value) => setActionType(value as AdminAgentActionType)}>
            <SelectTrigger className="bg-[#080811] border-white/10 text-xs" data-testid={`select-agent-action-${agent.key}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#10101a] border-white/10">
              {adminAgentActionTypes.map((type) => (
                <SelectItem key={type} value={type}>{labelFor(type)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Memory Scope</p>
          <Select value={memoryScope} onValueChange={(value) => setMemoryScope(value as AdminAgentMemoryScope)}>
            <SelectTrigger className="bg-[#080811] border-white/10 text-xs" data-testid={`select-agent-memory-${agent.key}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#10101a] border-white/10">
              {["behavioral", "public", "none", "private"].map((scope) => (
                <SelectItem key={scope} value={scope}>{labelFor(scope)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Topic</p>
          <Input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            className="bg-[#080811] border-white/10 text-xs"
            data-testid={`input-agent-topic-${agent.key}`}
          />
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3 mt-4">
        {[
          ["Graph context", includeGraphContext, setIncludeGraphContext],
          ["Knowledge packets", includeKnowledgePackets, setIncludeKnowledgePackets],
          ["Hypotheses", allowHypotheses, setAllowHypotheses],
          ["Business permission", explicitBusinessPermission, setExplicitBusinessPermission],
        ].map(([label, checked, setter]) => (
          <div key={label as string} className="rounded-md bg-white/[0.03] border border-white/[0.05] p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-zinc-200">{label as string}</p>
              <p className="text-[10px] text-zinc-500">
                {label === "Business permission" ? "Off unless consent exists" : "Read-only simulation input"}
              </p>
            </div>
            <Switch
              checked={checked as boolean}
              onCheckedChange={(value) => (setter as (next: boolean) => void)(value)}
              data-testid={`switch-${String(label).toLowerCase().replace(/\s+/g, "-")}-${agent.key}`}
            />
          </div>
        ))}
      </div>

      {simulateMutation.error && (
        <div className="mt-4 rounded-md bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-200">
          {(simulateMutation.error as Error).message}
        </div>
      )}

      {result && (
        <div className="mt-4 grid lg:grid-cols-[1fr_1.2fr] gap-3 text-xs">
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={decisionBadgeClass(result.decision.status)}>{labelFor(result.decision.status)}</Badge>
              <span className="text-zinc-400">Score {formatScore(result.scoring.score)}</span>
              <span className="text-zinc-500">Log {result.outcomeLog.id ? "created" : "not created"}</span>
            </div>
            <p className="text-zinc-300 mt-3">{result.decision.reason}</p>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="rounded-md bg-white/[0.04] p-2">
                <p className="text-zinc-500">Execution</p>
                <p className="text-zinc-200 font-medium">{labelFor(result.decision.executionMode)}</p>
              </div>
              <div className="rounded-md bg-white/[0.04] p-2">
                <p className="text-zinc-500">Memory</p>
                <p className="text-zinc-200 font-medium">{result.context.memoriesRetrieved} retrieved / {result.context.memoryDeniedCount} denied</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-zinc-400">
              {result.blockedUnsafeActionCheck.passed ? (
                <CheckCircle className="w-4 h-4 text-emerald-300" />
              ) : (
                <XCircle className="w-4 h-4 text-red-300" />
              )}
              <span>Unsafe `post_message` check: {result.blockedUnsafeActionCheck.actual}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-zinc-400">
              {result.privateMemoryBlockCheck.passed ? (
                <CheckCircle className="w-4 h-4 text-emerald-300" />
              ) : (
                <XCircle className="w-4 h-4 text-red-300" />
              )}
              <span>Private memory check: {result.privateMemoryBlockCheck.actual}</span>
            </div>
          </div>

          <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">Policy Checks</p>
            <div className="space-y-2">
              {result.policyChecks.map((check) => (
                <div key={check.key} className="flex gap-2">
                  {check.passed ? (
                    <CheckCircle className="w-4 h-4 text-emerald-300 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-300 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="text-zinc-200 font-medium">{check.label}</p>
                    <p className="text-zinc-500">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-3 grid xl:grid-cols-3 gap-3 text-xs">
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-4 h-4 text-cyan-300" />
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Graph Context</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-white/[0.04] p-2">
                <p className="text-zinc-500">Nodes</p>
                <p className="text-zinc-200 font-medium">{result.graphContext.nodesRetrieved}</p>
              </div>
              <div className="rounded-md bg-white/[0.04] p-2">
                <p className="text-zinc-500">Edges</p>
                <p className="text-zinc-200 font-medium">{result.graphContext.edgesRetrieved}</p>
              </div>
            </div>
            <p className="text-zinc-500 mt-3">
              {result.graphContext.enabled ? "Internal policy-aware graph access; public projection filter is not used." : "Not requested."}
            </p>
            <p className="text-zinc-400 mt-2">
              Blocked {result.graphContext.blockedCounts.total}
            </p>
          </div>

          <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-violet-300" />
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Knowledge Packets</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-white/[0.04] p-2">
                <p className="text-zinc-500">Used</p>
                <p className="text-zinc-200 font-medium">{result.knowledgePacketContext.knowledgePacketsUsed}</p>
              </div>
              <div className="rounded-md bg-white/[0.04] p-2">
                <p className="text-zinc-500">Blocked</p>
                <p className="text-zinc-200 font-medium">{result.knowledgePacketContext.blockedPacketCounts.total}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {result.knowledgePacketContext.packets.slice(0, 2).map((packet) => (
                <div key={packet.id} className="rounded-md bg-white/[0.04] p-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={packet.knowledgeStatus === "fact" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-yellow-500/10 text-yellow-300 border-yellow-500/20"}>
                      {labelFor(packet.knowledgeStatus)}
                    </Badge>
                    <span className="text-zinc-400">Rank {formatScore(packet.rankingScore)}</span>
                    <span className="text-zinc-500">Gluon {formatScore(packet.gluonSignal.normalized)}</span>
                  </div>
                  <p className="text-zinc-200 mt-2 truncate">{packet.title}</p>
                  <p className="text-zinc-500 mt-1 line-clamp-2">{packet.safeSummary}</p>
                </div>
              ))}
              {result.knowledgePacketContext.packets.length === 0 && (
                <p className="text-zinc-500">
                  {result.knowledgePacketContext.enabled ? "No eligible packet context found." : "Not requested."}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-emerald-300" />
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">DNA Context</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-white/[0.04] p-2">
                <p className="text-zinc-500">Prime Color</p>
                <p className="text-zinc-200 font-medium truncate">{valueFor(result.dnaContext.primeColorSignature.hex || result.dnaContext.primeColorSignature.hsl)}</p>
              </div>
              <div className="rounded-md bg-white/[0.04] p-2">
                <p className="text-zinc-500">Mutations</p>
                <p className="text-zinc-200 font-medium">{result.dnaContext.mutationHistorySummary.totalRecent} recent</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {Object.entries(result.dnaContext.behaviorStyle).slice(0, 4).map(([key, value]) => (
                <div key={key} className="rounded-md bg-white/[0.04] p-2">
                  <p className="text-zinc-500">{labelFor(key)}</p>
                  <p className="text-zinc-200 font-medium">{valueFor(value)}</p>
                </div>
              ))}
            </div>
            <p className="text-zinc-500 mt-3">Preview only: no DNA mutation, graph mutation, packet mutation, or Gluon award.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function EvolutionScorePanel({ ues, isLoading }: { ues?: UnifiedEvolutionScore; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="mt-5 rounded-lg bg-cyan-500/[0.04] border border-cyan-500/10 p-4 text-sm text-zinc-400">
        <Loader2 className="w-4 h-4 mr-2 inline animate-spin" />
        Calculating truth-evolution score...
      </div>
    );
  }

  if (!ues) {
    return (
      <div className="mt-5 rounded-lg bg-cyan-500/[0.04] border border-cyan-500/10 p-4 text-sm text-zinc-500">
        Unified Evolution Score will appear after this agent is seeded and included in the read-only UES scan.
      </div>
    );
  }

  const scoreRows = [
    ["P", ues.scores.P],
    ["D", ues.scores.D],
    ["Omega", ues.scores.Omega],
    ["Xi", ues.scores.Xi],
    ["UES", ues.scores.UES],
  ] as const;

  return (
    <div className="mt-5 rounded-lg bg-cyan-500/[0.04] border border-cyan-500/10 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <HeartPulse className="w-4 h-4 text-cyan-300" />
            <p className="text-sm font-semibold text-white">Unified Evolution Score</p>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Read-only truth-evolution metrics using trust, policy, activity, evidence, debate, and cost signals.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge className={collapseRiskBadgeClass(ues.collapseRisk.level)}>
            {labelFor(ues.collapseRisk.level)} risk
          </Badge>
          <Badge className={sourceQualityBadgeClass(ues.sourceQuality.overall)}>
            {labelFor(ues.sourceQuality.overall)} sources
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
        {scoreRows.map(([key, value]) => (
          <div key={key} className={`rounded-md px-3 py-2 ${key === "UES" ? "bg-cyan-500/10" : "bg-white/[0.04]"}`}>
            <p className="text-[10px] text-zinc-500">{key}</p>
            <p className="text-sm text-white font-semibold">{formatScore(value)}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-3 mt-4 text-xs">
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
          <p className="text-zinc-500">Source Quality</p>
          <p className="text-zinc-200 mt-1">
            {ues.sourceQuality.calculated} calculated / {ues.sourceQuality.partial} partial / {ues.sourceQuality.fallback} fallback
          </p>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
          <p className="text-zinc-500">Truth First</p>
          <p className="text-zinc-200 mt-1">
            Truth {formatScore(ues.truthFirst.truthSeeking)} / Reward {formatScore(ues.truthFirst.rewardSeeking)}
          </p>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
          <p className="text-zinc-500">Correction</p>
          <p className="text-zinc-200 mt-1">
            Capacity {formatScore(ues.scores.correctionCapacity)} / Cost {formatScore(ues.scores.costEfficiency)}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2 text-xs text-zinc-400">
        {ues.explanations.slice(0, 3).map((explanation) => (
          <div key={explanation} className="flex gap-2">
            <CheckCircle className="w-4 h-4 text-cyan-300 flex-shrink-0 mt-0.5" />
            <span>{explanation}</span>
          </div>
        ))}
        {ues.collapseRisk.reasons.slice(0, 2).map((reason) => (
          <div key={reason} className="flex gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-300 flex-shrink-0 mt-0.5" />
            <span>{reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SystemAgentCard({ agent, ues, evolutionLoading }: { agent: AdminSystemAgent; ues?: UnifiedEvolutionScore; evolutionLoading: boolean }) {
  const enabled = enabledFor(agent);
  const userId = agent.user?.id;

  const toggleMutation = useMutation({
    mutationFn: () => api.admin.updateSystemAgent(userId!, { enabled: !enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-system-agents"] }),
  });

  const profile = agent.identity?.strategyProfile || {};
  const permissions = Object.entries(agent.blueprint.permissions || {}).filter(([, value]) => value === true);
  const scores = Object.entries(agent.blueprint.scores || {});
  const blueprintMetadata = [
    ["key", profile.key || agent.key],
    ["stage", profile.blueprintStage || "Stage 2"],
    ["prompt", profile.blueprintPrompt || "Prompt 2"],
    ["canonicalUsername", profile.canonicalUsername || agent.expectedUsername],
    ["aliases", agent.aliases.length > 0 ? agent.aliases.join(", ") : "None"],
    ["systemAgent", profile.systemAgent === true],
  ] as [string, unknown][];

  return (
    <Card className="bg-[#10101a]/90 border-white/[0.08] p-5" data-testid={`card-system-agent-${agent.key}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-violet-500/15 flex items-center justify-center overflow-hidden flex-shrink-0">
            {agent.user?.avatar ? (
              <img src={agent.user.avatar} alt="" className="w-12 h-12" />
            ) : (
              <Bot className="w-6 h-6 text-violet-300" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-white">{agent.user?.displayName || agent.expectedUsername}</h2>
              <Badge className={agent.blueprint.type === "chief" ? "bg-yellow-500/15 text-yellow-300 border-yellow-500/20" : "bg-violet-500/15 text-violet-300 border-violet-500/20"}>
                {agent.blueprint.type.replace("_", " ")}
              </Badge>
              <Badge className={enabled ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-red-500/10 text-red-300 border-red-500/20"}>
                {enabled ? "Enabled" : "Disabled"}
              </Badge>
              {!agent.seeded && (
                <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">Not seeded</Badge>
              )}
            </div>
            <p className="text-sm text-zinc-400 mt-1">{agent.blueprint.role}</p>
            <p className="text-xs text-zinc-500 mt-1">@{agent.user?.username || agent.expectedUsername}</p>
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          disabled={!userId || toggleMutation.isPending}
          onClick={() => toggleMutation.mutate()}
          className={enabled ? "border-red-500/30 text-red-300 hover:bg-red-500/10" : "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"}
          data-testid={`button-toggle-system-agent-${agent.key}`}
        >
          {toggleMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Power className="w-4 h-4 mr-2" />}
          {enabled ? "Disable" : "Enable"}
        </Button>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-5">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Goals</p>
          <div className="flex flex-wrap gap-1.5">
            {agent.blueprint.goals.map((goal) => (
              <span key={goal} className="px-2 py-1 rounded-md bg-white/[0.04] text-xs text-zinc-300">{goal}</span>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Permissions</p>
          <div className="flex flex-wrap gap-1.5">
            {permissions.map(([permission]) => (
              <span key={permission} className="px-2 py-1 rounded-md bg-emerald-500/10 text-xs text-emerald-300">{permission}</span>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Baseline Scores</p>
          <div className="grid grid-cols-3 gap-2">
            {scores.map(([key, value]) => (
              <div key={key} className="rounded-md bg-white/[0.04] px-2 py-1">
                <p className="text-[10px] text-zinc-500">{key}</p>
                <p className="text-xs text-white font-semibold">{formatScore(value)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3 mt-5 text-xs">
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
          <p className="text-zinc-500">Trust</p>
          <p className="text-white font-semibold mt-1">{formatScore(agent.trustProfile?.compositeTrustScore)}</p>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
          <p className="text-zinc-500">Verification</p>
          <p className="text-white font-semibold mt-1">{formatScore(agent.user?.verificationWeight)}</p>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
          <p className="text-zinc-500">Rule Loyalty</p>
          <p className="text-white font-semibold mt-1">{formatScore(agent.blueprint.dna.ruleLoyalty)}</p>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] p-3">
          <p className="text-zinc-500">Blueprint</p>
          <p className="text-white font-semibold mt-1">{profile.blueprintStage || "Stage 2"}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-3 mt-5 text-xs">
        <MetadataPanel title="Blueprint Metadata" entries={blueprintMetadata} />
        <MetadataPanel title="Personality Profile" entries={Object.entries(agent.blueprint.personality || {})} />
        <MetadataPanel title="DNA Profile" entries={Object.entries(agent.blueprint.dna || {})} />
      </div>

      <EvolutionScorePanel ues={ues} isLoading={!!userId && evolutionLoading} />

      {userId && <BehaviorSimulationPanel agent={agent} />}
    </Card>
  );
}

export default function SystemAgents() {
  const [, navigate] = useLocation();
  const { admin, isLoading: authLoading, isAuthenticated } = useAdminAuth();
  const isRootAdmin = admin?.actor?.type === "root_admin" && admin.role === "super_admin";

  useEffect(() => {
    if (!authLoading && isAuthenticated && !isRootAdmin) {
      navigate("/staff/dashboard", { replace: true });
    }
  }, [authLoading, isAuthenticated, isRootAdmin, navigate]);

  const { data: agents = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-system-agents"],
    queryFn: () => api.admin.systemAgents(),
    enabled: isRootAdmin,
  });
  const { data: globalEvolution, isLoading: evolutionLoading } = useQuery({
    queryKey: ["evolution-global-score"],
    queryFn: () => api.evolution.globalScore(),
    enabled: isRootAdmin,
  });
  const { data: civilizationHealth } = useQuery({
    queryKey: ["evolution-civilization-health"],
    queryFn: () => api.evolution.civilizationHealth(),
    enabled: isRootAdmin,
  });

  const seedMutation = useMutation({
    mutationFn: () => api.admin.seedSystemAgents(),
    onSuccess: (result: AdminSystemAgentSeedResult) => {
      queryClient.setQueryData(["admin-system-agents"], result.agents);
      queryClient.invalidateQueries({ queryKey: ["admin-system-agents"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#060611] flex items-center justify-center text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...
      </div>
    );
  }

  if (!isAuthenticated || !isRootAdmin) return null;

  const seededCount = agents.filter((agent) => agent.seeded).length;
  const enabledCount = agents.filter((agent) => agent.seeded && enabledFor(agent)).length;
  const uesByAgentId = new Map((globalEvolution?.agents || []).map((score) => [score.agent.id, score]));

  return (
    <div className="min-h-screen bg-[#070711] text-white">
      <div className="border-b border-white/[0.08] bg-[#0d0d18] px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <button onClick={() => navigate("/admin/dashboard")} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4" data-testid="link-back-admin">
            <ArrowLeft className="w-4 h-4" /> Admin Dashboard
          </button>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Sparkles className="w-8 h-8 text-violet-300" />
                <h1 className="text-2xl font-bold">System Agents</h1>
                <Badge className="bg-yellow-500/15 text-yellow-300 border-yellow-500/20">Founder Only</Badge>
              </div>
              <p className="text-sm text-zinc-500 mt-2 max-w-3xl">
                Initial MOUGLE Chief Intelligence and specialist platform identities, seeded into existing agent tables for inspection and controlled activation.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetch()} disabled={isLoading} className="border-white/10 text-zinc-300" data-testid="button-refresh-system-agents">
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh
              </Button>
              <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} className="bg-violet-600 hover:bg-violet-700" data-testid="button-seed-system-agents">
                {seedMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}
                Seed / Sync Agents
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="grid md:grid-cols-5 gap-4">
          <Card className="bg-[#10101a]/90 border-white/[0.08] p-4">
            <div className="flex items-center gap-3">
              <Bot className="w-5 h-5 text-violet-300" />
              <div>
                <p className="text-xs text-zinc-500">Seeded Agents</p>
                <p className="text-xl font-semibold">{seededCount}/11</p>
              </div>
            </div>
          </Card>
          <Card className="bg-[#10101a]/90 border-white/[0.08] p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-300" />
              <div>
                <p className="text-xs text-zinc-500">Enabled</p>
                <p className="text-xl font-semibold">{enabledCount}</p>
              </div>
            </div>
          </Card>
          <Card className="bg-[#10101a]/90 border-white/[0.08] p-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-yellow-300" />
              <div>
                <p className="text-xs text-zinc-500">Storage</p>
                <p className="text-xl font-semibold">Existing Tables</p>
              </div>
            </div>
          </Card>
          <Card className="bg-[#10101a]/90 border-white/[0.08] p-4">
            <div className="flex items-center gap-3">
              <HeartPulse className="w-5 h-5 text-cyan-300" />
              <div>
                <p className="text-xs text-zinc-500">Average UES</p>
                <p className="text-xl font-semibold">{formatScore(globalEvolution?.averageUES)}</p>
              </div>
            </div>
          </Card>
          <Card className="bg-[#10101a]/90 border-white/[0.08] p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-300" />
              <div>
                <p className="text-xs text-zinc-500">Civilization Health</p>
                <p className="text-xl font-semibold">{formatScore(civilizationHealth?.score)}</p>
              </div>
            </div>
          </Card>
        </div>

        {seedMutation.data?.reusedAliases && seedMutation.data.reusedAliases.length > 0 && (
          <Card className="bg-emerald-500/10 border-emerald-500/20 p-4 text-sm text-emerald-200">
            Reused existing records: {seedMutation.data.reusedAliases.map((item) => `${item.alias} -> ${item.agent}`).join(", ")}
          </Card>
        )}

        {isLoading ? (
          <div className="py-20 flex justify-center text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading system agents...
          </div>
        ) : (
          <div className="space-y-4">
            {agents.map((agent) => (
              <SystemAgentCard
                key={agent.key}
                agent={agent}
                ues={agent.user?.id ? uesByAgentId.get(agent.user.id) : undefined}
                evolutionLoading={evolutionLoading}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
