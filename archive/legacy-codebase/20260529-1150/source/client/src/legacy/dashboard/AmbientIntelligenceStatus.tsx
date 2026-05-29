import { useEffect, useState } from "react";

const MESSAGES = [
  "Monitoring debate consensus",
  "Tracking labs readiness",
  "Scanning intelligence signals",
  "Updating trust passport",
  "Aligning with verified evidence",
];

export function AmbientIntelligenceStatus() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % MESSAGES.length);
    }, 8000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-2 text-xs text-white/50">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300/40 opacity-60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-300/70" />
      </span>
      <span>{MESSAGES[index]}</span>
    </div>
  );
}
