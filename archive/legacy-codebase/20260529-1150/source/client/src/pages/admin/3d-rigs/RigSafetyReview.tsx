import { useEffect, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RigSafetyBadges } from "./safety-badges";

const LICENSE_VALUES = [
  "unknown",
  "internal_only",
  "cc0",
  "cc_by",
  "proprietary_licensed",
  "unlicensed_rejected",
] as const;

const SAFETY_CHECKS = [
  { key: "no_external_uri", label: "No external image / texture URIs" },
  { key: "no_required_extensions", label: "No required GLTF extensions outside the allow-list" },
  { key: "complexity_within_caps", label: "Complexity within caps (≤200 nodes/meshes, ≤2000 accessors/bufferViews)" },
  { key: "size_within_cap", label: "Total size ≤ 25 MB" },
  { key: "no_objectionable_content", label: "No objectionable or rights-encumbered visual content" },
  { key: "license_source_recorded", label: "License source/origin recorded" },
];

type Rig = {
  id: string;
  name: string;
  licenseStatus: string;
  licenseSource: string | null;
  licenseNote: string | null;
  safetyReview: string;
  safetyNote: string | null;
  approvalGate: string;
};

type DetailResponse = { ok: boolean; rig: Rig };

export default function RigSafetyReview() {
  const [, params] = useRoute<{ id: string }>("/admin/3d-rigs/:id/safety-review");
  const id = params?.id ?? "";
  const [, navigate] = useLocation();
  const url = `/api/admin/production-rigs/${id}`;

  const { data, isLoading, error } = useQuery<DetailResponse>({
    queryKey: [url],
    enabled: !!id,
  });

  const [licenseStatus, setLicenseStatus] = useState<string>("unknown");
  const [licenseSource, setLicenseSource] = useState("");
  const [licenseNote, setLicenseNote] = useState("");
  const [decision, setDecision] = useState<string>("approved_internal");
  const [safetyNote, setSafetyNote] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.rig) return;
    setLicenseStatus(data.rig.licenseStatus || "unknown");
    setLicenseSource(data.rig.licenseSource ?? "");
    setLicenseNote(data.rig.licenseNote ?? "");
    setSafetyNote(data.rig.safetyNote ?? "");
    if (data.rig.safetyReview && data.rig.safetyReview !== "pending") {
      setDecision(data.rig.safetyReview);
    }
  }, [data?.rig]);

  async function submit() {
    if (!id) return;
    setPending(true);
    setFeedback(null);
    try {
      const licRes = await apiRequest(
        "POST",
        `/api/admin/production-rigs/${id}/license`,
        {
          licenseStatus,
          licenseSource: licenseSource.trim() || undefined,
          licenseNote: licenseNote.trim() || undefined,
        },
      );
      const licJson = await licRes.json().catch(() => ({}));
      if (!licRes.ok || !licJson?.ok) {
        setFeedback(licJson?.message || `License update failed (HTTP ${licRes.status})`);
        return;
      }
      const safRes = await apiRequest(
        "POST",
        `/api/admin/production-rigs/${id}/safety-review`,
        {
          decision,
          note: safetyNote.trim() || undefined,
        },
      );
      const safJson = await safRes.json().catch(() => ({}));
      if (!safRes.ok || !safJson?.ok) {
        setFeedback(safJson?.message || `Safety review failed (HTTP ${safRes.status})`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: [url] });
      setFeedback("Saved. Returning to detail…");
      setTimeout(() => navigate(`/admin/3d-rigs/${id}`), 600);
    } catch (err: any) {
      setFeedback(err?.message || "Save failed");
    } finally {
      setPending(false);
    }
  }

  const allChecked = SAFETY_CHECKS.every((c) => checks[c.key]);
  const canSubmit = !pending && (decision !== "approved_internal" || allChecked);

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="page-3d-rigs-safety-review">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href={`/admin/3d-rigs/${id}`}>
            <Button variant="ghost" size="sm" data-testid="button-back-to-detail">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to rig
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              License + safety review
            </CardTitle>
            {data?.rig && (
              <p className="mt-1 text-sm text-muted-foreground">
                Rig: <span className="text-foreground">{data.rig.name}</span> ·{" "}
                <Badge variant="outline" data-testid="pill-current-safety">{data.rig.safetyReview}</Badge>{" "}
                <Badge variant="outline" data-testid="pill-current-gate">{data.rig.approvalGate}</Badge>
              </p>
            )}
          </CardHeader>
          <CardContent>
            <RigSafetyBadges />

            {isLoading ? (
              <div className="py-6 text-sm text-muted-foreground" data-testid="text-loading">Loading…</div>
            ) : error ? (
              <div className="py-6 text-sm text-destructive" data-testid="text-error">
                Failed to load: {(error as Error).message}
              </div>
            ) : (
              <div className="space-y-5">
                <section className="space-y-3 rounded border border-border p-4">
                  <h3 className="text-sm font-semibold">License</h3>
                  <div>
                    <Label htmlFor="select-license-status">License status</Label>
                    <Select value={licenseStatus} onValueChange={setLicenseStatus}>
                      <SelectTrigger id="select-license-status" data-testid="select-license-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LICENSE_VALUES.map((l) => (
                          <SelectItem key={l} value={l} data-testid={`select-license-status-option-${l}`}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="input-license-source">License source</Label>
                    <Input
                      id="input-license-source"
                      value={licenseSource}
                      onChange={(e) => setLicenseSource(e.target.value)}
                      placeholder="URL or origin"
                      data-testid="input-license-source"
                    />
                  </div>
                  <div>
                    <Label htmlFor="input-license-note">License note</Label>
                    <Textarea
                      id="input-license-note"
                      value={licenseNote}
                      onChange={(e) => setLicenseNote(e.target.value)}
                      rows={2}
                      data-testid="input-license-note"
                    />
                  </div>
                </section>

                <section className="space-y-3 rounded border border-border p-4">
                  <h3 className="text-sm font-semibold">Safety checklist</h3>
                  <ul className="space-y-2 text-sm" data-testid="safety-checklist">
                    {SAFETY_CHECKS.map((c) => (
                      <li key={c.key} className="flex items-start gap-2">
                        <input
                          id={`check-${c.key}`}
                          type="checkbox"
                          className="mt-0.5"
                          checked={!!checks[c.key]}
                          onChange={(e) =>
                            setChecks((prev) => ({ ...prev, [c.key]: e.target.checked }))
                          }
                          data-testid={`checkbox-${c.key}`}
                        />
                        <Label htmlFor={`check-${c.key}`} className="cursor-pointer">{c.label}</Label>
                      </li>
                    ))}
                  </ul>
                  {!allChecked && decision === "approved_internal" && (
                    <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="text-checklist-warning">
                      All checks must be confirmed before approving internally.
                    </p>
                  )}
                </section>

                <section className="space-y-3 rounded border border-border p-4">
                  <h3 className="text-sm font-semibold">Decision</h3>
                  <RadioGroup value={decision} onValueChange={setDecision} data-testid="radio-decision-group">
                    {["approved_internal", "needs_changes", "rejected"].map((v) => (
                      <div key={v} className="flex items-center gap-2">
                        <RadioGroupItem value={v} id={`radio-decision-${v}`} data-testid={`radio-decision-${v}`} />
                        <Label htmlFor={`radio-decision-${v}`} className="cursor-pointer">{v}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                  <div>
                    <Label htmlFor="input-safety-note">Safety note</Label>
                    <Textarea
                      id="input-safety-note"
                      value={safetyNote}
                      onChange={(e) => setSafetyNote(e.target.value)}
                      rows={3}
                      placeholder="Reasoning, follow-up, or rejection cause"
                      data-testid="input-safety-note"
                    />
                  </div>
                </section>

                {feedback && (
                  <div
                    className="rounded border border-border bg-muted/30 px-3 py-2 text-sm"
                    data-testid="text-submit-feedback"
                  >
                    {feedback}
                  </div>
                )}

                <Button
                  onClick={submit}
                  disabled={!canSubmit}
                  data-testid="button-submit-safety-review"
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Save license + safety decision
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
