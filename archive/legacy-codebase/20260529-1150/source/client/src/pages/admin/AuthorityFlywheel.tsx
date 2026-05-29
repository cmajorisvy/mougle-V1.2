import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "#111318", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: 20, ...style }}>{children}</div>;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: string }> = {
  "Starting": { color: "#6b7280", bg: "rgba(107,114,128,0.15)", icon: "○" },
  "Building Momentum": { color: "#eab308", bg: "rgba(234,179,8,0.15)", icon: "◑" },
  "Accelerating": { color: "#4f7df9", bg: "rgba(79,125,249,0.15)", icon: "◕" },
  "Dominant Growth": { color: "#10b981", bg: "rgba(16,185,129,0.15)", icon: "●" },
};

const CATEGORY_COLORS: Record<string, string> = {
  "Knowledge Pages": "#4f7df9",
  "Apps Published": "#a855f7",
  "Creator Activity": "#10b981",
  "Organic Traffic": "#eab308",
  "Content Updates": "#f97316",
};

function ProgressBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
    </div>
  );
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 120, h = 32;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

export default function AuthorityFlywheel() {
  const [showHistory, setShowHistory] = useState(false);

  const { data: analysis, isLoading } = useQuery({
    queryKey: ["/admin/authority-flywheel"],
    queryFn: () => (api as any).adminAuthorityFlywheel.getAnalysis(),
    refetchInterval: 60000,
  });

  const { data: history = [] } = useQuery({
    queryKey: ["/admin/authority-flywheel/history"],
    queryFn: () => (api as any).adminAuthorityFlywheel.getHistory(),
    enabled: showHistory,
  });

  const snapshotMut = useMutation({
    mutationFn: () => (api as any).adminAuthorityFlywheel.captureSnapshot(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/admin/authority-flywheel"] });
    },
  });

  if (isLoading) return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>
      Loading Authority Flywheel...
    </div>
  );

  const a = analysis || { authorityIndex: 0, flywheelStatus: "Starting", metrics: {}, velocityScore: 0, breakdown: [], recommendations: [] };
  const statusCfg = STATUS_CONFIG[a.flywheelStatus] || STATUS_CONFIG["Starting"];
  const indexHistory = history.map((h: any) => h.authorityIndex);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }} data-testid="text-page-title">Authority Flywheel</h1>
              <span style={{ background: statusCfg.bg, color: statusCfg.color, padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{statusCfg.icon} {a.flywheelStatus}</span>
            </div>
            <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>Continuous compounding growth of platform authority</p>
          </div>
          <button onClick={() => snapshotMut.mutate()} disabled={snapshotMut.isPending} data-testid="button-capture-snapshot" style={{
            background: "linear-gradient(135deg,#4f7df9,#3b82f6)", color: "#fff", border: "none",
            borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>{snapshotMut.isPending ? "Capturing..." : "Capture Snapshot"}</button>
        </div>

        {/* Authority Index Hero */}
        <Card style={{ marginBottom: 20, textAlign: "center", padding: 32, background: `linear-gradient(135deg, ${statusCfg.bg}, #111318)`, borderColor: `${statusCfg.color}30` }}>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Authority Index</div>
          <div style={{ fontSize: 56, fontWeight: 800, color: statusCfg.color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }} data-testid="text-authority-index">
            {a.authorityIndex}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>out of 100</div>
          <div style={{ width: "60%", margin: "16px auto 0" }}>
            <ProgressBar value={a.authorityIndex} color={statusCfg.color} />
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 16 }}>
            <div>
              <span style={{ fontSize: 18, fontWeight: 700, color: a.velocityScore >= 0 ? "#10b981" : "#ef4444" }} data-testid="text-velocity">
                {a.velocityScore >= 0 ? "+" : ""}{a.velocityScore}
              </span>
              <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 4 }}>velocity</span>
            </div>
            {indexHistory.length > 1 && <MiniSparkline data={indexHistory.reverse()} color={statusCfg.color} />}
          </div>

          {/* Status Progression */}
          <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 20 }}>
            {Object.entries(STATUS_CONFIG).map(([name, cfg]) => (
              <div key={name} style={{
                padding: "4px 12px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                background: name === a.flywheelStatus ? cfg.bg : "rgba(255,255,255,0.02)",
                color: name === a.flywheelStatus ? cfg.color : "#4b5563",
                border: `1px solid ${name === a.flywheelStatus ? cfg.color + "40" : "transparent"}`,
              }}>{cfg.icon} {name}</div>
            ))}
          </div>
        </Card>

        {/* Breakdown Scores */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
          {a.breakdown.map((b: any) => (
            <Card key={b.category} style={{ textAlign: "center", padding: 16 }}>
              <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>{b.category}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: CATEGORY_COLORS[b.category] || "#fff", fontVariantNumeric: "tabular-nums" }} data-testid={`score-${b.category.toLowerCase().replace(/\s/g, "-")}`}>
                {b.score}
              </div>
              <ProgressBar value={b.score} color={CATEGORY_COLORS[b.category] || "#4f7df9"} />
              <div style={{ fontSize: 10, color: "#4b5563", marginTop: 6 }}>
                weight: {(b.weight * 100).toFixed(0)}% &middot; +{b.weighted}
              </div>
            </Card>
          ))}
        </div>

        {/* Metrics + Recommendations */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <Card>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14, fontWeight: 600 }}>Platform Metrics</div>
            {[
              { label: "Knowledge Pages", value: a.metrics.knowledgePageCount, color: "#4f7df9" },
              { label: "Indexed Pages", value: a.metrics.indexedPageCount, color: "#10b981" },
              { label: "Published Apps", value: a.metrics.publishedAppCount, color: "#a855f7" },
              { label: "Active Creators (30d)", value: a.metrics.activeCreatorCount, color: "#eab308" },
              { label: "Total Views", value: a.metrics.totalViews, color: "#f97316" },
              { label: "Total Citations", value: a.metrics.totalCitations, color: "#06b6d4" },
              { label: "SEO Pages", value: a.metrics.seoPageCount, color: "#4f7df9" },
              { label: "Articles", value: a.metrics.articleCount, color: "#a855f7" },
              { label: "Topic Clusters", value: a.metrics.clusterCount, color: "#10b981" },
              { label: "Update Frequency", value: `${a.metrics.contentUpdateFrequency}%`, color: "#f97316" },
            ].map(m => (
              <div key={m.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>{m.label}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: m.color, fontVariantNumeric: "tabular-nums" }} data-testid={`metric-${m.label.toLowerCase().replace(/[\s()]/g, "-")}`}>{m.value}</span>
              </div>
            ))}
          </Card>

          <Card>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14, fontWeight: 600 }}>Recommendations</div>
            {a.recommendations.map((r: string, i: number) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(79,125,249,0.1)", color: "#4f7df9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <span style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.5 }}>{r}</span>
              </div>
            ))}

            <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}>
              <div style={{ fontSize: 11, color: "#10b981", fontWeight: 600, marginBottom: 4 }}>Flywheel Effect</div>
              <p style={{ fontSize: 12, color: "#9ca3af", margin: 0, lineHeight: 1.5 }}>
                Each metric reinforces the others: more knowledge pages attract organic traffic, which draws creators, who publish apps and content, which builds authority and attracts more traffic.
              </p>
            </div>
          </Card>
        </div>

        {/* History Toggle */}
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
                  const cfg = STATUS_CONFIG[h.flywheelStatus] || STATUS_CONFIG["Starting"];
                  return (
                    <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 20, fontWeight: 700, color: cfg.color, fontVariantNumeric: "tabular-nums", minWidth: 40 }}>{h.authorityIndex}</span>
                        <span style={{ background: cfg.bg, color: cfg.color, padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 600 }}>{h.flywheelStatus}</span>
                      </div>
                      <div style={{ display: "flex", gap: 14, fontSize: 11, color: "#6b7280" }}>
                        <span>{h.knowledgePageCount} pages</span>
                        <span>{h.publishedAppCount} apps</span>
                        <span>{h.activeCreatorCount} creators</span>
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
            { label: "SEO Dashboard", href: "/admin/seo" },
            { label: "Marketing Engine", href: "/admin/marketing" },
            { label: "PNR Monitor", href: "/admin/pnr-monitor" },
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
