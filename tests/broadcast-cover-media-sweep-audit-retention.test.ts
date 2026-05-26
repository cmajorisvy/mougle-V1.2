/**
 * Task #336 — Mirror Task #333's audit-retention coverage for the two
 * sibling surfaces:
 *   - Cover File Sweep   (`coverOrphanAlertService`)
 *   - Render File Sweep  (`mediaOrphanAlertService`)
 *
 * Both halves live in the same file so node:test runs them sequentially:
 * the unit + route suites share the `system_settings` rows that back the
 * retention values, and splitting them across files lets parallel test
 * workers race each other's `beforeEach` cleanup.
 *
 * Locks in:
 *   - resolution order: cached DB value → env var → platform default
 *   - guardrails on `setAuditMaxBytes` / `setAuditMaxArchives`
 *   - founder-only gate on the PATCH routes (401 anon, 403 staff)
 *   - PATCH validation: shape, range, no-fields
 *   - PATCH-then-status round trip: saved value surfaces with source "db"
 */

import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express from "express";
import { eq, inArray } from "drizzle-orm";

import { registerBroadcastRoutes } from "../server/routes/broadcasts";
import { requireRootAdmin } from "../server/middleware/admin-auth";
import { db } from "../server/db";
import { systemSettings } from "../shared/schema";
import {
  COVER_SWEEP_AUDIT_LIMITS,
  coverOrphanAlertService,
} from "../server/services/cover-orphan-alert-service";
import {
  MEDIA_SWEEP_AUDIT_LIMITS,
  mediaOrphanAlertService,
} from "../server/services/media-orphan-alert-service";

type Limits = {
  bytesMin: number;
  bytesMax: number;
  archivesMin: number;
  archivesMax: number;
  bytesDefault: number;
  archivesDefault: number;
};

type Surface = {
  label: string;
  service: any;
  limits: Limits;
  bytesKey: string;
  archivesKey: string;
  envBytes: string;
  envArchives: string;
  patchPath: string;
  statusPath: string;
};

const SURFACES: Surface[] = [
  {
    label: "coverOrphanAlertService",
    service: coverOrphanAlertService,
    limits: COVER_SWEEP_AUDIT_LIMITS,
    bytesKey: "cover_sweep_audit_max_bytes",
    archivesKey: "cover_sweep_audit_max_archives",
    envBytes: "COVER_SWEEP_AUDIT_MAX_BYTES",
    envArchives: "COVER_SWEEP_AUDIT_MAX_ARCHIVES",
    patchPath: "/api/admin/broadcasts/covers/sweep/audit-retention",
    statusPath: "/api/admin/broadcasts/covers/sweep/status",
  },
  {
    label: "mediaOrphanAlertService",
    service: mediaOrphanAlertService,
    limits: MEDIA_SWEEP_AUDIT_LIMITS,
    bytesKey: "media_sweep_audit_max_bytes",
    archivesKey: "media_sweep_audit_max_archives",
    envBytes: "MEDIA_SWEEP_AUDIT_MAX_BYTES",
    envArchives: "MEDIA_SWEEP_AUDIT_MAX_ARCHIVES",
    patchPath: "/api/admin/broadcasts/media/sweep/audit-retention",
    statusPath: "/api/admin/broadcasts/media/sweep/status",
  },
];

function resetServiceCache(svc: any) {
  svc.cachedAuditMaxBytes = null;
  svc.cachedAuditMaxArchives = null;
  svc.auditCacheLoadPromise = null;
}

// ---------------------------------------------------------------------------
// Unit suites
// ---------------------------------------------------------------------------

for (const surface of SURFACES) {
  describe(`${surface.label} audit-retention resolution`, () => {
    let prevEnvBytes: string | undefined;
    let prevEnvArchives: string | undefined;
    let prevRows: Array<typeof systemSettings.$inferSelect> = [];

    async function clearDbRows() {
      await db
        .delete(systemSettings)
        .where(
          inArray(systemSettings.key, [surface.bytesKey, surface.archivesKey]),
        );
    }

    before(async () => {
      prevEnvBytes = process.env[surface.envBytes];
      prevEnvArchives = process.env[surface.envArchives];
      prevRows = await db
        .select()
        .from(systemSettings)
        .where(
          inArray(systemSettings.key, [surface.bytesKey, surface.archivesKey]),
        );
    });

    beforeEach(async () => {
      delete process.env[surface.envBytes];
      delete process.env[surface.envArchives];
      await clearDbRows();
      resetServiceCache(surface.service);
      // Force a fresh cache load against the now-empty DB so the sync
      // getters reflect the test's starting state.
      await surface.service.ensureAuditCacheLoaded();
    });

    afterEach(async () => {
      delete process.env[surface.envBytes];
      delete process.env[surface.envArchives];
      await clearDbRows();
      resetServiceCache(surface.service);
    });

    after(async () => {
      if (prevEnvBytes === undefined) delete process.env[surface.envBytes];
      else process.env[surface.envBytes] = prevEnvBytes;
      if (prevEnvArchives === undefined)
        delete process.env[surface.envArchives];
      else process.env[surface.envArchives] = prevEnvArchives;
      await clearDbRows();
      if (prevRows.length > 0) {
        await db.insert(systemSettings).values(prevRows);
      }
      resetServiceCache(surface.service);
    });

    it("falls back to platform defaults when neither DB nor env is set", () => {
      assert.equal(
        surface.service.getAuditMaxBytesSync(),
        surface.limits.bytesDefault,
      );
      assert.equal(
        surface.service.getAuditMaxArchivesSync(),
        surface.limits.archivesDefault,
      );
      assert.equal(surface.service.getAuditMaxBytesSource(), "default");
      assert.equal(surface.service.getAuditMaxArchivesSource(), "default");
    });

    it("env var wins over default when DB has no row", () => {
      process.env[surface.envBytes] = "262144"; // 256 KiB
      process.env[surface.envArchives] = "7";
      assert.equal(surface.service.getAuditMaxBytesSync(), 262144);
      assert.equal(surface.service.getAuditMaxArchivesSync(), 7);
      assert.equal(surface.service.getAuditMaxBytesSource(), "env");
      assert.equal(surface.service.getAuditMaxArchivesSource(), "env");
    });

    it("DB value wins over env and default", async () => {
      process.env[surface.envBytes] = "262144";
      process.env[surface.envArchives] = "7";
      await surface.service.setAuditMaxBytes(524288, "tester");
      await surface.service.setAuditMaxArchives(9, "tester");

      // Force a fresh load to confirm the cache reloads from the DB
      // rather than carrying the just-set value in memory only.
      resetServiceCache(surface.service);
      await surface.service.ensureAuditCacheLoaded();

      assert.equal(surface.service.getAuditMaxBytesSync(), 524288);
      assert.equal(surface.service.getAuditMaxArchivesSync(), 9);
      assert.equal(surface.service.getAuditMaxBytesSource(), "db");
      assert.equal(surface.service.getAuditMaxArchivesSource(), "db");
    });

    it("rejects out-of-range maxBytes (below min, above max, NaN)", async () => {
      await assert.rejects(
        () => surface.service.setAuditMaxBytes(surface.limits.bytesMin - 1),
        /out_of_range/,
      );
      await assert.rejects(
        () => surface.service.setAuditMaxBytes(surface.limits.bytesMax + 1),
        /out_of_range/,
      );
      await assert.rejects(
        () => surface.service.setAuditMaxBytes(Number.NaN),
        /invalid_value/,
      );

      const rows = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, surface.bytesKey));
      assert.equal(rows.length, 0);
    });

    it("rejects out-of-range maxArchives (below min, above max, NaN)", async () => {
      await assert.rejects(
        () =>
          surface.service.setAuditMaxArchives(surface.limits.archivesMin - 1),
        /out_of_range/,
      );
      await assert.rejects(
        () =>
          surface.service.setAuditMaxArchives(surface.limits.archivesMax + 1),
        /out_of_range/,
      );
      await assert.rejects(
        () => surface.service.setAuditMaxArchives(Number.NaN),
        /invalid_value/,
      );

      const rows = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, surface.archivesKey));
      assert.equal(rows.length, 0);
    });

    it("ignores DB rows whose stored value is outside guardrails", async () => {
      // Insert a junk row directly (bypassing the setter) to simulate a
      // stale/corrupt value. The cache loader should refuse it and the
      // sync getter should fall back to env/default.
      await db.insert(systemSettings).values({
        key: surface.bytesKey,
        value: String(surface.limits.bytesMax + 1000),
        updatedBy: "test-corrupt",
      });
      await db.insert(systemSettings).values({
        key: surface.archivesKey,
        value: "0",
        updatedBy: "test-corrupt",
      });
      resetServiceCache(surface.service);
      await surface.service.ensureAuditCacheLoaded();

      assert.equal(
        surface.service.getAuditMaxBytesSync(),
        surface.limits.bytesDefault,
      );
      assert.equal(
        surface.service.getAuditMaxArchivesSync(),
        surface.limits.archivesDefault,
      );
      assert.equal(surface.service.getAuditMaxBytesSource(), "default");
      assert.equal(surface.service.getAuditMaxArchivesSource(), "default");
    });

    it("getStatus() surfaces the resolved values + sources + limits", async () => {
      await surface.service.setAuditMaxBytes(
        surface.limits.bytesDefault * 2,
        "tester",
      );
      const status = await surface.service.getStatus();
      assert.equal(status.auditMaxBytes, surface.limits.bytesDefault * 2);
      assert.equal(status.auditMaxArchives, surface.limits.archivesDefault);
      assert.equal(status.auditMaxBytesSource, "db");
      assert.equal(status.auditMaxArchivesSource, "default");
      assert.equal(status.auditLimits.bytesMin, surface.limits.bytesMin);
      assert.equal(status.auditLimits.bytesMax, surface.limits.bytesMax);
      assert.equal(status.auditLimits.archivesMin, surface.limits.archivesMin);
      assert.equal(status.auditLimits.archivesMax, surface.limits.archivesMax);
    });
  });
}

// ---------------------------------------------------------------------------
// Route suites
// ---------------------------------------------------------------------------

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

let currentSession: SessionState | null = FOUNDER_SESSION;

function sessionInjector(req: any, _res: any, next: any) {
  req.session = currentSession ? { ...currentSession } : {};
  next();
}

async function listen(
  app: express.Express,
): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

for (const surface of SURFACES) {
  describe(`PATCH ${surface.patchPath}`, () => {
    let appServer: Server;
    let appUrl: string;
    let prevEnvBytes: string | undefined;
    let prevEnvArchives: string | undefined;
    let prevRows: Array<typeof systemSettings.$inferSelect> = [];

    async function clearDbRows() {
      await db
        .delete(systemSettings)
        .where(
          inArray(systemSettings.key, [surface.bytesKey, surface.archivesKey]),
        );
    }

    before(async () => {
      prevEnvBytes = process.env[surface.envBytes];
      prevEnvArchives = process.env[surface.envArchives];
      delete process.env[surface.envBytes];
      delete process.env[surface.envArchives];
      prevRows = await db
        .select()
        .from(systemSettings)
        .where(
          inArray(systemSettings.key, [surface.bytesKey, surface.archivesKey]),
        );
      await clearDbRows();
      resetServiceCache(surface.service);

      const app = express();
      app.use(express.json());
      app.use(sessionInjector);
      // Pass the production `requireRootAdmin` middleware so the
      // founder-only gate is what the staff/anon cases exercise.
      registerBroadcastRoutes(app, requireRootAdmin);
      ({ server: appServer, baseUrl: appUrl } = await listen(app));
    });

    after(async () => {
      await new Promise<void>((r) => appServer.close(() => r()));
      await clearDbRows();
      if (prevRows.length > 0) {
        await db.insert(systemSettings).values(prevRows);
      }
      if (prevEnvBytes === undefined) delete process.env[surface.envBytes];
      else process.env[surface.envBytes] = prevEnvBytes;
      if (prevEnvArchives === undefined)
        delete process.env[surface.envArchives];
      else process.env[surface.envArchives] = prevEnvArchives;
      resetServiceCache(surface.service);
    });

    beforeEach(async () => {
      await clearDbRows();
      resetServiceCache(surface.service);
      currentSession = FOUNDER_SESSION;
    });

    afterEach(async () => {
      await clearDbRows();
      resetServiceCache(surface.service);
    });

    async function req(
      method: "GET" | "PATCH",
      path: string,
      body?: unknown,
    ): Promise<{ status: number; body: any }> {
      const init: RequestInit = { method };
      if (body !== undefined) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
      }
      const r = await fetch(`${appUrl}${path}`, init);
      let parsed: any = null;
      try {
        parsed = await r.json();
      } catch {
        parsed = null;
      }
      return { status: r.status, body: parsed };
    }

    it("PATCH without an admin session returns 401 and writes nothing", async () => {
      currentSession = null;
      const r = await req("PATCH", surface.patchPath, { maxBytes: 524288 });
      assert.equal(r.status, 401);

      const rows = await db
        .select()
        .from(systemSettings)
        .where(
          inArray(systemSettings.key, [surface.bytesKey, surface.archivesKey]),
        );
      assert.equal(rows.length, 0);
    });

    it("PATCH from non-founder staff is rejected with 403 and writes nothing", async () => {
      currentSession = STAFF_SESSION;
      const r = await req("PATCH", surface.patchPath, { maxBytes: 524288 });
      assert.equal(r.status, 403);

      const rows = await db
        .select()
        .from(systemSettings)
        .where(
          inArray(systemSettings.key, [surface.bytesKey, surface.archivesKey]),
        );
      assert.equal(rows.length, 0);
    });

    it("PATCH with no fields returns 400 no_fields", async () => {
      const r = await req("PATCH", surface.patchPath, {});
      assert.equal(r.status, 400);
      assert.equal(r.body.ok, false);
      assert.equal(r.body.error, "no_fields");
    });

    it("PATCH with non-numeric maxBytes returns 400 invalid_max_bytes", async () => {
      const r = await req("PATCH", surface.patchPath, {
        maxBytes: "not-a-number",
      });
      assert.equal(r.status, 400);
      assert.equal(r.body.ok, false);
      assert.equal(r.body.error, "invalid_max_bytes");
    });

    it("PATCH with non-numeric maxArchives returns 400 invalid_max_archives", async () => {
      const r = await req("PATCH", surface.patchPath, { maxArchives: "nope" });
      assert.equal(r.status, 400);
      assert.equal(r.body.ok, false);
      assert.equal(r.body.error, "invalid_max_archives");
    });

    it("PATCH with out-of-range maxBytes is rejected with 400 out_of_range", async () => {
      const r = await req("PATCH", surface.patchPath, {
        maxBytes: surface.limits.bytesMin - 1,
      });
      assert.equal(r.status, 400);
      assert.equal(r.body.ok, false);
      assert.equal(r.body.error, "out_of_range");

      const rows = await db
        .select()
        .from(systemSettings)
        .where(
          inArray(systemSettings.key, [surface.bytesKey, surface.archivesKey]),
        );
      assert.equal(rows.length, 0);
    });

    it("PATCH with out-of-range maxArchives is rejected with 400 out_of_range", async () => {
      const r = await req("PATCH", surface.patchPath, {
        maxArchives: surface.limits.archivesMax + 1,
      });
      assert.equal(r.status, 400);
      assert.equal(r.body.ok, false);
      assert.equal(r.body.error, "out_of_range");

      const rows = await db
        .select()
        .from(systemSettings)
        .where(
          inArray(systemSettings.key, [surface.bytesKey, surface.archivesKey]),
        );
      assert.equal(rows.length, 0);
    });

    it("PATCH from founder persists both fields and the returned status reflects them", async () => {
      const newBytes = 524288; // 512 KiB
      const newArchives = 6;
      const r = await req("PATCH", surface.patchPath, {
        maxBytes: newBytes,
        maxArchives: newArchives,
      });
      assert.equal(r.status, 200);
      assert.equal(r.body.ok, true);
      assert.deepEqual([...r.body.updated].sort(), ["archives", "bytes"]);
      assert.equal(r.body.status.auditMaxBytes, newBytes);
      assert.equal(r.body.status.auditMaxArchives, newArchives);
      assert.equal(r.body.status.auditMaxBytesSource, "db");
      assert.equal(r.body.status.auditMaxArchivesSource, "db");

      const rows = await db
        .select()
        .from(systemSettings)
        .where(
          inArray(systemSettings.key, [surface.bytesKey, surface.archivesKey]),
        );
      assert.equal(rows.length, 2);
      const byKey = Object.fromEntries(rows.map((row) => [row.key, row.value]));
      assert.equal(byKey[surface.bytesKey], String(newBytes));
      assert.equal(byKey[surface.archivesKey], String(newArchives));

      // A fresh status GET (with cache cleared, simulating a server
      // restart) must report the saved values with source "db".
      resetServiceCache(surface.service);
      await surface.service.ensureAuditCacheLoaded();
      const get = await req("GET", surface.statusPath);
      assert.equal(get.status, 200);
      assert.equal(get.body.status.auditMaxBytes, newBytes);
      assert.equal(get.body.status.auditMaxArchives, newArchives);
      assert.equal(get.body.status.auditMaxBytesSource, "db");
      assert.equal(get.body.status.auditMaxArchivesSource, "db");
    });

    it("PATCH with only maxBytes leaves maxArchives sourced from default", async () => {
      const r = await req("PATCH", surface.patchPath, { maxBytes: 524288 });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.updated, ["bytes"]);
      assert.equal(r.body.status.auditMaxBytesSource, "db");
      assert.equal(r.body.status.auditMaxArchivesSource, "default");
      assert.equal(
        r.body.status.auditMaxArchives,
        surface.limits.archivesDefault,
      );
    });
  });
}
