import { useState, useEffect } from "react";
import { useAdminAuth } from "@/hooks/use-admin-auth";

function adminFetch(url: string, opts?: RequestInit) {
  return fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    credentials: "include",
  }).then(r => r.json());
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "#111318", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: 20, ...style }}>{children}</div>;
}

function StatBox({ label, value, color, sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div style={{ textAlign: "center", flex: 1 }} data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || "#fff", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#4b5563", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const SYSTEM_ICONS: Record<string, string> = {
  "Content Engine": "SEO",
  "Social Distribution": "SDH",
  "Viral Engine": "VRL",
  "Email Automation": "EML",
  "AI Optimizer": "AI",
};

const SYSTEM_COLORS: Record<string, string> = {
  "Content Engine": "#4f7df9",
  "Social Distribution": "#1d9bf0",
  "Viral Engine": "#f97316",
  "Email Automation": "#10b981",
  "AI Optimizer": "#a855f7",
};

const SYSTEM_KEYS: Record<string, string> = {
  "Content Engine": "content",
  "Social Distribution": "social",
  "Viral Engine": "viral",
  "Email Automation": "email",
  "AI Optimizer": "optimizer",
};

const TRIGGER_TYPES = [
  { value: "welcome_series", label: "Welcome Series" },
  { value: "inactive_reengagement", label: "Inactive Re-engagement" },
  { value: "milestone_celebration", label: "Milestone Celebration" },
  { value: "weekly_digest", label: "Weekly Digest" },
  { value: "content_notification", label: "Content Notification" },
];

const IMPACT_COLORS: Record<string, { bg: string; color: string }> = {
  high: { bg: "rgba(239,68,68,0.12)", color: "#ef4444" },
  medium: { bg: "rgba(234,179,8,0.12)", color: "#eab308" },
  low: { bg: "rgba(107,114,128,0.12)", color: "#6b7280" },
};

export default function GrowthAutopilot() {
  const [tab, setTab] = useState<"overview" | "systems" | "email" | "insights" | "logs">("overview");
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [emailTriggers, setEmailTriggers] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [showNewTrigger, setShowNewTrigger] = useState(false);
  const [newTrigger, setNewTrigger] = useState({ triggerType: "welcome_series", name: "", subjectTemplate: "", bodyTemplate: "" });
  const { isLoading: authLoading, isAuthenticated } = useAdminAuth();

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const data = await adminFetch("/api/admin/growth-autopilot/dashboard");
      setDashboard(data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const loadEmailTriggers = async () => {
    try { setEmailTriggers(await adminFetch("/api/admin/growth-autopilot/email-triggers")); } catch (err) { console.error(err); }
  };

  const loadInsights = async () => {
    try { setInsights(await adminFetch("/api/admin/growth-autopilot/insights")); } catch (err) { console.error(err); }
  };

  const loadLogs = async () => {
    try { setLogs(await adminFetch("/api/admin/growth-autopilot/logs?limit=50")); } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    loadDashboard();
    loadEmailTriggers();
    loadInsights();
    loadLogs();
  }, [isAuthenticated]);

  if (authLoading) {
    return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center text-gray-400">Loading...</div>;
  }
  if (!isAuthenticated) return null;

  const toggleSystem = async (key: string, enabled: boolean) => {
    await adminFetch("/api/admin/growth-autopilot/config", { method: "PATCH", body: JSON.stringify({ [key]: enabled }) });
    loadDashboard();
  };

  const runSystem = async (system: string) => {
    setRunning(system);
    try {
      await adminFetch(`/api/admin/growth-autopilot/run/${system}`, { method: "POST" });
      loadDashboard();
      if (system === "optimizer") loadInsights();
      loadLogs();
    } catch (err) { console.error(err); }
    setRunning(null);
  };

  const runFullCycle = async () => {
    setRunning("all");
    try {
      await adminFetch("/api/admin/growth-autopilot/run-cycle", { method: "POST" });
      loadDashboard();
      loadInsights();
      loadLogs();
    } catch (err) { console.error(err); }
    setRunning(null);
  };

  const createTrigger = async () => {
    if (!newTrigger.name || !newTrigger.subjectTemplate || !newTrigger.bodyTemplate) return;
    await adminFetch("/api/admin/growth-autopilot/email-triggers", { method: "POST", body: JSON.stringify(newTrigger) });
    setNewTrigger({ triggerType: "welcome_series", name: "", subjectTemplate: "", bodyTemplate: "" });
    setShowNewTrigger(false);
    loadEmailTriggers();
  };

  const toggleTrigger = async (id: string, active: boolean) => {
    await adminFetch(`/api/admin/growth-autopilot/email-triggers/${id}/toggle`, { method: "PATCH", body: JSON.stringify({ active }) });
    loadEmailTriggers();
  };

  const updateInsight = async (id: string, status: string) => {
    await adminFetch(`/api/admin/growth-autopilot/insights/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    loadInsights();
  };

  if (loading) return <div style={{ padding: 40, color: "#fff", textAlign: "center" }}>Loading Growth Autopilot...</div>;

  const d = dashboard;
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "systems", label: "Systems" },
    { key: "email", label: "Email Triggers" },
    { key: "insights", label: "AI Insights" },
    { key: "logs", label: "Activity Log" },
  ] as const;

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto", color: "#e5e7eb" }} data-testid="growth-autopilot-page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: 0 }} data-testid="page-title">Growth Autopilot</h1>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>Automated organic growth across all channels</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={runFullCycle}
            disabled={running !== null}
            data-testid="button-run-full-cycle"
            style={{
              padding: "10px 20px", borderRadius: 8, border: "none", cursor: running ? "not-allowed" : "pointer",
              background: running === "all" ? "#374151" : "linear-gradient(135deg,#4f7df9,#8b5cf6)",
              color: "#fff", fontWeight: 600, fontSize: 13,
            }}
          >
            {running === "all" ? "Running..." : "Run Full Cycle"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            data-testid={`tab-${t.key}`}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              background: tab === t.key ? "rgba(79,125,249,0.15)" : "transparent",
              color: tab === t.key ? "#4f7df9" : "#6b7280", fontWeight: 600, fontSize: 13,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && d && d.overview && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <StatBox label="Total Users" value={d.overview?.totalUsers ?? 0} color="#4f7df9" sub={`+${d.overview?.weeklyNewUsers ?? 0} this week`} />
              <StatBox label="Total Content" value={d.overview?.totalContent ?? 0} color="#10b981" />
              <StatBox label="Social Posts" value={d.overview?.totalSocialPosts ?? 0} color="#1d9bf0" />
              <StatBox label="Viral Conv." value={`${d.overview?.viralConversionRate ?? 0}%`} color="#f97316" />
              <StatBox label="Systems Active" value={`${d.overview?.systemsActive ?? 0}/${d.overview?.systemsTotal ?? 5}`} color={(d.overview?.systemsActive ?? 0) === (d.overview?.systemsTotal ?? 5) ? "#10b981" : "#eab308"} />
            </div>
          </Card>

          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: "8px 0 0" }}>Traffic Sources</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {Object.values(d.trafficSources).map((src: any) => (
              <Card key={src.label}>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{src.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 4 }} data-testid={`traffic-${src.label.toLowerCase().replace(/[\s\/]/g, "-")}`}>{src.value}</div>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                  background: src.trend === "growing" || src.trend === "converting" || src.trend === "active" ? "rgba(16,185,129,0.12)" : "rgba(107,114,128,0.12)",
                  color: src.trend === "growing" || src.trend === "converting" || src.trend === "active" ? "#10b981" : "#6b7280",
                  textTransform: "uppercase",
                }}>{src.trend}</span>
              </Card>
            ))}
          </div>

          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: "8px 0 0" }}>Automation Systems</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {d.systems.map((sys: any) => (
              <Card key={sys.name}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: `${SYSTEM_COLORS[sys.name]}20`, color: SYSTEM_COLORS[sys.name], fontWeight: 700, fontSize: 11 }}>
                      {SYSTEM_ICONS[sys.name]}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{sys.name}</span>
                  </div>
                  <div
                    onClick={() => toggleSystem(sys.key, !sys.enabled)}
                    data-testid={`toggle-${sys.name.toLowerCase().replace(/\s/g, "-")}`}
                    style={{
                      width: 36, height: 20, borderRadius: 10, cursor: "pointer", position: "relative",
                      background: sys.enabled ? "#10b981" : "#374151", transition: "background 0.2s",
                    }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2,
                      left: sys.enabled ? 18 : 2, transition: "left 0.2s",
                    }} />
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {Object.entries(sys.stats).map(([k, v]) => (
                    <div key={k} style={{ fontSize: 11, color: "#9ca3af" }}>
                      <span style={{ color: "#6b7280" }}>{k.replace(/([A-Z])/g, " $1").trim()}: </span>
                      <span style={{ color: "#e5e7eb", fontWeight: 600 }}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          {d.recentInsights.length > 0 && (
            <>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: "8px 0 0" }}>Latest AI Insights</h3>
              {d.recentInsights.slice(0, 3).map((ins: any) => (
                <Card key={ins.id} style={{ borderLeft: `3px solid ${(IMPACT_COLORS[ins.impact] || IMPACT_COLORS.medium).color}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#fff", marginBottom: 4 }}>{ins.title}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>{ins.description}</div>
                      <div style={{ fontSize: 12, color: "#4f7df9" }}>{ins.recommendation}</div>
                    </div>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, fontWeight: 600, textTransform: "uppercase", ...(IMPACT_COLORS[ins.impact] || IMPACT_COLORS.medium) }}>{ins.impact}</span>
                  </div>
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {tab === "systems" && d && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {d.systems.map((sys: any) => (
            <Card key={sys.name}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: `${SYSTEM_COLORS[sys.name]}20`, color: SYSTEM_COLORS[sys.name], fontWeight: 700, fontSize: 14 }}>
                    {SYSTEM_ICONS[sys.name]}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16, color: "#fff" }}>{sys.name}</div>
                    <div style={{ fontSize: 11, color: sys.enabled ? "#10b981" : "#6b7280" }}>{sys.enabled ? "Enabled" : "Disabled"}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={() => runSystem(SYSTEM_KEYS[sys.name])}
                    disabled={running !== null || !sys.enabled}
                    data-testid={`button-run-${sys.name.toLowerCase().replace(/\s/g, "-")}`}
                    style={{
                      padding: "8px 16px", borderRadius: 8, border: "none", cursor: running || !sys.enabled ? "not-allowed" : "pointer",
                      background: running === SYSTEM_KEYS[sys.name] ? "#374151" : `${SYSTEM_COLORS[sys.name]}20`,
                      color: SYSTEM_COLORS[sys.name], fontWeight: 600, fontSize: 12, opacity: sys.enabled ? 1 : 0.4,
                    }}
                  >
                    {running === SYSTEM_KEYS[sys.name] ? "Running..." : "Run Now"}
                  </button>
                  <div
                    onClick={() => toggleSystem(sys.key, !sys.enabled)}
                    style={{
                      width: 42, height: 22, borderRadius: 11, cursor: "pointer", position: "relative",
                      background: sys.enabled ? "#10b981" : "#374151", transition: "background 0.2s",
                    }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 2, left: sys.enabled ? 22 : 2, transition: "left 0.2s" }} />
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 }}>
                {Object.entries(sys.stats).map(([k, v]) => (
                  <div key={k} style={{ background: "#0a0b10", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{k.replace(/([A-Z])/g, " $1").trim()}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{String(v)}</div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "email" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#fff", margin: 0 }}>Email Automation Triggers</h3>
            <button
              onClick={() => setShowNewTrigger(!showNewTrigger)}
              data-testid="button-add-trigger"
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(16,185,129,0.15)", color: "#10b981", fontWeight: 600, fontSize: 13 }}
            >
              + Add Trigger
            </button>
          </div>

          {showNewTrigger && (
            <Card>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 12 }}>
                  <select
                    value={newTrigger.triggerType}
                    onChange={e => setNewTrigger({ ...newTrigger, triggerType: e.target.value })}
                    data-testid="select-trigger-type"
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#0a0b10", color: "#e5e7eb", fontSize: 13 }}
                  >
                    {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input
                    value={newTrigger.name}
                    onChange={e => setNewTrigger({ ...newTrigger, name: e.target.value })}
                    placeholder="Trigger name"
                    data-testid="input-trigger-name"
                    style={{ flex: 2, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#0a0b10", color: "#e5e7eb", fontSize: 13 }}
                  />
                </div>
                <input
                  value={newTrigger.subjectTemplate}
                  onChange={e => setNewTrigger({ ...newTrigger, subjectTemplate: e.target.value })}
                  placeholder="Email subject template (e.g., Welcome to Mougle, {{name}}!)"
                  data-testid="input-trigger-subject"
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#0a0b10", color: "#e5e7eb", fontSize: 13 }}
                />
                <textarea
                  value={newTrigger.bodyTemplate}
                  onChange={e => setNewTrigger({ ...newTrigger, bodyTemplate: e.target.value })}
                  placeholder="Email body template (supports {{name}}, {{action}} placeholders)"
                  rows={4}
                  data-testid="input-trigger-body"
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "#0a0b10", color: "#e5e7eb", fontSize: 13, resize: "vertical" }}
                />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => setShowNewTrigger(false)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>Cancel</button>
                  <button onClick={createTrigger} data-testid="button-save-trigger" style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#10b981", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Save Trigger</button>
                </div>
              </div>
            </Card>
          )}

          {emailTriggers.length === 0 ? (
            <Card><p style={{ color: "#6b7280", textAlign: "center", margin: 0 }}>No email triggers configured. Add triggers to automate user engagement emails.</p></Card>
          ) : (
            emailTriggers.map((t: any) => (
              <Card key={t.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#fff", marginBottom: 4 }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 2 }}>
                      Type: <span style={{ color: "#9ca3af" }}>{TRIGGER_TYPES.find(tt => tt.value === t.triggerType)?.label || t.triggerType}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      Subject: <span style={{ color: "#9ca3af" }}>{t.subjectTemplate}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#4b5563", marginTop: 4 }}>
                      Fired: {t.triggerCount} times {t.lastTriggeredAt && `| Last: ${new Date(t.lastTriggeredAt).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div
                    onClick={() => toggleTrigger(t.id, !t.isActive)}
                    data-testid={`toggle-trigger-${t.id}`}
                    style={{
                      width: 42, height: 22, borderRadius: 11, cursor: "pointer", position: "relative",
                      background: t.isActive ? "#10b981" : "#374151", transition: "background 0.2s",
                    }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 2, left: t.isActive ? 22 : 2, transition: "left 0.2s" }} />
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "insights" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#fff", margin: 0 }}>AI Optimization Insights</h3>
            <button
              onClick={() => runSystem("optimizer")}
              disabled={running !== null}
              data-testid="button-generate-insights"
              style={{ padding: "8px 16px", borderRadius: 8, border: "none", cursor: running ? "not-allowed" : "pointer", background: "rgba(168,85,247,0.15)", color: "#a855f7", fontWeight: 600, fontSize: 13 }}
            >
              {running === "optimizer" ? "Analyzing..." : "Generate New Insights"}
            </button>
          </div>

          {insights.length === 0 ? (
            <Card><p style={{ color: "#6b7280", textAlign: "center", margin: 0 }}>No insights yet. Enable the AI Optimizer and run it to generate growth recommendations.</p></Card>
          ) : (
            insights.map((ins: any) => (
              <Card key={ins.id} style={{ borderLeft: `3px solid ${(IMPACT_COLORS[ins.impact] || IMPACT_COLORS.medium).color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, fontWeight: 600, textTransform: "uppercase", ...(IMPACT_COLORS[ins.impact] || IMPACT_COLORS.medium) }}>{ins.impact}</span>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, fontWeight: 600, textTransform: "uppercase", background: "rgba(79,125,249,0.12)", color: "#4f7df9" }}>{ins.insightType}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {ins.status === "pending" && (
                      <>
                        <button onClick={() => updateInsight(ins.id, "applied")} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "rgba(16,185,129,0.12)", color: "#10b981", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Apply</button>
                        <button onClick={() => updateInsight(ins.id, "dismissed")} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "rgba(107,114,128,0.12)", color: "#6b7280", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Dismiss</button>
                      </>
                    )}
                    {ins.status !== "pending" && (
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, fontWeight: 600, textTransform: "uppercase", background: ins.status === "applied" ? "rgba(16,185,129,0.12)" : "rgba(107,114,128,0.12)", color: ins.status === "applied" ? "#10b981" : "#6b7280" }}>{ins.status}</span>
                    )}
                  </div>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#fff", marginBottom: 4 }}>{ins.title}</div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>{ins.description}</div>
                <div style={{ fontSize: 12, color: "#4f7df9", background: "rgba(79,125,249,0.06)", padding: "8px 12px", borderRadius: 8 }}>{ins.recommendation}</div>
                <div style={{ fontSize: 10, color: "#4b5563", marginTop: 8 }}>{new Date(ins.createdAt).toLocaleString()}</div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "logs" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#fff", margin: 0 }}>Activity Log</h3>
            <button onClick={loadLogs} data-testid="button-refresh-logs" style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "rgba(79,125,249,0.1)", color: "#4f7df9", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Refresh</button>
          </div>
          {logs.length === 0 ? (
            <Card><p style={{ color: "#6b7280", textAlign: "center", margin: 0 }}>No activity yet. Run a cycle to generate logs.</p></Card>
          ) : (
            <div style={{ background: "#111318", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
              {logs.map((log: any, i: number) => (
                <div key={log.id} style={{ display: "flex", gap: 12, padding: "10px 16px", borderBottom: i < logs.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", alignItems: "center" }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase",
                    background: log.result === "success" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                    color: log.result === "success" ? "#10b981" : "#ef4444",
                    minWidth: 52, textAlign: "center",
                  }}>{log.result}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "rgba(79,125,249,0.1)", color: "#4f7df9", minWidth: 70, textAlign: "center" }}>{log.system}</span>
                  <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 500 }}>{log.action}</span>
                  <span style={{ fontSize: 11, color: "#6b7280", flex: 1 }}>{log.details}</span>
                  <span style={{ fontSize: 10, color: "#4b5563", whiteSpace: "nowrap" }}>{new Date(log.createdAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
