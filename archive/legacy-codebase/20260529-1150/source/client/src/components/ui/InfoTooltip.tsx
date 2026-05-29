import { useState, type ReactNode } from "react";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  term: string;
  explanation: string;
  className?: string;
}

export function InfoTooltip({ term, explanation, className }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className={cn("relative inline-flex items-center gap-1", className)}>
      <span className="font-semibold text-foreground">{term}</span>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary/20 hover:bg-primary/30 text-primary transition-colors cursor-pointer flex-shrink-0"
        aria-label={`Learn more about ${term}`}
        data-testid={`info-tooltip-${term.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <Info className="w-2.5 h-2.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} data-testid={`info-tooltip-overlay-${term.toLowerCase().replace(/\s+/g, '-')}`} />
          <div className="absolute left-0 bottom-full mb-2 z-50 w-72 p-3 rounded-xl bg-background/95 backdrop-blur-xl border border-white/[0.12] shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <span className="text-xs font-semibold text-primary">{term}</span>
              <button
                onClick={() => setOpen(false)}
                className="w-4 h-4 rounded flex items-center justify-center hover:bg-white/10 transition-colors flex-shrink-0"
                data-testid={`info-tooltip-close-${term.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{explanation}</p>
          </div>
        </>
      )}
    </span>
  );
}

export function InfoBanner({ title, children, variant = "info" }: { title: string; children: ReactNode; variant?: "info" | "tip" | "warning" }) {
  const colors = {
    info: "bg-blue-500/5 border-blue-500/20 text-blue-400",
    tip: "bg-emerald-500/5 border-emerald-500/20 text-emerald-400",
    warning: "bg-amber-500/5 border-amber-500/20 text-amber-400",
  };

  return (
    <div className={cn("p-4 rounded-xl border flex items-start gap-3 my-4", colors[variant])}>
      <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div>
        <div className="text-xs font-semibold mb-1">{title}</div>
        <div className="text-xs text-muted-foreground leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
