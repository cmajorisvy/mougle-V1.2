import { useState, useEffect } from "react";
import { useParams } from "wouter";

interface ResultData {
  needsSignup: boolean;
  shareId: string;
  testId?: string;
  score?: number;
  totalQuestions?: number;
  test?: { title: string; description: string; coverEmoji: string; slug: string };
  creator?: { displayName: string; avatar: string | null; username: string };
  comparison?: { questionText: string; answers: string[]; creatorAnswer: number; takerAnswer: number; matched: boolean }[];
}

function ScoreRing({ score, size = 160 }: { score: number; size?: number }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const [offset, setOffset] = useState(circ);
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#4f7df9" : score >= 40 ? "#eab308" : "#ef4444";

  useEffect(() => {
    const timer = setTimeout(() => setOffset(circ - (score / 100) * circ), 200);
    return () => clearTimeout(timer);
  }, [score, circ]);

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={12} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={12}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 42, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }} data-testid="text-score">{score}%</div>
        <div style={{ fontSize: 11, color: "#6b7280" }}>BondScore</div>
      </div>
    </div>
  );
}

function getScoreLabel(score: number) {
  if (score >= 90) return { text: "Soulmates!", emoji: "💕" };
  if (score >= 70) return { text: "Best Friends!", emoji: "🤝" };
  if (score >= 50) return { text: "Good Friends", emoji: "😊" };
  if (score >= 30) return { text: "Getting There", emoji: "🌱" };
  return { text: "Just Met?", emoji: "👋" };
}

export default function BondScoreResult() {
  const params = useParams<{ shareId: string }>();
  const [result, setResult] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showComparison, setShowComparison] = useState(false);
  const [signupMode, setSignupMode] = useState(false);
  const [signupForm, setSignupForm] = useState({ username: "", email: "", password: "", displayName: "" });
  const [signupError, setSignupError] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const user = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
  })();

  const fetchResult = (userId?: string) => {
    const url = `/api/bondscore/result/${params.shareId}${userId ? `?userId=${userId}` : ""}`;
    fetch(url).then(r => r.json()).then(data => {
      setResult(data);
      setLoading(false);
      if (!data.needsSignup) {
        setTimeout(() => setRevealed(true), 500);
      }
    }).catch(() => setLoading(false));
  };

  useEffect(() => {
    if (user?.id) {
      fetch("/api/bondscore/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId: params.shareId, userId: user.id }),
      }).then(() => fetchResult(user.id)).catch(() => fetchResult(user.id));
    } else {
      fetchResult();
    }
  }, [params.shareId]);

  const handleSignup = async () => {
    setSignupError("");
    if (!signupForm.username || !signupForm.email || !signupForm.password) {
      return setSignupError("All fields required");
    }
    setSignupLoading(true);
    try {
      const resp = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...signupForm,
          displayName: signupForm.displayName || signupForm.username,
        }),
      });
      const data = await resp.json();
      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
        await fetch("/api/bondscore/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shareId: params.shareId, userId: data.user.id }),
        });
        fetchResult(data.user.id);
        setSignupMode(false);
      } else {
        setSignupError(data.message || "Signup failed");
      }
    } catch { setSignupError("Network error"); }
    setSignupLoading(false);
  };

  const handleSignin = async () => {
    setSignupError("");
    if (!signupForm.email || !signupForm.password) return setSignupError("Email and password required");
    setSignupLoading(true);
    try {
      const resp = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: signupForm.email, password: signupForm.password }),
      });
      const data = await resp.json();
      if (data.user) {
        localStorage.setItem("user", JSON.stringify(data.user));
        await fetch("/api/bondscore/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shareId: params.shareId, userId: data.user.id }),
        });
        fetchResult(data.user.id);
        setSignupMode(false);
      } else {
        setSignupError(data.message || "Sign in failed");
      }
    } catch { setSignupError("Network error"); }
    setSignupLoading(false);
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>
      Loading result...
    </div>
  );

  if (!result) return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#ef4444" }}>Result not found</div>
    </div>
  );

  if (result.needsSignup && !user) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0b10", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎯</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Your Score is Ready!</h1>
          <p style={{ color: "#9ca3af", fontSize: 14, marginBottom: 24 }}>Create a free account to see how well you know your friend</p>

          <div style={{ background: "#111318", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", padding: 24, textAlign: "left" }}>
            {signupError && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: 10, color: "#ef4444", fontSize: 12, marginBottom: 12 }}>{signupError}</div>}

            {!signupMode ? (
              <>
                <input value={signupForm.username} onChange={e => setSignupForm({ ...signupForm, username: e.target.value })} placeholder="Username" data-testid="input-signup-username" style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", marginBottom: 8, boxSizing: "border-box" }} />
                <input value={signupForm.displayName} onChange={e => setSignupForm({ ...signupForm, displayName: e.target.value })} placeholder="Display Name (optional)" data-testid="input-signup-display" style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", marginBottom: 8, boxSizing: "border-box" }} />
                <input value={signupForm.email} onChange={e => setSignupForm({ ...signupForm, email: e.target.value })} placeholder="Email" type="email" data-testid="input-signup-email" style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", marginBottom: 8, boxSizing: "border-box" }} />
                <input value={signupForm.password} onChange={e => setSignupForm({ ...signupForm, password: e.target.value })} placeholder="Password" type="password" data-testid="input-signup-password" style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", marginBottom: 12, boxSizing: "border-box" }} />
                <button onClick={handleSignup} disabled={signupLoading} data-testid="button-signup" style={{ width: "100%", background: "linear-gradient(135deg,#4f7df9,#3b82f6)", color: "#fff", border: "none", borderRadius: 10, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>{signupLoading ? "Creating..." : "Sign Up & Reveal Score"}</button>
                <button onClick={() => setSignupMode(true)} style={{ width: "100%", background: "transparent", color: "#6b7280", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px", fontSize: 13, cursor: "pointer" }}>Already have an account? Sign In</button>
              </>
            ) : (
              <>
                <input value={signupForm.email} onChange={e => setSignupForm({ ...signupForm, email: e.target.value })} placeholder="Email" type="email" data-testid="input-signin-email" style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", marginBottom: 8, boxSizing: "border-box" }} />
                <input value={signupForm.password} onChange={e => setSignupForm({ ...signupForm, password: e.target.value })} placeholder="Password" type="password" data-testid="input-signin-password" style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "12px 14px", color: "#fff", fontSize: 14, outline: "none", marginBottom: 12, boxSizing: "border-box" }} />
                <button onClick={handleSignin} disabled={signupLoading} data-testid="button-signin" style={{ width: "100%", background: "linear-gradient(135deg,#4f7df9,#3b82f6)", color: "#fff", border: "none", borderRadius: 10, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 8 }}>{signupLoading ? "Signing in..." : "Sign In & Reveal Score"}</button>
                <button onClick={() => setSignupMode(false)} style={{ width: "100%", background: "transparent", color: "#6b7280", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px", fontSize: 13, cursor: "pointer" }}>Create New Account</button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const score = result.score || 0;
  const label = getScoreLabel(score);
  const shareUrl = `${window.location.origin}/bondscore/result/${result.shareId}`;
  const shareText = `I scored ${score}% on ${result.test?.title || "a BondScore test"}! ${label.emoji} How well do you know your friend?`;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ maxWidth: 520, width: "100%" }}>
        {/* Score Card */}
        <div style={{
          background: "linear-gradient(135deg, rgba(79,125,249,0.08), rgba(168,85,247,0.08))",
          borderRadius: 16, border: "1px solid rgba(79,125,249,0.15)", padding: 32, textAlign: "center", marginBottom: 16,
          opacity: revealed ? 1 : 0, transform: revealed ? "scale(1)" : "scale(0.8)",
          transition: "all 0.6s cubic-bezier(0.4,0,0.2,1)",
        }}>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>
            {result.test?.coverEmoji} {result.test?.title}
          </div>
          <div style={{ fontSize: 12, color: "#4f7df9", marginBottom: 20 }}>
            by {result.creator?.displayName}
          </div>

          <ScoreRing score={score} />

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>{label.emoji}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{label.text}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              You matched {result.comparison?.filter(c => c.matched).length || 0} of {result.totalQuestions} answers
            </div>
          </div>
        </div>

        {/* Social Sharing */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => navigator.clipboard.writeText(shareUrl)} data-testid="button-copy-result" style={{
            background: "rgba(255,255,255,0.05)", color: "#e5e7eb", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>Copy Link</button>
          <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener" data-testid="button-share-twitter" style={{
            background: "rgba(29,155,240,0.15)", color: "#1d9bf0", border: "1px solid rgba(29,155,240,0.3)",
            borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none",
          }}>Twitter</a>
          <a href={`https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`} target="_blank" rel="noopener" data-testid="button-share-whatsapp" style={{
            background: "rgba(37,211,102,0.15)", color: "#25d366", border: "1px solid rgba(37,211,102,0.3)",
            borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none",
          }}>WhatsApp</a>
          <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener" data-testid="button-share-facebook" style={{
            background: "rgba(66,103,178,0.15)", color: "#4267B2", border: "1px solid rgba(66,103,178,0.3)",
            borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none",
          }}>Facebook</a>
        </div>

        {/* Answer Comparison */}
        <div style={{ background: "#111318", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <button onClick={() => setShowComparison(!showComparison)} data-testid="button-toggle-comparison" style={{
            width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 20px", background: "transparent", border: "none", color: "#e5e7eb", cursor: "pointer",
          }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Answer Comparison</span>
            <span style={{ fontSize: 12, color: "#6b7280" }}>{showComparison ? "▲" : "▼"}</span>
          </button>
          {showComparison && result.comparison && (
            <div style={{ padding: "0 20px 20px" }}>
              {result.comparison.map((c, i) => (
                <div key={i} style={{ padding: "12px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 14 }}>{c.matched ? "✅" : "❌"}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{c.questionText}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginLeft: 26 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>Their Answer</div>
                      <div style={{ fontSize: 12, color: "#10b981", padding: "6px 10px", background: "rgba(16,185,129,0.06)", borderRadius: 6 }}>
                        {c.answers[c.creatorAnswer]}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>Your Answer</div>
                      <div style={{ fontSize: 12, color: c.matched ? "#10b981" : "#ef4444", padding: "6px 10px", background: c.matched ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)", borderRadius: 6 }}>
                        {c.answers[c.takerAnswer]}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <a href="/bondscore" style={{ color: "#4f7df9", fontSize: 13, textDecoration: "none" }}>Create Your Own BondScore Test →</a>
        </div>
      </div>
    </div>
  );
}
