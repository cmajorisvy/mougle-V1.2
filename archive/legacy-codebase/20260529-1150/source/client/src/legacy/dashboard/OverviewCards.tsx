import { Bot, Boxes, Network, ShieldCheck, Sparkles, MessageSquare, Gauge } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";

export function OverviewCards({
  agentsCount,
  debatesCount,
  discussionsCount,
  labsCount,
  appsCount,
  passportsCount,
  intelligenceScore,
  intelligenceLevel,
  weeklyGrowth,
  loading,
}: {
  agentsCount: number;
  debatesCount: number;
  discussionsCount: number;
  labsCount: number;
  appsCount: number;
  passportsCount: number;
  intelligenceScore: number;
  intelligenceLevel: string;
  weeklyGrowth: number;
  loading?: boolean;
}) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [scoreDone, setScoreDone] = useState(false);
  const [levelVisible, setLevelVisible] = useState(false);

  useEffect(() => {
    if (loading) {
      setAnimatedScore(0);
      setScoreDone(false);
      setLevelVisible(false);
      return;
    }

    const target = Math.max(0, intelligenceScore);
    const durationMs = 700;
    const start = performance.now();

    let raf = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const value = Math.round(target * progress);
      setAnimatedScore(value);
      if (progress < 1) {
        raf = requestAnimationFrame(step);
      } else {
        setScoreDone(true);
        setTimeout(() => setLevelVisible(true), 150);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [intelligenceScore, loading]);

  const cards = [
    { label: "Intelligence Score", value: intelligenceScore, icon: Gauge, sublabel: intelligenceLevel },
    { label: "Discussions", value: discussionsCount, icon: MessageSquare },
    { label: "Debates", value: debatesCount, icon: Network },
    { label: "Agents", value: agentsCount, icon: Bot },
    { label: "Labs", value: labsCount, icon: Boxes },
    { label: "Apps", value: appsCount, icon: Sparkles },
    { label: "Passports", value: passportsCount, icon: ShieldCheck },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-white/10 bg-[var(--card)]/90 p-4">
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
            <card.icon className="w-4 h-4" />
            {card.label}
          </div>
          <div className="mt-2">
            {loading ? (
              <Skeleton className="h-6 w-12" />
            ) : (
              <div
                className={`text-2xl font-semibold ${card.label === "Intelligence Score" && scoreDone ? "animate-pulse" : ""}`}
                style={{ color: "var(--ink)", textShadow: card.label === "Intelligence Score" && scoreDone ? "0 0 10px rgba(125,211,252,0.35)" : "none" }}
              >
                {card.label === "Intelligence Score" ? animatedScore : card.value}
              </div>
            )}
          </div>
          {card.sublabel && (
            <div className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
              {loading
                ? "…"
                : card.label === "Intelligence Score"
                  ? (
                    <span className={`transition-opacity duration-300 ${levelVisible ? "opacity-100" : "opacity-0"}`}>
                      {card.sublabel}
                    </span>
                  )
                  : card.sublabel}
            </div>
          )}
          {card.label === "Intelligence Score" && !loading && weeklyGrowth > 0 && (
            <div className="text-[11px] mt-1 text-emerald-300">
              +{weeklyGrowth} this week
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
