import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import {
  Shield, Lock, Unlock, Eye, Download, Key, CheckCircle,
  XCircle, AlertTriangle, Activity, Users, TrendingUp, Trash2,
  ShieldCheck, Database, FileKey, UserCheck
} from "lucide-react";

function fetchWithUser(url: string, options?: RequestInit) {
  const { user } = useAuth();
  const userId = user?.id || null;
  return fetch(url, {
    ...options,
    headers: { ...options?.headers, "x-user-id": userId || "", "Content-Type": "application/json" },
  }).then(r => { if (!r.ok) throw new Error("Request failed"); return r.json(); });
}

function TrustIndicators({ indicators }: { indicators: any }) {
  const items = [
    { key: "dataOwnership", label: "Data Ownership", icon: Database, desc: "You own all your data" },
    { key: "encryptionActive", label: "Encryption Active", icon: FileKey, desc: "Data encrypted at rest" },
    { key: "permissionControl", label: "Permission Control", icon: Key, desc: "Access requires permission" },
    { key: "accessTransparency", label: "Access Transparency", icon: Eye, desc: "All access is logged" },
    { key: "exportAvailable", label: "Export Available", icon: Download, desc: "Export your data anytime" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3" data-testid="trust-indicators">
      {items.map(item => {
        const active = indicators?.[item.key];
        return (
          <Card key={item.key} className={`border ${active ? "border-emerald-500/30 bg-emerald-950/20" : "border-zinc-700 bg-zinc-900/50"}`}>
            <CardContent className="p-3 text-center">
              <item.icon className={`h-6 w-6 mx-auto mb-1 ${active ? "text-emerald-400" : "text-zinc-500"}`} />
              <p className={`text-xs font-medium ${active ? "text-emerald-300" : "text-zinc-500"}`} data-testid={`indicator-${item.key}`}>
                {item.label}
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">{item.desc}</p>
              {active && <CheckCircle className="h-3 w-3 text-emerald-400 mx-auto mt-1" />}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function OverviewTab() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["trust-moat-dashboard"],
    queryFn: () => fetchWithUser("/api/trust-moat/dashboard"),
  });

  if (isLoading) return <div className="text-zinc-400 p-4">Loading trust dashboard...</div>;

  return (
    <div className="space-y-6" data-testid="overview-tab-content">
      <TrustIndicators indicators={dashboard?.trustIndicators} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 text-center">
            <ShieldCheck className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white" data-testid="stat-privacy-level">{dashboard?.vault?.privacyLevel || "strict"}</p>
            <p className="text-xs text-zinc-500">Privacy Level</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 text-center">
            <Key className="h-5 w-5 text-blue-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white" data-testid="stat-active-permissions">{dashboard?.activePermissions || 0}</p>
            <p className="text-xs text-zinc-500">Active Permissions</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 text-center">
            <Eye className="h-5 w-5 text-amber-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white" data-testid="stat-total-access">{dashboard?.accessStats?.total || 0}</p>
            <p className="text-xs text-zinc-500">Total Access Events</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 text-center">
            <XCircle className="h-5 w-5 text-red-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white" data-testid="stat-denied-access">{dashboard?.accessStats?.denied || 0}</p>
            <p className="text-xs text-zinc-500">Denied Access</p>
          </CardContent>
        </Card>
      </div>

      {dashboard?.recentAccess?.length > 0 && (
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-300">Recent Memory Access</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-2">
            {dashboard.recentAccess.slice(0, 5).map((event: any) => (
              <div key={event.id} className="flex items-center justify-between p-2 rounded bg-zinc-800/50 text-xs">
                <div className="flex items-center gap-2">
                  {event.granted ? <CheckCircle className="h-3 w-3 text-emerald-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
                  <span className="text-zinc-300">{event.accessorType}: {event.accessorId?.slice(0, 12)}...</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">{event.purpose}</span>
                  <span className="text-zinc-600">{new Date(event.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function VaultTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: dashboard } = useQuery({
    queryKey: ["trust-moat-dashboard"],
    queryFn: () => fetchWithUser("/api/trust-moat/dashboard"),
  });

  const updateSettings = useMutation({
    mutationFn: (settings: any) => fetchWithUser("/api/trust-moat/vault/settings", { method: "PUT", body: JSON.stringify(settings) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["trust-moat-dashboard"] }); toast({ title: "Settings updated" }); },
  });

  const lockVault = useMutation({
    mutationFn: () => fetchWithUser("/api/trust-moat/vault/lock", { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["trust-moat-dashboard"] }); toast({ title: "Vault locked" }); },
  });

  const unlockVault = useMutation({
    mutationFn: () => fetchWithUser("/api/trust-moat/vault/unlock", { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["trust-moat-dashboard"] }); toast({ title: "Vault unlocked" }); },
  });

  const vault = dashboard?.vault;

  return (
    <div className="space-y-4" data-testid="vault-tab-content">
      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Database className="h-5 w-5 text-emerald-400" />
                Your Memory Vault
              </CardTitle>
              <CardDescription className="text-zinc-500">Personal data ownership & encryption</CardDescription>
            </div>
            <Badge className={vault?.isLocked ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400"} data-testid="vault-lock-status">
              {vault?.isLocked ? <><Lock className="h-3 w-3 mr-1" /> Locked</> : <><Unlock className="h-3 w-3 mr-1" /> Active</>}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-zinc-500 mb-1">Privacy Level</p>
              <Select defaultValue={vault?.privacyLevel || "strict"} onValueChange={(v) => updateSettings.mutate({ privacyLevel: v })}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700" data-testid="select-privacy-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="strict">Strict - Maximum privacy</SelectItem>
                  <SelectItem value="balanced">Balanced - Smart defaults</SelectItem>
                  <SelectItem value="open">Open - Minimal restrictions</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">Auto-delete after (days)</p>
              <Input type="number" placeholder="Never" defaultValue={vault?.autoDeleteDays || ""} className="bg-zinc-800 border-zinc-700" data-testid="input-auto-delete"
                onBlur={(e) => { const v = e.target.value ? parseInt(e.target.value) : null; updateSettings.mutate({ autoDeleteDays: v }); }} />
            </div>
          </div>

          <div>
            <p className="text-xs text-zinc-500 mb-2">Data Categories</p>
            <div className="flex flex-wrap gap-2">
              {(vault?.dataCategories || ["personal", "conversations", "preferences", "activity"]).map((cat: string) => (
                <Badge key={cat} variant="outline" className="border-zinc-700 text-zinc-400">{cat}</Badge>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            {vault?.isLocked ? (
              <Button variant="outline" size="sm" onClick={() => unlockVault.mutate()} className="border-emerald-500/30 text-emerald-400" data-testid="button-unlock-vault">
                <Unlock className="h-4 w-4 mr-1" /> Unlock Vault
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => lockVault.mutate()} className="border-red-500/30 text-red-400" data-testid="button-lock-vault">
                <Lock className="h-4 w-4 mr-1" /> Lock Vault
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PermissionsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showGrant, setShowGrant] = useState(false);
  const [grantTo, setGrantTo] = useState("");
  const [permType, setPermType] = useState("read");
  const [scope, setScope] = useState("conversations");

  const { data: permissions = [] } = useQuery({
    queryKey: ["trust-moat-permissions"],
    queryFn: () => fetchWithUser("/api/trust-moat/permissions"),
  });

  const grant = useMutation({
    mutationFn: (data: any) => fetchWithUser("/api/trust-moat/permissions", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["trust-moat-permissions"] }); setShowGrant(false); setGrantTo(""); toast({ title: "Permission granted" }); },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => fetchWithUser(`/api/trust-moat/permissions/${id}`, { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["trust-moat-permissions"] }); toast({ title: "Permission revoked" }); },
  });

  return (
    <div className="space-y-4" data-testid="permissions-tab-content">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">Permission Tokens</h3>
        <Button size="sm" onClick={() => setShowGrant(!showGrant)} className="bg-emerald-600 hover:bg-emerald-700" data-testid="button-grant-permission">
          <Key className="h-4 w-4 mr-1" /> Grant Permission
        </Button>
      </div>

      {showGrant && (
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 space-y-3">
            <Input placeholder="User or Agent ID" value={grantTo} onChange={(e) => setGrantTo(e.target.value)} className="bg-zinc-800 border-zinc-700" data-testid="input-grant-to" />
            <div className="grid grid-cols-2 gap-3">
              <Select value={permType} onValueChange={setPermType}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700" data-testid="select-perm-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Read Only</SelectItem>
                  <SelectItem value="write">Write</SelectItem>
                  <SelectItem value="read_write">Read & Write</SelectItem>
                  <SelectItem value="export">Export</SelectItem>
                </SelectContent>
              </Select>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700" data-testid="select-scope"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="conversations">Conversations</SelectItem>
                  <SelectItem value="preferences">Preferences</SelectItem>
                  <SelectItem value="activity">Activity</SelectItem>
                  <SelectItem value="all">All Data</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={() => grant.mutate({ grantedTo: grantTo, permissionType: permType, resourceScope: scope })} disabled={!grantTo} data-testid="button-save-permission">
              Save Permission
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {permissions.length === 0 && <p className="text-zinc-500 text-sm">No permission tokens granted yet.</p>}
        {permissions.map((token: any) => (
          <Card key={token.id} className={`border ${token.isRevoked ? "border-red-500/20 bg-red-950/10" : "border-zinc-800 bg-zinc-900/60"}`}>
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Key className={`h-4 w-4 ${token.isRevoked ? "text-red-400" : "text-blue-400"}`} />
                <div>
                  <p className="text-sm text-zinc-300">
                    <span className="text-zinc-500">To:</span> {token.grantedTo?.slice(0, 16)}...
                    <Badge variant="outline" className="ml-2 text-[10px]">{token.permissionType}</Badge>
                    <Badge variant="outline" className="ml-1 text-[10px]">{token.resourceScope}</Badge>
                  </p>
                  <p className="text-[10px] text-zinc-600">Used {token.accessCount}x | Created {new Date(token.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              {!token.isRevoked && (
                <Button variant="ghost" size="sm" onClick={() => revoke.mutate(token.id)} className="text-red-400 hover:text-red-300" data-testid={`button-revoke-${token.id}`}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
              {token.isRevoked && <Badge className="bg-red-500/20 text-red-400 text-[10px]">Revoked</Badge>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AccessLogTab() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["trust-moat-access-log"],
    queryFn: () => fetchWithUser("/api/trust-moat/access-log"),
  });

  if (isLoading) return <div className="text-zinc-400 p-4">Loading access log...</div>;

  return (
    <div className="space-y-3" data-testid="access-log-tab-content">
      <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
        <Eye className="h-4 w-4 text-amber-400" /> Memory Access Transparency Log
      </h3>
      <p className="text-xs text-zinc-500">Every time an agent or user accesses your data, it's recorded here.</p>

      {logs.length === 0 && <p className="text-zinc-500 text-sm">No access events recorded yet.</p>}
      <div className="space-y-2">
        {logs.map((event: any) => (
          <Card key={event.id} className="bg-zinc-900/60 border-zinc-800">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {event.granted ? <CheckCircle className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-red-400" />}
                  <div>
                    <p className="text-sm text-zinc-300">
                      <Badge variant="outline" className="text-[10px] mr-1">{event.accessorType}</Badge>
                      {event.accessorId?.slice(0, 20)}{event.accessorId?.length > 20 ? "..." : ""}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      Accessed: <span className="text-zinc-400">{event.resourceAccessed}</span> | Purpose: <span className="text-zinc-400">{event.purpose}</span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge className={event.granted ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}>
                    {event.granted ? "Granted" : "Denied"}
                  </Badge>
                  <p className="text-[10px] text-zinc-600 mt-0.5">{new Date(event.createdAt).toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function DataExportTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const exportData = useMutation({
    mutationFn: () => fetchWithUser("/api/trust-moat/export"),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trust-moat-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Data exported successfully" });
    },
  });

  const deleteData = useMutation({
    mutationFn: () => fetchWithUser("/api/trust-moat/data", { method: "DELETE" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["trust-moat-dashboard"] }); toast({ title: "Data deleted" }); },
  });

  return (
    <div className="space-y-4" data-testid="export-tab-content">
      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Download className="h-5 w-5 text-blue-400" /> Export Your Data
          </CardTitle>
          <CardDescription className="text-zinc-500">Download a complete copy of all your trust moat data including vault settings, permissions, and access logs.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => exportData.mutate()} disabled={exportData.isPending} className="bg-blue-600 hover:bg-blue-700" data-testid="button-export-data">
            <Download className="h-4 w-4 mr-1" /> {exportData.isPending ? "Exporting..." : "Export All Data"}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/60 border-red-500/20">
        <CardHeader>
          <CardTitle className="text-lg text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Delete All Data
          </CardTitle>
          <CardDescription className="text-zinc-500">Permanently remove your trust vault and all associated data. This cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => deleteData.mutate()} disabled={deleteData.isPending} data-testid="button-delete-data">
            <Trash2 className="h-4 w-4 mr-1" /> {deleteData.isPending ? "Deleting..." : "Delete My Data"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function FounderTrustHealthTab() {
  const { data: health, isLoading } = useQuery({
    queryKey: ["trust-moat-founder-health"],
    queryFn: () => fetchWithUser("/api/trust-moat/founder/health"),
  });

  if (isLoading) return <div className="text-zinc-400 p-4">Computing trust health...</div>;

  const stats = health?.currentStats;

  return (
    <div className="space-y-4" data-testid="founder-tab-content">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-amber-400" />
        <h3 className="text-lg font-medium text-white">Trust Health Analytics</h3>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-emerald-400" data-testid="founder-trust-score">{stats?.trustScore?.toFixed(1) || 0}</p>
            <p className="text-xs text-zinc-500">Trust Score</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-blue-400" data-testid="founder-total-vaults">{stats?.totalVaults || 0}</p>
            <p className="text-xs text-zinc-500">Total Vaults</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-amber-400" data-testid="founder-total-tokens">{stats?.totalPermissionTokens || 0}</p>
            <p className="text-xs text-zinc-500">Permission Tokens</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-red-400" data-testid="founder-denied-events">{stats?.deniedAccessEvents || 0}</p>
            <p className="text-xs text-zinc-500">Denied Access</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300">Privacy Level Distribution</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex gap-4">
            {stats?.privacyDistribution && Object.entries(stats.privacyDistribution).map(([level, count]) => (
              <div key={level} className="flex-1 text-center p-3 rounded bg-zinc-800/50">
                <p className="text-lg font-bold text-white">{count as number}</p>
                <p className="text-xs text-zinc-500 capitalize">{level}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {health?.recentMetrics?.length > 0 && (
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-300">Trust Score History</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-1">
            {health.recentMetrics.slice(0, 10).map((m: any) => (
              <div key={m.id} className="flex items-center justify-between text-xs p-2 rounded bg-zinc-800/30">
                <span className="text-zinc-500">{new Date(m.metricDate).toLocaleString()}</span>
                <div className="flex items-center gap-3">
                  <span className="text-zinc-400">Vaults: {m.totalVaults}</span>
                  <span className="text-zinc-400">Tokens: {m.totalPermissionTokens}</span>
                  <Badge className={`text-[10px] ${m.trustScore >= 70 ? "bg-emerald-500/20 text-emerald-400" : m.trustScore >= 40 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>
                    Score: {m.trustScore}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function TrustDashboard() {
  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-emerald-400" />
          <div>
            <h1 className="text-2xl font-bold text-white" data-testid="text-trust-title">Trust Moat</h1>
            <p className="text-sm text-zinc-500">Your data, your control. Complete privacy transparency and ownership.</p>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="vault" data-testid="tab-vault">My Vault</TabsTrigger>
            <TabsTrigger value="permissions" data-testid="tab-permissions">Permissions</TabsTrigger>
            <TabsTrigger value="access-log" data-testid="tab-access-log">Access Log</TabsTrigger>
            <TabsTrigger value="export" data-testid="tab-export">Data Export</TabsTrigger>
            <TabsTrigger value="founder" data-testid="tab-founder">Founder Health</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="vault"><VaultTab /></TabsContent>
          <TabsContent value="permissions"><PermissionsTab /></TabsContent>
          <TabsContent value="access-log"><AccessLogTab /></TabsContent>
          <TabsContent value="export"><DataExportTab /></TabsContent>
          <TabsContent value="founder"><FounderTrustHealthTab /></TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
