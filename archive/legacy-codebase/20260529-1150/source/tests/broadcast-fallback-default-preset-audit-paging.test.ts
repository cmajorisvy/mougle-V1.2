/**
 * Task #331 — Regression coverage for paging on the fallback-preset audit
 * endpoint:
 *   GET /api/admin/broadcasts/fallback-default-preset-audit?limit=&offset=
 *
 * Locks in:
 *  - The endpoint reads the active jsonl AND every rotated archive file so
 *    `total` reflects the full combined history (not just the active file
 *    or the latest `limit` rows).
 *  - Page 1 (offset=0) and page 2 (offset=limit) return DISTINCT entries
 *    in newest-first order, with `hasMore=true` while more pages remain.
 *  - `hasMore` flips to false on the last page once `offset + entries.length`
 *    reaches `total`.
 *  - An `actorId` filter narrows the returned entries AND `total` so paging
 *    stays consistent with the filtered set (i.e. `total` is not the
 *    unfiltered count).
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
  "GET /api/admin/broadcasts/fallback-default-preset-audit paging",
  () => {
    let appServer: Server;
    let appUrl: string;
    let tmpRoot: string;
    let prevPrivateDir: string | undefined;

    // 7 entries total split across one rotated archive (3 oldest) and the
    // active jsonl (4 newest), interleaving two actors so the actorId
    // filter test below has matches in both files.
    //
    // Within each file, entries are appended oldest→newest. After the
    // endpoint concats `[archive..., active...]` and reverses, the
    // newest-first order is: A4, A3, A2, A1, R3, R2, R1.
    const R1 = "2024-01-01T00:00:00.000Z"; // archive, alice
    const R2 = "2024-01-02T00:00:00.000Z"; // archive, bob
    const R3 = "2024-01-03T00:00:00.000Z"; // archive, alice
    const A1 = "2024-02-01T00:00:00.000Z"; // active,  bob
    const A2 = "2024-02-02T00:00:00.000Z"; // active,  alice
    const A3 = "2024-02-03T00:00:00.000Z"; // active,  bob
    const A4 = "2024-02-04T00:00:00.000Z"; // active,  alice

    // Newest-first order across the entire combined history.
    const NEWEST_FIRST_IDS = [
      "id-a4",
      "id-a3",
      "id-a2",
      "id-a1",
      "id-r3",
      "id-r2",
      "id-r1",
    ];
    // Newest-first order filtered to alice (4 entries: a4, a2, r3, r1).
    const ALICE_NEWEST_FIRST_IDS = ["id-a4", "id-a2", "id-r3", "id-r1"];

    before(async () => {
      tmpRoot = mkdtempSync(join(tmpdir(), "fallback-preset-audit-paging-"));
      prevPrivateDir = process.env.PRIVATE_OBJECT_DIR;
      process.env.PRIVATE_OBJECT_DIR = tmpRoot;
      const auditDir = pathResolve(tmpRoot, "audit");
      mkdirSync(auditDir, { recursive: true });

      // Rotated archive: filename matches the rotation regex
      // `broadcast-fallback-default-preset.jsonl.<stamp>`.
      const archivePath = pathResolve(
        auditDir,
        "broadcast-fallback-default-preset.jsonl.2024-01-31T23-59-59-000Z",
      );
      writeFileSync(
        archivePath,
        [
          JSON.stringify(line(R1, "actor-alice", "pkg-r1", "id-r1")),
          JSON.stringify(line(R2, "actor-bob", "pkg-r2", "id-r2")),
          JSON.stringify(line(R3, "actor-alice", "pkg-r3", "id-r3")),
        ].join("\n") + "\n",
      );

      // Active log: 4 entries newer than the archive contents.
      const activePath = pathResolve(
        auditDir,
        "broadcast-fallback-default-preset.jsonl",
      );
      writeFileSync(
        activePath,
        [
          JSON.stringify(line(A1, "actor-bob", "pkg-a1", "id-a1")),
          JSON.stringify(line(A2, "actor-alice", "pkg-a2", "id-a2")),
          JSON.stringify(line(A3, "actor-bob", "pkg-a3", "id-a3")),
          JSON.stringify(line(A4, "actor-alice", "pkg-a4", "id-a4")),
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
      "page 1 (offset=0) returns the newest `limit` entries across active + archives with hasMore=true",
      async () => {
        const body = await getAudit("limit=3&offset=0");
        assert.equal(body.ok, true);
        assert.equal(body.limit, 3);
        assert.equal(body.offset, 0);
        // `total` must reflect active (4) + archive (3) = 7, proving the
        // archive was scanned even though the active file already has
        // more than `limit` rows.
        assert.equal(body.total, 7);
        assert.equal(body.hasMore, true);
        assert.equal(body.entries.length, 3);
        assert.deepEqual(
          body.entries.map((e: any) => e.id),
          NEWEST_FIRST_IDS.slice(0, 3),
        );
      },
    );

    it(
      "page 2 (offset=limit) returns the next page of distinct entries, still newest-first, hasMore=true",
      async () => {
        const body = await getAudit("limit=3&offset=3");
        assert.equal(body.ok, true);
        assert.equal(body.limit, 3);
        assert.equal(body.offset, 3);
        assert.equal(body.total, 7);
        assert.equal(body.hasMore, true);
        assert.equal(body.entries.length, 3);
        const ids = body.entries.map((e: any) => e.id);
        assert.deepEqual(ids, NEWEST_FIRST_IDS.slice(3, 6));

        // Sanity: no overlap with page 1.
        const page1 = await getAudit("limit=3&offset=0");
        const page1Ids = new Set(page1.entries.map((e: any) => e.id));
        for (const id of ids) {
          assert.equal(
            page1Ids.has(id),
            false,
            `entry ${id} from page 2 must not appear on page 1`,
          );
        }
      },
    );

    it(
      "last page flips hasMore=false once offset+entries.length === total",
      async () => {
        const body = await getAudit("limit=3&offset=6");
        assert.equal(body.ok, true);
        assert.equal(body.offset, 6);
        assert.equal(body.total, 7);
        assert.equal(body.entries.length, 1);
        assert.deepEqual(
          body.entries.map((e: any) => e.id),
          NEWEST_FIRST_IDS.slice(6, 7),
        );
        assert.equal(body.hasMore, false);
      },
    );

    it(
      "actorId filter narrows entries AND total so paging stays consistent with the filtered set",
      async () => {
        // Alice has 4 entries total (2 in active, 2 in archive). With
        // limit=2 the first page should hold the two newest alice rows
        // and `total` should be 4, NOT the unfiltered 7.
        const page1 = await getAudit("limit=2&offset=0&actorId=actor-alice");
        assert.equal(page1.ok, true);
        assert.equal(page1.actorId, "actor-alice");
        assert.equal(page1.total, 4);
        assert.equal(page1.hasMore, true);
        assert.equal(page1.entries.length, 2);
        assert.deepEqual(
          page1.entries.map((e: any) => e.id),
          ALICE_NEWEST_FIRST_IDS.slice(0, 2),
        );
        for (const e of page1.entries) {
          assert.equal(e.actorId, "actor-alice");
        }

        // Page 2 of the filtered set should reach the archived alice rows
        // and end with hasMore=false.
        const page2 = await getAudit("limit=2&offset=2&actorId=actor-alice");
        assert.equal(page2.total, 4);
        assert.equal(page2.hasMore, false);
        assert.equal(page2.entries.length, 2);
        assert.deepEqual(
          page2.entries.map((e: any) => e.id),
          ALICE_NEWEST_FIRST_IDS.slice(2, 4),
        );
        for (const e of page2.entries) {
          assert.equal(e.actorId, "actor-alice");
        }
      },
    );
  },
);
