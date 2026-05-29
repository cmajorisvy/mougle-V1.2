import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  CouncilAgentSlot,
  CouncilAuditTracePreview,
  CouncilDecisionLedgerEntry,
  CouncilLedgerProposalPreview,
  CouncilTaxonomyItem,
  DebateContentPackage,
  LocalFakeAdapterDryRunResponse,
  NewsContentPackage,
  OriginalityRiskStatus,
  SafeModeReadinessControl,
  SourceTier,
  VerificationStatus,
} from "@shared/models/council-governance";
import { PUBLISH_DECISION_LABELS, VISUAL_PACKAGE_TYPE_LABELS } from "@shared/models/council-governance";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Eye,
  FileCheck2,
  Gavel,
  Info,
  Layers3,
  ListChecks,
  LockKeyhole,
  Loader2,
  Power,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  verified: "Verified",
  developing: "Developing",
  monitoring_only: "Monitoring Only",
  rejected_for_publication: "Rejected for Publication",
};

const ORIGINALITY_STATUS_LABELS: Record<OriginalityRiskStatus, string> = {
  original: "Original",
  reference_safe: "Reference-Safe",
  needs_rewrite: "Needs Rewrite",
  blocked_rights_risk: "Blocked Rights Risk",
};

const SOURCE_TIER_LABELS: Record<SourceTier, string> = {
  tier_1_official_primary: "Tier 1 Official Primary",
  tier_2_authoritative_outlet: "Tier 2 Authoritative Outlet",
  tier_3_expert_secondary: "Tier 3 Expert Secondary",
  tier_4_social_signal: "Tier 4 Social Signal",
  tier_5_unverified_claim: "Tier 5 Unverified Claim",
};

const SAFE_MODE_CONTROLS: SafeModeReadinessControl[] = [
  {
    id: "global-safe-mode",
    label: "Global safe mode",
    scope: "global",
    status: "disabled_preview",
    activationLevel: "docs_only",
    description: "Future global stop before any external call, mutation, distribution, or publish action.",
    tooltip: "Safe mode is a future root-admin guard. It is shown here as a disabled preview only.",
    rootAdminOnly: true,
    auditRequired: true,
  },
  {
    id: "worker-disable",
    label: "Per-worker disable",
    scope: "worker",
    status: "disabled_preview",
    activationLevel: "docs_only",
    description: "Future switch to disable a specific worker class without changing package state.",
    tooltip: "This future control would stop a worker type while preserving audit and review state.",
    rootAdminOnly: true,
    auditRequired: true,
  },
  {
    id: "adapter-disable",
    label: "Per-adapter disable",
    scope: "adapter",
    status: "disabled_preview",
    activationLevel: "docs_only",
    description: "Future switch to disable an adapter slot before any dry-run or manual-gated execution.",
    tooltip: "Adapter controls must remain provider-abstracted and must not reveal vendor or model identity.",
    rootAdminOnly: true,
    auditRequired: true,
  },
  {
    id: "council-disable",
    label: "Per-council disable",
    scope: "council",
    status: "disabled_preview",
    activationLevel: "docs_only",
    description: "Future switch to pause a council path while keeping other governance surfaces readable.",
    tooltip: "This is for future council-level safety only. It does not execute anything today.",
    rootAdminOnly: true,
    auditRequired: true,
  },
  {
    id: "provider-disable",
    label: "Per-provider disable",
    scope: "provider",
    status: "disabled_preview",
    activationLevel: "docs_only",
    description: "Future hidden provider-level disable flag. Provider identity remains behind the Redaction Wall.",
    tooltip: "The existence of this safety layer does not disclose any provider identity.",
    rootAdminOnly: true,
    auditRequired: true,
  },
  {
    id: "publish-target-disable",
    label: "Per-publish-target disable",
    scope: "publish_target",
    status: "disabled_preview",
    activationLevel: "docs_only",
    description: "Future target-specific stop for planned/configured distribution surfaces.",
    tooltip: "This cannot publish or distribute. It is a static readiness preview.",
    rootAdminOnly: true,
    auditRequired: true,
  },
];

const AUDIT_TRACE_PREVIEWS: CouncilAuditTracePreview[] = [
  {
    eventId: "evt_council_policy_preview_001",
    packageId: "NEWS-PREVIEW-001",
    activationLevel: "dry_run",
    dryRunOnly: true,
    redactionStatus: "passed",
    policyCheckStatus: "pass",
    adminReviewStatus: "waiting_for_admin_review",
    requestedBy: "root_admin_preview",
    timestamp: "2026-05-04T00:00:00.000Z",
    auditNotes: ["Policy check passed", "Redaction Wall clear", "Publish Decision Required preserved"],
  },
  {
    eventId: "evt_fake_adapter_preview_001",
    packageId: "DEBATE-PREVIEW-001",
    activationLevel: "dry_run",
    dryRunOnly: true,
    redactionStatus: "passed",
    policyCheckStatus: "pass",
    adminReviewStatus: "waiting_for_admin_review",
    requestedBy: "root_admin_preview",
    timestamp: "2026-05-04T00:00:00.000Z",
    auditNotes: ["Local fake adapter only", "No external call", "No database write"],
  },
];

const LEDGER_PROPOSAL_PREVIEWS: CouncilLedgerProposalPreview[] = [
  {
    packageId: "NEWS-PREVIEW-001",
    councilType: "news_verification_council",
    councilAgentName: "VECTOR",
    stance: "Attach stronger primary evidence before package promotion.",
    evidenceUsed: ["evidence-ref-001", "evidence-ref-002"],
    riskFlags: ["dry_run_only", "needs_primary_source"],
    finalChiefDecision: "publish_decision_required",
  },
  {
    packageId: "DEBATE-PREVIEW-001",
    councilType: "debate_council",
    councilAgentName: "EQUINOX",
    stance: "Keep structured disagreement visible until unresolved impact questions are reviewed.",
    evidenceUsed: ["evidence-ref-101", "evidence-ref-103"],
    riskFlags: ["admin_review_required", "argument_balance_review"],
    finalChiefDecision: "publish_decision_required",
  },
];

const LOCAL_FAKE_ADAPTER_PREVIEW: LocalFakeAdapterDryRunResponse = {
  pilotRunId: "fake-pilot-run-001",
  packageId: "NEWS-PREVIEW-001",
  councilAgentName: "VECTOR",
  councilRole: "Consistency Auditor",
  normalizedCouncilOutput:
    "Static fake adapter output: keep the package in review, attach stronger primary evidence, and preserve Publish Decision Required.",
  confidence: 0.68,
  evidenceReferences: ["evidence-ref-001", "evidence-ref-002"],
  riskFlags: ["dry_run_only", "needs_primary_source", "admin_review_required"],
  redactionStatus: "passed",
  policyCheckStatus: "pass",
  adminReviewStatus: "waiting_for_admin_review",
  auditNotes: ["Local fake adapter only", "No external provider call", "No private memory requested"],
  publishDecision: "publish_decision_required",
};

const PILOT_FLOW_STEPS = [
  "Root-admin selects static package",
  "Dry-run pilot request remains disabled/read-only",
  "Redaction Wall would run before output crosses boundary",
  "Forbidden field scan would run",
  "Policy checker would run",
  "Admin review remains required",
  "Publish Decision Required remains locked",
];

function badgeClass(label: string) {
  if (label.includes("No ") || label.includes("Hidden") || label.includes("Unchanged")) {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  }
  if (label.includes("Required") || label.includes("Preview")) {
    return "border-yellow-500/20 bg-yellow-500/10 text-yellow-300";
  }
  return "border-cyan-500/20 bg-cyan-500/10 text-cyan-300";
}

function statusClass(value: string) {
  if (value === "verified" || value === "original" || value.includes("tier_1")) {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  }
  if (value === "developing" || value === "reference_safe" || value.includes("tier_2")) {
    return "border-cyan-500/20 bg-cyan-500/10 text-cyan-300";
  }
  if (value === "monitoring_only" || value === "needs_rewrite" || value.includes("tier_4")) {
    return "border-yellow-500/20 bg-yellow-500/10 text-yellow-300";
  }
  if (value === "rejected_for_publication" || value === "blocked_rights_risk" || value.includes("tier_5")) {
    return "border-red-500/20 bg-red-500/10 text-red-300";
  }
  if (value === "publish_decision_required" || value === "blocked_by_verification" || value === "blocked_by_originality_or_rights") {
    return "border-yellow-500/20 bg-yellow-500/10 text-yellow-300";
  }
  return "border-zinc-500/20 bg-zinc-500/10 text-zinc-300";
}

function isNewsPackage(pkg: NewsContentPackage | DebateContentPackage): pkg is NewsContentPackage {
  return pkg.schemaType === "NewsContentPackage";
}

function formatScore(value: number | null) {
  if (value === null) return "Not attached";
  return `${Math.round(value * 100)}%`;
}

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-zinc-500 hover:border-cyan-400/40 hover:text-cyan-300"
          aria-label="More information"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs border border-white/[0.08] bg-zinc-950 px-3 py-2 text-xs leading-5 text-zinc-200">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function CardTitleWithTip({ title, tooltip }: { title: string; tooltip: string }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
      {title}
      <InfoTip text={tooltip} />
    </h3>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070711] text-zinc-400">
      <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading council governance...
    </div>
  );
}

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-300">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">{description}</p>
    </div>
  );
}

function AgentCard({ agent }: { agent: CouncilAgentSlot }) {
  return (
    <Card className="border-white/[0.08] bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-white">{agent.publicDisplayName}</p>
          <p className="text-sm text-cyan-300">{agent.publicProfession}</p>
        </div>
        <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">Provider Hidden</Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-400">{agent.shortTooltip}</p>
      <div className="mt-4 grid gap-2 text-xs text-zinc-500 sm:grid-cols-2">
        <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
          <span className="block text-zinc-600">Machine slot</span>
          <span className="mt-1 block font-mono text-zinc-300">{agent.adminMachineSlot}</span>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
          <span className="block text-zinc-600">Backend role</span>
          <span className="mt-1 block break-words font-mono text-zinc-300">{agent.backendRole}</span>
        </div>
      </div>
    </Card>
  );
}

function CouncilSection({ title, description, agents }: { title: string; description: string; agents: CouncilAgentSlot[] }) {
  return (
    <section className="space-y-4">
      <SectionHeader eyebrow="Council registry" title={title} description={description} />
      <div className="grid gap-4 lg:grid-cols-2">
        {agents.map((agent) => (
          <AgentCard key={`${agent.councilType}-${agent.publicDisplayName}`} agent={agent} />
        ))}
      </div>
    </section>
  );
}

function TaxonomyList({ title, items }: { title: string; items: CouncilTaxonomyItem[] }) {
  return (
    <Card className="border-white/[0.08] bg-white/[0.03] p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.value} className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={statusClass(item.value)}>{item.label}</Badge>
              <span className="font-mono text-xs text-zinc-500">{item.value}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{item.description}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function FieldList({ title, fields }: { title: string; fields: string[] }) {
  return (
    <Card className="border-white/[0.08] bg-white/[0.03] p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <div className="mt-4 flex flex-wrap gap-2">
        {fields.map((field) => (
          <Badge key={field} className="border-white/[0.08] bg-white/[0.04] font-mono text-zinc-300">
            {field}
          </Badge>
        ))}
      </div>
    </Card>
  );
}

function DataTile({ label, value, mono = false }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-sm text-zinc-300 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function StatusTile({ label, value, badgeValue }: { label: string; value: string; badgeValue: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <Badge className={`mt-2 ${statusClass(badgeValue)}`}>{value}</Badge>
    </div>
  );
}

function TextList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">No items attached to this static preview.</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm leading-6 text-zinc-400">
          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function WorkbenchSection({
  title,
  tooltip,
  children,
}: {
  title: string;
  tooltip: string;
  children: ReactNode;
}) {
  return (
    <Card className="border-white/[0.08] bg-white/[0.03] p-4">
      <CardTitleWithTip title={title} tooltip={tooltip} />
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function PackageReadinessPanel({ pkg }: { pkg: NewsContentPackage | DebateContentPackage }) {
  const checks = [
    {
      label: "Package mode",
      value: "Static mock preview",
      className: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300",
      detail: "This preview verifies shape and staff readability only. It is not real council output.",
    },
    {
      label: "Verification",
      value: VERIFICATION_STATUS_LABELS[pkg.status],
      className: statusClass(pkg.status),
      detail: "This status tells admins whether the package is verified, still developing, monitoring-only, or rejected.",
    },
    {
      label: "Originality gate",
      value: ORIGINALITY_STATUS_LABELS[pkg.originalityStatus],
      className: statusClass(pkg.originalityStatus),
      detail: "This gate protects Mougle from copied phrasing, imitation, transcript rewrite, and unsafe visual reuse.",
    },
    {
      label: "Publish gate",
      value: PUBLISH_DECISION_LABELS[pkg.publishDecision],
      className: "border-yellow-500/20 bg-yellow-500/10 text-yellow-300",
      detail: "Every package stays gated until a real admin decision is made in a future approved workflow.",
    },
  ];

  return (
    <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-yellow-300" />
        <div>
          <h4 className="text-sm font-semibold text-yellow-100">Decision-prep status</h4>
          <p className="mt-1 text-sm leading-6 text-yellow-100/80">
            Not publishable from this screen. This workbench only helps admins understand whether a future package is readable,
            evidence-backed, rights-safe, and still gated by Publish Decision Required.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {checks.map((check) => (
          <div key={check.label} className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
            <div className="flex items-center gap-2">
              <p className="text-xs text-zinc-500">{check.label}</p>
              <InfoTip text={check.detail} />
            </div>
            <Badge className={`mt-2 ${check.className}`}>{check.value}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function PackageReviewWorkbench({ label, pkg }: { label: string; pkg: NewsContentPackage | DebateContentPackage }) {
  const newsPackage = isNewsPackage(pkg);
  const verdict = newsPackage ? pkg.factVerdict : pkg.debateVerdict;
  const evidenceContext = newsPackage
    ? [pkg.socialTrendSummary]
    : [...pkg.positions.map((position) => `Position: ${position}`), ...pkg.unresolvedQuestions.map((question) => `Open question: ${question}`)];

  return (
    <section className="space-y-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-300">{label}</p>
          <h3 className="mt-2 text-lg font-semibold text-white">{pkg.title}</h3>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-400">{pkg.longDescription}</p>
        </div>
        <Badge className="border-yellow-500/20 bg-yellow-500/10 text-yellow-300">
          {PUBLISH_DECISION_LABELS[pkg.publishDecision]}
        </Badge>
      </div>

      <PackageReadinessPanel pkg={pkg} />

      <div className="grid gap-4 xl:grid-cols-2">
        <WorkbenchSection
          title="Package identity"
          tooltip="The stable contract identity for this package preview. These fields help admins see what kind of item they are reviewing."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <DataTile label="Schema" value={pkg.schemaType} mono />
            <DataTile label="Content type" value={pkg.contentType} mono />
            <DataTile label="Category" value={pkg.category} />
            <DataTile label="Topic" value={pkg.topic} />
            <DataTile label="Industry" value={pkg.industry} />
            <DataTile label="Tags" value={pkg.tags.join(", ")} />
          </div>
        </WorkbenchSection>

        <WorkbenchSection
          title="Verification and source status"
          tooltip="These fields explain how strongly the package is supported and whether social signals are being kept separate from verified facts."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <StatusTile label="Package status" value={VERIFICATION_STATUS_LABELS[pkg.status]} badgeValue={pkg.status} />
            {newsPackage && (
              <StatusTile
                label="News verification"
                value={VERIFICATION_STATUS_LABELS[pkg.verificationStatus]}
                badgeValue={pkg.verificationStatus}
              />
            )}
            <StatusTile label="Source tier" value={SOURCE_TIER_LABELS[pkg.sourceTier]} badgeValue={pkg.sourceTier} />
            <DataTile label="Source count" value={pkg.sourceCount} />
          </div>
        </WorkbenchSection>

        <WorkbenchSection
          title="Evidence summary"
          tooltip="A staff-readable trace of the claims, references, positions, and unresolved questions used by the mock package."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Evidence references</p>
              <TextList items={pkg.evidenceReferences} />
            </div>
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Claim summary</p>
              <TextList items={pkg.claimSummary} />
            </div>
          </div>
          {evidenceContext.length > 0 && (
            <div className="mt-4 rounded-lg border border-white/[0.06] bg-black/20 p-3">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                {newsPackage ? "Trend handling" : "Debate context"}
              </p>
              <TextList items={evidenceContext} />
            </div>
          )}
        </WorkbenchSection>

        <WorkbenchSection
          title="Council verdict"
          tooltip="The council verdict summarizes the current decision logic without executing any action or provider workflow."
        >
          <div className="space-y-3">
            <DataTile label={newsPackage ? "Fact verdict" : "Debate verdict"} value={verdict} />
            <DataTile label="Council verdict" value={pkg.councilVerdict} />
            <div className="grid gap-3 md:grid-cols-3">
              <DataTile label="Chief score" value={formatScore(pkg.MougleChiefScore)} />
              <DataTile label="TCS" value={formatScore(pkg.TCS)} />
              <DataTile label="UES" value={formatScore(pkg.UES)} />
            </div>
            {!newsPackage && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                  <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Consensus</p>
                  <TextList items={pkg.consensus} />
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                  <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Disagreement</p>
                  <TextList items={pkg.disagreement} />
                </div>
              </div>
            )}
          </div>
        </WorkbenchSection>

        <WorkbenchSection
          title="Originality and rights gate"
          tooltip="This gate keeps facts separate from source expression. Mougle can use verified facts, but the script, structure, visuals, and final package must be original or reference-safe."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <StatusTile
              label="Originality status"
              value={ORIGINALITY_STATUS_LABELS[pkg.originalityStatus]}
              badgeValue={pkg.originalityStatus}
            />
            <DataTile label="Copyright risk" value={pkg.copyrightRisk} />
          </div>
        </WorkbenchSection>

        <WorkbenchSection
          title="Visual package"
          tooltip="Visual packages stay provider-ready only. This screen does not generate images, render video, upload assets, or publish anything."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <DataTile label="Visual package type" value={VISUAL_PACKAGE_TYPE_LABELS[pkg.visualPackageType]} />
            <DataTile label="Thumbnail prompt" value={pkg.thumbnailPrompt} />
          </div>
        </WorkbenchSection>

        <WorkbenchSection
          title="Publish decision"
          tooltip="Publish Decision Required means the package cannot publish from this screen and requires a future explicitly approved admin workflow."
        >
          <div className="grid gap-3 md:grid-cols-2">
            <StatusTile
              label="Chief decision"
              value={PUBLISH_DECISION_LABELS[pkg.chiefDecision]}
              badgeValue={pkg.chiefDecision}
            />
            <StatusTile
              label="Publish decision"
              value={PUBLISH_DECISION_LABELS[pkg.publishDecision]}
              badgeValue={pkg.publishDecision}
            />
          </div>
          <div className="mt-4 rounded-lg border border-white/[0.06] bg-black/20 p-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Planned/configured targets</p>
            <TextList items={pkg.publishTargets} />
          </div>
        </WorkbenchSection>
      </div>
    </section>
  );
}

function PackageWorkbenchHelp() {
  const items = [
    {
      icon: ListChecks,
      title: "How to use this",
      body: "Read package identity first, then verify source status, evidence, council verdict, originality, visual package, and publish decision. The workbench should answer why this package is or is not ready for a future admin review.",
    },
    {
      icon: Eye,
      title: "What this means",
      body: "This is a staff-readable review surface for static/mock contracts. It does not prove a real story, create a video, call a model, or authorize publication.",
    },
    {
      icon: BookOpen,
      title: "How it works",
      body: "Typed package fields are grouped into review sections so admins can inspect evidence and safety gates before any future worker, provider, or publishing layer is approved.",
    },
    {
      icon: Ban,
      title: "What cannot happen from this screen",
      body: "This page cannot call providers, start workers, write database records, promote packages, create ledger state, or publish content.",
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.title} className="border-white/[0.08] bg-white/[0.03] p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Icon className="h-4 w-4 text-cyan-300" />
              {item.title}
              <InfoTip text="This helper keeps the package preview understandable without exposing provider details or implying publishing is active." />
            </h3>
            <p className="mt-3 text-sm leading-6 text-zinc-400">{item.body}</p>
          </Card>
        );
      })}
    </div>
  );
}

function LearningCards({
  context,
  use,
  meaning,
  works,
  cannot,
}: {
  context: string;
  use: string;
  meaning: string;
  works: string;
  cannot: string;
}) {
  const items = [
    { icon: ListChecks, title: "How to use this", body: use },
    { icon: Eye, title: "What this means", body: meaning },
    { icon: BookOpen, title: "How it works", body: works },
    { icon: Ban, title: "What cannot happen from this screen", body: cannot },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={`${context}-${item.title}`} className="border-white/[0.08] bg-white/[0.03] p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Icon className="h-4 w-4 text-cyan-300" />
              {item.title}
              <InfoTip text={`Learning note for ${context}. This keeps the preview understandable and non-operational.`} />
            </h3>
            <p className="mt-3 text-sm leading-6 text-zinc-400">{item.body}</p>
          </Card>
        );
      })}
    </div>
  );
}

function SafeModeReadinessPanel() {
  return (
    <section className="space-y-4">
      <SectionHeader
        eyebrow="Phase 36C9"
        title="Safe Mode and Kill Switch Readiness"
        description="Static root-admin preview only. These controls are disabled and do not change application behavior."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {SAFE_MODE_CONTROLS.map((control) => (
          <Card key={control.id} className="border-white/[0.08] bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Power className="h-4 w-4 text-cyan-300" />
                  {control.label}
                  <InfoTip text={control.tooltip} />
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{control.description}</p>
              </div>
              <Badge className="border-yellow-500/20 bg-yellow-500/10 text-yellow-300">Disabled Preview</Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <DataTile label="Scope" value={control.scope} mono />
              <DataTile label="Activation" value={control.activationLevel} mono />
              <DataTile label="Audit required" value={control.auditRequired ? "Yes" : "No"} />
            </div>
            <Button disabled className="mt-4 w-full cursor-not-allowed bg-zinc-800 text-zinc-500">
              <LockKeyhole className="mr-2 h-4 w-4" />
              Preview only - no action available
            </Button>
          </Card>
        ))}
      </div>
      <LearningCards
        context="safe mode readiness"
        use="Use this preview to understand which future safety switches must exist before any worker, adapter, or publish-capable flow can activate."
        meaning="Every control is intentionally non-operational. It teaches the safety model without changing runtime behavior."
        works="Future execution would check global safe mode, scoped disable flags, root-admin approval, and audit requirements before any sensitive action."
        cannot="This screen cannot enable or disable real systems, call providers, start workers, mutate data, or publish content."
      />
    </section>
  );
}

function AuditTracePanel() {
  return (
    <section className="space-y-4">
      <SectionHeader
        eyebrow="Phase 36C10"
        title="Audit Trace and Ledger Proposal Preview"
        description="Static/mock trace of how future dry-run artifacts and ledger proposals should be inspected before persistence exists."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {AUDIT_TRACE_PREVIEWS.map((trace) => (
          <Card key={trace.eventId} className="border-white/[0.08] bg-white/[0.03] p-4">
            <CardTitleWithTip
              title={trace.eventId}
              tooltip="Audit traces are future visibility artifacts. This preview is static and does not write audit records."
            />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <DataTile label="Package" value={trace.packageId} mono />
              <DataTile label="Activation" value={trace.activationLevel} mono />
              <StatusTile label="Redaction" value={trace.redactionStatus} badgeValue={trace.redactionStatus} />
              <StatusTile label="Policy check" value={trace.policyCheckStatus} badgeValue={trace.policyCheckStatus} />
              <DataTile label="Admin review" value={trace.adminReviewStatus} mono />
              <DataTile label="Dry-run only" value={trace.dryRunOnly ? "Yes" : "No"} />
            </div>
            <div className="mt-4 rounded-lg border border-white/[0.06] bg-black/20 p-3">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Audit notes</p>
              <TextList items={trace.auditNotes} />
            </div>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {LEDGER_PROPOSAL_PREVIEWS.map((proposal) => (
          <Card key={`${proposal.packageId}-${proposal.councilAgentName}`} className="border-white/[0.08] bg-white/[0.03] p-4">
            <CardTitleWithTip
              title={`${proposal.councilAgentName} ledger proposal`}
              tooltip="Ledger proposals are future-only and do not persist to the database from this screen."
            />
            <p className="mt-3 text-sm leading-6 text-zinc-400">{proposal.stance}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <DataTile label="Package" value={proposal.packageId} mono />
              <DataTile label="Council" value={proposal.councilType} mono />
              <StatusTile
                label="Chief decision"
                value={PUBLISH_DECISION_LABELS[proposal.finalChiefDecision]}
                badgeValue={proposal.finalChiefDecision}
              />
              <DataTile label="Risk flags" value={proposal.riskFlags.join(", ")} />
            </div>
          </Card>
        ))}
      </div>
      <LearningCards
        context="audit trace and ledger proposal"
        use="Use these previews to understand the audit fields and ledger proposal fields that future dry-runs must expose for review."
        meaning="These are static examples only. They do not create audit rows, ledger rows, package state, or public outputs."
        works="Future dry-runs would produce redacted audit notes and ledger proposals, then stop for admin review with Publish Decision Required preserved."
        cannot="This screen cannot persist a ledger, create audit records, approve a proposal, call providers, or publish anything."
      />
    </section>
  );
}

function ManualPilotPanel() {
  return (
    <section className="space-y-4">
      <SectionHeader
        eyebrow="Phase 36C12 / 36C13"
        title="Local Fake Adapter and Manual-Gated Pilot Preview"
        description="Static/mock dry-run output only. This simulates the contract shape without adapters, provider calls, credentials, routing, or publishing."
      />
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-white/[0.08] bg-white/[0.03] p-4">
          <CardTitleWithTip
            title="Future manual-gated pilot flow"
            tooltip="Every future provider-backed pilot must stay dry-run, redacted, policy-checked, and manually reviewed."
          />
          <div className="mt-4 space-y-3">
            {PILOT_FLOW_STEPS.map((step, index) => (
              <div key={step} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-black/20 p-3">
                <Badge className="border-cyan-500/20 bg-cyan-500/10 text-cyan-300">{index + 1}</Badge>
                <span className="text-sm text-zinc-300">{step}</span>
              </div>
            ))}
          </div>
          <Button disabled className="mt-4 w-full cursor-not-allowed bg-zinc-800 text-zinc-500">
            <LockKeyhole className="mr-2 h-4 w-4" />
            Dry-run request disabled
          </Button>
        </Card>
        <Card className="border-white/[0.08] bg-white/[0.03] p-4">
          <CardTitleWithTip
            title="Local fake adapter dry-run output"
            tooltip="This is static local output. It is not provider output and does not contain raw prompts, raw completions, or routing details."
          />
          <p className="mt-3 text-sm leading-6 text-zinc-400">{LOCAL_FAKE_ADAPTER_PREVIEW.normalizedCouncilOutput}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <DataTile label="Pilot run" value={LOCAL_FAKE_ADAPTER_PREVIEW.pilotRunId} mono />
            <DataTile label="Council agent" value={LOCAL_FAKE_ADAPTER_PREVIEW.councilAgentName} />
            <DataTile label="Council role" value={LOCAL_FAKE_ADAPTER_PREVIEW.councilRole} />
            <DataTile label="Confidence" value={formatScore(LOCAL_FAKE_ADAPTER_PREVIEW.confidence)} />
            <StatusTile label="Redaction" value={LOCAL_FAKE_ADAPTER_PREVIEW.redactionStatus} badgeValue={LOCAL_FAKE_ADAPTER_PREVIEW.redactionStatus} />
            <StatusTile label="Policy check" value={LOCAL_FAKE_ADAPTER_PREVIEW.policyCheckStatus} badgeValue={LOCAL_FAKE_ADAPTER_PREVIEW.policyCheckStatus} />
            <StatusTile
              label="Publish decision"
              value={PUBLISH_DECISION_LABELS[LOCAL_FAKE_ADAPTER_PREVIEW.publishDecision]}
              badgeValue={LOCAL_FAKE_ADAPTER_PREVIEW.publishDecision}
            />
            <DataTile label="Admin review" value={LOCAL_FAKE_ADAPTER_PREVIEW.adminReviewStatus} mono />
          </div>
          <div className="mt-4 rounded-lg border border-white/[0.06] bg-black/20 p-3">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Audit notes</p>
            <TextList items={LOCAL_FAKE_ADAPTER_PREVIEW.auditNotes} />
          </div>
        </Card>
      </div>
      <LearningCards
        context="manual-gated pilot preview"
        use="Use this preview to understand how a future pilot would stay redacted, policy-checked, dry-run-only, and waiting for admin review."
        meaning="The local fake adapter proves the contract shape without connecting any external system or making any package state change."
        works="A future request would pass through the event safety envelope, Redaction Wall, forbidden field scan, policy checker, and root-admin review before any promotion."
        cannot="This screen cannot call providers, use credentials, route to models, store raw output, create jobs, write ledgers, or publish content."
      />
    </section>
  );
}

function LedgerEntry({ entry }: { entry: CouncilDecisionLedgerEntry }) {
  return (
    <Card className="border-white/[0.08] bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-zinc-500">{entry.packageId}</p>
          <h3 className="mt-1 text-sm font-semibold text-white">
            {entry.councilAgent} - {entry.agentRole}
          </h3>
        </div>
        <Badge className="border-yellow-500/20 bg-yellow-500/10 text-yellow-300">
          {PUBLISH_DECISION_LABELS[entry.finalChiefDecision]}
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-400">{entry.stance}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
          <p className="text-xs text-zinc-500">Confidence</p>
          <p className="mt-1 text-sm font-semibold text-cyan-300">{Math.round(entry.confidence * 100)}%</p>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
          <p className="text-xs text-zinc-500">Risk flags</p>
          <p className="mt-1 text-sm text-zinc-300">{entry.riskFlags.join(", ")}</p>
        </div>
        <div className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
          <p className="text-xs text-zinc-500">Originality flags</p>
          <p className="mt-1 text-sm text-zinc-300">{entry.originalityFlags.join(", ")}</p>
        </div>
      </div>
    </Card>
  );
}

function LearningBlock() {
  const items = [
    {
      title: "How to use this",
      body: "Use this page to inspect the planned council structure, package contracts, taxonomy labels, and decision ledger shape before any real provider, queue, or publishing work begins.",
    },
    {
      title: "What this means",
      body: "News verifies what happened. Debates interpret what verified facts mean. Both move through an originality and rights gate before any publish decision.",
    },
    {
      title: "How it works",
      body: "MIV supplies policy-filtered public-safe evidence views. Council agents review those views by role. The ledger records planned review decisions, then a package remains gated until an admin publish decision.",
    },
    {
      title: "What cannot happen from this screen",
      body: "This page cannot call providers, start queues, run workers, mutate the database, persist ledgers, change safe mode, or publish content.",
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.title} className="border-white/[0.08] bg-white/[0.03] p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <BookOpen className="h-4 w-4 text-cyan-300" />
            {item.title}
          </h3>
          <p className="mt-3 text-sm leading-6 text-zinc-400">{item.body}</p>
        </Card>
      ))}
    </div>
  );
}

export default function CouncilGovernance() {
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

  const overview = useQuery({
    queryKey: ["admin-council-governance-overview"],
    queryFn: () => api.admin.councilGovernanceOverview(),
    enabled: isRootAdmin,
  });
  const newsCouncil = useQuery({
    queryKey: ["admin-council-governance-news"],
    queryFn: () => api.admin.councilGovernanceNewsCouncil(),
    enabled: isRootAdmin,
  });
  const debateCouncil = useQuery({
    queryKey: ["admin-council-governance-debate"],
    queryFn: () => api.admin.councilGovernanceDebateCouncil(),
    enabled: isRootAdmin,
  });
  const packages = useQuery({
    queryKey: ["admin-council-governance-packages"],
    queryFn: () => api.admin.councilGovernancePackageContracts(),
    enabled: isRootAdmin,
  });
  const ledger = useQuery({
    queryKey: ["admin-council-governance-ledger"],
    queryFn: () => api.admin.councilGovernanceSampleLedger(),
    enabled: isRootAdmin,
  });
  const taxonomy = useQuery({
    queryKey: ["admin-council-governance-taxonomy"],
    queryFn: () => api.admin.councilGovernanceStatusTaxonomy(),
    enabled: isRootAdmin,
  });

  const isLoading =
    overview.isLoading ||
    newsCouncil.isLoading ||
    debateCouncil.isLoading ||
    packages.isLoading ||
    ledger.isLoading ||
    taxonomy.isLoading;

  const hasError =
    overview.error ||
    newsCouncil.error ||
    debateCouncil.error ||
    packages.error ||
    ledger.error ||
    taxonomy.error;

  if (authLoading || (isRootAdmin && isLoading)) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated || !isRootAdmin) return null;

  const refreshAll = () => {
    overview.refetch();
    newsCouncil.refetch();
    debateCouncil.refetch();
    packages.refetch();
    ledger.refetch();
    taxonomy.refetch();
  };

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
                <Gavel className="h-8 w-8 text-cyan-300" />
                <h1 className="text-2xl font-bold">Council Governance Layer</h1>
                <Badge className="border-yellow-500/20 bg-yellow-500/15 text-yellow-300">Admin Preview</Badge>
                <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">Read-only</Badge>
              </div>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-500">
                MIV to Council Review to Council Decision Ledger to Original Content Package to Publish Decision Required.
                This surface is static/configured only and does not call external providers, queues, databases, or publishing systems.
              </p>
            </div>
            <Button onClick={refreshAll} className="bg-cyan-600 hover:bg-cyan-700 text-white">
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh static preview
            </Button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        {hasError && (
          <Card className="border-red-500/20 bg-red-500/10 p-4 text-red-200">
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            Council governance preview failed to load. No action was executed.
          </Card>
        )}

        <div className="flex flex-wrap gap-2">
          {overview.data?.readinessLabels.map((label) => (
            <Badge key={label} className={badgeClass(label)}>
              {label}
            </Badge>
          ))}
        </div>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-white/[0.08] bg-white/[0.03] p-5">
            <SectionHeader
              eyebrow="Core governance flow"
              title="Council Governance Layer"
              description="A root-admin preview of the planned council registry, package contracts, and audit ledger structure."
            />
            <div className="mt-5 grid gap-3 md:grid-cols-5">
              {overview.data?.governanceFlow.map((step, index) => (
                <div key={step} className="rounded-lg border border-white/[0.08] bg-black/20 p-3">
                  <p className="text-xs text-zinc-600">Step {index + 1}</p>
                  <p className="mt-1 text-sm font-medium text-zinc-200">{step}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="border-white/[0.08] bg-white/[0.03] p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              Safety Boundaries
            </h2>
            <div className="mt-4 space-y-2">
              {overview.data?.safetyBoundaries.map((boundary) => (
                <div key={boundary} className="flex items-center gap-2 text-sm text-zinc-400">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  {boundary}
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-white/[0.08] bg-white/[0.03] p-5">
            <SectionHeader
              eyebrow="Shared data layer"
              title="Mougle Intelligence Vault"
              description={overview.data?.mivSummary.definition || ""}
            />
            <div className="mt-5 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
              <p className="text-sm font-medium text-yellow-200">Memory separation warning</p>
              <p className="mt-2 text-sm leading-6 text-yellow-100/80">{overview.data?.mivSummary.privateMemoryRule}</p>
            </div>
          </Card>

          <Card className="border-white/[0.08] bg-white/[0.03] p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Layers3 className="h-4 w-4 text-cyan-300" />
              Controlled views
            </h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {overview.data?.mivSummary.controlledViews.map((view) => (
                <Badge key={view} className="border-white/[0.08] bg-white/[0.04] text-zinc-300">
                  {view}
                </Badge>
              ))}
            </div>
          </Card>
        </section>

        <Tabs defaultValue="councils" className="space-y-6">
          <TabsList className="bg-white/[0.04]">
            <TabsTrigger value="councils">Councils</TabsTrigger>
            <TabsTrigger value="taxonomies">Taxonomies</TabsTrigger>
            <TabsTrigger value="packages">Packages</TabsTrigger>
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
            <TabsTrigger value="safety">Safe Mode</TabsTrigger>
            <TabsTrigger value="pilot">Pilot Mock</TabsTrigger>
            <TabsTrigger value="learning">Learning</TabsTrigger>
          </TabsList>

          <TabsContent value="councils" className="space-y-8">
            <CouncilSection
              title={newsCouncil.data?.displayName || "Mougle News Verification Council"}
              description={newsCouncil.data?.description || ""}
              agents={newsCouncil.data?.agents || []}
            />
            <CouncilSection
              title={debateCouncil.data?.displayName || "Mougle Debate Council"}
              description={debateCouncil.data?.description || ""}
              agents={debateCouncil.data?.agents || []}
            />
          </TabsContent>

          <TabsContent value="taxonomies" className="grid gap-4 lg:grid-cols-3">
            <TaxonomyList title="Status Ladder" items={taxonomy.data?.statusLadder || []} />
            <TaxonomyList title="Originality Risk Ladder" items={taxonomy.data?.originalityRiskLadder || []} />
            <TaxonomyList title="Source-Tier Taxonomy" items={taxonomy.data?.sourceTierTaxonomy || []} />
          </TabsContent>

          <TabsContent value="packages" className="space-y-4">
            <SectionHeader
              eyebrow="Package contract preview"
              title="Council Package Review Workbench"
              description="These previews group the typed mock package contracts into admin-readable review sections. They are not real publishable items and do not execute publishing."
            />
            <div className="space-y-4">
              {packages.data?.sampleNewsPackage && (
                <PackageReviewWorkbench label="Sample news package" pkg={packages.data.sampleNewsPackage} />
              )}
              {packages.data?.sampleDebatePackage && (
                <PackageReviewWorkbench label="Sample debate package" pkg={packages.data.sampleDebatePackage} />
              )}
              <div className="grid gap-4 lg:grid-cols-2">
                <FieldList title="NewsContentPackage fields" fields={packages.data?.newsContentPackageFields || []} />
                <FieldList title="DebateContentPackage fields" fields={packages.data?.debateContentPackageFields || []} />
              </div>
              <PackageWorkbenchHelp />
            </div>
          </TabsContent>

          <TabsContent value="ledger" className="space-y-4">
            <SectionHeader
              eyebrow="Council Decision Ledger"
              title="Planned audit preview only"
              description={ledger.data?.note || "Static mock data only. No database write and no real provider output."}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              {ledger.data?.sampleLedgerEntries.map((entry) => (
                <LedgerEntry key={`${entry.packageId}-${entry.councilAgent}`} entry={entry} />
              ))}
            </div>
            <AuditTracePanel />
          </TabsContent>

          <TabsContent value="safety" className="space-y-4">
            <SafeModeReadinessPanel />
          </TabsContent>

          <TabsContent value="pilot" className="space-y-4">
            <ManualPilotPanel />
          </TabsContent>

          <TabsContent value="learning" className="space-y-4">
            <SectionHeader
              eyebrow="Learning UX"
              title="How staff and admins should read this"
              description="Simple guardrails for interpreting the governance layer without implying active provider calls or publishing."
            />
            <LearningBlock />
            <Card className="border-white/[0.08] bg-white/[0.03] p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <FileCheck2 className="h-4 w-4 text-cyan-300" />
                Originality and Rights Gate
              </h3>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Facts may be used after verification. The wording, narration, structure, visuals, script, title style, and final
                video package must be original to Mougle. Allowed visual sources include licensed media, owned media,
                legally usable public-domain or government media, AI-generated visuals, and reference-safe visual packages.
              </p>
            </Card>
            <Card className="border-white/[0.08] bg-white/[0.03] p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <BrainCircuit className="h-4 w-4 text-cyan-300" />
                Truth vs Meaning
              </h3>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                News answers what happened and how verified it is. Debates answer what verified facts mean, which positions
                are strongest, and what remains unresolved.
              </p>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
