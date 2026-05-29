import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve as pathResolve, join } from "node:path";
import express from "express";

import { registerBroadcastRoutes } from "../server/routes/broadcasts";
import { broadcastCompositorService } from "../server/services/broadcast-compositor-service";

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

async function listen(app: express.Express): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

describe("POST /api/admin/broadcasts/covers/sweep orphan reconciliation", () => {
  let appServer: Server;
  let appUrl: string;
  let tmpRoot: string;
  let coversDir: string;
  let prevPrivateDir: string | undefined;
  const origList = broadcastCompositorService.listBroadcastIds;

  const KNOWN_IDS = ["bc-keep-1", "bc-keep-2"];
  const ORPHAN_FILES = ["bc-orphan-a.png", "bc-orphan-b.jpg"];
  const KEEP_FILES = ["bc-keep-1.png", "bc-keep-2.webp"];
  const DISALLOWED_FILES = ["bc-keep-1.txt", "bc-orphan-c.exe", "README.md"];

  before(async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), "cover-sweep-"));
    prevPrivateDir = process.env.PRIVATE_OBJECT_DIR;
    process.env.PRIVATE_OBJECT_DIR = tmpRoot;
    coversDir = pathResolve(tmpRoot, "broadcasts", "covers");
    mkdirSync(coversDir, { recursive: true });

    for (const name of [...ORPHAN_FILES, ...KEEP_FILES, ...DISALLOWED_FILES]) {
      writeFileSync(pathResolve(coversDir, name), Buffer.from("x"));
    }

    (broadcastCompositorService as any).listBroadcastIds = async () => KNOWN_IDS.slice();

    const app = express();
    app.use(express.json());
    app.use(fakeRootAdmin);
    registerBroadcastRoutes(app, (_req, _res, next) => next());
    ({ server: appServer, baseUrl: appUrl } = await listen(app));
  });

  after(async () => {
    await new Promise<void>((r) => appServer.close(() => r()));
    (broadcastCompositorService as any).listBroadcastIds = origList;
    if (prevPrivateDir === undefined) {
      delete process.env.PRIVATE_OBJECT_DIR;
    } else {
      process.env.PRIVATE_OBJECT_DIR = prevPrivateDir;
    }
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  type SweepBody = {
    ok: boolean;
    dryRun?: boolean;
    orphanCount: number;
    removed?: number;
    orphans: { file: string; id: string; ext: string }[];
    confirmToken?: string;
    confirmTokenTtlMs?: number;
    error?: string;
    message?: string;
  };

  async function dryRun(): Promise<SweepBody> {
    const r = await fetch(`${appUrl}/api/admin/broadcasts/covers/sweep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(r.status, 200);
    return (await r.json()) as SweepBody;
  }

  async function apply(
    body: Record<string, unknown>,
  ): Promise<{ status: number; body: SweepBody }> {
    const r = await fetch(`${appUrl}/api/admin/broadcasts/covers/sweep?apply=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: (await r.json()) as SweepBody };
  }

  it("dry-run reports only allowed-extension orphans, returns a confirm token, and deletes nothing", async () => {
    const body = await dryRun();
    assert.equal(body.ok, true);
    assert.equal(body.dryRun, true);
    assert.equal(body.removed, 0);

    const reportedFiles = body.orphans.map((o) => o.file).sort();
    assert.deepEqual(reportedFiles, [...ORPHAN_FILES].sort());
    assert.equal(body.orphanCount, ORPHAN_FILES.length);
    assert.ok(body.confirmToken && /^\d+\.[a-f0-9]+$/.test(body.confirmToken), "dry-run returns a confirm token");
    assert.ok((body.confirmTokenTtlMs ?? 0) > 0, "dry-run returns a token TTL");

    const onDisk = readdirSync(coversDir).sort();
    const expected = [...ORPHAN_FILES, ...KEEP_FILES, ...DISALLOWED_FILES].sort();
    assert.deepEqual(onDisk, expected, "dry-run must not delete anything");
  });

  it("apply=1 without a confirm token is rejected and deletes nothing", async () => {
    const { status, body } = await apply({});
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.error, "missing_confirm_token");
    assert.ok(body.confirmToken, "rejection response includes a fresh token");

    for (const name of ORPHAN_FILES) {
      assert.ok(
        existsSync(pathResolve(coversDir, name)),
        `orphan ${name} must still exist after rejected apply`,
      );
    }
  });

  it("apply=1 with a malformed token is rejected", async () => {
    const { status, body } = await apply({ confirmToken: "not-a-token" });
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.equal(body.error, "invalid_confirm_token");
  });

  it("apply=1 is rejected when the orphan list changed between dry-run and apply", async () => {
    const stale = await dryRun();
    assert.ok(stale.confirmToken);

    // Simulate the orphan set changing: a previously-orphan file is now
    // claimed by a real broadcast row.
    (broadcastCompositorService as any).listBroadcastIds = async () => [
      ...KNOWN_IDS,
      "bc-orphan-a",
    ];
    try {
      const { status, body } = await apply({ confirmToken: stale.confirmToken });
      assert.equal(status, 409);
      assert.equal(body.ok, false);
      assert.equal(body.error, "orphan_set_changed");
      assert.ok(body.confirmToken && body.confirmToken !== stale.confirmToken);

      // Nothing should have been deleted.
      for (const name of ORPHAN_FILES) {
        assert.ok(
          existsSync(pathResolve(coversDir, name)),
          `orphan ${name} must remain after rejected apply`,
        );
      }
    } finally {
      (broadcastCompositorService as any).listBroadcastIds = async () => KNOWN_IDS.slice();
    }
  });

  it("apply=1 with a matching confirm token deletes only orphan files with allowed extensions", async () => {
    const fresh = await dryRun();
    assert.ok(fresh.confirmToken);

    const r = await fetch(`${appUrl}/api/admin/broadcasts/covers/sweep?apply=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmToken: fresh.confirmToken }),
    });
    assert.equal(r.status, 200);
    const body = (await r.json()) as {
      ok: boolean;
      dryRun: boolean;
      orphanCount: number;
      removed: number;
      removedFiles: string[];
      errors: { file: string; message: string }[];
      auditId: string;
    };
    assert.equal(body.ok, true);
    assert.equal(body.dryRun, false);
    assert.equal(body.orphanCount, ORPHAN_FILES.length);
    assert.equal(body.removed, ORPHAN_FILES.length);
    assert.deepEqual(body.removedFiles.slice().sort(), [...ORPHAN_FILES].sort());
    assert.deepEqual(body.errors, []);
    assert.ok(body.auditId && body.auditId.length > 0);

    for (const name of ORPHAN_FILES) {
      assert.equal(
        existsSync(pathResolve(coversDir, name)),
        false,
        `orphan ${name} must be deleted`,
      );
    }
    for (const name of KEEP_FILES) {
      assert.ok(
        existsSync(pathResolve(coversDir, name)),
        `matching-id file ${name} must remain`,
      );
    }
    for (const name of DISALLOWED_FILES) {
      assert.ok(
        existsSync(pathResolve(coversDir, name)),
        `disallowed-extension file ${name} must remain`,
      );
    }
  });

  it("audit entry for the apply run lists the files that disappeared from disk", async () => {
    const auditPath = pathResolve(tmpRoot, "audit", "broadcast-cover-sweep.jsonl");
    assert.ok(existsSync(auditPath), "audit file must exist after sweep runs");
    const lines = readFileSync(auditPath, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as {
        id: string;
        ts: string;
        actorId: string;
        mode: "dry_run" | "apply";
        orphans: { file: string }[];
        removed: string[];
        errors: { file: string; message: string }[];
      });
    assert.ok(lines.length >= 2, "expected at least one dry-run and one apply entry");
    const dry = lines.find((l) => l.mode === "dry_run");
    const applied = lines.find((l) => l.mode === "apply");
    assert.ok(dry, "dry-run entry must be recorded");
    assert.ok(applied, "apply entry must be recorded");
    assert.equal(dry!.removed.length, 0, "dry-run audit must record no removals");
    assert.deepEqual(applied!.removed.slice().sort(), [...ORPHAN_FILES].sort());
    assert.deepEqual(applied!.errors, []);
    assert.equal(applied!.actorId, "test-root");
    assert.ok(applied!.ts && !Number.isNaN(Date.parse(applied!.ts)));

    for (const name of applied!.removed) {
      assert.equal(
        existsSync(pathResolve(coversDir, name)),
        false,
        `audited removal ${name} must no longer exist on disk`,
      );
    }

    const r = await fetch(`${appUrl}/api/admin/broadcasts/covers/sweep/audit?limit=10`);
    assert.equal(r.status, 200);
    const listBody = (await r.json()) as {
      ok: boolean;
      count: number;
      entries: { id: string; mode: string; removed: string[]; restorableFiles?: string[]; trashDir?: string }[];
    };
    assert.equal(listBody.ok, true);
    assert.ok(listBody.count >= 2);
    assert.equal(listBody.entries[0].mode, "apply", "newest entry must be first");

    const applyEntry = listBody.entries.find((e) => e.mode === "apply")!;
    assert.ok(applyEntry.trashDir && applyEntry.trashDir.startsWith(".trash/"));
    assert.deepEqual(
      (applyEntry.restorableFiles ?? []).slice().sort(),
      [...ORPHAN_FILES].sort(),
      "all removed files should be listed as restorable while still in trash",
    );
    for (const name of applyEntry.removed) {
      const trashPath = pathResolve(coversDir, applyEntry.trashDir!, name);
      assert.ok(existsSync(trashPath), `${name} must be moved to trash, not unlinked`);
    }
  });

  it("restore puts a swept cover file back in the covers dir and audits the restore", async () => {
    const listRes = await fetch(`${appUrl}/api/admin/broadcasts/covers/sweep/audit?limit=10`);
    const listBody = (await listRes.json()) as {
      entries: { id: string; mode: string; removed: string[]; restorableFiles?: string[] }[];
    };
    const applyEntry = listBody.entries.find(
      (e) => e.mode === "apply" && (e.restorableFiles?.length ?? 0) > 0,
    );
    assert.ok(applyEntry, "an apply entry with restorable files should exist");
    const fileToRestore = applyEntry!.restorableFiles![0];

    const restoreRes = await fetch(
      `${appUrl}/api/admin/broadcasts/covers/sweep/restore`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditId: applyEntry!.id, file: fileToRestore }),
      },
    );
    assert.equal(restoreRes.status, 200);
    const restoreBody = (await restoreRes.json()) as {
      ok: boolean;
      restored: string;
      auditId: string;
    };
    assert.equal(restoreBody.ok, true);
    assert.equal(restoreBody.restored, fileToRestore);
    assert.ok(restoreBody.auditId);

    assert.ok(
      existsSync(pathResolve(coversDir, fileToRestore)),
      "restored file must reappear in covers dir",
    );

    const auditPath = pathResolve(tmpRoot, "audit", "broadcast-cover-sweep.jsonl");
    const lines = readFileSync(auditPath, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as { mode: string; restored?: string[]; restoredFrom?: string });
    const restoreEntry = lines.find(
      (l) => l.mode === "restore" && l.restoredFrom === applyEntry!.id,
    );
    assert.ok(restoreEntry, "restore entry must be appended to audit log");
    assert.deepEqual(restoreEntry!.restored, [fileToRestore]);

    // Second restore for the same file should fail because the destination
    // now exists.
    const dupRes = await fetch(
      `${appUrl}/api/admin/broadcasts/covers/sweep/restore`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditId: applyEntry!.id, file: fileToRestore }),
      },
    );
    assert.equal(dupRes.status, 409);
  });
});

describe("POST /api/admin/broadcasts/covers/sweep/restore-all per-file outcomes", () => {
  let appServer: Server;
  let appUrl: string;
  let tmpRoot: string;
  let coversDir: string;
  let prevPrivateDir: string | undefined;
  const origList = broadcastCompositorService.listBroadcastIds;

  // Three orphan covers with allowed extensions. After the apply sweep we
  // mutate the filesystem so each one exercises a distinct restore branch.
  const RESTORE_CLEAN = "bc-restore-clean.png";
  const RESTORE_DEST_EXISTS = "bc-restore-dest-exists.jpg";
  const RESTORE_TRASH_MISSING = "bc-restore-trash-missing.webp";
  const ORPHAN_FILES = [RESTORE_CLEAN, RESTORE_DEST_EXISTS, RESTORE_TRASH_MISSING];

  before(async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), "cover-sweep-restore-all-"));
    prevPrivateDir = process.env.PRIVATE_OBJECT_DIR;
    process.env.PRIVATE_OBJECT_DIR = tmpRoot;
    coversDir = pathResolve(tmpRoot, "broadcasts", "covers");
    mkdirSync(coversDir, { recursive: true });

    for (const name of ORPHAN_FILES) {
      writeFileSync(pathResolve(coversDir, name), Buffer.from("orig"));
    }

    // None of the cover IDs are known broadcasts, so all are orphans.
    (broadcastCompositorService as any).listBroadcastIds = async () => [];

    const app = express();
    app.use(express.json());
    app.use(fakeRootAdmin);
    registerBroadcastRoutes(app, (_req, _res, next) => next());
    ({ server: appServer, baseUrl: appUrl } = await listen(app));
  });

  after(async () => {
    await new Promise<void>((r) => appServer.close(() => r()));
    (broadcastCompositorService as any).listBroadcastIds = origList;
    if (prevPrivateDir === undefined) {
      delete process.env.PRIVATE_OBJECT_DIR;
    } else {
      process.env.PRIVATE_OBJECT_DIR = prevPrivateDir;
    }
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("reports restored, destination_exists, and trash_file_missing per file and writes one restore audit entry", async () => {
    // 1) Dry-run to get a confirm token, then apply to move files to trash.
    const dryRes = await fetch(`${appUrl}/api/admin/broadcasts/covers/sweep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(dryRes.status, 200);
    const dryBody = (await dryRes.json()) as { confirmToken: string; orphans: { file: string }[] };
    assert.equal(dryBody.orphans.length, ORPHAN_FILES.length);

    const applyRes = await fetch(`${appUrl}/api/admin/broadcasts/covers/sweep?apply=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmToken: dryBody.confirmToken }),
    });
    assert.equal(applyRes.status, 200);
    const applyBody = (await applyRes.json()) as { auditId: string };
    assert.ok(applyBody.auditId);

    // Look up the trashDir for this apply via the audit listing.
    const listRes = await fetch(`${appUrl}/api/admin/broadcasts/covers/sweep/audit?limit=20`);
    const listBody = (await listRes.json()) as {
      entries: { id: string; mode: string; trashDir?: string; removed: string[] }[];
    };
    const applyEntry = listBody.entries.find((e) => e.id === applyBody.auditId);
    assert.ok(applyEntry && applyEntry.trashDir, "apply audit entry with trashDir must exist");
    const trashAbs = pathResolve(coversDir, applyEntry!.trashDir!);

    // 2) Stage the three branches:
    //    - RESTORE_CLEAN: leave both src in trash and empty dest -> "restored"
    //    - RESTORE_DEST_EXISTS: re-create the destination on disk -> "destination_exists"
    //    - RESTORE_TRASH_MISSING: delete the trashed file -> "trash_file_missing"
    writeFileSync(pathResolve(coversDir, RESTORE_DEST_EXISTS), Buffer.from("blocker"));
    unlinkSync(pathResolve(trashAbs, RESTORE_TRASH_MISSING));

    // Snapshot audit line count so we can assert exactly one new "restore"
    // entry is appended below.
    const auditPath = pathResolve(tmpRoot, "audit", "broadcast-cover-sweep.jsonl");
    const beforeLines = readFileSync(auditPath, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0);

    // 3) Call bulk restore.
    const restoreRes = await fetch(
      `${appUrl}/api/admin/broadcasts/covers/sweep/restore-all`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditId: applyBody.auditId }),
      },
    );
    assert.equal(restoreRes.status, 200);
    const restoreBody = (await restoreRes.json()) as {
      ok: boolean;
      auditId: string;
      attempted: number;
      restored: number;
      results: { file: string; status: string; message?: string }[];
    };

    assert.equal(restoreBody.ok, true);
    assert.equal(restoreBody.attempted, ORPHAN_FILES.length);
    assert.equal(restoreBody.restored, 1);

    const byFile = new Map(restoreBody.results.map((r) => [r.file, r.status]));
    assert.equal(byFile.get(RESTORE_CLEAN), "restored");
    assert.equal(byFile.get(RESTORE_DEST_EXISTS), "destination_exists");
    assert.equal(byFile.get(RESTORE_TRASH_MISSING), "trash_file_missing");
    assert.equal(byFile.size, ORPHAN_FILES.length);

    // Clean restore actually put the file back; the destination-blocker is
    // untouched; the missing-trash entry stays absent from covers dir.
    assert.ok(existsSync(pathResolve(coversDir, RESTORE_CLEAN)), "clean file must be restored");
    assert.equal(
      readFileSync(pathResolve(coversDir, RESTORE_DEST_EXISTS), "utf8"),
      "blocker",
      "destination_exists must not be overwritten",
    );
    assert.equal(
      existsSync(pathResolve(coversDir, RESTORE_TRASH_MISSING)),
      false,
      "trash_file_missing must remain absent in covers dir",
    );

    // 4) Exactly one new audit line was appended, and it's a "restore"
    //    summary that points back at the apply audit id.
    const afterLines = readFileSync(auditPath, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0);
    assert.equal(afterLines.length, beforeLines.length + 1, "exactly one audit line appended");

    const newEntry = JSON.parse(afterLines[afterLines.length - 1]) as {
      id: string;
      mode: string;
      restoredFrom?: string;
      restored?: string[];
      errors: { file: string; message: string }[];
    };
    assert.equal(newEntry.mode, "restore");
    assert.equal(newEntry.id, restoreBody.auditId);
    assert.equal(newEntry.restoredFrom, applyBody.auditId);
    assert.deepEqual(newEntry.restored, [RESTORE_CLEAN]);
    const errFiles = newEntry.errors.map((e) => e.file).sort();
    assert.deepEqual(errFiles, [RESTORE_DEST_EXISTS, RESTORE_TRASH_MISSING].sort());
  });
});
