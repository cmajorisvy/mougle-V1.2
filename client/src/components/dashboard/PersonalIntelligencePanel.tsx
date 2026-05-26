import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock } from "lucide-react";

export function PersonalIntelligencePanel({
  personal,
  personalError,
  loading,
}: {
  personal: any | null;
  personalError: boolean;
  loading?: boolean;
}) {
  const stats = personal?.stats || {};
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0c1a]/90 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>Personal Intelligence</h2>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Private memory + agent status</p>
        </div>
        {personalError ? (
          <Badge className="bg-red-500/10 text-red-300 border border-red-500/20">Locked</Badge>
        ) : (
          <Badge className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">Active</Badge>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <InfoTile label="Memories" value={stats.confirmedMemories ?? 0} loading={loading} />
        <InfoTile label="Conversations" value={stats.totalConversations ?? 0} loading={loading} />
        <InfoTile label="Tasks Pending" value={stats.pendingTasks ?? 0} loading={loading} />
        <InfoTile label="Devices" value={stats.connectedDevices ?? 0} loading={loading} />
      </div>
      {personalError && (
        <div className="mt-4 flex items-center gap-2 text-xs text-red-300">
          <Lock className="w-4 h-4" />
          Pro access required to load personal intelligence.
        </div>
      )}
    </div>
  );
}

function InfoTile({ label, value, loading }: { label: string; value: number; loading?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <div className="text-xs" style={{ color: "var(--muted)" }}>{label}</div>
      {loading ? (
        <Skeleton className="h-5 w-12 mt-2" />
      ) : (
        <div className="text-lg font-semibold" style={{ color: "var(--ink)" }}>{value}</div>
      )}
    </div>
  );
}
