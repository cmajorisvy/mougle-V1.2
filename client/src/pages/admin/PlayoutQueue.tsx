import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { AlertOctagon, AlertTriangle, ArrowDown, ArrowUp, History, Radio, Siren, XCircle } from "lucide-react";

interface QueueItem {
  id: string;
  broadcastId: string;
  region: string;
  scheduledAt: string;
  ttlSec: number;
  status: string;
  breaking: boolean;
  priority: number;
  enqueuedBy: string;
  startedAt: string | null;
}

interface PlayoutStateView {
  currentBroadcastId: string | null;
  currentQueueItemId: string | null;
  currentStartedAt: string | null;
  killSwitchActive: boolean;
  killSwitchActivatedBy: string | null;
  killSwitchAt: string | null;
  killSwitchReason: string | null;
}

interface HistoryItem {
  id: string;
  broadcastId: string;
  playedAt: string;
  endedAt: string;
  durationSec: number;
  ejectedBy: string | null;
  reason: string | null;
  region: string;
  breaking: boolean;
}

interface RehydrateInfo {
  at: string;
  queueCount: number;
  historyCount: number;
  killSwitchActive: boolean;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  ttlSec: number;
}

interface RehydrateFailureInfo {
  at: string;
  error: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  ttlSec: number;
}

interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  broadcastId: string | null;
  queueItemId: string | null;
  detail: string;
}

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  return r.json();
}

export default function PlayoutQueuePage() {
  const { toast } = useToast();
  const [state, setState] = useState<PlayoutStateView | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [rehydrate, setRehydrate] = useState<RehydrateInfo | null>(null);
  const [rehydrateFailure, setRehydrateFailure] = useState<RehydrateFailureInfo | null>(null);
  const [broadcastId, setBroadcastId] = useState("");
  const [region, setRegion] = useState("GLOBAL");
  const [ttlSec, setTtlSec] = useState(3600);
  const [killReason, setKillReason] = useState("");
  const [confirmKill, setConfirmKill] = useState(false);

  const refresh = async () => {
    const [s, a] = await Promise.all([
      api("/api/admin/playout/state"),
      api("/api/admin/playout/audit?limit=100"),
    ]);
    if (s?.state) setState(s.state);
    if (Array.isArray(s?.queue)) setQueue(s.queue);
    if (Array.isArray(s?.history)) setHistory(s.history);
    if (Array.isArray(a?.events)) setAudit(a.events);
    setRehydrate(s?.rehydrate ?? null);
    setRehydrateFailure(s?.rehydrateFailure ?? null);
  };

  const acknowledgeRehydrate = async () => {
    const r = await api("/api/admin/playout/rehydrate/acknowledge", { method: "POST" });
    if (r?.ok) {
      setRehydrate(null);
      toast({ title: "Recovery notice dismissed" });
    }
  };

  const acknowledgeRehydrateFailure = async () => {
    const r = await api("/api/admin/playout/rehydrate-failure/acknowledge", { method: "POST" });
    if (r?.ok) {
      setRehydrateFailure(null);
      toast({ title: "Recovery failure notice dismissed" });
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  const enqueue = async (breaking = false) => {
    if (!broadcastId.trim()) {
      toast({ title: "Broadcast ID required", variant: "destructive" });
      return;
    }
    const path = breaking ? "/api/admin/playout/breaking" : "/api/admin/playout/enqueue";
    const body = breaking
      ? { broadcastId: broadcastId.trim(), region, ttlSec, reason: "manual_breaking" }
      : { broadcastId: broadcastId.trim(), region, ttlSec, breaking: false };
    const r = await api(path, { method: "POST", body: JSON.stringify(body) });
    if (r?.ok) {
      toast({ title: breaking ? "Breaking inserted" : "Enqueued" });
      setBroadcastId("");
    } else {
      toast({ title: r?.error || "Failed", description: r?.message, variant: "destructive" });
    }
    refresh();
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const queuedOnly = queue.filter((q) => q.status === "queued");
    const j = idx + dir;
    if (j < 0 || j >= queuedOnly.length) return;
    const newOrder = [...queuedOnly];
    const [item] = newOrder.splice(idx, 1);
    newOrder.splice(j, 0, item);
    await api("/api/admin/playout/reorder", {
      method: "POST",
      body: JSON.stringify({ orderedIds: newOrder.map((q) => q.id) }),
    });
    refresh();
  };

  const eject = async (id: string) => {
    await api(`/api/admin/playout/eject/${id}`, {
      method: "POST",
      body: JSON.stringify({ reason: "admin_eject" }),
    });
    refresh();
  };

  const dispatchOnce = async () => {
    const r = await api("/api/admin/playout/dispatch", {
      method: "POST",
      body: JSON.stringify({ region: "GLOBAL" }),
    });
    if (!r?.ok) {
      toast({ title: r?.reason || "No dispatch", variant: "default" });
    }
    refresh();
  };

  const engageKill = async () => {
    if (!confirmKill) {
      setConfirmKill(true);
      return;
    }
    const r = await api("/api/admin/playout/kill-switch", {
      method: "POST",
      body: JSON.stringify({ reason: killReason || "manual_kill_switch" }),
    });
    setConfirmKill(false);
    if (r?.ok) toast({ title: "KILL SWITCH ENGAGED — channel drained" });
    refresh();
  };

  const clearKill = async () => {
    await api("/api/admin/playout/kill-switch/clear", {
      method: "POST",
      body: JSON.stringify({ reason: "operator_cleared" }),
    });
    toast({ title: "Kill switch cleared" });
    refresh();
  };

  const killActive = !!state?.killSwitchActive;
  const queuedItems = queue.filter((q) => q.status === "queued");
  const playing = queue.find((q) => q.status === "playing");

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="page-playout-queue">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Radio className="w-6 h-6" /> 24/7 Playout Queue
          </h1>
          <p className="text-sm text-muted-foreground">
            Channel state for approved broadcasts. No streaming, no public upload — admin-only orchestration.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={killActive ? "destructive" : "secondary"} data-testid="badge-kill-state">
            {killActive ? "KILL SWITCH ACTIVE" : "Channel Live"}
          </Badge>
          <Button size="sm" variant="outline" onClick={refresh} data-testid="button-refresh">Refresh</Button>
        </div>
      </div>

      {rehydrateFailure && (
        <Card className="border-destructive bg-destructive/10" data-testid="banner-rehydrate-failure">
          <CardContent className="pt-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-destructive" data-testid="text-rehydrate-failure-summary">
                  Failed to recover playout state on boot — started empty.
                </p>
                <p className="text-xs text-destructive/90 font-mono break-all" data-testid="text-rehydrate-failure-error">
                  {rehydrateFailure.error}
                </p>
                <p className="text-xs text-muted-foreground" data-testid="text-rehydrate-failure-at">
                  Failure detected at {rehydrateFailure.at}
                </p>
                <p className="text-xs text-muted-foreground">
                  This notice auto-clears after {Math.round(rehydrateFailure.ttlSec / 3600)}h.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={acknowledgeRehydrateFailure}
              data-testid="button-ack-rehydrate-failure"
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {rehydrate && (
        <Card className="border-blue-500/50 bg-blue-500/5" data-testid="banner-rehydrate">
          <CardContent className="pt-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <History className="w-5 h-5 text-blue-500 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium" data-testid="text-rehydrate-summary">
                  Recovered {rehydrate.queueCount} queue item{rehydrate.queueCount === 1 ? "" : "s"} and{" "}
                  {rehydrate.historyCount} history record{rehydrate.historyCount === 1 ? "" : "s"} on boot.
                </p>
                <p className="text-xs text-muted-foreground" data-testid="text-rehydrate-at">
                  Rehydrated at {rehydrate.at}
                  {rehydrate.killSwitchActive ? " — kill switch was active" : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  This notice auto-clears after {Math.round(rehydrate.ttlSec / 3600)}h.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={acknowledgeRehydrate}
              data-testid="button-ack-rehydrate"
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KILL SWITCH */}
      <Card className={killActive ? "border-destructive" : "border-destructive/40"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Siren className="w-5 h-5" /> Founder Kill Switch
          </CardTitle>
          <CardDescription>
            Immediately drains the active slot and blocks all dispatch + enqueue until cleared.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {killActive ? (
            <div className="space-y-2">
              <p className="text-sm">
                <strong>Engaged by:</strong> {state?.killSwitchActivatedBy} at {state?.killSwitchAt}
              </p>
              <p className="text-sm"><strong>Reason:</strong> {state?.killSwitchReason}</p>
              <Button onClick={clearKill} variant="outline" data-testid="button-clear-kill">
                Clear kill switch
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder="Reason (audited)"
                value={killReason}
                onChange={(e) => setKillReason(e.target.value)}
                data-testid="input-kill-reason"
              />
              <Button
                variant="destructive"
                size="lg"
                onClick={engageKill}
                data-testid="button-engage-kill"
                className="w-full"
              >
                <AlertOctagon className="w-5 h-5 mr-2" />
                {confirmKill ? "CONFIRM — ENGAGE KILL SWITCH" : "ENGAGE KILL SWITCH"}
              </Button>
              {confirmKill && (
                <p className="text-xs text-muted-foreground">
                  Click again to confirm. This drains the active broadcast immediately.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Currently playing */}
      <Card>
        <CardHeader>
          <CardTitle>Currently Playing</CardTitle>
        </CardHeader>
        <CardContent>
          {playing ? (
            <div className="flex items-center justify-between" data-testid="current-playing">
              <div>
                <p className="text-sm font-medium">{playing.broadcastId}</p>
                <p className="text-xs text-muted-foreground">
                  region={playing.region} started={playing.startedAt}
                </p>
              </div>
              <Button size="sm" variant="destructive" onClick={() => eject(playing.id)} data-testid="button-eject-current">
                <XCircle className="w-4 h-4 mr-1" /> Eject
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing on air.</p>
          )}
          <div className="mt-3">
            <Button size="sm" onClick={dispatchOnce} disabled={killActive} data-testid="button-dispatch">
              Dispatch next
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Enqueue */}
      <Card>
        <CardHeader>
          <CardTitle>Enqueue Approved Broadcast</CardTitle>
          <CardDescription>Broadcast must have status="approved" — enforced server-side.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Label>Broadcast ID</Label>
            <Input
              value={broadcastId}
              onChange={(e) => setBroadcastId(e.target.value)}
              placeholder="broadcast UUID"
              data-testid="input-broadcast-id"
            />
          </div>
          <div>
            <Label>Region</Label>
            <Input value={region} onChange={(e) => setRegion(e.target.value)} data-testid="input-region" />
          </div>
          <div>
            <Label>TTL (sec)</Label>
            <Input
              type="number"
              value={ttlSec}
              onChange={(e) => setTtlSec(parseInt(e.target.value) || 3600)}
              data-testid="input-ttl"
            />
          </div>
          <div className="md:col-span-4 flex gap-2">
            <Button onClick={() => enqueue(false)} disabled={killActive} data-testid="button-enqueue">Enqueue</Button>
            <Button onClick={() => enqueue(true)} variant="destructive" disabled={killActive} data-testid="button-enqueue-breaking">
              <Siren className="w-4 h-4 mr-1" /> Insert as BREAKING
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue" data-testid="tab-queue">Queue ({queuedItems.length})</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit</TabsTrigger>
        </TabsList>
        <TabsContent value="queue">
          <Card>
            <CardContent className="pt-4 space-y-2">
              {queuedItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Queue is empty.</p>
              ) : (
                queuedItems.map((q, i) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between border rounded p-2"
                    data-testid={`queue-item-${q.id}`}
                  >
                    <div>
                      <p className="text-sm font-medium flex items-center gap-2">
                        {q.broadcastId}
                        {q.breaking && <Badge variant="destructive">BREAKING</Badge>}
                        <Badge variant="outline">{q.region}</Badge>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        priority={q.priority} ttl={q.ttlSec}s by={q.enqueuedBy}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="outline" onClick={() => move(i, -1)} data-testid={`button-up-${q.id}`}>
                        <ArrowUp className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="outline" onClick={() => move(i, 1)} data-testid={`button-down-${q.id}`}>
                        <ArrowDown className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="destructive" onClick={() => eject(q.id)} data-testid={`button-eject-${q.id}`}>
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <Card>
            <CardContent className="pt-4 space-y-1 text-sm">
              {history.length === 0 && <p className="text-muted-foreground">No history yet.</p>}
              {history.map((h) => (
                <div key={h.id} className="flex justify-between border-b py-1" data-testid={`history-${h.id}`}>
                  <span>{h.broadcastId} ({h.region})</span>
                  <span className="text-xs text-muted-foreground">
                    {h.durationSec}s {h.ejectedBy ? `ejected:${h.ejectedBy}` : "played"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="audit">
          <Card>
            <CardContent className="pt-4 space-y-1 text-xs font-mono">
              {audit.slice().reverse().map((a) => (
                <div key={a.id} data-testid={`audit-${a.id}`}>
                  [{a.at}] {a.actor} {a.action} — {a.detail}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
