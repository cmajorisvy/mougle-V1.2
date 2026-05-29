import { useState } from "react";
import { useLocation } from "wouter";

const EMOJIS = ["🔗", "💕", "🎯", "🧠", "⭐", "🎮", "🎵", "🌈", "🔥", "💎"];

interface Question {
  questionText: string;
  answers: string[];
  correctIndex: number;
}

function emptyQ(): Question {
  return { questionText: "", answers: ["", "", "", ""], correctIndex: 0 };
}

export default function BondScoreCreate() {
  const [, navigate] = useLocation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverEmoji, setCoverEmoji] = useState("🔗");
  const [questions, setQuestions] = useState<Question[]>([emptyQ()]);
  const [activeQ, setActiveQ] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [error, setError] = useState("");
  const [createdSlug, setCreatedSlug] = useState("");

  const user = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
  })();

  const updateQuestion = (idx: number, field: string, value: any) => {
    const updated = [...questions];
    if (field === "questionText") updated[idx].questionText = value;
    else if (field === "correctIndex") updated[idx].correctIndex = value;
    else if (field.startsWith("answer_")) {
      const ai = parseInt(field.split("_")[1]);
      updated[idx].answers[ai] = value;
    }
    setQuestions(updated);
  };

  const addQuestion = () => {
    if (questions.length >= 10) return;
    setQuestions([...questions, emptyQ()]);
    setActiveQ(questions.length);
  };

  const removeQuestion = (idx: number) => {
    if (questions.length <= 1) return;
    const updated = questions.filter((_, i) => i !== idx);
    setQuestions(updated);
    setActiveQ(Math.min(activeQ, updated.length - 1));
  };

  const generateAI = async () => {
    setAiLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/bondscore/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: aiTopic }),
      });
      const data = await resp.json();
      if (data.questions?.length) {
        setQuestions(data.questions.slice(0, 10));
        setActiveQ(0);
      }
    } catch { setError("AI generation failed"); }
    setAiLoading(false);
  };

  const handleSubmit = async () => {
    setError("");
    if (!title.trim()) return setError("Title is required");
    const valid = questions.filter(q => q.questionText.trim() && q.answers.every(a => a.trim()));
    if (valid.length < 1) return setError("At least 1 complete question required");
    if (!user?.id) return setError("Please sign in first");

    setSubmitting(true);
    try {
      const resp = await fetch("/api/bondscore/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creatorId: user.id, title, description, coverEmoji, questions: valid }),
      });
      const data = await resp.json();
      if (data.slug) setCreatedSlug(data.slug);
      else setError(data.message || "Failed to create test");
    } catch { setError("Network error"); }
    setSubmitting(false);
  };

  const shareUrl = createdSlug ? `${window.location.origin}/bondscore/${createdSlug}` : "";

  const copyLink = () => { navigator.clipboard.writeText(shareUrl); };

  if (createdSlug) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0b10", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ textAlign: "center", maxWidth: 480 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Test Created!</h1>
          <p style={{ color: "#9ca3af", fontSize: 14, marginBottom: 24 }}>Share this link with friends to see how well they know you</p>
          <div style={{ background: "#111318", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.1)", marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Share Link</div>
            <div style={{ fontSize: 14, color: "#4f7df9", wordBreak: "break-all" }} data-testid="text-share-url">{shareUrl}</div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={copyLink} data-testid="button-copy-link" style={{ background: "#4f7df9", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Copy Link</button>
            <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`How well do you know me? Take my BondScore test! ${shareUrl}`)}`} target="_blank" rel="noopener" style={{ background: "rgba(29,155,240,0.15)", color: "#1d9bf0", border: "1px solid rgba(29,155,240,0.3)", borderRadius: 8, padding: "10px 24px", fontSize: 13, fontWeight: 600, textDecoration: "none" }} data-testid="button-share-twitter">Twitter</a>
            <a href={`https://wa.me/?text=${encodeURIComponent(`How well do you know me? 🔗 Take my BondScore test! ${shareUrl}`)}`} target="_blank" rel="noopener" style={{ background: "rgba(37,211,102,0.15)", color: "#25d366", border: "1px solid rgba(37,211,102,0.3)", borderRadius: 8, padding: "10px 24px", fontSize: 13, fontWeight: 600, textDecoration: "none" }} data-testid="button-share-whatsapp">WhatsApp</a>
          </div>
          <div style={{ marginTop: 20 }}>
            <a href="/bondscore" style={{ color: "#6b7280", fontSize: 13, textDecoration: "none" }}>Back to Dashboard</a>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[activeQ];

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <a href="/bondscore" style={{ color: "#6b7280", fontSize: 13, textDecoration: "none" }}>← Back</a>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>Create BondScore Test</h1>
        </div>

        {error && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: 12, color: "#ef4444", fontSize: 13, marginBottom: 16 }}>{error}</div>}

        <div style={{ background: "#111318", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: 20, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase" }}>Emoji</label>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => setCoverEmoji(e)} style={{
                    width: 36, height: 36, borderRadius: 8, border: `1px solid ${coverEmoji === e ? "#4f7df9" : "rgba(255,255,255,0.06)"}`,
                    background: coverEmoji === e ? "rgba(79,125,249,0.1)" : "transparent", fontSize: 18, cursor: "pointer",
                  }}>{e}</button>
                ))}
              </div>
            </div>
          </div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Test title (e.g., How Well Do You Know Me?)" data-testid="input-title" style={{
            width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "12px 14px",
            color: "#fff", fontSize: 15, fontWeight: 600, outline: "none", marginBottom: 10, boxSizing: "border-box",
          }} />
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description (optional)" data-testid="input-description" style={{
            width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px",
            color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box",
          }} />
        </div>

        {/* AI Generator */}
        <div style={{ background: "#111318", borderRadius: 12, border: "1px solid rgba(168,85,247,0.2)", padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>✨</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#a855f7" }}>AI Question Generator</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={aiTopic} onChange={e => setAiTopic(e.target.value)} placeholder="Topic (optional): friendship, travel, food..." data-testid="input-ai-topic" style={{
              flex: 1, background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px",
              color: "#fff", fontSize: 13, outline: "none",
            }} />
            <button onClick={generateAI} disabled={aiLoading} data-testid="button-ai-generate" style={{
              background: "linear-gradient(135deg,#a855f7,#7c3aed)", color: "#fff", border: "none", borderRadius: 8,
              padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
            }}>{aiLoading ? "Generating..." : "Generate 10 Questions"}</button>
          </div>
        </div>

        {/* Question tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
          {questions.map((qq, i) => (
            <button key={i} onClick={() => setActiveQ(i)} data-testid={`tab-q-${i}`} style={{
              width: 36, height: 36, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: i === activeQ ? "rgba(79,125,249,0.15)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${i === activeQ ? "rgba(79,125,249,0.4)" : "rgba(255,255,255,0.06)"}`,
              color: i === activeQ ? "#4f7df9" : qq.questionText.trim() ? "#10b981" : "#6b7280",
            }}>{i + 1}</button>
          ))}
          {questions.length < 10 && (
            <button onClick={addQuestion} data-testid="button-add-question" style={{
              width: 36, height: 36, borderRadius: 8, fontSize: 16, cursor: "pointer",
              background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981",
            }}>+</button>
          )}
        </div>

        {/* Active Question Editor */}
        {q && (
          <div style={{ background: "#111318", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Question {activeQ + 1}</span>
              {questions.length > 1 && (
                <button onClick={() => removeQuestion(activeQ)} style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>Remove</button>
              )}
            </div>
            <input value={q.questionText} onChange={e => updateQuestion(activeQ, "questionText", e.target.value)} placeholder="Enter your question..." data-testid="input-question-text" style={{
              width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "12px 14px",
              color: "#fff", fontSize: 14, outline: "none", marginBottom: 12, boxSizing: "border-box",
            }} />
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>Answers (click the circle to mark YOUR answer)</div>
            {q.answers.map((a, ai) => (
              <div key={ai} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <button onClick={() => updateQuestion(activeQ, "correctIndex", ai)} data-testid={`radio-answer-${ai}`} style={{
                  width: 24, height: 24, borderRadius: "50%", border: `2px solid ${q.correctIndex === ai ? "#10b981" : "rgba(255,255,255,0.15)"}`,
                  background: q.correctIndex === ai ? "#10b981" : "transparent", cursor: "pointer", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12,
                }}>{q.correctIndex === ai ? "✓" : ""}</button>
                <input value={a} onChange={e => updateQuestion(activeQ, `answer_${ai}`, e.target.value)} placeholder={`Answer ${ai + 1}`} data-testid={`input-answer-${ai}`} style={{
                  flex: 1, background: "#0a0b10", border: `1px solid ${q.correctIndex === ai ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 13, outline: "none",
                }} />
              </div>
            ))}
          </div>
        )}

        <button onClick={handleSubmit} disabled={submitting} data-testid="button-create-test" style={{
          width: "100%", background: "linear-gradient(135deg,#4f7df9,#3b82f6)", color: "#fff", border: "none",
          borderRadius: 10, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer",
        }}>{submitting ? "Creating..." : `Create Test (${questions.filter(q => q.questionText.trim()).length} questions)`}</button>
      </div>
    </div>
  );
}
