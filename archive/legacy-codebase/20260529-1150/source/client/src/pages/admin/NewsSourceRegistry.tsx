import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Globe,
  Loader2,
  Plus,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";

interface PreviewResult {
  ok: boolean;
  status?: number;
  itemCount?: number;
  sampleTitle?: string;
  error?: string;
  message?: string;
}

interface NewsSource {
  id: string;
  name: string;
  url: string;
  type: "free" | "paid" | "regional";
  country: string;
  language: string;
  reliabilityScore: number;
  licenseStatus: "unknown" | "public_rss" | "licensed" | "partner" | "owned";
  tier: string;
  enabled: boolean;
  notes?: string | null;
  lastCheckedAt?: string | null;
  lastCheckStatus?: "ok" | "warning" | "error" | null;
  lastCheckItemCount?: number | null;
  lastCheckError?: string | null;
  lastCheckHttpStatus?: number | null;
  consecutiveFailures?: number | null;
  createdAt: string;
  updatedAt: string;
}

const BROKEN_FEED_THRESHOLD = 3;

interface ListResponse {
  ok: boolean;
  count: number;
  activeCount: number;
  sources: NewsSource[];
}

const LICENSE_OPTIONS: NewsSource["licenseStatus"][] = [
  "unknown",
  "public_rss",
  "licensed",
  "partner",
  "owned",
];
const TYPE_OPTIONS: NewsSource["type"][] = ["free", "paid", "regional"];

interface FormState {
  name: string;
  url: string;
  type: NewsSource["type"];
  country: string;
  language: string;
  reliabilityScore: number;
  licenseStatus: NewsSource["licenseStatus"];
  tier: string;
  enabled: boolean;
  notes: string;
}

const emptyForm: FormState = {
  name: "",
  url: "",
  type: "free",
  country: "global",
  language: "en",
  reliabilityScore: 0.7,
  licenseStatus: "public_rss",
  tier: "standard",
  enabled: true,
  notes: "",
};

class AdminFetchError extends Error {
  field?: string;
  code?: string;
  constructor(message: string, opts?: { field?: string; code?: string }) {
    super(message);
    this.field = opts?.field;
    this.code = opts?.code;
  }
}

async function adminFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const csrfRes = await fetch("/api/auth/csrf-token", { credentials: "include" });
  const csrf = (await csrfRes.json())?.csrfToken as string | undefined;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    credentials: "include",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AdminFetchError(
      data?.message || data?.error || `Request failed (${res.status})`,
      { field: data?.field, code: data?.error },
    );
  }
  return data as T;
}

function licenseBadge(status: NewsSource["licenseStatus"]) {
  switch (status) {
    case "unknown":
      return (
        <Badge variant="destructive" className="gap-1" data-testid={`badge-license-${status}`}>
          <ShieldAlert className="w-3 h-3" /> Unknown — excluded
        </Badge>
      );
    case "public_rss":
      return (
        <Badge variant="secondary" className="gap-1" data-testid={`badge-license-${status}`}>
          <Globe className="w-3 h-3" /> Public RSS
        </Badge>
      );
    case "licensed":
      return (
        <Badge className="gap-1 bg-emerald-600 text-white" data-testid={`badge-license-${status}`}>
          <ShieldCheck className="w-3 h-3" /> Licensed
        </Badge>
      );
    case "partner":
      return (
        <Badge className="gap-1 bg-blue-600 text-white" data-testid={`badge-license-${status}`}>
          <CheckCircle2 className="w-3 h-3" /> Partner
        </Badge>
      );
    case "owned":
      return (
        <Badge className="gap-1 bg-purple-600 text-white" data-testid={`badge-license-${status}`}>
          <ShieldCheck className="w-3 h-3" /> Owned
        </Badge>
      );
  }
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "never";
  const diff = Date.now() - t;
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function HealthBadge({ source }: { source: NewsSource }) {
  const failures = source.consecutiveFailures ?? 0;
  const status = source.lastCheckStatus;
  const itemCount = source.lastCheckItemCount;
  const broken = failures >= BROKEN_FEED_THRESHOLD;
  const checked = formatRelative(source.lastCheckedAt);
  const error = source.lastCheckError || undefined;

  let badge;
  if (!status) {
    badge = (
      <Badge variant="outline" className="gap-1" data-testid={`badge-health-${source.id}`}>
        <Clock className="w-3 h-3" /> Not checked
      </Badge>
    );
  } else if (broken) {
    badge = (
      <Badge variant="destructive" className="gap-1" data-testid={`badge-health-${source.id}`}>
        <XCircle className="w-3 h-3" /> Broken · {failures}×
      </Badge>
    );
  } else if (status === "error") {
    badge = (
      <Badge variant="destructive" className="gap-1" data-testid={`badge-health-${source.id}`}>
        <AlertTriangle className="w-3 h-3" /> Failing
      </Badge>
    );
  } else if (status === "warning") {
    badge = (
      <Badge className="gap-1 bg-amber-500 text-white" data-testid={`badge-health-${source.id}`}>
        <AlertTriangle className="w-3 h-3" /> Empty
      </Badge>
    );
  } else {
    badge = (
      <Badge className="gap-1 bg-emerald-600 text-white" data-testid={`badge-health-${source.id}`}>
        <CheckCircle2 className="w-3 h-3" /> OK
      </Badge>
    );
  }

  return (
    <div className="space-y-1">
      {badge}
      <div className="text-xs text-muted-foreground" data-testid={`text-health-meta-${source.id}`}>
        {status === "ok" && typeof itemCount === "number" ? `${itemCount} items · ` : ""}
        {checked}
      </div>
      {error && status !== "ok" && (
        <div
          className="text-xs text-red-500 max-w-[220px] truncate"
          title={error}
          data-testid={`text-health-error-${source.id}`}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function ReliabilityBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const tone =
    pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : pct >= 40 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="w-32" data-testid={`bar-reliability-${pct.toFixed(0)}`}>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-muted-foreground mt-1">{pct.toFixed(0)}%</div>
    </div>
  );
}

export default function NewsSourceRegistry() {
  const [, navigate] = useLocation();
  const { isLoading: authLoading, isAuthenticated } = useAdminAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [confirmFailedSave, setConfirmFailedSave] = useState(false);

  const runPreview = async () => {
    const url = form.url.trim();
    if (!url) {
      toast({ title: "Enter a URL first", variant: "destructive" });
      return;
    }
    setPreviewLoading(true);
    setPreviewResult(null);
    try {
      const result = await adminFetch<PreviewResult>(
        "/api/admin/news-sources/preview",
        { method: "POST", body: JSON.stringify({ url }) },
      );
      setPreviewResult(result);
    } catch (err) {
      setPreviewResult({
        ok: false,
        message: (err as Error).message || "Test failed",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const query = useQuery<ListResponse>({
    queryKey: ["admin-news-sources"],
    queryFn: () => adminFetch<ListResponse>("/api/admin/news-sources"),
    enabled: isAuthenticated,
    refetchOnWindowFocus: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-news-sources"] });

  const createMut = useMutation({
    mutationFn: (body: FormState) =>
      adminFetch<{ ok: boolean }>("/api/admin/news-sources", {
        method: "POST",
        body: JSON.stringify({ ...body, notes: body.notes || undefined }),
      }),
    onSuccess: () => {
      toast({ title: "Source created" });
      setDialogOpen(false);
      setForm(emptyForm);
      setUrlError(null);
      invalidate();
    },
    onError: (err: Error) => {
      if (err instanceof AdminFetchError && err.field === "url") {
        setUrlError(err.message);
      }
      toast({ title: "Create failed", description: err.message, variant: "destructive" });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<FormState> }) =>
      adminFetch<{ ok: boolean }>(`/api/admin/news-sources/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...body, notes: body.notes || undefined }),
      }),
    onSuccess: () => {
      toast({ title: "Source updated" });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setUrlError(null);
      invalidate();
    },
    onError: (err: Error) => {
      if (err instanceof AdminFetchError && err.field === "url") {
        setUrlError(err.message);
      }
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const disableMut = useMutation({
    mutationFn: (id: string) =>
      adminFetch<{ ok: boolean }>(`/api/admin/news-sources/${id}/disable`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Source disabled" });
      invalidate();
    },
    onError: (err: Error) => toast({ title: "Disable failed", description: err.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/admin/login", { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  const sources = query.data?.sources || [];
  const unknownCount = useMemo(() => sources.filter((s) => s.licenseStatus === "unknown").length, [sources]);
  const disabledCount = useMemo(() => sources.filter((s) => !s.enabled).length, [sources]);
  const brokenCount = useMemo(
    () => sources.filter((s) => (s.consecutiveFailures ?? 0) >= BROKEN_FEED_THRESHOLD).length,
    [sources],
  );

  const checkMut = useMutation({
    mutationFn: (id: string) =>
      adminFetch<{ ok: boolean }>(`/api/admin/news-sources/${id}/check`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Feed re-checked" });
      invalidate();
    },
    onError: (err: Error) => toast({ title: "Check failed", description: err.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setUrlError(null);
    setPreviewResult(null);
    setConfirmFailedSave(false);
    setDialogOpen(true);
  };
  const openEdit = (s: NewsSource) => {
    setEditingId(s.id);
    setUrlError(null);
    setPreviewResult(null);
    setConfirmFailedSave(false);
    setForm({
      name: s.name,
      url: s.url,
      type: s.type,
      country: s.country,
      language: s.language,
      reliabilityScore: s.reliabilityScore,
      licenseStatus: s.licenseStatus,
      tier: s.tier,
      enabled: s.enabled,
      notes: s.notes || "",
    });
    setDialogOpen(true);
  };

  const previewMatchesCurrentUrl =
    previewResult !== null && form.url.trim().length > 0;
  const previewPassedForCurrentUrl =
    previewMatchesCurrentUrl && previewResult!.ok === true;
  const previewFailedForCurrentUrl =
    previewMatchesCurrentUrl && previewResult!.ok === false;
  const noPreviewForCurrentUrl =
    previewResult === null && form.url.trim().length > 0;

  // Hard gate: an enabled save requires a fresh passing preview for the
  // current URL. "Save anyway" is only allowed for disabled (draft) saves.
  const enabledSaveBlocked = form.enabled && !previewPassedForCurrentUrl;
  const canForceDraftSave = !form.enabled && previewFailedForCurrentUrl;

  const submit = () => {
    if (!form.name.trim() || !form.url.trim()) {
      toast({ title: "Name and URL required", variant: "destructive" });
      return;
    }
    if (enabledSaveBlocked) {
      toast({
        title: "Feed test required",
        description:
          "Run \"Test feed\" and get a passing result before enabling this source. To save without enabling, toggle Enabled off first.",
        variant: "destructive",
      });
      return;
    }
    if (canForceDraftSave && !confirmFailedSave) {
      setConfirmFailedSave(true);
      toast({
        title: "Feed test failed",
        description: "Click \"Save anyway\" to save as a disabled draft.",
        variant: "destructive",
      });
      return;
    }
    if (editingId) updateMut.mutate({ id: editingId, body: form });
    else createMut.mutate(form);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin/dashboard")} data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <div>
              <h1 className="text-xl font-semibold" data-testid="heading-title">News Source Registry</h1>
              <p className="text-xs text-muted-foreground">
                Newsroom T2 — global registry. Sources with license status <code>unknown</code> are excluded from the active pipeline.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => query.refetch()} data-testid="button-refresh">
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
            <Button size="sm" onClick={openCreate} data-testid="button-create">
              <Plus className="w-4 h-4 mr-1" /> Add source
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="p-4" data-testid="card-stat-total">
            <div className="text-xs text-muted-foreground">Total sources</div>
            <div className="text-2xl font-semibold">{query.data?.count ?? "—"}</div>
          </Card>
          <Card className="p-4" data-testid="card-stat-active">
            <div className="text-xs text-muted-foreground">Active in pipeline</div>
            <div className="text-2xl font-semibold text-emerald-500">{query.data?.activeCount ?? "—"}</div>
          </Card>
          <Card className="p-4" data-testid="card-stat-unknown">
            <div className="text-xs text-muted-foreground">Unknown license (excluded)</div>
            <div className="text-2xl font-semibold text-red-500 flex items-center gap-2">
              {unknownCount}
              {unknownCount > 0 && <AlertTriangle className="w-5 h-5" />}
            </div>
          </Card>
          <Card className="p-4" data-testid="card-stat-disabled">
            <div className="text-xs text-muted-foreground">Disabled</div>
            <div className="text-2xl font-semibold text-muted-foreground">{disabledCount}</div>
          </Card>
          <Card className="p-4" data-testid="card-stat-broken">
            <div className="text-xs text-muted-foreground">Broken feeds (≥{BROKEN_FEED_THRESHOLD} fails)</div>
            <div className="text-2xl font-semibold text-red-500 flex items-center gap-2">
              {brokenCount}
              {brokenCount > 0 && <XCircle className="w-5 h-5" />}
            </div>
          </Card>
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="font-medium">Sources</div>
            {query.isFetching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          {query.isLoading ? (
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : query.isError ? (
            <div className="p-6 text-sm text-red-500" data-testid="text-list-error">
              Failed to load sources: {(query.error as Error)?.message || "unknown error"}
            </div>
          ) : sources.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground" data-testid="text-empty">
              No sources yet. Click "Add source" to add the first one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2">Name</th>
                    <th className="text-left px-4 py-2">License</th>
                    <th className="text-left px-4 py-2">Type</th>
                    <th className="text-left px-4 py-2">Country / Lang</th>
                    <th className="text-left px-4 py-2">Reliability</th>
                    <th className="text-left px-4 py-2">Health</th>
                    <th className="text-left px-4 py-2">Enabled</th>
                    <th className="text-right px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <tr
                      key={s.id}
                      className="border-t border-border hover:bg-muted/20"
                      data-testid={`row-source-${s.id}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium" data-testid={`text-name-${s.id}`}>{s.name}</span>
                          {!s.enabled && s.lastCheckStatus === "error" && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-amber-500/50 text-amber-600 dark:text-amber-300"
                              data-testid={`badge-draft-failed-${s.id}`}
                            >
                              <AlertTriangle className="w-3 h-3" /> Draft — failed feed test
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[360px]" title={s.url}>
                          {s.url}
                        </div>
                      </td>
                      <td className="px-4 py-3">{licenseBadge(s.licenseStatus)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" data-testid={`badge-type-${s.id}`}>{s.type}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Badge variant="outline">{s.country}</Badge>
                          <Badge variant="outline">{s.language}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3"><ReliabilityBar value={s.reliabilityScore} /></td>
                      <td className="px-4 py-3"><HealthBadge source={s} /></td>
                      <td className="px-4 py-3">
                        {s.enabled ? (
                          <Badge className="bg-emerald-600 text-white">on</Badge>
                        ) : (
                          <Badge variant="secondary">off</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => checkMut.mutate(s.id)}
                          disabled={checkMut.isPending && checkMut.variables === s.id}
                          data-testid={`button-recheck-${s.id}`}
                        >
                          {checkMut.isPending && checkMut.variables === s.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Re-check"
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(s)}
                          data-testid={`button-edit-${s.id}`}
                        >
                          Edit
                        </Button>
                        {s.enabled && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => disableMut.mutate(s.id)}
                            disabled={disableMut.isPending}
                            data-testid={`button-disable-${s.id}`}
                          >
                            Disable
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-source-form">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit news source" : "Add news source"}</DialogTitle>
            <DialogDescription>
              Sources with license status <code>unknown</code> are not read by the active pipeline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="src-name">Name</Label>
              <Input
                id="src-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="input-name"
              />
            </div>
            <div>
              <Label htmlFor="src-url">RSS / Feed URL</Label>
              <div className="flex gap-2">
                <Input
                  id="src-url"
                  value={form.url}
                  onChange={(e) => {
                    setForm({ ...form, url: e.target.value });
                    if (urlError) setUrlError(null);
                    if (previewResult) setPreviewResult(null);
                    if (confirmFailedSave) setConfirmFailedSave(false);
                  }}
                  placeholder="https://example.com/feed.xml"
                  aria-invalid={urlError ? true : undefined}
                  className={urlError ? "border-red-500 focus-visible:ring-red-500" : undefined}
                  data-testid="input-url"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={runPreview}
                  disabled={previewLoading || !form.url.trim()}
                  data-testid="button-test-feed"
                >
                  {previewLoading ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <PlayCircle className="w-4 h-4 mr-1" />
                  )}
                  Test feed
                </Button>
              </div>
              {urlError && (
                <div
                  className="mt-1 flex items-start gap-1 text-xs text-red-500"
                  data-testid="text-url-error"
                >
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{urlError}</span>
                </div>
              )}
              {previewResult && (
                previewResult.ok ? (
                  <div
                    className="mt-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-300"
                    data-testid="text-preview-success"
                  >
                    <div className="flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Feed OK · HTTP {previewResult.status ?? 200} · {previewResult.itemCount} item
                      {previewResult.itemCount === 1 ? "" : "s"}
                    </div>
                    {previewResult.sampleTitle && (
                      <div className="mt-1 text-muted-foreground">
                        First item: <span className="text-foreground">{previewResult.sampleTitle}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300"
                    data-testid="text-preview-error"
                  >
                    <div className="flex items-start gap-1 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>
                        {previewResult.message || "Feed test failed."}
                        {previewResult.status ? ` (HTTP ${previewResult.status})` : ""}
                      </span>
                    </div>
                  </div>
                )
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as NewsSource["type"] })}>
                  <SelectTrigger data-testid="select-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t} data-testid={`option-type-${t}`}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>License status</Label>
                <Select
                  value={form.licenseStatus}
                  onValueChange={(v) => setForm({ ...form, licenseStatus: v as NewsSource["licenseStatus"] })}
                >
                  <SelectTrigger data-testid="select-license"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LICENSE_OPTIONS.map((l) => (
                      <SelectItem key={l} value={l} data-testid={`option-license-${l}`}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="src-country">Country</Label>
                <Input
                  id="src-country"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  data-testid="input-country"
                />
              </div>
              <div>
                <Label htmlFor="src-lang">Language</Label>
                <Input
                  id="src-lang"
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                  data-testid="input-language"
                />
              </div>
              <div>
                <Label htmlFor="src-tier">Tier</Label>
                <Input
                  id="src-tier"
                  value={form.tier}
                  onChange={(e) => setForm({ ...form, tier: e.target.value })}
                  data-testid="input-tier"
                />
              </div>
              <div>
                <Label htmlFor="src-reliability">Reliability (0–1)</Label>
                <Input
                  id="src-reliability"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={form.reliabilityScore}
                  onChange={(e) => setForm({ ...form, reliabilityScore: Number(e.target.value) })}
                  data-testid="input-reliability"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="src-notes">Notes</Label>
              <Textarea
                id="src-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                data-testid="input-notes"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div>
                <div className="text-sm font-medium">Enabled</div>
                <div className="text-xs text-muted-foreground">When off, the source is excluded from collection.</div>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm({ ...form, enabled: !!v })}
                data-testid="switch-enabled"
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row sm:items-center gap-2">
            {enabledSaveBlocked && (
              <div
                className="flex items-start gap-1 text-xs text-red-500 sm:mr-auto"
                data-testid="text-save-gate-enabled-blocked"
              >
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                <span>
                  {previewFailedForCurrentUrl
                    ? "Feed test failed — toggle Enabled off to save as draft."
                    : "Run \"Test feed\" and get a passing result before enabling."}
                </span>
              </div>
            )}
            {canForceDraftSave && !confirmFailedSave && (
              <div
                className="flex items-start gap-1 text-xs text-amber-600 sm:mr-auto"
                data-testid="text-save-gate-failed"
              >
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                <span>Feed test failed — click Save again to save as a disabled draft.</span>
              </div>
            )}
            {noPreviewForCurrentUrl && !enabledSaveBlocked && (
              <div
                className="text-xs text-muted-foreground sm:mr-auto"
                data-testid="text-save-gate-untested"
              >
                Tip: test this feed first.
              </div>
            )}
            <Button variant="ghost" onClick={() => setDialogOpen(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={
                createMut.isPending || updateMut.isPending || enabledSaveBlocked
              }
              variant={canForceDraftSave && confirmFailedSave ? "destructive" : "default"}
              data-testid="button-save"
            >
              {(createMut.isPending || updateMut.isPending) && (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              )}
              {canForceDraftSave && confirmFailedSave
                ? "Save anyway (draft)"
                : form.enabled
                  ? editingId
                    ? "Save enabled feed"
                    : "Create enabled feed"
                  : editingId
                    ? "Save changes"
                    : "Create source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
