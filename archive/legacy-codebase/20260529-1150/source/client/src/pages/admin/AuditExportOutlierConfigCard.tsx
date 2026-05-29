import * as React from "react";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AUDIT_EXPORT_OUTLIER_CONFIG_URL,
  buildAuditExportOutlierPayload,
} from "./audit-export-outlier-form";

export interface AuditExportOutlierConfigDTO {
  enabled: boolean;
  windowSize: number;
  medianMultiplier: number;
  minSampleSize: number;
  minTotalRowCount: number;
}

export function AuditExportOutlierConfigCard() {
  const qc = useQueryClient();
  const configQuery = useQuery<{ config: AuditExportOutlierConfigDTO }>({
    queryKey: [AUDIT_EXPORT_OUTLIER_CONFIG_URL],
  });

  const [enabled, setEnabled] = useState(true);
  const [windowSizeText, setWindowSizeText] = useState("50");
  const [medianMultiplierText, setMedianMultiplierText] = useState("10");
  const [minSampleSizeText, setMinSampleSizeText] = useState("5");
  const [minTotalRowCountText, setMinTotalRowCountText] = useState("100");
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    const c = configQuery.data?.config;
    if (c && !hydrated) {
      setEnabled(c.enabled);
      setWindowSizeText(String(c.windowSize));
      setMedianMultiplierText(String(c.medianMultiplier));
      setMinSampleSizeText(String(c.minSampleSize));
      setMinTotalRowCountText(String(c.minTotalRowCount));
      setHydrated(true);
    }
  }, [configQuery.data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildAuditExportOutlierPayload({
        enabled,
        windowSizeText,
        medianMultiplierText,
        minSampleSizeText,
        minTotalRowCountText,
      });
      return await apiRequest(
        "PUT",
        AUDIT_EXPORT_OUTLIER_CONFIG_URL,
        payload,
      );
    },
    onSuccess: () => {
      setSaveError(null);
      setSaveOk(true);
      setHydrated(false);
      qc.invalidateQueries({
        queryKey: [AUDIT_EXPORT_OUTLIER_CONFIG_URL],
      });
    },
    onError: (e: any) => {
      setSaveOk(false);
      setSaveError(e?.message ?? "save failed");
    },
  });

  const config = configQuery.data?.config;

  return (
    <Card data-testid="card-export-outlier-config">
      <CardHeader>
        <CardTitle>Outlier detection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Flags audit-trail exports whose total row count is unusually large
          compared with the rolling history. A lower median multiplier means
          more exports get flagged as outliers (more alerts); a higher value
          means only very large spikes trigger the badge and{" "}
          <code>audience.audit_export_outlier</code> bus event.
        </p>
        <div className="grid gap-3 md:grid-cols-5">
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Enabled</span>
            <select
              value={enabled ? "1" : "0"}
              onChange={(e) => setEnabled(e.target.value === "1")}
              className="w-full h-9 rounded border bg-background px-2 text-sm"
              data-testid="select-outlier-enabled"
            >
              <option value="0">Off</option>
              <option value="1">On</option>
            </select>
          </label>
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Window size (5–1000)</span>
            <Input
              value={windowSizeText}
              onChange={(e) => setWindowSizeText(e.target.value)}
              data-testid="input-outlier-window-size"
              inputMode="numeric"
              placeholder="50"
            />
          </label>
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Median × multiplier (2–1000)</span>
            <Input
              value={medianMultiplierText}
              onChange={(e) => setMedianMultiplierText(e.target.value)}
              data-testid="input-outlier-multiplier"
              inputMode="decimal"
              placeholder="10"
            />
          </label>
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Min sample size (2–1000)</span>
            <Input
              value={minSampleSizeText}
              onChange={(e) => setMinSampleSizeText(e.target.value)}
              data-testid="input-outlier-min-sample"
              inputMode="numeric"
              placeholder="5"
            />
          </label>
          <label className="text-xs space-y-1 flex flex-col">
            <span className="text-muted-foreground">Min total row count</span>
            <Input
              value={minTotalRowCountText}
              onChange={(e) => setMinTotalRowCountText(e.target.value)}
              data-testid="input-outlier-min-rows"
              inputMode="numeric"
              placeholder="100"
            />
          </label>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            size="sm"
            onClick={() => {
              setSaveOk(false);
              saveMutation.mutate();
            }}
            disabled={saveMutation.isPending}
            data-testid="button-outlier-save"
          >
            {saveMutation.isPending ? "Saving…" : "Save thresholds"}
          </Button>
          {config && (
            <Badge variant="outline" data-testid="badge-outlier-current">
              {config.enabled ? "Enabled" : "Disabled"} · window {config.windowSize}{" "}
              · × {config.medianMultiplier} · sample ≥ {config.minSampleSize} ·
              rows ≥ {config.minTotalRowCount}
            </Badge>
          )}
          {saveOk && !saveError && (
            <span
              className="text-xs text-muted-foreground"
              data-testid="text-outlier-save-ok"
            >
              Saved.
            </span>
          )}
          {saveError && (
            <span
              className="text-xs text-destructive"
              data-testid="text-outlier-save-error"
            >
              {saveError}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
