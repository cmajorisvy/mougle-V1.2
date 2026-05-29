import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

interface BackfillSummary {
  totalNull: number;
  matched: number;
  updated: number;
  unmatchedNoCommandId: number;
  unmatchedCommandMissing: number;
  remainingNull: number;
}

const GATEWAY_CONNECTOR_KEY = "audience_gateway_events.connector_id";

type BackfillStatus = "backfillable" | "no_backfill_path" | "manual_only";

interface OrphanedAttributionRow {
  key: string;
  table: string;
  column: string;
  label: string;
  description: string;
  backfillStatus: BackfillStatus;
  backfillCommand?: string;
  docHref: string;
  nullCount: number;
  totalCount: number;
  error: string | null;
}

interface Summary {
  generatedAt: string;
  docHref: string;
  totalOrphanRows: number;
  rows: OrphanedAttributionRow[];
}

const STATUS_LABEL: Record<BackfillStatus, string> = {
  backfillable: "backfillable",
  manual_only: "manual only",
  no_backfill_path: "no backfill path",
};

const STATUS_VARIANT: Record<BackfillStatus, "default" | "secondary" | "outline"> = {
  backfillable: "default",
  manual_only: "secondary",
  no_backfill_path: "outline",
};

type BackfillAction = "dry_run" | "run";

interface BackfillResultState {
  action: BackfillAction;
  summary: BackfillSummary;
  at: string;
}

export function OrphanedAttributionCard() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<{ summary: Summary }>({
    queryKey: ["/api/admin/newsroom/audience/orphaned-attribution"],
  });

  const summary = data?.summary;
  const rows = summary?.rows ?? [];

  const [pending, setPending] = useState<BackfillAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<BackfillResultState | null>(
    null,
  );

  async function runGatewayConnectorBackfill(action: BackfillAction) {
    setPending(action);
    setActionError(null);
    try {
      const url =
        action === "dry_run"
          ? "/api/admin/newsroom/audience/retention/connector-backfill/dry-run"
          : "/api/admin/newsroom/audience/retention/connector-backfill/run";
      const res = await apiRequest("POST", url);
      const json = (await res.json()) as
        | { result?: { summary: BackfillSummary } }
        | { status?: { summary: BackfillSummary | null; error: string | null } };
      let summary: BackfillSummary | null = null;
      let errMsg: string | null = null;
      if (action === "dry_run") {
        summary = (json as any)?.result?.summary ?? null;
      } else {
        const status = (json as any)?.status;
        summary = status?.summary ?? null;
        errMsg = status?.error ?? null;
      }
      if (errMsg) {
        setActionError(errMsg);
      } else if (summary) {
        setLastResult({
          action,
          summary,
          at: new Date().toISOString(),
        });
        if (action === "run") {
          await queryClient.invalidateQueries({
            queryKey: ["/api/admin/newsroom/audience/orphaned-attribution"],
          });
        }
      }
    } catch (e: any) {
      setActionError(String(e?.message ?? e));
    } finally {
      setPending(null);
    }
  }

  return (
    <Card data-testid="card-orphaned-attribution">
      <CardHeader>
        <CardTitle>Orphaned attribution rows</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Audience-* rows persisted before their attribution columns existed
          remain in the database with{" "}
          <code>NULL</code> values. This summary shows how many such rows
          remain per (table, column) so you can request a future backfill or
          understand why filters on the gateway-activity view appear to hide
          older rows.{" "}
          <a
            className="underline"
            href={summary?.docHref ?? "/docs/audience-orphaned-attribution"}
            target="_blank"
            rel="noreferrer"
            data-testid="link-orphaned-attribution-doc"
          >
            Read the explainer
          </a>
          .
        </p>

        {isLoading && (
          <p className="text-sm text-muted-foreground" data-testid="text-orphaned-attribution-loading">
            Loading…
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive" data-testid="text-orphaned-attribution-error">
            Failed to load: {String((error as any)?.message ?? error)}
          </p>
        )}

        {summary && (
          <>
            <div className="flex items-center gap-3 text-sm" data-testid="text-orphaned-attribution-total">
              <span className="font-medium">{summary.totalOrphanRows.toLocaleString()}</span>
              <span className="text-muted-foreground">total orphan rows across {rows.length} tracked columns</span>
            </div>
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase">
                  <tr>
                    <th className="p-2">Table / column</th>
                    <th className="p-2">Orphan rows</th>
                    <th className="p-2">Total rows</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-2 text-muted-foreground" data-testid="text-orphaned-attribution-empty">
                        No tracked attribution columns yet.
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr
                      key={row.key}
                      className="border-t"
                      data-testid={`row-orphaned-attribution-${row.key}`}
                    >
                      <td className="p-2 align-top">
                        <div className="font-medium">{row.label}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {row.table}.{row.column}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{row.description}</div>
                      </td>
                      <td
                        className="p-2 align-top font-mono"
                        data-testid={`text-orphaned-attribution-null-${row.key}`}
                      >
                        {row.nullCount < 0 ? "—" : row.nullCount.toLocaleString()}
                      </td>
                      <td
                        className="p-2 align-top font-mono text-muted-foreground"
                        data-testid={`text-orphaned-attribution-total-${row.key}`}
                      >
                        {row.totalCount < 0 ? "—" : row.totalCount.toLocaleString()}
                      </td>
                      <td className="p-2 align-top">
                        <Badge
                          variant={STATUS_VARIANT[row.backfillStatus]}
                          data-testid={`badge-orphaned-attribution-status-${row.key}`}
                        >
                          {STATUS_LABEL[row.backfillStatus]}
                        </Badge>
                        {row.error && (
                          <div className="text-xs text-destructive mt-1">
                            count failed: {row.error}
                          </div>
                        )}
                      </td>
                      <td className="p-2 align-top text-xs">
                        {row.backfillStatus === "backfillable" && row.backfillCommand ? (
                          <div className="space-y-2">
                            {row.key === GATEWAY_CONNECTOR_KEY && (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={pending !== null}
                                  onClick={() =>
                                    runGatewayConnectorBackfill("dry_run")
                                  }
                                  data-testid={`button-orphaned-attribution-dry-run-${row.key}`}
                                >
                                  {pending === "dry_run" ? "Running…" : "Dry run"}
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={pending !== null}
                                  onClick={() =>
                                    runGatewayConnectorBackfill("run")
                                  }
                                  data-testid={`button-orphaned-attribution-run-${row.key}`}
                                >
                                  {pending === "run" ? "Running…" : "Run backfill"}
                                </Button>
                              </div>
                            )}
                            <code
                              className="block rounded bg-muted px-1.5 py-1 font-mono"
                              data-testid={`text-orphaned-attribution-command-${row.key}`}
                            >
                              {row.backfillCommand}
                            </code>
                            {row.key === GATEWAY_CONNECTOR_KEY && actionError && (
                              <div
                                className="text-destructive"
                                data-testid={`text-orphaned-attribution-action-error-${row.key}`}
                              >
                                {actionError}
                              </div>
                            )}
                            {row.key === GATEWAY_CONNECTOR_KEY && lastResult && (
                              <div
                                className="rounded border bg-muted/40 px-2 py-1 text-xs"
                                data-testid={`text-orphaned-attribution-action-result-${row.key}`}
                              >
                                <div className="font-medium">
                                  {lastResult.action === "dry_run"
                                    ? "Dry-run preview"
                                    : "Backfill complete"}
                                </div>
                                <div>
                                  matched={lastResult.summary.matched.toLocaleString()}{" "}
                                  · updated={lastResult.summary.updated.toLocaleString()}{" "}
                                  · remaining={lastResult.summary.remainingNull.toLocaleString()}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <a
                            className="underline text-muted-foreground"
                            href={row.docHref}
                            target="_blank"
                            rel="noreferrer"
                            data-testid={`link-orphaned-attribution-doc-${row.key}`}
                          >
                            why?
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground" data-testid="text-orphaned-attribution-generated-at">
              Generated {new Date(summary.generatedAt).toLocaleString()}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
