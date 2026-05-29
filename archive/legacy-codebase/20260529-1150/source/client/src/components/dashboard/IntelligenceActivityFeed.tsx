import { useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, ShieldCheck, Network } from "lucide-react";

type FeedEvent = {
  id: string;
  type: "debate" | "agent" | "validation" | "passport";
  title: string;
  timestamp: string;
};

const ICONS: Record<FeedEvent["type"], any> = {
  debate: Network,
  agent: Bot,
  validation: CheckCircle2,
  passport: ShieldCheck,
};

function formatTime(value: string | number | Date | undefined) {
  if (!value) return "recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleTimeString();
}

export function IntelligenceActivityFeed({
  debates,
  agents,
  passports,
  projects,
}: {
  debates: any[];
  agents: any[];
  passports: any[];
  projects: any[];
}) {
  const items = useMemo<FeedEvent[]>(() => {
    const debateEvents = (debates || []).slice(0, 4).map((d: any) => ({
      id: `debate-${d.id}`,
      type: "debate" as const,
      title: d.topic || "Debate updated",
      timestamp: formatTime(d.createdAt || d.updatedAt),
    }));
    const agentEvents = (agents || []).slice(0, 3).map((a: any) => ({
      id: `agent-${a.id}`,
      type: "agent" as const,
      title: a.name || "Agent created",
      timestamp: formatTime(a.createdAt),
    }));
    const validationEvents = (projects || []).slice(0, 3).map((p: any) => ({
      id: `validation-${p.id}`,
      type: "validation" as const,
      title: p.title || "Project validated",
      timestamp: formatTime(p.createdAt),
    }));
    const passportEvents = (passports || []).slice(0, 3).map((p: any) => ({
      id: `passport-${p.id}`,
      type: "passport" as const,
      title: p.revoked ? "Passport revoked" : "Passport exported",
      timestamp: formatTime(p.exportedAt || p.createdAt),
    }));
    return [...debateEvents, ...agentEvents, ...validationEvents, ...passportEvents].slice(0, 12);
  }, [debates, agents, projects, passports]);

  const [start, setStart] = useState(0);

  useEffect(() => {
    if (items.length <= 4) return;
    const id = setInterval(() => {
      setStart((prev) => (prev + 1) % items.length);
    }, 15000);
    return () => clearInterval(id);
  }, [items.length]);

  const visible = items.length <= 4
    ? items
    : [items[start], items[(start + 1) % items.length], items[(start + 2) % items.length], items[(start + 3) % items.length]];

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0c1a]/90 p-5">
      <h2 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>Intelligence Activity</h2>
      <div className="mt-4 space-y-3 max-h-48 overflow-hidden">
        {visible.length === 0 ? (
          <div className="text-xs text-white/50">No activity yet.</div>
        ) : (
          visible.map((event) => {
            const Icon = ICONS[event.type];
            return (
              <div key={event.id} className="flex items-center gap-3 text-xs text-white/70">
                <span className="h-7 w-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                  <Icon className="h-3.5 w-3.5 text-white/70" />
                </span>
                <div className="flex-1">
                  <div className="text-sm text-white">{event.title}</div>
                  <div className="text-[10px] text-white/40">{event.timestamp}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
