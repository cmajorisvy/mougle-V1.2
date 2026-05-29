import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout/Layout";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, ArrowLeft, Bot, CheckCircle2, Eye, Loader2, Lock, MessageSquare, PackageCheck, Shield, Sparkles, Star } from "lucide-react";

const EXPORT_MODES = [
  { value: "public_knowledge_only", label: "Public knowledge only" },
  { value: "business_knowledge_only", label: "Business knowledge with permission" },
  { value: "behavioral_style_only", label: "Behavioral style only" },
  { value: "skills_only", label: "Skills only" },
  { value: "combined_sanitized_profile", label: "Combined sanitized profile" },
];

function badgeClass(status: string) {
  if (["approved", "pending_review"].includes(status)) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (["blocked", "rejected"].includes(status)) return "bg-red-500/10 text-red-300 border-red-500/20";
  if (status === "sandbox_only") return "bg-cyan-500/10 text-cyan-300 border-cyan-500/20";
  return "bg-zinc-500/10 text-zinc-300 border-zinc-500/20";
}

function issueList(report: any) {
  const blockers = Array.isArray(report?.blockers) ? report.blockers : [];
  const warnings = Array.isArray(report?.warnings) ? report.warnings : [];
  return [...blockers, ...warnings];
}

export default function AgentMarketplaceSafeClone() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const [sourceAgentId, setSourceAgentId] = useState("");
  const [exportMode, setExportMode] = useState("public_knowledge_only");
  const [businessExportApproved, setBusinessExportApproved] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [sandboxPackageId, setSandboxPackageId] = useState("");
  const [sandboxPrompt, setSandboxPrompt] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate("/auth/signin", { replace: true });
  }, [loading, navigate, user]);

  const payload = useMemo(() => ({
    sourceAgentId,
    exportMode,
    title,
    description,
    category,
    businessExportApproved,
  }), [businessExportApproved, category, description, exportMode, sourceAgentId, title]);

  const { data: eligibleAgents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ["/api/marketplace/safe-clone/eligible-agents"],
    queryFn: () => api.marketplaceSafeClone.eligibleAgents(),
    enabled: !!user,
  });

  const { data: packages = [] } = useQuery({
    queryKey: ["/api/marketplace/safe-clone/packages"],
    queryFn: () => api.marketplaceSafeClone.packages(),
    enabled: !!user,
  });

  const { data: reviewSummaries = [] } = useQuery({
    queryKey: ["/api/marketplace/safe-clone/reviews"],
    queryFn: () => api.marketplaceSafeClone.reviews(),
    enabled: !!user,
  });

  const previewMutation = useMutation({
    mutationFn: () => api.marketplaceSafeClone.preview(payload),
    onSuccess: setPreview,
  });

  const submitMutation = useMutation({
    mutationFn: () => api.marketplaceSafeClone.submit(payload),
    onSuccess: (data) => {
      setPreview(data);
      setSandboxPackageId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/marketplace/safe-clone/packages"] });
    },
  });

  const sandboxMutation = useMutation({
    mutationFn: () => api.marketplaceSafeClone.sandboxTest(sandboxPackageId, sandboxPrompt),
  });

  const selectedAgent = eligibleAgents.find((entry: any) => entry.agent?.id === sourceAgentId)?.agent;
  const issues = issueList(preview?.safetyReport);
  const hasBlockers = (preview?.safetyReport?.blockers || []).length > 0;
  const canSubmit = !!sourceAgentId && !!preview && !submitMutation.isPending;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <Layout>
      <div className="space-y-6 pb-12" data-testid="page-safe-clone-builder">
        <button
          onClick={() => navigate("/agent-marketplace")}
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Safe Clone Sandbox
        </button>

        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-emerald-600/15 via-cyan-600/10 to-transparent p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center">
                  <PackageCheck className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">Safe Clone Listing</h1>
                  <p className="text-sm text-zinc-400 mt-1">Prepare sanitized safe-clone sandbox packages without exporting private memory.</p>
                </div>
              </div>
            </div>
            <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">
              Sandbox preview only
            </Badge>
            <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">
              No checkout
            </Badge>
            <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">
              No production deployment
            </Badge>
          </div>
        </div>

        <Card className="bg-cyan-500/10 border-cyan-500/20 p-4 text-sm text-cyan-100">
          Safe-clone submissions create admin-review records and sandbox previews only. They do not sell, transfer, deploy, or expose the original agent or private memory.
        </Card>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="bg-[#10101a]/90 border-white/[0.08] p-5 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs text-zinc-500">Owned private agent</label>
                <Select value={sourceAgentId} onValueChange={(value) => {
                  setSourceAgentId(value);
                  setPreview(null);
                }}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                    <SelectValue placeholder={agentsLoading ? "Loading agents..." : "Select agent"} />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleAgents.map((entry: any) => (
                      <SelectItem key={entry.agent.id} value={entry.agent.id}>
                        {entry.agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-zinc-500">Export mode</label>
                <Select value={exportMode} onValueChange={(value) => {
                  setExportMode(value);
                  setPreview(null);
                }}>
                  <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPORT_MODES.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={selectedAgent ? `${selectedAgent.name} sandbox clone` : "Listing title"}
                className="bg-white/[0.04] border-white/[0.08] text-white"
              />
              <Input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Category"
                className="bg-white/[0.04] border-white/[0.08] text-white"
              />
            </div>

            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the sanitized sandbox package for admin review."
              className="min-h-24 bg-white/[0.04] border-white/[0.08] text-white"
            />

            <label className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <Checkbox
                checked={businessExportApproved}
                onCheckedChange={(checked) => {
                  setBusinessExportApproved(checked === true);
                  setPreview(null);
                }}
              />
              <span className="text-sm text-zinc-300">
                I explicitly approve sanitized business-vault knowledge for this export mode. Personal/private memory must still be excluded.
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => previewMutation.mutate()}
                disabled={!sourceAgentId || previewMutation.isPending}
                className="bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                {previewMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
                Generate Safety Preview
              </Button>
              <Button
                onClick={() => submitMutation.mutate()}
                disabled={!canSubmit}
                variant={hasBlockers ? "outline" : "default"}
                className={hasBlockers ? "border-white/10 text-zinc-300" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
              >
                {submitMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PackageCheck className="w-4 h-4 mr-2" />}
                {hasBlockers ? "Save Sandbox-Only Package" : "Submit for Admin Review"}
              </Button>
            </div>
          </Card>

          <Card className="bg-[#10101a]/90 border-white/[0.08] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-emerald-300" />
              <h2 className="font-semibold text-white">Safety Preview</h2>
            </div>
            {!preview ? (
              <p className="text-sm text-zinc-500 leading-6">Choose an agent and export mode to see included vaults, excluded vaults, redactions, and blockers.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                    <p className="text-xs text-zinc-500">Included</p>
                    <p className="text-xl font-semibold text-emerald-300">{preview.includedVaultSummary?.total || 0}</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                    <p className="text-xs text-zinc-500">Excluded</p>
                    <p className="text-xl font-semibold text-cyan-300">{preview.excludedVaultSummary?.total || 0}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {issues.length === 0 ? (
                    <div className="flex items-start gap-2 text-sm text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 mt-0.5" />
                      No blocking export issues detected.
                    </div>
                  ) : issues.map((issue: any, index: number) => (
                    <div key={`${issue.code}-${index}`} className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-sm">
                      {issue.severity === "blocking" ? <AlertTriangle className="w-4 h-4 text-red-300 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-yellow-300 mt-0.5" />}
                      <div>
                        <Badge className={issue.severity === "blocking" ? "bg-red-500/10 text-red-300 border-red-500/20" : "bg-yellow-500/10 text-yellow-300 border-yellow-500/20"}>
                          {issue.severity}
                        </Badge>
                        <p className="text-zinc-300 mt-2">{issue.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="bg-[#10101a]/90 border-white/[0.08] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-300" />
              <h2 className="font-semibold text-white">Your Safe Clone Packages</h2>
            </div>
            {packages.length === 0 ? (
              <p className="text-sm text-zinc-500">No packages prepared yet.</p>
            ) : (
              <div className="space-y-3">
                {packages.map((pkg: any) => (
                  <button
                    key={pkg.id}
                    onClick={() => setSandboxPackageId(pkg.id)}
                    className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-left hover:border-white/[0.12]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Bot className="w-4 h-4 text-cyan-300" />
                      <span className="text-sm font-medium text-white">{pkg.sourceAgent?.name || pkg.packageMetadata?.sourceAgent?.name || "Safe clone"}</span>
                      <Badge className={badgeClass(pkg.reviewStatus)}>{pkg.reviewStatus}</Badge>
                      <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">{pkg.exportMode}</Badge>
                    </div>
                    <p className="text-xs text-zinc-500 mt-2">Included {pkg.includedVaultSummary?.total || 0} · Excluded {pkg.excludedVaultSummary?.total || 0}</p>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="bg-[#10101a]/90 border-white/[0.08] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-amber-300" />
              <h2 className="font-semibold text-white">Sandbox Review Summary</h2>
            </div>
            {reviewSummaries.length === 0 ? (
              <p className="text-sm text-zinc-500">No moderated sandbox review summaries yet.</p>
            ) : (
              <div className="space-y-3">
                {reviewSummaries.map((summary: any) => (
                  <div key={summary.clonePackageId} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-white">{summary.title}</span>
                      <Badge className={badgeClass(summary.reviewStatus)}>{summary.reviewStatus}</Badge>
                      {summary.trustRanking?.label && (
                        <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/20">{summary.trustRanking.label} · {summary.trustRanking.score}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-2">
                      Approved reviews: {summary.reviewSummary?.approvedCount || 0} · Pending: {summary.reviewSummary?.pendingCount || 0}
                    </p>
                    {summary.reviews?.slice(0, 2).map((review: any) => (
                      <div key={review.id} className="mt-3 rounded-lg bg-black/20 p-3">
                        <div className="flex items-center gap-1 text-amber-300">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star key={star} className={`w-3 h-3 ${star <= review.rating ? "fill-amber-300" : ""}`} />
                          ))}
                        </div>
                        <p className="text-xs text-zinc-300 mt-1">{review.title}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="bg-[#10101a]/90 border-white/[0.08] p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-cyan-300" />
              <h2 className="font-semibold text-white">Sandbox Test</h2>
            </div>
            <Select value={sandboxPackageId} onValueChange={setSandboxPackageId}>
              <SelectTrigger className="bg-white/[0.04] border-white/[0.08] text-white">
                <SelectValue placeholder="Select a package" />
              </SelectTrigger>
              <SelectContent>
                {packages.map((pkg: any) => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {pkg.sourceAgent?.name || "Safe clone"} · {pkg.reviewStatus}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={sandboxPrompt}
              onChange={(event) => setSandboxPrompt(event.target.value)}
              placeholder="Ask a sandbox-only question. The preview uses sanitized package data only."
              className="min-h-20 bg-white/[0.04] border-white/[0.08] text-white"
            />
            <Button
              onClick={() => sandboxMutation.mutate()}
              disabled={!sandboxPackageId || sandboxMutation.isPending}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {sandboxMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
              Run Sandbox Preview
            </Button>
            {sandboxMutation.data && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                <p className="text-sm text-zinc-300 leading-6">{sandboxMutation.data.response}</p>
                <p className="text-xs text-zinc-500 mt-3">Original private memory used: {sandboxMutation.data.memoryAccess?.usesOriginalPrivateMemory ? "yes" : "no"}</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
}
