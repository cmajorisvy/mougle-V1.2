import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import QRCode from "qrcode";
import {
  type GatewayBlockCategory,
  GATEWAY_BLOCK_CATEGORIES,
  GATEWAY_BLOCK_CATEGORY_LABELS,
} from "@shared/gateway-block-categories";
import { Connector, PLATFORMS } from "./_shared";

// Task #538 — mirror of the server-side hard cap in
// `server/routes/omni-channel-audience-routes.ts` (GATEWAY_EVENTS_CSV_ROW_CAP).
const GATEWAY_EVENTS_CSV_ROW_CAP = 100_000;

// Task #579 — persist the Recent gateway events filter selection between
// visits. Initial values come from URL query params (so shareable links
// land on the exact filtered view) and fall back to localStorage (so
// re-opening the page restores the last-used filters). `gatewayLimit`
// and `gatewayOffset` are intentionally NOT persisted — they reset on
// each visit so admins always land on the first page at the default
// page size.
const GATEWAY_FILTERS_STORAGE_KEY =
  "mougle.omniChannelAudience.gatewayFilters.v1";
const GATEWAY_URL_KEY_FROM = "gw_from";
const GATEWAY_URL_KEY_TO = "gw_to";
const GATEWAY_URL_KEY_PLATFORM = "gw_platform";
const GATEWAY_URL_KEY_KIND = "gw_kind";
const GATEWAY_URL_KEY_CONNECTOR = "gw_connector";
const GATEWAY_URL_KEYS = [
  GATEWAY_URL_KEY_FROM,
  GATEWAY_URL_KEY_TO,
  GATEWAY_URL_KEY_PLATFORM,
  GATEWAY_URL_KEY_KIND,
  GATEWAY_URL_KEY_CONNECTOR,
] as const;

type GatewayKind = "" | "simulated" | "dispatched" | "blocked";

interface GatewayFiltersSnapshot {
  from: string;
  to: string;
  platform: string;
  kind: GatewayKind;
  connectorId: string;
}

const EMPTY_GATEWAY_FILTERS: GatewayFiltersSnapshot = {
  from: "",
  to: "",
  platform: "",
  kind: "",
  connectorId: "",
};

function normalizeGatewayKind(v: unknown): GatewayKind {
  return v === "simulated" || v === "dispatched" || v === "blocked" ? v : "";
}

function readGatewayFiltersFromStorage(): GatewayFiltersSnapshot {
  if (typeof window === "undefined") return { ...EMPTY_GATEWAY_FILTERS };
  try {
    const raw = window.localStorage.getItem(GATEWAY_FILTERS_STORAGE_KEY);
    if (!raw) return { ...EMPTY_GATEWAY_FILTERS };
    const parsed = JSON.parse(raw);
    return {
      from: typeof parsed?.from === "string" ? parsed.from : "",
      to: typeof parsed?.to === "string" ? parsed.to : "",
      platform: typeof parsed?.platform === "string" ? parsed.platform : "",
      kind: normalizeGatewayKind(parsed?.kind),
      connectorId:
        typeof parsed?.connectorId === "string" ? parsed.connectorId : "",
    };
  } catch {
    return { ...EMPTY_GATEWAY_FILTERS };
  }
}

function readInitialGatewayFilters(): GatewayFiltersSnapshot {
  if (typeof window === "undefined") return { ...EMPTY_GATEWAY_FILTERS };
  try {
    const params = new URLSearchParams(window.location.search);
    const hasAny = GATEWAY_URL_KEYS.some((k) => params.get(k) !== null);
    if (hasAny) {
      return {
        from: params.get(GATEWAY_URL_KEY_FROM) ?? "",
        to: params.get(GATEWAY_URL_KEY_TO) ?? "",
        platform: params.get(GATEWAY_URL_KEY_PLATFORM) ?? "",
        kind: normalizeGatewayKind(params.get(GATEWAY_URL_KEY_KIND)),
        connectorId: params.get(GATEWAY_URL_KEY_CONNECTOR) ?? "",
      };
    }
  } catch {
    // fall through to localStorage
  }
  return readGatewayFiltersFromStorage();
}

function persistGatewayFilters(values: GatewayFiltersSnapshot) {
  if (typeof window === "undefined") return;
  // Mirror into localStorage for next visit.
  try {
    const isEmpty =
      !values.from &&
      !values.to &&
      !values.platform &&
      !values.kind &&
      !values.connectorId;
    if (isEmpty) {
      window.localStorage.removeItem(GATEWAY_FILTERS_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        GATEWAY_FILTERS_STORAGE_KEY,
        JSON.stringify(values),
      );
    }
  } catch {
    // ignore quota / privacy-mode errors
  }
  // Reflect into URL query string so admins can share a link.
  try {
    const params = new URLSearchParams(window.location.search);
    const fields: Record<(typeof GATEWAY_URL_KEYS)[number], string> = {
      [GATEWAY_URL_KEY_FROM]: values.from,
      [GATEWAY_URL_KEY_TO]: values.to,
      [GATEWAY_URL_KEY_PLATFORM]: values.platform,
      [GATEWAY_URL_KEY_KIND]: values.kind,
      [GATEWAY_URL_KEY_CONNECTOR]: values.connectorId,
    };
    for (const key of GATEWAY_URL_KEYS) {
      const v = fields[key];
      if (v) params.set(key, v);
      else params.delete(key);
    }
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      window.history.replaceState(null, "", next);
    }
  } catch {
    // ignore — URL update is best-effort
  }
}

interface GatewayBusEvent {
  id: string;
  name:
    | "audience.gateway_send_simulated"
    | "audience.gateway_send_dispatched"
    | "audience.gateway_send_blocked";
  emittedAt: string;
  payload: {
    commandId?: string;
    platform?: string | null;
    connectorId?: string | null;
    requestedAction?: string | null;
    url?: string;
    method?: string;
    status?: number;
    reason?: string;
    // Task #689 — admin actor on the gateway event. The raw uuid is
    // kept (for hover-title disambiguation + the admin-id filter); the
    // server now also resolves the matching admin_staff row so the
    // panel can render "Display Name (email)" instead of the raw uuid.
    adminId?: string | null;
    adminDisplayName?: string | null;
    adminEmail?: string | null;
  };
}

interface GatewayBlockRateRow {
  connectorId: string;
  platform: string;
  blockedCount: number;
  recentReasons: string[];
  reasonCategoryCounts?: Partial<Record<GatewayBlockCategory, number>>;
}

interface GatewayBlockRate {
  windowMs: number;
  threshold: number;
  connectors: GatewayBlockRateRow[];
}

interface GatewayRateLimitRow {
  connectorId: string;
  platform: string;
  displayName: string;
  platformSendApproved: boolean;
  platformSendApprovedBy: string | null;
  platformSendApprovedAt: string | null;
  autoPausedAt: string | null;
  autoPausedReason: string | null;
  apiAccessMode: string;
  rateLimit: {
    used: number;
    limit: number;
    remaining: number;
    windowMs: number;
    resetAt: string;
  } | null;
}

interface GatewayActivity {
  events: GatewayBusEvent[];
  total: number;
  limit: number;
  offset: number;
  filters?: {
    from: string | null;
    to: string | null;
    platform?: string | null;
    connectorId?: string | null;
    kind?: "simulated" | "dispatched" | "blocked" | null;
  };
  rateLimits: GatewayRateLimitRow[];
  blockRate?: GatewayBlockRate;
  liveDispatchEnabled: boolean;
  // Task #583 — number of rows in audience_gateway_events whose
  // connector_id is still NULL (pre-#532 rows that couldn't be
  // attributed by the backfill script). Used to show a hint next to
  // the Connector dropdown so admins know the filter can hide rows.
  unattributedConnectorCount?: number;
}

export function GatewayActivityCard(_props: { productionId: string }) {
  const qc = useQueryClient();

  const connectorsQuery = useQuery<{ connectors: Connector[] }>({
    queryKey: ["/api/admin/newsroom/audience/connectors"],
  });

  // Task #579: filter selections persist across visits — initial values
  // come from the URL query string (so links are shareable) and fall
  // back to localStorage (so re-opening the page restores the last view).
  const initialGatewayFilters = useMemo(
    () => readInitialGatewayFilters(),
    [],
  );
  const [gatewayFrom, setGatewayFrom] = useState<string>(
    initialGatewayFilters.from,
  );
  const [gatewayTo, setGatewayTo] = useState<string>(initialGatewayFilters.to);
  const [gatewayLimit, setGatewayLimit] = useState<number>(50);
  const [gatewayOffset, setGatewayOffset] = useState<number>(0);
  const [gatewayFilterError, setGatewayFilterError] = useState<string | null>(null);
  const [gatewayPlatform, setGatewayPlatform] = useState<string>(
    initialGatewayFilters.platform,
  );
  const [gatewayKind, setGatewayKind] = useState<GatewayKind>(
    initialGatewayFilters.kind,
  );
  const [gatewayConnectorId, setGatewayConnectorId] = useState<string>(
    initialGatewayFilters.connectorId,
  );
  const [gatewayAdminId, setGatewayAdminId] = useState<string>("");
  // Task #630 — transient "Copied" confirmation for the share-link button.
  const [gatewayShareLinkCopied, setGatewayShareLinkCopied] =
    useState<boolean>(false);
  // Task #680 — QR code popover state for handing the current filtered
  // URL to a phone / incident-room monitor without copy/paste.
  const [gatewayQrOpen, setGatewayQrOpen] = useState<boolean>(false);
  const [gatewayQrDataUrl, setGatewayQrDataUrl] = useState<string>("");
  const [gatewayQrUrl, setGatewayQrUrl] = useState<string>("");
  const [gatewayQrError, setGatewayQrError] = useState<string>("");

  // Task #579: whenever any gateway filter changes, mirror the selection
  // into the URL (so an admin can copy a link to the exact view) and
  // into localStorage (so the next visit restores it automatically).
  useEffect(() => {
    persistGatewayFilters({
      from: gatewayFrom,
      to: gatewayTo,
      platform: gatewayPlatform,
      kind: gatewayKind,
      connectorId: gatewayConnectorId,
    });
  }, [
    gatewayFrom,
    gatewayTo,
    gatewayPlatform,
    gatewayKind,
    gatewayConnectorId,
  ]);

  const localInputToIso = (v: string): string | null => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  const gatewayFromIso = localInputToIso(gatewayFrom);
  const gatewayToIso = localInputToIso(gatewayTo);

  const gatewayQuery = useQuery<GatewayActivity>({
    queryKey: [
      "/api/admin/newsroom/audience/gateway/activity",
      {
        from: gatewayFromIso,
        to: gatewayToIso,
        limit: gatewayLimit,
        offset: gatewayOffset,
        platform: gatewayPlatform || null,
        connectorId: gatewayConnectorId || null,
        kind: gatewayKind || null,
        adminId: gatewayAdminId.trim() || null,
      },
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(gatewayLimit));
      params.set("offset", String(gatewayOffset));
      if (gatewayFromIso) params.set("from", gatewayFromIso);
      if (gatewayToIso) params.set("to", gatewayToIso);
      if (gatewayPlatform) params.set("platform", gatewayPlatform);
      if (gatewayConnectorId) params.set("connectorId", gatewayConnectorId);
      if (gatewayKind) params.set("kind", gatewayKind);
      if (gatewayAdminId.trim()) params.set("adminId", gatewayAdminId.trim());
      const res = await fetch(
        `/api/admin/newsroom/audience/gateway/activity?${params.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return (await res.json()) as GatewayActivity;
    },
    refetchInterval:
      gatewayFromIso ||
      gatewayToIso ||
      gatewayPlatform ||
      gatewayConnectorId ||
      gatewayKind ||
      gatewayAdminId.trim() ||
      gatewayOffset > 0
        ? false
        : 5000,
  });

  const platformSendApprovalMutation = useMutation({
    mutationFn: async ({ connectorId, approved }: { connectorId: string; approved: boolean }) => {
      return await apiRequest(
        "POST",
        `/api/admin/newsroom/audience/connectors/${connectorId}/platform-send-approval`,
        { approved },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/gateway/activity"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/newsroom/audience/connectors"] });
    },
  });

  return (
      <Card data-testid="card-gateway-activity">
        <CardHeader>
          <CardTitle>Platform gateway activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Every gated moderation send routed through the audience platform
            gateway is recorded here — simulated, dispatched, or blocked — with
            the reason and per-connector rate-limit budget.{" "}
            <strong>
              Live dispatch is{" "}
              <span data-testid="text-live-dispatch-state">
                {gatewayQuery.data?.liveDispatchEnabled ? "ON" : "OFF"}
              </span>
            </strong>
            . Without it every attempt is a safe simulation.
          </p>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase">
              Per-connector rate-limit budget (per-minute window)
            </div>
            {(gatewayQuery.data?.rateLimits ?? []).length === 0 ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="text-no-gateway-rate-limits"
              >
                No connectors registered.
              </p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {gatewayQuery.data!.rateLimits.map((row) => {
                  const rl = row.rateLimit;
                  return (
                    <div
                      key={row.connectorId}
                      // `id` anchor + `data-testid` together let the gateway
                      // block alert's `actionUrl` deep-link (#gateway-<id>)
                      // straight to the offending connector row (Task #419).
                      id={`gateway-${row.connectorId}`}
                      className="rounded border p-3 space-y-2 scroll-mt-20"
                      data-testid={`card-gateway-rate-${row.connectorId}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm">{row.displayName}</div>
                        <Badge variant="outline">{row.platform}</Badge>
                      </div>
                      <div className="text-xs flex flex-wrap gap-2 items-center">
                        <Badge variant="outline">{row.apiAccessMode}</Badge>
                        {rl ? (
                          <>
                            <span data-testid={`text-rate-used-${row.connectorId}`}>
                              used <strong>{rl.used}</strong> / {rl.limit}
                            </span>
                            <span data-testid={`text-rate-remaining-${row.connectorId}`}>
                              remaining <strong>{rl.remaining}</strong>
                            </span>
                            <span
                              className="text-muted-foreground"
                              data-testid={`text-rate-reset-${row.connectorId}`}
                            >
                              resets {new Date(rl.resetAt).toLocaleTimeString()}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">no budget</span>
                        )}
                      </div>
                      <label
                        className="flex items-center gap-2 text-xs cursor-pointer"
                        data-testid={`label-platform-send-approval-${row.connectorId}`}
                      >
                        <input
                          type="checkbox"
                          checked={row.platformSendApproved}
                          disabled={platformSendApprovalMutation.isPending}
                          onChange={(e) =>
                            platformSendApprovalMutation.mutate({
                              connectorId: row.connectorId,
                              approved: e.target.checked,
                            })
                          }
                          data-testid={`checkbox-platform-send-approval-${row.connectorId}`}
                        />
                        <span>Approve platform send (root admin opt-in)</span>
                      </label>
                      {row.platformSendApproved && row.platformSendApprovedAt && (
                        <div
                          className="text-[11px] text-muted-foreground"
                          data-testid={`text-platform-send-approved-meta-${row.connectorId}`}
                        >
                          Approved {new Date(row.platformSendApprovedAt).toLocaleString()}
                          {row.platformSendApprovedBy ? ` · by ${row.platformSendApprovedBy}` : ""}
                        </div>
                      )}
                      {row.autoPausedAt && !row.platformSendApproved && (
                        <div
                          className="flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs"
                          data-testid={`badge-auto-paused-${row.connectorId}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className="font-medium text-amber-700 dark:text-amber-300"
                              data-testid={`text-auto-paused-label-${row.connectorId}`}
                            >
                              Auto-paused {new Date(row.autoPausedAt).toLocaleString()}
                            </span>
                            <button
                              type="button"
                              className="rounded border border-amber-500/60 px-2 py-0.5 text-[11px] font-medium hover:bg-amber-500/20"
                              disabled={platformSendApprovalMutation.isPending}
                              onClick={() =>
                                platformSendApprovalMutation.mutate({
                                  connectorId: row.connectorId,
                                  approved: true,
                                })
                              }
                              data-testid={`button-auto-paused-reenable-${row.connectorId}`}
                            >
                              Re-enable
                            </button>
                          </div>
                          {row.autoPausedReason && (
                            <div
                              className="text-[11px] text-amber-700/80 dark:text-amber-300/80"
                              data-testid={`text-auto-paused-reason-${row.connectorId}`}
                            >
                              {row.autoPausedReason}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {(() => {
            const br = gatewayQuery.data?.blockRate;
            if (!br) return null;
            const windowSec = Math.max(1, Math.round((br.windowMs ?? 0) / 1000));
            const rateLimitById = new Map(
              (gatewayQuery.data?.rateLimits ?? []).map((r) => [r.connectorId, r]),
            );
            return (
              <div className="space-y-2" data-testid="section-gateway-block-rate">
                <div className="text-xs font-medium text-muted-foreground uppercase">
                  Per-connector block rate (rolling {windowSec}s window, alert
                  threshold {br.threshold})
                </div>
                {br.connectors.length === 0 ? (
                  <p
                    className="text-sm text-muted-foreground"
                    data-testid="text-no-gateway-block-rate"
                  >
                    No gateway blocks in the last {windowSec}s.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {br.connectors.map((c) => {
                      const meta = rateLimitById.get(c.connectorId);
                      const overThreshold = c.blockedCount >= br.threshold;
                      return (
                        <li
                          key={c.connectorId}
                          className="rounded border p-2 text-xs flex flex-wrap gap-2 items-center"
                          data-testid={`row-gateway-block-rate-${c.connectorId}`}
                        >
                          <Badge variant={overThreshold ? "destructive" : "secondary"}>
                            {c.blockedCount} block{c.blockedCount === 1 ? "" : "s"}
                          </Badge>
                          <Badge variant="outline">{c.platform}</Badge>
                          <span className="font-medium">
                            {meta?.displayName ?? c.connectorId}
                          </span>
                          {(() => {
                            const counts = c.reasonCategoryCounts ?? {};
                            const entries = GATEWAY_BLOCK_CATEGORIES.flatMap(
                              (cat) => {
                                const n = counts[cat] ?? 0;
                                return n > 0
                                  ? [[cat, n] as [GatewayBlockCategory, number]]
                                  : [];
                              },
                            );
                            if (entries.length === 0) return null;
                            return (
                              <span
                                className="flex flex-wrap gap-1"
                                data-testid={`text-block-rate-reasons-${c.connectorId}`}
                              >
                                {entries.map(([cat, n]) => (
                                  <Badge
                                    key={cat}
                                    variant="outline"
                                    className="text-[11px]"
                                    title={
                                      c.recentReasons.length > 0
                                        ? `Recent: ${c.recentReasons.join(", ")}`
                                        : undefined
                                    }
                                    data-testid={`badge-block-rate-category-${c.connectorId}-${cat}`}
                                  >
                                    {GATEWAY_BLOCK_CATEGORY_LABELS[cat]}: {n}
                                  </Badge>
                                ))}
                              </span>
                            );
                          })()}
                          <a
                            href={`#gateway-${c.connectorId}`}
                            className="ml-auto underline text-primary"
                            data-testid={`link-block-rate-jump-${c.connectorId}`}
                          >
                            Jump to connector
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })()}

          <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="text-xs font-medium text-muted-foreground uppercase">
                Recent gateway events
              </div>
              {gatewayQuery.data && (
                <div
                  className="text-xs text-muted-foreground"
                  data-testid="text-gateway-events-total"
                >
                  {gatewayQuery.data.total.toLocaleString()} total
                  {(gatewayFromIso || gatewayToIso || gatewayPlatform || gatewayKind || gatewayAdminId.trim()) && " (filtered)"}
                </div>
              )}
            </div>

            {/*
              Task #460 — date-range + pagination controls for the
              persisted audience_gateway_events log. Without filters this
              card auto-polls every 5s and shows the live tail; with any
              filter or non-zero offset polling is disabled so historical
              pages don't keep shifting under the admin's cursor.
            */}
            <div className="flex flex-wrap items-end gap-2 rounded border p-2 bg-muted/30">
              <div className="flex flex-col gap-1">
                <label
                  className="text-[11px] font-medium text-muted-foreground uppercase"
                  htmlFor="input-gateway-from"
                >
                  From
                </label>
                <Input
                  id="input-gateway-from"
                  type="datetime-local"
                  value={gatewayFrom}
                  onChange={(e) => {
                    setGatewayFrom(e.target.value);
                    setGatewayOffset(0);
                    setGatewayFilterError(null);
                  }}
                  className="h-8 text-xs w-[200px]"
                  data-testid="input-gateway-from"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  className="text-[11px] font-medium text-muted-foreground uppercase"
                  htmlFor="input-gateway-to"
                >
                  To
                </label>
                <Input
                  id="input-gateway-to"
                  type="datetime-local"
                  value={gatewayTo}
                  onChange={(e) => {
                    setGatewayTo(e.target.value);
                    setGatewayOffset(0);
                    setGatewayFilterError(null);
                  }}
                  className="h-8 text-xs w-[200px]"
                  data-testid="input-gateway-to"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  className="text-[11px] font-medium text-muted-foreground uppercase"
                  htmlFor="select-gateway-page-size"
                >
                  Page size
                </label>
                <select
                  id="select-gateway-page-size"
                  value={gatewayLimit}
                  onChange={(e) => {
                    setGatewayLimit(Number(e.target.value));
                    setGatewayOffset(0);
                  }}
                  className="h-8 text-xs rounded border bg-background px-2"
                  data-testid="select-gateway-page-size"
                >
                  {[25, 50, 100, 200, 500].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label
                  className="text-[11px] font-medium text-muted-foreground uppercase"
                  htmlFor="select-gateway-platform"
                >
                  Platform
                </label>
                <select
                  id="select-gateway-platform"
                  value={gatewayPlatform}
                  onChange={(e) => {
                    setGatewayPlatform(e.target.value);
                    setGatewayOffset(0);
                    setGatewayFilterError(null);
                  }}
                  className="h-8 text-xs rounded border bg-background px-2"
                  data-testid="select-gateway-platform"
                >
                  <option value="">All platforms</option>
                  {Array.from(
                    new Set([
                      ...PLATFORMS,
                      ...((connectorsQuery.data?.connectors ?? []).map((c) => c.platform)),
                    ]),
                  ).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label
                  className="text-[11px] font-medium text-muted-foreground uppercase"
                  htmlFor="select-gateway-connector"
                >
                  Connector
                </label>
                <select
                  id="select-gateway-connector"
                  value={gatewayConnectorId}
                  onChange={(e) => {
                    setGatewayConnectorId(e.target.value);
                    setGatewayOffset(0);
                    setGatewayFilterError(null);
                  }}
                  className="h-8 text-xs rounded border bg-background px-2"
                  data-testid="select-gateway-connector"
                >
                  <option value="">All connectors</option>
                  {(connectorsQuery.data?.connectors ?? [])
                    .filter(
                      (c) => !gatewayPlatform || c.platform === gatewayPlatform,
                    )
                    .map((c) => (
                      <option key={c.connectorId} value={c.connectorId}>
                        {c.displayName} ({c.platform})
                      </option>
                    ))}
                </select>
                {(gatewayQuery.data?.unattributedConnectorCount ?? 0) > 0 && (
                  <span
                    className="text-[10px] text-muted-foreground"
                    data-testid="text-gateway-unattributed-connector-hint"
                    title="Rows persisted before connector attribution shipped (Task #532) have no connector value, so filtering by a specific connector will hide them."
                  >
                    {gatewayQuery.data?.unattributedConnectorCount} historical row
                    {(gatewayQuery.data?.unattributedConnectorCount ?? 0) === 1 ? "" : "s"}{" "}
                    have no connector
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label
                  className="text-[11px] font-medium text-muted-foreground uppercase"
                  htmlFor="select-gateway-kind"
                >
                  Outcome
                </label>
                <select
                  id="select-gateway-kind"
                  value={gatewayKind}
                  onChange={(e) => {
                    setGatewayKind(e.target.value as typeof gatewayKind);
                    setGatewayOffset(0);
                    setGatewayFilterError(null);
                  }}
                  className="h-8 text-xs rounded border bg-background px-2"
                  data-testid="select-gateway-kind"
                >
                  <option value="">All outcomes</option>
                  <option value="simulated">simulated</option>
                  <option value="dispatched">dispatched</option>
                  <option value="blocked">blocked</option>
                </select>
              </div>
              {/*
                Task #573 — narrow further to a specific admin actor id
                so an incident responder can pull "everything admin_X
                dispatched". The Download CSV button below forwards this
                filter so the downloaded file mirrors the on-screen slice.
              */}
              <div className="flex flex-col gap-1">
                <label
                  className="text-[11px] font-medium text-muted-foreground uppercase"
                  htmlFor="input-gateway-admin-id"
                >
                  Admin ID
                </label>
                <Input
                  id="input-gateway-admin-id"
                  type="text"
                  value={gatewayAdminId}
                  placeholder="e.g. admin_42"
                  onChange={(e) => {
                    setGatewayAdminId(e.target.value);
                    setGatewayOffset(0);
                    setGatewayFilterError(null);
                  }}
                  className="h-8 text-xs w-[180px]"
                  data-testid="input-gateway-admin-id"
                />
              </div>
              {(gatewayFrom ||
                gatewayTo ||
                gatewayPlatform ||
                gatewayKind ||
                gatewayConnectorId ||
                gatewayAdminId.trim()) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    setGatewayFilterError(null);
                    setGatewayFrom("");
                    setGatewayTo("");
                    setGatewayPlatform("");
                    setGatewayConnectorId("");
                    setGatewayKind("");
                    setGatewayAdminId("");
                    setGatewayOffset(0);
                  }}
                  data-testid="button-gateway-clear-filters"
                  title="Reset all gateway filters and resume live tail"
                >
                  Clear filters
                </Button>
              )}
              {/*
                Task #630 — one-click "Copy link to this view" button.
                Copies the current full URL (with gw_* params already
                mirrored by persistGatewayFilters) to the clipboard so
                an admin can paste it into Slack / a ticket and the
                recipient lands on the exact filtered view.
                Disabled when no URL-persisted filter is active so
                admins don't accidentally share an empty link.
              */}
              {(() => {
                const hasShareableFilter =
                  !!gatewayFrom ||
                  !!gatewayTo ||
                  !!gatewayPlatform ||
                  !!gatewayKind ||
                  !!gatewayConnectorId;
                return (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={!hasShareableFilter}
                    onClick={async () => {
                      if (typeof window === "undefined") return;
                      const url = window.location.href;
                      try {
                        if (navigator.clipboard?.writeText) {
                          await navigator.clipboard.writeText(url);
                        } else {
                          const ta = document.createElement("textarea");
                          ta.value = url;
                          ta.setAttribute("readonly", "");
                          ta.style.position = "absolute";
                          ta.style.left = "-9999px";
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand("copy");
                          document.body.removeChild(ta);
                        }
                        setGatewayShareLinkCopied(true);
                        window.setTimeout(
                          () => setGatewayShareLinkCopied(false),
                          1500,
                        );
                      } catch {
                        // Clipboard blocked — silently fail; the URL is
                        // still visible in the address bar.
                      }
                    }}
                    title={
                      hasShareableFilter
                        ? "Copy a shareable link to this filtered view"
                        : "Select a filter to enable sharing"
                    }
                    data-testid="button-gateway-copy-share-link"
                  >
                    {gatewayShareLinkCopied ? "Copied" : "Copy link"}
                  </Button>
                );
              })()}
              {/*
                Task #680 — QR code popover. Encodes the same URL that
                "Copy link" copies so a founder on a laptop can hand the
                exact filtered view to a colleague on a phone or to an
                incident-room monitor without copy/paste. Shares the
                "shareable filter" gate with "Copy link" so admins can't
                accidentally publish an empty link.
              */}
              {(() => {
                const hasShareableFilter =
                  !!gatewayFrom ||
                  !!gatewayTo ||
                  !!gatewayPlatform ||
                  !!gatewayKind ||
                  !!gatewayConnectorId;
                return (
                  <Popover
                    open={gatewayQrOpen}
                    onOpenChange={(open) => {
                      setGatewayQrOpen(open);
                      if (open && typeof window !== "undefined") {
                        const url = window.location.href;
                        setGatewayQrUrl(url);
                        setGatewayQrDataUrl("");
                        setGatewayQrError("");
                        QRCode.toDataURL(url, {
                          width: 224,
                          margin: 1,
                          errorCorrectionLevel: "M",
                        })
                          .then((dataUrl) => setGatewayQrDataUrl(dataUrl))
                          .catch(() =>
                            setGatewayQrError(
                              "Could not render QR code for this URL.",
                            ),
                          );
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={!hasShareableFilter}
                        title={
                          hasShareableFilter
                            ? "Show a QR code for this filtered view"
                            : "Select a filter to enable sharing"
                        }
                        aria-label="Show QR code for this filtered view"
                        data-testid="button-gateway-share-qr"
                      >
                        {/* Inline QR glyph — avoids adding an icon dep. */}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          width="14"
                          height="14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="square"
                          strokeLinejoin="miter"
                          aria-hidden="true"
                          className="mr-1"
                        >
                          <rect x="3" y="3" width="7" height="7" />
                          <rect x="14" y="3" width="7" height="7" />
                          <rect x="3" y="14" width="7" height="7" />
                          <rect x="14" y="14" width="3" height="3" />
                          <rect x="18" y="14" width="3" height="3" />
                          <rect x="14" y="18" width="3" height="3" />
                          <rect x="18" y="18" width="3" height="3" />
                        </svg>
                        QR
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="w-auto"
                      data-testid="popover-gateway-share-qr"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className="text-xs font-medium">
                          Scan to open this filtered view
                        </div>
                        {gatewayQrError ? (
                          <div
                            className="text-xs text-destructive max-w-[240px] text-center"
                            data-testid="text-gateway-share-qr-error"
                          >
                            {gatewayQrError}
                          </div>
                        ) : gatewayQrDataUrl ? (
                          <img
                            src={gatewayQrDataUrl}
                            alt="QR code for this filtered gateway events view"
                            width={224}
                            height={224}
                            className="rounded bg-white p-2"
                            data-testid="img-gateway-share-qr"
                          />
                        ) : (
                          <div
                            className="h-[224px] w-[224px] flex items-center justify-center text-xs text-muted-foreground"
                            data-testid="text-gateway-share-qr-loading"
                          >
                            Generating…
                          </div>
                        )}
                        {gatewayQrUrl && (
                          <div
                            className="text-[10px] text-muted-foreground break-all max-w-[240px] text-center"
                            data-testid="text-gateway-share-qr-url"
                          >
                            {gatewayQrUrl}
                          </div>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              })()}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  if (gatewayFromIso && gatewayToIso && gatewayFromIso > gatewayToIso) {
                    setGatewayFilterError("From must be before To");
                    return;
                  }
                  setGatewayFilterError(null);
                  const filteredTotal = gatewayQuery.data?.total ?? 0;
                  if (filteredTotal > GATEWAY_EVENTS_CSV_ROW_CAP) {
                    const ok = window.confirm(
                      `This slice has ${filteredTotal.toLocaleString()} rows but the CSV is hard-capped at ${GATEWAY_EVENTS_CSV_ROW_CAP.toLocaleString()} rows. The download will be truncated. Continue anyway?`,
                    );
                    if (!ok) return;
                  }
                  const params = new URLSearchParams();
                  if (gatewayFromIso) params.set("from", gatewayFromIso);
                  if (gatewayToIso) params.set("to", gatewayToIso);
                  // Task #537: download the same slice the admin is
                  // currently viewing — forward the active platform
                  // and outcome filters too.
                  if (gatewayPlatform) params.set("platform", gatewayPlatform);
                  if (gatewayKind) params.set("kind", gatewayKind);
                  // Task #573: forward the adminId filter so the CSV
                  // mirrors the per-admin slice on screen.
                  if (gatewayAdminId.trim()) params.set("adminId", gatewayAdminId.trim());
                  // Task #584: carry the connector filter into the
                  // export URL so the CSV matches the slice the admin
                  // is currently viewing in the panel.
                  if (gatewayConnectorId)
                    params.set("connectorId", gatewayConnectorId);
                  const qs = params.toString();
                  const url =
                    `/api/admin/newsroom/audience/gateway/activity/export` +
                    (qs ? `?${qs}` : "");
                  window.location.assign(url);
                }}
                data-testid="button-gateway-events-download-csv"
                title="Download the filtered gateway events as a CSV. The download is recorded in the audit-export trail."
              >
                Download CSV
              </Button>
              {gatewayQuery.data &&
                gatewayQuery.data.total > GATEWAY_EVENTS_CSV_ROW_CAP && (
                  <span
                    className="text-xs text-amber-600 dark:text-amber-400"
                    data-testid="text-gateway-events-csv-cap-warning"
                  >
                    This download will be capped at{" "}
                    {GATEWAY_EVENTS_CSV_ROW_CAP.toLocaleString()} rows (filtered
                    total: {gatewayQuery.data.total.toLocaleString()}). Narrow
                    the filters to capture everything.
                  </span>
                )}
              {gatewayFilterError && (
                <span
                  className="text-xs text-destructive"
                  data-testid="text-gateway-filter-error"
                >
                  {gatewayFilterError}
                </span>
              )}
            </div>

            {gatewayQuery.isLoading ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="text-gateway-events-loading"
              >
                Loading gateway events…
              </p>
            ) : (gatewayQuery.data?.events ?? []).length === 0 ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="text-no-gateway-events"
              >
                {gatewayFromIso || gatewayToIso || gatewayOffset > 0
                  ? "No gateway events match these filters."
                  : "No gateway sends recorded yet."}
              </p>
            ) : (
              <ScrollArea className="h-[320px]">
                <ul className="space-y-1">
                  {gatewayQuery.data!.events.map((e) => {
                    const kind =
                      e.name === "audience.gateway_send_dispatched"
                        ? "dispatched"
                        : e.name === "audience.gateway_send_simulated"
                          ? "simulated"
                          : "blocked";
                    const variant =
                      kind === "dispatched"
                        ? "default"
                        : kind === "simulated"
                          ? "secondary"
                          : "destructive";
                    return (
                      <li
                        key={e.id}
                        className="rounded border p-2 text-xs flex flex-wrap gap-2 items-center"
                        data-testid={`row-gateway-event-${e.id}`}
                      >
                        <Badge variant={variant as any}>{kind}</Badge>
                        {e.payload.platform && (
                          <Badge variant="outline">{e.payload.platform}</Badge>
                        )}
                        {e.payload.requestedAction && (
                          <Badge variant="outline">{e.payload.requestedAction}</Badge>
                        )}
                        {e.payload.status != null && (
                          <Badge variant="outline">HTTP {e.payload.status}</Badge>
                        )}
                        {kind === "blocked" && e.payload.connectorId && (
                          <a
                            href={`#gateway-${e.payload.connectorId}`}
                            className="underline text-primary"
                            data-testid={`link-gateway-event-connector-${e.id}`}
                          >
                            connector: {e.payload.connectorId}
                          </a>
                        )}
                        {kind === "blocked" && e.payload.reason && (
                          <span
                            className="text-destructive"
                            data-testid={`text-gateway-reason-${e.id}`}
                          >
                            reason: {e.payload.reason}
                          </span>
                        )}
                        {e.payload.method && e.payload.url && (
                          <span className="font-mono text-[11px] break-all text-muted-foreground">
                            {e.payload.method} {e.payload.url}
                          </span>
                        )}
                        {e.payload.adminId && (
                          <span
                            className="text-muted-foreground"
                            title={e.payload.adminId}
                            data-testid={`text-gateway-event-actor-${e.id}`}
                          >
                            actor:{" "}
                            {e.payload.adminDisplayName
                              ? `${e.payload.adminDisplayName}${e.payload.adminEmail ? ` (${e.payload.adminEmail})` : ""}`
                              : e.payload.adminEmail ?? e.payload.adminId}
                          </span>
                        )}
                        <span className="ml-auto text-muted-foreground">
                          {new Date(e.emittedAt).toLocaleString()}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}

            {gatewayQuery.data && gatewayQuery.data.total > 0 && (
              <div
                className="flex flex-wrap items-center justify-between gap-2 pt-1"
                data-testid="section-gateway-events-pagination"
              >
                <div
                  className="text-xs text-muted-foreground"
                  data-testid="text-gateway-events-page-info"
                >
                  Showing{" "}
                  {gatewayQuery.data.events.length === 0
                    ? 0
                    : gatewayQuery.data.offset + 1}
                  –
                  {gatewayQuery.data.offset + gatewayQuery.data.events.length}{" "}
                  of {gatewayQuery.data.total.toLocaleString()}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={gatewayOffset <= 0 || gatewayQuery.isFetching}
                    onClick={() =>
                      setGatewayOffset(Math.max(0, gatewayOffset - gatewayLimit))
                    }
                    data-testid="button-gateway-events-prev"
                  >
                    Prev
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={
                      gatewayOffset + gatewayQuery.data.events.length >=
                        gatewayQuery.data.total || gatewayQuery.isFetching
                    }
                    onClick={() => setGatewayOffset(gatewayOffset + gatewayLimit)}
                    data-testid="button-gateway-events-next"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
  );
}
