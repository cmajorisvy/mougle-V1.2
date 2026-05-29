/**
 * Task #672 — shared helper to resolve raw admin actor ids (uuids,
 * emails, or usernames from legacy session payloads) to a human-readable
 * `{ displayName, email }` pair by joining against `admin_staff`.
 *
 * Extracted from the per-history-panel join added in Task #619 (see
 * `audience-restore-log-rate-alert-service.ts`) so every audit panel in
 * the omni-channel-audience dashboard can render "Display Name (email)"
 * instead of a raw uuid without duplicating the join logic.
 *
 * The session can stash either the admin's id or, for legacy sessions,
 * their email/username, so we try id first and fall back to email /
 * username matches. The returned map keys every match against all
 * three columns so callers can look up by whatever raw value was
 * persisted.
 *
 * Task #690 — high-volume audit panels (audit export history, snooze
 * log, restore log) re-render the same handful of admin ids on every
 * refresh. To keep those reads cheap as history grows we layer a small
 * in-process TTL cache (default 60s) keyed by raw id in front of the
 * Postgres join. `admin_staff` churn is rare (one row per founder/staff
 * account) so a pure-TTL strategy is sufficient; we additionally expose
 * `invalidateAdminIdentityCache` for the staff-mutation routes to call
 * after an insert/update so display-name edits show up immediately.
 *
 * The cache also remembers negative lookups (raw id that didn't match
 * any admin_staff row) for the same TTL so a noisy unknown actor id
 * doesn't hammer the DB on every refresh.
 */

import { inArray, or } from "drizzle-orm";
import { db } from "../db";
import { adminStaff } from "@shared/schema";

export interface AdminIdentity {
  displayName: string;
  email: string;
}

const DEFAULT_TTL_MS = 60_000;
let cacheTtlMs = DEFAULT_TTL_MS;

interface CacheEntry {
  identity: AdminIdentity | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getFromCache(key: string, now: number): CacheEntry | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return undefined;
  }
  return entry;
}

function setInCache(key: string, identity: AdminIdentity | null, now: number) {
  cache.set(key, { identity, expiresAt: now + cacheTtlMs });
}

export async function resolveAdminIdentities(
  rawIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, AdminIdentity>> {
  const cleaned = Array.from(
    new Set(
      rawIds.filter(
        (v): v is string => typeof v === "string" && v.length > 0,
      ),
    ),
  );
  const out = new Map<string, AdminIdentity>();
  if (cleaned.length === 0) return out;

  const now = Date.now();
  const misses: string[] = [];
  for (const key of cleaned) {
    const entry = getFromCache(key, now);
    if (entry) {
      if (entry.identity) out.set(key, entry.identity);
      continue;
    }
    misses.push(key);
  }
  if (misses.length === 0) return out;

  try {
    const matches = await db
      .select({
        id: adminStaff.id,
        email: adminStaff.email,
        username: adminStaff.username,
        displayName: adminStaff.displayName,
      })
      .from(adminStaff)
      .where(
        or(
          inArray(adminStaff.id, misses),
          inArray(adminStaff.email, misses),
          inArray(adminStaff.username, misses),
        ),
      );

    const resolved = new Set<string>();
    for (const m of matches) {
      const identity: AdminIdentity = {
        displayName: m.displayName,
        email: m.email,
      };
      if (m.id) {
        out.set(m.id, identity);
        setInCache(m.id, identity, now);
        resolved.add(m.id);
      }
      if (m.email) {
        out.set(m.email, identity);
        setInCache(m.email, identity, now);
        resolved.add(m.email);
      }
      if (m.username) {
        out.set(m.username, identity);
        setInCache(m.username, identity, now);
        resolved.add(m.username);
      }
    }
    for (const key of misses) {
      if (!resolved.has(key)) setInCache(key, null, now);
    }
  } catch (err) {
    console.error(
      "[admin-identity-resolver] failed to resolve admin identities:",
      (err as Error)?.message ?? err,
    );
  }
  return out;
}

/**
 * Drop one or more cached entries (by any raw id / email / username key).
 * Pass no arguments to flush the entire cache. Call this from admin_staff
 * mutation routes so a display-name or email edit is visible immediately
 * instead of waiting up to TTL.
 */
export function invalidateAdminIdentityCache(
  ...keys: ReadonlyArray<string | null | undefined>
): void {
  if (keys.length === 0) {
    cache.clear();
    return;
  }
  for (const k of keys) {
    if (typeof k === "string" && k.length > 0) cache.delete(k);
  }
}

/**
 * Test-only knobs to inspect / tune the cache without exposing internal
 * state. Production code should not call these.
 */
export const __adminIdentityCacheTestOnly = {
  size: () => cache.size,
  setTtlMs: (ms: number) => {
    cacheTtlMs = ms;
  },
  resetTtl: () => {
    cacheTtlMs = DEFAULT_TTL_MS;
  },
  clear: () => cache.clear(),
};
