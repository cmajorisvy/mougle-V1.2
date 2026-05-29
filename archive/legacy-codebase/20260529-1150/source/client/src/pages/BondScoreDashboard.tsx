import { useState, useEffect } from "react";
import { useLocation } from "wouter";

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: "#111318", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: 20, ...style }}>{children}</div>;
}

export default function BondScoreDashboard() {
  const [, navigate] = useLocation();
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const user = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
  })();

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    fetch(`/api/bondscore/dashboard/${user.id}`)
      .then(r => r.json())
      .then(data => { setDashboard(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>
      Loading...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔗</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }} data-testid="text-page-title">BondScore</h1>
          <p style={{ color: "#9ca3af", fontSize: 14, marginTop: 6, marginBottom: 20 }}>Create fun friendship tests and discover how well your friends really know you</p>
          <button onClick={() => navigate("/bondscore/create")} data-testid="button-create-test" style={{
            background: "linear-gradient(135deg,#4f7df9,#3b82f6)", color: "#fff", border: "none",
            borderRadius: 12, padding: "14px 36px", fontSize: 15, fontWeight: 700, cursor: "pointer",
          }}>Create a Test</button>
        </div>

        {/* Stats */}
        {user && dashboard && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
              <Card style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Tests Created</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#4f7df9" }} data-testid="stat-tests-created">{dashboard.totalTests}</div>
              </Card>
              <Card style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Participants</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#10b981" }} data-testid="stat-participants">{dashboard.totalParticipants}</div>
              </Card>
              <Card style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Avg Score</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#eab308" }} data-testid="stat-avg-score">{dashboard.avgScore}%</div>
              </Card>
            </div>

            {/* My Tests */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>Your Tests</div>
              {dashboard.tests.length === 0 ? (
                <Card>
                  <div style={{ textAlign: "center", padding: 24, color: "#4b5563" }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📝</div>
                    <div style={{ fontSize: 14 }}>No tests yet. Create your first one!</div>
                  </div>
                </Card>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {dashboard.tests.map((test: any) => {
                    const shareUrl = `${window.location.origin}/bondscore/${test.slug}`;
                    return (
                      <Card key={test.id}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 22 }}>{test.coverEmoji}</span>
                              <div>
                                <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{test.title}</div>
                                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                                  {test.participantCount} participants · Avg: {Math.round(test.avgScore || 0)}%
                                </div>
                              </div>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => navigator.clipboard.writeText(shareUrl)} data-testid={`button-copy-${test.id}`} style={{
                              background: "rgba(79,125,249,0.1)", color: "#4f7df9", border: "1px solid rgba(79,125,249,0.3)",
                              borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                            }}>Copy Link</button>
                            <a href={`https://wa.me/?text=${encodeURIComponent(`How well do you know me? 🔗 ${shareUrl}`)}`} target="_blank" rel="noopener" style={{
                              background: "rgba(37,211,102,0.1)", color: "#25d366", border: "1px solid rgba(37,211,102,0.3)",
                              borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center",
                            }}>Share</a>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {!user && (
          <Card style={{ textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔓</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 6 }}>Sign in to manage your tests</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>Create tests, track participants, and see how friends score</div>
            <a href="/auth" style={{
              background: "#4f7df9", color: "#fff", border: "none", borderRadius: 8,
              padding: "10px 24px", fontSize: 13, fontWeight: 600, textDecoration: "none",
            }}>Sign In</a>
          </Card>
        )}

        {/* How it works */}
        <Card style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 16, textAlign: "center" }}>How BondScore Works</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { emoji: "📝", title: "Create", desc: "Write 10 questions about yourself" },
              { emoji: "🔗", title: "Share", desc: "Send the link to friends" },
              { emoji: "🧠", title: "Answer", desc: "Friends answer your questions" },
              { emoji: "🎯", title: "Score", desc: "See how well they know you" },
            ].map(step => (
              <div key={step.title} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{step.emoji}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", marginBottom: 4 }}>{step.title}</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>{step.desc}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
