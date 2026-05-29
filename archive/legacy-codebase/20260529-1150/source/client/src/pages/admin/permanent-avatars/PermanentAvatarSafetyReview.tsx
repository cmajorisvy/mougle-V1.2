import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PermanentAvatar, PermanentAvatarSafetyBadges } from "./shared";

type DetailResponse = { ok: boolean; permanentAvatar: PermanentAvatar };

const SAFETY_CHECKS = [
  { key: "anatomy_plausible", label: "Body + rig combination is anatomically plausible (verified on rig preview)" },
  { key: "no_nudity", label: "No nudity or sexually explicit content" },
  { key: "no_real_celebrity", label: "No real-celebrity likeness without explicit founder note" },
  { key: "no_protected_likeness", label: "No protected likeness use (minors, deceased public figures, etc.)" },
  { key: "persona_appropriate", label: "Persona summary is admin-appropriate" },
];

export default function PermanentAvatarSafetyReview() {
  const [, params] = useRoute<{ id: string }>("/admin/permanent-avatars/:id/safety-review");
  const id = params?.id ?? "";
  const [, navigate] = useLocation();
  const url = `/api/admin/permanent-avatars/${id}`;

  const { data, isLoading, error } = useQuery<DetailResponse>({
    queryKey: [url],
    enabled: !!id,
  });

  const [decision, setDecision] = useState<string>("approved_internal");
  const [note, setNote] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.permanentAvatar) return;
    if (
      data.permanentAvatar.safetyReview &&
      data.permanentAvatar.safetyReview !== "pending"
    ) {
      setDecision(data.permanentAvatar.safetyReview);
    }
    if (data.permanentAvatar.safetyReviewNote) {
      setNote(data.permanentAvatar.safetyReviewNote);
    }
  }, [data?.permanentAvatar]);

  const allChecked = SAFETY_CHECKS.every((c) => checks[c.key]);
  const canSubmit = !pending && (decision !== "approved_internal" || allChecked);

  async function submit() {
    setPending(true);
    setFeedback(null);
    try {
      const res = await apiRequest(
        "POST",
        `/api/admin/permanent-avatars/${id}/safety-review`,
        { decision, note: note.trim() || undefined },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setFeedback(json?.message || `Submit failed (HTTP ${res.status})`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: [url] });
      setFeedback("Saved. Returning to detail…");
      setTimeout(() => navigate(`/admin/permanent-avatars/${id}`), 600);
    } catch (err: any) {
      setFeedback(err?.message || "Submit failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="page-permanent-avatars-safety-review">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href={`/admin/permanent-avatars/${id}`}>
            <Button variant="ghost" size="sm" data-testid="button-back-to-detail">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to permanent avatar
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              Safety review
            </CardTitle>
            {data?.permanentAvatar && (
              <p className="mt-1 text-sm text-muted-foreground">
                Avatar: <span className="text-foreground">{data.permanentAvatar.displayName}</span> ·{" "}
                <Badge variant="outline" data-testid="pill-current-safety-review">
                  {data.permanentAvatar.safetyReview}
                </Badge>
              </p>
            )}
          </CardHeader>
          <CardContent>
            <PermanentAvatarSafetyBadges />

            {isLoading ? (
              <div className="py-6 text-sm text-muted-foreground" data-testid="text-loading">Loading…</div>
            ) : error ? (
              <div className="py-6 text-sm text-destructive" data-testid="text-error">
                Failed to load: {(error as Error).message}
              </div>
            ) : (
              <div className="space-y-5">
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
                    <Label htmlFor="input-safety-note">Note</Label>
                    <Textarea
                      id="input-safety-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
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

                <Button onClick={submit} disabled={!canSubmit} data-testid="button-submit-safety-review">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Save safety decision
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
