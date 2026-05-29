import { ArrowRight, Boxes, CheckCircle2, Network, MessageSquare, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { IntelligenceLoopIndicator } from "./IntelligenceLoopIndicator";

export function IntelligencePipeline({
  discussionsCount,
  debatesCount,
  labsCount,
  appsCount,
  loading,
}: {
  discussionsCount: number;
  debatesCount: number;
  labsCount: number;
  appsCount: number;
  loading?: boolean;
}) {
  const steps = [
    { label: "Discussion", value: discussionsCount, icon: MessageSquare },
    { label: "Debate", value: debatesCount, icon: Network },
    { label: "Validation", value: "Signals", icon: CheckCircle2 },
    { label: "Labs", value: labsCount, icon: Boxes },
    { label: "Marketplace", value: appsCount, icon: Sparkles },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0c1a]/90 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>Intelligence Pipeline</h2>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Discussion → Debate → Validation → Labs → Marketplace</p>
        </div>
        <IntelligenceLoopIndicator />
      </div>
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-2">
        {steps.map((step, idx) => (
          <div key={step.label} className="relative">
            <div className="rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                <step.icon className="w-4 h-4" />
                {step.label}
              </div>
              <div className="mt-1">
                {loading ? (
                  <Skeleton className="h-4 w-14" />
                ) : (
                  <div className="text-base font-semibold" style={{ color: "var(--ink)" }}>
                    {step.value}
                  </div>
                )}
              </div>
            </div>
            {idx < steps.length - 1 && (
              <ArrowRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 text-white/20 w-4 h-4" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
