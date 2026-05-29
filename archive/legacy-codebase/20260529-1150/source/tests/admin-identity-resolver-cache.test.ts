/**
 * Task #690 — verify the TTL cache in front of resolveAdminIdentities.
 * Covers: cache hit short-circuits repeated lookups within TTL, TTL
 * expiry forces a fresh DB read, invalidate clears specific keys,
 * invalidate() with no args flushes the whole cache, and negative
 * lookups are cached for the same TTL so unknown ids do not hammer
 * the DB on every refresh.
 */

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";

import { db } from "../server/db";
import {
  __adminIdentityCacheTestOnly,
  invalidateAdminIdentityCache,
  resolveAdminIdentities,
} from "../server/services/admin-identity-resolver";

const STAFF_ID = `task690-${Date.now()}`;
const STAFF_EMAIL = `task690-${Date.now()}@mougle.test`;
const STAFF_USERNAME = `task690u${Date.now()}`;
const STAFF_DISPLAY_INITIAL = "Task690 Initial";
const STAFF_DISPLAY_UPDATED = "Task690 Updated";

// Raw SQL on purpose: some test DBs lag the Drizzle schema (e.g. the
// optional `slack_handle` column) so we only touch the strictly-required
// NOT NULL fields — same pattern as audience-restore-log-rate-threshold-history.test.ts.
before(async () => {
  await db.execute(sql`DELETE FROM admin_staff WHERE id=${STAFF_ID} OR email=${STAFF_EMAIL} OR username=${STAFF_USERNAME}`);
  await db.execute(sql`
    INSERT INTO admin_staff (id, email, username, password_hash, display_name, role, active)
    VALUES (${STAFF_ID}, ${STAFF_EMAIL}, ${STAFF_USERNAME}, 'x', ${STAFF_DISPLAY_INITIAL}, 'staff', true)
  `);
});

after(async () => {
  await db.execute(sql`DELETE FROM admin_staff WHERE id=${STAFF_ID}`);
  __adminIdentityCacheTestOnly.resetTtl();
  __adminIdentityCacheTestOnly.clear();
});

beforeEach(async () => {
  __adminIdentityCacheTestOnly.resetTtl();
  __adminIdentityCacheTestOnly.clear();
  await db.execute(sql`UPDATE admin_staff SET display_name=${STAFF_DISPLAY_INITIAL} WHERE id=${STAFF_ID}`);
});

test("cache hit returns the same identity without re-reading the DB", async () => {
  const first = await resolveAdminIdentities([STAFF_ID]);
  assert.equal(first.get(STAFF_ID)?.displayName, STAFF_DISPLAY_INITIAL);

  // Mutate the row directly, bypassing invalidation. A cache hit must
  // still return the stale value because the cache is authoritative
  // within the TTL window.
  await db.execute(sql`UPDATE admin_staff SET display_name=${STAFF_DISPLAY_UPDATED} WHERE id=${STAFF_ID}`);

  const second = await resolveAdminIdentities([STAFF_ID]);
  assert.equal(
    second.get(STAFF_ID)?.displayName,
    STAFF_DISPLAY_INITIAL,
    "expected cached (stale) displayName within TTL",
  );
});

test("invalidateAdminIdentityCache(id) forces a fresh DB read", async () => {
  await resolveAdminIdentities([STAFF_ID]);
  await db.execute(sql`UPDATE admin_staff SET display_name=${STAFF_DISPLAY_UPDATED} WHERE id=${STAFF_ID}`);

  invalidateAdminIdentityCache(STAFF_ID);

  const after = await resolveAdminIdentities([STAFF_ID]);
  assert.equal(after.get(STAFF_ID)?.displayName, STAFF_DISPLAY_UPDATED);
});

test("invalidateAdminIdentityCache() with no args flushes everything", async () => {
  await resolveAdminIdentities([STAFF_ID, STAFF_EMAIL]);
  assert.ok(__adminIdentityCacheTestOnly.size() > 0);

  invalidateAdminIdentityCache();
  assert.equal(__adminIdentityCacheTestOnly.size(), 0);
});

test("TTL expiry forces a fresh DB read", async () => {
  __adminIdentityCacheTestOnly.setTtlMs(1);
  await resolveAdminIdentities([STAFF_ID]);
  await db.execute(sql`UPDATE admin_staff SET display_name=${STAFF_DISPLAY_UPDATED} WHERE id=${STAFF_ID}`);

  await new Promise((r) => setTimeout(r, 10));

  const after = await resolveAdminIdentities([STAFF_ID]);
  assert.equal(after.get(STAFF_ID)?.displayName, STAFF_DISPLAY_UPDATED);
});

test("negative lookups are cached so unknown ids do not hammer the DB", async () => {
  const unknown = `task690-unknown-${Date.now()}`;
  // Make sure there is no admin_staff row matching the unknown key.
  await db.execute(sql`DELETE FROM admin_staff WHERE id=${unknown} OR email=${unknown} OR username=${unknown}`);

  const first = await resolveAdminIdentities([unknown]);
  assert.equal(first.has(unknown), false);
  const sizeAfterFirst = __adminIdentityCacheTestOnly.size();
  assert.ok(
    sizeAfterFirst >= 1,
    "expected negative lookup to be cached",
  );

  // Second call within TTL must be a pure cache hit (no DB round-trip,
  // size unchanged).
  const second = await resolveAdminIdentities([unknown]);
  assert.equal(second.has(unknown), false);
  assert.equal(__adminIdentityCacheTestOnly.size(), sizeAfterFirst);
});
