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

export interface LegacyTokenStatusConnectorRow {
  connectorId: string;
  platform: string;
  displayName: string;
  apiAccessMode: string;
  platformSendApproved: boolean;
  tokenSource: "per_connector_secret" | "legacy_env_fallback" | "no_token";
  envFallbackDisabled: boolean;
  envTokenConfigured: boolean;
  perConnectorSecretInstalled: boolean;
  secretRotatedAt: string | null;
  secretRotationCount: number;
}

export interface LegacyTokenStatusPlatformRow {
  platform: string;
  envFallbackDisabled: boolean;
  envFallbackDisabledSource: "admin" | "env" | "default";
  envFallbackDisabledOverride: boolean | null;
  envFallbackDisabledFromEnv: boolean;
  envTokenConfigured: boolean;
  envDisableKey: string;
  envTokenKey: string;
  connectorCount: number;
  perConnectorSecretCount: number;
  legacyEnvFallbackCount: number;
  noTokenCount: number;
}

export interface LegacyTokenStatusBreakRow {
  platform: string;
  envFallbackDisabled: boolean;
  connectors: Array<{
    connectorId: string;
    displayName: string;
    apiAccessMode: string;
    platformSendApproved: boolean;
  }>;
}

export interface LegacyTokenStatusResponse {
  connectors: LegacyTokenStatusConnectorRow[];
  platforms: LegacyTokenStatusPlatformRow[];
  wouldBreakIfEnvFallbackDisabled: LegacyTokenStatusBreakRow[];
  secretsKeyConfigured: boolean;
}

export function LegacyTokenStatusCard() {
  const qc = useQueryClient();
  const query = useQuery<LegacyTokenStatusResponse>({
    queryKey: ["/api/admin/newsroom/audience/legacy-token-status"],
  });
  const data = query.data;
  const [confirmPlatform, setConfirmPlatform] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"on" | "off" | "clear" | null>(
    null,
  );
  const [bulkAction, setBulkAction] = useState<"disable-all" | "clear-all" | null>(
    null,
  );
  const [mutateError, setMutateError] = useState<string | null>(null);

  const wouldBreakByPlatform = new Map(
    (data?.wouldBreakIfEnvFallbackDisabled ?? []).map((r) => [r.platform, r]),
  );

  const overrideMutation = useMutation({
    mutationFn: async (vars: {
      platform: string;
      disabled: boolean | null;
    }) => {
      const res = await apiRequest(
        "PUT",
        `/api/admin/newsroom/audience/legacy-token-status/${vars.platform}/env-fallback-disabled`,
        { disabled: vars.disabled },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `request_failed_${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["/api/admin/newsroom/audience/legacy-token-status"],
      });
      setMutateError(null);
      setConfirmPlatform(null);
      setConfirmAction(null);
    },
    onError: (e: any) => {
      setMutateError(String(e?.message ?? "save_failed"));
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async (
      overrides: Array<{ platform: string; disabled: boolean | null }>,
    ) => {
      const res = await apiRequest(
        "PUT",
        `/api/admin/newsroom/audience/legacy-token-status/env-fallback-disabled-bulk`,
        { overrides },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `request_failed_${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["/api/admin/newsroom/audience/legacy-token-status"],
      });
      setMutateError(null);
      setBulkAction(null);
    },
    onError: (e: any) => {
      setMutateError(String(e?.message ?? "save_failed"));
    },
  });

  // For "disable-all": every platform that isn't already disabled gets
  // flipped ON; the aggregated would-break list is the union of breakers on
  // those platforms.
  // For "clear-all": every platform with an admin override gets cleared;
  // post-clear risk is real only where env says disable=true AND we aren't
  // already disabled at runtime — those are the platforms whose connectors
  // could newly start failing `platform_token_missing`.
  const bulkPreview = (() => {
    if (!data || !bulkAction) {
      return {
        affectedPlatforms: [] as string[],
        wouldBreak: [] as LegacyTokenStatusBreakRow[],
      };
    }
    if (bulkAction === "disable-all") {
      const affected = data.platforms.filter((p) => !p.envFallbackDisabled);
      const set = new Set(affected.map((p) => p.platform));
      return {
        affectedPlatforms: affected.map((p) => p.platform),
        wouldBreak: (data.wouldBreakIfEnvFallbackDisabled ?? []).filter((r) =>
          set.has(r.platform),
        ),
      };
    }
    const affected = data.platforms.filter(
      (p) => p.envFallbackDisabledOverride !== null,
    );
    const riskSet = new Set(
      affected
        .filter((p) => p.envFallbackDisabledFromEnv && !p.envFallbackDisabled)
        .map((p) => p.platform),
    );
    return {
      affectedPlatforms: affected.map((p) => p.platform),
      wouldBreak: (data.wouldBreakIfEnvFallbackDisabled ?? []).filter((r) =>
        riskSet.has(r.platform),
      ),
    };
  })();

  const executeBulk = () => {
    if (!data || !bulkAction) return;
    let updates: Array<{ platform: string; disabled: boolean | null }> = [];
    if (bulkAction === "disable-all") {
      updates = data.platforms
        .filter((p) => !p.envFallbackDisabled)
        .map((p) => ({ platform: p.platform, disabled: true }));
    } else {
      updates = data.platforms
        .filter((p) => p.envFallbackDisabledOverride !== null)
        .map((p) => ({ platform: p.platform, disabled: null }));
    }
    if (updates.length === 0) {
      setBulkAction(null);
      return;
    }
    bulkMutation.mutate(updates);
  };

  const requestOverride = (
    platform: string,
    action: "on" | "off" | "clear",
  ) => {
    setMutateError(null);
    const breakRow = wouldBreakByPlatform.get(platform);
    const hasBreakers = !!breakRow && breakRow.connectors.length > 0;
    if (action === "on" && hasBreakers) {
      setConfirmPlatform(platform);
      setConfirmAction(action);
      return;
    }
    const disabled = action === "on" ? true : action === "off" ? false : null;
    overrideMutation.mutate({ platform, disabled });
  };

  const confirmRow =
    confirmPlatform != null ? wouldBreakByPlatform.get(confirmPlatform) : null;

  const tokenBadge = (src: LegacyTokenStatusConnectorRow["tokenSource"]) => {
    if (src === "per_connector_secret") {
      return (
        <Badge variant="default" data-testid="badge-token-source-per-connector">
          per-connector secret
        </Badge>
      );
    }
    if (src === "legacy_env_fallback") {
      return (
        <Badge variant="secondary" data-testid="badge-token-source-legacy-env">
          legacy env fallback
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" data-testid="badge-token-source-no-token">
        no token
      </Badge>
    );
  };

  return (
    <Card data-testid="card-legacy-token-status">
      <CardHeader>
        <CardTitle>Legacy gateway token migration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Per-connector view of which channels are migrated to their own
          encrypted secret vs. still relying on the shared{" "}
          <code>AUDIENCE_GATEWAY_&lt;PLATFORM&gt;_TOKEN</code> env fallback.
          Flip{" "}
          <code>AUDIENCE_GATEWAY_DISABLE_ENV_FALLBACK_&lt;PLATFORM&gt;=true</code>{" "}
          per platform once the &quot;would break&quot; list for that platform is
          empty. Token material is never returned by this endpoint.
        </p>

        {!data ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="text-legacy-token-status-loading"
          >
            {query.isLoading ? "Loading…" : "No data."}
          </p>
        ) : (
          <>
            <div className="text-xs">
              <span className="text-muted-foreground">Secrets key configured: </span>
              <Badge
                variant={data.secretsKeyConfigured ? "default" : "destructive"}
                data-testid="badge-secrets-key-configured"
              >
                {data.secretsKeyConfigured ? "yes" : "no"}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded border border-dashed p-2">
              <span className="text-xs font-medium text-muted-foreground uppercase">
                Bulk actions
              </span>
              <Button
                size="sm"
                variant="destructive"
                disabled={
                  bulkMutation.isPending ||
                  !data.platforms.some((p) => !p.envFallbackDisabled)
                }
                onClick={() => {
                  setMutateError(null);
                  setBulkAction("disable-all");
                }}
                data-testid="button-bulk-disable-env-fallback"
              >
                Disable env-fallback everywhere
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  bulkMutation.isPending ||
                  !data.platforms.some(
                    (p) => p.envFallbackDisabledOverride !== null,
                  )
                }
                onClick={() => {
                  setMutateError(null);
                  setBulkAction("clear-all");
                }}
                data-testid="button-bulk-clear-overrides"
              >
                Clear all overrides
              </Button>
              <span className="text-xs text-muted-foreground">
                A single confirm dialog aggregates the would-break connectors
                across every platform.
              </span>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase">
                Per-platform status
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {data.platforms.map((p) => {
                  const breakRow = wouldBreakByPlatform.get(p.platform);
                  const breakerCount = breakRow?.connectors.length ?? 0;
                  const sourceLabel =
                    p.envFallbackDisabledSource === "admin"
                      ? "admin"
                      : p.envFallbackDisabledSource === "env"
                        ? "env"
                        : "default";
                  const isPending =
                    overrideMutation.isPending &&
                    overrideMutation.variables?.platform === p.platform;
                  return (
                    <div
                      key={p.platform}
                      className="rounded border p-2 text-xs space-y-1"
                      data-testid={`row-platform-status-${p.platform}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{p.platform}</span>
                        <span className="flex gap-1 flex-wrap items-center">
                          <Badge
                            variant={p.envFallbackDisabled ? "default" : "secondary"}
                            data-testid={`badge-env-fallback-disabled-${p.platform}`}
                          >
                            env fallback {p.envFallbackDisabled ? "OFF" : "ON"}
                          </Badge>
                          <Badge
                            variant="outline"
                            data-testid={`badge-env-fallback-source-${p.platform}`}
                          >
                            via {sourceLabel}
                          </Badge>
                          <Badge
                            variant={p.envTokenConfigured ? "outline" : "secondary"}
                            data-testid={`badge-env-token-configured-${p.platform}`}
                          >
                            env token {p.envTokenConfigured ? "set" : "unset"}
                          </Badge>
                        </span>
                      </div>
                      <div className="text-muted-foreground">
                        <span data-testid={`text-platform-connector-count-${p.platform}`}>
                          {p.connectorCount}
                        </span>{" "}
                        connector{p.connectorCount === 1 ? "" : "s"} ·{" "}
                        <span data-testid={`text-platform-per-connector-count-${p.platform}`}>
                          {p.perConnectorSecretCount}
                        </span>{" "}
                        per-connector ·{" "}
                        <span data-testid={`text-platform-legacy-env-count-${p.platform}`}>
                          {p.legacyEnvFallbackCount}
                        </span>{" "}
                        legacy ·{" "}
                        <span data-testid={`text-platform-no-token-count-${p.platform}`}>
                          {p.noTokenCount}
                        </span>{" "}
                        none
                      </div>
                      <div className="flex flex-wrap items-center gap-1 pt-1">
                        <Button
                          size="sm"
                          variant={p.envFallbackDisabled ? "default" : "outline"}
                          disabled={isPending || p.envFallbackDisabled}
                          onClick={() => requestOverride(p.platform, "on")}
                          data-testid={`button-env-fallback-disable-${p.platform}`}
                        >
                          Turn OFF env fallback
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            !p.envFallbackDisabled &&
                            p.envFallbackDisabledSource === "admin"
                              ? "default"
                              : "outline"
                          }
                          disabled={isPending}
                          onClick={() => requestOverride(p.platform, "off")}
                          data-testid={`button-env-fallback-enable-${p.platform}`}
                        >
                          Turn ON env fallback
                        </Button>
                        {p.envFallbackDisabledSource === "admin" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isPending}
                            onClick={() => requestOverride(p.platform, "clear")}
                            data-testid={`button-env-fallback-clear-${p.platform}`}
                          >
                            Clear override (use env)
                          </Button>
                        )}
                        {breakerCount > 0 && !p.envFallbackDisabled && (
                          <span
                            className="text-destructive"
                            data-testid={`text-env-fallback-breakers-${p.platform}`}
                          >
                            {breakerCount} connector{breakerCount === 1 ? "" : "s"} would
                            break
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase">
                Per-connector token source
              </div>
              {data.connectors.length === 0 ? (
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="text-no-legacy-token-connectors"
                >
                  No connectors registered.
                </p>
              ) : (
                <div className="space-y-1">
                  {data.connectors.map((c) => (
                    <div
                      key={c.connectorId}
                      className="rounded border p-2 text-xs flex flex-wrap items-center gap-2"
                      data-testid={`row-legacy-token-${c.connectorId}`}
                    >
                      <span className="font-medium">{c.displayName}</span>
                      <Badge variant="outline">{c.platform}</Badge>
                      <Badge variant="outline">{c.apiAccessMode}</Badge>
                      {c.platformSendApproved && (
                        <Badge
                          variant="default"
                          data-testid={`badge-send-approved-${c.connectorId}`}
                        >
                          send approved
                        </Badge>
                      )}
                      {tokenBadge(c.tokenSource)}
                      {c.envFallbackDisabled && (
                        <Badge
                          variant="secondary"
                          data-testid={`badge-platform-env-off-${c.connectorId}`}
                        >
                          platform env OFF
                        </Badge>
                      )}
                      {c.perConnectorSecretInstalled && c.secretRotatedAt && (
                        <span
                          className="text-muted-foreground"
                          data-testid={`text-secret-rotated-${c.connectorId}`}
                        >
                          rotated{" "}
                          {new Date(c.secretRotatedAt).toLocaleString()} (#
                          {c.secretRotationCount})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase">
                Would break if env fallback is disabled now
              </div>
              {data.wouldBreakIfEnvFallbackDisabled.length === 0 ? (
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="text-no-would-break"
                >
                  No approved official-API connectors would break — safe to
                  flip any platform&apos;s env-fallback disable flag.
                </p>
              ) : (
                <div className="space-y-1">
                  {data.wouldBreakIfEnvFallbackDisabled.map((p) => (
                    <div
                      key={p.platform}
                      className="rounded border p-2 text-xs space-y-1"
                      data-testid={`row-would-break-${p.platform}`}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive">{p.platform}</Badge>
                        <span className="text-muted-foreground">
                          {p.connectors.length} connector
                          {p.connectors.length === 1 ? "" : "s"} would fail{" "}
                          <code>platform_token_missing</code>
                        </span>
                      </div>
                      <ul className="ml-4 list-disc">
                        {p.connectors.map((cc) => (
                          <li
                            key={cc.connectorId}
                            data-testid={`item-would-break-${p.platform}-${cc.connectorId}`}
                          >
                            {cc.displayName}{" "}
                            <span className="text-muted-foreground">
                              ({cc.connectorId})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {mutateError && (
              <p
                className="text-xs text-destructive"
                data-testid="text-env-fallback-error"
              >
                {mutateError}
              </p>
            )}

            <Dialog
              open={confirmPlatform != null}
              onOpenChange={(open) => {
                if (!open) {
                  setConfirmPlatform(null);
                  setConfirmAction(null);
                }
              }}
            >
              <DialogContent data-testid="dialog-env-fallback-confirm">
                <DialogHeader>
                  <DialogTitle>
                    Disable env fallback for {confirmPlatform}?
                  </DialogTitle>
                  <DialogDescription>
                    {confirmRow?.connectors.length ?? 0} approved official-API
                    connector
                    {(confirmRow?.connectors.length ?? 0) === 1 ? "" : "s"} on{" "}
                    {confirmPlatform} will immediately start failing with{" "}
                    <code>platform_token_missing</code> until each one has its
                    own encrypted secret installed.
                  </DialogDescription>
                </DialogHeader>
                {confirmRow && confirmRow.connectors.length > 0 && (
                  <ul className="ml-4 list-disc text-xs">
                    {confirmRow.connectors.map((cc) => (
                      <li
                        key={cc.connectorId}
                        data-testid={`item-confirm-break-${cc.connectorId}`}
                      >
                        {cc.displayName}{" "}
                        <span className="text-muted-foreground">
                          ({cc.connectorId})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setConfirmPlatform(null);
                      setConfirmAction(null);
                    }}
                    data-testid="button-env-fallback-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={overrideMutation.isPending}
                    onClick={() => {
                      if (confirmPlatform && confirmAction === "on") {
                        overrideMutation.mutate({
                          platform: confirmPlatform,
                          disabled: true,
                        });
                      }
                    }}
                    data-testid="button-env-fallback-confirm"
                  >
                    Disable anyway
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog
              open={bulkAction != null}
              onOpenChange={(open) => {
                if (!open) setBulkAction(null);
              }}
            >
              <DialogContent data-testid="dialog-bulk-env-fallback-confirm">
                <DialogHeader>
                  <DialogTitle>
                    {bulkAction === "disable-all"
                      ? "Disable env fallback on every platform?"
                      : "Clear every admin override?"}
                  </DialogTitle>
                  <DialogDescription>
                    {bulkAction === "disable-all"
                      ? `This will flip the env-fallback kill-switch ON for ${bulkPreview.affectedPlatforms.length} platform${bulkPreview.affectedPlatforms.length === 1 ? "" : "s"} (${bulkPreview.affectedPlatforms.join(", ") || "none"}).`
                      : `This will remove the admin override on ${bulkPreview.affectedPlatforms.length} platform${bulkPreview.affectedPlatforms.length === 1 ? "" : "s"} (${bulkPreview.affectedPlatforms.join(", ") || "none"}) and let env / default control the kill-switch again.`}
                  </DialogDescription>
                </DialogHeader>
                {bulkPreview.wouldBreak.length === 0 ? (
                  <p
                    className="text-xs text-muted-foreground"
                    data-testid="text-bulk-no-would-break"
                  >
                    No approved official-API connectors would start failing as a
                    result of this change.
                  </p>
                ) : (
                  <div
                    className="space-y-2 text-xs"
                    data-testid="text-bulk-would-break"
                  >
                    <p className="text-destructive font-medium">
                      {bulkPreview.wouldBreak.reduce(
                        (n, p) => n + p.connectors.length,
                        0,
                      )}{" "}
                      connector
                      {bulkPreview.wouldBreak.reduce(
                        (n, p) => n + p.connectors.length,
                        0,
                      ) === 1
                        ? ""
                        : "s"}{" "}
                      across {bulkPreview.wouldBreak.length} platform
                      {bulkPreview.wouldBreak.length === 1 ? "" : "s"} will
                      immediately start failing{" "}
                      <code>platform_token_missing</code> until each one has
                      its own encrypted secret installed.
                    </p>
                    {bulkPreview.wouldBreak.map((p) => (
                      <div
                        key={p.platform}
                        className="rounded border p-2 space-y-1"
                        data-testid={`row-bulk-would-break-${p.platform}`}
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive">{p.platform}</Badge>
                          <span className="text-muted-foreground">
                            {p.connectors.length} connector
                            {p.connectors.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        <ul className="ml-4 list-disc">
                          {p.connectors.map((cc) => (
                            <li
                              key={cc.connectorId}
                              data-testid={`item-bulk-confirm-break-${p.platform}-${cc.connectorId}`}
                            >
                              {cc.displayName}{" "}
                              <span className="text-muted-foreground">
                                ({cc.connectorId})
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setBulkAction(null)}
                    data-testid="button-bulk-env-fallback-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={
                      bulkMutation.isPending ||
                      bulkPreview.affectedPlatforms.length === 0
                    }
                    onClick={executeBulk}
                    data-testid="button-bulk-env-fallback-confirm"
                  >
                    {bulkMutation.isPending
                      ? "Applying…"
                      : bulkAction === "disable-all"
                        ? "Disable everywhere"
                        : "Clear all overrides"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        )}
      </CardContent>
    </Card>
  );
}
