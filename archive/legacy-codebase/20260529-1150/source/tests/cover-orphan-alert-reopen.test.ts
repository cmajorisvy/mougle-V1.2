/**
 * Task #214 — Lock in the cover-sweep re-open path.
 *
 * The "Recent auto-clears" admin list lets a founder re-open an alert that
 * the scheduled sweep already auto-acknowledged. The safe-by-construction
 * guards on `coverOrphanAlertService.reopenAutoResolved` are the only thing
 * stopping that endpoint from flipping the wrong rows back to open (e.g.
 * unrelated alert types or rows a human already acknowledged). These tests
 * pin the unit-level guards AND exercise the HTTP route end-to-end so a
 * regression on either layer fails CI.
 *
 * All rows the test inserts are tagged with a unique marker on
 * `details.source` so the after-hook can clean up only its own rows even
 * against a shared dev DB.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import express, { type RequestHandler } from "express";
import { eq } from "drizzle-orm";

import { db } from "../server/db";
import { platformAlerts } from "../shared/schema";
import { coverOrphanAlertService } from "../server/services/cover-orphan-alert-service";
import { registerBroadcastRoutes } from "../server/routes/broadcasts";

const ALERT_TYPE = "broadcast_cover_orphans";
const TEST_MARKER = `t214-${randomUUID()}`;

async function listen(app: express.Express): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

async function getAlert(id: string) {
  const rows = await db
    .select()
    .from(platformAlerts)
    .where(eq(platformAlerts.id, id))
    .limit(1);
  return rows[0];
}

type SeedOpts = {
  type?: string;
  acknowledged?: boolean;
  acknowledgedBy?: string | null;
  details?: Record<string, unknown>;
};

async function seedAlert(opts: SeedOpts = {}): Promise<string> {
  const acknowledged = opts.acknowledged ?? true;
  const acknowledgedBy =
    opts.acknowledgedBy === undefined
      ? acknowledged
        ? "system"
        : null
      : opts.acknowledgedBy;
  const details = {
    source: TEST_MARKER,
    seeded: true,
    ...(opts.details ?? {}),
  };
  const [row] = await db
    .insert(platformAlerts)
    .values({
      type: opts.type ?? ALERT_TYPE,
      severity: "warning",
      message: `[${TEST_MARKER}] seeded`,
      details,
      acknowledged,
      acknowledgedBy,
      acknowledgedAt: acknowledged ? new Date() : null,
      autoTriggered: true,
    })
    .returning();
  return row.id;
}

function autoResolvedDetails(extra: Record<string, unknown> = {}) {
  return {
    autoResolved: true,
    autoResolvedAt: new Date().toISOString(),
    autoResolvedOrphanCount: 0,
    autoResolvedThreshold: 25,
    autoResolvedNote: "test seed",
    ...extra,
  };
}

async function cleanupTestRows() {
  try {
    const ours = await db
      .select({ id: platformAlerts.id, details: platformAlerts.details })
      .from(platformAlerts);
    for (const row of ours) {
      const d = (row.details as Record<string, any> | null) ?? {};
      if (d?.source === TEST_MARKER) {
        await db.delete(platformAlerts).where(eq(platformAlerts.id, row.id));
      }
    }
  } catch {
    /* best effort */
  }
}

describe("coverOrphanAlertService.reopenAutoResolved unit guards", () => {
  after(async () => {
    await cleanupTestRows();
  });

  it("re-opens an auto-cleared alert and preserves the original details", async () => {
    const original = autoResolvedDetails({ keepMe: "yes" });
    const id = await seedAlert({ details: original });

    const result = await coverOrphanAlertService.reopenAutoResolved(id, "tester-1");
    assert.ok(result, "reopen should succeed for an auto-cleared alert");
    assert.equal(result!.id, id);
    assert.ok(typeof result!.reopenedAt === "number" && result!.reopenedAt > 0);

    const row = await getAlert(id);
    assert.ok(row);
    assert.equal(row.acknowledged, false, "acknowledged should flip to false");
    assert.equal(row.acknowledgedBy, null);
    assert.equal(row.acknowledgedAt, null);

    const details = (row.details as Record<string, any>) ?? {};
    // Audit trail must be preserved AND augmented.
    assert.equal(details.autoResolved, true, "original autoResolved flag preserved");
    assert.equal(
      details.autoResolvedOrphanCount,
      0,
      "original orphan count preserved",
    );
    assert.equal(details.keepMe, "yes", "unrelated detail keys preserved");
    assert.equal(details.source, TEST_MARKER, "seed marker preserved");
    assert.equal(details.reopened, true, "reopened flag added");
    assert.equal(details.reopenedBy, "tester-1");
    assert.ok(
      typeof details.reopenedAt === "string" && details.reopenedAt.length > 0,
      "reopenedAt timestamp added",
    );
  });

  it("returns null for an unknown alert id", async () => {
    const result = await coverOrphanAlertService.reopenAutoResolved(
      "00000000-0000-0000-0000-000000000000",
      "tester-2",
    );
    assert.equal(result, null);
  });

  it("returns null when the alert is the wrong type", async () => {
    const id = await seedAlert({
      type: "shorts_backlog",
      details: autoResolvedDetails(),
    });
    const result = await coverOrphanAlertService.reopenAutoResolved(id, "tester-3");
    assert.equal(result, null, "non cover-orphan alerts must not be re-opened");

    const row = await getAlert(id);
    assert.equal(row.acknowledged, true, "wrong-type row must remain acknowledged");
  });

  it("returns null when the alert was acknowledged by a human (not auto-resolved)", async () => {
    const id = await seedAlert({
      acknowledgedBy: "human-admin",
      details: { source: TEST_MARKER, autoResolved: false },
    });
    const result = await coverOrphanAlertService.reopenAutoResolved(id, "tester-4");
    assert.equal(result, null, "human acks must not be flipped via this path");

    const row = await getAlert(id);
    assert.equal(row.acknowledged, true);
    assert.equal(row.acknowledgedBy, "human-admin");
  });

  it("is idempotent when the alert is already open (no auto-resolve, no human ack)", async () => {
    const id = await seedAlert({
      acknowledged: false,
      details: autoResolvedDetails(),
    });

    const before = await getAlert(id);
    const beforeDetails = (before.details as Record<string, any>) ?? {};

    const result = await coverOrphanAlertService.reopenAutoResolved(id, "tester-5");
    assert.ok(result, "already-open row should return a success result");
    assert.equal(result!.id, id);

    const after = await getAlert(id);
    assert.equal(after.acknowledged, false, "still open");
    const afterDetails = (after.details as Record<string, any>) ?? {};
    // Idempotent path must NOT mutate the row.
    assert.equal(
      afterDetails.reopened,
      undefined,
      "idempotent path must not append reopened metadata",
    );
    assert.deepEqual(afterDetails, beforeDetails, "details untouched");
  });
});

describe("POST /api/admin/broadcasts/covers/sweep/recent-auto-clears/:id/reopen route", () => {
  let appServer: Server;
  let appUrl: string;
  let mode: "admin" | "unauth" = "admin";

  // A minimal stand-in for the real requireRootAdmin: rejects unauthenticated
  // requests with 401 so the route's auth gating is actually exercised. The
  // `mode` flag lets a single server instance flip between authed/unauthed
  // for the different test cases.
  const authMiddleware: RequestHandler = (req: any, res, next) => {
    if (mode === "admin") {
      req.session = {
        isAdmin: true,
        adminActorType: "root_admin",
        adminRole: "super_admin",
        adminPermissions: ["*"],
        adminActorId: "test-root",
      };
      next();
      return;
    }
    res.status(401).json({ ok: false, error: "unauthorized" });
  };

  const requireRootAdminStub: RequestHandler = (req: any, res, next) => {
    if (req.session?.adminActorType === "root_admin") {
      next();
      return;
    }
    res.status(401).json({ ok: false, error: "unauthorized" });
  };

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use(authMiddleware);
    registerBroadcastRoutes(app, requireRootAdminStub);
    ({ server: appServer, baseUrl: appUrl } = await listen(app));
  });

  after(async () => {
    await new Promise<void>((r) => appServer.close(() => r()));
    await cleanupTestRows();
  });

  it("rejects unauthenticated callers (auth gating)", async () => {
    mode = "unauth";
    try {
      const r = await fetch(
        `${appUrl}/api/admin/broadcasts/covers/sweep/recent-auto-clears/abc/reopen`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      assert.equal(r.status, 401, "unauthenticated POST must be rejected");
      const body = (await r.json()) as { ok: boolean; error: string };
      assert.equal(body.ok, false);
      assert.equal(body.error, "unauthorized");
    } finally {
      mode = "admin";
    }
  });

  it("rejects non-POST verbs (CSRF/method gating)", async () => {
    mode = "admin";
    // The route is registered only for POST; GET must not flip rows.
    const r = await fetch(
      `${appUrl}/api/admin/broadcasts/covers/sweep/recent-auto-clears/abc/reopen`,
      { method: "GET" },
    );
    // Express returns 404 for unmatched method+path combinations.
    assert.ok(
      r.status === 404 || r.status === 405,
      `expected 404/405 for GET, got ${r.status}`,
    );
  });

  it("returns 404 for unknown alert id", async () => {
    mode = "admin";
    const r = await fetch(
      `${appUrl}/api/admin/broadcasts/covers/sweep/recent-auto-clears/00000000-0000-0000-0000-000000000000/reopen`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    );
    assert.equal(r.status, 404);
    const body = (await r.json()) as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.equal(body.error, "not_found_or_not_auto_resolved");
  });

  it("returns 404 for a non cover-orphan alert id", async () => {
    mode = "admin";
    const id = await seedAlert({
      type: "shorts_backlog",
      details: autoResolvedDetails(),
    });
    const r = await fetch(
      `${appUrl}/api/admin/broadcasts/covers/sweep/recent-auto-clears/${id}/reopen`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    );
    assert.equal(r.status, 404);
    const row = await getAlert(id);
    assert.equal(row.acknowledged, true, "wrong-type row must stay acknowledged");
  });

  it("returns 400 for an oversize id", async () => {
    mode = "admin";
    const id = "x".repeat(121);
    const r = await fetch(
      `${appUrl}/api/admin/broadcasts/covers/sweep/recent-auto-clears/${id}/reopen`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    );
    assert.equal(r.status, 400);
    const body = (await r.json()) as { ok: boolean; error: string };
    assert.equal(body.error, "invalid_id");
  });

  it("flips acknowledged=false on the happy path and records the actor", async () => {
    mode = "admin";
    const id = await seedAlert({ details: autoResolvedDetails() });
    const r = await fetch(
      `${appUrl}/api/admin/broadcasts/covers/sweep/recent-auto-clears/${id}/reopen`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    );
    assert.equal(r.status, 200);
    const body = (await r.json()) as {
      ok: boolean;
      reopened: { id: string; reopenedAt: number };
    };
    assert.equal(body.ok, true);
    assert.equal(body.reopened.id, id);

    const row = await getAlert(id);
    assert.equal(row.acknowledged, false, "acknowledged must flip to false");
    assert.equal(row.acknowledgedBy, null);
    assert.equal(row.acknowledgedAt, null);
    const details = (row.details as Record<string, any>) ?? {};
    assert.equal(details.reopened, true);
    assert.equal(details.reopenedBy, "test-root", "actor recorded from session");
    assert.equal(details.autoResolved, true, "auto-resolve metadata preserved");
  });
});
