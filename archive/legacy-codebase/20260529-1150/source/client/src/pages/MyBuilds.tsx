import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

const STAGES = ["QUEUED", "DEVELOPING", "TESTING", "DELIVERED"] as const;
const STAGE_META: Record<string, { color: string; icon: string; label: string }> = {
  QUEUED: { color: "#6b7280", icon: "⏳", label: "Queued" },
  DEVELOPING: { color: "#4f7df9", icon: "🔧", label: "In Development" },
  TESTING: { color: "#eab308", icon: "🧪", label: "Testing" },
  DELIVERED: { color: "#10b981", icon: "✅", label: "Delivered" },
};

function fetchJSON<T>(url: string, opts?: RequestInit): Promise<T> {
  return fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...opts?.headers } }).then(r => {
    if (!r.ok) return r.json().then(e => { throw new Error(e.message); });
    return r.json();
  });
}

function StageTimeline({ current }: { current: string }) {
  const idx = STAGES.indexOf(current as any);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, margin: "12px 0" }}>
      {STAGES.map((s, i) => {
        const meta = STAGE_META[s];
        const done = i <= idx;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: done ? `${meta.color}20` : "rgba(255,255,255,0.04)", border: `2px solid ${done ? meta.color : "rgba(255,255,255,0.1)"}`,
              fontSize: 12, color: done ? meta.color : "#4b5563",
            }}>{done ? meta.icon : i + 1}</div>
            {i < STAGES.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done && i < idx ? meta.color : "rgba(255,255,255,0.06)", borderRadius: 1 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function MyBuilds() {
  const [showForm, setShowForm] = useState(false);
  const [appName, setAppName] = useState("");
  const [appDesc, setAppDesc] = useState("");
  const [requirements, setRequirements] = useState("");
  const [pricing, setPricing] = useState<any>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["/dev-orders"],
    queryFn: () => fetchJSON<any[]>("/api/dev-orders"),
  });

  const calcMutation = useMutation({
    mutationFn: () => fetchJSON<any>("/api/dev-orders/calculate", { method: "POST", body: JSON.stringify({ appDescription: appDesc, requirements }) }),
    onSuccess: (data) => setPricing(data),
  });

  const createMutation = useMutation({
    mutationFn: () => fetchJSON<any>("/api/dev-orders", { method: "POST", body: JSON.stringify({ appName, appDescription: appDesc, requirements, paymentReference: "prepaid" }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/dev-orders"] });
      setShowForm(false); setAppName(""); setAppDesc(""); setRequirements(""); setPricing(null);
    },
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }} data-testid="text-page-title">My Builds</h1>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>Track your on-demand app development orders</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} data-testid="button-new-order" style={{
            background: "linear-gradient(135deg,#4f7df9,#3b82f6)", color: "#fff", border: "none",
            borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>{showForm ? "Cancel" : "New Build Request"}</button>
        </div>

        {/* Order Form */}
        {showForm && (
          <div style={{ background: "#111318", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: 24, marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#fff", margin: "0 0 16px" }}>Request a Custom App</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 4 }}>App Name</label>
                <input value={appName} onChange={e => setAppName(e.target.value)} placeholder="My Custom App" data-testid="input-app-name"
                  style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 4 }}>Description</label>
                <textarea value={appDesc} onChange={e => setAppDesc(e.target.value)} placeholder="Describe what the app should do..." rows={4} data-testid="input-app-desc"
                  style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 4 }}>Requirements (optional)</label>
                <textarea value={requirements} onChange={e => setRequirements(e.target.value)} placeholder="Specific features, integrations..." rows={3} data-testid="input-requirements"
                  style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </div>

              {!pricing ? (
                <button onClick={() => calcMutation.mutate()} disabled={!appDesc || calcMutation.isPending} data-testid="button-calculate"
                  style={{ background: "rgba(79,125,249,0.15)", color: "#4f7df9", border: "1px solid rgba(79,125,249,0.3)", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  {calcMutation.isPending ? "Calculating..." : "Calculate Price"}
                </button>
              ) : (
                <div style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.15)", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: "#10b981", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Pricing Breakdown</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {[
                      { l: "Base Price", v: `$${pricing.basePrice}` },
                      { l: "AI Compute", v: `$${pricing.aiComputeEstimate}` },
                      { l: "Hosting", v: `$${pricing.hostingEstimate}` },
                      { l: "Support", v: `$${pricing.supportEstimate}` },
                      { l: "Margin (50%)", v: `$${pricing.marginAmount}` },
                    ].map(i => (
                      <div key={i.l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9ca3af", padding: "2px 0" }}>
                        <span>{i.l}</span><span style={{ color: "#d1d5db" }}>{i.v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Total</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: "#10b981" }} data-testid="text-total-price">${pricing.finalPrice}</span>
                  </div>
                  <button onClick={() => createMutation.mutate()} disabled={!appName || createMutation.isPending} data-testid="button-submit-order"
                    style={{ width: "100%", marginTop: 14, background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    {createMutation.isPending ? "Submitting..." : `Pay $${pricing.finalPrice} & Start Build`}
                  </button>
                </div>
              )}
              {createMutation.error && <div style={{ color: "#ef4444", fontSize: 13 }}>{(createMutation.error as Error).message}</div>}
            </div>
          </div>
        )}

        {/* Orders List */}
        {isLoading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>Loading orders...</div>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#4b5563" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔨</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#6b7280" }}>No build orders yet</div>
            <p style={{ fontSize: 13, color: "#4b5563", marginTop: 6 }}>Request a custom app and we'll build it for you</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {orders.map((order: any) => {
              const stage = STAGE_META[order.stage] || STAGE_META.QUEUED;
              const deadline = order.deliveryDeadline ? new Date(order.deliveryDeadline).toLocaleDateString() : "TBD";
              return (
                <div key={order.id} data-testid={`order-${order.id}`} style={{
                  background: "#111318", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: 20,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>{order.appName}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Order {order.id.slice(0, 8)} &middot; Created {new Date(order.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div style={{
                      padding: "4px 12px", borderRadius: 16, background: `${stage.color}15`,
                      border: `1px solid ${stage.color}40`, fontSize: 12, fontWeight: 600, color: stage.color,
                    }}>{stage.icon} {stage.label}</div>
                  </div>
                  <StageTimeline current={order.stage} />
                  <div style={{ display: "flex", gap: 24, fontSize: 12, color: "#9ca3af" }}>
                    <span>Price: <strong style={{ color: "#10b981" }}>${order.finalPrice}</strong></span>
                    <span>Payment: <strong style={{ color: order.paymentStatus === "paid" ? "#10b981" : "#eab308" }}>{order.paymentStatus}</strong></span>
                    <span>Delivery: <strong style={{ color: "#d1d5db" }}>{deadline}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
