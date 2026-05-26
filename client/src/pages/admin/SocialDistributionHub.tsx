import { useState, useEffect } from "react";
import { useAdminAuth } from "@/hooks/use-admin-auth";

const PLATFORMS: Record<string, { icon: string; color: string; label: string }> = {
  twitter: { icon: "𝕏", color: "#1d9bf0", label: "Twitter/X" },
  facebook: { icon: "f", color: "#4267B2", label: "Facebook" },
  linkedin: { icon: "in", color: "#0077b5", label: "LinkedIn" },
  bluesky: { icon: "🦋", color: "#0085ff", label: "Bluesky" },
};

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: "rgba(107,114,128,0.1)", color: "#6b7280", label: "Draft" },
  scheduled: { bg: "rgba(234,179,8,0.1)", color: "#eab308", label: "Scheduled" },
  published: { bg: "rgba(16,185,129,0.1)", color: "#10b981", label: "Published" },
  rate_limited: { bg: "rgba(239,68,68,0.1)", color: "#ef4444", label: "Rate Limited" },
  pending_credentials: { bg: "rgba(168,85,247,0.1)", color: "#a855f7", label: "Needs Credentials" },
  failed: { bg: "rgba(239,68,68,0.1)", color: "#ef4444", label: "Failed" },
};

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "#111318", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: 20, ...style }}>{children}</div>;
}

function StatBox({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || "#fff", fontVariantNumeric: "tabular-nums" }} data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}>{value}</div>
    </div>
  );
}

function Badge({ text, bg, color }: { text: string; bg: string; color: string }) {
  return <span style={{ display: "inline-block", fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: bg, color, textTransform: "uppercase", letterSpacing: 0.5 }}>{text}</span>;
}

function adminFetch(url: string, opts?: RequestInit) {
  return fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    credentials: "include",
  }).then(r => r.json());
}

export default function SocialDistributionHub() {
  const [tab, setTab] = useState<"overview" | "accounts" | "posts" | "content" | "config">("overview");
  const [analytics, setAnalytics] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [scheduler, setScheduler] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [detectedContent, setDetectedContent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const { isLoading: authLoading, isAuthenticated } = useAdminAuth();

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccount, setNewAccount] = useState({ platform: "twitter", accountName: "", accountHandle: "", apiKey: "", apiSecret: "", accessToken: "" });

  const [showGeneratePost, setShowGeneratePost] = useState(false);
  const [generatePlatform, setGeneratePlatform] = useState("twitter");
  const [selectedContent, setSelectedContent] = useState<any>(null);
  const [generatedPost, setGeneratedPost] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [analyticsData, configData, schedulerData, accountsData, postsData] = await Promise.all([
        adminFetch("/api/admin/sdh/analytics"),
        adminFetch("/api/admin/sdh/config"),
        adminFetch("/api/admin/sdh/scheduler"),
        adminFetch("/api/admin/sdh/accounts"),
        adminFetch("/api/admin/sdh/posts"),
      ]);
      setAnalytics(analyticsData);
      setConfig(configData);
      setScheduler(schedulerData);
      setAccounts(accountsData);
      setPosts(postsData);
    } catch { setError("Failed to load"); }
    setLoading(false);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    load();
  }, [isAuthenticated]);

  if (authLoading) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>Loading...</div>;
  }
  if (!isAuthenticated) return null;

  const addAccount = async () => {
    if (!newAccount.accountName) return;
    setActionLoading("add-account");
    await adminFetch("/api/admin/sdh/accounts", { method: "POST", body: JSON.stringify(newAccount) });
    setShowAddAccount(false);
    setNewAccount({ platform: "twitter", accountName: "", accountHandle: "", apiKey: "", apiSecret: "", accessToken: "" });
    await load();
    setActionLoading("");
  };

  const toggleAccount = async (id: string, active: boolean) => {
    setActionLoading(`toggle-${id}`);
    await adminFetch(`/api/admin/sdh/accounts/${id}/toggle`, { method: "PATCH", body: JSON.stringify({ active }) });
    await load();
    setActionLoading("");
  };

  const deleteAccount = async (id: string) => {
    setActionLoading(`delete-${id}`);
    await adminFetch(`/api/admin/sdh/accounts/${id}`, { method: "DELETE" });
    await load();
    setActionLoading("");
  };

  const updateConfig = async (updates: any) => {
    setActionLoading("config");
    await adminFetch("/api/admin/sdh/config", { method: "PATCH", body: JSON.stringify(updates) });
    await load();
    setActionLoading("");
  };

  const detectContent = async () => {
    setActionLoading("detect");
    const data = await adminFetch("/api/admin/sdh/detect-content");
    setDetectedContent(Array.isArray(data) ? data : []);
    setActionLoading("");
  };

  const autoDetectAndGenerate = async () => {
    setActionLoading("auto-generate");
    await adminFetch("/api/admin/sdh/auto-detect", { method: "POST" });
    await load();
    setActionLoading("");
  };

  const generatePost = async (content: any) => {
    setSelectedContent(content);
    setShowGeneratePost(true);
    setActionLoading("generate");
    const data = await adminFetch("/api/admin/sdh/generate-post", {
      method: "POST",
      body: JSON.stringify({
        platform: generatePlatform,
        sourceType: content.type,
        sourceId: content.id,
        title: content.title,
        description: content.description,
        url: content.url,
      }),
    });
    setGeneratedPost(data);
    setActionLoading("");
  };

  const saveGeneratedPost = async () => {
    if (!generatedPost || !selectedContent || accounts.length === 0) return;
    const targetAccount = accounts.find(a => a.platform === generatePlatform && a.isActive) || accounts[0];
    setActionLoading("save-post");
    await adminFetch("/api/admin/sdh/posts", {
      method: "POST",
      body: JSON.stringify({
        accountId: targetAccount.id,
        platform: generatePlatform,
        sourceType: selectedContent.type,
        sourceId: selectedContent.id,
        sourceUrl: selectedContent.url,
        title: generatedPost.title,
        body: generatedPost.body,
        hashtags: generatedPost.hashtags,
        qualityScore: generatedPost.qualityScore,
        status: "draft",
      }),
    });
    setShowGeneratePost(false);
    setGeneratedPost(null);
    await load();
    setActionLoading("");
  };

  const publishPost = async (id: string) => {
    setActionLoading(`publish-${id}`);
    await adminFetch(`/api/admin/sdh/posts/${id}/publish`, { method: "POST" });
    await load();
    setActionLoading("");
  };

  const deletePost = async (id: string) => {
    setActionLoading(`delete-post-${id}`);
    await adminFetch(`/api/admin/sdh/posts/${id}`, { method: "DELETE" });
    await load();
    setActionLoading("");
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>
      Loading Social Distribution Hub...
    </div>
  );

  const tabStyle = (t: string) => ({
    padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600 as const, cursor: "pointer" as const,
    background: tab === t ? "rgba(79,125,249,0.15)" : "transparent",
    color: tab === t ? "#4f7df9" : "#6b7280",
    border: `1px solid ${tab === t ? "rgba(79,125,249,0.3)" : "transparent"}`,
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 28 }}>📡</span>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: 0 }} data-testid="text-page-title">Social Distribution Hub</h1>
        </div>
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 24 }}>Automated social media publishing for important platform content</p>

        {/* Scheduler Status Bar */}
        {scheduler && (
          <Card style={{ marginBottom: 16, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: scheduler.isPostingWindow ? "#10b981" : "#eab308",
                }} />
                <span style={{ fontSize: 12, color: "#9ca3af" }}>
                  {scheduler.isPostingWindow ? "Posting window active" : "Outside posting window"}
                  {" · "}{scheduler.currentHourUTC}:00 UTC · Window: {scheduler.postingStartHour}:00-{scheduler.postingEndHour}:00
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  {scheduler.postsToday}/{scheduler.postsPerDayLimit} posts today
                </span>
                <Badge text={scheduler.autoPost ? "Auto-post ON" : "Manual"} bg={scheduler.autoPost ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.1)"} color={scheduler.autoPost ? "#10b981" : "#6b7280"} />
                <span style={{ fontSize: 12, color: "#6b7280" }}>{scheduler.activeAccounts} accounts</span>
              </div>
            </div>
          </Card>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { key: "overview", label: "Overview" },
            { key: "accounts", label: "Accounts" },
            { key: "posts", label: "Posts" },
            { key: "content", label: "Content Discovery" },
            { key: "config", label: "Settings" },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)} style={tabStyle(t.key)} data-testid={`tab-${t.key}`}>{t.label}</button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {tab === "overview" && analytics && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
              <Card><StatBox label="Total Posts" value={analytics.totalPosts} color="#4f7df9" /></Card>
              <Card><StatBox label="Published" value={analytics.publishedPosts} color="#10b981" /></Card>
              <Card><StatBox label="Impressions" value={analytics.totalImpressions.toLocaleString()} color="#eab308" /></Card>
              <Card><StatBox label="Clicks" value={analytics.totalClicks.toLocaleString()} color="#a855f7" /></Card>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              <Card>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Platform Breakdown</div>
                {analytics.platformBreakdown.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#4b5563" }}>No posts yet</div>
                ) : analytics.platformBreakdown.map((p: any) => {
                  const pl = PLATFORMS[p.platform] || { icon: "?", color: "#6b7280", label: p.platform };
                  return (
                    <div key={p.platform} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 24, height: 24, borderRadius: 6, background: `${pl.color}20`, color: pl.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{pl.icon}</span>
                        <span style={{ fontSize: 13, color: "#e5e7eb" }}>{pl.label}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{p.count}</span>
                    </div>
                  );
                })}
              </Card>
              <Card>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Content Sources</div>
                {analytics.sourceBreakdown.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#4b5563" }}>No content posted yet</div>
                ) : analytics.sourceBreakdown.map((s: any) => (
                  <div key={s.sourceType} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: 13, color: "#e5e7eb", textTransform: "capitalize" }}>{s.sourceType}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{s.count}</span>
                  </div>
                ))}
              </Card>
            </div>

            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Recent Posts</div>
                <button onClick={autoDetectAndGenerate} disabled={actionLoading === "auto-generate"} data-testid="button-auto-generate" style={{
                  background: "linear-gradient(135deg,#a855f7,#7c3aed)", color: "#fff", border: "none",
                  borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>
                  {actionLoading === "auto-generate" ? "Generating..." : "Auto-Detect & Generate"}
                </button>
              </div>
              {analytics.recentPosts.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24, color: "#4b5563" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                  <div style={{ fontSize: 13 }}>No posts yet. Use "Auto-Detect & Generate" or go to Content Discovery</div>
                </div>
              ) : (
                analytics.recentPosts.slice(0, 5).map((p: any) => {
                  const st = STATUS_STYLES[p.status] || STATUS_STYLES.draft;
                  const pl = PLATFORMS[p.platform] || { icon: "?", color: "#6b7280", label: p.platform };
                  return (
                    <div key={p.id} style={{ padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 28, height: 28, borderRadius: 6, background: `${pl.color}15`, color: pl.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{pl.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{p.sourceType} · Q:{(p.qualityScore * 100).toFixed(0)}%</div>
                      </div>
                      <Badge text={st.label} bg={st.bg} color={st.color} />
                    </div>
                  );
                })
              )}
            </Card>
          </>
        )}

        {/* ACCOUNTS TAB */}
        {tab === "accounts" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Connected Accounts</div>
              <button onClick={() => setShowAddAccount(true)} data-testid="button-add-account" style={{
                background: "#4f7df9", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>+ Add Account</button>
            </div>

            {showAddAccount && (
              <Card style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Add Social Account</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>Platform</label>
                    <select value={newAccount.platform} onChange={e => setNewAccount({ ...newAccount, platform: e.target.value })} data-testid="select-platform" style={{
                      width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13,
                    }}>
                      {Object.entries(PLATFORMS).map(([key, val]) => <option key={key} value={key}>{val.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>Account Name</label>
                    <input value={newAccount.accountName} onChange={e => setNewAccount({ ...newAccount, accountName: e.target.value })} placeholder="My Twitter Account" data-testid="input-account-name" style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>Handle (@username)</label>
                  <input value={newAccount.accountHandle} onChange={e => setNewAccount({ ...newAccount, accountHandle: e.target.value })} placeholder="@mougle" data-testid="input-account-handle" style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>API Key</label>
                    <input value={newAccount.apiKey} onChange={e => setNewAccount({ ...newAccount, apiKey: e.target.value })} placeholder="API Key" type="password" data-testid="input-api-key" style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>API Secret</label>
                    <input value={newAccount.apiSecret} onChange={e => setNewAccount({ ...newAccount, apiSecret: e.target.value })} placeholder="API Secret" type="password" data-testid="input-api-secret" style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>Access Token (OAuth)</label>
                  <input value={newAccount.accessToken} onChange={e => setNewAccount({ ...newAccount, accessToken: e.target.value })} placeholder="Access Token" type="password" data-testid="input-access-token" style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => setShowAddAccount(false)} style={{ background: "transparent", color: "#6b7280", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 16px", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                  <button onClick={addAccount} disabled={actionLoading === "add-account"} data-testid="button-save-account" style={{ background: "#4f7df9", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {actionLoading === "add-account" ? "Saving..." : "Save Account"}
                  </button>
                </div>
              </Card>
            )}

            {accounts.length === 0 ? (
              <Card style={{ textAlign: "center", padding: 32 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🔗</div>
                <div style={{ fontSize: 14, color: "#9ca3af" }}>No social accounts connected yet</div>
                <div style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>Add your Twitter, LinkedIn, Facebook, or Bluesky accounts</div>
              </Card>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {accounts.map((acc: any) => {
                  const pl = PLATFORMS[acc.platform] || { icon: "?", color: "#6b7280", label: acc.platform };
                  return (
                    <Card key={acc.id}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ width: 40, height: 40, borderRadius: 10, background: `${pl.color}15`, color: pl.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700 }}>{pl.icon}</span>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{acc.accountName}</div>
                            <div style={{ fontSize: 12, color: "#6b7280" }}>{pl.label} · {acc.accountHandle || "No handle"} · {acc.postCount} posts</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Badge text={acc.isActive ? "Active" : "Disabled"} bg={acc.isActive ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)"} color={acc.isActive ? "#10b981" : "#ef4444"} />
                          <button onClick={() => toggleAccount(acc.id, !acc.isActive)} data-testid={`button-toggle-${acc.id}`} style={{
                            background: "rgba(255,255,255,0.03)", color: "#9ca3af", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer",
                          }}>{acc.isActive ? "Disable" : "Enable"}</button>
                          <button onClick={() => deleteAccount(acc.id)} data-testid={`button-delete-account-${acc.id}`} style={{
                            background: "rgba(239,68,68,0.06)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer",
                          }}>Delete</button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* POSTS TAB */}
        {tab === "posts" && (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 16 }}>Post Queue</div>
            {posts.length === 0 ? (
              <Card style={{ textAlign: "center", padding: 32 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📝</div>
                <div style={{ fontSize: 14, color: "#9ca3af" }}>No posts in queue</div>
                <div style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>Generate posts from detected content or use auto-detect</div>
              </Card>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {posts.map((post: any) => {
                  const st = STATUS_STYLES[post.status] || STATUS_STYLES.draft;
                  const pl = PLATFORMS[post.platform] || { icon: "?", color: "#6b7280", label: post.platform };
                  return (
                    <Card key={post.id}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <span style={{ width: 36, height: 36, borderRadius: 8, background: `${pl.color}15`, color: pl.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{pl.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{post.title}</span>
                            <Badge text={st.label} bg={st.bg} color={st.color} />
                          </div>
                          <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 6, lineHeight: 1.5, maxHeight: 60, overflow: "hidden" }}>{post.body}</div>
                          {post.hashtags?.length > 0 && (
                            <div style={{ fontSize: 11, color: "#4f7df9", marginBottom: 6 }}>
                              {(post.hashtags as string[]).map(h => `#${h}`).join(" ")}
                            </div>
                          )}
                          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "#6b7280" }}>
                            <span>{post.sourceType}</span>
                            <span>Q: {(post.qualityScore * 100).toFixed(0)}%</span>
                            {post.impressions > 0 && <span>{post.impressions} imp</span>}
                            {post.clicks > 0 && <span>{post.clicks} clicks</span>}
                            {post.errorMessage && <span style={{ color: "#ef4444" }}>{post.errorMessage}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                          {post.status === "draft" && (
                            <button onClick={() => publishPost(post.id)} disabled={actionLoading === `publish-${post.id}`} data-testid={`button-publish-${post.id}`} style={{
                              background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                            }}>{actionLoading === `publish-${post.id}` ? "..." : "Publish"}</button>
                          )}
                          <button onClick={() => deletePost(post.id)} data-testid={`button-delete-post-${post.id}`} style={{
                            background: "rgba(239,68,68,0.06)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer",
                          }}>Delete</button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* CONTENT DISCOVERY TAB */}
        {tab === "content" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Content Discovery</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={detectContent} disabled={actionLoading === "detect"} data-testid="button-detect-content" style={{
                  background: "rgba(79,125,249,0.1)", color: "#4f7df9", border: "1px solid rgba(79,125,249,0.3)", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>{actionLoading === "detect" ? "Scanning..." : "Scan Platform Content"}</button>
                <button onClick={autoDetectAndGenerate} disabled={actionLoading === "auto-generate"} data-testid="button-auto-generate-content" style={{
                  background: "linear-gradient(135deg,#a855f7,#7c3aed)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>{actionLoading === "auto-generate" ? "Generating..." : "Auto-Generate Posts"}</button>
              </div>
            </div>

            {detectedContent.length === 0 ? (
              <Card style={{ textAlign: "center", padding: 32 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
                <div style={{ fontSize: 14, color: "#9ca3af" }}>Click "Scan Platform Content" to discover shareable pages</div>
                <div style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>Detects knowledge pages, apps, tools, and updates</div>
              </Card>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {detectedContent.map((item: any, i: number) => (
                  <Card key={`${item.type}-${item.id}-${i}`}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <Badge text={item.type} bg="rgba(79,125,249,0.1)" color="#4f7df9" />
                          <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{item.title}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{item.description?.slice(0, 100)}</div>
                        <div style={{ fontSize: 11, color: "#4b5563", marginTop: 4 }}>
                          Quality: <span style={{ color: item.qualityScore >= 0.7 ? "#10b981" : "#eab308" }}>{(item.qualityScore * 100).toFixed(0)}%</span>
                          {" · "}{item.url}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 12 }}>
                        {Object.keys(PLATFORMS).map(pl => (
                          <button key={pl} onClick={() => { setGeneratePlatform(pl); generatePost(item); }} data-testid={`button-generate-${pl}-${i}`} style={{
                            width: 30, height: 30, borderRadius: 6, background: `${PLATFORMS[pl].color}10`, color: PLATFORMS[pl].color,
                            border: `1px solid ${PLATFORMS[pl].color}30`, display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 700, cursor: "pointer",
                          }}>{PLATFORMS[pl].icon}</button>
                        ))}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Generated Post Preview Modal */}
            {showGeneratePost && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
                <Card style={{ maxWidth: 520, width: "100%", maxHeight: "80vh", overflow: "auto" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Generated Post Preview</div>
                    <button onClick={() => { setShowGeneratePost(false); setGeneratedPost(null); }} style={{ background: "transparent", color: "#6b7280", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
                  </div>
                  {actionLoading === "generate" ? (
                    <div style={{ textAlign: "center", padding: 32, color: "#6b7280" }}>Generating post with AI...</div>
                  ) : generatedPost ? (
                    <>
                      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>Platform</div>
                      <div style={{ marginBottom: 12 }}>
                        <Badge text={PLATFORMS[generatePlatform]?.label || generatePlatform} bg={`${PLATFORMS[generatePlatform]?.color || "#6b7280"}15`} color={PLATFORMS[generatePlatform]?.color || "#6b7280"} />
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>Title</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12 }}>{generatedPost.title}</div>
                      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>Post Body</div>
                      <div style={{ fontSize: 13, color: "#e5e7eb", background: "#0a0b10", borderRadius: 8, padding: 12, marginBottom: 12, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{generatedPost.body}</div>
                      {generatedPost.hashtags?.length > 0 && (
                        <>
                          <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>Hashtags</div>
                          <div style={{ fontSize: 12, color: "#4f7df9", marginBottom: 12 }}>{generatedPost.hashtags.map((h: string) => `#${h}`).join(" ")}</div>
                        </>
                      )}
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 12 }}>Quality Score: <span style={{ color: "#10b981" }}>{(generatedPost.qualityScore * 100).toFixed(0)}%</span></div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button onClick={() => { setShowGeneratePost(false); setGeneratedPost(null); }} style={{ background: "transparent", color: "#6b7280", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 16px", fontSize: 12, cursor: "pointer" }}>Discard</button>
                        <button onClick={saveGeneratedPost} disabled={actionLoading === "save-post"} data-testid="button-save-generated" style={{
                          background: "#4f7df9", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                        }}>{actionLoading === "save-post" ? "Saving..." : "Save as Draft"}</button>
                      </div>
                    </>
                  ) : null}
                </Card>
              </div>
            )}
          </>
        )}

        {/* CONFIG TAB */}
        {tab === "config" && config && (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 16 }}>Distribution Settings</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Card>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 16 }}>Posting Controls</div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label style={{ fontSize: 12, color: "#9ca3af" }}>Posts Per Day</label>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#4f7df9" }}>{config.postsPerDay}</span>
                  </div>
                  <input type="range" min={1} max={10} value={config.postsPerDay} onChange={e => updateConfig({ postsPerDay: parseInt(e.target.value) })} data-testid="range-posts-per-day" style={{ width: "100%", accentColor: "#4f7df9" }} />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label style={{ fontSize: 12, color: "#9ca3af" }}>Min Quality Threshold</label>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#10b981" }}>{(config.minQualityScore * 100).toFixed(0)}%</span>
                  </div>
                  <input type="range" min={30} max={100} step={5} value={config.minQualityScore * 100} onChange={e => updateConfig({ minQualityScore: parseInt(e.target.value) / 100 })} data-testid="range-quality" style={{ width: "100%", accentColor: "#10b981" }} />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>Auto-Post</div>
                    <div style={{ fontSize: 11, color: "#4b5563" }}>Automatically publish when scheduled</div>
                  </div>
                  <button onClick={() => updateConfig({ autoPost: !config.autoPost })} data-testid="button-toggle-autopost" style={{
                    width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                    background: config.autoPost ? "#10b981" : "rgba(255,255,255,0.1)",
                    position: "relative",
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%", background: "#fff",
                      position: "absolute", top: 3, left: config.autoPost ? 23 : 3,
                      transition: "left 0.2s ease",
                    }} />
                  </button>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>Include Images</div>
                    <div style={{ fontSize: 11, color: "#4b5563" }}>Attach OG images or generated cards</div>
                  </div>
                  <button onClick={() => updateConfig({ includeImages: !config.includeImages })} data-testid="button-toggle-images" style={{
                    width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                    background: config.includeImages ? "#10b981" : "rgba(255,255,255,0.1)",
                    position: "relative",
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%", background: "#fff",
                      position: "absolute", top: 3, left: config.includeImages ? 23 : 3,
                      transition: "left 0.2s ease",
                    }} />
                  </button>
                </div>
              </Card>

              <Card>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 16 }}>Schedule & Platforms</div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label style={{ fontSize: 12, color: "#9ca3af" }}>Posting Window (UTC)</label>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>{config.postingStartHour}:00 - {config.postingEndHour}:00</span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 10, color: "#4b5563" }}>Start</label>
                      <select value={config.postingStartHour} onChange={e => updateConfig({ postingStartHour: parseInt(e.target.value) })} data-testid="select-start-hour" style={{
                        width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "8px", color: "#fff", fontSize: 12,
                      }}>
                        {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{i}:00</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 10, color: "#4b5563" }}>End</label>
                      <select value={config.postingEndHour} onChange={e => updateConfig({ postingEndHour: parseInt(e.target.value) })} data-testid="select-end-hour" style={{
                        width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "8px", color: "#fff", fontSize: 12,
                      }}>
                        {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{i}:00</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 6 }}>Active Platforms</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {Object.entries(PLATFORMS).map(([key, val]) => {
                      const isActive = (config.platforms || []).includes(key);
                      return (
                        <button key={key} onClick={() => {
                          const current = config.platforms || [];
                          const updated = isActive ? current.filter((p: string) => p !== key) : [...current, key];
                          updateConfig({ platforms: updated });
                        }} data-testid={`toggle-platform-${key}`} style={{
                          padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                          background: isActive ? `${val.color}15` : "rgba(255,255,255,0.03)",
                          border: `1px solid ${isActive ? `${val.color}40` : "rgba(255,255,255,0.06)"}`,
                          color: isActive ? val.color : "#6b7280",
                        }}>{val.label}</button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 12, color: "#9ca3af", display: "block", marginBottom: 6 }}>Content Types</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {["knowledge", "app", "topic", "update"].map(ct => {
                      const isActive = (config.contentTypes || []).includes(ct);
                      return (
                        <button key={ct} onClick={() => {
                          const current = config.contentTypes || [];
                          const updated = isActive ? current.filter((c: string) => c !== ct) : [...current, ct];
                          updateConfig({ contentTypes: updated });
                        }} data-testid={`toggle-content-${ct}`} style={{
                          padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
                          background: isActive ? "rgba(79,125,249,0.1)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${isActive ? "rgba(79,125,249,0.3)" : "rgba(255,255,255,0.06)"}`,
                          color: isActive ? "#4f7df9" : "#6b7280",
                        }}>{ct}</button>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
