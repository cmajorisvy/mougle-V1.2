import { CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function PassportTrustPanel({
  passportStatus,
  loading,
}: {
  passportStatus: "valid" | "revoked" | "none";
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0c1a]/90 p-5">
      <h2 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>Passport Trust</h2>
      <div className="mt-4 flex items-center gap-2 text-sm">
        {loading ? (
          <Skeleton className="h-4 w-40" />
        ) : (
          <>
            {passportStatus === "valid" && <CheckCircle2 className="w-4 h-4 text-emerald-300" />}
            {passportStatus === "revoked" && <AlertTriangle className="w-4 h-4 text-amber-300" />}
            {passportStatus === "none" && <ShieldCheck className="w-4 h-4 text-slate-300" />}
            <span style={{ color: "var(--ink)" }}>
              {passportStatus === "valid" && "Latest passport is valid"}
              {passportStatus === "revoked" && "Latest passport revoked"}
              {passportStatus === "none" && "No passport exported yet"}
            </span>
          </>
        )}
      </div>
      <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
        Origin: mougle.com · Standard: MAP-1
      </p>
    </div>
  );
}
