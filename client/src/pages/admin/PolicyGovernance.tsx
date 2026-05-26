import { Layout } from "@/components/layout/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  FileText, Sparkles, CheckCircle2, XCircle, Clock, History,
  RotateCcw, Eye, PenLine, RefreshCw, BookOpen, Mail, Shield,
  ArrowRight, Diff, AlertTriangle, Layers
} from "lucide-react";

const STATUS_STYLES: Record<string, { color: string; icon: any; label: string }> = {
  pending: { color: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: Clock, label: "Pending Approval" },
  approved: { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: CheckCircle2, label: "Approved" },
  rejected: { color: "bg-red-500/10 text-red-400 border-red-500/20", icon: XCircle, label: "Rejected" },
};

const CATEGORY_ICONS: Record<string, any> = {
  legal: Shield,
  agreement: FileText,
  help: BookOpen,
  email: Mail,
};

export default function PolicyGovernance() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("templates");
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [viewingDraft, setViewingDraft] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["/api/admin/policy/dashboard"],
    queryFn: () => api.policy.dashboard(),
    refetchInterval: 30000,
  });

  const { data: drafts } = useQuery({
    queryKey: ["/api/admin/policy/drafts"],
    queryFn: () => api.policy.drafts(),
  });

  const initMutation = useMutation({
    mutationFn: () => api.policy.initTemplates(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/policy"] }); },
  });

  const generateMutation = useMutation({
    mutationFn: ({ templateId, reason }: { templateId: string; reason?: string }) =>
      api.policy.generate(templateId, "manual", { reason: reason || "Manual update requested" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/policy"] });
      setActiveTab("drafts");
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.policy.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/policy"] });
      setViewingDraft(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.policy.reject(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/policy"] });
      setViewingDraft(null);
      setRejectReason("");
    },
  });

  const detectMutation = useMutation({
    mutationFn: () => api.policy.detectUpdates(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/policy"] }); },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-96" />
          <div className="grid grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
          </div>
          <Skeleton className="h-96" />
        </div>
      </Layout>
    );
  }

  const stats = dashboard?.stats || {};

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="section-policy-governance">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-policy-title">Adaptive Policy Governance</h1>
              <p className="text-sm text-muted-foreground">Auto-generate and manage legal/info content with AI</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => initMutation.mutate()}
              disabled={initMutation.isPending}
              data-testid="button-init-templates"
            >
              <Layers className="w-3.5 h-3.5 mr-1" />
              {initMutation.isPending ? "Initializing..." : "Init Templates"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => detectMutation.mutate()}
              disabled={detectMutation.isPending}
              data-testid="button-detect-updates"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1", detectMutation.isPending && "animate-spin")} />
              {detectMutation.isPending ? "Detecting..." : "Detect & Generate"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Templates", value: stats.totalTemplates || 0, icon: Layers, color: "text-blue-400" },
            { label: "Published", value: stats.publishedTemplates || 0, icon: CheckCircle2, color: "text-emerald-400" },
            { label: "Pending Drafts", value: stats.pendingDrafts || 0, icon: Clock, color: "text-amber-400" },
            { label: "Total Versions", value: stats.totalVersions || 0, icon: History, color: "text-purple-400" },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <Card key={i} className="glass-card rounded-xl" data-testid={`stat-${s.label.toLowerCase().replace(/\s/g, "-")}`}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white/[0.05]">
                    <Icon className={cn("w-5 h-5", s.color)} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold font-mono">{s.value}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-white/[0.03] border border-white/[0.06]">
            <TabsTrigger value="templates" data-testid="tab-templates">
              <Layers className="w-3.5 h-3.5 mr-1" /> Templates
            </TabsTrigger>
            <TabsTrigger value="drafts" data-testid="tab-drafts">
              <PenLine className="w-3.5 h-3.5 mr-1" /> Drafts
              {(stats.pendingDrafts || 0) > 0 && (
                <Badge className="ml-1 bg-amber-500/20 text-amber-400 text-[9px] px-1.5">{stats.pendingDrafts}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="versions" data-testid="tab-versions">
              <History className="w-3.5 h-3.5 mr-1" /> Version History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="templates" className="space-y-3">
            {(dashboard?.templates || []).length === 0 ? (
              <Card className="glass-card rounded-xl p-8 text-center">
                <FileText className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground mb-3">No policy templates found. Initialize the default templates to get started.</p>
                <Button size="sm" onClick={() => initMutation.mutate()} disabled={initMutation.isPending} data-testid="button-init-empty">
                  <Layers className="w-3.5 h-3.5 mr-1" /> Initialize Templates
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(dashboard?.templates || []).map((template: any) => {
                  const CatIcon = CATEGORY_ICONS[template.category] || FileText;
                  return (
                    <Card key={template.id} className="glass-card rounded-xl hover:bg-white/[0.04] transition-all" data-testid={`template-${template.slug}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="p-2 rounded-lg bg-white/[0.05] mt-0.5">
                              <CatIcon className="w-4 h-4 text-primary" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold">{template.title}</h3>
                                <Badge variant="outline" className="text-[8px]">{template.category}</Badge>
                                {template.isPublished ? (
                                  <Badge variant="outline" className="text-[8px] text-emerald-400 border-emerald-500/20">v{template.currentVersion}</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[8px] text-muted-foreground">Draft</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                              {template.lastPublishedAt && (
                                <p className="text-[9px] text-muted-foreground mt-1">
                                  Last published: {new Date(template.lastPublishedAt).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => generateMutation.mutate({ templateId: template.id })}
                              disabled={generateMutation.isPending}
                              data-testid={`button-generate-${template.slug}`}
                            >
                              <Sparkles className="w-3 h-3 mr-1" />
                              {generateMutation.isPending ? "..." : "Generate"}
                            </Button>
                            {template.currentVersion > 0 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs"
                                onClick={() => { setSelectedTemplate(template); setActiveTab("versions"); }}
                                data-testid={`button-history-${template.slug}`}
                              >
                                <History className="w-3 h-3 mr-1" /> History
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="drafts" className="space-y-3">
            {(drafts || []).length === 0 ? (
              <Card className="glass-card rounded-xl p-8 text-center">
                <PenLine className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No policy drafts. Generate one from a template.</p>
              </Card>
            ) : (
              (drafts || []).map((draft: any) => {
                const statusStyle = STATUS_STYLES[draft.status] || STATUS_STYLES.pending;
                const StatusIcon = statusStyle.icon;
                return (
                  <Card key={draft.id} className="glass-card rounded-xl" data-testid={`draft-${draft.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold">{draft.title}</h3>
                            <Badge variant="outline" className={cn("text-[9px]", statusStyle.color)}>
                              <StatusIcon className="w-2.5 h-2.5 mr-0.5" />
                              {statusStyle.label}
                            </Badge>
                            <Badge variant="outline" className="text-[8px]">{draft.triggerType}</Badge>
                          </div>
                          {draft.changeSummary && (
                            <p className="text-xs text-muted-foreground">{draft.changeSummary}</p>
                          )}
                          <div className="text-[9px] text-muted-foreground">
                            Created: {new Date(draft.createdAt).toLocaleString()}
                            {draft.reviewedAt && ` | Reviewed: ${new Date(draft.reviewedAt).toLocaleString()}`}
                          </div>
                          {draft.rejectionReason && (
                            <div className="p-2 rounded-lg bg-red-500/5 border border-red-500/10 text-xs text-red-400">
                              Rejection: {draft.rejectionReason}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => setViewingDraft(draft)}
                            data-testid={`button-view-draft-${draft.id}`}
                          >
                            <Eye className="w-3 h-3 mr-1" /> Preview
                          </Button>
                          {draft.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10 text-xs"
                                onClick={() => approveMutation.mutate(draft.id)}
                                disabled={approveMutation.isPending}
                                data-testid={`button-approve-draft-${draft.id}`}
                              >
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                              </Button>
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-400 border-red-500/20 hover:bg-red-500/10 text-xs"
                                    data-testid={`button-reject-dialog-${draft.id}`}
                                  >
                                    <XCircle className="w-3 h-3 mr-1" /> Reject
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-zinc-900 border-white/10">
                                  <DialogHeader>
                                    <DialogTitle>Reject Draft: {draft.title}</DialogTitle>
                                  </DialogHeader>
                                  <Textarea
                                    placeholder="Reason for rejection..."
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    className="bg-white/[0.03]"
                                    data-testid="input-reject-reason"
                                  />
                                  <Button
                                    onClick={() => rejectMutation.mutate({ id: draft.id, reason: rejectReason })}
                                    disabled={rejectMutation.isPending || !rejectReason.trim()}
                                    className="bg-red-600 hover:bg-red-700"
                                    data-testid="button-confirm-reject"
                                  >
                                    Confirm Rejection
                                  </Button>
                                </DialogContent>
                              </Dialog>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="versions">
            <VersionHistoryTab
              templates={dashboard?.templates || []}
              selectedTemplate={selectedTemplate}
              onSelectTemplate={setSelectedTemplate}
            />
          </TabsContent>
        </Tabs>

        {viewingDraft && (
          <DraftPreviewDialog
            draft={viewingDraft}
            onClose={() => setViewingDraft(null)}
            onApprove={() => approveMutation.mutate(viewingDraft.id)}
            approving={approveMutation.isPending}
          />
        )}
      </div>
    </Layout>
  );
}

function VersionHistoryTab({ templates, selectedTemplate, onSelectTemplate }: {
  templates: any[];
  selectedTemplate: any;
  onSelectTemplate: (t: any) => void;
}) {
  const qc = useQueryClient();
  const templateId = selectedTemplate?.id;

  const { data: versions, isLoading } = useQuery({
    queryKey: ["/api/admin/policy/versions", templateId],
    queryFn: () => api.policy.versions(templateId),
    enabled: !!templateId,
  });

  const rollbackMutation = useMutation({
    mutationFn: (versionId: string) => api.policy.rollback(templateId, versionId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/admin/policy"] }); },
  });

  return (
    <div className="space-y-4">
      <Select value={templateId || ""} onValueChange={(v) => onSelectTemplate(templates.find((t: any) => t.id === v))}>
        <SelectTrigger className="w-72 bg-white/[0.03]" data-testid="select-version-template">
          <SelectValue placeholder="Select a template to view history" />
        </SelectTrigger>
        <SelectContent>
          {templates.map((t: any) => (
            <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!templateId ? (
        <Card className="glass-card rounded-xl p-8 text-center">
          <History className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Select a template to view its version history.</p>
        </Card>
      ) : isLoading ? (
        <Skeleton className="h-40" />
      ) : (versions || []).length === 0 ? (
        <Card className="glass-card rounded-xl p-8 text-center">
          <p className="text-sm text-muted-foreground">No versions published yet for this template.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {(versions || []).map((v: any) => (
            <Card key={v.id} className={cn("glass-card rounded-xl", v.isActive && "border-emerald-500/20")} data-testid={`version-${v.id}`}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
                    v.isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-white/[0.05] text-muted-foreground"
                  )}>
                    v{v.version}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Version {v.version}</span>
                      {v.isActive && <Badge className="text-[8px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Active</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{v.changeSummary || v.changeReason}</p>
                    <span className="text-[9px] text-muted-foreground">
                      Published: {new Date(v.publishedAt).toLocaleString()} by {v.publishedBy}
                    </span>
                  </div>
                </div>
                {!v.isActive && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-amber-400 border-amber-500/20 hover:bg-amber-500/10 text-xs"
                    onClick={() => rollbackMutation.mutate(v.id)}
                    disabled={rollbackMutation.isPending}
                    data-testid={`button-rollback-${v.id}`}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" /> Rollback
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function DraftPreviewDialog({ draft, onClose, onApprove, approving }: {
  draft: any;
  onClose: () => void;
  onApprove: () => void;
  approving: boolean;
}) {
  const [tab, setTab] = useState<"preview" | "diff">("preview");

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-white/10 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">{draft.title}</h2>
            <p className="text-xs text-muted-foreground">{draft.changeSummary}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={tab === "preview" ? "default" : "outline"}
              onClick={() => setTab("preview")}
              className="text-xs"
              data-testid="button-tab-preview"
            >
              <Eye className="w-3 h-3 mr-1" /> Preview
            </Button>
            <Button
              size="sm"
              variant={tab === "diff" ? "default" : "outline"}
              onClick={() => setTab("diff")}
              className="text-xs"
              data-testid="button-tab-diff"
            >
              <Diff className="w-3 h-3 mr-1" /> Changes
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {tab === "preview" ? (
            <div className="prose prose-invert prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-xs font-sans leading-relaxed">{draft.draftContent}</pre>
            </div>
          ) : (
            <div className="space-y-0">
              {draft.diffHtml ? (
                <div
                  className="font-mono text-xs leading-relaxed [&_.diff-added]:bg-emerald-500/10 [&_.diff-added]:text-emerald-400 [&_.diff-removed]:bg-red-500/10 [&_.diff-removed]:text-red-400 [&_.diff-context]:text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: draft.diffHtml }}
                />
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {draft.previousContent ? "No diff available" : "New document — no previous version to compare"}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/[0.06] flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-preview">Close</Button>
          {draft.status === "pending" && (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={onApprove}
              disabled={approving}
              data-testid="button-approve-preview"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              {approving ? "Approving..." : "Approve & Publish"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
