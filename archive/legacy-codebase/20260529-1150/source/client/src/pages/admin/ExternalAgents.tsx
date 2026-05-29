import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  api,
  externalAgentCapabilityOptions,
  type AdminExternalAgentKey,
  type ExternalAgentCapability,
} from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldX,
} from "lucide-react";

const defaultCapabilities: ExternalAgentCapability[] = [
  "read_public_context",
  "read_public_graph",
  "read_public_passport",
  "sandbox_action_simulation",
];

function formatDate(value: string | null | undefined) {
  if (!value) return "Not used";
  return new Date(value).toLocaleString();
}

function capabilityLabel(capability: string) {
  return capability.replace(/_/g, " ");
}

function statusClass(key: AdminExternalAgentKey) {
  if (key.revokedAt || !key.active) return "bg-red-500/10 text-red-300 border-red-500/20";
  return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
}

export default function ExternalAgents() {
  const [, navigate] = useLocation();
  const { admin, isLoading: authLoading, isAuthenticated } = useAdminAuth();
  const isRootAdmin = admin?.actor?.type === "root_admin" && admin.role === "super_admin";
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [userId, setUserId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [capabilities, setCapabilities] = useState<ExternalAgentCapability[]>(defaultCapabilities);
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState("60");
  const [rateLimitPerDay, setRateLimitPerDay] = useState("1000");
  const [rawToken, setRawToken] = useState("");
  const [revokeReasonById, setRevokeReasonById] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/admin/login", { replace: true });
      return;
    }
    if (!authLoading && isAuthenticated && !isRootAdmin) {
      navigate("/staff/dashboard", { replace: true });
    }
  }, [authLoading, isAuthenticated, isRootAdmin, navigate]);

  const keysQuery = useQuery({
    queryKey: ["admin-external-agent-keys"],
    queryFn: () => api.admin.externalAgentKeys(),
    enabled: isRootAdmin,
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: () => api.admin.createExternalAgentKey({
      label: label.trim(),
      userId: userId.trim() || null,
      agentId: agentId.trim() || userId.trim() || null,
      capabilities,
      sandboxMode: true,
      active: true,
      rateLimitPerMinute: Number(rateLimitPerMinute) || 60,
      rateLimitPerDay: Number(rateLimitPerDay) || 1000,
    }),
    onSuccess: (result) => {
      setRawToken(result.rawToken);
      setLabel("");
      setUserId("");
      setAgentId("");
      setCapabilities(defaultCapabilities);
      queryClient.invalidateQueries({ queryKey: ["admin-external-agent-keys"] });
      toast({ title: "External agent key created", description: "Copy the raw token now. It will not be shown again." });
    },
    onError: (err: Error) => {
      toast({ title: "Key creation failed", description: err.message, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => api.admin.revokeExternalAgentKey(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-external-agent-keys"] });
      toast({ title: "External agent key revoked" });
    },
    onError: (err: Error) => {
      toast({ title: "Revoke failed", description: err.message, variant: "destructive" });
    },
  });

  const safeModePaused = useMemo(() => {
    const events = keysQuery.data?.recentAudit || [];
    return events.some((event: any) => event?.details?.reason === "safe_mode_external_actions_paused");
  }, [keysQuery.data?.recentAudit]);

  const toggleCapability = (capability: ExternalAgentCapability) => {
    setCapabilities((current) =>
      current.includes(capability)
        ? current.filter((item) => item !== capability)
        : [...current, capability]
    );
  };

  const copyRawToken = () => {
    if (!rawToken) return;
    navigator.clipboard.writeText(rawToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#060611] flex items-center justify-center text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading...
      </div>
    );
  }

  if (!isAuthenticated || !isRootAdmin) return null;

  return (
    <div className="min-h-screen bg-[#070711] text-white">
      <div className="border-b border-white/[0.08] bg-[#0d0d18] px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <button onClick={() => navigate("/admin/dashboard")} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4">
            <ArrowLeft className="w-4 h-4" /> Admin Dashboard
          </button>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <KeyRound className="w-8 h-8 text-cyan-300" />
                <h1 className="text-2xl font-bold">External Agents</h1>
                <Badge className="bg-red-500/10 text-red-300 border-red-500/20">Root Admin Only</Badge>
                <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Sandbox Only</Badge>
              </div>
              <p className="text-sm text-zinc-500 mt-2 max-w-3xl">
                Scoped bearer keys for third-party agents. Tokens are hashed at rest, shown once on creation, capability-gated, rate-limited, and blocked from private memory, payments, publishing, and live actions.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="border-white/10 text-zinc-300" onClick={() => navigate("/admin/safe-mode")}>
                Safe Mode
              </Button>
              <Button variant="outline" className="border-white/10 text-zinc-300" onClick={() => keysQuery.refetch()} disabled={keysQuery.isFetching}>
                {keysQuery.isFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-6">
          <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bot className="w-5 h-5 text-cyan-300" />
              <h2 className="text-lg font-semibold">Create Scoped Key</h2>
            </div>
            <div className="space-y-4">
              <div>
                <Label>Key label</Label>
                <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Research partner sandbox key" className="bg-black/30 border-white/10 mt-1" />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>User ID link</Label>
                  <Input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="Optional agent user id" className="bg-black/30 border-white/10 mt-1" />
                </div>
                <div>
                  <Label>Agent ID link</Label>
                  <Input value={agentId} onChange={(event) => setAgentId(event.target.value)} placeholder="Defaults to user ID" className="bg-black/30 border-white/10 mt-1" />
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Requests per minute</Label>
                  <Input value={rateLimitPerMinute} onChange={(event) => setRateLimitPerMinute(event.target.value)} className="bg-black/30 border-white/10 mt-1" inputMode="numeric" />
                </div>
                <div>
                  <Label>Requests per day</Label>
                  <Input value={rateLimitPerDay} onChange={(event) => setRateLimitPerDay(event.target.value)} className="bg-black/30 border-white/10 mt-1" inputMode="numeric" />
                </div>
              </div>
              <div>
                <Label>Capabilities</Label>
                <div className="grid sm:grid-cols-2 gap-2 mt-2">
                  {externalAgentCapabilityOptions.map((capability) => (
                    <label key={capability} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">
                      <input
                        type="checkbox"
                        checked={capabilities.includes(capability)}
                        onChange={() => toggleCapability(capability)}
                        className="accent-cyan-400"
                      />
                      {capabilityLabel(capability)}
                    </label>
                  ))}
                </div>
              </div>
              <Button className="bg-cyan-600 hover:bg-cyan-500 text-white" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !label.trim()}>
                {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
                Create key
              </Button>
            </div>
          </Card>

          <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-5 h-5 text-emerald-300" />
              <h2 className="text-lg font-semibold">Safety Status</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] p-3 text-emerald-100/80">
                Tokens are hashed at rest and raw tokens are displayed only once.
              </div>
              <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] p-3 text-emerald-100/80">
                External actions are sandbox/internal-review only in this phase.
              </div>
              <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] p-3 text-emerald-100/80">
                Bearer tokens do not satisfy normal user session or CSRF flows.
              </div>
              <div className={`rounded-lg border p-3 ${safeModePaused ? "border-yellow-500/20 bg-yellow-500/[0.08] text-yellow-100/80" : "border-emerald-500/15 bg-emerald-500/[0.06] text-emerald-100/80"}`}>
                {safeModePaused ? "Recent calls were blocked by external-agent safe mode." : "No recent external-agent safe-mode blocks found."}
              </div>
            </div>

            {rawToken && (
              <div className="mt-5 rounded-xl border border-yellow-500/20 bg-yellow-500/[0.08] p-4">
                <p className="text-sm font-semibold text-yellow-100">Raw token shown once</p>
                <p className="text-xs text-yellow-100/70 mt-1">Store this now. It cannot be retrieved after you leave this page.</p>
                <div className="flex gap-2 mt-3">
                  <code className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-yellow-100 break-all">{rawToken}</code>
                  <Button variant="outline" className="border-yellow-500/20 text-yellow-100" onClick={copyRawToken}>
                    {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold">External Agent Keys</h2>
            <Badge className="bg-zinc-500/10 text-zinc-300 border-zinc-500/20">
              {keysQuery.data?.keys.length || 0} keys
            </Badge>
          </div>
          {keysQuery.isLoading ? (
            <div className="py-12 text-center text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              Loading keys...
            </div>
          ) : keysQuery.error ? (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-200">
              {(keysQuery.error as Error).message}
            </div>
          ) : (
            <div className="space-y-3">
              {(keysQuery.data?.keys || []).map((key) => (
                <div key={key.id} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-white">{key.label}</h3>
                        <Badge className={statusClass(key)}>{key.revokedAt || !key.active ? "inactive" : "active"}</Badge>
                        <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">sandbox</Badge>
                      </div>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 text-xs text-zinc-400">
                        <div>
                          <p className="text-zinc-500">Token prefix</p>
                          <p className="font-mono text-zinc-200">{key.tokenPrefix}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500">Agent link</p>
                          <p className="font-mono text-zinc-200">{key.agentId || key.userId || "unlinked"}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500">Rate limits</p>
                          <p className="text-zinc-200">{key.rateLimitPerMinute}/min · {key.rateLimitPerDay}/day</p>
                        </div>
                        <div>
                          <p className="text-zinc-500">Last used</p>
                          <p className="text-zinc-200">{formatDate(key.lastUsedAt)}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {key.capabilities.map((capability) => (
                          <Badge key={capability} className="bg-white/[0.04] text-zinc-300 border-white/[0.06]">
                            {capabilityLabel(capability)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="xl:w-72 space-y-2">
                      <Textarea
                        value={revokeReasonById[key.id] || ""}
                        onChange={(event) => setRevokeReasonById({ ...revokeReasonById, [key.id]: event.target.value })}
                        placeholder="Optional revoke reason"
                        className="bg-black/30 border-white/10 text-xs min-h-20"
                        disabled={Boolean(key.revokedAt)}
                      />
                      <Button
                        variant="outline"
                        className="w-full border-red-500/20 text-red-200 bg-red-500/10 hover:bg-red-500/20"
                        onClick={() => revokeMutation.mutate({ id: key.id, reason: revokeReasonById[key.id] })}
                        disabled={Boolean(key.revokedAt) || revokeMutation.isPending}
                      >
                        <ShieldX className="w-4 h-4 mr-2" />
                        Revoke key
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {(!keysQuery.data?.keys || keysQuery.data.keys.length === 0) && (
                <div className="py-10 text-center text-sm text-zinc-500">
                  No external agent keys yet.
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="bg-[#10101a]/90 border-white/[0.08] p-5">
          <h2 className="text-lg font-semibold mb-4">Recent External-Agent Audit</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {(keysQuery.data?.recentAudit || []).map((event: any) => (
              <div key={event.id} className="rounded-lg border border-white/[0.06] bg-black/20 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={event.outcome === "success" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-red-500/10 text-red-300 border-red-500/20"}>
                      {event.outcome}
                    </Badge>
                    <span className="text-zinc-200">{event.action}</span>
                  </div>
                  <span className="text-zinc-500">{formatDate(event.createdAt)}</span>
                </div>
                <p className="text-zinc-500 mt-2">
                  key {event.details?.tokenPrefix || event.resourceId || "unknown"} · {event.details?.route || event.resourceType || "external-agent"}
                </p>
              </div>
            ))}
            {(!keysQuery.data?.recentAudit || keysQuery.data.recentAudit.length === 0) && (
              <p className="text-sm text-zinc-500">No external-agent audit events recorded yet.</p>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
