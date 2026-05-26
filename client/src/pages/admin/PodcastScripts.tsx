import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type AdminPodcastScriptGenerateResult, type AdminPodcastScriptPackage } from "@/lib/api";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ArrowLeft, FileText, Loader2, Mic2, Share2, ShieldCheck, Sparkles, Video, Volume2, Youtube } from "lucide-react";

function statusBadgeClass(status: string) {
  if (status.includes("review")) return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
  if (status.includes("approved")) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  return "bg-zinc-500/10 text-zinc-300 border-zinc-500/20";
}

function formatScore(value: number | null | undefined) {
  if (typeof value !== "number") return "unknown";
  return value.toFixed(2);
}

function ScriptPackageReview({ record }: { record: AdminPodcastScriptPackage }) {
  const script = record.scriptPackage;
  const safety = record.safetyNotes;

  return (
    <div className="space-y-5">
      <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Mic2 className="w-5 h-5 text-cyan-300" />
              <h2 className="text-lg font-semibold">Script Package #{record.id}</h2>
              <Badge className={statusBadgeClass(record.status)}>{record.status}</Badge>
            </div>
            <p className="text-sm text-zinc-500 mt-2">Draft/internal/admin-review package for debate #{record.debateId}.</p>
          </div>
          <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">No publish controls</Badge>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="bg-[#10101a]/90 border-white/[0.08] p-5 lg:col-span-2">
          <h3 className="font-semibold">2-Minute News Script</h3>
          <p className="text-sm text-zinc-300 mt-3 leading-6 whitespace-pre-wrap">{script.twoMinuteNewsScript}</p>
        </Card>
        <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
          <h3 className="font-semibold">YouTube Draft</h3>
          <p className="text-sm font-medium text-zinc-100 mt-3">{script.youtubeTitle}</p>
          <p className="text-sm text-zinc-400 mt-3 leading-6 whitespace-pre-wrap">{script.youtubeDescription}</p>
          <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Thumbnail Text</p>
            <p className="text-sm text-zinc-100 mt-1">{script.thumbnailText}</p>
          </div>
        </Card>
      </div>

      <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
        <h3 className="font-semibold">10-Minute Podcast Script</h3>
        <p className="text-sm text-zinc-300 mt-3 leading-6 whitespace-pre-wrap">{script.tenMinutePodcastScript}</p>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
          <h3 className="font-semibold">Shorts Hooks</h3>
          <div className="mt-4 grid gap-2">
            {script.shortsHooks.map((hook) => (
              <div key={hook} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3 text-sm text-zinc-300">{hook}</div>
            ))}
          </div>
        </Card>

        <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
          <h3 className="font-semibold">Speaker Assignments</h3>
          <div className="mt-4 grid gap-2">
            {script.speakerAssignments.map((assignment) => (
              <div key={`${assignment.agentKey}-${assignment.assignment}`} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                <p className="text-sm font-medium text-zinc-100">{assignment.displayName}</p>
                <p className="text-xs text-zinc-500 mt-1">{assignment.role}</p>
                <p className="text-sm text-zinc-300 mt-2">{assignment.assignment}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
          <h3 className="font-semibold">Compliance / Safety Notes</h3>
          <div className="mt-4 space-y-2">
            {safety.notes.concat(script.complianceSafetyNotes).filter(Boolean).map((note) => (
              <p key={note} className="text-sm text-zinc-300">{note}</p>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-3 mt-5">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="text-xs text-zinc-500">Source Reliability</p>
              <p className="text-sm text-zinc-100">{formatScore(safety.sourceReliability)}</p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="text-xs text-zinc-500">Weak / Disputed Claims</p>
              <p className="text-sm text-zinc-100">{safety.weakOrDisputedClaims.length}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
          <h3 className="font-semibold">Sources / Evidence</h3>
          <div className="mt-4 grid gap-2 max-h-96 overflow-y-auto pr-1">
            {script.sourceEvidenceReferences.map((reference) => (
              <div key={`${reference.label}-${reference.url || ""}-${reference.claimId || ""}`} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                <p className="text-sm text-zinc-200">{reference.label}</p>
                <p className="text-xs text-zinc-500 mt-1 break-all">{reference.url || "No URL stored"}</p>
                {reference.status && (
                  <p className="text-xs text-zinc-500 mt-1">{reference.status} · confidence {formatScore(reference.confidenceScore)}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function PodcastScripts() {
  const [, navigate] = useLocation();
  const { admin, isLoading: authLoading, isAuthenticated } = useAdminAuth();
  const isRootAdmin = admin?.actor?.type === "root_admin" && admin.role === "super_admin";
  const [debateId, setDebateId] = useState("");
  const [latestResult, setLatestResult] = useState<AdminPodcastScriptGenerateResult | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated && !isRootAdmin) {
      navigate("/staff/dashboard", { replace: true });
    }
  }, [authLoading, isAuthenticated, isRootAdmin, navigate]);

  const { data: debates = [], isLoading: debatesLoading, refetch: refetchDebates } = useQuery({
    queryKey: ["admin-podcast-script-debates"],
    queryFn: () => api.admin.podcastScriptDebates(50),
    enabled: isRootAdmin,
  });

  const selectedDebate = useMemo(
    () => debates.find((debate) => String(debate.id) === debateId),
    [debates, debateId],
  );

  const { data: packages = [], refetch: refetchPackages } = useQuery({
    queryKey: ["admin-podcast-script-packages", debateId],
    queryFn: () => api.admin.podcastScriptPackages(debateId ? Number(debateId) : undefined),
    enabled: isRootAdmin && !!debateId,
  });

  const generateMutation = useMutation({
    mutationFn: (id: number) => api.admin.generatePodcastScriptPackage(id),
    onSuccess: (result) => {
      setLatestResult(result);
      refetchPackages();
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

  const selectedPackage = latestResult?.package || packages[0] || null;

  return (
    <div className="min-h-screen bg-[#070711] text-white">
      <div className="border-b border-white/[0.08] bg-[#0d0d18] px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <button onClick={() => navigate("/admin/dashboard")} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4">
            <ArrowLeft className="w-4 h-4" /> Admin Dashboard
          </button>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Mic2 className="w-8 h-8 text-cyan-300" />
                <h1 className="text-2xl font-bold">Podcast Scripts</h1>
                <Badge className="bg-yellow-500/15 text-yellow-300 border-yellow-500/20">Founder Only</Badge>
              </div>
              <p className="text-sm text-zinc-500 mt-2 max-w-3xl">
                Convert internal News-to-Debate drafts into manual/admin-review news and podcast script packages.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/admin/voice-jobs")} className="border-white/10 text-zinc-300">
                <Volume2 className="w-4 h-4 mr-2" /> Voice Jobs
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/youtube-publishing")} className="border-white/10 text-zinc-300">
                <Youtube className="w-4 h-4 mr-2" /> YouTube
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/video-render")} className="border-white/10 text-zinc-300">
                <Video className="w-4 h-4 mr-2" /> Video Render
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/social-distribution")} className="border-white/10 text-zinc-300">
                <Share2 className="w-4 h-4 mr-2" /> Social Distribution
              </Button>
              <Button variant="outline" onClick={() => refetchDebates()} disabled={debatesLoading} className="border-white/10 text-zinc-300">
                {debatesLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                Refresh Drafts
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Generate Script Package</h2>
              <p className="text-sm text-zinc-500 mt-1">Packages are stored as draft/internal/admin-review material only.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                <ShieldCheck className="w-3 h-3 mr-1" /> Manual trigger
              </Badge>
              <Badge className="bg-yellow-500/10 text-yellow-300 border-yellow-500/20">Admin approval required</Badge>
              <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">No audio</Badge>
              <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">No upload</Badge>
              <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">No public publish</Badge>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_auto] gap-4 mt-6">
            <div>
              <label className="text-xs uppercase tracking-wide text-zinc-500">News-to-Debate Draft</label>
              <Select value={debateId} onValueChange={(value) => {
                setDebateId(value);
                setLatestResult(null);
              }}>
                <SelectTrigger className="mt-2 bg-[#090912] border-white/10 text-zinc-100">
                  <SelectValue placeholder="Select a draft debate" />
                </SelectTrigger>
                <SelectContent>
                  {debates.map((debate) => (
                    <SelectItem key={debate.id} value={String(debate.id)}>
                      #{debate.id} · {debate.title.slice(0, 90)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDebate && (
                <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                  <p className="text-sm text-zinc-200">{selectedDebate.title}</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {selectedDebate.topic} · reliability {formatScore(selectedDebate.sourceReliability)}
                    {selectedDebate.sourceArticle ? ` · ${selectedDebate.sourceArticle.sourceName}` : ""}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-end">
              <Button
                onClick={() => generateMutation.mutate(Number(debateId))}
                disabled={!debateId || generateMutation.isPending}
                className="bg-cyan-600 hover:bg-cyan-700"
              >
                {generateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Generate Package
              </Button>
            </div>
          </div>

          {generateMutation.isError && (
            <div className="flex items-start gap-2 text-sm text-red-300 mt-4">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <span>{generateMutation.error instanceof Error ? generateMutation.error.message : "Unable to generate podcast script package"}</span>
            </div>
          )}
        </Card>

        {selectedPackage ? (
          <ScriptPackageReview record={selectedPackage} />
        ) : (
          <Card className="bg-[#10101a]/90 border-white/[0.08] p-8 text-center">
            <p className="text-sm text-zinc-500">No script package selected yet.</p>
          </Card>
        )}
      </main>
    </div>
  );
}
