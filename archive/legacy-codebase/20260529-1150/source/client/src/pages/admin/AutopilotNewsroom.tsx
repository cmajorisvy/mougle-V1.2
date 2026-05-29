import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Mode = "manual" | "autopilot_preview" | "autopilot_internal_playout" | "autopilot_public_publish";

interface Status {
  settings: { mode: Mode; killSwitchEngaged: boolean; minConfidence: number; minSourceCount: number; allowDevelopingInternalOnly: boolean; fallbackEnabled: boolean };
  schedule: { enabled: boolean; mode: Mode; cycleIntervalMs: number; maxItemsPerCycle: number; lastCycleAt: string | null; lastCycleProcessed: number; consecutiveFailures: number };
  envelope: Record<string, boolean>;
  flags: { autopilotFeatureEnabled: boolean; internalPlayoutFeatureEnabled: boolean; publicPublishFeatureEnabled: boolean; providerCallsAllowed: boolean; unrealSendAllowed: boolean; fourDSendAllowed: boolean };
  running: boolean;
  queueSize: number;
  playoutCount: number;
  auditCount: number;
}

async function jsonFetch(path: string, init?: RequestInit) {
  const r = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  return r.json();
}

export default function AutopilotNewsroomPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [playout, setPlayout] = useState<any[]>([]);
  const [storyJson, setStoryJson] = useState<string>(
    JSON.stringify(
      { storyId: "s1", headline: "Demo headline", script: "Verified script body.", status: "verified", disputed: false, correctionSafe: false, confidence: 0.9, sourceCount: 3, categories: ["climate"], rightsBlocked: false, involvesMinors: false, ageMs: 60000 },
      null,
      2,
    ),
  );
  const [evalResult, setEvalResult] = useState<any>(null);

  const refresh = async () => {
    const [s, q, a] = await Promise.all([
      jsonFetch("/api/admin/autopilot/status"),
      jsonFetch("/api/admin/autopilot/queue"),
      jsonFetch("/api/admin/autopilot/audit?limit=50"),
    ]);
    if (s?.status) setStatus(s.status as Status);
    if (Array.isArray(q?.queue)) setQueue(q.queue);
    if (Array.isArray(q?.playout)) setPlayout(q.playout);
    if (Array.isArray(a?.events)) setAudit(a.events);
  };

  useEffect(() => {
    refresh();
  }, []);

  const setMode = async (mode: Mode) => {
    await jsonFetch("/api/admin/autopilot/settings", { method: "POST", body: JSON.stringify({ mode }) });
    refresh();
  };
  const toggleKill = async (engaged: boolean) => {
    await jsonFetch("/api/admin/autopilot/kill-switch", { method: "POST", body: JSON.stringify({ engaged, reason: "admin_toggle" }) });
    refresh();
  };
  const startSched = async () => {
    await jsonFetch("/api/admin/autopilot/start", { method: "POST", body: "{}" });
    refresh();
  };
  const stopSched = async () => {
    await jsonFetch("/api/admin/autopilot/stop", { method: "POST", body: "{}" });
    refresh();
  };
  const evaluate = async () => {
    try {
      const parsed = JSON.parse(storyJson);
      const r = await jsonFetch("/api/admin/autopilot/evaluate", { method: "POST", body: JSON.stringify({ story: parsed }) });
      setEvalResult(r);
    } catch (e) {
      setEvalResult({ ok: false, error: String((e as Error).message || e) });
    }
  };
  const exportAudit = () => {
    const blob = new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `autopilot-audit-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const envelopeFalseKeys = useMemo(
    () => (status ? Object.entries(status.envelope).filter(([_, v]) => v === false).map(([k]) => k) : []),
    [status],
  );

  return (
    <div className="p-6 space-y-6" data-testid="autopilot-newsroom-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Autopilot Newsroom</h1>
          <p className="text-sm text-muted-foreground">
            24/7 internal-only planning + playout. No public publishing, no YouTube, no social, no live streaming. No real Unreal / 4D commands.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh} data-testid="button-refresh">Refresh</Button>
          <Button variant="outline" onClick={exportAudit} data-testid="button-export-audit">Export audit JSON</Button>
        </div>
      </div>

      {/* 1. Autopilot status + 11. Safety gates summary */}
      <Card data-testid="card-status">
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>Live view of mode, schedule, and safety envelope.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!status && <div>Loading…</div>}
          {status && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Badge variant={status.running ? "default" : "secondary"} data-testid="badge-running">{status.running ? "running" : "stopped"}</Badge>
              <Badge variant="outline" data-testid="badge-mode">mode: {status.settings.mode}</Badge>
              <Badge variant={status.settings.killSwitchEngaged ? "destructive" : "outline"} data-testid="badge-kill">kill: {String(status.settings.killSwitchEngaged)}</Badge>
              <Badge variant="outline" data-testid="badge-queue">queue: {status.queueSize}</Badge>
              <Badge variant="outline" data-testid="badge-playout">playout: {status.playoutCount}</Badge>
              <Badge variant="outline" data-testid="badge-audit">audit: {status.auditCount}</Badge>
              <Badge variant="outline" data-testid="badge-flag-feature">flag autopilot: {String(status.flags.autopilotFeatureEnabled)}</Badge>
              <Badge variant="outline" data-testid="badge-flag-internal">flag internal: {String(status.flags.internalPlayoutFeatureEnabled)}</Badge>
            </div>
          )}
          {status && (
            <div className="text-xs text-muted-foreground">
              Locked-false: {envelopeFalseKeys.join(", ")}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Mode selector + 3. Kill switch + 4. Schedule controls */}
      <Card data-testid="card-controls">
        <CardHeader>
          <CardTitle>Controls</CardTitle>
          <CardDescription>Mode selector, kill switch, and 24/7 schedule.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setMode("manual")} data-testid="button-mode-manual">Manual</Button>
            <Button onClick={() => setMode("autopilot_preview")} data-testid="button-mode-preview">Preview</Button>
            <Button onClick={() => setMode("autopilot_internal_playout")} data-testid="button-mode-internal">Internal 24/7</Button>
            <Button variant="outline" disabled title="permanently disabled" data-testid="button-mode-public-disabled">Public publish (disabled)</Button>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="kill">Kill switch</Label>
            <Switch
              id="kill"
              checked={!!status?.settings.killSwitchEngaged}
              onCheckedChange={(v) => toggleKill(!!v)}
              data-testid="switch-kill"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={startSched} data-testid="button-start">Start preview autopilot</Button>
            <Button variant="outline" onClick={stopSched} data-testid="button-stop">Stop autopilot</Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="evaluate" className="w-full">
        <TabsList>
          <TabsTrigger value="evaluate" data-testid="tab-evaluate">Evaluate</TabsTrigger>
          <TabsTrigger value="queues" data-testid="tab-queues">Queues</TabsTrigger>
          <TabsTrigger value="rooms" data-testid="tab-rooms">Rooms</TabsTrigger>
          <TabsTrigger value="future" data-testid="tab-future">Unreal/4D</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit</TabsTrigger>
          <TabsTrigger value="fallback" data-testid="tab-fallback">Fallback</TabsTrigger>
        </TabsList>

        <TabsContent value="evaluate">
          <Card>
            <CardHeader>
              <CardTitle>Evaluate a story</CardTitle>
              <CardDescription>Runs the deterministic decision service. No render, no DB write, no provider calls.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={storyJson} onChange={(e) => setStoryJson(e.target.value)} rows={12} data-testid="textarea-story-json" />
              <Button onClick={evaluate} data-testid="button-evaluate">Evaluate</Button>
              {evalResult && (
                <pre className="text-xs bg-muted p-3 rounded max-h-96 overflow-auto" data-testid="pre-eval-result">
                  {JSON.stringify(evalResult, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queues">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card data-testid="card-source-queue">
              <CardHeader><CardTitle>5. Source ingestion queue</CardTitle></CardHeader>
              <CardContent className="text-sm">{queue.filter((q) => q.stage === "source_ingestion").length} pending</CardContent>
            </Card>
            <Card data-testid="card-verified-queue">
              <CardHeader><CardTitle>6. Verified newsroom queue</CardTitle></CardHeader>
              <CardContent className="text-sm">{queue.filter((q) => q.stage === "verified_newsroom").length} pending</CardContent>
            </Card>
            <Card data-testid="card-reader-queue">
              <CardHeader><CardTitle>7. Newsroom reader queue</CardTitle></CardHeader>
              <CardContent className="text-sm">{playout.filter((p) => p.kind === "newsroom_reader").length} planned</CardContent>
            </Card>
            <Card data-testid="card-podcast-queue">
              <CardHeader><CardTitle>8. Podcast room queue</CardTitle></CardHeader>
              <CardContent className="text-sm">{playout.filter((p) => p.kind === "podcast_room").length} planned</CardContent>
            </Card>
            <Card data-testid="card-avatar-queue">
              <CardHeader><CardTitle>9. Avatar reader queue</CardTitle></CardHeader>
              <CardContent className="text-sm">{playout.filter((p) => p.kind === "avatar_reader").length} planned</CardContent>
            </Card>
            <Card data-testid="card-blocked">
              <CardHeader><CardTitle>12. Blocked items</CardTitle></CardHeader>
              <CardContent className="text-sm">
                {audit.filter((a) => a.action === "story_blocked").slice(-5).map((a) => (
                  <div key={a.id} className="text-xs">{a.storyId}: {a.detail}</div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="rooms">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardHeader><CardTitle>Newsroom reader</CardTitle></CardHeader><CardContent className="text-sm">Anchor avatar plan, internal-only.</CardContent></Card>
            <Card><CardHeader><CardTitle>Podcast room</CardTitle></CardHeader><CardContent className="text-sm">Two-host discussion plan, internal-only.</CardContent></Card>
            <Card><CardHeader><CardTitle>Avatar reader</CardTitle></CardHeader><CardContent className="text-sm">Analyst / narrator avatar plan, internal-only.</CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="future">
          <Card data-testid="card-future-readiness">
            <CardHeader>
              <CardTitle>10. Unreal / 4D future readiness</CardTitle>
              <CardDescription>Manifest-only planning. Real sends are PERMANENTLY DISABLED in this MVP.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>Real Unreal send: <Badge variant="destructive">disabled</Badge></div>
              <div>Real 4D cue send: <Badge variant="destructive">disabled</Badge></div>
              <div className="text-xs text-muted-foreground">Generated artifacts are scene/cue manifests only — no outbound socket to Unreal or 4D hardware.</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card data-testid="card-audit">
            <CardHeader><CardTitle>13. Audit log (latest 50)</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1 text-xs max-h-96 overflow-auto">
                {audit.slice().reverse().map((a) => (
                  <div key={a.id} data-testid={`audit-row-${a.id}`}>
                    <span className="text-muted-foreground">{a.at}</span>{" · "}
                    <strong>{a.action}</strong>{" · "}
                    {a.actor}{" · "}
                    {a.detail}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fallback">
          <Card data-testid="card-fallback">
            <CardHeader>
              <CardTitle>14. Fallback content loop</CardTitle>
              <CardDescription>Shown when no verified update is available. Never hallucinates breaking news.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              Default: "No verified update available". Configure other placeholders later via settings.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 15. Manual override panel */}
      <Card data-testid="card-manual-override">
        <CardHeader>
          <CardTitle>15. Manual override</CardTitle>
          <CardDescription>Root-admin override — switching mode to "manual" requires every action to be approved manually.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => setMode("manual")} data-testid="button-override-manual">
            Return to manual approval mode
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
