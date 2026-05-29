import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AdminGluonRedemptionEligibilityResponse, AdminGviResult, GviComponentKey } from "@/lib/api";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GluonHowItWorksPanel } from "@/components/gluon/GluonPublic";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Dna,
  Loader2,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";

function statusClass(status: string) {
  if (["accepted", "approved", "verified"].includes(status)) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (["challenged", "needs_validation", "pending_review", "submitted"].includes(status)) return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
  if (["rejected", "blocked"].includes(status)) return "bg-red-500/10 text-red-300 border-red-500/20";
  return "bg-zinc-500/10 text-zinc-300 border-zinc-500/20";
}

function blockers(packet: any) {
  return Array.isArray(packet?.safetyReport?.blockers) ? packet.safetyReport.blockers : [];
}

function warnings(packet: any) {
  return Array.isArray(packet?.safetyReport?.warnings) ? packet.safetyReport.warnings : [];
}

function score(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0.00";
  return parsed.toFixed(2);
}

const gviComponentKeys: GviComponentKey[] = ["USD", "EUR", "GBP", "CNY", "gold", "crude_oil"];

function gviValue(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "1.0000";
  return parsed.toFixed(4);
}

function parseGviInputs(inputs: Record<string, string>) {
  const componentValues: Partial<Record<GviComponentKey, number>> = {};
  for (const key of gviComponentKeys) {
    const raw = inputs[key]?.trim();
    if (!raw) continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) componentValues[key] = parsed;
  }
  return componentValues;
}

function checklistEntries(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, any>);
}

function RedemptionComplianceSection({
  data,
  isLoading,
  inputs,
  setInputs,
  reasonById,
  setReasonById,
  onPreview,
  onMarkReviewed,
  onReject,
  previewPending,
  actionPending,
}: {
  data?: AdminGluonRedemptionEligibilityResponse;
  isLoading: boolean;
  inputs: { userId: string; agentId: string };
  setInputs: (inputs: { userId: string; agentId: string }) => void;
  reasonById: Record<string, string>;
  setReasonById: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  onPreview: () => void;
  onMarkReviewed: (id: string) => void;
  onReject: (id: string) => void;
  previewPending: boolean;
  actionPending: boolean;
}) {
  const reviews = data?.reviews || [];
  const candidates = data?.candidates || [];
  const warnings = data?.warnings || [
    "Gluon is an internal contribution credit, not withdrawable cash.",
    "GVI is an informational index, not a trading price.",
    "Redemption is disabled until legal, tax, KYC, anti-fraud, and revenue-pool approval.",
    "This page does not move funds or create a payable balance.",
    "Founder/admin review is required before any future redemption program.",
  ];

  return (
    <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-300" />
            <h2 className="text-lg font-semibold text-white">Redemption Compliance Preview</h2>
            <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">Disabled review</Badge>
          </div>
          <p className="text-sm text-zinc-400 mt-2 max-w-3xl">
            Root-admin eligibility review for a future compliance program. It records checklist status only; it does not change balances, funds, access, or marketplace state.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2 mt-4 text-xs">
            {warnings.slice(0, 5).map((warning) => (
              <div key={warning} className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] p-3 text-emerald-100/80">
                {warning}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.08] px-4 py-3 min-w-56">
          <p className="text-xs text-yellow-100/70">Platform conversion rate</p>
          <p className="text-3xl font-bold text-yellow-200">0</p>
          <p className="text-xs text-yellow-100/60 mt-1">Disabled in Phase 33</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[0.7fr_1.3fr] gap-4 mt-5">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Create Eligibility Review</p>
          <div>
            <p className="text-[10px] text-zinc-500 mb-1">User ID</p>
            <Input
              value={inputs.userId}
              onChange={(event) => setInputs({ ...inputs, userId: event.target.value })}
              placeholder="creator/user id"
              className="bg-black/30 border-white/10 text-xs"
            />
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 mb-1">Agent ID optional</p>
            <Input
              value={inputs.agentId}
              onChange={(event) => setInputs({ ...inputs, agentId: event.target.value })}
              placeholder="agent id"
              className="bg-black/30 border-white/10 text-xs"
            />
          </div>
          <Button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white" onClick={onPreview} disabled={previewPending || !inputs.userId.trim()}>
            {previewPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Preview eligibility
          </Button>
          <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3 text-xs text-zinc-500 space-y-1">
            <p>Estimate formula: valid Gluon x latest GVI x platform conversion rate.</p>
            <p>Because the conversion rate is 0, the disabled informational estimate remains 0.</p>
            <p>No billing, wallet, credit, purchase, payout, or marketplace transaction path is called.</p>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Recent Reviews</p>
            {isLoading && <Loader2 className="w-4 h-4 animate-spin text-emerald-300" />}
          </div>
          <div className="space-y-3 max-h-[420px] overflow-auto pr-1">
            {reviews.map((review) => {
              const reason = reasonById[review.id] || "";
              const checklist = checklistEntries(review.complianceChecklist).slice(0, 6);
              return (
                <div key={review.id} className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-100 truncate">{review.userId}</p>
                      <p className="text-[11px] text-zinc-500">{review.agentId || "all agents"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className={statusClass(review.eligibilityStatus)}>{review.eligibilityStatus}</Badge>
                      <Badge className={statusClass(review.adminReviewStatus)}>{review.adminReviewStatus}</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
                    <div className="rounded border border-white/[0.06] bg-white/[0.03] p-2">
                      <p className="text-zinc-500">Valid Gluon</p>
                      <p className="text-emerald-300 font-semibold">{score(review.validGluon)}</p>
                    </div>
                    <div className="rounded border border-white/[0.06] bg-white/[0.03] p-2">
                      <p className="text-zinc-500">Pending</p>
                      <p className="text-yellow-300 font-semibold">{score(review.pendingGluon)}</p>
                    </div>
                    <div className="rounded border border-white/[0.06] bg-white/[0.03] p-2">
                      <p className="text-zinc-500">Invalid</p>
                      <p className="text-red-300 font-semibold">{score(review.invalidGluon)}</p>
                    </div>
                    <div className="rounded border border-white/[0.06] bg-white/[0.03] p-2">
                      <p className="text-zinc-500">Disabled estimate</p>
                      <p className="text-cyan-300 font-semibold">{score(review.informationalEstimate)}</p>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2 mt-3">
                    {checklist.map(([key, value]) => {
                      const item = value && typeof value === "object" ? value as Record<string, any> : {};
                      return (
                        <div key={key} className="flex items-center justify-between gap-2 rounded border border-white/[0.06] bg-white/[0.03] px-2 py-1.5 text-xs">
                          <span className="text-zinc-400 truncate">{key}</span>
                          <Badge className={item.passed ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-yellow-500/10 text-yellow-300 border-yellow-500/20"}>
                            {item.passed ? "pass" : "required"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid md:grid-cols-[1fr_auto_auto] gap-2 mt-3">
                    <Input
                      value={reason}
                      onChange={(event) => setReasonById((prev) => ({ ...prev, [review.id]: event.target.value }))}
                      placeholder="Review note or rejection reason"
                      className="bg-black/30 border-white/10 text-xs"
                    />
                    <Button variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-200" disabled={actionPending} onClick={() => onMarkReviewed(review.id)}>
                      Mark reviewed
                    </Button>
                    <Button variant="outline" className="border-red-500/20 bg-red-500/10 text-red-200" disabled={actionPending || !reason.trim()} onClick={() => onReject(review.id)}>
                      Reject
                    </Button>
                  </div>
                </div>
              );
            })}
            {reviews.length === 0 && <p className="text-sm text-zinc-500">No eligibility review records yet.</p>}
          </div>
        </div>
      </div>

      {candidates.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Ledger Candidates</p>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {candidates.slice(0, 6).map((candidate) => (
              <div key={`${candidate.userId}-${candidate.agentId || "all"}`} className="rounded-lg border border-white/[0.06] bg-black/20 p-3 text-xs">
                <p className="font-medium text-zinc-100 truncate">{candidate.userId}</p>
                <p className="text-zinc-500 truncate">{candidate.agentId || "all agents"}</p>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <span className="text-zinc-500">Total</span><span className="text-zinc-200 text-right">{score(candidate.totalGluon)}</span>
                  <span className="text-zinc-500">Awarded rows</span><span className="text-zinc-200 text-right">{candidate.awarded}</span>
                  <span className="text-zinc-500">Pending rows</span><span className="text-zinc-200 text-right">{candidate.pending + candidate.simulated}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function GviSection({
  current,
  displayed,
  inputs,
  setInputs,
  previewPending,
  snapshotPending,
  onPreview,
  onSnapshot,
}: {
  current?: AdminGviResult;
  displayed?: AdminGviResult;
  inputs: Record<string, string>;
  setInputs: (inputs: Record<string, string>) => void;
  previewPending: boolean;
  snapshotPending: boolean;
  onPreview: () => void;
  onSnapshot: () => void;
}) {
  if (!displayed) {
    return (
      <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
        <Loader2 className="w-4 h-4 animate-spin text-violet-300" />
      </Card>
    );
  }

  return (
    <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-300" />
            <h2 className="text-lg font-semibold text-white">Gluon Value Index</h2>
            <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Read-only</Badge>
          </div>
          <p className="text-sm text-zinc-400 mt-2 max-w-3xl">
            GVI is a manual/fallback basket index for internal reference only. It does not change credits, balances, payouts, purchases, or platform access.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-4 text-xs">
            {displayed.warnings.map((warning) => (
              <div key={warning} className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] p-3 text-emerald-100/80">
                {warning}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.08] px-5 py-4 min-w-48">
          <p className="text-xs text-cyan-100/70">Current GVI</p>
          <p className="text-3xl font-bold text-cyan-200">{gviValue(displayed.gviScore)}</p>
          <p className="text-xs text-cyan-100/60 mt-1">
            {displayed.fallbackUsed ? "Fallback/manual values used" : "Manual snapshot values used"}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.3fr_0.7fr] gap-4 mt-5">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Basket Components</p>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {displayed.components.map((component) => (
              <div key={component.key} className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-zinc-100">{component.label}</p>
                  <Badge className={component.fallback || component.stale ? "bg-yellow-500/10 text-yellow-300 border-yellow-500/20" : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"}>
                    {component.fallback ? "fallback" : component.stale ? "stale" : "manual"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                  <div>
                    <p className="text-zinc-500">Weight</p>
                    <p className="text-zinc-200">{Math.round(component.weight * 100)}%</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Index</p>
                    <p className="text-zinc-200">{gviValue(component.componentIndex)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Baseline</p>
                    <p className="text-zinc-200">{gviValue(component.baselineValue)}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Current</p>
                    <p className="text-zinc-200">{gviValue(component.currentValue)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Manual Preview</p>
          <div className="grid grid-cols-2 gap-2">
            {gviComponentKeys.map((key) => {
              const currentValue = current?.componentValues?.[key];
              return (
                <div key={key}>
                  <p className="text-[10px] text-zinc-500 mb-1">{key.replace("_", " ")}</p>
                  <Input
                    value={inputs[key] || ""}
                    onChange={(event) => setInputs({ ...inputs, [key]: event.target.value })}
                    placeholder={currentValue == null ? "manual" : String(currentValue)}
                    className="bg-black/30 border-white/10 text-xs"
                    inputMode="decimal"
                  />
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Button variant="outline" className="border-cyan-500/20 bg-cyan-500/10 text-cyan-100" onClick={onPreview} disabled={previewPending}>
              {previewPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Preview
            </Button>
            <Button className="bg-violet-600 hover:bg-violet-500 text-white" onClick={onSnapshot} disabled={snapshotPending}>
              {snapshotPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Save Snapshot
            </Button>
          </div>
          <div className="mt-3 text-xs text-zinc-500 space-y-1">
            <p>{displayed.formula}</p>
            <p>{displayed.componentFormula}</p>
            <p>No live external requests, API keys, or automatic workers are used.</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function KnowledgeEconomy() {
  const [, navigate] = useLocation();
  const { admin, isLoading } = useAdminAuth();
  const queryClient = useQueryClient();
  const [selectedPacketId, setSelectedPacketId] = useState<string | null>(null);
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [previewById, setPreviewById] = useState<Record<string, any>>({});
  const [gviInputs, setGviInputs] = useState<Record<string, string>>({});
  const [gviPreview, setGviPreview] = useState<AdminGviResult | null>(null);
  const [redemptionInputs, setRedemptionInputs] = useState({ userId: "", agentId: "" });
  const [redemptionReasonById, setRedemptionReasonById] = useState<Record<string, string>>({});
  const isRootAdmin = admin?.actor?.type === "root_admin" && admin.role === "super_admin";

  useEffect(() => {
    if (!isLoading && !isRootAdmin) navigate("/admin/login", { replace: true });
  }, [isLoading, isRootAdmin, navigate]);

  const packetsQuery = useQuery({
    queryKey: ["/api/admin/knowledge-economy/packets"],
    queryFn: () => api.admin.knowledgeEconomyPackets(),
    enabled: isRootAdmin,
  });

  const gviQuery = useQuery({
    queryKey: ["/api/admin/knowledge-economy/gvi"],
    queryFn: () => api.admin.knowledgeEconomyGvi(),
    enabled: isRootAdmin,
  });

  const redemptionQuery = useQuery({
    queryKey: ["/api/admin/knowledge-economy/redemption/eligibility"],
    queryFn: () => api.admin.knowledgeEconomyRedemptionEligibility(),
    enabled: isRootAdmin,
  });

  const detailQuery = useQuery({
    queryKey: ["/api/admin/knowledge-economy/packets", selectedPacketId],
    queryFn: () => api.admin.knowledgeEconomyPacket(selectedPacketId!),
    enabled: isRootAdmin && !!selectedPacketId,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/knowledge-economy/packets"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/knowledge-economy/redemption/eligibility"] });
    if (selectedPacketId) queryClient.invalidateQueries({ queryKey: ["/api/admin/knowledge-economy/packets", selectedPacketId] });
  };

  const acceptMutation = useMutation({
    mutationFn: (id: string) => api.admin.acceptKnowledgePacket(id, { rationale: noteById[id] || "Accepted by root-admin review.", acceptingAgentType: "root_admin" }),
    onSuccess: refresh,
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.admin.rejectKnowledgePacket(id, { rationale: noteById[id] || "Rejected by root-admin review.", acceptingAgentType: "root_admin" }),
    onSuccess: refresh,
  });

  const challengeMutation = useMutation({
    mutationFn: (id: string) => api.admin.challengeKnowledgePacket(id, { challengeReason: noteById[id] || "Needs more evidence before acceptance.", acceptingAgentType: "root_admin" }),
    onSuccess: refresh,
  });

  const gluonPreviewMutation = useMutation({
    mutationFn: (id: string) => api.admin.previewKnowledgePacketGluon(id),
    onSuccess: (data, id) => setPreviewById((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), gluon: data } })),
  });

  const dnaPreviewMutation = useMutation({
    mutationFn: (id: string) => api.admin.previewKnowledgePacketDna(id),
    onSuccess: (data, id) => setPreviewById((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), dna: data } })),
  });

  const gviPreviewMutation = useMutation({
    mutationFn: () => api.admin.previewKnowledgeEconomyGvi(parseGviInputs(gviInputs)),
    onSuccess: (data) => setGviPreview(data),
  });

  const gviSnapshotMutation = useMutation({
    mutationFn: () => api.admin.snapshotKnowledgeEconomyGvi(parseGviInputs(gviInputs)),
    onSuccess: (data) => {
      setGviPreview(data.result);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/knowledge-economy/gvi"] });
    },
  });

  const redemptionPreviewMutation = useMutation({
    mutationFn: () => api.admin.previewKnowledgeEconomyRedemptionEligibility({
      userId: redemptionInputs.userId.trim(),
      agentId: redemptionInputs.agentId.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/knowledge-economy/redemption/eligibility"] });
    },
  });

  const redemptionReviewedMutation = useMutation({
    mutationFn: (id: string) => api.admin.markKnowledgeEconomyRedemptionReviewed(id, redemptionReasonById[id]),
    onSuccess: refresh,
  });

  const redemptionRejectMutation = useMutation({
    mutationFn: (id: string) => api.admin.rejectKnowledgeEconomyRedemption(id, redemptionReasonById[id] || "Rejected by root-admin compliance review."),
    onSuccess: refresh,
  });

  if (isLoading || packetsQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[#070711] text-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isRootAdmin) return null;

  const packets = packetsQuery.data || [];
  const selected = detailQuery.data;
  const displayedGvi = gviPreview || gviQuery.data;

  return (
    <div className="min-h-screen bg-[#070711] text-white">
      <div className="border-b border-white/[0.08] bg-[#0d0d18]/90">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <button onClick={() => navigate("/admin/dashboard")} className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200">
            <ArrowLeft className="w-4 h-4" />
            Admin Dashboard
          </button>
          <Badge className="bg-violet-500/10 text-violet-300 border-violet-500/20">Root admin only</Badge>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-violet-600/15 via-cyan-600/10 to-transparent p-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
              <Dna className="w-5 h-5 text-violet-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Knowledge Economy</h1>
              <p className="text-sm text-zinc-400 mt-1">Consent-controlled packets, weighted acceptance, Gluon simulation, and DNA learning previews.</p>
            </div>
          </div>
        </div>

        <Card className="bg-emerald-500/[0.06] border-emerald-500/20 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-300 mt-0.5" />
            <div>
              <h2 className="font-semibold text-white">Phase 25B Safety Boundary</h2>
              <p className="text-sm text-emerald-100/70 mt-1">
                Gluon is non-withdrawable, non-cashout, and separate from credits, purchases, payouts, Stripe, Razorpay, and creator earnings. DNA mutation stays preview-only.
              </p>
            </div>
          </div>
        </Card>

        <GluonHowItWorksPanel audience="admin" topic="gluon" />

        <GviSection
          current={gviQuery.data}
          displayed={displayedGvi}
          inputs={gviInputs}
          setInputs={setGviInputs}
          previewPending={gviPreviewMutation.isPending}
          snapshotPending={gviSnapshotMutation.isPending}
          onPreview={() => gviPreviewMutation.mutate()}
          onSnapshot={() => gviSnapshotMutation.mutate()}
        />

        <RedemptionComplianceSection
          data={redemptionQuery.data}
          isLoading={redemptionQuery.isLoading}
          inputs={redemptionInputs}
          setInputs={setRedemptionInputs}
          reasonById={redemptionReasonById}
          setReasonById={setRedemptionReasonById}
          onPreview={() => redemptionPreviewMutation.mutate()}
          onMarkReviewed={(id) => redemptionReviewedMutation.mutate(id)}
          onReject={(id) => redemptionRejectMutation.mutate(id)}
          previewPending={redemptionPreviewMutation.isPending}
          actionPending={redemptionReviewedMutation.isPending || redemptionRejectMutation.isPending}
        />

        {packets.length === 0 ? (
          <Card className="bg-[#10101a]/90 border-white/[0.08] p-10 text-center">
            <PackageCheck className="w-10 h-10 mx-auto text-zinc-600 mb-3" />
            <p className="text-zinc-400">No knowledge packets have been submitted yet.</p>
          </Card>
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_420px] gap-5">
            <div className="grid gap-4">
              {packets.map((packet: any) => {
                const packetBlockers = blockers(packet);
                const packetWarnings = warnings(packet);
                const preview = previewById[packet.id] || {};
                const canAccept = packetBlockers.length === 0 && !["accepted", "rejected"].includes(packet.reviewStatus);
                const informationalEstimate = displayedGvi && Number.isFinite(Number(packet.gluonEarned))
                  ? Number(packet.gluonEarned) * displayedGvi.gviScore
                  : null;

                return (
                  <Card key={packet.id} className="bg-[#10101a]/90 border-white/[0.08] p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold">{packet.title}</h2>
                          <Badge className={statusClass(packet.status)}>{packet.status}</Badge>
                          <Badge className={statusClass(packet.reviewStatus)}>{packet.reviewStatus}</Badge>
                          <Badge className="bg-white/[0.05] text-zinc-300 border-white/[0.08]">{packet.vaultType}/{packet.sensitivity}</Badge>
                        </div>
                        <p className="text-sm text-zinc-400 line-clamp-2">{packet.summary}</p>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                            <p className="text-xs text-zinc-500">Weighted Acceptance</p>
                            <p className="text-lg font-semibold text-cyan-300">{score(packet.weightedAcceptance)}</p>
                          </div>
                          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                            <p className="text-xs text-zinc-500">Gluon</p>
                            <p className="text-lg font-semibold text-violet-300">{score(packet.gluonEarned)}</p>
                          </div>
                          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                            <p className="text-xs text-zinc-500">GVI Estimate</p>
                            <p className="text-lg font-semibold text-cyan-300">{informationalEstimate == null ? "0.00" : score(informationalEstimate)}</p>
                            <p className="text-[10px] text-zinc-500">Disabled, non-cashout, informational only</p>
                          </div>
                          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                            <p className="text-xs text-zinc-500">Risk</p>
                            <p className="text-lg font-semibold text-yellow-300">{score(packet.riskScore)}</p>
                          </div>
                          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                            <p className="text-xs text-zinc-500">Compliance</p>
                            <p className="text-lg font-semibold text-emerald-300">{score(packet.complianceScore)}</p>
                          </div>
                        </div>

                        {(packetBlockers.length > 0 || packetWarnings.length > 0) && (
                          <div className="space-y-2">
                            {packetBlockers.map((item: any, index: number) => (
                              <div key={`blocker-${packet.id}-${index}`} className="flex items-start gap-2 text-xs text-red-300">
                                <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                <span>{item.message || item.code}</span>
                              </div>
                            ))}
                            {packetWarnings.map((item: any, index: number) => (
                              <div key={`warning-${packet.id}-${index}`} className="flex items-start gap-2 text-xs text-yellow-300">
                                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                <span>{item.message || item.code}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {preview.gluon && (
                          <div className="rounded-lg border border-violet-500/20 bg-violet-500/10 p-3 text-sm text-violet-100">
                            Gluon preview: {score(preview.gluon.amount)} · {preview.gluon.reasons?.[0]}
                          </div>
                        )}
                        {preview.dna && (
                          <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 text-sm text-cyan-100">
                            DNA preview created. Live genome mutated: {String(preview.dna.liveGenomeMutated)}
                          </div>
                        )}
                      </div>

                      <div className="w-full xl:w-72 space-y-3">
                        <Textarea
                          value={noteById[packet.id] || ""}
                          onChange={(event) => setNoteById((prev) => ({ ...prev, [packet.id]: event.target.value }))}
                          placeholder="Review note or challenge reason"
                          className="min-h-20 bg-black/30 border-white/10"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Button variant="outline" className="border-white/10 bg-white/[0.03]" onClick={() => setSelectedPacketId(packet.id)}>
                            Details
                          </Button>
                          <Button variant="outline" className="border-violet-500/20 bg-violet-500/10 text-violet-200" onClick={() => gluonPreviewMutation.mutate(packet.id)}>
                            <Sparkles className="w-4 h-4" />
                            Gluon
                          </Button>
                          <Button variant="outline" className="border-cyan-500/20 bg-cyan-500/10 text-cyan-200" onClick={() => dnaPreviewMutation.mutate(packet.id)}>
                            <Dna className="w-4 h-4" />
                            DNA
                          </Button>
                          <Button variant="outline" className="border-yellow-500/20 bg-yellow-500/10 text-yellow-200" onClick={() => challengeMutation.mutate(packet.id)}>
                            Challenge
                          </Button>
                          <Button variant="outline" className="border-red-500/20 bg-red-500/10 text-red-200" onClick={() => rejectMutation.mutate(packet.id)}>
                            Reject
                          </Button>
                          <Button className="bg-emerald-600 hover:bg-emerald-500 text-white" disabled={!canAccept} onClick={() => acceptMutation.mutate(packet.id)}>
                            <CheckCircle2 className="w-4 h-4" />
                            Accept
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            <Card className="bg-[#10101a]/90 border-white/[0.08] p-5 h-fit sticky top-20">
              <h2 className="text-lg font-semibold">Selected Packet</h2>
              {!selectedPacketId ? (
                <p className="text-sm text-zinc-500 mt-3">Choose a packet to inspect acceptances, ledger entries, and mutation previews.</p>
              ) : detailQuery.isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-violet-300 mt-4" />
              ) : selected ? (
                <div className="space-y-4 mt-4">
                  <div>
                    <p className="text-xs text-zinc-500">Abstracted content</p>
                    <p className="text-sm text-zinc-300 mt-1 leading-6">{selected.abstractedContent}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-center">
                      <p className="text-xs text-zinc-500">Accepted</p>
                      <p className="text-lg font-semibold text-emerald-300">{selected.acceptedByAgents}</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-center">
                      <p className="text-xs text-zinc-500">Rejected</p>
                      <p className="text-lg font-semibold text-red-300">{selected.rejectedByAgents}</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-center">
                      <p className="text-xs text-zinc-500">Challenged</p>
                      <p className="text-lg font-semibold text-yellow-300">{selected.challengedByAgents}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 mb-2">Acceptances</p>
                    <div className="space-y-2">
                      {(selected.acceptances || []).slice(0, 5).map((item: any) => (
                        <div key={item.id} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Badge className={statusClass(item.decision)}>{item.decision}</Badge>
                            <span className="text-xs text-zinc-500">{score(item.weightedAcceptanceContribution)}</span>
                          </div>
                          <p className="text-xs text-zinc-500 mt-2">{item.acceptingAgentType} · {item.acceptingAgentId}</p>
                        </div>
                      ))}
                      {(selected.acceptances || []).length === 0 && <p className="text-sm text-zinc-500">No acceptance records yet.</p>}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-red-300 mt-3">Could not load selected packet.</p>
              )}
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
