import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const METRIC_LABELS: Record<string, { label: string; icon: string; description: string }> = {
  organicGrowth: { label: "Organic Growth", icon: "🌱", description: "User signups from organic channels vs paid" },
  creatorEarnings: { label: "Creator Earnings", icon: "💰", description: "Revenue activity from platform creators" },
  dailyUGC: { label: "Daily Content", icon: "📝", description: "User-generated posts and contributions" },
  aiOptimization: { label: "AI Optimization", icon: "🤖", description: "AI augmentation effectiveness" },
  userRetention: { label: "User Retention", icon: "🔄", description: "Users returning and staying active" },
};

const TREND_LABELS: Record<string, { color: string; symbol: string }> = {
  improving: { color: "#10b981", symbol: "↑" },
  declining: { color: "#ef4444", symbol: "↓" },
  stable: { color: "#6b7280", symbol: "→" },
};

const INSIGHT_STYLES: Record<string, { bg: string; border: string; color: string; icon: string }> = {
  strength: { bg: "rgba(16,185,129,0.06)", border: "rgba(16,185,129,0.2)", color: "#10b981", icon: "✓" },
  weakness: { bg: "rgba(239,68,68,0.06)", border: "rgba(239,68,68,0.2)", color: "#ef4444", icon: "✗" },
  opportunity: { bg: "rgba(79,125,249,0.06)", border: "rgba(79,125,249,0.2)", color: "#4f7df9", icon: "→" },
};

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "#111318", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: 20, ...style }}>{children}</div>;
}

function ProgressRing({ value, size = 160, color }: { value: number; size?: number; color: string }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={12} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={12}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1s ease" }} />
    </svg>
  );
}

function ScoreBar({ label, score, icon }: { label: string; score: number; icon: string }) {
  const color = score >= 70 ? "#10b981" : score >= 40 ? "#eab308" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
      <span style={{ fontSize: 16, width: 24, textAlign: "center" }}>{icon}</span>
      <span style={{ fontSize: 13, color: "#d1d5db", width: 120 }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.8s ease" }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color, width: 40, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round(score)}</span>
    </div>
  );
}

export default function PNRMonitor() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/admin/pnr-monitor"],
    queryFn: () => (api as any).adminPNR.getSnapshot(),
    refetchInterval: 120000,
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#fff", marginBottom: 8 }}>Computing PNR Index...</div>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Analyzing ecosystem maturity signals</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#ef4444" }}>Failed to load PNR Monitor. Check admin authentication.</div>
      </div>
    );
  }

  const stageColor = data.stage?.color || "#6b7280";
  const trendInfo = TREND_LABELS[data.trend?.direction] || TREND_LABELS.stable;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }} data-testid="text-page-title">Point of No Return Monitor</h1>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>Measuring ecosystem self-sustainability</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: trendInfo.color, fontWeight: 600 }} data-testid="text-trend">{trendInfo.symbol} {data.trend?.direction}</span>
            {data.trend?.delta !== 0 && (
              <span style={{ fontSize: 11, color: "#6b7280" }}>({data.trend.delta > 0 ? "+" : ""}{data.trend.delta})</span>
            )}
          </div>
        </div>

        {/* PNR Index Hero */}
        <Card style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 32, padding: 28 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <ProgressRing value={data.pnrIndex} color={stageColor} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: stageColor, fontVariantNumeric: "tabular-nums" }} data-testid="text-pnr-index">{data.pnrIndex}</div>
              <div style={{ fontSize: 11, color: "#6b7280", letterSpacing: 1 }}>PNR INDEX</div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              display: "inline-block", padding: "4px 14px", borderRadius: 20,
              background: `${stageColor}15`, border: `1px solid ${stageColor}40`,
              fontSize: 13, fontWeight: 700, color: stageColor, marginBottom: 10,
            }} data-testid="text-stage-label">{data.stage?.label}</div>
            <p style={{ fontSize: 14, color: "#d1d5db", lineHeight: 1.6, margin: 0 }}>{data.stage?.description}</p>
            {data.distanceToSelfSustaining > 0 && (
              <p style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
                {data.distanceToSelfSustaining} points to Self-Sustaining Network
              </p>
            )}
            {data.selfSustaining && (
              <div style={{ marginTop: 10, padding: "8px 14px", borderRadius: 8, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", fontSize: 13, color: "#10b981", fontWeight: 600 }}>
                Point of No Return reached — platform is self-sustaining
              </div>
            )}
          </div>
        </Card>

        {/* Stage Progress Bar */}
        <Card style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14, fontWeight: 600 }}>Stage Progression</div>
          <div style={{ position: "relative", height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 4, marginBottom: 18 }}>
            <div style={{ position: "absolute", height: "100%", borderRadius: 4, background: `linear-gradient(90deg, #6b7280, ${stageColor})`, width: `${Math.min(100, data.pnrIndex)}%`, transition: "width 1s ease" }} />
            {data.stages?.map((s: any) => s.threshold > 0 && (
              <div key={s.id} style={{ position: "absolute", left: `${s.threshold}%`, top: -4, width: 2, height: 16, background: "rgba(255,255,255,0.15)" }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {data.stages?.map((s: any) => (
              <div key={s.id} style={{ textAlign: "center", flex: 1 }}>
                <div style={{
                  fontSize: 11, fontWeight: data.stage?.id === s.id ? 700 : 400,
                  color: data.stage?.id === s.id ? s.color : "#6b7280",
                }} data-testid={`stage-${s.tag}`}>{s.label}</div>
                <div style={{ fontSize: 10, color: "#4b5563", marginTop: 2 }}>{s.threshold}+</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Metric Scores */}
        <Card style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>Metric Scores</div>
          {data.scores && Object.entries(data.scores).map(([key, score]) => {
            const meta = METRIC_LABELS[key];
            return meta ? <ScoreBar key={key} label={meta.label} score={score as number} icon={meta.icon} /> : null;
          })}
        </Card>

        {/* Two-column: Raw Metrics + Insights */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          {/* Raw Metrics */}
          <Card>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>Key Numbers</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Total Users", value: data.metrics?.organicGrowth?.totalUsers ?? 0 },
                { label: "New This Week", value: data.metrics?.organicGrowth?.newUsersThisWeek ?? 0 },
                { label: "Organic Growth", value: `${data.metrics?.organicGrowth?.percentage ?? 0}%` },
                { label: "Posts Today", value: data.metrics?.dailyUGC?.postsToday ?? 0 },
                { label: "UGC Ratio", value: `${data.metrics?.dailyUGC?.ugcRatio ?? 0}%` },
                { label: "Content Growth", value: `${data.metrics?.dailyUGC?.contentGrowthPct ?? 0}%` },
                { label: "Active Creators", value: data.metrics?.creatorEarnings?.activeCreators ?? 0 },
                { label: "Creators Earning", value: data.metrics?.creatorEarnings?.creatorsEarning ?? 0 },
                { label: "Marketplace Listings", value: data.metrics?.creatorEarnings?.listings ?? 0 },
                { label: "Retention Rate", value: `${data.metrics?.userRetention?.retentionRate ?? 0}%` },
                { label: "AI Contribution", value: `${data.metrics?.aiOptimization?.aiContributionRate ?? 0}%` },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>{item.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb", fontVariantNumeric: "tabular-nums" }} data-testid={`metric-${item.label.toLowerCase().replace(/\s/g, "-")}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Insights */}
          <Card>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>Insights</div>
            {data.insights?.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.insights.map((insight: any, i: number) => {
                  const s = INSIGHT_STYLES[insight.type] || INSIGHT_STYLES.opportunity;
                  return (
                    <div key={i} style={{
                      padding: "10px 12px", borderRadius: 8, background: s.bg,
                      border: `1px solid ${s.border}`, display: "flex", gap: 8, alignItems: "flex-start",
                    }} data-testid={`insight-${i}`}>
                      <span style={{ color: s.color, fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{s.icon}</span>
                      <span style={{ fontSize: 12, color: "#d1d5db", lineHeight: 1.5 }}>{insight.message}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 20, color: "#4b5563", fontSize: 13 }}>No insights yet — more data needed</div>
            )}
          </Card>
        </div>

        {/* Quick Links */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {[
            { label: "Phase Transition", href: "/admin/phase-transition" },
            { label: "AI CFO", href: "/admin/ai-cfo" },
            { label: "Operations", href: "/admin/operations" },
            { label: "Workday", href: "/admin/workday" },
          ].map(link => (
            <a key={link.href} href={link.href} data-testid={`link-${link.label.toLowerCase().replace(/\s/g, "-")}`} style={{
              padding: "6px 14px", borderRadius: 6, background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)", color: "#9ca3af", fontSize: 12, textDecoration: "none",
            }}>{link.label}</a>
          ))}
        </div>
      </div>
    </div>
  );
}
