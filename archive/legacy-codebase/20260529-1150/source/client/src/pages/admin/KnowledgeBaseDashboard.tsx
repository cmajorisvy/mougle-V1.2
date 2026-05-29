import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  draft: { bg: "#eab308", color: "#fff" },
  published: { bg: "#10b981", color: "#fff" },
  rejected: { bg: "#ef4444", color: "#fff" },
};

export default function KnowledgeBaseDashboard() {
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<any>({});

  const { data: stats } = useQuery({ queryKey: ["/admin/kb/stats"], queryFn: () => api.adminKB.getStats() });
  const { data: articles = [] } = useQuery({
    queryKey: ["/admin/kb/articles", statusFilter],
    queryFn: () => api.adminKB.getArticles(statusFilter || undefined),
  });
  const { data: solutions = [] } = useQuery({
    queryKey: ["/admin/kb/solutions"],
    queryFn: () => api.adminKB.getSolutions(),
  });
  const { data: tickets = [] } = useQuery({
    queryKey: ["/admin/support/tickets"],
    queryFn: () => api.adminSupport.getTickets(),
  });

  const resolvedTickets = tickets.filter((t: any) => t.status === "RESOLVED" || t.status === "CLOSED");
  const selectedArticleData = articles.find((a: any) => a.id === selectedArticle);

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.adminKB.approveArticle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/admin/kb"] });
      queryClient.invalidateQueries({ queryKey: ["/admin/kb/stats"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.adminKB.rejectArticle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/admin/kb"] });
      queryClient.invalidateQueries({ queryKey: ["/admin/kb/stats"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.adminKB.updateArticle(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/admin/kb"] });
      setEditMode(false);
    },
  });

  const extractMutation = useMutation({
    mutationFn: (ticketId: string) => api.adminKB.extractSolution(ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/admin/kb"] });
      queryClient.invalidateQueries({ queryKey: ["/admin/kb/stats"] });
    },
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b10", color: "#e5e7eb" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 data-testid="text-page-title" style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: 0 }}>Zero-Support Learning System</h1>
          <p style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>AI learns from resolved tickets to reduce support workload</p>
        </div>

        {stats && (
          <div data-testid="section-stats" style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8, marginBottom: 24 }}>
            {[
              { label: "KB Articles", value: stats.totalArticles, color: "#e5e7eb" },
              { label: "Published", value: stats.published, color: "#10b981" },
              { label: "Drafts", value: stats.drafts, color: "#eab308" },
              { label: "Solutions", value: stats.totalSolutions, color: "#4f7df9" },
              { label: "Total Views", value: stats.totalViews, color: "#a855f7" },
              { label: "Helpful", value: stats.totalHelpful, color: "#10b981" },
            ].map(s => (
              <div key={s.label} style={{ background: "#12141e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 16px", textAlign: "center" }}>
                <p style={{ color: s.color, fontSize: 22, fontWeight: 700, margin: 0 }}>{s.value}</p>
                <p style={{ color: "#6b7280", fontSize: 11, margin: "4px 0 0" }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: selectedArticle ? "350px 1fr" : "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 600, margin: 0 }}>KB Articles</h2>
              <div style={{ display: "flex", gap: 4 }}>
                {["", "draft", "published", "rejected"].map(s => (
                  <button
                    key={s}
                    data-testid={`button-filter-kb-${s || "all"}`}
                    onClick={() => setStatusFilter(s)}
                    style={{
                      padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600,
                      background: statusFilter === s ? "#4f7df9" : "#1a1d27", color: statusFilter === s ? "#fff" : "#9ca3af",
                    }}
                  >
                    {s || "All"}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {articles.map((a: any) => (
                <button
                  key={a.id}
                  data-testid={`card-kb-article-${a.id}`}
                  onClick={() => { setSelectedArticle(a.id); setEditMode(false); setEditData(a); }}
                  style={{
                    background: selectedArticle === a.id ? "#1a1d27" : "#12141e",
                    border: `1px solid ${selectedArticle === a.id ? "rgba(79,125,249,0.3)" : "rgba(255,255,255,0.06)"}`,
                    borderRadius: 10, padding: "12px 14px", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ color: "#e5e7eb", fontSize: 13, fontWeight: 600, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{a.title}</p>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 4, color: "#fff", background: STATUS_BADGE[a.status]?.bg || "#6b7280" }}>{a.status}</span>
                  </div>
                  <p style={{ color: "#6b7280", fontSize: 10, margin: "4px 0 0" }}>{a.category} &middot; {a.viewCount} views &middot; {a.autoGenerated ? "AI generated" : "Manual"}</p>
                </button>
              ))}
              {articles.length === 0 && <p style={{ color: "#6b7280", fontSize: 13, textAlign: "center", padding: 20 }}>No articles yet. Extract solutions from resolved tickets below.</p>}
            </div>
          </div>

          {selectedArticle && selectedArticleData ? (
            <div style={{ background: "#12141e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 data-testid="text-article-title" style={{ color: "#fff", fontSize: 18, fontWeight: 600, margin: 0 }}>{selectedArticleData.title}</h3>
                <div style={{ display: "flex", gap: 6 }}>
                  {selectedArticleData.status === "draft" && (
                    <>
                      <button data-testid="button-approve-article" onClick={() => approveMutation.mutate(selectedArticle)} style={{ background: "#10b981", border: "none", borderRadius: 8, padding: "6px 14px", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                        {approveMutation.isPending ? "..." : "Publish"}
                      </button>
                      <button data-testid="button-reject-article" onClick={() => rejectMutation.mutate(selectedArticle)} style={{ background: "#ef4444", border: "none", borderRadius: 8, padding: "6px 14px", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                        Reject
                      </button>
                    </>
                  )}
                  <button data-testid="button-edit-article" onClick={() => { setEditMode(!editMode); setEditData(selectedArticleData); }} style={{ background: "#1a1d27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 14px", color: "#9ca3af", fontSize: 11, cursor: "pointer" }}>
                    {editMode ? "Cancel" : "Edit"}
                  </button>
                </div>
              </div>

              {editMode ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <input data-testid="input-edit-title" value={editData.title} onChange={e => setEditData({ ...editData, title: e.target.value })} style={{ background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#e5e7eb", fontSize: 13 }} />
                  <textarea data-testid="input-edit-problem" value={editData.problem} onChange={e => setEditData({ ...editData, problem: e.target.value })} rows={3} style={{ background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#e5e7eb", fontSize: 13, resize: "vertical" }} />
                  <textarea data-testid="input-edit-solution" value={editData.solution} onChange={e => setEditData({ ...editData, solution: e.target.value })} rows={4} style={{ background: "#0a0b10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#e5e7eb", fontSize: 13, resize: "vertical" }} />
                  <button data-testid="button-save-article" onClick={() => updateMutation.mutate({ id: selectedArticle, data: { title: editData.title, problem: editData.problem, solution: editData.solution } })} style={{ background: "linear-gradient(135deg,#4f7df9,#8b5cf6)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontWeight: 600, fontSize: 13, cursor: "pointer", alignSelf: "flex-start" }}>
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", margin: "0 0 4px" }}>Problem</p>
                    <p style={{ color: "#e5e7eb", fontSize: 13, margin: 0, lineHeight: 1.6 }}>{selectedArticleData.problem}</p>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ color: "#6b7280", fontSize: 10, textTransform: "uppercase", margin: "0 0 4px" }}>Solution</p>
                    <p style={{ color: "#10b981", fontSize: 13, margin: 0, lineHeight: 1.6 }}>{selectedArticleData.solution}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    {selectedArticleData.tags?.map((t: string, i: number) => (
                      <span key={i} style={{ background: "#1a1d27", borderRadius: 6, padding: "3px 8px", color: "#6b7280", fontSize: 10 }}>{t}</span>
                    ))}
                  </div>
                  <p style={{ color: "#4b5563", fontSize: 10, margin: 0 }}>
                    Category: {selectedArticleData.category} &middot; Views: {selectedArticleData.viewCount} &middot; Helpful: {selectedArticleData.helpfulCount}
                    {selectedArticleData.autoGenerated && " &middot; AI Generated"}
                    {selectedArticleData.approvedBy && ` &middot; Approved by ${selectedArticleData.approvedBy}`}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div>
              <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 600, margin: "0 0 12px" }}>Extract from Resolved Tickets</h2>
              <p style={{ color: "#6b7280", fontSize: 12, margin: "0 0 12px" }}>Select a resolved ticket to extract its solution and auto-generate a KB article.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {resolvedTickets.map((t: any) => (
                  <div key={t.id} style={{ background: "#12141e", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p style={{ color: "#e5e7eb", fontSize: 13, fontWeight: 600, margin: 0 }}>{t.subject}</p>
                      <p style={{ color: "#6b7280", fontSize: 10, margin: "4px 0 0" }}>{t.category} &middot; {t.userName}</p>
                    </div>
                    <button
                      data-testid={`button-extract-${t.id}`}
                      onClick={() => extractMutation.mutate(t.id)}
                      disabled={extractMutation.isPending}
                      style={{ background: "#1a2435", border: "1px solid rgba(79,125,249,0.2)", borderRadius: 8, padding: "6px 14px", color: "#4f7df9", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                    >
                      {extractMutation.isPending ? "Extracting..." : "Extract & Generate"}
                    </button>
                  </div>
                ))}
                {resolvedTickets.length === 0 && <p style={{ color: "#6b7280", fontSize: 13, textAlign: "center", padding: 20 }}>No resolved tickets to extract from.</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
