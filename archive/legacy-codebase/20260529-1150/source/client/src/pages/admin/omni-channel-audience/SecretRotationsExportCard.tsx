import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLATFORMS } from "./_shared";

// Task #576 — mirror of the server-side hard cap in
// `server/routes/omni-channel-audience-routes.ts` (ROTATIONS_CSV_ROW_CAP).
const ROTATIONS_CSV_ROW_CAP = 10_000;

export function SecretRotationsExportCard(_props: { productionId: string }) {
  const qc = useQueryClient();
  const [rotExportFrom, setRotExportFrom] = useState<string>("");
  const [rotExportTo, setRotExportTo] = useState<string>("");
  const [rotExportPlatform, setRotExportPlatform] = useState<string>("");
  const [rotExportConnectorId, setRotExportConnectorId] = useState<string>("");
  const [rotExporting, setRotExporting] = useState<null | "json" | "csv">(null);
  const [rotExportError, setRotExportError] = useState<string | null>(null);

  const rotationsCountParams = useMemo(() => {
    const params = new URLSearchParams();
    if (rotExportFrom) params.set("from", new Date(rotExportFrom).toISOString());
    if (rotExportTo) params.set("to", new Date(rotExportTo).toISOString());
    if (rotExportPlatform) params.set("platform", rotExportPlatform);
    if (rotExportConnectorId.trim())
      params.set("connectorId", rotExportConnectorId.trim());
    return params.toString();
  }, [rotExportFrom, rotExportTo, rotExportPlatform, rotExportConnectorId]);

  const rotationsCountQuery = useQuery<{ count: number; rowCap: number }>({
    queryKey: [
      "/api/admin/newsroom/audience/secret-rotations/count",
      rotationsCountParams,
    ],
    queryFn: async () => {
      const url =
        `/api/admin/newsroom/audience/secret-rotations/count` +
        (rotationsCountParams ? `?${rotationsCountParams}` : "");
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`count failed (${res.status})`);
      return res.json();
    },
  });

  const downloadSecretRotationsExport = async (format: "json" | "csv") => {
    const previewCount = rotationsCountQuery.data?.count;
    if (
      typeof previewCount === "number" &&
      previewCount > ROTATIONS_CSV_ROW_CAP &&
      typeof window !== "undefined"
    ) {
      const ok = window.confirm(
        `This slice has ${previewCount.toLocaleString()} rows but the ` +
          `${format.toUpperCase()} is hard-capped at ` +
          `${ROTATIONS_CSV_ROW_CAP.toLocaleString()} rows. The download ` +
          `will be truncated. Continue anyway?`,
      );
      if (!ok) return;
    }
    setRotExporting(format);
    setRotExportError(null);
    try {
      const params = new URLSearchParams();
      params.set("format", format);
      if (rotExportFrom) params.set("from", new Date(rotExportFrom).toISOString());
      if (rotExportTo) params.set("to", new Date(rotExportTo).toISOString());
      if (rotExportPlatform) params.set("platform", rotExportPlatform);
      if (rotExportConnectorId.trim()) params.set("connectorId", rotExportConnectorId.trim());
      const res = await fetch(
        `/api/admin/newsroom/audience/secret-rotations/export?${params.toString()}`,
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
      a.download = `audience-connector-secret-rotations-${stamp}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      qc.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey?.[0];
          return typeof k === "string" && k.startsWith("/api/admin/newsroom/audience/export-log");
        },
      });
    } catch (e: any) {
      setRotExportError(e?.message ?? "export failed");
    } finally {
      setRotExporting(null);
    }
  };

  return (
    <Card data-testid="card-secret-rotations-export">
      <CardHeader>
        <CardTitle>Connector Token Rotation Audit Export</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Download the full per-connector platform-token rotation audit log
          (set / rotate / delete) for incident review or quarterly key-hygiene
          reports. Metadata only — ciphertext, IV, and auth-tag are never
          included. Each export is itself logged in the audit-export trail.
        </p>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">From</span>
            <Input
              type="datetime-local"
              value={rotExportFrom}
              onChange={(e) => setRotExportFrom(e.target.value)}
              data-testid="input-rot-export-from"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">To</span>
            <Input
              type="datetime-local"
              value={rotExportTo}
              onChange={(e) => setRotExportTo(e.target.value)}
              data-testid="input-rot-export-to"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">Platform</span>
            <select
              value={rotExportPlatform}
              onChange={(e) => setRotExportPlatform(e.target.value)}
              className="w-full h-9 rounded border bg-background px-2 text-sm"
              data-testid="select-rot-export-platform"
            >
              <option value="">All</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-muted-foreground">connectorId (optional)</span>
            <Input
              value={rotExportConnectorId}
              onChange={(e) => setRotExportConnectorId(e.target.value)}
              placeholder="leave blank for all"
              data-testid="input-rot-export-connector"
            />
          </label>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => downloadSecretRotationsExport("json")}
            disabled={rotExporting !== null}
            data-testid="button-rot-export-json"
          >
            {rotExporting === "json" ? "Exporting…" : "Download JSON"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadSecretRotationsExport("csv")}
            disabled={rotExporting !== null}
            data-testid="button-rot-export-csv"
          >
            {rotExporting === "csv" ? "Exporting…" : "Download CSV"}
          </Button>
          {rotationsCountQuery.data &&
            rotationsCountQuery.data.count > ROTATIONS_CSV_ROW_CAP && (
              <span
                className="text-xs text-amber-600 dark:text-amber-400 self-center"
                data-testid="text-rot-export-csv-cap-warning"
              >
                This download will be capped at{" "}
                {ROTATIONS_CSV_ROW_CAP.toLocaleString()} rows (filtered
                total: {rotationsCountQuery.data.count.toLocaleString()}).
                Narrow the filters to capture everything.
              </span>
            )}
          {rotExportError && (
            <span
              className="text-xs text-destructive self-center"
              data-testid="text-rot-export-error"
            >
              {rotExportError}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
