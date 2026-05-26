/**
 * Worker-token auth middleware.
 *
 * Guards the `/api/worker/ai-jobs/*` endpoints used by the Python worker
 * layer. This is intentionally NOT session-based and grants ONLY the ability
 * to poll, lock, and submit results for AI jobs — it does NOT confer general
 * admin privileges.
 *
 * Fail-closed: if `MOUGLE_WORKER_TOKEN` is not configured on the server, every
 * worker request is rejected with 503 so a misconfigured deployment cannot
 * accidentally allow unauthenticated workers in.
 */

import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";

export interface WorkerContext {
  workerId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      worker?: WorkerContext;
    }
  }
}

const WORKER_ID_RE = /^[A-Za-z0-9_.:\-]{3,128}$/;

export function isValidWorkerId(v: unknown): v is string {
  return typeof v === "string" && WORKER_ID_RE.test(v);
}

function extractBearer(req: Request): string | null {
  const raw = req.headers.authorization ?? req.headers.Authorization;
  if (!raw || typeof raw !== "string") return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function requireWorkerToken(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.MOUGLE_WORKER_TOKEN;
  if (!expected || expected.length < 16) {
    res.status(503).json({
      message:
        "Worker bridge is not configured. Set MOUGLE_WORKER_TOKEN (>= 16 chars) on the server to enable Python workers.",
      code: "WORKER_TOKEN_NOT_CONFIGURED",
    });
    return;
  }
  const presented = extractBearer(req);
  if (!presented) {
    res.status(401).json({ message: "Missing worker token", code: "WORKER_TOKEN_MISSING" });
    return;
  }
  if (!constantTimeEquals(presented, expected)) {
    res.status(403).json({ message: "Invalid worker token", code: "WORKER_TOKEN_INVALID" });
    return;
  }
  // Identity check: every worker request must announce itself via
  // X-Worker-Id. The header value is the canonical id and is used
  // for ai_jobs.locked_by, ai_workers.worker_id, and
  // ai_job_events.actor_worker_id. The header is the only trusted
  // source — body workerId fields are checked for *consistency*
  // (rejected on mismatch) but never preferred over the header.
  const rawHeader = req.headers["x-worker-id"];
  const headerWorkerId = typeof rawHeader === "string" ? rawHeader.trim() : "";
  if (!headerWorkerId) {
    res.status(400).json({ message: "Missing X-Worker-Id header", code: "WORKER_ID_MISSING" });
    return;
  }
  if (!isValidWorkerId(headerWorkerId)) {
    res.status(400).json({
      message: "Invalid X-Worker-Id (3–128 chars; letters, digits, _ - . :)",
      code: "WORKER_ID_INVALID",
    });
    return;
  }
  const bodyWorkerIdRaw = (req.body && typeof req.body === "object")
    ? (req.body as Record<string, unknown>).workerId
    : undefined;
  if (bodyWorkerIdRaw !== undefined && bodyWorkerIdRaw !== null && bodyWorkerIdRaw !== "") {
    if (typeof bodyWorkerIdRaw !== "string" || bodyWorkerIdRaw.trim() !== headerWorkerId) {
      res.status(400).json({
        message: "Body workerId does not match X-Worker-Id header",
        code: "WORKER_ID_MISMATCH",
      });
      return;
    }
  }
  req.worker = { workerId: headerWorkerId };
  next();
}
