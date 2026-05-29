import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-500/20 text-blue-400",
  IN_PROGRESS: "bg-yellow-500/20 text-yellow-400",
  WAITING_USER: "bg-purple-500/20 text-purple-400",
  RESOLVED: "bg-green-500/20 text-green-400",
  CLOSED: "bg-gray-500/20 text-gray-400",
};

const CATEGORIES = ["general", "billing", "technical", "account", "feature_request", "bug_report"];

type ChatMsg = { role: string; content: string; sources?: { id: string; title: string }[]; preventiveHelp?: string };

export default function Support() {
  const [tab, setTab] = useState<"chat" | "kb" | "tickets" | "new">("chat");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "Hi! I'm the Mougle support assistant, powered by our knowledge base. How can I help you today?" },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [preventiveHelps, setPreventiveHelps] = useState<string[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [newTicket, setNewTicket] = useState({ subject: "", description: "", category: "general", priority: "medium" });
  const [autoCategory, setAutoCategory] = useState<{ category: string; intent: string; suggestedPriority: string } | null>(null);

  const [replyInput, setReplyInput] = useState("");

  const { data: tickets = [] } = useQuery({ queryKey: ["/support/tickets"], queryFn: () => api.support.getTickets() });
  const { data: ticketMessages = [] } = useQuery({
    queryKey: ["/support/tickets", selectedTicket, "messages"],
    queryFn: () => api.support.getMessages(selectedTicket!),
    enabled: !!selectedTicket,
  });
  const { data: kbArticles = [] } = useQuery({ queryKey: ["/support/kb/articles"], queryFn: () => api.support.kbArticles() });

  const createTicketMutation = useMutation({
    mutationFn: (data: typeof newTicket) => api.support.createTicket(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/support/tickets"] });
      setNewTicket({ subject: "", description: "", category: "general", priority: "medium" });
      setAutoCategory(null);
      setTab("tickets");
    },
  });

  const addMessageMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => api.support.addMessage(id, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/support/tickets", selectedTicket, "messages"] }),
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    api.support.preventiveHelp("visiting support page").then(r => {
      if (r.prompts?.length) setPreventiveHelps(r.prompts);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (newTicket.subject.length > 5 && newTicket.description.length > 10) {
      const t = setTimeout(() => {
        api.support.classify(newTicket.subject, newTicket.description).then(r => {
          setAutoCategory(r);
          setNewTicket(prev => ({ ...prev, category: r.category, priority: r.suggestedPriority }));
        }).catch(() => {});
      }, 800);
      return () => clearTimeout(t);
    }
  }, [newTicket.subject, newTicket.description]);

  async function handleChat() {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatMessages(prev => [...prev, { role: "user", content: msg }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const result = await api.support.chat(msg);
      setChatMessages(prev => [...prev, {
        role: "assistant",
        content: result.reply,
        sources: result.sources,
        preventiveHelp: result.preventiveHelp,
      }]);
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Sorry, I'm having trouble connecting. Please try again or create a support ticket." }]);
    }
    setChatLoading(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ marginBottom: 24, textAlign: "center" }}>
          <h1 data-testid="text-page-title" style={{ fontSize: 28, fontWeight: 700, color: "#fff", margin: 0 }}>Support Center</h1>
          <p style={{ color: "#6b7280", fontSize: 14, marginTop: 8 }}>AI-powered help that learns from every resolved issue</p>
        </div>

        {preventiveHelps.length > 0 && tab === "chat" && (
          <div data-testid="section-preventive-help" style={{ background: "#12141e", border: "1px solid rgba(79,125,249,0.15)", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
            <p style={{ color: "#4f7df9", fontSize: 11, fontWeight: 600, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>Quick Help</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {preventiveHelps.map((h, i) => (
                <button
                  key={i}
                  data-testid={`button-preventive-help-${i}`}
                  onClick={() => { setChatInput(h); }}
                  style={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "6px 12px", color: "#9ca3af", fontSize: 12, cursor: "pointer" }}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 24, justifyContent: "center" }}>
          {(["chat", "kb", "tickets", "new"] as const).map(t => (
            <button
              key={t}
              data-testid={`button-tab-${t}`}
              onClick={() => { setTab(t); setSelectedTicket(null); }}
              style={{
                padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                background: tab === t ? "linear-gradient(135deg,#4f7df9,#8b5cf6)" : "#1a1d27",
                color: tab === t ? "#fff" : "#9ca3af",
              }}
            >
              {t === "chat" ? "AI Assistant" : t === "kb" ? "Knowledge Base" : t === "tickets" ? "My Tickets" : "New Ticket"}
            </button>
          ))}
        </div>

        {tab === "chat" && (
          <div data-testid="section-chat" style={{ background: "#12141e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ height: 420, overflowY: "auto", padding: 20 }}>
              {chatMessages.map((m, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                    <div
                      data-testid={`text-chat-message-${i}`}
                      style={{
                        maxWidth: "75%", padding: "12px 16px", borderRadius: 12, fontSize: 13, lineHeight: 1.6,
                        background: m.role === "user" ? "#4f7df9" : "#1a1d27",
                        color: m.role === "user" ? "#fff" : "#e5e7eb",
                      }}
                    >
                      {m.content}
                    </div>
                  </div>
                  {m.sources && m.sources.length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginTop: 4, justifyContent: "flex-start", flexWrap: "wrap" }}>
                      {m.sources.map((s, si) => (
                        <span key={si} data-testid={`text-source-${i}-${si}`} style={{ background: "#1a2435", border: "1px solid rgba(79,125,249,0.2)", borderRadius: 6, padding: "3px 8px", color: "#4f7df9", fontSize: 10 }}>
                          KB: {s.title}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.preventiveHelp && (
                    <div style={{ marginTop: 6, display: "flex", justifyContent: "flex-start" }}>
                      <div style={{ background: "#1a2e1a", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, padding: "8px 12px", maxWidth: "75%" }}>
                        <p style={{ color: "#10b981", fontSize: 11, margin: 0 }}>{m.preventiveHelp}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
                  <div style={{ background: "#1a1d27", padding: "12px 16px", borderRadius: 12, color: "#6b7280", fontSize: 13 }}>Searching knowledge base...</div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: 16, display: "flex", gap: 8 }}>
              <input
                data-testid="input-chat"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleChat()}
                placeholder="Ask anything about Mougle..."
                style={{ flex: 1, background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#e5e7eb", fontSize: 13 }}
              />
              <button
                data-testid="button-send-chat"
                onClick={handleChat}
                disabled={chatLoading}
                style={{ background: "linear-gradient(135deg,#4f7df9,#8b5cf6)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
              >
                Send
              </button>
            </div>
            <div style={{ padding: "0 16px 12px", textAlign: "center" }}>
              <button data-testid="button-create-ticket-from-chat" onClick={() => setTab("new")} style={{ background: "none", border: "none", color: "#4f7df9", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
                Can't find what you need? Create a support ticket
              </button>
            </div>
          </div>
        )}

        {tab === "kb" && (
          <div data-testid="section-kb">
            {kbArticles.length === 0 ? (
              <div style={{ background: "#12141e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 40, textAlign: "center" }}>
                <p style={{ color: "#6b7280", fontSize: 14 }}>No knowledge base articles yet. Our AI is learning from resolved tickets!</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {kbArticles.map((a: any) => (
                  <div key={a.id} data-testid={`card-kb-${a.id}`} style={{ background: "#12141e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ color: "#e5e7eb", fontSize: 15, fontWeight: 600, margin: 0 }}>{a.title}</p>
                        <p style={{ color: "#6b7280", fontSize: 11, margin: "4px 0 8px" }}>{a.category} &middot; {a.viewCount} views &middot; {a.helpfulCount} found helpful</p>
                        <p style={{ color: "#9ca3af", fontSize: 13, margin: "0 0 8px", lineHeight: 1.5 }}><strong style={{ color: "#e5e7eb" }}>Problem:</strong> {a.problem}</p>
                        <p style={{ color: "#9ca3af", fontSize: 13, margin: 0, lineHeight: 1.5 }}><strong style={{ color: "#10b981" }}>Solution:</strong> {a.solution}</p>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        data-testid={`button-helpful-${a.id}`}
                        onClick={() => api.support.kbMarkHelpful(a.id)}
                        style={{ background: "#1a2e1a", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, padding: "5px 12px", color: "#10b981", fontSize: 11, cursor: "pointer" }}
                      >
                        Helpful
                      </button>
                      {a.tags?.map((t: string, ti: number) => (
                        <span key={ti} style={{ background: "#1a1d27", borderRadius: 6, padding: "3px 8px", color: "#6b7280", fontSize: 10 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "tickets" && !selectedTicket && (
          <div data-testid="section-tickets">
            {tickets.length === 0 ? (
              <div style={{ background: "#12141e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 40, textAlign: "center" }}>
                <p style={{ color: "#6b7280", fontSize: 14 }}>No tickets yet. Use the AI assistant or create a new ticket.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {tickets.map((t: any) => (
                  <button
                    key={t.id}
                    data-testid={`card-ticket-${t.id}`}
                    onClick={() => setSelectedTicket(t.id)}
                    style={{ background: "#12141e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 20px", cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <div>
                      <p style={{ color: "#e5e7eb", fontSize: 14, fontWeight: 600, margin: 0 }}>{t.subject}</p>
                      <p style={{ color: "#6b7280", fontSize: 11, margin: "4px 0 0" }}>#{t.id.slice(0, 8)} &middot; {t.category} &middot; {new Date(t.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className={STATUS_COLORS[t.status] || ""} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6 }}>{t.status.replace("_", " ")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "tickets" && selectedTicket && (
          <div data-testid="section-ticket-detail">
            <button data-testid="button-back-tickets" onClick={() => setSelectedTicket(null)} style={{ background: "none", border: "none", color: "#4f7df9", fontSize: 13, cursor: "pointer", marginBottom: 16 }}>&larr; Back to tickets</button>
            <div style={{ background: "#12141e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
              <div style={{ maxHeight: 400, overflowY: "auto", padding: 20 }}>
                {ticketMessages.map((m: any, i: number) => (
                  <div key={i} style={{ display: "flex", justifyContent: m.senderType === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
                    <div style={{ maxWidth: "75%", padding: "12px 16px", borderRadius: 12, fontSize: 13, lineHeight: 1.6, background: m.senderType === "user" ? "#4f7df9" : "#1a1d27", color: "#e5e7eb" }}>
                      <p style={{ color: "#9ca3af", fontSize: 10, margin: "0 0 4px" }}>{m.senderName}</p>
                      <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.content}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: 16, display: "flex", gap: 8 }}>
                <input
                  data-testid="input-ticket-reply"
                  value={replyInput}
                  onChange={e => setReplyInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && replyInput.trim()) { addMessageMutation.mutate({ id: selectedTicket, content: replyInput.trim() }); setReplyInput(""); } }}
                  placeholder="Type your reply..."
                  style={{ flex: 1, background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#e5e7eb", fontSize: 13 }}
                />
                <button
                  data-testid="button-send-reply"
                  onClick={() => { if (replyInput.trim()) { addMessageMutation.mutate({ id: selectedTicket, content: replyInput.trim() }); setReplyInput(""); } }}
                  style={{ background: "linear-gradient(135deg,#4f7df9,#8b5cf6)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "new" && (
          <div data-testid="section-new-ticket" style={{ background: "#12141e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 28 }}>
            <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 600, margin: "0 0 20px" }}>Create Support Ticket</h2>
            {autoCategory && (
              <div data-testid="text-auto-classify" style={{ background: "#1a2435", border: "1px solid rgba(79,125,249,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
                <p style={{ color: "#4f7df9", fontSize: 11, margin: 0 }}>
                  AI classified: <strong>{autoCategory.category}</strong> ({autoCategory.intent}) — Priority: <strong>{autoCategory.suggestedPriority}</strong>
                </p>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ color: "#9ca3af", fontSize: 12, display: "block", marginBottom: 6 }}>Subject</label>
                <input
                  data-testid="input-ticket-subject"
                  value={newTicket.subject}
                  onChange={e => setNewTicket({ ...newTicket, subject: e.target.value })}
                  placeholder="Brief summary of your issue"
                  style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#e5e7eb", fontSize: 13 }}
                />
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: "#9ca3af", fontSize: 12, display: "block", marginBottom: 6 }}>Category {autoCategory && <span style={{ color: "#4f7df9" }}>(auto)</span>}</label>
                  <select data-testid="select-ticket-category" value={newTicket.category} onChange={e => setNewTicket({ ...newTicket, category: e.target.value })} style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#e5e7eb", fontSize: 13 }}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: "#9ca3af", fontSize: 12, display: "block", marginBottom: 6 }}>Priority {autoCategory && <span style={{ color: "#4f7df9" }}>(auto)</span>}</label>
                  <select data-testid="select-ticket-priority" value={newTicket.priority} onChange={e => setNewTicket({ ...newTicket, priority: e.target.value })} style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#e5e7eb", fontSize: 13 }}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ color: "#9ca3af", fontSize: 12, display: "block", marginBottom: 6 }}>Description</label>
                <textarea data-testid="input-ticket-description" value={newTicket.description} onChange={e => setNewTicket({ ...newTicket, description: e.target.value })} placeholder="Describe your issue in detail..." rows={5} style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#e5e7eb", fontSize: 13, resize: "vertical" }} />
              </div>
              <button
                data-testid="button-submit-ticket"
                onClick={() => { if (newTicket.subject && newTicket.description) createTicketMutation.mutate(newTicket); }}
                disabled={createTicketMutation.isPending || !newTicket.subject || !newTicket.description}
                style={{ background: "linear-gradient(135deg,#4f7df9,#8b5cf6)", color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 600, fontSize: 14, cursor: "pointer", alignSelf: "flex-start", opacity: (!newTicket.subject || !newTicket.description) ? 0.5 : 1 }}
              >
                {createTicketMutation.isPending ? "Creating..." : "Submit Ticket"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
