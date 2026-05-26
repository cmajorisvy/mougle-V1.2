import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Brain,
  CheckCircle,
  ChevronRight,
  CircleHelp,
  Clock,
  Command,
  Cpu,
  Crown,
  Database,
  Dna,
  Eye,
  FileText,
  Film,
  Gavel,
  Globe,
  Heart,
  Keyboard,
  KeyRound,
  Layers,
  LifeBuoy,
  Loader2,
  LogOut,
  MessageSquare,
  RefreshCw,
  Radio,
  Settings,
  Share2,
  Shield,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { api, type AdminSafetyReport } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { AiOpsHeroCard } from "@/components/admin/AiOpsHeroCard";

type BadgeTone = "live" | "dryRun" | "manual" | "disabled" | "attention" | "admin" | "root";
type ZoneId =
  | "all"
  | "command"
  | "safety"
  | "agents"
  | "knowledge"
  | "media"
  | "news-room"
  | "podcast-room"
  | "debate-studio"
  | "production-house"
  | "studio-3d-4d"
  | "distribution"
  | "marketplace"
  | "operations";

type AdminLink = {
  label: string;
  href: string;
  status: BadgeTone;
  description: string;
  icon: typeof Shield;
  tooltip?: string;
};

type AdminZone = {
  id: Exclude<ZoneId, "all" | "command">;
  title: string;
  shortLabel: string;
  description: string;
  icon: typeof Shield;
  accent: string;
  links: AdminLink[];
};

type QueueItem = {
  title: string;
  description: string;
  href: string;
  status: BadgeTone;
  icon: typeof Shield;
};

type AdminMetricCardProps = {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Shield;
  tone: BadgeTone;
  tooltip?: string;
  trend?: { value: string; up: boolean };
};

// Default threshold for surfacing the shorts draft backlog in the dashboard priority queue.
// The live value is loaded from /api/admin/shorts/settings/draft-queue-threshold and editable
// by founders from the dashboard.
const SHORTS_DRAFT_QUEUE_THRESHOLD_DEFAULT = 5;

const badgeStyles: Record<BadgeTone, string> = {
  live: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  dryRun: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  manual: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  disabled: "border-zinc-400/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
  attention: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  admin: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  root: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
};

const badgeLabels: Record<BadgeTone, string> = {
  live: "Live",
  dryRun: "Dry run",
  manual: "Manual",
  disabled: "Disabled",
  attention: "Attention",
  admin: "Admin only",
  root: "Root only",
};

const badgeMeanings: Record<BadgeTone, string> = {
  live: "Actively running in production. Changes can affect users, agents, jobs, or money flow.",
  dryRun: "Simulating behavior without committing production changes. Safe to validate.",
  manual: "Requires a human to approve or execute the next step. Check ownership before acting.",
  disabled: "Intentionally turned off. Hover the badge to see why if available.",
  attention: "Operator should review soon. Sort these first in each zone.",
  admin: "Requires elevated staff permissions. Action will create an audit log entry.",
  root: "Founder-level / infrastructure-level access. Treat changes as high-impact.",
};

const zones: AdminZone[] = [
  {
    id: "safety",
    title: "Safety & Governance",
    shortLabel: "Safety",
    description: "Founder controls, policy gates, audit posture, and council governance.",
    icon: Shield,
    accent: "emerald",
    links: [
      { label: "Safe Mode", href: "/admin/safe-mode", status: "root", icon: Shield, description: "Manual pause controls for high-risk flows.", tooltip: "Safe mode is root-admin controlled and does not activate autonomously." },
      { label: "Council Governance", href: "/admin/council-governance", status: "dryRun", icon: Gavel, description: "Read-only council registry, package previews, Redaction Wall checks.", tooltip: "Council governance is static/read-only in this phase; no provider calls or publishing." },
      { label: "Risk Center", href: "/admin/risk-center", status: "admin", icon: AlertTriangle, description: "Operational risk, policy health, and attention signals." },
      { label: "Policy Governance", href: "/admin/policy-governance", status: "admin", icon: Settings, description: "Policy review surfaces and governance status." },
      { label: "Compliance", href: "/admin/compliance", status: "admin", icon: FileText, description: "Global compliance and legal safety review." },
    ],
  },
  {
    id: "agents",
    title: "Agents & Civilization",
    shortLabel: "Agents",
    description: "System agents, external sandbox access, costs, and civilization health.",
    icon: Bot,
    accent: "violet",
    links: [
      { label: "System Agents", href: "/admin/system-agents", status: "live", icon: Sparkles, description: "MOUGLE Chief Intelligence and specialist agent identities." },
      { label: "External Agents", href: "/admin/external-agents", status: "admin", icon: Bot, description: "Scoped sandbox keys and capability gates.", tooltip: "External-agent access is sandboxed, audited, and does not bypass normal user auth." },
      { label: "Civilization Health", href: "/admin/civilization-health", status: "live", icon: Heart, description: "Read-only UES, collapse risk, and correction capacity." },
      { label: "AI Cost Monitor", href: "/admin/ai-cost-monitor", status: "admin", icon: Activity, description: "Cost posture and operational usage protection." },
      { label: "Agent Cost Analytics", href: "/admin/agent-costs", status: "admin", icon: BarChart3, description: "Agent cost detail and optimization review." },
    ],
  },
  {
    id: "knowledge",
    title: "Knowledge & Truth",
    shortLabel: "Knowledge",
    description: "Knowledge graph, claims/evidence, source quality, and contribution identity.",
    icon: Database,
    accent: "blue",
    links: [
      { label: "Knowledge Graph", href: "/admin/knowledge-graph", status: "live", icon: Database, description: "Internal graph quality, source coverage, and manual sync status.", tooltip: "The public graph remains a separate public-safe projection." },
      { label: "Knowledge Economy", href: "/admin/knowledge-economy", status: "manual", icon: Dna, description: "Knowledge packets, Gluon contribution identity, GVI admin analysis.", tooltip: "Gluon is contribution identity/provenance, not money, payout, cashout, token, or wallet value." },
      { label: "Truth Alignment", href: "/admin/truth-alignment", status: "admin", icon: Brain, description: "Truth quality, consensus, disagreement, and evidence posture." },
      { label: "Knowledge Alignment", href: "/admin/knowledge-alignment", status: "admin", icon: Gavel, description: "Verified knowledge boundaries and alignment checks." },
      { label: "News Source Registry", href: "/admin/news-sources", status: "admin", icon: Database, description: "Global newsroom source registry (license, reliability, region). Unknown-license rows are excluded from the active pipeline." },
    ],
  },
  {
    id: "media",
    title: "Media & Content Pipeline",
    shortLabel: "Media",
    description: "News, debate, podcast, video, YouTube, and social packages.",
    icon: Film,
    accent: "pink",
    links: [
      { label: "News to Debate", href: "/admin/news-to-debate", status: "manual", icon: Radio, description: "Draft/internal topic packages for root-admin review." },
      { label: "Podcast Scripts", href: "/admin/podcast-scripts", status: "manual", icon: FileText, description: "Internal script packages; not public publishing." },
      { label: "Voice Jobs", href: "/admin/voice-jobs", status: "manual", icon: MessageSquare, description: "Manual audio generation jobs and mock fallback review." },
      { label: "Video Render", href: "/admin/video-render", status: "dryRun", icon: Film, description: "Avatar/video render planning only; no live provider calls." },
      { label: "Shorts Approval Queue", href: "/admin/shorts", status: "manual", icon: Film, description: "Review, edit, and approve auto-cut social shorts from broadcasts before publishing.", tooltip: "Draft shorts wait here until a root admin approves them. Count badge shows pending drafts." },
      { label: "YouTube Publishing", href: "/admin/youtube-publishing", status: "manual", icon: Globe, description: "Manual approval packages; no autonomous upload." },
      { label: "Social Distribution", href: "/admin/social-distribution", status: "manual", icon: Share2, description: "Manual/export-first distribution packages." },
      { label: "Live Studio", href: "/admin/live-studio", status: "manual", icon: Radio, description: "Admin-controlled debate studio; no autonomous live runner." },
    ],
  },
  // ────────────────────────────────────────────────────────────────────────────
  // T2 link-surfacing zones (2026-05-22).
  // These six zones are ADDITIVE alias/cross-link groupings. Every href below
  // already exists as a real route in client/src/App.tsx. No new routes, no
  // moves/renames, no backend/API changes, no safe-mode flag changes.
  // The existing "Media & Content Pipeline" zone above is preserved verbatim
  // as the compatibility section. See:
  //   docs/reports/NEWS_PODCAST_VIDEO_ADMIN_LINK_SURFACING_T2_REPORT.md
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: "news-room",
    title: "News Room Studio",
    shortLabel: "News Room",
    description: "Newsroom packages, broadcast briefs, screen director, playout queue, and news-shorts cutter (cross-links).",
    icon: Radio,
    accent: "rose",
    links: [
      { label: "News Source Registry", href: "/admin/news-sources", status: "admin", icon: Database, description: "Source registry (license, reliability, region). Unknown-license rows excluded from active pipeline.", tooltip: "Cross-link — primary home is the Knowledge & Truth zone." },
      { label: "News to Debate", href: "/admin/news-to-debate", status: "manual", icon: Radio, description: "Draft/internal topic packages for root-admin review.", tooltip: "Cross-link — primary home is Media & Content Pipeline. Also surfaced from Debate Studio." },
      { label: "Broadcast Briefs", href: "/admin/broadcast-briefs", status: "manual", icon: FileText, description: "Newsroom broadcast brief review queue." },
      { label: "Broadcasts Preview", href: "/admin/broadcasts", status: "dryRun", icon: Eye, description: "Internal broadcast preview surface (no live publishing)." },
      { label: "Newsroom Package (Viewer)", href: "/admin/newsroom-package", status: "admin", icon: Layers, description: "Read-only viewer for a verified newsroom data package.", tooltip: "Viewer surface (singular). Read-only inspection of one verified package. For editing, use Newsroom Packages (Editor)." },
      { label: "Newsroom Packages (Editor)", href: "/admin/newsroom-packages", status: "manual", icon: FileText, description: "Editor for newsroom data packages (list + draft edits).", tooltip: "Editor surface (plural). Lists packages and allows draft edits. For read-only inspection of a single package, use Newsroom Package (Viewer)." },
      { label: "Newsroom Playout Queue", href: "/admin/playout-queue", status: "manual", icon: Clock, description: "Newsroom playout queue review." },
      { label: "B-roll Plan Review", href: "/admin/broll-plan-review", status: "manual", icon: Film, description: "Review B-roll plans before any render is requested." },
      { label: "Anchor Modes", href: "/admin/anchor-modes", status: "admin", icon: Settings, description: "Anchor mode picker / configuration." },
      { label: "Autopilot Newsroom", href: "/admin/autopilot-newsroom", status: "dryRun", icon: Sparkles, description: "Autopilot newsroom configuration; dry-run posture." },
      { label: "Neural Newsroom & Virtual Screen Director", href: "/admin/neural-newsroom", status: "dryRun", icon: Brain, description: "Neural newsroom automation + broadcast-grade screen director (internal/draft, admin-only)." },
      { label: "Omni-Channel Audience", href: "/admin/omni-channel-audience", status: "admin", icon: Users, description: "Audience moderation audit + safety review (simulation-only sends)." },
      { label: "News Shorts Cutter (Approval Queue)", href: "/admin/shorts", status: "manual", icon: Film, description: "Approve auto-cut news shorts before publishing.", tooltip: "Cross-link — primary home is Media & Content Pipeline. Same manual approval queue; root admin must approve each draft before publishing." },
    ],
  },
  {
    id: "podcast-room",
    title: "Podcast Room Studio",
    shortLabel: "Podcast Room",
    description: "Podcast script packages, voice jobs, and clip references (cross-links). Dedicated podcast-room page not yet built.",
    icon: MessageSquare,
    accent: "indigo",
    links: [
      { label: "Podcast Scripts", href: "/admin/podcast-scripts", status: "manual", icon: FileText, description: "Internal script packages; not public publishing.", tooltip: "Cross-link — primary home is Media & Content Pipeline." },
      { label: "Voice Jobs", href: "/admin/voice-jobs", status: "manual", icon: MessageSquare, description: "Manual audio generation jobs and mock fallback review.", tooltip: "Cross-link — shared with Production House when used by anchors/avatars." },
      { label: "Video Render (podcast video)", href: "/admin/video-render", status: "dryRun", icon: Film, description: "Avatar/video render planning only; no live provider calls.", tooltip: "Cross-link — shared with Production House and 3D/4D/Unreal." },
      { label: "Podcast Shorts (Approval Queue)", href: "/admin/shorts", status: "manual", icon: Film, description: "Approve auto-cut podcast clips before publishing.", tooltip: "Cross-link — primary home is Media & Content Pipeline. Same manual approval queue; root admin must approve each draft before publishing." },
      { label: "Debate Reference (News to Debate)", href: "/admin/news-to-debate", status: "manual", icon: Radio, description: "Use debate/discussion topic packages as podcast reference material.", tooltip: "Cross-link — primary home is Media & Content Pipeline." },
    ],
  },
  {
    id: "debate-studio",
    title: "Debate Studio",
    shortLabel: "Debate",
    description: "Debate topic packages, council governance, live studio, and debate clips (cross-links).",
    icon: Gavel,
    accent: "purple",
    links: [
      { label: "News to Debate", href: "/admin/news-to-debate", status: "manual", icon: Radio, description: "Draft/internal topic packages for root-admin review.", tooltip: "Cross-link — primary home is Media & Content Pipeline." },
      { label: "Live Studio", href: "/admin/live-studio", status: "manual", icon: Radio, description: "Admin-controlled debate studio; no autonomous live runner.", tooltip: "Cross-link — primary home is Media & Content Pipeline. Public companion route /live-studio/:id is unchanged." },
      { label: "Council Governance", href: "/admin/council-governance", status: "dryRun", icon: Gavel, description: "Read-only council registry, package previews, Redaction Wall checks.", tooltip: "Cross-link — primary home is Safety & Governance." },
      { label: "Debate Shorts (Approval Queue)", href: "/admin/shorts", status: "manual", icon: Film, description: "Approve auto-cut debate clips before publishing.", tooltip: "Cross-link — primary home is Media & Content Pipeline. Same manual approval queue; root admin must approve each draft before publishing." },
      { label: "Video Render (debate video)", href: "/admin/video-render", status: "dryRun", icon: Film, description: "Avatar/video render planning only; no live provider calls.", tooltip: "Cross-link — shared with Production House and 3D/4D/Unreal." },
    ],
  },
  {
    id: "production-house",
    title: "Production House",
    shortLabel: "Production",
    description: "Production console, preview studio, render planning, voice/avatar jobs, AI worker pool, and build readiness.",
    icon: Layers,
    accent: "teal",
    links: [
      { label: "Production House Console", href: "/admin/production-house", status: "admin", icon: Layers, description: "Production House operations console (preview studio, asset library, readiness center, approval board)." },
      { label: "Video Render", href: "/admin/video-render", status: "dryRun", icon: Film, description: "Avatar/video render planning only; no live provider calls.", tooltip: "Cross-link — primary home is Media & Content Pipeline." },
      { label: "Voice Jobs", href: "/admin/voice-jobs", status: "manual", icon: MessageSquare, description: "Manual audio generation jobs and mock fallback review.", tooltip: "Cross-link — shared with Podcast Room Studio." },
      { label: "AI Jobs", href: "/admin/ai-jobs", status: "admin", icon: Activity, description: "AI job monitor — render, voice, script, and broadcast workers." },
      { label: "AI Workers", href: "/admin/ai-workers", status: "admin", icon: Bot, description: "AI worker pool status and capacity." },
      { label: "AI Ops", href: "/admin/ai-ops", status: "admin", icon: Activity, description: "AI operations overview." },
      { label: "AI Retention", href: "/admin/ai-retention", status: "admin", icon: Database, description: "AI data retention and pruning posture." },
      { label: "Build Queue / Readiness", href: "/admin/build-queue", status: "dryRun", icon: Settings, description: "Readiness queue and build-status monitoring.", tooltip: "Cross-link — primary home is Operations." },
    ],
  },
  {
    id: "studio-3d-4d",
    title: "3D / 4D / Unreal",
    shortLabel: "3D/4D",
    description: "Cinema 4D control, virtual screen director simulation, 4D sandbox. Dry-run only — no live hardware execution.",
    icon: Sparkles,
    accent: "fuchsia",
    links: [
      { label: "4D Cinema Control (primary)", href: "/admin/4d-cinema-control", status: "dryRun", icon: Sparkles, description: "Cinema 4D control surface (primary route). Dry-run / planning only; no live hardware execution.", tooltip: "Primary route. Intentional alias /admin/cinema-control resolves to the same CinemaControl component — both kept as compatibility entry points." },
      { label: "Cinema Control (alias)", href: "/admin/cinema-control", status: "dryRun", icon: Sparkles, description: "Compatibility alias route — same Cinema 4D control component as /admin/4d-cinema-control.", tooltip: "Compatibility alias. Same CinemaControl component as /admin/4d-cinema-control; both routes are intentional and kept side-by-side. Dry-run / planning only; no live hardware execution." },
      { label: "Virtual Screen Director Simulation", href: "/admin/neural-newsroom", status: "dryRun", icon: Eye, description: "Broadcast-grade virtual screen director simulation surface.", tooltip: "Cross-link — primary home is News Room Studio. Used here as the 3D/4D screen simulation entry." },
      { label: "Production House (assets/avatars)", href: "/admin/production-house", status: "admin", icon: Layers, description: "Asset library + avatar / asset references used by 3D/4D pipeline.", tooltip: "Cross-link — primary home is Production House." },
      { label: "Video Render (3D/4D planning)", href: "/admin/video-render", status: "dryRun", icon: Film, description: "Avatar/video render planning only; no live provider calls.", tooltip: "Cross-link — shared with Production House and the studios." },
      { label: "R3F Preview Sandbox", href: "/admin/r3f-preview-sandbox", status: "dryRun", icon: Sparkles, description: "Browser-only R3F sandbox for safe 3D preview experiments. No assets, no render, no public output.", tooltip: "Admin-only R3F v9 + drei sandbox. Dry-run / admin-only. No provider calls, no render execution, no Unreal, no 4D hardware, no publishing." },
      { label: "Avatar Rig Visual Preview", href: "/admin/avatar-rig-preview", status: "dryRun", icon: Sparkles, description: "Admin-only static visual preview of a humanoid avatar rig (T-pose / A-pose toggle). Visual only — no provider, no voice, no video.", tooltip: "R7 admin-only avatar rig visual preview. Loads a local committed demo GLB (~1.4 KB, internal_only). No HeyGen / ElevenLabs / Runway / avatar-as-a-service, no voice generation, no video generation, no lip-sync, no render execution, no publishing." },
      { label: "3D Asset Library", href: "/admin/3d-assets", status: "admin", icon: Layers, description: "Admin-only catalog of GLB / GLTF assets with license + safety + approval lifecycle. No public URLs, no signed URL persisted, no render execution.", tooltip: "R5C asset library. Admin-only. Private storage. publicUrl always null in this phase; signed preview URLs are ephemeral (≤15 min) and never persisted." },
      { label: "Permanent Avatars", href: "/admin/permanent-avatars", status: "admin", icon: Layers, description: "Admin-only library of permanent avatars. Each avatar binds one approved body asset and one approved rig with identity / persona / default-room metadata. No public URLs, no provider calls, no render or publish.", tooltip: "R7B permanent-avatar library. Admin-only. Pair-validity gate, identity + safety review, ephemeral signed preview bundle (≤15 min, never persisted). No approved_public state; no HeyGen / ElevenLabs / Meshy / Runway / Unity / Unreal calls." },
      { label: "Virtual Set Preview", href: "/admin/virtual-set-preview", status: "dryRun", icon: Sparkles, description: "Admin-only static composer for newsroom / podcast / debate sets. Read-only consumer of approved-internal 3D assets. No data binding, no render, no publishing.", tooltip: "R6B static prototype. Admin-only. Manifests live in code (one per set type). Uses R5H signed-preview URLs (TTL ≤15 min, never persisted). Missing slots fall back to labeled placeholder cubes." },
      { label: "Unity WebGL Sandbox", href: "/admin/unity-webgl-sandbox", status: "dryRun", icon: Cpu, description: "Admin-only sandboxed iframe slot for a future Unity WebGL build. Same-origin only, strict sandbox attribute, postMessage allow-list. No public surface.", tooltip: "R8 sandbox shell. Admin-only. iframe sandbox=\"allow-scripts allow-same-origin\" only — no popups / top-nav / forms. No Unity build is committed; placeholder until a founder drops one in." },
    ],
  },
  {
    id: "distribution",
    title: "Distribution",
    shortLabel: "Distribution",
    description: "Shorts approval, YouTube approval packages, social export-first packages, social hub, and growth/SEO surfaces.",
    icon: Share2,
    accent: "orange",
    links: [
      { label: "Shorts Approval Queue", href: "/admin/shorts", status: "manual", icon: Film, description: "Review, edit, and approve auto-cut social shorts from broadcasts before publishing.", tooltip: "Cross-link — primary home is Media & Content Pipeline. Same manual approval queue; root admin must approve each draft before publishing." },
      { label: "YouTube Publishing", href: "/admin/youtube-publishing", status: "manual", icon: Globe, description: "Manual approval packages; no autonomous upload.", tooltip: "Cross-link — primary home is Media & Content Pipeline. Gated by pauseYouTubeUploads safe-mode flag." },
      { label: "Social Distribution", href: "/admin/social-distribution", status: "manual", icon: Share2, description: "Manual/export-first distribution packages.", tooltip: "Cross-link — primary home is Media & Content Pipeline. Gated by pauseSocialDistributionAutomation safe-mode flag." },
      { label: "Social Distribution Hub", href: "/admin/social-hub", status: "admin", icon: Share2, description: "Social distribution hub configuration, channel registry, and analytics." },
      { label: "Marketing", href: "/admin/marketing", status: "admin", icon: FileText, description: "Marketing operations and content surfaces.", tooltip: "Cross-link — primary home is Operations." },
      { label: "SEO", href: "/admin/seo", status: "admin", icon: Globe, description: "SEO health and knowledge visibility surfaces.", tooltip: "Cross-link — primary home is Operations." },
      { label: "Growth Autopilot", href: "/admin/growth-autopilot", status: "admin", icon: Zap, description: "Automated growth orchestration overview." },
      { label: "Authority Flywheel", href: "/admin/authority-flywheel", status: "admin", icon: Activity, description: "Authority growth metrics (knowledge assets, creators, organic traffic)." },
    ],
  },
  {
    id: "marketplace",
    title: "Marketplace & Economy",
    shortLabel: "Marketplace",
    description: "Safe clone review, compute credits, and founder revenue analytics.",
    icon: TrendingUp,
    accent: "amber",
    links: [
      { label: "Marketplace Clones", href: "/admin/marketplace-clones", status: "manual", icon: Shield, description: "Safe-clone package review, sandbox previews, memory export checks.", tooltip: "Marketplace clone flow is sandbox/review only; checkout and production deployment remain disabled." },
      { label: "Revenue Analytics", href: "/admin/revenue", status: "admin", icon: TrendingUp, description: "Compute credits, subscriptions, and billing analytics." },
      { label: "Revenue Flywheel", href: "/admin/flywheel", status: "admin", icon: Zap, description: "Revenue flywheel data and economics review." },
      { label: "AI CFO", href: "/admin/ai-cfo", status: "admin", icon: Crown, description: "Founder finance analysis for current billing systems." },
    ],
  },
  {
    id: "operations",
    title: "Operations",
    shortLabel: "Operations",
    description: "Support, staff permissions, work queues, marketing, SEO, and system health.",
    icon: Activity,
    accent: "cyan",
    links: [
      { label: "Support", href: "/admin/support", status: "live", icon: MessageSquare, description: "Support tickets and operations workflows." },
      { label: "Staff Permissions", href: "/admin/staff", status: "root", icon: Users, description: "Staff roles, permissions, and restricted admin access." },
      { label: "Operations Center", href: "/admin/operations", status: "admin", icon: Activity, description: "Operational queues and admin work surface." },
      { label: "Founder Workday", href: "/admin/workday", status: "admin", icon: Clock, description: "Founder review rhythm and day-plan surface." },
      { label: "Build Queue", href: "/admin/build-queue", status: "dryRun", icon: Settings, description: "Readiness queue and build-status monitoring." },
      { label: "Marketing", href: "/admin/marketing", status: "admin", icon: FileText, description: "Marketing operations and content surfaces." },
      { label: "SEO", href: "/admin/seo", status: "admin", icon: Globe, description: "SEO health and knowledge visibility surfaces." },
      { label: "Cost Control", href: "/admin/cost-control", status: "root", icon: Settings, description: "Spend gate for B-roll, broadcast render, anchor, and shorts. Pause paid APIs and review cost events.", tooltip: "Centralized canSpend gate. Defaults are conservative — paid APIs paused on bootstrap." },
    ],
  },
];

const commandLinks: AdminLink[] = [
  { label: "Founder Control", href: "/admin/founder-control", status: "root", icon: Crown, description: "Root-admin control plane for sensitive platform decisions.", tooltip: "Privileged area. Treat all changes as high-impact." },
  { label: "Founder PTO Mode", href: "/admin/founder-pto-mode", status: "root", icon: Crown, description: "Mute every enrolled notifier at once during planned PTO.", tooltip: "Adds an extra mute on top of per-notifier snoozes." },
  { label: "Command Center", href: "/admin/command-center", status: "root", icon: Activity, description: "Focused command operations for founder review." },
  { label: "Digital World", href: "/admin/digital-world", status: "live", icon: Globe, description: "Read-only 2D civilization zone overview." },
  { label: "Debug Console", href: "/admin/debug", status: "root", icon: Settings, description: "Founder-only diagnostics; not a public product surface.", tooltip: "Use only when a runbook or senior operator directs you here." },
];

function AdminStatusBadge({ tone, withTooltip = true }: { tone: BadgeTone; withTooltip?: boolean }) {
  const pill = (
    <Badge
      variant="outline"
      data-testid={`badge-status-${tone}`}
      className={cn(
        "rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums",
        badgeStyles[tone]
      )}
    >
      {badgeLabels[tone]}
    </Badge>
  );
  if (!withTooltip) return pill;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{pill}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] break-words">
        <p className="font-semibold capitalize">{badgeLabels[tone]}</p>
        <p className="opacity-80">{badgeMeanings[tone]}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function LoadingState({ label = "Loading command center..." }: { label?: string }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-border/60 bg-card/50">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        {label}
      </div>
    </div>
  );
}

function AdminMetricCard({ label, value, detail, icon: Icon, tone, tooltip, trend }: AdminMetricCardProps) {
  const stringValue = typeof value === "string" ? value : String(value);
  // Long string values (status labels, slugs like "internal_admin_preview") get a smaller,
  // single-line truncated render so they don't push the status badge off the card.
  // Threshold 14 leaves headroom for typical numeric metrics like "100,000,000".
  const isLongLabel = stringValue.length > 14;
  return (
    <Card
      data-testid={`card-metric-${label.toLowerCase().replace(/\s+/g, '-')}`}
      data-theme-surface
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur transition-all hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border/60 bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
            {isLongLabel ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <p tabIndex={0} className="mt-0.5 truncate rounded text-base font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{stringValue}</p>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="font-semibold">{label}</p>
                  <p className="opacity-80 break-all">{stringValue}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <p className="mt-0.5 truncate text-2xl font-semibold tabular-nums text-foreground">{stringValue}</p>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <AdminStatusBadge tone={tone} />
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label={`More info about ${label}`}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                  data-testid={`info-metric-${label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <CircleHelp className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold">{label}</p>
                <p className="opacity-80">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{detail}</p>
      {trend && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 tabular-nums font-medium",
            trend.up ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/10 text-rose-700 dark:text-rose-300"
          )}>
            {trend.up ? "↑" : "↓"} {trend.value}
          </span>
          <span className="text-muted-foreground">last 24h</span>
        </div>
      )}
    </Card>
  );
}

function AdminLinkCard({ item, badge }: { item: AdminLink; badge?: React.ReactNode }) {
  const [, navigate] = useLocation();
  const Icon = item.icon;
  const tooltipBody = item.tooltip ?? `Open ${item.label}. ${item.description}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card
          role="link"
          tabIndex={0}
          onClick={() => navigate(item.href)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigate(item.href);
            }
          }}
          data-testid={`card-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
          data-theme-surface
          className={cn(
            "group flex h-full cursor-pointer flex-col rounded-xl border border-border/60 bg-card/70 p-4 backdrop-blur",
            "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card hover:shadow-lg",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border/60 bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{item.label}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <AdminStatusBadge tone={item.status} withTooltip={false} />
                  {badge}
                </div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 flex-shrink-0 translate-x-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
          </div>
          <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
        </Card>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px]">
        <p className="font-semibold">{item.label}</p>
        <p className="opacity-80">{tooltipBody}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function ZoneTabs({ active, onChange, attentionCount }: { active: ZoneId; onChange: (id: ZoneId) => void; attentionCount: number }) {
  const tabs: { id: ZoneId; label: string; icon: typeof Shield }[] = [
    { id: "all", label: "All zones", icon: Layers },
    ...zones.map((z) => ({ id: z.id as ZoneId, label: z.shortLabel, icon: z.icon })),
  ];

  return (
    <div className="sticky top-[64px] z-30 -mx-4 mb-2 border-b border-border/60 bg-background/85 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto scrollbar-thin">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          const showBadge = tab.id === "all" && attentionCount > 0;
          return (
            <Tooltip key={tab.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onChange(tab.id)}
                  data-testid={`tab-zone-${tab.id}`}
                  className={cn(
                    "relative inline-flex h-9 flex-shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                  {showBadge && (
                    <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                      {attentionCount}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {tab.id === "all" ? (
                  <>
                    <p className="font-semibold">All zones</p>
                    <p className="opacity-80">Show every zone with the priority queue at the top.</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">{tab.label}</p>
                    <p className="opacity-80">Filter the dashboard to this zone only.</p>
                  </>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

function AdminQueueCard({ title, description, href, status, icon: Icon }: QueueItem) {
  const [, navigate] = useLocation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card
          role="link"
          tabIndex={0}
          onClick={() => navigate(href)}
          onKeyDown={(e) => { if (e.key === "Enter") navigate(href); }}
          data-testid={`card-queue-${title.toLowerCase().slice(0, 30).replace(/\s+/g, '-')}`}
          data-theme-surface
          className="group cursor-pointer rounded-xl border border-border/60 bg-card/70 p-4 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border/60 bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                  <AdminStatusBadge tone={status} withTooltip={false} />
                </div>
                <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </Card>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px]">
        <p className="font-semibold">Open priority item</p>
        <p className="opacity-80">{title}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function useShortsDraftCount(enabled: boolean) {
  return useQuery<{ ok: true; shorts: unknown[] }>({
    queryKey: ["/api/admin/shorts", "draft"],
    queryFn: async () => {
      const r = await fetch("/api/admin/shorts?status=draft", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load shorts drafts");
      return r.json();
    },
    enabled,
    staleTime: 30_000,
  });
}

type ShortsDraftQueueThresholdResponse = {
  ok: true;
  threshold: number;
  default: number;
};

function useShortsDraftQueueThreshold(enabled: boolean) {
  return useQuery<ShortsDraftQueueThresholdResponse>({
    queryKey: ["/api/admin/shorts/settings/draft-queue-threshold"],
    queryFn: async () => {
      const r = await fetch("/api/admin/shorts/settings/draft-queue-threshold", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load shorts draft queue threshold");
      return r.json();
    },
    enabled,
    staleTime: 60_000,
  });
}

function ShortsDraftQueueThresholdEditor({
  currentThreshold,
  defaultThreshold,
  shortsDraftCount,
}: {
  currentThreshold: number;
  defaultThreshold: number;
  shortsDraftCount: number;
}) {
  const [value, setValue] = useState<string>(String(currentThreshold));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(String(currentThreshold));
  }, [currentThreshold]);

  const mutation = useMutation({
    mutationFn: async (threshold: number) => {
      const r = await fetch("/api/admin/shorts/settings/draft-queue-threshold", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        throw new Error(text || "Failed to save threshold");
      }
      return r.json() as Promise<{ ok: true; threshold: number }>;
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shorts/settings/draft-queue-threshold"] });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const parsed = Number.parseInt(value, 10);
  const isValid = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1000;
  const isDirty = isValid && parsed !== currentThreshold;

  return (
    <Card
      className="flex flex-col gap-3 border-border/60 bg-card/60 p-4 sm:flex-row sm:items-end sm:justify-between"
      data-testid="card-shorts-draft-queue-threshold"
    >
      <div className="space-y-1">
        <Label
          htmlFor="input-shorts-draft-queue-threshold"
          className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary"
        >
          Shorts approval backlog alert
        </Label>
        <p className="text-sm text-muted-foreground">
          Surface a priority-queue card when more than this many shorts are awaiting approval.
          Currently <span className="font-medium text-foreground" data-testid="text-shorts-draft-count">{shortsDraftCount}</span> drafts pending.
          Default is {defaultThreshold}.
        </p>
        {error ? (
          <p className="text-xs text-rose-500" data-testid="text-shorts-draft-queue-threshold-error">
            {error}
          </p>
        ) : null}
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isValid || !isDirty || mutation.isPending) return;
          mutation.mutate(parsed);
        }}
      >
        <Input
          id="input-shorts-draft-queue-threshold"
          data-testid="input-shorts-draft-queue-threshold"
          type="number"
          inputMode="numeric"
          min={0}
          max={1000}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-24 tabular-nums"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!isValid || !isDirty || mutation.isPending}
          data-testid="button-save-shorts-draft-queue-threshold"
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </form>
    </Card>
  );
}

function ShortsDraftBadge({ count, isLoading }: { count: number | undefined; isLoading: boolean }) {
  if (isLoading || count === undefined) return null;
  if (count <= 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          data-testid="badge-shorts-draft-count"
          className={cn(
            "rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums",
            badgeStyles.attention
          )}
        >
          {count} pending
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px] break-words">
        <p className="font-semibold">Shorts awaiting approval</p>
        <p className="opacity-80">Open the Shorts Approval Queue to review, edit, and approve drafts.</p>
      </TooltipContent>
    </Tooltip>
  );
}

function ZoneSection({ zone }: { zone: AdminZone }) {
  const Icon = zone.icon;
  const hasShorts = zone.links.some((l) => l.href === "/admin/shorts");
  const shortsQuery = useShortsDraftCount(hasShorts);
  const shortsBadge = (
    <ShortsDraftBadge
      count={shortsQuery.data?.shorts?.length}
      isLoading={shortsQuery.isLoading}
    />
  );
  return (
    <section id={zone.id} className="scroll-mt-32 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-border/60 bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-foreground">{zone.title}</h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label={`About ${zone.title}`}
                  className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-border/60 text-[10px] text-muted-foreground hover:border-primary hover:text-primary"
                >
                  ?
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px] break-words">
                <p className="font-semibold">{zone.title}</p>
                <p className="opacity-80">{zone.description}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{zone.description}</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {zone.links.map((item) => (
          <AdminLinkCard
            key={item.href}
            item={item}
            badge={item.href === "/admin/shorts" ? shortsBadge : undefined}
          />
        ))}
      </div>
    </section>
  );
}

function HowMougleWorksSection() {
  const sections = [
    {
      id: "start",
      icon: Sparkles,
      title: "Getting started in 60 seconds",
      bullets: [
        "Look at the hero — confirm Production is live, Safety policy is active, and there are no critical attention items.",
        "Use the six zone tabs to narrow the dashboard: Safety, Agents, Knowledge, Media, Marketplace, or Operations.",
        "Press ⌘K (or Ctrl+K) to jump to any agent, policy, content job, listing, or log.",
        "Open 'Review attention queue' before making changes — unresolved alerts come first.",
        "Founder/root quick-links are privileged. If you don't have permission, browse only.",
      ],
    },
    {
      id: "badges",
      icon: Shield,
      title: "Reading status badges",
      bullets: Object.entries(badgeMeanings).map(([k, v]) => `${badgeLabels[k as BadgeTone]} — ${v}`),
    },
    {
      id: "routine",
      icon: Clock,
      title: "Daily routine for new staff",
      bullets: [
        "1. Safety & Governance — blocked actions, policy violations, pending approvals, new attention badges.",
        "2. Operations — failed jobs, degraded infra, queue backlog, latency spikes, scheduled maintenance.",
        "3. Agents & Civilization — runaway loops, paused agents, abnormal activity, intervention requests.",
        "4. Knowledge & Truth — low-confidence sources, outdated facts, contradictions, ingestion failures.",
        "5. Media & Content Pipeline — stuck generations, failed renders, moderation holds, publishing delays.",
        "6. Marketplace & Economy — payment issues, suspicious transactions, listing problems.",
        "7. End the shift — open the audit log and verify your own changes were recorded correctly.",
      ],
    },
    {
      id: "shortcuts",
      icon: Keyboard,
      title: "Keyboard shortcuts",
      bullets: [
        "⌘K / Ctrl+K — open global search",
        "G then S — Safety & Governance",
        "G then A — Agents & Civilization",
        "G then K — Knowledge & Truth",
        "G then M — Media & Content Pipeline",
        "G then E — Marketplace & Economy",
        "G then O — Operations",
        "R — refresh visible dashboard data (does not restart jobs)",
        "?  — open this operating guide",
      ],
    },
    {
      id: "tasks",
      icon: BookOpen,
      title: "Common tasks (How do I...)",
      bullets: [
        "Review safety issues → Safety & Governance → filter Attention → inspect policy reason → approve/reject/escalate.",
        "Pause an agent → Agents & Civilization → pick agent → Pause → add reason → verify status.",
        "Validate knowledge quality → Knowledge & Truth → sort by lowest confidence → mark contradictions.",
        "Restart a failed media job → Media & Content Pipeline → filter Failed → inspect error → retry in dryRun → then live.",
        "Investigate marketplace anomaly → Marketplace & Economy → filter Attention → inspect history → export audit packet.",
        "Debug infrastructure → Operations first; Debug Console only when a runbook tells you to.",
        "Find who changed something → Audit Log (top bar) → search resource → filter by actor or zone.",
      ],
    },
    {
      id: "limits",
      icon: ShieldAlert,
      title: "What this dashboard cannot do",
      bullets: [
        "Cannot guarantee an AI decision is correct — it shows confidence, policy state, logs, and approvals so humans can judge risk.",
        "Cannot bypass permission boundaries — admin and root actions still need the correct account role.",
        "Cannot undo every production action automatically — destructive actions need explicit confirmation.",
        "Cannot replace incident communication — for outages or safety issues, follow the incident process.",
        "Cannot make founder-level decisions — root areas are for authorized operators only.",
      ],
    },
    {
      id: "help",
      icon: LifeBuoy,
      title: "Need help?",
      bullets: [
        "Hover any control to see what it does before clicking.",
        "Press ? any time to reopen this guide.",
        "Open the Audit Log to understand recent changes before escalating.",
        "Safety concerns → escalate through Safety & Governance and tag the on-call safety owner.",
        "Outage / degraded infra → open Operations and follow the active incident runbook.",
        "Root/admin uncertainty → don't proceed. Ask a founder or senior operator and include resource ID, screenshot, and audit log link.",
      ],
    },
  ] as const;

  return (
    <section id="how-it-works" className="scroll-mt-32">
      <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-card/80 via-card/60 to-primary/[0.04] p-6 backdrop-blur" data-theme-surface>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">How Mougle Works</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                A practical operating guide for new staff. What each area controls, what the badges mean, and what to check before taking action.
              </p>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="self-start border-primary/30 bg-primary/10 text-primary">
                For staff & newcomers
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Newcomer-friendly guide. Hover any control on this dashboard for context.</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <Accordion type="multiple" defaultValue={["start", "badges"]} className="space-y-2">
          {sections.map((s) => {
            const Icon = s.icon;
            const previewCount = s.bullets.length;
            return (
              <AccordionItem
                key={s.id}
                value={s.id}
                className="overflow-hidden rounded-xl border border-border/60 bg-card/60 px-4 backdrop-blur"
                data-testid={`accordion-howto-${s.id}`}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AccordionTrigger className="py-3 text-left hover:no-underline">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="text-sm font-semibold text-foreground">{s.title}</span>
                      </div>
                    </AccordionTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="font-semibold">{s.title}</p>
                    <p className="opacity-80">Click to expand · {previewCount} item{previewCount === 1 ? "" : "s"}</p>
                  </TooltipContent>
                </Tooltip>
                <AccordionContent className="pb-4 pl-11 pr-2">
                  <ul className="space-y-2">
                    {s.bullets.map((b, i) => (
                      <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                        <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary/70" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { icon: KeyRound, title: "Permissions matter", body: "Admin and root actions stay gated. The dashboard surfaces what you can do — it doesn't elevate your role." },
            { icon: Eye, title: "Read first, act second", body: "Every card has a tooltip and description. Hover before clicking, especially in privileged zones." },
            { icon: LifeBuoy, title: "When unsure, ask", body: "If a destination isn't clearly explained or a status looks wrong, escalate with the resource ID and a screenshot." },
          ].map((tip) => (
            <Card key={tip.title} className="rounded-xl border-border/60 bg-card/60 p-4" data-theme-surface>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <tip.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{tip.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tip.body}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown";
  const diffSec = Math.round((Date.now() - t) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}

function SafetyReportCard({
  query,
}: {
  query: ReturnType<typeof useQuery<AdminSafetyReport>>;
}) {
  const { data, isLoading, isError, error, refetch, isFetching } = query;
  const failingGates = (data?.gates || []).filter((g) => g.status === "FAIL");
  const allPassing = data?.allPassing ?? false;
  const tone = isError
    ? "attention"
    : allPassing
      ? "live"
      : "attention";
  const toneClasses =
    tone === "live"
      ? "border-emerald-500/30 bg-emerald-500/[0.04]"
      : "border-rose-500/40 bg-rose-500/[0.05]";
  const accentText =
    tone === "live"
      ? "text-emerald-600 dark:text-emerald-300"
      : "text-rose-600 dark:text-rose-300";

  return (
    <Card
      data-testid="card-safety-report"
      data-theme-surface
      className={cn("rounded-2xl p-5", toneClasses)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border bg-background/40",
              tone === "live"
                ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-300"
                : "border-rose-500/40 text-rose-600 dark:text-rose-300",
            )}
          >
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              Pipeline safety
            </p>
            <h3 className="mt-0.5 text-base font-semibold text-foreground">
              Newsroom safety gates
            </h3>
            <p className="mt-1 max-w-xl text-xs text-muted-foreground">
              Regenerated on every <code>npm test</code> run from{" "}
              <code>docs/SAFETY_E2E_REPORT.md</code>. Every gate must pass before release.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            data-testid="badge-safety-summary"
            className={cn(
              "text-[11px] font-semibold",
              tone === "live"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
            )}
          >
            {isLoading
              ? "Loading…"
              : isError
                ? "Report unavailable"
                : `${data?.passing ?? 0}/${data?.total ?? 0} passing`}
          </Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Refresh safety report"
                onClick={() => refetch()}
                disabled={isFetching}
                data-testid="button-refresh-safety-report"
                className="h-8 w-8 rounded-lg border border-border/40 bg-background/40 text-foreground/80 hover:bg-accent hover:text-accent-foreground"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-semibold">Re-read the latest report</p>
              <p className="opacity-80">Reads docs/SAFETY_E2E_REPORT.md from disk. Does not run the suite.</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading latest safety report…
        </div>
      ) : isError ? (
        <p
          data-testid="text-safety-error"
          className="mt-4 text-xs text-rose-600 dark:text-rose-300"
        >
          Could not load safety report: {(error as Error | undefined)?.message || "unknown error"}.
          Run <code>npm test</code> to regenerate <code>docs/SAFETY_E2E_REPORT.md</code>.
        </p>
      ) : data ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/50 bg-background/40 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </p>
              <p
                data-testid="text-safety-status"
                className={cn("mt-1 text-sm font-semibold", accentText)}
              >
                {allPassing ? "All gates passing" : `${failingGates.length} gate${failingGates.length === 1 ? "" : "s"} failing`}
              </p>
            </div>
            <div className="rounded-lg border border-border/50 bg-background/40 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Last test run
              </p>
              <p
                data-testid="text-safety-generated-at"
                className="mt-1 text-sm font-medium text-foreground"
                title={data.generatedAtIso || undefined}
              >
                {formatRelativeTime(data.generatedAtIso)}
              </p>
            </div>
            <div className="rounded-lg border border-border/50 bg-background/40 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Report file
              </p>
              <p
                data-testid="text-safety-file-modified"
                className="mt-1 text-sm font-medium text-foreground"
                title={data.fileModifiedAt}
              >
                touched {formatRelativeTime(data.fileModifiedAt)}
              </p>
            </div>
          </div>

          {failingGates.length > 0 && (
            <div
              data-testid="list-safety-failing-gates"
              className="mt-4 space-y-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                Failing gates — release blocked
              </p>
              <ul className="space-y-1.5">
                {failingGates.map((gate) => (
                  <li
                    key={gate.id}
                    data-testid={`safety-failing-gate-${gate.name}`}
                    className="text-xs text-rose-700 dark:text-rose-200"
                  >
                    <span className="font-mono font-semibold">#{gate.id} {gate.name}</span>
                    <span className="ml-2 opacity-80">{gate.details}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="mt-4 group">
            <summary
              data-testid="toggle-safety-all-gates"
              className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Show all {data.gates.length} gates
            </summary>
            <ul className="mt-2 space-y-1.5">
              {data.gates.map((gate) => {
                const pass = gate.status === "PASS";
                return (
                  <li
                    key={gate.id}
                    data-testid={`safety-gate-${gate.name}`}
                    className={cn(
                      "flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs",
                      pass
                        ? "border-emerald-500/25 bg-emerald-500/[0.04] text-foreground"
                        : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 inline-flex h-4 min-w-[36px] items-center justify-center rounded text-[10px] font-bold",
                        pass
                          ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                          : "bg-rose-500/20 text-rose-700 dark:text-rose-200",
                      )}
                    >
                      {pass ? "PASS" : "FAIL"}
                    </span>
                    <span className="flex-1">
                      <span className="font-mono font-semibold">#{gate.id} {gate.name}</span>
                      <span className="ml-2 text-muted-foreground">{gate.details}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>

          <div className="mt-4 flex flex-wrap gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={api.admin.safetyReportRawUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="link-safety-report-full"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  <FileText className="h-3.5 w-3.5" />
                  View full report
                  <ArrowRight className="h-3 w-3" />
                </a>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold">Open the raw Markdown report</p>
                <p className="opacity-80">Opens docs/SAFETY_E2E_REPORT.md in a new tab.</p>
              </TooltipContent>
            </Tooltip>
            <span className="inline-flex items-center text-[11px] text-muted-foreground">
              Source: <code className="ml-1">{data.rawPath}</code>
            </span>
          </div>
        </>
      ) : null}
    </Card>
  );
}

function formatNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value.toLocaleString();
  return "0";
}

export default function AdminDashboard() {
  const { admin, isLoading, isAuthenticated } = useAdminAuth();
  const [, navigate] = useLocation();
  const [activeZone, setActiveZone] = useState<ZoneId>("all");
  const [refreshing, setRefreshing] = useState(false);

  const isMainAdmin = (admin?.actor?.type === "root_admin" && admin.role === "super_admin")
    || (admin?.actor?.type === "staff" && admin.role === "admin" && admin.permissions.includes("*"));
  const canFetch = Boolean(isAuthenticated && isMainAdmin);

  const shortsDraftQuery = useShortsDraftCount(canFetch);
  const shortsDraftThresholdQuery = useShortsDraftQueueThreshold(canFetch);
  const statsQuery = useQuery({ queryKey: ["admin-stats"], queryFn: () => api.admin.stats(), enabled: canFetch, refetchInterval: 60_000 });
  const safeModeQuery = useQuery({ queryKey: ["admin-safe-mode"], queryFn: () => api.admin.safeMode(), enabled: canFetch, staleTime: 30_000 });
  const civilizationQuery = useQuery({ queryKey: ["admin-civilization-health"], queryFn: () => api.admin.civilizationHealth(), enabled: canFetch, staleTime: 60_000 });
  const graphQuery = useQuery({ queryKey: ["admin-knowledge-graph-summary"], queryFn: () => api.admin.knowledgeGraphSummary(), enabled: canFetch, staleTime: 60_000 });
  const councilQuery = useQuery({ queryKey: ["admin-council-governance-overview"], queryFn: () => api.admin.councilGovernanceOverview(), enabled: canFetch, staleTime: 60_000 });
  const safetyReportQuery = useQuery<AdminSafetyReport>({ queryKey: ["admin-safety-report"], queryFn: () => api.admin.safetyReport(), enabled: canFetch, staleTime: 60_000, retry: false });

  useEffect(() => {
    if (!isLoading && isAuthenticated && !isMainAdmin) {
      navigate("/staff/dashboard", { replace: true });
    }
  }, [isAuthenticated, isLoading, isMainAdmin, navigate]);

  const handleLogout = async () => {
    await api.admin.logout().catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["admin-verify"] });
    navigate("/admin/login");
  };

  // Memoized so the keyboard shortcut effect captures a stable reference (avoids stale closure).
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      statsQuery.refetch(),
      safeModeQuery.refetch(),
      civilizationQuery.refetch(),
      graphQuery.refetch(),
      councilQuery.refetch(),
      shortsDraftQuery.refetch(),
      shortsDraftThresholdQuery.refetch(),
      safetyReportQuery.refetch(),
    ]).finally(() => setTimeout(() => setRefreshing(false), 700));
  }, [statsQuery, safeModeQuery, civilizationQuery, graphQuery, councilQuery, shortsDraftQuery, shortsDraftThresholdQuery, safetyReportQuery]);

  // Keyboard shortcuts: ? opens guide, R refreshes,
  // G + S/A/K/M/N/P/D/H/T/X/E/O navigates zones.
  //   S Safety | A Agents | K Knowledge | M Media (legacy)
  //   N News Room | P Podcast Room | D Debate Studio | H Production House
  //   T 3D/4D/Unreal (think "Theater") | X Distribution
  //   E Marketplace (Economy) | O Operations
  useEffect(() => {
    let prefix: string | null = null;
    let prefixTimer: ReturnType<typeof setTimeout> | null = null;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "?") { e.preventDefault(); document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" }); return; }
      if (k === "r") { e.preventDefault(); handleRefresh(); return; }
      if (k === "g" && !prefix) {
        prefix = "g";
        if (prefixTimer) clearTimeout(prefixTimer);
        prefixTimer = setTimeout(() => { prefix = null; }, 1200);
        return;
      }
      if (prefix === "g") {
        const map: Record<string, ZoneId> = {
          s: "safety",
          a: "agents",
          k: "knowledge",
          m: "media",
          n: "news-room",
          p: "podcast-room",
          d: "debate-studio",
          h: "production-house",
          t: "studio-3d-4d",
          x: "distribution",
          e: "marketplace",
          o: "operations",
        };
        if (map[k]) { setActiveZone(map[k]); document.getElementById(map[k])?.scrollIntoView({ behavior: "smooth" }); }
        prefix = null;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (prefixTimer) clearTimeout(prefixTimer); };
  }, [handleRefresh]);

  const stats = statsQuery.data;
  const safeModeControls = (safeModeQuery.data?.controls || {}) as Record<string, boolean>;
  const globalSafeMode = Boolean(safeModeControls.globalSafeMode);
  const blockedCapabilities = safeModeQuery.data?.blockedCapabilities?.filter((item) => item.blocked).length || 0;
  const civilizationScore = civilizationQuery.data?.summary?.displayScore || "N/A";
  const founderReviewNeeded = Boolean(civilizationQuery.data?.summary?.founderReviewNeeded);
  const graphQuality = graphQuery.data?.qualityScores?.overallGraphQuality;
  const graphQualityLabel = typeof graphQuality === "number" ? `${Math.round(graphQuality)}%` : "N/A";
  const councilStatus = councilQuery.data?.status || "admin preview";

  const shortsDraftCount = shortsDraftQuery.data?.shorts?.length ?? 0;
  const shortsDraftQueueThreshold =
    shortsDraftThresholdQuery.data?.threshold ?? SHORTS_DRAFT_QUEUE_THRESHOLD_DEFAULT;
  const shortsDraftQueueThresholdDefault =
    shortsDraftThresholdQuery.data?.default ?? SHORTS_DRAFT_QUEUE_THRESHOLD_DEFAULT;
  const queueItems: QueueItem[] = useMemo(() => {
    const items: QueueItem[] = [
      { title: globalSafeMode ? "Safe mode is active" : "Safe mode controls ready", description: globalSafeMode ? "Some capabilities are paused. Review the exact flags before changing operational posture." : "Manual root-admin controls are available. No autonomous safe-mode activation is shown here.", href: "/admin/safe-mode", status: globalSafeMode ? "attention" : "root", icon: Shield },
      { title: "Fresh Playwright sweep required", description: "Last master report used existing artifacts because the local server was not reachable. Run the Chrome sweep before release confidence.", href: "/admin/operations", status: "attention", icon: AlertTriangle },
      { title: "Media packages require manual approval", description: "News, podcast, video, YouTube, and social packages must stay manual/export-first until later gates are approved.", href: "/admin/youtube-publishing", status: "manual", icon: Film },
      { title: "Marketplace remains safe-clone sandbox", description: "Review clone packages and trust labels. Checkout, payout, and production deployment remain disabled.", href: "/admin/marketplace-clones", status: "manual", icon: Shield },
      { title: "Gluon is contribution identity only", description: "Knowledge economy review may show admin analysis, but Gluon must not be treated as cash, payout, token, shares, or wallet value.", href: "/admin/knowledge-economy", status: "disabled", icon: Dna },
      { title: "Council governance stays read-only", description: "The Redaction Wall, package contracts, and fake adapter previews are admin-only readiness tools, not provider execution.", href: "/admin/council-governance", status: "dryRun", icon: Gavel },
    ];
    if (shortsDraftCount > shortsDraftQueueThreshold) {
      items.unshift({
        title: `${shortsDraftCount} shorts awaiting approval`,
        description: `Draft backlog has passed ${shortsDraftQueueThreshold}. Open the Shorts Approval Queue to review, edit, and approve drafts before they pile up.`,
        href: "/admin/shorts",
        status: "attention",
        icon: Film,
      });
    }
    return items;
  }, [globalSafeMode, shortsDraftCount, shortsDraftQueueThreshold]);

  const attentionCount = queueItems.filter((i) => i.status === "attention").length;
  const visibleZones = activeZone === "all" || activeZone === "command" ? zones : zones.filter((z) => z.id === activeZone);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAuthenticated || !isMainAdmin) return null;

  return (
    <div className="min-h-screen bg-background text-foreground" data-theme-surface>
      {/* === TOP BAR === */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl" data-theme-surface>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <Crown className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 data-testid="text-admin-title" className="truncate text-base font-semibold text-foreground">Mougle Command Center</h1>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="hidden border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300 sm:inline-flex">
                      Production · Admin beta
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-semibold">Production environment</p>
                    <p className="opacity-80">You're viewing live data. Manual / dryRun / disabled labels indicate what cannot run automatically.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="hidden text-xs text-muted-foreground sm:block">Founder operations, safety, agents, knowledge, media, marketplace, and infrastructure</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Search hint (visual; opens future command palette) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-testid="button-command-search"
                  className="hidden h-9 items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:inline-flex"
                  onClick={() => alert("Global command search will land in the next release. Use zone tabs and keyboard shortcuts (G then letter) for now.")}
                >
                  <Command className="h-3.5 w-3.5" />
                  <span>Search</span>
                  <span className="ml-2 inline-flex"><Kbd>⌘K</Kbd></span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold">Global command search</p>
                <p className="opacity-80">Search agents, policies, jobs, listings, and logs (preview).</p>
              </TooltipContent>
            </Tooltip>

            {/* Refresh */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Refresh dashboard data"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  data-testid="button-refresh"
                  className="h-9 w-9 rounded-lg border border-border/40 bg-background/40 text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                >
                  <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold">Refresh dashboard</p>
                <p className="opacity-80">Refetches visible data. Does not restart jobs or agents.</p>
              </TooltipContent>
            </Tooltip>

            {/* Notifications (placeholder) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="Notifications" data-testid="button-notifications" className="relative h-9 w-9 rounded-lg border border-border/40 bg-background/40 text-foreground/80 hover:bg-accent hover:text-accent-foreground">
                  <Bell className="h-4 w-4" />
                  {attentionCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {attentionCount}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold">Attention items</p>
                <p className="opacity-80">{attentionCount} item{attentionCount === 1 ? "" : "s"} awaiting review.</p>
              </TooltipContent>
            </Tooltip>

            {/* Theme toggle */}
            <ThemeToggle />

            {/* View site */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="View public site" onClick={() => navigate("/")} data-testid="button-view-site" className="hidden h-9 w-9 rounded-lg border border-border/40 bg-background/40 text-foreground/80 hover:bg-accent hover:text-accent-foreground sm:inline-flex">
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold">Open public site</p>
                <p className="opacity-80">View Mougle the way users see it.</p>
              </TooltipContent>
            </Tooltip>

            {/* Logout */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="Sign out" onClick={handleLogout} data-testid="button-logout" className="h-9 w-9 rounded-lg border border-border/40 bg-background/40 text-foreground/80 hover:bg-rose-500/10 hover:text-rose-500">
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold">Sign out</p>
                <p className="opacity-80">End this admin session.</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      <ZoneTabs active={activeZone} onChange={setActiveZone} attentionCount={attentionCount} />

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <main className="space-y-8">
          {/* === HERO === */}
          <section className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
              <Card className="rounded-2xl border-border/60 bg-gradient-to-br from-card via-card to-primary/[0.05] p-6 shadow-sm" data-theme-surface>
                <div className="flex flex-wrap items-center gap-2">
                  <AdminStatusBadge tone={globalSafeMode ? "attention" : "live"} />
                  <AdminStatusBadge tone="manual" />
                  <AdminStatusBadge tone="dryRun" />
                  {attentionCount > 0 && (
                    <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-[11px] font-medium text-rose-700 dark:text-rose-300">
                      {attentionCount} attention item{attentionCount === 1 ? "" : "s"}
                    </Badge>
                  )}
                </div>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
                  Operate every Mougle surface from one calm screen.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Safety, agents, knowledge, media, marketplace, and operations — surfaced in one priority order.
                  Hover any control to learn what it does. Privileged areas are clearly labelled root or admin.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button onClick={() => document.getElementById("priority-queue")?.scrollIntoView({ behavior: "smooth" })} data-testid="button-review-queue" className="gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Review attention queue
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-semibold">Jump to priority queue</p>
                      <p className="opacity-80">Resolve attention items before routine work.</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })} data-testid="button-how-it-works" className="gap-2">
                        <BookOpen className="h-4 w-4" />
                        How this works
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-semibold">Open the operating guide</p>
                      <p className="opacity-80">Newcomer-friendly. Press <Kbd>?</Kbd> any time to reopen.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </Card>

              <Card className="rounded-2xl border-amber-500/25 bg-amber-500/[0.05] p-6" data-theme-surface>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Release caution</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Keep manual approval labels visible. Do not imply autonomous publishing,
                      real marketplace checkout, payouts, or Gluon financial value.
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground">Last data refresh: just now</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Founder/Root command strip */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {commandLinks.map((item) => (
                <AdminLinkCard key={item.href} item={item} />
              ))}
            </div>

            {/* Top metrics row */}
            {statsQuery.isLoading ? (
              <LoadingState />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <AdminMetricCard icon={Users} label="Users" value={formatNumber(stats?.totalUsers)} detail="Platform accounts and agent identities. User admin is intentionally minimal until the user ops surface is redesigned." tone="live" />
                <AdminMetricCard icon={Bot} label="Agents" value={formatNumber(stats?.totalAgents)} detail="System and user-agent activity must stay bounded by policy gates, cost limits, and memory separation." tone="admin" />
                <AdminMetricCard icon={Shield} label="Safe mode" value={globalSafeMode ? "Active" : "Ready"} detail={`${blockedCapabilities} capability group${blockedCapabilities === 1 ? "" : "s"} currently blocked.`} tone={globalSafeMode ? "attention" : "root"} tooltip="Safe mode is a root-admin manual control. This dashboard does not toggle it." />
                <AdminMetricCard icon={CheckCircle} label="E2E health" value="Rerun" detail="Existing artifacts found route and performance risks. Fresh Chrome run required after local server is active." tone="attention" />
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <AdminMetricCard icon={Heart} label="Civilization" value={civilizationScore} detail={founderReviewNeeded ? "Founder review is recommended by the health summary." : "Read-only civilization health is available for review."} tone={founderReviewNeeded ? "attention" : "live"} />
              <AdminMetricCard icon={Database} label="Graph quality" value={graphQualityLabel} detail="Internal graph quality and public-safe projection boundaries must remain separate." tone="admin" />
              <AdminMetricCard icon={Gavel} label="Council layer" value={councilStatus} detail="Council governance is static/read-only with package previews and policy boundaries." tone="dryRun" />
              <AdminMetricCard icon={Zap} label="Credits" value={formatNumber(stats?.economy?.totalCreditsCirculating)} detail="Compute credits and billing stay separate from Gluon contribution identity." tone="admin" />
            </div>

            {/* Pipeline safety (generated from npm test) */}
            <SafetyReportCard query={safetyReportQuery} />

            {/* AI operations health (compact) */}
            <AiOpsHeroCard />
          </section>

          {/* === PRIORITY QUEUE === */}
          <section id="priority-queue" className="scroll-mt-32 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Priority queue</p>
                <h2 className="mt-0.5 text-lg font-semibold text-foreground">Manual review and risk attention</h2>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  These cards are non-destructive links to review surfaces. They never execute risky actions on click.
                </p>
              </div>
            </div>
            <ShortsDraftQueueThresholdEditor
              currentThreshold={shortsDraftQueueThreshold}
              defaultThreshold={shortsDraftQueueThresholdDefault}
              shortsDraftCount={shortsDraftCount}
            />
            <div className="grid gap-3 lg:grid-cols-2">
              {queueItems.map((item) => (
                <AdminQueueCard key={item.title} {...item} />
              ))}
            </div>
          </section>

          {/* === ZONES === */}
          {visibleZones.map((zone) => (
            <ZoneSection key={zone.id} zone={zone} />
          ))}

          {/* === HOW IT WORKS === */}
          <HowMougleWorksSection />

          <footer className="pt-4 text-center text-xs text-muted-foreground">
            <p>
              Tip: press <Kbd>?</Kbd> to reopen the operating guide, <Kbd>R</Kbd> to refresh,
              or <Kbd>G</Kbd> then a zone letter (S / A / K / M / E / O) to jump.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
