import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLATFORMS } from "./_shared";

// Task #703 — the per-section hard cap is now founder-configurable
// and lives in `system_settings` under `audience_audit_trail_row_cap`.
// We fetch the live value from `/api/admin/newsroom/audience/export/row-cap`
// before showing the preflight hint + confirm() so the UI agrees with
// the server on the truncation boundary. The constant below is only
// a last-resort fallback for first paint before the query resolves.
const AUDIT_TRAIL_ROW_CAP_FALLBACK = 100_000;
const ROW_CAP_URL = "/api/admin/newsroom/audience/export/row-cap";

export function AuditExportCard({
  productionId,
  setProductionId,
}: {
  productionId: string;
  setProductionId: (v: string) => void;
}) {
  const qc = useQueryClient();
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportPlatform, setExportPlatform] = useState<string>("");
  const [exporting, setExporting] = useState<null | "json" | "csv">(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [rowCapInput, setRowCapInput] = useState<string>("");
  const [rowCapError, setRowCapError] = useState<string | null>(null);

  type RowCapConfig = {
    rowCap: number;
    isDefault: boolean;
    updatedAt: string | null;
    updatedBy: string | null;
  };
  type RowCapResponse = {
    caps: { trail: RowCapConfig; history: RowCapConfig };
    defaultRowCap: number;
    minRowCap: number;
    maxRowCap: number;
  };
  const rowCapQuery = useQuery<RowCapResponse>({
    queryKey: [ROW_CAP_URL],
  });
  const trailCap =
    rowCapQuery.data?.caps.trail.rowCap ?? AUDIT_TRAIL_ROW_CAP_FALLBACK;
  const defaultRowCap =
    rowCapQuery.data?.defaultRowCap ?? AUDIT_TRAIL_ROW_CAP_FALLBACK;
  const minRowCap = rowCapQuery.data?.minRowCap ?? 1000;
  const maxRowCap = rowCapQuery.data?.maxRowCap ?? 1_000_000;

  const rowCapMutation = useMutation({
    mutationFn: async (rowCap: number | null) => {
      return await apiRequest("PUT", ROW_CAP_URL, { kind: "trail", rowCap });
    },
    onSuccess: () => {
      setRowCapError(null);
      setRowCapInput("");
      qc.invalidateQueries({ queryKey: [ROW_CAP_URL] });
      qc.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey?.[0];
          return (
            typeof k === "string" &&
            k.startsWith("/api/admin/newsroom/audience/export/count")
          );
        },
      });
    },
    onError: (e: any) =>
      setRowCapError(e?.message ?? "failed to save row cap"),
  });

  const commitRowCap = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      rowCapMutation.mutate(null);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
      setRowCapError("Enter a whole number of rows");
      return;
    }
    if (n < minRowCap || n > maxRowCap) {
      setRowCapError(
        `Cap must be between ${minRowCap.toLocaleString()} and ${maxRowCap.toLocaleString()}`,
      );
      return;
    }
    rowCapMutation.mutate(n);
  };

  const countParams = useMemo(() => {
    const p = new URLSearchParams();
    if (exportFrom) p.set("from", new Date(exportFrom).toISOString());
    if (exportTo) p.set("to", new Date(exportTo).toISOString());
    if (exportPlatform) p.set("platform", exportPlatform);
    if (productionId) p.set("productionId", productionId);
    return p.toString();
  }, [exportFrom, exportTo, exportPlatform, productionId]);

  const countQuery = useQuery<{
    connectors: number;
    messages: number;
    decisions: number;
    commands: number;
    total: number;
    rowCap: number;
    wouldTruncate: boolean;
  }>({
    queryKey: [
      `/api/admin/newsroom/audience/export/count`,
      countParams,
    ],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/newsroom/audience/export/count?${countParams}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`count failed (${res.status})`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const downloadExport = async (format: "json" | "csv") => {
    // Task #632 — preflight: if any single section is above the cap,
    // warn explicitly so the founder doesn't burn a download slot on a
    // silently-truncated file.
    const wouldTruncate = countQuery.data?.wouldTruncate === true;
    if (wouldTruncate) {
      const ok = window.confirm(
        `Heads up — at least one section of this audit-trail export is above the hard cap of ${trailCap.toLocaleString()} rows ` +
          `(messages: ${countQuery.data!.messages.toLocaleString()}, decisions: ${countQuery.data!.decisions.toLocaleString()}, commands: ${countQuery.data!.commands.toLocaleString()}).\n\n` +
          `The download will be marked truncated:true. Continue anyway?`,
      );
      if (!ok) return;
    }
    setExporting(format);
    setExportError(null);
    try {
      const params = new URLSearchParams();
      params.set("format", format);
      if (exportFrom) params.set("from", new Date(exportFrom).toISOString());
      if (exportTo) params.set("to", new Date(exportTo).toISOString());
      if (exportPlatform) params.set("platform", exportPlatform);
      if (productionId) params.set("productionId", productionId);
      const res = await fetch(
        `/api/admin/newsroom/audience/export?${params.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.download = `audience-audit-trail-${stamp}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      qc.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey?.[0];
          return typeof k === "string" && k.startsWith("/api/admin/newsroom/audience/export-log");
        },
      });
    } catch (e: any) {
      setExportError(e?.message ?? "export failed");
    } finally {
      setExporting(null);
    }
  };

  return (
    <Card data-testid="card-audit-export">
      <CardHeader>
        <CardTitle>Compliance Audit Export</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Download the audience moderation audit trail (connectors, messages,
          decisions, simulated commands) for regulators, incident response, or
          legal review. PII is redacted at ingestion — author IDs are hashed
          and raw metadata is scrubbed.
        </p>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">From</span>
            <Input
              type="datetime-local"
              value={exportFrom}
              onChange={(e) => setExportFrom(e.target.value)}
              data-testid="input-export-from"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">To</span>
            <Input
              type="datetime-local"
              value={exportTo}
              onChange={(e) => setExportTo(e.target.value)}
              data-testid="input-export-to"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Platform</span>
            <select
              value={exportPlatform}
              onChange={(e) => setExportPlatform(e.target.value)}
              className="w-full h-9 rounded border bg-background px-2 text-sm"
              data-testid="select-export-platform"
            >
              <option value="">All</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">productionId (current)</span>
            <Input
              value={productionId}
              onChange={(e) => setProductionId(e.target.value)}
              data-testid="input-export-production"
            />
          </label>
        </div>
        {countQuery.data && (
          <p
            className={`text-xs ${
              countQuery.data.wouldTruncate
                ? "text-destructive font-medium"
                : "text-muted-foreground"
            }`}
            data-testid="text-export-count-hint"
          >
            Matches with current filters — messages:{" "}
            {countQuery.data.messages.toLocaleString()}, decisions:{" "}
            {countQuery.data.decisions.toLocaleString()}, commands:{" "}
            {countQuery.data.commands.toLocaleString()}. Hard cap per section:{" "}
            {countQuery.data.rowCap.toLocaleString()}.
            {countQuery.data.wouldTruncate &&
              " ⚠ At least one section exceeds the cap — download will be truncated."}
          </p>
        )}
        {/* Task #703 — founder-configurable row cap. */}
        <div
          className="rounded border bg-muted/30 p-2 space-y-1"
          data-testid="block-trail-row-cap"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              Per-section hard cap (rows):
            </span>
            <Input
              className="h-7 w-32 text-xs"
              type="number"
              min={minRowCap}
              max={maxRowCap}
              placeholder={`${defaultRowCap.toLocaleString()} (default)`}
              value={rowCapInput}
              onChange={(e) => {
                setRowCapInput(e.target.value);
                setRowCapError(null);
              }}
              data-testid="input-trail-row-cap"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => commitRowCap(rowCapInput)}
              disabled={rowCapMutation.isPending}
              data-testid="button-trail-row-cap-save"
            >
              {rowCapMutation.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRowCapInput("");
                setRowCapError(null);
                rowCapMutation.mutate(null);
              }}
              disabled={rowCapMutation.isPending}
              data-testid="button-trail-row-cap-reset"
            >
              Reset to default
            </Button>
            <span
              className="text-xs text-muted-foreground"
              data-testid="text-trail-row-cap-current"
            >
              Current: {trailCap.toLocaleString()}
              {rowCapQuery.data?.caps.trail.isDefault ? " (default)" : ""}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Bounds: {minRowCap.toLocaleString()}–{maxRowCap.toLocaleString()}.
            Leave blank and click Save (or Reset) to restore the default of{" "}
            {defaultRowCap.toLocaleString()}.
          </p>
          {rowCapError && (
            <p
              className="text-xs text-destructive"
              data-testid="text-trail-row-cap-error"
            >
              {rowCapError}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => downloadExport("json")}
            disabled={exporting !== null}
            data-testid="button-export-json"
          >
            {exporting === "json" ? "Exporting…" : "Download JSON"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadExport("csv")}
            disabled={exporting !== null}
            data-testid="button-export-csv"
          >
            {exporting === "csv" ? "Exporting…" : "Download CSV"}
          </Button>
          {exportError && (
            <span
              className="text-xs text-destructive self-center"
              data-testid="text-export-error"
            >
              {exportError}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
