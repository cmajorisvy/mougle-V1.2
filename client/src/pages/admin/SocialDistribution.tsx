import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  api,
  type AdminSocialDistributionGate,
  type AdminSocialDistributionPackage,
  type AdminSocialDistributionProviderStatus,
} from "@/lib/api";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Download,
  Loader2,
  PauseCircle,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  Youtube,
} from "lucide-react";

const PLATFORMS = [
  { key: "twitter", label: "X / Twitter" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "facebook", label: "Facebook" },
  { key: "bluesky", label: "Bluesky" },
];

function statusBadgeClass(status: string) {
  if (["approved", "export_ready", "exported", "posted", "platform_api"].includes(status)) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (["blocked", "blocked_by_safety_gate", "failed"].includes(status)) return "bg-red-500/10 text-red-300 border-red-500/20";
  if (["ready_for_review", "ready_for_manual_distribution", "pending"].includes(status)) return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
  if (["manual", "safe_automation", "export_only"].includes(status)) return "bg-cyan-500/10 text-cyan-300 border-cyan-500/20";
  return "bg-zinc-500/10 text-zinc-300 border-zinc-500/20";
}

function GateList({ gates }: { gates: AdminSocialDistributionGate[] }) {
  return (
    <div className="grid gap-2">
      {gates.map((gate) => (
        <div key={gate.key} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
          <div className="flex items-start gap-3">
            {gate.passed ? <CheckCircle2 className="w-4 h-4 text-emerald-300 mt-0.5" /> : <AlertTriangle className={gate.severity === "blocking" ? "w-4 h-4 text-red-300 mt-0.5" : "w-4 h-4 text-yellow-300 mt-0.5"} />}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-zinc-100">{gate.label}</p>
                <Badge className={gate.severity === "blocking" ? "bg-red-500/10 text-red-300 border-red-500/20" : gate.severity === "warning" ? "bg-yellow-500/10 text-yellow-300 border-yellow-500/20" : "bg-zinc-500/10 text-zinc-300 border-zinc-500/20"}>
                  {gate.severity}
                </Badge>
              </div>
              <p className="text-xs text-zinc-500 mt-1">{gate.message}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProviderGrid({ providers }: { providers: AdminSocialDistributionProviderStatus[] }) {
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
      {providers.map((provider) => (
        <Card key={provider.platform} className="bg-white/[0.03] border-white/[0.06] p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-zinc-100 capitalize">{provider.platform}</p>
            <Badge className={statusBadgeClass(provider.provider)}>{provider.provider}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge className={provider.configured ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-zinc-500/10 text-zinc-300 border-zinc-500/20"}>
              {provider.configured ? "Credentials set" : "Dry run"}
            </Badge>
            <Badge className={provider.enabledForAutomation ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/20" : "bg-zinc-500/10 text-zinc-300 border-zinc-500/20"}>
              {provider.enabledForAutomation ? "Automation on" : "Automation off"}
            </Badge>
          </div>
          <p className="text-xs text-zinc-500 mt-3 leading-5">{provider.message}</p>
        </Card>
      ))}
    </div>
  );
}

function PackageCard({
  record,
  actionLoading,
  onApprove,
  onExport,
  onPost,
}: {
  record: AdminSocialDistributionPackage;
  actionLoading: string | null;
  onApprove: (id: number) => void;
  onExport: (id: number) => void;
  onPost: (id: number) => void;
}) {
  const blocking = record.safetyGateResults.filter((gate) => gate.severity === "blocking" && !gate.passed);
  const canApprove = blocking.length === 0 && record.approvalStatus !== "approved";
  const canDistribute = record.approvalStatus === "approved" && blocking.length === 0;

  return (
    <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Share2 className="w-5 h-5 text-cyan-300" />
            <h2 className="text-lg font-semibold">Social Package #{record.id}</h2>
            <Badge className={statusBadgeClass(record.mode)}>{record.mode}</Badge>
            <Badge className={statusBadgeClass(record.status)}>{record.status}</Badge>
            <Badge className={statusBadgeClass(record.approvalStatus)}>{record.approvalStatus}</Badge>
            <Badge className={statusBadgeClass(record.exportStatus)}>{record.exportStatus}</Badge>
          </div>
          <p className="text-sm text-zinc-500 mt-2">
            YouTube package #{record.youtubePackageId || "none"} · Script package #{record.scriptPackageId || "none"} · {record.targetPlatforms.join(", ")}
          </p>
          {record.errorMessage && (
            <div className="flex items-start gap-2 text-sm text-red-300 mt-3">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <span>{record.errorMessage}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onApprove(record.id)} disabled={!canApprove || actionLoading === `approve-${record.id}`} className="bg-emerald-600 hover:bg-emerald-700">
            {actionLoading === `approve-${record.id}` ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
            Approve
          </Button>
          <Button variant="outline" onClick={() => onExport(record.id)} disabled={!canDistribute || actionLoading === `export-${record.id}`} className="border-white/10 text-zinc-300">
            {actionLoading === `export-${record.id}` ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Export
          </Button>
          <Button onClick={() => onPost(record.id)} disabled={!canDistribute || actionLoading === `post-${record.id}`} className="bg-cyan-600 hover:bg-cyan-700">
            {actionLoading === `post-${record.id}` ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Post / Export
          </Button>
        </div>
      </div>

      <div className="grid xl:grid-cols-[1.1fr_.9fr] gap-5 mt-6">
        <Card className="bg-white/[0.03] border-white/[0.06] p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Generated Copy</p>
          <p className="text-sm font-medium text-zinc-100 mt-3">{record.generatedCopy.sourceTitle}</p>
          <div className="mt-4 grid gap-3">
            {record.generatedCopy.posts.map((post) => (
              <div key={post.platform} className="rounded-lg border border-white/[0.06] bg-[#080811] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium capitalize text-zinc-100">{post.platform}</p>
                  <Badge className={post.dryRunOnly ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/20" : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"}>
                    {post.dryRunOnly ? "Dry Run" : "Credential Ready"}
                  </Badge>
                </div>
                <p className="text-sm text-zinc-300 whitespace-pre-wrap mt-3 leading-6">{post.text}</p>
                <p className="text-xs text-zinc-500 mt-2">{post.characterCount} chars {post.exportUrl ? "· export URL ready" : ""}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="bg-white/[0.03] border-white/[0.06] p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Platform Results</p>
            <div className="mt-3 grid gap-2">
              {record.platformResults.length > 0 ? record.platformResults.map((result) => (
                <div key={`${result.platform}-${result.status}`} className="rounded-lg border border-white/[0.06] bg-[#080811] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium capitalize text-zinc-100">{result.platform}</p>
                    <Badge className={statusBadgeClass(result.status)}>{result.status}</Badge>
                    <Badge className={statusBadgeClass(result.provider)}>{result.provider}</Badge>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">{result.message}</p>
                </div>
              )) : <p className="text-sm text-zinc-500">No export or posting attempt yet.</p>}
            </div>
          </Card>
          <Card className="bg-white/[0.03] border-white/[0.06] p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">Safety Gates</p>
            <GateList gates={record.safetyGateResults} />
          </Card>
        </div>
      </div>
    </Card>
  );
}

export default function SocialDistribution() {
  const [, navigate] = useLocation();
  const { admin, isLoading: authLoading, isAuthenticated } = useAdminAuth();
  const isRootAdmin = admin?.actor?.type === "root_admin" && admin.role === "super_admin";
  const [youtubePackageId, setYoutubePackageId] = useState("");
  const [mode, setMode] = useState<"manual" | "safe_automation">("manual");
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>(["twitter", "linkedin"]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated && !isRootAdmin) {
      navigate("/staff/dashboard", { replace: true });
    }
  }, [authLoading, isAuthenticated, isRootAdmin, navigate]);

  const { data: eligible, isLoading: eligibleLoading, refetch: refetchEligible } = useQuery({
    queryKey: ["admin-social-distribution-eligible"],
    queryFn: () => api.admin.socialDistributionEligible(),
    enabled: isRootAdmin,
  });

  const { data: packages = [], isLoading: packagesLoading, refetch: refetchPackages } = useQuery({
    queryKey: ["admin-social-distribution-packages"],
    queryFn: () => api.admin.socialDistributionPackages(),
    enabled: isRootAdmin,
  });

  const { data: automation, refetch: refetchAutomation } = useQuery({
    queryKey: ["admin-social-distribution-automation-settings"],
    queryFn: () => api.admin.socialDistributionAutomationSettings(),
    enabled: isRootAdmin,
  });

  const selectedItem = useMemo(
    () => eligible?.items.find((item) => String(item.youtubePackage.id) === youtubePackageId) || null,
    [eligible, youtubePackageId],
  );

  const refreshAll = () => {
    refetchEligible();
    refetchPackages();
    refetchAutomation();
  };

  const createMutation = useMutation({
    mutationFn: () => api.admin.generateSocialDistributionPackage({
      youtubePackageId: Number(youtubePackageId),
      targetPlatforms,
      mode,
    }),
    onSuccess: () => {
      setActionError(null);
      refreshAll();
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Unable to generate social distribution package"),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (data: any) => api.admin.updateSocialDistributionAutomationSettings(data),
    onSuccess: refreshAll,
    onError: (error) => setActionError(error instanceof Error ? error.message : "Unable to update automation settings"),
  });

  const runAutomationMutation = useMutation({
    mutationFn: () => api.admin.runSocialDistributionAutomationEvaluation(),
    onSuccess: refreshAll,
    onError: (error) => setActionError(error instanceof Error ? error.message : "Unable to run safe automation evaluation"),
  });

  const runAction = async (key: string, action: () => Promise<unknown>) => {
    setActionLoading(key);
    setActionError(null);
    try {
      await action();
      refreshAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Social distribution action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const settings = automation?.settings;
  const providerStatus = automation?.providerStatus || eligible?.providerStatus || [];

  const setPlatformTarget = (platform: string, checked: boolean) => {
    setTargetPlatforms((current) => checked ? Array.from(new Set([...current, platform])) : current.filter((item) => item !== platform));
  };

  const updatePlatformSetting = (platform: string, enabled: boolean) => {
    if (!settings) return;
    updateSettingsMutation.mutate({
      perPlatformEnabled: {
        ...(settings.perPlatformEnabled || {}),
        [platform]: { ...(settings.perPlatformEnabled?.[platform] || {}), enabled },
      },
    });
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
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Share2 className="w-8 h-8 text-cyan-300" />
                <h1 className="text-2xl font-bold">Social Distribution</h1>
                <Badge className="bg-yellow-500/15 text-yellow-300 border-yellow-500/20">Founder Only</Badge>
              </div>
              <p className="text-sm text-zinc-500 mt-2 max-w-3xl">
                Prepare admin-approval-gated social packages from YouTube, podcast, audio, and news-debate outputs. Automation remains paused/manual-evaluation only unless explicitly approved.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/admin/youtube-publishing")} className="border-white/10 text-zinc-300">
                <Youtube className="w-4 h-4 mr-2" /> YouTube
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/social-hub")} className="border-white/10 text-zinc-300">
                <ClipboardList className="w-4 h-4 mr-2" /> Legacy Hub
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
        <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <PauseCircle className="w-5 h-5 text-cyan-300" />
                <h2 className="text-lg font-semibold">Safe Automation Controls</h2>
                <Badge className={settings?.safeAutomationEnabled ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-zinc-500/10 text-zinc-300 border-zinc-500/20"}>
                  {settings?.safeAutomationEnabled ? "Enabled" : "Disabled"}
                </Badge>
                <Badge className={settings?.paused ? "bg-yellow-500/10 text-yellow-300 border-yellow-500/20" : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"}>
                  {settings?.paused ? "Paused" : "Unpaused"}
                </Badge>
                <Badge className={settings?.killSwitch ? "bg-red-500/10 text-red-300 border-red-500/20" : "bg-zinc-500/10 text-zinc-300 border-zinc-500/20"}>
                  {settings?.killSwitch ? "Kill active" : "Kill off"}
                </Badge>
              </div>
              <p className="text-sm text-zinc-500 mt-2">
                Automation is disabled and paused by default. This phase supports manual run-once evaluation and admin approval, not an always-on publishing worker.
              </p>
            </div>
            <Button
              onClick={() => runAutomationMutation.mutate()}
              disabled={runAutomationMutation.isPending}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              {runAutomationMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
              Run Safe Evaluation
            </Button>
          </div>

          {settings && (
            <div className="grid lg:grid-cols-3 gap-5 mt-6">
              <Card className="bg-white/[0.03] border-white/[0.06] p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">Safe automation</p>
                    <p className="text-xs text-zinc-500">Global enable switch</p>
                  </div>
                  <Switch checked={settings.safeAutomationEnabled} onCheckedChange={(value) => updateSettingsMutation.mutate({ safeAutomationEnabled: value })} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">Pause</p>
                    <p className="text-xs text-zinc-500">Stops automation evaluation</p>
                  </div>
                  <Switch checked={settings.paused} onCheckedChange={(value) => updateSettingsMutation.mutate({ paused: value })} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">Kill switch</p>
                    <p className="text-xs text-zinc-500">Hard stop for social automation</p>
                  </div>
                  <Switch checked={settings.killSwitch} onCheckedChange={(value) => updateSettingsMutation.mutate({ killSwitch: value })} />
                </div>
              </Card>

              <Card className="bg-white/[0.03] border-white/[0.06] p-4">
                <p className="text-sm font-medium text-zinc-100">Limits and thresholds</p>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div>
                    <label className="text-xs text-zinc-500">Daily limit</label>
                    <Input type="number" min={0} max={50} value={settings.dailyPostLimit} onChange={(event) => updateSettingsMutation.mutate({ dailyPostLimit: Number(event.target.value) })} className="mt-1 bg-[#090912] border-white/10" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">Duplicate hours</label>
                    <Input type="number" min={1} max={720} value={settings.duplicateWindowHours} onChange={(event) => updateSettingsMutation.mutate({ duplicateWindowHours: Number(event.target.value) })} className="mt-1 bg-[#090912] border-white/10" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">Trust threshold</label>
                    <Input type="number" min={0} max={1} step={0.05} value={settings.trustThreshold} onChange={(event) => updateSettingsMutation.mutate({ trustThreshold: Number(event.target.value) })} className="mt-1 bg-[#090912] border-white/10" />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500">UES threshold</label>
                    <Input type="number" min={0} max={1} step={0.05} value={settings.uesThreshold} onChange={(event) => updateSettingsMutation.mutate({ uesThreshold: Number(event.target.value) })} className="mt-1 bg-[#090912] border-white/10" />
                  </div>
                </div>
              </Card>

              <Card className="bg-white/[0.03] border-white/[0.06] p-4">
                <p className="text-sm font-medium text-zinc-100">Platform automation</p>
                <div className="mt-4 grid gap-3">
                  {PLATFORMS.map((platform) => (
                    <div key={platform.key} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-zinc-200">{platform.label}</p>
                        <p className="text-xs text-zinc-500">Safe automation channel</p>
                      </div>
                      <Switch
                        checked={!!settings.perPlatformEnabled?.[platform.key]?.enabled}
                        onCheckedChange={(value) => updatePlatformSetting(platform.key, value)}
                      />
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {providerStatus.length > 0 && <div className="mt-6"><ProviderGrid providers={providerStatus} /></div>}
        </Card>

        <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Generate Distribution Package</h2>
              <p className="text-sm text-zinc-500 mt-1">Packages are generated from approved media publishing materials and stay internal until root admin approval.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">Manual Mode</Badge>
              <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Safe Automation Mode</Badge>
              <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">Dry Run / Export</Badge>
            </div>
          </div>

          <div className="grid xl:grid-cols-[1.4fr_.7fr_.9fr_auto] gap-4 mt-6">
            <div>
              <label className="text-xs uppercase tracking-wide text-zinc-500">YouTube Publishing Package</label>
              <Select value={youtubePackageId} onValueChange={setYoutubePackageId}>
                <SelectTrigger className="mt-2 bg-[#090912] border-white/10 text-zinc-100">
                  <SelectValue placeholder="Select a source package" />
                </SelectTrigger>
                <SelectContent>
                  {(eligible?.items || []).map((item) => (
                    <SelectItem key={item.youtubePackage.id} value={String(item.youtubePackage.id)}>
                      #{item.youtubePackage.id} · {item.youtubePackage.packageMetadata.title.slice(0, 80)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-zinc-500">Mode</label>
              <Select value={mode} onValueChange={(value) => setMode(value as "manual" | "safe_automation")}>
                <SelectTrigger className="mt-2 bg-[#090912] border-white/10 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="safe_automation">Safe automation</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-zinc-500">Target Platforms</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {PLATFORMS.map((platform) => (
                  <label key={platform.key} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-zinc-200">
                    <Checkbox checked={targetPlatforms.includes(platform.key)} onCheckedChange={(value) => setPlatformTarget(platform.key, value === true)} />
                    {platform.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-end">
              <Button onClick={() => createMutation.mutate()} disabled={!youtubePackageId || targetPlatforms.length === 0 || createMutation.isPending} className="bg-cyan-600 hover:bg-cyan-700">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Share2 className="w-4 h-4 mr-2" />}
                Generate
              </Button>
            </div>
          </div>

          {selectedItem && (
            <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
              <p className="text-sm text-zinc-200">{selectedItem.youtubePackage.packageMetadata.title}</p>
              <p className="text-xs text-zinc-500 mt-1">
                Approval {selectedItem.youtubePackage.approvalStatus} · Upload {selectedItem.youtubePackage.uploadStatus}
                {selectedItem.existingDistributionPackage ? ` · latest social package #${selectedItem.existingDistributionPackage.id}` : ""}
              </p>
            </div>
          )}

          {(createMutation.isError || actionError || runAutomationMutation.isError || updateSettingsMutation.isError) && (
            <div className="flex items-start gap-2 text-sm text-red-300 mt-4">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <span>{actionError || (createMutation.error instanceof Error ? createMutation.error.message : "Social distribution action failed")}</span>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Distribution Packages</h2>
            <p className="text-sm text-zinc-500">{packages.length} shown</p>
          </div>
          {packages.length > 0 ? (
            <div className="space-y-5">
              {packages.map((record) => (
                <PackageCard
                  key={record.id}
                  record={record}
                  actionLoading={actionLoading}
                  onApprove={(id) => runAction(`approve-${id}`, () => api.admin.approveSocialDistributionPackage(id))}
                  onExport={(id) => runAction(`export-${id}`, () => api.admin.exportSocialDistributionPackage(id))}
                  onPost={(id) => runAction(`post-${id}`, () => api.admin.postSocialDistributionPackage(id))}
                />
              ))}
            </div>
          ) : (
            <Card className="bg-[#10101a]/90 border-white/[0.08] p-8 text-center">
              <p className="text-sm text-zinc-500">No social distribution packages found yet.</p>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
