/**
 * Task #820 — Route-layer tests for the cover- and media-sweep flapping
 * tuning PATCH routes added in Task #811 (cover-sweep counterparts in
 * Task #804/#809).
 *
 * These tests pin down:
 *  - Happy path returns `{ ok: true, value, status }` and the persisted
 *    `system_settings` row matches.
 *  - Out-of-bounds values are rejected with HTTP 400 (the service throws
 *    a descriptive error which the route surfaces).
 *  - Non-admin requests are rejected before the route handler runs.
 *
 * Routes covered:
 *  - PATCH /api/admin/broadcasts/covers/sweep/flapping-threshold
 *  - PATCH /api/admin/broadcasts/covers/sweep/flapping-window-ms
 *  - PATCH /api/admin/broadcasts/media/sweep/flapping-threshold
 *  - PATCH /api/admin/broadcasts/media/sweep/flapping-window-ms
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express, { type RequestHandler } from "express";
import { eq, inArray } from "drizzle-orm";

import { db } from "../server/db";
import { systemSettings } from "../shared/schema";
import { registerBroadcastRoutes } from "../server/routes/broadcasts";
import {
  COVER_SWEEP_FLAPPING_LIMITS,
} from "../server/services/cover-orphan-alert-service";
import {
  MEDIA_SWEEP_FLAPPING_LIMITS,
} from "../server/services/media-orphan-alert-service";

const TOUCHED_KEYS = [
  "cover_orphan_sweep_flapping_threshold",
  "cover_orphan_sweep_flapping_window_ms",
  "media_orphan_sweep_flapping_threshold",
  "media_orphan_sweep_flapping_window_ms",
];

function fakeRootAdmin(req: any, _res: any, next: any) {
  req.session = {
    isAdmin: true,
    adminActorType: "root_admin",
    adminRole: "super_admin",
    adminPermissions: ["*"],
    adminActorId: "test-root-820",
  };
  next();
}

const noopRequireRootAdmin: RequestHandler = (_req, _res, next) => next();
const denyRequireRootAdmin: RequestHandler = (_req, res) => {
  res.status(401).json({ ok: false, error: "unauthorized" });
};

async function listen(
  app: express.Express,
): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

async function readSetting(key: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);
  return rows.length > 0 ? rows[0].value : null;
}

describe("Task #820 — cover & media sweep flapping PATCH routes", () => {
  let adminServer: Server;
  let adminUrl: string;
  let denyServer: Server;
  let denyUrl: string;
  // Snapshot any pre-existing values so we restore them on teardown.
  const snapshot = new Map<string, { value: string; updatedBy: string | null }>();

  before(async () => {
    const rows = await db
      .select()
      .from(systemSettings)
      .where(inArray(systemSettings.key, TOUCHED_KEYS));
    for (const r of rows) {
      snapshot.set(r.key, { value: r.value, updatedBy: r.updatedBy ?? null });
    }

    // Admin-allowed app — fake session middleware + no-op gate.
    const adminApp = express();
    adminApp.use(express.json());
    adminApp.use(fakeRootAdmin);
    registerBroadcastRoutes(adminApp, noopRequireRootAdmin);
    ({ server: adminServer, baseUrl: adminUrl } = await listen(adminApp));

    // Non-admin app — gate middleware always 401s.
    const denyApp = express();
    denyApp.use(express.json());
    registerBroadcastRoutes(denyApp, denyRequireRootAdmin);
    ({ server: denyServer, baseUrl: denyUrl } = await listen(denyApp));
  });

  after(async () => {
    await new Promise<void>((r) => adminServer.close(() => r()));
    await new Promise<void>((r) => denyServer.close(() => r()));
    // Restore snapshot: rows that existed get reverted; rows that didn't
    // exist get deleted so the shared dev DB doesn't accumulate noise.
    for (const key of TOUCHED_KEYS) {
      const prev = snapshot.get(key);
      if (prev) {
        await db
          .update(systemSettings)
          .set({
            value: prev.value,
            updatedBy: prev.updatedBy,
            updatedAt: new Date(),
          })
          .where(eq(systemSettings.key, key));
      } else {
        await db.delete(systemSettings).where(eq(systemSettings.key, key));
      }
    }
  });

  async function patch(
    baseUrl: string,
    path: string,
    body: unknown,
  ): Promise<{ status: number; body: any }> {
    const r = await fetch(`${baseUrl}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let parsed: any = null;
    try {
      parsed = await r.json();
    } catch {
      parsed = null;
    }
    return { status: r.status, body: parsed };
  }

  type LimitsLike = {
    thresholdMin: number;
    thresholdMax: number;
    windowMsMin: number;
    windowMsMax: number;
  };

  function defineSuite(
    label: string,
    pathPrefix: string,
    settingKeys: { threshold: string; windowMs: string },
    limits: LimitsLike,
  ) {
    describe(label, () => {
      // ------- flapping-threshold -------
      it("PATCH flapping-threshold (happy path) persists + echoes value", async () => {
        // Pick a value safely inside the bounded range but distinct from
        // any default so we know the row was written by this test.
        const target = Math.min(limits.thresholdMax - 1, limits.thresholdMin + 5);
        const r = await patch(
          adminUrl,
          `${pathPrefix}/flapping-threshold`,
          { value: target },
        );
        assert.equal(r.status, 200);
        assert.equal(r.body?.ok, true);
        assert.equal(r.body?.value, target);
        assert.ok(r.body?.status, "response should include status snapshot");
        assert.equal(r.body.status.flappingThreshold, target);

        const persisted = await readSetting(settingKeys.threshold);
        assert.equal(persisted, String(target));
      });

      it("PATCH flapping-threshold rejects below-min with 400", async () => {
        const r = await patch(
          adminUrl,
          `${pathPrefix}/flapping-threshold`,
          { value: limits.thresholdMin - 1 },
        );
        assert.equal(r.status, 400);
        assert.equal(r.body?.ok, false);
      });

      it("PATCH flapping-threshold rejects above-max with 400", async () => {
        const r = await patch(
          adminUrl,
          `${pathPrefix}/flapping-threshold`,
          { value: limits.thresholdMax + 1 },
        );
        assert.equal(r.status, 400);
        assert.equal(r.body?.ok, false);
      });

      it("PATCH flapping-threshold rejects non-numeric with 400", async () => {
        const r = await patch(
          adminUrl,
          `${pathPrefix}/flapping-threshold`,
          { value: "not-a-number" },
        );
        assert.equal(r.status, 400);
        assert.equal(r.body?.ok, false);
      });

      it("PATCH flapping-threshold is rejected for non-admin", async () => {
        const r = await patch(
          denyUrl,
          `${pathPrefix}/flapping-threshold`,
          { value: limits.thresholdMin + 2 },
        );
        assert.equal(r.status, 401);
      });

      // ------- flapping-window-ms -------
      it("PATCH flapping-window-ms (happy path) persists + echoes value", async () => {
        // 10 minutes — comfortably inside the 1m..90d range.
        const target = 10 * 60_000;
        const r = await patch(
          adminUrl,
          `${pathPrefix}/flapping-window-ms`,
          { value: target },
        );
        assert.equal(r.status, 200);
        assert.equal(r.body?.ok, true);
        assert.equal(r.body?.value, target);
        assert.equal(r.body.status.flappingWindowMs, target);

        const persisted = await readSetting(settingKeys.windowMs);
        assert.equal(persisted, String(target));
      });

      it("PATCH flapping-window-ms rejects below-min with 400", async () => {
        const r = await patch(
          adminUrl,
          `${pathPrefix}/flapping-window-ms`,
          { value: limits.windowMsMin - 1 },
        );
        assert.equal(r.status, 400);
        assert.equal(r.body?.ok, false);
      });

      it("PATCH flapping-window-ms rejects above-max with 400", async () => {
        const r = await patch(
          adminUrl,
          `${pathPrefix}/flapping-window-ms`,
          { value: limits.windowMsMax + 1 },
        );
        assert.equal(r.status, 400);
        assert.equal(r.body?.ok, false);
      });

      it("PATCH flapping-window-ms rejects non-numeric with 400", async () => {
        const r = await patch(
          adminUrl,
          `${pathPrefix}/flapping-window-ms`,
          { value: "nope" },
        );
        assert.equal(r.status, 400);
        assert.equal(r.body?.ok, false);
      });

      it("PATCH flapping-window-ms is rejected for non-admin", async () => {
        const r = await patch(
          denyUrl,
          `${pathPrefix}/flapping-window-ms`,
          { value: 5 * 60_000 },
        );
        assert.equal(r.status, 401);
      });
    });
  }

  defineSuite(
    "cover-sweep flapping routes",
    "/api/admin/broadcasts/covers/sweep",
    {
      threshold: "cover_orphan_sweep_flapping_threshold",
      windowMs: "cover_orphan_sweep_flapping_window_ms",
    },
    COVER_SWEEP_FLAPPING_LIMITS,
  );

  defineSuite(
    "media-sweep flapping routes",
    "/api/admin/broadcasts/media/sweep",
    {
      threshold: "media_orphan_sweep_flapping_threshold",
      windowMs: "media_orphan_sweep_flapping_window_ms",
    },
    MEDIA_SWEEP_FLAPPING_LIMITS,
  );
});
