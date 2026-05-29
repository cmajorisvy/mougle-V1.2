import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  api,
  type AdminYouTubeChecklistItem,
  type AdminYouTubeCreatePackagePayload,
  type AdminYouTubePublishingPackage,
} from "@/lib/api";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Mic2, RefreshCw, Share2, ShieldCheck, UploadCloud, Video, Volume2, Youtube } from "lucide-react";

function statusBadgeClass(status: string) {
  if (status === "approved" || status === "uploaded" || status === "youtube_data_api") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (status === "blocked" || status === "failed") return "bg-red-500/10 text-red-300 border-red-500/20";
  if (status === "ready_for_approval" || status === "pending") return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
  if (status === "dry_run") return "bg-cyan-500/10 text-cyan-300 border-cyan-500/20";
  return "bg-zinc-500/10 text-zinc-300 border-zinc-500/20";
}

function ChecklistGroup({ title, items }: { title: string; items: AdminYouTubeChecklistItem[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <div key={item.key} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
            <div className="flex items-start gap-3">
              {item.passed ? <CheckCircle2 className="w-4 h-4 text-emerald-300 mt-0.5" /> : <AlertTriangle className={item.severity === "blocking" ? "w-4 h-4 text-red-300 mt-0.5" : "w-4 h-4 text-yellow-300 mt-0.5"} />}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-zinc-100">{item.label}</p>
                  <Badge className={item.severity === "blocking" ? "bg-red-500/10 text-red-300 border-red-500/20" : item.severity === "warning" ? "bg-yellow-500/10 text-yellow-300 border-yellow-500/20" : "bg-zinc-500/10 text-zinc-300 border-zinc-500/20"}>
                    {item.severity}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500 mt-1">{item.message}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PackageCard({
  record,
  onValidate,
  onApprove,
  onUpload,
  actionLoading,
  youtubeConfigured,
}: {
  record: AdminYouTubePublishingPackage;
  onValidate: (id: number) => void;
  onApprove: (id: number) => void;
  onUpload: (id: number) => void;
  actionLoading: string | null;
  youtubeConfigured: boolean;
}) {
  const blockingItems = [...record.readinessChecklist, ...record.complianceChecklist, ...record.sourceChecklist]
    .filter((item) => item.severity === "blocking" && !item.passed);
  const canApprove = blockingItems.length === 0 && record.approvalStatus !== "approved";
  const canUpload = record.approvalStatus === "approved" && record.uploadStatus !== "uploaded" && blockingItems.length === 0 && youtubeConfigured;

  return (
    <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Youtube className="w-5 h-5 text-red-300" />
            <h2 className="text-lg font-semibold">Package #{record.id}</h2>
            <Badge className={statusBadgeClass(record.status)}>{record.status}</Badge>
            <Badge className={statusBadgeClass(record.approvalStatus)}>{record.approvalStatus}</Badge>
            <Badge className={statusBadgeClass(record.uploadStatus)}>{record.uploadStatus}</Badge>
          </div>
          <p className="text-sm text-zinc-500 mt-2">
            Script package #{record.scriptPackageId}
            {record.audioJobId ? ` · Audio job #${record.audioJobId}` : ""}
            {record.generatedClipId ? ` · Video asset #${record.generatedClipId}` : " · No video asset"}
          </p>
          {record.errorMessage && (
            <div className="flex items-start gap-2 text-sm text-red-300 mt-3">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <span>{record.errorMessage}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onValidate(record.id)} disabled={actionLoading === `validate-${record.id}`} className="border-white/10 text-zinc-300">
            {actionLoading === `validate-${record.id}` ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Validate
          </Button>
          <Button onClick={() => onApprove(record.id)} disabled={!canApprove || actionLoading === `approve-${record.id}`} className="bg-emerald-600 hover:bg-emerald-700">
            {actionLoading === `approve-${record.id}` ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
            Approve
          </Button>
          <Button onClick={() => onUpload(record.id)} disabled={!canUpload || actionLoading === `upload-${record.id}`} className="bg-red-600 hover:bg-red-700">
            {actionLoading === `upload-${record.id}` ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
            Upload Private
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mt-6">
        <Card className="bg-white/[0.03] border-white/[0.06] p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">YouTube Metadata</p>
          <p className="text-sm font-medium text-zinc-100 mt-3">{record.packageMetadata.title}</p>
          <p className="text-sm text-zinc-400 mt-3 leading-6 line-clamp-6">{record.packageMetadata.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {record.packageMetadata.tags.slice(0, 10).map((tag) => (
              <Badge key={tag} className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">{tag}</Badge>
            ))}
          </div>
        </Card>
        <Card className="bg-white/[0.03] border-white/[0.06] p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Video Asset</p>
          <p className="text-sm font-medium text-zinc-100 mt-3">{record.packageMetadata.videoAsset.title || "No generated clip linked"}</p>
          <p className="text-sm text-zinc-500 mt-2">
            {record.packageMetadata.videoAsset.pathPresent ? "Stored video file present" : "Stored video file missing"}
          </p>
          <p className="text-sm text-zinc-500 mt-1">
            {record.packageMetadata.videoAsset.format || "unknown format"}
            {record.packageMetadata.videoAsset.durationSeconds ? ` · ${record.packageMetadata.videoAsset.durationSeconds}s` : ""}
          </p>
          {record.youtubeUrl && (
            <p className="text-sm text-cyan-300 mt-3 break-all">{record.youtubeUrl}</p>
          )}
        </Card>
        <Card className="bg-white/[0.03] border-white/[0.06] p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Safety State</p>
          <div className="mt-3 grid gap-2">
            <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">Manual root-admin approval</Badge>
            <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">Private YouTube visibility</Badge>
            <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">No social posting</Badge>
            <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">No autonomous workers</Badge>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mt-6">
        <ChecklistGroup title="Readiness" items={record.readinessChecklist} />
        <ChecklistGroup title="Compliance" items={record.complianceChecklist} />
        <ChecklistGroup title="Sources" items={record.sourceChecklist} />
      </div>
    </Card>
  );
}

export default function YouTubePublishing() {
  const [, navigate] = useLocation();
  const { admin, isLoading: authLoading, isAuthenticated } = useAdminAuth();
  const isRootAdmin = admin?.actor?.type === "root_admin" && admin.role === "super_admin";
  const [scriptPackageId, setScriptPackageId] = useState("");
  const [audioJobId, setAudioJobId] = useState("auto");
  const [generatedClipId, setGeneratedClipId] = useState("auto");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated && !isRootAdmin) {
      navigate("/staff/dashboard", { replace: true });
    }
  }, [authLoading, isAuthenticated, isRootAdmin, navigate]);

  const { data: eligible, isLoading: eligibleLoading, refetch: refetchEligible } = useQuery({
    queryKey: ["admin-youtube-publishing-eligible"],
    queryFn: () => api.admin.youtubeEligible(),
    enabled: isRootAdmin,
  });

  const { data: packages = [], isLoading: packagesLoading, refetch: refetchPackages } = useQuery({
    queryKey: ["admin-youtube-publishing-packages"],
    queryFn: () => api.admin.youtubePackages(),
    enabled: isRootAdmin,
  });

  const selectedItem = useMemo(
    () => eligible?.items.find((item) => String(item.scriptPackage.id) === scriptPackageId) || null,
    [eligible, scriptPackageId],
  );

  const refreshAll = () => {
    refetchEligible();
    refetchPackages();
  };

  const createMutation = useMutation({
    mutationFn: (payload: AdminYouTubeCreatePackagePayload) => api.admin.createYouTubePackage(payload),
    onSuccess: () => {
      setActionError(null);
      refreshAll();
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Unable to prepare YouTube package");
    },
  });

  const runAction = async (key: string, action: () => Promise<unknown>) => {
    setActionLoading(key);
    setActionError(null);
    try {
      await action();
      refreshAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "YouTube publishing action failed");
    } finally {
      setActionLoading(null);
    }
  };

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
                <Youtube className="w-8 h-8 text-red-300" />
                <h1 className="text-2xl font-bold">YouTube Publishing</h1>
                <Badge className="bg-yellow-500/15 text-yellow-300 border-yellow-500/20">Founder Only</Badge>
              </div>
              <p className="text-sm text-zinc-500 mt-2 max-w-3xl">
                Prepare manual/admin-approved YouTube package records from approved podcast scripts, voice jobs, and existing generated video assets.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/admin/podcast-scripts")} className="border-white/10 text-zinc-300">
                <Mic2 className="w-4 h-4 mr-2" /> Podcast Scripts
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/voice-jobs")} className="border-white/10 text-zinc-300">
                <Volume2 className="w-4 h-4 mr-2" /> Voice Jobs
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/video-render")} className="border-white/10 text-zinc-300">
                <Video className="w-4 h-4 mr-2" /> Video Render
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/social-distribution")} className="border-white/10 text-zinc-300">
                <Share2 className="w-4 h-4 mr-2" /> Social Distribution
              </Button>
              <Button variant="outline" onClick={refreshAll} disabled={eligibleLoading || packagesLoading} className="border-white/10 text-zinc-300">
                {(eligibleLoading || packagesLoading) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {eligible?.providerStatus && (
          <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Youtube className="w-5 h-5 text-red-300" />
                  <h2 className="text-lg font-semibold">Provider</h2>
                  <Badge className={statusBadgeClass(eligible.providerStatus.selected)}>{eligible.providerStatus.selected}</Badge>
                </div>
                <p className="text-sm text-zinc-500 mt-2">{eligible.providerStatus.message}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className={eligible.providerStatus.youtubeConfigured ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-zinc-500/10 text-zinc-300 border-zinc-500/20"}>
                  YouTube credentials {eligible.providerStatus.youtubeConfigured ? "configured" : "missing"}
                </Badge>
                <Badge className={eligible.providerStatus.channelConfigured ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-zinc-500/10 text-zinc-300 border-zinc-500/20"}>
                  Channel {eligible.providerStatus.channelConfigured ? "configured" : "optional"}
                </Badge>
                <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Dry-run available</Badge>
              </div>
            </div>
          </Card>
        )}

        <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Prepare YouTube Package</h2>
              <p className="text-sm text-zinc-500 mt-1">Packages are internal until a root admin validates, approves, and manually uploads.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">Manual/admin approval</Badge>
              <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">No autonomous upload</Badge>
              <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">No social posting</Badge>
              <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">Video render separate</Badge>
            </div>
          </div>

          <div className="grid xl:grid-cols-[1.4fr_.8fr_.8fr_auto] gap-4 mt-6">
            <div>
              <label className="text-xs uppercase tracking-wide text-zinc-500">Podcast Script Package</label>
              <Select value={scriptPackageId} onValueChange={(value) => {
                setScriptPackageId(value);
                setAudioJobId("auto");
                setGeneratedClipId("auto");
              }}>
                <SelectTrigger className="mt-2 bg-[#090912] border-white/10 text-zinc-100">
                  <SelectValue placeholder="Select a script package" />
                </SelectTrigger>
                <SelectContent>
                  {(eligible?.items || []).map((item) => (
                    <SelectItem key={item.scriptPackage.id} value={String(item.scriptPackage.id)}>
                      #{item.scriptPackage.id} · {item.scriptPackage.scriptPackage.youtubeTitle.slice(0, 80)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-zinc-500">Audio Job</label>
              <Select value={audioJobId} onValueChange={setAudioJobId} disabled={!selectedItem?.latestAudioJob}>
                <SelectTrigger className="mt-2 bg-[#090912] border-white/10 text-zinc-100">
                  <SelectValue placeholder="Auto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto latest</SelectItem>
                  {selectedItem?.latestAudioJob && (
                    <SelectItem value={String(selectedItem.latestAudioJob.id)}>
                      #{selectedItem.latestAudioJob.id} · {selectedItem.latestAudioJob.status}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-zinc-500">Video Asset</label>
              <Select value={generatedClipId} onValueChange={setGeneratedClipId} disabled={!selectedItem?.videoAssets.length}>
                <SelectTrigger className="mt-2 bg-[#090912] border-white/10 text-zinc-100">
                  <SelectValue placeholder="Auto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto latest</SelectItem>
                  {selectedItem?.videoAssets.map((asset) => (
                    <SelectItem key={asset.id} value={String(asset.id)}>
                      #{asset.id} · {asset.title.slice(0, 55)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                onClick={() => createMutation.mutate({
                  scriptPackageId: Number(scriptPackageId),
                  audioJobId: audioJobId === "auto" ? undefined : Number(audioJobId),
                  generatedClipId: generatedClipId === "auto" ? undefined : Number(generatedClipId),
                })}
                disabled={!scriptPackageId || createMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Youtube className="w-4 h-4 mr-2" />}
                Prepare
              </Button>
            </div>
          </div>

          {selectedItem && (
            <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="text-sm text-zinc-200">{selectedItem.scriptPackage.scriptPackage.youtubeTitle}</p>
              <p className="text-xs text-zinc-500 mt-1">
                Debate #{selectedItem.scriptPackage.debateId} · {selectedItem.videoAssets.length} video asset{selectedItem.videoAssets.length === 1 ? "" : "s"}
                {selectedItem.latestAudioJob ? ` · latest audio job #${selectedItem.latestAudioJob.id} (${selectedItem.latestAudioJob.status})` : " · no audio job"}
                {selectedItem.existingPackage ? ` · existing package #${selectedItem.existingPackage.id}` : ""}
              </p>
            </div>
          )}

          {(createMutation.isError || actionError) && (
            <div className="flex items-start gap-2 text-sm text-red-300 mt-4">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <span>{actionError || (createMutation.error instanceof Error ? createMutation.error.message : "Unable to prepare YouTube package")}</span>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Publishing Packages</h2>
            <p className="text-sm text-zinc-500">{packages.length} shown</p>
          </div>
          {packages.length > 0 ? (
            <div className="space-y-5">
              {packages.map((record) => (
                <PackageCard
                  key={record.id}
                  record={record}
                  youtubeConfigured={!!eligible?.providerStatus.youtubeConfigured}
                  actionLoading={actionLoading}
                  onValidate={(id) => runAction(`validate-${id}`, () => api.admin.validateYouTubePackage(id))}
                  onApprove={(id) => runAction(`approve-${id}`, () => api.admin.approveYouTubePackage(id))}
                  onUpload={(id) => runAction(`upload-${id}`, () => api.admin.uploadYouTubePackage(id))}
                />
              ))}
            </div>
          ) : (
            <Card className="bg-[#10101a]/90 border-white/[0.08] p-8 text-center">
              <p className="text-sm text-zinc-500">No YouTube publishing packages found yet.</p>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
