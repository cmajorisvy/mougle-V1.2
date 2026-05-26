import { Skeleton } from "@/components/ui/skeleton";

type TimelineEvent = {
  id: string;
  title: string;
  timestamp: string;
  status: "debate" | "labs" | "agent" | "passport";
  details: string;
};

const STATUS_STYLES: Record<TimelineEvent["status"], { dot: string; ring: string }> = {
  debate: { dot: "bg-sky-400", ring: "ring-sky-500/30" },
  labs: { dot: "bg-pink-400", ring: "ring-pink-500/30" },
  agent: { dot: "bg-emerald-400", ring: "ring-emerald-500/30" },
  passport: { dot: "bg-amber-400", ring: "ring-amber-500/30" },
};

function formatTimestamp(value: string | number | Date | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

export function IntelligenceTimeline({
  debates,
  labsOps,
  agents,
  passports,
  loading,
}: {
  debates: any[];
  labsOps: any[];
  agents: any[];
  passports: any[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0a0c1a]/90 p-5">
        <h2 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>Intelligence Timeline</h2>
        <div className="mt-4 flex gap-3">
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-3 w-3 rounded-full" />
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }
  const events: TimelineEvent[] = [
    ...(debates || []).slice(0, 3).map((d: any) => ({
      id: `debate-${d.id}`,
      title: d.topic || "Debate created",
      timestamp: formatTimestamp(d.createdAt || d.updatedAt),
      status: "debate" as const,
      details: d.description || "Consensus debate activity.",
    })),
    ...(labsOps || []).slice(0, 2).map((l: any) => ({
      id: `labs-${l.id}`,
      title: `${l.industry || "Labs"} · ${l.category || "Opportunity"}`,
      timestamp: formatTimestamp(l.createdAt),
      status: "labs" as const,
      details: l.solution || "Labs opportunity generated.",
    })),
    ...(agents || []).slice(0, 2).map((a: any) => ({
      id: `agent-${a.id}`,
      title: a.name || "Agent created",
      timestamp: formatTimestamp(a.createdAt),
      status: "agent" as const,
      details: a.persona || "New agent added to your network.",
    })),
    ...(passports || []).slice(0, 2).map((p: any) => ({
      id: `passport-${p.id}`,
      title: p.revoked ? "Passport revoked" : "Passport export",
      timestamp: formatTimestamp(p.exportedAt || p.createdAt),
      status: "passport" as const,
      details: p.revoked ? "Export revoked for security." : "Portable passport created.",
    })),
  ]
    .filter(Boolean)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 15);

  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0a0c1a]/90 p-5">
        <h2 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>Intelligence Timeline</h2>
        <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
          Timeline will populate as debates, labs, agents, and passports are created.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0c1a]/90 p-5">
      <h2 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>Intelligence Timeline</h2>
      <div className="mt-4 overflow-x-auto pb-2">
        <div className="flex min-w-max items-center gap-6">
          {events.map((event, idx) => {
            const style = STATUS_STYLES[event.status];
            return (
              <div key={event.id} className="relative">
                <div
                  className={`w-3 h-3 rounded-full ${style.dot} ring-4 ${style.ring}`}
                  title={event.details}
                />
                {idx < events.length - 1 && (
                  <div className="absolute left-3 top-1.5 h-px w-12 bg-white/15" />
                )}
                <div className="mt-3 w-48">
                  <div className="text-sm font-semibold text-white">{event.title}</div>
                  <div className="text-[11px]" style={{ color: "var(--muted)" }}>{event.timestamp}</div>
                  <div className="text-[11px] text-white/50">{event.details}</div>
                </div>
              </div>
            );
          })}
          <a
            href="#"
            className="text-xs text-sky-300 hover:text-sky-200 whitespace-nowrap"
          >
            View Full History
          </a>
        </div>
      </div>
    </div>
  );
}
