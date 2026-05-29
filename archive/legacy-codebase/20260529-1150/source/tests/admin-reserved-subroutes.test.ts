/**
 * Task #335 — Generalized structural guard for `/api/admin/<area>/:id`
 * route collisions across the *entire* `server/routes/` surface, not
 * just `broadcasts.ts`.
 *
 * Background
 * ----------
 * Task #322 fixed (and Task #327 froze) a recurring class of bug in
 * `server/routes/broadcasts.ts`: a generic `app.<verb>("/api/admin/
 * broadcasts/:id", ...)` handler registered before its more specific
 * sibling sub-routes (e.g. `/render`, `/approvals`, `/saved-views`,
 * `/fallback-default-preset`) silently swallowed those sibling routes —
 * because Express dispatches in registration order and `:id` happily
 * matches a literal first segment like `"saved-views"`. The cure was
 * `RESERVED_BROADCAST_SUBROUTE_NAMES`: the `:id` handlers consult that
 * set and call `next()` when the param matches a reserved name, so the
 * later, more specific route still fires.
 *
 * The exact same bug class can recur under any other admin route file
 * that mixes a parametric `:id`-style handler with literal sibling
 * sub-routes registered later. This test walks every `server/routes/
 * *.ts` file, parses route registrations in source order, and flags
 * every (param, literal) collision where the literal sibling under
 * `/api/admin/<area>/<literal>` is registered **after** a same-verb
 * `/api/admin/<area>/:<param>` handler. For each collision found the
 * file must:
 *
 *   1. Mention the literal name as a quoted string somewhere in the
 *      file (typically inside an exported `RESERVED_*_SUBROUTE_NAMES`
 *      set, mirroring the broadcasts pattern), AND
 *   2. Have the offending param handler body call `next()` so it can
 *      forward the request to the later, more specific route.
 *
 * Either reordering the routes (literal before `:param`) or applying
 * the broadcasts-style reserved-set guard satisfies the test. Adding a
 * new sibling sub-route in any admin route file without the matching
 * reservation fails CI with a clear message naming the file, verb,
 * area, and missing literal segment(s).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTES_DIR = resolve(process.cwd(), "server/routes");
const ADMIN_PREFIX_RE = /^\/api\/admin\/([^/]+)\/(.+)$/;

// Match `app.<verb>(` followed (possibly across whitespace/newlines) by
// a string literal whose contents start with `/api/admin/`. We capture
// the verb and the path string. The middleware/handler arguments are
// irrelevant here.
const ROUTE_REGEX =
  /\bapp\.(get|post|put|patch|delete|options|head|all)\s*\(\s*"([^"]+)"/g;

type Registration = {
  verb: string;
  path: string;
  area: string;
  /** First segment after `/api/admin/<area>/`. May be `:param` or a literal. */
  firstSubSegment: string;
  /** True when the path is exactly `/api/admin/<area>/:<param>` (single segment, parametric). */
  isSingleSegmentParam: boolean;
  /** True when the path is exactly `/api/admin/<area>/<literal>` (single segment, literal). */
  isSingleSegmentLiteral: boolean;
  /** Character offset of the `app.<verb>(` token in the file. */
  startOffset: number;
  /** 1-based line number of the registration. */
  line: number;
};

function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

function parseAdminRegistrations(source: string): Registration[] {
  const regs: Registration[] = [];
  for (const match of source.matchAll(ROUTE_REGEX)) {
    const verb = match[1];
    const path = match[2];
    const m = path.match(ADMIN_PREFIX_RE);
    if (!m) continue;
    const area = m[1];
    const remainder = m[2];
    const segments = remainder.split("/");
    const first = segments[0];
    const isSingleSegment = segments.length === 1 && first.length > 0;
    const isParam = first.startsWith(":");
    regs.push({
      verb,
      path,
      area,
      firstSubSegment: first,
      isSingleSegmentParam: isSingleSegment && isParam,
      isSingleSegmentLiteral: isSingleSegment && !isParam,
      startOffset: match.index ?? 0,
      line: lineOf(source, match.index ?? 0),
    });
  }
  return regs;
}

/**
 * Best-effort extraction of the handler-arrow-function body for a given
 * route registration. We walk from `startOffset` forward, find the
 * opening `{` of the first arrow-function body, and brace-match to its
 * close. We intentionally skip strings and line/block comments so a `{`
 * inside `"this { is fine }"` does not throw off the count. This is a
 * heuristic — good enough for our handlers, which are plain functions.
 */
function extractHandlerBody(source: string, startOffset: number): string {
  // Find the first `{` after `=>` following startOffset. Fall back to
  // the first `{` after startOffset if no arrow is present.
  const arrowIdx = source.indexOf("=>", startOffset);
  const scanFrom = arrowIdx >= 0 ? arrowIdx : startOffset;
  const openIdx = source.indexOf("{", scanFrom);
  if (openIdx < 0) return "";

  let depth = 0;
  let i = openIdx;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inSingle) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === "'") inSingle = false;
      i++;
      continue;
    }
    if (inDouble) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === '"') inDouble = false;
      i++;
      continue;
    }
    if (inTemplate) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === "`") inTemplate = false;
      i++;
      continue;
    }
    if (ch === "/" && next === "/") { inLineComment = true; i += 2; continue; }
    if (ch === "/" && next === "*") { inBlockComment = true; i += 2; continue; }
    if (ch === "'") { inSingle = true; i++; continue; }
    if (ch === '"') { inDouble = true; i++; continue; }
    if (ch === "`") { inTemplate = true; i++; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return source.slice(openIdx, i + 1);
      }
    }
    i++;
  }
  return source.slice(openIdx);
}

type Collision = {
  file: string;
  area: string;
  verb: string;
  literal: string;
  paramLine: number;
  literalLine: number;
};

type CollisionFinding = Collision & {
  missingReservation: boolean;
  missingNextForward: boolean;
};

function analyzeFile(filePath: string, fileLabel: string): CollisionFinding[] {
  const source = readFileSync(filePath, "utf8");
  const regs = parseAdminRegistrations(source);
  const findings: CollisionFinding[] = [];

  for (let i = 0; i < regs.length; i++) {
    const p = regs[i];
    if (!p.isSingleSegmentParam) continue;

    // Look at every later registration in the same file for a
    // colliding sibling.
    for (let j = i + 1; j < regs.length; j++) {
      const l = regs[j];
      if (l.area !== p.area) continue;
      if (l.verb !== p.verb) continue; // Express dispatches per-verb.
      if (!l.isSingleSegmentLiteral) continue;

      const literal = l.firstSubSegment;
      const handlerBody = extractHandlerBody(source, p.startOffset);

      // (1) Literal must be mentioned as a quoted string somewhere in
      // the file (typically inside an exported reserved-set).
      const quotedLiteralRe = new RegExp(
        `["']${literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
      );
      const missingReservation = !quotedLiteralRe.test(source);

      // (2) Param handler body must call `next()` so it can forward to
      // the later, more specific route.
      const missingNextForward = !/\bnext\s*\(\s*\)/.test(handlerBody);

      findings.push({
        file: fileLabel,
        area: p.area,
        verb: p.verb,
        literal,
        paramLine: p.line,
        literalLine: l.line,
        missingReservation,
        missingNextForward,
      });
    }
  }
  return findings;
}

function describeFinding(f: CollisionFinding): string {
  const reasons: string[] = [];
  if (f.missingReservation) {
    reasons.push(
      `literal "${f.literal}" is not mentioned as a quoted string ` +
        `anywhere in ${f.file} (e.g. inside a RESERVED_*_SUBROUTE_NAMES set)`,
    );
  }
  if (f.missingNextForward) {
    reasons.push(
      `the :param handler at ${f.file}:${f.paramLine} does not call ` +
        `next(), so it cannot forward to the literal sibling`,
    );
  }
  return (
    `[${f.file}] ${f.verb.toUpperCase()} /api/admin/${f.area}/:<param> ` +
    `(line ${f.paramLine}) is registered before the same-verb literal ` +
    `sibling /api/admin/${f.area}/${f.literal} (line ${f.literalLine}). ` +
    `Without a guard the :<param> handler will swallow the sibling ` +
    `and either 5xx or mutate the wrong row. ` +
    reasons.join("; ") +
    `. Fix by either (a) registering the literal route BEFORE the ` +
    `:<param> handler, or (b) adding the broadcasts-style reserved-set ` +
    `guard (see server/routes/broadcasts.ts and ` +
    `tests/broadcast-reserved-subroutes.test.ts for the reference ` +
    `implementation).`
  );
}

describe("admin route collision guard (generalized)", () => {
  const files = readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith(".ts"))
    .sort();

  it("scans every server/routes/*.ts file (sanity check)", () => {
    assert.ok(files.length > 0, "no route files discovered under server/routes/");
    assert.ok(
      files.includes("broadcasts.ts"),
      "expected broadcasts.ts to be present — the reference implementation",
    );
  });

  it("broadcasts.ts already has the reserved-set guard (regression anchor)", () => {
    // This is the file the bug was originally fixed in. If our analyzer
    // reports it as broken, the analyzer itself is broken (false
    // positive) — fail loudly rather than letting the rest of the test
    // pass quietly.
    const findings = analyzeFile(
      resolve(ROUTES_DIR, "broadcasts.ts"),
      "server/routes/broadcasts.ts",
    );
    const broken = findings.filter(
      (f) => f.missingReservation || f.missingNextForward,
    );
    assert.deepEqual(
      broken,
      [],
      `broadcasts.ts unexpectedly flagged as missing its reserved-set ` +
        `guard — the analyzer in this test is likely out of date:\n` +
        broken.map(describeFinding).join("\n\n"),
    );
  });

  it("no admin route file has an unguarded /:param vs sibling-literal collision", () => {
    const allFindings: CollisionFinding[] = [];
    for (const file of files) {
      const fullPath = resolve(ROUTES_DIR, file);
      const fileLabel = `server/routes/${file}`;
      allFindings.push(...analyzeFile(fullPath, fileLabel));
    }
    const unguarded = allFindings.filter(
      (f) => f.missingReservation || f.missingNextForward,
    );
    assert.deepEqual(
      unguarded,
      [],
      `Found ${unguarded.length} unguarded admin route collision(s):\n\n` +
        unguarded.map(describeFinding).join("\n\n"),
    );
  });
});
