import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type AdminAgentGraphAccessPurpose, type AdminAgentGraphRequesterType, type AdminKnowledgeGraphSummary } from "@/lib/api";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  Database,
  GitBranch,
  Loader2,
  Lock,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";

function labelFor(value: string) {
  return value.replace(/[_-]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatCount(value: number | undefined) {
  return Math.round(value || 0).toLocaleString();
}

function formatScore(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  return value > 1 ? value.toFixed(0) : value.toFixed(2);
}

function percent(value: number | undefined) {
  return `${Math.round(Math.max(0, Math.min(1, value || 0)) * 100)}%`;
}

function confidence(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function statusClass(status: string) {
  if (["verified", "approved", "supported", "active", "consensus", "exported"].includes(status)) {
    return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  }
  if (["unverified", "pending", "pending_review", "admin_review", "unscored"].includes(status)) {
    return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
  }
  if (["contested", "blocked", "rejected", "revoked", "failed"].includes(status)) {
    return "bg-red-500/10 text-red-300 border-red-500/20";
  }
  return "bg-zinc-500/10 text-zinc-300 border-zinc-500/20";
}

function DistributionCard({
  title,
  items,
}: {
  title: string;
  items: Record<string, number>;
}) {
  const entries = Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return (
    <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <div className="space-y-3 mt-4">
        {entries.length === 0 && <p className="text-sm text-zinc-500">No graph records yet.</p>}
        {entries.map(([key, value]) => (
          <div key={`${title}-${key}`} className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-400 truncate">{labelFor(key)}</span>
            <Badge className="bg-white/[0.05] text-zinc-300 border-white/[0.08]">{formatCount(value)}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DistributionPanel({ title, items }: { title: string; items: Record<string, number> }) {
  const entries = Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/20 p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <div className="space-y-3 mt-4">
        {entries.length === 0 && <p className="text-sm text-zinc-500">No blocked records in this bucket.</p>}
        {entries.map(([key, value]) => (
          <div key={`${title}-${key}`} className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-400 truncate">{labelFor(key)}</span>
            <Badge className="bg-white/[0.05] text-zinc-300 border-white/[0.08]">{formatCount(value)}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function QualityScoreCard({ label, value, note }: { label: string; value: number; note: string }) {
  const colorClass = value >= 0.75
    ? "text-emerald-300"
    : value >= 0.5
      ? "text-yellow-300"
      : "text-red-300";
  return (
    <div className="rounded-lg border border-white/[0.08] bg-black/20 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${colorClass}`}>{percent(value)}</p>
      <p className="text-xs text-zinc-500 mt-2 leading-5">{note}</p>
    </div>
  );
}

function CheckPanel({
  title,
  passed,
  detail,
}: {
  title: string;
  passed: boolean;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
      <div className="flex items-center gap-2">
        {passed ? <CheckCircle2 className="w-4 h-4 text-emerald-300" /> : <AlertTriangle className="w-4 h-4 text-red-300" />}
        <p className="text-sm font-medium text-white">{title}</p>
      </div>
      <p className="text-xs text-zinc-500 mt-2 leading-5">{detail}</p>
    </div>
  );
}

function Safeguards({ summary }: { summary: AdminKnowledgeGraphSummary }) {
  const items = [
    ["Root Admin Only", summary.safeguards.rootAdminOnly],
    ["Internal Inspection", summary.safeguards.internalAdminInspectionOnly],
    ["No Raw Private Memory", summary.safeguards.noRawPrivateMemoryContent],
    ["Public-Safe Projection Only", summary.safeguards.publicSafeProjectionOnly],
    ["Manual Sync Only", summary.safeguards.noAutonomousGraphExpansion],
  ];

  return (
    <Card className="bg-emerald-500/[0.06] border-emerald-500/20 p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-emerald-300" />
        <h2 className="text-lg font-semibold text-white">Safety Controls</h2>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3 mt-4">
        {items.map(([label, enabled]) => (
          <div key={label as string} className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="text-sm font-semibold text-emerald-300 mt-1">{enabled ? "Enabled" : "Unavailable"}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

const agentGraphRequesterTypes: AdminAgentGraphRequesterType[] = ["system_agent", "user_agent", "root_admin"];
const agentGraphPurposes: AdminAgentGraphAccessPurpose[] = [
  "reasoning",
  "debate_preparation",
  "evidence_validation",
  "synthesis",
  "learning_signal",
  "marketplace_review",
  "media_script_review",
];

function AgentGraphAccessPanel() {
  const [requesterType, setRequesterType] = useState<AdminAgentGraphRequesterType>("system_agent");
  const [requesterAgentId, setRequesterAgentId] = useState("");
  const [purpose, setPurpose] = useState<AdminAgentGraphAccessPurpose>("reasoning");
  const [query, setQuery] = useState("truth evidence");
  const [limit, setLimit] = useState("8");
  const [minimumConfidence, setMinimumConfidence] = useState("");
  const [allowHypotheses, setAllowHypotheses] = useState(false);
  const [explicitBusinessPermission, setExplicitBusinessPermission] = useState(false);

  const evaluateMutation = useMutation({
    mutationFn: () => api.admin.evaluateAgentGraphAccess({
      requesterType,
      requesterAgentId: requesterType === "root_admin" ? undefined : requesterAgentId.trim(),
      purpose,
      query: query.trim(),
      limit: Number(limit) || 8,
      minimumConfidence: minimumConfidence.trim() ? Number(minimumConfidence) : undefined,
      allowHypotheses,
      explicitBusinessPermission,
    }),
  });

  const result = evaluateMutation.data;
  const checks = result ? Object.entries(result.deterministicChecks) : [];

  return (
    <Card className="bg-violet-500/[0.05] border-violet-500/20 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-violet-300" />
            <h2 className="text-lg font-semibold text-white">Internal Agent Graph Access Test</h2>
          </div>
          <p className="text-sm text-zinc-500 mt-2 max-w-3xl leading-6">
            Root-admin evaluation for the internal policy-aware graph layer. This is separate from the public-safe projection and returns only safe summaries for approved agent reasoning context.
          </p>
        </div>
        <Button
          onClick={() => evaluateMutation.mutate()}
          disabled={evaluateMutation.isPending || (requesterType !== "root_admin" && !requesterAgentId.trim())}
          className="bg-violet-600 hover:bg-violet-700"
        >
          {evaluateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
          Evaluate
        </Button>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mt-5">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Requester</p>
          <Select value={requesterType} onValueChange={(value) => setRequesterType(value as AdminAgentGraphRequesterType)}>
            <SelectTrigger className="bg-[#080811] border-white/10 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#10101a] border-white/10">
              {agentGraphRequesterTypes.map((type) => <SelectItem key={type} value={type}>{labelFor(type)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Requester Agent ID</p>
          <Input
            value={requesterAgentId}
            onChange={(event) => setRequesterAgentId(event.target.value)}
            disabled={requesterType === "root_admin"}
            placeholder={requesterType === "root_admin" ? "Not required" : "Agent ID"}
            className="bg-[#080811] border-white/10 text-xs"
          />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Purpose</p>
          <Select value={purpose} onValueChange={(value) => setPurpose(value as AdminAgentGraphAccessPurpose)}>
            <SelectTrigger className="bg-[#080811] border-white/10 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#10101a] border-white/10">
              {agentGraphPurposes.map((item) => <SelectItem key={item} value={item}>{labelFor(item)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Limit</p>
          <Input value={limit} onChange={(event) => setLimit(event.target.value)} className="bg-[#080811] border-white/10 text-xs" />
        </div>
        <div className="md:col-span-2">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Query</p>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} className="bg-[#080811] border-white/10 text-xs" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">Min Confidence</p>
          <Input value={minimumConfidence} onChange={(event) => setMinimumConfidence(event.target.value)} placeholder="Policy default" className="bg-[#080811] border-white/10 text-xs" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setAllowHypotheses((value) => !value)}
            className={`border-white/10 text-xs ${allowHypotheses ? "bg-yellow-500/10 text-yellow-200" : "text-zinc-400"}`}
          >
            Hypotheses {allowHypotheses ? "On" : "Off"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setExplicitBusinessPermission((value) => !value)}
            className={`border-white/10 text-xs ${explicitBusinessPermission ? "bg-cyan-500/10 text-cyan-200" : "text-zinc-400"}`}
          >
            Business {explicitBusinessPermission ? "On" : "Off"}
          </Button>
        </div>
      </div>

      {evaluateMutation.error && (
        <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
          {(evaluateMutation.error as Error).message}
        </div>
      )}

      {result && (
        <div className="mt-5 space-y-4">
          <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3">
            {[
              ["Nodes", result.context.nodes.length],
              ["Edges", result.context.edges.length],
              ["Blocked", result.blockedCounts.total],
              ["Min Confidence", `${Math.round(result.policy.minimumConfidence * 100)}%`],
              ["UES", result.requester.ues.available ? formatScore(result.requester.ues.score || 0) : "n/a"],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
                <p className="text-xs text-zinc-500">{label}</p>
                <p className="text-lg font-semibold text-white mt-1">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid xl:grid-cols-[1fr_.9fr] gap-4">
            <div className="rounded-lg border border-white/[0.08] bg-black/20 p-4">
              <h3 className="text-sm font-semibold text-white">Returned Context</h3>
              <div className="space-y-3 mt-3">
                {result.context.nodes.length === 0 && <p className="text-sm text-zinc-500">No policy-approved nodes returned for this request.</p>}
                {result.context.nodes.slice(0, 5).map((node) => (
                  <div key={node.id} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={statusClass(node.verificationStatus)}>{labelFor(node.verificationStatus)}</Badge>
                      <Badge className="bg-white/[0.05] text-zinc-300 border-white/[0.08]">{labelFor(node.knowledgeStatus)}</Badge>
                      <Badge className="bg-violet-500/10 text-violet-200 border-violet-500/20">{node.vaultType}/{node.sensitivity}</Badge>
                    </div>
                    <p className="text-sm font-medium text-white mt-2">{node.label}</p>
                    {node.safeSummary && <p className="text-xs text-zinc-400 mt-2 leading-5">{node.safeSummary}</p>}
                    <p className="text-xs text-zinc-500 mt-2">{node.provenanceSummary}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-white/[0.08] bg-black/20 p-4">
              <h3 className="text-sm font-semibold text-white">Policy Checks</h3>
              <div className="space-y-2 mt-3">
                {checks.map(([key, check]) => (
                  <div key={key} className="flex gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                    {check.passed ? <CheckCircle2 className="w-4 h-4 text-emerald-300 flex-shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-red-300 flex-shrink-0 mt-0.5" />}
                    <div>
                      <p className="text-sm font-medium text-white">{labelFor(key)}</p>
                      <p className="text-xs text-zinc-500 mt-1">{check.explanation}</p>
                      <p className="text-xs text-zinc-400 mt-1">Expected {check.expected}; actual {check.actual}.</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <DistributionPanel title="Blocked By Reason" items={result.blockedCounts.byReason} />
            <div className="rounded-lg border border-white/[0.08] bg-black/20 p-4">
              <h3 className="text-sm font-semibold text-white">Policy Summary</h3>
              <p className="text-xs text-zinc-500 mt-3 leading-5">
                Vaults: {result.policy.allowedVaults.join(", ")}. Sensitivity: {result.policy.allowedSensitivity.join(", ")}.
                Public projection used: {result.policy.publicProjectionUsed ? "yes" : "no"}. Mutations allowed: {result.policy.mutationAllowed ? "yes" : "no"}.
              </p>
              <ul className="text-xs text-zinc-400 mt-3 space-y-1">
                {result.explanations.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function KnowledgeGraph() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { admin, isLoading: authLoading, isAuthenticated } = useAdminAuth();
  const isRootAdmin = admin?.actor?.type === "root_admin" && admin.role === "super_admin";

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/admin/login", { replace: true });
      return;
    }
    if (!authLoading && isAuthenticated && !isRootAdmin) {
      navigate("/staff/dashboard", { replace: true });
    }
  }, [authLoading, isAuthenticated, isRootAdmin, navigate]);

  const summaryQuery = useQuery({
    queryKey: ["admin-knowledge-graph-summary"],
    queryFn: () => api.admin.knowledgeGraphSummary(),
    enabled: isRootAdmin,
  });

  const nodesQuery = useQuery({
    queryKey: ["admin-knowledge-graph-nodes"],
    queryFn: () => api.admin.knowledgeGraphNodes({ limit: 20 }),
    enabled: isRootAdmin,
  });

  const edgesQuery = useQuery({
    queryKey: ["admin-knowledge-graph-edges"],
    queryFn: () => api.admin.knowledgeGraphEdges({ limit: 20 }),
    enabled: isRootAdmin,
  });

  const syncMutation = useMutation({
    mutationFn: () => api.admin.syncKnowledgeGraph(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-knowledge-graph-summary"] });
      queryClient.invalidateQueries({ queryKey: ["admin-knowledge-graph-nodes"] });
      queryClient.invalidateQueries({ queryKey: ["admin-knowledge-graph-edges"] });
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

  const summary = summaryQuery.data;

  return (
    <div className="min-h-screen bg-[#070711] text-white">
      <div className="border-b border-white/[0.08] bg-[#0d0d18] px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <button onClick={() => navigate("/admin/dashboard")} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4">
            <ArrowLeft className="w-4 h-4" /> Admin Dashboard
          </button>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Database className="w-8 h-8 text-cyan-300" />
                <h1 className="text-2xl font-bold">Knowledge Graph</h1>
                <Badge className="bg-yellow-500/15 text-yellow-300 border-yellow-500/20">Founder Only</Badge>
                <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Internal Admin Only</Badge>
              </div>
              <p className="text-sm text-zinc-500 mt-2 max-w-3xl">
                Claims, evidence, debates, agents, sources, and approved internal pipeline metadata with vault-aware filtering.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/admin/knowledge-economy")} className="border-violet-500/20 bg-violet-500/10 text-violet-200">
                <Sparkles className="w-4 h-4 mr-2" />
                Knowledge Economy
              </Button>
              <Button variant="outline" onClick={() => summaryQuery.refetch()} disabled={summaryQuery.isFetching} className="border-white/10 text-zinc-300">
                {summaryQuery.isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Refresh
              </Button>
              <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} className="bg-cyan-500 hover:bg-cyan-400 text-black">
                {syncMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <GitBranch className="w-4 h-4 mr-2" />}
                Manual Sync
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {(summaryQuery.error || syncMutation.error) && (
          <Card className="bg-red-500/10 border-red-500/20 p-4 text-red-200">
            {(summaryQuery.error as Error)?.message || (syncMutation.error as Error)?.message || "Unable to load knowledge graph."}
          </Card>
        )}

        {syncMutation.data && (
          <Card className="bg-cyan-500/10 border-cyan-500/20 p-5 text-cyan-100">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Sync Result</h2>
                <p className="text-sm text-cyan-100/80 mt-1">
                  Manual sync completed in {formatCount(syncMutation.data.syncDurationMs)} ms with status {syncMutation.data.lastSyncStatus}.
                </p>
              </div>
              <Badge className="bg-cyan-500/15 text-cyan-200 border-cyan-500/20">Manual root-admin sync</Badge>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
              {[
                ["Records scanned", syncMutation.data.recordsScanned],
                ["Nodes upserted", syncMutation.data.nodesUpserted],
                ["Edges upserted", syncMutation.data.edgesUpserted],
                ["Blocked records", syncMutation.data.blockedRecords],
                ["Skipped records", syncMutation.data.skippedRecords],
                ["Warnings", syncMutation.data.warnings.length],
                ["Errors", syncMutation.data.errors.length],
                ["Duplicate keys", syncMutation.data.duplicateNodeKeyCount + syncMutation.data.duplicateEdgeKeyCount],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg border border-cyan-500/10 bg-black/20 p-3">
                  <p className="text-xs text-cyan-100/60">{label}</p>
                  <p className="text-xl font-semibold text-white mt-1">{formatCount(Number(value))}</p>
                </div>
              ))}
            </div>
            {(syncMutation.data.warnings.length > 0 || syncMutation.data.errors.length > 0) && (
              <div className="grid md:grid-cols-2 gap-3 mt-4">
                {syncMutation.data.warnings.length > 0 && (
                  <div className="rounded-lg border border-yellow-500/10 bg-yellow-500/[0.06] p-3">
                    <p className="text-sm font-medium text-yellow-200">Warnings</p>
                    <ul className="text-xs text-yellow-100/80 mt-2 space-y-1">
                      {syncMutation.data.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                    </ul>
                  </div>
                )}
                {syncMutation.data.errors.length > 0 && (
                  <div className="rounded-lg border border-red-500/10 bg-red-500/[0.06] p-3">
                    <p className="text-sm font-medium text-red-200">Errors</p>
                    <ul className="text-xs text-red-100/80 mt-2 space-y-1">
                      {syncMutation.data.errors.map((error) => <li key={error}>{error}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {summaryQuery.isLoading && (
          <div className="flex items-center justify-center py-20 text-zinc-400">
            <Loader2 className="w-8 h-8 animate-spin mr-3" /> Loading knowledge graph...
          </div>
        )}

        {summary && (
          <>
            <Card className="bg-gradient-to-br from-cyan-500/[0.10] to-violet-500/[0.08] border-cyan-500/20 p-6">
              <div className="grid lg:grid-cols-[1fr_auto] gap-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">{summary.qualitySignals.sourceQuality}</Badge>
                    <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">
                      UES context {summary.qualitySignals.uesAvailable ? "available" : "unavailable"}
                    </Badge>
                  </div>
                  <p className="text-sm text-zinc-500 mt-4">Internal Graph Foundation</p>
                  <p className="text-5xl font-bold text-white mt-1">{percent(summary.qualityScores.overallGraphQuality)}</p>
                  <p className="text-sm text-zinc-400 mt-4 max-w-3xl leading-6">
                    Overall graph quality combines completeness, trust, safety, and freshness. Manual sync preserves private/restricted material as blocked aggregate counts only.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 min-w-[280px]">
                  {[
                    ["Nodes", summary.totals.nodes],
                    ["Edges", summary.totals.edges],
                    ["Orphans", summary.totals.orphanNodes],
                    ["Blocked", summary.totals.blockedRestrictedSources],
                    ["High Risk", summary.totals.highRiskUnverifiedClusters],
                    ["Last Sync", summary.qualityMetrics.lastSyncStatus],
                  ].map(([label, value]) => (
                    <div key={label as string} className="rounded-lg bg-black/20 border border-white/[0.06] p-3">
                      <p className="text-[11px] text-zinc-500">{label}</p>
                      <p className="text-xl font-semibold text-white mt-1">{typeof value === "number" ? formatCount(value) : labelFor(String(value))}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Safeguards summary={summary} />

            <AgentGraphAccessPanel />

            <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Graph Quality Metrics</h2>
                  <p className="text-sm text-zinc-500 mt-1">
                    Formula: completeness 30%, trust 30%, safety 30%, freshness 10%.
                  </p>
                </div>
                <Badge className={statusClass(summary.qualityMetrics.lastSyncStatus)}>
                  Last sync: {labelFor(summary.qualityMetrics.lastSyncStatus)}
                </Badge>
              </div>
              <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3 mt-4">
                <QualityScoreCard label="Completeness" value={summary.qualityScores.graphCompleteness} note="Edge density, evidence coverage, provenance coverage, minus orphan penalty." />
                <QualityScoreCard label="Trust" value={summary.qualityScores.graphTrust} note="Verified/approved ratio and confidence, reduced by high-risk clusters." />
                <QualityScoreCard label="Safety" value={summary.qualityScores.graphSafety} note="Private/unknown/duplicate checks and blocked-count visibility." />
                <QualityScoreCard label="Freshness" value={summary.qualityScores.graphFreshness} note="Based on recency of the latest successful manual sync." />
                <QualityScoreCard label="Overall Quality" value={summary.qualityScores.overallGraphQuality} note="Weighted readiness signal for future internal RAG/search work." />
              </div>
              <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
                {[
                  ["Provenance coverage", percent(summary.qualityMetrics.provenanceCoverage)],
                  ["Evidence coverage", percent(summary.qualityMetrics.evidenceCoverage)],
                  ["Duplicate node keys", formatCount(summary.qualityMetrics.duplicateNodeKeyCount)],
                  ["Duplicate edge keys", formatCount(summary.qualityMetrics.duplicateEdgeKeyCount)],
                  ["Sync duration", summary.qualityMetrics.syncDurationMs == null ? "No sync" : `${formatCount(summary.qualityMetrics.syncDurationMs)} ms`],
                  ["Last synced", summary.qualityMetrics.lastSyncedAt ? new Date(summary.qualityMetrics.lastSyncedAt).toLocaleString() : "Not synced"],
                  ["Blocked records", formatCount(summary.qualityMetrics.blockedPrivateRestrictedSourceCount)],
                  ["High-risk clusters", formatCount(summary.qualityMetrics.highRiskUnverifiedClusterCount)],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
                    <p className="text-xs text-zinc-500">{label}</p>
                    <p className="text-sm font-semibold text-white mt-1">{value}</p>
                  </div>
                ))}
              </div>
              <div className="grid md:grid-cols-3 gap-3 mt-4">
                <CheckPanel
                  title="Private/Restricted Block Check"
                  passed={summary.deterministicChecks.privateRestrictedMemoryBlocked.passed}
                  detail={summary.deterministicChecks.privateRestrictedMemoryBlocked.explanation}
                />
                <CheckPanel
                  title="Duplicate-Key Check"
                  passed={summary.deterministicChecks.duplicateKeysChecked.passed}
                  detail={summary.deterministicChecks.duplicateKeysChecked.explanation}
                />
                <CheckPanel
                  title="Unknown Classification Check"
                  passed={summary.deterministicChecks.unknownClassificationBlocked.passed}
                  detail={summary.deterministicChecks.unknownClassificationBlocked.explanation}
                />
              </div>
            </Card>

            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
              <DistributionCard title="Node Counts By Type" items={summary.nodeCountsByType} />
              <DistributionCard title="Edge Counts By Relation" items={summary.edgeCountsByRelation} />
              <DistributionCard title="Confidence Distribution" items={summary.qualityMetrics.confidenceDistribution} />
              <DistributionCard title="Source Table Distribution" items={summary.qualityMetrics.sourceTableDistribution} />
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <DistributionCard title="Verification Distribution" items={summary.verificationDistribution} />
              <DistributionCard title="Vault Distribution" items={summary.vaultDistribution} />
              <DistributionCard title="Sensitivity Distribution" items={summary.sensitivityDistribution} />
            </div>

            <div className="grid xl:grid-cols-[1fr_.9fr] gap-5">
              <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-cyan-300" />
                  <h2 className="text-lg font-semibold">Top Connected Topics / Entities</h2>
                </div>
                <div className="space-y-3 mt-4">
                  {summary.topConnected.length === 0 && <p className="text-sm text-zinc-500">Run a manual sync to populate graph connections.</p>}
                  {summary.topConnected.map((item) => (
                    <div key={item.nodeKey} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{item.label}</p>
                          <p className="text-xs text-zinc-500">{labelFor(item.nodeType)} · {item.nodeKey}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={statusClass(item.verificationStatus)}>{labelFor(item.verificationStatus)}</Badge>
                          <Badge className="bg-white/[0.05] text-zinc-300 border-white/[0.08]">{item.connectionCount} links</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-300" />
                  <h2 className="text-lg font-semibold">Unverified / High-Risk Clusters</h2>
                </div>
                <div className="space-y-3 mt-4">
                  {summary.highRiskClusters.length === 0 && <p className="text-sm text-zinc-500">No unverified or low-confidence clusters in the current graph snapshot.</p>}
                  {summary.highRiskClusters.map((item) => (
                    <div key={item.nodeKey} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{item.label}</p>
                          <p className="text-xs text-zinc-500">{item.reason}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={statusClass(item.verificationStatus)}>{labelFor(item.verificationStatus)}</Badge>
                          <Badge className="bg-white/[0.05] text-zinc-300 border-white/[0.08]">{confidence(item.confidence)}</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="grid xl:grid-cols-[.9fr_1.1fr] gap-5">
              <Card className="bg-red-500/[0.04] border-red-500/20 p-5">
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-red-300" />
                  <h2 className="text-lg font-semibold">Private / Restricted Blocked Counts</h2>
                </div>
                <p className="text-sm text-zinc-500 mt-2">Only aggregate counts and reasons are shown. Source IDs and raw content are intentionally hidden.</p>
                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  <DistributionPanel title="Blocked By Source" items={summary.blockedCounts.bySource} />
                  <DistributionPanel title="Blocked By Reason" items={summary.blockedCounts.byReason} />
                </div>
                {summary.blockedCounts.samples.length > 0 && (
                  <div className="space-y-2 mt-4">
                    {summary.blockedCounts.samples.map((item, index) => (
                      <div key={`${item.sourceTable}-${index}`} className="rounded-lg border border-red-500/10 bg-black/20 p-3">
                        <p className="text-xs text-red-200">{labelFor(item.sourceTable)} · {item.vaultType}/{item.sensitivity}</p>
                        <p className="text-xs text-zinc-500 mt-1">{item.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
                <h2 className="text-lg font-semibold">Provenance / Source Summary</h2>
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-zinc-500 border-b border-white/[0.08]">
                        <th className="py-2 pr-4">Source</th>
                        <th className="py-2 pr-4">Nodes</th>
                        <th className="py-2 pr-4">Edges</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.provenanceSummaries.slice(0, 18).map((item) => (
                        <tr key={item.sourceTable} className="border-b border-white/[0.04]">
                          <td className="py-2 pr-4 text-zinc-300">{labelFor(item.sourceTable)}</td>
                          <td className="py-2 pr-4 text-zinc-400">{formatCount(item.nodes)}</td>
                          <td className="py-2 pr-4 text-zinc-400">{formatCount(item.edges)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        )}

        <div className="grid xl:grid-cols-2 gap-5">
          <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
            <h2 className="text-lg font-semibold">Recent Nodes</h2>
            <div className="space-y-3 mt-4">
              {nodesQuery.isLoading && <p className="text-sm text-zinc-500">Loading nodes...</p>}
              {nodesQuery.data?.map((graphNode) => (
                <div key={graphNode.nodeKey} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white truncate">{graphNode.label}</p>
                    <Badge className={statusClass(graphNode.verificationStatus)}>{labelFor(graphNode.verificationStatus)}</Badge>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">{labelFor(graphNode.nodeType)} · {labelFor(graphNode.sourceTable)} · {graphNode.vaultType}/{graphNode.sensitivity}</p>
                  {graphNode.summary && <p className="text-xs text-zinc-400 mt-2 line-clamp-2">{graphNode.summary}</p>}
                </div>
              ))}
            </div>
          </Card>

          <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
            <h2 className="text-lg font-semibold">Recent Edges</h2>
            <div className="space-y-3 mt-4">
              {edgesQuery.isLoading && <p className="text-sm text-zinc-500">Loading edges...</p>}
              {edgesQuery.data?.map((graphEdge) => (
                <div key={graphEdge.edgeKey} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white truncate">{labelFor(graphEdge.relationType)}</p>
                    <Badge className={statusClass(graphEdge.verificationStatus)}>{labelFor(graphEdge.verificationStatus)}</Badge>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 break-all">{graphEdge.sourceNodeKey} {"->"} {graphEdge.targetNodeKey}</p>
                  <p className="text-xs text-zinc-400 mt-2">{graphEdge.vaultType}/{graphEdge.sensitivity} · confidence {confidence(graphEdge.confidence)}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
