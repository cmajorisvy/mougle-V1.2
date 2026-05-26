import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "#111318", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: 20, ...style }}>{children}</div>;
}

const STAGE_CONFIG: Record<string, { color: string; bg: string; icon: string; desc: string }> = {
  "Early Platform": { color: "#6b7280", bg: "rgba(107,114,128,0.15)", icon: "◇", desc: "Building foundations" },
  "Growing Ecosystem": { color: "#eab308", bg: "rgba(234,179,8,0.15)", icon: "◈", desc: "Users discovering value" },
  "Emerging Infrastructure": { color: "#4f7df9", bg: "rgba(79,125,249,0.15)", icon: "◆", desc: "Becoming essential" },
  "Inevitable Platform": { color: "#10b981", bg: "rgba(16,185,129,0.15)", icon: "⬢", desc: "Self-sustaining ecosystem" },
};

const CAT_COLORS: Record<string, string> = {
  "Creator Retention": "#10b981",
  "Organic Acquisition": "#4f7df9",
  "Knowledge Growth": "#a855f7",
  "Marketplace Activity": "#eab308",
  "User Return Rate": "#f97316",
};

function ProgressBar({ value, max = 100, color, height = 6 }: { value: number; max?: number; color: string; height?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ width: "100%", height, background: "rgba(255,255,255,0.05)", borderRadius: height / 2, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: height / 2, transition: "width 0.6s ease" }} />
    </div>
  );
}

function GaugeRing({ value, color, size = 120 }: { value: number; color: string; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const dashoffset = circ - (clamp(value, 0, 100) / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={10} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={circ} strokeDashoffset={dashoffset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.8s ease" }} />
    </svg>
  );
}

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

export default function InevitablePlatformMonitor() {
  const [showHistory, setShowHistory] = useState(false);

  const { data: analysis, isLoading } = useQuery({
    queryKey: ["/admin/inevitable-platform"],
    queryFn: () => (api as any).adminInevitablePlatform.getAnalysis(),
    refetchInterval: 60000,
  });

  const { data: history = [] } = useQuery({
    queryKey: ["/admin/inevitable-platform/history"],
    queryFn: () => (api as any).adminInevitablePlatform.getHistory(),
    enabled: showHistory,
  });

  const snapshotMut = useMutation({
    mutationFn: () => (api as any).adminInevitablePlatform.captureSnapshot(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/admin/inevitable-platform"] }); },
  });

  if (isLoading) return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>
      Loading Inevitable Platform Monitor...
    </div>
  );

  const a = analysis || { inevitabilityIndex: 0, platformStage: "Early Platform", metrics: {}, velocityScore: 0, breakdown: [], insights: [], stageProgress: { current: "Early Platform", nextStage: "Growing Ecosystem", progressToNext: 0 } };
  const stageCfg = STAGE_CONFIG[a.platformStage] || STAGE_CONFIG["Early Platform"];

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }} data-testid="text-page-title">Inevitable Platform Monitor</h1>
              <span style={{ background: stageCfg.bg, color: stageCfg.color, padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{stageCfg.icon} {a.platformStage}</span>
            </div>
            <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>Long-term ecosystem maturity and dependency tracking</p>
          </div>
          <button onClick={() => snapshotMut.mutate()} disabled={snapshotMut.isPending} data-testid="button-capture-snapshot" style={{
            background: "linear-gradient(135deg,#4f7df9,#3b82f6)", color: "#fff", border: "none",
            borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>{snapshotMut.isPending ? "Capturing..." : "Capture Snapshot"}</button>
        </div>

        {/* Inevitability Index Hero */}
        <Card style={{ marginBottom: 20, background: `linear-gradient(135deg, ${stageCfg.bg}, #111318)`, borderColor: `${stageCfg.color}30` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 40 }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <GaugeRing value={a.inevitabilityIndex} color={stageCfg.color} size={140} />
              <div style={{ position: "absolute", textAlign: "center" }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: stageCfg.color, fontVariantNumeric: "tabular-nums" }} data-testid="text-inevitability-index">{a.inevitabilityIndex}</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>/ 100</div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>Inevitability Index</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{a.platformStage}</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 12 }}>{stageCfg.desc}</div>
              <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                <div>
                  <span style={{ color: a.velocityScore >= 0 ? "#10b981" : "#ef4444", fontWeight: 700, fontSize: 16 }} data-testid="text-velocity">
                    {a.velocityScore >= 0 ? "+" : ""}{a.velocityScore}
                  </span>
                  <span style={{ color: "#6b7280", marginLeft: 4 }}>velocity</span>
                </div>
              </div>
            </div>
          </div>

          {/* Stage Progression */}
          <div style={{ marginTop: 20, padding: "12px 16px", background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              {Object.entries(STAGE_CONFIG).map(([name, cfg]) => (
                <div key={name} style={{ textAlign: "center", flex: 1 }}>
                  <div style={{ fontSize: 14, marginBottom: 2, color: name === a.platformStage ? cfg.color : "#4b5563" }}>{cfg.icon}</div>
                  <div style={{ fontSize: 9, color: name === a.platformStage ? cfg.color : "#4b5563", fontWeight: name === a.platformStage ? 700 : 400 }}>{name}</div>
                </div>
              ))}
            </div>
            <ProgressBar value={a.inevitabilityIndex} color={stageCfg.color} height={4} />
            {a.stageProgress.nextStage && (
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6, textAlign: "center" }}>
                {a.stageProgress.progressToNext}% progress to {a.stageProgress.nextStage}
              </div>
            )}
          </div>
        </Card>

        {/* Breakdown Scores */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
          {a.breakdown.map((b: any) => (
            <Card key={b.category} style={{ textAlign: "center", padding: 16 }}>
              <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>{b.category}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: CAT_COLORS[b.category] || "#fff", fontVariantNumeric: "tabular-nums" }} data-testid={`score-${b.category.toLowerCase().replace(/\s/g, "-")}`}>
                {b.score}
              </div>
              <ProgressBar value={b.score} color={CAT_COLORS[b.category] || "#4f7df9"} />
              <div style={{ fontSize: 10, color: "#4b5563", marginTop: 6 }}>
                weight: {(b.weight * 100).toFixed(0)}% &middot; +{b.weighted}
              </div>
            </Card>
          ))}
        </div>

        {/* Metrics + Insights */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <Card>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14, fontWeight: 600 }}>Ecosystem Metrics</div>
            {[
              { label: "Creator Retention Rate", value: `${a.metrics.creatorRetentionRate || 0}%`, color: "#10b981" },
              { label: "Active Creators (30d)", value: a.metrics.activeCreators30d || 0, color: "#10b981" },
              { label: "Active Creators (60d prior)", value: a.metrics.activeCreators60d || 0, color: "#6b7280" },
              { label: "Organic Acquisition Rate", value: `${a.metrics.organicAcquisitionRate || 0}%`, color: "#4f7df9" },
              { label: "New Users (7d)", value: a.metrics.newUsersThisWeek || 0, color: "#4f7df9" },
              { label: "User Return Frequency", value: `${a.metrics.userReturnFrequency || 0}%`, color: "#f97316" },
              { label: "Returning Users (7d)", value: a.metrics.returningUsers || 0, color: "#f97316" },
              { label: "Knowledge Pages Total", value: a.metrics.knowledgePageTotal || 0, color: "#a855f7" },
              { label: "Knowledge Growth (30d)", value: a.metrics.knowledgePagesLastMonth || 0, color: "#a855f7" },
              { label: "Sandbox Review Events", value: a.metrics.marketplaceTransactionCount || 0, color: "#eab308" },
              { label: "Prepared Apps", value: a.metrics.publishedApps || 0, color: "#eab308" },
              { label: "Total Installations", value: a.metrics.totalInstallations || 0, color: "#eab308" },
              { label: "Revenue Disabled", value: "Disabled", color: "#10b981" },
              { label: "Total Users", value: a.metrics.totalUsers || 0, color: "#6b7280" },
            ].map(m => (
              <div key={m.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>{m.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: m.color, fontVariantNumeric: "tabular-nums" }} data-testid={`metric-${m.label.toLowerCase().replace(/[\s()]/g, "-")}`}>{m.value}</span>
              </div>
            ))}
          </Card>

          <Card>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14, fontWeight: 600 }}>Founder Insights</div>
            {a.insights.map((r: string, i: number) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: i === 0 ? "rgba(239,68,68,0.1)" : "rgba(79,125,249,0.1)", color: i === 0 ? "#ef4444" : "#4f7df9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <span style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.5 }}>{r}</span>
              </div>
            ))}

            <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.15)" }}>
              <div style={{ fontSize: 11, color: "#a855f7", fontWeight: 600, marginBottom: 4 }}>Platform Inevitability</div>
              <p style={{ fontSize: 12, color: "#9ca3af", margin: 0, lineHeight: 1.5 }}>
                A platform becomes inevitable when users can't easily leave — not because they're locked in, but because the value they've built and the ecosystem they depend on makes switching irrational.
              </p>
            </div>
          </Card>
        </div>

        {/* History */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showHistory ? 14 : 0 }}>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Snapshot History</div>
            <button onClick={() => setShowHistory(!showHistory)} data-testid="button-toggle-history" style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6,
              padding: "6px 14px", fontSize: 11, color: "#9ca3af", cursor: "pointer", fontWeight: 600,
            }}>{showHistory ? "Hide" : "Show"} History</button>
          </div>
          {showHistory && (
            history.length === 0 ? (
              <div style={{ textAlign: "center", padding: 20, color: "#4b5563", fontSize: 13 }}>No snapshots yet. Capture your first one above.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {history.map((h: any) => {
                  const cfg = STAGE_CONFIG[h.platformStage] || STAGE_CONFIG["Early Platform"];
                  return (
                    <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 20, fontWeight: 700, color: cfg.color, fontVariantNumeric: "tabular-nums", minWidth: 40 }}>{h.inevitabilityIndex}</span>
                        <span style={{ background: cfg.bg, color: cfg.color, padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 600 }}>{h.platformStage}</span>
                      </div>
                      <div style={{ display: "flex", gap: 14, fontSize: 11, color: "#6b7280" }}>
                        <span>Ret: {h.creatorRetentionRate}%</span>
                        <span>{h.knowledgePageTotal} content</span>
                        <span>{h.marketplaceTransactionCount} reviews</span>
                        <span style={{ color: h.velocityScore >= 0 ? "#10b981" : "#ef4444" }}>
                          {h.velocityScore >= 0 ? "+" : ""}{h.velocityScore} vel
                        </span>
                        <span>{new Date(h.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </Card>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 24 }}>
          {[
            { label: "Authority Flywheel", href: "/admin/authority-flywheel" },
            { label: "PNR Monitor", href: "/admin/pnr-monitor" },
            { label: "SEO Dashboard", href: "/admin/seo" },
            { label: "Workday", href: "/admin/workday" },
          ].map(link => (
            <a key={link.href} href={link.href} style={{
              padding: "6px 14px", borderRadius: 6, background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)", color: "#9ca3af", fontSize: 12, textDecoration: "none",
            }}>{link.label}</a>
          ))}
        </div>
      </div>
    </div>
  );
}
