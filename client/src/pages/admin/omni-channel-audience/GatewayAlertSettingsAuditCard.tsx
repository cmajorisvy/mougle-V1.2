import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface GatewayAlertAuditEntry {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  action: string;
  updatedBy: string;
  updatedAt: string | null;
}

const ALERT_AUDIT_FIELD_LABEL: Record<string, string> = {
  threshold: "Threshold",
  windowMs: "Window (ms)",
  dedupMs: "Dedup (ms)",
  recovery: "Recovery",
  all: "All settings",
};

function formatAuditValueDisplay(field: string, value: string | null): string {
  if (value == null) return "—";
  if (field === "all") {
    try {
      const obj = JSON.parse(value);
      return Object.entries(obj)
        .map(([k, v]) => `${k}=${v == null ? "—" : String(v)}`)
        .join(", ");
    } catch {
      return value;
    }
  }
  if (field === "windowMs") {
    const n = Number(value);
    if (Number.isFinite(n)) return `${Math.round(n / 1000)}s`;
  }
  if (field === "dedupMs") {
    const n = Number(value);
    if (Number.isFinite(n)) return `${Math.round(n / 60_000)}m`;
  }
  return value;
}

export function GatewayAlertSettingsAuditCard() {
  const auditQuery = useQuery<{ entries: GatewayAlertAuditEntry[] }>({
    queryKey: ["/api/admin/newsroom/audience/gateway/alert-settings/audit-log"],
  });
  const entries = auditQuery.data?.entries ?? [];
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [updatedBy, setUpdatedBy] = useState("");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadCsv = async () => {
    setDownloadError(null);
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) {
        const d = new Date(fromDate);
        if (!Number.isNaN(d.getTime())) params.set("from", d.toISOString());
      }
      if (toDate) {
        const d = new Date(toDate);
        if (!Number.isNaN(d.getTime())) params.set("to", d.toISOString());
      }
      if (updatedBy.trim()) params.set("updatedBy", updatedBy.trim());
      const qs = params.toString();
      const url =
        `/api/admin/newsroom/audience/gateway/alert-settings/audit-log/export` +
        (qs ? `?${qs}` : "");
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`download_failed_${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = `gateway-alert-settings-audit-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e: any) {
      setDownloadError(e?.message ?? "download_failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card data-testid="card-gateway-alert-settings-audit">
      <CardHeader>
        <CardTitle>Recent threshold changes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Every save and reset above writes one row here so founders can see
          who tuned which alert and when.
        </p>
        <div className="flex flex-wrap items-end gap-2 rounded border p-2">
          <div className="flex flex-col">
            <label className="text-[10px] text-muted-foreground" htmlFor="audit-export-from">
              From
            </label>
            <Input
              id="audit-export-from"
              type="datetime-local"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-8 text-xs"
              data-testid="input-audit-export-from"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] text-muted-foreground" htmlFor="audit-export-to">
              To
            </label>
            <Input
              id="audit-export-to"
              type="datetime-local"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-8 text-xs"
              data-testid="input-audit-export-to"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] text-muted-foreground" htmlFor="audit-export-by">
              Updated by
            </label>
            <Input
              id="audit-export-by"
              type="text"
              placeholder="actor id"
              value={updatedBy}
              onChange={(e) => setUpdatedBy(e.target.value)}
              className="h-8 text-xs"
              data-testid="input-audit-export-by"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleDownloadCsv}
            disabled={downloading}
            data-testid="button-audit-export-csv"
          >
            {downloading ? "Preparing…" : "Download CSV"}
          </Button>
          {downloadError && (
            <span
              className="text-xs text-destructive"
              data-testid="text-audit-export-error"
            >
              {downloadError}
            </span>
          )}
        </div>
        {auditQuery.isLoading && (
          <p className="text-xs text-muted-foreground" data-testid="text-audit-loading">
            Loading…
          </p>
        )}
        {!auditQuery.isLoading && entries.length === 0 && (
          <p
            className="text-xs text-muted-foreground"
            data-testid="text-audit-empty"
          >
            No threshold changes recorded yet.
          </p>
        )}
        {entries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-1 pr-2">When</th>
                  <th className="py-1 pr-2">Field</th>
                  <th className="py-1 pr-2">Old</th>
                  <th className="py-1 pr-2">New</th>
                  <th className="py-1 pr-2">By</th>
                  <th className="py-1 pr-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b last:border-b-0 align-top"
                    data-testid={`row-audit-${e.id}`}
                  >
                    <td className="py-1 pr-2 whitespace-nowrap">
                      {e.updatedAt ? new Date(e.updatedAt).toLocaleString() : "—"}
                    </td>
                    <td className="py-1 pr-2">
                      {ALERT_AUDIT_FIELD_LABEL[e.field] ?? e.field}
                    </td>
                    <td className="py-1 pr-2 font-mono break-all" data-testid={`text-audit-old-${e.id}`}>
                      {formatAuditValueDisplay(e.field, e.oldValue)}
                    </td>
                    <td className="py-1 pr-2 font-mono break-all" data-testid={`text-audit-new-${e.id}`}>
                      {formatAuditValueDisplay(e.field, e.newValue)}
                    </td>
                    <td className="py-1 pr-2 break-all">{e.updatedBy}</td>
                    <td className="py-1 pr-2">
                      {e.action === "reset" ? (
                        <Badge variant="outline">Reset</Badge>
                      ) : (
                        <Badge variant="secondary">Update</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
