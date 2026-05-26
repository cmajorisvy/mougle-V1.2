import { Layout } from "@/components/layout/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  Globe, Shield, Bell, Leaf, Search, CheckCircle2, XCircle, Clock,
  AlertTriangle, FileText, Flag, Zap, TrendingDown, Activity, RefreshCw,
  ChevronRight, Eye, MapPin
} from "lucide-react";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

const STATUS_STYLES: Record<string, { color: string; icon: any; label: string }> = {
  pending_approval: { color: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: Clock, label: "Pending Approval" },
  active: { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: CheckCircle2, label: "Active" },
  rejected: { color: "bg-red-500/10 text-red-400 border-red-500/20", icon: XCircle, label: "Rejected" },
};

const CATEGORY_LABELS: Record<string, string> = {
  data_privacy: "Data Privacy",
  ai_regulation: "AI Regulation",
  content_moderation: "Content Moderation",
  digital_services: "Digital Services",
  consumer_protection: "Consumer Protection",
  tax_compliance: "Tax Compliance",
  intellectual_property: "IP Rights",
  accessibility: "Accessibility",
};

export default function GlobalCompliance() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["/api/admin/gcis/dashboard"],
    queryFn: () => api.gcis.dashboard(),
    refetchInterval: 60000,
  });

  const { data: rules } = useQuery({
    queryKey: ["/api/admin/gcis/rules", statusFilter, countryFilter],
    queryFn: () => api.gcis.rules({
      status: statusFilter !== "all" ? statusFilter : undefined,
      countryCode: countryFilter !== "all" ? countryFilter : undefined,
    }),
  });

  const { data: notifications } = useQuery({
    queryKey: ["/api/admin/gcis/notifications"],
    queryFn: () => api.gcis.notifications(),
  });

  const { data: auditLog } = useQuery({
    queryKey: ["/api/admin/gcis/audit-log"],
    queryFn: () => api.gcis.auditLog(30),
  });

  const scanMutation = useMutation({
    mutationFn: (countryCode?: string) => api.gcis.scan(countryCode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/gcis"] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.gcis.approveRule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/gcis"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.gcis.rejectRule(id, "Rejected by founder"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/gcis"] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.gcis.markNotificationRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/gcis/notifications"] });
    },
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
  const eco = dashboard?.ecoEfficiency || {};

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="section-gcis">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Globe className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-gcis-title">Global Compliance Intelligence</h1>
              <p className="text-sm text-muted-foreground">Adaptive, law-aware platform behavior worldwide</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => scanMutation.mutate(undefined)}
              disabled={scanMutation.isPending}
              data-testid="button-scan-all"
            >
              <Search className="w-3.5 h-3.5 mr-1" />
              {scanMutation.isPending ? "Scanning..." : "Scan Legal Updates"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Active Rules", value: stats.activeRules || 0, icon: Shield, color: "text-emerald-400" },
            { label: "Pending Approval", value: stats.pendingApproval || 0, icon: Clock, color: "text-amber-400" },
            { label: "Countries Covered", value: stats.countriesCovered || 0, icon: MapPin, color: "text-blue-400" },
            { label: "Unread Alerts", value: stats.unreadNotifications || 0, icon: Bell, color: "text-red-400" },
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

        <Tabs defaultValue="rules" className="space-y-4">
          <TabsList className="bg-white/[0.03] border border-white/[0.06]">
            <TabsTrigger value="rules" data-testid="tab-rules">
              <Shield className="w-3.5 h-3.5 mr-1" /> Rules
            </TabsTrigger>
            <TabsTrigger value="notifications" data-testid="tab-notifications">
              <Bell className="w-3.5 h-3.5 mr-1" /> Notifications
              {(stats.unreadNotifications || 0) > 0 && (
                <Badge className="ml-1 bg-red-500/20 text-red-400 text-[9px] px-1.5">{stats.unreadNotifications}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="audit" data-testid="tab-audit">
              <FileText className="w-3.5 h-3.5 mr-1" /> Audit Log
            </TabsTrigger>
            <TabsTrigger value="flags" data-testid="tab-flags">
              <Flag className="w-3.5 h-3.5 mr-1" /> Feature Flags
            </TabsTrigger>
            <TabsTrigger value="eco" data-testid="tab-eco">
              <Leaf className="w-3.5 h-3.5 mr-1" /> Eco-Efficiency
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="space-y-4">
            <div className="flex items-center gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44 bg-white/[0.03]" data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending_approval">Pending Approval</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger className="w-44 bg-white/[0.03]" data-testid="select-country-filter">
                  <SelectValue placeholder="Filter by country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  {(dashboard?.jurisdictions || []).map((j: any) => (
                    <SelectItem key={j.code} value={j.code}>{j.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              {(rules || []).length === 0 ? (
                <Card className="glass-card rounded-xl p-8 text-center">
                  <Shield className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No compliance rules found. Run a scan to detect legal requirements.</p>
                </Card>
              ) : (
                (rules || []).map((rule: any) => {
                  const statusStyle = STATUS_STYLES[rule.status] || STATUS_STYLES.pending_approval;
                  const StatusIcon = statusStyle.icon;
                  return (
                    <Card key={rule.id} className="glass-card rounded-xl hover:bg-white/[0.04] transition-all" data-testid={`rule-${rule.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-bold">{rule.title}</h3>
                              <Badge variant="outline" className={cn("text-[9px]", SEVERITY_STYLES[rule.severity])}>
                                {rule.severity}
                              </Badge>
                              <Badge variant="outline" className={cn("text-[9px]", statusStyle.color)}>
                                <StatusIcon className="w-2.5 h-2.5 mr-0.5" />
                                {statusStyle.label}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <MapPin className="w-3 h-3" />
                              <span>{rule.countryName} ({rule.countryCode})</span>
                              <span className="text-white/10">|</span>
                              <span>{CATEGORY_LABELS[rule.category] || rule.category}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{rule.description}</p>
                            {rule.aiSummary && (
                              <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/10 text-xs">
                                <span className="text-[9px] uppercase font-bold tracking-wider text-primary block mb-1">AI Analysis</span>
                                {rule.aiSummary}
                              </div>
                            )}
                            {(rule.affectedModules || []).length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-[9px] text-muted-foreground uppercase">Modules:</span>
                                {rule.affectedModules.map((m: string) => (
                                  <Badge key={m} variant="outline" className="text-[8px] bg-white/[0.02]">{m}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          {rule.status === "pending_approval" && (
                            <div className="flex flex-col gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10"
                                onClick={() => approveMutation.mutate(rule.id)}
                                disabled={approveMutation.isPending}
                                data-testid={`button-approve-${rule.id}`}
                              >
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-400 border-red-500/20 hover:bg-red-500/10"
                                onClick={() => rejectMutation.mutate(rule.id)}
                                disabled={rejectMutation.isPending}
                                data-testid={`button-reject-${rule.id}`}
                              >
                                <XCircle className="w-3 h-3 mr-1" /> Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-3">
            {(notifications || []).length === 0 ? (
              <Card className="glass-card rounded-xl p-8 text-center">
                <Bell className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No compliance notifications yet.</p>
              </Card>
            ) : (
              (notifications || []).map((n: any) => (
                <Card key={n.id} className={cn("glass-card rounded-xl", !n.read && "border-primary/20 bg-primary/[0.02]")} data-testid={`notification-${n.id}`}>
                  <CardContent className="p-4 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className={cn("p-1.5 rounded-lg mt-0.5", n.read ? "bg-white/[0.03]" : "bg-primary/10")}>
                        <Bell className={cn("w-3.5 h-3.5", n.read ? "text-muted-foreground" : "text-primary")} />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{n.title}</div>
                        <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {n.countryCode && <Badge variant="outline" className="text-[8px]">{n.countryCode}</Badge>}
                          <Badge variant="outline" className="text-[8px]">{n.targetAudience}</Badge>
                          <span className="text-[9px] text-muted-foreground">
                            {new Date(n.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    {!n.read && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markReadMutation.mutate(n.id)}
                        data-testid={`button-read-${n.id}`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="audit" className="space-y-3">
            <Card className="glass-card rounded-xl">
              <CardHeader>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Compliance Audit Trail
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(auditLog || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No audit events recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {(auditLog || []).map((entry: any) => (
                      <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]" data-testid={`audit-${entry.id}`}>
                        <Activity className="w-3.5 h-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">{entry.action.replace(/_/g, " ").toUpperCase()}</span>
                            {entry.countryCode && <Badge variant="outline" className="text-[8px]">{entry.countryCode}</Badge>}
                            <span className="text-[9px] text-muted-foreground ml-auto">
                              {new Date(entry.createdAt).toLocaleString()}
                            </span>
                          </div>
                          {entry.details && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {typeof entry.details === "object" ? JSON.stringify(entry.details).slice(0, 120) : String(entry.details)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="flags">
            <CountryFeatureFlags jurisdictions={dashboard?.jurisdictions || []} />
          </TabsContent>

          <TabsContent value="eco" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border-emerald-500/20 rounded-xl" data-testid="card-eco-score">
                <CardContent className="p-6 text-center space-y-3">
                  <Leaf className="w-8 h-8 mx-auto text-emerald-400" />
                  <div className="text-4xl font-bold font-mono text-emerald-400">{eco.efficiencyScore || 0}%</div>
                  <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Eco-Efficiency Score</div>
                </CardContent>
              </Card>
              <Card className="glass-card rounded-xl" data-testid="card-eco-compute">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Compute Usage
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">AI Requests Today</span><span className="font-mono">{eco.aiRequestsToday || 0}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Estimated Cost</span><span className="font-mono">${eco.estimatedCostUsd || 0}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Carbon Footprint</span><span className="font-mono">{eco.estimatedCarbonKg || 0} kg CO2</span></div>
                  </div>
                </CardContent>
              </Card>
              <Card className="glass-card rounded-xl" data-testid="card-eco-savings">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <TrendingDown className="w-4 h-4 text-emerald-400" />
                    Waste Reduction
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Cached Requests</span><span className="font-mono">{eco.cachedRequestsAvoided || 0}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Cost Saved</span><span className="font-mono text-emerald-400">${eco.savingsFromCachingUsd || 0}</span></div>
                  </div>
                </CardContent>
              </Card>
            </div>
            {(eco.recommendations || []).length > 0 && (
              <Card className="glass-card rounded-xl">
                <CardHeader>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Leaf className="w-4 h-4 text-emerald-400" />
                    Eco Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {eco.recommendations.map((rec: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]" data-testid={`eco-rec-${i}`}>
                      <ChevronRight className="w-3 h-3 mt-0.5 text-emerald-400 flex-shrink-0" />
                      <span className="text-xs">{rec}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function CountryFeatureFlags({ jurisdictions }: { jurisdictions: any[] }) {
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const { data: flags, isLoading } = useQuery({
    queryKey: ["/api/admin/gcis/feature-flags", selectedCountry],
    queryFn: () => api.gcis.featureFlags(selectedCountry || undefined),
    enabled: true,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={selectedCountry || "global"} onValueChange={(v) => setSelectedCountry(v === "global" ? "" : v)}>
          <SelectTrigger className="w-56 bg-white/[0.03]" data-testid="select-flag-country">
            <SelectValue placeholder="Select country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="global">All Countries (Global)</SelectItem>
            {jurisdictions.map((j: any) => (
              <SelectItem key={j.code} value={j.code}>{j.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {flags && <Badge variant="outline" className="text-xs">{flags.rulesApplied || 0} rules applied</Badge>}
      </div>

      <Card className="glass-card rounded-xl">
        <CardHeader>
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Flag className="w-4 h-4 text-primary" />
            Active Feature Flags — {selectedCountry || "Global"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-20" />
          ) : !flags?.flags || Object.keys(flags.flags).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No active feature flags for this jurisdiction.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(flags.flags).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]" data-testid={`flag-${key}`}>
                  <span className="text-xs font-mono truncate mr-2">{key}</span>
                  <Badge variant="outline" className={cn("text-[9px]", value ? "text-emerald-400 border-emerald-500/20" : "text-red-400 border-red-500/20")}>
                    {value ? "ON" : "OFF"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
