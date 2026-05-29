import { useState, useEffect } from "react";
import { useParams } from "wouter";

interface TestData {
  id: string;
  title: string;
  description: string;
  coverEmoji: string;
  slug: string;
  participantCount: number;
  questions: { id: string; questionText: string; orderIndex: number; answers: string[] }[];
  creator: { displayName: string; avatar: string | null; username: string };
}

export default function BondScoreTake() {
  const params = useParams<{ slug: string }>();
  const [test, setTest] = useState<TestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentQ, setCurrentQ] = useState(-1);
  const [answers, setAnswers] = useState<number[]>([]);
  const [calculating, setCalculating] = useState(false);
  const [calcProgress, setCalcProgress] = useState(0);
  const [shareId, setShareId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/bondscore/test/${params.slug}`)
      .then(r => r.json())
      .then(data => {
        if (data.message) setError(data.message);
        else setTest(data);
        setLoading(false);
      })
      .catch(() => { setError("Failed to load test"); setLoading(false); });
  }, [params.slug]);

  const selectAnswer = (answerIdx: number) => {
    const newAnswers = [...answers, answerIdx];
    setAnswers(newAnswers);

    if (test && newAnswers.length >= test.questions.length) {
      submitTest(newAnswers);
    } else {
      setTimeout(() => setCurrentQ(currentQ + 1), 300);
    }
  };

  const submitTest = async (selectedAnswers: number[]) => {
    setCalculating(true);
    let guestId = localStorage.getItem("bondscore_guest_id");
    if (!guestId) {
      guestId = "guest_" + Math.random().toString(36).slice(2, 12);
      localStorage.setItem("bondscore_guest_id", guestId);
    }

    const interval = setInterval(() => {
      setCalcProgress(p => Math.min(p + Math.random() * 15, 90));
    }, 200);

    try {
      const resp = await fetch("/api/bondscore/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId: test!.id, guestId, selectedAnswers }),
      });
      const data = await resp.json();
      clearInterval(interval);
      setCalcProgress(100);
      setTimeout(() => {
        setShareId(data.shareId);
        window.location.href = `/bondscore/result/${data.shareId}`;
      }, 800);
    } catch {
      clearInterval(interval);
      setError("Failed to submit");
      setCalculating(false);
    }
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#6b7280" }}>Loading test...</div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>😕</div>
        <div style={{ color: "#ef4444", fontSize: 15 }}>{error}</div>
        <a href="/bondscore" style={{ color: "#4f7df9", fontSize: 13, marginTop: 12, display: "block" }}>Go to BondScore</a>
      </div>
    </div>
  );

  if (!test) return null;

  if (calculating) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0b10", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ position: "relative", width: 120, height: 120, margin: "0 auto 24px" }}>
            <svg width={120} height={120} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={60} cy={60} r={52} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={8} />
              <circle cx={60} cy={60} r={52} fill="none" stroke="#4f7df9" strokeWidth={8}
                strokeDasharray={327} strokeDashoffset={327 - (calcProgress / 100) * 327}
                strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.3s ease" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: "#4f7df9" }}>{Math.round(calcProgress)}%</span>
            </div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Calculating your BondScore...</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>Analyzing your answers against {test.creator.displayName}'s responses</div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 20 }}>
            {["🔍", "🧠", "💡", "✨"].map((e, i) => (
              <span key={i} style={{
                fontSize: 20, opacity: calcProgress > i * 25 ? 1 : 0.2,
                transition: "opacity 0.5s ease", animationDelay: `${i * 0.2}s`,
              }}>{e}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (currentQ === -1) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0b10", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ textAlign: "center", maxWidth: 480 }}>
          <div style={{ fontSize: 72, marginBottom: 16 }}>{test.coverEmoji}</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginBottom: 8, lineHeight: 1.3 }} data-testid="text-test-title">{test.title}</h1>
          {test.description && <p style={{ color: "#9ca3af", fontSize: 14, marginBottom: 8 }}>{test.description}</p>}
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>
            Created by <span style={{ color: "#4f7df9" }}>{test.creator.displayName}</span> · {test.participantCount} participants · {test.questions.length} questions
          </div>
          <button onClick={() => setCurrentQ(0)} data-testid="button-start-test" style={{
            background: "linear-gradient(135deg,#4f7df9,#3b82f6)", color: "#fff", border: "none",
            borderRadius: 12, padding: "16px 48px", fontSize: 16, fontWeight: 700, cursor: "pointer",
          }}>Start Test →</button>
        </div>
      </div>
    );
  }

  const question = test.questions[currentQ];
  const progress = ((currentQ + 1) / test.questions.length) * 100;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ maxWidth: 520, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>Question {currentQ + 1} of {test.questions.length}</span>
          <span style={{ fontSize: 12, color: "#4f7df9", fontWeight: 600 }}>{Math.round(progress)}%</span>
        </div>
        <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2, marginBottom: 28, overflow: "hidden" }}>
          <div style={{ width: `${progress}%`, height: "100%", background: "#4f7df9", borderRadius: 2, transition: "width 0.4s ease" }} />
        </div>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", lineHeight: 1.4 }} data-testid="text-question">{question.questionText}</h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {question.answers.map((answer, ai) => (
            <button key={ai} onClick={() => selectAnswer(ai)} data-testid={`button-answer-${ai}`} style={{
              width: "100%", textAlign: "left", padding: "16px 20px", borderRadius: 12,
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
              color: "#e5e7eb", fontSize: 15, cursor: "pointer", transition: "all 0.2s ease",
            }}
            onMouseOver={e => { (e.target as HTMLElement).style.background = "rgba(79,125,249,0.1)"; (e.target as HTMLElement).style.borderColor = "rgba(79,125,249,0.3)"; }}
            onMouseOut={e => { (e.target as HTMLElement).style.background = "rgba(255,255,255,0.03)"; (e.target as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)"; }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", background: "rgba(79,125,249,0.1)", color: "#4f7df9", fontSize: 12, fontWeight: 700, marginRight: 12 }}>
                {String.fromCharCode(65 + ai)}
              </span>
              {answer}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
