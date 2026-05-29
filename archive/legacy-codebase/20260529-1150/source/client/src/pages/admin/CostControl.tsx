import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Policy {
  id: string;
  dailyCapUsd: number;
  monthlyCapUsd: number;
  paidApisPaused: boolean;
  impactScoreThreshold: number;
  confidenceThreshold: number;
  updatedBy: string | null;
  updatedAt: string;
}

interface CostEvent {
  id: string;
  kind: string;
  briefId: string | null;
  broadcastId: string | null;
  estUsd: number;
  actualUsd: number;
  allowed: boolean;
  reasons: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface SpendRow { day: string; total: number; }
interface PolicyResponse { policy: Policy; spend: { today: number; month: number; daily: SpendRow[] } }

function getCsrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": getCsrfToken(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

export default function CostControlPage() {
  const qc = useQueryClient();

  const policyQ = useQuery<PolicyResponse>({
    queryKey: ["/api/admin/cost/policy"],
    queryFn: () => apiJson<PolicyResponse>("/api/admin/cost/policy"),
    refetchInterval: 15000,
  });

  const eventsQ = useQuery<{ events: CostEvent[] }>({
    queryKey: ["/api/admin/cost/events"],
    queryFn: () => apiJson<{ events: CostEvent[] }>("/api/admin/cost/events?limit=100"),
    refetchInterval: 15000,
  });

  const [draft, setDraft] = useState<Partial<Policy>>({});
  useEffect(() => {
    if (policyQ.data?.policy) {
      setDraft({
        dailyCapUsd: policyQ.data.policy.dailyCapUsd,
        monthlyCapUsd: policyQ.data.policy.monthlyCapUsd,
        paidApisPaused: policyQ.data.policy.paidApisPaused,
        impactScoreThreshold: policyQ.data.policy.impactScoreThreshold,
        confidenceThreshold: policyQ.data.policy.confidenceThreshold,
      });
    }
  }, [policyQ.data?.policy]);

  const updateM = useMutation({
    mutationFn: (patch: Partial<Policy>) =>
      apiJson<{ policy: Policy }>("/api/admin/cost/policy", {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/cost/policy"] }),
  });

  const pauseM = useMutation({
    mutationFn: () =>
      apiJson("/api/admin/cost/paid-apis/pause", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/cost/policy"] }),
  });
  const resumeM = useMutation({
    mutationFn: () =>
      apiJson("/api/admin/cost/paid-apis/resume", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/cost/policy"] }),
  });

  const policy = policyQ.data?.policy;
  const spend = policyQ.data?.spend;
  const events = eventsQ.data?.events ?? [];

  const deniedCount = useMemo(() => events.filter((e) => !e.allowed).length, [events]);

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-cost-control">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Cost Control</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Centralized spend gate for cost-bearing newsroom operations (B-roll, broadcast render,
            anchor, shorts). All paid API calls go through <code>canSpend</code>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {policy?.paidApisPaused ? (
            <Badge variant="destructive" data-testid="badge-paused">PAID APIS PAUSED</Badge>
          ) : (
            <Badge variant="default" data-testid="badge-live">LIVE</Badge>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-spend-today">
          <CardHeader><CardTitle>Spend Today</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${(spend?.today ?? 0).toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">
              Cap: ${policy?.dailyCapUsd?.toFixed(2) ?? "—"}
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-spend-month">
          <CardHeader><CardTitle>Spend This Month</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${(spend?.month ?? 0).toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">
              Cap: ${policy?.monthlyCapUsd?.toFixed(2) ?? "—"}
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-denied">
          <CardHeader><CardTitle>Recent Denials</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{deniedCount}</div>
            <div className="text-xs text-muted-foreground">last 100 events</div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-policy">
        <CardHeader>
          <CardTitle>Policy</CardTitle>
          <CardDescription>Thresholds applied to every cost-bearing call.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="dailyCap">Daily Cap (USD)</Label>
              <Input
                id="dailyCap"
                type="number"
                step="0.01"
                min="0"
                value={draft.dailyCapUsd ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, dailyCapUsd: Number(e.target.value) }))}
                data-testid="input-daily-cap"
              />
            </div>
            <div>
              <Label htmlFor="monthlyCap">Monthly Cap (USD)</Label>
              <Input
                id="monthlyCap"
                type="number"
                step="0.01"
                min="0"
                value={draft.monthlyCapUsd ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, monthlyCapUsd: Number(e.target.value) }))}
                data-testid="input-monthly-cap"
              />
            </div>
            <div>
              <Label htmlFor="impactThr">Impact Score Threshold</Label>
              <Input
                id="impactThr"
                type="number"
                min="0"
                max="100"
                value={draft.impactScoreThreshold ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, impactScoreThreshold: Number(e.target.value) }))
                }
                data-testid="input-impact-threshold"
              />
            </div>
            <div>
              <Label htmlFor="confThr">Confidence Threshold (0–1)</Label>
              <Input
                id="confThr"
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={draft.confidenceThreshold ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, confidenceThreshold: Number(e.target.value) }))
                }
                data-testid="input-confidence-threshold"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="font-medium">Paid APIs Paused</div>
              <div className="text-xs text-muted-foreground">
                When ON, every cost-bearing call is denied with <code>paid_apis_paused</code>.
              </div>
            </div>
            <Switch
              checked={!!draft.paidApisPaused}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, paidApisPaused: v }))}
              data-testid="switch-paid-apis-paused"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => updateM.mutate(draft)}
              disabled={updateM.isPending}
              data-testid="button-save-policy"
            >
              {updateM.isPending ? "Saving…" : "Save Policy"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => pauseM.mutate()}
              disabled={pauseM.isPending || !!policy?.paidApisPaused}
              data-testid="button-pause-paid-apis"
            >
              Pause Paid APIs
            </Button>
            <Button
              variant="secondary"
              onClick={() => resumeM.mutate()}
              disabled={resumeM.isPending || !policy?.paidApisPaused}
              data-testid="button-resume-paid-apis"
            >
              Resume Paid APIs
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-events">
        <CardHeader>
          <CardTitle>Recent Cost Events</CardTitle>
          <CardDescription>Immutable audit log (append-only).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Allowed</TableHead>
                  <TableHead>Est $</TableHead>
                  <TableHead>Reasons</TableHead>
                  <TableHead>Broadcast / Brief</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No cost events yet.
                    </TableCell>
                  </TableRow>
                )}
                {events.map((e) => (
                  <TableRow key={e.id} data-testid={`row-event-${e.id}`}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(e.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell><Badge variant="outline">{e.kind}</Badge></TableCell>
                    <TableCell>
                      {e.allowed ? (
                        <Badge variant="default" data-testid={`badge-allowed-${e.id}`}>allowed</Badge>
                      ) : (
                        <Badge variant="destructive" data-testid={`badge-denied-${e.id}`}>denied</Badge>
                      )}
                    </TableCell>
                    <TableCell>${(e.estUsd ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-xs max-w-xs truncate" title={e.reasons.join(", ")}>
                      {e.reasons.join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {e.broadcastId || e.briefId || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
