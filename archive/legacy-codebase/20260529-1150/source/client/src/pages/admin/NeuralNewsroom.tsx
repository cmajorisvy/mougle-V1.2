import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ApexDecision = {
  decisionId: string; storyId: string; apexScore: number; productionTier: string;
  reasonCodes: string[]; costEstimate: number; notPublished: boolean;
  realSendAllowed: boolean; hardwareSendAllowed: boolean; createdAt: string;
};
type PreCogPlan = {
  planId: string; storyId: string; productionId: string;
  scriptBeatPlans: Array<{ beatId: string; tierBand: string; fullscreenAllowed: boolean; blockers: string[] }>;
  validationStatus: string; notPublished: boolean; createdAt: string;
};
type Overview = {
  flowstate: { state: string; anchorMode: string; robotMode: string; screenRoute: string; reason: string; changedAt: string } | null;
  presets: Array<{ presetId: string; name: string; screenRole: string; locked: boolean }>;
  recentApexLoad: ApexDecision[];
  recentPreCognition: PreCogPlan[];
  recentTakePlans: Array<{
    takePlanId: string; storyId: string; presetId: string; action: string;
    tierBand: string; validationStatus: string; sensitivityClass: string;
    realSendAllowed: boolean; executionEnabled: boolean; notPublished: boolean;
    createdAt: string;
  }>;
  recentValidations: Array<{ validationId: string; takePlanId: string; passed: boolean; blockers: string[]; checkedAt: string }>;
  recentEvents: Array<{ id: string; name: string; emittedAt: string }>;
  safetyEnvelopeLocked: boolean;
  realSendAllowed: boolean;
  executionEnabled: boolean;
  hardwareSendAllowed: boolean;
  notPublished: boolean;
};

const ZONES = ["text_only", "voice_summary", "newsroom_read", "full_visual_package", "cinematic_4d_treatment"];
const FLOW_STATES = [
  "idle","calm_read","focused_explainer","breaking_alert","sensitive_story","chat_reaction","fallback_mode","kill_switch",
];

async function api(path: string, init?: RequestInit) {
  const r = await fetch(`/api/admin/neural-newsroom${path}`, { credentials: "include", ...init });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

export default function NeuralNewsroomPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setError(null);
      const o = await api("/overview");
      setData(o);
    } catch (e: any) {
      setError(e?.message ?? "failed");
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  }, []);

  async function transition(to: string) {
    setBusy(true);
    try {
      await api("/flowstate/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, reason: "admin_ui" }),
      });
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "transition failed");
    } finally {
      setBusy(false);
    }
  }

  async function killSwitch() {
    if (!confirm("Activate kill switch? Newsroom goes to safe world-map preset.")) return;
    setBusy(true);
    try {
      await api("/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "admin_ui_kill_switch" }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="page-neural-newsroom">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-neural-newsroom-title">Neural Newsroom</h1>
          <p className="text-sm text-muted-foreground">
            ApexLoad + PreCognition + FlowState + Virtual Screen Director (simulation-only, draft, admin-only).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh} disabled={busy} data-testid="button-refresh">Refresh</Button>
          <Button variant="destructive" onClick={killSwitch} disabled={busy} data-testid="button-kill-switch">Kill switch</Button>
        </div>
      </header>

      {error && (
        <Card className="p-3 border-destructive">
          <span className="text-sm text-destructive" data-testid="text-error">{error}</span>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant={data?.realSendAllowed ? "destructive" : "secondary"} data-testid="badge-real-send">
            realSendAllowed: {String(data?.realSendAllowed ?? false)}
          </Badge>
          <Badge variant={data?.executionEnabled ? "destructive" : "secondary"} data-testid="badge-execution">
            executionEnabled: {String(data?.executionEnabled ?? false)}
          </Badge>
          <Badge variant={data?.hardwareSendAllowed ? "destructive" : "secondary"} data-testid="badge-hardware">
            hardwareSendAllowed: {String(data?.hardwareSendAllowed ?? false)}
          </Badge>
          <Badge variant={data?.notPublished ? "secondary" : "destructive"} data-testid="badge-not-published">
            notPublished: {String(data?.notPublished ?? true)}
          </Badge>
          <Badge variant={data?.safetyEnvelopeLocked ? "secondary" : "destructive"} data-testid="badge-envelope">
            safetyEnvelopeLocked: {String(data?.safetyEnvelopeLocked ?? true)}
          </Badge>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">FlowState</h2>
        <div className="text-sm" data-testid="text-flowstate-current">
          state: <code>{data?.flowstate?.state ?? "—"}</code>{" "}
          · anchor: <code>{data?.flowstate?.anchorMode ?? "—"}</code>{" "}
          · robot: <code>{data?.flowstate?.robotMode ?? "—"}</code>{" "}
          · route: <code>{data?.flowstate?.screenRoute ?? "—"}</code>
        </div>
        <div className="flex flex-wrap gap-2">
          {FLOW_STATES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant="outline"
              onClick={() => transition(s)}
              disabled={busy}
              data-testid={`button-flowstate-${s}`}
            >
              {s}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Production tiers (ApexLoad targets)</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          {ZONES.map((z) => (
            <Badge key={z} variant="outline" data-testid={`badge-tier-${z}`}>{z}</Badge>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Locked screen presets ({data?.presets?.length ?? 0})</h2>
        <ul className="text-sm space-y-1">
          {(data?.presets ?? []).map((p) => (
            <li key={p.presetId} className="flex gap-2" data-testid={`row-preset-${p.presetId}`}>
              <Badge variant="secondary">{p.screenRole}</Badge>
              <code>{p.presetId}</code> · {p.name}
              {p.locked && <Badge variant="outline">locked</Badge>}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Recent ApexLoad decisions ({data?.recentApexLoad?.length ?? 0})</h2>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left">
                <th className="p-1">decision</th>
                <th className="p-1">story</th>
                <th className="p-1">score</th>
                <th className="p-1">tier</th>
                <th className="p-1">cost</th>
                <th className="p-1">reasons</th>
                <th className="p-1">published</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentApexLoad ?? []).map((d) => (
                <tr key={d.decisionId} className="border-t" data-testid={`row-apex-${d.decisionId}`}>
                  <td className="p-1"><code>{d.decisionId.slice(0, 18)}</code></td>
                  <td className="p-1">{d.storyId}</td>
                  <td className="p-1">{d.apexScore}</td>
                  <td className="p-1"><Badge variant="secondary">{d.productionTier}</Badge></td>
                  <td className="p-1">${d.costEstimate.toFixed(2)}</td>
                  <td className="p-1">{d.reasonCodes.join(", ")}</td>
                  <td className="p-1">{d.notPublished ? "draft" : "PUBLISHED"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Recent PreCognition plans ({data?.recentPreCognition?.length ?? 0})</h2>
        <ul className="text-xs space-y-2">
          {(data?.recentPreCognition ?? []).map((p) => (
            <li key={p.planId} className="border-t pt-1" data-testid={`row-precog-${p.planId}`}>
              <div>
                <code>{p.planId.slice(0, 18)}</code> · story <code>{p.storyId}</code> ·{" "}
                <Badge variant={p.validationStatus === "passed" ? "secondary" : "destructive"}>{p.validationStatus}</Badge>{" "}
                <Badge variant="outline">{p.notPublished ? "draft" : "PUBLISHED"}</Badge>
              </div>
              <div className="pl-3 text-muted-foreground">
                beats: {p.scriptBeatPlans.length} ·{" "}
                blocked: {p.scriptBeatPlans.filter((b) => b.blockers.length > 0).length} ·{" "}
                fullscreen-allowed: {p.scriptBeatPlans.filter((b) => b.fullscreenAllowed).length}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Recent ScreenTakePlans</h2>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left">
                <th className="p-1">id</th>
                <th className="p-1">story</th>
                <th className="p-1">preset</th>
                <th className="p-1">action</th>
                <th className="p-1">tier</th>
                <th className="p-1">validation</th>
                <th className="p-1">sensitivity</th>
                <th className="p-1">published</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentTakePlans ?? []).map((tp) => (
                <tr key={tp.takePlanId} className="border-t" data-testid={`row-take-${tp.takePlanId}`}>
                  <td className="p-1"><code>{tp.takePlanId.slice(0, 18)}</code></td>
                  <td className="p-1">{tp.storyId}</td>
                  <td className="p-1">{tp.presetId}</td>
                  <td className="p-1">{tp.action}</td>
                  <td className="p-1"><Badge variant={tp.tierBand === "reject" ? "destructive" : "secondary"}>{tp.tierBand}</Badge></td>
                  <td className="p-1"><Badge variant={tp.validationStatus === "passed" ? "secondary" : "destructive"}>{tp.validationStatus}</Badge></td>
                  <td className="p-1">{tp.sensitivityClass}</td>
                  <td className="p-1">{tp.notPublished ? "draft" : "PUBLISHED"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Recent safety validations</h2>
        <ul className="text-xs space-y-1">
          {(data?.recentValidations ?? []).map((v) => (
            <li key={v.validationId} data-testid={`row-validation-${v.validationId}`}>
              <Badge variant={v.passed ? "secondary" : "destructive"}>{v.passed ? "passed" : "failed"}</Badge>{" "}
              <code>{v.takePlanId.slice(0, 18)}</code>
              {v.blockers.length > 0 && <span className="ml-2 text-destructive">blockers: {v.blockers.join(", ")}</span>}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Bus event history (redacted)</h2>
        <ul className="text-xs max-h-64 overflow-auto space-y-1">
          {(data?.recentEvents ?? []).map((e) => (
            <li key={e.id} data-testid={`row-event-${e.id}`}>
              <span className="text-muted-foreground">{e.emittedAt.slice(11, 19)}</span>{" "}
              <code>{e.name}</code>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
