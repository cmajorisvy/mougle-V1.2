/**
 * Task #406 — HTTP-level test for the audience archive browse & download routes.
 *
 * Boots a minimal Express app, registers the real omni-channel audience
 * routes with a stub `requireRootAdmin`, and replaces the audience archive
 * reader with an in-memory fake so the routes are exercised end-to-end
 * without object storage configured.
 *
 * Verifies:
 *  - GET .../retention/archive/files lists every fake file with table
 *    metadata, sorted newest-first.
 *  - `table=` filter restricts the result to that audit table.
 *  - Pagination splits results across pages with a stable total.
 *  - GET .../retention/archive/download streams gzipped bytes with
 *    Content-Disposition.
 *  - 400 on a path outside `audience-archive/` and on `..` traversal.
 *  - 404 when the requested archive file does not exist.
 *  - Alias mount under /api/admin/omni-channel-audience works.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import express from "express";

import { registerOmniChannelAudienceRoutes } from "../server/routes/omni-channel-audience-routes";
import {
  resetAudienceArchiveReader,
  setAudienceArchiveReader,
  type AudienceArchiveListing,
} from "../server/services/audience-retention-service";

const PAYLOAD_BY_PATH: Record<string, Buffer> = {};

function makeFile(
  table: "messages" | "decisions" | "commands",
  stamp: string,
  rowCount: number,
): AudienceArchiveListing {
  const path = `/test-bucket/audience-archive/${table}/${stamp}.jsonl.gz`;
  const buf = gzipSync(Buffer.from(`{"table":"${table}","rowCount":${rowCount}}\n`));
  PAYLOAD_BY_PATH[path] = buf;
  return {
    table,
    path,
    bytes: buf.byteLength,
    rowCount,
    updatedAt: stamp,
    sweepStartedAt: stamp,
    cutoffIso: stamp,
  };
}

const FAKE_FILES: AudienceArchiveListing[] = [
  makeFile("messages", "2026-05-01T00:00:00.000Z", 3),
  makeFile("messages", "2026-05-10T00:00:00.000Z", 5),
  makeFile("decisions", "2026-05-05T00:00:00.000Z", 7),
  makeFile("commands", "2026-05-12T00:00:00.000Z", 2),
];

let server: Server;
let baseUrl: string;

before(async () => {
  setAudienceArchiveReader({
    async list() {
      return [...FAKE_FILES];
    },
    async openStream(path: string) {
      const buf = PAYLOAD_BY_PATH[path];
      if (!buf) throw new Error("not_found");
      return {
        stream: Readable.from(buf),
        bytes: buf.byteLength,
        contentType: "application/gzip",
        filename: path.split("/").pop() ?? "archive.jsonl.gz",
      };
    },
    async delete(_path: string) {
      // not exercised by this test file
    },
  });

  const app = express();
  const stubRequireRootAdmin: express.RequestHandler = (_req, _res, next) => next();
  registerOmniChannelAudienceRoutes(app, stubRequireRootAdmin);
  server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  resetAudienceArchiveReader();
  await new Promise<void>((r) => server.close(() => r()));
});

test("GET retention/archive/files lists every file newest-first", async () => {
  const r = await fetch(`${baseUrl}/api/admin/newsroom/audience/retention/archive/files`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.total, FAKE_FILES.length);
  assert.equal(body.files.length, FAKE_FILES.length);
  // Newest first by updatedAt
  const stamps = body.files.map((f: any) => f.updatedAt);
  const sorted = [...stamps].sort().reverse();
  assert.deepEqual(stamps, sorted);
  const first = body.files[0];
  assert.ok(first.path.includes("/audience-archive/"));
  assert.ok(["messages", "decisions", "commands"].includes(first.table));
  assert.ok(typeof first.bytes === "number" && first.bytes > 0);
});

test("table filter restricts to a single audit table", async () => {
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/files?table=messages`,
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.total, 2);
  for (const f of body.files) assert.equal(f.table, "messages");
});

test("pagination returns one item per page with stable total", async () => {
  const r1 = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/files?page=1&pageSize=1`,
  );
  const b1 = await r1.json();
  assert.equal(b1.total, FAKE_FILES.length);
  assert.equal(b1.files.length, 1);
  const r2 = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/files?page=2&pageSize=1`,
  );
  const b2 = await r2.json();
  assert.equal(b2.total, FAKE_FILES.length);
  assert.equal(b2.files.length, 1);
  assert.notEqual(b1.files[0].path, b2.files[0].path);
});

test("download streams the gzipped payload with attachment headers", async () => {
  const target = FAKE_FILES[0];
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/download?path=${encodeURIComponent(target.path)}`,
  );
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /application\/gzip/);
  const cd = r.headers.get("content-disposition") ?? "";
  assert.match(cd, /^attachment; filename=".+\.jsonl\.gz"$/);
  assert.equal(r.headers.get("x-audit-export"), "audience-archive");
  const buf = Buffer.from(await r.arrayBuffer());
  assert.deepEqual(buf, PAYLOAD_BY_PATH[target.path]);
});

test("download rejects paths outside audience-archive/", async () => {
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/download?path=${encodeURIComponent("/test-bucket/something/else.gz")}`,
  );
  assert.equal(r.status, 400);
});

test("download rejects path traversal attempts", async () => {
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/download?path=${encodeURIComponent("/test-bucket/audience-archive/../secrets.gz")}`,
  );
  assert.equal(r.status, 400);
});

test("download returns 404 when the archive file is not found", async () => {
  const missing = "/test-bucket/audience-archive/messages/does-not-exist.jsonl.gz";
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/download?path=${encodeURIComponent(missing)}`,
  );
  assert.equal(r.status, 404);
  const body = await r.json();
  assert.equal(body.message, "not_found");
});

test("preview returns the first N decompressed rows with metadata", async () => {
  // Stash a multi-line jsonl.gz under a known path on the shared in-memory
  // reader so the existing list-based tests still see FAKE_FILES intact.
  const lines = Array.from({ length: 10 }, (_, i) =>
    JSON.stringify({ idx: i, hello: `world-${i}` }),
  ).join("\n");
  const buf = gzipSync(Buffer.from(lines + "\n"));
  const path = "/test-bucket/audience-archive/messages/preview-test.jsonl.gz";
  PAYLOAD_BY_PATH[path] = buf;

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/preview?path=${encodeURIComponent(path)}&limit=3`,
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.path, path);
  assert.equal(body.filename, "preview-test.jsonl.gz");
  assert.equal(body.maxRows, 3);
  assert.equal(body.rows.length, 3);
  assert.equal(body.truncated, true);
  assert.equal(body.parseErrors, 0);
  assert.deepEqual(body.rows[0], { idx: 0, hello: "world-0" });

  // Limit larger than file → not truncated
  const r2 = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/preview?path=${encodeURIComponent(path)}&limit=50`,
  );
  const b2 = await r2.json();
  assert.equal(b2.rows.length, 10);
  assert.equal(b2.truncated, false);
});

test("preview rejects paths outside audience-archive/ and traversal", async () => {
  const r1 = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/preview?path=${encodeURIComponent("/test-bucket/something/else.gz")}`,
  );
  assert.equal(r1.status, 400);
  const r2 = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/preview?path=${encodeURIComponent("/test-bucket/audience-archive/../secret.gz")}`,
  );
  assert.equal(r2.status, 400);
});

test("preview surfaces totalRows when the file is fully decoded in one call", async () => {
  const lines = Array.from({ length: 4 }, (_, i) =>
    JSON.stringify({ idx: i }),
  ).join("\n");
  const buf = gzipSync(Buffer.from(lines + "\n"));
  const path = "/test-bucket/audience-archive/messages/totalrows-test.jsonl.gz";
  PAYLOAD_BY_PATH[path] = buf;

  const truncated = await (
    await fetch(
      `${baseUrl}/api/admin/newsroom/audience/retention/archive/preview?path=${encodeURIComponent(path)}&limit=2`,
    )
  ).json();
  assert.equal(truncated.truncated, true);
  assert.equal(truncated.totalRows, null);

  const full = await (
    await fetch(
      `${baseUrl}/api/admin/newsroom/audience/retention/archive/preview?path=${encodeURIComponent(path)}&limit=50`,
    )
  ).json();
  assert.equal(full.truncated, false);
  assert.equal(full.totalRows, 4);
});

test("count endpoint streams the gzip once and returns the total row count", async () => {
  const lines = Array.from({ length: 17 }, (_, i) =>
    JSON.stringify({ n: i }),
  ).join("\n");
  const buf = gzipSync(Buffer.from(lines + "\n"));
  const path = "/test-bucket/audience-archive/decisions/count-test.jsonl.gz";
  PAYLOAD_BY_PATH[path] = buf;

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/count?path=${encodeURIComponent(path)}`,
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.path, path);
  assert.equal(body.rowCount, 17);
  assert.equal(body.parseErrors, 0);
});

test("count rejects bad paths and reports not_found", async () => {
  const bad = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/count?path=${encodeURIComponent("/test-bucket/something/else.gz")}`,
  );
  assert.equal(bad.status, 400);

  const traversal = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/count?path=${encodeURIComponent("/test-bucket/audience-archive/../secret.gz")}`,
  );
  assert.equal(traversal.status, 400);

  const missing = "/test-bucket/audience-archive/messages/does-not-exist.jsonl.gz";
  const nf = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/count?path=${encodeURIComponent(missing)}`,
  );
  assert.equal(nf.status, 404);
});

test("preview with ?q= scans the whole file and returns only matches with original line numbers", async () => {
  // Build a 60-row archive where only some rows mention the target needle.
  const lines: string[] = [];
  for (let i = 0; i < 60; i++) {
    if (i === 7 || i === 23 || i === 55) {
      lines.push(JSON.stringify({ idx: i, author: "needle-target", note: `match-${i}` }));
    } else {
      lines.push(JSON.stringify({ idx: i, author: "someone-else", note: `noise-${i}` }));
    }
  }
  const buf = gzipSync(Buffer.from(lines.join("\n") + "\n"));
  const path = "/test-bucket/audience-archive/messages/search-test.jsonl.gz";
  PAYLOAD_BY_PATH[path] = buf;

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/preview?path=${encodeURIComponent(path)}&limit=50&q=needle-target`,
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.query, "needle-target");
  assert.equal(body.totalMatches, 3);
  assert.equal(body.totalScanned, 60);
  assert.equal(body.rows.length, 3);
  assert.equal(body.truncated, false);
  assert.deepEqual(body.rowLineNumbers, [8, 24, 56]);
  // First match has the right contents
  assert.equal(body.rows[0].idx, 7);
  assert.equal(body.rows[0].author, "needle-target");
});

test("preview search caps returned rows at limit but reports full match count", async () => {
  // Build 20 rows that all match a needle so we can force truncation with a low limit.
  const lines = Array.from({ length: 20 }, (_, i) =>
    JSON.stringify({ idx: i, author: "match-everywhere" }),
  ).join("\n");
  const buf = gzipSync(Buffer.from(lines + "\n"));
  const path = "/test-bucket/audience-archive/messages/search-truncate.jsonl.gz";
  PAYLOAD_BY_PATH[path] = buf;

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/preview?path=${encodeURIComponent(path)}&limit=5&q=match-everywhere`,
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.totalMatches, 20);
  assert.equal(body.rows.length, 5);
  assert.equal(body.truncated, true);
  assert.equal(body.rowLineNumbers.length, 5);
});

test("preview with ?q= that matches nothing returns zero matches but still scans the file", async () => {
  const lines = Array.from({ length: 4 }, (_, i) => JSON.stringify({ idx: i })).join("\n");
  const buf = gzipSync(Buffer.from(lines + "\n"));
  const path = "/test-bucket/audience-archive/messages/search-empty.jsonl.gz";
  PAYLOAD_BY_PATH[path] = buf;

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/preview?path=${encodeURIComponent(path)}&limit=10&q=__nothing_will_match__`,
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.totalMatches, 0);
  assert.equal(body.totalScanned, 4);
  assert.equal(body.rows.length, 0);
  assert.equal(body.truncated, false);
});

test("preview returns 404 when the archive file is not found", async () => {
  const missing = "/test-bucket/audience-archive/messages/does-not-exist.jsonl.gz";
  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/preview?path=${encodeURIComponent(missing)}`,
  );
  assert.equal(r.status, 404);
});

test("search-export.csv streams every match as a CSV row with the original line number", async () => {
  const lines: string[] = [];
  for (let i = 0; i < 30; i++) {
    if (i === 3 || i === 11 || i === 27) {
      lines.push(JSON.stringify({ idx: i, author: "regulator-needle", note: `hit-${i}` }));
    } else {
      lines.push(JSON.stringify({ idx: i, author: "noise", note: `n-${i}` }));
    }
  }
  const buf = gzipSync(Buffer.from(lines.join("\n") + "\n"));
  const path = "/test-bucket/audience-archive/messages/search-export-test.jsonl.gz";
  PAYLOAD_BY_PATH[path] = buf;

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/search-export.csv?path=${encodeURIComponent(path)}&q=regulator-needle`,
  );
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /text\/csv/);
  assert.match(r.headers.get("content-disposition") ?? "", /^attachment; filename=".+-matches\.csv"$/);
  assert.equal(r.headers.get("x-audit-export"), "audience-archive-search");
  const text = await r.text();
  const rows = text.trim().split("\n");
  assert.equal(rows[0], "line_number,payload");
  assert.equal(rows.length, 4);
  assert.ok(rows[1].startsWith("4,"));
  assert.ok(rows[2].startsWith("12,"));
  assert.ok(rows[3].startsWith("28,"));
  // Payload column is RFC-4180-quoted and contains the original JSON.
  assert.ok(rows[1].includes("regulator-needle"));
  assert.ok(rows[1].includes('""idx"":3'));
});

test("search-export.csv with no matches still returns a header-only CSV", async () => {
  const lines = Array.from({ length: 4 }, (_, i) => JSON.stringify({ idx: i })).join("\n");
  const buf = gzipSync(Buffer.from(lines + "\n"));
  const path = "/test-bucket/audience-archive/messages/search-export-empty.jsonl.gz";
  PAYLOAD_BY_PATH[path] = buf;

  const r = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/search-export.csv?path=${encodeURIComponent(path)}&q=__nothing__`,
  );
  assert.equal(r.status, 200);
  const text = await r.text();
  assert.equal(text.trim(), "line_number,payload");
});

test("search-export.csv rejects bad paths, missing query, and missing files", async () => {
  const bad = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/search-export.csv?path=${encodeURIComponent("/test-bucket/something/else.gz")}&q=x`,
  );
  assert.equal(bad.status, 400);

  const noQuery = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/search-export.csv?path=${encodeURIComponent("/test-bucket/audience-archive/messages/x.gz")}`,
  );
  assert.equal(noQuery.status, 400);

  const missing = "/test-bucket/audience-archive/messages/does-not-exist.jsonl.gz";
  const nf = await fetch(
    `${baseUrl}/api/admin/newsroom/audience/retention/archive/search-export.csv?path=${encodeURIComponent(missing)}&q=x`,
  );
  assert.equal(nf.status, 404);
});

test("alias mount /api/admin/omni-channel-audience also lists archive files", async () => {
  const r = await fetch(
    `${baseUrl}/api/admin/omni-channel-audience/retention/archive/files`,
  );
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.total, FAKE_FILES.length);
});
