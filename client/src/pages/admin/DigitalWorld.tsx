import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api, type AdminDigitalWorldOverview } from "@/lib/api";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  CircleDot,
  Gavel,
  Globe2,
  HeartPulse,
  Loader2,
  Megaphone,
  PauseCircle,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Store,
  Video,
} from "lucide-react";

type Zone = AdminDigitalWorldOverview["zones"][number];
type ZoneStatus = Zone["status"];
type MetricTone = Zone["counts"][number]["tone"];

const zoneIcons: Record<string, any> = {
  research_lab: BrainCircuit,
  debate_arena: Radio,
  podcast_studio: Video,
  market_zone: Store,
  governance_hall: Gavel,
  social_hub: Megaphone,
  founder_command_center: HeartPulse,
};

function statusClass(status: ZoneStatus | string) {
  if (status === "healthy") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (status === "paused") return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
  if (status === "watch") return "bg-cyan-500/10 text-cyan-300 border-cyan-500/20";
  if (status === "risk") return "bg-red-500/10 text-red-300 border-red-500/20";
  return "bg-zinc-500/10 text-zinc-300 border-zinc-500/20";
}

function metricClass(tone: MetricTone) {
  if (tone === "success") return "text-emerald-300";
  if (tone === "warning") return "text-yellow-300";
  if (tone === "danger") return "text-red-300";
  if (tone === "muted") return "text-zinc-400";
  return "text-cyan-300";
}

function flagClass(flag: Zone["safetyFlags"][number]) {
  if (!flag.active) return "bg-white/[0.03] text-zinc-500 border-white/[0.06]";
  if (flag.severity === "blocking") return "bg-red-500/10 text-red-200 border-red-500/20";
  if (flag.severity === "warning") return "bg-yellow-500/10 text-yellow-200 border-yellow-500/20";
  return "bg-cyan-500/10 text-cyan-200 border-cyan-500/20";
}

function SafeModeFlagRow({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
      <span className="text-xs text-zinc-400">{label}</span>
      <Badge className={active ? "bg-yellow-500/10 text-yellow-300 border-yellow-500/20" : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"}>
        {active ? "Active" : "Off"}
      </Badge>
    </div>
  );
}

function ZoneCard({ zone, onNavigate }: { zone: Zone; onNavigate: (href: string) => void }) {
  const Icon = zoneIcons[zone.id] || CircleDot;
  const activeFlags = zone.safetyFlags.filter((flag) => flag.active);

  return (
    <Card className="relative overflow-hidden border-white/[0.08] bg-[#10101a]/90 p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent" />
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
            <Icon className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">{zone.title}</h2>
              <Badge className={statusClass(zone.status)}>{zone.status}</Badge>
            </div>
            <p className="mt-1 text-sm leading-5 text-zinc-500">{zone.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {zone.counts.slice(0, 6).map((count) => (
          <div key={`${zone.id}-${count.key}`} className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
            <p className="text-[11px] text-zinc-500">{count.label}</p>
            <p className={`mt-1 text-lg font-semibold ${metricClass(count.tone)}`}>{count.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
          <p className="text-xs text-zinc-500">Health</p>
          <p className="mt-1 text-sm text-zinc-200">{zone.healthLabel}</p>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
          <p className="text-xs text-zinc-500">Risk</p>
          <p className="mt-1 text-sm text-zinc-200">{zone.riskLabel}</p>
        </div>
        <p className="text-xs leading-5 text-zinc-500">{zone.recentActivitySummary}</p>
      </div>

      {zone.safetyFlags.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {(activeFlags.length > 0 ? activeFlags : zone.safetyFlags.slice(0, 2)).map((flag) => (
            <Badge key={`${zone.id}-${flag.key}`} className={flagClass(flag)} title={flag.description}>
              {flag.label}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {zone.links.map((link) => (
          <Button
            key={`${zone.id}-${link.href}`}
            size="sm"
            variant={link.kind === "primary" ? "default" : "outline"}
            className={link.kind === "primary" ? "bg-cyan-600 hover:bg-cyan-700 text-white" : "border-white/10 text-zinc-300"}
            onClick={() => onNavigate(link.href)}
          >
            {link.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}

function WorldMap({ data, onNavigate }: { data: AdminDigitalWorldOverview; onNavigate: (href: string) => void }) {
  const founder = data.zones.find((zone) => zone.id === "founder_command_center");
  const zones = data.zones.filter((zone) => zone.id !== "founder_command_center");

  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-1/2 top-8 hidden h-[calc(100%-4rem)] w-px -translate-x-1/2 bg-gradient-to-b from-cyan-400/30 via-white/10 to-violet-400/20 xl:block" />
      {founder && (
        <div className="relative z-10 mx-auto mb-5 max-w-4xl">
          <ZoneCard zone={founder} onNavigate={onNavigate} />
        </div>
      )}
      <div className="relative z-10 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {zones.map((zone) => (
          <ZoneCard key={zone.id} zone={zone} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

export default function DigitalWorld() {
  const [, navigate] = useLocation();
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

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-digital-world-overview"],
    queryFn: () => api.admin.digitalWorldOverview(),
    enabled: isRootAdmin,
    refetchInterval: 60000,
  });

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060611] text-zinc-400">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading...
      </div>
    );
  }

  if (!isAuthenticated || !isRootAdmin) return null;

  return (
    <div className="min-h-screen bg-[#070711] text-white">
      <div className="border-b border-white/[0.08] bg-[#0d0d18] px-6 py-6">
        <div className="mx-auto max-w-7xl">
          <button onClick={() => navigate("/admin/dashboard")} className="mb-4 flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Admin Dashboard
          </button>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Globe2 className="h-8 w-8 text-cyan-300" />
                <h1 className="text-2xl font-bold">Selective Digital World</h1>
                <Badge className="border-yellow-500/20 bg-yellow-500/15 text-yellow-300">Founder Only</Badge>
                <Badge className="border-cyan-500/20 bg-cyan-500/10 text-cyan-300">Admin visualization only</Badge>
                <Badge className="border-violet-500/20 bg-violet-500/10 text-violet-300">2D Dashboard</Badge>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
                A read-only map of Mougle zones, safety state, media pipelines, marketplace review, external-agent posture, and civilization health.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => navigate("/admin/civilization-health")} className="border-white/10 text-zinc-300">
                Civilization Health
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/safe-mode")} className="border-white/10 text-zinc-300">
                Safe Mode
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/live-studio")} className="border-white/10 text-zinc-300">
                Live Studio
              </Button>
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="border-white/10 text-zinc-300">
                {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {error && (
          <Card className="border-red-500/20 bg-red-500/10 p-4 text-red-200">
            {(error as Error).message || "Unable to load digital world overview."}
          </Card>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-20 text-zinc-400">
            <Loader2 className="mr-3 h-8 w-8 animate-spin" /> Loading digital world...
          </div>
        )}

        {data && (
          <>
            <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.10] to-violet-500/[0.06] p-5">
              <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={statusClass(data.civilization.collapseRiskLevel === "low" ? "healthy" : data.civilization.collapseRiskLevel === "medium" ? "watch" : "risk")}>
                      Collapse risk: {data.civilization.collapseRiskLevel}
                    </Badge>
                    <Badge className={data.civilization.founderReviewNeeded ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"}>
                      {data.civilization.founderReviewNeeded ? "Founder review needed" : "Monitor"}
                    </Badge>
                    <Badge className="border-white/[0.08] bg-white/[0.05] text-zinc-300">No mutations</Badge>
                    <Badge className="border-white/[0.08] bg-white/[0.05] text-zinc-300">No simulation engine</Badge>
                  </div>
                  <p className="mt-4 text-sm text-zinc-500">Civilization Health</p>
                  <p className="mt-1 text-5xl font-bold text-white">{data.civilization.displayScore}</p>
                  <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-400">{data.model.description}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <SafeModeFlagRow label="Global safe mode" active={data.safeMode.flags.globalSafeMode} />
                  <SafeModeFlagRow label="External agent pause" active={data.safeMode.flags.pauseExternalAgentActions} />
                  <SafeModeFlagRow label="Social automation pause" active={data.safeMode.flags.pauseSocialDistributionAutomation} />
                  <SafeModeFlagRow label="YouTube upload pause" active={data.safeMode.flags.pauseYouTubeUploads} />
                  <SafeModeFlagRow label="Podcast/audio pause" active={data.safeMode.flags.pausePodcastAudioGeneration} />
                  <SafeModeFlagRow label="Marketplace approval pause" active={data.safeMode.flags.pauseMarketplaceApprovals} />
                  <SafeModeFlagRow label="Autonomous publishing pause" active={data.safeMode.flags.pauseAutonomousPublishing} />
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                    <span className="text-xs text-zinc-400">Active pause flags</span>
                    <Badge className={data.safeMode.activePauseCount > 0 ? "border-yellow-500/20 bg-yellow-500/10 text-yellow-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"}>
                      {data.safeMode.activePauseCount}
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="border-emerald-500/20 bg-emerald-500/[0.06] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-300" />
                  <div>
                    <p className="text-sm font-semibold text-white">Read-only safety boundary</p>
                    <p className="mt-1 text-xs leading-5 text-emerald-100/80">
                      Aggregate counts and safe summaries only. No raw package payloads, private memory, business/restricted memory, external-agent tokens, secrets, transactions, publishing, or live execution.
                    </p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => navigate("/admin/safe-mode")} className="border-emerald-500/20 text-emerald-100">
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  Review Controls
                </Button>
              </div>
            </Card>

            {data.safeMode.activePauseCount > 0 || data.safeMode.globalSafeMode ? (
              <Card className="border-yellow-500/20 bg-yellow-500/[0.06] p-4">
                <div className="flex items-start gap-3">
                  <PauseCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-300" />
                  <div>
                    <p className="text-sm font-semibold text-white">Safe-mode state visible</p>
                    <p className="mt-1 text-xs leading-5 text-yellow-100/80">{data.safeMode.summary}</p>
                  </div>
                </div>
              </Card>
            ) : null}

            <WorldMap data={data} onNavigate={navigate} />

            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["Root admin only", data.rootAdminOnly],
                ["Aggregate counts", data.safeguards.aggregateCountsOnly],
                ["No public route", data.safeguards.noPublicRoute],
                ["No marketplace/money changes", data.safeguards.noMarketplaceTransactions && data.safeguards.noMoneyOrRedemptionChanges],
              ].map(([label, enabled]) => (
                <Card key={label as string} className="border-white/[0.06] bg-white/[0.03] p-3">
                  <div className="flex items-center gap-2">
                    {enabled ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertTriangle className="h-4 w-4 text-yellow-300" />}
                    <p className="text-sm text-zinc-300">{label}</p>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
