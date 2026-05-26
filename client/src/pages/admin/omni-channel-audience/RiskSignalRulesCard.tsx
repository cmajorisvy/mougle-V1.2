import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RISK_SIGNAL_RULES_URL, buildRiskSignalRulesPayload } from "../omni-channel-audience-forms";
import { AudienceAuditRiskSignal, RISK_SIGNAL_LABELS, RISK_SIGNAL_DESCRIPTIONS, RISK_SIGNAL_BADGE_CLASS, RISK_SIGNAL_ORDER } from "./_shared";

interface AudienceRiskSignalRules {
  wideDateWindowDays: number;
  loudSignals: AudienceAuditRiskSignal[];
  mutedSignals: AudienceAuditRiskSignal[];
  updatedAt: string | null;
  updatedBy: string | null;
}

interface RiskSignalRulesResponse {
  rules: AudienceRiskSignalRules;
  allSignals: AudienceAuditRiskSignal[];
  defaults: AudienceRiskSignalRules;
  bounds: { minWideDateWindowDays: number; maxWideDateWindowDays: number };
}

const RISK_SIGNAL_RULE_LABELS: Record<AudienceAuditRiskSignal, string> = {
  full_trail: "Full trail (no filters)",
  no_date_window: "No date window",
  wide_date_window: "Wide date window",
  first_export_by_actor: "First export by actor",
  new_production_for_actor: "New production for actor",
  format_change: "Format change vs prior export",
};

interface RiskSignalRulesPreviewResponse {
  subject: string;
  html: string;
  partition: {
    bodySignals: AudienceAuditRiskSignal[];
    subjectSignals: AudienceAuditRiskSignal[];
    mutedFromEmail: AudienceAuditRiskSignal[];
  };
  sample: {
    inputSignals: AudienceAuditRiskSignal[];
    appliedRules: {
      wideDateWindowDays: number;
      loudSignals: AudienceAuditRiskSignal[];
      mutedSignals: AudienceAuditRiskSignal[];
    };
  };
}

export function RiskSignalRulesCard() {
  const qc = useQueryClient();
  const query = useQuery<RiskSignalRulesResponse>({
    queryKey: ["/api/admin/newsroom/audience/risk-signal-rules"],
  });

  const [daysInput, setDaysInput] = useState<string>("");
  const [loud, setLoud] = useState<Set<AudienceAuditRiskSignal>>(new Set());
  const [muted, setMuted] = useState<Set<AudienceAuditRiskSignal>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sampleSignals, setSampleSignals] = useState<Set<AudienceAuditRiskSignal>>(
    new Set([
      "full_trail",
      "no_date_window",
      "wide_date_window",
      "first_export_by_actor",
      "new_production_for_actor",
      "format_change",
    ]),
  );
  const [preview, setPreview] = useState<RiskSignalRulesPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    const r = query.data?.rules;
    if (r && !hydrated) {
      setDaysInput(String(r.wideDateWindowDays));
      setLoud(new Set(r.loudSignals));
      setMuted(new Set(r.mutedSignals));
      setHydrated(true);
    }
  }, [query.data, hydrated]);

  const allSignals = query.data?.allSignals ?? [];
  const bounds = query.data?.bounds;
  const rules = query.data?.rules;

  const toggleLoud = (s: AudienceAuditRiskSignal) => {
    setLoud((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };
  const toggleMuted = (s: AudienceAuditRiskSignal) => {
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildRiskSignalRulesPayload<AudienceAuditRiskSignal>({
        daysInput,
        loud,
        muted,
        bounds: {
          minWideDateWindowDays: bounds?.minWideDateWindowDays ?? 1,
          maxWideDateWindowDays: bounds?.maxWideDateWindowDays ?? 3650,
        },
      });
      return await apiRequest("PUT", RISK_SIGNAL_RULES_URL, payload);
    },
    onSuccess: () => {
      setSaveError(null);
      setSaveNotice("Saved.");
      qc.invalidateQueries({
        queryKey: [RISK_SIGNAL_RULES_URL],
      });
    },
    onError: (e: any) => {
      setSaveNotice(null);
      setSaveError(e?.message ?? "save failed");
    },
  });

  const resetToDefaults = () => {
    const d = query.data?.defaults;
    if (!d) return;
    setDaysInput(String(d.wideDateWindowDays));
    setLoud(new Set(d.loudSignals));
    setMuted(new Set(d.mutedSignals));
  };

  const toggleSample = (s: AudienceAuditRiskSignal) => {
    setSampleSignals((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const previewMutation = useMutation({
    mutationFn: async () => {
      const wideDateWindowDays = Math.max(
        bounds?.minWideDateWindowDays ?? 1,
        Math.min(
          bounds?.maxWideDateWindowDays ?? 3650,
          Math.floor(Number(daysInput) || 0) || 1,
        ),
      );
      const res = await apiRequest(
        "POST",
        "/api/admin/newsroom/audience/risk-signal-rules/preview-email",
        {
          rules: {
            wideDateWindowDays,
            loudSignals: Array.from(loud),
            mutedSignals: Array.from(muted),
          },
          sampleSignals: Array.from(sampleSignals),
        },
      );
      return (await res.json()) as RiskSignalRulesPreviewResponse;
    },
    onSuccess: (data) => {
      setPreviewError(null);
      setPreview(data);
      setPreviewOpen(true);
    },
    onError: (e: any) => {
      setPreview(null);
      setPreviewError(e?.message ?? "preview failed");
      setPreviewOpen(true);
    },
  });

  return (
    <Card data-testid="card-risk-signal-rules">
      <CardHeader>
        <CardTitle>Risk-Signal Rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Tune the audit-export risk-signal detector and notifier email.
          The wide-window threshold controls when an explicit date range is
          flagged as suspicious. "Loud" signals appear in the email subject
          prefix; "muted" signals are hidden from the email entirely but
          still persisted on the audit row.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">
              Wide date window (days)
            </span>
            <Input
              value={daysInput}
              onChange={(e) => setDaysInput(e.target.value)}
              data-testid="input-risk-wide-days"
              inputMode="numeric"
              placeholder="90"
            />
          </label>
          <div className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Last updated</span>
            <div
              className="h-9 rounded border bg-muted/30 px-2 text-sm flex items-center"
              data-testid="text-risk-rules-updated"
            >
              {rules?.updatedAt
                ? `${new Date(rules.updatedAt).toLocaleString()}${
                    rules.updatedBy ? ` · ${rules.updatedBy}` : ""
                  }`
                : "Never"}
            </div>
          </div>
          <div className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Bounds</span>
            <div className="h-9 rounded border bg-muted/30 px-2 text-sm flex items-center">
              {bounds
                ? `${bounds.minWideDateWindowDays}–${bounds.maxWideDateWindowDays} days`
                : "—"}
            </div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded border p-2 space-y-2">
            <div className="text-xs uppercase text-muted-foreground">
              Loud signals (appear in email subject)
            </div>
            {allSignals.map((s) => (
              <label
                key={`loud-${s}`}
                className="flex items-center gap-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={loud.has(s)}
                  onChange={() => toggleLoud(s)}
                  data-testid={`checkbox-loud-${s}`}
                />
                <span>{RISK_SIGNAL_RULE_LABELS[s] ?? s}</span>
              </label>
            ))}
          </div>
          <div className="rounded border p-2 space-y-2">
            <div className="text-xs uppercase text-muted-foreground">
              Muted signals (hidden from email entirely)
            </div>
            {allSignals.map((s) => (
              <label
                key={`muted-${s}`}
                className="flex items-center gap-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={muted.has(s)}
                  onChange={() => toggleMuted(s)}
                  data-testid={`checkbox-muted-${s}`}
                />
                <span>{RISK_SIGNAL_RULE_LABELS[s] ?? s}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="rounded border p-2 space-y-2">
          <div className="text-xs uppercase text-muted-foreground">
            Sample signal set for preview
          </div>
          <p className="text-[11px] text-muted-foreground">
            Pretend an audit export tripped these signals, then click
            "Preview email" to see exactly what subject + body the current
            loud/muted choices would produce. No email is sent.
          </p>
          <div className="grid gap-1 sm:grid-cols-2 md:grid-cols-3">
            {allSignals.map((s) => (
              <label
                key={`sample-${s}`}
                className="flex items-center gap-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={sampleSignals.has(s)}
                  onChange={() => toggleSample(s)}
                  data-testid={`checkbox-sample-${s}`}
                />
                <span>{RISK_SIGNAL_RULE_LABELS[s] ?? s}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-risk-rules-save"
          >
            {saveMutation.isPending ? "Saving…" : "Save rules"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending}
            data-testid="button-risk-rules-preview-email"
          >
            {previewMutation.isPending ? "Building…" : "Preview email"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={resetToDefaults}
            data-testid="button-risk-rules-reset"
          >
            Reset to defaults
          </Button>
          {rules && (
            <Badge variant="outline" data-testid="badge-risk-rules-status">
              {rules.wideDateWindowDays}d · {rules.loudSignals.length} loud ·
              {" "}{rules.mutedSignals.length} muted
            </Badge>
          )}
          {saveNotice && (
            <span
              className="text-xs text-muted-foreground"
              data-testid="text-risk-rules-notice"
            >
              {saveNotice}
            </span>
          )}
          {saveError && (
            <span
              className="text-xs text-destructive"
              data-testid="text-risk-rules-error"
            >
              {saveError}
            </span>
          )}
        </div>
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Email preview</DialogTitle>
              <DialogDescription>
                Generated from the candidate rules + sample signal set. No
                email is sent.
              </DialogDescription>
            </DialogHeader>
            {previewError && (
              <div
                className="text-xs text-destructive"
                data-testid="text-risk-rules-preview-error"
              >
                {previewError}
              </div>
            )}
            {preview && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="text-[10px] uppercase text-muted-foreground">
                    Subject
                  </div>
                  <div
                    className="rounded border bg-muted/30 px-2 py-1 text-xs font-mono break-all"
                    data-testid="text-risk-rules-preview-subject"
                  >
                    {preview.subject}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 text-[11px]">
                  <div>
                    <div className="uppercase text-muted-foreground">
                      In subject ({preview.partition.subjectSignals.length})
                    </div>
                    <div data-testid="text-risk-rules-preview-subject-signals">
                      {preview.partition.subjectSignals.length > 0
                        ? preview.partition.subjectSignals.join(", ")
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="uppercase text-muted-foreground">
                      In body ({preview.partition.bodySignals.length})
                    </div>
                    <div data-testid="text-risk-rules-preview-body-signals">
                      {preview.partition.bodySignals.length > 0
                        ? preview.partition.bodySignals.join(", ")
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="uppercase text-muted-foreground">
                      Muted ({preview.partition.mutedFromEmail.length})
                    </div>
                    <div data-testid="text-risk-rules-preview-muted-signals">
                      {preview.partition.mutedFromEmail.length > 0
                        ? preview.partition.mutedFromEmail.join(", ")
                        : "—"}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] uppercase text-muted-foreground">
                    Body preview
                  </div>
                  <iframe
                    title="risk-signal-email-preview"
                    srcDoc={preview.html}
                    sandbox=""
                    className="w-full h-[480px] rounded border bg-white"
                    data-testid="iframe-risk-rules-preview-html"
                  />
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}


