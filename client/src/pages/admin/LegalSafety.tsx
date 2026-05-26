import { Layout } from "@/components/layout/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  Shield, AlertTriangle, Flag, Eye, CheckCircle2, XCircle,
  FileText, Brain, Clock, BarChart3, Gavel, Ban,
  Activity, AlertCircle, Scale, Lock, Users
} from "lucide-react";

function StatsCards({ stats }: { stats: any }) {
  const cards = [
    { label: "Pending Reports", value: stats?.reports?.pending || 0, icon: Flag, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "Resolved Reports", value: stats?.reports?.resolved || 0, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "AI Violations", value: stats?.violations?.total || 0, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "Critical Violations", value: stats?.violations?.critical || 0, icon: AlertCircle, color: "text-red-500", bg: "bg-red-600/10" },
    { label: "Active Disclaimers", value: stats?.disclaimers || 0, icon: FileText, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Verified Publishers", value: stats?.verifiedPublishers || 0, icon: Users, color: "text-violet-400", bg: "bg-violet-500/10" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="section-stats">
      {cards.map(c => (
        <Card key={c.label} className="glass-card rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn("p-1.5 rounded-lg", c.bg)}>
              <c.icon className={cn("w-3.5 h-3.5", c.color)} />
            </div>
          </div>
          <div className="text-xl font-bold">{c.value}</div>
          <div className="text-[10px] text-muted-foreground">{c.label}</div>
        </Card>
      ))}
    </div>
  );
}

function ModerationPanel() {
  const [filter, setFilter] = useState("pending");
  const queryClient = useQueryClient();

  const { data: reports, isLoading } = useQuery({
    queryKey: ["moderation-reports", filter],
    queryFn: () => api.legalSafety.getModerationReports(filter === "all" ? undefined : filter),
  });

  const resolveMutation = useMutation({
    mutationFn: (data: any) => api.legalSafety.resolveReport(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["moderation-reports"] }),
  });

  const dismissMutation = useMutation({
    mutationFn: (data: any) => api.legalSafety.dismissReport(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["moderation-reports"] }),
  });

  const statusColors: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    resolved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    dismissed: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  };

  return (
    <div className="space-y-4" data-testid="section-moderation">
      <div className="flex gap-2">
        {["pending", "resolved", "dismissed", "all"].map(f => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="text-xs capitalize" data-testid={`button-filter-${f}`}>
            {f}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>
      ) : (reports || []).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Flag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No {filter !== "all" ? filter : ""} reports</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(reports || []).map((report: any) => (
            <Card key={report.id} className="glass-card rounded-xl p-4" data-testid={`card-report-${report.id}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-[10px]", statusColors[report.status])}>{report.status}</Badge>
                  <Badge variant="outline" className="text-[10px]">{report.category}</Badge>
                </div>
                <span className="text-[10px] text-muted-foreground">{new Date(report.createdAt).toLocaleDateString()}</span>
              </div>
              <p className="text-sm font-medium mb-1">{report.reason}</p>
              {report.description && <p className="text-xs text-muted-foreground mb-2">{report.description}</p>}
              <div className="text-[10px] text-muted-foreground mb-3">App: {report.appId} | Reporter: {report.reporterId}</div>

              {report.status === "pending" && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="text-xs text-emerald-400 border-emerald-500/20"
                    onClick={() => resolveMutation.mutate({ reportId: report.id, moderatorId: "admin", action: "warning_issued", notes: "Reviewed and warning issued" })}
                    data-testid={`button-warn-${report.id}`}
                  >
                    <AlertTriangle className="w-3 h-3 mr-1" /> Warn
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs text-red-400 border-red-500/20"
                    onClick={() => resolveMutation.mutate({ reportId: report.id, moderatorId: "admin", action: "app_suspended", notes: "App suspended for policy violation" })}
                    data-testid={`button-suspend-${report.id}`}
                  >
                    <Ban className="w-3 h-3 mr-1" /> Suspend App
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs"
                    onClick={() => dismissMutation.mutate({ reportId: report.id, moderatorId: "admin", notes: "No violation found" })}
                    data-testid={`button-dismiss-${report.id}`}
                  >
                    <XCircle className="w-3 h-3 mr-1" /> Dismiss
                  </Button>
                </div>
              )}

              {report.actionTaken && (
                <div className="mt-2 p-2 rounded-md bg-white/[0.03] text-[10px]">
                  <span className="text-muted-foreground">Action: </span>
                  <span className="font-medium">{report.actionTaken}</span>
                  {report.moderatorNotes && <span className="text-muted-foreground"> — {report.moderatorNotes}</span>}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AiPolicyPanel() {
  const [testContent, setTestContent] = useState("");
  const [checkResult, setCheckResult] = useState<any>(null);

  const { data: rules } = useQuery({
    queryKey: ["ai-policy-rules"],
    queryFn: () => api.legalSafety.getAiPolicyRules(),
  });

  const { data: violations } = useQuery({
    queryKey: ["ai-violations"],
    queryFn: () => api.legalSafety.getAiViolations(),
  });

  const checkMutation = useMutation({
    mutationFn: () => api.legalSafety.checkAiContent({ content: testContent }),
    onSuccess: (data) => setCheckResult(data),
  });

  const severityColors: Record<string, string> = {
    critical: "text-red-400 bg-red-500/10 border-red-500/20",
    high: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    warning: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  };

  return (
    <div className="space-y-6" data-testid="section-ai-policy">
      <Card className="glass-card rounded-xl">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" /> AI Content Policy Tester
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            data-testid="input-test-content"
            placeholder="Enter AI-generated content to check against policy rules..."
            value={testContent}
            onChange={e => setTestContent(e.target.value)}
            rows={3}
            className="bg-white/[0.04] border-white/[0.08]"
          />
          <Button size="sm" onClick={() => checkMutation.mutate()} disabled={!testContent || checkMutation.isPending} data-testid="button-check-content">
            {checkMutation.isPending ? "Checking..." : "Check Content"}
          </Button>

          {checkResult && (
            <div className={cn("p-3 rounded-lg border", checkResult.passed ? "bg-emerald-500/5 border-emerald-500/15" : "bg-red-500/5 border-red-500/15")} data-testid="text-check-result">
              <div className="flex items-center gap-2 mb-1">
                {checkResult.passed ? (
                  <><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span className="text-sm font-medium text-emerald-400">Content passed all checks</span></>
                ) : (
                  <><AlertTriangle className="w-4 h-4 text-red-400" /><span className="text-sm font-medium text-red-400">{checkResult.violations.length} violation(s) detected</span></>
                )}
              </div>
              {checkResult.violations?.map((v: any, i: number) => (
                <div key={i} className="text-xs text-muted-foreground mt-1">
                  <Badge variant="outline" className={cn("text-[10px] mr-1", severityColors[v.severity])}>{v.severity}</Badge>
                  {v.ruleId} ({v.category})
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card rounded-xl">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Scale className="w-4 h-4 text-primary" /> Active Policy Rules ({(rules || []).length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(rules || []).map((r: any) => (
              <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <Badge variant="outline" className={cn("text-[10px]", severityColors[r.severity])}>{r.severity}</Badge>
                <span className="text-xs font-medium">{r.id.replace(/_/g, " ")}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{r.category}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card rounded-xl">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" /> Recent Violations ({(violations || []).length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(violations || []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No violations recorded yet</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {(violations || []).map((v: any) => (
                <div key={v.id} className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={cn("text-[10px]", severityColors[v.severity])}>{v.severity}</Badge>
                    <span className="text-xs font-medium">{v.violationType}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{new Date(v.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{v.description}</p>
                  <div className="text-[10px] text-muted-foreground mt-1">Action: <span className="font-medium">{v.actionTaken}</span></div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RiskCategoriesPanel() {
  const { data: categories } = useQuery({
    queryKey: ["risk-categories"],
    queryFn: () => api.legalSafety.getRiskCategories(),
  });

  const levelColors: Record<string, string> = {
    critical: "bg-red-500/10 text-red-400 border-red-500/20",
    high: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    medium: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  };

  return (
    <div className="space-y-4" data-testid="section-risk-categories">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(categories || []).map((cat: any) => (
          <Card key={cat.id} className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className={cn("text-xs capitalize", levelColors[cat.level])}>{cat.level}</Badge>
              <span className="font-medium text-sm capitalize">{cat.id.replace(/-/g, " ")}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{cat.disclaimerPreview}</p>
            <div className="flex flex-wrap gap-1">
              {(cat.regulatoryTags || []).map((tag: string) => (
                <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0">{tag}</Badge>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CreationLimitsPanel() {
  const { data: limits } = useQuery({
    queryKey: ["daily-limits"],
    queryFn: () => api.legalSafety.getDailyLimits(),
  });

  const tierColors: Record<string, string> = {
    free: "bg-gray-500/10 text-gray-400",
    pro: "bg-blue-500/10 text-blue-400",
    creator: "bg-violet-500/10 text-violet-400",
  };

  return (
    <div className="space-y-4" data-testid="section-creation-limits">
      <Card className="glass-card rounded-xl">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" /> Daily Creation Limits by Tier
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {limits && Object.entries(limits).map(([tier, vals]: [string, any]) => (
              <div key={tier} className={cn("p-4 rounded-xl border border-white/[0.06]", tierColors[tier])}>
                <h4 className="font-bold text-sm capitalize mb-3">{tier}</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Apps per day</span>
                    <span className="font-bold">{vals.apps}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Builds per day</span>
                    <span className="font-bold">{vals.builds}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LegalSafety() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["legal-safety-stats"],
    queryFn: () => api.legalSafety.getStats(),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-60" />
          <div className="grid grid-cols-6 gap-3">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-20" />)}</div>
          <Skeleton className="h-64" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-legal-safety-title">Legal Safety Stack</h1>
            <p className="text-sm text-muted-foreground">Platform risk management, moderation, and compliance controls</p>
          </div>
        </div>

        <StatsCards stats={stats} />

        <Tabs defaultValue="moderation">
          <TabsList className="bg-white/[0.04]">
            <TabsTrigger value="moderation" data-testid="tab-moderation">
              <Gavel className="w-4 h-4 mr-1" /> Moderation
            </TabsTrigger>
            <TabsTrigger value="ai-policy" data-testid="tab-ai-policy">
              <Brain className="w-4 h-4 mr-1" /> AI Policy
            </TabsTrigger>
            <TabsTrigger value="risk" data-testid="tab-risk">
              <AlertTriangle className="w-4 h-4 mr-1" /> Risk Categories
            </TabsTrigger>
            <TabsTrigger value="limits" data-testid="tab-limits">
              <Lock className="w-4 h-4 mr-1" /> Creation Limits
            </TabsTrigger>
          </TabsList>

          <TabsContent value="moderation" className="mt-4">
            <ModerationPanel />
          </TabsContent>

          <TabsContent value="ai-policy" className="mt-4">
            <AiPolicyPanel />
          </TabsContent>

          <TabsContent value="risk" className="mt-4">
            <RiskCategoriesPanel />
          </TabsContent>

          <TabsContent value="limits" className="mt-4">
            <CreationLimitsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
