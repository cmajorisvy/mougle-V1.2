import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PreviewStudioHero from "./PreviewStudioHero";

const Package3DPreviewSection = lazy(
  () => import("@/components/production-house/Package3DPreviewSection"),
);
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LayoutDashboard,
  Wand2,
  Building2,
  Users,
  Mic2,
  Newspaper,
  Theater,
  Sparkles,
  Timer,
  Plug,
  FileCode2,
  ListTree,
  Settings as SettingsIcon,
  Cpu,
  ShieldAlert,
  ShieldCheck,
  ZapOff,
  CheckCircle2,
  XCircle,
  CircleDot,
  RefreshCcw,
  Play,
  History,
  Download,
  HardDrive,
  Box,
  Film,
} from "lucide-react";

type Section =
  | "dashboard"
  | "prompt"
  | "rooms"
  | "unreal"
  | "newsroom"
  | "podcast"
  | "halls"
  | "avatars"
  | "4d"
  | "integrations"
  | "render"
  | "manifests"
  | "history"
  | "voice"
  | "asset"
  | "video"
  | "library"
  | "package"
  | "unreal-sandbox"
  | "unreal-bridge-contract"
  | "local-bridge-stub"
  | "four-d-sandbox"
  | "readiness"
  | "approval-board"
  | "real-unreal-setup"
  | "real-unreal-dry-run"
  | "real-unreal-command-approval"
  | "real-unreal-level-load-contract"
  | "real-unreal-safety-switch"
  | "real-unreal-migration-plan"
  | "room-generator"
  | "avatar-creator"
  | "production-units"
  | "media-pipeline"
  | "news-to-debate"
  | "production-preview"
  | "production-wizard"
  | "audit"
  | "cover-sweep"
  | "media-sweep"
  | "cleanup-history"
  | "settings";

type ProductionListItem = {
  id: string;
  title: string;
};

type ProductionListResponse = {
  productions: ProductionListItem[];
};

const SECTIONS: Array<{ id: Section; label: string; icon: any; group: string }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { id: "prompt", label: "Prompt Studio", icon: Wand2, group: "Overview" },
  { id: "history", label: "Production History", icon: History, group: "Overview" },
  { id: "rooms", label: "Room Creator", icon: Building2, group: "Build" },
  { id: "avatars", label: "Avatar Creator", icon: Users, group: "Build" },
  { id: "halls", label: "Hall Builder", icon: Theater, group: "Build" },
  { id: "podcast", label: "Podcast Builder", icon: Mic2, group: "Build" },
  { id: "newsroom", label: "Newsroom Builder", icon: Newspaper, group: "Build" },
  { id: "unreal", label: "Unreal Creator", icon: Cpu, group: "Cinema" },
  { id: "4d", label: "4D Cue Timeline", icon: Timer, group: "Cinema" },
  { id: "render", label: "Render Jobs", icon: Sparkles, group: "Cinema" },
  { id: "manifests", label: "Manifests", icon: FileCode2, group: "Cinema" },
  { id: "voice", label: "Voice Studio", icon: Mic2, group: "Cinema" },
  { id: "asset", label: "Asset Studio", icon: Box, group: "Cinema" },
  { id: "video", label: "Video Studio", icon: Film, group: "Cinema" },
  { id: "library", label: "Asset Library", icon: HardDrive, group: "Cinema" },
  { id: "package", label: "Production Package", icon: FileCode2, group: "Cinema" },
  { id: "unreal-sandbox", label: "Unreal Sandbox Bridge", icon: Cpu, group: "Cinema" },
  { id: "unreal-bridge-contract", label: "Unreal Bridge Contract", icon: Cpu, group: "Cinema" },
  { id: "local-bridge-stub", label: "Local Bridge Stub", icon: Cpu, group: "Cinema" },
  { id: "four-d-sandbox", label: "4D Hardware Sandbox", icon: Cpu, group: "Cinema" },
  { id: "readiness", label: "Readiness Center", icon: ListTree, group: "Cinema" },
  { id: "approval-board", label: "Approval Board", icon: ListTree, group: "Cinema" },
  { id: "real-unreal-setup", label: "Real Unreal Bridge Setup", icon: Cpu, group: "Cinema" },
  { id: "real-unreal-dry-run", label: "Real Unreal Dry-Run Validation", icon: Cpu, group: "Cinema" },
  { id: "real-unreal-command-approval", label: "Real Unreal Command Approval", icon: ShieldCheck, group: "Cinema" },
  { id: "real-unreal-level-load-contract", label: "Real Unreal Level-Load Contract", icon: ShieldCheck, group: "Cinema" },
  { id: "real-unreal-safety-switch", label: "Real Unreal Safety Switch", icon: ShieldCheck, group: "Cinema" },
  { id: "real-unreal-migration-plan", label: "Real Unreal Migration Plan", icon: ShieldCheck, group: "Cinema" },
  { id: "room-generator", label: "3D/4D Room Generator", icon: Building2, group: "3D/4D Creator" },
  { id: "avatar-creator", label: "Avatar & Accessories Creator", icon: Users, group: "3D/4D Creator" },
  { id: "production-units", label: "Production Units Builder", icon: Box, group: "3D/4D Creator" },
  { id: "media-pipeline", label: "Media Packages", icon: FileCode2, group: "Media Pipeline" },
  { id: "news-to-debate", label: "News to Debate", icon: Newspaper, group: "Media Pipeline" },
  { id: "production-preview", label: "Production Preview", icon: Film, group: "Production" },
  { id: "production-wizard", label: "Production Wizard", icon: Wand2, group: "Production" },
  { id: "integrations", label: "Integration Center", icon: Plug, group: "Ops" },
  { id: "audit", label: "Audit Log", icon: ListTree, group: "Ops" },
  { id: "cover-sweep", label: "Cover File Sweep", icon: HardDrive, group: "Ops" },
  { id: "media-sweep", label: "Render File Sweep", icon: Film, group: "Ops" },
  { id: "cleanup-history", label: "Scheduled Cleanup History", icon: History, group: "Ops" },
  { id: "settings", label: "Settings", icon: SettingsIcon, group: "Ops" },
];

const API = "/api/admin/production-house";
async function jget(p: string) {
  return (await fetch(API + p, { credentials: "include" })).json();
}
async function jpost(p: string, body: any) {
  return (
    await fetch(API + p, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  ).json();
}

/* ------------------------------------------------------------------ */
function StatusPill({
  icon: Icon,
  label,
  tone = "amber",
  testid,
}: {
  icon: any;
  label: string;
  tone?: "amber" | "emerald" | "rose" | "blue";
  testid?: string;
}) {
  const toneCls = {
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    rose: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    blue: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium uppercase tracking-wider ${toneCls}`}
      data-testid={testid}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
export default function ProductionHousePage() {
  const [section, setSection] = useState<Section>("dashboard");
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const refreshOverview = async () => {
    setLoading(true);
    const r = await jget("/overview");
    if (r?.overview) setOverview(r.overview);
    setLoading(false);
  };
  useEffect(() => {
    refreshOverview();
  }, []);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof SECTIONS>();
    for (const s of SECTIONS) {
      if (!m.has(s.group)) m.set(s.group, [] as any);
      m.get(s.group)!.push(s);
    }
    return [...m.entries()];
  }, []);

  return (
    <div
      className="min-h-screen text-slate-100 flex"
      style={{
        background:
          "radial-gradient(1200px 600px at 20% -10%, rgba(56,189,248,0.08), transparent 60%), radial-gradient(900px 500px at 90% 10%, rgba(251,191,36,0.06), transparent 60%), #050914",
      }}
      data-testid="production-house-page"
    >
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800/80 backdrop-blur bg-slate-950/40 p-4 sticky top-0 h-screen flex flex-col">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-sky-500 to-amber-400 flex items-center justify-center text-slate-950 font-black">
            M
          </div>
          <div>
            <div className="text-sm font-bold text-amber-300 leading-tight">Mougle AI</div>
            <div className="text-[11px] text-slate-400 -mt-0.5">Production House</div>
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1 mb-3">
          Premium control center
        </div>
        <nav className="space-y-3 overflow-y-auto pr-1 flex-1">
          {grouped.map(([group, items]) => (
            <div key={group}>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 px-2">
                {group}
              </div>
              <div className="space-y-0.5">
                {items.map((s) => {
                  const Icon = s.icon;
                  const active = section === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSection(s.id)}
                      data-testid={`nav-${s.id}`}
                      className={`w-full text-left px-2.5 py-2 rounded-md text-sm flex items-center gap-2 transition ${
                        active
                          ? "bg-gradient-to-r from-sky-600/25 to-sky-500/5 text-sky-200 border border-sky-500/40 shadow-[0_0_0_1px_rgba(56,189,248,0.15)]"
                          : "text-slate-300 hover:bg-slate-800/60 border border-transparent"
                      }`}
                    >
                      <Icon className="h-4 w-4 opacity-80" />
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="pt-3 mt-3 border-t border-slate-800/80 text-[10px] text-slate-500">
          Internal admin tool — root-admin gated.
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0">
        <PreviewStudioHero />
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-slate-950/70 backdrop-blur border-b border-slate-800/80">
          <div className="px-6 py-3 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-slate-100 leading-tight">
                {SECTIONS.find((s) => s.id === section)?.label}
              </h1>
              <div className="text-[11px] text-slate-500">Mougle AI Production House</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill icon={ShieldCheck} label="Mock Mode" tone="amber" testid="pill-mock" />
              <StatusPill icon={ShieldAlert} label="Safe Mode" tone="amber" testid="pill-safe" />
              <StatusPill icon={CircleDot} label="Approval Required" tone="blue" testid="pill-approval" />
              <StatusPill icon={ZapOff} label="Real Send Disabled" tone="rose" testid="pill-real-send-disabled" />
              <Button
                size="sm"
                variant="outline"
                onClick={refreshOverview}
                disabled={loading}
                data-testid="button-refresh"
                className="border-slate-700 hover:border-sky-500/50"
              >
                <RefreshCcw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </header>

        <div className="p-6 space-y-4">
          <div className="text-[11px] text-slate-400 border border-amber-500/20 rounded-md p-3 bg-amber-500/5">
            Replit controls the AI production workflow, scene manifests, API integrations, and command
            routing. Unreal Engine, 3D rendering, MetaHuman animation, and physical 4D hardware must run on
            connected external systems. This MVP generates manifests and queues commands as{" "}
            <code className="text-amber-300">dryRun: true</code> only — no outbound socket is opened to
            Unreal or 4D hardware.
          </div>

          {section === "dashboard" && <Dashboard overview={overview} />}
          {section === "prompt" && <PromptStudio onChange={refreshOverview} />}
          {section === "rooms" && <RoomCreator onChange={refreshOverview} />}
          {section === "unreal" && <UnrealCreator />}
          {section === "newsroom" && <NewsroomBuilder onChange={refreshOverview} />}
          {section === "podcast" && <PodcastBuilder onChange={refreshOverview} />}
          {section === "halls" && <HallBuilder onChange={refreshOverview} />}
          {section === "avatars" && <AvatarCreator onChange={refreshOverview} />}
          {section === "4d" && <FourDTimeline onChange={refreshOverview} />}
          {section === "integrations" && <IntegrationCenter />}
          {section === "render" && <RenderJobs />}
          {section === "manifests" && <Manifests />}
          {section === "voice" && <VoiceStudio />}
          {section === "asset" && <AssetStudio />}
          {section === "video" && <VideoStudio />}
          {section === "library" && <AssetLibrary />}
          {section === "package" && <ProductionPackageViewer />}
          {section === "unreal-sandbox" && <UnrealSandboxBridge />}
          {section === "unreal-bridge-contract" && <UnrealBridgeContractViewer />}
          {section === "local-bridge-stub" && <LocalBridgeStubPanel />}
          {section === "four-d-sandbox" && <FourDSandboxPanel />}
          {section === "readiness" && <ReadinessCenterPanel />}
          {section === "approval-board" && <ApprovalBoardPanel />}
          {section === "real-unreal-setup" && <RealUnrealSetupPanel />}
          {section === "real-unreal-dry-run" && (
            <div className="space-y-3">
              <RealUnrealDryRunValidationPanel />
              <RealUnrealPrepareSceneDryRunPanel />
              <RealUnrealSetCameraDryRunPanel />
              <RealUnrealSetLightingDryRunPanel />
              <RealUnrealSetPanelsDryRunPanel />
              <RealUnrealRenderPreviewContractPanel />
            </div>
          )}
          {section === "real-unreal-command-approval" && <RealUnrealCommandApprovalPanel />}
          {section === "real-unreal-level-load-contract" && <RealUnrealLevelLoadContractPanel />}
          {section === "real-unreal-safety-switch" && <RealUnrealSafetySwitchPanel />}
          {section === "real-unreal-migration-plan" && <RealUnrealMigrationPlanPanel />}
          {section === "room-generator" && <RoomGeneratorPanel />}
          {section === "avatar-creator" && <AvatarCreatorPanel />}
          {section === "production-units" && <ProductionUnitsPanel />}
          {section === "media-pipeline" && <MediaPipelinePanel />}
          {section === "news-to-debate" && <NewsToDebatePanel />}
          {section === "production-preview" && <ProductionPreviewPanel />}
          {section === "production-wizard" && <ProductionWizardPanel />}
          {section === "history" && <ProductionHistory />}
          {section === "audit" && <AuditLog />}
          {section === "cover-sweep" && <CoverSweepPanel />}
          {section === "media-sweep" && <MediaSweepPanel />}
          {section === "cleanup-history" && <SweepHistoryPanel />}
          {section === "settings" && <Settings />}
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function CinemaCard({
  children,
  className = "",
  title,
  subtitle,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { title?: string; subtitle?: string }) {
  return (
    <Card
      className={`bg-slate-900/60 border-slate-800/80 backdrop-blur shadow-[0_8px_24px_rgba(2,6,23,0.4)] ${className}`}
      {...rest}
    >
      {(title || subtitle) && (
        <div className="px-6 pt-5 pb-2">
          {title && <div className="text-base font-semibold text-slate-100">{title}</div>}
          {subtitle && <div className="text-xs text-slate-400 mt-1">{subtitle}</div>}
        </div>
      )}
      {children}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
function Dashboard({ overview }: { overview: any }) {
  if (!overview) return <div className="text-slate-400">Loading…</div>;
  const t = overview.totals;
  const stats: Array<{ label: string; value: number; accent?: boolean }> = [
    { label: "Productions", value: t.productions, accent: true },
    { label: "Rooms", value: t.rooms },
    { label: "Avatars", value: t.avatars },
    { label: "Halls", value: t.halls },
    { label: "Podcasts", value: t.podcasts },
    { label: "Newsroom productions", value: t.newsroomProductions },
    { label: "4D cues", value: t.fourDCues, accent: true },
    { label: "Render jobs", value: t.renderJobs },
    { label: "Unreal commands (dry-run)", value: t.unrealCommands },
    { label: "Pending renders", value: overview.pendingRenders, accent: true },
    { label: "Pending Unreal commands", value: overview.pendingUnrealCommands },
    { label: "Pending 4D approvals", value: overview.pendingFourDApprovals, accent: true },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <CinemaCard
            key={s.label}
            data-testid={`stat-${s.label.replace(/\s+/g, "-").toLowerCase()}`}
            className="hover:border-sky-500/40 transition"
          >
            <CardHeader className="pb-2">
              <CardDescription className="text-slate-400 text-[11px] uppercase tracking-wider">
                {s.label}
              </CardDescription>
              <CardTitle
                className={`text-3xl font-bold ${s.accent ? "text-amber-300" : "text-sky-300"}`}
              >
                {s.value}
              </CardTitle>
            </CardHeader>
          </CinemaCard>
        ))}
      </div>
      <CinemaCard>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Plug className="h-4 w-4 text-sky-400" />
            API integration status
          </CardTitle>
          <CardDescription className="text-[11px]">
            Booleans only — actual secret values are never read from this view.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(overview.integrations)
            .filter(([k]) => !["envelope", "realUnrealSendAllowed", "real4DSendAllowed"].includes(k))
            .map(([k, v]) => (
              <span
                key={k}
                data-testid={`int-${k}`}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border ${
                  v
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-slate-700 bg-slate-800/40 text-slate-400"
                }`}
              >
                {v ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {k}
              </span>
            ))}
        </CardContent>
      </CinemaCard>
      <CinemaCard>
        <CardHeader>
          <CardTitle className="text-sm">Recent productions</CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-1">
          {overview.recentProductions.length === 0 && (
            <div className="text-slate-400">None yet — try the Prompt Studio.</div>
          )}
          {overview.recentProductions.map((p: any) => (
            <div key={p.id} className="flex justify-between border-b border-slate-800/60 py-1.5">
              <span className="text-slate-200">{p.title}</span>
              <span className="text-slate-500">
                {p.productionType} · <span className="text-amber-300">{p.approvalStatus}</span>
              </span>
            </div>
          ))}
        </CardContent>
      </CinemaCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function PromptStudio({ onChange }: { onChange: () => void }) {
  const [prompt, setPrompt] = useState(
    "Create a premium global breaking news room with blue and gold lighting, AI anchor, world map screen, market panel, source confidence panel, lower-third, ticker, cinematic intro, fog pulse, bass hit, and red light alert.",
  );
  const [result, setResult] = useState<any>(null);
  const [tab, setTab] = useState<"plan" | "scene" | "avatar" | "4d" | "raw">("plan");
  const [mode, setMode] = useState<"mock" | "openai">("mock");
  const [openaiAvailable, setOpenaiAvailable] = useState(false);
  const [openaiResult, setOpenaiResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    jget("/prompt-studio/availability").then((r) => setOpenaiAvailable(!!r?.openaiAvailable));
  }, []);
  const run = async () => {
    setError(null);
    if (mode === "mock") {
      const r = await jpost("/prompt", { prompt, productionType: "newsroom" });
      setResult(r);
      setOpenaiResult(null);
      setTab("plan");
      onChange();
      return;
    }
    // OpenAI mode — explicit confirmation required.
    if (!openaiAvailable) {
      setError("OpenAI mode is not available (OPENAI_API_KEY not set).");
      return;
    }
    if (!window.confirm(
      "Generate via OpenAI?\n\nThis will send your prompt to OpenAI. The result will be saved as a DRAFT production only — no Unreal or 4D commands are sent.",
    )) return;
    try {
      const r = await jpost("/prompt-studio/generate-openai", {
        prompt,
        productionType: "newsroom",
        confirm: true,
      });
      if (r?.ok === false) {
        setError(`OpenAI generation failed: ${r.error || "unknown"}`);
        return;
      }
      setOpenaiResult(r.result);
      setResult(null);
      onChange();
    } catch (e: any) {
      setError(`OpenAI request error: ${e?.message || "unknown"}`);
    }
  };
  const exportOpenAI = (type: string) => {
    if (!openaiResult?.productionId) return;
    window.open(
      `${API}/productions/${encodeURIComponent(openaiResult.productionId)}/export/${type}`,
      "_blank",
    );
  };
  const out = result?.output;
  return (
    <div className="space-y-4">
      <CinemaCard>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-amber-300" /> Prompt Studio
          </CardTitle>
          <CardDescription>
            Type a production prompt. The system generates deterministic plan, scene, avatar, and 4D
            manifests. No external providers are called.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            data-testid="textarea-prompt"
            className="bg-slate-950/60 border-slate-800 focus-visible:ring-sky-500/30"
          />
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 border border-slate-700 rounded p-0.5 bg-slate-950/40">
              {(["mock", "openai"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  disabled={m === "openai" && !openaiAvailable}
                  data-testid={`mode-${m}`}
                  className={`px-2.5 py-1 rounded text-[11px] uppercase tracking-wider transition ${
                    mode === m
                      ? "bg-sky-500/20 text-sky-200 border border-sky-500/50"
                      : "text-slate-400 hover:text-slate-200 border border-transparent"
                  } ${m === "openai" && !openaiAvailable ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  {m === "mock" ? "Mock (deterministic)" : "OpenAI"}
                </button>
              ))}
            </div>
            <Button
              onClick={run}
              data-testid="button-prompt-run"
              className="bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white"
            >
              <Play className="h-3.5 w-3.5 mr-1" />
              {mode === "openai" ? "Generate with OpenAI (saves as Draft)" : "Generate production package"}
            </Button>
            <span className="text-[11px] text-slate-500">
              {mode === "openai"
                ? "Real OpenAI call. Result is saved as a DRAFT only — never auto-approved."
                : "Deterministic SHA-256 of normalized prompt — same input → same manifests."}
            </span>
            {mode === "openai" && !openaiAvailable && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px]">
                OPENAI_API_KEY not set
              </Badge>
            )}
          </div>
          {error && (
            <div
              data-testid="text-prompt-error"
              className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 p-2 rounded"
            >
              {error}
            </div>
          )}
        </CardContent>
      </CinemaCard>

      {openaiResult && (
        <CinemaCard>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                Generated package
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-300 text-[10px] uppercase"
                  data-testid="badge-openai"
                >
                  Generated by OpenAI · model {openaiResult.model}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-amber-500/40 text-amber-300 text-[10px] uppercase"
                  data-testid="badge-draft"
                >
                  Draft
                </Badge>
              </CardTitle>
              <div className="flex gap-1 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-500/40 text-amber-200 text-xs"
                  onClick={() => exportOpenAI("full")}
                  data-testid="button-openai-export-full"
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export full JSON
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-sky-500/40 text-sky-200 text-xs"
                  disabled
                  data-testid="button-openai-saved"
                >
                  Saved as Draft (id {String(openaiResult.productionId).slice(0, 8)})
                </Button>
              </div>
            </div>
            <CardDescription className="text-[11px] mt-1">
              Cost: <span className="text-slate-300">token usage not reported by upstream</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <JsonView value={openaiResult.package} />
          </CardContent>
        </CinemaCard>
      )}

      {out && (
        <CinemaCard>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm">Production package</CardTitle>
              <div className="flex gap-1">
                {(["plan", "scene", "avatar", "4d", "raw"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    data-testid={`tab-${t}`}
                    className={`px-2.5 py-1 rounded text-[11px] uppercase tracking-wider border ${
                      tab === t
                        ? "border-sky-500/50 bg-sky-500/10 text-sky-200"
                        : "border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {tab === "plan" && (
              <div className="space-y-2 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Title</div>
                  <div className="text-amber-300 font-semibold">{out.productionPlan.title}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Summary</div>
                  <div className="text-slate-200">{out.productionPlan.summary}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                    Bullets
                  </div>
                  <ul className="list-disc list-inside text-slate-300 text-xs space-y-0.5">
                    {out.productionPlan.bullets.map((b: string, i: number) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {tab === "scene" && <JsonView value={out.sceneManifest} />}
            {tab === "avatar" && <JsonView value={out.avatarManifest} />}
            {tab === "4d" && <FourDTimelineView cues={out.fourDCueManifest.timeline} />}
            {tab === "raw" && <JsonView value={out} />}
          </CardContent>
        </CinemaCard>
      )}
    </div>
  );
}

function JsonView({ value }: { value: any }) {
  return (
    <pre
      className="text-[11px] leading-snug bg-slate-950/80 p-3 rounded border border-slate-800 max-h-[60vh] overflow-auto text-slate-200"
      data-testid="pre-json"
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/* ------------------------------------------------------------------ */
const EFFECT_COLOR: Record<string, string> = {
  light_flash: "bg-amber-400",
  color_change: "bg-fuchsia-400",
  fog_burst: "bg-slate-400",
  wind: "bg-cyan-400",
  vibration: "bg-rose-400",
  bass_hit: "bg-orange-500",
  motion_seat_cue: "bg-emerald-400",
  scent_cue: "bg-lime-400",
  water_mist: "bg-sky-400",
  heat_cue: "bg-red-500",
  spatial_audio_cue: "bg-indigo-400",
  led_wall_effect: "bg-purple-400",
};

function FourDTimelineView({ cues }: { cues: any[] }) {
  if (!cues?.length) return <div className="text-slate-400 text-xs">No cues.</div>;
  const max = Math.max(...cues.map((c) => c.timecodeMs + (c.durationMs ?? 1000)), 1);
  return (
    <div className="space-y-3" data-testid="four-d-timeline">
      <div className="relative h-12 border border-slate-800 rounded bg-slate-950/60 overflow-hidden">
        {cues.map((c, i) => {
          const left = (c.timecodeMs / max) * 100;
          const width = Math.max(0.8, ((c.durationMs ?? 1000) / max) * 100);
          const color = EFFECT_COLOR[c.cueType ?? c.effect] ?? "bg-sky-400";
          return (
            <div
              key={i}
              title={`${c.cueType ?? c.effect} @ ${c.timecodeMs}ms · intensity ${c.intensity}`}
              data-testid={`cue-block-${i}`}
              className={`absolute top-1/2 -translate-y-1/2 h-7 ${color} rounded opacity-80 border border-slate-950`}
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          );
        })}
        <div className="absolute bottom-0 inset-x-0 flex justify-between text-[9px] text-slate-500 px-1">
          <span>0ms</span>
          <span>{max}ms</span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-[11px]">
        {cues.map((c, i) => (
          <div
            key={i}
            className="flex items-center gap-2 border border-slate-800 rounded px-2 py-1 bg-slate-950/40"
          >
            <span
              className={`h-2.5 w-2.5 rounded-sm ${
                EFFECT_COLOR[c.cueType ?? c.effect] ?? "bg-sky-400"
              }`}
            />
            <span className="text-slate-200">{c.cueType ?? c.effect}</span>
            <span className="text-slate-500">@ {c.timecodeMs}ms</span>
            <span className="ml-auto text-slate-500">
              intensity {Number(c.intensity ?? 0).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function SimpleListCreator(props: {
  title: string;
  icon: any;
  fetchPath: string;
  listKey: string;
  itemKey: string;
  fields: Array<{ name: string; label: string; type?: "text" | "number"; defaultValue?: any }>;
  onChange: () => void;
  testidPrefix: string;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState<Record<string, any>>(
    Object.fromEntries(props.fields.map((f) => [f.name, f.defaultValue ?? ""])),
  );
  const refresh = async () => {
    const r = await jget(props.fetchPath);
    if (Array.isArray(r?.[props.listKey])) setItems(r[props.listKey]);
  };
  useEffect(() => {
    refresh();
  }, []);
  const create = async () => {
    const body: any = {};
    for (const f of props.fields) {
      body[f.name] = f.type === "number" ? Number(form[f.name]) : form[f.name];
    }
    await jpost(props.fetchPath, body);
    await refresh();
    props.onChange();
  };
  const Icon = props.icon;
  return (
    <CinemaCard>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4 text-sky-400" /> {props.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {props.fields.map((f) => (
            <div key={f.name}>
              <Label className="text-[10px] uppercase tracking-wider text-slate-500">
                {f.label}
              </Label>
              <Input
                value={form[f.name] ?? ""}
                onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                data-testid={`${props.testidPrefix}-input-${f.name}`}
                className="bg-slate-950/60 border-slate-800 focus-visible:ring-sky-500/30 mt-1"
              />
            </div>
          ))}
        </div>
        <Button
          onClick={create}
          data-testid={`${props.testidPrefix}-create`}
          className="bg-gradient-to-r from-sky-600 to-sky-500"
        >
          Create
        </Button>
        <div className="text-xs space-y-1 max-h-72 overflow-auto">
          {items.length === 0 && <div className="text-slate-400">No items yet.</div>}
          {items.map((it) => (
            <div
              key={it.id}
              className="border-b border-slate-800/60 py-1.5 flex justify-between"
              data-testid={`${props.testidPrefix}-item-${it.id}`}
            >
              <span className="text-slate-200">
                {String(it[props.itemKey] ?? it.name ?? it.title ?? it.id)}
              </span>
              <span className="text-slate-500 font-mono text-[10px]">{it.id.slice(0, 8)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </CinemaCard>
  );
}

function RoomCreator({ onChange }: { onChange: () => void }) {
  return (
    <SimpleListCreator
      title="Room Creator"
      icon={Building2}
      fetchPath="/rooms"
      listKey="rooms"
      itemKey="name"
      testidPrefix="room"
      onChange={onChange}
      fields={[
        { name: "name", label: "Name", defaultValue: "Newsroom A" },
        { name: "type", label: "Type", defaultValue: "newsroom" },
        { name: "visualStyle", label: "Visual style", defaultValue: "futuristic" },
        { name: "lightingStyle", label: "Lighting style", defaultValue: "blue_gold" },
        { name: "unrealLevelName", label: "Unreal level name", defaultValue: "Level_NewsroomA" },
        { name: "status", label: "Status", defaultValue: "draft" },
      ]}
    />
  );
}

function AvatarCreator({ onChange }: { onChange: () => void }) {
  return (
    <SimpleListCreator
      title="Avatar Creator"
      icon={Users}
      fetchPath="/avatars"
      listKey="avatars"
      itemKey="name"
      testidPrefix="avatar"
      onChange={onChange}
      fields={[
        { name: "name", label: "Name", defaultValue: "AI Anchor" },
        { name: "role", label: "Role", defaultValue: "news_anchor" },
        { name: "style", label: "Style", defaultValue: "premium" },
        { name: "personality", label: "Personality", defaultValue: "calm authority" },
        { name: "avatarType", label: "Avatar type", defaultValue: "placeholder" },
        { name: "unrealBlueprintName", label: "Unreal blueprint", defaultValue: "BP_AnchorOne" },
        { name: "status", label: "Status", defaultValue: "draft" },
      ]}
    />
  );
}

function HallBuilder({ onChange }: { onChange: () => void }) {
  return (
    <SimpleListCreator
      title="Hall Builder"
      icon={Theater}
      fetchPath="/halls"
      listKey="halls"
      itemKey="name"
      testidPrefix="hall"
      onChange={onChange}
      fields={[
        { name: "name", label: "Name", defaultValue: "Cinema Hall One" },
        { name: "type", label: "Type", defaultValue: "cinema_hall" },
        { name: "stage", label: "Stage", defaultValue: "main_stage" },
        { name: "screen", label: "Screen", defaultValue: "ultrawide_led" },
        { name: "lighting", label: "Lighting", defaultValue: "cinematic" },
        { name: "sound", label: "Sound", defaultValue: "dolby_atmos_placeholder" },
        { name: "status", label: "Status", defaultValue: "draft" },
      ]}
    />
  );
}

function PodcastBuilder({ onChange }: { onChange: () => void }) {
  return (
    <SimpleListCreator
      title="Podcast Builder"
      icon={Mic2}
      fetchPath="/podcasts"
      listKey="podcasts"
      itemKey="episodeTitle"
      testidPrefix="podcast"
      onChange={onChange}
      fields={[
        { name: "podcastTitle", label: "Podcast title", defaultValue: "Mougle Daily" },
        { name: "episodeTitle", label: "Episode title", defaultValue: "Renewable energy" },
        { name: "tableStyle", label: "Table style", defaultValue: "round_glass" },
        { name: "screenBackground", label: "Screen background", defaultValue: "blue_gold_panels" },
        { name: "introSequence", label: "Intro sequence", defaultValue: "cinematic_intro_1" },
      ]}
    />
  );
}

function NewsroomBuilder({ onChange }: { onChange: () => void }) {
  return (
    <SimpleListCreator
      title="Active Newsroom Builder"
      icon={Newspaper}
      fetchPath="/newsroom-productions"
      listKey="newsroomProductions"
      itemKey="storyTitle"
      testidPrefix="newsroom"
      onChange={onChange}
      fields={[
        { name: "storyTitle", label: "Story title", defaultValue: "Climate report" },
        { name: "category", label: "Category", defaultValue: "world" },
        { name: "script", label: "Script", defaultValue: "Verified script body." },
        { name: "lowerThird", label: "Lower-third", defaultValue: "BREAKING" },
        { name: "ticker", label: "Ticker", defaultValue: "Markets steady..." },
      ]}
    />
  );
}

function FourDTimeline({ onChange }: { onChange: () => void }) {
  const [cues, setCues] = useState<any[]>([]);
  const refresh = async () => setCues((await jget("/4d-cues")).cues || []);
  useEffect(() => {
    refresh();
  }, []);
  return (
    <div className="space-y-4">
      <SimpleListCreator
        title="4D Cue Timeline"
        icon={Timer}
        fetchPath="/4d-cues"
        listKey="cues"
        itemKey="name"
        testidPrefix="cue"
        onChange={() => {
          refresh();
          onChange();
        }}
        fields={[
          { name: "timecodeMs", label: "Timecode (ms)", type: "number", defaultValue: 1000 },
          { name: "name", label: "Cue name", defaultValue: "Fog burst intro" },
          { name: "effect", label: "Effect", defaultValue: "fog_burst" },
          { name: "intensity", label: "Intensity (0-1)", type: "number", defaultValue: 0.6 },
          { name: "durationMs", label: "Duration (ms)", type: "number", defaultValue: 1500 },
          { name: "hardwareTarget", label: "Hardware target", defaultValue: "placeholder" },
        ]}
      />
      {cues.length > 0 && (
        <CinemaCard>
          <CardHeader>
            <CardTitle className="text-sm">Timeline preview</CardTitle>
            <CardDescription className="text-[11px]">
              All cues require admin approval before they would be sent. Real hardware bridge is
              disabled in this MVP.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FourDTimelineView cues={cues} />
          </CardContent>
        </CinemaCard>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function UnrealCreator() {
  const [status, setStatus] = useState<any>(null);
  const [productionId, setProductionId] = useState("");
  const refresh = async () => setStatus(await jget("/unreal/status"));
  useEffect(() => {
    refresh();
  }, []);
  const send = async (path: string) => {
    await jpost(path, { payload: { source: "admin_ui" }, productionId: productionId || null });
    await refresh();
  };
  const buttons: Array<[string, string, string]> = [
    ["button-unreal-load", "/unreal/load-level", "Load level"],
    ["button-unreal-camera", "/unreal/set-camera", "Set camera"],
    ["button-unreal-lighting", "/unreal/set-lighting", "Set lighting"],
    ["button-unreal-sequence", "/unreal/start-sequence", "Start sequence"],
    ["button-unreal-scene", "/unreal/send-command", "Send scene manifest"],
    ["button-unreal-render", "/unreal/render", "Render"],
  ];
  return (
    <CinemaCard>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-sky-400" /> Unreal Creator
        </CardTitle>
        <CardDescription>
          All commands are dry-run mocks. No outbound socket is opened to Unreal Remote Control. Render
          and Send-Scene-Manifest require a production ID that is approved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label className="text-[10px] uppercase tracking-wider text-slate-500">
              Production ID (required for render / send-scene-manifest)
            </Label>
            <Input
              value={productionId}
              onChange={(e) => setProductionId(e.target.value)}
              placeholder="optional for load-level / camera / lighting / sequence"
              data-testid="input-unreal-production-id"
              className="bg-slate-950/60 border-slate-800 mt-1"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {buttons.map(([tid, path, label]) => (
            <Button
              key={tid}
              onClick={() => send(path)}
              data-testid={tid}
              variant="outline"
              className="border-slate-700 hover:border-sky-500/50"
            >
              {label} (mock)
            </Button>
          ))}
        </div>
        {status && <JsonView value={status} />}
      </CardContent>
    </CinemaCard>
  );
}

/* ------------------------------------------------------------------ */
const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  elevenlabs: "ElevenLabs",
  meshy: "Meshy",
  runway: "Runway",
  convai: "Convai",
  nvidia_ace: "NVIDIA ACE",
  deepmotion: "DeepMotion",
  rokoko: "Rokoko",
  unreal_remote: "Unreal Remote Control",
  four_d_bridge: "Local 4D Bridge",
};
const PROVIDER_KEYS = Object.keys(PROVIDER_LABELS);

function IntegrationCenter() {
  const [status, setStatus] = useState<any>(null);
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const refresh = async () => setStatus((await jget("/integrations")).integrations);
  useEffect(() => {
    refresh();
  }, []);
  const test = async (provider: string) => {
    const r = await jpost("/integrations/test", { provider });
    setTestResults((prev) => ({ ...prev, [provider]: r.result }));
  };
  return (
    <div className="space-y-4">
      <CinemaCard>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Plug className="h-4 w-4 text-sky-400" /> Integration Center
          </CardTitle>
          <CardDescription>
            Booleans only. Test buttons return mock success/failure only — no real external call is
            ever made.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!status && <div className="text-slate-400 text-xs">Loading…</div>}
          {status && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PROVIDER_KEYS.map((k) => {
                const configured = !!status[k];
                const tr = testResults[k];
                return (
                  <div
                    key={k}
                    className="border border-slate-800 bg-slate-950/40 rounded-md p-3 space-y-2"
                    data-testid={`provider-card-${k}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-slate-100">{PROVIDER_LABELS[k]}</div>
                      <span
                        className={`text-[10px] uppercase px-2 py-0.5 rounded-full border ${
                          configured
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                            : "border-slate-700 bg-slate-800/60 text-slate-400"
                        }`}
                        data-testid={`integration-${k}`}
                      >
                        {configured ? "configured" : "not configured"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => test(k)}
                        data-testid={`button-test-${k}`}
                        className="border-slate-700 hover:border-amber-500/50 text-xs"
                      >
                        Test (mock)
                      </Button>
                      <StatusPill icon={ShieldCheck} label="Mock Mode" tone="amber" />
                    </div>
                    {tr && (
                      <div
                        className={`text-[11px] rounded p-2 border ${
                          tr.ok
                            ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-200"
                            : "border-rose-500/40 bg-rose-500/5 text-rose-200"
                        }`}
                        data-testid={`result-${k}`}
                      >
                        <div className="font-mono">
                          {tr.ok ? "✓ mock_success" : "✗ " + tr.reason} · realSendAllowed={String(
                            tr.realSendAllowed,
                          )}
                        </div>
                        <div className="text-slate-400 mt-0.5">{tr.message}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </CinemaCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function RenderJobs() {
  const [jobs, setJobs] = useState<any[]>([]);
  useEffect(() => {
    jget("/render-jobs").then((r) => setJobs(r?.jobs || []));
  }, []);
  return (
    <CinemaCard>
      <CardHeader>
        <CardTitle className="text-sm">Render jobs</CardTitle>
        <CardDescription>All jobs are admin-only internal. No public or signed URLs.</CardDescription>
      </CardHeader>
      <CardContent className="text-xs">
        {jobs.length === 0 && <div className="text-slate-400">None yet.</div>}
        <div className="space-y-1">
          {jobs.map((j) => (
            <div
              key={j.id}
              className="border-b border-slate-800/60 py-1.5 flex flex-wrap items-center gap-3"
            >
              <span className="font-mono text-slate-400 text-[10px]">{j.id.slice(0, 8)}</span>
              <Badge
                variant="outline"
                className={
                  j.status === "queued"
                    ? "border-amber-500/40 text-amber-300"
                    : j.status === "rendered"
                      ? "border-emerald-500/40 text-emerald-300"
                      : "border-slate-700 text-slate-400"
                }
              >
                {j.status}
              </Badge>
              <span className="text-slate-400">preset={j.preset}</span>
              <span className="ml-auto text-rose-300 text-[10px] uppercase tracking-wider">
                {j.visibility}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </CinemaCard>
  );
}

/* ------------------------------------------------------------------ */
function Manifests() {
  const [productionId, setProductionId] = useState("");
  const [manifests, setManifests] = useState<any>(null);
  const [tab, setTab] = useState<"production" | "unrealScene" | "avatars" | "fourDCues">(
    "production",
  );
  const load = async () => {
    const r = await jget(`/manifests/${encodeURIComponent(productionId)}`);
    setManifests(r);
    setTab("production");
  };
  const exportAs = (type: "production" | "unreal" | "avatar" | "4d" | "full") => {
    if (!productionId) return;
    window.open(
      `${API}/productions/${encodeURIComponent(productionId)}/export/${type}`,
      "_blank",
    );
  };
  const EXPORTS: Array<["production" | "unreal" | "avatar" | "4d" | "full", string]> = [
    ["production", "Production Manifest"],
    ["unreal", "Unreal Scene Manifest"],
    ["avatar", "Avatar Manifest"],
    ["4d", "4D Cue Manifest"],
    ["full", "Full Production Package"],
  ];
  return (
    <CinemaCard>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileCode2 className="h-4 w-4 text-sky-400" /> Manifests
        </CardTitle>
        <CardDescription>
          Enter a production ID to preview its production / Unreal scene / avatar / 4D cue manifests.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={productionId}
            onChange={(e) => setProductionId(e.target.value)}
            placeholder="production id"
            data-testid="input-manifest-id"
            className="bg-slate-950/60 border-slate-800"
          />
          <Button onClick={load} data-testid="button-manifest-load">
            Load
          </Button>
        </div>

        <div className="border border-amber-500/20 bg-amber-500/5 rounded-md p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold">
            Export downloads
          </div>
          <div className="flex flex-wrap gap-2">
            {EXPORTS.map(([type, label]) => (
              <Button
                key={type}
                size="sm"
                variant="outline"
                disabled={!productionId}
                onClick={() => exportAs(type)}
                data-testid={`button-export-${type}`}
                className="border-amber-500/40 text-amber-200 hover:bg-amber-500/10 text-xs"
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                {label} JSON
              </Button>
            ))}
          </div>
        </div>

        {manifests?.manifests && (
          <>
            <div className="flex gap-1 flex-wrap">
              {(["production", "unrealScene", "avatars", "fourDCues"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  data-testid={`manifest-tab-${t}`}
                  className={`px-2.5 py-1 rounded text-[11px] uppercase tracking-wider border ${
                    tab === t
                      ? "border-sky-500/50 bg-sky-500/10 text-sky-200"
                      : "border-slate-700 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === "fourDCues" ? (
              <FourDTimelineView cues={manifests.manifests.fourDCues.timeline} />
            ) : (
              <JsonView value={(manifests.manifests as any)[tab]} />
            )}
          </>
        )}
      </CardContent>
    </CinemaCard>
  );
}

/* ------------------------------------------------------------------ */
function ProductionHistory() {
  const [filters, setFilters] = useState({
    productionType: "",
    approvalStatus: "",
    roomType: "",
    q: "",
    dateFrom: "",
    dateTo: "",
  });
  const [items, setItems] = useState<any[]>([]);
  const [storage, setStorage] = useState<{ kind: string; location: string } | null>(null);
  const refresh = async () => {
    const qs = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => !!v) as [string, string][],
    ).toString();
    const r = await jget(`/productions${qs ? `?${qs}` : ""}`);
    setItems(r?.productions || []);
  };
  useEffect(() => {
    jget("/storage-info").then((r) => setStorage(r?.storage || null));
    refresh();
  }, []);
  const setF = (k: string, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-4">
      {storage && (
        <CinemaCard>
          <CardContent className="pt-4 flex items-center gap-3 text-[11px]">
            <HardDrive className="h-4 w-4 text-sky-400" />
            <div>
              <div className="text-slate-200">
                Persistence:{" "}
                <span
                  className={
                    storage.kind === "file" ? "text-emerald-300" : "text-amber-300"
                  }
                  data-testid="text-storage-kind"
                >
                  {storage.kind === "file"
                    ? "File-based (survives local restart)"
                    : "In-memory (test / fallback)"}
                </span>
              </div>
              <div className="text-slate-500 font-mono text-[10px]">{storage.location}</div>
            </div>
            <Badge
              variant="outline"
              className="ml-auto border-amber-500/40 text-amber-300 text-[10px] uppercase"
            >
              Interim — not the final production DB
            </Badge>
          </CardContent>
        </CinemaCard>
      )}
      <CinemaCard>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4 text-sky-400" /> Production History &amp; Search
          </CardTitle>
          <CardDescription>
            Filter persisted productions by type, room type, approval status, free-text, or date range.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {(
              [
                ["productionType", "Production type"],
                ["approvalStatus", "Approval status"],
                ["roomType", "Room type"],
                ["q", "Title / script search"],
                ["dateFrom", "Date from (ISO)"],
                ["dateTo", "Date to (ISO)"],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <Label className="text-[10px] uppercase tracking-wider text-slate-500">
                  {label}
                </Label>
                <Input
                  value={(filters as any)[k]}
                  onChange={(e) => setF(k, e.target.value)}
                  data-testid={`filter-${k}`}
                  className="bg-slate-950/60 border-slate-800 mt-1 text-xs"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={refresh}
              data-testid="button-filter-apply"
              className="bg-gradient-to-r from-sky-600 to-sky-500"
            >
              Apply filters
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFilters({
                  productionType: "",
                  approvalStatus: "",
                  roomType: "",
                  q: "",
                  dateFrom: "",
                  dateTo: "",
                });
                setTimeout(refresh, 0);
              }}
              data-testid="button-filter-clear"
              className="border-slate-700"
            >
              Clear
            </Button>
          </div>
          <div className="text-[11px] text-slate-400" data-testid="text-history-count">
            {items.length} match{items.length === 1 ? "" : "es"}
          </div>
          <div className="text-xs space-y-1 max-h-[60vh] overflow-auto">
            {items.length === 0 && <div className="text-slate-400">No productions match.</div>}
            {items.map((p) => (
              <div
                key={p.id}
                className="border border-slate-800 rounded p-2 bg-slate-950/40 flex flex-wrap items-center gap-3"
                data-testid={`history-row-${p.id}`}
              >
                <span className="text-slate-200 font-medium">{p.title}</span>
                <Badge variant="outline" className="border-sky-500/40 text-sky-300 text-[10px]">
                  {p.productionType}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    p.approvalStatus === "approved"
                      ? "border-emerald-500/40 text-emerald-300 text-[10px]"
                      : p.approvalStatus === "failed"
                        ? "border-rose-500/40 text-rose-300 text-[10px]"
                        : "border-amber-500/40 text-amber-300 text-[10px]"
                  }
                >
                  {p.approvalStatus}
                </Badge>
                <span className="text-slate-500 font-mono text-[10px]">{p.id.slice(0, 8)}</span>
                <span className="ml-auto text-slate-500 text-[10px]">
                  {new Date(p.createdAt).toISOString().slice(0, 10)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </CinemaCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function AuditLog() {
  const [events, setEvents] = useState<any[]>([]);
  const refresh = async () => setEvents((await jget("/audit?limit=200")).events || []);
  useEffect(() => {
    refresh();
  }, []);
  return (
    <CinemaCard>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <ListTree className="h-4 w-4 text-sky-400" /> Audit log
        </CardTitle>
        <CardDescription>
          Records prompt generation, manifest creation, approval changes, attempted Unreal sends,
          attempted 4D sends, and integration tests.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-end mb-2">
          <Button
            size="sm"
            variant="outline"
            onClick={refresh}
            data-testid="button-audit-refresh"
            className="border-slate-700"
          >
            <RefreshCcw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-auto text-[11px] divide-y divide-slate-800/60">
          {events.length === 0 && <div className="text-slate-400 text-xs">No events yet.</div>}
          {events
            .slice()
            .reverse()
            .map((e) => (
              <div
                key={e.id}
                className="py-1.5 flex flex-wrap gap-3"
                data-testid={`audit-row-${e.id}`}
              >
                <span className="text-slate-500 font-mono">
                  {new Date(e.at).toISOString().slice(11, 19)}
                </span>
                <span className="text-sky-300">{e.actor}</span>
                <span className="text-amber-300">{e.action}</span>
                <span className="text-slate-300">{e.detail}</span>
              </div>
            ))}
        </div>
      </CardContent>
    </CinemaCard>
  );
}

/* ------------------------------------------------------------------ */
function Settings() {
  return (
    <CinemaCard>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <SettingsIcon className="h-4 w-4 text-sky-400" /> Settings
        </CardTitle>
        <CardDescription>
          This MVP runs from environment variables only. Update env vars via the Replit Secrets pane;
          this page never reads or writes secret values.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-xs text-slate-300 space-y-3">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">AI providers</div>
          <div className="font-mono">
            OPENAI_API_KEY · ELEVENLABS_API_KEY · MESHY_API_KEY · RUNWAY_API_KEY · CONVAI_API_KEY ·
            NVIDIA_ACE_API_KEY · DEEPMOTION_API_KEY · ROKOKO_API_KEY
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Unreal</div>
          <div className="font-mono">
            UNREAL_REMOTE_URL · UNREAL_WEBSOCKET_URL · UNREAL_API_TOKEN
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">4D bridge</div>
          <div className="font-mono">
            LOCAL_4D_BRIDGE_URL · DMX_BRIDGE_URL · OSC_BRIDGE_URL · HARDWARE_SECRET
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Misc</div>
          <div className="font-mono">WEBHOOK_SECRET · DATABASE_URL · RESEND_API_KEY</div>
        </div>
        <div className="text-amber-300 mt-3 border-t border-slate-800 pt-3">
          Real Unreal sends and real 4D hardware sends are PERMANENTLY DISABLED in this MVP regardless
          of any env-var setting. Enabling them requires a separate, explicitly-approved migration
          task.
        </div>
      </CardContent>
    </CinemaCard>
  );
}

/* ------------------------------------------------------------------ */
function VoiceStudio() {
  const [availability, setAvailability] = useState<{ available: boolean; mockMode: boolean; realSendAllowed: boolean } | null>(null);
  const [productions, setProductions] = useState<any[]>([]);
  const [productionId, setProductionId] = useState<string>("");
  const [script, setScript] = useState<string>("");
  const [provider, setProvider] = useState<"mock" | "elevenlabs">("mock");
  const [voiceId, setVoiceId] = useState<string>("mock-default");
  const [voiceName, setVoiceName] = useState<string>("");
  const [assets, setAssets] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const load = async () => {
    const [a, p, l] = await Promise.all([
      jget("/voice/availability"),
      jget("/productions"),
      jget("/voice/list"),
    ]);
    setAvailability({
      available: !!a?.available,
      mockMode: !!a?.mockMode,
      realSendAllowed: !!a?.realSendAllowed,
    });
    setProductions(p?.productions || []);
    setAssets(l?.assets || []);
  };
  useEffect(() => {
    load();
  }, []);

  const selected = useMemo(
    () => productions.find((p) => p.id === productionId),
    [productions, productionId],
  );
  const effectiveScript = (script.trim() || selected?.script || "").trim();

  const generate = async () => {
    setMsg("");
    if (!effectiveScript) {
      setMsg("Provide a production or script.");
      return;
    }
    if (provider === "elevenlabs") {
      if (!availability?.available) {
        setMsg("ElevenLabs is not configured.");
        return;
      }
      if (!window.confirm("Generate voice via ElevenLabs? This calls a paid external API. Output stays as a Draft, internal-only.")) {
        return;
      }
    }
    setBusy(true);
    try {
      const path = provider === "mock" ? "/voice/generate-mock" : "/voice/generate-elevenlabs";
      const body: any = {
        voiceId: voiceId.trim() || (provider === "mock" ? "mock-default" : ""),
        voiceName: voiceName.trim() || undefined,
      };
      if (productionId) body.productionId = productionId;
      else body.script = effectiveScript;
      if (provider === "elevenlabs") body.confirm = true;
      const r = await jpost(path, body);
      if (!r?.ok) {
        setMsg(`Failed: ${r?.error || "unknown"}`);
      } else {
        setMsg(`Saved Draft voice asset ${r.asset.id} (${r.asset.status}).`);
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <CinemaCard title="Voice Studio" subtitle="Mock + ElevenLabs · Draft only · Internal only · No public URL">
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2" data-testid="voice-badges">
          <Badge variant="outline" className="border-amber-500/40 text-amber-300">Draft</Badge>
          <Badge variant="outline" className="border-amber-500/40 text-amber-300">Internal Only</Badge>
          <Badge variant="outline" className="border-amber-500/40 text-amber-300">No Public URL</Badge>
          <Badge variant="outline" className="border-rose-500/40 text-rose-300">No Unreal Send</Badge>
          <Badge variant="outline" className="border-rose-500/40 text-rose-300">No 4D Send</Badge>
          {availability?.available ? (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">ElevenLabs configured</Badge>
          ) : (
            <Badge variant="outline" className="border-slate-500/40 text-slate-300">ElevenLabs not configured</Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Production (optional)</Label>
            <select
              data-testid="select-voice-production"
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm"
              value={productionId}
              onChange={(e) => setProductionId(e.target.value)}
            >
              <option value="">— Use script below —</option>
              {productions.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Provider</Label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={provider === "mock" ? "default" : "outline"}
                onClick={() => { setProvider("mock"); setVoiceId("mock-default"); }}
                data-testid="button-voice-provider-mock"
              >Mock</Button>
              <Button
                size="sm"
                variant={provider === "elevenlabs" ? "default" : "outline"}
                onClick={() => { setProvider("elevenlabs"); if (voiceId === "mock-default") setVoiceId(""); }}
                disabled={!availability?.available}
                data-testid="button-voice-provider-elevenlabs"
              >ElevenLabs</Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="voice-id">Voice ID</Label>
            <Input
              id="voice-id"
              data-testid="input-voice-id"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              placeholder={provider === "mock" ? "mock-default" : "ElevenLabs voice id"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="voice-name">Voice name (optional)</Label>
            <Input
              id="voice-name"
              data-testid="input-voice-name"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Script {selected ? "(from selected production, override below)" : ""}</Label>
          <Textarea
            data-testid="textarea-voice-script"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={6}
            placeholder={selected?.script || "Paste or write a script…"}
          />
          {selected?.script && !script.trim() && (
            <div className="text-xs text-slate-400">Will use production script ({selected.script.length} chars).</div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={generate}
            disabled={busy}
            data-testid="button-voice-generate"
          >
            {busy ? "Generating…" : `Generate ${provider === "mock" ? "(Mock)" : "(ElevenLabs)"}`}
          </Button>
          {msg && <div className="text-xs text-slate-300" data-testid="text-voice-msg">{msg}</div>}
        </div>

        <div className="border-t border-slate-800 pt-3">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">Generated voice assets</div>
          {assets.length === 0 ? (
            <div className="text-xs text-slate-500">No voice assets yet.</div>
          ) : (
            <div className="space-y-2">
              {assets.slice().reverse().map((a) => (
                <div
                  key={a.id}
                  className="border border-slate-800 rounded p-3 text-xs space-y-1"
                  data-testid={`card-voice-asset-${a.id}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{a.provider}</Badge>
                    <Badge variant="outline" className="border-amber-500/40 text-amber-300">{a.approvalStatus}</Badge>
                    <Badge variant="outline">{a.status}</Badge>
                    <Badge variant="outline" className="border-slate-500/40 text-slate-300">Internal Only</Badge>
                    <span className="text-slate-400">voice: {a.voiceName || a.voiceId}</span>
                  </div>
                  <div className="text-slate-400">
                    productionId: <span className="font-mono">{a.productionId ?? "(none)"}</span> ·
                    duration: {a.durationSeconds ?? "n/a"}s ·
                    hash: <span className="font-mono">{String(a.scriptHash).slice(0, 12)}…</span>
                  </div>
                  <div className="text-slate-300 italic">"{a.scriptPreview}"</div>
                  {a.errorReason && <div className="text-rose-400">error: {a.errorReason}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </CinemaCard>
  );
}

/* ------------------------------------------------------------------ */
function AssetStudio() {
  const ASSET_TYPES = [
    "room",
    "prop",
    "desk",
    "panel",
    "screen",
    "avatar_accessory",
    "hall",
    "environment",
    "custom",
  ] as const;
  const [availability, setAvailability] = useState<{ available: boolean; mockMode: boolean; realSendAllowed: boolean } | null>(null);
  const [productions, setProductions] = useState<any[]>([]);
  const [productionId, setProductionId] = useState<string>("");
  const [assetType, setAssetType] = useState<(typeof ASSET_TYPES)[number]>("prop");
  const [prompt, setPrompt] = useState<string>("");
  const [provider, setProvider] = useState<"mock" | "meshy">("mock");
  const [jobs, setJobs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const load = async () => {
    const [a, p, l] = await Promise.all([
      jget("/assets/meshy/availability"),
      jget("/productions"),
      jget("/assets/meshy/list"),
    ]);
    setAvailability({
      available: !!a?.available,
      mockMode: !!a?.mockMode,
      realSendAllowed: !!a?.realSendAllowed,
    });
    setProductions(p?.productions || []);
    setJobs(l?.jobs || []);
  };
  useEffect(() => {
    load();
  }, []);

  const generate = async () => {
    setMsg("");
    if (!prompt.trim()) {
      setMsg("Enter an asset prompt.");
      return;
    }
    if (provider === "meshy") {
      if (!availability?.available) {
        setMsg("Meshy is not configured.");
        return;
      }
      if (!window.confirm("Submit draft job to Meshy? This calls a paid external API. Output stays as a Draft, internal-only.")) {
        return;
      }
    }
    setBusy(true);
    try {
      const path = provider === "mock" ? "/assets/meshy/generate-mock" : "/assets/meshy/generate";
      const body: any = { assetType, prompt: prompt.trim() };
      if (productionId) body.productionId = productionId;
      if (provider === "meshy") body.confirm = true;
      const r = await jpost(path, body);
      if (!r?.ok) {
        setMsg(`Failed: ${r?.error || "unknown"}`);
      } else {
        setMsg(`Saved Draft asset job ${r.job.id} (${r.job.status}).`);
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <CinemaCard title="Asset Studio" subtitle="Mock + Meshy 3D · Draft only · Internal only · No public URL · No Unreal import · No 4D send">
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2" data-testid="asset-badges">
          <Badge variant="outline" className="border-amber-500/40 text-amber-300">Draft</Badge>
          <Badge variant="outline" className="border-amber-500/40 text-amber-300">Internal Only</Badge>
          <Badge variant="outline" className="border-amber-500/40 text-amber-300">No Public URL</Badge>
          <Badge variant="outline" className="border-rose-500/40 text-rose-300">No Unreal Import</Badge>
          <Badge variant="outline" className="border-rose-500/40 text-rose-300">No 4D Send</Badge>
          {availability?.available ? (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">Meshy configured</Badge>
          ) : (
            <Badge variant="outline" className="border-slate-500/40 text-slate-300">Meshy not configured</Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Production (optional)</Label>
            <select
              data-testid="select-asset-production"
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm"
              value={productionId}
              onChange={(e) => setProductionId(e.target.value)}
            >
              <option value="">— Standalone asset —</option>
              {productions.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Asset Type</Label>
            <select
              data-testid="select-asset-type"
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm"
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as any)}
            >
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Provider</Label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={provider === "mock" ? "default" : "outline"}
                onClick={() => setProvider("mock")}
                data-testid="button-asset-provider-mock"
              >Mock</Button>
              <Button
                size="sm"
                variant={provider === "meshy" ? "default" : "outline"}
                onClick={() => setProvider("meshy")}
                disabled={!availability?.available}
                data-testid="button-asset-provider-meshy"
              >Meshy</Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="asset-prompt">Asset prompt</Label>
          <Textarea
            id="asset-prompt"
            data-testid="textarea-asset-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="e.g. A futuristic news anchor desk with embedded translucent panels…"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={generate} disabled={busy} data-testid="button-asset-generate">
            {busy ? "Submitting…" : `Generate ${provider === "mock" ? "(Mock)" : "(Meshy)"}`}
          </Button>
          {msg && <div className="text-xs text-slate-300" data-testid="text-asset-msg">{msg}</div>}
        </div>

        <div className="border-t border-slate-800 pt-3">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">Generated asset jobs</div>
          {jobs.length === 0 ? (
            <div className="text-xs text-slate-500">No asset jobs yet.</div>
          ) : (
            <div className="space-y-2">
              {jobs.slice().reverse().map((j) => (
                <div
                  key={j.id}
                  className="border border-slate-800 rounded p-3 text-xs space-y-1"
                  data-testid={`card-asset-job-${j.id}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{j.provider}</Badge>
                    <Badge variant="outline">{j.assetType}</Badge>
                    <Badge variant="outline" className="border-amber-500/40 text-amber-300">{j.approvalStatus}</Badge>
                    <Badge variant="outline">{j.status}</Badge>
                    <Badge variant="outline" className="border-slate-500/40 text-slate-300">Internal Only</Badge>
                    <Badge variant="outline" className="border-rose-500/40 text-rose-300">No Unreal Import</Badge>
                    <Badge variant="outline" className="border-rose-500/40 text-rose-300">No 4D Send</Badge>
                  </div>
                  <div className="text-slate-400">
                    productionId: <span className="font-mono">{j.productionId ?? "(none)"}</span> ·
                    providerJobId: <span className="font-mono">{j.providerJobId ?? "(none)"}</span> ·
                    hash: <span className="font-mono">{String(j.promptHash).slice(0, 12)}…</span>
                  </div>
                  <div className="text-slate-300 italic">"{j.prompt}"</div>
                  {j.errorReason && <div className="text-rose-400">error: {j.errorReason}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </CinemaCard>
  );
}

/* ------------------------------------------------------------------ */
function VideoStudio() {
  const VIDEO_TYPES = [
    "newsroom_screen",
    "podcast_intro",
    "broll",
    "transition",
    "led_wall",
    "explainer",
    "background_loop",
    "custom",
  ] as const;
  const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "21:9"] as const;
  const [availability, setAvailability] = useState<{ available: boolean; mockMode: boolean; realSendAllowed: boolean } | null>(null);
  const [productions, setProductions] = useState<any[]>([]);
  const [productionId, setProductionId] = useState<string>("");
  const [videoType, setVideoType] = useState<(typeof VIDEO_TYPES)[number]>("broll");
  const [prompt, setPrompt] = useState<string>("");
  const [durationSeconds, setDurationSeconds] = useState<number>(5);
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECT_RATIOS)[number]>("16:9");
  const [provider, setProvider] = useState<"mock" | "runway">("mock");
  const [jobs, setJobs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const load = async () => {
    const [a, p, l] = await Promise.all([
      jget("/video/runway/availability"),
      jget("/productions"),
      jget("/video/runway/list"),
    ]);
    setAvailability({
      available: !!a?.available,
      mockMode: !!a?.mockMode,
      realSendAllowed: !!a?.realSendAllowed,
    });
    setProductions(p?.productions || []);
    setJobs(l?.jobs || []);
  };
  useEffect(() => {
    load();
  }, []);

  const generate = async () => {
    setMsg("");
    if (!prompt.trim()) {
      setMsg("Enter a video prompt.");
      return;
    }
    if (provider === "runway") {
      if (!availability?.available) {
        setMsg("Runway is not configured.");
        return;
      }
      if (!window.confirm("Submit draft video job to Runway? This calls a paid external API. Output stays as a Draft, internal-only, with no public URL, no Unreal import, and no 4D send.")) {
        return;
      }
    }
    setBusy(true);
    try {
      const path = provider === "mock" ? "/video/runway/generate-mock" : "/video/runway/generate";
      const body: any = {
        videoType,
        prompt: prompt.trim(),
        durationSeconds,
        aspectRatio,
      };
      if (productionId) body.productionId = productionId;
      if (provider === "runway") body.confirm = true;
      const r = await jpost(path, body);
      if (!r?.ok) {
        setMsg(`Failed: ${r?.error || "unknown"}`);
      } else {
        setMsg(`Saved Draft video job ${r.job.id} (${r.job.status}).`);
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <CinemaCard title="Video Studio" subtitle="Mock + Runway · Draft only · Internal only · No public URL · No Unreal import · No 4D send">
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2" data-testid="video-badges">
          <Badge variant="outline" className="border-amber-500/40 text-amber-300">Draft</Badge>
          <Badge variant="outline" className="border-amber-500/40 text-amber-300">Internal Only</Badge>
          <Badge variant="outline" className="border-amber-500/40 text-amber-300">No Public URL</Badge>
          <Badge variant="outline" className="border-rose-500/40 text-rose-300">No Unreal Import</Badge>
          <Badge variant="outline" className="border-rose-500/40 text-rose-300">No 4D Send</Badge>
          {availability?.available ? (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">Runway configured</Badge>
          ) : (
            <Badge variant="outline" className="border-slate-500/40 text-slate-300">Runway not configured</Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Production (optional)</Label>
            <select
              data-testid="select-video-production"
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm"
              value={productionId}
              onChange={(e) => setProductionId(e.target.value)}
            >
              <option value="">— Standalone video —</option>
              {productions.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Video Type</Label>
            <select
              data-testid="select-video-type"
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm"
              value={videoType}
              onChange={(e) => setVideoType(e.target.value as any)}
            >
              {VIDEO_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Duration (seconds)</Label>
            <Input
              type="number"
              data-testid="input-video-duration"
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
              min={1}
              max={60}
            />
          </div>
          <div className="space-y-2">
            <Label>Aspect Ratio</Label>
            <select
              data-testid="select-video-aspect"
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-sm"
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as any)}
            >
              {ASPECT_RATIOS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Provider</Label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={provider === "mock" ? "default" : "outline"}
                onClick={() => setProvider("mock")}
                data-testid="button-video-provider-mock"
              >Mock</Button>
              <Button
                size="sm"
                variant={provider === "runway" ? "default" : "outline"}
                onClick={() => setProvider("runway")}
                disabled={!availability?.available}
                data-testid="button-video-provider-runway"
              >Runway</Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="video-prompt">Video prompt</Label>
          <Textarea
            id="video-prompt"
            data-testid="textarea-video-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="e.g. Cinematic slow pan across a futuristic newsroom with blue holographic screens…"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={generate} disabled={busy} data-testid="button-video-generate">
            {busy ? "Submitting…" : `Generate ${provider === "mock" ? "(Mock)" : "(Runway)"}`}
          </Button>
          {msg && <div className="text-xs text-slate-300" data-testid="text-video-msg">{msg}</div>}
        </div>

        <div className="border-t border-slate-800 pt-3">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">Generated video jobs</div>
          {jobs.length === 0 ? (
            <div className="text-xs text-slate-500">No video jobs yet.</div>
          ) : (
            <div className="space-y-2">
              {jobs.slice().reverse().map((j) => (
                <div
                  key={j.id}
                  className="border border-slate-800 rounded p-3 text-xs space-y-1"
                  data-testid={`card-video-job-${j.id}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{j.provider}</Badge>
                    <Badge variant="outline">{j.videoType}</Badge>
                    <Badge variant="outline">{j.aspectRatio}</Badge>
                    <Badge variant="outline">{j.durationSeconds}s</Badge>
                    <Badge variant="outline" className="border-amber-500/40 text-amber-300">{j.approvalStatus}</Badge>
                    <Badge variant="outline">{j.status}</Badge>
                    <Badge variant="outline" className="border-slate-500/40 text-slate-300">Internal Only</Badge>
                    <Badge variant="outline" className="border-rose-500/40 text-rose-300">No Unreal Import</Badge>
                    <Badge variant="outline" className="border-rose-500/40 text-rose-300">No 4D Send</Badge>
                  </div>
                  <div className="text-slate-400">
                    productionId: <span className="font-mono">{j.productionId ?? "(none)"}</span> ·
                    providerJobId: <span className="font-mono">{j.providerJobId ?? "(none)"}</span> ·
                    hash: <span className="font-mono">{String(j.promptHash).slice(0, 12)}…</span>
                  </div>
                  <div className="text-slate-300 italic">"{j.prompt}"</div>
                  {j.errorReason && <div className="text-rose-400">error: {j.errorReason}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </CinemaCard>
  );
}

/* ------------------ Asset Library & Package Viewer ------------------ */

function ProviderBadge({ provider }: { provider: string | null }) {
  if (!provider) return null;
  const p = String(provider).toLowerCase();
  const cls =
    p === "mock"
      ? "bg-slate-700 text-slate-200"
      : p === "openai"
      ? "bg-emerald-900 text-emerald-200"
      : p === "elevenlabs"
      ? "bg-purple-900 text-purple-200"
      : p === "meshy"
      ? "bg-sky-900 text-sky-200"
      : p === "runway"
      ? "bg-rose-900 text-rose-200"
      : "bg-slate-800 text-slate-300";
  return (
    <Badge data-testid={`badge-provider-${p}`} className={cls}>
      {provider}
    </Badge>
  );
}

function SafetyBadges() {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge data-testid="badge-draft" variant="outline">Draft</Badge>
      <Badge data-testid="badge-internal-only" variant="outline">Internal Only</Badge>
      <Badge data-testid="badge-no-public-url" variant="outline">No Public URL</Badge>
      <Badge data-testid="badge-no-unreal-send" variant="outline">No Unreal Send</Badge>
      <Badge data-testid="badge-no-4d-send" variant="outline">No 4D Send</Badge>
    </div>
  );
}

function AssetLibrary() {
  const [entries, setEntries] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    productionId: "",
    type: "",
    provider: "",
    status: "",
    approvalStatus: "",
    since: "",
    until: "",
    visibility: "",
    mockOnly: false,
    realOnly: false,
  });

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) {
        if (v === "" || v === false) continue;
        qs.set(k, String(v === true ? 1 : v));
      }
      const r = await fetch(`/api/admin/production-house/asset-library?${qs.toString()}`);
      const j = await r.json();
      setEntries(j.entries || []);
      setCounts(j.counts || {});
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card data-testid="card-asset-library">
      <CardHeader>
        <CardTitle>Asset Library</CardTitle>
        <CardDescription>
          Unified read-only view of every internally generated asset, job and manifest. No public
          URLs. No Unreal/4D sends.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SafetyBadges />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            ["productionId", "Production ID"],
            ["type", "Type"],
            ["provider", "Provider"],
            ["status", "Status"],
            ["approvalStatus", "Approval"],
            ["visibility", "Visibility"],
            ["since", "Since (ISO)"],
            ["until", "Until (ISO)"],
          ].map(([k, label]) => (
            <div key={k}>
              <Label className="text-xs">{label}</Label>
              <Input
                data-testid={`input-filter-${k}`}
                value={(filters as any)[k] ?? ""}
                onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))}
              />
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="input-filter-mockOnly"
              checked={filters.mockOnly}
              onChange={(e) =>
                setFilters((f) => ({ ...f, mockOnly: e.target.checked, realOnly: false }))
              }
            />
            Mock only
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="input-filter-realOnly"
              checked={filters.realOnly}
              onChange={(e) =>
                setFilters((f) => ({ ...f, realOnly: e.target.checked, mockOnly: false }))
              }
            />
            Real provider only
          </label>
        </div>
        <div className="flex gap-2">
          <Button data-testid="button-library-apply" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Apply Filters"}
          </Button>
          <div className="text-xs text-muted-foreground self-center" data-testid="text-library-counts">
            {Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(" · ") || "no entries"}
          </div>
        </div>
        <div className="space-y-2">
          {entries.map((e) => (
            <div
              key={`${e.kind}-${e.id}`}
              data-testid={`row-library-${e.kind}-${e.id}`}
              className="rounded border border-border p-3 text-xs flex items-center justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="font-mono truncate">{e.kind} · {e.id}</div>
                <div className="text-muted-foreground truncate">
                  production={e.productionId ?? "—"} · type={e.type ?? "—"} · status={e.status ?? "—"} · approval={e.approvalStatus ?? "—"}
                </div>
              </div>
              <ProviderBadge provider={e.provider} />
              <Badge variant="outline">{e.visibility}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProductionPackageViewer() {
  const [productionId, setProductionId] = useState("");
  const [pkg, setPkg] = useState<any>(null);
  const [checklist, setChecklist] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pkgTab, setPkgTab] = useState<"info" | "preview3d">("info");

  async function load() {
    if (!productionId) return;
    setLoading(true);
    setError("");
    try {
      const [pr, cr] = await Promise.all([
        fetch(`/api/admin/production-house/productions/${productionId}/package`),
        fetch(`/api/admin/production-house/productions/${productionId}/checklist`),
      ]);
      if (!pr.ok) { setError("Production not found"); setPkg(null); setChecklist(null); return; }
      const pj = await pr.json();
      const cj = await cr.json();
      setPkg(pj.package);
      setChecklist(cj.checklist);
    } finally {
      setLoading(false);
    }
  }

  const exportBtns: Array<[string, string]> = [
    ["full", "Full Package JSON"],
    ["production", "Production Manifest"],
    ["unreal", "Unreal Scene Manifest"],
    ["avatar", "Avatar Manifest"],
    ["4d", "4D Cue Manifest"],
    ["asset-bundle", "Asset Bundle Metadata"],
  ];

  return (
    <Card data-testid="card-production-package">
      <CardHeader>
        <CardTitle>Production Package Viewer</CardTitle>
        <CardDescription>
          Inspect every asset, manifest, and audit event for a single production. All exports stay
          internal-only with no secrets and no public URLs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SafetyBadges />
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label>Production ID</Label>
            <Input
              data-testid="input-package-production-id"
              value={productionId}
              onChange={(e) => setProductionId(e.target.value)}
            />
          </div>
          <Button data-testid="button-package-load" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Load"}
          </Button>
        </div>
        {error && <div className="text-sm text-red-400" data-testid="text-package-error">{error}</div>}
        {checklist && (
          <div className="rounded border border-border p-3" data-testid="block-checklist">
            <div className="font-semibold mb-2">
              Package Checklist · {checklist.completedCount}/{checklist.totalCount}
            </div>
            <ul className="text-xs grid grid-cols-2 gap-1">
              {[
                ["scriptExists", "Script exists"],
                ["roomSelected", "Room selected"],
                ["avatarSelected", "Avatar selected"],
                ["voiceAssetExists", "Voice asset exists"],
                ["assetJobsExist", "3D asset jobs exist"],
                ["videoJobsExist", "Video jobs exist"],
                ["fourDCuesExist", "4D cues exist"],
                ["manifestsExist", "Manifests exist"],
              ].map(([k, label]) => (
                <li key={k} className="flex items-center gap-2" data-testid={`checklist-${k}`}>
                  {checklist[k] ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-400" />
                  )}
                  <span>{label}</span>
                </li>
              ))}
              <li className="flex items-center gap-2 col-span-2" data-testid="checklist-readyForUnrealSandbox">
                <XCircle className="h-3 w-3 text-red-400" />
                <span>Ready for Unreal sandbox (locked false by default)</span>
              </li>
            </ul>
            <div className="text-xs text-muted-foreground mt-2">
              Approval state: <span className="font-mono">{checklist.approvalState}</span>
            </div>
          </div>
        )}
        {pkg && (
          <div className="space-y-3">
            <div className="inline-flex overflow-hidden rounded border border-border" data-testid="tabs-package-viewer">
              <button
                type="button"
                onClick={() => setPkgTab("info")}
                className={
                  "px-3 py-1 text-xs " +
                  (pkgTab === "info"
                    ? "bg-fuchsia-500/20 text-fuchsia-200"
                    : "text-muted-foreground hover:bg-muted/40")
                }
                aria-pressed={pkgTab === "info"}
                data-testid="tab-package-info"
              >
                Info & exports
              </button>
              <button
                type="button"
                onClick={() => setPkgTab("preview3d")}
                className={
                  "border-l border-border px-3 py-1 text-xs " +
                  (pkgTab === "preview3d"
                    ? "bg-fuchsia-500/20 text-fuchsia-200"
                    : "text-muted-foreground hover:bg-muted/40")
                }
                aria-pressed={pkgTab === "preview3d"}
                data-testid="tab-package-preview3d"
              >
                3D Preview
              </button>
            </div>
            {pkgTab === "preview3d" && (
              <Suspense
                fallback={
                  <div
                    className="flex h-[200px] w-full items-center justify-center rounded border border-border bg-muted/30 text-sm text-muted-foreground"
                    data-testid="pkg3d-section-suspense"
                  >
                    Loading 3D preview…
                  </div>
                }
              >
                <Package3DPreviewSection
                  productionId={productionId}
                  packageType={pkg?.packageType ?? pkg?.package?.packageType ?? null}
                  pkg={pkg}
                />
              </Suspense>
            )}
            {pkgTab === "info" && (
            <>
            <div className="flex flex-wrap gap-2">
              {exportBtns.map(([t, label]) => (
                <Button
                  key={t}
                  variant="outline"
                  size="sm"
                  data-testid={`button-export-${t}`}
                  onClick={() => {
                    window.open(
                      `/api/admin/production-house/productions/${productionId}/export/${t}`,
                      "_blank",
                    );
                  }}
                >
                  <Download className="h-3 w-3 mr-1" /> {label}
                </Button>
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-3 text-xs">
              <div className="rounded border border-border p-3" data-testid="block-voice-assets">
                <div className="font-semibold mb-1">Voice Assets ({pkg.voiceAssets?.length ?? 0})</div>
                {(pkg.voiceAssets ?? []).map((v: any) => (
                  <div key={v.id} className="font-mono truncate">{v.id} · {v.provider} · {v.status}</div>
                ))}
              </div>
              <div className="rounded border border-border p-3" data-testid="block-asset-jobs">
                <div className="font-semibold mb-1">3D Asset Jobs ({pkg.assetJobs?.length ?? 0})</div>
                {(pkg.assetJobs ?? []).map((v: any) => (
                  <div key={v.id} className="font-mono truncate">{v.id} · {v.provider} · {v.status}</div>
                ))}
              </div>
              <div className="rounded border border-border p-3" data-testid="block-video-jobs">
                <div className="font-semibold mb-1">Video Jobs ({pkg.videoJobs?.length ?? 0})</div>
                {(pkg.videoJobs ?? []).map((v: any) => (
                  <div key={v.id} className="font-mono truncate">{v.id} · {v.provider} · {v.status}</div>
                ))}
              </div>
              <div className="rounded border border-border p-3" data-testid="block-fourd-cues">
                <div className="font-semibold mb-1">4D Cues ({pkg.fourDCues?.length ?? 0})</div>
                {(pkg.fourDCues ?? []).map((v: any) => (
                  <div key={v.id} className="font-mono truncate">{v.id} · {v.effect} · {v.safetyFlag}</div>
                ))}
              </div>
              <div className="rounded border border-border p-3 md:col-span-2" data-testid="block-audit-history">
                <div className="font-semibold mb-1">Audit History ({pkg.auditHistory?.length ?? 0})</div>
                {(pkg.auditHistory ?? []).slice(-15).map((a: any, i: number) => (
                  <div key={i} className="font-mono truncate text-muted-foreground">
                    {a.timestamp ?? a.at ?? ""} · {a.action} · {a.detail}
                  </div>
                ))}
              </div>
            </div>
            </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ----------------- Unreal Sandbox Bridge (mock only) ---------------- */

function SandboxBadges() {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge data-testid="badge-sandbox-only" variant="outline">Sandbox Only</Badge>
      <Badge data-testid="badge-mock-unreal" variant="outline">Mock Unreal</Badge>
      <Badge data-testid="badge-no-real-send" variant="outline">No Real Send</Badge>
      <Badge data-testid="badge-no-render" variant="outline">No Render</Badge>
      <Badge data-testid="badge-no-asset-import" variant="outline">No Asset Import</Badge>
      <Badge data-testid="badge-no-4d-send-sandbox" variant="outline">No 4D Send</Badge>
    </div>
  );
}

function UnrealSandboxBridge() {
  const [status, setStatus] = useState<any>(null);
  const [productionId, setProductionId] = useState("");
  const [commandType, setCommandType] = useState("send_scene_manifest");
  const [sandboxOverride, setSandboxOverride] = useState(false);
  const [payloadHint, setPayloadHint] = useState("");
  const [checklist, setChecklist] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);
  const [sendResponse, setSendResponse] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadStatus() {
    const r = await fetch("/api/admin/production-house/unreal/sandbox/status");
    setStatus(await r.json());
  }
  async function loadHistory() {
    const qs = productionId ? `?productionId=${encodeURIComponent(productionId)}` : "";
    const r = await fetch(`/api/admin/production-house/unreal/sandbox/history${qs}`);
    const j = await r.json();
    setHistory(j.commands || []);
  }
  useEffect(() => { loadStatus(); loadHistory(); /* eslint-disable-next-line */ }, []);

  async function loadChecklist() {
    if (!productionId) return;
    const r = await fetch(`/api/admin/production-house/productions/${productionId}/checklist`);
    if (!r.ok) { setChecklist(null); return; }
    const j = await r.json();
    setChecklist(j.checklist);
  }
  async function validate() {
    if (!productionId) return;
    setLoading(true);
    try {
      const r = await fetch("/api/admin/production-house/unreal/sandbox/validate-package", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productionId, sandboxOverride }),
      });
      const j = await r.json();
      setValidation(j.validation);
    } finally {
      setLoading(false);
    }
  }
  async function sendCommand() {
    if (!productionId) return;
    setLoading(true);
    try {
      const r = await fetch("/api/admin/production-house/unreal/sandbox/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productionId, commandType, sandboxOverride, payloadHint }),
      });
      setSendResponse(await r.json());
      await loadHistory();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card data-testid="card-unreal-sandbox">
      <CardHeader>
        <CardTitle>Unreal Sandbox Bridge</CardTitle>
        <CardDescription>
          Unreal Sandbox Bridge validates and records production commands only. It does not connect
          to Unreal Engine, import assets, render video, or control hardware.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SandboxBadges />
        {status && (
          <div className="rounded border border-border p-3 text-xs" data-testid="block-sandbox-status">
            <div>mode: <span className="font-mono">{status.mode}</span></div>
            <div>realSendAllowed: <span className="font-mono">{String(status.realSendAllowed)}</span></div>
            <div>connectedToUnreal: <span className="font-mono">{String(status.connectedToUnreal)}</span></div>
            <div>movieRenderQueueEnabled: <span className="font-mono">{String(status.movieRenderQueueEnabled)}</span></div>
            <div>assetImportEnabled: <span className="font-mono">{String(status.assetImportEnabled)}</span></div>
          </div>
        )}
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label>Production ID</Label>
            <Input
              data-testid="input-sandbox-production-id"
              value={productionId}
              onChange={(e) => setProductionId(e.target.value)}
            />
          </div>
          <div>
            <Label>Command Type</Label>
            <select
              data-testid="select-sandbox-command-type"
              className="w-full bg-background border border-border rounded p-2 text-sm"
              value={commandType}
              onChange={(e) => setCommandType(e.target.value)}
            >
              {[
                "validate_package", "send_scene_manifest", "load_level",
                "set_camera", "set_lighting", "start_sequence", "render_preview",
              ].map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          <div>
            <Label>Payload Hint (optional)</Label>
            <Input
              data-testid="input-sandbox-payload-hint"
              value={payloadHint}
              onChange={(e) => setPayloadHint(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm self-end">
            <input
              type="checkbox"
              data-testid="input-sandbox-override"
              checked={sandboxOverride}
              onChange={(e) => setSandboxOverride(e.target.checked)}
            />
            sandboxOverride (allow unapproved productions)
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button data-testid="button-sandbox-load-checklist" variant="outline" onClick={loadChecklist}>
            View Package Checklist
          </Button>
          <Button data-testid="button-sandbox-validate" variant="outline" onClick={validate} disabled={loading}>
            Validate Package
          </Button>
          <Button data-testid="button-sandbox-send" onClick={sendCommand} disabled={loading}>
            <Play className="h-3 w-3 mr-1" /> Send to Sandbox Bridge
          </Button>
          <Button data-testid="button-sandbox-refresh-history" variant="outline" onClick={loadHistory}>
            <RefreshCcw className="h-3 w-3 mr-1" /> Refresh History
          </Button>
        </div>
        {checklist && (
          <div className="rounded border border-border p-3 text-xs" data-testid="block-sandbox-checklist">
            <div className="font-semibold mb-1">
              Checklist · {checklist.completedCount}/{checklist.totalCount} · approval={checklist.approvalState} · readyForUnrealSandbox=false
            </div>
          </div>
        )}
        {validation && (
          <div className="rounded border border-border p-3 text-xs" data-testid="block-sandbox-validation">
            <div className="font-semibold mb-1">
              Validation: {validation.ok ? "PASS" : "FAIL"} · approved={String(validation.approved)} · override={String(validation.sandboxOverride)}
            </div>
            {validation.failures?.length > 0 && (
              <div className="text-red-400">Failures: {validation.failures.join(", ")}</div>
            )}
          </div>
        )}
        {sendResponse && (
          <div className="rounded border border-border p-3 text-xs" data-testid="block-sandbox-response">
            <div className="font-mono">commandId: {sendResponse.commandId}</div>
            <div className="font-mono">status: {sendResponse.status}</div>
            <div className="font-mono">realSendAllowed: {String(sendResponse.realSendAllowed)}</div>
            <div>{sendResponse.message}</div>
          </div>
        )}
        <div className="rounded border border-border p-3 text-xs" data-testid="block-sandbox-history">
          <div className="font-semibold mb-1">Sandbox Command History ({history.length})</div>
          {history.slice(0, 25).map((c) => (
            <div key={c.id} className="font-mono truncate" data-testid={`row-sandbox-cmd-${c.id}`}>
              {c.createdAt} · {c.commandType} · {c.status} · {c.id}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------- Unreal Bridge Contract Viewer ------------------- */

function UnrealBridgeContractViewer() {
  const [tab, setTab] = useState<"contract" | "examples" | "validator" | "safety">("contract");
  const [contract, setContract] = useState<any>(null);
  const [examples, setExamples] = useState<any[]>([]);
  const [payloadText, setPayloadText] = useState<string>("");
  const [validation, setValidation] = useState<any>(null);

  async function loadAll() {
    const c = await (await fetch("/api/admin/production-house/unreal/bridge-contract")).json();
    setContract(c.contract);
    const e = await (await fetch("/api/admin/production-house/unreal/bridge-contract/example-payloads")).json();
    setExamples(e.examples || []);
  }
  useEffect(() => { loadAll(); }, []);

  async function validate() {
    let body: any;
    try { body = JSON.parse(payloadText || "{}"); }
    catch { setValidation({ ok: false, failures: ["invalid_json"], errorCodes: ["INVALID_PAYLOAD"] }); return; }
    const r = await fetch("/api/admin/production-house/unreal/bridge-contract/validate-payload", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json();
    setValidation(j.validation);
  }

  function copyJson(obj: unknown) {
    navigator.clipboard?.writeText(JSON.stringify(obj, null, 2)).catch(() => {});
  }

  return (
    <Card data-testid="card-bridge-contract">
      <CardHeader>
        <CardTitle>Unreal Bridge Contract</CardTitle>
        <CardDescription>
          Formal specification for a FUTURE local Unreal workstation bridge. Documentation,
          example payloads, and validation only — no real Unreal sends, no Movie Render Queue,
          no asset imports, no 4D hardware, no publishing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge data-testid="badge-bridge-spec-only" variant="outline">Spec Only</Badge>
          <Badge data-testid="badge-bridge-dry-run" variant="outline">Dry Run Only</Badge>
          <Badge data-testid="badge-bridge-no-real-send" variant="outline">No Real Send</Badge>
          <Badge data-testid="badge-bridge-no-mrq" variant="outline">No MRQ</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["contract","examples","validator","safety"] as const).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={tab === t ? "default" : "outline"}
              data-testid={`tab-bridge-${t}`}
              onClick={() => setTab(t)}
            >{t}</Button>
          ))}
          <Button size="sm" variant="outline" data-testid="button-bridge-download"
            onClick={() => window.open("/api/admin/production-house/unreal/bridge-contract/export", "_blank")}>
            <Download className="h-3 w-3 mr-1" /> Download Contract JSON
          </Button>
        </div>

        {tab === "contract" && contract && (
          <div data-testid="block-bridge-contract" className="space-y-2 text-xs">
            <div className="font-mono">version: {contract.version} · mode: {contract.mode} · realSendAllowed: {String(contract.realSendAllowed)} · dryRunDefault: {String(contract.dryRunDefault)}</div>
            <div className="rounded border border-border p-2">
              <div className="font-semibold mb-1">Bridge URL</div>
              <div className="font-mono">{contract.bridgeUrl.structure}</div>
              <ul className="list-disc ml-5">
                {contract.bridgeUrl.examples.map((u: string) => <li key={u} className="font-mono">{u}</li>)}
              </ul>
            </div>
            <div className="rounded border border-border p-2">
              <div className="font-semibold mb-1">Required Headers</div>
              {contract.authentication.requiredHeaders.map((h: any) => (
                <div key={h.header} className="font-mono">{h.header}: {h.description}</div>
              ))}
            </div>
            <div className="rounded border border-border p-2">
              <div className="font-semibold mb-1">Supported Commands ({contract.supportedCommands.length})</div>
              {contract.supportedCommands.map((c: any) => (
                <div key={c.type} className="font-mono" data-testid={`row-bridge-cmd-${c.type}`}>
                  {c.type} — requires: [{c.requiresPayloadFields.join(", ")}]
                </div>
              ))}
            </div>
            <div className="rounded border border-border p-2">
              <div className="font-semibold mb-1">Error Codes</div>
              <div className="font-mono">{contract.errorResponseFormat.errorCodes.join(" · ")}</div>
            </div>
            <Button size="sm" variant="outline" data-testid="button-bridge-copy-contract" onClick={() => copyJson(contract)}>Copy Contract JSON</Button>
          </div>
        )}

        {tab === "examples" && (
          <div data-testid="block-bridge-examples" className="space-y-2 text-xs">
            {examples.map((ex) => (
              <div key={ex.name} className="rounded border border-border p-2" data-testid={`example-${ex.name}`}>
                <div className="font-semibold">{ex.name}</div>
                <div className="opacity-70 mb-1">{ex.description}</div>
                <pre className="overflow-x-auto bg-muted/30 p-2 rounded text-[10px]">{JSON.stringify(ex.payload, null, 2)}</pre>
                <Button size="sm" variant="outline" data-testid={`button-copy-example-${ex.name}`} onClick={() => copyJson(ex.payload)}>Copy</Button>
                <Button size="sm" variant="outline" className="ml-2" data-testid={`button-load-example-${ex.name}`} onClick={() => { setPayloadText(JSON.stringify(ex.payload, null, 2)); setTab("validator"); }}>Load in Validator</Button>
              </div>
            ))}
          </div>
        )}

        {tab === "validator" && (
          <div data-testid="block-bridge-validator" className="space-y-2 text-xs">
            <Label>Payload JSON</Label>
            <Textarea
              data-testid="input-bridge-payload"
              rows={14}
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              className="font-mono text-[11px]"
            />
            <Button size="sm" data-testid="button-bridge-validate" onClick={validate}>Validate</Button>
            {validation && (
              <div className="rounded border border-border p-2" data-testid="block-bridge-validation-result">
                <div className="font-semibold">{validation.ok ? "PASS" : "FAIL"}</div>
                {!validation.ok && (
                  <>
                    <div>Failures: {validation.failures.join(", ")}</div>
                    <div>Error codes: {validation.errorCodes.join(", ")}</div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "safety" && contract && (
          <div data-testid="block-bridge-safety" className="space-y-2 text-xs">
            <div className="rounded border border-border p-2">
              <div className="font-semibold mb-1">Safety Rules</div>
              <ul className="list-disc ml-5">
                {contract.safetyRules.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            </div>
            <div className="rounded border border-border p-2">
              <div className="font-semibold mb-1">Package Validation Rules</div>
              <ul className="list-disc ml-5">
                {contract.packageValidation.rules.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            </div>
            <div className="rounded border border-border p-2">
              <div className="font-semibold mb-1">Audit Requirements</div>
              <ul className="list-disc ml-5">
                {contract.auditRequirements.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ----------------- Local Bridge Stub Panel ------------------------- */

function LocalBridgeStubPanel() {
  const [health, setHealth] = useState<any>(null);
  const [commands, setCommands] = useState<string[]>([]);
  const [examples, setExamples] = useState<any[]>([]);
  const [payloadText, setPayloadText] = useState<string>("");
  const [response, setResponse] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [productionFilter, setProductionFilter] = useState("");

  async function loadHealth() {
    const r = await (await fetch("/api/admin/production-house/local-bridge/stub/health")).json();
    setHealth(r);
  }
  async function loadCommands() {
    const r = await (await fetch("/api/admin/production-house/local-bridge/stub/supported-commands")).json();
    setCommands(r.commands || []);
  }
  async function loadExamples() {
    const r = await (await fetch("/api/admin/production-house/unreal/bridge-contract/example-payloads")).json();
    setExamples(r.examples || []);
  }
  async function loadHistory() {
    const qs = productionFilter ? `?productionId=${encodeURIComponent(productionFilter)}` : "";
    const r = await (await fetch(`/api/admin/production-house/local-bridge/stub/history${qs}`)).json();
    setHistory(r.jobs || []);
  }
  useEffect(() => { loadHealth(); loadCommands(); loadExamples(); loadHistory(); /* eslint-disable-next-line */ }, []);

  async function send() {
    let body: any;
    try { body = JSON.parse(payloadText || "{}"); }
    catch { setResponse({ ok: false, error: "invalid_json" }); return; }
    const r = await fetch("/api/admin/production-house/local-bridge/stub/send", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setResponse(await r.json());
    await loadHistory();
  }

  return (
    <Card data-testid="card-local-bridge-stub">
      <CardHeader>
        <CardTitle>Local Bridge Stub</CardTitle>
        <CardDescription>
          Local in-process stub that simulates the future Unreal workstation bridge. Accepts only
          valid dry-run bridge contract payloads. Never connects to Unreal Engine, never renders,
          never imports assets, never sends 4D hardware commands, never publishes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge data-testid="badge-local-stub" variant="outline">Local Stub</Badge>
          <Badge data-testid="badge-local-stub-dry-run" variant="outline">Dry Run Only</Badge>
          <Badge data-testid="badge-local-stub-no-real-unreal" variant="outline">No Real Unreal</Badge>
          <Badge data-testid="badge-local-stub-no-render" variant="outline">No Render</Badge>
          <Badge data-testid="badge-local-stub-no-asset-import" variant="outline">No Asset Import</Badge>
          <Badge data-testid="badge-local-stub-no-4d-send" variant="outline">No 4D Send</Badge>
        </div>

        {health && (
          <div className="rounded border border-border p-3 text-xs" data-testid="block-local-stub-health">
            <div className="font-semibold mb-1">Health</div>
            <div className="font-mono">status: {health.status} · mode: {health.mode}</div>
            <div className="font-mono">dryRunOnly: {String(health.dryRunOnly)} · realSendAllowed: {String(health.realSendAllowed)}</div>
            <div className="font-mono">connectedToUnreal: {String(health.connectedToUnreal)} · movieRenderQueueEnabled: {String(health.movieRenderQueueEnabled)}</div>
            <div className="font-mono">assetImportEnabled: {String(health.assetImportEnabled)} · fourDHardwareSendAllowed: {String(health.fourDHardwareSendAllowed)}</div>
            <div className="opacity-70 mt-1">{health.notice}</div>
          </div>
        )}

        <div className="rounded border border-border p-3 text-xs" data-testid="block-local-stub-commands">
          <div className="font-semibold mb-1">Supported Commands ({commands.length})</div>
          <div className="font-mono">{commands.join(" · ")}</div>
        </div>

        <div className="rounded border border-border p-3 text-xs" data-testid="block-local-stub-editor">
          <div className="font-semibold mb-1">Payload Editor</div>
          <div className="flex flex-wrap gap-1 mb-2">
            {examples.map((ex: any) => (
              <Button
                key={ex.name}
                size="sm"
                variant="outline"
                data-testid={`button-stub-load-${ex.name}`}
                onClick={() => setPayloadText(JSON.stringify(ex.payload, null, 2))}
              >Load: {ex.name}</Button>
            ))}
          </div>
          <Textarea
            data-testid="input-stub-payload"
            rows={14}
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            className="font-mono text-[11px]"
          />
          <div className="mt-2 flex gap-2">
            <Button size="sm" data-testid="button-stub-send" onClick={send}>
              <Play className="h-3 w-3 mr-1" /> Send Dry-Run
            </Button>
          </div>
        </div>

        {response && (
          <div className="rounded border border-border p-3 text-xs" data-testid="block-local-stub-response">
            <div className="font-semibold mb-1">Response</div>
            <pre className="overflow-x-auto bg-muted/30 p-2 rounded text-[10px]">{JSON.stringify(response, null, 2)}</pre>
          </div>
        )}

        <div className="rounded border border-border p-3 text-xs" data-testid="block-local-stub-history">
          <div className="font-semibold mb-1 flex items-center gap-2">
            <span>Bridge Job History ({history.length})</span>
            <Input
              className="h-7 w-48"
              data-testid="input-stub-history-filter"
              placeholder="filter by productionId"
              value={productionFilter}
              onChange={(e) => setProductionFilter(e.target.value)}
            />
            <Button size="sm" variant="outline" data-testid="button-stub-refresh-history" onClick={loadHistory}>
              <RefreshCcw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>
          {history.slice(0, 25).map((j) => (
            <div key={j.id} className="font-mono truncate" data-testid={`row-stub-job-${j.id}`}>
              {j.createdAt} · {j.commandType} · {j.status} · {j.id}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------- 4D Hardware Sandbox Panel ----------------------- */

function FourDSandboxPanel() {
  const [health, setHealth] = useState<any>(null);
  const [effects, setEffects] = useState<string[]>([]);
  const [examples, setExamples] = useState<any[]>([]);
  const [payloadText, setPayloadText] = useState<string>("");
  const [validation, setValidation] = useState<any>(null);
  const [response, setResponse] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [productionFilter, setProductionFilter] = useState("");

  async function loadHealth() {
    const r = await (await fetch("/api/admin/production-house/4d/sandbox/health")).json();
    setHealth(r);
  }
  async function loadEffects() {
    const r = await (await fetch("/api/admin/production-house/4d/sandbox/supported-effects")).json();
    setEffects(r.effects || []);
    setExamples(r.examples || []);
  }
  async function loadHistory() {
    const qs = productionFilter ? `?productionId=${encodeURIComponent(productionFilter)}` : "";
    const r = await (await fetch(`/api/admin/production-house/4d/sandbox/history${qs}`)).json();
    setHistory(r.jobs || []);
  }
  useEffect(() => { loadHealth(); loadEffects(); loadHistory(); /* eslint-disable-next-line */ }, []);

  async function parseBody() {
    try { return JSON.parse(payloadText || "{}"); }
    catch { return null; }
  }
  async function validate() {
    const body = await parseBody();
    if (!body) { setValidation({ ok: false, failures: ["invalid_json"], errorCodes: ["INVALID_PAYLOAD"] }); return; }
    const r = await fetch("/api/admin/production-house/4d/sandbox/validate-cue", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setValidation((await r.json()).validation);
  }
  async function send() {
    const body = await parseBody();
    if (!body) { setResponse({ ok: false, error: "invalid_json" }); return; }
    const r = await fetch("/api/admin/production-house/4d/sandbox/send", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setResponse(await r.json());
    await loadHistory();
  }

  return (
    <Card data-testid="card-four-d-sandbox">
      <CardHeader>
        <CardTitle>4D Hardware Sandbox</CardTitle>
        <CardDescription>
          Sandbox-only contract for future physical 4D cinema integrations. Validates cue payloads
          and returns deterministic mock responses. Never connects to physical devices, never sends
          DMX, OSC, UDP, MIDI, serial, relay, fog, wind, scent, vibration, motion-seat, or lighting
          commands.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge data-testid="badge-4d-sandbox" variant="outline">4D Sandbox</Badge>
          <Badge data-testid="badge-4d-dry-run" variant="outline">Dry Run Only</Badge>
          <Badge data-testid="badge-4d-no-real-hw" variant="outline">No Real Hardware</Badge>
          <Badge data-testid="badge-4d-no-dmx" variant="outline">No DMX Send</Badge>
          <Badge data-testid="badge-4d-no-osc-udp" variant="outline">No OSC/UDP Send</Badge>
          <Badge data-testid="badge-4d-no-motion-seat" variant="outline">No Motion Seat</Badge>
          <Badge data-testid="badge-4d-no-fog-wind-scent" variant="outline">No Fog/Wind/Scent</Badge>
          <Badge data-testid="badge-4d-no-public-output" variant="outline">No Public Output</Badge>
        </div>

        {health && (
          <div className="rounded border border-border p-3 text-xs" data-testid="block-4d-health">
            <div className="font-semibold mb-1">Health</div>
            <div className="font-mono">status: {health.status} · mode: {health.mode}</div>
            <div className="font-mono">dryRunOnly: {String(health.dryRunOnly)} · realSendAllowed: {String(health.realSendAllowed)}</div>
            <div className="font-mono">connectedToHardware: {String(health.connectedToHardware)} · dmxEnabled: {String(health.dmxEnabled)} · oscEnabled: {String(health.oscEnabled)}</div>
            <div className="font-mono">motionSeatEnabled: {String(health.motionSeatEnabled)} · fogEnabled: {String(health.fogEnabled)} · scentEnabled: {String(health.scentEnabled)}</div>
            <div className="opacity-70 mt-1">{health.notice}</div>
          </div>
        )}

        <div className="rounded border border-border p-3 text-xs" data-testid="block-4d-effects">
          <div className="font-semibold mb-1">Supported Effects ({effects.length})</div>
          <div className="font-mono">{effects.join(" · ")}</div>
        </div>

        <div className="rounded border border-border p-3 text-xs" data-testid="block-4d-editor">
          <div className="font-semibold mb-1">Cue Payload Editor</div>
          <div className="flex flex-wrap gap-1 mb-2">
            {examples.map((ex: any) => (
              <Button
                key={ex.name}
                size="sm"
                variant="outline"
                data-testid={`button-4d-load-${ex.name}`}
                onClick={() => setPayloadText(JSON.stringify(ex.cue, null, 2))}
              >Load: {ex.name}</Button>
            ))}
          </div>
          <Textarea
            data-testid="input-4d-payload"
            rows={14}
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            className="font-mono text-[11px]"
          />
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" data-testid="button-4d-validate" onClick={validate}>Validate</Button>
            <Button size="sm" data-testid="button-4d-send" onClick={send}>
              <Play className="h-3 w-3 mr-1" /> Send Dry-Run Cue
            </Button>
          </div>
        </div>

        {validation && (
          <div className="rounded border border-border p-3 text-xs" data-testid="block-4d-validation">
            <div className="font-semibold mb-1">Validation: {validation.ok ? "PASS" : "FAIL"}</div>
            {!validation.ok && <div className="font-mono">{validation.errorCodes.join(", ")}</div>}
          </div>
        )}
        {response && (
          <div className="rounded border border-border p-3 text-xs" data-testid="block-4d-response">
            <div className="font-semibold mb-1">Response</div>
            <pre className="overflow-x-auto bg-muted/30 p-2 rounded text-[10px]">{JSON.stringify(response, null, 2)}</pre>
          </div>
        )}

        <div className="rounded border border-border p-3 text-xs" data-testid="block-4d-safety">
          <div className="font-semibold mb-1">Safety Rules</div>
          <ul className="list-disc ml-5">
            <li>Never connects to physical 4D hardware.</li>
            <li>Never sends DMX, OSC, UDP, MIDI, serial, or relay commands.</li>
            <li>Never controls fog, wind, scent, vibration, motion-seat, or lighting devices.</li>
            <li>All cues are dry-run only; realSendAllowed is locked to false.</li>
            <li>publicUrl and signedUrl must be null; visibility must be admin_only_internal.</li>
            <li>All accepted and rejected attempts are audit-logged.</li>
          </ul>
        </div>

        <div className="rounded border border-border p-3 text-xs" data-testid="block-4d-history">
          <div className="font-semibold mb-1 flex items-center gap-2">
            <span>Cue Job History ({history.length})</span>
            <Input
              className="h-7 w-48"
              data-testid="input-4d-history-filter"
              placeholder="filter by productionId"
              value={productionFilter}
              onChange={(e) => setProductionFilter(e.target.value)}
            />
            <Button size="sm" variant="outline" data-testid="button-4d-refresh-history" onClick={loadHistory}>
              <RefreshCcw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>
          {history.slice(0, 25).map((j) => (
            <div key={j.id} className="font-mono truncate" data-testid={`row-4d-job-${j.id}`}>
              {j.createdAt} · {j.effectType} · {j.status} · {j.id}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------- Readiness Center Panel -------------------------- */

function ReadinessCenterPanel() {
  const [productions, setProductions] = useState<any[]>([]);
  const [productionId, setProductionId] = useState<string>("");
  const [report, setReport] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  async function loadProductions() {
    const r = await (await fetch("/api/admin/production-house/productions")).json();
    setProductions(r.productions || []);
    if ((r.productions || []).length && !productionId) setProductionId(r.productions[0].id);
  }
  async function loadCurrent(id: string) {
    if (!id) return;
    const r = await (await fetch(`/api/admin/production-house/readiness/${id}`)).json();
    setReport(r.report);
    const h = await (await fetch(`/api/admin/production-house/readiness/${id}/history`)).json();
    setHistory(h.reports || []);
  }
  async function runAnalysis() {
    if (!productionId) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/production-house/readiness/${productionId}/analyze`, { method: "POST" });
      const j = await r.json();
      setReport(j.report || null);
      const h = await (await fetch(`/api/admin/production-house/readiness/${productionId}/history`)).json();
      setHistory(h.reports || []);
    } finally { setBusy(false); }
  }

  useEffect(() => { loadProductions(); }, []);
  useEffect(() => { loadCurrent(productionId); }, [productionId]);

  const channels: Array<{ key: string; label: string }> = [
    { key: "aiPackageScore", label: "AI Package" },
    { key: "assetScore", label: "Assets" },
    { key: "unrealSandboxScore", label: "Unreal Sandbox" },
    { key: "fourDSandboxScore", label: "4D Sandbox" },
    { key: "futureRealUnrealScore", label: "Future Real Unreal (capped)" },
    { key: "futureReal4DScore", label: "Future Real 4D (capped)" },
  ];

  return (
    <Card data-testid="card-readiness-center">
      <CardHeader>
        <CardTitle>Readiness Center</CardTitle>
        <CardDescription>
          Internal scoring only. Analyzes production packages for AI, asset, Unreal sandbox, 4D
          sandbox, and future real integrations. Future-real channels are intentionally capped
          because no real Unreal or 4D bridge exists yet. Never auto-approves, never publishes,
          never enables real sends.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge data-testid="badge-readiness-internal" variant="outline">Internal Analysis Only</Badge>
          <Badge data-testid="badge-readiness-no-real-unreal" variant="outline">No Real Unreal</Badge>
          <Badge data-testid="badge-readiness-no-real-4d" variant="outline">No Real 4D</Badge>
          <Badge data-testid="badge-readiness-no-publishing" variant="outline">No Publishing</Badge>
          <Badge data-testid="badge-readiness-no-auto-approval" variant="outline">No Auto-Approval</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Label>Production:</Label>
          <select
            data-testid="select-readiness-production"
            className="bg-background border border-border rounded px-2 py-1 text-xs"
            value={productionId}
            onChange={(e) => setProductionId(e.target.value)}
          >
            <option value="">— select —</option>
            {productions.map((p) => (
              <option key={p.id} value={p.id}>{p.title} ({p.id.slice(0, 8)})</option>
            ))}
          </select>
          <Button size="sm" data-testid="button-readiness-analyze" onClick={runAnalysis} disabled={!productionId || busy}>
            <Play className="h-3 w-3 mr-1" /> Run Analysis
          </Button>
        </div>

        {report && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="block-readiness-scores">
              <ScoreCard label="Overall" value={report.overallScore} testid="score-overall" />
              {channels.map((c) => (
                <ScoreCard
                  key={c.key}
                  label={c.label}
                  value={report[c.key]}
                  testid={`score-${c.key}`}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-border p-2" data-testid="block-readiness-blockers">
                <div className="font-semibold mb-1">Blockers ({report.blockers.length})</div>
                {report.blockers.map((c: any) => (
                  <div key={c.id} className="font-mono text-red-400" data-testid={`row-blocker-${c.id}`}>· {c.label}</div>
                ))}
                {report.blockers.length === 0 && <div className="opacity-60">None.</div>}
              </div>
              <div className="rounded border border-border p-2" data-testid="block-readiness-warnings">
                <div className="font-semibold mb-1">Warnings ({report.warnings.length})</div>
                {report.warnings.map((c: any) => (
                  <div key={c.id} className="font-mono text-amber-400" data-testid={`row-warning-${c.id}`}>· {c.label}</div>
                ))}
                {report.warnings.length === 0 && <div className="opacity-60">None.</div>}
              </div>
              <div className="rounded border border-border p-2" data-testid="block-readiness-passed">
                <div className="font-semibold mb-1">Passed ({report.passedChecks.length})</div>
                {report.passedChecks.map((c: any) => (
                  <div key={c.id} className="font-mono text-emerald-400" data-testid={`row-passed-${c.id}`}>· {c.label}</div>
                ))}
              </div>
              <div className="rounded border border-border p-2" data-testid="block-readiness-failed">
                <div className="font-semibold mb-1">Failed ({report.failedChecks.length})</div>
                {report.failedChecks.map((c: any) => (
                  <div key={c.id} className="font-mono" data-testid={`row-failed-${c.id}`}>· [{c.severity}] {c.label}</div>
                ))}
                {report.failedChecks.length === 0 && <div className="opacity-60">None.</div>}
              </div>
            </div>

            <div className="rounded border border-border p-2 text-xs" data-testid="block-readiness-channels">
              <div className="font-semibold mb-1">Channel Readiness</div>
              {channels.map((c) => (
                <div key={c.key} className="font-mono" data-testid={`channel-${c.key}`}>
                  {c.label}: {report[c.key]}/100
                </div>
              ))}
            </div>
          </>
        )}

        {history.length > 0 && (
          <div className="rounded border border-border p-2 text-xs" data-testid="block-readiness-history">
            <div className="font-semibold mb-1">History ({history.length})</div>
            {history.slice(0, 25).map((r: any) => (
              <div key={r.id} className="font-mono truncate" data-testid={`row-readiness-${r.id}`}>
                {r.createdAt} · overall {r.overallScore} · blockers {r.blockers.length} · {r.id}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreCard({ label, value, testid }: { label: string; value: number; testid: string }) {
  const color = value >= 75 ? "text-emerald-400" : value >= 40 ? "text-amber-400" : "text-red-400";
  return (
    <div className="rounded border border-border p-2 text-xs" data-testid={testid}>
      <div className="opacity-70">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="opacity-60">/ 100</div>
    </div>
  );
}

/* ----------------- Approval Board Panel ---------------------------- */

function ApprovalBoardPanel() {
  const [board, setBoard] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<any>(null);
  const [toState, setToState] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [resp, setResp] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function loadBoard() {
    const r = await (await fetch("/api/admin/production-house/approval-board")).json();
    setBoard(r.board || []);
  }
  async function loadDetail(id: string) {
    if (!id) { setDetail(null); return; }
    const r = await (await fetch(`/api/admin/production-house/approval-board/${id}`)).json();
    setDetail(r);
  }
  async function transition() {
    if (!selectedId || !toState) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/production-house/approval-board/${selectedId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toState, reason }),
      });
      const j = await r.json();
      setResp(j);
      setReason("");
      await loadBoard();
      await loadDetail(selectedId);
    } finally { setBusy(false); }
  }

  useEffect(() => { loadBoard(); }, []);
  useEffect(() => { loadDetail(selectedId); }, [selectedId]);

  return (
    <Card data-testid="card-approval-board">
      <CardHeader>
        <CardTitle>Approval Board</CardTitle>
        <CardDescription>
          Internal approval workflow. Moves productions through draft → needs review → internal
          review → sandbox approvals based on readiness reports. Never triggers real Unreal or
          4D commands. Never publishes. Never auto-approves.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge data-testid="badge-board-internal" variant="outline">Internal Workflow Only</Badge>
          <Badge data-testid="badge-board-no-real-unreal" variant="outline">No Real Unreal</Badge>
          <Badge data-testid="badge-board-no-real-4d" variant="outline">No Real 4D</Badge>
          <Badge data-testid="badge-board-no-publishing" variant="outline">No Publishing</Badge>
          <Badge data-testid="badge-board-no-auto-approval" variant="outline">No Auto-Approval</Badge>
        </div>

        <div className="rounded border border-border overflow-auto" data-testid="table-approval-board">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2">Title</th>
                <th className="text-left p-2">Stage</th>
                <th className="text-left p-2">Score</th>
                <th className="text-left p-2">Unreal SB</th>
                <th className="text-left p-2">4D SB</th>
                <th className="text-left p-2">Blockers/Warn</th>
                <th className="text-left p-2">Assets</th>
                <th className="text-left p-2"></th>
              </tr>
            </thead>
            <tbody>
              {board.map((r) => (
                <tr key={r.productionId} className="border-t border-border" data-testid={`row-board-${r.productionId}`}>
                  <td className="p-2 truncate max-w-[200px]">{r.title}</td>
                  <td className="p-2 font-mono">{r.stage}</td>
                  <td className="p-2">{r.overallScore ?? "—"}</td>
                  <td className="p-2">{r.unrealSandboxScore ?? "—"}</td>
                  <td className="p-2">{r.fourDSandboxScore ?? "—"}</td>
                  <td className="p-2">{r.blockerCount}/{r.warningCount}</td>
                  <td className="p-2 font-mono">
                    v{r.assetCompleteness.voiceAssets} a{r.assetCompleteness.assetJobs}{" "}
                    vid{r.assetCompleteness.videoJobs} usb{r.assetCompleteness.unrealSandboxCommands}{" "}
                    4d{r.assetCompleteness.fourDSandboxJobs}
                  </td>
                  <td className="p-2">
                    <Button size="sm" variant="outline" data-testid={`button-board-select-${r.productionId}`}
                      onClick={() => setSelectedId(r.productionId)}>
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {board.length === 0 && <div className="p-2 opacity-60">No productions.</div>}
        </div>

        {detail && (
          <div className="rounded border border-border p-2 space-y-2 text-xs" data-testid="block-approval-detail">
            <div className="font-semibold">
              {detail.title} · current stage:{" "}
              <span className="font-mono" data-testid="text-board-current-stage">{detail.stage}</span>
            </div>
            {detail.readiness && (
              <div className="font-mono">
                Overall {detail.readiness.overallScore}/100 · Blockers {detail.readiness.blockers.length} · Warnings {detail.readiness.warnings.length}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Label>Transition to:</Label>
              <select
                data-testid="select-board-to-state"
                className="bg-background border border-border rounded px-2 py-1 text-xs"
                value={toState}
                onChange={(e) => setToState(e.target.value)}
              >
                <option value="">—</option>
                {(detail.allowedStages ?? []).map((s: string) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <input
                data-testid="input-board-reason"
                className="bg-background border border-border rounded px-2 py-1 text-xs flex-1"
                placeholder="Reason (required for blocked / revision_requested)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button size="sm" data-testid="button-board-transition" onClick={transition} disabled={!toState || busy}>
                Transition
              </Button>
            </div>
            {resp && (
              <pre className="font-mono whitespace-pre-wrap bg-muted/30 p-2 rounded" data-testid="text-board-response">
                {JSON.stringify(resp, null, 2)}
              </pre>
            )}
            <div className="font-semibold">History ({detail.history?.length ?? 0})</div>
            {(detail.history ?? []).map((h: any) => (
              <div key={h.id} className="font-mono truncate" data-testid={`row-board-history-${h.id}`}>
                {h.createdAt} · {h.fromState} → {h.toState}{h.reason ? ` · "${h.reason}"` : ""}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ----------------- Real Unreal Bridge Setup Panel ------------------ */

function RealUnrealSetupPanel() {
  const [status, setStatus] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);
  const [handshake, setHandshake] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [healthHistory, setHealthHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    const s = await (await fetch("/api/admin/production-house/real-unreal/setup/status")).json();
    setStatus(s);
    const h = await (await fetch("/api/admin/production-house/real-unreal/setup/handshake-history")).json();
    setHistory(h.history || []);
    const hc = await (await fetch("/api/admin/production-house/real-unreal/setup/health-check-history")).json();
    setHealthHistory(hc.history || []);
  }
  async function validate() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/production-house/real-unreal/setup/validate-config", { method: "POST" });
      setValidation(await r.json());
    } finally { setBusy(false); }
  }
  async function runHandshake() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/production-house/real-unreal/setup/handshake-dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const j = await r.json();
      setHandshake(j);
      await loadAll();
    } finally { setBusy(false); }
  }
  async function runNetworkHealthCheck() {
    if (!window.confirm(
      "Send a real network health-check call to the configured Unreal bridge?\n\n" +
      "This sends ONLY a dry-run health_check payload. No production data, " +
      "no render/import commands, no 4D commands.",
    )) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/production-house/real-unreal/setup/health-check-network", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      setHealth(await r.json());
      const h = await (await fetch("/api/admin/production-house/real-unreal/setup/health-check-history")).json();
      setHealthHistory(h.history || []);
    } finally { setBusy(false); }
  }

  useEffect(() => { loadAll(); }, []);

  return (
    <Card data-testid="card-real-unreal-setup">
      <CardHeader>
        <CardTitle>Real Unreal Bridge Setup</CardTitle>
        <CardDescription>
          <strong>This page does not enable real Unreal commands. It only verifies dry-run
          bridge readiness.</strong> Configure UNREAL_BRIDGE_BASE_URL, UNREAL_BRIDGE_TOKEN,
          and UNREAL_BRIDGE_MODE (must be <code>dry_run</code> or <code>disabled</code>). Tokens
          are never returned by status responses.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge data-testid="badge-rus-dry-run" variant="outline">Dry Run Only</Badge>
          <Badge data-testid="badge-rus-real-send-disabled" variant="outline">Real Send Disabled</Badge>
          <Badge data-testid="badge-rus-no-render" variant="outline">No Render</Badge>
          <Badge data-testid="badge-rus-no-asset-import" variant="outline">No Asset Import</Badge>
          <Badge data-testid="badge-rus-no-4d-send" variant="outline">No 4D Send</Badge>
          <Badge data-testid="badge-rus-no-publishing" variant="outline">No Publishing</Badge>
        </div>

        {status && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs" data-testid="block-rus-status">
            <StatusBox label="Configured" ok={status.configured} testid="rus-configured" />
            <StatusBox label="Has Base URL" ok={status.hasBaseUrl} testid="rus-has-base-url" />
            <StatusBox label="Has Token" ok={status.hasToken} testid="rus-has-token" />
            <StatusBox label={`Mode: ${status.mode}`} ok={status.mode === "dry_run"} testid="rus-mode" />
            <StatusBox label="Dry Run Only" ok={status.dryRunOnly} testid="rus-dry-run-only" />
            <StatusBox label="Real Send Allowed" ok={!status.realSendAllowed} negate testid="rus-real-send" />
            <StatusBox label="Endpoint Host" ok={!!status.endpointHost} testid="rus-endpoint-host" />
            <StatusBox label="Publishing" ok={!status.publishingEnabled} negate testid="rus-publishing" />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" data-testid="button-rus-validate" onClick={validate} disabled={busy}>
            Validate Config
          </Button>
          <Button size="sm" data-testid="button-rus-handshake" onClick={runHandshake} disabled={busy}>
            <Play className="h-3 w-3 mr-1" /> Run Dry-Run Handshake
          </Button>
          <Button size="sm" variant="secondary" data-testid="button-rus-network-health" onClick={runNetworkHealthCheck} disabled={busy}>
            <Play className="h-3 w-3 mr-1" /> Run Network Health Check
          </Button>
        </div>
        <div className="text-xs opacity-70" data-testid="text-rus-network-warning">
          <strong>This sends only a dry-run health_check payload to {status?.endpointHost || "(host)"}{"/health/dry-run"}.
          It does not send production data, render commands, import commands, or 4D commands.</strong>
        </div>
        {health && (
          <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
            data-testid="text-rus-network-response">{JSON.stringify(health, null, 2)}</pre>
        )}
        <div className="rounded border border-border p-2 text-xs" data-testid="block-rus-network-history">
          <div className="font-semibold mb-1">Network Health Check History ({healthHistory.length})</div>
          {healthHistory.slice(0, 50).map((r: any) => (
            <div key={r.id} className="font-mono truncate" data-testid={`row-rus-health-${r.id}`}>
              {r.createdAt} · {r.status} · http={r.httpStatus ?? "—"} · host={r.endpointHost || "—"} · {r.endpointPath} · {r.id}
            </div>
          ))}
          {healthHistory.length === 0 && <div className="opacity-60">No network health checks yet.</div>}
        </div>

        {validation && (
          <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
            data-testid="text-rus-validation">{JSON.stringify(validation, null, 2)}</pre>
        )}

        {handshake && (
          <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
            data-testid="text-rus-handshake-response">{JSON.stringify(handshake, null, 2)}</pre>
        )}

        <div className="rounded border border-border p-2 text-xs" data-testid="block-rus-history">
          <div className="font-semibold mb-1">Handshake History ({history.length})</div>
          {history.slice(0, 50).map((r: any) => (
            <div key={r.id} className="font-mono truncate" data-testid={`row-rus-handshake-${r.id}`}>
              {r.createdAt} · {r.status} · host={r.endpointHost || "—"} · {r.id}
            </div>
          ))}
          {history.length === 0 && <div className="opacity-60">No handshakes yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBox({ label, ok, testid, negate }: { label: string; ok: boolean; testid: string; negate?: boolean }) {
  const good = negate ? ok : ok;
  return (
    <div className="rounded border border-border p-2" data-testid={testid}>
      <div className="opacity-70">{label}</div>
      <div className={`font-bold ${good ? "text-emerald-400" : "text-red-400"}`}>
        {good ? "OK" : "MISSING"}
      </div>
    </div>
  );
}

/* ----------------- Real Unreal Dry-Run Validation Panel ------------ */

function RealUnrealPrepareSceneDryRunPanel() {
  const { data: prodList } = useQuery<ProductionListResponse>({
    queryKey: ["/api/admin/production-house/productions"],
  });
  const [status, setStatus] = useState<any>(null);
  const [productionId, setProductionId] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const PREFIX = "/api/admin/production-house/real-unreal/prepare-scene-dry-run";

  async function loadStatus() {
    setStatus(await (await fetch(`${PREFIX}/status`)).json());
  }
  async function loadHistory(pid?: string) {
    const url = pid ? `${PREFIX}/history?productionId=${pid}` : `${PREFIX}/history`;
    const h = await (await fetch(url)).json();
    setHistory(h.history || []);
  }
  async function runPrepareScene() {
    if (!productionId) return;
    if (!window.confirm(
      "Send a real dry-run prepare_scene summary to the configured Unreal bridge?\n\n" +
      "This sends only a sanitized prepare_scene summary. It does not load levels, " +
      "import assets, attach avatars, attach media, start Sequencer, render scenes, " +
      "or execute real Unreal commands.",
    )) return;
    setBusy(true);
    try {
      const r = await fetch(`${PREFIX}/${productionId}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      setResult(await r.json());
      await loadHistory(productionId);
    } finally { setBusy(false); }
  }

  useEffect(() => { loadStatus(); loadHistory(); }, []);
  useEffect(() => { if (productionId) loadHistory(productionId); }, [productionId]);

  return (
    <Card data-testid="card-real-unreal-prepare-scene">
      <CardHeader>
        <CardTitle>Real Unreal Prepare-Scene Dry-Run</CardTitle>
        <CardDescription>
          <strong>This sends only a dry-run prepare_scene summary. It does not load levels,
          import assets, attach avatars, attach media, start Sequencer, render scenes, or
          execute real Unreal commands.</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge data-testid="badge-rups-dry-run" variant="outline">Dry Run Only</Badge>
          <Badge data-testid="badge-rups-no-real-send" variant="outline">Real Send Disabled</Badge>
          <Badge data-testid="badge-rups-no-render" variant="outline">No Render</Badge>
          <Badge data-testid="badge-rups-no-import" variant="outline">No Asset Import</Badge>
          <Badge data-testid="badge-rups-no-level-load" variant="outline">No Level Load</Badge>
          <Badge data-testid="badge-rups-no-sequencer" variant="outline">No Sequencer</Badge>
          <Badge data-testid="badge-rups-no-mrq" variant="outline">No MRQ</Badge>
          <Badge data-testid="badge-rups-no-avatar-attach" variant="outline">No Avatar Attach</Badge>
          <Badge data-testid="badge-rups-no-video-attach" variant="outline">No Video Attach</Badge>
          <Badge data-testid="badge-rups-no-4d" variant="outline">No 4D Send</Badge>
          <Badge data-testid="badge-rups-no-publishing" variant="outline">No Publishing</Badge>
        </div>
        {status && (
          <div className="text-xs font-mono opacity-80" data-testid="text-rups-status">
            Bridge configured: {String(status.bridge?.configured)} · mode: {status.bridge?.mode} ·
            required stage: {status.requiredApprovalStage} · endpoint: {status.endpointPath}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Label>Production:</Label>
          <select
            data-testid="select-rups-production"
            className="bg-background border border-border rounded px-2 py-1 text-xs"
            value={productionId} onChange={(e) => setProductionId(e.target.value)}
          >
            <option value="">—</option>
            {(prodList?.productions ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
          <Button size="sm" variant="secondary" data-testid="button-rups-send"
            onClick={runPrepareScene} disabled={!productionId || busy}>
            <Play className="h-3 w-3 mr-1" /> Send Prepare-Scene Dry-Run
          </Button>
        </div>
        {result && (
          <div className="space-y-1" data-testid="block-rups-result">
            <div className="text-xs font-semibold">
              Status: {result.status} (http={result.record?.httpStatus ?? "—"})
            </div>
            {result.sanitizedRequest && (
              <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
                data-testid="text-rups-sanitized-request">{JSON.stringify(result.sanitizedRequest, null, 2)}</pre>
            )}
            <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
              data-testid="text-rups-response">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
        <div className="rounded border border-border p-2 text-xs" data-testid="block-rups-history">
          <div className="font-semibold mb-1">Prepare-Scene History ({history.length})</div>
          {history.slice(0, 50).map((r: any) => (
            <div key={r.id} className="font-mono truncate" data-testid={`row-rups-history-${r.id}`}>
              {r.createdAt} · {r.status} · http={r.httpStatus ?? "—"} · {r.productionId} · {r.id}
            </div>
          ))}
          {history.length === 0 && <div className="opacity-60">No prepare-scene calls yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function RealUnrealSetCameraDryRunPanel() {
  const { data: prodList } = useQuery<ProductionListResponse>({
    queryKey: ["/api/admin/production-house/productions"],
  });
  const [status, setStatus] = useState<any>(null);
  const [productionId, setProductionId] = useState<string>("");
  const [cameraPreset, setCameraPreset] = useState<string>("anchor_closeup");
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const PREFIX = "/api/admin/production-house/real-unreal/set-camera-dry-run";

  async function loadStatus() {
    setStatus(await (await fetch(`${PREFIX}/status`)).json());
  }
  async function loadHistory(pid?: string) {
    const url = pid ? `${PREFIX}/history?productionId=${pid}` : `${PREFIX}/history`;
    const h = await (await fetch(url)).json();
    setHistory(h.history || []);
  }
  async function runSetCamera() {
    if (!productionId) return;
    if (!window.confirm(
      "Send a real dry-run set_camera summary to the configured Unreal bridge?\n\n" +
      "This sends only a sanitized set_camera summary. It does not load levels, " +
      "render scenes, import assets, attach avatars, attach video panels, start " +
      "Sequencer, trigger MRQ, send 4D commands, or publish anything.",
    )) return;
    setBusy(true);
    try {
      const r = await fetch(`${PREFIX}/${productionId}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, cameraPreset }),
      });
      setResult(await r.json());
      await loadHistory(productionId);
    } finally { setBusy(false); }
  }

  useEffect(() => { loadStatus(); loadHistory(); }, []);
  useEffect(() => { if (productionId) loadHistory(productionId); }, [productionId]);

  const allowedPresets: string[] = status?.allowedPresets ?? [
    "anchor_closeup","anchor_medium","wide_newsroom","podcast_two_shot",
    "debate_wide","hall_stage_wide","product_reveal","market_wall",
    "emergency_broadcast","custom_static",
  ];

  return (
    <Card data-testid="card-real-unreal-set-camera">
      <CardHeader>
        <CardTitle>Real Unreal Set-Camera Dry-Run</CardTitle>
        <CardDescription>
          <strong>This sends only a dry-run set_camera summary. It does not load levels,
          render scenes, import assets, attach avatars, attach video panels, start
          Sequencer, trigger MRQ, send 4D commands, or publish anything.</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge data-testid="badge-ruscam-dry-run" variant="outline">Dry Run Only</Badge>
          <Badge data-testid="badge-ruscam-no-real-send" variant="outline">Real Send Disabled</Badge>
          <Badge data-testid="badge-ruscam-no-render" variant="outline">No Render</Badge>
          <Badge data-testid="badge-ruscam-no-import" variant="outline">No Asset Import</Badge>
          <Badge data-testid="badge-ruscam-no-level-load" variant="outline">No Level Load</Badge>
          <Badge data-testid="badge-ruscam-no-sequencer" variant="outline">No Sequencer</Badge>
          <Badge data-testid="badge-ruscam-no-mrq" variant="outline">No MRQ</Badge>
          <Badge data-testid="badge-ruscam-no-avatar-attach" variant="outline">No Avatar Attach</Badge>
          <Badge data-testid="badge-ruscam-no-video-attach" variant="outline">No Video Attach</Badge>
          <Badge data-testid="badge-ruscam-no-4d" variant="outline">No 4D Send</Badge>
          <Badge data-testid="badge-ruscam-no-publishing" variant="outline">No Publishing</Badge>
        </div>
        {status && (
          <div className="text-xs font-mono opacity-80" data-testid="text-ruscam-status">
            Bridge configured: {String(status.bridge?.configured)} · mode: {status.bridge?.mode} ·
            required stage: {status.requiredApprovalStage} · endpoint: {status.endpointPath}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Label>Production:</Label>
          <select
            data-testid="select-ruscam-production"
            className="bg-background border border-border rounded px-2 py-1 text-xs"
            value={productionId} onChange={(e) => setProductionId(e.target.value)}
          >
            <option value="">—</option>
            {(prodList?.productions ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
          <Label>Preset:</Label>
          <select
            data-testid="select-ruscam-preset"
            className="bg-background border border-border rounded px-2 py-1 text-xs"
            value={cameraPreset} onChange={(e) => setCameraPreset(e.target.value)}
          >
            {allowedPresets.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <Button size="sm" variant="secondary" data-testid="button-ruscam-send"
            onClick={runSetCamera} disabled={!productionId || busy}>
            <Play className="h-3 w-3 mr-1" /> Send Set-Camera Dry-Run
          </Button>
        </div>
        {result && (
          <div className="space-y-1" data-testid="block-ruscam-result">
            <div className="text-xs font-semibold">
              Status: {result.status} (http={result.record?.httpStatus ?? "—"})
            </div>
            {result.sanitizedRequest && (
              <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
                data-testid="text-ruscam-sanitized-request">{JSON.stringify(result.sanitizedRequest, null, 2)}</pre>
            )}
            <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
              data-testid="text-ruscam-response">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
        <div className="rounded border border-border p-2 text-xs" data-testid="block-ruscam-history">
          <div className="font-semibold mb-1">Set-Camera History ({history.length})</div>
          {history.slice(0, 50).map((r: any) => (
            <div key={r.id} className="font-mono truncate" data-testid={`row-ruscam-history-${r.id}`}>
              {r.createdAt} · {r.status} · http={r.httpStatus ?? "—"} · {r.cameraPreset} · {r.productionId} · {r.id}
            </div>
          ))}
          {history.length === 0 && <div className="opacity-60">No set-camera calls yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function RealUnrealSetLightingDryRunPanel() {
  const [productions, setProductions] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [productionId, setProductionId] = useState<string>("");
  const [lightingPreset, setLightingPreset] = useState<string>("newsroom_bright");
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const PREFIX = "/api/admin/production-house/real-unreal/set-lighting";

  async function loadProductions() {
    try {
      const j = await (await fetch("/api/admin/production-house/productions")).json();
      setProductions(j.productions || []);
    } catch { /* noop */ }
  }
  async function loadStatus() {
    setStatus(await (await fetch(`${PREFIX}/status`)).json());
  }
  async function loadHistory(pid?: string) {
    const url = pid ? `${PREFIX}/history?productionId=${pid}` : `${PREFIX}/history`;
    const h = await (await fetch(url)).json();
    setHistory(h.history || []);
  }
  async function runSetLighting() {
    if (!productionId) return;
    if (!window.confirm(
      "Send a real dry-run set_lighting summary to the configured Unreal bridge?\n\n" +
      "This sends only a sanitized set_lighting summary. It does not load levels, " +
      "render scenes, import assets, attach avatars, attach video panels, start " +
      "Sequencer, trigger MRQ, send 4D commands, or publish anything.",
    )) return;
    setBusy(true);
    try {
      const r = await fetch(`${PREFIX}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, productionId, lightingPreset }),
      });
      setResult(await r.json());
      await loadHistory(productionId);
    } finally { setBusy(false); }
  }

  useEffect(() => { loadProductions(); loadStatus(); loadHistory(); }, []);
  useEffect(() => { if (productionId) loadHistory(productionId); }, [productionId]);

  const allowedPresets: string[] = status?.allowedPresets ?? [
    "newsroom_bright","newsroom_breaking_red","podcast_warm","debate_neutral",
    "interview_soft","market_watch_blue","emergency_alert","cinematic_low_key",
    "avatar_spotlight","standby_dim",
  ];

  return (
    <Card data-testid="card-real-unreal-set-lighting">
      <CardHeader>
        <CardTitle>Real Unreal Set-Lighting Dry-Run</CardTitle>
        <CardDescription>
          <strong>This sends only a dry-run set_lighting summary. It does not load levels,
          render scenes, import assets, attach avatars, attach video panels, start
          Sequencer, trigger MRQ, send 4D commands, or publish anything.</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge data-testid="badge-ruslight-dry-run" variant="outline">Dry Run Only</Badge>
          <Badge data-testid="badge-ruslight-no-real-send" variant="outline">Real Send Disabled</Badge>
          <Badge data-testid="badge-ruslight-no-render" variant="outline">No Render</Badge>
          <Badge data-testid="badge-ruslight-no-import" variant="outline">No Asset Import</Badge>
          <Badge data-testid="badge-ruslight-no-level-load" variant="outline">No Level Load</Badge>
          <Badge data-testid="badge-ruslight-no-sequencer" variant="outline">No Sequencer</Badge>
          <Badge data-testid="badge-ruslight-no-mrq" variant="outline">No MRQ</Badge>
          <Badge data-testid="badge-ruslight-no-avatar-attach" variant="outline">No Avatar Attach</Badge>
          <Badge data-testid="badge-ruslight-no-video-attach" variant="outline">No Video Attach</Badge>
          <Badge data-testid="badge-ruslight-no-4d" variant="outline">No 4D Send</Badge>
          <Badge data-testid="badge-ruslight-no-publishing" variant="outline">No Publishing</Badge>
        </div>
        {status && (
          <div className="text-xs font-mono opacity-80" data-testid="text-ruslight-status">
            Bridge configured: {String(status.bridge?.configured)} · mode: {status.bridge?.mode} ·
            required stage: {status.requiredApprovalStage} · endpoint: {status.endpointPath}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Label>Production:</Label>
          <select
            data-testid="select-ruslight-production"
            className="bg-background border border-border rounded px-2 py-1 text-xs"
            value={productionId} onChange={(e) => setProductionId(e.target.value)}
          >
            <option value="">—</option>
            {productions.map((p: any) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
          <Label>Preset:</Label>
          <select
            data-testid="select-ruslight-preset"
            className="bg-background border border-border rounded px-2 py-1 text-xs"
            value={lightingPreset} onChange={(e) => setLightingPreset(e.target.value)}
          >
            {allowedPresets.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <Button size="sm" variant="secondary" data-testid="button-ruslight-send"
            onClick={runSetLighting} disabled={!productionId || busy}>
            <Play className="h-3 w-3 mr-1" /> Send Set-Lighting Dry-Run
          </Button>
        </div>
        {result && (
          <div className="space-y-1" data-testid="block-ruslight-result">
            <div className="text-xs font-semibold">
              Status: {result.status} (http={result.record?.httpStatus ?? "—"})
            </div>
            {result.sanitizedRequest && (
              <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
                data-testid="text-ruslight-sanitized-request">{JSON.stringify(result.sanitizedRequest, null, 2)}</pre>
            )}
            <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
              data-testid="text-ruslight-response">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
        <div className="rounded border border-border p-2 text-xs" data-testid="block-ruslight-history">
          <div className="font-semibold mb-1">Set-Lighting History ({history.length})</div>
          {history.slice(0, 50).map((r: any) => (
            <div key={r.id} className="font-mono truncate" data-testid={`row-ruslight-history-${r.id}`}>
              {r.createdAt} · {r.status} · http={r.httpStatus ?? "—"} · {r.lightingPreset} · {r.productionId} · {r.id}
            </div>
          ))}
          {history.length === 0 && <div className="opacity-60">No set-lighting calls yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function RealUnrealSetPanelsDryRunPanel() {
  const [productions, setProductions] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [productionId, setProductionId] = useState<string>("");
  const [panelPreset, setPanelPreset] = useState<string>("newsroom_main_wall");
  const [headline, setHeadline] = useState<string>("");
  const [subtitle, setSubtitle] = useState<string>("");
  const [tickerText, setTickerText] = useState<string>("");
  const [sourceLabel, setSourceLabel] = useState<string>("");
  const [confidenceLabel, setConfidenceLabel] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const PREFIX = "/api/admin/production-house/real-unreal/set-panels";

  async function loadProductions() {
    try {
      const j = await (await fetch("/api/admin/production-house/productions")).json();
      setProductions(j.productions || []);
    } catch { /* noop */ }
  }
  async function loadStatus() {
    setStatus(await (await fetch(`${PREFIX}/status`)).json());
  }
  async function loadHistory(pid?: string) {
    const url = pid ? `${PREFIX}/history?productionId=${pid}` : `${PREFIX}/history`;
    const h = await (await fetch(url)).json();
    setHistory(h.history || []);
  }
  async function runSetPanels() {
    if (!productionId) return;
    if (!window.confirm(
      "Send a real dry-run set_panels summary to the configured Unreal bridge?\n\n" +
      "Sends only sanitized panel text/refs. No public URLs, no external media fetch, " +
      "no level load, render, MRQ, asset import, avatar/media attach, Sequencer, " +
      "4D, publish, social, or live streaming.",
    )) return;
    setBusy(true);
    try {
      const tickerItems = tickerText
        .split("\n").map((s) => s.trim()).filter(Boolean);
      const sourcePanel = sourceLabel
        ? { sourceLabel, citationCount: 0 } : undefined;
      const r = await fetch(`${PREFIX}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true, productionId, panelPreset,
          headline: headline || undefined,
          subtitle: subtitle || undefined,
          tickerItems: tickerItems.length ? tickerItems : undefined,
          sourcePanel,
          confidenceLabel: confidenceLabel || undefined,
        }),
      });
      setResult(await r.json());
      await loadHistory(productionId);
    } finally { setBusy(false); }
  }

  useEffect(() => { loadProductions(); loadStatus(); loadHistory(); }, []);
  useEffect(() => { if (productionId) loadHistory(productionId); }, [productionId]);

  const allowedPresets: string[] = status?.allowedPresets ?? [
    "newsroom_main_wall","newsroom_breaking_news","newsroom_source_confidence",
    "podcast_topic_cards","debate_split_screen","interview_guest_profile",
    "market_watch_dashboard","weather_map","emergency_alert_board","standby_brand_loop",
  ];

  return (
    <Card data-testid="card-real-unreal-set-panels">
      <CardHeader>
        <CardTitle>Real Unreal Set-Panels Dry-Run</CardTitle>
        <CardDescription>
          <strong>This sends only a dry-run set_panels summary. No public URLs, no
          external media fetch, no level load, render, MRQ, asset import, avatar/
          media attach, Sequencer, 4D, publish, social, or live streaming.</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge data-testid="badge-ruspanels-dry-run" variant="outline">Dry Run Only</Badge>
          <Badge data-testid="badge-ruspanels-no-real-send" variant="outline">Real Send Disabled</Badge>
          <Badge data-testid="badge-ruspanels-no-public-urls" variant="outline">No Public URLs</Badge>
          <Badge data-testid="badge-ruspanels-no-external-media" variant="outline">No External Media Fetch</Badge>
          <Badge data-testid="badge-ruspanels-no-render" variant="outline">No Render</Badge>
          <Badge data-testid="badge-ruspanels-no-import" variant="outline">No Asset Import</Badge>
          <Badge data-testid="badge-ruspanels-no-mrq" variant="outline">No MRQ</Badge>
          <Badge data-testid="badge-ruspanels-no-avatar-attach" variant="outline">No Avatar Attach</Badge>
          <Badge data-testid="badge-ruspanels-no-video-attach" variant="outline">No Video Attach</Badge>
          <Badge data-testid="badge-ruspanels-no-sequencer" variant="outline">No Sequencer</Badge>
          <Badge data-testid="badge-ruspanels-no-4d" variant="outline">No 4D Send</Badge>
          <Badge data-testid="badge-ruspanels-no-publishing" variant="outline">No Publishing</Badge>
          <Badge data-testid="badge-ruspanels-no-social" variant="outline">No Social</Badge>
          <Badge data-testid="badge-ruspanels-no-live" variant="outline">No Live Streaming</Badge>
        </div>
        {status && (
          <div className="text-xs font-mono opacity-80" data-testid="text-ruspanels-status">
            Bridge configured: {String(status.bridge?.configured)} · mode: {status.bridge?.mode} ·
            required stage: {status.requiredApprovalStage} · endpoint: {status.endpointPath}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="flex items-center gap-2">
            <Label>Production:</Label>
            <select
              data-testid="select-ruspanels-production"
              className="bg-background border border-border rounded px-2 py-1 text-xs flex-1"
              value={productionId} onChange={(e) => setProductionId(e.target.value)}
            >
              <option value="">—</option>
              {productions.map((p: any) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Label>Preset:</Label>
            <select
              data-testid="select-ruspanels-preset"
              className="bg-background border border-border rounded px-2 py-1 text-xs flex-1"
              value={panelPreset} onChange={(e) => setPanelPreset(e.target.value)}
            >
              {allowedPresets.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <Label>Headline</Label>
            <Input data-testid="input-ruspanels-headline" value={headline}
              onChange={(e) => setHeadline(e.target.value)} maxLength={500} />
          </div>
          <div>
            <Label>Subtitle</Label>
            <Input data-testid="input-ruspanels-subtitle" value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)} maxLength={1000} />
          </div>
          <div>
            <Label>Source Label</Label>
            <Input data-testid="input-ruspanels-source" value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)} maxLength={500} />
          </div>
          <div>
            <Label>Confidence Label</Label>
            <Input data-testid="input-ruspanels-confidence" value={confidenceLabel}
              onChange={(e) => setConfidenceLabel(e.target.value)} maxLength={200} />
          </div>
          <div className="md:col-span-2">
            <Label>Ticker Items (one per line)</Label>
            <Textarea data-testid="textarea-ruspanels-ticker"
              rows={3} value={tickerText} onChange={(e) => setTickerText(e.target.value)} />
          </div>
        </div>
        <div>
          <Button size="sm" variant="secondary" data-testid="button-ruspanels-send"
            onClick={runSetPanels} disabled={!productionId || busy}>
            <Play className="h-3 w-3 mr-1" /> Send Set-Panels Dry-Run
          </Button>
        </div>
        {result && (
          <div className="space-y-1" data-testid="block-ruspanels-result">
            <div className="text-xs font-semibold">
              Status: {result.status} (http={result.record?.httpStatus ?? "—"})
            </div>
            {result.sanitizedRequest && (
              <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
                data-testid="text-ruspanels-sanitized-request">{JSON.stringify(result.sanitizedRequest, null, 2)}</pre>
            )}
            <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
              data-testid="text-ruspanels-response">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
        <div className="rounded border border-border p-2 text-xs" data-testid="block-ruspanels-history">
          <div className="font-semibold mb-1">Set-Panels History ({history.length})</div>
          {history.slice(0, 50).map((r: any) => (
            <div key={r.id} className="font-mono truncate" data-testid={`row-ruspanels-history-${r.id}`}>
              {r.createdAt} · {r.status} · http={r.httpStatus ?? "—"} · {r.panelPreset} · {r.productionId} · {r.id}
            </div>
          ))}
          {history.length === 0 && <div className="opacity-60">No set-panels calls yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function RealUnrealDryRunValidationPanel() {
  const { data: prodList } = useQuery<ProductionListResponse>({
    queryKey: ["/api/admin/production-house/productions"],
  });
  const [status, setStatus] = useState<any>(null);
  const [productionId, setProductionId] = useState<string>("");
  const [local, setLocal] = useState<any>(null);
  const [bridge, setBridge] = useState<any>(null);
  const [bridgeNetwork, setBridgeNetwork] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  async function loadStatus() {
    const s = await (await fetch("/api/admin/production-house/real-unreal/dry-run-validation/status")).json();
    setStatus(s);
  }
  async function loadHistory(pid?: string) {
    const url = pid
      ? `/api/admin/production-house/real-unreal/dry-run-validation/history?productionId=${pid}`
      : "/api/admin/production-house/real-unreal/dry-run-validation/history";
    const h = await (await fetch(url)).json();
    setHistory(h.history || []);
  }
  async function runLocal() {
    if (!productionId) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/production-house/real-unreal/dry-run-validation/${productionId}/validate-local`, { method: "POST" });
      setLocal(await r.json());
      await loadHistory(productionId);
    } finally { setBusy(false); }
  }
  async function runBridge() {
    if (!productionId) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/production-house/real-unreal/dry-run-validation/${productionId}/validate-bridge`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      setBridge(await r.json());
      await loadHistory(productionId);
    } finally { setBusy(false); }
  }
  async function runBridgeNetwork() {
    if (!productionId) return;
    if (!window.confirm(
      "Send a real dry-run package summary to the configured Unreal bridge?\n\n" +
      "This sends ONLY a sanitized package summary to /validate-package/dry-run. " +
      "It does not load levels, render scenes, import assets, attach avatars, " +
      "attach media, or execute Unreal commands.",
    )) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/production-house/real-unreal/dry-run-validation/${productionId}/validate-bridge-network`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      setBridgeNetwork(await r.json());
      await loadHistory(productionId);
    } finally { setBusy(false); }
  }

  useEffect(() => { loadStatus(); loadHistory(); }, []);
  useEffect(() => { if (productionId) loadHistory(productionId); }, [productionId]);

  return (
    <Card data-testid="card-real-unreal-dry-run">
      <CardHeader>
        <CardTitle>Real Unreal Dry-Run Validation</CardTitle>
        <CardDescription>
          <strong>This validation does not load Unreal levels, import assets, render scenes,
          or execute real Unreal commands.</strong> Only sanitized dry-run validation payloads
          are sent to the configured bridge (when configured).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge data-testid="badge-rudr-dry-run" variant="outline">Dry Run Only</Badge>
          <Badge data-testid="badge-rudr-no-real-send" variant="outline">Real Send Disabled</Badge>
          <Badge data-testid="badge-rudr-no-render" variant="outline">No Render</Badge>
          <Badge data-testid="badge-rudr-no-asset-import" variant="outline">No Asset Import</Badge>
          <Badge data-testid="badge-rudr-no-level-load" variant="outline">No Level Load</Badge>
          <Badge data-testid="badge-rudr-no-mrq" variant="outline">No MRQ</Badge>
          <Badge data-testid="badge-rudr-no-4d" variant="outline">No 4D Send</Badge>
          <Badge data-testid="badge-rudr-no-publishing" variant="outline">No Publishing</Badge>
        </div>

        {status && (
          <div className="text-xs font-mono opacity-80" data-testid="text-rudr-status">
            Bridge configured: {String(status.bridge.configured)} · mode: {status.bridge.mode} ·
            realSendAllowed: {String(status.realSendAllowed)} · allowed stages: {status.allowedApprovalStages.join(", ")}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Label>Production:</Label>
          <select
            data-testid="select-rudr-production"
            className="bg-background border border-border rounded px-2 py-1 text-xs"
            value={productionId} onChange={(e) => setProductionId(e.target.value)}
          >
            <option value="">—</option>
            {(prodList?.productions ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
          <Button size="sm" data-testid="button-rudr-validate-local" onClick={runLocal} disabled={!productionId || busy}>
            Validate Local
          </Button>
          <Button size="sm" data-testid="button-rudr-validate-bridge" onClick={runBridge} disabled={!productionId || busy}>
            <Play className="h-3 w-3 mr-1" /> Validate on Bridge (Dry Run)
          </Button>
          <Button size="sm" variant="secondary" data-testid="button-rudr-validate-bridge-network" onClick={runBridgeNetwork} disabled={!productionId || busy}>
            <Play className="h-3 w-3 mr-1" /> Validate Package With Bridge Network
          </Button>
        </div>
        <div className="text-xs opacity-70" data-testid="text-rudr-network-warning">
          <strong>This sends only a dry-run package summary to {status?.bridge?.endpointHost || "(host)"}/validate-package/dry-run.
          It does not load levels, render scenes, import assets, attach avatars, attach media, or execute Unreal commands.</strong>
        </div>
        {bridgeNetwork && (
          <div className="space-y-1" data-testid="block-rudr-bridge-network">
            <div className="text-xs font-semibold">Bridge Network: {bridgeNetwork.status} (http={bridgeNetwork.record?.httpStatus ?? "—"})</div>
            {bridgeNetwork.sanitizedRequest && (
              <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
                data-testid="text-rudr-network-sanitized-request">{JSON.stringify(bridgeNetwork.sanitizedRequest, null, 2)}</pre>
            )}
            <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
              data-testid="text-rudr-network-response">{JSON.stringify(bridgeNetwork, null, 2)}</pre>
          </div>
        )}

        {local && (
          <div className="rounded border border-border p-2 text-xs space-y-1" data-testid="block-rudr-local">
            <div className="font-semibold">Local: {local.status}</div>
            {(local.checks ?? []).map((c: any) => (
              <div key={c.id} className="font-mono" data-testid={`row-rudr-local-check-${c.id}`}>
                {c.ok ? "✓" : "✗"} {c.id} — {c.label}{c.detail ? ` (${c.detail})` : ""}
              </div>
            ))}
          </div>
        )}

        {bridge && (
          <div className="space-y-1" data-testid="block-rudr-bridge">
            <div className="text-xs font-semibold">Bridge: {bridge.status}</div>
            {bridge.sanitizedRequest && (
              <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
                data-testid="text-rudr-sanitized-request">
                {JSON.stringify(bridge.sanitizedRequest, null, 2)}
              </pre>
            )}
            <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
              data-testid="text-rudr-bridge-response">
              {JSON.stringify(bridge, null, 2)}
            </pre>
          </div>
        )}

        <div className="rounded border border-border p-2 text-xs" data-testid="block-rudr-history">
          <div className="font-semibold mb-1">Validation History ({history.length})</div>
          {history.slice(0, 50).map((r: any) => (
            <div key={r.id} className="font-mono truncate" data-testid={`row-rudr-history-${r.id}`}>
              {r.createdAt} · {r.validationType} · {r.status} · {r.productionId} · {r.id}
            </div>
          ))}
          {history.length === 0 && <div className="opacity-60">No validations yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function RealUnrealRenderPreviewContractPanel() {
  const [productions, setProductions] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [productionId, setProductionId] = useState<string>("");
  const [panelsUsed, setPanelsUsed] = useState<boolean>(false);
  const [localResult, setLocalResult] = useState<any>(null);
  const [networkResult, setNetworkResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const PREFIX = "/api/admin/production-house/real-unreal/render-preview-contract";

  async function loadProductions() {
    try {
      const j = await (await fetch("/api/admin/production-house/productions")).json();
      setProductions(j.productions || []);
    } catch { /* noop */ }
  }
  async function loadStatus() {
    setStatus(await (await fetch(`${PREFIX}/status`)).json());
  }
  async function loadHistory(pid?: string) {
    const url = pid ? `${PREFIX}/history?productionId=${pid}` : `${PREFIX}/history`;
    const h = await (await fetch(url)).json();
    setHistory(h.history || []);
  }
  async function runLocal() {
    if (!productionId) return;
    setBusy(true);
    try {
      const r = await fetch(`${PREFIX}/${productionId}/validate-local`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panelsUsed }),
      });
      setLocalResult(await r.json());
      await loadHistory(productionId);
    } finally { setBusy(false); }
  }
  async function runDryRun() {
    if (!productionId) return;
    if (!window.confirm(
      "Send a real dry-run render-preview CONTRACT to the configured Unreal bridge?\n\n" +
      "This sends ONLY a sanitized contract summary to /render-preview/contract/dry-run. " +
      "It does not trigger Movie Render Queue, render frames, load levels, import assets, " +
      "start Sequencer, attach avatars/media, send 4D commands, or publish.",
    )) return;
    setBusy(true);
    try {
      const r = await fetch(`${PREFIX}/${productionId}/send-dry-run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, panelsUsed }),
      });
      setNetworkResult(await r.json());
      await loadHistory(productionId);
    } finally { setBusy(false); }
  }

  useEffect(() => { loadProductions(); loadStatus(); loadHistory(); }, []);
  useEffect(() => { if (productionId) loadHistory(productionId); }, [productionId]);

  return (
    <Card data-testid="card-real-unreal-render-preview-contract">
      <CardHeader>
        <CardTitle>Real Unreal Render-Preview Contract Dry-Run</CardTitle>
        <CardDescription>
          <strong>Contract-only dry-run. Sends a sanitized render-preview contract
          summary to the bridge. No Movie Render Queue, no render, no Sequencer,
          no level load, no asset import, no avatar/media attach, no 4D commands,
          no publishing, no public output URLs.</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge data-testid="badge-rurpc-dry-run" variant="outline">Dry Run Only</Badge>
          <Badge data-testid="badge-rurpc-no-real-send" variant="outline">Real Send Disabled</Badge>
          <Badge data-testid="badge-rurpc-no-mrq" variant="outline">No MRQ</Badge>
          <Badge data-testid="badge-rurpc-no-render" variant="outline">No Render</Badge>
          <Badge data-testid="badge-rurpc-no-sequencer" variant="outline">No Sequencer</Badge>
          <Badge data-testid="badge-rurpc-no-level-load" variant="outline">No Level Load</Badge>
          <Badge data-testid="badge-rurpc-no-import" variant="outline">No Asset Import</Badge>
          <Badge data-testid="badge-rurpc-no-avatar-attach" variant="outline">No Avatar Attach</Badge>
          <Badge data-testid="badge-rurpc-no-media-attach" variant="outline">No Media Attach</Badge>
          <Badge data-testid="badge-rurpc-no-4d" variant="outline">No 4D Send</Badge>
          <Badge data-testid="badge-rurpc-no-publishing" variant="outline">No Publishing</Badge>
          <Badge data-testid="badge-rurpc-no-public-urls" variant="outline">No Public URLs</Badge>
        </div>
        {status && (
          <div className="text-xs font-mono opacity-80" data-testid="text-rurpc-status">
            Bridge configured: {String(status.bridge?.configured)} · mode: {status.bridge?.mode} ·
            required stage: {status.requiredApprovalStage} · endpoint: {status.endpointPath}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="flex items-center gap-2">
            <Label>Production:</Label>
            <select
              data-testid="select-rurpc-production"
              className="bg-background border border-border rounded px-2 py-1 text-xs flex-1"
              value={productionId} onChange={(e) => setProductionId(e.target.value)}
            >
              <option value="">—</option>
              {productions.map((p: any) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="check-rurpc-panelsUsed">
              <input
                id="check-rurpc-panelsUsed"
                data-testid="check-rurpc-panels-used"
                type="checkbox" className="mr-2"
                checked={panelsUsed}
                onChange={(e) => setPanelsUsed(e.target.checked)}
              />
              Panels used (require set-panels dry-run pass)
            </Label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" data-testid="button-rurpc-validate-local"
            onClick={runLocal} disabled={!productionId || busy}>
            Validate Locally
          </Button>
          <Button size="sm" variant="secondary" data-testid="button-rurpc-send-dry-run"
            onClick={runDryRun} disabled={!productionId || busy}>
            <Play className="h-3 w-3 mr-1" /> Send Contract Dry-Run
          </Button>
        </div>
        {localResult && (
          <div className="space-y-1" data-testid="block-rurpc-local-result">
            <div className="text-xs font-semibold">
              Local: {localResult.status}
            </div>
            <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
              data-testid="text-rurpc-local-response">{JSON.stringify(localResult, null, 2)}</pre>
          </div>
        )}
        {networkResult && (
          <div className="space-y-1" data-testid="block-rurpc-network-result">
            <div className="text-xs font-semibold">
              Network: {networkResult.status} (http={networkResult.record?.httpStatus ?? "—"})
            </div>
            {networkResult.sanitizedRequest && (
              <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
                data-testid="text-rurpc-sanitized-request">{JSON.stringify(networkResult.sanitizedRequest, null, 2)}</pre>
            )}
            <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
              data-testid="text-rurpc-network-response">{JSON.stringify(networkResult, null, 2)}</pre>
          </div>
        )}
        <div className="rounded border border-border p-2 text-xs" data-testid="block-rurpc-history">
          <div className="font-semibold mb-1">Render-Preview Contract History ({history.length})</div>
          {history.slice(0, 50).map((r: any) => (
            <div key={r.id} className="font-mono truncate" data-testid={`row-rurpc-history-${r.id}`}>
              {r.createdAt} · {r.status} · {r.phase} · http={r.httpStatus ?? "—"} · {r.productionId} · {r.id}
            </div>
          ))}
          {history.length === 0 && <div className="opacity-60">No render-preview contract calls yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
function RealUnrealCommandApprovalPanel() {
  const [productions, setProductions] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [productionId, setProductionId] = useState<string>("");
  const [commandType, setCommandType] = useState<string>("real_health_check");
  const [reason, setReason] = useState<string>("");
  const [panelsUsed, setPanelsUsed] = useState<boolean>(false);
  const [history, setHistory] = useState<any[]>([]);
  const [requestResult, setRequestResult] = useState<any>(null);
  const [decisionResult, setDecisionResult] = useState<any>(null);
  const [decisionReason, setDecisionReason] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const PREFIX = "/api/admin/production-house/real-unreal/command-approval";

  async function loadProductions() {
    try {
      const j = await (await fetch("/api/admin/production-house/productions")).json();
      setProductions(j.productions || []);
    } catch { /* noop */ }
  }
  async function loadStatus() {
    setStatus(await (await fetch(`${PREFIX}/status`)).json());
  }
  async function loadHistory(pid?: string) {
    const url = pid ? `${PREFIX}/history?productionId=${pid}` : `${PREFIX}/history`;
    const h = await (await fetch(url)).json();
    setHistory(h.history || []);
  }
  async function submitRequest() {
    if (!productionId || !reason.trim()) return;
    if (!window.confirm(
      "Record an approval REQUEST for a future real Unreal command?\n\n" +
      "This stores a governance record only. It does NOT execute any real " +
      "Unreal or 4D command, does NOT open a network socket, and does NOT " +
      "flip realSendAllowed or executionEnabled.",
    )) return;
    setBusy(true);
    try {
      const r = await fetch(`${PREFIX}/request`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productionId, commandType, reason, panelsUsed, confirm: true }),
      });
      setRequestResult(await r.json());
      await loadStatus();
      await loadHistory(productionId);
    } finally { setBusy(false); }
  }
  async function decide(id: string, decision: "approved" | "rejected") {
    if (!decisionReason.trim()) {
      window.alert("Please provide a decision reason first.");
      return;
    }
    if (!window.confirm(
      `Record a ${decision.toUpperCase()} decision for this approval request?\n\n` +
      "This only updates the record's status field. It does NOT execute any " +
      "real Unreal or 4D command. realSendAllowed and executionEnabled remain false.",
    )) return;
    setBusy(true);
    try {
      const r = await fetch(`${PREFIX}/decision`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision, decisionReason, confirm: true }),
      });
      setDecisionResult(await r.json());
      await loadStatus();
      await loadHistory(productionId || undefined);
    } finally { setBusy(false); }
  }

  useEffect(() => { loadProductions(); loadStatus(); loadHistory(); }, []);
  useEffect(() => { if (productionId) loadHistory(productionId); }, [productionId]);

  return (
    <Card data-testid="card-real-unreal-command-approval">
      <CardHeader>
        <CardTitle>Real Unreal Command Approval Gate</CardTitle>
        <CardDescription>
          <strong>Governance only. Defines, validates, and stores approval requests
          for FUTURE real Unreal commands. Does NOT execute any real Unreal or 4D
          command, does NOT open a network socket, and does NOT flip
          realSendAllowed or executionEnabled.</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge data-testid="badge-ruca-governance-only" variant="outline">Governance Only</Badge>
          <Badge data-testid="badge-ruca-no-execution" variant="outline">No Execution</Badge>
          <Badge data-testid="badge-ruca-no-real-send" variant="outline">Real Send Disabled</Badge>
          <Badge data-testid="badge-ruca-no-socket" variant="outline">No Network Socket</Badge>
          <Badge data-testid="badge-ruca-no-mrq" variant="outline">No MRQ</Badge>
          <Badge data-testid="badge-ruca-no-render" variant="outline">No Render</Badge>
          <Badge data-testid="badge-ruca-no-4d" variant="outline">No 4D Send</Badge>
          <Badge data-testid="badge-ruca-no-publish" variant="outline">No Publishing</Badge>
        </div>
        {status && (
          <div className="text-xs font-mono opacity-80" data-testid="text-ruca-status">
            required stage: {status.requiredApprovalStage} ·
            realSendAllowed: {String(status.realSendAllowed)} ·
            executionEnabled: {String(status.executionEnabled)} ·
            total: {status.counts?.total} · requested: {status.counts?.requested} ·
            approved: {status.counts?.approved} · rejected: {status.counts?.rejected}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="flex items-center gap-2">
            <Label>Production:</Label>
            <select
              data-testid="select-ruca-production"
              className="bg-background border border-border rounded px-2 py-1 text-xs flex-1"
              value={productionId} onChange={(e) => setProductionId(e.target.value)}
            >
              <option value="">—</option>
              {productions.map((p: any) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Label>Command:</Label>
            <select
              data-testid="select-ruca-command-type"
              className="bg-background border border-border rounded px-2 py-1 text-xs flex-1"
              value={commandType} onChange={(e) => setCommandType(e.target.value)}
            >
              {(status?.commandTypes ?? []).map((t: string) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="textarea-ruca-reason">Reason (required)</Label>
            <Textarea
              id="textarea-ruca-reason"
              data-testid="textarea-ruca-reason"
              value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this real Unreal command being requested?"
              rows={2}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="check-ruca-panelsUsed">
              <input
                id="check-ruca-panelsUsed"
                data-testid="check-ruca-panels-used"
                type="checkbox" className="mr-2"
                checked={panelsUsed}
                onChange={(e) => setPanelsUsed(e.target.checked)}
              />
              Panels used (requires set-panels dry-run pass)
            </Label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" data-testid="button-ruca-request"
            onClick={submitRequest} disabled={!productionId || !reason.trim() || busy}>
            Submit Approval Request
          </Button>
        </div>
        {requestResult && (
          <div className="space-y-1" data-testid="block-ruca-request-result">
            <div className="text-xs font-semibold">
              Request: {requestResult.status ?? (requestResult.ok ? "ok" : "error")}
            </div>
            <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
              data-testid="text-ruca-request-response">{JSON.stringify(requestResult, null, 2)}</pre>
          </div>
        )}
        <div className="border-t border-border pt-3 space-y-2">
          <Label htmlFor="textarea-ruca-decision-reason">Decision reason (required to approve/reject)</Label>
          <Textarea
            id="textarea-ruca-decision-reason"
            data-testid="textarea-ruca-decision-reason"
            value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)}
            placeholder="Why is this request being approved or rejected?"
            rows={2}
          />
          {decisionResult && (
            <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
              data-testid="text-ruca-decision-response">{JSON.stringify(decisionResult, null, 2)}</pre>
          )}
        </div>
        <div className="rounded border border-border p-2 text-xs" data-testid="block-ruca-history">
          <div className="font-semibold mb-1">Approval Requests ({history.length})</div>
          {history.slice(0, 50).map((r: any) => (
            <div key={r.id} className="font-mono text-xs border-b border-border/60 py-1"
              data-testid={`row-ruca-history-${r.id}`}>
              <div className="truncate">
                {r.createdAt} · {r.status} · {r.commandType} · {r.productionId} · {r.id}
              </div>
              {r.status === "requested" && (
                <div className="flex gap-2 mt-1">
                  <Button size="sm" variant="outline"
                    data-testid={`button-ruca-approve-${r.id}`}
                    onClick={() => decide(r.id, "approved")} disabled={busy}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline"
                    data-testid={`button-ruca-reject-${r.id}`}
                    onClick={() => decide(r.id, "rejected")} disabled={busy}>
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
          {history.length === 0 && <div className="opacity-60">No approval requests yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
function RealUnrealLevelLoadContractPanel() {
  const [productions, setProductions] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [productionId, setProductionId] = useState<string>("");
  const [proposedLevelName, setProposedLevelName] = useState<string>("Mougle_Newsroom_Main");
  const [validateResult, setValidateResult] = useState<any>(null);
  const [createResult, setCreateResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const PREFIX = "/api/admin/production-house/real-unreal/level-load-contract";

  async function loadProductions() {
    try {
      const j = await (await fetch("/api/admin/production-house/productions")).json();
      setProductions(j.productions || []);
    } catch { /* noop */ }
  }
  async function loadStatus() {
    setStatus(await (await fetch(`${PREFIX}/status`)).json());
  }
  async function loadHistory(pid?: string) {
    const url = pid ? `${PREFIX}/history?productionId=${pid}` : `${PREFIX}/history`;
    const h = await (await fetch(url)).json();
    setHistory(h.history || []);
  }
  async function runValidate() {
    if (!productionId) return;
    setBusy(true);
    try {
      const r = await fetch(`${PREFIX}/${productionId}/validate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposedLevelName }),
      });
      setValidateResult(await r.json());
    } finally { setBusy(false); }
  }
  async function runCreate() {
    if (!productionId) return;
    if (!window.confirm(
      "Create a level-load CONTRACT only?\n\n" +
      "This stores a contract record. It does NOT load a level, call Unreal, " +
      "render, import assets, start Sequencer, attach media, send 4D commands, " +
      "or publish anything. realSendAllowed and executionEnabled remain false.",
    )) return;
    setBusy(true);
    try {
      const r = await fetch(`${PREFIX}/${productionId}/create`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposedLevelName, confirm: true }),
      });
      setCreateResult(await r.json());
      await loadStatus();
      await loadHistory(productionId);
    } finally { setBusy(false); }
  }

  useEffect(() => { loadProductions(); loadStatus(); loadHistory(); }, []);
  useEffect(() => { if (productionId) loadHistory(productionId); }, [productionId]);

  return (
    <Card data-testid="card-real-unreal-level-load-contract">
      <CardHeader>
        <CardTitle>Real Unreal Level-Load Contract</CardTitle>
        <CardDescription>
          <strong>Contract only. Defines, validates, stores, and exports proposed
          level-load command contracts. Does NOT load a level, call Unreal,
          render, import assets, start Sequencer, attach avatars/media, send 4D
          commands, or publish anything. realSendAllowed and executionEnabled
          remain false.</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge data-testid="badge-rullc-contract-only" variant="outline">Contract Only</Badge>
          <Badge data-testid="badge-rullc-no-level-load" variant="outline">No Real Level Load</Badge>
          <Badge data-testid="badge-rullc-no-render" variant="outline">No Render</Badge>
          <Badge data-testid="badge-rullc-no-mrq" variant="outline">No MRQ</Badge>
          <Badge data-testid="badge-rullc-no-sequencer" variant="outline">No Sequencer</Badge>
          <Badge data-testid="badge-rullc-no-asset-import" variant="outline">No Asset Import</Badge>
          <Badge data-testid="badge-rullc-no-4d" variant="outline">No 4D Send</Badge>
        </div>
        {status && (
          <div className="text-xs font-mono opacity-80" data-testid="text-rullc-status">
            mode: {status.mode} ·
            realSendAllowed: {String(status.realSendAllowed)} ·
            executionEnabled: {String(status.executionEnabled)} ·
            total: {status.counts?.total} · created: {status.counts?.created} ·
            rejected: {status.counts?.rejected}
          </div>
        )}
        <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs"
          data-testid="text-rullc-warning">
          This creates a level-load contract only. It does not load a level,
          call Unreal, render, import assets, start Sequencer, or execute a
          live command.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="flex items-center gap-2">
            <Label>Production:</Label>
            <select
              data-testid="select-rullc-production"
              className="bg-background border border-border rounded px-2 py-1 text-xs flex-1"
              value={productionId} onChange={(e) => setProductionId(e.target.value)}
            >
              <option value="">—</option>
              {productions.map((p: any) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Label>Proposed Level:</Label>
            <select
              data-testid="select-rullc-level-name"
              className="bg-background border border-border rounded px-2 py-1 text-xs flex-1"
              value={proposedLevelName}
              onChange={(e) => setProposedLevelName(e.target.value)}
            >
              {(status?.allowedLevelNames ?? []).map((n: string) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" data-testid="button-rullc-validate"
            onClick={runValidate} disabled={!productionId || busy}>
            Validate Contract
          </Button>
          <Button size="sm" variant="secondary" data-testid="button-rullc-create"
            onClick={runCreate} disabled={!productionId || busy}>
            Create Contract
          </Button>
        </div>
        {validateResult && (
          <div className="space-y-1" data-testid="block-rullc-validate-result">
            <div className="text-xs font-semibold">
              Validation: {validateResult.ok ? "ok" : "failed"}
              {validateResult.errorCodes?.length
                ? ` · ${validateResult.errorCodes.join(", ")}` : ""}
            </div>
            <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
              data-testid="text-rullc-validate-response">
{JSON.stringify(validateResult, null, 2)}
            </pre>
          </div>
        )}
        {createResult && (
          <div className="space-y-1" data-testid="block-rullc-create-result">
            <div className="text-xs font-semibold">
              Create: {createResult.status ?? (createResult.ok ? "ok" : "error")}
            </div>
            <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
              data-testid="text-rullc-create-response">
{JSON.stringify(createResult, null, 2)}
            </pre>
          </div>
        )}
        <div className="rounded border border-border p-2 text-xs"
          data-testid="block-rullc-history">
          <div className="font-semibold mb-1">Level-Load Contracts ({history.length})</div>
          {history.slice(0, 50).map((r: any) => (
            <div key={r.id} className="font-mono text-xs border-b border-border/60 py-1"
              data-testid={`row-rullc-history-${r.id}`}>
              {r.createdAt} · {r.status} · {r.proposedLevelName} ·
              {r.productionId} · {r.id}
            </div>
          ))}
          {history.length === 0 && <div className="opacity-60">No contracts yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
function RealUnrealSafetySwitchPanel() {
  const [status, setStatus] = useState<any>(null);
  const [evalResult, setEvalResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const PREFIX = "/api/admin/production-house/real-unreal/safety-switch";

  async function loadStatus() {
    setStatus(await (await fetch(`${PREFIX}/status`)).json());
  }
  async function loadHistory() {
    const h = await (await fetch(`${PREFIX}/history`)).json();
    setHistory(h.history || []);
  }
  async function runEvaluate() {
    setBusy(true);
    try {
      const r = await fetch(`${PREFIX}/evaluate`, { method: "POST" });
      setEvalResult(await r.json());
      await loadStatus();
      await loadHistory();
    } finally { setBusy(false); }
  }

  useEffect(() => { loadStatus(); loadHistory(); }, []);

  return (
    <Card data-testid="card-real-unreal-safety-switch">
      <CardHeader>
        <CardTitle>Real Unreal Safety Switch</CardTitle>
        <CardDescription>
          <strong>This module does NOT enable live Unreal execution. It only
          verifies that live execution remains disabled. liveExecutionEnabled,
          realSendAllowed, and executionEnabled remain false. emergencyLocked
          remains true.</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge data-testid="badge-rss-live-exec-disabled" variant="outline">Live Execution Disabled</Badge>
          <Badge data-testid="badge-rss-emergency-locked" variant="outline">Emergency Locked</Badge>
          <Badge data-testid="badge-rss-no-real-cmds" variant="outline">No Real Commands</Badge>
          <Badge data-testid="badge-rss-no-render" variant="outline">No Render</Badge>
          <Badge data-testid="badge-rss-no-mrq" variant="outline">No MRQ</Badge>
          <Badge data-testid="badge-rss-no-level-load" variant="outline">No Level Load</Badge>
          <Badge data-testid="badge-rss-no-4d" variant="outline">No 4D Send</Badge>
        </div>
        <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs"
          data-testid="text-rss-warning">
          This module does not enable live Unreal execution. It only verifies
          that live execution remains disabled.
        </div>
        {status && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="rounded border border-border p-2 text-xs"
              data-testid="card-rss-state">
              <div className="font-semibold">State</div>
              <div className="font-mono">{status.state}</div>
              <div className="opacity-70 mt-1">
                liveExecutionEnabled: {String(status.liveExecutionEnabled)}<br/>
                realSendAllowed: {String(status.realSendAllowed)}<br/>
                executionEnabled: {String(status.executionEnabled)}<br/>
                emergencyLocked: {String(status.emergencyLocked)}
              </div>
            </div>
            <div className="rounded border border-border p-2 text-xs"
              data-testid="card-rss-blocked-categories">
              <div className="font-semibold">Blocked Command Categories</div>
              <ul className="font-mono opacity-80 list-disc pl-5">
                {(status.blockedCommandCategories ?? []).map((c: string) =>
                  <li key={c}>{c}</li>)}
              </ul>
            </div>
            <div className="rounded border border-border p-2 text-xs"
              data-testid="card-rss-prerequisites">
              <div className="font-semibold">Required Prerequisites</div>
              <ul className="font-mono opacity-80 list-disc pl-5">
                {(status.prerequisites ?? []).map((p: string) =>
                  <li key={p}>{p}</li>)}
              </ul>
            </div>
            <div className="rounded border border-border p-2 text-xs"
              data-testid="card-rss-checks">
              <div className="font-semibold">Checks</div>
              <ul className="font-mono opacity-80 list-disc pl-5">
                {(status.checks ?? []).map((c: any) => (
                  <li key={c.id}>
                    [{c.ok ? "ok" : "FAIL"}] {c.label}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded border border-border p-2 text-xs"
              data-testid="card-rss-blockers">
              <div className="font-semibold">Blockers</div>
              {(status.blockers ?? []).length === 0 ? (
                <div className="opacity-60">None.</div>
              ) : (
                <ul className="font-mono opacity-80 list-disc pl-5">
                  {status.blockers.map((b: string) => <li key={b}>{b}</li>)}
                </ul>
              )}
            </div>
            <div className="rounded border border-border p-2 text-xs"
              data-testid="card-rss-warnings">
              <div className="font-semibold">Warnings</div>
              {(status.warnings ?? []).length === 0 ? (
                <div className="opacity-60">None.</div>
              ) : (
                <ul className="font-mono opacity-80 list-disc pl-5">
                  {status.warnings.map((w: string) => <li key={w}>{w}</li>)}
                </ul>
              )}
            </div>
          </div>
        )}
        <div>
          <Button size="sm" variant="secondary" data-testid="button-rss-evaluate"
            onClick={runEvaluate} disabled={busy}>
            Evaluate Safety Switch
          </Button>
        </div>
        {evalResult && (
          <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
            data-testid="text-rss-eval-response">
{JSON.stringify(evalResult, null, 2)}
          </pre>
        )}
        <div className="rounded border border-border p-2 text-xs"
          data-testid="block-rss-history">
          <div className="font-semibold mb-1">Safety Switch Reports ({history.length})</div>
          {history.slice(0, 50).map((r: any) => (
            <div key={r.id} className="font-mono text-xs border-b border-border/60 py-1"
              data-testid={`row-rss-history-${r.id}`}>
              {r.createdAt} · {r.state} · blockers={r.blockers?.length ?? 0} ·
              warnings={r.warnings?.length ?? 0} · {r.id}
            </div>
          ))}
          {history.length === 0 && <div className="opacity-60">No reports yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
function RealUnrealMigrationPlanPanel() {
  const [status, setStatus] = useState<any>(null);
  const [genResult, setGenResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const PREFIX = "/api/admin/production-house/real-unreal/migration-plan";

  async function loadStatus() {
    setStatus(await (await fetch(`${PREFIX}/status`)).json());
  }
  async function loadHistory() {
    const h = await (await fetch(`${PREFIX}/history`)).json();
    setHistory(h.history || []);
  }
  async function runGenerate() {
    setBusy(true);
    try {
      const r = await fetch(`${PREFIX}/generate`, { method: "POST" });
      setGenResult(await r.json());
      await loadStatus();
      await loadHistory();
    } finally { setBusy(false); }
  }
  async function downloadExport() {
    const r = await fetch(`${PREFIX}/export`);
    const data = await r.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `real-unreal-migration-plan-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => { loadStatus(); loadHistory(); }, []);

  return (
    <Card data-testid="card-real-unreal-migration-plan">
      <CardHeader>
        <CardTitle>Real Unreal Migration Plan</CardTitle>
        <CardDescription>
          <strong>This migration plan does not enable live Unreal execution.
          It only documents prerequisites and risks.</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          <Badge data-testid="badge-rmp-planning-only" variant="outline">Planning Only</Badge>
          <Badge data-testid="badge-rmp-live-exec-disabled" variant="outline">Live Execution Disabled</Badge>
          <Badge data-testid="badge-rmp-emergency-locked" variant="outline">Emergency Locked</Badge>
          <Badge data-testid="badge-rmp-no-real-cmds" variant="outline">No Real Commands</Badge>
          <Badge data-testid="badge-rmp-no-render" variant="outline">No Render</Badge>
          <Badge data-testid="badge-rmp-no-mrq" variant="outline">No MRQ</Badge>
          <Badge data-testid="badge-rmp-no-4d" variant="outline">No 4D Send</Badge>
        </div>
        <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs"
          data-testid="text-rmp-warning">
          This migration plan does not enable live Unreal execution. It only
          documents prerequisites and risks.
        </div>
        {status && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="rounded border border-border p-2 text-xs"
              data-testid="card-rmp-state">
              <div className="font-semibold">Status</div>
              <div className="font-mono">{status.status}</div>
              <div className="opacity-70 mt-1">
                liveExecutionEnabled: {String(status.liveExecutionEnabled)}<br/>
                realSendAllowed: {String(status.realSendAllowed)}<br/>
                executionEnabled: {String(status.executionEnabled)}<br/>
                emergencyLocked: {String(status.emergencyLocked)}
              </div>
            </div>
            <div className="rounded border border-border p-2 text-xs"
              data-testid="card-rmp-counts">
              <div className="font-semibold">Counts</div>
              <div className="font-mono opacity-80">
                totalPlans: {status.counts?.totalPlans ?? 0}<br/>
                unresolvedBlockers: {status.counts?.unresolvedBlockers ?? 0}
              </div>
            </div>
            <div className="rounded border border-border p-2 text-xs md:col-span-2"
              data-testid="card-rmp-milestones">
              <div className="font-semibold">Milestones</div>
              <ul className="font-mono opacity-80 list-disc pl-5">
                {(status.milestones ?? []).map((m: any) => (
                  <li key={m.id} data-testid={`row-rmp-milestone-${m.id}`}>
                    [{m.satisfied ? "ok" : "todo"}] {m.label}
                    {m.detail ? ` — ${m.detail}` : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded border border-border p-2 text-xs"
              data-testid="card-rmp-blockers">
              <div className="font-semibold">Unresolved Blockers</div>
              {(status.blockers ?? []).length === 0 ? (
                <div className="opacity-60">None.</div>
              ) : (
                <ul className="font-mono opacity-80 list-disc pl-5">
                  {status.blockers.map((b: string) => <li key={b}>{b}</li>)}
                </ul>
              )}
            </div>
            <div className="rounded border border-border p-2 text-xs"
              data-testid="card-rmp-external-deps">
              <div className="font-semibold">External Dependencies</div>
              <ul className="font-mono opacity-80 list-disc pl-5">
                {(status.externalDependencies ?? []).map((d: string) =>
                  <li key={d}>{d}</li>)}
              </ul>
            </div>
            <div className="rounded border border-border p-2 text-xs md:col-span-2"
              data-testid="card-rmp-risk-matrix">
              <div className="font-semibold">Future Live-Command Risk Matrix</div>
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="opacity-70 text-left">
                    <th>Command</th>
                    <th>Risk</th>
                    <th>Approvals</th>
                    <th>Dry Runs</th>
                    <th>Rollback</th>
                    <th>Exec</th>
                    <th>Send</th>
                  </tr>
                </thead>
                <tbody>
                  {(status.riskMatrix ?? []).map((r: any) => (
                    <tr key={r.commandType} className="border-t border-border/40"
                      data-testid={`row-rmp-risk-${r.commandType}`}>
                      <td>{r.commandType}</td>
                      <td>{r.riskLevel}</td>
                      <td>{(r.requiredApprovals ?? []).join(", ")}</td>
                      <td>{(r.requiredDryRuns ?? []).join(", ")}</td>
                      <td>{r.rollbackRequirement}</td>
                      <td>{String(r.executionEnabled)}</td>
                      <td>{String(r.realSendAllowed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" data-testid="button-rmp-generate"
            onClick={runGenerate} disabled={busy}>
            Generate Migration Plan
          </Button>
          <Button size="sm" variant="outline" data-testid="button-rmp-export"
            onClick={downloadExport}>
            Export Migration Plan JSON
          </Button>
        </div>
        {genResult && (
          <pre className="font-mono text-xs whitespace-pre-wrap bg-muted/30 p-2 rounded"
            data-testid="text-rmp-gen-response">
{JSON.stringify(genResult, null, 2)}
          </pre>
        )}
        <div className="rounded border border-border p-2 text-xs"
          data-testid="block-rmp-history">
          <div className="font-semibold mb-1">Migration Plan Reports ({history.length})</div>
          {history.slice(0, 50).map((r: any) => (
            <div key={r.id} className="font-mono text-xs border-b border-border/60 py-1"
              data-testid={`row-rmp-history-${r.id}`}>
              {r.generatedAt} · {r.status} · blockers={r.blockers?.length ?? 0} · {r.id}
            </div>
          ))}
          {history.length === 0 && <div className="opacity-60">No reports yet.</div>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================================================ */
/* 3D/4D Room, Avatar, Production Units, Media Pipeline, Preview */
/* All panels are admin-only previews of draft/internal records. */
/* ============================================================ */
const DRAFT_BADGES = [
  "Draft", "Internal Only", "Admin Preview", "No Public URL",
  "No Unreal Execution", "No 4D Hardware", "No Publishing",
];
function BadgeRow({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((b) => (
        <span key={b}
          className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300"
          data-testid={`badge-${b.toLowerCase().replace(/\s+/g, "-")}`}>
          {b}
        </span>
      ))}
    </div>
  );
}
function SafetyNotice({ text }: { text: string }) {
  return (
    <div className="text-[11px] text-amber-300/90 border border-amber-500/30 bg-amber-500/5 rounded-md px-3 py-2">
      {text}
    </div>
  );
}

const ROOM_PROMPT_EXAMPLES = [
  "Create a 4D breaking-news room with blue-gold lighting, AI anchor, world map wall, red alert light cue, bass hit, fog suggestion, lower-third, ticker, and social clip package.",
  "Create a premium podcast room with two AI hosts, warm cinematic lighting, table microphones, video wall, YouTube episode package, and Shorts/Reels package.",
  "Create a debate studio from this news topic with moderator avatar, two guest avatars, pro/con argument panels, audience hall mode, and 4D tension cues.",
  "Create a market-watch newsroom with analyst avatar, financial panels, world map, ticker, LED wall video loop, and YouTube package.",
];

function RoomGeneratorPanel() {
  const [prompt, setPrompt] = useState(ROOM_PROMPT_EXAMPLES[0]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const r = await jget("/room-generator/list");
    setRooms(r?.rooms ?? []);
  };
  useEffect(() => { load(); }, []);
  const generate = async () => {
    setBusy(true);
    await jpost("/room-generator/generate", { prompt });
    setBusy(false);
    load();
  };
  return (
    <Card data-testid="card-room-generator">
      <CardHeader>
        <CardTitle>3D/4D Room Generator</CardTitle>
        <CardDescription>
          Generate newsrooms, podcast rooms, debate studios, halls, and cinema rooms by prompt — admin-only draft records.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <SafetyNotice text="Generates room concepts only. Real Unreal level loading, MRQ, Sequencer, and 4D hardware remain disabled." />
        <BadgeRow items={DRAFT_BADGES} />
        <div className="flex flex-wrap gap-2">
          {ROOM_PROMPT_EXAMPLES.map((p, i) => (
            <Button key={i} variant="outline" size="sm"
              data-testid={`button-room-example-${i}`}
              onClick={() => setPrompt(p)}>Example {String.fromCharCode(65 + i)}</Button>
          ))}
        </div>
        <textarea className="w-full h-24 rounded-md bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm"
          value={prompt} onChange={(e) => setPrompt(e.target.value)}
          data-testid="input-room-prompt" />
        <Button onClick={generate} disabled={busy} data-testid="button-generate-room">
          {busy ? "Generating…" : "Generate Room (Draft)"}
        </Button>
        <div className="space-y-2">
          {rooms.map((r) => (
            <div key={r.roomId} className="border border-slate-800 rounded-md p-3 text-xs"
              data-testid={`row-room-${r.roomId}`}>
              <div className="font-semibold text-amber-300">{r.roomName} · {r.roomCategory}</div>
              <div className="text-slate-400">Lighting: {r.lightingStyle} · Camera: {r.cameraStyle}</div>
              <div className="text-slate-500 mt-1">Level candidate: {r.unrealLevelCandidate}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AvatarCreatorPanel() {
  const [prompt, setPrompt] = useState("News anchor avatar with earpiece, suit, and desk nameplate");
  const [accPrompt, setAccPrompt] = useState("Studio microphone");
  const [avatars, setAvatars] = useState<any[]>([]);
  const [accessories, setAccessories] = useState<any[]>([]);
  const load = async () => {
    const r = await jget("/avatar-creator/list");
    setAvatars(r?.avatars ?? []);
    setAccessories(r?.accessories ?? []);
  };
  useEffect(() => { load(); }, []);
  return (
    <Card data-testid="card-avatar-creator">
      <CardHeader>
        <CardTitle>Avatar & Accessories Creator</CardTitle>
        <CardDescription>Draft avatar specs and accessories — admin-only.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <SafetyNotice text="Generates avatar specs only. No MetaHuman import, no live voice synthesis, no publishing." />
        <BadgeRow items={DRAFT_BADGES} />
        <textarea className="w-full h-20 rounded-md bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm"
          value={prompt} onChange={(e) => setPrompt(e.target.value)}
          data-testid="input-avatar-prompt" />
        <Button onClick={async () => { await jpost("/avatar-creator/generate", { prompt }); load(); }}
          data-testid="button-generate-avatar">Generate Avatar (Draft)</Button>
        <div className="space-y-2">
          {avatars.map((a) => (
            <div key={a.avatarId} className="border border-slate-800 rounded-md p-3 text-xs"
              data-testid={`row-avatar-${a.avatarId}`}>
              <div className="font-semibold text-amber-300">{a.avatarName} · {a.avatarRole}</div>
              <div className="text-slate-400">Voice: {a.voiceProfile} · Lip sync: {a.lipSyncReadiness}</div>
              <div className="text-slate-500 mt-1">Accessories: {(a.accessoryList ?? []).join(", ")}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-800 pt-3 space-y-2">
          <div className="text-xs uppercase tracking-wider text-slate-400">Accessories</div>
          <textarea className="w-full h-16 rounded-md bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm"
            value={accPrompt} onChange={(e) => setAccPrompt(e.target.value)}
            data-testid="input-accessory-prompt" />
          <Button size="sm" onClick={async () => { await jpost("/avatar-creator/accessories/generate", { prompt: accPrompt }); load(); }}
            data-testid="button-generate-accessory">Generate Accessory (Draft)</Button>
          {accessories.map((x) => (
            <div key={x.accessoryId} className="text-xs text-slate-400"
              data-testid={`row-accessory-${x.accessoryId}`}>
              · {x.accessoryType}: {x.label}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProductionUnitsPanel() {
  const [name, setName] = useState("Breaking News Unit");
  const [type, setType] = useState("news_unit");
  const [units, setUnits] = useState<any[]>([]);
  const load = async () => {
    const r = await jget("/production-units/list");
    setUnits(r?.units ?? []);
  };
  useEffect(() => { load(); }, []);
  return (
    <Card data-testid="card-production-units">
      <CardHeader>
        <CardTitle>Production Units Builder</CardTitle>
        <CardDescription>Bind room + avatars + voice/asset/video jobs + 4D cue plan into a draft unit.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <SafetyNotice text="Production units are planning constructs only. No live execution." />
        <BadgeRow items={DRAFT_BADGES} />
        <div className="flex gap-2">
          <input className="flex-1 rounded-md bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm"
            value={name} onChange={(e) => setName(e.target.value)}
            data-testid="input-unit-name" />
          <select className="rounded-md bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm"
            value={type} onChange={(e) => setType(e.target.value)}
            data-testid="select-unit-type">
            {["news_unit","debate_unit","podcast_unit","youtube_unit","social_clip_unit",
              "documentary_unit","education_unit","event_unit","four_d_cinema_unit","custom_unit"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <Button onClick={async () => {
            await jpost("/production-units/create", { unitName: name, unitType: type });
            load();
          }} data-testid="button-create-unit">Create Unit (Draft)</Button>
        </div>
        <div className="space-y-2">
          {units.map((u) => (
            <div key={u.unitId} className="border border-slate-800 rounded-md p-3 text-xs"
              data-testid={`row-unit-${u.unitId}`}>
              <div className="font-semibold text-amber-300">{u.unitName} · {u.unitType}</div>
              <div className="text-slate-500">Dry-run chain: {u.unrealDryRunChainStatus}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MediaPipelinePanel() {
  const [prompt, setPrompt] = useState("News to YouTube about AI safety policy changes");
  const [type, setType] = useState("news_to_youtube");
  const [pkgs, setPkgs] = useState<any[]>([]);
  const load = async () => {
    const r = await jget("/media-pipeline/packages");
    setPkgs(r?.packages ?? []);
  };
  useEffect(() => { load(); }, []);
  return (
    <Card data-testid="card-media-pipeline">
      <CardHeader>
        <CardTitle>Media & Content Pipeline</CardTitle>
        <CardDescription>News, debate, podcast, YouTube, shorts, social — internal/draft packages only.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <SafetyNotice text="No publishing, no external posting, no live stream. Packages are draft for root-admin review." />
        <BadgeRow items={DRAFT_BADGES} />
        <div className="flex gap-2">
          <select className="rounded-md bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm"
            value={type} onChange={(e) => setType(e.target.value)}
            data-testid="select-package-type">
            {["news_to_debate","news_to_podcast","news_to_youtube","news_to_social",
              "podcast_to_clips","debate_to_clips","newsroom_to_4d_cinema","custom_package"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <textarea className="w-full h-20 rounded-md bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm"
          value={prompt} onChange={(e) => setPrompt(e.target.value)}
          data-testid="input-package-prompt" />
        <Button onClick={async () => {
          await jpost("/media-pipeline/generate", { prompt, packageType: type, sourceTopic: prompt });
          load();
        }} data-testid="button-generate-package">Generate Package (Draft)</Button>
        <div className="space-y-2">
          {pkgs.map((p) => (
            <div key={p.packageId} className="border border-slate-800 rounded-md p-3 text-xs"
              data-testid={`row-package-${p.packageId}`}>
              <div className="font-semibold text-amber-300">{p.packageType}</div>
              <div className="text-slate-400">Topic: {p.sourceTopic.slice(0, 100)}</div>
              <div className="text-slate-500">Room rec: {p.roomRecommendation}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function NewsToDebatePanel() {
  const [topic, setTopic] = useState("");
  const [out, setOut] = useState<any>(null);
  return (
    <Card data-testid="card-news-to-debate">
      <CardHeader>
        <CardTitle>News to Debate</CardTitle>
        <CardDescription>Manual draft pipeline — admin-only.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <SafetyNotice text="Draft/internal topic packages for root-admin review. No publishing. No live stream. No real Unreal execution. No real 4D hardware." />
        <BadgeRow items={DRAFT_BADGES} />
        <textarea className="w-full h-24 rounded-md bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm"
          placeholder="Paste news topic or article summary"
          value={topic} onChange={(e) => setTopic(e.target.value)}
          data-testid="input-news-topic" />
        <Button onClick={async () => {
          const r = await jpost("/media-pipeline/news-to-debate", { newsTopic: topic });
          setOut(r?.package ?? null);
        }} data-testid="button-news-to-debate">Generate Debate Package (Draft)</Button>
        {out && (
          <div className="border border-slate-800 rounded-md p-3 text-xs space-y-2"
            data-testid="result-news-to-debate">
            <div className="font-semibold text-amber-300">Debate Proposition</div>
            <pre className="whitespace-pre-wrap text-slate-300">{out.scriptDraft}</pre>
            <div className="font-semibold text-amber-300">Pro/Con Map</div>
            {out.debateAngles.map((a: string, i: number) => (
              <div key={i} className="text-slate-400">· {a}</div>
            ))}
            <div className="font-semibold text-amber-300">Recommendations</div>
            <div className="text-slate-400">Room: {out.roomRecommendation}</div>
            <div className="text-slate-400">Avatars: {out.avatarRecommendation.join(", ")}</div>
            <div className="text-slate-400">4D cues: {out.fourDCueSuggestions.join(", ")}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const PREVIEW_MODES_UI = [
  "newsroom","podcast_room","debate_studio","hall_event",
  "youtube_social_package","four_d_cinema_cue",
];
const PREVIEW_LAYOUTS_UI = [
  "anchor_center","podcast_two_host","debate_three_person","hall_stage",
  "market_wall","breaking_news_alert","emergency_broadcast","custom_grid",
];
const CAMERA_PRESETS_UI = [
  "MOCK_CAM_ANCHOR_CENTER","MOCK_CAM_TWO_HOST","MOCK_CAM_DEBATE_TRIANGLE",
  "MOCK_CAM_HALL_WIDE","MOCK_CAM_SOCIAL_TIGHT","MOCK_CAM_CINEMA","MOCK_CAM_PRESET_PRIMARY",
];
const LIGHTING_PRESETS_UI = [
  "MOCK_LIGHT_NEWS_KEY","MOCK_LIGHT_PODCAST_WARM","MOCK_LIGHT_DEBATE_DUEL",
  "MOCK_LIGHT_HALL_AMBIENT","MOCK_LIGHT_SOCIAL_HIGH_KEY","MOCK_LIGHT_CINEMA_DARK","MOCK_LIGHT_PRESET_DRAMATIC",
];
function ProductionPreviewPanel() {
  const [id, setId] = useState("");
  const [view, setView] = useState<any>(null);
  const [snap, setSnap] = useState<any>(null);
  const [mode, setMode] = useState("newsroom");
  const [layout, setLayout] = useState("anchor_center");
  const [room, setRoom] = useState("");
  const [avatars, setAvatars] = useState("");
  const [pkgs, setPkgs] = useState("");
  const [camera, setCamera] = useState("MOCK_CAM_ANCHOR_CENTER");
  const [lighting, setLighting] = useState("MOCK_LIGHT_NEWS_KEY");
  const [lower, setLower] = useState("");
  const [ticker, setTicker] = useState("");
  const [panelText, setPanelText] = useState("");

  const load = async () => {
    if (!id) return;
    const r = await jget(`/preview/${id}`);
    setView(r);
    setSnap(r?.snapshot ?? null);
  };
  const generate = async () => {
    if (!id) return;
    await jpost(`/preview/${id}/generate`, {});
    load();
  };
  const generateCinematic = async () => {
    if (!id) return;
    const r = await jpost(`/preview/${id}/generate-cinematic`, {
      previewMode: mode, layoutPreset: layout,
      roomId: room || null,
      avatarIds: avatars.split(",").map((s) => s.trim()).filter(Boolean),
      selectedMediaPackageIds: pkgs.split(",").map((s) => s.trim()).filter(Boolean),
      cameraPreset: camera, lightingPreset: lighting,
      lowerThirdText: lower, tickerText: ticker, panelSummary: panelText,
    });
    setSnap(r?.snapshot ?? null);
    load();
  };
  const duplicate = async () => {
    if (!snap?.snapshotId) return;
    const r = await jpost(`/preview/${snap.snapshotId}/duplicate`, {});
    setSnap(r?.snapshot ?? null);
    load();
  };
  const updateLayout = async () => {
    if (!snap?.snapshotId) return;
    const r = await jpost(`/preview/${snap.snapshotId}/update-layout`, {
      layoutPreset: layout, cameraPreset: camera, lightingPreset: lighting,
      lowerThirdText: lower, tickerText: ticker, panelSummary: panelText,
    });
    setSnap(r?.snapshot ?? null);
    load();
  };
  return (
    <Card data-testid="card-production-preview">
      <CardHeader>
        <CardTitle>Production Preview Screen</CardTitle>
        <CardDescription>Admin-only mock preview of the selected production package.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <SafetyNotice text="Admin Preview Only — this is not an Unreal render, not a published video, and not a 4D hardware execution." />
        <BadgeRow items={DRAFT_BADGES} />
        <div className="flex gap-2">
          <input className="flex-1 rounded-md bg-slate-950/40 border border-slate-700 px-3 py-2 text-sm"
            placeholder="Production ID"
            value={id} onChange={(e) => setId(e.target.value)}
            data-testid="input-preview-production-id" />
          <Button onClick={load} variant="outline" data-testid="button-preview-load">Load</Button>
          <Button onClick={generate} data-testid="button-preview-generate">Quick Snapshot</Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs border border-slate-800 rounded-md p-3">
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">Preview Mode</span>
            <select className="rounded bg-slate-950/40 border border-slate-700 px-2 py-1"
              value={mode} onChange={(e) => setMode(e.target.value)}
              data-testid="select-preview-mode">
              {PREVIEW_MODES_UI.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">Layout Preset</span>
            <select className="rounded bg-slate-950/40 border border-slate-700 px-2 py-1"
              value={layout} onChange={(e) => setLayout(e.target.value)}
              data-testid="select-preview-layout">
              {PREVIEW_LAYOUTS_UI.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">Camera Preset</span>
            <select className="rounded bg-slate-950/40 border border-slate-700 px-2 py-1"
              value={camera} onChange={(e) => setCamera(e.target.value)}
              data-testid="select-preview-camera">
              {CAMERA_PRESETS_UI.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">Lighting Preset</span>
            <select className="rounded bg-slate-950/40 border border-slate-700 px-2 py-1"
              value={lighting} onChange={(e) => setLighting(e.target.value)}
              data-testid="select-preview-lighting">
              {LIGHTING_PRESETS_UI.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <input className="rounded bg-slate-950/40 border border-slate-700 px-2 py-1"
            placeholder="Room ID (optional)" value={room} onChange={(e) => setRoom(e.target.value)}
            data-testid="input-preview-room" />
          <input className="rounded bg-slate-950/40 border border-slate-700 px-2 py-1"
            placeholder="Avatar IDs (comma)" value={avatars} onChange={(e) => setAvatars(e.target.value)}
            data-testid="input-preview-avatars" />
          <input className="rounded bg-slate-950/40 border border-slate-700 px-2 py-1"
            placeholder="Media Package IDs (comma)" value={pkgs} onChange={(e) => setPkgs(e.target.value)}
            data-testid="input-preview-packages" />
          <input className="rounded bg-slate-950/40 border border-slate-700 px-2 py-1"
            placeholder="Panel summary" value={panelText} onChange={(e) => setPanelText(e.target.value)}
            data-testid="input-preview-panel" />
          <input className="rounded bg-slate-950/40 border border-slate-700 px-2 py-1 md:col-span-2"
            placeholder="Lower-third text" value={lower} onChange={(e) => setLower(e.target.value)}
            data-testid="input-preview-lower-third" />
          <input className="rounded bg-slate-950/40 border border-slate-700 px-2 py-1 md:col-span-2"
            placeholder="Ticker text" value={ticker} onChange={(e) => setTicker(e.target.value)}
            data-testid="input-preview-ticker" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={generateCinematic} data-testid="button-generate-cinematic">
            Generate Cinematic Preview
          </Button>
          <Button onClick={duplicate} variant="outline" disabled={!snap?.snapshotId}
            data-testid="button-duplicate-preview">Duplicate</Button>
          <Button onClick={updateLayout} variant="outline" disabled={!snap?.snapshotId}
            data-testid="button-update-layout">Update Layout</Button>
        </div>
        {snap && view?.snapshot && (
          <div className="grid grid-cols-12 gap-3" data-testid="preview-stage">
            <div className="col-span-3 border border-slate-800 rounded-md p-3 text-xs space-y-1"
              data-testid="preview-info">
              <div className="font-semibold text-amber-300">Production</div>
              <div className="text-slate-400">ID: {view.productionId}</div>
              <div className="text-slate-400">Status: {view.snapshot.readinessStatus}</div>
              <div className="text-slate-400">Approval: {view.snapshot.approvalStatus}</div>
              <div className="text-slate-400">Dry-run: {view.snapshot.unrealDryRunStatus}</div>
            </div>
            <div className="col-span-6 border border-slate-800 rounded-md p-3 text-xs"
              data-testid="preview-stage-main">
              <div className="aspect-video bg-gradient-to-br from-slate-900 to-slate-950 rounded border border-slate-700 flex items-center justify-center text-slate-500 text-sm">
                Main stage / room preview (mock)
              </div>
              <div className="mt-2 text-amber-300 font-semibold">{view.snapshot.lowerThird}</div>
              <div className="mt-1 text-slate-400 text-[10px] uppercase tracking-widest border-t border-slate-800 pt-1">
                {view.snapshot.ticker}
              </div>
            </div>
            <div className="col-span-3 border border-slate-800 rounded-md p-3 text-xs space-y-1"
              data-testid="preview-avatars">
              <div className="font-semibold text-amber-300">Avatars / Assets</div>
              {(view.snapshot.avatarIds ?? []).map((a: string) => (
                <div key={a} className="text-slate-400">· {a}</div>
              ))}
              <div className="border-t border-slate-800 pt-1 mt-1 font-semibold text-amber-300">Asset Badges</div>
              {(view.snapshot.assetBadges ?? []).map((b: string) => (
                <div key={b} className="text-slate-400">· {b}</div>
              ))}
            </div>
            <div className="col-span-12 border border-slate-800 rounded-md p-3 text-xs"
              data-testid="preview-4d-timeline">
              <div className="font-semibold text-amber-300 mb-1">4D Cue Timeline (mock)</div>
              <div className="flex gap-1.5 flex-wrap">
                {(view.snapshot.fourDCueMarkers ?? []).map((m: string) => (
                  <span key={m} className="px-2 py-0.5 rounded border border-sky-500/40 bg-sky-500/10 text-sky-300">
                    {m}
                  </span>
                ))}
              </div>
            </div>
            <div className="col-span-12 flex gap-2 flex-wrap text-[10px] uppercase tracking-wider">
              <span className="px-2 py-0.5 rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-300">
                Camera: {view.snapshot.cameraPreset}
              </span>
              <span className="px-2 py-0.5 rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-300">
                Lighting: {view.snapshot.lightingPreset}
              </span>
              <span className="px-2 py-0.5 rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-300">
                Package: {view.snapshot.mediaPackageType ?? "—"}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const WIZARD_TYPES_UI = [
  "newsroom","breaking_news","debate","podcast","interview",
  "market_watch","youtube_episode","social_clip_package",
  "four_d_cinema_room","event_hall","custom_production",
];
const WIZARD_STEP_LABELS = [
  "Production Type","Prompt / Topic","Room Generation","Avatar & Accessories",
  "Media Package","4D Cue Suggestions","Cinematic Preview","Save Draft Package",
];
function ProductionWizardPanel() {
  const [type, setType] = useState("newsroom");
  const [prompt, setPrompt] = useState("");
  const [productionId, setProductionId] = useState("");
  const [wizard, setWizard] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const refreshHistory = async () => {
    const r = await jget("/wizard/history");
    setHistory(r?.sessions ?? []);
  };
  useEffect(() => { refreshHistory(); }, []);

  const start = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    const r = await jpost("/wizard/start", {
      productionType: type, prompt,
      productionId: productionId.trim() || null,
    });
    setBusy(false);
    if (r?.wizard) setWizard(r.wizard);
    refreshHistory();
  };
  const step = async (n: number) => {
    if (!wizard?.wizardId) return;
    setBusy(true);
    const r = await jpost(`/wizard/${wizard.wizardId}/step`, { step: n });
    setBusy(false);
    if (r?.wizard) setWizard(r.wizard);
    refreshHistory();
  };
  const finalize = async () => {
    if (!wizard?.wizardId) return;
    setBusy(true);
    const r = await jpost(`/wizard/${wizard.wizardId}/finalize`, {});
    setBusy(false);
    if (r?.wizard) setWizard(r.wizard);
    refreshHistory();
  };
  const loadById = async (wid: string) => {
    const r = await jget(`/wizard/${wid}`);
    if (r?.wizard) setWizard({ ...r.wizard, _review: r?.review ?? null });
  };
  const sendToReview = async () => {
    if (!wizard?.wizardId) return;
    setBusy(true);
    const r = await jpost(`/wizard/${wizard.wizardId}/send-to-review`, {});
    setBusy(false);
    if (r?.wizard) {
      setWizard({ ...r.wizard, _review: r.review ?? null,
        _readinessReportId: r.readinessReportId,
        _approvalStage: r.approvalStage });
    } else if (r?.error) {
      alert(`Send to review failed: ${r.error}`);
    }
    refreshHistory();
  };

  return (
    <Card data-testid="card-production-wizard">
      <CardHeader>
        <CardTitle>Guided Production Wizard</CardTitle>
        <CardDescription>
          Turn one idea into a complete draft production package — room, avatars, media,
          4D cues, and cinematic preview. Admin-only, draft/internal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SafetyNotice text="Admin Preview Only — wizard outputs are draft/internal mock data. No render, no publish, no Unreal execution, no 4D hardware." />
        <BadgeRow items={DRAFT_BADGES} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs border border-slate-800 rounded-md p-3">
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">Production Type</span>
            <select className="rounded bg-slate-950/40 border border-slate-700 px-2 py-1"
              value={type} onChange={(e) => setType(e.target.value)}
              data-testid="select-wizard-type">
              {WIZARD_TYPES_UI.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <input className="rounded bg-slate-950/40 border border-slate-700 px-2 py-1 md:col-span-2"
            placeholder="Prompt / topic (e.g. AI safety news debate)"
            value={prompt} onChange={(e) => setPrompt(e.target.value)}
            data-testid="input-wizard-prompt" />
          <input className="rounded bg-slate-950/40 border border-slate-700 px-2 py-1 md:col-span-3"
            placeholder="Optional Production ID (enables cinematic preview at step 7)"
            value={productionId} onChange={(e) => setProductionId(e.target.value)}
            data-testid="input-wizard-production-id" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={start} disabled={busy || !prompt.trim()}
            data-testid="button-wizard-start">Start Wizard</Button>
          {wizard?.wizardId && (
            <>
              <Button onClick={() => step(3)} variant="outline" disabled={busy}
                data-testid="button-wizard-step-room">Generate Room</Button>
              <Button onClick={() => step(4)} variant="outline" disabled={busy}
                data-testid="button-wizard-step-avatars">Generate Avatars</Button>
              <Button onClick={() => step(5)} variant="outline" disabled={busy}
                data-testid="button-wizard-step-media">Generate Media</Button>
              <Button onClick={() => step(6)} variant="outline" disabled={busy}
                data-testid="button-wizard-step-cues">Suggest 4D Cues</Button>
              <Button onClick={() => step(7)} variant="outline" disabled={busy}
                data-testid="button-wizard-step-preview">Cinematic Preview</Button>
              <Button onClick={finalize} disabled={busy || wizard?.status === "finalized"}
                data-testid="button-wizard-finalize">Save Draft Package</Button>
              <Button onClick={sendToReview}
                disabled={busy || wizard?.status !== "finalized" || !wizard?.productionId}
                data-testid="button-wizard-send-to-review">Send to Readiness Review</Button>
            </>
          )}
        </div>
        {wizard?.productionId && (
          <div className="flex flex-wrap gap-2 text-xs" data-testid="wizard-deep-links">
            <a className="px-2 py-1 rounded border border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
              href={`/admin/production-house?section=package&id=${encodeURIComponent(wizard.productionId)}`}
              data-testid="link-wizard-package-viewer">Open in Package Viewer</a>
            <a className="px-2 py-1 rounded border border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
              href={`/admin/production-house?section=readiness&id=${encodeURIComponent(wizard.productionId)}`}
              data-testid="link-wizard-readiness-center">Open in Readiness Center</a>
            <a className="px-2 py-1 rounded border border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
              href={`/admin/production-house?section=approval-board&id=${encodeURIComponent(wizard.productionId)}`}
              data-testid="link-wizard-approval-board">Open in Approval Board</a>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 text-[10px] uppercase tracking-wider"
          data-testid="wizard-status-badges">
          <span className="px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300">Draft Package</span>
          {wizard?.productionId && (
            <span className="px-2 py-0.5 rounded border border-sky-500/40 bg-sky-500/10 text-sky-300">Linked to Production</span>
          )}
          {(wizard?._review || wizard?._approvalStage === "needs_review") && (
            <span className="px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              data-testid="badge-ready-for-review">Ready for Review</span>
          )}
          <span className="px-2 py-0.5 rounded border border-slate-600 text-slate-300">Internal Only</span>
          <span className="px-2 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-300">No Unreal Execution</span>
          <span className="px-2 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-300">No 4D Hardware</span>
        </div>
        {wizard && (
          <div className="border border-slate-800 rounded-md p-3 text-xs space-y-2"
            data-testid="wizard-current">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="font-semibold text-amber-300">Wizard:</span>
              <span className="text-slate-300" data-testid="text-wizard-id">{wizard.wizardId}</span>
              <span className="px-2 py-0.5 rounded-full border border-sky-500/40 bg-sky-500/10 text-sky-300">
                {wizard.productionType}
              </span>
              <span className="px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300"
                data-testid="text-wizard-status">{wizard.status}</span>
              <span className="px-2 py-0.5 rounded-full border border-slate-600 text-slate-300"
                data-testid="text-wizard-step">Step {wizard.currentStep} / 8</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
              {WIZARD_STEP_LABELS.map((lbl, i) => {
                const n = i + 1;
                const done = (wizard.completedSteps ?? []).includes(n);
                return (
                  <div key={n} className={`flex items-center gap-2 px-2 py-1 rounded border ${
                    done ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300"
                         : "border-slate-700 text-slate-400"
                  }`} data-testid={`row-wizard-step-${n}`}>
                    <span className="font-mono text-[10px]">{n}.</span>
                    <span>{lbl}</span>
                    <span className="ml-auto text-[10px] uppercase">{done ? "done" : "pending"}</span>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-slate-400">
              <div>Room: <span className="text-slate-200">{wizard.generatedRoomId ?? "—"}</span></div>
              <div>Avatars: <span className="text-slate-200">
                {(wizard.generatedAvatarIds ?? []).join(", ") || "—"}
              </span></div>
              <div>Accessories: <span className="text-slate-200">
                {(wizard.generatedAccessoryIds ?? []).join(", ") || "—"}
              </span></div>
              <div>Media Package: <span className="text-slate-200">
                {wizard.generatedMediaPackageId ?? "—"}
              </span></div>
              <div>Preview: <span className="text-slate-200">
                {wizard.generatedPreviewId ?? "—"}
              </span></div>
              <div>4D Cues: <span className="text-slate-200">
                {(wizard.fourDCueSuggestions ?? []).length} suggested
              </span></div>
            </div>
            {(wizard.fourDCueSuggestions ?? []).length > 0 && (
              <div className="flex gap-1.5 flex-wrap pt-1">
                {wizard.fourDCueSuggestions.map((c: string) => (
                  <span key={c} className="px-2 py-0.5 rounded border border-sky-500/40 bg-sky-500/10 text-sky-300">
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="border border-slate-800 rounded-md p-3 text-xs"
          data-testid="wizard-history">
          <div className="font-semibold text-amber-300 mb-2">Recent Wizard Sessions</div>
          {history.length === 0 && <div className="text-slate-500">No wizard sessions yet.</div>}
          <div className="space-y-1">
            {history.slice(0, 25).map((w: any) => (
              <button
                key={w.wizardId}
                onClick={() => loadById(w.wizardId)}
                className="w-full text-left px-2 py-1 rounded border border-slate-800 hover:border-slate-600 flex items-center gap-2"
                data-testid={`button-wizard-history-${w.wizardId}`}
              >
                <span className="font-mono text-[10px] text-slate-400">{w.wizardId}</span>
                <span className="text-slate-300">{w.productionType}</span>
                <span className="text-slate-500">step {w.currentStep}/8</span>
                <span className="ml-auto text-[10px] uppercase text-amber-300">{w.status}</span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
type CoverSweepOrphan = { file: string; id: string; ext: string; bytes?: number };
type CoverSweepResponse = {
  ok: boolean;
  dryRun?: boolean;
  orphanCount?: number;
  orphanBytes?: number;
  removed?: number;
  orphans?: CoverSweepOrphan[];
  confirmToken?: string;
  confirmTokenTtlMs?: number;
  error?: string;
  message?: string;
};

async function coverSweepRequest(
  apply: boolean,
  confirmToken?: string,
): Promise<CoverSweepResponse> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore — endpoint may still accept without token in some setups */
  }
  const url = `/api/admin/broadcasts/covers/sweep${apply ? "?apply=1" : ""}`;
  const r = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: JSON.stringify(apply && confirmToken ? { confirmToken } : {}),
  });
  return (await r.json().catch(() => ({ ok: false, error: "bad_json" }))) as CoverSweepResponse;
}

type CoverSweepStatus = {
  lastScanAt: number | null;
  lastOrphanCount: number | null;
  lastOrphanBytes: number | null;
  threshold: number;
  wasAboveThreshold: boolean;
  nextScanAt: number | null;
  intervalMs: number | null;
  lastAutoResolvedAt: number | null;
  lastAutoResolvedCount: number | null;
  flapping?: boolean;
  flappingCount?: number;
  flappingWindowMs?: number;
  flappingThreshold?: number;
  // Task #831 — observability for the flapping latch.
  lastFlappingFiredAt?: number | null;
  lastReArmedAt?: number | null;
  auditMaxBytes?: number;
  auditMaxArchives?: number;
  auditMaxBytesSource?: "db" | "env" | "default";
  auditMaxArchivesSource?: "db" | "env" | "default";
  auditLimits?: {
    bytesMin: number;
    bytesMax: number;
    archivesMin: number;
    archivesMax: number;
    bytesDefault: number;
    archivesDefault: number;
  };
  currentArchiveCount?: number;
  activeAuditBytes?: number | null;
};

async function coverSweepAuditRetentionRequest(payload: {
  maxBytes?: number;
  maxArchives?: number;
}): Promise<{ ok: boolean; status?: CoverSweepStatus; error?: string }> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  const r = await fetch(
    "/api/admin/broadcasts/covers/sweep/audit-retention",
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: JSON.stringify(payload),
    },
  );
  return (await r.json().catch(() => ({ ok: false, error: "bad_json" }))) as any;
}

async function coverSweepStatusRequest(): Promise<CoverSweepStatus | null> {
  try {
    const r = await fetch("/api/admin/broadcasts/covers/sweep/status", {
      credentials: "include",
    });
    const j = await r.json().catch(() => ({}));
    if (j?.ok && j?.status) return j.status as CoverSweepStatus;
  } catch {
    /* ignore */
  }
  return null;
}

type CoverSweepRunNowResponse = {
  ok: boolean;
  result?: {
    orphanCount: number;
    scannedAt: number;
    threshold: number;
    alerted: boolean;
  };
  status?: CoverSweepStatus;
  error?: string;
  message?: string;
};

async function coverSweepRunNowRequest(): Promise<CoverSweepRunNowResponse> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  const r = await fetch("/api/admin/broadcasts/covers/sweep/run-now", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: "{}",
  });
  return (await r.json().catch(() => ({ ok: false, error: "bad_json" }))) as CoverSweepRunNowResponse;
}

async function coverSweepThresholdRequest(
  threshold: number,
): Promise<{ ok: boolean; status?: CoverSweepStatus; error?: string }> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  const r = await fetch("/api/admin/broadcasts/covers/sweep/threshold", {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: JSON.stringify({ threshold }),
  });
  return (await r.json().catch(() => ({ ok: false, error: "bad_json" }))) as any;
}

// Task #809 — Update the cover-sweep flapping threshold (number of
// auto-clears inside the window that triggers the flapping alert).
async function coverSweepFlappingThresholdRequest(
  value: number,
): Promise<{ ok: boolean; value?: number; status?: CoverSweepStatus; error?: string }> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  const r = await fetch(
    "/api/admin/broadcasts/covers/sweep/flapping-threshold",
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: JSON.stringify({ value }),
    },
  );
  return (await r.json().catch(() => ({ ok: false, error: "bad_json" }))) as any;
}

// Task #809 — Update the cover-sweep flapping window (how far back to
// count recent auto-clears, in milliseconds).
async function coverSweepFlappingWindowMsRequest(
  value: number,
): Promise<{ ok: boolean; value?: number; status?: CoverSweepStatus; error?: string }> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  const r = await fetch(
    "/api/admin/broadcasts/covers/sweep/flapping-window-ms",
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: JSON.stringify({ value }),
    },
  );
  return (await r.json().catch(() => ({ ok: false, error: "bad_json" }))) as any;
}

// Task #837 — Re-arm the cover-sweep flapping latch without re-saving
// the threshold or window. POST to a dedicated route so the
// `lastReArmedAt` timestamp gets bumped via the same helper used by the
// threshold/window PATCH routes.
async function coverSweepFlappingRearmRequest(): Promise<{
  ok: boolean;
  lastReArmedAt?: number;
  status?: CoverSweepStatus;
  error?: string;
  message?: string;
}> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  const r = await fetch(
    "/api/admin/broadcasts/covers/sweep/flapping/rearm",
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
    },
  );
  return (await r.json().catch(() => ({ ok: false, error: "bad_json" }))) as any;
}

// Task #809 — Client-side bounds; mirror server enforcement so admins
// see a fast error before the round-trip.
const COVER_SWEEP_FLAPPING_THRESHOLD_MIN = 2;
const COVER_SWEEP_FLAPPING_THRESHOLD_MAX = 1000;
const COVER_SWEEP_FLAPPING_WINDOW_MINUTES_MIN = 1; // 1 minute
const COVER_SWEEP_FLAPPING_WINDOW_MINUTES_MAX = 90 * 24 * 60; // 90 days

type SweepApplyLastRun = {
  startedAt: number;
  finishedAt: number;
  applyMode: boolean;
  covers: { ok: boolean; orphanCount: number; removed: number; error?: string } | null;
  media: {
    ok: boolean;
    orphanCount: number;
    removed: number;
    bytesRemoved: number;
    error?: string;
  } | null;
} | null;

type SweepApplyMode = {
  ok: boolean;
  apply: boolean;
  override: boolean | null;
  envFallback: boolean;
  lastRun: SweepApplyLastRun;
  error?: string;
};

async function sweepApplyModeGet(): Promise<SweepApplyMode | null> {
  try {
    const r = await fetch("/api/admin/broadcasts/sweep/apply-mode", {
      credentials: "include",
    });
    const j = await r.json().catch(() => ({}));
    if (j?.ok) return j as SweepApplyMode;
  } catch {
    /* ignore */
  }
  return null;
}

async function sweepApplyModeSet(apply: boolean | null): Promise<SweepApplyMode | null> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  try {
    const r = await fetch("/api/admin/broadcasts/sweep/apply-mode", {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: JSON.stringify({ apply }),
    });
    const j = await r.json().catch(() => ({}));
    return j as SweepApplyMode;
  } catch {
    return null;
  }
}

async function sweepRunNow(): Promise<boolean> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  try {
    const r = await fetch("/api/admin/broadcasts/sweep/run-now", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
    });
    const j = await r.json().catch(() => ({}));
    return !!j?.ok;
  } catch {
    return false;
  }
}

function formatRelativeTime(ts: number | null): string {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  if (diff < 0) {
    const fwd = -diff;
    if (fwd < 60_000) return "in <1m";
    if (fwd < 3_600_000) return `in ${Math.round(fwd / 60_000)}m`;
    if (fwd < 86_400_000) return `in ${Math.round(fwd / 3_600_000)}h`;
    return `in ${Math.round(fwd / 86_400_000)}d`;
  }
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

type CoverSweepAutoClear = {
  id: string;
  acknowledgedAt: number | null;
  orphanCount: number | null;
  threshold: number | null;
};

async function coverSweepReopenAutoClearRequest(
  id: string,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  const r = await fetch(
    `/api/admin/broadcasts/covers/sweep/recent-auto-clears/${encodeURIComponent(id)}/reopen`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: "{}",
    },
  );
  return (await r.json().catch(() => ({ ok: false, error: "bad_json" }))) as {
    ok: boolean;
    error?: string;
    message?: string;
  };
}

async function coverSweepRecentAutoClearsRequest(): Promise<CoverSweepAutoClear[]> {
  try {
    const r = await fetch(
      "/api/admin/broadcasts/covers/sweep/recent-auto-clears?limit=10",
      { credentials: "include" },
    );
    const j = await r.json().catch(() => ({}));
    if (j?.ok && Array.isArray(j.items)) return j.items as CoverSweepAutoClear[];
  } catch {
    /* ignore */
  }
  return [];
}

type CoverSweepReopened = {
  id: string;
  reopenedAt: number | null;
  reopenedBy: string | null;
  autoResolvedAt: number | null;
  orphanCount: number | null;
  threshold: number | null;
};

async function coverSweepRecentReopenedRequest(): Promise<CoverSweepReopened[]> {
  try {
    const r = await fetch(
      "/api/admin/broadcasts/covers/sweep/recent-auto-clears/reopened?limit=10",
      { credentials: "include" },
    );
    const j = await r.json().catch(() => ({}));
    if (j?.ok && Array.isArray(j.items)) return j.items as CoverSweepReopened[];
  } catch {
    /* ignore */
  }
  return [];
}

type CoverSweepAuditEntry = {
  id: string;
  ts: string;
  actorId: string;
  mode: "dry_run" | "apply" | "restore";
  orphans?: { file: string; id: string; ext: string }[];
  removed: string[];
  errors?: { file: string; message: string }[];
  trashDir?: string;
  restorableFiles?: string[];
  restoredFrom?: string;
  restored?: string[];
};

type SweepArchiveSummary = {
  name: string;
  rotatedAt: string | null;
  bytes: number;
  // T366 — Per-archive kept/deleted breakdown so the cover-/media-sweep
  // panels can mirror the fallback-preset set/clear breakdown on every
  // rotated archive row. Optional for back-compat with older server builds.
  keptCount?: number;
  deletedCount?: number;
};

type CoverSweepAuditStats = {
  activeBytes: number;
  activeExists: boolean;
  archiveCount: number;
  archiveBytes: number;
  totalBytes: number;
  maxBytes: number;
  maxArchives: number;
  // T359 — Rotated archives surfaced for the per-archive Inspect dialog.
  archives?: SweepArchiveSummary[];
};

type MediaSweepAuditStats = CoverSweepAuditStats;

// T359 — Single archive entry returned by the preview endpoint. Mirrors the
// fallback-preset preview payload but uses the sweep entry shape (`mode` +
// `actorId` + a `raw` blob for surface-specific details).
type SweepArchivePreviewEntry = {
  id: string | null;
  ts: string | null;
  actorId: string;
  mode: string | null;
  raw: Record<string, unknown>;
};

type SweepArchivePreviewActor = {
  actorId: string;
  displayName: string;
};

type SweepArchivePreviewPage = {
  ok: boolean;
  archiveName: string;
  bytes: number;
  totalEntries: number;
  matchedEntries: number;
  corruptLines: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  actorId: string | null;
  from: string | null;
  to: string | null;
  actors: SweepArchivePreviewActor[];
  entries: SweepArchivePreviewEntry[];
  error?: string;
  message?: string;
};

// T359 — Reusable Inspect dialog + archive list mirroring the fallback-preset
// pattern (`BroadcastPreview.tsx` L5034-5342) so cover-sweep and media-sweep
// admins get the same actor + date filters, pagination, empty/filtered states.
function SweepAuditArchivesInspector(props: {
  surface: "cover-sweep" | "media-sweep";
  archives: SweepArchiveSummary[];
  previewBase: string;
  testIdPrefix: string;
}) {
  const { surface, archives, previewBase, testIdPrefix } = props;
  const [inspecting, setInspecting] = useState<string | null>(null);
  // T364 — founder gating for the "Download JSONL" footer button. We
  // piggy-back on the saved-views endpoint (which is already root-admin
  // gated and returns viewerIsFounder) so we don't need a dedicated
  // /me endpoint just for this surface.
  const [viewerIsFounder, setViewerIsFounder] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/broadcasts/saved-views", { credentials: "include" })
      .then((r) => r.json().catch(() => null))
      .then((j) => {
        if (!cancelled && j?.ok) setViewerIsFounder(!!j.viewerIsFounder);
      })
      .catch(() => {
        /* best-effort — leave defaulted to false */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [actorFilter, setActorFilter] = useState<string>("");
  const [fromTs, setFromTs] = useState<string>("");
  const [toTs, setToTs] = useState<string>("");
  const [pages, setPages] = useState<SweepArchivePreviewPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const hasFilters = !!actorFilter || !!fromTs || !!toTs;

  const buildUrl = (offset: number) => {
    const sp = new URLSearchParams();
    sp.set("limit", "50");
    sp.set("offset", String(offset));
    if (actorFilter) sp.set("actorId", actorFilter);
    if (fromTs) {
      const t = new Date(fromTs);
      if (!Number.isNaN(t.getTime())) sp.set("from", t.toISOString());
    }
    if (toTs) {
      const t = new Date(toTs);
      if (!Number.isNaN(t.getTime())) sp.set("to", t.toISOString());
    }
    return `${previewBase}/${encodeURIComponent(inspecting!)}/preview?${sp.toString()}`;
  };

  const loadFirstPage = async (archiveName: string) => {
    setLoading(true);
    setErrMsg(null);
    setPages([]);
    try {
      const sp = new URLSearchParams();
      sp.set("limit", "50");
      sp.set("offset", "0");
      if (actorFilter) sp.set("actorId", actorFilter);
      if (fromTs) {
        const t = new Date(fromTs);
        if (!Number.isNaN(t.getTime())) sp.set("from", t.toISOString());
      }
      if (toTs) {
        const t = new Date(toTs);
        if (!Number.isNaN(t.getTime())) sp.set("to", t.toISOString());
      }
      const r = await fetch(
        `${previewBase}/${encodeURIComponent(archiveName)}/preview?${sp.toString()}`,
        { credentials: "include" },
      );
      const j = (await r.json().catch(() => ({}))) as SweepArchivePreviewPage;
      if (!j?.ok) {
        setErrMsg(
          j?.message ||
            (r.status === 403
              ? "Only a founder can preview audit archives."
              : `Couldn't load archive (${j?.error || r.status}).`),
        );
        setPages([]);
        return;
      }
      setPages([j]);
    } catch (e) {
      setErrMsg((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Refetch first page when filters change (debounced via effect).
  useEffect(() => {
    if (!inspecting) return;
    loadFirstPage(inspecting);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspecting, actorFilter, fromTs, toTs]);

  const loadMore = async () => {
    if (!inspecting || pages.length === 0) return;
    const last = pages[pages.length - 1];
    if (!last.hasMore) return;
    setLoadingMore(true);
    try {
      const nextOffset = last.offset + last.entries.length;
      const r = await fetch(buildUrl(nextOffset), { credentials: "include" });
      const j = (await r.json().catch(() => ({}))) as SweepArchivePreviewPage;
      if (j?.ok) setPages((prev) => [...prev, j]);
      else setErrMsg(j?.message || `Couldn't load more (${j?.error || r.status}).`);
    } catch (e) {
      setErrMsg((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const applyQuickRange = (hours: number) => {
    const to = new Date();
    const from = new Date(to.getTime() - hours * 3600_000);
    const fmt = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setFromTs(fmt(from));
    setToTs(fmt(to));
  };

  const firstPage = pages[0] ?? null;
  const allEntries = pages.flatMap((p) => p.entries);
  const matched = firstPage?.matchedEntries ?? 0;
  const actors = firstPage?.actors ?? [];

  const closeDialog = () => {
    setInspecting(null);
    setPages([]);
    setErrMsg(null);
    setActorFilter("");
    setFromTs("");
    setToTs("");
  };

  return (
    <div className="space-y-2">
      <div
        className="text-[11px] uppercase tracking-wider text-slate-500"
        data-testid={`text-${testIdPrefix}-archives-heading`}
      >
        Rotated archives (newest first)
      </div>
      {archives.length === 0 ? (
        <div
          className="text-xs text-slate-400 px-2 py-1.5 rounded border border-slate-800/60 bg-slate-900/30"
          data-testid={`text-${testIdPrefix}-archives-empty`}
        >
          No rotated archives yet. The active audit file rotates once it
          exceeds the configured max size.
        </div>
      ) : (
        <ul
          className="divide-y divide-slate-800/60 border border-slate-800/60 rounded text-xs"
          data-testid={`list-${testIdPrefix}-archives`}
        >
          {archives.map((a) => {
            const when = a.rotatedAt
              ? new Date(a.rotatedAt).toLocaleString()
              : "unknown time";
            return (
              <li
                key={a.name}
                className="flex items-center gap-2 px-2 py-1.5"
                data-testid={`row-${testIdPrefix}-archive-${a.name}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-slate-300 truncate">
                    {a.name}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Rotated {when} · {formatKiB(a.bytes)}
                    {(typeof a.keptCount === "number" ||
                      typeof a.deletedCount === "number") && (
                      <>
                        {" · "}
                        <span
                          title={`${a.keptCount ?? 0} kept (orphans flagged but not deleted) · ${a.deletedCount ?? 0} deleted`}
                          data-testid={`text-${testIdPrefix}-archive-counts-${a.name}`}
                        >
                          {a.keptCount ?? 0} kept · {a.deletedCount ?? 0} deleted
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setInspecting(a.name)}
                  data-testid={`button-${testIdPrefix}-archive-inspect-${a.name}`}
                  className="border-slate-700 hover:border-sky-500/50 h-6 px-2 text-[11px]"
                >
                  Inspect
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={!!inspecting}
        onOpenChange={(o) => {
          if (!o) closeDialog();
        }}
      >
        <DialogContent
          className="max-w-2xl"
          data-testid={`dialog-${testIdPrefix}-archive-inspect`}
        >
          <DialogHeader>
            <DialogTitle>Inspect audit archive</DialogTitle>
            <DialogDescription>
              Search and page through entries parsed from this rotated{" "}
              {surface === "cover-sweep" ? "cover-sweep" : "media-sweep"} audit
              archive.{" "}
              <span
                className="font-mono"
                data-testid={`text-${testIdPrefix}-inspect-name`}
              >
                {inspecting}
              </span>
            </DialogDescription>
          </DialogHeader>
          {/* Filters mirror fallback-preset T357: actor Select + From/To +
              quick range buttons + clear buttons. */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
            <Select
              value={actorFilter || "__all__"}
              onValueChange={(v) => setActorFilter(v === "__all__" ? "" : v)}
            >
              <SelectTrigger
                className="h-6 text-[10px] px-1.5 w-[180px]"
                data-testid={`select-${testIdPrefix}-inspect-actor`}
              >
                <SelectValue placeholder="All actors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  value="__all__"
                  data-testid={`option-${testIdPrefix}-inspect-actor-all`}
                >
                  All actors
                </SelectItem>
                {actors.map((a) => (
                  <SelectItem
                    key={a.actorId}
                    value={a.actorId}
                    data-testid={`option-${testIdPrefix}-inspect-actor-${a.actorId}`}
                  >
                    {a.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {actorFilter && (
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
                onClick={() => setActorFilter("")}
                data-testid={`button-${testIdPrefix}-inspect-actor-clear`}
              >
                Clear
              </button>
            )}
            <label
              className="text-[10px] text-muted-foreground flex items-center gap-1"
              htmlFor={`input-${testIdPrefix}-inspect-from`}
            >
              From
              <input
                id={`input-${testIdPrefix}-inspect-from`}
                type="datetime-local"
                value={fromTs}
                onChange={(e) => setFromTs(e.target.value)}
                className="h-6 text-[10px] px-1 rounded border border-input bg-background"
                data-testid={`input-${testIdPrefix}-inspect-from`}
              />
            </label>
            <label
              className="text-[10px] text-muted-foreground flex items-center gap-1"
              htmlFor={`input-${testIdPrefix}-inspect-to`}
            >
              To
              <input
                id={`input-${testIdPrefix}-inspect-to`}
                type="datetime-local"
                value={toTs}
                onChange={(e) => setToTs(e.target.value)}
                className="h-6 text-[10px] px-1 rounded border border-input bg-background"
                data-testid={`input-${testIdPrefix}-inspect-to`}
              />
            </label>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Quick:</span>
              <button
                type="button"
                className="text-[10px] px-1.5 py-0.5 rounded border border-input bg-background hover:bg-accent"
                onClick={() => applyQuickRange(24)}
                data-testid={`button-${testIdPrefix}-inspect-quick-24h`}
              >
                Last 24h
              </button>
              <button
                type="button"
                className="text-[10px] px-1.5 py-0.5 rounded border border-input bg-background hover:bg-accent"
                onClick={() => applyQuickRange(24 * 7)}
                data-testid={`button-${testIdPrefix}-inspect-quick-7d`}
              >
                Last 7d
              </button>
              <button
                type="button"
                className="text-[10px] px-1.5 py-0.5 rounded border border-input bg-background hover:bg-accent"
                onClick={() => applyQuickRange(24 * 30)}
                data-testid={`button-${testIdPrefix}-inspect-quick-30d`}
              >
                Last 30d
              </button>
            </div>
            {(fromTs || toTs) && (
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
                onClick={() => {
                  setFromTs("");
                  setToTs("");
                }}
                data-testid={`button-${testIdPrefix}-inspect-date-clear`}
              >
                Clear dates
              </button>
            )}
          </div>
          <div className="space-y-2 text-xs">
            {loading ? (
              <p
                className="text-muted-foreground"
                data-testid={`text-${testIdPrefix}-inspect-loading`}
              >
                Loading archive…
              </p>
            ) : errMsg ? (
              <p
                className="text-destructive"
                data-testid={`text-${testIdPrefix}-inspect-error`}
              >
                {errMsg}
              </p>
            ) : firstPage ? (
              <>
                <div
                  className="text-muted-foreground"
                  data-testid={`text-${testIdPrefix}-inspect-summary`}
                >
                  {matched} entr{matched === 1 ? "y" : "ies"}{" "}
                  {hasFilters ? "matching filters" : "in this archive"}
                  {hasFilters ? ` (of ${firstPage.totalEntries} total)` : ""}
                  {allEntries.length < matched
                    ? ` · showing the most recent ${allEntries.length}`
                    : ""}
                  {firstPage.corruptLines > 0
                    ? ` · ${firstPage.corruptLines} corrupt line${
                        firstPage.corruptLines === 1 ? "" : "s"
                      } skipped`
                    : ""}
                </div>
                {allEntries.length === 0 ? (
                  <p
                    className="text-muted-foreground"
                    data-testid={`text-${testIdPrefix}-inspect-empty`}
                  >
                    {hasFilters
                      ? "No entries match the current filters."
                      : "No readable entries in this archive."}
                  </p>
                ) : (
                  <>
                    <ul
                      className="space-y-1 max-h-[50vh] overflow-y-auto pr-1"
                      data-testid={`list-${testIdPrefix}-inspect-entries`}
                    >
                      {allEntries.map((e, idx) => {
                        const when = e.ts
                          ? new Date(e.ts).toLocaleString()
                          : "unknown time";
                        const key = e.id ?? `${e.ts ?? ""}-${idx}`;
                        const actorLabel =
                          actors.find((a) => a.actorId === e.actorId)
                            ?.displayName ?? e.actorId;
                        const raw = e.raw ?? {};
                        let detail = "";
                        if (surface === "cover-sweep") {
                          const orphans = Array.isArray(raw.orphans)
                            ? raw.orphans.length
                            : 0;
                          const removed = Array.isArray(raw.removed)
                            ? raw.removed.length
                            : 0;
                          const errors = Array.isArray(raw.errors)
                            ? raw.errors.length
                            : 0;
                          const restored = Array.isArray(raw.restored)
                            ? raw.restored.length
                            : 0;
                          detail =
                            e.mode === "restore"
                              ? `restored ${restored} file${restored === 1 ? "" : "s"}`
                              : `${orphans} orphan${orphans === 1 ? "" : "s"}, ${removed} removed${errors ? `, ${errors} error${errors === 1 ? "" : "s"}` : ""}`;
                        } else {
                          const orphanCount =
                            typeof raw.orphanCount === "number"
                              ? raw.orphanCount
                              : Array.isArray(raw.orphans)
                                ? raw.orphans.length
                                : 0;
                          const removed = Array.isArray(raw.removed)
                            ? raw.removed.length
                            : 0;
                          const bytes =
                            typeof raw.bytesRemoved === "number"
                              ? raw.bytesRemoved
                              : 0;
                          detail = `${orphanCount} orphan${orphanCount === 1 ? "" : "s"}, ${removed} removed${bytes ? ` (${formatBytes(bytes)})` : ""}`;
                        }
                        return (
                          <li
                            key={key}
                            className="text-muted-foreground rounded border border-border/60 px-1.5 py-1 bg-background/60"
                            data-testid={`row-${testIdPrefix}-inspect-entry-${idx}`}
                          >
                            <div className="font-medium text-foreground/90">
                              <span
                                className="uppercase tracking-wider text-[10px] mr-1"
                                data-testid={`text-${testIdPrefix}-inspect-mode-${idx}`}
                              >
                                {e.mode ?? "?"}
                              </span>
                              by{" "}
                              <span
                                data-testid={`text-${testIdPrefix}-inspect-actor-${idx}`}
                              >
                                {actorLabel}
                              </span>{" "}
                              ·{" "}
                              <span
                                data-testid={`text-${testIdPrefix}-inspect-ts-${idx}`}
                              >
                                {when}
                              </span>
                            </div>
                            <div
                              data-testid={`text-${testIdPrefix}-inspect-detail-${idx}`}
                            >
                              {detail}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {pages[pages.length - 1]?.hasMore && (
                      <div
                        className="flex items-center justify-between gap-2 pt-1"
                        data-testid={`${testIdPrefix}-inspect-pager`}
                      >
                        <span
                          className="text-[10px] text-muted-foreground"
                          data-testid={`text-${testIdPrefix}-inspect-range`}
                        >
                          Showing {allEntries.length} of {matched}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={loadingMore}
                          onClick={loadMore}
                          data-testid={`button-load-more-${testIdPrefix}-inspect`}
                        >
                          {loadingMore ? "Loading…" : "Load more"}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : null}
          </div>
          <DialogFooter>
            {viewerIsFounder && inspecting && (
              <Button
                variant="outline"
                size="sm"
                asChild
                data-testid={`button-${testIdPrefix}-inspect-download`}
              >
                <a
                  href={`${previewBase}/${encodeURIComponent(inspecting)}`}
                  download={inspecting}
                >
                  Download JSONL
                </a>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={closeDialog}
              data-testid={`button-${testIdPrefix}-inspect-close`}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

async function coverSweepAuditRequest(): Promise<{
  entries: CoverSweepAuditEntry[];
  stats: CoverSweepAuditStats | null;
}> {
  try {
    const r = await fetch("/api/admin/broadcasts/covers/sweep/audit?limit=50", {
      credentials: "include",
    });
    const j = await r.json();
    if (j?.ok && Array.isArray(j.entries)) {
      return {
        entries: j.entries as CoverSweepAuditEntry[],
        stats: (j.stats as CoverSweepAuditStats) ?? null,
      };
    }
  } catch { /* ignore */ }
  return { entries: [], stats: null };
}

async function coverSweepRestoreAllRequest(
  auditId: string,
): Promise<{
  ok: boolean;
  error?: string;
  message?: string;
  attempted?: number;
  restored?: number;
  results?: { file: string; status: string; message?: string }[];
}> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  try {
    const r = await fetch("/api/admin/broadcasts/covers/sweep/restore-all", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: JSON.stringify({ auditId }),
    });
    return await r.json().catch(() => ({ ok: false, error: "bad_json" }));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function coverSweepRestoreRequest(
  auditId: string,
  file: string,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  try {
    const r = await fetch("/api/admin/broadcasts/covers/sweep/restore", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: JSON.stringify({ auditId, file }),
    });
    return (await r.json().catch(() => ({ ok: false, error: "bad_json" }))) as {
      ok: boolean;
      error?: string;
      message?: string;
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function formatKiB(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KiB";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  return `${Math.round(bytes / 1024)} KiB`;
}

function CoverSweepPanel() {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<CoverSweepResponse | null>(null);
  const [lastRemoved, setLastRemoved] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<CoverSweepStatus | null>(null);
  const [thresholdDraft, setThresholdDraft] = useState<string>("");
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [thresholdMsg, setThresholdMsg] = useState<string | null>(null);
  // Task #809 — Flapping threshold (count) and window (in minutes; the
  // server stores milliseconds but minutes are easier to type).
  const [flappingThresholdDraft, setFlappingThresholdDraft] = useState<string>("");
  const [savingFlappingThreshold, setSavingFlappingThreshold] = useState(false);
  const [flappingThresholdMsg, setFlappingThresholdMsg] = useState<string | null>(null);
  const [flappingWindowMinutesDraft, setFlappingWindowMinutesDraft] =
    useState<string>("");
  const [savingFlappingWindow, setSavingFlappingWindow] = useState(false);
  const [flappingWindowMsg, setFlappingWindowMsg] = useState<string | null>(null);
  // Task #837 — Re-arm acknowledgement state.
  const [reArmingFlapping, setReArmingFlapping] = useState(false);
  const [reArmMsg, setReArmMsg] = useState<string | null>(null);
  const [runningNow, setRunningNow] = useState(false);
  const [runNowMsg, setRunNowMsg] = useState<string | null>(null);
  const [recentAutoClears, setRecentAutoClears] = useState<CoverSweepAutoClear[]>([]);
  const [recentReopened, setRecentReopened] = useState<CoverSweepReopened[]>([]);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [reopenMsg, setReopenMsg] = useState<string | null>(null);
  const [audit, setAudit] = useState<CoverSweepAuditEntry[]>([]);
  const [auditStats, setAuditStats] = useState<CoverSweepAuditStats | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [restoringKey, setRestoringKey] = useState<string | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const [restoringAllId, setRestoringAllId] = useState<string | null>(null);
  const [applyMode, setApplyMode] = useState<SweepApplyMode | null>(null);
  const [savingApply, setSavingApply] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [runningSchedulerNow, setRunningSchedulerNow] = useState(false);
  // Audit-log retention controls. Values are entered in KiB for the size
  // field so admins don't have to type a 7-digit byte count.
  const [auditBytesKibDraft, setAuditBytesKibDraft] = useState<string>("");
  const [auditArchivesDraft, setAuditArchivesDraft] = useState<string>("");
  const [savingAuditRetention, setSavingAuditRetention] = useState(false);
  const [auditRetentionMsg, setAuditRetentionMsg] = useState<string | null>(null);

  const refreshAudit = async () => {
    setAuditLoading(true);
    try {
      const r = await coverSweepAuditRequest();
      setAudit(r.entries);
      setAuditStats(r.stats);
    } finally {
      setAuditLoading(false);
    }
  };

  const restoreAll = async (auditId: string, count: number) => {
    if (
      !window.confirm(
        `Restore all ${count} file${count === 1 ? "" : "s"} from this sweep run?`,
      )
    ) {
      return;
    }
    setRestoringAllId(auditId);
    setRestoreMsg(null);
    try {
      const r = await coverSweepRestoreAllRequest(auditId);
      if (!r.ok) {
        setRestoreMsg(
          r.message || `Bulk restore failed: ${r.error || "unknown_error"}`,
        );
      } else {
        const restored = r.restored ?? 0;
        const attempted = r.attempted ?? count;
        const failed = attempted - restored;
        setRestoreMsg(
          failed > 0
            ? `Restored ${restored} of ${attempted} file${attempted === 1 ? "" : "s"} (${failed} skipped — already in place or no longer in trash).`
            : `Restored ${restored} file${restored === 1 ? "" : "s"}.`,
        );
      }
      await refreshAudit();
    } finally {
      setRestoringAllId(null);
    }
  };

  const restoreFile = async (auditId: string, file: string) => {
    const key = `${auditId}::${file}`;
    setRestoringKey(key);
    setRestoreMsg(null);
    try {
      const r = await coverSweepRestoreRequest(auditId, file);
      if (!r.ok) {
        setRestoreMsg(
          r.message ||
            (r.error === "destination_exists"
              ? `${file} is already present in the covers directory.`
              : r.error === "trash_file_missing"
                ? `${file} is no longer available to restore.`
                : `Restore failed: ${r.error || "unknown_error"}`),
        );
      } else {
        setRestoreMsg(`Restored ${file}.`);
      }
      await refreshAudit();
    } finally {
      setRestoringKey(null);
    }
  };

  const refreshStatus = async () => {
    const [s, recent, reopened, m] = await Promise.all([
      coverSweepStatusRequest(),
      coverSweepRecentAutoClearsRequest(),
      coverSweepRecentReopenedRequest(),
      sweepApplyModeGet(),
    ]);
    if (s) {
      setStatus(s);
      setThresholdDraft((prev) => (prev === "" ? String(s.threshold) : prev));
      setFlappingThresholdDraft((prev) =>
        prev === "" && typeof s.flappingThreshold === "number"
          ? String(s.flappingThreshold)
          : prev,
      );
      setFlappingWindowMinutesDraft((prev) =>
        prev === "" && typeof s.flappingWindowMs === "number"
          ? String(Math.max(1, Math.round(s.flappingWindowMs / 60_000)))
          : prev,
      );
      setAuditBytesKibDraft((prev) =>
        prev === "" && typeof s.auditMaxBytes === "number"
          ? String(Math.round(s.auditMaxBytes / 1024))
          : prev,
      );
      setAuditArchivesDraft((prev) =>
        prev === "" && typeof s.auditMaxArchives === "number"
          ? String(s.auditMaxArchives)
          : prev,
      );
    }
    setRecentAutoClears(recent);
    setRecentReopened(reopened);
    if (m) setApplyMode(m);
  };

  const toggleApply = async (next: boolean) => {
    setSavingApply(true);
    setApplyMsg(null);
    try {
      const r = await sweepApplyModeSet(next);
      if (!r || !r.ok) {
        setApplyMsg(r?.error || "Could not update apply mode");
      } else {
        setApplyMode(r);
        setApplyMsg(
          next
            ? "Auto-delete ON — scheduled sweeps will remove orphan files."
            : "Dry-run ON — scheduled sweeps will only report orphans.",
        );
      }
    } finally {
      setSavingApply(false);
    }
  };

  const clearApplyOverride = async () => {
    setSavingApply(true);
    setApplyMsg(null);
    try {
      const r = await sweepApplyModeSet(null);
      if (!r || !r.ok) {
        setApplyMsg(r?.error || "Could not clear override");
      } else {
        setApplyMode(r);
        setApplyMsg("Cleared override — falling back to BROADCAST_SWEEP_APPLY env var.");
      }
    } finally {
      setSavingApply(false);
    }
  };

  const triggerRunNow = async () => {
    setRunningSchedulerNow(true);
    setApplyMsg(null);
    try {
      const ok = await sweepRunNow();
      if (!ok) {
        setApplyMsg("Could not start scheduler run.");
        return;
      }
      // Poll briefly so the last-run summary refreshes once the tick finishes.
      for (let i = 0; i < 6; i += 1) {
        await new Promise((r) => setTimeout(r, 1500));
        const m = await sweepApplyModeGet();
        if (m) {
          setApplyMode(m);
          if (m.lastRun && m.lastRun.finishedAt >= Date.now() - 30_000) break;
        }
      }
    } finally {
      setRunningSchedulerNow(false);
    }
  };

  const saveAuditRetention = async () => {
    const limits = status?.auditLimits;
    const payload: { maxBytes?: number; maxArchives?: number } = {};
    if (auditBytesKibDraft !== "") {
      const kib = Number(auditBytesKibDraft);
      if (!Number.isFinite(kib) || kib <= 0) {
        setAuditRetentionMsg("Max file size must be a positive number of KiB.");
        return;
      }
      const bytes = Math.floor(kib * 1024);
      if (
        limits &&
        (bytes < limits.bytesMin || bytes > limits.bytesMax)
      ) {
        setAuditRetentionMsg(
          `Max file size must be between ${formatKiB(limits.bytesMin)} and ${formatKiB(limits.bytesMax)}.`,
        );
        return;
      }
      if (bytes !== status?.auditMaxBytes) payload.maxBytes = bytes;
    }
    if (auditArchivesDraft !== "") {
      const n = Number(auditArchivesDraft);
      if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) {
        setAuditRetentionMsg("Archive count must be a positive integer.");
        return;
      }
      if (
        limits &&
        (n < limits.archivesMin || n > limits.archivesMax)
      ) {
        setAuditRetentionMsg(
          `Archive count must be between ${limits.archivesMin} and ${limits.archivesMax}.`,
        );
        return;
      }
      if (n !== status?.auditMaxArchives) payload.maxArchives = n;
    }
    if (payload.maxBytes === undefined && payload.maxArchives === undefined) {
      setAuditRetentionMsg("No changes to save.");
      return;
    }
    // Guard: lowering "max archives" below the current archive count will
    // prune the oldest history on the next rotation. Make the admin confirm.
    if (
      payload.maxArchives !== undefined &&
      typeof status?.currentArchiveCount === "number" &&
      payload.maxArchives < status.currentArchiveCount
    ) {
      const pruneCount = status.currentArchiveCount - payload.maxArchives;
      if (
        !window.confirm(
          `Lowering "max archives kept" to ${payload.maxArchives} will permanently delete ${pruneCount} existing archive${pruneCount === 1 ? "" : "s"} (oldest first) on the next rotation. This audit history cannot be recovered. Continue?`,
        )
      ) {
        return;
      }
    }
    // Guard: lowering "max file size" below the active file's current size
    // means the next append will immediately rotate; otherwise it just means
    // rotations happen more often. Warn either way so the admin is aware.
    if (
      payload.maxBytes !== undefined &&
      typeof status?.auditMaxBytes === "number" &&
      payload.maxBytes < status.auditMaxBytes
    ) {
      const activeBytes = status.activeAuditBytes ?? 0;
      const willRotateNow = activeBytes >= payload.maxBytes;
      const msg = willRotateNow
        ? `The active audit file is ${formatKiB(activeBytes)}, which already exceeds the new max of ${formatKiB(payload.maxBytes)}. It will rotate to an archive on the next sweep append. Continue?`
        : `Lowering "max file size" to ${formatKiB(payload.maxBytes)} means the active audit file will rotate sooner and more often, producing more archive files. Continue?`;
      if (!window.confirm(msg)) {
        return;
      }
    }
    setSavingAuditRetention(true);
    setAuditRetentionMsg(null);
    try {
      const r = await coverSweepAuditRetentionRequest(payload);
      if (!r.ok) {
        setAuditRetentionMsg(r.error || "Could not update audit retention");
      } else {
        setAuditRetentionMsg("Audit retention updated");
        if (r.status) {
          if (typeof r.status.auditMaxBytes === "number") {
            setAuditBytesKibDraft(String(Math.round(r.status.auditMaxBytes / 1024)));
          }
          if (typeof r.status.auditMaxArchives === "number") {
            setAuditArchivesDraft(String(r.status.auditMaxArchives));
          }
        }
        // Refresh from the status endpoint so currentArchiveCount /
        // activeAuditBytes (not returned by the PATCH route) stay accurate
        // for subsequent shrink-confirmation prompts in the same session.
        await refreshStatus();
      }
    } catch (e) {
      setAuditRetentionMsg((e as Error).message);
    } finally {
      setSavingAuditRetention(false);
    }
  };

  const scan = async () => {
    setLoading(true);
    setError(null);
    setLastRemoved(null);
    try {
      const r = await coverSweepRequest(false);
      if (!r.ok) {
        setError(r.message || r.error || "Sweep failed");
        setResult(null);
      } else {
        setResult(r);
      }
      await refreshStatus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scan();
    refreshAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runScheduledNow = async () => {
    setRunningNow(true);
    setRunNowMsg(null);
    try {
      const r = await coverSweepRunNowRequest();
      if (!r.ok) {
        setRunNowMsg(r.message || r.error || "Scheduled sweep failed");
      } else if (r.status) {
        setStatus(r.status);
        const count = r.result?.orphanCount ?? 0;
        const alerted = r.result?.alerted ? " — alert fired" : "";
        setRunNowMsg(
          `Scheduled sweep ran: ${count} orphan${count === 1 ? "" : "s"}${alerted}.`,
        );
      }
    } catch (e) {
      setRunNowMsg((e as Error).message);
    } finally {
      setRunningNow(false);
    }
  };

  const saveThreshold = async () => {
    const n = Number(thresholdDraft);
    if (!Number.isFinite(n) || n < 0) {
      setThresholdMsg("Threshold must be a non-negative number");
      return;
    }
    setSavingThreshold(true);
    setThresholdMsg(null);
    try {
      const r = await coverSweepThresholdRequest(Math.floor(n));
      if (!r.ok) {
        setThresholdMsg(r.error || "Could not update threshold");
      } else {
        setThresholdMsg("Threshold updated");
        if (r.status) {
          setStatus(r.status);
          setThresholdDraft(String(r.status.threshold));
        }
      }
    } catch (e) {
      setThresholdMsg((e as Error).message);
    } finally {
      setSavingThreshold(false);
    }
  };

  // Task #809 — Persist the flapping threshold (count of auto-clears
  // inside the window that triggers the warning). Bounds mirror the
  // server (2..1000).
  const saveFlappingThreshold = async () => {
    const n = Number(flappingThresholdDraft);
    if (
      !Number.isFinite(n) ||
      n < COVER_SWEEP_FLAPPING_THRESHOLD_MIN ||
      n > COVER_SWEEP_FLAPPING_THRESHOLD_MAX
    ) {
      setFlappingThresholdMsg(
        `Must be between ${COVER_SWEEP_FLAPPING_THRESHOLD_MIN} and ${COVER_SWEEP_FLAPPING_THRESHOLD_MAX}`,
      );
      return;
    }
    setSavingFlappingThreshold(true);
    setFlappingThresholdMsg(null);
    try {
      const r = await coverSweepFlappingThresholdRequest(Math.floor(n));
      if (!r.ok) {
        setFlappingThresholdMsg(r.error || "Could not update flapping threshold");
      } else {
        setFlappingThresholdMsg("Flapping threshold updated");
        if (r.status) {
          setStatus(r.status);
          if (typeof r.status.flappingThreshold === "number") {
            setFlappingThresholdDraft(String(r.status.flappingThreshold));
          }
        }
      }
    } catch (e) {
      setFlappingThresholdMsg((e as Error).message);
    } finally {
      setSavingFlappingThreshold(false);
    }
  };

  // Task #809 — Persist the flapping window. Admins type minutes; we
  // convert to ms before sending. Bounds mirror the server (1m..90d).
  const saveFlappingWindow = async () => {
    const minutes = Number(flappingWindowMinutesDraft);
    if (
      !Number.isFinite(minutes) ||
      minutes < COVER_SWEEP_FLAPPING_WINDOW_MINUTES_MIN ||
      minutes > COVER_SWEEP_FLAPPING_WINDOW_MINUTES_MAX
    ) {
      setFlappingWindowMsg(
        `Must be between ${COVER_SWEEP_FLAPPING_WINDOW_MINUTES_MIN} minute and 90 days (${COVER_SWEEP_FLAPPING_WINDOW_MINUTES_MAX} min)`,
      );
      return;
    }
    setSavingFlappingWindow(true);
    setFlappingWindowMsg(null);
    try {
      const ms = Math.floor(minutes) * 60_000;
      const r = await coverSweepFlappingWindowMsRequest(ms);
      if (!r.ok) {
        setFlappingWindowMsg(r.error || "Could not update flapping window");
      } else {
        setFlappingWindowMsg("Flapping window updated");
        if (r.status) {
          setStatus(r.status);
          if (typeof r.status.flappingWindowMs === "number") {
            setFlappingWindowMinutesDraft(
              String(Math.max(1, Math.round(r.status.flappingWindowMs / 60_000))),
            );
          }
        }
      }
    } catch (e) {
      setFlappingWindowMsg((e as Error).message);
    } finally {
      setSavingFlappingWindow(false);
    }
  };

  // Task #837 — Acknowledge the flapping latch without re-saving the
  // threshold or window. Bumps `lastReArmedAt` via a dedicated route.
  const reArmFlapping = async () => {
    setReArmingFlapping(true);
    setReArmMsg(null);
    try {
      const r = await coverSweepFlappingRearmRequest();
      if (!r.ok) {
        setReArmMsg(r.message || r.error || "Could not re-arm");
      } else {
        setReArmMsg("Flapping latch re-armed");
        if (r.status) setStatus(r.status);
      }
    } catch (e) {
      setReArmMsg((e as Error).message);
    } finally {
      setReArmingFlapping(false);
    }
  };

  const cleanUp = async () => {
    const count = result?.orphanCount ?? 0;
    if (!count) return;
    if (
      !window.confirm(
        `Permanently delete ${count} orphaned cover file${count === 1 ? "" : "s"}? This cannot be undone.`,
      )
    ) {
      return;
    }
    const token = result?.confirmToken;
    if (!token) {
      setError("Re-scan first to confirm the orphan list before cleaning up.");
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const r = await coverSweepRequest(true, token);
      if (!r.ok) {
        if (r.error === "orphan_set_changed") {
          setError(
            r.message ||
              "The orphan list changed since the last scan. The list below has been refreshed — review and try again.",
          );
        } else {
          setError(r.message || r.error || "Clean up failed");
        }
        // Server returns the current orphan set + a fresh token on rejection;
        // surface it so the admin can re-confirm without an extra round-trip.
        if (Array.isArray(r.orphans)) setResult(r);
      } else {
        setLastRemoved(r.removed ?? 0);
        // Re-scan to refresh the list (should now be empty unless new orphans appeared).
        const fresh = await coverSweepRequest(false);
        if (fresh.ok) setResult(fresh);
        await refreshAudit();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const orphans = result?.orphans ?? [];
  const orphanCount = result?.orphanCount ?? 0;

  return (
    <CinemaCard>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <HardDrive className="h-4 w-4 text-sky-400" /> Cover File Sweep
        </CardTitle>
        <CardDescription>
          Reconciles stored broadcast cover images against the broadcasts table. Files whose broadcast
          row no longer exists are listed below and can be cleaned up. A background sweep also runs
          daily and alerts the founder dashboard if orphans pile up above the threshold.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status?.flapping && (
          <div
            className="text-[12px] text-amber-200 border border-amber-500/50 bg-amber-500/10 rounded p-2 flex items-start gap-2"
            data-testid="banner-cover-sweep-flapping"
          >
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-300" />
            <div>
              <div className="font-semibold text-amber-200">
                Flapping detected — consider raising the threshold
              </div>
              <div className="text-amber-200/80 text-[11px] mt-0.5">
                {status.flappingCount ?? 0} cover-orphan alert
                {status.flappingCount === 1 ? "" : "s"} auto-cleared in the last{" "}
                {Math.round((status.flappingWindowMs ?? 24 * 60 * 60 * 1000) / 3_600_000)}h
                {typeof status.flappingThreshold === "number"
                  ? ` (≥ ${status.flappingThreshold} triggers this warning)`
                  : ""}
                . Repeated fire-and-clear cycles usually mean the threshold is too low for
                the platform's steady-state orphan count.
              </div>
            </div>
          </div>
        )}
        <div
          className="grid gap-3 md:grid-cols-3 text-[11px] border border-slate-800/80 rounded-md p-3 bg-slate-900/40"
          data-testid="cover-sweep-schedule"
        >
          <div>
            <div className="uppercase tracking-wider text-slate-500 text-[10px]">
              Last scheduled scan
            </div>
            <div className="text-slate-200 mt-1" data-testid="text-cover-sweep-last-scan">
              {status?.lastScanAt
                ? `${formatRelativeTime(status.lastScanAt)} — ${
                    status.lastOrphanCount ?? 0
                  } orphan${status.lastOrphanCount === 1 ? "" : "s"}${
                    status.lastOrphanBytes != null
                      ? ` · ${formatBytes(status.lastOrphanBytes)}`
                      : ""
                  }`
                : "Background sweep has not run yet."}
            </div>
            {status?.nextScanAt && (
              <div className="text-slate-500 text-[10px] mt-0.5">
                Next: {formatRelativeTime(status.nextScanAt)}
              </div>
            )}
          </div>
          <div>
            <div className="uppercase tracking-wider text-slate-500 text-[10px]">
              Alert threshold
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min={0}
                value={thresholdDraft}
                onChange={(e) => setThresholdDraft(e.target.value)}
                className="h-7 text-xs w-24 bg-slate-900 border-slate-700"
                data-testid="input-cover-sweep-threshold"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={saveThreshold}
                disabled={
                  savingThreshold ||
                  thresholdDraft === "" ||
                  Number(thresholdDraft) === status?.threshold
                }
                data-testid="button-cover-sweep-threshold-save"
                className="border-slate-700 hover:border-sky-500/50 h-7 px-2 text-xs"
              >
                {savingThreshold ? "Saving…" : "Save"}
              </Button>
            </div>
            <div className="text-slate-500 text-[10px] mt-1">
              Founders are alerted when orphan count exceeds this value.
            </div>
            {thresholdMsg && (
              <div
                className="text-[10px] mt-1 text-amber-300"
                data-testid="text-cover-sweep-threshold-msg"
              >
                {thresholdMsg}
              </div>
            )}
          </div>
          <div>
            <div className="uppercase tracking-wider text-slate-500 text-[10px]">
              Current state
            </div>
            <div
              className={`mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] ${
                status?.wasAboveThreshold
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              }`}
              data-testid="badge-cover-sweep-state"
            >
              {status?.wasAboveThreshold
                ? `ABOVE THRESHOLD (${status?.lastOrphanCount ?? 0} > ${
                    status?.threshold ?? 0
                  })`
                : "OK"}
            </div>
            <div className="text-slate-500 text-[10px] mt-1">
              {status?.intervalMs
                ? `Scheduled every ${Math.round(status.intervalMs / 3_600_000)}h.`
                : "Background scheduler not running."}
            </div>
            {status?.lastAutoResolvedAt && (
              <div
                className="text-emerald-300/90 text-[10px] mt-1"
                data-testid="text-cover-sweep-auto-resolved"
              >
                Auto-cleared {status.lastAutoResolvedCount ?? 0} alert
                {status.lastAutoResolvedCount === 1 ? "" : "s"} {" "}
                {formatRelativeTime(status.lastAutoResolvedAt)} (queue healthy).
              </div>
            )}
          </div>
        </div>
        {/* Task #809 — Flapping-alert tuning. Two inline editors. */}
        <div
          className="grid gap-3 md:grid-cols-2 text-[11px] border border-slate-800/80 rounded-md p-3 bg-slate-900/40"
          data-testid="cover-sweep-flapping-tuning"
        >
          <div>
            <div className="uppercase tracking-wider text-slate-500 text-[10px]">
              Flapping threshold (auto-clears)
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min={COVER_SWEEP_FLAPPING_THRESHOLD_MIN}
                max={COVER_SWEEP_FLAPPING_THRESHOLD_MAX}
                value={flappingThresholdDraft}
                onChange={(e) => setFlappingThresholdDraft(e.target.value)}
                className="h-7 text-xs w-24 bg-slate-900 border-slate-700"
                data-testid="input-cover-sweep-flapping-threshold"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={saveFlappingThreshold}
                disabled={
                  savingFlappingThreshold ||
                  flappingThresholdDraft === "" ||
                  Number(flappingThresholdDraft) === status?.flappingThreshold
                }
                data-testid="button-cover-sweep-flapping-threshold-save"
                className="border-slate-700 hover:border-sky-500/50 h-7 px-2 text-xs"
              >
                {savingFlappingThreshold ? "Saving…" : "Save"}
              </Button>
            </div>
            <div className="text-slate-500 text-[10px] mt-1">
              Number of auto-clears inside the window that triggers the
              flapping warning. Range {COVER_SWEEP_FLAPPING_THRESHOLD_MIN}
              –{COVER_SWEEP_FLAPPING_THRESHOLD_MAX}. Current:{" "}
              <span data-testid="text-cover-sweep-flapping-threshold-current">
                {status?.flappingThreshold ?? "—"}
              </span>
              .
            </div>
            {flappingThresholdMsg && (
              <div
                className="text-[10px] mt-1 text-amber-300"
                data-testid="text-cover-sweep-flapping-threshold-msg"
              >
                {flappingThresholdMsg}
              </div>
            )}
          </div>
          <div>
            <div className="uppercase tracking-wider text-slate-500 text-[10px]">
              Flapping window (minutes)
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min={COVER_SWEEP_FLAPPING_WINDOW_MINUTES_MIN}
                max={COVER_SWEEP_FLAPPING_WINDOW_MINUTES_MAX}
                value={flappingWindowMinutesDraft}
                onChange={(e) => setFlappingWindowMinutesDraft(e.target.value)}
                className="h-7 text-xs w-28 bg-slate-900 border-slate-700"
                data-testid="input-cover-sweep-flapping-window-minutes"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={saveFlappingWindow}
                disabled={
                  savingFlappingWindow ||
                  flappingWindowMinutesDraft === "" ||
                  (typeof status?.flappingWindowMs === "number" &&
                    Number(flappingWindowMinutesDraft) ===
                      Math.max(
                        1,
                        Math.round(status.flappingWindowMs / 60_000),
                      ))
                }
                data-testid="button-cover-sweep-flapping-window-save"
                className="border-slate-700 hover:border-sky-500/50 h-7 px-2 text-xs"
              >
                {savingFlappingWindow ? "Saving…" : "Save"}
              </Button>
            </div>
            <div className="text-slate-500 text-[10px] mt-1">
              How far back to count recent auto-clears. Range 1 minute–90
              days ({COVER_SWEEP_FLAPPING_WINDOW_MINUTES_MAX} min). Current:{" "}
              <span data-testid="text-cover-sweep-flapping-window-current">
                {typeof status?.flappingWindowMs === "number"
                  ? `${Math.max(
                      1,
                      Math.round(status.flappingWindowMs / 60_000),
                    )} min (~${Math.round(
                      status.flappingWindowMs / 3_600_000,
                    )}h)`
                  : "—"}
              </span>
              .
            </div>
            {flappingWindowMsg && (
              <div
                className="text-[10px] mt-1 text-amber-300"
                data-testid="text-cover-sweep-flapping-window-msg"
              >
                {flappingWindowMsg}
              </div>
            )}
          </div>
          {/* Task #831 — surface when the flapping latch last fired and when
              it was last re-armed (by a threshold/window save) so founders
              can see the latch's history without grepping platform_alerts. */}
          <div
            className="md:col-span-2 text-[10px] text-slate-400 border-t border-slate-800/60 pt-2 flex flex-col gap-0.5"
            data-testid="text-cover-sweep-flapping-history"
          >
            <div>
              Last flapping alert:{" "}
              <span
                className="text-slate-200"
                data-testid="text-cover-sweep-last-flapping-fired"
              >
                {status?.lastFlappingFiredAt
                  ? formatRelativeTime(status.lastFlappingFiredAt)
                  : "never"}
              </span>
            </div>
            <div>
              Last re-arm:{" "}
              <span
                className="text-slate-200"
                data-testid="text-cover-sweep-last-rearmed"
              >
                {status?.lastReArmedAt
                  ? formatRelativeTime(status.lastReArmedAt)
                  : "never"}
              </span>
            </div>
            {/* Task #837 — Acknowledge the flapping latch without
                re-saving the threshold or window. */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px]"
                onClick={reArmFlapping}
                disabled={reArmingFlapping}
                data-testid="button-cover-sweep-flapping-rearm"
              >
                {reArmingFlapping ? "Re-arming…" : "Re-arm now"}
              </Button>
              {reArmMsg && (
                <span
                  className="text-[10px] text-amber-300"
                  data-testid="text-cover-sweep-flapping-rearm-msg"
                >
                  {reArmMsg}
                </span>
              )}
            </div>
          </div>
        </div>
        <div
          className="border border-slate-800/80 rounded-md p-3 bg-slate-900/40 space-y-2"
          data-testid="cover-sweep-audit-retention"
        >
          <div className="uppercase tracking-wider text-slate-500 text-[10px]">
            Audit log retention
          </div>
          <div className="grid gap-3 md:grid-cols-2 text-[11px]">
            <div>
              <label className="text-slate-400 text-[10px]" htmlFor="cover-sweep-audit-bytes">
                Max audit file size (KiB)
              </label>
              <Input
                id="cover-sweep-audit-bytes"
                type="number"
                min={
                  status?.auditLimits
                    ? Math.ceil(status.auditLimits.bytesMin / 1024)
                    : 64
                }
                max={
                  status?.auditLimits
                    ? Math.floor(status.auditLimits.bytesMax / 1024)
                    : 102400
                }
                value={auditBytesKibDraft}
                onChange={(e) => setAuditBytesKibDraft(e.target.value)}
                className="h-7 text-xs w-32 bg-slate-900 border-slate-700 mt-1"
                data-testid="input-cover-sweep-audit-bytes"
              />
              <div className="text-slate-500 text-[10px] mt-1">
                Current: {typeof status?.auditMaxBytes === "number"
                  ? formatKiB(status.auditMaxBytes)
                  : "—"}
                {status?.auditMaxBytesSource && (
                  <span className="ml-1 text-slate-600">
                    (source: {status.auditMaxBytesSource})
                  </span>
                )}
                <span
                  className="block text-slate-400"
                  data-testid="text-cover-sweep-active-audit-bytes"
                >
                  Active file:{" "}
                  {typeof status?.activeAuditBytes === "number"
                    ? formatKiB(status.activeAuditBytes)
                    : "—"}
                </span>
                {status?.auditLimits && (
                  <span className="block">
                    Allowed: {formatKiB(status.auditLimits.bytesMin)}–
                    {formatKiB(status.auditLimits.bytesMax)}
                  </span>
                )}
              </div>
            </div>
            <div>
              <label
                className="text-slate-400 text-[10px]"
                htmlFor="cover-sweep-audit-archives"
              >
                Max archives kept
              </label>
              <Input
                id="cover-sweep-audit-archives"
                type="number"
                min={status?.auditLimits?.archivesMin ?? 1}
                max={status?.auditLimits?.archivesMax ?? 100}
                step={1}
                value={auditArchivesDraft}
                onChange={(e) => setAuditArchivesDraft(e.target.value)}
                className="h-7 text-xs w-24 bg-slate-900 border-slate-700 mt-1"
                data-testid="input-cover-sweep-audit-archives"
              />
              <div className="text-slate-500 text-[10px] mt-1">
                Current: {status?.auditMaxArchives ?? "—"}
                {status?.auditMaxArchivesSource && (
                  <span className="ml-1 text-slate-600">
                    (source: {status.auditMaxArchivesSource})
                  </span>
                )}
                <span
                  className="block text-slate-400"
                  data-testid="text-cover-sweep-current-archive-count"
                >
                  Archives kept:{" "}
                  {typeof status?.currentArchiveCount === "number"
                    ? status.currentArchiveCount
                    : "—"}
                </span>
                {status?.auditLimits && (
                  <span className="block">
                    Allowed: {status.auditLimits.archivesMin}–
                    {status.auditLimits.archivesMax}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={saveAuditRetention}
              disabled={savingAuditRetention}
              data-testid="button-cover-sweep-audit-retention-save"
              className="border-slate-700 hover:border-sky-500/50 h-7 px-2 text-xs"
            >
              {savingAuditRetention ? "Saving…" : "Save retention"}
            </Button>
            {auditRetentionMsg && (
              <span
                className="text-[10px] text-amber-300"
                data-testid="text-cover-sweep-audit-retention-msg"
              >
                {auditRetentionMsg}
              </span>
            )}
          </div>
          <div className="text-slate-500 text-[10px]">
            Controls rotation of <span className="font-mono">broadcast-cover-sweep.jsonl</span>:
            the active file is archived once it exceeds the size above, and old archives are
            pruned so at most this many are kept. Founders can tune for tighter compliance
            windows or larger fleets without redeploying.
          </div>
        </div>
        <div
          className="border border-slate-800/80 rounded-md p-3 bg-slate-900/40"
          data-testid="cover-sweep-recent-auto-clears"
        >
          <div className="uppercase tracking-wider text-slate-500 text-[10px] mb-2">
            Recent auto-clears
          </div>
          {recentAutoClears.length === 0 ? (
            <div
              className="text-slate-500 text-[11px]"
              data-testid="text-cover-sweep-recent-auto-clears-empty"
            >
              No auto-clears recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60 text-[11px]">
              {recentAutoClears.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_auto_auto] gap-2 py-1.5 items-center"
                  data-testid={`row-cover-sweep-auto-clear-${item.id}`}
                >
                  <span className="text-slate-300">
                    {item.acknowledgedAt
                      ? formatRelativeTime(item.acknowledgedAt)
                      : "unknown time"}
                    {item.acknowledgedAt && (
                      <span className="text-slate-500 ml-1">
                        ({new Date(item.acknowledgedAt).toLocaleString()})
                      </span>
                    )}
                  </span>
                  <span className="text-slate-400 font-mono">
                    {item.orphanCount ?? "?"} ≤ {item.threshold ?? "?"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-slate-700 hover:border-amber-500/50 h-6 px-2 text-[10px]"
                    disabled={reopeningId === item.id}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          "Re-open this auto-cleared alert? It will reappear on the founder dashboard as unacknowledged.",
                        )
                      ) {
                        return;
                      }
                      setReopeningId(item.id);
                      setReopenMsg(null);
                      try {
                        const r = await coverSweepReopenAutoClearRequest(item.id);
                        if (!r.ok) {
                          setReopenMsg(r.message || r.error || "Re-open failed");
                        } else {
                          setReopenMsg("Alert re-opened.");
                          // Drop the row from the list so it doesn't look auto-cleared anymore.
                          setRecentAutoClears((prev) =>
                            prev.filter((x) => x.id !== item.id),
                          );
                          // Refresh the "Recently re-opened" audit list so the
                          // newly re-opened row shows up immediately.
                          coverSweepRecentReopenedRequest()
                            .then(setRecentReopened)
                            .catch(() => {});
                        }
                      } catch (e) {
                        setReopenMsg((e as Error).message);
                      } finally {
                        setReopeningId(null);
                      }
                    }}
                    data-testid={`button-cover-sweep-reopen-${item.id}`}
                  >
                    {reopeningId === item.id ? "Re-opening…" : "Re-open"}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {reopenMsg && (
            <div
              className="text-[10px] mt-2 text-amber-300"
              data-testid="text-cover-sweep-reopen-msg"
            >
              {reopenMsg}
            </div>
          )}
          <div className="text-slate-500 text-[10px] mt-2">
            Repeated entries near each other suggest the alert is flapping —
            consider raising the threshold.
          </div>
        </div>
        <div
          className="border border-slate-800/80 rounded-md p-3 bg-slate-900/40"
          data-testid="cover-sweep-recent-reopened"
        >
          <div className="uppercase tracking-wider text-slate-500 text-[10px] mb-2">
            Recently re-opened
          </div>
          {recentReopened.length === 0 ? (
            <div
              className="text-slate-500 text-[11px]"
              data-testid="text-cover-sweep-recent-reopened-empty"
            >
              No auto-clears have been re-opened.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60 text-[11px]">
              {recentReopened.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_1fr_auto] gap-2 py-1.5 items-center"
                  data-testid={`row-cover-sweep-reopened-${item.id}`}
                >
                  <span
                    className="text-slate-300"
                    data-testid={`text-cover-sweep-reopened-when-${item.id}`}
                  >
                    Re-opened{" "}
                    {item.reopenedAt
                      ? formatRelativeTime(item.reopenedAt)
                      : "(unknown time)"}
                    {item.reopenedAt && (
                      <span className="text-slate-500 ml-1">
                        ({new Date(item.reopenedAt).toLocaleString()})
                      </span>
                    )}
                    <span className="text-slate-500 ml-1">
                      by{" "}
                      <span
                        className="text-slate-300 font-mono"
                        data-testid={`text-cover-sweep-reopened-by-${item.id}`}
                      >
                        {item.reopenedBy || "unknown"}
                      </span>
                    </span>
                  </span>
                  <span
                    className="text-slate-400"
                    data-testid={`text-cover-sweep-reopened-original-${item.id}`}
                  >
                    Auto-cleared{" "}
                    {item.autoResolvedAt
                      ? formatRelativeTime(item.autoResolvedAt)
                      : "(unknown)"}
                  </span>
                  <span className="text-slate-400 font-mono">
                    {item.orphanCount ?? "?"} ≤ {item.threshold ?? "?"}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="text-slate-500 text-[10px] mt-2">
            Closes the audit loop: rows disappear from "Recent auto-clears"
            once re-opened, and reappear on the founder dashboard for human
            review.
          </div>
        </div>
        <div
          className="border border-slate-800/80 rounded-md p-3 bg-slate-900/40 space-y-2"
          data-testid="panel-sweep-apply-mode"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">
                Scheduled sweep auto-delete
              </div>
              <div className="text-xs text-slate-300 mt-1">
                Controls whether the background sweep actually removes orphan
                cover + media files or just reports them. Applies to both this
                panel and the Render File Sweep schedule.
              </div>
              {applyMode && (
                <div className="text-[10px] text-slate-500 mt-1">
                  {applyMode.override === null
                    ? `Using env fallback (BROADCAST_SWEEP_APPLY=${applyMode.envFallback ? "true" : "false"}).`
                    : "Override set from this dashboard."}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`text-[11px] font-medium ${
                  applyMode?.apply ? "text-rose-300" : "text-slate-400"
                }`}
                data-testid="text-sweep-apply-state"
              >
                {applyMode?.apply ? "Auto-delete" : "Dry-run"}
              </span>
              <Switch
                checked={!!applyMode?.apply}
                onCheckedChange={(v) => toggleApply(!!v)}
                disabled={savingApply || !applyMode}
                data-testid="switch-sweep-apply-mode"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={triggerRunNow}
              disabled={runningSchedulerNow || savingApply}
              data-testid="button-sweep-run-now"
              className="border-slate-700 hover:border-sky-500/50 h-7 px-2 text-xs"
            >
              {runningSchedulerNow ? "Running…" : "Run scheduler now"}
            </Button>
            {applyMode?.override !== null && applyMode && (
              <Button
                size="sm"
                variant="outline"
                onClick={clearApplyOverride}
                disabled={savingApply}
                data-testid="button-sweep-clear-override"
                className="border-slate-700 hover:border-slate-500 h-7 px-2 text-xs"
              >
                Reset to env default
              </Button>
            )}
            {applyMsg && (
              <span
                className="text-[10px] text-amber-300"
                data-testid="text-sweep-apply-msg"
              >
                {applyMsg}
              </span>
            )}
          </div>
          {applyMode?.lastRun ? (
            <div
              className="text-[11px] text-slate-300 border-t border-slate-800/80 pt-2"
              data-testid="text-sweep-last-run"
            >
              <span className="text-slate-500">Last scheduler tick: </span>
              {formatRelativeTime(applyMode.lastRun.finishedAt)}
              {" · "}
              <span
                className={
                  applyMode.lastRun.applyMode ? "text-rose-300" : "text-slate-400"
                }
              >
                {applyMode.lastRun.applyMode ? "auto-delete" : "dry-run"}
              </span>
              {" · covers "}
              {applyMode.lastRun.covers
                ? applyMode.lastRun.covers.ok
                  ? `${applyMode.lastRun.covers.orphanCount} orphans, ${applyMode.lastRun.covers.removed} removed`
                  : `failed (${applyMode.lastRun.covers.error || "error"})`
                : "—"}
              {" · media "}
              {applyMode.lastRun.media
                ? applyMode.lastRun.media.ok
                  ? `${applyMode.lastRun.media.orphanCount} orphans, ${applyMode.lastRun.media.removed} removed`
                  : `failed (${applyMode.lastRun.media.error || "error"})`
                : "—"}
            </div>
          ) : (
            <div
              className="text-[11px] text-slate-500 border-t border-slate-800/80 pt-2"
              data-testid="text-sweep-last-run-empty"
            >
              Scheduler has not run since boot.
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={scan}
            disabled={loading || applying}
            data-testid="button-cover-sweep-rescan"
            className="border-slate-700 hover:border-sky-500/50"
          >
            <RefreshCcw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Rescan
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={runScheduledNow}
            disabled={loading || applying || runningNow}
            data-testid="button-cover-sweep-run-now"
            className="border-slate-700 hover:border-amber-500/50"
          >
            <RefreshCcw
              className={`h-3.5 w-3.5 mr-1 ${runningNow ? "animate-spin" : ""}`}
            />
            {runningNow ? "Running scheduled sweep…" : "Run scheduled sweep now"}
          </Button>
          <Button
            size="sm"
            onClick={cleanUp}
            disabled={loading || applying || orphanCount === 0}
            data-testid="button-cover-sweep-cleanup"
            className="bg-rose-600 hover:bg-rose-500 text-white border-0 disabled:opacity-50"
          >
            {applying ? "Cleaning…" : `Clean up ${orphanCount} file${orphanCount === 1 ? "" : "s"}`}
          </Button>
          <span
            className="ml-auto text-[11px] text-slate-400"
            data-testid="text-cover-sweep-summary"
          >
            {loading
              ? "Scanning…"
              : `${orphanCount} orphan${orphanCount === 1 ? "" : "s"} found${
                  result?.orphanBytes != null
                    ? ` · ${formatBytes(result.orphanBytes)}`
                    : ""
                }`}
          </span>
        </div>

        {error && (
          <div
            className="text-xs text-rose-300 border border-rose-500/40 bg-rose-500/10 rounded p-2"
            data-testid="text-cover-sweep-error"
          >
            {error}
          </div>
        )}

        {runNowMsg && (
          <div
            className="text-xs text-amber-200 border border-amber-500/40 bg-amber-500/10 rounded p-2"
            data-testid="text-cover-sweep-run-now-msg"
          >
            {runNowMsg}
          </div>
        )}

        {lastRemoved !== null && (
          <div
            className="text-xs text-emerald-300 border border-emerald-500/40 bg-emerald-500/10 rounded p-2"
            data-testid="text-cover-sweep-removed"
          >
            Removed {lastRemoved} orphaned cover file{lastRemoved === 1 ? "" : "s"}.
          </div>
        )}

        <div className="border border-slate-800/80 rounded-md overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_60px] text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900/60 px-3 py-2">
            <span>File name</span>
            <span>Derived broadcast id</span>
            <span className="text-right">Ext</span>
          </div>
          <div className="max-h-[60vh] overflow-auto text-xs divide-y divide-slate-800/60">
            {orphans.length === 0 && !loading && (
              <div className="px-3 py-4 text-slate-400" data-testid="text-cover-sweep-empty">
                No orphaned cover files. Storage is clean.
              </div>
            )}
            {orphans.map((o) => (
              <div
                key={o.file}
                className="grid grid-cols-[1fr_1fr_60px] gap-2 px-3 py-2 items-center"
                data-testid={`row-cover-orphan-${o.id}`}
              >
                <span className="font-mono text-slate-200 truncate">{o.file}</span>
                <span className="font-mono text-slate-400 truncate">{o.id}</span>
                <span className="text-right text-amber-300 uppercase">{o.ext}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-slate-800/80 rounded-md overflow-hidden">
          <div className="flex items-center justify-between bg-slate-900/60 px-3 py-2 gap-2 flex-wrap">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">
                Sweep audit log
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Files moved aside by an apply sweep can be restored from here until
                the trash is purged.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                asChild
                data-testid="button-cover-sweep-audit-download"
                className={`border-slate-700 hover:border-emerald-500/50 h-7 px-2 text-xs ${
                  auditStats?.activeExists ? "" : "opacity-50 pointer-events-none"
                }`}
              >
                <a
                  href="/api/admin/broadcasts/covers/sweep/audit/download"
                  download="broadcast-cover-sweep.jsonl"
                  aria-disabled={!auditStats?.activeExists}
                  onClick={(e) => {
                    if (!auditStats?.activeExists) e.preventDefault();
                  }}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Export audit
                </a>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={refreshAudit}
                disabled={auditLoading}
                data-testid="button-cover-sweep-audit-refresh"
                className="border-slate-700 hover:border-sky-500/50 h-7 px-2 text-xs"
              >
                <RefreshCcw
                  className={`h-3.5 w-3.5 mr-1 ${auditLoading ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
          </div>
          {auditStats && (
            <div
              className="grid gap-3 md:grid-cols-3 px-3 py-2 border-t border-slate-800/60 bg-slate-900/30 text-[11px]"
              data-testid="cover-sweep-audit-stats"
            >
              <div>
                <div className="uppercase tracking-wider text-slate-500 text-[10px]">
                  Active file
                </div>
                <div
                  className="text-slate-200 mt-0.5"
                  data-testid="text-cover-sweep-audit-active-size"
                >
                  {auditStats.activeExists
                    ? `${formatKiB(auditStats.activeBytes)} / ${formatKiB(auditStats.maxBytes)} max`
                    : "Empty (no runs recorded)"}
                </div>
                {auditStats.activeExists && auditStats.maxBytes > 0 && (
                  <div className="text-slate-500 text-[10px] mt-0.5">
                    {Math.min(
                      100,
                      Math.round(
                        (auditStats.activeBytes / auditStats.maxBytes) * 100,
                      ),
                    )}
                    % of rotation threshold
                  </div>
                )}
              </div>
              <div>
                <div className="uppercase tracking-wider text-slate-500 text-[10px]">
                  Archives kept
                </div>
                <div
                  className="text-slate-200 mt-0.5"
                  data-testid="text-cover-sweep-audit-archive-count"
                >
                  {auditStats.archiveCount} / {auditStats.maxArchives} max
                </div>
                <div className="text-slate-500 text-[10px] mt-0.5">
                  {formatKiB(auditStats.archiveBytes)} in archives
                </div>
              </div>
              <div>
                <div className="uppercase tracking-wider text-slate-500 text-[10px]">
                  Total disk used
                </div>
                <div
                  className="text-slate-200 mt-0.5"
                  data-testid="text-cover-sweep-audit-total-bytes"
                >
                  {formatKiB(auditStats.totalBytes)}
                </div>
                <div className="text-slate-500 text-[10px] mt-0.5">
                  Active + all archives
                </div>
              </div>
            </div>
          )}
          {auditStats && (
            <div
              className="px-3 py-2 border-t border-slate-800/60 bg-slate-900/20"
              data-testid="cover-sweep-audit-archives"
            >
              <SweepAuditArchivesInspector
                surface="cover-sweep"
                archives={auditStats.archives ?? []}
                previewBase="/api/admin/broadcasts/covers/sweep/audit/archives"
                testIdPrefix="cover-sweep-audit"
              />
            </div>
          )}
          {restoreMsg && (
            <div
              className="px-3 py-2 text-[11px] text-amber-200 border-t border-slate-800/60 bg-amber-500/5"
              data-testid="text-cover-sweep-restore-msg"
            >
              {restoreMsg}
            </div>
          )}
          <div className="max-h-[60vh] overflow-auto text-xs divide-y divide-slate-800/60">
            {audit.length === 0 && !auditLoading && (
              <div
                className="px-3 py-4 text-slate-400"
                data-testid="text-cover-sweep-audit-empty"
              >
                No sweep runs recorded yet.
              </div>
            )}
            {audit.map((entry) => {
              const ts = entry.ts ? formatRelativeTime(Date.parse(entry.ts)) : "";
              const removed = entry.removed ?? [];
              const restorable = new Set(entry.restorableFiles ?? []);
              const isRestore = entry.mode === "restore";
              const isDryRun = entry.mode === "dry_run";
              return (
                <div
                  key={entry.id}
                  className="px-3 py-2 space-y-1"
                  data-testid={`row-cover-sweep-audit-${entry.id}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        isRestore
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                          : isDryRun
                            ? "border-slate-600/60 bg-slate-700/30 text-slate-300"
                            : "border-rose-500/40 bg-rose-500/10 text-rose-300"
                      }`}
                    >
                      {entry.mode}
                    </span>
                    <span className="text-slate-300">{ts}</span>
                    <span className="text-slate-500">by {entry.actorId}</span>
                    {isRestore && entry.restored?.length ? (
                      <span className="text-slate-400 truncate">
                        restored {entry.restored.join(", ")} (from {entry.restoredFrom?.slice(0, 8)}…)
                      </span>
                    ) : null}
                    {!isRestore && (
                      <span
                        className="text-slate-500 ml-auto"
                        data-testid={`text-cover-sweep-audit-counts-${entry.id}`}
                      >
                        {entry.orphans?.length ?? 0} orphan
                        {(entry.orphans?.length ?? 0) === 1 ? "" : "s"} ·{" "}
                        {removed.length} removed
                        {entry.trashDir ? " · in trash" : isDryRun ? "" : " · purged"}
                      </span>
                    )}
                    {!isRestore && entry.trashDir && restorable.size > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => restoreAll(entry.id, restorable.size)}
                        disabled={
                          restoringAllId === entry.id ||
                          auditLoading ||
                          restoringKey?.startsWith(`${entry.id}::`) === true
                        }
                        title="Move every still-restorable file from this sweep back into the covers directory"
                        data-testid={`button-cover-sweep-restore-all-${entry.id}`}
                        className="border-slate-700 hover:border-emerald-500/50 h-6 px-2 text-[11px] disabled:opacity-40"
                      >
                        {restoringAllId === entry.id
                          ? "Restoring…"
                          : `Restore all (${restorable.size})`}
                      </Button>
                    )}
                  </div>
                  {!isRestore && removed.length > 0 && (
                    <div className="border border-slate-800/60 rounded-md divide-y divide-slate-800/60">
                      {removed.map((f) => {
                        const canRestore = restorable.has(f);
                        const key = `${entry.id}::${f}`;
                        return (
                          <div
                            key={f}
                            className="grid grid-cols-[1fr_auto] gap-2 px-2 py-1.5 items-center"
                            data-testid={`row-cover-sweep-audit-file-${entry.id}-${f}`}
                          >
                            <span className="font-mono text-slate-200 truncate">{f}</span>
                            {entry.trashDir ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => restoreFile(entry.id, f)}
                                disabled={
                                  !canRestore || restoringKey === key || auditLoading
                                }
                                title={
                                  canRestore
                                    ? "Move this file back into the covers directory"
                                    : "Not available to restore (already in place or no longer in trash)"
                                }
                                data-testid={`button-cover-sweep-restore-${entry.id}-${f}`}
                                className="border-slate-700 hover:border-emerald-500/50 h-6 px-2 text-[11px] disabled:opacity-40"
                              >
                                {restoringKey === key
                                  ? "Restoring…"
                                  : canRestore
                                    ? "Restore"
                                    : "Restored"}
                              </Button>
                            ) : (
                              <span className="text-[10px] text-slate-500 italic">
                                purged
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </CinemaCard>
  );
}

type MediaSweepOrphan = { file: string; kind: "mp4" | "manifest"; bytes: number };
type MediaSweepResponse = {
  ok: boolean;
  dryRun?: boolean;
  orphanCount?: number;
  removed?: number;
  bytesRemoved?: number;
  orphans?: MediaSweepOrphan[];
  confirmToken?: string;
  confirmTokenTtlMs?: number;
  error?: string;
  message?: string;
};

async function mediaSweepRequest(
  apply: boolean,
  confirmToken?: string,
): Promise<MediaSweepResponse> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  const url = `/api/admin/broadcasts/media/sweep${apply ? "?apply=1" : ""}`;
  const r = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: JSON.stringify(apply && confirmToken ? { confirmToken } : {}),
  });
  return (await r.json().catch(() => ({ ok: false, error: "bad_json" }))) as MediaSweepResponse;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

type MediaSweepStatus = {
  lastScanAt: number | null;
  lastOrphanCount: number | null;
  lastOrphanBytes: number | null;
  threshold: number;
  wasAboveThreshold: boolean;
  nextScanAt: number | null;
  intervalMs: number | null;
  lastAutoResolvedAt: number | null;
  lastAutoResolvedCount: number | null;
  flapping?: boolean;
  flappingCount?: number;
  flappingWindowMs?: number;
  flappingThreshold?: number;
  // Task #831 — observability for the flapping latch.
  lastFlappingFiredAt?: number | null;
  lastReArmedAt?: number | null;
  auditMaxBytes?: number;
  auditMaxArchives?: number;
  auditMaxBytesSource?: "db" | "env" | "default";
  auditMaxArchivesSource?: "db" | "env" | "default";
  auditLimits?: {
    bytesMin: number;
    bytesMax: number;
    archivesMin: number;
    archivesMax: number;
    bytesDefault: number;
    archivesDefault: number;
  };
  currentArchiveCount?: number;
  activeAuditBytes?: number | null;
};

async function mediaSweepAuditRetentionRequest(payload: {
  maxBytes?: number;
  maxArchives?: number;
}): Promise<{ ok: boolean; status?: MediaSweepStatus; error?: string }> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  const r = await fetch(
    "/api/admin/broadcasts/media/sweep/audit-retention",
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: JSON.stringify(payload),
    },
  );
  return (await r.json().catch(() => ({ ok: false, error: "bad_json" }))) as any;
}

// T359 — Fetch media-sweep audit stats so the panel can list rotated
// archives + open the per-archive Inspect dialog.
async function mediaSweepAuditStatsRequest(): Promise<MediaSweepAuditStats | null> {
  try {
    const r = await fetch("/api/admin/broadcasts/media/sweep/audit?limit=1", {
      credentials: "include",
    });
    const j = await r.json().catch(() => ({}));
    if (j?.ok && j?.stats) return j.stats as MediaSweepAuditStats;
  } catch {
    /* ignore */
  }
  return null;
}

async function mediaSweepStatusRequest(): Promise<MediaSweepStatus | null> {
  try {
    const r = await fetch("/api/admin/broadcasts/media/sweep/status", {
      credentials: "include",
    });
    const j = await r.json().catch(() => ({}));
    if (j?.ok && j?.status) return j.status as MediaSweepStatus;
  } catch {
    /* ignore */
  }
  return null;
}

type MediaSweepRunNowResponse = {
  ok: boolean;
  result?: {
    orphanCount: number;
    bytes: number;
    scannedAt: number;
    threshold: number;
    alerted: boolean;
  };
  status?: MediaSweepStatus;
  error?: string;
  message?: string;
};

async function mediaSweepRunNowRequest(): Promise<MediaSweepRunNowResponse> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  const r = await fetch("/api/admin/broadcasts/media/sweep/run-now", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: "{}",
  });
  return (await r.json().catch(() => ({ ok: false, error: "bad_json" }))) as MediaSweepRunNowResponse;
}

async function mediaSweepThresholdRequest(
  threshold: number,
): Promise<{ ok: boolean; status?: MediaSweepStatus; error?: string }> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  const r = await fetch("/api/admin/broadcasts/media/sweep/threshold", {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: JSON.stringify({ threshold }),
  });
  return (await r.json().catch(() => ({ ok: false, error: "bad_json" }))) as any;
}

// Task #811 — PATCH the media-sweep flapping threshold/window. Both
// routes accept `{ value: number }` and return `{ ok, value, status }`.
async function mediaSweepFlappingThresholdRequest(
  value: number,
): Promise<{ ok: boolean; value?: number; status?: MediaSweepStatus; error?: string; message?: string }> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  const r = await fetch(
    "/api/admin/broadcasts/media/sweep/flapping-threshold",
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: JSON.stringify({ value }),
    },
  );
  return (await r.json().catch(() => ({ ok: false, error: "bad_json" }))) as any;
}

async function mediaSweepFlappingWindowRequest(
  value: number,
): Promise<{ ok: boolean; value?: number; status?: MediaSweepStatus; error?: string; message?: string }> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  const r = await fetch(
    "/api/admin/broadcasts/media/sweep/flapping-window-ms",
    {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: JSON.stringify({ value }),
    },
  );
  return (await r.json().catch(() => ({ ok: false, error: "bad_json" }))) as any;
}

// Task #837 — Re-arm the media-sweep flapping latch. Mirrors the
// cover-sweep helper.
async function mediaSweepFlappingRearmRequest(): Promise<{
  ok: boolean;
  lastReArmedAt?: number;
  status?: MediaSweepStatus;
  error?: string;
  message?: string;
}> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  const r = await fetch(
    "/api/admin/broadcasts/media/sweep/flapping/rearm",
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
    },
  );
  return (await r.json().catch(() => ({ ok: false, error: "bad_json" }))) as any;
}

type MediaSweepAutoClear = {
  id: string;
  acknowledgedAt: number | null;
  orphanCount: number | null;
  threshold: number | null;
};

async function mediaSweepRecentAutoClearsRequest(): Promise<MediaSweepAutoClear[]> {
  try {
    const r = await fetch(
      "/api/admin/broadcasts/media/sweep/recent-auto-clears?limit=10",
      { credentials: "include" },
    );
    const j = await r.json().catch(() => ({}));
    if (j?.ok && Array.isArray(j.items)) return j.items as MediaSweepAutoClear[];
  } catch {
    /* ignore */
  }
  return [];
}

type MediaSweepReopened = {
  id: string;
  reopenedAt: number | null;
  reopenedBy: string | null;
  autoResolvedAt: number | null;
  orphanCount: number | null;
  threshold: number | null;
};

async function mediaSweepRecentReopenedRequest(): Promise<MediaSweepReopened[]> {
  try {
    const r = await fetch(
      "/api/admin/broadcasts/media/sweep/recent-auto-clears/reopened?limit=10",
      { credentials: "include" },
    );
    const j = await r.json().catch(() => ({}));
    if (j?.ok && Array.isArray(j.items)) return j.items as MediaSweepReopened[];
  } catch {
    /* ignore */
  }
  return [];
}

async function mediaSweepReopenAutoClearRequest(
  id: string,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  let csrf: string | null = null;
  try {
    const t = await fetch("/api/auth/csrf-token", { credentials: "include" });
    const j = await t.json().catch(() => ({}));
    csrf = (j?.csrfToken as string) || null;
  } catch {
    /* ignore */
  }
  const r = await fetch(
    `/api/admin/broadcasts/media/sweep/recent-auto-clears/${encodeURIComponent(id)}/reopen`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: "{}",
    },
  );
  return (await r.json().catch(() => ({ ok: false, error: "bad_json" }))) as {
    ok: boolean;
    error?: string;
    message?: string;
  };
}

function MediaSweepPanel() {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<MediaSweepResponse | null>(null);
  const [lastRemoved, setLastRemoved] = useState<{ count: number; bytes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<MediaSweepStatus | null>(null);
  const [thresholdDraft, setThresholdDraft] = useState<string>("");
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [thresholdMsg, setThresholdMsg] = useState<string | null>(null);
  // Task #811 — flapping-tuning drafts/messages, mirroring CoverSweepPanel.
  const [flapThresholdDraft, setFlapThresholdDraft] = useState<string>("");
  const [savingFlapThreshold, setSavingFlapThreshold] = useState(false);
  const [flapThresholdMsg, setFlapThresholdMsg] = useState<string | null>(null);
  const [flapWindowDraft, setFlapWindowDraft] = useState<string>("");
  const [savingFlapWindow, setSavingFlapWindow] = useState(false);
  const [flapWindowMsg, setFlapWindowMsg] = useState<string | null>(null);
  // Task #837 — Re-arm acknowledgement state.
  const [reArmingFlap, setReArmingFlap] = useState(false);
  const [reArmMsg, setReArmMsg] = useState<string | null>(null);
  const [runningNow, setRunningNow] = useState(false);
  const [runNowMsg, setRunNowMsg] = useState<string | null>(null);
  const [recentAutoClears, setRecentAutoClears] = useState<MediaSweepAutoClear[]>([]);
  const [recentReopened, setRecentReopened] = useState<MediaSweepReopened[]>([]);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [reopenMsg, setReopenMsg] = useState<string | null>(null);
  // Audit-log retention controls — same UX as CoverSweepPanel.
  const [auditBytesKibDraft, setAuditBytesKibDraft] = useState<string>("");
  const [auditArchivesDraft, setAuditArchivesDraft] = useState<string>("");
  const [savingAuditRetention, setSavingAuditRetention] = useState(false);
  const [auditRetentionMsg, setAuditRetentionMsg] = useState<string | null>(null);
  // T359 — Audit stats including rotated archives, used by the Inspect dialog.
  const [auditStats, setAuditStats] = useState<MediaSweepAuditStats | null>(null);

  const refreshStatus = async () => {
    const [s, recent, reopened, aStats] = await Promise.all([
      mediaSweepStatusRequest(),
      mediaSweepRecentAutoClearsRequest(),
      mediaSweepRecentReopenedRequest(),
      mediaSweepAuditStatsRequest(),
    ]);
    setAuditStats(aStats);
    if (s) {
      setStatus(s);
      setThresholdDraft((prev) => (prev === "" ? String(s.threshold) : prev));
      setAuditBytesKibDraft((prev) =>
        prev === "" && typeof s.auditMaxBytes === "number"
          ? String(Math.round(s.auditMaxBytes / 1024))
          : prev,
      );
      setAuditArchivesDraft((prev) =>
        prev === "" && typeof s.auditMaxArchives === "number"
          ? String(s.auditMaxArchives)
          : prev,
      );
      // Task #811 — seed flapping drafts the first time we see status.
      setFlapThresholdDraft((prev) =>
        prev === "" && typeof s.flappingThreshold === "number"
          ? String(s.flappingThreshold)
          : prev,
      );
      setFlapWindowDraft((prev) => {
        if (prev !== "" || typeof s.flappingWindowMs !== "number") return prev;
        const hours = s.flappingWindowMs / (60 * 60 * 1000);
        return Number.isInteger(hours) ? String(hours) : hours.toFixed(2);
      });
    }
    setRecentAutoClears(recent);
    setRecentReopened(reopened);
  };

  // Task #811 — flapping save handlers (mirror CoverSweepPanel).
  const MEDIA_FLAP_WINDOW_MIN_MS = 60_000;
  const MEDIA_FLAP_WINDOW_MAX_MS = 90 * 24 * 60 * 60 * 1000;

  const saveMediaFlapThreshold = async () => {
    const n = Number(flapThresholdDraft);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 2 || n > 1000) {
      setFlapThresholdMsg("Threshold must be an integer between 2 and 1000.");
      return;
    }
    setSavingFlapThreshold(true);
    setFlapThresholdMsg(null);
    try {
      const r = await mediaSweepFlappingThresholdRequest(n);
      if (!r.ok) {
        setFlapThresholdMsg(r.message || r.error || "Save failed");
      } else {
        setFlapThresholdMsg(`Saved (flapping threshold = ${r.value}).`);
        if (r.status) setStatus(r.status);
      }
    } finally {
      setSavingFlapThreshold(false);
    }
  };

  const saveMediaFlapWindow = async () => {
    const hours = Number(flapWindowDraft);
    if (!Number.isFinite(hours) || hours <= 0) {
      setFlapWindowMsg("Window must be a positive number of hours.");
      return;
    }
    const ms = Math.round(hours * 60 * 60 * 1000);
    if (ms < MEDIA_FLAP_WINDOW_MIN_MS || ms > MEDIA_FLAP_WINDOW_MAX_MS) {
      setFlapWindowMsg(
        "Window must be between 1 minute (~0.017h) and 90 days (2160h).",
      );
      return;
    }
    setSavingFlapWindow(true);
    setFlapWindowMsg(null);
    try {
      const r = await mediaSweepFlappingWindowRequest(ms);
      if (!r.ok) {
        setFlapWindowMsg(r.message || r.error || "Save failed");
      } else {
        const savedHours = (r.value ?? ms) / (60 * 60 * 1000);
        setFlapWindowMsg(`Saved (flapping window = ${savedHours}h).`);
        if (r.status) setStatus(r.status);
      }
    } finally {
      setSavingFlapWindow(false);
    }
  };

  // Task #837 — Acknowledge the flapping latch without re-saving the
  // threshold or window. Bumps `lastReArmedAt` via a dedicated route.
  const reArmFlapping = async () => {
    setReArmingFlap(true);
    setReArmMsg(null);
    try {
      const r = await mediaSweepFlappingRearmRequest();
      if (!r.ok) {
        setReArmMsg(r.message || r.error || "Could not re-arm");
      } else {
        setReArmMsg("Flapping latch re-armed");
        if (r.status) setStatus(r.status);
      }
    } catch (e) {
      setReArmMsg((e as Error).message);
    } finally {
      setReArmingFlap(false);
    }
  };

  const saveAuditRetention = async () => {
    const limits = status?.auditLimits;
    const payload: { maxBytes?: number; maxArchives?: number } = {};
    if (auditBytesKibDraft !== "") {
      const kib = Number(auditBytesKibDraft);
      if (!Number.isFinite(kib) || kib <= 0) {
        setAuditRetentionMsg("Max file size must be a positive number of KiB.");
        return;
      }
      const bytes = Math.floor(kib * 1024);
      if (
        limits &&
        (bytes < limits.bytesMin || bytes > limits.bytesMax)
      ) {
        setAuditRetentionMsg(
          `Max file size must be between ${formatKiB(limits.bytesMin)} and ${formatKiB(limits.bytesMax)}.`,
        );
        return;
      }
      if (bytes !== status?.auditMaxBytes) payload.maxBytes = bytes;
    }
    if (auditArchivesDraft !== "") {
      const n = Number(auditArchivesDraft);
      if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) {
        setAuditRetentionMsg("Archive count must be a positive integer.");
        return;
      }
      if (
        limits &&
        (n < limits.archivesMin || n > limits.archivesMax)
      ) {
        setAuditRetentionMsg(
          `Archive count must be between ${limits.archivesMin} and ${limits.archivesMax}.`,
        );
        return;
      }
      if (n !== status?.auditMaxArchives) payload.maxArchives = n;
    }
    if (payload.maxBytes === undefined && payload.maxArchives === undefined) {
      setAuditRetentionMsg("No changes to save.");
      return;
    }
    // Guard: lowering "max archives" below the current archive count will
    // prune the oldest history on the next rotation. Make the admin confirm.
    if (
      payload.maxArchives !== undefined &&
      typeof status?.currentArchiveCount === "number" &&
      payload.maxArchives < status.currentArchiveCount
    ) {
      const pruneCount = status.currentArchiveCount - payload.maxArchives;
      if (
        !window.confirm(
          `Lowering "max archives kept" to ${payload.maxArchives} will permanently delete ${pruneCount} existing archive${pruneCount === 1 ? "" : "s"} (oldest first) on the next rotation. This audit history cannot be recovered. Continue?`,
        )
      ) {
        return;
      }
    }
    // Guard: lowering "max file size" below the active file's current size
    // means the next append will immediately rotate; otherwise rotations
    // just happen more often. Warn either way so the admin is aware.
    if (
      payload.maxBytes !== undefined &&
      typeof status?.auditMaxBytes === "number" &&
      payload.maxBytes < status.auditMaxBytes
    ) {
      const activeBytes = status.activeAuditBytes ?? 0;
      const willRotateNow = activeBytes >= payload.maxBytes;
      const msg = willRotateNow
        ? `The active audit file is ${formatKiB(activeBytes)}, which already exceeds the new max of ${formatKiB(payload.maxBytes)}. It will rotate to an archive on the next sweep append. Continue?`
        : `Lowering "max file size" to ${formatKiB(payload.maxBytes)} means the active audit file will rotate sooner and more often, producing more archive files. Continue?`;
      if (!window.confirm(msg)) {
        return;
      }
    }
    setSavingAuditRetention(true);
    setAuditRetentionMsg(null);
    try {
      const r = await mediaSweepAuditRetentionRequest(payload);
      if (!r.ok) {
        setAuditRetentionMsg(r.error || "Could not update audit retention");
      } else {
        setAuditRetentionMsg("Audit retention updated");
        if (r.status) {
          if (typeof r.status.auditMaxBytes === "number") {
            setAuditBytesKibDraft(String(Math.round(r.status.auditMaxBytes / 1024)));
          }
          if (typeof r.status.auditMaxArchives === "number") {
            setAuditArchivesDraft(String(r.status.auditMaxArchives));
          }
        }
        // Refresh from the status endpoint so currentArchiveCount /
        // activeAuditBytes stay accurate for subsequent shrink-confirmation
        // prompts in the same session.
        await refreshStatus();
      }
    } catch (e) {
      setAuditRetentionMsg((e as Error).message);
    } finally {
      setSavingAuditRetention(false);
    }
  };

  const scan = async () => {
    setLoading(true);
    setError(null);
    setLastRemoved(null);
    try {
      const r = await mediaSweepRequest(false);
      if (!r.ok) {
        setError(r.message || r.error || "Sweep failed");
        setResult(null);
      } else {
        setResult(r);
      }
      await refreshStatus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runScheduledNow = async () => {
    setRunningNow(true);
    setRunNowMsg(null);
    try {
      const r = await mediaSweepRunNowRequest();
      if (!r.ok) {
        setRunNowMsg(r.message || r.error || "Scheduled sweep failed");
      } else if (r.status) {
        setStatus(r.status);
        const count = r.result?.orphanCount ?? 0;
        const alerted = r.result?.alerted ? " — alert fired" : "";
        setRunNowMsg(
          `Scheduled sweep ran: ${count} orphan${count === 1 ? "" : "s"}${alerted}.`,
        );
      }
    } catch (e) {
      setRunNowMsg((e as Error).message);
    } finally {
      setRunningNow(false);
    }
  };

  const saveThreshold = async () => {
    const n = Number(thresholdDraft);
    if (!Number.isFinite(n) || n < 0) {
      setThresholdMsg("Threshold must be a non-negative number");
      return;
    }
    setSavingThreshold(true);
    setThresholdMsg(null);
    try {
      const r = await mediaSweepThresholdRequest(Math.floor(n));
      if (!r.ok) {
        setThresholdMsg(r.error || "Could not update threshold");
      } else {
        setThresholdMsg("Threshold updated");
        if (r.status) {
          setStatus(r.status);
          setThresholdDraft(String(r.status.threshold));
        }
      }
    } catch (e) {
      setThresholdMsg((e as Error).message);
    } finally {
      setSavingThreshold(false);
    }
  };

  const cleanUp = async () => {
    const count = result?.orphanCount ?? 0;
    if (!count) return;
    if (
      !window.confirm(
        `Permanently delete ${count} orphaned render file${count === 1 ? "" : "s"} (MP4s and manifests)? This cannot be undone.`,
      )
    ) {
      return;
    }
    const token = result?.confirmToken;
    if (!token) {
      setError("Re-scan first to confirm the orphan list before cleaning up.");
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const r = await mediaSweepRequest(true, token);
      if (!r.ok) {
        if (r.error === "orphan_set_changed") {
          setError(
            r.message ||
              "The orphan list changed since the last scan. The list below has been refreshed — review and try again.",
          );
        } else {
          setError(r.message || r.error || "Clean up failed");
        }
        // Server returns a fresh token + current orphan set on rejection so
        // the admin can re-confirm without an extra round-trip.
        if (Array.isArray(r.orphans)) setResult(r);
      } else {
        setLastRemoved({ count: r.removed ?? 0, bytes: r.bytesRemoved ?? 0 });
        const fresh = await mediaSweepRequest(false);
        if (fresh.ok) setResult(fresh);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const orphans = result?.orphans ?? [];
  const orphanCount = result?.orphanCount ?? 0;
  const totalBytes = orphans.reduce((acc, o) => acc + (o.bytes || 0), 0);

  return (
    <CinemaCard>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Film className="h-4 w-4 text-sky-400" /> Render File Sweep
        </CardTitle>
        <CardDescription>
          Reconciles rendered MP4s and JSON manifests in the broadcasts storage directory against
          the broadcasts table. Files whose broadcast row no longer exists are listed below and can
          be cleaned up. A background sweep also runs daily and alerts the founder dashboard if
          orphans pile up above the threshold. Cover images are handled in the Cover File Sweep panel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status?.flapping && (
          <div
            className="text-[12px] text-amber-200 border border-amber-500/50 bg-amber-500/10 rounded p-2 flex items-start gap-2"
            data-testid="banner-media-sweep-flapping"
          >
            <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-300" />
            <div>
              <div className="font-semibold text-amber-200">
                Flapping detected — consider raising the threshold
              </div>
              <div className="text-amber-200/80 text-[11px] mt-0.5">
                {status.flappingCount ?? 0} media-orphan alert
                {status.flappingCount === 1 ? "" : "s"} auto-cleared in the last{" "}
                {Math.round((status.flappingWindowMs ?? 24 * 60 * 60 * 1000) / 3_600_000)}h
                {typeof status.flappingThreshold === "number"
                  ? ` (≥ ${status.flappingThreshold} triggers this warning)`
                  : ""}
                . Repeated fire-and-clear cycles usually mean the threshold is too low for
                the platform's steady-state orphan count.
              </div>
            </div>
          </div>
        )}
        <div
          className="grid gap-3 md:grid-cols-3 text-[11px] border border-slate-800/80 rounded-md p-3 bg-slate-900/40"
          data-testid="media-sweep-schedule"
        >
          <div>
            <div className="uppercase tracking-wider text-slate-500 text-[10px]">
              Last scheduled scan
            </div>
            <div className="text-slate-200 mt-1" data-testid="text-media-sweep-last-scan">
              {status?.lastScanAt
                ? `${formatRelativeTime(status.lastScanAt)} — ${
                    status.lastOrphanCount ?? 0
                  } orphan${status.lastOrphanCount === 1 ? "" : "s"}${
                    status.lastOrphanBytes ? ` · ${formatBytes(status.lastOrphanBytes)}` : ""
                  }`
                : "Background sweep has not run yet."}
            </div>
            {status?.nextScanAt && (
              <div className="text-slate-500 text-[10px] mt-0.5">
                Next: {formatRelativeTime(status.nextScanAt)}
              </div>
            )}
          </div>
          <div>
            <div className="uppercase tracking-wider text-slate-500 text-[10px]">
              Alert threshold
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min={0}
                value={thresholdDraft}
                onChange={(e) => setThresholdDraft(e.target.value)}
                className="h-7 text-xs w-24 bg-slate-900 border-slate-700"
                data-testid="input-media-sweep-threshold"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={saveThreshold}
                disabled={
                  savingThreshold ||
                  thresholdDraft === "" ||
                  Number(thresholdDraft) === status?.threshold
                }
                data-testid="button-media-sweep-threshold-save"
                className="border-slate-700 hover:border-sky-500/50 h-7 px-2 text-xs"
              >
                {savingThreshold ? "Saving…" : "Save"}
              </Button>
            </div>
            <div className="text-slate-500 text-[10px] mt-1">
              Founders are alerted when orphan count exceeds this value.
            </div>
            {thresholdMsg && (
              <div
                className="text-[10px] mt-1 text-amber-300"
                data-testid="text-media-sweep-threshold-msg"
              >
                {thresholdMsg}
              </div>
            )}
          </div>
          <div>
            <div className="uppercase tracking-wider text-slate-500 text-[10px]">
              Current state
            </div>
            <div
              className={`mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] ${
                status?.wasAboveThreshold
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              }`}
              data-testid="badge-media-sweep-state"
            >
              {status?.wasAboveThreshold
                ? `ABOVE THRESHOLD (${status?.lastOrphanCount ?? 0} > ${
                    status?.threshold ?? 0
                  })`
                : "OK"}
            </div>
            <div className="text-slate-500 text-[10px] mt-1">
              {status?.intervalMs
                ? `Scheduled every ${Math.round(status.intervalMs / 3_600_000)}h.`
                : "Background scheduler not running."}
            </div>
            {status?.lastAutoResolvedAt && (
              <div
                className="text-emerald-300/90 text-[10px] mt-1"
                data-testid="text-media-sweep-auto-resolved"
              >
                Auto-cleared {status.lastAutoResolvedCount ?? 0} alert
                {status.lastAutoResolvedCount === 1 ? "" : "s"} {" "}
                {formatRelativeTime(status.lastAutoResolvedAt)} (queue healthy).
              </div>
            )}
          </div>
        </div>
        {/* Task #811 — DB-backed flapping latch tuning, mirrors cover-sweep. */}
        <div
          className="border border-slate-800/80 rounded-md p-3 bg-slate-900/40 space-y-2"
          data-testid="media-sweep-flapping-tuning"
        >
          <div className="uppercase tracking-wider text-slate-500 text-[10px]">
            Flapping detector
          </div>
          <div className="grid gap-3 md:grid-cols-2 text-[11px]">
            <div>
              <label
                className="text-slate-400 text-[10px]"
                htmlFor="media-sweep-flap-threshold"
              >
                Flapping threshold (auto-clears in window)
              </label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="media-sweep-flap-threshold"
                  type="number"
                  min={2}
                  max={1000}
                  step={1}
                  value={flapThresholdDraft}
                  onChange={(e) => setFlapThresholdDraft(e.target.value)}
                  className="h-7 text-xs w-24 bg-slate-900 border-slate-700"
                  data-testid="input-media-sweep-flap-threshold"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={saveMediaFlapThreshold}
                  disabled={
                    savingFlapThreshold ||
                    flapThresholdDraft === "" ||
                    Number(flapThresholdDraft) === status?.flappingThreshold
                  }
                  data-testid="button-media-sweep-flap-threshold-save"
                  className="border-slate-700 hover:border-sky-500/50 h-7 px-2 text-xs"
                >
                  {savingFlapThreshold ? "Saving…" : "Save"}
                </Button>
              </div>
              <div className="text-slate-500 text-[10px] mt-1">
                Current: {status?.flappingThreshold ?? "—"} · Allowed: 2–1000.
              </div>
              {flapThresholdMsg && (
                <div
                  className="text-[10px] mt-1 text-amber-300"
                  data-testid="text-media-sweep-flap-threshold-msg"
                >
                  {flapThresholdMsg}
                </div>
              )}
            </div>
            <div>
              <label
                className="text-slate-400 text-[10px]"
                htmlFor="media-sweep-flap-window"
              >
                Flapping window (hours)
              </label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="media-sweep-flap-window"
                  type="number"
                  min={0.02}
                  max={2160}
                  step="any"
                  value={flapWindowDraft}
                  onChange={(e) => setFlapWindowDraft(e.target.value)}
                  className="h-7 text-xs w-28 bg-slate-900 border-slate-700"
                  data-testid="input-media-sweep-flap-window"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={saveMediaFlapWindow}
                  disabled={savingFlapWindow || flapWindowDraft === ""}
                  data-testid="button-media-sweep-flap-window-save"
                  className="border-slate-700 hover:border-sky-500/50 h-7 px-2 text-xs"
                >
                  {savingFlapWindow ? "Saving…" : "Save"}
                </Button>
              </div>
              <div className="text-slate-500 text-[10px] mt-1">
                Current:{" "}
                {typeof status?.flappingWindowMs === "number"
                  ? `${(status.flappingWindowMs / (60 * 60 * 1000)).toFixed(2)}h`
                  : "—"}{" "}
                · Allowed: 1m (~0.017h) – 90d (2160h).
              </div>
              {flapWindowMsg && (
                <div
                  className="text-[10px] mt-1 text-amber-300"
                  data-testid="text-media-sweep-flap-window-msg"
                >
                  {flapWindowMsg}
                </div>
              )}
            </div>
            {/* Task #831 — same flapping history footer as the cover sweep. */}
            <div
              className="md:col-span-2 text-[10px] text-slate-400 border-t border-slate-800/60 pt-2 flex flex-col gap-0.5"
              data-testid="text-media-sweep-flapping-history"
            >
              <div>
                Last flapping alert:{" "}
                <span
                  className="text-slate-200"
                  data-testid="text-media-sweep-last-flapping-fired"
                >
                  {status?.lastFlappingFiredAt
                    ? formatRelativeTime(status.lastFlappingFiredAt)
                    : "never"}
                </span>
              </div>
              <div>
                Last re-arm:{" "}
                <span
                  className="text-slate-200"
                  data-testid="text-media-sweep-last-rearmed"
                >
                  {status?.lastReArmedAt
                    ? formatRelativeTime(status.lastReArmedAt)
                    : "never"}
                </span>
              </div>
              {/* Task #837 — Acknowledge the flapping latch without
                  re-saving the threshold or window. */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  onClick={reArmFlapping}
                  disabled={reArmingFlap}
                  data-testid="button-media-sweep-flapping-rearm"
                >
                  {reArmingFlap ? "Re-arming…" : "Re-arm now"}
                </Button>
                {reArmMsg && (
                  <span
                    className="text-[10px] text-amber-300"
                    data-testid="text-media-sweep-flapping-rearm-msg"
                  >
                    {reArmMsg}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div
          className="border border-slate-800/80 rounded-md p-3 bg-slate-900/40 space-y-2"
          data-testid="media-sweep-audit-retention"
        >
          <div className="uppercase tracking-wider text-slate-500 text-[10px]">
            Audit log retention
          </div>
          <div className="grid gap-3 md:grid-cols-2 text-[11px]">
            <div>
              <label
                className="text-slate-400 text-[10px]"
                htmlFor="media-sweep-audit-bytes"
              >
                Max audit file size (KiB)
              </label>
              <Input
                id="media-sweep-audit-bytes"
                type="number"
                min={
                  status?.auditLimits
                    ? Math.ceil(status.auditLimits.bytesMin / 1024)
                    : 64
                }
                max={
                  status?.auditLimits
                    ? Math.floor(status.auditLimits.bytesMax / 1024)
                    : 102400
                }
                value={auditBytesKibDraft}
                onChange={(e) => setAuditBytesKibDraft(e.target.value)}
                className="h-7 text-xs w-32 bg-slate-900 border-slate-700 mt-1"
                data-testid="input-media-sweep-audit-bytes"
              />
              <div className="text-slate-500 text-[10px] mt-1">
                Current:{" "}
                {typeof status?.auditMaxBytes === "number"
                  ? formatKiB(status.auditMaxBytes)
                  : "—"}
                {status?.auditMaxBytesSource && (
                  <span className="ml-1 text-slate-600">
                    (source: {status.auditMaxBytesSource})
                  </span>
                )}
                {status?.auditLimits && (
                  <span className="block">
                    Allowed: {formatKiB(status.auditLimits.bytesMin)}–
                    {formatKiB(status.auditLimits.bytesMax)}
                  </span>
                )}
              </div>
            </div>
            <div>
              <label
                className="text-slate-400 text-[10px]"
                htmlFor="media-sweep-audit-archives"
              >
                Max archives kept
              </label>
              <Input
                id="media-sweep-audit-archives"
                type="number"
                min={status?.auditLimits?.archivesMin ?? 1}
                max={status?.auditLimits?.archivesMax ?? 100}
                step={1}
                value={auditArchivesDraft}
                onChange={(e) => setAuditArchivesDraft(e.target.value)}
                className="h-7 text-xs w-24 bg-slate-900 border-slate-700 mt-1"
                data-testid="input-media-sweep-audit-archives"
              />
              <div className="text-slate-500 text-[10px] mt-1">
                Current: {status?.auditMaxArchives ?? "—"}
                {status?.auditMaxArchivesSource && (
                  <span className="ml-1 text-slate-600">
                    (source: {status.auditMaxArchivesSource})
                  </span>
                )}
                {status?.auditLimits && (
                  <span className="block">
                    Allowed: {status.auditLimits.archivesMin}–
                    {status.auditLimits.archivesMax}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={saveAuditRetention}
              disabled={savingAuditRetention}
              data-testid="button-media-sweep-audit-retention-save"
              className="border-slate-700 hover:border-sky-500/50 h-7 px-2 text-xs"
            >
              {savingAuditRetention ? "Saving…" : "Save retention"}
            </Button>
            {auditRetentionMsg && (
              <span
                className="text-[10px] text-amber-300"
                data-testid="text-media-sweep-audit-retention-msg"
              >
                {auditRetentionMsg}
              </span>
            )}
          </div>
          <div className="text-slate-500 text-[10px]">
            Controls rotation of{" "}
            <span className="font-mono">broadcast-media-sweep.jsonl</span>: the
            active file is archived once it exceeds the size above, and old
            archives are pruned so at most this many are kept. Founders can
            tune for tighter compliance windows or larger fleets without
            redeploying.
          </div>
        </div>
        <div
          className="border border-slate-800/80 rounded-md p-3 bg-slate-900/40 space-y-2"
          data-testid="media-sweep-audit-archives"
        >
          <div className="uppercase tracking-wider text-slate-500 text-[10px]">
            Audit archives
          </div>
          {auditStats ? (
            <div className="text-[11px] text-slate-400">
              {auditStats.archiveCount} / {auditStats.maxArchives} archives ·{" "}
              {formatKiB(auditStats.archiveBytes)} on disk
            </div>
          ) : null}
          <SweepAuditArchivesInspector
            surface="media-sweep"
            archives={auditStats?.archives ?? []}
            previewBase="/api/admin/broadcasts/media/sweep/audit/archives"
            testIdPrefix="media-sweep-audit"
          />
        </div>
        <div
          className="border border-slate-800/80 rounded-md p-3 bg-slate-900/40"
          data-testid="media-sweep-recent-auto-clears"
        >
          <div className="uppercase tracking-wider text-slate-500 text-[10px] mb-2">
            Recent auto-clears
          </div>
          {recentAutoClears.length === 0 ? (
            <div
              className="text-slate-500 text-[11px]"
              data-testid="text-media-sweep-recent-auto-clears-empty"
            >
              No auto-clears recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60 text-[11px]">
              {recentAutoClears.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_auto_auto] gap-2 py-1.5 items-center"
                  data-testid={`row-media-sweep-auto-clear-${item.id}`}
                >
                  <span className="text-slate-300">
                    {item.acknowledgedAt
                      ? formatRelativeTime(item.acknowledgedAt)
                      : "unknown time"}
                    {item.acknowledgedAt && (
                      <span className="text-slate-500 ml-1">
                        ({new Date(item.acknowledgedAt).toLocaleString()})
                      </span>
                    )}
                  </span>
                  <span className="text-slate-400 font-mono">
                    {item.orphanCount ?? "?"} ≤ {item.threshold ?? "?"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-slate-700 hover:border-amber-500/50 h-6 px-2 text-[10px]"
                    disabled={reopeningId === item.id}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          "Re-open this auto-cleared alert? It will reappear on the founder dashboard as unacknowledged.",
                        )
                      ) {
                        return;
                      }
                      setReopeningId(item.id);
                      setReopenMsg(null);
                      try {
                        const r = await mediaSweepReopenAutoClearRequest(item.id);
                        if (!r.ok) {
                          setReopenMsg(r.message || r.error || "Re-open failed");
                        } else {
                          setReopenMsg("Alert re-opened.");
                          setRecentAutoClears((prev) =>
                            prev.filter((x) => x.id !== item.id),
                          );
                          mediaSweepRecentReopenedRequest()
                            .then(setRecentReopened)
                            .catch(() => {});
                        }
                      } catch (e) {
                        setReopenMsg((e as Error).message);
                      } finally {
                        setReopeningId(null);
                      }
                    }}
                    data-testid={`button-media-sweep-reopen-${item.id}`}
                  >
                    {reopeningId === item.id ? "Re-opening…" : "Re-open"}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {reopenMsg && (
            <div
              className="text-[10px] mt-2 text-amber-300"
              data-testid="text-media-sweep-reopen-msg"
            >
              {reopenMsg}
            </div>
          )}
          <div className="text-slate-500 text-[10px] mt-2">
            Repeated entries near each other suggest the alert is flapping —
            consider raising the threshold.
          </div>
        </div>
        <div
          className="border border-slate-800/80 rounded-md p-3 bg-slate-900/40"
          data-testid="media-sweep-recent-reopened"
        >
          <div className="uppercase tracking-wider text-slate-500 text-[10px] mb-2">
            Recently re-opened
          </div>
          {recentReopened.length === 0 ? (
            <div
              className="text-slate-500 text-[11px]"
              data-testid="text-media-sweep-recent-reopened-empty"
            >
              No auto-clears have been re-opened.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60 text-[11px]">
              {recentReopened.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[1fr_1fr_auto] gap-2 py-1.5 items-center"
                  data-testid={`row-media-sweep-reopened-${item.id}`}
                >
                  <span
                    className="text-slate-300"
                    data-testid={`text-media-sweep-reopened-when-${item.id}`}
                  >
                    Re-opened{" "}
                    {item.reopenedAt
                      ? formatRelativeTime(item.reopenedAt)
                      : "(unknown time)"}
                    {item.reopenedAt && (
                      <span className="text-slate-500 ml-1">
                        ({new Date(item.reopenedAt).toLocaleString()})
                      </span>
                    )}
                    <span className="text-slate-500 ml-1">
                      by{" "}
                      <span
                        className="text-slate-300 font-mono"
                        data-testid={`text-media-sweep-reopened-by-${item.id}`}
                      >
                        {item.reopenedBy || "unknown"}
                      </span>
                    </span>
                  </span>
                  <span
                    className="text-slate-400"
                    data-testid={`text-media-sweep-reopened-original-${item.id}`}
                  >
                    Auto-cleared{" "}
                    {item.autoResolvedAt
                      ? formatRelativeTime(item.autoResolvedAt)
                      : "(unknown)"}
                  </span>
                  <span className="text-slate-400 font-mono">
                    {item.orphanCount ?? "?"} ≤ {item.threshold ?? "?"}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="text-slate-500 text-[10px] mt-2">
            Closes the audit loop: rows disappear from "Recent auto-clears"
            once re-opened, and reappear on the founder dashboard for human
            review.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={scan}
            disabled={loading || applying}
            data-testid="button-media-sweep-rescan"
            className="border-slate-700 hover:border-sky-500/50"
          >
            <RefreshCcw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Rescan
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={runScheduledNow}
            disabled={loading || applying || runningNow}
            data-testid="button-media-sweep-run-now"
            className="border-slate-700 hover:border-amber-500/50"
          >
            <RefreshCcw
              className={`h-3.5 w-3.5 mr-1 ${runningNow ? "animate-spin" : ""}`}
            />
            {runningNow ? "Running scheduled sweep…" : "Run scheduled sweep now"}
          </Button>
          <Button
            size="sm"
            onClick={cleanUp}
            disabled={loading || applying || orphanCount === 0}
            data-testid="button-media-sweep-cleanup"
            className="bg-rose-600 hover:bg-rose-500 text-white border-0 disabled:opacity-50"
          >
            {applying
              ? "Cleaning…"
              : `Clean up ${orphanCount} file${orphanCount === 1 ? "" : "s"}`}
          </Button>
          <span
            className="ml-auto text-[11px] text-slate-400"
            data-testid="text-media-sweep-summary"
          >
            {loading
              ? "Scanning…"
              : `${orphanCount} orphan${orphanCount === 1 ? "" : "s"} found · ${formatBytes(totalBytes)}`}
          </span>
        </div>

        {error && (
          <div
            className="text-xs text-rose-300 border border-rose-500/40 bg-rose-500/10 rounded p-2"
            data-testid="text-media-sweep-error"
          >
            {error}
          </div>
        )}

        {runNowMsg && (
          <div
            className="text-xs text-amber-200 border border-amber-500/40 bg-amber-500/10 rounded p-2"
            data-testid="text-media-sweep-run-now-msg"
          >
            {runNowMsg}
          </div>
        )}

        {lastRemoved !== null && (
          <div
            className="text-xs text-emerald-300 border border-emerald-500/40 bg-emerald-500/10 rounded p-2"
            data-testid="text-media-sweep-removed"
          >
            Removed {lastRemoved.count} orphaned render file
            {lastRemoved.count === 1 ? "" : "s"} ({formatBytes(lastRemoved.bytes)}).
          </div>
        )}

        <div className="border border-slate-800/80 rounded-md overflow-hidden">
          <div className="grid grid-cols-[1fr_90px_90px] text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900/60 px-3 py-2">
            <span>File name</span>
            <span className="text-right">Kind</span>
            <span className="text-right">Size</span>
          </div>
          <div className="max-h-[60vh] overflow-auto text-xs divide-y divide-slate-800/60">
            {orphans.length === 0 && !loading && (
              <div className="px-3 py-4 text-slate-400" data-testid="text-media-sweep-empty">
                No orphaned render files. Storage is clean.
              </div>
            )}
            {orphans.map((o) => (
              <div
                key={o.file}
                className="grid grid-cols-[1fr_90px_90px] gap-2 px-3 py-2 items-center"
                data-testid={`row-media-orphan-${o.file}`}
              >
                <span className="font-mono text-slate-200 truncate">{o.file}</span>
                <span className="text-right text-amber-300 uppercase">{o.kind}</span>
                <span className="text-right text-slate-400">{formatBytes(o.bytes)}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </CinemaCard>
  );
}

type SweepHistoryEntry = {
  id: string;
  at: string;
  actor: string;
  action: string;
  kind: "covers" | "media" | "error";
  failed: boolean;
  orphanCount: number | null;
  removed: number | null;
  bytesRemoved: number | null;
  dryRun: boolean | null;
  errorMessage: string | null;
  detail: string;
};

function SweepHistoryPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<SweepHistoryEntry[]>([]);
  const [kindFilter, setKindFilter] = useState<"all" | "covers" | "media" | "failures">("all");
  const [hideDryRunOk, setHideDryRunOk] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/broadcasts/sweep/history?limit=20", {
        credentials: "include",
      });
      const j = await r.json().catch(() => ({ ok: false, error: "bad_json" }));
      if (!j?.ok) {
        setError(j?.message || j?.error || "Failed to load history");
        setEntries([]);
      } else {
        setEntries(Array.isArray(j.entries) ? j.entries : []);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const visibleEntries = entries.filter((e) => {
    if (kindFilter === "failures") {
      if (!e.failed) return false;
    } else if (kindFilter !== "all") {
      if (e.kind !== kindFilter) return false;
    }
    if (hideDryRunOk && !e.failed && e.dryRun === true) return false;
    return true;
  });

  const kindOptions: { value: typeof kindFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "covers", label: "Covers" },
    { value: "media", label: "Media" },
    { value: "failures", label: "Failures" },
  ];

  return (
    <CinemaCard>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="h-4 w-4 text-sky-400" /> Scheduled Cleanup History
        </CardTitle>
        <CardDescription>
          Recent runs of the background broadcast-sweep scheduler (covers + render
          files). Each row shows what the scheduler found, what it removed, and
          whether the run was dry-run or apply mode. Failed runs are flagged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={load}
            disabled={loading}
            data-testid="button-sweep-history-refresh"
            className="border-slate-700 hover:border-sky-500/50"
          >
            <RefreshCcw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <div className="flex items-center gap-1" data-testid="group-sweep-history-kind-filter">
            {kindOptions.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={kindFilter === opt.value ? "default" : "outline"}
                onClick={() => setKindFilter(opt.value)}
                data-testid={`button-sweep-history-filter-${opt.value}`}
                className={
                  kindFilter === opt.value
                    ? "h-7 px-2 text-[11px]"
                    : "h-7 px-2 text-[11px] border-slate-700 hover:border-sky-500/50"
                }
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <label
            className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer select-none"
            data-testid="label-sweep-history-hide-dryrun-ok"
          >
            <input
              type="checkbox"
              checked={hideDryRunOk}
              onChange={(e) => setHideDryRunOk(e.target.checked)}
              data-testid="checkbox-sweep-history-hide-dryrun-ok"
              className="h-3 w-3 accent-sky-500"
            />
            Hide successful dry-runs
          </label>
          <span
            className="ml-auto text-[11px] text-slate-400"
            data-testid="text-sweep-history-summary"
          >
            {loading
              ? "Loading…"
              : `${visibleEntries.length}/${entries.length} run${
                  entries.length === 1 ? "" : "s"
                }${
                  visibleEntries.filter((e) => e.failed).length > 0
                    ? ` · ${visibleEntries.filter((e) => e.failed).length} failed`
                    : ""
                }`}
          </span>
        </div>

        {error && (
          <div
            className="text-xs text-rose-300 border border-rose-500/40 bg-rose-500/10 rounded p-2"
            data-testid="text-sweep-history-error"
          >
            {error}
          </div>
        )}

        <div className="border border-slate-800/80 rounded-md overflow-hidden">
          <div className="grid grid-cols-[150px_80px_70px_70px_90px_70px_1fr] text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900/60 px-3 py-2 gap-2">
            <span>When</span>
            <span>Kind</span>
            <span className="text-right">Orphans</span>
            <span className="text-right">Removed</span>
            <span className="text-right">Bytes</span>
            <span className="text-right">Mode</span>
            <span>Status</span>
          </div>
          <div className="max-h-[60vh] overflow-auto text-xs divide-y divide-slate-800/60">
            {!loading && entries.length === 0 && !error && (
              <div className="px-3 py-4 text-slate-400" data-testid="text-sweep-history-empty">
                No scheduled cleanup runs recorded yet. The background sweep
                runs roughly every 24 hours; check back after the next tick.
              </div>
            )}
            {!loading && entries.length > 0 && visibleEntries.length === 0 && !error && (
              <div
                className="px-3 py-4 text-slate-400"
                data-testid="text-sweep-history-empty-filtered"
              >
                No runs match the current filters.
              </div>
            )}
            {visibleEntries.map((e) => {
              const mode =
                e.dryRun === null ? "—" : e.dryRun ? "dry-run" : "apply";
              const modeCls = e.dryRun
                ? "text-slate-400"
                : e.dryRun === false
                ? "text-amber-300"
                : "text-slate-500";
              return (
                <div
                  key={e.id}
                  className={`grid grid-cols-[150px_80px_70px_70px_90px_70px_1fr] gap-2 px-3 py-2 items-center ${
                    e.failed ? "bg-rose-500/5" : ""
                  }`}
                  data-testid={`row-sweep-history-${e.id}`}
                >
                  <span
                    className="text-slate-300 truncate"
                    title={new Date(e.at).toLocaleString()}
                  >
                    {new Date(e.at).toLocaleString()}
                  </span>
                  <span className="uppercase text-sky-300 text-[10px]">
                    {e.kind}
                  </span>
                  <span className="text-right text-slate-200">
                    {e.orphanCount ?? "—"}
                  </span>
                  <span className="text-right text-slate-200">
                    {e.removed ?? "—"}
                  </span>
                  <span className="text-right text-slate-400">
                    {e.bytesRemoved != null ? formatBytes(e.bytesRemoved) : "—"}
                  </span>
                  <span className={`text-right text-[10px] uppercase ${modeCls}`}>
                    {mode}
                  </span>
                  {e.failed ? (
                    <span
                      className="inline-flex items-center gap-1 text-rose-300"
                      data-testid={`status-sweep-history-failed-${e.id}`}
                    >
                      <span className="inline-block px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-[10px] uppercase tracking-wider">
                        Failed
                      </span>
                      <span
                        className="truncate text-[11px] text-rose-200/80"
                        title={e.errorMessage ?? e.detail}
                      >
                        {e.errorMessage ?? e.detail}
                      </span>
                    </span>
                  ) : (
                    <span className="text-emerald-300/90 text-[11px]">OK</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </CinemaCard>
  );
}
