/**
 * Task #317 — Integration coverage for the team-default fallback preset
 * endpoints shipped with task #310:
 *   GET    /api/admin/broadcasts/fallback-default-preset
 *   PUT    /api/admin/broadcasts/fallback-default-preset   (founder-only)
 *   DELETE /api/admin/broadcasts/fallback-default-preset   (founder-only)
 *
 * Locks in:
 *  - GET returns null when no preset is pinned, plus the viewerIsFounder
 *    flag for both founders and non-founder staff.
 *  - PUT upserts the singleton row and a second PUT overwrites the same
 *    row (no duplicates).
 *  - PUT/DELETE return 403 for non-founder staff even when they pass the
 *    requireRootAdmin middleware (the inner founder check is the gate).
 *  - DELETE clears back to null and a subsequent GET reflects that.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express from "express";
import { eq } from "drizzle-orm";

import { registerBroadcastRoutes } from "../server/routes/broadcasts";
import { db } from "../server/db";
import { adminBroadcastFallbackDefaultPreset } from "../shared/schema";

const SINGLETON_ID = "singleton";

// Session shape mirrors what getAdminVerification reads. We swap session
// state per request via a small mutable holder so a single express app
// can simulate either a founder (root_admin/super_admin) or a non-founder
// (staff/support_admin) without restarting the server.
type SessionState = {
  isAdmin: boolean;
  adminActorType: string;
  adminRole: string;
  adminPermissions: string[];
  adminActorId: string;
};

const FOUNDER_SESSION: SessionState = {
  isAdmin: true,
  adminActorType: "root_admin",
  adminRole: "super_admin",
  adminPermissions: ["*"],
  adminActorId: "test-root-founder",
};

const STAFF_SESSION: SessionState = {
  isAdmin: true,
  adminActorType: "staff",
  adminRole: "support_admin",
  adminPermissions: ["broadcasts:read"],
  adminActorId: "test-staff-1",
};

let currentSession: SessionState = FOUNDER_SESSION;

function sessionInjector(req: any, _res: any, next: any) {
  req.session = { ...currentSession };
  next();
}

async function listen(app: express.Express): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

describe("/api/admin/broadcasts/fallback-default-preset", () => {
  let appServer: Server;
  let appUrl: string;
  let prevRow: typeof adminBroadcastFallbackDefaultPreset.$inferSelect | null = null;

  before(async () => {
    // Preserve any existing pinned preset so this test is safe to run
    // against a shared dev database. Restore it in `after`.
    const [existing] = await db
      .select()
      .from(adminBroadcastFallbackDefaultPreset)
      .where(eq(adminBroadcastFallbackDefaultPreset.id, SINGLETON_ID));
    prevRow = existing ?? null;
    await db
      .delete(adminBroadcastFallbackDefaultPreset)
      .where(eq(adminBroadcastFallbackDefaultPreset.id, SINGLETON_ID));

    const app = express();
    app.use(express.json());
    app.use(sessionInjector);
    // Pass-through requireRootAdmin so the route's own `actor.isFounder`
    // check is what we're exercising. The production middleware applies
    // the same gating one layer up.
    registerBroadcastRoutes(app, (_req, _res, next) => next());
    ({ server: appServer, baseUrl: appUrl } = await listen(app));
  });

  after(async () => {
    await new Promise<void>((r) => appServer.close(() => r()));
    await db
      .delete(adminBroadcastFallbackDefaultPreset)
      .where(eq(adminBroadcastFallbackDefaultPreset.id, SINGLETON_ID));
    if (prevRow) {
      await db.insert(adminBroadcastFallbackDefaultPreset).values(prevRow);
    }
  });

  async function req(
    method: "GET" | "PUT" | "DELETE",
    body?: unknown,
  ): Promise<{ status: number; body: any }> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    const r = await fetch(
      `${appUrl}/api/admin/broadcasts/fallback-default-preset`,
      init,
    );
    let parsed: any = null;
    try {
      parsed = await r.json();
    } catch {
      parsed = null;
    }
    return { status: r.status, body: parsed };
  }

  it("GET returns null preset and viewerIsFounder=true for the founder", async () => {
    currentSession = FOUNDER_SESSION;
    const r = await req("GET");
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.preset, null);
    assert.equal(r.body.viewerIsFounder, true);
  });

  it("GET returns null preset and viewerIsFounder=false for non-founder staff", async () => {
    currentSession = STAFF_SESSION;
    const r = await req("GET");
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.preset, null);
    assert.equal(r.body.viewerIsFounder, false);
  });

  it("PUT from non-founder staff is rejected with 403", async () => {
    currentSession = STAFF_SESSION;
    const r = await req("PUT", { dryRun: "live", status: "ready", packageId: "pkg-x" });
    assert.equal(r.status, 403);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.error, "forbidden");

    // And nothing was written.
    const rows = await db
      .select()
      .from(adminBroadcastFallbackDefaultPreset)
      .where(eq(adminBroadcastFallbackDefaultPreset.id, SINGLETON_ID));
    assert.equal(rows.length, 0);
  });

  it("PUT from founder upserts the singleton and returns the serialized preset", async () => {
    currentSession = FOUNDER_SESSION;
    const r = await req("PUT", {
      dryRun: "live",
      status: "ready",
      packageId: "pkg-abc",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.preset.dryRun, "live");
    assert.equal(r.body.preset.status, "ready");
    assert.equal(r.body.preset.packageId, "pkg-abc");
    assert.equal(r.body.preset.updatedBy.actorType, "root_admin");
    assert.ok(typeof r.body.preset.updatedAt === "string");

    const rows = await db
      .select()
      .from(adminBroadcastFallbackDefaultPreset)
      .where(eq(adminBroadcastFallbackDefaultPreset.id, SINGLETON_ID));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].dryRun, "live");
    assert.equal(rows[0].status, "ready");
    assert.equal(rows[0].packageId, "pkg-abc");
  });

  it("a second PUT overwrites the singleton row (no duplicates)", async () => {
    currentSession = FOUNDER_SESSION;
    const r = await req("PUT", {
      dryRun: "dry",
      status: "all",
      packageId: "",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.preset.dryRun, "dry");
    assert.equal(r.body.preset.status, "all");
    assert.equal(r.body.preset.packageId, "");

    const rows = await db
      .select()
      .from(adminBroadcastFallbackDefaultPreset);
    // Only the singleton row should exist for this id.
    const singletonRows = rows.filter((row) => row.id === SINGLETON_ID);
    assert.equal(singletonRows.length, 1);
    assert.equal(singletonRows[0].dryRun, "dry");
  });

  it("PUT validates the body shape", async () => {
    currentSession = FOUNDER_SESSION;
    const r = await req("PUT", { dryRun: "sometimes" });
    assert.equal(r.status, 400);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.error, "invalid_body");
  });

  it("GET reflects the most recently pinned preset", async () => {
    currentSession = STAFF_SESSION;
    const r = await req("GET");
    assert.equal(r.status, 200);
    assert.ok(r.body.preset, "preset should be present after a successful PUT");
    assert.equal(r.body.preset.dryRun, "dry");
    assert.equal(r.body.viewerIsFounder, false);
  });

  it("DELETE from non-founder staff is rejected with 403", async () => {
    currentSession = STAFF_SESSION;
    const r = await req("DELETE");
    assert.equal(r.status, 403);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.error, "forbidden");

    // Row must still be there.
    const rows = await db
      .select()
      .from(adminBroadcastFallbackDefaultPreset)
      .where(eq(adminBroadcastFallbackDefaultPreset.id, SINGLETON_ID));
    assert.equal(rows.length, 1);
  });

  // T322 — Regression: the `/api/admin/broadcasts/:id` PATCH/DELETE handlers
  // are registered earlier in the file than the fallback-default-preset
  // routes. Without the RESERVED_BROADCAST_SUBROUTE_NAMES guard, both
  // `PATCH /api/admin/broadcasts/fallback-default-preset` (no real route)
  // and `DELETE /api/admin/broadcasts/fallback-default-preset` (registered
  // later) would be swallowed by the `:id` handler. This test asserts the
  // reserved sub-route name is forwarded so the real DELETE handler still
  // fires, and that PATCH on a reserved name does not get treated as a
  // broadcast meta update.
  it("reserved sub-route names are not swallowed by the broadcast :id handlers", async () => {
    currentSession = FOUNDER_SESSION;
    // Pin a preset so we have a row to delete via the real handler.
    const put = await req("PUT", { dryRun: "live", status: "ready", packageId: "pkg-guard" });
    assert.equal(put.status, 200);

    // PATCH on the reserved name must NOT be handled by the broadcast :id
    // PATCH route. There is no PATCH for fallback-default-preset, so
    // Express should return 404 (its default Cannot PATCH response). If the
    // `:id` handler had matched, we'd see 400 (invalid_body) or 404 JSON
    // `{ok:false,error:"not_found"}` from updateBroadcastMeta instead.
    const patchRes = await fetch(
      `${appUrl}/api/admin/broadcasts/fallback-default-preset`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "should-not-apply" }),
      },
    );
    assert.equal(patchRes.status, 404);
    const patchText = await patchRes.text();
    // Express's default 404 is plain text "Cannot PATCH ...", not a JSON
    // response from the broadcast handler.
    assert.ok(
      !patchText.includes('"error":"invalid_body"') &&
        !patchText.includes('"error":"not_found"'),
      `PATCH on reserved name should not reach the :id handler, got: ${patchText}`,
    );

    // DELETE on the reserved name must reach the real fallback-preset
    // handler, which returns `{ok:true, preset:null}` after clearing the
    // pinned row. The `:id` DELETE handler would instead return
    // `{ok:true, deleted:{...}}` or 404 `not_found`.
    const del = await req("DELETE");
    assert.equal(del.status, 200);
    assert.equal(del.body.ok, true);
    assert.equal(del.body.preset, null);
    assert.equal(
      del.body.deleted,
      undefined,
      "DELETE response shape must be the fallback-preset one, not the broadcast :id one",
    );

    // And the row really is gone.
    const rows = await db
      .select()
      .from(adminBroadcastFallbackDefaultPreset)
      .where(eq(adminBroadcastFallbackDefaultPreset.id, SINGLETON_ID));
    assert.equal(rows.length, 0);
  });

  it("DELETE from founder clears the row and GET reports null again", async () => {
    currentSession = FOUNDER_SESSION;
    const del = await req("DELETE");
    assert.equal(del.status, 200);
    assert.equal(del.body.ok, true);
    assert.equal(del.body.preset, null);

    const rows = await db
      .select()
      .from(adminBroadcastFallbackDefaultPreset)
      .where(eq(adminBroadcastFallbackDefaultPreset.id, SINGLETON_ID));
    assert.equal(rows.length, 0);

    const get = await req("GET");
    assert.equal(get.status, 200);
    assert.equal(get.body.preset, null);
  });
});
