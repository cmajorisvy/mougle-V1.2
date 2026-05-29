import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield, Lock, Eye, AlertTriangle, Settings, Activity,
  Plus, Check, X, ShieldAlert, ShieldCheck, Globe, Users, UserX,
  Download, Trash2, FileText, Loader2, Clock
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const PRIVACY_MODES = [
  { value: "ultra_private", label: "Ultra Private", icon: Lock, color: "text-red-400", desc: "No external access. Maximum isolation." },
  { value: "personal", label: "Personal", icon: Shield, color: "text-yellow-400", desc: "Owner-only access. System can interact." },
  { value: "collaborative", label: "Collaborative", icon: Users, color: "text-blue-400", desc: "Allowed agents can interact." },
  { value: "open", label: "Open", icon: Globe, color: "text-green-400", desc: "Platform-wide access with filters." },
];

function fetchWithAuth(url: string, opts: any = {}) {
  return fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
    credentials: "include",
  }).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });
}

export default function PrivacyCenter() {
  const [activeTab, setActiveTab] = useState("overview");
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id || null;

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["/api/privacy/dashboard"],
    queryFn: () => fetchWithAuth("/api/privacy/dashboard"),
    enabled: !!userId,
  });

  const { data: accessLogs = [] } = useQuery({
    queryKey: ["/api/privacy/access-logs"],
    queryFn: () => fetchWithAuth("/api/privacy/access-logs?limit=50"),
    enabled: !!userId && activeTab === "logs",
  });

  const { data: violations = [] } = useQuery({
    queryKey: ["/api/privacy/violations"],
    queryFn: () => fetchWithAuth("/api/privacy/violations"),
    enabled: !!userId && activeTab === "violations",
  });

  const { data: founderData } = useQuery({
    queryKey: ["/api/privacy/founder/monitoring"],
    queryFn: () => fetchWithAuth("/api/privacy/founder/monitoring"),
    enabled: !!userId && activeTab === "founder",
  });

  const { data: dataRequests = [] } = useQuery({
    queryKey: ["/api/user-data/requests"],
    queryFn: () => fetchWithAuth("/api/user-data/requests"),
    enabled: !!userId && activeTab === "my-data",
  });

  if (!userId) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="bg-zinc-900 border-zinc-800 max-w-md">
            <CardContent className="p-8 text-center">
              <Shield className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Sign In Required</h2>
              <p className="text-zinc-400">Please sign in to access the Privacy Center.</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2" data-testid="text-privacy-title">
              <Shield className="w-7 h-7 text-purple-400" />
              Privacy Center
            </h1>
            <p className="text-zinc-400 mt-1">Manage agent privacy, permissions, and access controls</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <ShieldCheck className="w-4 h-4 mr-1" /> Overview
            </TabsTrigger>
            <TabsTrigger value="vaults" data-testid="tab-vaults">
              <Lock className="w-4 h-4 mr-1" /> Vaults
            </TabsTrigger>
            <TabsTrigger value="logs" data-testid="tab-logs">
              <Activity className="w-4 h-4 mr-1" /> Access Logs
            </TabsTrigger>
            <TabsTrigger value="violations" data-testid="tab-violations">
              <AlertTriangle className="w-4 h-4 mr-1" /> Violations
            </TabsTrigger>
            <TabsTrigger value="my-data" data-testid="tab-my-data">
              <FileText className="w-4 h-4 mr-1" /> My Data
            </TabsTrigger>
            <TabsTrigger value="founder" data-testid="tab-founder">
              <ShieldAlert className="w-4 h-4 mr-1" /> Founder Monitor
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" data-testid="overview-tab-content">
            <OverviewTab dashboard={dashboard} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="vaults" data-testid="vaults-tab-content">
            <VaultsTab dashboard={dashboard} userId={userId} queryClient={queryClient} />
          </TabsContent>

          <TabsContent value="logs" data-testid="logs-tab-content">
            <AccessLogsTab logs={accessLogs} />
          </TabsContent>

          <TabsContent value="violations" data-testid="violations-tab-content">
            <ViolationsTab violations={violations} queryClient={queryClient} />
          </TabsContent>

          <TabsContent value="my-data" data-testid="my-data-tab-content">
            <MyDataTab userId={userId} requests={dataRequests} queryClient={queryClient} />
          </TabsContent>

          <TabsContent value="founder" data-testid="founder-tab-content">
            <FounderTab data={founderData} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function OverviewTab({ dashboard, isLoading }: { dashboard: any; isLoading: boolean }) {
  if (isLoading) {
    return <div className="text-zinc-400 py-8 text-center">Loading privacy overview...</div>;
  }

  const stats = dashboard?.stats || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg"><Lock className="w-5 h-5 text-purple-400" /></div>
              <div>
                <p className="text-2xl font-bold text-white" data-testid="stat-total-vaults">{stats.totalVaults || 0}</p>
                <p className="text-xs text-zinc-500">Privacy Vaults</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg"><ShieldCheck className="w-5 h-5 text-green-400" /></div>
              <div>
                <p className="text-2xl font-bold text-white" data-testid="stat-active-vaults">{stats.activeVaults || 0}</p>
                <p className="text-xs text-zinc-500">Active Vaults</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg"><Eye className="w-5 h-5 text-blue-400" /></div>
              <div>
                <p className="text-2xl font-bold text-white" data-testid="stat-access-count">{stats.recentAccessCount || 0}</p>
                <p className="text-xs text-zinc-500">Access Events</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg"><AlertTriangle className="w-5 h-5 text-red-400" /></div>
              <div>
                <p className="text-2xl font-bold text-white" data-testid="stat-violations">{stats.totalViolations || 0}</p>
                <p className="text-xs text-zinc-500">Violations</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {stats.blockedAccessCount > 0 && (
        <Card className="bg-red-500/5 border-red-500/20">
          <CardContent className="p-4 flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-red-400" />
            <p className="text-red-300 text-sm">
              <strong>{stats.blockedAccessCount}</strong> access attempts were blocked recently.
              {stats.unresolvedViolations > 0 && ` ${stats.unresolvedViolations} unresolved violations require attention.`}
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-lg">Privacy Mode Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(stats.privacyModeDistribution || {}).length === 0 ? (
            <p className="text-zinc-500 text-sm">No vaults configured yet. Create a vault in the Vaults tab to get started.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {PRIVACY_MODES.map(m => {
                const count = (stats.privacyModeDistribution || {})[m.value] || 0;
                const Icon = m.icon;
                return (
                  <div key={m.value} className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800/50">
                    <Icon className={`w-4 h-4 ${m.color}`} />
                    <span className="text-white text-sm font-medium">{m.label}</span>
                    <Badge variant="secondary" className="ml-auto">{count}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {(dashboard?.recentAccessLogs || []).length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-lg">Recent Access Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {(dashboard?.recentAccessLogs || []).slice(0, 10).map((log: any) => (
                <div key={log.id} className="flex items-center justify-between p-2 rounded bg-zinc-800/30 text-sm">
                  <div className="flex items-center gap-2">
                    {log.granted ? <Check className="w-4 h-4 text-green-400" /> : <X className="w-4 h-4 text-red-400" />}
                    <span className="text-zinc-300">{log.action}</span>
                    <span className="text-zinc-500">by {log.requesterType}</span>
                  </div>
                  <span className="text-zinc-500 text-xs">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function VaultsTab({ dashboard, userId, queryClient }: { dashboard: any; userId: string; queryClient: any }) {
  const [showCreate, setShowCreate] = useState(false);
  const [newAgentId, setNewAgentId] = useState("");
  const [newMode, setNewMode] = useState("personal");
  const [editingVault, setEditingVault] = useState<string | null>(null);

  const createVault = useMutation({
    mutationFn: (data: any) => fetchWithAuth("/api/privacy/vaults", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/privacy/dashboard"] }); setShowCreate(false); setNewAgentId(""); },
  });

  const setMode = useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: string }) =>
      fetchWithAuth(`/api/privacy/vaults/${id}/mode`, { method: "PUT", body: JSON.stringify({ mode }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/privacy/dashboard"] }),
  });

  const updateRestrictions = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      fetchWithAuth(`/api/privacy/vaults/${id}/restrictions`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/privacy/dashboard"] }); setEditingVault(null); },
  });

  const deleteVault = useMutation({
    mutationFn: (id: string) => fetchWithAuth(`/api/privacy/vaults/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/privacy/dashboard"] }),
  });

  const vaults = dashboard?.vaults || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Agent Privacy Vaults</h3>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)} data-testid="button-create-vault">
          <Plus className="w-4 h-4 mr-1" /> New Vault
        </Button>
      </div>

      {showCreate && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4 space-y-3">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Agent ID</label>
              <Input
                value={newAgentId}
                onChange={e => setNewAgentId(e.target.value)}
                placeholder="Enter agent ID to protect"
                className="bg-zinc-800 border-zinc-700 text-white"
                data-testid="input-vault-agent-id"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Privacy Mode</label>
              <Select value={newMode} onValueChange={setNewMode}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white" data-testid="select-vault-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIVACY_MODES.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label} - {m.desc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => createVault.mutate({ agentId: newAgentId, privacyMode: newMode })}
              disabled={!newAgentId || createVault.isPending}
              data-testid="button-save-vault"
            >
              {createVault.isPending ? "Creating..." : "Create Vault"}
            </Button>
          </CardContent>
        </Card>
      )}

      {vaults.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-8 text-center">
            <Lock className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400">No privacy vaults yet. Create one to protect an agent's data.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {vaults.map((vault: any) => {
            const modeInfo = PRIVACY_MODES.find(m => m.value === vault.privacyMode) || PRIVACY_MODES[1];
            const ModeIcon = modeInfo.icon;
            const isEditing = editingVault === vault.id;

            return (
              <Card key={vault.id} className="bg-zinc-900 border-zinc-800" data-testid={`vault-card-${vault.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg bg-zinc-800`}>
                        <ModeIcon className={`w-5 h-5 ${modeInfo.color}`} />
                      </div>
                      <div>
                        <p className="text-white font-medium">Agent: {vault.agentId.slice(0, 12)}...</p>
                        <Badge className={`${modeInfo.color} bg-transparent border-current text-xs`}>
                          {modeInfo.label}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditingVault(isEditing ? null : vault.id)} data-testid={`button-edit-vault-${vault.id}`}>
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteVault.mutate(vault.id)} data-testid={`button-delete-vault-${vault.id}`}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-zinc-500">Learning:</span>
                      <span className={vault.learningPermission ? "text-green-400" : "text-red-400"}>
                        {vault.learningPermission ? "On" : "Off"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-zinc-500">Sharing:</span>
                      <span className={vault.sharingPermission ? "text-green-400" : "text-red-400"}>
                        {vault.sharingPermission ? "On" : "Off"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-zinc-500">Scope:</span>
                      <span className="text-zinc-300">{vault.communicationScope}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-zinc-500">Export:</span>
                      <span className={vault.dataExportPermission ? "text-green-400" : "text-red-400"}>
                        {vault.dataExportPermission ? "On" : "Off"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-zinc-500">Autonomy:</span>
                      <span className="text-zinc-300">{vault.executionAutonomy}</span>
                    </div>
                  </div>

                  {isEditing && (
                    <VaultEditor
                      vault={vault}
                      onSave={(data: any) => updateRestrictions.mutate({ id: vault.id, data })}
                      onModeChange={(mode: string) => setMode.mutate({ id: vault.id, mode })}
                      isPending={updateRestrictions.isPending}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VaultEditor({ vault, onSave, onModeChange, isPending }: any) {
  const [learning, setLearning] = useState(vault.learningPermission);
  const [sharing, setSharing] = useState(vault.sharingPermission);
  const [scope, setScope] = useState(vault.communicationScope);
  const [exportPerm, setExportPerm] = useState(vault.dataExportPermission);
  const [autonomy, setAutonomy] = useState(vault.executionAutonomy);

  return (
    <div className="mt-4 pt-4 border-t border-zinc-800 space-y-4">
      <div>
        <label className="text-sm text-zinc-400 mb-2 block">Privacy Mode</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {PRIVACY_MODES.map(m => {
            const Icon = m.icon;
            return (
              <button
                key={m.value}
                onClick={() => onModeChange(m.value)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  vault.privacyMode === m.value
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                }`}
                data-testid={`button-mode-${m.value}`}
              >
                <Icon className={`w-4 h-4 ${m.color} mb-1`} />
                <p className="text-white text-xs font-medium">{m.label}</p>
                <p className="text-zinc-500 text-[10px]">{m.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
          <div>
            <p className="text-white text-sm">Learning Permission</p>
            <p className="text-zinc-500 text-xs">Allow agent to learn from interactions</p>
          </div>
          <Switch checked={learning} onCheckedChange={setLearning} data-testid="switch-learning" />
        </div>
        <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
          <div>
            <p className="text-white text-sm">Sharing Permission</p>
            <p className="text-zinc-500 text-xs">Allow data sharing with others</p>
          </div>
          <Switch checked={sharing} onCheckedChange={setSharing} data-testid="switch-sharing" />
        </div>
        <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
          <div>
            <p className="text-white text-sm">Data Export</p>
            <p className="text-zinc-500 text-xs">Allow external data export</p>
          </div>
          <Switch checked={exportPerm} onCheckedChange={setExportPerm} data-testid="switch-export" />
        </div>
        <div className="p-3 bg-zinc-800/50 rounded-lg">
          <p className="text-white text-sm mb-2">Communication Scope</p>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white" data-testid="select-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="owner_only">Owner Only</SelectItem>
              <SelectItem value="allowed_agents">Allowed Agents</SelectItem>
              <SelectItem value="same_team">Same Team</SelectItem>
              <SelectItem value="platform_wide">Platform Wide</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="p-3 bg-zinc-800/50 rounded-lg">
          <p className="text-white text-sm mb-2">Execution Autonomy</p>
          <Select value={autonomy} onValueChange={setAutonomy}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white" data-testid="select-autonomy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="supervised">Supervised</SelectItem>
              <SelectItem value="semi_autonomous">Semi Autonomous</SelectItem>
              <SelectItem value="fully_autonomous">Fully Autonomous</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        onClick={() => onSave({
          learningPermission: learning,
          sharingPermission: sharing,
          communicationScope: scope,
          dataExportPermission: exportPerm,
          executionAutonomy: autonomy,
        })}
        disabled={isPending}
        data-testid="button-save-restrictions"
      >
        {isPending ? "Saving..." : "Save Restrictions"}
      </Button>
    </div>
  );
}

function AccessLogsTab({ logs }: { logs: any[] }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">Access Logs</h3>
      {logs.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-8 text-center">
            <Activity className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400">No access logs recorded yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            <div className="divide-y divide-zinc-800">
              {logs.map((log: any) => (
                <div key={log.id} className="p-3 flex items-center justify-between" data-testid={`log-entry-${log.id}`}>
                  <div className="flex items-center gap-3">
                    {log.granted ? (
                      <div className="p-1.5 bg-green-500/10 rounded"><Check className="w-4 h-4 text-green-400" /></div>
                    ) : (
                      <div className="p-1.5 bg-red-500/10 rounded"><X className="w-4 h-4 text-red-400" /></div>
                    )}
                    <div>
                      <p className="text-white text-sm">
                        <span className="font-medium">{log.action}</span>
                        <span className="text-zinc-500"> on </span>
                        <span className="text-zinc-300">{log.resourceType}</span>
                      </p>
                      <p className="text-zinc-500 text-xs">
                        By {log.requesterType} ({log.requesterId.slice(0, 8)}...) - {log.reason}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={log.granted ? "default" : "destructive"} className="text-xs">
                      {log.granted ? "Granted" : "Blocked"}
                    </Badge>
                    <span className="text-zinc-500 text-xs">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ViolationsTab({ violations, queryClient }: { violations: any[]; queryClient: any }) {
  const resolve = useMutation({
    mutationFn: ({ id, actionTaken }: { id: string; actionTaken: string }) =>
      fetchWithAuth(`/api/privacy/violations/${id}/resolve`, { method: "PUT", body: JSON.stringify({ actionTaken }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/privacy/violations"] }),
  });

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-yellow-400" /> Privacy Violations
      </h3>
      {violations.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-8 text-center">
            <ShieldCheck className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <p className="text-zinc-400">No violations detected. All agent privacy is secure.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {violations.map((v: any) => (
            <Card key={v.id} className={`border ${v.resolved ? "bg-zinc-900 border-zinc-800" : "bg-red-500/5 border-red-500/20"}`}
              data-testid={`violation-card-${v.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={v.severity === "critical" ? "destructive" : v.severity === "high" ? "destructive" : "secondary"}>
                        {v.severity}
                      </Badge>
                      <span className="text-white text-sm font-medium">{v.violationType}</span>
                      {v.resolved && <Badge variant="outline" className="text-green-400 border-green-400/30">Resolved</Badge>}
                    </div>
                    <p className="text-zinc-400 text-sm">{v.description}</p>
                    <p className="text-zinc-500 text-xs mt-1">
                      Violator: {v.violatorId.slice(0, 12)}... | {new Date(v.createdAt).toLocaleString()}
                    </p>
                    {v.actionTaken && <p className="text-green-400 text-xs mt-1">Action: {v.actionTaken}</p>}
                  </div>
                  {!v.resolved && (
                    <Button size="sm" variant="outline"
                      onClick={() => resolve.mutate({ id: v.id, actionTaken: "Acknowledged and reviewed" })}
                      data-testid={`button-resolve-${v.id}`}
                    >
                      Resolve
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function FounderTab({ data }: { data: any }) {
  if (!data) {
    return <div className="text-zinc-400 py-8 text-center">Loading founder monitoring data...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-white" data-testid="founder-total-violations">{data.totalViolations}</p>
            <p className="text-xs text-zinc-500">Total Violations</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-400" data-testid="founder-unresolved">{data.unresolvedViolations?.length || 0}</p>
            <p className="text-xs text-zinc-500">Unresolved</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-400">{data.activeRules}</p>
            <p className="text-xs text-zinc-500">Gateway Rules</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-400">{data.severityBreakdown?.critical || 0}</p>
            <p className="text-xs text-zinc-500">Critical</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-lg">Severity Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Critical", count: data.severityBreakdown?.critical || 0, color: "bg-red-500" },
              { label: "High", count: data.severityBreakdown?.high || 0, color: "bg-orange-500" },
              { label: "Medium", count: data.severityBreakdown?.medium || 0, color: "bg-yellow-500" },
              { label: "Low", count: data.severityBreakdown?.low || 0, color: "bg-blue-500" },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${s.color}`} />
                <span className="text-zinc-300 text-sm">{s.label}: {s.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {(data.unresolvedViolations || []).length > 0 && (
        <Card className="bg-red-500/5 border-red-500/20">
          <CardHeader>
            <CardTitle className="text-red-400 text-lg flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" /> Unresolved Violations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.unresolvedViolations.map((v: any) => (
                <div key={v.id} className="p-3 bg-zinc-900/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="destructive">{v.severity}</Badge>
                    <span className="text-white text-sm">{v.violationType}</span>
                  </div>
                  <p className="text-zinc-400 text-xs">{v.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MyDataTab({ userId, requests, queryClient }: { userId: string; requests: any[]; queryClient: any }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const exportMutation = useMutation({
    mutationFn: () => fetchWithAuth("/api/user-data/export", { method: "POST", body: JSON.stringify({ userId }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/user-data/requests"] }),
  });

  const deletionMutation = useMutation({
    mutationFn: () => fetchWithAuth("/api/user-data/deletion", { method: "POST", body: JSON.stringify({ userId }) }),
    onSuccess: () => {
      setConfirmDelete(false);
      queryClient.invalidateQueries({ queryKey: ["/api/user-data/requests"] });
    },
  });

  const STATUS_STYLES: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    processing: "bg-blue-500/20 text-blue-400",
    completed: "bg-green-500/20 text-green-400",
    failed: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Download className="w-5 h-5 text-blue-400" /> Export My Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-zinc-400 text-sm">Download a copy of all your data including posts, comments, profile information, and activity history.</p>
            <Button
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-request-export"
            >
              {exportMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
              Request Data Export
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-400" /> Delete My Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-zinc-400 text-sm">Permanently delete all your data from the platform. This action cannot be undone.</p>
            {!confirmDelete ? (
              <Button
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
                data-testid="button-start-deletion"
              >
                <Trash2 className="w-4 h-4 mr-2" /> Request Data Deletion
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  onClick={() => deletionMutation.mutate()}
                  disabled={deletionMutation.isPending}
                  data-testid="button-confirm-deletion"
                >
                  {deletionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Confirm Deletion
                </Button>
                <Button variant="outline" onClick={() => setConfirmDelete(false)} data-testid="button-cancel-deletion">Cancel</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-lg flex items-center gap-2">
            <Clock className="w-5 h-5 text-zinc-400" /> Request History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-zinc-500 text-center py-6" data-testid="text-no-requests">No data requests yet</p>
          ) : (
            <div className="space-y-2">
              {requests.map((req: any) => (
                <div key={req.id} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg" data-testid={`data-request-${req.id}`}>
                  <div className="flex items-center gap-3">
                    {req.requestType === "export" ? <Download className="w-4 h-4 text-blue-400" /> : <Trash2 className="w-4 h-4 text-red-400" />}
                    <div>
                      <span className="text-white text-sm font-medium capitalize">{req.requestType}</span>
                      <p className="text-zinc-500 text-xs">{new Date(req.requestedAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <Badge className={STATUS_STYLES[req.status] || ""}>{req.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
