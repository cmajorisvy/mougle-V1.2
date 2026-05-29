import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type AdminSafeModeControlField, type AdminSafeModeControls } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Loader2,
  Megaphone,
  PauseCircle,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

const controlRows: Array<{
  field: AdminSafeModeControlField;
  label: string;
  description: string;
  level: "state" | "pause";
}> = [
  {
    field: "globalSafeMode",
    label: "Global safe mode",
    description: "Visible platform state and future policy input. It does not block all manual admin work in this phase.",
    level: "state",
  },
  {
    field: "pauseAutonomousPublishing",
    label: "Pause autonomous publishing",
    description: "Blocks safe social automation evaluation alongside the social distribution pause flag.",
    level: "pause",
  },
  {
    field: "pauseMarketplaceApprovals",
    label: "Pause marketplace approvals",
    description: "Blocks root-admin marketplace safe-clone approval while review and read-only views keep working.",
    level: "pause",
  },
  {
    field: "pauseExternalAgentActions",
    label: "Pause external agent actions",
    description: "Reserved for future non-simulated external agent execution. Behavior simulation remains available.",
    level: "pause",
  },
  {
    field: "pauseSocialDistributionAutomation",
    label: "Pause social distribution automation",
    description: "Blocks the run-once safe automation evaluation without blocking manual package review/export.",
    level: "pause",
  },
  {
    field: "pauseYouTubeUploads",
    label: "Pause YouTube uploads",
    description: "Blocks only the manual YouTube upload endpoint. Package creation, validation, and approval stay available.",
    level: "pause",
  },
  {
    field: "pausePodcastAudioGeneration",
    label: "Pause podcast/audio generation",
    description: "Blocks new voice job generation. Existing script package review and audio playback stay available.",
    level: "pause",
  },
];

function badgeClass(active: boolean) {
  return active
    ? "bg-red-500/10 text-red-300 border-red-500/20"
    : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

function getInitialDraft(controls?: AdminSafeModeControls) {
  return {
    globalSafeMode: controls?.globalSafeMode ?? false,
    pauseAutonomousPublishing: controls?.pauseAutonomousPublishing ?? false,
    pauseMarketplaceApprovals: controls?.pauseMarketplaceApprovals ?? false,
    pauseExternalAgentActions: controls?.pauseExternalAgentActions ?? false,
    pauseSocialDistributionAutomation: controls?.pauseSocialDistributionAutomation ?? false,
    pauseYouTubeUploads: controls?.pauseYouTubeUploads ?? false,
    pausePodcastAudioGeneration: controls?.pausePodcastAudioGeneration ?? false,
    maintenanceBannerEnabled: controls?.maintenanceBannerEnabled ?? false,
  };
}

type SafeModeDraft = ReturnType<typeof getInitialDraft>;

export default function SafeMode() {
  const [, navigate] = useLocation();
  const { admin, isLoading: authLoading, isAuthenticated } = useAdminAuth();
  const isRootAdmin = admin?.actor?.type === "root_admin" && admin.role === "super_admin";
  const { toast } = useToast();
  const [draft, setDraft] = useState<SafeModeDraft>(getInitialDraft());
  const [maintenanceBannerMessage, setMaintenanceBannerMessage] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/admin/login", { replace: true });
      return;
    }
    if (!authLoading && isAuthenticated && !isRootAdmin) {
      navigate("/staff/dashboard", { replace: true });
    }
  }, [authLoading, isAuthenticated, isRootAdmin, navigate]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-safe-mode"],
    queryFn: () => api.admin.safeMode(),
    enabled: isRootAdmin,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (data?.controls) {
      setDraft(getInitialDraft(data.controls));
      setMaintenanceBannerMessage(data.controls.maintenanceBannerMessage || "");
    }
  }, [data]);

  const changedFields = useMemo(() => {
    if (!data?.controls) return [];
    return controlRows
      .map((row) => row.field)
      .filter((field) => data.controls[field] !== draft[field]);
  }, [data, draft]);

  const bannerChanged = (data?.controls?.maintenanceBannerMessage || "") !== maintenanceBannerMessage.trim();
  const hasChanges = changedFields.length > 0 || bannerChanged;

  const updateMutation = useMutation({
    mutationFn: () => api.admin.updateSafeMode({
      ...draft,
      maintenanceBannerMessage: maintenanceBannerMessage.trim() || null,
      reason: reason.trim(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-safe-mode"] });
      toast({ title: "Safe-mode controls updated" });
      setReason("");
    },
    onError: (err: Error) => {
      toast({ title: "Safe-mode update failed", description: err.message, variant: "destructive" });
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
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <ShieldAlert className="w-8 h-8 text-yellow-300" />
                <h1 className="text-2xl font-bold">Safe-Mode Controls</h1>
                <Badge className="bg-yellow-500/15 text-yellow-300 border-yellow-500/20">Founder Only</Badge>
                <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Manual Actions Only</Badge>
              </div>
              <p className="text-sm text-zinc-500 mt-2 max-w-3xl">
                Manual root-admin controls for pausing specific automation and publishing flows while keeping review dashboards and package preparation available.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/admin/digital-world")} className="border-white/10 text-zinc-300">
                Digital World
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/civilization-health")} className="border-white/10 text-zinc-300">
                Civilization Health
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/live-studio")} className="border-white/10 text-zinc-300">
                <Radio className="w-4 h-4 mr-2" />
                Live Studio
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/external-agents")} className="border-white/10 text-zinc-300">
                <Bot className="w-4 h-4 mr-2" />
                External Agents
              </Button>
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="border-white/10 text-zinc-300">
                {isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <Card className="bg-red-500/10 border-red-500/20 p-4 text-red-200">
            {(error as Error).message || "Unable to load safe-mode controls."}
          </Card>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-20 text-zinc-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading safe-mode controls...
          </div>
        )}

        {data && (
          <>
            <div className="grid lg:grid-cols-3 gap-4">
              <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-zinc-500">Global Safe Mode</p>
                    <p className="text-2xl font-semibold mt-1">{data.controls.globalSafeMode ? "On" : "Off"}</p>
                  </div>
                  <Badge className={badgeClass(data.controls.globalSafeMode)}>
                    {data.controls.globalSafeMode ? "visible state on" : "normal state"}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500 mt-4 leading-5">
                  Global safe mode is informational in Phase 21. Matching pause flags below control specific endpoints.
                </p>
              </Card>

              <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-zinc-500">Legacy Command Center</p>
                    <p className="text-2xl font-semibold mt-1">
                      {data.relatedControls.automationPolicy?.safeMode ? "Safe" : "Normal"}
                    </p>
                  </div>
                  <Badge className={badgeClass(!!data.relatedControls.automationPolicy?.safeMode)}>
                    {data.relatedControls.automationPolicy?.mode || "unknown"}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500 mt-4 leading-5">
                  Older automation policy state is shown for context and remains separate from Phase 21 pause flags.
                </p>
              </Card>

              <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-zinc-500">Founder Emergency Stop</p>
                    <p className="text-2xl font-semibold mt-1">
                      {data.relatedControls.founderEmergencyStopped ? "Active" : "Inactive"}
                    </p>
                  </div>
                  <Badge className={badgeClass(data.relatedControls.founderEmergencyStopped)}>
                    {data.relatedControls.founderEmergencyStopped ? "stop active" : "clear"}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500 mt-4 leading-5">
                  The emergency stop remains the broad Founder Control kill switch. This page adds targeted pause controls.
                </p>
              </Card>
            </div>

            <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <PauseCircle className="w-5 h-5 text-yellow-300" />
                    <h2 className="text-lg font-semibold">Manual Pause Controls</h2>
                  </div>
                  <p className="text-sm text-zinc-500 mt-1">
                    Every change requires a reason and is audit logged with previous/new values.
                  </p>
                </div>
                <div className="text-xs text-zinc-500 lg:text-right">
                  <p>Updated by {data.controls.updatedBy || "system"}</p>
                  <p>{formatDate(data.controls.updatedAt)}</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3 mt-5">
                {controlRows.map((row) => (
                  <div key={row.field} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-zinc-100">{row.label}</p>
                          <Badge className={row.level === "pause" ? "bg-yellow-500/10 text-yellow-300 border-yellow-500/20" : "bg-cyan-500/10 text-cyan-300 border-cyan-500/20"}>
                            {row.level}
                          </Badge>
                        </div>
                        <p className="text-xs text-zinc-500 leading-5 mt-1">{row.description}</p>
                      </div>
                      <Switch
                        checked={draft[row.field]}
                        onCheckedChange={(checked) => setDraft((current) => ({ ...current, [row.field]: checked }))}
                        aria-label={row.label}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid lg:grid-cols-2 gap-4 mt-5">
                <div className="space-y-2">
                  <Label htmlFor="maintenance-banner" className="text-zinc-300">Maintenance banner message</Label>
                  <Textarea
                    id="maintenance-banner"
                    value={maintenanceBannerMessage}
                    onChange={(event) => setMaintenanceBannerMessage(event.target.value)}
                    placeholder="Optional platform status message for future banner use."
                    className="min-h-24 bg-[#0c0c16] border-white/[0.08] text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="safe-mode-reason" className="text-zinc-300">Required reason/comment</Label>
                  <Textarea
                    id="safe-mode-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Describe why this safe-mode state is changing."
                    className="min-h-24 bg-[#0c0c16] border-white/[0.08] text-white"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mt-5">
                <p className="text-xs text-zinc-500">
                  {hasChanges ? `${changedFields.length + (bannerChanged ? 1 : 0)} pending change(s)` : `Last reason: ${data.controls.lastReason}`}
                </p>
                <Button
                  onClick={() => updateMutation.mutate()}
                  disabled={!hasChanges || !reason.trim() || updateMutation.isPending}
                  className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-100 border border-yellow-500/20"
                >
                  {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                  Apply Safe-Mode Changes
                </Button>
              </div>
            </Card>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldCheck className="w-5 h-5 text-emerald-300" />
                  <h2 className="text-lg font-semibold">Endpoint Gate Status</h2>
                </div>
                <div className="space-y-2">
                  {data.blockedCapabilities.map((capability) => (
                    <div key={capability.capability} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                      <div className="flex items-start gap-3">
                        {capability.blocked ? (
                          <AlertTriangle className="w-4 h-4 text-red-300 mt-0.5" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-300 mt-0.5" />
                        )}
                        <div>
                          <p className="text-sm text-zinc-100">{capability.capability.replace(/_/g, " ")}</p>
                          <p className="text-xs text-zinc-500 mt-1">
                            {capability.blocked ? capability.reasons.join(" ") : "Allowed by Phase 21 safe-mode pause flags."}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Megaphone className="w-5 h-5 text-cyan-300" />
                  <h2 className="text-lg font-semibold">Related Control Context</h2>
                </div>
                <div className="space-y-3">
                  {data.knownConflicts.map((conflict) => (
                    <div key={conflict.key} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-zinc-100">{conflict.key.replace(/_/g, " ")}</p>
                        <Badge className={badgeClass(conflict.status === "active")}>{conflict.status}</Badge>
                      </div>
                      <p className="text-xs text-zinc-500 mt-2 leading-5">{conflict.description}</p>
                    </div>
                  ))}
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                    <p className="text-sm font-medium text-zinc-100">Social automation settings</p>
                    <p className="text-xs text-zinc-500 mt-2 leading-5">
                      {data.relatedControls.socialAutomationSettings
                        ? `Safe automation ${data.relatedControls.socialAutomationSettings.safeAutomationEnabled ? "enabled" : "disabled"}, paused ${data.relatedControls.socialAutomationSettings.paused ? "yes" : "no"}, kill switch ${data.relatedControls.socialAutomationSettings.killSwitch ? "on" : "off"}.`
                        : "No social automation settings row exists yet."}
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
