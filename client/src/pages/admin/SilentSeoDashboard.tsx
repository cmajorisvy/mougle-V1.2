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

const SCHEMA_COLORS: Record<string, string> = {
  Article: "#4f7df9", FAQ: "#10b981", HowTo: "#eab308", SoftwareApplication: "#a855f7",
};

export default function SilentSeoDashboard() {
  const [tab, setTab] = useState<"overview" | "pages" | "clusters" | "actions">("overview");
  const [pageFilter, setPageFilter] = useState("");
  const [clusterName, setClusterName] = useState("");
  const [clusterTopics, setClusterTopics] = useState("");
  const [clusterDesc, setClusterDesc] = useState("");
  const [genTopic, setGenTopic] = useState("");

  const { data: dashboard } = useQuery({
    queryKey: ["/admin/seo/dashboard"],
    queryFn: () => (api as any).adminSeo.getDashboard(),
    refetchInterval: 60000,
  });

  const { data: pages = [] } = useQuery({
    queryKey: ["/admin/seo/pages", pageFilter],
    queryFn: () => (api as any).adminSeo.getPages(pageFilter),
    enabled: tab === "pages" || tab === "overview",
  });

  const { data: clusters = [] } = useQuery({
    queryKey: ["/admin/seo/clusters"],
    queryFn: () => (api as any).adminSeo.getClusters(),
    enabled: tab === "clusters" || tab === "overview",
  });

  const publishMut = useMutation({
    mutationFn: (id: string) => (api as any).adminSeo.publishPage(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/admin/seo"] }); },
  });

  const updateMut = useMutation({
    mutationFn: (id: string) => (api as any).adminSeo.updateInsights(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/admin/seo"] }); },
  });

  const autoGenMut = useMutation({
    mutationFn: () => (api as any).adminSeo.autoGenerate(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/admin/seo"] }); },
  });

  const updateAllMut = useMutation({
    mutationFn: () => (api as any).adminSeo.updateAll(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/admin/seo"] }); },
  });

  const genPageMut = useMutation({
    mutationFn: () => (api as any).adminSeo.generatePage(genTopic),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/admin/seo"] }); setGenTopic(""); },
  });

  const createClusterMut = useMutation({
    mutationFn: () => (api as any).adminSeo.createCluster(clusterName, clusterTopics.split(",").map(s => s.trim()).filter(Boolean), clusterDesc),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/admin/seo"] }); setClusterName(""); setClusterTopics(""); setClusterDesc(""); },
  });

  const buildClusterMut = useMutation({
    mutationFn: (id: string) => (api as any).adminSeo.buildClusterPages(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/admin/seo"] }); },
  });

  const d = dashboard || { overview: {}, clusters: {}, schemaMarkup: {}, topPages: [] };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }} data-testid="text-page-title">Silent SEO Dominance</h1>
            <span style={{ background: "rgba(79,125,249,0.15)", color: "#4f7df9", padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>Knowledge Engine</span>
          </div>
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>Structured knowledge pages optimized for Google and AI search engines</p>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { key: "overview", label: "Dashboard" },
            { key: "pages", label: `Pages (${d.overview.totalPages || 0})` },
            { key: "clusters", label: `Clusters (${d.clusters?.total || 0})` },
            { key: "actions", label: "Actions" },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)} data-testid={`tab-${t.key}`} style={{
              padding: "8px 18px", borderRadius: 8, border: "1px solid",
              borderColor: tab === t.key ? "rgba(79,125,249,0.4)" : "rgba(255,255,255,0.06)",
              background: tab === t.key ? "rgba(79,125,249,0.1)" : "transparent",
              color: tab === t.key ? "#4f7df9" : "#6b7280", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>{t.label}</button>
          ))}
        </div>

        {/* OVERVIEW */}
        {tab === "overview" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
              <Card><StatBox label="Indexed Pages" value={d.overview.indexedPages || 0} sub={`${d.overview.indexRate || 0}% index rate`} color="#10b981" /></Card>
              <Card><StatBox label="Total Views" value={d.overview.totalViews || 0} color="#4f7df9" /></Card>
              <Card><StatBox label="Citations" value={d.overview.totalCitations || 0} color="#eab308" /></Card>
              <Card><StatBox label="Updates" value={d.overview.totalUpdates || 0} sub={`${d.overview.recentlyUpdated || 0} this week`} color="#a855f7" /></Card>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              <Card>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14, fontWeight: 600 }}>Schema Markup Coverage</div>
                {Object.keys(SCHEMA_COLORS).map(type => (
                  <div key={type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: SCHEMA_COLORS[type] }} />
                      <span style={{ fontSize: 13, color: "#d1d5db" }}>{type}</span>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: SCHEMA_COLORS[type] }} data-testid={`schema-${type.toLowerCase()}`}>
                      {d.schemaMarkup?.[type] || 0} pages
                    </span>
                  </div>
                ))}
              </Card>

              <Card>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14, fontWeight: 600 }}>Top Pages</div>
                {(d.topPages || []).length === 0 ? (
                  <div style={{ textAlign: "center", padding: 20, color: "#4b5563", fontSize: 13 }}>No pages yet</div>
                ) : (d.topPages || []).map((p: any, i: number) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "#4b5563", fontWeight: 700 }}>#{i + 1}</span>
                      <span style={{ fontSize: 12, color: "#d1d5db" }}>{p.title?.slice(0, 40)}{p.title?.length > 40 ? "..." : ""}</span>
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#9ca3af" }}>
                      <span>{p.views} views</span>
                      <span>{p.citations} citations</span>
                    </div>
                  </div>
                ))}
              </Card>
            </div>

            <Card>
              <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14, fontWeight: 600 }}>Topic Clusters</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#4f7df9" }}>{d.clusters?.total || 0}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Clusters</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#10b981" }}>{d.clusters?.totalClusterPages || 0}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Cluster Pages</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#eab308" }}>{d.clusters?.avgDomainAuthority || 0}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>Avg Authority</div>
                </div>
              </div>
            </Card>
          </>
        )}

        {/* PAGES TAB */}
        {tab === "pages" && (
          <>
            <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
              {["", "draft", "published"].map(f => (
                <button key={f} onClick={() => setPageFilter(f)} data-testid={`filter-${f || "all"}`} style={{
                  padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  background: pageFilter === f ? "rgba(79,125,249,0.1)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${pageFilter === f ? "rgba(79,125,249,0.3)" : "rgba(255,255,255,0.06)"}`,
                  color: pageFilter === f ? "#4f7df9" : "#6b7280",
                }}>{f || "All"}</button>
              ))}
            </div>
            {pages.length === 0 ? (
              <Card><div style={{ textAlign: "center", padding: 40, color: "#4b5563" }}>No knowledge pages. Use Actions tab to generate.</div></Card>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pages.map((p: any) => (
                  <Card key={p.id} style={{ borderLeft: `3px solid ${p.status === "published" ? "#10b981" : "#6b7280"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{p.title}</div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                          /{p.slug} &middot; Topic: {p.topicSlug} &middot; {p.views} views &middot; {p.citationCount} citations &middot; {p.updateCount} updates
                        </div>
                        {p.summary && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 6, lineHeight: 1.5 }}>{p.summary.slice(0, 200)}</div>}
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                          {(p.schemaMarkupTypes || []).map((t: string) => (
                            <span key={t} style={{ background: `${SCHEMA_COLORS[t] || "#6b7280"}15`, color: SCHEMA_COLORS[t] || "#6b7280", padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 600 }}>{t}</span>
                          ))}
                          {(p.keyTakeaways || []).length > 0 && <span style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7", padding: "2px 8px", borderRadius: 8, fontSize: 10 }}>{p.keyTakeaways.length} takeaways</span>}
                          {(p.faqItems || []).length > 0 && <span style={{ background: "rgba(234,179,8,0.1)", color: "#eab308", padding: "2px 8px", borderRadius: 8, fontSize: 10 }}>{p.faqItems.length} FAQs</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                        <button onClick={() => updateMut.mutate(p.id)} data-testid={`button-update-${p.id}`} style={{
                          background: "rgba(168,85,247,0.15)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.3)",
                          borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                        }}>Update</button>
                        {p.status === "draft" && (
                          <button onClick={() => publishMut.mutate(p.id)} data-testid={`button-publish-${p.id}`} style={{
                            background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)",
                            borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                          }}>Publish</button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* CLUSTERS TAB */}
        {tab === "clusters" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {clusters.length === 0 ? (
              <Card><div style={{ textAlign: "center", padding: 40, color: "#4b5563" }}>No clusters yet. Create one in the Actions tab.</div></Card>
            ) : clusters.map((c: any) => (
              <Card key={c.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                      {c.totalPages} pages &middot; Topics: {(c.topicSlugs || []).join(", ")}
                    </div>
                    {c.description && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>{c.description}</div>}
                  </div>
                  <button onClick={() => buildClusterMut.mutate(c.id)} data-testid={`button-build-${c.id}`} style={{
                    background: "rgba(79,125,249,0.15)", color: "#4f7df9", border: "1px solid rgba(79,125,249,0.3)",
                    borderRadius: 6, padding: "6px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                  }}>Build Pages</button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ACTIONS TAB */}
        {tab === "actions" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Card>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Batch Operations</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={() => autoGenMut.mutate()} disabled={autoGenMut.isPending} data-testid="button-auto-generate" style={{
                  width: "100%", background: "rgba(79,125,249,0.1)", color: "#4f7df9", border: "1px solid rgba(79,125,249,0.2)",
                  borderRadius: 8, padding: "12px", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}>{autoGenMut.isPending ? "Generating..." : "Auto-Generate Knowledge Pages for All Topics"}</button>
                <button onClick={() => updateAllMut.mutate()} disabled={updateAllMut.isPending} data-testid="button-update-all" style={{
                  width: "100%", background: "rgba(168,85,247,0.1)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.2)",
                  borderRadius: 8, padding: "12px", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}>{updateAllMut.isPending ? "Updating..." : "Update All Published Pages with New Insights"}</button>
                {autoGenMut.isSuccess && <div style={{ fontSize: 12, color: "#10b981" }}>Pages generated successfully</div>}
                {updateAllMut.isSuccess && <div style={{ fontSize: 12, color: "#10b981" }}>
                  Updated: {(updateAllMut.data as any)?.updated || 0}, Skipped: {(updateAllMut.data as any)?.skipped || 0}
                </div>}
              </div>

              <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 10 }}>Generate Single Page</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={genTopic} onChange={e => setGenTopic(e.target.value)} placeholder="Topic slug (e.g., ai-ethics)" data-testid="input-gen-topic" style={{
                    flex: 1, background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 13, outline: "none",
                  }} />
                  <button onClick={() => genPageMut.mutate()} disabled={!genTopic || genPageMut.isPending} data-testid="button-gen-page" style={{
                    background: "#4f7df9", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}>{genPageMut.isPending ? "..." : "Generate"}</button>
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Create Topic Cluster</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input value={clusterName} onChange={e => setClusterName(e.target.value)} placeholder="Cluster name" data-testid="input-cluster-name" style={{
                  background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 13, outline: "none",
                }} />
                <input value={clusterTopics} onChange={e => setClusterTopics(e.target.value)} placeholder="Topic slugs (comma-separated)" data-testid="input-cluster-topics" style={{
                  background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 13, outline: "none",
                }} />
                <textarea value={clusterDesc} onChange={e => setClusterDesc(e.target.value)} placeholder="Cluster description..." rows={3} data-testid="input-cluster-desc" style={{
                  background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 13, outline: "none", resize: "vertical",
                }} />
                <button onClick={() => createClusterMut.mutate()} disabled={!clusterName || !clusterTopics || createClusterMut.isPending} data-testid="button-create-cluster" style={{
                  background: "linear-gradient(135deg,#4f7df9,#3b82f6)", color: "#fff", border: "none",
                  borderRadius: 8, padding: "12px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>{createClusterMut.isPending ? "Creating..." : "Create Cluster with Pillar Page"}</button>
                {createClusterMut.isSuccess && <div style={{ fontSize: 12, color: "#10b981" }}>Cluster created with pillar page</div>}
              </div>

              <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "rgba(79,125,249,0.06)", border: "1px solid rgba(79,125,249,0.15)" }}>
                <div style={{ fontSize: 11, color: "#4f7df9", fontWeight: 600, marginBottom: 4 }}>Topic Cluster Strategy</div>
                <p style={{ fontSize: 12, color: "#9ca3af", margin: 0, lineHeight: 1.5 }}>
                  Group related topics into clusters with a pillar page and supporting content. This creates internal linking structure that signals topical authority to search engines and AI citation systems.
                </p>
              </div>
            </Card>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 24 }}>
          {[
            { label: "Marketing Engine", href: "/admin/marketing" },
            { label: "Build Queue", href: "/admin/build-queue" },
            { label: "Workday", href: "/admin/workday" },
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
