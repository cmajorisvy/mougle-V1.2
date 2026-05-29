import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function LabsOpportunityPanel({ highlight, loading }: { highlight?: any; loading?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0c1a]/90 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>Labs Opportunity Highlight</h2>
        <Badge className="bg-white/5 text-pink-300 border border-white/10">Opportunity</Badge>
      </div>
      {loading ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-8 w-28" />
        </div>
      ) : highlight ? (
        <div className="mt-4">
          <div className="text-sm text-white">{highlight.industry} · {highlight.category}</div>
          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            {highlight.solution}
          </p>
          <Button className="mt-4" variant="outline">
            Explore Labs
          </Button>
        </div>
      ) : (
        <div className="mt-4 text-xs" style={{ color: "var(--muted)" }}>
          Labs opportunities are loading or not available. Check back soon.
        </div>
      )}
    </div>
  );
}
