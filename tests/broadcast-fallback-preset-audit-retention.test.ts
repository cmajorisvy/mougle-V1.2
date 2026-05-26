/**
 * Task #333 — Route coverage for the fallback-preset audit retention
 * endpoints:
 *   GET   /api/admin/broadcasts/fallback-default-preset-audit/retention
 *   PATCH /api/admin/broadcasts/fallback-default-preset-audit/retention
 *
 * Locks in:
 *  - Both verbs require a founder (root_admin/super_admin); non-founder
 *    staff get 403 even when they pass requireRootAdmin.
 *  - PATCH validates `maxBytes` / `maxArchives` shape and guardrails.
 *  - PATCH with no fields is rejected.
 *  - The PATCH response (and a follow-up GET) reflects the saved value
 *    and reports the source as "db".
 */

import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express from "express";
import { inArray } from "drizzle-orm";

import { registerBroadcastRoutes } from "../server/routes/broadcasts";
import { db } from "../server/db";
import { systemSettings } from "../shared/schema";
import {
  FALLBACK_PRESET_AUDIT_LIMITS,
  fallbackPresetAuditSettingsService,
} from "../server/services/fallback-preset-audit-settings-service";

const BYTES_KEY = "fallback_preset_audit_max_bytes";
const ARCHIVES_KEY = "fallback_preset_audit_max_archives";
const ENV_BYTES = "FALLBACK_PRESET_AUDIT_MAX_BYTES";
const ENV_ARCHIVES = "FALLBACK_PRESET_AUDIT_MAX_ARCHIVES";

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

function resetServiceCache() {
  const s = fallbackPresetAuditSettingsService as any;
  s.cachedAuditMaxBytes = null;
  s.cachedAuditMaxArchives = null;
  s.auditCacheLoadPromise = null;
}

async function clearDbRows() {
  await db
    .delete(systemSettings)
    .where(inArray(systemSettings.key, [BYTES_KEY, ARCHIVES_KEY]));
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

describe(
  "/api/admin/broadcasts/fallback-default-preset-audit/retention",
  () => {
    let appServer: Server;
    let appUrl: string;
    let prevEnvBytes: string | undefined;
    let prevEnvArchives: string | undefined;
    let prevRows: Array<typeof systemSettings.$inferSelect> = [];

    before(async () => {
      prevEnvBytes = process.env[ENV_BYTES];
      prevEnvArchives = process.env[ENV_ARCHIVES];
      delete process.env[ENV_BYTES];
      delete process.env[ENV_ARCHIVES];
      prevRows = await db
        .select()
        .from(systemSettings)
        .where(inArray(systemSettings.key, [BYTES_KEY, ARCHIVES_KEY]));
      await clearDbRows();
      resetServiceCache();

      const app = express();
      app.use(express.json());
      app.use(sessionInjector);
      // Pass-through requireRootAdmin so the route's own `actor.isFounder`
      // gate is what we exercise. Production wires the same gate one
      // layer up.
      registerBroadcastRoutes(app, (_req, _res, next) => next());
      ({ server: appServer, baseUrl: appUrl } = await listen(app));
    });

    after(async () => {
      await new Promise<void>((r) => appServer.close(() => r()));
      await clearDbRows();
      if (prevRows.length > 0) {
        await db.insert(systemSettings).values(prevRows);
      }
      if (prevEnvBytes === undefined) delete process.env[ENV_BYTES];
      else process.env[ENV_BYTES] = prevEnvBytes;
      if (prevEnvArchives === undefined) delete process.env[ENV_ARCHIVES];
      else process.env[ENV_ARCHIVES] = prevEnvArchives;
      resetServiceCache();
    });

    beforeEach(async () => {
      await clearDbRows();
      resetServiceCache();
      currentSession = FOUNDER_SESSION;
    });

    afterEach(async () => {
      await clearDbRows();
      resetServiceCache();
    });

    async function req(
      method: "GET" | "PATCH",
      body?: unknown,
    ): Promise<{ status: number; body: any }> {
      const init: RequestInit = { method };
      if (body !== undefined) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
      }
      const r = await fetch(
        `${appUrl}/api/admin/broadcasts/fallback-default-preset-audit/retention`,
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

    it("GET returns defaults when neither DB nor env is set", async () => {
      const r = await req("GET");
      assert.equal(r.status, 200);
      assert.equal(r.body.ok, true);
      assert.equal(
        r.body.status.auditMaxBytes,
        FALLBACK_PRESET_AUDIT_LIMITS.bytesDefault,
      );
      assert.equal(
        r.body.status.auditMaxArchives,
        FALLBACK_PRESET_AUDIT_LIMITS.archivesDefault,
      );
      assert.equal(r.body.status.auditMaxBytesSource, "default");
      assert.equal(r.body.status.auditMaxArchivesSource, "default");
      assert.deepEqual(
        r.body.status.auditLimits,
        FALLBACK_PRESET_AUDIT_LIMITS,
      );
    });

    it("PATCH from non-founder staff is rejected with 403 and writes nothing", async () => {
      currentSession = STAFF_SESSION;
      const r = await req("PATCH", { maxBytes: 524288 });
      assert.equal(r.status, 403);
      assert.equal(r.body.ok, false);
      assert.equal(r.body.error, "forbidden");

      const rows = await db
        .select()
        .from(systemSettings)
        .where(inArray(systemSettings.key, [BYTES_KEY, ARCHIVES_KEY]));
      assert.equal(rows.length, 0);
    });

    it("PATCH with no fields returns 400 no_fields", async () => {
      const r = await req("PATCH", {});
      assert.equal(r.status, 400);
      assert.equal(r.body.ok, false);
      assert.equal(r.body.error, "no_fields");
    });

    it("PATCH with non-numeric maxBytes returns 400 invalid_max_bytes", async () => {
      const r = await req("PATCH", { maxBytes: "not-a-number" });
      assert.equal(r.status, 400);
      assert.equal(r.body.ok, false);
      assert.equal(r.body.error, "invalid_max_bytes");
    });

    it("PATCH with non-numeric maxArchives returns 400 invalid_max_archives", async () => {
      const r = await req("PATCH", { maxArchives: "nope" });
      assert.equal(r.status, 400);
      assert.equal(r.body.ok, false);
      assert.equal(r.body.error, "invalid_max_archives");
    });

    it("PATCH with out-of-range maxBytes is rejected with 400 out_of_range", async () => {
      const r = await req("PATCH", {
        maxBytes: FALLBACK_PRESET_AUDIT_LIMITS.bytesMin - 1,
      });
      assert.equal(r.status, 400);
      assert.equal(r.body.ok, false);
      assert.equal(r.body.error, "out_of_range");

      const rows = await db
        .select()
        .from(systemSettings)
        .where(inArray(systemSettings.key, [BYTES_KEY, ARCHIVES_KEY]));
      assert.equal(rows.length, 0);
    });

    it("PATCH from founder persists both fields and the returned status reflects them", async () => {
      const newBytes = 524288; // 512 KiB
      const newArchives = 6;
      const r = await req("PATCH", {
        maxBytes: newBytes,
        maxArchives: newArchives,
      });
      assert.equal(r.status, 200);
      assert.equal(r.body.ok, true);
      assert.deepEqual(r.body.updated.sort(), ["archives", "bytes"]);
      assert.equal(r.body.status.auditMaxBytes, newBytes);
      assert.equal(r.body.status.auditMaxArchives, newArchives);
      assert.equal(r.body.status.auditMaxBytesSource, "db");
      assert.equal(r.body.status.auditMaxArchivesSource, "db");

      const rows = await db
        .select()
        .from(systemSettings)
        .where(inArray(systemSettings.key, [BYTES_KEY, ARCHIVES_KEY]));
      assert.equal(rows.length, 2);
      const byKey = Object.fromEntries(rows.map((row) => [row.key, row.value]));
      assert.equal(byKey[BYTES_KEY], String(newBytes));
      assert.equal(byKey[ARCHIVES_KEY], String(newArchives));

      // A fresh GET (with cache cleared, simulating a server restart) must
      // report the saved value with source "db".
      resetServiceCache();
      const get = await req("GET");
      assert.equal(get.status, 200);
      assert.equal(get.body.status.auditMaxBytes, newBytes);
      assert.equal(get.body.status.auditMaxArchives, newArchives);
      assert.equal(get.body.status.auditMaxBytesSource, "db");
      assert.equal(get.body.status.auditMaxArchivesSource, "db");
    });

    it("PATCH with only maxBytes leaves maxArchives sourced from default/env", async () => {
      const r = await req("PATCH", { maxBytes: 524288 });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body.updated, ["bytes"]);
      assert.equal(r.body.status.auditMaxBytesSource, "db");
      assert.equal(r.body.status.auditMaxArchivesSource, "default");
      assert.equal(
        r.body.status.auditMaxArchives,
        FALLBACK_PRESET_AUDIT_LIMITS.archivesDefault,
      );
    });
  },
);
