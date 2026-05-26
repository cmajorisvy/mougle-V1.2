import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

const STATUS_COLORS: Record<string, string> = {
  OPEN: "#3b82f6",
  IN_PROGRESS: "#eab308",
  WAITING_USER: "#a855f7",
  RESOLVED: "#10b981",
  CLOSED: "#6b7280",
};

const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"];
const EMAIL_TYPES = ["welcome", "verification", "account_verified", "purchase", "invoice", "policy", "admin_alert", "password_reset", "ticket_reply", "ticket_created"];

export default function SupportDashboard() {
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [aiDraft, setAiDraft] = useState("");
  const [replyText, setReplyText] = useState("");
  const [emailTestTab, setEmailTestTab] = useState(false);
  const [testEmail, setTestEmail] = useState({ type: "welcome", to: "", displayName: "" });

  const { data: stats } = useQuery({ queryKey: ["/admin/support/stats"], queryFn: () => api.adminSupport.getStats() });
  const { data: tickets = [] } = useQuery({
    queryKey: ["/admin/support/tickets", statusFilter],
    queryFn: () => api.adminSupport.getTickets(statusFilter || undefined),
  });
  const { data: messages = [] } = useQuery({
    queryKey: ["/admin/support/tickets", selectedTicket, "messages"],
    queryFn: () => api.adminSupport.getMessages(selectedTicket!),
    enabled: !!selectedTicket,
  });
  const selectedTicketData = tickets.find((t: any) => t.id === selectedTicket);

  const replyMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => api.adminSupport.reply(id, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/admin/support/tickets", selectedTicket, "messages"] });
      setReplyText("");
      setAiDraft("");
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.adminSupport.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/admin/support/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/admin/support/stats"] });
    },
  });

  const aiReplyMutation = useMutation({
    mutationFn: (id: string) => api.adminSupport.generateAiReply(id),
    onSuccess: (data) => {
      setAiDraft(data.reply);
      setReplyText(data.reply);
    },
  });

  const emailTestMutation = useMutation({
    mutationFn: (d: typeof testEmail) => api.adminSupport.testEmail(d.type, d.to, d.displayName),
  });

  const seedDemoMutation = useMutation({
    mutationFn: () => api.adminSupport.seedDemo(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/admin/support/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/admin/support/stats"] });
    },
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <h1 data-testid="text-page-title" style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: 0 }}>Support Dashboard</h1>
            <p style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>Manage tickets, generate AI replies, test emails</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              data-testid="button-seed-demo"
              onClick={() => seedDemoMutation.mutate()}
              disabled={seedDemoMutation.isPending}
              style={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 16px", color: "#10b981", fontSize: 12, cursor: "pointer" }}
            >
              {seedDemoMutation.isPending ? "Seeding..." : "Seed Demo Tickets"}
            </button>
            <button
              data-testid="button-toggle-email-test"
              onClick={() => setEmailTestTab(!emailTestTab)}
              style={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 16px", color: "#9ca3af", fontSize: 12, cursor: "pointer" }}
            >
              {emailTestTab ? "Show Tickets" : "Email Tester"}
            </button>
          </div>
        </div>

        {stats && (
          <div data-testid="section-stats" style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8, marginBottom: 24 }}>
            {[
              { label: "Total", value: stats.total, color: "#e5e7eb" },
              { label: "Open", value: stats.open, color: STATUS_COLORS.OPEN },
              { label: "In Progress", value: stats.inProgress, color: STATUS_COLORS.IN_PROGRESS },
              { label: "Waiting", value: stats.waitingUser, color: STATUS_COLORS.WAITING_USER },
              { label: "Resolved", value: stats.resolved, color: STATUS_COLORS.RESOLVED },
              { label: "Closed", value: stats.closed, color: STATUS_COLORS.CLOSED },
            ].map((s) => (
              <div key={s.label} style={{ background: "#12141e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 16px", textAlign: "center" }}>
                <p style={{ color: s.color, fontSize: 22, fontWeight: 700, margin: 0 }}>{s.value}</p>
                <p style={{ color: "#6b7280", fontSize: 11, margin: "4px 0 0" }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {emailTestTab ? (
          <div data-testid="section-email-test" style={{ background: "#12141e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 28 }}>
            <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 600, margin: "0 0 20px" }}>Email Template Tester</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ color: "#9ca3af", fontSize: 12, display: "block", marginBottom: 6 }}>Template</label>
                <select
                  data-testid="select-email-type"
                  value={testEmail.type}
                  onChange={(e) => setTestEmail({ ...testEmail, type: e.target.value })}
                  style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#e5e7eb", fontSize: 13 }}
                >
                  {EMAIL_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace("_", " ")}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: "#9ca3af", fontSize: 12, display: "block", marginBottom: 6 }}>Recipient Email</label>
                  <input
                    data-testid="input-test-email"
                    value={testEmail.to}
                    onChange={(e) => setTestEmail({ ...testEmail, to: e.target.value })}
                    placeholder="user@example.com"
                    style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#e5e7eb", fontSize: 13 }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: "#9ca3af", fontSize: 12, display: "block", marginBottom: 6 }}>Display Name</label>
                  <input
                    data-testid="input-test-name"
                    value={testEmail.displayName}
                    onChange={(e) => setTestEmail({ ...testEmail, displayName: e.target.value })}
                    placeholder="John Doe"
                    style={{ width: "100%", background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#e5e7eb", fontSize: 13 }}
                  />
                </div>
              </div>
              <button
                data-testid="button-send-test-email"
                onClick={() => emailTestMutation.mutate(testEmail)}
                disabled={emailTestMutation.isPending || !testEmail.to || !testEmail.displayName}
                style={{
                  background: "linear-gradient(135deg,#4f7df9,#8b5cf6)", color: "#fff", border: "none", borderRadius: 10,
                  padding: "10px 24px", fontWeight: 600, fontSize: 13, cursor: "pointer", alignSelf: "flex-start",
                }}
              >
                {emailTestMutation.isPending ? "Sending..." : "Send Test Email"}
              </button>
              {emailTestMutation.isSuccess && (
                <p data-testid="text-email-success" style={{ color: "#10b981", fontSize: 13 }}>Email sent successfully!</p>
              )}
              {emailTestMutation.isError && (
                <p data-testid="text-email-error" style={{ color: "#ef4444", fontSize: 13 }}>Failed to send email. Check Resend configuration.</p>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: selectedTicket ? "320px 1fr" : "1fr", gap: 16 }}>
            <div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                <button
                  data-testid="button-filter-all"
                  onClick={() => setStatusFilter("")}
                  style={{
                    padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                    background: !statusFilter ? "#4f7df9" : "#1a1d27", color: !statusFilter ? "#fff" : "#9ca3af",
                  }}
                >
                  All
                </button>
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    data-testid={`button-filter-${s}`}
                    onClick={() => setStatusFilter(s)}
                    style={{
                      padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                      background: statusFilter === s ? STATUS_COLORS[s] : "#1a1d27",
                      color: statusFilter === s ? "#fff" : "#9ca3af",
                    }}
                  >
                    {s.replace("_", " ")}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {tickets.map((t: any) => (
                  <button
                    key={t.id}
                    data-testid={`card-admin-ticket-${t.id}`}
                    onClick={() => { setSelectedTicket(t.id); setAiDraft(""); setReplyText(""); }}
                    style={{
                      background: selectedTicket === t.id ? "#1a1d27" : "#12141e",
                      border: `1px solid ${selectedTicket === t.id ? "rgba(79,125,249,0.3)" : "rgba(255,255,255,0.06)"}`,
                      borderRadius: 10, padding: "12px 14px", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <p style={{ color: "#e5e7eb", fontSize: 13, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{t.subject}</p>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 4, color: "#fff", background: STATUS_COLORS[t.status] }}>{t.status}</span>
                    </div>
                    <p style={{ color: "#6b7280", fontSize: 10, margin: "4px 0 0" }}>{t.userName} &middot; {t.category} &middot; {t.priority}</p>
                  </button>
                ))}
                {tickets.length === 0 && (
                  <p style={{ color: "#6b7280", fontSize: 13, textAlign: "center", padding: 20 }}>No tickets found</p>
                )}
              </div>
            </div>

            {selectedTicket && selectedTicketData && (
              <div style={{ background: "#12141e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p data-testid="text-ticket-subject" style={{ color: "#fff", fontSize: 15, fontWeight: 600, margin: 0 }}>{selectedTicketData.subject}</p>
                    <p style={{ color: "#6b7280", fontSize: 11, margin: "4px 0 0" }}>
                      #{selectedTicketData.id.slice(0, 8)} &middot; {selectedTicketData.userName} &middot; {selectedTicketData.userEmail}
                    </p>
                  </div>
                  <select
                    data-testid="select-ticket-status"
                    value={selectedTicketData.status}
                    onChange={(e) => statusMutation.mutate({ id: selectedTicket, status: e.target.value })}
                    style={{ background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 10px", color: "#e5e7eb", fontSize: 12 }}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s.replace("_", " ")}</option>
                    ))}
                  </select>
                </div>

                <div style={{ maxHeight: 320, overflowY: "auto", padding: 20 }}>
                  {messages.map((m: any, i: number) => (
                    <div key={i} style={{ display: "flex", justifyContent: m.senderType === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
                      <div style={{
                        maxWidth: "75%", padding: "12px 16px", borderRadius: 12, fontSize: 13, lineHeight: 1.6,
                        background: m.senderType === "user" ? "#1a1d27" : m.isAiGenerated ? "#1a2435" : "#0a0b10",
                        border: m.isAiGenerated ? "1px solid rgba(79,125,249,0.2)" : "none",
                      }}>
                        <p style={{ color: "#6b7280", fontSize: 10, margin: "0 0 4px" }}>
                          {m.senderName} {m.isAiGenerated ? "(AI)" : ""} {m.emailSent ? "- emailed" : ""}
                        </p>
                        <p style={{ color: "#e5e7eb", margin: 0, whiteSpace: "pre-wrap" }}>{m.content}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: 16 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <button
                      data-testid="button-ai-reply"
                      onClick={() => aiReplyMutation.mutate(selectedTicket)}
                      disabled={aiReplyMutation.isPending}
                      style={{
                        background: "#1a2435", border: "1px solid rgba(79,125,249,0.2)", borderRadius: 8,
                        padding: "6px 14px", color: "#4f7df9", fontSize: 11, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      {aiReplyMutation.isPending ? "Generating..." : "Generate AI Reply"}
                    </button>
                    {aiDraft && (
                      <span style={{ color: "#6b7280", fontSize: 11, alignSelf: "center" }}>AI draft loaded — review and send</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <textarea
                      data-testid="input-admin-reply"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type your reply or use AI to generate one..."
                      rows={3}
                      style={{ flex: 1, background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#e5e7eb", fontSize: 13, resize: "vertical" }}
                    />
                    <button
                      data-testid="button-send-admin-reply"
                      onClick={() => {
                        if (replyText.trim()) replyMutation.mutate({ id: selectedTicket, content: replyText.trim() });
                      }}
                      disabled={replyMutation.isPending || !replyText.trim()}
                      style={{
                        background: "linear-gradient(135deg,#4f7df9,#8b5cf6)", color: "#fff", border: "none", borderRadius: 10,
                        padding: "10px 20px", fontWeight: 600, fontSize: 13, cursor: "pointer", alignSelf: "flex-end",
                      }}
                    >
                      {replyMutation.isPending ? "Sending..." : "Send & Email"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
