/**
 * Mougle Production Preview Studio — routes.
 *
 * Every route is root-admin gated. All outputs are draft / internal-only.
 * Never opens a socket, never publishes, never renders.
 */

import type { Express, RequestHandler } from "express";
import {
  PreviewStudioComposeImageInputSchema,
  PreviewStudioComposeVideoInputSchema,
  PreviewStudioGenerateInputSchema,
  PreviewStudioUpdateControlsInputSchema,
} from "../../shared/production-house";
import {
  clearPreviewStudioHistory,
  previewClearPreviewStudioHistory,
  clearPreviewStudioHistoryCapOverride,
  composeStudioImage,
  composeStudioVideoClip,
  generatePreviewStudioState,
  getDefaultStudioScenes,
  getLatestPreviewStudioState,
  getPreviewStudioArchiveRetention,
  getPreviewStudioClearUndoStatus,
  getPreviewStudioHistoryCap,
  getPreviewStudioPackageExport,
  getPreviewStudioTooltips,
  listPreviewStudioArchives,
  listPreviewStudioEditArtifacts,
  listPreviewStudioStates,
  pruneArchives,
  readPreviewStudioArchive,
  setPreviewStudioArchiveRetention,
  setPreviewStudioHistoryCap,
  undoLastPreviewStudioClear,
  updatePreviewStudioControls,
} from "../services/preview-studio-service";
import { recordAudit } from "../services/production-house-service";

function audit(action: string, detail: string): void {
  try { recordAudit("root_admin", action, detail); } catch { /* best-effort */ }
}

export function registerPreviewStudioRoutes(
  app: Express,
  requireRootAdmin: RequestHandler,
): void {
  const PREFIX = "/api/admin/production-house/preview-studio";

  app.get(`${PREFIX}/state`, requireRootAdmin, (_req, res) => {
    const state = getLatestPreviewStudioState();
    audit("preview_studio.viewed", state.id);
    return res.json({ ok: true, state });
  });

  app.get(`${PREFIX}/defaults`, requireRootAdmin, (_req, res) => {
    return res.json({ ok: true, defaults: getDefaultStudioScenes() });
  });

  app.get(`${PREFIX}/tooltips`, requireRootAdmin, (_req, res) => {
    audit("preview_studio.tooltip_viewed", "tooltips");
    return res.json({ ok: true, tooltips: getPreviewStudioTooltips() });
  });

  app.get(`${PREFIX}/history`, requireRootAdmin, (_req, res) => {
    return res.json({ ok: true, states: listPreviewStudioStates() });
  });

  app.get(`${PREFIX}/history-cap`, requireRootAdmin, (_req, res) => {
    return res.json({ ok: true, info: getPreviewStudioHistoryCap() });
  });

  app.post(`${PREFIX}/history-cap`, requireRootAdmin, (req, res) => {
    const body = req.body ?? {};
    if (body.reset === true) {
      const update = clearPreviewStudioHistoryCapOverride();
      audit(
        "preview_studio.history_cap_reset",
        `cap:${update.info.cap}:src:${update.info.source}:trimStates:${update.trimmedStates}:trimArts:${update.trimmedEditArtifacts}`,
      );
      return res.json({ ok: true, ...update });
    }
    const raw = body.cap;
    const cap = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
    if (!Number.isFinite(cap) || !Number.isInteger(cap) || cap < 1 || cap > 10000) {
      return res.status(400).json({
        ok: false,
        error: "invalid_cap",
        message: "cap must be an integer between 1 and 10000",
      });
    }
    try {
      const update = setPreviewStudioHistoryCap(cap);
      audit(
        "preview_studio.history_cap_updated",
        `cap:${cap}:trimStates:${update.trimmedStates}:trimArts:${update.trimmedEditArtifacts}`,
      );
      return res.json({ ok: true, ...update });
    } catch (e) {
      return res.status(400).json({ ok: false, error: "invalid_cap", message: (e as Error).message });
    }
  });

  app.post(`${PREFIX}/clear-history`, requireRootAdmin, (req, res) => {
    const body = req.body ?? {};
    const rawScope = body.scope;
    const scope = rawScope === "states" || rawScope === "edit_artifacts" || rawScope === "both"
      ? rawScope
      : null;
    if (!scope) {
      return res.status(400).json({
        ok: false,
        error: "invalid_scope",
        message: "scope must be 'states', 'edit_artifacts', or 'both'",
      });
    }
    let olderThanIso: string | null = null;
    if (body.olderThanIso !== undefined && body.olderThanIso !== null && body.olderThanIso !== "") {
      if (typeof body.olderThanIso !== "string") {
        return res.status(400).json({
          ok: false,
          error: "invalid_older_than",
          message: "olderThanIso must be an ISO date string",
        });
      }
      const t = Date.parse(body.olderThanIso);
      if (!Number.isFinite(t)) {
        return res.status(400).json({
          ok: false,
          error: "invalid_older_than",
          message: "olderThanIso must be a valid ISO date string",
        });
      }
      olderThanIso = new Date(t).toISOString();
    } else if (body.olderThanDays !== undefined && body.olderThanDays !== null && body.olderThanDays !== "") {
      const days = typeof body.olderThanDays === "number"
        ? body.olderThanDays
        : Number.parseFloat(String(body.olderThanDays));
      if (!Number.isFinite(days) || days < 0) {
        return res.status(400).json({
          ok: false,
          error: "invalid_older_than",
          message: "olderThanDays must be a non-negative number",
        });
      }
      olderThanIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    }
    const dryRun = body.dryRun === true;
    try {
      if (dryRun) {
        const preview = previewClearPreviewStudioHistory(scope, { olderThanIso });
        return res.json({ ok: true, ...preview });
      }
      const result = clearPreviewStudioHistory(scope, { olderThanIso });
      audit(
        "preview_studio.history_cleared",
        `scope:${scope}:olderThan:${olderThanIso ?? "all"}:states:${result.clearedStates}:arts:${result.clearedEditArtifacts}:archive:${result.archiveFile ?? "none"}`,
      );
      return res.json({ ok: true, ...result });
    } catch (e) {
      return res.status(400).json({
        ok: false,
        error: "invalid_older_than",
        message: (e as Error).message,
      });
    }
  });

  app.get(`${PREFIX}/clear-undo`, requireRootAdmin, (_req, res) => {
    return res.json({ ok: true, status: getPreviewStudioClearUndoStatus() });
  });

  app.post(`${PREFIX}/clear-undo`, requireRootAdmin, (_req, res) => {
    const result = undoLastPreviewStudioClear();
    if (!result) {
      return res.status(410).json({
        ok: false,
        error: "undo_unavailable",
        message: "No recent clear is available to undo (the grace window may have expired).",
      });
    }
    audit(
      "preview_studio.history_clear_undone",
      `scope:${result.scope}:restoredStates:${result.restoredStates}:restoredArts:${result.restoredEditArtifacts}:trimStates:${result.trimmedStates}:trimArts:${result.trimmedEditArtifacts}`,
    );
    return res.json({ ok: true, ...result });
  });

  app.get(`${PREFIX}/archives`, requireRootAdmin, (_req, res) => {
    return res.json({ ok: true, archives: listPreviewStudioArchives() });
  });

  app.get(`${PREFIX}/archive-retention`, requireRootAdmin, (_req, res) => {
    return res.json({ ok: true, info: getPreviewStudioArchiveRetention() });
  });

  app.post(`${PREFIX}/archive-retention`, requireRootAdmin, (req, res) => {
    const body = req.body ?? {};
    if (body.reset === true) {
      try {
        const update = setPreviewStudioArchiveRetention({
          maxCount: null,
          maxAgeDays: null,
          storageThresholdMb: null,
        });
        audit(
          "preview_studio.archive_retention_reset",
          `count:${update.info.maxCount}:days:${update.info.maxAgeDays}:thresholdMb:${update.info.storageThresholdMb}:deleted:${update.prune.deletedFiles.length}`,
        );
        return res.json({ ok: true, ...update });
      } catch (e) {
        return res.status(400).json({
          ok: false,
          error: "invalid_retention",
          message: (e as Error).message,
        });
      }
    }
    const next: {
      maxCount?: number | null;
      maxAgeDays?: number | null;
      storageThresholdMb?: number | null;
    } = {};
    if (body.maxCount !== undefined) {
      if (body.maxCount === null) {
        next.maxCount = null;
      } else {
        const n = typeof body.maxCount === "number"
          ? body.maxCount
          : Number.parseInt(String(body.maxCount), 10);
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 10000) {
          return res.status(400).json({
            ok: false,
            error: "invalid_max_count",
            message: "maxCount must be an integer between 1 and 10000",
          });
        }
        next.maxCount = n;
      }
    }
    if (body.maxAgeDays !== undefined) {
      if (body.maxAgeDays === null) {
        next.maxAgeDays = null;
      } else {
        const n = typeof body.maxAgeDays === "number"
          ? body.maxAgeDays
          : Number.parseFloat(String(body.maxAgeDays));
        if (!Number.isFinite(n) || n < 1 || n > 3650) {
          return res.status(400).json({
            ok: false,
            error: "invalid_max_age_days",
            message: "maxAgeDays must be a number between 1 and 3650",
          });
        }
        next.maxAgeDays = n;
      }
    }
    if (body.storageThresholdMb !== undefined) {
      if (body.storageThresholdMb === null) {
        next.storageThresholdMb = null;
      } else {
        const n = typeof body.storageThresholdMb === "number"
          ? body.storageThresholdMb
          : Number.parseFloat(String(body.storageThresholdMb));
        if (!Number.isFinite(n) || n < 1 || n > 100000) {
          return res.status(400).json({
            ok: false,
            error: "invalid_storage_threshold_mb",
            message: "storageThresholdMb must be a number between 1 and 100000",
          });
        }
        next.storageThresholdMb = n;
      }
    }
    try {
      const update = setPreviewStudioArchiveRetention(next);
      audit(
        "preview_studio.archive_retention_updated",
        `count:${update.info.maxCount}:days:${update.info.maxAgeDays}:thresholdMb:${update.info.storageThresholdMb}:deleted:${update.prune.deletedFiles.length}`,
      );
      return res.json({ ok: true, ...update });
    } catch (e) {
      return res.status(400).json({
        ok: false,
        error: "invalid_retention",
        message: (e as Error).message,
      });
    }
  });

  app.post(`${PREFIX}/prune-archives`, requireRootAdmin, (_req, res) => {
    const prune = pruneArchives();
    audit(
      "preview_studio.archive_pruned",
      `deleted:${prune.deletedFiles.length}:bytes:${prune.deletedBytes}`,
    );
    return res.json({
      ok: true,
      prune,
      info: getPreviewStudioArchiveRetention(),
    });
  });

  app.get(`${PREFIX}/archives/:filename`, requireRootAdmin, (req, res) => {
    const raw = req.params.filename;
    const filename = Array.isArray(raw) ? raw[0] : raw;
    const file = typeof filename === "string"
      ? readPreviewStudioArchive(filename)
      : null;
    if (!file) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    audit("preview_studio.archive_downloaded", file.filename);
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename}"`,
    );
    res.setHeader("Cache-Control", "no-store");
    return res.send(file.content);
  });

  app.post(`${PREFIX}/generate`, requireRootAdmin, (req, res) => {
    const parsed = PreviewStudioGenerateInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    }
    const state = generatePreviewStudioState(parsed.data.controls);
    audit("preview_studio.state_generated", `${state.id}:${state.scene.controls.mode}`);
    return res.json({ ok: true, state });
  });

  app.post(`${PREFIX}/update-controls`, requireRootAdmin, (req, res) => {
    const parsed = PreviewStudioUpdateControlsInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    }
    const state = updatePreviewStudioControls(parsed.data.controls);
    audit("preview_studio.controls_updated", state.id);
    return res.json({ ok: true, state });
  });

  app.post(`${PREFIX}/compose-image`, requireRootAdmin, (req, res) => {
    const parsed = PreviewStudioComposeImageInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    }
    const artifact = composeStudioImage(parsed.data);
    audit("preview_studio.exported", `image:${artifact.id}`);
    return res.json({ ok: true, artifact });
  });

  app.post(`${PREFIX}/compose-video-clip`, requireRootAdmin, (req, res) => {
    const parsed = PreviewStudioComposeVideoInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: "invalid_body", issues: parsed.error.issues });
    }
    const artifact = composeStudioVideoClip(parsed.data);
    audit("preview_studio.exported", `video:${artifact.id}`);
    return res.json({ ok: true, artifact });
  });

  app.get(`${PREFIX}/edit-artifacts`, requireRootAdmin, (_req, res) => {
    return res.json({ ok: true, artifacts: listPreviewStudioEditArtifacts() });
  });

  app.get(`${PREFIX}/package-export`, requireRootAdmin, (_req, res) => {
    const pkg = getPreviewStudioPackageExport();
    audit("preview_studio.exported", `package:${pkg.previewStudioStates.length}s/${pkg.previewStudioEditArtifacts.length}a`);
    return res.json({ ok: true, ...pkg });
  });
}
