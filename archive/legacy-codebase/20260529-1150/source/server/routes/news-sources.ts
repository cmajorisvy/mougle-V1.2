/**
 * Newsroom T2 — Global Source Registry routes.
 *
 * SAFETY:
 *   - Admin CRUD requires root admin (`requireRootAdmin`).
 *   - CSRF is enforced globally on `/api/*` via `csrfMiddleware`.
 *   - Public projection (`/api/news-sources/public`) only returns
 *     `licenseStatus !== 'unknown'` and `enabled = true` rows, with no
 *     private notes or admin-only fields.
 *   - Any save that would land an `enabled: true` row in the registry must
 *     pass a fresh full feed test (URL validation, public-host check, fetch,
 *     parse, ≥1 item). Failed feeds may only be saved as `enabled: false`
 *     (draft). Stored failure metadata never includes raw network error text.
 */

import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { storage } from "../storage";
import {
  insertNewsSourceSchema,
  NEWS_SOURCE_LICENSE_STATUSES,
  NEWS_SOURCE_TYPES,
} from "@shared/schema";
import { publicProjection } from "../services/news-source-registry";
import { newsSourceHealthService } from "../services/news-source-health";
import { runFeedTest, feedTestMessage, type FeedTestResult } from "../services/feed-test";

const createBodySchema = insertNewsSourceSchema;
const updateBodySchema = insertNewsSourceSchema.partial().extend({
  type: z.enum(NEWS_SOURCE_TYPES).optional(),
  licenseStatus: z.enum(NEWS_SOURCE_LICENSE_STATUSES).optional(),
});

// The shared `insertNewsSourceSchema` uses `.omit(... as any)` which collapses
// its inferred output type to `{}` for downstream callers. Re-declare the
// shape we actually use here so the rest of the file is properly typed without
// touching the shared schema or its drizzle plumbing.
type CreateBody = {
  name: string;
  url: string;
  type: string;
  country: string;
  language: string;
  reliabilityScore: number;
  licenseStatus: string;
  tier: string;
  enabled?: boolean;
  notes?: string | null;
};
type UpdateBody = Partial<CreateBody>;

function feedTestFailedResponse(result: FeedTestResult) {
  return {
    ok: false as const,
    error: "feed_test_failed" as const,
    reason: result.reason,
    statusCode: result.statusCode,
    testedAt: result.testedAt,
    itemCount: result.itemCount,
    message: result.reason ? feedTestMessage(result.reason) : "Feed test failed.",
  };
}

async function persistTestResult(id: string, result: FeedTestResult): Promise<void> {
  try {
    await storage.recordNewsSourceHealthCheck(id, {
      status: result.ok ? "ok" : result.reason === "empty_feed" ? "warning" : "error",
      httpStatus: result.statusCode ?? null,
      itemCount: result.itemCount ?? null,
      errorMessage: result.ok ? null : feedTestMessage(result.reason ?? "unknown"),
      incrementFailure: !result.ok,
      resetFailure: result.ok,
    });
  } catch (err) {
    console.error("[news-sources] failed to persist test result", (err as Error).message);
  }
}

export function registerNewsSourceRoutes(
  app: Express,
  requireRootAdmin: RequestHandler,
): void {
  app.get("/api/admin/news-sources", requireRootAdmin, async (_req, res) => {
    try {
      const rows = await storage.listNewsSources();
      const active = rows.filter((r) => r.enabled && r.licenseStatus !== "unknown").length;
      res.json({
        ok: true,
        count: rows.length,
        activeCount: active,
        sources: rows,
      });
    } catch (err) {
      console.error("[admin/news-sources:list] failed", err);
      res.status(500).json({ ok: false, message: "list failed" });
    }
  });

  app.post("/api/admin/news-sources/preview", requireRootAdmin, async (req, res) => {
    const rawUrl = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    if (!rawUrl) {
      return res.status(400).json({
        ok: false,
        error: "missing_url",
        message: "Provide a feed URL to test.",
      });
    }
    const result = await runFeedTest(rawUrl);
    if (result.ok) {
      return res.json({
        ok: true,
        status: result.statusCode,
        itemCount: result.itemCount,
        sampleTitle: result.sampleTitle,
        testedAt: result.testedAt,
      });
    }
    return res.json({
      ok: false,
      status: result.statusCode,
      itemCount: result.itemCount,
      error: result.reason,
      reason: result.reason,
      testedAt: result.testedAt,
      message: feedTestMessage(result.reason ?? "unknown"),
    });
  });

  app.post("/api/admin/news-sources", requireRootAdmin, async (req, res) => {
    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    }
    const data = parsed.data as CreateBody;
    try {
      const existing = await storage.getNewsSourceByUrl(data.url);
      if (existing) {
        return res.status(409).json({ ok: false, error: "duplicate_url", id: existing.id });
      }
      // Enforce a full feed test before any enabled row enters the registry.
      // Failed feeds may only be saved as enabled:false (draft).
      const wantsEnabled = data.enabled !== false;
      let testResult: FeedTestResult | null = null;
      if (wantsEnabled) {
        testResult = await runFeedTest(data.url);
        if (!testResult.ok) {
          return res.status(422).json(feedTestFailedResponse(testResult));
        }
      } else {
        // Draft path: still test (best-effort) so we can record lastTestOk:false
        // and surface the failure to admins. Never block on this.
        try {
          testResult = await runFeedTest(data.url);
        } catch {
          testResult = null;
        }
      }
      const created = await storage.createNewsSource(data as any);
      if (testResult) await persistTestResult(created.id, testResult);
      res.status(201).json({ ok: true, source: created });
    } catch (err) {
      console.error("[admin/news-sources:create] failed", err);
      res.status(500).json({ ok: false, message: "create failed" });
    }
  });

  app.patch("/api/admin/news-sources/:id", requireRootAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "missing_id" });
    const parsed = updateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    }
    const data = parsed.data as UpdateBody;
    try {
      const existing = await storage.getNewsSource(id);
      if (!existing) return res.status(404).json({ ok: false, error: "not_found" });
      if (data.url && data.url !== existing.url) {
        const dup = await storage.getNewsSourceByUrl(data.url);
        if (dup && dup.id !== id) {
          return res.status(409).json({ ok: false, error: "duplicate_url", id: dup.id });
        }
      }

      const effectiveUrl = data.url ?? existing.url;
      const urlChanged = data.url !== undefined && data.url !== existing.url;
      const enableToggle =
        data.enabled === true && existing.enabled === false;
      const stayingEnabled =
        data.enabled === undefined ? existing.enabled : data.enabled;

      // A fresh full feed test is required whenever:
      //   - the caller is flipping a disabled source to enabled, OR
      //   - the row is/stays enabled AND the URL is changing.
      // Stored `lastTestOk` is NEVER honored as a shortcut here — every
      // enable transition runs a brand-new test.
      let testResult: FeedTestResult | null = null;
      const mustGate = enableToggle || (stayingEnabled === true && urlChanged);
      if (mustGate) {
        testResult = await runFeedTest(effectiveUrl);
        if (!testResult.ok) {
          await persistTestResult(id, testResult);
          return res.status(422).json(feedTestFailedResponse(testResult));
        }
      } else if (urlChanged) {
        // Draft URL change — record best-effort test outcome but do not block.
        try {
          testResult = await runFeedTest(effectiveUrl);
        } catch {
          testResult = null;
        }
      }

      const updated = await storage.updateNewsSource(id, data as any);
      if (testResult) await persistTestResult(id, testResult);
      res.json({ ok: true, source: updated });
    } catch (err) {
      console.error("[admin/news-sources:update] failed", err);
      res.status(500).json({ ok: false, message: "update failed" });
    }
  });

  app.post("/api/admin/news-sources/:id/check", requireRootAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "missing_id" });
    try {
      const result = await newsSourceHealthService.checkOne(id);
      if (!result) return res.status(404).json({ ok: false, error: "not_found" });
      res.json({ ok: true, result });
    } catch (err) {
      console.error("[admin/news-sources:check] failed", err);
      res.status(500).json({ ok: false, message: "check failed" });
    }
  });

  app.post("/api/admin/news-sources/:id/disable", requireRootAdmin, async (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "missing_id" });
    try {
      const existing = await storage.getNewsSource(id);
      if (!existing) return res.status(404).json({ ok: false, error: "not_found" });
      const updated = await storage.disableNewsSource(id);
      res.json({ ok: true, source: updated });
    } catch (err) {
      console.error("[admin/news-sources:disable] failed", err);
      res.status(500).json({ ok: false, message: "disable failed" });
    }
  });

  // Public-safe projection. No auth required, no notes / admin metadata.
  app.get("/api/news-sources/public", async (_req, res) => {
    try {
      const rows = await storage.listNewsSources({ activeOnly: true });
      res.json({ ok: true, count: rows.length, sources: rows.map(publicProjection) });
    } catch (err) {
      console.error("[news-sources/public] failed", err);
      res.status(500).json({ ok: false, message: "list failed" });
    }
  });
}
