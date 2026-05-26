import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  api,
  type AdminPodcastAudioJob,
  type AdminVoiceJobGeneratePayload,
  type AdminVoiceJobGenerateResult,
} from "@/lib/api";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ArrowLeft, FileAudio2, Loader2, Mic2, RefreshCw, Share2, ShieldCheck, Video, Volume2, Wand2, Youtube } from "lucide-react";

function statusBadgeClass(status: string) {
  if (status === "completed") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (status === "mock") return "bg-cyan-500/10 text-cyan-300 border-cyan-500/20";
  if (status === "failed") return "bg-red-500/10 text-red-300 border-red-500/20";
  if (status === "processing" || status === "queued") return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
  return "bg-zinc-500/10 text-zinc-300 border-zinc-500/20";
}

function formatCost(value: number | null | undefined) {
  if (typeof value !== "number") return "$0.0000";
  return `$${value.toFixed(4)}`;
}

function scriptTypeLabel(value: string) {
  if (value === "two_minute") return "2-minute";
  if (value === "ten_minute") return "10-minute";
  if (value === "mougle_conclusion") return "MOUGLE conclusion";
  return value;
}

function ProviderStatusCard({ selected, elevenLabsConfigured, replitOpenAiAudioConfigured, message }: {
  selected: string;
  elevenLabsConfigured: boolean;
  replitOpenAiAudioConfigured: boolean;
  message: string;
}) {
  return (
    <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-cyan-300" />
            <h2 className="text-lg font-semibold">TTS Provider</h2>
            <Badge className={statusBadgeClass(selected)}>{selected}</Badge>
          </div>
          <p className="text-sm text-zinc-500 mt-2">{message}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className={elevenLabsConfigured ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-zinc-500/10 text-zinc-300 border-zinc-500/20"}>
            ElevenLabs {elevenLabsConfigured ? "configured" : "missing"}
          </Badge>
          <Badge className={replitOpenAiAudioConfigured ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-zinc-500/10 text-zinc-300 border-zinc-500/20"}>
            Replit/OpenAI {replitOpenAiAudioConfigured ? "configured" : "missing"}
          </Badge>
          <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Mock available</Badge>
        </div>
      </div>
    </Card>
  );
}

function VoiceJobCard({ job }: { job: AdminPodcastAudioJob }) {
  return (
    <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <FileAudio2 className="w-5 h-5 text-cyan-300" />
            <h3 className="font-semibold">Voice Job #{job.id}</h3>
            <Badge className={statusBadgeClass(job.status)}>{job.status}</Badge>
            <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">{job.provider}</Badge>
          </div>
          <p className="text-sm text-zinc-500 mt-2">
            Script package #{job.scriptPackageId} · {job.segments.length} segment{job.segments.length === 1 ? "" : "s"} · {job.adminReviewStatus}
          </p>
          {job.errorMessage && (
            <div className="flex items-start gap-2 text-sm text-red-300 mt-3">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <span>{job.errorMessage}</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
            <p className="text-xs text-zinc-500">Estimated</p>
            <p className="text-zinc-100">{formatCost(job.estimatedCost)}</p>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
            <p className="text-xs text-zinc-500">Actual</p>
            <p className="text-zinc-100">{formatCost(job.actualCost)}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {job.segments.map((segment) => (
          <div key={`${job.id}-${segment.segmentIndex}`} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={statusBadgeClass(segment.status)}>{segment.status}</Badge>
                  <p className="text-sm font-medium text-zinc-100">
                    Segment {segment.segmentIndex} · {scriptTypeLabel(segment.scriptType)}
                  </p>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  {segment.displayName} · {segment.voiceLabel} · {segment.characterCount} chars
                </p>
                <p className="text-sm text-zinc-300 mt-3 leading-6">{segment.textPreview}</p>
                {segment.errorMessage && <p className="text-sm text-red-300 mt-2">{segment.errorMessage}</p>}
              </div>
              <div className="min-w-[260px]">
                {segment.audioUrl ? (
                  <audio controls preload="none" src={segment.audioUrl} className="w-full" />
                ) : (
                  <div className="rounded-lg border border-dashed border-white/[0.08] p-3 text-xs text-zinc-500">
                    No audio file stored for this segment.
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function VoiceJobs() {
  const [, navigate] = useLocation();
  const { admin, isLoading: authLoading, isAuthenticated } = useAdminAuth();
  const isRootAdmin = admin?.actor?.type === "root_admin" && admin.role === "super_admin";
  const [scriptPackageId, setScriptPackageId] = useState("");
  const [scriptType, setScriptType] = useState<AdminVoiceJobGeneratePayload["scriptType"]>("both");
  const [provider, setProvider] = useState<AdminVoiceJobGeneratePayload["provider"]>("auto");
  const [latestResult, setLatestResult] = useState<AdminVoiceJobGenerateResult | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated && !isRootAdmin) {
      navigate("/staff/dashboard", { replace: true });
    }
  }, [authLoading, isAuthenticated, isRootAdmin, navigate]);

  const { data: packageResponse, isLoading: packagesLoading, refetch: refetchPackages } = useQuery({
    queryKey: ["admin-voice-job-packages"],
    queryFn: () => api.admin.voiceJobPackages(75),
    enabled: isRootAdmin,
  });

  const { data: jobs = [], isLoading: jobsLoading, refetch: refetchJobs } = useQuery({
    queryKey: ["admin-voice-jobs", scriptPackageId],
    queryFn: () => api.admin.voiceJobs(scriptPackageId ? Number(scriptPackageId) : undefined, 75),
    enabled: isRootAdmin,
  });

  const packages = packageResponse?.packages || [];
  const selectedPackage = useMemo(
    () => packages.find((item) => String(item.id) === scriptPackageId) || null,
    [packages, scriptPackageId],
  );

  const generateMutation = useMutation({
    mutationFn: () => api.admin.generateVoiceJob({
      scriptPackageId: Number(scriptPackageId),
      scriptType,
      provider,
    }),
    onSuccess: (result) => {
      setLatestResult(result);
      refetchJobs();
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
                <Volume2 className="w-8 h-8 text-cyan-300" />
                <h1 className="text-2xl font-bold">Voice Jobs</h1>
                <Badge className="bg-yellow-500/15 text-yellow-300 border-yellow-500/20">Founder Only</Badge>
              </div>
              <p className="text-sm text-zinc-500 mt-2 max-w-3xl">
                Generate internal draft audio from approved podcast script packages for manual/admin review.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/admin/podcast-scripts")} className="border-white/10 text-zinc-300">
                <Mic2 className="w-4 h-4 mr-2" /> Podcast Scripts
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
              <Button variant="outline" onClick={() => { refetchPackages(); refetchJobs(); }} disabled={packagesLoading || jobsLoading} className="border-white/10 text-zinc-300">
                {(packagesLoading || jobsLoading) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {packageResponse?.providerStatus && (
          <ProviderStatusCard {...packageResponse.providerStatus} />
        )}

        <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Generate Draft Audio</h2>
              <p className="text-sm text-zinc-500 mt-1">Voice jobs stay internal and admin-review only.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                <ShieldCheck className="w-3 h-3 mr-1" /> Manual trigger
              </Badge>
              <Badge className="bg-yellow-500/10 text-yellow-300 border-yellow-500/20">Admin approval required</Badge>
              <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">No public publish</Badge>
              <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">No uploads</Badge>
              <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">Video render separate</Badge>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1.6fr_.7fr_.7fr_auto] gap-4 mt-6">
            <div>
              <label className="text-xs uppercase tracking-wide text-zinc-500">Podcast Script Package</label>
              <Select value={scriptPackageId} onValueChange={(value) => {
                setScriptPackageId(value);
                setLatestResult(null);
              }}>
                <SelectTrigger className="mt-2 bg-[#090912] border-white/10 text-zinc-100">
                  <SelectValue placeholder="Select a script package" />
                </SelectTrigger>
                <SelectContent>
                  {packages.map((record) => (
                    <SelectItem key={record.id} value={String(record.id)}>
                      #{record.id} · Debate #{record.debateId} · {record.scriptPackage.youtubeTitle.slice(0, 80)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-zinc-500">Script</label>
              <Select value={scriptType} onValueChange={(value) => setScriptType(value as AdminVoiceJobGeneratePayload["scriptType"])}>
                <SelectTrigger className="mt-2 bg-[#090912] border-white/10 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Both scripts</SelectItem>
                  <SelectItem value="two_minute">2-minute</SelectItem>
                  <SelectItem value="ten_minute">10-minute</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-zinc-500">Provider</label>
              <Select value={provider} onValueChange={(value) => setProvider(value as AdminVoiceJobGeneratePayload["provider"])}>
                <SelectTrigger className="mt-2 bg-[#090912] border-white/10 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                  <SelectItem value="replit_openai_audio">Replit/OpenAI</SelectItem>
                  <SelectItem value="mock">Mock dry-run</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={!scriptPackageId || generateMutation.isPending}
                className="bg-cyan-600 hover:bg-cyan-700"
              >
                {generateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                Generate Audio
              </Button>
            </div>
          </div>

          {selectedPackage && (
            <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="text-sm text-zinc-200">{selectedPackage.scriptPackage.youtubeTitle}</p>
              <p className="text-xs text-zinc-500 mt-1">
                Debate #{selectedPackage.debateId} · status {selectedPackage.status}
                {selectedPackage.latestVoiceJob ? ` · latest voice job #${selectedPackage.latestVoiceJob.id} (${selectedPackage.latestVoiceJob.status})` : ""}
              </p>
            </div>
          )}

          {generateMutation.isError && (
            <div className="flex items-start gap-2 text-sm text-red-300 mt-4">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <span>{generateMutation.error instanceof Error ? generateMutation.error.message : "Unable to generate voice job"}</span>
            </div>
          )}
        </Card>

        {latestResult && (
          <Card className="bg-cyan-500/10 border-cyan-500/20 p-4">
            <p className="text-sm text-cyan-100">
              Voice job #{latestResult.job.id} created in {latestResult.job.status} mode with {latestResult.job.segments.length} segment{latestResult.job.segments.length === 1 ? "" : "s"}.
            </p>
          </Card>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Voice Jobs</h2>
            <p className="text-sm text-zinc-500">{jobs.length} shown</p>
          </div>
          {jobs.length > 0 ? (
            <div className="space-y-5">
              {jobs.map((job) => <VoiceJobCard key={job.id} job={job} />)}
            </div>
          ) : (
            <Card className="bg-[#10101a]/90 border-white/[0.08] p-8 text-center">
              <p className="text-sm text-zinc-500">No voice jobs found yet.</p>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
