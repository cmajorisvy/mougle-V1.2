import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap } from "lucide-react";

export function NextActionPanel({
  nextAction,
  loading,
}: {
  nextAction: { title: string; description: string; cta: string };
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0c1a]/90 p-5">
      <h2 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>Next Best Action</h2>
      <div className="mt-4 flex items-start gap-2">
        <Zap className="w-4 h-4 text-sky-300 mt-0.5" />
        {loading ? (
          <Skeleton className="h-4 w-48" />
        ) : (
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{nextAction.title}</p>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{nextAction.description}</p>
          </div>
        )}
      </div>
      <Button className="mt-4 w-full">
        {loading ? "Loading…" : nextAction.cta}
      </Button>
    </div>
  );
}
