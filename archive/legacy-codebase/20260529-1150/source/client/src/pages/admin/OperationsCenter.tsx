import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

const ENGINE_ICONS: Record<string, string> = {
  moderation: "🛡️",
  growth: "📈",
  economic: "💰",
  support: "🎧",
  compliance: "⚖️",
  stability: "🏗️",
};

const ENGINE_LABELS: Record<string, string> = {
  moderation: "Moderation Engine",
  growth: "Growth Engine",
  economic: "Economic Engine",
  support: "Support Engine",
  compliance: "Compliance Engine",
  stability: "Stability Engine",
};

const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  healthy: { bg: "rgba(16,185,129,0.1)", color: "#10b981", border: "rgba(16,185,129,0.3)" },
  warning: { bg: "rgba(234,179,8,0.1)", color: "#eab308", border: "rgba(234,179,8,0.3)" },
  critical: { bg: "rgba(239,68,68,0.1)", color: "#ef4444", border: "rgba(239,68,68,0.3)" },
  offline: { bg: "rgba(107,114,128,0.1)", color: "#6b7280", border: "rgba(107,114,128,0.3)" },
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "#4f7df9",
  warning: "#eab308",
  critical: "#ef4444",
};

const OPS_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  autonomous: { bg: "linear-gradient(135deg,#10b981,#059669)", text: "#fff", label: "AUTONOMOUS" },
  supervised: { bg: "linear-gradient(135deg,#4f7df9,#3b82f6)", text: "#fff", label: "SUPERVISED" },
  manual: { bg: "linear-gradient(135deg,#eab308,#ca8a04)", text: "#000", label: "MANUAL" },
  emergency: { bg: "linear-gradient(135deg,#ef4444,#dc2626)", text: "#fff", label: "EMERGENCY" },
};

export default function OperationsCenter() {
  const [selectedEngine, setSelectedEngine] = useState<string | null>(null);
  const [showActions, setShowActions] = useState(false);

  const { data: snapshot, isLoading } = useQuery({
    queryKey: ["/admin/operations/snapshot"],
    queryFn: () => api.adminOps.getSnapshot(),
    refetchInterval: 60000,
  });

  const { data: pendingApprovals = [] } = useQuery({
    queryKey: ["/admin/operations/pending"],
    queryFn: () => api.adminOps.getPending(),
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.adminOps.approveAction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/admin/operations"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.adminOps.rejectAction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/admin/operations"] });
    },
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#fff", marginBottom: 8 }}>Initializing Operations Stack...</div>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Running all 6 engines</p>
        </div>
      </div>
    );
  }

  const opsStyle = OPS_STATUS_STYLES[snapshot?.overallStatus || "autonomous"];

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 20px" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h1 data-testid="text-page-title" style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: 0 }}>Operations Center</h1>
            <p style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>Autonomous platform operations under founder supervision</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div data-testid="text-ops-status" style={{ background: opsStyle.bg, color: opsStyle.text, padding: "8px 20px", borderRadius: 10, fontSize: 12, fontWeight: 700, letterSpacing: 1.5 }}>
              {opsStyle.label}
            </div>
            <div style={{ background: "#12141e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "8px 16px", textAlign: "center" }}>
              <p style={{ color: snapshot?.overallHealth >= 80 ? "#10b981" : snapshot?.overallHealth >= 50 ? "#eab308" : "#ef4444", fontSize: 20, fontWeight: 700, margin: 0 }}>{snapshot?.overallHealth || 0}%</p>
              <p style={{ color: "#6b7280", fontSize: 9, margin: 0 }}>HEALTH</p>
            </div>
          </div>
        </div>

        {snapshot?.summary && (
          <div data-testid="section-summary" style={{ background: "#12141e", border: "1px solid rgba(79,125,249,0.15)", borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
            <p style={{ color: "#4f7df9", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 6px" }}>AI Operations Summary</p>
            <p style={{ color: "#e5e7eb", fontSize: 13, margin: 0, lineHeight: 1.6 }}>{snapshot.summary}</p>
          </div>
        )}

        {pendingApprovals.length > 0 && (
          <div data-testid="section-pending" style={{ background: "#12141e", border: "1px solid rgba(234,179,8,0.2)", borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
            <p style={{ color: "#eab308", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 10px" }}>
              Pending Approvals ({pendingApprovals.length})
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pendingApprovals.map((a: any) => (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a0b10", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14 }}>{ENGINE_ICONS[a.engine]}</span>
                      <span style={{ color: SEVERITY_COLORS[a.severity] || "#4f7df9", fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>{a.engine}</span>
                      <span style={{ color: "#6b7280", fontSize: 10 }}>{a.actionType}</span>
                    </div>
                    <p style={{ color: "#e5e7eb", fontSize: 12, margin: "4px 0 0" }}>{a.description}</p>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      data-testid={`button-approve-${a.id}`}
                      onClick={() => approveMutation.mutate(a.id)}
                      style={{ background: "#10b981", border: "none", borderRadius: 6, padding: "5px 12px", color: "#fff", fontSize: 10, fontWeight: 600, cursor: "pointer" }}
                    >
                      Approve
                    </button>
                    <button
                      data-testid={`button-reject-${a.id}`}
                      onClick={() => rejectMutation.mutate(a.id)}
                      style={{ background: "#ef4444", border: "none", borderRadius: 6, padding: "5px 12px", color: "#fff", fontSize: 10, fontWeight: 600, cursor: "pointer" }}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
          {(snapshot?.engines || []).map((eng: any) => {
            const st = STATUS_STYLES[eng.status] || STATUS_STYLES.offline;
            return (
              <button
                key={eng.engine}
                data-testid={`card-engine-${eng.engine}`}
                onClick={() => setSelectedEngine(selectedEngine === eng.engine ? null : eng.engine)}
                style={{
                  background: selectedEngine === eng.engine ? "#1a1d27" : "#12141e",
                  border: `1px solid ${selectedEngine === eng.engine ? "rgba(79,125,249,0.3)" : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 14, padding: "18px 20px", cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 20 }}>{ENGINE_ICONS[eng.engine]}</span>
                    <span style={{ color: "#e5e7eb", fontSize: 13, fontWeight: 600 }}>{ENGINE_LABELS[eng.engine]}</span>
                  </div>
                  <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, borderRadius: 6, padding: "3px 10px", fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}>
                    {eng.status}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <p style={{ color: "#6b7280", fontSize: 11, margin: 0, maxWidth: "70%" }}>{eng.description}</p>
                  <p style={{ color: eng.score >= 80 ? "#10b981" : eng.score >= 50 ? "#eab308" : "#ef4444", fontSize: 24, fontWeight: 700, margin: 0 }}>{Math.round(eng.score)}</p>
                </div>
                <div style={{ marginTop: 8, height: 3, background: "#1a1d27", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${eng.score}%`, height: "100%", background: eng.score >= 80 ? "#10b981" : eng.score >= 50 ? "#eab308" : "#ef4444", borderRadius: 2 }} />
                </div>
              </button>
            );
          })}
        </div>

        {selectedEngine && (
          <EngineDetail engine={selectedEngine} snapshot={snapshot} />
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, marginTop: 8 }}>
          <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 600, margin: 0 }}>Recent Actions</h2>
          <button
            data-testid="button-toggle-actions"
            onClick={() => setShowActions(!showActions)}
            style={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "5px 14px", color: "#9ca3af", fontSize: 11, cursor: "pointer" }}
          >
            {showActions ? "Hide" : "Show All"}
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {(snapshot?.recentActions || []).slice(0, showActions ? 20 : 5).map((a: any) => (
            <div key={a.id} data-testid={`row-action-${a.id}`} style={{ background: "#12141e", borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14 }}>{ENGINE_ICONS[a.engine] || "⚙️"}</span>
                <div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ color: SEVERITY_COLORS[a.severity] || "#4f7df9", fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}>{a.severity}</span>
                    <span style={{ color: "#6b7280", fontSize: 10 }}>{a.actionType}</span>
                  </div>
                  <p style={{ color: "#e5e7eb", fontSize: 12, margin: "2px 0 0" }}>{a.description}</p>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{
                  fontSize: 9, fontWeight: 600, padding: "3px 8px", borderRadius: 4,
                  background: a.status === "auto_executed" ? "rgba(16,185,129,0.1)" : a.status === "pending" ? "rgba(234,179,8,0.1)" : a.status === "approved" ? "rgba(79,125,249,0.1)" : "rgba(107,114,128,0.1)",
                  color: a.status === "auto_executed" ? "#10b981" : a.status === "pending" ? "#eab308" : a.status === "approved" ? "#4f7df9" : "#6b7280",
                }}>
                  {a.status.replace("_", " ")}
                </span>
                <p style={{ color: "#4b5563", fontSize: 9, margin: "4px 0 0" }}>{new Date(a.createdAt).toLocaleTimeString()}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EngineDetail({ engine, snapshot }: { engine: string; snapshot: any }) {
  const eng = snapshot?.engines?.find((e: any) => e.engine === engine);
  if (!eng) return null;

  const metrics = eng.metrics || {};

  return (
    <div data-testid={`section-engine-detail-${engine}`} style={{ background: "#12141e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "20px 24px", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>{ENGINE_ICONS[engine]}</span>
          <div>
            <h3 style={{ color: "#fff", fontSize: 16, fontWeight: 600, margin: 0 }}>{ENGINE_LABELS[engine]}</h3>
            <p style={{ color: "#6b7280", fontSize: 11, margin: "2px 0 0" }}>Last run: {eng.lastRun ? new Date(eng.lastRun).toLocaleString() : "Never"}</p>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ color: eng.score >= 80 ? "#10b981" : eng.score >= 50 ? "#eab308" : "#ef4444", fontSize: 28, fontWeight: 700, margin: 0 }}>{Math.round(eng.score)}%</p>
          <p style={{ color: "#6b7280", fontSize: 9, margin: 0 }}>HEALTH SCORE</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 8 }}>
        {Object.entries(metrics).map(([key, value]: [string, any]) => (
          <div key={key} style={{ background: "#0a0b10", borderRadius: 8, padding: "10px 12px" }}>
            <p style={{ color: "#e5e7eb", fontSize: 16, fontWeight: 600, margin: 0 }}>{typeof value === "number" ? (Number.isInteger(value) ? value : value.toFixed(1)) : String(value)}</p>
            <p style={{ color: "#6b7280", fontSize: 9, margin: "2px 0 0", textTransform: "uppercase" }}>{key.replace(/([A-Z])/g, " $1").trim()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
