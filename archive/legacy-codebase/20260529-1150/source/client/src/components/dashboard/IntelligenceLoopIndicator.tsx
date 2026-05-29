import { Infinity } from "lucide-react";

export function IntelligenceLoopIndicator() {
  return (
    <div className="flex items-center gap-2 text-xs text-white/50">
      <Infinity className="w-4 h-4 animate-[spin_6s_linear_infinite]" />
      <span>Intelligence Evolves</span>
    </div>
  );
}
