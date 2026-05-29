import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "#111318", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: 20, ...style }}>{children}</div>;
}

function StatBox({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || "#fff", fontVariantNumeric: "tabular-nums" }} data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function MarketingEngine() {
  const [tab, setTab] = useState<"overview" | "articles" | "seo" | "referrals" | "actions">("overview");
  const [genType, setGenType] = useState("tool");
  const [genName, setGenName] = useState("");
  const [genDesc, setGenDesc] = useState("");

  const { data: dashboard } = useQuery({
    queryKey: ["/admin/marketing/dashboard"],
    queryFn: () => (api as any).adminMarketing.getDashboard(),
    refetchInterval: 60000,
  });

  const { data: articles = [] } = useQuery({
    queryKey: ["/admin/marketing/articles"],
    queryFn: () => (api as any).adminMarketing.getArticles(),
    enabled: tab === "articles",
  });

  const { data: seoPagesList = [] } = useQuery({
    queryKey: ["/admin/marketing/seo-pages"],
    queryFn: () => (api as any).adminMarketing.getSeoPages(),
    enabled: tab === "seo",
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ["/admin/marketing/referrals"],
    queryFn: () => (api as any).adminMarketing.getReferrals(),
    enabled: tab === "referrals",
  });

  const publishMut = useMutation({
    mutationFn: (id: string) => (api as any).adminMarketing.publishArticle(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/admin/marketing/articles"] }),
  });

  const indexMut = useMutation({
    mutationFn: (id: string) => (api as any).adminMarketing.indexSeoPage(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/admin/marketing/seo-pages"] }),
  });

  const dailySummaryMut = useMutation({
    mutationFn: () => (api as any).adminMarketing.generateDailySummary(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/admin/marketing/articles"] }),
  });

  const selectSocialMut = useMutation({
    mutationFn: () => (api as any).adminMarketing.selectSocial(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/admin/marketing/dashboard"] }),
  });

  const autoSeoMut = useMutation({
    mutationFn: () => (api as any).adminMarketing.autoSeoPages(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/admin/marketing/seo-pages"] }),
  });

  const genSeoMut = useMutation({
    mutationFn: () => (api as any).adminMarketing.generateSeoPage(genType, "", genName, genDesc),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/admin/marketing/seo-pages"] }); setGenName(""); setGenDesc(""); },
  });

  const d = dashboard || { articles: {}, seoPages: {}, referrals: {}, social: {}, trafficSources: {} };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }} data-testid="text-page-title">$0 Marketing Engine</h1>
            <span style={{ background: "rgba(16,185,129,0.15)", color: "#10b981", padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>Text-First</span>
          </div>
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>Organic growth through platform intelligence — no paid ads</p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { key: "overview", label: "Growth Overview" },
            { key: "articles", label: "Articles" },
            { key: "seo", label: "SEO Pages" },
            { key: "referrals", label: "Referrals" },
            { key: "actions", label: "Quick Actions" },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)} data-testid={`tab-${t.key}`} style={{
              padding: "8px 18px", borderRadius: 8, border: "1px solid",
              borderColor: tab === t.key ? "rgba(79,125,249,0.4)" : "rgba(255,255,255,0.06)",
              background: tab === t.key ? "rgba(79,125,249,0.1)" : "transparent",
              color: tab === t.key ? "#4f7df9" : "#6b7280", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>{t.label}</button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {tab === "overview" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
              <Card><StatBox label="Articles" value={d.articles.total || 0} sub={`${d.articles.published || 0} published`} color="#4f7df9" /></Card>
              <Card><StatBox label="SEO Pages" value={d.seoPages.total || 0} sub={`${d.seoPages.indexed || 0} indexed`} color="#10b981" /></Card>
              <Card><StatBox label="Referral Clicks" value={d.referrals.totalClicks || 0} sub={`${d.referrals.conversionRate || 0}% conversion`} color="#eab308" /></Card>
              <Card><StatBox label="Social Posts" value={d.social.totalPosts || 0} sub={`${d.social.thisWeek || 0} this week`} color="#a855f7" /></Card>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              <Card>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14, fontWeight: 600 }}>Traffic Sources</div>
                {[
                  { label: "Organic (Articles + SEO)", value: d.trafficSources.organic || 0, color: "#10b981" },
                  { label: "Referral Links", value: d.trafficSources.referral || 0, color: "#eab308" },
                  { label: "Social Distribution", value: d.trafficSources.social || 0, color: "#a855f7" },
                ].map(item => (
                  <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <span style={{ fontSize: 13, color: "#9ca3af" }}>{item.label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: item.color }}>{item.value}</span>
                      <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.04)" }}>
                        <div style={{
                          width: `${Math.min(100, ((item.value || 0) / Math.max(1, (d.trafficSources.organic || 0) + (d.trafficSources.referral || 0) + (d.trafficSources.social || 0))) * 100)}%`,
                          height: "100%", borderRadius: 2, background: item.color,
                        }} />
                      </div>
                    </div>
                  </div>
                ))}
              </Card>

              <Card>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14, fontWeight: 600 }}>Content Pipeline</div>
                {[
                  { label: "Articles This Week", value: d.articles.thisWeek || 0, color: "#4f7df9" },
                  { label: "Total Article Views", value: d.articles.totalViews || 0, color: "#10b981" },
                  { label: "SEO Page Views", value: d.seoPages.totalViews || 0, color: "#eab308" },
                  { label: "Active Referral Links", value: d.referrals.totalLinks || 0, color: "#a855f7" },
                ].map(item => (
                  <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <span style={{ fontSize: 13, color: "#9ca3af" }}>{item.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: item.color }}>{item.value}</span>
                  </div>
                ))}
              </Card>
            </div>
          </>
        )}

        {/* ARTICLES TAB */}
        {tab === "articles" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {articles.length === 0 ? (
              <Card><div style={{ textAlign: "center", padding: 40, color: "#4b5563" }}>No articles yet. Use Quick Actions to generate content.</div></Card>
            ) : articles.map((a: any) => (
              <Card key={a.id} style={{ borderLeft: `3px solid ${a.status === "published" ? "#10b981" : "#6b7280"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{a.title}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                      {a.category} &middot; {a.sourceType} &middot; {a.views} views &middot; {new Date(a.createdAt).toLocaleDateString()}
                    </div>
                    {a.metaDescription && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 6, lineHeight: 1.5 }}>{a.metaDescription}</div>}
                    {a.keywords?.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                        {a.keywords.map((k: string) => (
                          <span key={k} style={{ background: "rgba(79,125,249,0.1)", color: "#4f7df9", padding: "2px 8px", borderRadius: 8, fontSize: 10 }}>{k}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{
                      padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: a.status === "published" ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.1)",
                      color: a.status === "published" ? "#10b981" : "#6b7280",
                    }}>{a.status}</span>
                    {a.status === "draft" && (
                      <button onClick={() => publishMut.mutate(a.id)} data-testid={`button-publish-${a.id}`} style={{
                        background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)",
                        borderRadius: 6, padding: "6px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                      }}>Publish</button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* SEO PAGES TAB */}
        {tab === "seo" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {seoPagesList.length === 0 ? (
              <Card><div style={{ textAlign: "center", padding: 40, color: "#4b5563" }}>No SEO pages. Use Quick Actions to auto-generate.</div></Card>
            ) : seoPagesList.map((p: any) => (
              <Card key={p.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>/{p.slug} &middot; {p.type} &middot; {p.views} views</div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span style={{
                      padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: p.indexed ? "rgba(16,185,129,0.1)" : "rgba(234,179,8,0.1)",
                      color: p.indexed ? "#10b981" : "#eab308",
                    }}>{p.indexed ? "Indexed" : "Not Indexed"}</span>
                    {!p.indexed && (
                      <button onClick={() => indexMut.mutate(p.id)} data-testid={`button-index-${p.id}`} style={{
                        background: "rgba(79,125,249,0.15)", color: "#4f7df9", border: "1px solid rgba(79,125,249,0.3)",
                        borderRadius: 6, padding: "6px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                      }}>Mark Indexed</button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* REFERRALS TAB */}
        {tab === "referrals" && (
          <div>
            {referrals.length === 0 ? (
              <Card><div style={{ textAlign: "center", padding: 40, color: "#4b5563" }}>No referral links created yet</div></Card>
            ) : (
              <div style={{ background: "#111318", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {["User", "Code", "Clicks", "Conversions", "Conv Rate", "Last Click"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#6b7280", fontSize: 11, fontWeight: 600, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.map((r: any) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                        <td style={{ padding: "10px 14px", color: "#d1d5db" }}>{r.userId.slice(0, 8)}</td>
                        <td style={{ padding: "10px 14px", color: "#4f7df9", fontFamily: "monospace", fontSize: 12 }}>{r.code}</td>
                        <td style={{ padding: "10px 14px", color: "#eab308", fontWeight: 600 }}>{r.clicks}</td>
                        <td style={{ padding: "10px 14px", color: "#10b981", fontWeight: 600 }}>{r.conversions}</td>
                        <td style={{ padding: "10px 14px", color: "#d1d5db" }}>{r.clicks > 0 ? Math.round((r.conversions / r.clicks) * 100) : 0}%</td>
                        <td style={{ padding: "10px 14px", color: "#6b7280" }}>{r.lastClickedAt ? new Date(r.lastClickedAt).toLocaleDateString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* QUICK ACTIONS TAB */}
        {tab === "actions" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Card>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 10 }}>AI Content Generation</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={() => dailySummaryMut.mutate()} disabled={dailySummaryMut.isPending} data-testid="button-daily-summary" style={{
                  width: "100%", background: "rgba(79,125,249,0.1)", color: "#4f7df9", border: "1px solid rgba(79,125,249,0.2)",
                  borderRadius: 8, padding: "12px", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}>{dailySummaryMut.isPending ? "Generating..." : "Generate Daily Intelligence Summary"}</button>
                <button onClick={() => selectSocialMut.mutate()} disabled={selectSocialMut.isPending} data-testid="button-select-social" style={{
                  width: "100%", background: "rgba(168,85,247,0.1)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.2)",
                  borderRadius: 8, padding: "12px", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}>{selectSocialMut.isPending ? "Selecting..." : "Select High-Quality Posts for Social"}</button>
                <button onClick={() => autoSeoMut.mutate()} disabled={autoSeoMut.isPending} data-testid="button-auto-seo" style={{
                  width: "100%", background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)",
                  borderRadius: 8, padding: "12px", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}>{autoSeoMut.isPending ? "Generating..." : "Auto-Generate SEO Pages for Topics"}</button>
              </div>
              {dailySummaryMut.isSuccess && <div style={{ marginTop: 8, fontSize: 12, color: "#10b981" }}>Daily summary generated</div>}
              {selectSocialMut.isSuccess && <div style={{ marginTop: 8, fontSize: 12, color: "#10b981" }}>Social posts selected</div>}
              {autoSeoMut.isSuccess && <div style={{ marginTop: 8, fontSize: 12, color: "#10b981" }}>SEO pages generated</div>}
            </Card>

            <Card>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 10 }}>Create Custom SEO Page</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <select value={genType} onChange={e => setGenType(e.target.value)} data-testid="select-seo-type" style={{
                  background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 13, outline: "none",
                }}>
                  <option value="tool">Tool / App</option>
                  <option value="topic">Topic</option>
                  <option value="feature">Feature</option>
                  <option value="landing">Landing Page</option>
                </select>
                <input value={genName} onChange={e => setGenName(e.target.value)} placeholder="Page name" data-testid="input-seo-name" style={{
                  background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 13, outline: "none",
                }} />
                <textarea value={genDesc} onChange={e => setGenDesc(e.target.value)} placeholder="Description..." rows={3} data-testid="input-seo-desc" style={{
                  background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 13, outline: "none", resize: "vertical",
                }} />
                <button onClick={() => genSeoMut.mutate()} disabled={!genName || genSeoMut.isPending} data-testid="button-gen-seo" style={{
                  background: "linear-gradient(135deg,#4f7df9,#3b82f6)", color: "#fff", border: "none",
                  borderRadius: 8, padding: "12px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>{genSeoMut.isPending ? "Generating..." : "Generate SEO Page"}</button>
              </div>
              {genSeoMut.isSuccess && <div style={{ marginTop: 8, fontSize: 12, color: "#10b981" }}>SEO page created</div>}
            </Card>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 24 }}>
          {[
            { label: "Build Queue", href: "/admin/build-queue" },
            { label: "Workday", href: "/admin/workday" },
            { label: "AI CFO", href: "/admin/ai-cfo" },
            { label: "PNR Monitor", href: "/admin/pnr-monitor" },
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
