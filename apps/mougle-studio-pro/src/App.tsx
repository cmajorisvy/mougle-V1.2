import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BadgeCheck,
  Box,
  Building2,
  Clapperboard,
  Download,
  Film,
  FolderOpen,
  Gauge,
  HardDrive,
  Headphones,
  KeyRound,
  Mic2,
  MonitorPlay,
  Newspaper,
  RadioTower,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tv,
  Users,
  Video,
  Wand2,
  ZapOff,
} from "lucide-react";
import {
  DEFAULT_SETTINGS,
  MougleStudioApiClient,
  SAFETY_LOCKS,
  STUDIO_TOOLTIPS,
  type StudioModule,
  type StudioSettings,
  loadSettings,
  saveSettings,
  withSafetyLocks,
} from "./studioProCore";
import "./styles.css";

const API = "/api/admin/production-house";

const modules: Array<{ id: StudioModule; label: string; icon: any }> = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "preview", label: "Preview Studio", icon: MonitorPlay },
  { id: "cinema4d", label: "Cinema 4D Studio", icon: Clapperboard },
  { id: "newsroom", label: "Newsroom Creator", icon: Newspaper },
  { id: "podcast", label: "Podcast Room", icon: Mic2 },
  { id: "avatar", label: "Avatar Studio", icon: Users },
  { id: "media", label: "Media Packages", icon: Video },
  { id: "unreal", label: "Unreal Dry-Run", icon: Tv },
  { id: "fourD", label: "4D Sandbox", icon: RadioTower },
  { id: "settings", label: "Settings", icon: SlidersHorizontal },
];

function safeStorage() {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => undefined,
    };
  }
  return window.localStorage;
}

function useApi(settings: StudioSettings) {
  return useMemo(() => new MougleStudioApiClient(settings), [settings]);
}

function SafetyBadges() {
  return (
    <div className="badges">
      {[
        "Admin Preview Only",
        "Draft/Internal",
        "Not Rendered",
        "Not Published",
        "No Unreal Execution",
        "No 4D Hardware",
        "Real Send Disabled",
      ].map((label) => (
        <span className="badge" key={label}>
          <ShieldCheck size={13} />
          {label}
        </span>
      ))}
    </div>
  );
}

function ControlButton({
  children,
  icon: Icon = Wand2,
  tooltip,
  onClick,
  disabled,
  tone = "primary",
}: {
  children: React.ReactNode;
  icon?: any;
  tooltip: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "primary" | "muted" | "gold";
}) {
  return (
    <button
      className={`control-button ${tone}`}
      title={tooltip}
      aria-label={`${children}. ${tooltip}`}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={16} />
      {children}
    </button>
  );
}

function Field({
  label,
  children,
  tooltip,
}: {
  label: string;
  children: React.ReactNode;
  tooltip: string;
}) {
  return (
    <label className="field" title={tooltip}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function GlassPanel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass ${className}`}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function StagePreview({
  mode,
  headline,
  lowerThird,
  ticker,
}: {
  mode: string;
  headline: string;
  lowerThird: string;
  ticker: string;
}) {
  return (
    <div className="stage" title="Visual preview only. It does not render, publish, execute Unreal, or trigger 4D hardware.">
      <div className="stage-wall">
        <div className="world-map">MOUGLE<br />{mode.toUpperCase()}</div>
        <div className="top-stories">
          <strong>TOP STORIES</strong>
          <span>{headline || "Verified newsroom draft"}</span>
          <span>Source confidence panel</span>
          <span>Claims timeline</span>
        </div>
      </div>
      <div className="anchor-marker">
        <div className="head" />
        <div className="body" />
      </div>
      <div className="desk">M</div>
      <div className="lower-third">
        <b>{lowerThird || "Admin Preview Only"}</b>
        <span>not rendered · not published · no Unreal execution · no 4D hardware</span>
      </div>
      <div className="ticker">{ticker || "MOUGLE STUDIO PRO · DRAFT INTERNAL PACKAGE · SAFE MODE LOCKED"}</div>
    </div>
  );
}

function Dashboard({ api }: { api: MougleStudioApiClient }) {
  const [overview, setOverview] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [status, setStatus] = useState("Idle");

  async function refresh() {
    setStatus("Refreshing...");
    try {
      const [o, p] = await Promise.all([
        api.get(`${API}/overview`).catch(() => null),
        api.get(`${API}/preview-studio/state`).catch(() => null),
      ]);
      setOverview(o?.overview ?? null);
      setPreview(p?.state ?? null);
      setStatus("Connected to Mougle API");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const totals = overview?.totals ?? {};
  const cards = [
    ["Active productions", totals.productions ?? 0, Building2],
    ["Draft rooms", totals.rooms ?? 0, Box],
    ["Draft avatars", totals.avatars ?? 0, Users],
    ["Cinema 4D packages", overview?.cinema4DPackages ?? "draft", Clapperboard],
    ["Media packages", overview?.mediaPackages ?? "draft", Film],
    ["Preview Studio states", preview ? 1 : 0, MonitorPlay],
    ["Readiness status", preview?.readinessReportId ?? "pending", Gauge],
    ["Approval status", preview?.approvalState ?? "draft", BadgeCheck],
    ["Unreal dry-run", "locked", ZapOff],
    ["4D sandbox", "sandbox", RadioTower],
  ] as const;

  return (
    <div className="grid-one">
      <GlassPanel title="Production Control Dashboard" subtitle={status}>
        <div className="metric-grid">
          {cards.map(([label, value, Icon]) => (
            <div className="metric" key={label}>
              <Icon size={20} />
              <span>{label}</span>
              <strong>{String(value)}</strong>
            </div>
          ))}
        </div>
        <ControlButton icon={RefreshCcw} tooltip="Refreshes draft dashboard data from Mougle API. Read-only; no Unreal, 4D, render, or publishing effects." onClick={refresh}>
          Refresh Dashboard
        </ControlButton>
      </GlassPanel>
    </div>
  );
}

function PreviewStudio({ api }: { api: MougleStudioApiClient }) {
  const [state, setState] = useState<any>(null);
  const [mode, setMode] = useState("newsroom");
  const [message, setMessage] = useState("");

  async function load() {
    const r = await api.get(`${API}/preview-studio/state`);
    setState(r.state);
    setMessage("Preview state loaded");
  }

  async function generate() {
    const r = await api.post(`${API}/preview-studio/generate`, {
      controls: {
        mode,
        roomLabel: `Mougle ${mode} control preview`,
        tickerText: "ADMIN PREVIEW ONLY · NOT RENDERED · NOT PUBLISHED",
        lowerThirdText: "Mougle Studio Pro",
      },
      links: {},
    });
    setState(r.state);
    setMessage("Draft preview generated safely");
  }

  return (
    <div className="split">
      <GlassPanel title="Production Preview Studio" subtitle="Admin Preview Only — not rendered, not published, no Unreal execution, no 4D hardware.">
        <StagePreview
          mode={mode}
          headline={state?.scene?.panels?.[1]?.label ?? "Source confidence and claims panel"}
          lowerThird={state?.scene?.controls?.lowerThirdText ?? "Mougle Studio Pro"}
          ticker={state?.scene?.controls?.tickerText ?? ""}
        />
        <SafetyBadges />
      </GlassPanel>
      <GlassPanel title="Preview Controllers">
        <Field label="Preview Mode" tooltip="Changes preview mode locally and can generate a draft Preview Studio state. No render, no Unreal, no 4D, no publish.">
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {["newsroom", "podcast", "debate", "hall_event", "fourd_cinema", "breaking_news"].map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <div className="button-row">
          <ControlButton tooltip={STUDIO_TOOLTIPS.openPreview} onClick={generate}>Generate Preview</ControlButton>
          <ControlButton icon={RefreshCcw} tone="muted" tooltip="Loads the latest Preview Studio state from Mougle API. Read-only." onClick={load}>Load Latest</ControlButton>
        </div>
        <pre className="code">{message || JSON.stringify(state ?? SAFETY_LOCKS, null, 2)}</pre>
      </GlassPanel>
    </div>
  );
}

function Cinema4DStudio({ api, settings }: { api: MougleStudioApiClient; settings: StudioSettings }) {
  const [roomId, setRoomId] = useState("mougle_verified_newsroom_room");
  const [template, setTemplate] = useState("mougle_verified_newsroom");
  const [roomType, setRoomType] = useState("newsroom");
  const [role, setRole] = useState("news_anchor");
  const [style, setStyle] = useState("premium_news_anchor");
  const [wardrobe, setWardrobe] = useState("navy_suit");
  const [pose, setPose] = useState("seated_desk_hands_folded");
  const [qualityTier, setQualityTier] = useState("premium_draft");
  const [accessories, setAccessories] = useState(["lavalier_mic", "earpiece", "tablet"]);
  const [voiceAssetId, setVoiceAssetId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [download, setDownload] = useState<any>(null);

  function toggleAccessory(name: string) {
    setAccessories((prev) => prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]);
  }

  async function action(kind: string) {
    if (kind === "room") {
      setResult(await api.post(`${API}/cinema4d-studio/generate-room-manifest`, { roomCategory: roomType, roomName: "Mougle Cinema 4D Newsroom", prompt: roomType }));
    }
    if (kind === "anchor") {
      setResult(await api.post(`${API}/cinema4d-studio/generate-character-manifest`, {
        roomId, characterRole: role, characterStyle: style, wardrobeStyle: wardrobe, posePreset: pose, voiceAssetId: voiceAssetId || null,
      }));
    }
    if (kind === "accessories") {
      const responses = [];
      for (const accessoryType of accessories) {
        responses.push(await api.post(`${API}/cinema4d-studio/generate-accessory-manifest`, { roomId, accessoryType }));
      }
      setResult({ ok: true, accessories: responses.map((r: any) => r.accessory) });
    }
    if (kind === "script") {
      setResult(await api.post(`${API}/cinema4d-studio/generate-room-character-script`, { roomId, template, qualityTier }));
    }
    if (kind === "preview") {
      setResult(await api.post(`${API}/cinema4d-studio/${encodeURIComponent(roomId)}/open-preview-with-character`, { template }));
    }
  }

  async function downloadFile(type: "script" | "package") {
    const file = type === "script"
      ? await api.downloadCinema4DScript(roomId, qualityTier)
      : await api.downloadCinema4DPackage(roomId, qualityTier);
    const blob = new Blob([file.bytes], { type: file.contentType });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = file.filename;
    a.click();
    URL.revokeObjectURL(href);
    setDownload({ ...file, folder: settings.downloadFolder });
  }

  return (
    <div className="split">
      <GlassPanel title="Cinema 4D Studio" subtitle="Draft script and package controller. No render, no MRQ, no Sequencer, no Unreal import, no 4D hardware.">
        <StagePreview mode="cinema 4d" headline="LED world map · source confidence · claims · timeline" lowerThird={`${role} · ${wardrobe}`} ticker="DRAFT CINEMA 4D PACKAGE · INTERNAL ONLY" />
        <SafetyBadges />
        <p className="fine">This package contains draft/internal Cinema 4D script and manifests only. It does not render, publish, execute Unreal, or trigger 4D hardware.</p>
        <p className="fine warning">This generates a Cinema 4D scene script and production package. Final cinema-quality output still requires Cinema 4D rendering and human 3D expert review.</p>
      </GlassPanel>
      <GlassPanel title="Cinema 4D Controllers">
        <div className="form-grid">
          <Field label="Room Type" tooltip="Selects draft room type. Local controller value; no live engine action.">
            <select value={roomType} onChange={(e) => setRoomType(e.target.value)}>
              {["newsroom", "podcast_room", "debate_studio", "hall_event", "cinema4d_room"].map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Template" tooltip="Selects Cinema 4D draft template. No render or live execution.">
            <select value={template} onChange={(e) => setTemplate(e.target.value)}>
              <option value="mougle_verified_newsroom">Mougle Verified Newsroom</option>
              <option value="mougle_podcast_studio">Mougle Podcast Studio</option>
            </select>
          </Field>
          <Field label="Room ID" tooltip="Used for Mougle API preview and download routes.">
            <input value={roomId} onChange={(e) => setRoomId(e.target.value)} />
          </Field>
          <Field label="Character Role" tooltip="Draft manifest role. Placeholder character only, not a final rig.">
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {["news_anchor", "podcast_host", "debate_moderator", "guest", "analyst", "reporter", "custom"].map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Character Style" tooltip="Draft character style metadata. Does not import a rig.">
            <select value={style} onChange={(e) => setStyle(e.target.value)}>
              {["premium_news_anchor", "futuristic_anchor", "executive_host", "podcast_host", "debate_moderator", "field_reporter", "custom"].map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Wardrobe" tooltip="Draft wardrobe metadata. Placeholder only.">
            <select value={wardrobe} onChange={(e) => setWardrobe(e.target.value)}>
              {["dark_suit", "navy_suit", "black_blazer", "futuristic_jacket", "podcast_casual", "custom"].map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Pose Preset" tooltip="Draft pose marker metadata. No animation or Sequencer action.">
            <select value={pose} onChange={(e) => setPose(e.target.value)}>
              {["seated_desk_hands_folded", "seated_desk_tablet", "standing_presenter", "podcast_table_microphone", "debate_moderator_table", "analyst_pointing_to_screen"].map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Quality Tier" tooltip="Selects output quality metadata: placeholder, premium draft, or expert polish required. It never starts rendering.">
            <select value={qualityTier} onChange={(e) => setQualityTier(e.target.value)}>
              {["placeholder", "premium_draft", "expert_polish_required"].map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Voice Asset" tooltip="Optional voice asset reference only. No synthesis or lip-sync runs.">
            <input value={voiceAssetId} onChange={(e) => setVoiceAssetId(e.target.value)} placeholder="future_provider_required" />
          </Field>
        </div>
        <div className="chips">
          {["microphone", "lavalier_mic", "earpiece", "headset", "tablet", "laptop", "desk_nameplate", "cue_card"].map((name) => (
            <button className={accessories.includes(name) ? "chip active" : "chip"} key={name} onClick={() => toggleAccessory(name)} title="Accessory manifest toggle. Draft metadata only; no asset import.">{name}</button>
          ))}
        </div>
        <div className="button-grid">
          <ControlButton tooltip={STUDIO_TOOLTIPS.generateRoom} onClick={() => action("room")}>Generate Room Manifest</ControlButton>
          <ControlButton tooltip={STUDIO_TOOLTIPS.generateAnchor} onClick={() => action("anchor")}>Generate Anchor Character</ControlButton>
          <ControlButton tooltip={STUDIO_TOOLTIPS.generateAccessories} onClick={() => action("accessories")}>Generate Accessories</ControlButton>
          <ControlButton tooltip={STUDIO_TOOLTIPS.generateScript} onClick={() => action("script")}>Generate Room + Character Script</ControlButton>
          <ControlButton icon={MonitorPlay} tooltip={STUDIO_TOOLTIPS.openPreview} onClick={() => action("preview")}>Open in Preview</ControlButton>
          <ControlButton icon={Download} tone="gold" tooltip={STUDIO_TOOLTIPS.downloadScript} onClick={() => downloadFile("script")}>Download Cinema 4D Script</ControlButton>
          <ControlButton icon={Download} tone="gold" tooltip={STUDIO_TOOLTIPS.downloadPackage} onClick={() => downloadFile("package")}>Download Production Package ZIP</ControlButton>
          <ControlButton
            icon={FolderOpen}
            tone="muted"
            tooltip="Opens the default downloads folder through the safe Electron preload helper when available. It has no API side effects."
            onClick={async () => {
              const nativeApi = (window as any).mougleStudioNative;
              if (nativeApi?.openDownloadFolder) await nativeApi.openDownloadFolder();
              else alert(`Open in Finder: ${download?.folder ?? settings.downloadFolder}`);
            }}
          >
            Open in Finder
          </ControlButton>
        </div>
        <pre className="code">{JSON.stringify(download ?? result ?? withSafetyLocks({ module: "cinema4d" }), null, 2)}</pre>
      </GlassPanel>
    </div>
  );
}

function NewsroomCreator() {
  const [headline, setHeadline] = useState("Tech sector leads market rally");
  const [confidence, setConfidence] = useState(92);
  const [lowerThird, setLowerThird] = useState("Mougle Verified News");
  const [ticker, setTicker] = useState("WORLD · Economy shows signs of stabilization · More updates on our app");
  return (
    <div className="split">
      <GlassPanel title="Newsroom Creator" subtitle="Draft-only local package mode until verified newsroom storage is available.">
        <StagePreview mode="newsroom" headline={headline} lowerThird={lowerThird} ticker={ticker} />
        <SafetyBadges />
      </GlassPanel>
      <GlassPanel title="Verified News Controllers">
        <div className="form-grid">
          <Field label="Headline" tooltip="Draft headline for teleprompter and LED wall. No publishing."><input value={headline} onChange={(e) => setHeadline(e.target.value)} /></Field>
          <Field label="Verified Sources" tooltip="Draft source panel content. Uses local draft mode if verified storage is unavailable."><textarea defaultValue="Market close report&#10;Mougle source panel" /></Field>
          <Field label="Confidence Score" tooltip="Draft confidence score display only."><input type="number" value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} /></Field>
          <Field label="Claim Panel" tooltip="Draft claim panel content."><textarea defaultValue="Investors show renewed confidence." /></Field>
          <Field label="Timeline Panel" tooltip="Draft timeline marker content."><textarea defaultValue="Open · Panel focus · Anchor closeup · Wide newsroom" /></Field>
          <Field label="Lower Third" tooltip="Draft lower-third text only."><input value={lowerThird} onChange={(e) => setLowerThird(e.target.value)} /></Field>
          <Field label="Ticker" tooltip="Draft ticker strip text only."><input value={ticker} onChange={(e) => setTicker(e.target.value)} /></Field>
          <Field label="Anchor Character" tooltip="Placeholder anchor selection only, not a final rig."><input defaultValue="Mougle Verified Anchor" /></Field>
          <Field label="Camera Preset" tooltip="Preview camera marker only."><select><option>anchor_closeup</option><option>anchor_medium</option><option>wide_newsroom</option></select></Field>
          <Field label="Lighting Preset" tooltip="Preview lighting metadata only."><select><option>premium_blue_gold</option><option>warm_gold</option><option>breaking_high_contrast</option></select></Field>
          <Field label="4D Cue Suggestions" tooltip="Draft cue suggestions only. No hardware commands."><textarea defaultValue="light_flash · bass_hit · color_change" /></Field>
        </div>
      </GlassPanel>
    </div>
  );
}

function PodcastCreator() {
  return (
    <div className="split">
      <GlassPanel title="Podcast Room Creator" subtitle="Warm studio preview with host, guest, table mics, and package planning.">
        <StagePreview mode="podcast" headline="Mougle Podcast" lowerThird="Host + Guest" ticker="YOUTUBE PACKAGE · SHORTS/REELS PACKAGE · DRAFT ONLY" />
        <SafetyBadges />
      </GlassPanel>
      <GlassPanel title="Podcast Controllers">
        <div className="form-grid">
          {["Host Avatar", "Guest Avatar", "Microphones", "Headphones", "Table Style", "Video Wall", "Warm Lighting", "Two-shot Camera", "Host Closeup", "Guest Closeup", "YouTube Package", "Shorts/Reels Package"].map((label) => (
            <Field key={label} label={label} tooltip={`${label} controller. Draft/internal planning only; no publishing, no rendering, no live engine action.`}>
              <input defaultValue={label.includes("Package") ? "draft package" : label.toLowerCase()} />
            </Field>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}

function AvatarStudio() {
  return (
    <div className="split">
      <GlassPanel title="Avatar Studio" subtitle="Placeholder character preview. Future MetaHuman / Character Creator compatibility only.">
        <div className="avatar-preview"><div /><span>Placeholder Character · Not Final Rig</span></div>
        <SafetyBadges />
      </GlassPanel>
      <GlassPanel title="Avatar Controllers">
        <div className="form-grid">
          {["Avatar Role", "Style", "Wardrobe", "Pose", "Accessory", "Voice Asset", "MetaHuman Candidate", "Character Creator Candidate", "Unreal Blueprint Candidate"].map((label) => (
            <Field key={label} label={label} tooltip={`${label} metadata. Placeholder only; no real asset import, no rendering, no publishing.`}>
              <input defaultValue={label.includes("Candidate") ? "future_provider_required" : "draft"} />
            </Field>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}

function MediaStudio({ api }: { api: MougleStudioApiClient }) {
  const [topic, setTopic] = useState("AI safety policy changes");
  const [type, setType] = useState("news_to_debate");
  const [result, setResult] = useState<any>(null);
  async function generate() {
    setResult(await api.post(`${API}/media-pipeline/generate`, {
      prompt: topic,
      sourceTopic: topic,
      packageType: type,
    }));
  }
  return (
    <GlassPanel title="Media Package Studio" subtitle="News, debate, podcast, YouTube, social, and clips packages. Draft/internal only.">
      <SafetyBadges />
      <div className="form-grid">
        <Field label="Package Type" tooltip="Selects draft media package type. No upload or publishing.">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {["news_package", "debate_package", "podcast_package", "youtube_package", "social_package", "news_to_debate", "news_to_podcast", "podcast_to_clips", "debate_to_clips"].map((v) => <option key={v}>{v}</option>)}
          </select>
        </Field>
        <Field label="Topic" tooltip="Draft package prompt. No publishing.">
          <textarea value={topic} onChange={(e) => setTopic(e.target.value)} />
        </Field>
      </div>
      <ControlButton tooltip={STUDIO_TOOLTIPS.mediaPackage} onClick={generate}>Generate Draft Media Package</ControlButton>
      <pre className="code">{JSON.stringify(result ?? withSafetyLocks({ packageType: type }), null, 2)}</pre>
    </GlassPanel>
  );
}

function UnrealDryRun({ api }: { api: MougleStudioApiClient }) {
  const [productionId, setProductionId] = useState("prod_draft");
  const [result, setResult] = useState<any>(null);
  const actions = [
    ["health_check", `${API}/real-unreal/setup/status`, "GET"],
    ["validate_package", `${API}/real-unreal/dry-run-validation/${productionId}/validate-local`, "POST"],
    ["prepare_scene", `${API}/real-unreal/prepare-scene-dry-run/${productionId}/send`, "POST"],
    ["set_camera", `${API}/real-unreal/set-camera-dry-run/${productionId}/send`, "POST"],
    ["set_lighting", `${API}/real-unreal/set-lighting/send`, "POST"],
    ["set_panels", `${API}/real-unreal/set-panels/send`, "POST"],
    ["render_preview_contract", `${API}/real-unreal/render-preview-contract/${productionId}/validate-local`, "POST"],
    ["command approval gate", `${API}/real-unreal/command-approval/status`, "GET"],
    ["level-load contract", `${API}/real-unreal/level-load-contract/status`, "GET"],
    ["safety switch", `${API}/real-unreal/safety-switch/status`, "GET"],
  ] as const;
  async function run(path: string, method: string) {
    setResult(method === "GET" ? await api.get(path) : await api.post(path, { productionId, confirm: false }));
  }
  return (
    <GlassPanel title="Unreal Dry-Run Studio" subtitle="Contract and dry-run endpoints only. Live Unreal commands are blocked by the app client.">
      <SafetyBadges />
      <Field label="Production ID" tooltip="Draft production ID for dry-run validation only."><input value={productionId} onChange={(e) => setProductionId(e.target.value)} /></Field>
      <div className="button-grid">
        {actions.map(([label, path, method]) => (
          <ControlButton key={label} icon={ZapOff} tooltip={STUDIO_TOOLTIPS.unrealDryRun} onClick={() => run(path, method)}>{label}</ControlButton>
        ))}
      </div>
      <pre className="code">{JSON.stringify(result ?? withSafetyLocks({ studio: "unreal_dry_run" }), null, 2)}</pre>
    </GlassPanel>
  );
}

function FourDSandbox({ api }: { api: MougleStudioApiClient }) {
  const [result, setResult] = useState<any>(null);
  async function run(action: "effects" | "validate" | "send" | "history") {
    const body = { effect: "light_flash", intensity: 0.4, durationMs: 250, safetyMode: "sandbox" };
    if (action === "effects") setResult(await api.get(`${API}/4d/sandbox/supported-effects`));
    if (action === "validate") setResult(await api.post(`${API}/4d/sandbox/validate-cue`, body));
    if (action === "send") setResult(await api.post(`${API}/4d/sandbox/send`, body));
    if (action === "history") setResult(await api.get(`${API}/4d/sandbox/history`));
  }
  return (
    <GlassPanel title="4D Sandbox Studio" subtitle="Sandbox-only cue validation and mock send history. No real hardware protocols are used.">
      <SafetyBadges />
      <div className="button-grid">
        <ControlButton icon={RadioTower} tooltip={STUDIO_TOOLTIPS.fourDSandbox} onClick={() => run("effects")}>Supported Effects</ControlButton>
        <ControlButton icon={RadioTower} tooltip={STUDIO_TOOLTIPS.fourDSandbox} onClick={() => run("validate")}>Validate Cue</ControlButton>
        <ControlButton icon={RadioTower} tooltip={STUDIO_TOOLTIPS.fourDSandbox} onClick={() => run("send")}>Send Sandbox Cue</ControlButton>
        <ControlButton icon={RadioTower} tooltip={STUDIO_TOOLTIPS.fourDSandbox} onClick={() => run("history")}>History</ControlButton>
      </div>
      <pre className="code">{JSON.stringify(result ?? withSafetyLocks({ studio: "4d_sandbox" }), null, 2)}</pre>
    </GlassPanel>
  );
}

function SettingsPanel({ settings, setSettings }: { settings: StudioSettings; setSettings: (s: StudioSettings) => void }) {
  const [draft, setDraft] = useState(settings);
  function persist() {
    const saved = saveSettings(safeStorage(), draft);
    setSettings(saved);
  }
  return (
    <GlassPanel title="Settings" subtitle="Configure API, folders, and safety mode. Raw secrets are not stored in plain text.">
      <div className="form-grid">
        <Field label="Mougle API Base URL" tooltip="Base URL for Mougle admin API. API calls use cookies/session credentials."><input value={draft.apiBaseUrl} onChange={(e) => setDraft({ ...draft, apiBaseUrl: e.target.value })} /></Field>
        <Field label="Login / Session Status" tooltip="Session-based access uses existing Mougle cookies. Token storage should use future keychain integration."><input value={draft.sessionMode} readOnly /></Field>
        <Field label="Download Folder" tooltip="Preferred download folder. Browser fallback uses normal browser downloads; native bridge can open Finder later."><input value={draft.downloadFolder} onChange={(e) => setDraft({ ...draft, downloadFolder: e.target.value })} /></Field>
        <Field label="Cinema 4D Script Folder" tooltip="Preferred local script folder for Cinema 4D exports."><input value={draft.cinema4DScriptFolder} onChange={(e) => setDraft({ ...draft, cinema4DScriptFolder: e.target.value })} /></Field>
        <Field label="Local Export Folder" tooltip="Preferred local export folder for manifests and packages."><input value={draft.exportFolder} onChange={(e) => setDraft({ ...draft, exportFolder: e.target.value })} /></Field>
        <Field label="Safety Mode" tooltip="Always locked. Live execution, real render, real 4D hardware, and publishing are disabled."><input value={draft.safetyMode} readOnly /></Field>
        <Field label="Token Storage" tooltip="Raw tokens are not stored in local storage. Future native builds should use Keychain."><input value={draft.tokenStoredInKeychain ? "Keychain" : "Cookie/session only"} readOnly /></Field>
      </div>
      <ControlButton icon={HardDrive} tooltip="Saves non-secret settings locally. Does not call Mougle API, Unreal, 4D hardware, or publishing." onClick={persist}>Save Settings</ControlButton>
    </GlassPanel>
  );
}

export default function App() {
  const [module, setModule] = useState<StudioModule>("dashboard");
  const [settings, setSettings] = useState<StudioSettings>(() => loadSettings(safeStorage()));
  const api = useApi(settings);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">M</div>
          <div>
            <strong>Mougle Studio Pro</strong>
            <span>3D/4D AI Production Control</span>
          </div>
        </div>
        <nav>
          {modules.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={module === item.id ? "active" : ""} onClick={() => setModule(item.id)}>
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="side-lock">
          <KeyRound size={15} />
          Safety mode locked
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <h1>{modules.find((m) => m.id === module)?.label}</h1>
            <p>Controller and preview app only. Draft/internal outputs remain locked.</p>
          </div>
          <SafetyBadges />
        </header>
        <div className="content">
          {module === "dashboard" && <Dashboard api={api} />}
          {module === "preview" && <PreviewStudio api={api} />}
          {module === "cinema4d" && <Cinema4DStudio api={api} settings={settings} />}
          {module === "newsroom" && <NewsroomCreator />}
          {module === "podcast" && <PodcastCreator />}
          {module === "avatar" && <AvatarStudio />}
          {module === "media" && <MediaStudio api={api} />}
          {module === "unreal" && <UnrealDryRun api={api} />}
          {module === "fourD" && <FourDSandbox api={api} />}
          {module === "settings" && <SettingsPanel settings={settings} setSettings={setSettings} />}
        </div>
      </main>
    </div>
  );
}
