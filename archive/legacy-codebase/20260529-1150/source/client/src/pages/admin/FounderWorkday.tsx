import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

const PRIORITY_STYLES: Record<string, { bg: string; border: string; color: string; icon: string }> = {
  critical: { bg: "rgba(239,68,68,0.08)", border: "#ef4444", color: "#ef4444", icon: "!!" },
  warning: { bg: "rgba(234,179,8,0.08)", border: "#eab308", color: "#eab308", icon: "!" },
  info: { bg: "rgba(79,125,249,0.08)", border: "#4f7df9", color: "#4f7df9", icon: "i" },
};

const ENGINE_STATUS: Record<string, { color: string; label: string }> = {
  healthy: { color: "#10b981", label: "OK" },
  warning: { color: "#eab308", label: "WARN" },
  critical: { color: "#ef4444", label: "CRIT" },
  offline: { color: "#6b7280", label: "OFF" },
};

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "#111318", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: 20, ...style }}>
      {children}
    </div>
  );
}

function StatBox({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || "#fff", fontVariantNumeric: "tabular-nums" }} data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function FounderWorkday() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/admin/workday"],
    queryFn: () => (api as any).adminWorkday.get(),
    refetchInterval: 120000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.adminOps.approveAction(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/admin/workday"] }),
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#fff", marginBottom: 8 }}>Preparing your daily briefing...</div>
          <p style={{ color: "#6b7280", fontSize: 13 }}>Aggregating platform intelligence</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#ef4444" }}>Failed to load workday dashboard. Check admin authentication.</div>
      </div>
    );
  }

  const healthColor = data.systemHealth.overall >= 80 ? "#10b981" : data.systemHealth.overall >= 50 ? "#eab308" : "#ef4444";
  const modeColor = data.systemHealth.platformMode === "NORMAL" ? "#10b981" : data.systemHealth.platformMode === "SAFE_MODE" ? "#eab308" : "#ef4444";
  const now = new Date(data.generatedAt);
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }} data-testid="text-page-title">Daily Briefing</h1>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{dateStr} &middot; {timeStr}</div>
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px",
            borderRadius: 20, background: `${modeColor}15`, border: `1px solid ${modeColor}40`, fontSize: 12, fontWeight: 600, color: modeColor
          }} data-testid="status-platform-mode">
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: modeColor, display: "inline-block" }} />
            {data.systemHealth.platformMode}
          </div>
        </div>

        {/* AI Summary */}
        {data.dailySummary && (
          <Card style={{ marginBottom: 20, borderLeft: `3px solid #4f7df9` }}>
            <div style={{ fontSize: 11, color: "#4f7df9", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>AI Daily Summary</div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: "#d1d5db" }} data-testid="text-daily-summary">{data.dailySummary}</div>
          </Card>
        )}

        {/* Actionable Items */}
        {data.actionableItems?.length > 0 && (
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "#ef4444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>Needs Your Attention</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.actionableItems.map((item: any, i: number) => {
                const s = PRIORITY_STYLES[item.priority] || PRIORITY_STYLES.info;
                return (
                  <a key={i} href={item.link} data-testid={`action-item-${i}`} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                    borderRadius: 8, background: s.bg, border: `1px solid ${s.border}30`,
                    textDecoration: "none", color: "#e5e7eb", transition: "background 0.15s",
                  }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      background: `${s.border}20`, color: s.color, fontSize: 11, fontWeight: 700, flexShrink: 0,
                    }}>{s.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 16, color: "#6b7280" }}>&rsaquo;</span>
                  </a>
                );
              })}
            </div>
          </Card>
        )}

        {/* Key Metrics Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          <Card>
            <StatBox label="System Health" value={`${data.systemHealth.overall}%`} color={healthColor} />
          </Card>
          <Card>
            <StatBox label="Stability" value={`${data.stabilityIndex.score}%`} color={data.stabilityIndex.score >= 70 ? "#10b981" : "#eab308"} />
          </Card>
          <Card>
            <StatBox label="Support Auto" value={`${data.supportAutomation.automationRate}%`} sub={`${data.supportAutomation.openTickets} open`} color={data.supportAutomation.automationRate >= 70 ? "#10b981" : "#eab308"} />
          </Card>
          <Card>
            <StatBox label="Margin" value={data.financials.margin ? `${data.financials.margin}%` : "--"} color={data.financials.margin >= 50 ? "#10b981" : data.financials.margin >= 20 ? "#eab308" : "#ef4444"} />
          </Card>
        </div>

        {/* Two-column: Engine Status + Financials */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          {/* Engine Status */}
          <Card>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>Engine Status</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.systemHealth.engines?.map((eng: any) => {
                const s = ENGINE_STATUS[eng.status] || ENGINE_STATUS.offline;
                return (
                  <div key={eng.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }} data-testid={`engine-${eng.name}`}>
                    <span style={{ fontSize: 13, color: "#d1d5db", textTransform: "capitalize" }}>{eng.name}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "#9ca3af", fontVariantNumeric: "tabular-nums" }}>{eng.score}%</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                        background: `${s.color}18`, color: s.color, letterSpacing: 0.5,
                      }}>{s.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* AI Cost vs Revenue */}
          <Card>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>AI Cost vs Revenue</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#9ca3af" }}>Revenue</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#10b981" }} data-testid="stat-revenue">{data.financials.estimatedRevenue || 0}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#9ca3af" }}>AI Compute Cost</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#ef4444" }} data-testid="stat-ai-cost">{data.financials.aiComputeCost || 0}</span>
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#9ca3af" }}>Net Margin</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: data.financials.margin >= 50 ? "#10b981" : data.financials.margin >= 0 ? "#eab308" : "#ef4444" }} data-testid="stat-margin">{data.financials.margin || 0}%</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Two-column: Pending Approvals + Policy & Support */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          {/* Pending Approvals */}
          <Card>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>
              Pending Approvals ({data.pendingApprovals?.length || 0})
            </div>
            {data.pendingApprovals?.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                {data.pendingApprovals.map((a: any, i: number) => (
                  <div key={a.id || i} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                    borderRadius: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
                  }} data-testid={`approval-${i}`}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3,
                      background: a.severity === "critical" ? "rgba(239,68,68,0.15)" : a.severity === "warning" ? "rgba(234,179,8,0.15)" : "rgba(79,125,249,0.15)",
                      color: a.severity === "critical" ? "#ef4444" : a.severity === "warning" ? "#eab308" : "#4f7df9",
                      textTransform: "uppercase",
                    }}>{a.engine}</span>
                    <span style={{ fontSize: 12, color: "#d1d5db", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.action}</span>
                    {a.type === "operations" && (
                      <button onClick={() => approveMutation.mutate(a.id)} data-testid={`button-approve-${i}`} style={{
                        background: "#10b981", color: "#fff", border: "none", borderRadius: 4,
                        padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                      }}>Approve</button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 20, color: "#4b5563", fontSize: 13 }}>No pending approvals</div>
            )}
          </Card>

          {/* Policy & Support */}
          <Card>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>Policy & Support</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "#9ca3af" }}>Policy Drafts Pending</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: data.policyUpdates.pendingDrafts > 0 ? "#eab308" : "#6b7280" }} data-testid="stat-policy-drafts">{data.policyUpdates.pendingDrafts}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "#9ca3af" }}>Compliance Rules Pending</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: data.policyUpdates.complianceRulesPending > 0 ? "#eab308" : "#6b7280" }} data-testid="stat-compliance-pending">{data.policyUpdates.complianceRulesPending}</span>
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "#9ca3af" }}>Open Tickets</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#e5e7eb" }} data-testid="stat-open-tickets">{data.supportAutomation.openTickets}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "#9ca3af" }}>KB Articles Live</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#e5e7eb" }} data-testid="stat-kb-articles">{data.supportAutomation.kbArticlesPublished}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "#9ca3af" }}>Automation Rate</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: data.supportAutomation.automationRate >= 70 ? "#10b981" : "#eab308" }} data-testid="stat-auto-rate">{data.supportAutomation.automationRate}%</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Task #486 — Audience Retention Backlog Trend */}
        {data.audienceRetention && (
          <Card style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>
                Audience Retention Backlog
              </div>
              <a
                href="/admin/omni-channel-audience#retention"
                data-testid="link-audience-retention"
                style={{ fontSize: 11, color: "#6b7280", textDecoration: "none" }}
                title="Open the Audience admin Retention card"
              >
                Open admin &rsaquo;
              </a>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {(["messages", "decisions", "commands"] as const).map((field) => {
                const t = data.audienceRetention.trend?.tables?.[field];
                const current: number = t?.current ?? data.audienceRetention.stalePendingArchive?.[field] ?? 0;
                const direction: string = t?.direction ?? "unknown";
                const streak: number = t?.consecutiveGrowthStreak ?? 0;
                const streakThreshold: number = data.audienceRetention.growthStreakThreshold ?? 3;
                const streakPersistent = streak >= streakThreshold;
                const arrow =
                  direction === "growing"
                    ? "▲"
                    : direction === "shrinking"
                      ? "▼"
                      : direction === "flat"
                        ? "▬"
                        : "·";
                const color =
                  direction === "growing"
                    ? "#ef4444"
                    : direction === "shrinking"
                      ? "#10b981"
                      : direction === "flat"
                        ? "#9ca3af"
                        : "#6b7280";
                const delta: number | null = t?.delta ?? null;
                const sub = streakPersistent
                  ? `growing ${streak} sweeps in a row`
                  : direction === "unknown"
                    ? "no trend yet"
                    : delta == null
                      ? "first sample"
                      : delta > 0
                        ? `+${delta.toLocaleString()} since last sweep`
                        : delta < 0
                          ? `${delta.toLocaleString()} since last sweep`
                          : "unchanged";
                return (
                  <div
                    key={field}
                    data-testid={`retention-trend-${field}`}
                    title={`Stale-pending ${field}: ${direction} — ${sub}`}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                      {field}
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: "#e5e7eb", fontVariantNumeric: "tabular-nums" }}>
                        {current.toLocaleString()}
                      </span>
                      <span
                        style={{ fontSize: 14, color, fontWeight: 700 }}
                        data-testid={`retention-trend-arrow-${field}`}
                      >
                        {arrow}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>{sub}</div>
                  </div>
                );
              })}
            </div>
            {data.audienceRetention.lastSweepError && (
              <div style={{ marginTop: 10, fontSize: 11, color: "#ef4444" }} data-testid="text-retention-sweep-error">
                Last sweep failed: {data.audienceRetention.lastSweepError}
              </div>
            )}
          </Card>
        )}

        {/* Stability Triangle */}
        {data.stabilityIndex.dimensions && (
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>Platform Stability Triangle</div>
            <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", padding: "8px 0" }}>
              {Object.entries(data.stabilityIndex.dimensions).map(([key, val]: [string, any]) => {
                const score = typeof val === "object" ? val.score : val;
                const c = score >= 70 ? "#10b981" : score >= 40 ? "#eab308" : "#ef4444";
                return (
                  <div key={key} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: c }} data-testid={`stability-${key}`}>{Math.round(score)}</div>
                    <div style={{ fontSize: 11, color: "#6b7280", textTransform: "capitalize", marginTop: 4 }}>{key.replace(/([A-Z])/g, " $1").trim()}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Quick Links */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {[
            { label: "Operations", href: "/admin/operations" },
            { label: "Debug Console", href: "/admin/debug" },
            { label: "AI CFO", href: "/admin/ai-cfo" },
            { label: "Compliance", href: "/admin/compliance" },
            { label: "Policy", href: "/admin/policy-governance" },
            { label: "Support", href: "/admin/support" },
            { label: "Knowledge Base", href: "/admin/knowledge-base" },
          ].map(link => (
            <a key={link.href} href={link.href} data-testid={`link-${link.label.toLowerCase().replace(/\s/g, "-")}`} style={{
              padding: "6px 14px", borderRadius: 6, background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)", color: "#9ca3af", fontSize: 12,
              textDecoration: "none", transition: "all 0.15s",
            }}>{link.label}</a>
          ))}
        </div>
      </div>
    </div>
  );
}
