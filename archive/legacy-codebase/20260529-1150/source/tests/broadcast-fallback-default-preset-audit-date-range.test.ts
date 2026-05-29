/**
 * Task #326 — Regression coverage for the date-range filter on the
 * fallback-preset audit endpoint:
 *   GET /api/admin/broadcasts/fallback-default-preset-audit?from=...&to=...
 *
 * Locks in:
 *  - When `from`/`to` are present, the server consults rotated archive
 *    files as well, not only the active jsonl, so a matching window can
 *    live entirely in archives even when the active file already has
 *    `limit` entries.
 *  - `from`+`to`+`actorId` compose as a single AND filter.
 *  - The response echoes the parsed `from`/`to` ISO strings so the UI
 *    can confirm what the server applied.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as pathResolve } from "node:path";
import express from "express";

import { registerBroadcastRoutes } from "../server/routes/broadcasts";

function fakeRootAdmin(req: any, _res: any, next: any) {
  req.session = {
    isAdmin: true,
    adminActorType: "root_admin",
    adminRole: "super_admin",
    adminPermissions: ["*"],
    adminActorId: "test-root",
  };
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

type AuditLine = {
  id: string;
  ts: string;
  actorId: string;
  actorType: string;
  action: "set" | "clear";
  before: { dryRun: string; status: string; packageId: string } | null;
  after: { dryRun: string; status: string; packageId: string } | null;
};

function line(
  ts: string,
  actorId: string,
  packageId: string,
  id: string,
): AuditLine {
  return {
    id,
    ts,
    actorId,
    actorType: "root_admin",
    action: "set",
    before: null,
    after: { dryRun: "live", status: "ready", packageId },
  };
}

describe(
  "GET /api/admin/broadcasts/fallback-default-preset-audit date range",
  () => {
    let appServer: Server;
    let appUrl: string;
    let tmpRoot: string;
    let auditDir: string;
    let prevPrivateDir: string | undefined;

    // Three windows: old (in archive), mid (in archive), recent (in active).
    const OLD_TS = "2024-01-10T12:00:00.000Z"; // matches "from=2024-01-01,to=2024-01-31"
    const MID_TS = "2024-06-15T12:00:00.000Z";
    const RECENT_TS_1 = "2025-01-01T12:00:00.000Z";
    const RECENT_TS_2 = "2025-01-02T12:00:00.000Z";
    const RECENT_TS_3 = "2025-01-03T12:00:00.000Z";

    before(async () => {
      tmpRoot = mkdtempSync(join(tmpdir(), "fallback-preset-audit-"));
      prevPrivateDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = tmpRoot;
      auditDir = pathResolve(tmpRoot, "audit");
      mkdirSync(auditDir, { recursive: true });

      // Archive with old + mid window entries. Filename matches the
      // rotation regex `broadcast-fallback-default-preset.jsonl.<stamp>`.
      const archivePath = pathResolve(
        auditDir,
        "broadcast-fallback-default-preset.jsonl.2024-12-31T23-59-59-000Z",
      );
      writeFileSync(
        archivePath,
        [
          JSON.stringify(line(OLD_TS, "actor-alice", "pkg-old", "id-old")),
          JSON.stringify(line(MID_TS, "actor-bob", "pkg-mid", "id-mid")),
        ].join("\n") + "\n",
      );

      // Active file with three recent entries (>= limit=2 from the UI's
      // perspective) so the pre-T326 archive-skip shortcut would hide the
      // archived matches if we asked for an old date window.
      const activePath = pathResolve(
        auditDir,
        "broadcast-fallback-default-preset.jsonl",
      );
      writeFileSync(
        activePath,
        [
          JSON.stringify(
            line(RECENT_TS_1, "actor-alice", "pkg-r1", "id-r1"),
          ),
          JSON.stringify(line(RECENT_TS_2, "actor-bob", "pkg-r2", "id-r2")),
          JSON.stringify(
            line(RECENT_TS_3, "actor-alice", "pkg-r3", "id-r3"),
          ),
        ].join("\n") + "\n",
      );

      const app = express();
      app.use(express.json());
      app.use(fakeRootAdmin);
      registerBroadcastRoutes(app, (_req, _res, next) => next());
      ({ server: appServer, baseUrl: appUrl } = await listen(app));
    });

    after(async () => {
      await new Promise<void>((r) => appServer.close(() => r()));
      if (prevPrivateDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
      else process.env.PRIVATE_OBJECT_DIR = prevPrivateDir;
      try {
        rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });

    async function getAudit(qs: string): Promise<any> {
      const r = await fetch(
        `${appUrl}/api/admin/broadcasts/fallback-default-preset-audit?${qs}`,
      );
      assert.equal(r.status, 200);
      return await r.json();
    }

    it(
      "returns matching entries from rotated archives even when the active file already has >= limit rows",
      async () => {
        // Tight window around the old archived entry; active file has
        // three rows so without the T326 fix the archive scan would be
        // skipped and this query would return nothing.
        const body = await getAudit(
          "limit=2&from=2024-01-01T00:00:00.000Z&to=2024-01-31T23:59:59.999Z",
        );
        assert.equal(body.ok, true);
        assert.equal(body.from, "2024-01-01T00:00:00.000Z");
        assert.equal(body.to, "2024-01-31T23:59:59.999Z");
        assert.equal(body.entries.length, 1);
        assert.equal(body.entries[0].id, "id-old");
        assert.equal(body.entries[0].actorId, "actor-alice");
        assert.equal(body.total, 1);
      },
    );

    it(
      "composes from + to + actorId as a combined AND filter across active + archives",
      async () => {
        // Wide range that spans both archive and active, narrowed to
        // alice. Should match: id-old (archive) + id-r1, id-r3 (active).
        const body = await getAudit(
          "limit=10&from=2024-01-01T00:00:00.000Z&to=2025-12-31T00:00:00.000Z&actorId=actor-alice",
        );
        assert.equal(body.ok, true);
        assert.equal(body.actorId, "actor-alice");
        const ids = body.entries.map((e: any) => e.id).sort();
        assert.deepEqual(ids, ["id-old", "id-r1", "id-r3"]);
        for (const e of body.entries) {
          assert.equal(e.actorId, "actor-alice");
        }
      },
    );

    it(
      "with no date filter, preserves the existing newest-first limit shortcut",
      async () => {
        const body = await getAudit("limit=2");
        assert.equal(body.ok, true);
        assert.equal(body.from, null);
        assert.equal(body.to, null);
        assert.equal(body.entries.length, 2);
        // Newest-first: r3 then r2.
        assert.equal(body.entries[0].id, "id-r3");
        assert.equal(body.entries[1].id, "id-r2");
      },
    );
  },
);
