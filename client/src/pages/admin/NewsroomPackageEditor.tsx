import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type {
  NewsroomPackage,
  NewsroomPackagePatch,
  NewsroomPackageStatus,
} from "@shared/newsroom-types";

type Status = NewsroomPackageStatus;

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
  return (
    <Badge variant={variant} data-testid={`badge-pkg-status-${s}`}>
      {s}
    </Badge>
  );
}

export default function NewsroomPackageEditorPage() {
  const [packages, setPackages] = useState<NewsroomPackage[]>([]);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewsroomPackage | null>(null);
  const [briefIdInput, setBriefIdInput] = useState("");
  const [savingMsg, setSavingMsg] = useState("");

  const refresh = async () => {
    const q = filter === "all" ? "" : `?status=${filter}`;
    const r = await api(`/api/admin/newsroom-packages${q}`);
    if (Array.isArray(r?.packages)) setPackages(r.packages);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    if (!selectedId) return;
    api(`/api/admin/newsroom-packages/${selectedId}`).then((r) => {
      if (r?.package) setDraft(r.package as NewsroomPackage);
    });
  }, [selectedId]);

  const selected = useMemo(
    () => packages.find((p) => p.id === selectedId) ?? draft,
    [packages, selectedId, draft],
  );

  const save = async (patch: NewsroomPackagePatch) => {
    if (!selectedId) return;
    setSavingMsg("Saving…");
    const r = await api(`/api/admin/newsroom-packages/${selectedId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (r?.package) {
      setDraft(r.package as NewsroomPackage);
      setSavingMsg("Saved");
      refresh();
    } else {
      setSavingMsg(r?.message ?? "Save failed");
    }
    setTimeout(() => setSavingMsg(""), 2000);
  };

  const approve = async () => {
    if (!selectedId) return;
    setSavingMsg("Approving…");
    const r = await api(`/api/admin/newsroom-packages/${selectedId}/approve`, {
      method: "POST",
    });
    if (r?.package) {
      setDraft(r.package as NewsroomPackage);
      setSavingMsg("Approved");
      refresh();
    } else {
      setSavingMsg(r?.message ?? "Approve failed");
    }
    setTimeout(() => setSavingMsg(""), 2000);
  };

  const buildFromBrief = async () => {
    if (!briefIdInput) return;
    setSavingMsg("Building…");
    const r = await api(
      `/api/admin/newsroom-packages/from-brief/${encodeURIComponent(briefIdInput.trim())}`,
      { method: "POST" },
    );
    if (r?.package) {
      setSavingMsg("Built");
      setSelectedId(r.package.id);
      setDraft(r.package);
      refresh();
    } else {
      setSavingMsg(r?.message ?? "Build failed");
    }
    setTimeout(() => setSavingMsg(""), 2500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold" data-testid="heading-newsroom-package-editor">
          Newsroom Package Editor
        </h1>
        <p className="text-sm text-muted-foreground">
          Admin-only. Maps an approved BroadcastBrief onto LED wall, panels,
          ticker, lower-third, teleprompter, camera plan, and{" "}
          <span className="text-amber-400">4D cue suggestions</span>. 4D cues
          are <strong>simulation only</strong> — no hardware is ever called.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Build from approved brief</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="brief-id">Brief ID (must be approved)</Label>
              <Input
                id="brief-id"
                value={briefIdInput}
                onChange={(e) => setBriefIdInput(e.target.value)}
                placeholder="brief_..."
                data-testid="input-brief-id"
              />
            </div>
            <Button
              onClick={buildFromBrief}
              disabled={!briefIdInput.trim()}
              data-testid="button-build-from-brief"
            >
              Build package
            </Button>
          </div>
          {savingMsg && (
            <div className="text-xs text-muted-foreground" data-testid="text-save-msg">
              {savingMsg}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        {(["all", "draft", "approved", "archived"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
            data-testid={`button-filter-${f}`}
          >
            {f}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={refresh}
          data-testid="button-refresh-packages"
        >
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Packages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[60vh] overflow-auto">
            {packages.length === 0 && (
              <div
                className="text-sm text-muted-foreground"
                data-testid="text-no-packages"
              >
                No packages yet.
              </div>
            )}
            {packages.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`w-full text-left rounded border p-2 text-sm hover:bg-muted/40 ${
                  selectedId === p.id ? "border-primary" : "border-white/10"
                }`}
                data-testid={`card-package-${p.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-medium">{p.lowerThird.primary}</div>
                  {statusBadge(p.status)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground truncate">
                  brief: {p.briefId}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          {!selected && (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Select a package on the left, or build one from a brief above.
              </CardContent>
            </Card>
          )}

          {selected && (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {selected.lowerThird.primary}
                    </CardTitle>
                    <div className="text-xs text-muted-foreground mt-1">
                      {selected.id} · brief {selected.briefId}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(selected.status)}
                    {selected.status === "draft" && (
                      <Button
                        size="sm"
                        onClick={approve}
                        data-testid="button-approve-package"
                      >
                        Approve
                      </Button>
                    )}
                    {selected.status === "approved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => save({ status: "archived" })}
                        data-testid="button-archive-package"
                      >
                        Archive
                      </Button>
                    )}
                  </div>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Ticker</CardTitle>
                </CardHeader>
                <CardContent>
                  <Input
                    value={selected.ticker}
                    onChange={(e) =>
                      setDraft({ ...(selected as NewsroomPackage), ticker: e.target.value })
                    }
                    onBlur={(e) => {
                      if (
                        e.target.value !==
                        packages.find((p) => p.id === selected.id)?.ticker
                      ) {
                        void save({ ticker: e.target.value });
                      }
                    }}
                    data-testid="input-ticker"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Lower Third</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Input
                    value={selected.lowerThird.primary}
                    onChange={(e) =>
                      setDraft({
                        ...(selected as NewsroomPackage),
                        lowerThird: { ...selected.lowerThird, primary: e.target.value },
                      })
                    }
                    onBlur={(e) =>
                      void save({
                        lowerThird: { ...selected.lowerThird, primary: e.target.value },
                      })
                    }
                    data-testid="input-lower-third-primary"
                  />
                  <Input
                    value={selected.lowerThird.secondary ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...(selected as NewsroomPackage),
                        lowerThird: {
                          ...selected.lowerThird,
                          secondary: e.target.value || null,
                        },
                      })
                    }
                    onBlur={(e) =>
                      void save({
                        lowerThird: {
                          ...selected.lowerThird,
                          secondary: e.target.value || null,
                        },
                      })
                    }
                    data-testid="input-lower-third-secondary"
                    placeholder="(optional secondary line)"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Teleprompter</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    rows={8}
                    value={selected.teleprompter}
                    onChange={(e) =>
                      setDraft({
                        ...(selected as NewsroomPackage),
                        teleprompter: e.target.value,
                      })
                    }
                    onBlur={(e) => void save({ teleprompter: e.target.value })}
                    data-testid="textarea-teleprompter"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">LED Wall</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div data-testid="section-led-bg">
                    <div className="text-xs text-muted-foreground mb-1">Background shots</div>
                    {selected.ledWall.backgroundShots.map((s, i) => (
                      <div key={i} className="rounded border border-white/10 px-2 py-1 text-xs">
                        {s}
                      </div>
                    ))}
                  </div>
                  <div data-testid="section-led-broll">
                    <div className="text-xs text-muted-foreground mb-1">B-roll references</div>
                    {selected.ledWall.bRollReferences.map((s, i) => (
                      <div key={i} className="rounded border border-white/10 px-2 py-1 text-xs">
                        {s}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selected.ledWall.safetyLabels.map((l, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        data-testid={`badge-led-label-${l}`}
                      >
                        {l}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Source Panel</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {selected.sourcePanel.sources.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded border border-white/10 px-2 py-1"
                      data-testid={`row-source-${i}`}
                    >
                      <span>{s.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {s.kind}
                      </Badge>
                    </div>
                  ))}
                  <div className="text-xs text-muted-foreground">
                    Distinct entities: {selected.sourcePanel.distinctEntityCount}
                  </div>
                  {selected.sourcePanel.notes.map((n, i) => (
                    <div key={i} className="text-xs text-amber-400">
                      {n}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Confidence Panel</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge data-testid="badge-confidence-label">
                      confidence: {selected.confidencePanel.label}
                    </Badge>
                    <Badge variant="outline">
                      impact: {selected.confidencePanel.impactScore}
                    </Badge>
                    {selected.confidencePanel.breakingNews && (
                      <Badge variant="destructive">BREAKING</Badge>
                    )}
                  </div>
                  {selected.confidencePanel.cautions.map((c, i) => (
                    <div key={i} className="text-xs text-amber-400">
                      {c}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Claims / Timeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {selected.claimsTimeline.beats.map((b, i) => (
                    <div
                      key={i}
                      className="rounded border border-white/10 p-2"
                      data-testid={`row-beat-${b.kind}`}
                    >
                      <div className="text-xs uppercase text-muted-foreground">{b.kind}</div>
                      <div>{b.text}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    Camera Plan ({selected.cameraPlan.anchorMode})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {selected.cameraPlan.shots.map((s, i) => (
                    <div
                      key={i}
                      className="rounded border border-white/10 px-2 py-1"
                      data-testid={`row-shot-${s.name}`}
                    >
                      <div className="text-xs font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.description}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    4D Cue Suggestions
                    <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/40">
                      simulation only
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-xs text-muted-foreground" data-testid="text-4d-disclaimer">
                    These cues are <strong>suggestions only</strong>. No hardware is ever
                    triggered. Downstream layers may visualize them in the preview but
                    cannot dispatch them to physical devices.
                  </p>
                  {selected.fourDCues.map((c) => (
                    <div
                      key={c.id}
                      className="rounded border border-amber-400/30 bg-amber-400/5 p-2 text-xs"
                      data-testid={`row-4d-cue-${c.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{c.beat}</Badge>
                        <Badge variant="outline">{c.kind}</Badge>
                        <Badge variant="outline">{c.intensity}</Badge>
                        <Badge
                          variant="outline"
                          className="text-amber-400 border-amber-400/40"
                        >
                          simulationOnly
                        </Badge>
                      </div>
                      <div className="mt-1 text-muted-foreground">{c.reason}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
