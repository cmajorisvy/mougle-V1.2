import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  GLUON_PUBLIC_DISCLAIMER,
  GLUON_SHORT_BADGE,
  type PublicGluonView,
} from "@shared/gluon-presentation";
import { Info, ShieldCheck } from "lucide-react";

type HelpAudience = "public" | "user" | "admin" | "staff";
type HelpTopic = "gluon" | "gvi" | "contribution" | "knowledgeGraph" | "marketplace";

export function GluonSafetyDisclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs leading-relaxed text-emerald-100">
      {compact ? GLUON_SHORT_BADGE : GLUON_PUBLIC_DISCLAIMER}
    </div>
  );
}

export function PublicGluonBadge({ label = GLUON_SHORT_BADGE }: { label?: string }) {
  return (
    <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-200">
      <ShieldCheck className="h-3 w-3" />
      {label}
    </Badge>
  );
}

export function GluonInfoTooltip({ admin = false }: { admin?: boolean }) {
  const body = admin
    ? "Admin Gluon analysis is internal. GVI, UES, trust impact, risk flags, and compliance previews must stay inside admin review tools."
    : "A Gluon ID is a contribution record. It helps identify reviewed knowledge, signals, or packets connected to Mougle. It is not money, a token, a share, or a payout promise.";

  return (
    <span
      className="inline-flex cursor-help items-center gap-1 text-xs text-muted-foreground"
      title={body}
      aria-label={body}
    >
      <Info className="h-3.5 w-3.5" />
      What is a Gluon ID?
    </span>
  );
}

export function GluonPassportCard({ gluon }: { gluon: PublicGluonView }) {
  return (
    <Card className="rounded-lg border-white/[0.06] bg-white/[0.03] p-4 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Gluon Passport</p>
          <h3 className="mt-1 text-base font-semibold text-foreground">{gluon.displayLabel}</h3>
        </div>
        <PublicGluonBadge />
      </div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Subtype</p>
          <p className="font-medium text-foreground">{gluon.subtypeLabel}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="font-medium text-foreground">{gluon.statusLabel}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Visibility</p>
          <p className="font-medium text-foreground">{gluon.visibilityLabel}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Use</p>
          <p className="font-medium text-foreground">{gluon.shortDisclaimer}</p>
        </div>
      </div>
      <div className="mt-3">
        <GluonSafetyDisclaimer />
      </div>
    </Card>
  );
}

export function GluonHowItWorksPanel({
  audience = "public",
  topic = "gluon",
  variant = "compact",
}: {
  audience?: HelpAudience;
  topic?: HelpTopic;
  variant?: "compact" | "full";
}) {
  const isAdmin = audience === "admin" || audience === "staff";
  const topicLabel = topic === "gvi"
    ? "GVI"
    : topic === "knowledgeGraph"
      ? "Knowledge Graph"
      : topic === "marketplace"
        ? "Marketplace contribution history"
        : "Gluon";

  const publicCopy = {
    what: `This shows public-safe ${topicLabel} contribution identity information without internal scoring or admin analysis.`,
    use: "Use the ID to reference a reviewed contribution, packet, or signal. Do not treat it as a balance, payout, or financial value.",
    works: "Mougle creates a safe display ID for reviewed contribution records. Public views show only identity, subtype, status, and visibility.",
    safety: GLUON_PUBLIC_DISCLAIMER,
  };

  const adminCopy = {
    what: `This shows internal ${topicLabel} analysis for admin review.`,
    use: "Use these metrics to review quality, risk, evidence links, governance impact, and compliance status before approving or escalating.",
    works: "Deeper analysis stays in admin tools so staff can compare trust impact, UES movement, GVI references, evidence links, and risk flags without exposing those metrics publicly.",
    safety: "Admin analysis is internal and must not be copied into public/user-facing Gluon displays.",
  };

  const copy = isAdmin ? adminCopy : publicCopy;
  const rows = [
    ["What this is", copy.what],
    ["How to use it", copy.use],
    ["How it works", copy.works],
    ["Safety note", copy.safety],
  ];

  return (
    <Card className="rounded-lg border-white/[0.06] bg-white/[0.03] p-4 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{isAdmin ? "Admin Gluon Analysis" : "Contribution Identity Help"}</p>
          <p className="text-xs text-muted-foreground">{isAdmin ? "Internal governance context" : GLUON_SHORT_BADGE}</p>
        </div>
        <GluonInfoTooltip admin={isAdmin} />
      </div>
      <div className={variant === "full" ? "mt-4 grid gap-3 md:grid-cols-2" : "mt-3 grid gap-2"}>
        {rows.map(([title, body]) => (
          <div key={title} className="rounded-md border border-white/[0.04] bg-background/30 p-3">
            <p className="text-xs font-medium text-foreground">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
