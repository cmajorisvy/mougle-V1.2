/**
 * Audience Gateway Event Log (Task #421).
 *
 * Permanent, DB-backed audit log of every gated moderation send emitted
 * by the audience platform gateway (`audience.gateway_send_simulated`,
 * `_dispatched`, `_blocked`). The neural newsroom bus only retains the
 * last 2,000 events in-memory and resets on every restart, so admins
 * reviewing a past incident or running a compliance audit cannot see
 * gateway sends from yesterday or last week.
 *
 * This service persists every emission to `audience_gateway_events`,
 * exposes a paginated reader (optionally filtered by a date range),
 * and a retention prune used by the audience retention sweeper.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  audienceGatewayEvents,
  type AudienceGatewayEventName,
  type AudienceGatewayEventRecord,
} from "../../shared/omni-channel-audience-schema";
import { resolveAdminIdentities } from "./admin-identity-resolver";

/**
 * Task #689 — gateway event record enriched with the resolved admin
 * identity for `payload.adminId`. Surfaces "Display Name (email)" on
 * the admin dashboard so founders no longer see a raw uuid in the
 * "actor" column. Mirrors the resolution pattern shipped for the four
 * audit panels in Task #672.
 */
export interface AudienceGatewayEventRecordEnriched
  extends AudienceGatewayEventRecord {
  payload: AudienceGatewayEventRecord["payload"] & {
    adminDisplayName?: string | null;
    adminEmail?: string | null;
  };
}

export type GatewayEventKind = "simulated" | "dispatched" | "blocked";

const KIND_TO_EVENT_NAME: Record<GatewayEventKind, AudienceGatewayEventName> = {
  simulated: "audience.gateway_send_simulated",
  dispatched: "audience.gateway_send_dispatched",
  blocked: "audience.gateway_send_blocked",
};

export interface GatewayEventInput {
  name: AudienceGatewayEventName;
  emittedAt?: Date;
  commandId?: string | null;
  connectorId?: string | null;
  platform?: string | null;
  requestedAction?: string | null;
  status?: number | null;
  reason?: string | null;
  url?: string | null;
  method?: string | null;
  adminId?: string | null;
}

export interface ListGatewayEventsOptions {
  limit?: number;
  offset?: number;
  fromDate?: Date | null;
  toDate?: Date | null;
  platform?: string | null;
  connectorId?: string | null;
  kind?: GatewayEventKind | null;
  adminId?: string | null;
}

export interface ListGatewayEventsResult {
  events: AudienceGatewayEventRecordEnriched[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function rowToRecord(row: typeof audienceGatewayEvents.$inferSelect): AudienceGatewayEventRecord {
  return {
    id: row.eventId,
    name: row.eventName as AudienceGatewayEventName,
    emittedAt:
      row.emittedAt instanceof Date ? row.emittedAt.toISOString() : String(row.emittedAt),
    payload: {
      commandId: row.commandId ?? null,
      connectorId: row.connectorId ?? null,
      platform: (row.platform as any) ?? null,
      requestedAction: (row.requestedAction as any) ?? null,
      url: row.urlRedacted ?? null,
      method: row.method ?? null,
      status: row.status ?? null,
      reason: row.reason ?? null,
      adminId: row.adminId ?? null,
    },
  };
}

export async function recordGatewayEvent(input: GatewayEventInput): Promise<void> {
  try {
    await db.insert(audienceGatewayEvents).values({
      eventId: randomUUID(),
      eventName: input.name,
      commandId: input.commandId ?? null,
      connectorId: input.connectorId ?? null,
      platform: input.platform ?? null,
      requestedAction: input.requestedAction ?? null,
      status: input.status ?? null,
      reason: input.reason ?? null,
      urlRedacted: input.url ?? null,
      method: input.method ?? null,
      adminId: input.adminId ?? null,
      emittedAt: input.emittedAt ?? new Date(),
    });
  } catch (err) {
    // Persisting the gateway event MUST NOT fail the dispatch flow — the
    // gated send already succeeded (or was already blocked). Log so ops
    // notices an audit-log outage.
    console.error("[audience-gateway-event-log] failed to persist event:", err);
  }
}

export async function listGatewayEvents(
  opts: ListGatewayEventsOptions = {},
): Promise<ListGatewayEventsResult> {
  const limit = Math.min(
    Math.max(1, Math.floor(opts.limit ?? DEFAULT_LIMIT)),
    MAX_LIMIT,
  );
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  const conds: any[] = [];
  if (opts.fromDate) conds.push(gte(audienceGatewayEvents.emittedAt, opts.fromDate));
  if (opts.toDate) conds.push(lte(audienceGatewayEvents.emittedAt, opts.toDate));
  if (opts.platform) conds.push(eq(audienceGatewayEvents.platform, opts.platform));
  if (opts.connectorId) conds.push(eq(audienceGatewayEvents.connectorId, opts.connectorId));
  if (opts.kind) conds.push(eq(audienceGatewayEvents.eventName, KIND_TO_EVENT_NAME[opts.kind]));
  if (opts.adminId) conds.push(eq(audienceGatewayEvents.adminId, opts.adminId));
  const whereClause = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);

  const rowsQuery = db
    .select()
    .from(audienceGatewayEvents)
    .orderBy(desc(audienceGatewayEvents.emittedAt))
    .limit(limit)
    .offset(offset);
  const countQuery = db
    .select({ c: sql<number>`count(*)::int` })
    .from(audienceGatewayEvents);

  const [rows, countRows] = await Promise.all([
    whereClause ? rowsQuery.where(whereClause) : rowsQuery,
    whereClause ? countQuery.where(whereClause) : countQuery,
  ]);

  const baseEvents = (rows as any[]).map(rowToRecord);
  // Task #689 — resolve raw `payload.adminId` uuids to a human readable
  // "Display Name (email)" via the shared admin-identity helper so the
  // gateway-event panel matches the four audit panels shipped in #672.
  const identityById = await resolveAdminIdentities(
    baseEvents.map((e) => e.payload.adminId ?? null),
  );
  const events: AudienceGatewayEventRecordEnriched[] = baseEvents.map((e) => {
    const id = e.payload.adminId ?? null;
    const ident = id ? identityById.get(id) ?? null : null;
    return {
      ...e,
      payload: {
        ...e.payload,
        adminDisplayName: ident?.displayName ?? null,
        adminEmail: ident?.email ?? null,
      },
    };
  });
  return {
    events,
    total: Number((countRows as any[])[0]?.c ?? 0),
    limit,
    offset,
  };
}

/**
 * Task #583 — count rows whose `connector_id` is still NULL. Used by the
 * admin UI to surface a "(some historical rows have no connector)" hint
 * next to the Connector filter so admins understand why filtering by a
 * specific connector can hide pre-#532 rows.
 */
export async function countGatewayEventsWithoutConnector(): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(audienceGatewayEvents)
    .where(isNull(audienceGatewayEvents.connectorId));
  return Number((rows as any[])[0]?.c ?? 0);
}

export async function pruneGatewayEventsOlderThan(cutoff: Date): Promise<number> {
  const res: any = await db
    .delete(audienceGatewayEvents)
    .where(lt(audienceGatewayEvents.emittedAt, cutoff));
  return (res?.rowCount as number) ?? 0;
}
