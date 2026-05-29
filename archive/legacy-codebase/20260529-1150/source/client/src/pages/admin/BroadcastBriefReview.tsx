import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status = "draft" | "approved" | "archived";
type Impact = "high" | "medium" | "low";
type Mood = "neutral" | "urgent" | "celebratory" | "somber" | "analytical" | "investigative";
type AnchorMode = "solo_desk" | "two_anchor" | "reporter_remote" | "studio_panel" | "voiceover_only";

interface Brief {
  id: string;
  storyId: string;
  articleId: number | null;
  dataPackageId: string;
  verifiedKnowledgeId: string;
  headline: string;
  summary: string;
  location: { city: string | null; country: string | null; lat: number | null; lon: number | null };
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  eventType: string;
  entities: { name: string; kind: string }[];
  mood: Mood;
  impactScore: Impact;
  breakingNews: boolean;
  scriptBeats: { coldOpen: string; keyFacts: string; context: string; signOff: string };
  visualNeeds: { coldOpen: string[]; keyFacts: string[]; context: string[]; signOff: string[] };
  bRollNeeds: string[];
  mapNeeds: { needsMap: boolean; focus: string | null; zoomHint: string };
  anchorMode: AnchorMode;
  sensitivity: Record<string, boolean | string[]>;
  rightsFlags: { hasRestrictions: boolean; notes: string[] };
  approvalStatus: Status;
  visibility: "admin_only_internal";
  publicUrl: null;
  signedUrl: null;
  realSendAllowed: false;
  executionEnabled: false;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function getCsrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": getCsrfToken(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  return r.json();
}

function statusBadge(s: Status) {
  const variant: "default" | "secondary" | "outline" =
    s === "approved" ? "default" : s === "draft" ? "secondary" : "outline";
  return <Badge variant={variant} data-testid={`badge-status-${s}`}>{s}</Badge>;
}

export default function BroadcastBriefReviewPage() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Brief | null>(null);
  const [savingMsg, setSavingMsg] = useState<string>("");

  const refresh = async () => {
    const q = filter === "all" ? "" : `?approvalStatus=${filter}`;
    const r = await api(`/api/admin/newsroom/broadcast-brief/history${q}`);
    if (Array.isArray(r?.briefs)) setBriefs(r.briefs);
  };

  useEffect(() => {
    refresh();
  }, [filter]);

  useEffect(() => {
    if (!selectedId) return;
    api(`/api/admin/newsroom/broadcast-brief/${selectedId}`).then((r) => {
      if (r?.brief) setDraft(r.brief as Brief);
    });
  }, [selectedId]);

  const selected = useMemo(
    () => briefs.find((b) => b.id === selectedId) ?? draft,
    [briefs, selectedId, draft],
  );

  const save = async (patch: Partial<Brief>) => {
    if (!selectedId) return;
    setSavingMsg("Saving…");
    const r = await api(`/api/admin/newsroom/broadcast-brief/${selectedId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (r?.brief) {
      setDraft(r.brief as Brief);
      setSavingMsg("Saved");
      refresh();
    } else {
      setSavingMsg(r?.message ?? "Save failed");
    }
    setTimeout(() => setSavingMsg(""), 2000);
  };

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-broadcast-briefs">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Broadcast Brief Review</h1>
          <p className="text-sm text-muted-foreground">
            Every verified story drafts a brief here. Briefs are admin-only, internal-only, and never auto-publish.
          </p>
        </div>
        <div className="flex gap-2">
          {(["all", "draft", "approved", "archived"] as const).map((s) => (
            <Button
              key={s}
              variant={filter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(s)}
              data-testid={`button-filter-${s}`}
            >
              {s}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={refresh} data-testid="button-refresh">
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Briefs</CardTitle>
            <CardDescription data-testid="text-brief-count">{briefs.length} total</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
            {briefs.length === 0 && (
              <p className="text-sm text-muted-foreground" data-testid="text-empty">No briefs yet.</p>
            )}
            {briefs.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedId(b.id)}
                className={`w-full text-left p-3 rounded border hover-elevate ${
                  selectedId === b.id ? "border-primary" : "border-border"
                }`}
                data-testid={`button-brief-${b.id}`}
              >
                <div className="flex items-center justify-between mb-1">
                  {statusBadge(b.approvalStatus)}
                  <div className="flex gap-1">
                    {b.breakingNews && <Badge variant="destructive" data-testid={`badge-breaking-${b.id}`}>BREAKING</Badge>}
                    <Badge variant="outline" data-testid={`badge-impact-${b.id}`}>{b.impactScore}</Badge>
                  </div>
                </div>
                <div className="text-sm font-medium line-clamp-2" data-testid={`text-headline-${b.id}`}>
                  {b.headline}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {b.eventType} · {b.location.city || b.country || b.region || "—"}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle data-testid="text-detail-title">
              {selected ? selected.headline : "Select a brief"}
            </CardTitle>
            {selected && (
              <CardDescription>
                {statusBadge(selected.approvalStatus)} · storyId={selected.storyId} · dataPackageId={selected.dataPackageId}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected && (
              <p className="text-sm text-muted-foreground">Pick a brief on the left to review.</p>
            )}
            {selected && (
              <>
                <div>
                  <Label>Headline</Label>
                  <Input
                    value={selected.headline}
                    onChange={(e) => setDraft({ ...selected, headline: e.target.value })}
                    data-testid="input-headline"
                  />
                </div>
                <div>
                  <Label>Summary</Label>
                  <Textarea
                    rows={3}
                    value={selected.summary}
                    onChange={(e) => setDraft({ ...selected, summary: e.target.value })}
                    data-testid="textarea-summary"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>City</Label>
                    <Input
                      value={selected.location.city ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...selected,
                          location: { ...selected.location, city: e.target.value || null },
                        })
                      }
                      data-testid="input-city"
                    />
                  </div>
                  <div>
                    <Label>Region</Label>
                    <Input
                      value={selected.region ?? ""}
                      onChange={(e) => setDraft({ ...selected, region: e.target.value || null })}
                      data-testid="input-region"
                    />
                  </div>
                  <div>
                    <Label>Country</Label>
                    <Input
                      value={selected.country ?? ""}
                      onChange={(e) => setDraft({ ...selected, country: e.target.value || null })}
                      data-testid="input-country"
                    />
                  </div>
                  <div>
                    <Label>Event type</Label>
                    <Input
                      value={selected.eventType}
                      onChange={(e) => setDraft({ ...selected, eventType: e.target.value })}
                      data-testid="input-event-type"
                    />
                  </div>
                  <div>
                    <Label>Mood</Label>
                    <select
                      className="w-full border rounded h-9 px-2 bg-background"
                      value={selected.mood}
                      onChange={(e) => setDraft({ ...selected, mood: e.target.value as Mood })}
                      data-testid="select-mood"
                    >
                      {(["neutral", "urgent", "celebratory", "somber", "analytical", "investigative"] as Mood[]).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Impact</Label>
                    <select
                      className="w-full border rounded h-9 px-2 bg-background"
                      value={selected.impactScore}
                      onChange={(e) => setDraft({ ...selected, impactScore: e.target.value as Impact })}
                      data-testid="select-impact"
                    >
                      {(["high", "medium", "low"] as Impact[]).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Anchor mode</Label>
                    <select
                      className="w-full border rounded h-9 px-2 bg-background"
                      value={selected.anchorMode}
                      onChange={(e) => setDraft({ ...selected, anchorMode: e.target.value as AnchorMode })}
                      data-testid="select-anchor-mode"
                    >
                      {(["solo_desk", "two_anchor", "reporter_remote", "studio_panel", "voiceover_only"] as AnchorMode[]).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end gap-2">
                    <input
                      id="brk"
                      type="checkbox"
                      checked={selected.breakingNews}
                      onChange={(e) => setDraft({ ...selected, breakingNews: e.target.checked })}
                      data-testid="checkbox-breaking"
                    />
                    <Label htmlFor="brk">Breaking news</Label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Cold open</Label>
                  <Textarea
                    rows={2}
                    value={selected.scriptBeats.coldOpen}
                    onChange={(e) => setDraft({ ...selected, scriptBeats: { ...selected.scriptBeats, coldOpen: e.target.value } })}
                    data-testid="textarea-cold-open"
                  />
                  <Label>Key facts</Label>
                  <Textarea
                    rows={3}
                    value={selected.scriptBeats.keyFacts}
                    onChange={(e) => setDraft({ ...selected, scriptBeats: { ...selected.scriptBeats, keyFacts: e.target.value } })}
                    data-testid="textarea-key-facts"
                  />
                  <Label>Context</Label>
                  <Textarea
                    rows={3}
                    value={selected.scriptBeats.context}
                    onChange={(e) => setDraft({ ...selected, scriptBeats: { ...selected.scriptBeats, context: e.target.value } })}
                    data-testid="textarea-context"
                  />
                  <Label>Sign-off</Label>
                  <Textarea
                    rows={2}
                    value={selected.scriptBeats.signOff}
                    onChange={(e) => setDraft({ ...selected, scriptBeats: { ...selected.scriptBeats, signOff: e.target.value } })}
                    data-testid="textarea-sign-off"
                  />
                </div>

                <details className="border rounded p-3">
                  <summary className="text-sm font-medium cursor-pointer">Visual / B-roll / Map / Sensitivity / Rights (JSON)</summary>
                  <div className="space-y-3 pt-3">
                    <div>
                      <Label>Visual needs</Label>
                      <Textarea
                        rows={4}
                        value={JSON.stringify(selected.visualNeeds, null, 2)}
                        onChange={(e) => { try { setDraft({ ...selected, visualNeeds: JSON.parse(e.target.value) }); } catch {} }}
                        data-testid="textarea-visual-needs"
                      />
                    </div>
                    <div>
                      <Label>B-roll needs</Label>
                      <Textarea
                        rows={3}
                        value={JSON.stringify(selected.bRollNeeds, null, 2)}
                        onChange={(e) => { try { setDraft({ ...selected, bRollNeeds: JSON.parse(e.target.value) }); } catch {} }}
                        data-testid="textarea-broll-needs"
                      />
                    </div>
                    <div>
                      <Label>Map needs</Label>
                      <Textarea
                        rows={3}
                        value={JSON.stringify(selected.mapNeeds, null, 2)}
                        onChange={(e) => { try { setDraft({ ...selected, mapNeeds: JSON.parse(e.target.value) }); } catch {} }}
                        data-testid="textarea-map-needs"
                      />
                    </div>
                    <div>
                      <Label>Sensitivity</Label>
                      <Textarea
                        rows={4}
                        value={JSON.stringify(selected.sensitivity, null, 2)}
                        onChange={(e) => { try { setDraft({ ...selected, sensitivity: JSON.parse(e.target.value) }); } catch {} }}
                        data-testid="textarea-sensitivity"
                      />
                    </div>
                    <div>
                      <Label>Rights flags</Label>
                      <Textarea
                        rows={3}
                        value={JSON.stringify(selected.rightsFlags, null, 2)}
                        onChange={(e) => { try { setDraft({ ...selected, rightsFlags: JSON.parse(e.target.value) }); } catch {} }}
                        data-testid="textarea-rights-flags"
                      />
                    </div>
                    <div>
                      <Label>Entities</Label>
                      <Textarea
                        rows={3}
                        value={JSON.stringify(selected.entities, null, 2)}
                        onChange={(e) => { try { setDraft({ ...selected, entities: JSON.parse(e.target.value) }); } catch {} }}
                        data-testid="textarea-entities"
                      />
                    </div>
                  </div>
                </details>

                <div className="bg-muted/50 rounded p-3 text-xs space-y-1" data-testid="safety-footer">
                  <div>visibility: <strong>{selected.visibility}</strong></div>
                  <div>publicUrl: <strong>{String(selected.publicUrl)}</strong> · signedUrl: <strong>{String(selected.signedUrl)}</strong></div>
                  <div>realSendAllowed: <strong>{String(selected.realSendAllowed)}</strong> · executionEnabled: <strong>{String(selected.executionEnabled)}</strong></div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t">
                  <Button
                    onClick={() =>
                      save({
                        headline: selected.headline,
                        summary: selected.summary,
                        location: selected.location,
                        region: selected.region,
                        country: selected.country,
                        latitude: selected.latitude,
                        longitude: selected.longitude,
                        eventType: selected.eventType,
                        entities: selected.entities as any,
                        mood: selected.mood,
                        impactScore: selected.impactScore,
                        breakingNews: selected.breakingNews,
                        scriptBeats: selected.scriptBeats,
                        visualNeeds: selected.visualNeeds,
                        bRollNeeds: selected.bRollNeeds,
                        mapNeeds: selected.mapNeeds as any,
                        anchorMode: selected.anchorMode,
                        sensitivity: selected.sensitivity as any,
                        rightsFlags: selected.rightsFlags,
                      })
                    }
                    data-testid="button-save-edits"
                  >
                    Save edits
                  </Button>
                  <Button
                    variant="default"
                    disabled={selected.approvalStatus === "approved"}
                    onClick={() => save({ approvalStatus: "approved" })}
                    data-testid="button-approve"
                  >
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    disabled={selected.approvalStatus === "draft"}
                    onClick={() => save({ approvalStatus: "draft" })}
                    data-testid="button-revert-draft"
                  >
                    Back to draft
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={selected.approvalStatus === "archived"}
                    onClick={() => save({ approvalStatus: "archived" })}
                    data-testid="button-archive"
                  >
                    Archive
                  </Button>
                  {savingMsg && (
                    <span className="text-sm text-muted-foreground" data-testid="text-saving">
                      {savingMsg}
                    </span>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
