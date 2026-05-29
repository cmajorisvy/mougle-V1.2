/**
 * Task #369 — Lock in the per-archive kept/deleted counters for the
 * cover-sweep and media-sweep audit JSONLs.
 *
 * The "N kept · N deleted" breakdown shown next to each rotated archive
 * is computed by `countCoverSweepArchiveActions` /
 * `countMediaSweepArchiveActions` walking every JSONL entry. Because the
 * audit entry shape is owned by `server/routes/broadcasts.ts` and evolves
 * over time, it's easy to silently break the counter logic the next time
 * a field is renamed or a new mode is added. This test writes a fixture
 * JSONL for each surface containing every entry mode and asserts the
 * resulting counts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  countCoverSweepArchiveActions,
  countMediaSweepArchiveActions,
} from "../server/routes/broadcasts";

function writeFixture(name: string, lines: unknown[]): string {
  const dir = mkdtempSync(resolve(tmpdir(), "sweep-counter-"));
  const p = resolve(dir, name);
  writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
  return p;
}

function statKey(p: string): { mtimeMs: number; size: number } {
  const s = statSync(p);
  return { mtimeMs: s.mtimeMs, size: s.size };
}

describe("countCoverSweepArchiveActions", () => {
  it("counts dry_run as kept, apply as deleted+kept-remainder, ignores restore", () => {
    const p = writeFixture("cover.jsonl", [
      // dry_run: 3 orphans flagged, none deleted → 3 kept
      {
        id: "a",
        ts: "2026-01-01T00:00:00.000Z",
        actorId: "root",
        mode: "dry_run",
        dir: "/x",
        orphans: [
          { file: "1.png", id: "1", ext: "png" },
          { file: "2.png", id: "2", ext: "png" },
          { file: "3.png", id: "3", ext: "png" },
        ],
        removed: [],
        errors: [],
      },
      // apply: 4 orphans, 3 removed → 3 deleted + 1 kept
      {
        id: "b",
        ts: "2026-01-01T00:01:00.000Z",
        actorId: "root",
        mode: "apply",
        dir: "/x",
        orphans: [
          { file: "4.png", id: "4", ext: "png" },
          { file: "5.png", id: "5", ext: "png" },
          { file: "6.png", id: "6", ext: "png" },
          { file: "7.png", id: "7", ext: "png" },
        ],
        removed: ["4.png", "5.png", "6.png"],
        errors: [{ file: "7.png", message: "EACCES" }],
        trashDir: ".trash/b",
      },
      // restore: contributes to neither
      {
        id: "c",
        ts: "2026-01-01T00:02:00.000Z",
        actorId: "root",
        mode: "restore",
        dir: "/x",
        orphans: [],
        removed: [],
        errors: [],
        restoredFrom: "b",
        restored: ["4.png", "5.png", "6.png"],
      },
    ]);
    const { mtimeMs, size } = statKey(p);
    const r = countCoverSweepArchiveActions(p, mtimeMs, size);
    assert.deepEqual(r, { keptCount: 4, deletedCount: 3 });
  });

  it("returns zeros for a missing file", () => {
    const r = countCoverSweepArchiveActions(
      resolve(tmpdir(), "definitely-not-here.jsonl"),
      0,
      0,
    );
    assert.deepEqual(r, { keptCount: 0, deletedCount: 0 });
  });

  it("skips malformed lines without throwing", () => {
    const p = writeFixture("cover-bad.jsonl", []);
    // Overwrite with a mix of bad + good lines.
    writeFileSync(
      p,
      [
        "not-json",
        JSON.stringify({
          id: "ok",
          ts: "2026-01-01T00:00:00.000Z",
          actorId: "root",
          mode: "apply",
          dir: "/x",
          orphans: [{ file: "a.png", id: "a", ext: "png" }],
          removed: ["a.png"],
          errors: [],
        }),
        "",
      ].join("\n"),
      "utf8",
    );
    const { mtimeMs, size } = statKey(p);
    const r = countCoverSweepArchiveActions(p, mtimeMs, size);
    assert.deepEqual(r, { keptCount: 0, deletedCount: 1 });
  });
});

describe("countMediaSweepArchiveActions", () => {
  it("counts orphanCount − removed as kept and removed as deleted", () => {
    const p = writeFixture("media.jsonl", [
      // 5 orphans, 4 removed → 4 deleted + 1 kept
      {
        id: "a",
        ts: "2026-01-01T00:00:00.000Z",
        actorId: "root",
        mode: "apply",
        orphanCount: 5,
        removed: 4,
        bytesRemoved: 100,
        orphans: [],
      },
      // 2 orphans, 2 removed → 2 deleted + 0 kept
      {
        id: "b",
        ts: "2026-01-01T00:01:00.000Z",
        actorId: "root",
        mode: "apply",
        orphanCount: 2,
        removed: 2,
        bytesRemoved: 50,
        orphans: [],
      },
      // 3 orphans, 0 removed → 0 deleted + 3 kept
      {
        id: "c",
        ts: "2026-01-01T00:02:00.000Z",
        actorId: "root",
        mode: "apply",
        orphanCount: 3,
        removed: 0,
        bytesRemoved: 0,
        orphans: [],
      },
    ]);
    const { mtimeMs, size } = statKey(p);
    const r = countMediaSweepArchiveActions(p, mtimeMs, size);
    assert.deepEqual(r, { keptCount: 4, deletedCount: 6 });
  });

  it("clamps kept at zero when removed exceeds orphanCount", () => {
    const p = writeFixture("media-clamp.jsonl", [
      {
        id: "a",
        ts: "2026-01-01T00:00:00.000Z",
        actorId: "root",
        mode: "apply",
        orphanCount: 1,
        removed: 3,
        bytesRemoved: 0,
        orphans: [],
      },
    ]);
    const { mtimeMs, size } = statKey(p);
    const r = countMediaSweepArchiveActions(p, mtimeMs, size);
    assert.deepEqual(r, { keptCount: 0, deletedCount: 3 });
  });

  it("treats missing numeric fields as zero and skips malformed lines", () => {
    const p = writeFixture("media-missing.jsonl", []);
    writeFileSync(
      p,
      [
        "{not json",
        JSON.stringify({ id: "x", mode: "apply" }),
        JSON.stringify({
          id: "y",
          mode: "apply",
          orphanCount: 2,
          removed: 1,
        }),
      ].join("\n"),
      "utf8",
    );
    const { mtimeMs, size } = statKey(p);
    const r = countMediaSweepArchiveActions(p, mtimeMs, size);
    assert.deepEqual(r, { keptCount: 1, deletedCount: 1 });
  });

  it("returns zeros for a missing file", () => {
    const r = countMediaSweepArchiveActions(
      resolve(tmpdir(), "definitely-not-here-media.jsonl"),
      0,
      0,
    );
    assert.deepEqual(r, { keptCount: 0, deletedCount: 0 });
  });
});
