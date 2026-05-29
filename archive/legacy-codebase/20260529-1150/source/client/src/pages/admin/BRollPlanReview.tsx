import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ResolvedBeat = {
  beatId: string;
  query: string;
  durationSec: number;
  clipId: string | null;
  source: string | null;
  licenseStatus: string | null;
  licenseTier: string | null;
  attribution: string | null;
  rightsUrl: string | null;
  url: string | null;
  tierTried: string[];
  rejected: Array<{ source: string; reason: string }>;
};

type Plan = {
  id: string;
  briefId: string;
  beats: ResolvedBeat[];
  totalDurationSec: number;
  status: string;
  createdAt: string;
};

type Clip = {
  id: string;
  source: string;
  url: string;
  licenseStatus: string;
  licenseTier: string;
  attribution: string;
  rightsUrl: string | null;
  durationSec: number;
  query: string;
};

async function jsonFetch(path: string, init?: RequestInit) {
  const r = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  return r.json();
}

const TIER_BADGE: Record<string, string> = {
  owned: "bg-emerald-600",
  stock_paid: "bg-blue-600",
  creative_commons: "bg-teal-600",
  fair_use_claim: "bg-amber-600",
  unknown: "bg-red-600",
};

const STATUS_BADGE: Record<string, string> = {
  licensed: "bg-emerald-600",
  pending_review: "bg-amber-600",
  unlicensed: "bg-red-600",
  expired: "bg-red-700",
  revoked: "bg-red-800",
};

export default function BRollPlanReview() {
  const [briefId, setBriefId] = useState("demo-brief-1");
  const [beatsJson, setBeatsJson] = useState<string>(
    JSON.stringify(
      [
        { beatId: "b1", query: "city skyline night", durationSec: 6 },
        { beatId: "b2", query: "earthquake aftermath", durationSec: 6, location: { lat: 37.77, lon: -122.42, zoom: 9 } },
        { beatId: "b3", query: "abstract data visualization", durationSec: 6 },
      ],
      null,
      2,
    ),
  );
  const [plans, setPlans] = useState<Plan[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (!briefId.trim()) return;
    const r = await jsonFetch(`/api/admin/broll/plans/${encodeURIComponent(briefId.trim())}`);
    if (Array.isArray(r?.plans)) setPlans(r.plans);
    const c = await jsonFetch(`/api/admin/broll/clips`);
    if (Array.isArray(c?.clips)) setClips(c.clips);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolve = async () => {
    setBusy(true);
    setError(null);
    try {
      const beats = JSON.parse(beatsJson);
      const r = await jsonFetch("/api/admin/broll/resolve", {
        method: "POST",
        body: JSON.stringify({ briefId, beats }),
      });
      if (r?.plan) {
        await refresh();
      } else {
        setError(r?.message ?? "Resolve failed");
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const swap = async (planId: string, beatId: string, clipId: string) => {
    const r = await jsonFetch("/api/admin/broll/swap-clip", {
      method: "POST",
      body: JSON.stringify({ planId, beatId, clipId }),
    });
    if (r?.plan) {
      await refresh();
    } else {
      setError(r?.message ?? "Swap failed");
    }
  };

  const clipsByQuery = useMemo(() => {
    const out: Record<string, Clip[]> = {};
    for (const c of clips) {
      (out[c.query] = out[c.query] || []).push(c);
    }
    return out;
  }, [clips]);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto" data-testid="page-broll-plan-review">
      <div>
        <h1 className="text-2xl font-bold">B-Roll Plan Review</h1>
        <p className="text-sm text-muted-foreground">
          Legal B-roll resolver (T4). Cost-bearing adapters default to dry-run; live calls require
          founder env opt-in. Every clip carries explicit license metadata.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resolve a brief</CardTitle>
          <CardDescription>Provide the brief id and an array of script beats.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="brief-id">Brief id</Label>
            <Input
              id="brief-id"
              data-testid="input-brief-id"
              value={briefId}
              onChange={(e) => setBriefId(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="beats-json">Beats (JSON array)</Label>
            <Textarea
              id="beats-json"
              data-testid="input-beats-json"
              value={beatsJson}
              onChange={(e) => setBeatsJson(e.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
          </div>
          {error && <p className="text-sm text-red-500" data-testid="text-error">{error}</p>}
          <Button onClick={resolve} disabled={busy} data-testid="button-resolve">
            {busy ? "Resolving…" : "Resolve B-roll"}
          </Button>
        </CardContent>
      </Card>

      {plans.map((plan) => (
        <Card key={plan.id} data-testid={`card-plan-${plan.id}`}>
          <CardHeader>
            <CardTitle>
              Plan {plan.id.slice(0, 8)} <Badge variant="secondary">{plan.status}</Badge>
            </CardTitle>
            <CardDescription>
              briefId: {plan.briefId} • total {plan.totalDurationSec}s • {plan.beats.length} beats
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {plan.beats.map((b) => (
              <div
                key={b.beatId}
                className="border rounded-md p-3 space-y-2"
                data-testid={`beat-${b.beatId}`}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="font-medium text-sm">{b.beatId} — {b.query}</div>
                    <div className="text-xs text-muted-foreground">
                      duration {b.durationSec}s · tier order tried: {b.tierTried.join(" → ") || "—"}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {b.source && (
                      <Badge data-testid={`badge-source-${b.beatId}`}>{b.source}</Badge>
                    )}
                    {b.licenseStatus && (
                      <Badge
                        className={STATUS_BADGE[b.licenseStatus] || ""}
                        data-testid={`badge-license-status-${b.beatId}`}
                      >
                        {b.licenseStatus}
                      </Badge>
                    )}
                    {b.licenseTier && (
                      <Badge
                        className={TIER_BADGE[b.licenseTier] || ""}
                        data-testid={`badge-license-tier-${b.beatId}`}
                      >
                        {b.licenseTier}
                      </Badge>
                    )}
                  </div>
                </div>
                {b.url && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">URL:</span>{" "}
                    <span className="font-mono break-all" data-testid={`text-url-${b.beatId}`}>
                      {b.url}
                    </span>
                  </div>
                )}
                {b.attribution && (
                  <div className="text-xs text-muted-foreground" data-testid={`text-attribution-${b.beatId}`}>
                    {b.attribution}
                    {b.rightsUrl && (
                      <>
                        {" — "}
                        <a className="underline" href={b.rightsUrl} target="_blank" rel="noreferrer">
                          rights
                        </a>
                      </>
                    )}
                  </div>
                )}
                {b.rejected.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer">{b.rejected.length} candidates rejected</summary>
                    <ul className="list-disc pl-4 mt-1">
                      {b.rejected.map((r, i) => (
                        <li key={i}>
                          <span className="font-mono">{r.source}</span>: {r.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {clipsByQuery[b.query]?.length > 1 && (
                  <div className="text-xs">
                    <div className="text-muted-foreground mb-1">Swap clip:</div>
                    <div className="flex flex-wrap gap-1">
                      {clipsByQuery[b.query]
                        .filter((c) => c.id !== b.clipId)
                        .slice(0, 6)
                        .map((c) => (
                          <Button
                            key={c.id}
                            size="sm"
                            variant="outline"
                            data-testid={`button-swap-${b.beatId}-${c.id}`}
                            onClick={() => swap(plan.id, b.beatId, c.id)}
                          >
                            {c.source}/{c.licenseTier}
                          </Button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
