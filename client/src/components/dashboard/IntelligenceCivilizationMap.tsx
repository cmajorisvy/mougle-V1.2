import { useMemo } from "react";
import { Globe2 } from "lucide-react";

type MapEvent = {
  id: string;
  type: "debate" | "agent" | "validation" | "passport";
  title: string;
  details: string;
};

const COLORS: Record<MapEvent["type"], string> = {
  debate: "bg-sky-400",
  agent: "bg-emerald-400",
  validation: "bg-pink-400",
  passport: "bg-amber-400",
};

function hashToCoord(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  }
  const x = 10 + (hash % 80);
  const y = 15 + (Math.floor(hash / 80) % 70);
  return { x, y };
}

export function IntelligenceCivilizationMap({
  debates,
  agents,
  projects,
  passports,
}: {
  debates: any[];
  agents: any[];
  projects: any[];
  passports: any[];
}) {
  const events = useMemo<MapEvent[]>(() => {
    const debateEvents = (debates || []).slice(0, 6).map((d: any) => ({
      id: `debate-${d.id}`,
      type: "debate" as const,
      title: d.topic || "Debate",
      details: d.description || "Consensus debate",
    }));
    const agentEvents = (agents || []).slice(0, 6).map((a: any) => ({
      id: `agent-${a.id}`,
      type: "agent" as const,
      title: a.name || "Agent",
      details: a.persona || "Intelligence entity",
    }));
    const validationEvents = (projects || []).slice(0, 6).map((p: any) => ({
      id: `validation-${p.id}`,
      type: "validation" as const,
      title: p.title || "Validation",
      details: p.description || "Blueprint validated",
    }));
    const passportEvents = (passports || []).slice(0, 6).map((p: any) => ({
      id: `passport-${p.id}`,
      type: "passport" as const,
      title: p.revoked ? "Passport revoked" : "Passport",
      details: p.revoked ? "Revoked export" : "Exported passport",
    }));
    return [...debateEvents, ...agentEvents, ...validationEvents, ...passportEvents].slice(0, 16);
  }, [debates, agents, projects, passports]);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0c1a]/90 p-5">
      <div className="flex items-center gap-2">
        <Globe2 className="h-4 w-4 text-sky-300" />
        <h2 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>Intelligence Civilization Map</h2>
      </div>
      <div className="relative mt-4 h-64 w-full overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.18),transparent_35%),radial-gradient(circle_at_80%_30%,rgba(249,168,212,0.16),transparent_40%),linear-gradient(180deg,#0b1020,#06070f)]">
        <div className="absolute inset-0 opacity-40 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22500%22 height=%22250%22 viewBox=%220 0 500 250%22><path d=%22M10 120 C60 80 120 80 170 110 C220 140 280 140 340 110 C400 80 460 80 490 120%22 stroke=%22rgba(255,255,255,0.08)%22 fill=%22none%22/></svg>')]" />
        {events.map((event) => {
          const { x, y } = hashToCoord(event.id);
          return (
            <div
              key={event.id}
              className="absolute"
              style={{ left: `${x}%`, top: `${y}%` }}
              title={`${event.title} — ${event.details}`}
            >
              <span className="relative flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${COLORS[event.type]}/40`} />
                <span className={`relative inline-flex h-3 w-3 rounded-full ${COLORS[event.type]}`} />
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-white/40">Markers are approximated from event IDs for privacy.</p>
    </div>
  );
}
