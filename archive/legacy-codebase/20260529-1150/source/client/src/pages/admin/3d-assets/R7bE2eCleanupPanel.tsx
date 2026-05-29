import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, PlayCircle, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";

type Candidate = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  byteSize: number;
  permanentAvatarRefs: number;
  boundByPermanentAvatar: boolean;
};

type PreviewResponse = {
  ok: boolean;
  candidates: Candidate[];
  cutoff: string;
  prefix: string;
  hours: number;
  defaults: { hours: number; prefix: string };
};

type RunSummary = {
  scanned: number;
  archivedSkipped: number;
  archived: number;
  deleted: number;
  skippedReferenced: number;
  errors: Array<{ id: string; kind: string; error: string }>;
};

type RunResponse = {
  ok: boolean;
  summary: RunSummary;
  cutoff: string;
  prefix: string;
  hours: number;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

type Props = {
  kind: "asset" | "rig";
};

export default function R7bE2eCleanupPanel({ kind }: Props) {
  const base =
    kind === "asset"
      ? "/api/admin/production-assets"
      : "/api/admin/production-rigs";
  const previewUrl = `${base}/r7b-e2e-cleanup/preview`;
  const runUrl = `${base}/r7b-e2e-cleanup/run`;
  const label = kind === "asset" ? "asset" : "rig";

  const storageKey = `mougle.r7b-cleanup.hours.${kind}`;
  const presetOptions = new Set(["0", "6", "24", "72", "168"]);

  const readInitial = (): { mode: string; custom: string } => {
    if (typeof window === "undefined") return { mode: "24", custom: "24" };
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return { mode: "24", custom: "24" };
      const parsed = JSON.parse(raw) as { mode?: unknown; custom?: unknown };
      const mode = typeof parsed.mode === "string" ? parsed.mode : "24";
      const custom = typeof parsed.custom === "string" ? parsed.custom : "24";
      if (mode === "custom") {
        const n = Number.parseInt(custom, 10);
        if (!Number.isFinite(n) || n < 0 || n > 24 * 365) {
          return { mode: "24", custom: "24" };
        }
        return { mode, custom };
      }
      if (!presetOptions.has(mode)) return { mode: "24", custom: "24" };
      return { mode, custom };
    } catch {
      return { mode: "24", custom: "24" };
    }
  };

  const [lastRun, setLastRun] = useState<RunResponse | null>(null);
  const initial = readInitial();
  const [hoursMode, setHoursMode] = useState<string>(initial.mode);
  const [customHours, setCustomHours] = useState<string>(initial.custom);
  const [prefix, setPrefix] = useState<string>("r7b-e2e");

  const trimmedPrefix = prefix.trim();
  const prefixValid = trimmedPrefix.length >= 1 && trimmedPrefix.length <= 64;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ mode: hoursMode, custom: customHours }),
      );
    } catch {
      // ignore quota/serialization errors
    }
  }, [storageKey, hoursMode, customHours]);

  const parsedCustomHours = Number.parseInt(customHours, 10);
  const customValid =
    Number.isFinite(parsedCustomHours) &&
    parsedCustomHours >= 0 &&
    parsedCustomHours <= 24 * 365;
  const effectiveHours =
    hoursMode === "custom"
      ? customValid
        ? parsedCustomHours
        : null
      : Number.parseInt(hoursMode, 10);

  const previewQueryUrl = (() => {
    const params = new URLSearchParams();
    if (effectiveHours !== null) params.set("hours", String(effectiveHours));
    if (prefixValid) params.set("prefix", trimmedPrefix);
    const qs = params.toString();
    return qs ? `${previewUrl}?${qs}` : previewUrl;
  })();

  const { data, isLoading, error, refetch, isFetching } =
    useQuery<PreviewResponse>({
      queryKey: [previewUrl, effectiveHours, trimmedPrefix],
      queryFn: async () => {
        const res = await apiRequest("GET", previewQueryUrl);
        return (await res.json()) as PreviewResponse;
      },
      enabled: effectiveHours !== null && prefixValid,
    });

  const runMutation = useMutation<RunResponse>({
    mutationFn: async () => {
      const body: { confirm: true; hours?: number; prefix?: string } = {
        confirm: true,
      };
      if (effectiveHours !== null) body.hours = effectiveHours;
      if (prefixValid) body.prefix = trimmedPrefix;
      const res = await apiRequest("POST", runUrl, body);
      return (await res.json()) as RunResponse;
    },
    onSuccess: (result) => {
      setLastRun(result);
      refetch();
    },
  });

  const candidates = data?.candidates ?? [];
  const eligible = candidates.filter((c) => !c.boundByPermanentAvatar);
  const blocked = candidates.filter((c) => c.boundByPermanentAvatar);

  const testId = `panel-r7b-e2e-cleanup-${kind}`;

  return (
    <Card className="mb-4 border-amber-500/30" data-testid={testId}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trash2 className="h-4 w-4 text-amber-400" />
              Test-seed cleanup ({label}s)
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Approved-internal {label} rows whose name starts with{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {data?.prefix ?? (prefixValid ? trimmedPrefix : "r7b-e2e")}
              </code>{" "}
              and were created more than{" "}
              <strong>
                {effectiveHours !== null ? effectiveHours : "?"}h
              </strong>{" "}
              ago. Running cleanup will archive + permanently delete eligible
              rows (matches the{" "}
              <code className="text-xs">scripts/cleanup-r7b-e2e-seeds.ts</code>{" "}
              CLI).
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <Label
                  htmlFor={`${testId}-prefix`}
                  className="text-xs text-muted-foreground"
                >
                  Name prefix (1–64 chars)
                </Label>
                <Input
                  id={`${testId}-prefix`}
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="r7b-e2e"
                  className={`h-8 w-[180px] ${
                    prefixValid ? "" : "border-destructive"
                  }`}
                  data-testid={`${testId}-input-prefix`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label
                  htmlFor={`${testId}-hours-select`}
                  className="text-xs text-muted-foreground"
                >
                  Cutoff age
                </Label>
                <Select value={hoursMode} onValueChange={setHoursMode}>
                  <SelectTrigger
                    id={`${testId}-hours-select`}
                    className="h-8 w-[160px]"
                    data-testid={`${testId}-select-hours`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0h (now)</SelectItem>
                    <SelectItem value="6">6h</SelectItem>
                    <SelectItem value="24">24h (default)</SelectItem>
                    <SelectItem value="72">72h</SelectItem>
                    <SelectItem value="168">168h (7d)</SelectItem>
                    <SelectItem value="custom">Custom…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {hoursMode === "custom" && (
                <div className="flex flex-col gap-1">
                  <Label
                    htmlFor={`${testId}-hours-custom`}
                    className="text-xs text-muted-foreground"
                  >
                    Hours (0–{24 * 365})
                  </Label>
                  <Input
                    id={`${testId}-hours-custom`}
                    type="number"
                    min={0}
                    max={24 * 365}
                    step={1}
                    value={customHours}
                    onChange={(e) => setCustomHours(e.target.value)}
                    className={`h-8 w-[120px] ${
                      customValid ? "" : "border-destructive"
                    }`}
                    data-testid={`${testId}-input-hours-custom`}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-amber-500/40 text-amber-500"
              data-testid={`${testId}-badge-count`}
            >
              {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid={`${testId}-button-refresh`}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Archive + permanently delete ${eligible.length} ${label} row(s)? This cannot be undone.`,
                        )
                      ) {
                        runMutation.mutate();
                      }
                    }}
                    disabled={
                      runMutation.isPending ||
                      isFetching ||
                      eligible.length === 0 ||
                      effectiveHours === null ||
                      !prefixValid
                    }
                    data-testid={`${testId}-button-run`}
                  >
                    <PlayCircle className="mr-2 h-4 w-4" />
                    {runMutation.isPending
                      ? "Cleaning…"
                      : `Clean up now (${eligible.length})`}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Runs the same flow as <code>cleanup-r7b-e2e-seeds.ts</code>:
                archive → delete object bytes → cascade DB rows.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div
            className="py-6 text-center text-sm text-muted-foreground"
            data-testid={`${testId}-loading`}
          >
            Loading candidate {label}s…
          </div>
        ) : error ? (
          <div
            className="py-6 text-center text-sm text-destructive"
            data-testid={`${testId}-error`}
          >
            Failed to load candidates: {(error as Error).message}
          </div>
        ) : candidates.length === 0 ? (
          <div
            className="py-6 text-center text-sm text-muted-foreground"
            data-testid={`${testId}-empty`}
          >
            No {label} rows match the cleanup criteria right now.
          </div>
        ) : (
          <div className="overflow-x-auto rounded border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Bound by avatar</TableHead>
                  <TableHead className="font-mono text-xs">id</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c) => {
                  const rowTestId = `${testId}-row-${c.id}`;
                  const isBound = c.boundByPermanentAvatar;
                  return (
                    <TableRow
                      key={c.id}
                      className={isBound ? "opacity-60" : ""}
                      data-testid={rowTestId}
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{c.status}</Badge>
                      </TableCell>
                      <TableCell>{formatBytes(c.byteSize)}</TableCell>
                      <TableCell title={c.createdAt}>
                        {formatAge(c.createdAt)}
                      </TableCell>
                      <TableCell>
                        {isBound ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Badge
                                  variant="outline"
                                  className="cursor-help border-amber-500/40 text-amber-400"
                                  data-testid={`${rowTestId}-bound`}
                                >
                                  <AlertTriangle className="mr-1 h-3 w-3" />
                                  bound ({c.permanentAvatarRefs})
                                </Badge>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              Referenced by {c.permanentAvatarRefs} permanent
                              avatar(s); cleanup will skip this row until the
                              avatar is unbound.
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-emerald-500/40 text-emerald-500"
                            data-testid={`${rowTestId}-eligible`}
                          >
                            eligible
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {c.id.slice(0, 8)}…
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {(eligible.length > 0 || blocked.length > 0) && (
          <div
            className="mt-3 text-xs text-muted-foreground"
            data-testid={`${testId}-summary-line`}
          >
            {eligible.length} eligible · {blocked.length} blocked by permanent
            avatar · prefix{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              {data?.prefix ?? trimmedPrefix}
            </code>{" "}
            · age ≥ {data?.hours ?? effectiveHours ?? "?"}h
            {data?.cutoff
              ? ` · cutoff ${new Date(data.cutoff).toISOString()}`
              : ""}
          </div>
        )}

        {runMutation.isError && (
          <div
            className="mt-3 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
            data-testid={`${testId}-run-error`}
          >
            Cleanup failed: {(runMutation.error as Error).message}
          </div>
        )}

        {lastRun && (
          <div
            className="mt-3 rounded border border-border bg-muted/40 p-3"
            data-testid={`${testId}-run-summary`}
          >
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Last cleanup run
            </div>
            <pre
              className="overflow-x-auto whitespace-pre-wrap text-xs"
              data-testid={`${testId}-run-summary-json`}
            >
              {JSON.stringify(lastRun, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
