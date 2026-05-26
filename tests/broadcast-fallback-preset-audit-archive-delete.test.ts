/**
 * Task #353 — Route coverage for the per-archive fallback-preset audit
 * delete endpoint:
 *   DELETE /api/admin/broadcasts/fallback-default-preset-audit/archives/:archiveName
 *
 * Locks in:
 *  - Founder can delete a real rotated archive; the response stats reflect
 *    the removal and the file is gone from disk.
 *  - Non-founder staff get 403 even though they pass requireRootAdmin
 *    (the route adds a second `actor.isFounder` gate).
 *  - Invalid / path-traversal archive names are rejected with 400 and the
 *    audit directory is untouched.
 *  - Requests for a missing archive return 404 with the current stats.
 */

import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import express from "express";

import { registerBroadcastRoutes } from "../server/routes/broadcasts";

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

async function listen(
  app: express.Express,
): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

function archiveName(stamp: string): string {
  // Matches FALLBACK_PRESET_AUDIT_ARCHIVE_SUFFIX_RE in server/routes/broadcasts.ts.
  return `broadcast-fallback-default-preset.jsonl.${stamp}`;
}

describe(
  "DELETE /api/admin/broadcasts/fallback-default-preset-audit/archives/:archiveName",
  () => {
    let appServer: Server;
    let appUrl: string;
    let prevPrivateDir: string | undefined;
    let tmpRoot: string;
    let auditDir: string;

    before(async () => {
      prevPrivateDir = process.env.PRIVATE_OBJECT_DIR;
      tmpRoot = mkdtempSync(resolve(tmpdir(), "task353-audit-"));
      process.env.PRIVATE_OBJECT_DIR = tmpRoot;
      auditDir = resolve(tmpRoot, "audit");
      mkdirSync(auditDir, { recursive: true });

      const app = express();
      app.use(express.json());
      app.use(sessionInjector);
      // Pass-through requireRootAdmin so the route's own `actor.isFounder`
      // gate is what we exercise. Production wires the same gate one layer
      // up; we mirror the retention-test pattern here.
      registerBroadcastRoutes(app, (_req, _res, next) => next());
      ({ server: appServer, baseUrl: appUrl } = await listen(app));
    });

    after(async () => {
      await new Promise<void>((r) => appServer.close(() => r()));
      try {
        rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
      if (prevPrivateDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
      else process.env.PRIVATE_OBJECT_DIR = prevPrivateDir;
    });

    beforeEach(() => {
      // Wipe any leftover files from a prior test so stats are deterministic.
      for (const name of readdirSync(auditDir)) {
        try {
          rmSync(resolve(auditDir, name), { force: true });
        } catch {
          /* best effort */
        }
      }
      currentSession = FOUNDER_SESSION;
    });

    afterEach(() => {
      for (const name of readdirSync(auditDir)) {
        try {
          rmSync(resolve(auditDir, name), { force: true });
        } catch {
          /* best effort */
        }
      }
    });

    async function del(
      name: string,
    ): Promise<{ status: number; body: any }> {
      const r = await fetch(
        `${appUrl}/api/admin/broadcasts/fallback-default-preset-audit/archives/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
      let parsed: any = null;
      try {
        parsed = await r.json();
      } catch {
        parsed = null;
      }
      return { status: r.status, body: parsed };
    }

    it("founder can delete a real rotated archive and stats reflect the removal", async () => {
      const a1 = archiveName("2024-01-15T10-20-30-456Z");
      const a2 = archiveName("2024-02-20T11-22-33-789Z");
      writeFileSync(resolve(auditDir, a1), '{"x":1}\n', "utf8");
      writeFileSync(resolve(auditDir, a2), '{"x":2}\n', "utf8");

      const r = await del(a1);
      assert.equal(r.status, 200);
      assert.equal(r.body.ok, true);
      assert.equal(r.body.deleted, a1);
      // Stats now reflect the single remaining archive.
      assert.equal(r.body.stats.archiveCount, 1);
      assert.equal(r.body.stats.archives.length, 1);
      assert.equal(r.body.stats.archives[0].name, a2);

      assert.equal(existsSync(resolve(auditDir, a1)), false);
      assert.equal(existsSync(resolve(auditDir, a2)), true);
    });

    it("non-founder staff get 403 and the archive is left intact", async () => {
      const a1 = archiveName("2024-03-01T01-02-03-004Z");
      writeFileSync(resolve(auditDir, a1), '{"x":1}\n', "utf8");

      currentSession = STAFF_SESSION;
      const r = await del(a1);
      assert.equal(r.status, 403);
      assert.equal(r.body.ok, false);
      assert.equal(r.body.error, "forbidden");

      assert.equal(existsSync(resolve(auditDir, a1)), true);
    });

    it("rejects invalid archive names with 400 invalid_archive_name", async () => {
      // Place a sibling file outside the audit dir so we can prove the route
      // would never touch it even if path-traversal slipped through.
      const sibling = resolve(tmpRoot, "secret.txt");
      writeFileSync(sibling, "do not delete", "utf8");

      const cases = [
        "not-an-archive.jsonl",
        "broadcast-fallback-default-preset.jsonl", // active file, not an archive
        "broadcast-fallback-default-preset.jsonl.bad-stamp",
        "../secret.txt",
        "..%2Fsecret.txt",
      ];
      for (const name of cases) {
        const r = await del(name);
        assert.equal(r.status, 400, `expected 400 for ${name}, got ${r.status}`);
        assert.equal(r.body.ok, false);
        assert.equal(r.body.error, "invalid_archive_name");
      }

      // Sibling file untouched.
      assert.equal(existsSync(sibling), true);
      try {
        rmSync(sibling, { force: true });
      } catch {
        /* best effort */
      }
    });

    it("returns 404 archive_not_found with current stats when the archive is missing", async () => {
      const existing = archiveName("2024-04-04T04-04-04-444Z");
      writeFileSync(resolve(auditDir, existing), '{"x":1}\n', "utf8");

      const missing = archiveName("2099-12-31T23-59-59-999Z");
      const r = await del(missing);
      assert.equal(r.status, 404);
      assert.equal(r.body.ok, false);
      assert.equal(r.body.error, "archive_not_found");
      // Stats still report the surviving archive.
      assert.equal(r.body.stats.archiveCount, 1);
      assert.equal(r.body.stats.archives[0].name, existing);
    });
  },
);
