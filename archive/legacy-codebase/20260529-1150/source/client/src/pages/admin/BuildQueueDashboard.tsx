import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

const STAGE_META: Record<string, { color: string; icon: string; label: string }> = {
  QUEUED: { color: "#6b7280", icon: "⏳", label: "Queued" },
  DEVELOPING: { color: "#4f7df9", icon: "🔧", label: "Developing" },
  TESTING: { color: "#eab308", icon: "🧪", label: "Testing" },
  DELIVERED: { color: "#10b981", icon: "✅", label: "Delivered" },
};

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "#111318", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: 20, ...style }}>{children}</div>;
}

function StatBox({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || "#fff", fontVariantNumeric: "tabular-nums" }} data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function BuildQueueDashboard() {
  const [tab, setTab] = useState<"queue" | "health" | "all">("queue");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [editLimit, setEditLimit] = useState<number | null>(null);

  const { data: queue = [] } = useQuery({
    queryKey: ["/admin/dev-orders/queue"],
    queryFn: () => (api as any).adminBuilds.getQueue(),
    refetchInterval: 30000,
  });

  const { data: allOrders = [] } = useQuery({
    queryKey: ["/admin/dev-orders", stageFilter],
    queryFn: () => (api as any).adminBuilds.getAll(stageFilter),
    enabled: tab === "all",
  });

  const { data: health } = useQuery({
    queryKey: ["/admin/bootstrap-health"],
    queryFn: () => (api as any).adminBuilds.getHealth(),
    refetchInterval: 60000,
  });

  const { data: config } = useQuery({
    queryKey: ["/admin/bootstrap-config"],
    queryFn: () => (api as any).adminBuilds.getConfig(),
  });

  const stageMutation = useMutation({
    mutationFn: ({ id, stage, note }: { id: string; stage: string; note?: string }) =>
      (api as any).adminBuilds.updateStage(id, stage, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/admin/dev-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/admin/bootstrap-health"] });
    },
  });

  const configMutation = useMutation({
    mutationFn: (limit: number) => (api as any).adminBuilds.updateConfig(limit),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/admin/bootstrap-config"] });
      setEditLimit(null);
    },
  });

  const cashColor = (health?.cashBuffer || 0) >= 500 ? "#10b981" : (health?.cashBuffer || 0) >= 0 ? "#eab308" : "#ef4444";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }} data-testid="text-page-title">Build Queue & Bootstrap Health</h1>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>On-demand development management & cash flow monitoring</p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {[
            { key: "queue", label: `Build Queue (${queue.length})` },
            { key: "health", label: "Bootstrap Health" },
            { key: "all", label: "All Orders" },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)} data-testid={`tab-${t.key}`} style={{
              padding: "8px 18px", borderRadius: 8, border: "1px solid",
              borderColor: tab === t.key ? "rgba(79,125,249,0.4)" : "rgba(255,255,255,0.06)",
              background: tab === t.key ? "rgba(79,125,249,0.1)" : "transparent",
              color: tab === t.key ? "#4f7df9" : "#6b7280", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>{t.label}</button>
          ))}
        </div>

        {/* BUILD QUEUE TAB */}
        {tab === "queue" && (
          <>
            {queue.length === 0 ? (
              <Card><div style={{ textAlign: "center", padding: 40, color: "#4b5563", fontSize: 14 }}>No active builds in queue</div></Card>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {queue.map((order: any) => {
                  const meta = STAGE_META[order.stage] || STAGE_META.QUEUED;
                  const nextStages = ["QUEUED", "DEVELOPING", "TESTING", "DELIVERED"];
                  const nextIdx = nextStages.indexOf(order.stage) + 1;
                  const nextStage = nextIdx < nextStages.length ? nextStages[nextIdx] : null;
                  const deadline = order.deliveryDeadline ? new Date(order.deliveryDeadline).toLocaleDateString() : "TBD";

                  return (
                    <Card key={order.id} style={{ borderLeft: `3px solid ${meta.color}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{order.appName}</div>
                          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                            {order.id.slice(0, 8)} &middot; User: {order.userId.slice(0, 8)} &middot; ${order.finalPrice} &middot; Due: {deadline}
                          </div>
                          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 6, maxWidth: 500, lineHeight: 1.5 }}>{order.appDescription?.slice(0, 150)}{order.appDescription?.length > 150 ? "..." : ""}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{
                            padding: "4px 12px", borderRadius: 16, background: `${meta.color}15`,
                            border: `1px solid ${meta.color}40`, fontSize: 11, fontWeight: 700, color: meta.color,
                          }} data-testid={`stage-badge-${order.id}`}>{meta.icon} {meta.label}</span>
                          {nextStage && (
                            <button onClick={() => stageMutation.mutate({ id: order.id, stage: nextStage })}
                              data-testid={`button-advance-${order.id}`} style={{
                                background: (STAGE_META[nextStage]?.color || "#4f7df9") + "20",
                                color: STAGE_META[nextStage]?.color || "#4f7df9",
                                border: `1px solid ${(STAGE_META[nextStage]?.color || "#4f7df9")}40`,
                                borderRadius: 6, padding: "6px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                              }}>Move to {STAGE_META[nextStage]?.label}</button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* BOOTSTRAP HEALTH TAB */}
        {tab === "health" && health && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
              <Card><StatBox label="Cash Buffer" value={`$${health.cashBuffer}`} color={cashColor} /></Card>
              <Card><StatBox label="Weekly Revenue" value={`$${health.weeklyRevenue}`} color="#10b981" /></Card>
              <Card><StatBox label="AI Cost Ratio" value={`${health.aiCostRatio}%`} color={health.aiCostRatio <= 30 ? "#10b981" : "#eab308"} /></Card>
              <Card><StatBox label="Active Queue" value={health.activeBuildQueue} color="#4f7df9" /></Card>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              <Card>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>Financial Overview</div>
                {[
                  { l: "Reserved Funds", v: `$${health.reservedFunds}`, c: "#eab308" },
                  { l: "Total Delivered", v: health.totalDelivered, c: "#10b981" },
                  { l: "Avg Delivery Days", v: health.avgDeliveryDays || "—", c: "#d1d5db" },
                  { l: "Builds Today", v: `${health.dailyBuildsToday} / ${health.dailyBuildLimit}`, c: health.dailyBuildsToday >= health.dailyBuildLimit ? "#ef4444" : "#d1d5db" },
                ].map(item => (
                  <div key={item.l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <span style={{ fontSize: 13, color: "#9ca3af" }}>{item.l}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: item.c }} data-testid={`health-${item.l.toLowerCase().replace(/\s/g, "-")}`}>{item.v}</span>
                  </div>
                ))}
              </Card>

              <Card>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>Build Limit Configuration</div>
                <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 14, lineHeight: 1.5 }}>
                  Control how many builds can be accepted per day. Current limit: <strong style={{ color: "#fff" }}>{config?.dailyBuildLimit || 5}</strong>
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="number" min={1} max={50} value={editLimit ?? config?.dailyBuildLimit ?? 5}
                    onChange={e => setEditLimit(parseInt(e.target.value) || 1)} data-testid="input-daily-limit"
                    style={{ flex: 1, background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, outline: "none" }} />
                  <button onClick={() => editLimit !== null && configMutation.mutate(editLimit)} data-testid="button-save-limit"
                    style={{ background: "#4f7df9", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    Save
                  </button>
                </div>
                <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.15)" }}>
                  <div style={{ fontSize: 11, color: "#eab308", fontWeight: 600, marginBottom: 4 }}>Bootstrap Survival Mode</div>
                  <p style={{ fontSize: 12, color: "#9ca3af", margin: 0, lineHeight: 1.5 }}>
                    Limits protect cash flow by controlling build volume. Increase only when revenue covers expenses.
                  </p>
                </div>
              </Card>
            </div>
          </>
        )}

        {/* ALL ORDERS TAB */}
        {tab === "all" && (
          <>
            <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
              {["", "QUEUED", "DEVELOPING", "TESTING", "DELIVERED"].map(s => (
                <button key={s} onClick={() => setStageFilter(s)} data-testid={`filter-${s || "all"}`} style={{
                  padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  background: stageFilter === s ? "rgba(79,125,249,0.1)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${stageFilter === s ? "rgba(79,125,249,0.3)" : "rgba(255,255,255,0.06)"}`,
                  color: stageFilter === s ? "#4f7df9" : "#6b7280",
                }}>{s || "All"}</button>
              ))}
            </div>
            {allOrders.length === 0 ? (
              <Card><div style={{ textAlign: "center", padding: 40, color: "#4b5563", fontSize: 14 }}>No orders found</div></Card>
            ) : (
              <div style={{ background: "#111318", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {["App", "User", "Price", "Payment", "Stage", "Created"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#6b7280", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allOrders.map((o: any) => {
                      const meta = STAGE_META[o.stage] || STAGE_META.QUEUED;
                      return (
                        <tr key={o.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }} data-testid={`row-order-${o.id}`}>
                          <td style={{ padding: "10px 14px", color: "#d1d5db" }}>{o.appName}</td>
                          <td style={{ padding: "10px 14px", color: "#9ca3af" }}>{o.userId.slice(0, 8)}</td>
                          <td style={{ padding: "10px 14px", color: "#10b981", fontWeight: 600 }}>${o.finalPrice}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ color: o.paymentStatus === "paid" ? "#10b981" : "#eab308", fontSize: 12 }}>{o.paymentStatus}</span>
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ background: `${meta.color}15`, color: meta.color, padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{meta.label}</span>
                          </td>
                          <td style={{ padding: "10px 14px", color: "#6b7280" }}>{new Date(o.createdAt).toLocaleDateString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Quick Links */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 24 }}>
          {[
            { label: "Workday", href: "/admin/workday" },
            { label: "AI CFO", href: "/admin/ai-cfo" },
            { label: "Operations", href: "/admin/operations" },
            { label: "PNR Monitor", href: "/admin/pnr-monitor" },
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
