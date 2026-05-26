/**
 * Mougle AI Production House — root-admin admin routes.
 *
 * SAFETY:
 *   - Every route requires root admin (`requireRootAdmin`).
 *   - CSRF is enforced globally on `/api/*` (see server/index.ts).
 *   - All Unreal/4D `send*` routes are mock-only — they record a `dryRun: true`
 *     command and never open an outbound socket.
 *   - Render & send_scene_manifest are refused unless the production is
 *     `approved` (or already past that gate).
 *   - No public URLs / signed URLs anywhere. Visibility is always
 *     `admin_only_internal` on render jobs.
 *   - No secret values are returned by `/integrations`.
 */

import type { Express, RequestHandler } from "express";
import { z } from "zod";
import {
  AvatarSchema,
  FourDCueSchema,
  HallSchema,
  NewsroomProductionSchema,
  OpenAIGenerateInputSchema,
  PodcastSchema,
  ProductionSchema,
  PromptStudioInputSchema,
  RealUnrealCommandApprovalRequestSchema,
  RealUnrealCommandApprovalDecisionSchema,
  RealUnrealLevelLoadContractValidateInputSchema,
  RealUnrealLevelLoadContractCreateInputSchema,
  RoomSchema,
  WIZARD_PRODUCTION_TYPES,
  WizardStartInputSchema,
  WizardStepInputSchema,
  WizardSendToReviewInputSchema,
  VoiceGenerateInputSchema,
  VoiceMockInputSchema,
  MeshyGenerateInputSchema,
  MeshyMockInputSchema,
  RunwayGenerateInputSchema,
  RunwayMockInputSchema,
} from "../../shared/production-house";
import {
  buildAvatarManifest,
  buildFourDCueManifest,
  buildProductionManifest,
  buildUnrealSceneManifest,
  createAvatar,
  createFourDCue,
  createHall,
  createNewsroomProduction,
  createPodcast,
  createProduction,
  createRoom,
  getAvatar,
  getOverview,
  getProduction,
  getRoom,
  getManifestSnapshot,
  getStorageInfo,
  INTEGRATION_PROVIDERS,
  integrationsStatus,
  isElevenLabsAvailable,
  isOpenAIAvailable,
  listAudit,
  listAvatars,
  listFourDCues,
  listHalls,
  listManifestSnapshots,
  listNewsroomProductions,
  listPodcasts,
  listProductions,
  listProductionsFiltered,
  listRenderJobs,
  listRooms,
  listUnrealCommands,
  recordAudit,
  runPromptStudio,
  runPromptStudioOpenAI,
  runVoiceElevenLabs,
  runVoiceMock,
  listVoiceAssets,
  isMeshyAvailable,
  runMeshyMock,
  runMeshyReal,
  listAssetJobs,
  isRunwayAvailable,
  runRunwayMock,
  runRunwayReal,
  listVideoJobs,
  getAssetLibrary,
  getProductionPackage,
  getProductionChecklist,
  getUnrealSandboxStatus,
  validateUnrealSandboxPackage,
  sendUnrealSandboxCommand,
  listUnrealSandboxCommands,
  getLocalBridgeStubHealth,
  listLocalBridgeStubSupportedCommands,
  sendLocalBridgeStub,
  listLocalBridgeStubJobs,
  getFourDSandboxHealth,
  listFourDSandboxSupportedEffects,
  listFourDSandboxExampleCues,
  sendFourDSandboxCue,
  listFourDSandboxJobs,
  analyzeProductionReadiness,
  getLatestReadinessReport,
  listReadinessReports,
  transitionApprovalStage,
  listApprovalHistory,
  getApprovalBoard,
  getApprovalBoardProduction,
  getRealUnrealSetupStatus,
  validateRealUnrealConfig,
  attemptRealUnrealDryRunHandshake,
  listRealUnrealHandshakeHistory,
  performRealUnrealHealthCheckNetworkCall,
  listRealUnrealHealthCheckHistory,
  getRealUnrealDryRunValidationStatus,
  validatePackageLocally,
  validatePackageOnBridge,
  validatePackageOnBridgeNetwork,
  getRealUnrealPrepareSceneDryRunStatus,
  sendRealUnrealPrepareSceneDryRun,
  listRealUnrealPrepareSceneDryRunHistory,
  getRealUnrealSetCameraDryRunStatus,
  sendRealUnrealSetCameraDryRun,
  listRealUnrealSetCameraDryRunHistory,
  getRealUnrealSetLightingDryRunStatus,
  sendRealUnrealSetLightingDryRun,
  listRealUnrealSetLightingDryRunHistory,
  getRealUnrealSetPanelsDryRunStatus,
  sendRealUnrealSetPanelsDryRun,
  listRealUnrealSetPanelsDryRunHistory,
  getRealUnrealRenderPreviewContractStatus,
  validateRenderPreviewContractLocal,
  sendRealUnrealRenderPreviewContractDryRun,
  listRealUnrealRenderPreviewContractHistory,
  getRealUnrealCommandApprovalStatus,
  requestRealUnrealCommandApproval,
  decideRealUnrealCommandApproval,
  listRealUnrealCommandApprovalHistory,
  getRealUnrealLevelLoadContractStatus,
  validateRealUnrealLevelLoadContract,
  createRealUnrealLevelLoadContract,
  listRealUnrealLevelLoadContractHistory,
  getRealUnrealSafetySwitchStatus,
  evaluateRealUnrealSafetySwitch,
  listRealUnrealSafetySwitchHistory,
  setProductionHouseRouteInventory,
  getRealUnrealMigrationPlanStatus,
  generateRealUnrealMigrationPlan,
  listRealUnrealMigrationPlanHistory,
  exportRealUnrealMigrationPlan,
  generateGeneratedRoom,
  listGeneratedRooms,
  getGeneratedRoom,
  generateGeneratedAvatar,
  listGeneratedAvatars,
  getGeneratedAvatar,
  generateAvatarAccessory,
  listAvatarAccessories,
  createProductionUnit,
  listProductionUnits,
  getProductionUnit,
  generateMediaPackage,
  listMediaPackages,
  getMediaPackage,
  updateMediaPackage3DSelection,
  generateNewsToDebatePackage,
  generatePreviewSnapshot,
  getLatestPreviewSnapshot,
  listPreviewSnapshots,
  getPreviewSnapshotById,
  generateCinematicPreview,
  duplicatePreviewSnapshot,
  updatePreviewLayout,
  startProductionWizard,
  advanceProductionWizardStep,
  finalizeProductionWizard,
  getProductionWizard,
  listProductionWizardSessions,
  sendWizardToReview,
  getWizardReviewLinkByWizardId,
  listWizardReviewLinks,
  listRealUnrealDryRunValidationHistory,
  sendFourDCue,
  sendFourDTimeline,
  sendUnrealCommand,
  setProductionStatus,
  testIntegration,
} from "../services/production-house-service";
import {
  getBridgeContract,
  getExamplePayloads,
  validateBridgePayload,
  BRIDGE_COMMAND_TYPES,
} from "../services/unreal-bridge-contract";
import { validateFourDSandboxCue } from "../services/four-d-sandbox";

const RoomCreateSchema = RoomSchema.omit({ id: true, createdAt: true });
const AvatarCreateSchema = AvatarSchema.omit({ id: true, createdAt: true });
const HallCreateSchema = HallSchema.omit({ id: true, createdAt: true });
const PodcastCreateSchema = PodcastSchema.omit({ id: true, createdAt: true });
const NewsroomCreateSchema = NewsroomProductionSchema.omit({ id: true, createdAt: true });
const ProductionCreateSchema = ProductionSchema.omit({ id: true, createdAt: true });
const FourDCueCreateSchema = FourDCueSchema.omit({ id: true, createdAt: true });

const UnrealSendSchema = z.object({
  productionId: z.string().min(1).max(120).nullable().default(null),
  payload: z.record(z.unknown()).default({}),
});
const FourDSendSchema = z.object({ cueId: z.string().min(1).max(120) });
const FourDTimelineSchema = z.object({ productionId: z.string().min(1).max(120) });
const ApproveSchema = z.object({
  status: z.enum([
    "draft",
    "generated",
    "needs_review",
    "approved",
    "sent_to_unreal",
    "rendering",
    "rendered",
    "published",
    "failed",
  ]),
});

function err(res: any, status: number, msg: string, extra?: any) {
  return res.status(status).json({ ok: false, error: msg, ...(extra || {}) });
}

export function registerProductionHouseRoutes(
  app: Express,
  requireRootAdmin: RequestHandler,
): void {
  const PREFIX = "/api/admin/production-house";

  // Register the route inventory AFTER all routes are mounted, so the
  // safety-switch evaluator can verify no live-execution route exists.
  // We defer to nextTick to capture every app.* call below.
  process.nextTick(() => {
    try {
      // Express 5 uses `app.router.stack`; Express 4 used `app._router.stack`.
      // Try both for compatibility.
      const stack =
        (app as any)?.router?.stack ??
        (app as any)?._router?.stack ?? [];
      const paths: string[] = [];
      for (const layer of stack) {
        const route = layer?.route;
        if (route?.path && typeof route.path === "string") {
          if (route.path.startsWith(PREFIX)) paths.push(route.path);
        }
      }
      setProductionHouseRouteInventory(paths);
    } catch { /* fail-closed: leave inventory empty */ }
  });

  app.get(`${PREFIX}/overview`, requireRootAdmin, (_req, res) => {
    return res.json({ ok: true, overview: getOverview() });
  });

  /* --- Prompt Studio (mock, deterministic) --- */
  app.post(`${PREFIX}/prompt`, requireRootAdmin, (req, res) => {
    const parsed = PromptStudioInputSchema.safeParse(req.body);
    if (!parsed.success) return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    const output = runPromptStudio(parsed.data);
    recordAudit("root_admin", "prompt_studio_run", parsed.data.prompt.slice(0, 200));
    return res.json({ ok: true, output });
  });

  /* --- Prompt Studio (OpenAI generation, opt-in, audit-logged) --- */
  app.get(`${PREFIX}/prompt-studio/availability`, requireRootAdmin, (_req, res) =>
    // Booleans only — no key value is ever returned.
    res.json({
      ok: true,
      openaiAvailable: isOpenAIAvailable(),
      defaultMode: "mock" as const,
    }),
  );
  app.post(`${PREFIX}/prompt-studio/generate-openai`, requireRootAdmin, async (req, res) => {
    const parsed = OpenAIGenerateInputSchema.safeParse(req.body);
    if (!parsed.success)
      return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    if (!isOpenAIAvailable()) {
      return err(res, 412, "openai_not_configured", {
        hint: "Set OPENAI_API_KEY to enable this mode.",
      });
    }
    try {
      const result = await runPromptStudioOpenAI(parsed.data);
      return res.json({ ok: true, result });
    } catch (e) {
      const msg = (e as Error).message;
      const code = msg === "openai_schema_invalid" || msg === "openai_invalid_json" ? 422 : 502;
      return err(res, code, msg);
    }
  });

  /* --- Voice Studio (mock + ElevenLabs) --- */
  app.get(`${PREFIX}/voice/availability`, requireRootAdmin, (_req, res) =>
    res.json({
      ok: true,
      available: isElevenLabsAvailable(),
      hasCredential: isElevenLabsAvailable(),
      mockMode: true,
      realSendAllowed: false,
    }),
  );

  app.post(`${PREFIX}/voice/generate-mock`, requireRootAdmin, (req, res) => {
    const parsed = VoiceMockInputSchema.safeParse(req.body);
    if (!parsed.success) {
      recordAudit(
        "root_admin",
        "voice.generate.rejected",
        `invalid_body_mock: ${parsed.error.issues.map((i) => i.path.join(".")).join(",")}`,
      );
      return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    }
    try {
      const asset = runVoiceMock(parsed.data);
      return res.json({ ok: true, asset });
    } catch (e) {
      return err(res, 400, (e as Error).message);
    }
  });

  app.post(
    `${PREFIX}/voice/generate-elevenlabs`,
    requireRootAdmin,
    async (req, res) => {
      const parsed = VoiceGenerateInputSchema.safeParse(req.body);
      if (!parsed.success) {
        recordAudit(
          "root_admin",
          "voice.generate.rejected",
          `invalid_body: ${parsed.error.issues.map((i) => i.path.join(".")).join(",")}`,
        );
        return err(res, 400, "invalid_body", { issues: parsed.error.issues });
      }
      if (!isElevenLabsAvailable()) {
        recordAudit("root_admin", "voice.generate.rejected", "elevenlabs_not_configured");
        return err(res, 412, "elevenlabs_not_configured", {
          hint: "Set ELEVENLABS_API_KEY to enable this mode.",
        });
      }
      try {
        const asset = await runVoiceElevenLabs(parsed.data);
        return res.json({ ok: true, asset });
      } catch (e) {
        const msg = (e as Error).message;
        const code =
          msg === "production_not_found"
            ? 404
            : msg === "script_empty"
            ? 400
            : 502;
        return err(res, code, msg);
      }
    },
  );

  app.get(`${PREFIX}/voice/list`, requireRootAdmin, (req, res) => {
    const pid = typeof req.query.productionId === "string" ? req.query.productionId : undefined;
    return res.json({ ok: true, assets: listVoiceAssets(pid) });
  });

  /* --- Asset Studio (mock + Meshy 3D draft jobs) --- */
  app.get(`${PREFIX}/assets/meshy/availability`, requireRootAdmin, (_req, res) =>
    res.json({
      ok: true,
      available: isMeshyAvailable(),
      hasCredential: isMeshyAvailable(),
      mockMode: true,
      realSendAllowed: false,
    }),
  );

  app.post(`${PREFIX}/assets/meshy/generate-mock`, requireRootAdmin, (req, res) => {
    const parsed = MeshyMockInputSchema.safeParse(req.body);
    if (!parsed.success) {
      recordAudit(
        "root_admin",
        "asset.meshy.rejected",
        `invalid_body_mock: ${parsed.error.issues.map((i) => i.path.join(".")).join(",")}`,
      );
      return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    }
    try {
      const job = runMeshyMock(parsed.data);
      return res.json({ ok: true, job });
    } catch (e) {
      return err(res, 400, (e as Error).message);
    }
  });

  app.post(`${PREFIX}/assets/meshy/generate`, requireRootAdmin, async (req, res) => {
    const parsed = MeshyGenerateInputSchema.safeParse(req.body);
    if (!parsed.success) {
      recordAudit(
        "root_admin",
        "asset.meshy.rejected",
        `invalid_body: ${parsed.error.issues.map((i) => i.path.join(".")).join(",")}`,
      );
      return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    }
    if (!isMeshyAvailable()) {
      recordAudit("root_admin", "asset.meshy.rejected", "meshy_not_configured");
      return err(res, 412, "meshy_not_configured", {
        hint: "Set MESHY_API_KEY to enable this mode.",
      });
    }
    try {
      const job = await runMeshyReal(parsed.data);
      return res.json({ ok: true, job });
    } catch (e) {
      const msg = (e as Error).message;
      const code = msg === "production_not_found" ? 404 : 502;
      return err(res, code, msg);
    }
  });

  app.get(`${PREFIX}/assets/meshy/list`, requireRootAdmin, (req, res) => {
    const pid = typeof req.query.productionId === "string" ? req.query.productionId : undefined;
    return res.json({ ok: true, jobs: listAssetJobs(pid) });
  });

  /* --- Video Studio (mock + Runway draft jobs) --- */
  app.get(`${PREFIX}/video/runway/availability`, requireRootAdmin, (_req, res) =>
    res.json({
      ok: true,
      available: isRunwayAvailable(),
      hasCredential: isRunwayAvailable(),
      mockMode: true,
      realSendAllowed: false,
    }),
  );

  app.post(`${PREFIX}/video/runway/generate-mock`, requireRootAdmin, (req, res) => {
    const parsed = RunwayMockInputSchema.safeParse(req.body);
    if (!parsed.success) {
      recordAudit(
        "root_admin",
        "video.runway.rejected",
        `invalid_body_mock: ${parsed.error.issues.map((i) => i.path.join(".")).join(",")}`,
      );
      return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    }
    try {
      const job = runRunwayMock(parsed.data);
      return res.json({ ok: true, job });
    } catch (e) {
      return err(res, 400, (e as Error).message);
    }
  });

  app.post(`${PREFIX}/video/runway/generate`, requireRootAdmin, async (req, res) => {
    const parsed = RunwayGenerateInputSchema.safeParse(req.body);
    if (!parsed.success) {
      recordAudit(
        "root_admin",
        "video.runway.rejected",
        `invalid_body: ${parsed.error.issues.map((i) => i.path.join(".")).join(",")}`,
      );
      return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    }
    if (!isRunwayAvailable()) {
      recordAudit("root_admin", "video.runway.rejected", "runway_not_configured");
      return err(res, 412, "runway_not_configured", {
        hint: "Set RUNWAY_API_KEY to enable this mode.",
      });
    }
    try {
      const job = await runRunwayReal(parsed.data);
      return res.json({ ok: true, job });
    } catch (e) {
      const msg = (e as Error).message;
      const code = msg === "production_not_found" ? 404 : 502;
      return err(res, code, msg);
    }
  });

  app.get(`${PREFIX}/video/runway/list`, requireRootAdmin, (req, res) => {
    const pid = typeof req.query.productionId === "string" ? req.query.productionId : undefined;
    return res.json({ ok: true, jobs: listVideoJobs(pid) });
  });

  /* --- Asset Library (read-only aggregator across all internal jobs) --- */
  app.get(`${PREFIX}/asset-library`, requireRootAdmin, (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const bool = (v: string | undefined) => v === "1" || v === "true";
    const lib = getAssetLibrary({
      productionId: q.productionId,
      type: q.type,
      provider: q.provider,
      status: q.status,
      approvalStatus: q.approvalStatus,
      since: q.since,
      until: q.until,
      visibility: q.visibility,
      mockOnly: bool(q.mockOnly),
      realOnly: bool(q.realOnly),
    });
    recordAudit("root_admin", "asset_library.viewed", `count=${lib.entries.length}`);
    return res.json({
      ok: true,
      entries: lib.entries,
      counts: lib.counts,
      total: lib.entries.length,
    });
  });

  /* --- Production Package Viewer (read-only per-production aggregate) --- */
  app.get(`${PREFIX}/productions/:productionId/package`, requireRootAdmin, (req, res) => {
    const id = String(req.params.productionId);
    const pkg = getProductionPackage(id);
    if (!pkg) return err(res, 404, "production_not_found");
    recordAudit("root_admin", "production_package.viewed", id);
    return res.json({ ok: true, package: pkg });
  });

  app.get(`${PREFIX}/productions/:productionId/checklist`, requireRootAdmin, (req, res) => {
    const id = String(req.params.productionId);
    const checklist = getProductionChecklist(id);
    if (!checklist) return err(res, 404, "production_not_found");
    recordAudit("root_admin", "production_package.checklist_generated", id);
    return res.json({ ok: true, checklist });
  });

  /* ---- Unreal Sandbox Bridge (mock-only, never connects to Unreal) ---- */
  app.get(`${PREFIX}/unreal/sandbox/status`, requireRootAdmin, (_req, res) => {
    const status = getUnrealSandboxStatus();
    recordAudit("root_admin", "unreal.sandbox.status.viewed", "");
    return res.json({ ok: true, ...status });
  });

  app.post(`${PREFIX}/unreal/sandbox/validate-package`, requireRootAdmin, (req, res) => {
    const body = (req.body || {}) as any;
    const id = typeof body.productionId === "string" ? body.productionId : "";
    if (!id) return err(res, 400, "productionId_required");
    const sandboxOverride = body.sandboxOverride === true;
    const v = validateUnrealSandboxPackage(id, { sandboxOverride });
    recordAudit(
      "root_admin",
      "unreal.sandbox.package.validated",
      `${id}:ok=${v.ok}:override=${sandboxOverride}`,
    );
    return res.json({ ok: true, validation: v });
  });

  app.post(`${PREFIX}/unreal/sandbox/send`, requireRootAdmin, (req, res) => {
    const body = (req.body || {}) as any;
    const id = typeof body.productionId === "string" ? body.productionId : "";
    if (!id) return err(res, 400, "productionId_required");
    const commandType = typeof body.commandType === "string" ? body.commandType : "send_scene_manifest";
    const allowed = new Set([
      "validate_package",
      "send_scene_manifest",
      "load_level",
      "set_camera",
      "set_lighting",
      "start_sequence",
      "render_preview",
    ]);
    if (!allowed.has(commandType)) return err(res, 400, "invalid_commandType");
    recordAudit("root_admin", "unreal.sandbox.command.attempted", `${id}:${commandType}`);
    const { command } = sendUnrealSandboxCommand({
      productionId: id,
      commandType: commandType as any,
      sandboxOverride: body.sandboxOverride === true,
      payloadHint: typeof body.payloadHint === "string" ? body.payloadHint : "",
    });
    recordAudit(
      "root_admin",
      command.status === "mock_accepted"
        ? "unreal.sandbox.command.accepted"
        : "unreal.sandbox.command.rejected",
      `${id}:${commandType}:${command.id}`,
    );
    return res.json({
      ok: true,
      mode: "sandbox",
      realSendAllowed: false,
      commandId: command.id,
      status: command.status,
      message:
        command.status === "mock_accepted"
          ? "Sandbox command accepted. No real Unreal command was sent."
          : command.reason,
      command,
    });
  });

  /* ---- Real Unreal Bridge Setup (dry-run only, no real send) ---- */
  app.get(`${PREFIX}/real-unreal/setup/status`, requireRootAdmin, (_req, res) => {
    const status = getRealUnrealSetupStatus();
    recordAudit("root_admin", "real_unreal.setup.status_viewed", "");
    return res.json({ ok: true, ...status });
  });

  app.post(`${PREFIX}/real-unreal/setup/validate-config`, requireRootAdmin, (_req, res) => {
    const result = validateRealUnrealConfig();
    recordAudit(
      "root_admin", "real_unreal.setup.config_validated",
      `${result.ok ? "ok" : "fail"}:${result.errorCodes.join(",")}`,
    );
    return res.json({
      ok: result.ok,
      failures: result.failures,
      errorCodes: result.errorCodes,
      status: result.status,
    });
  });

  app.post(`${PREFIX}/real-unreal/setup/handshake-dry-run`, requireRootAdmin, (req, res) => {
    recordAudit("root_admin", "real_unreal.setup.handshake_attempted", "");
    const confirm = (req.body ?? {}).confirm === true;
    const result = attemptRealUnrealDryRunHandshake({ confirm });
    if (!result.ok) {
      const action = result.status === "rejected"
        ? "real_unreal.setup.handshake_rejected"
        : "real_unreal.setup.handshake_failed";
      recordAudit("root_admin", action, `${result.status}:${result.errorCodes.join(",")}`);
      return res.status(400).json(result);
    }
    recordAudit(
      "root_admin", "real_unreal.setup.handshake_succeeded",
      result.record?.id ?? "",
    );
    return res.json(result);
  });

  app.get(`${PREFIX}/real-unreal/setup/handshake-history`, requireRootAdmin, (_req, res) => {
    const history = listRealUnrealHandshakeHistory();
    recordAudit("root_admin", "real_unreal.setup.history_viewed", `n=${history.length}`);
    return res.json({ ok: true, history });
  });

  /* ---- Real Unreal Bridge Health-Check Network Call ---- */
  app.post(
    `${PREFIX}/real-unreal/setup/health-check-network`,
    requireRootAdmin,
    async (req, res) => {
      recordAudit("root_admin", "real_unreal.health_check_network.attempted", "");
      const confirm = (req.body ?? {}).confirm === true;
      const result = await performRealUnrealHealthCheckNetworkCall({ confirm });
      if (!result.ok) {
        const action =
          result.status === "rejected"
            ? "real_unreal.health_check_network.rejected"
            : "real_unreal.health_check_network.failed";
        recordAudit("root_admin", action, `${result.status}:${result.errorCodes.join(",")}`);
        return res.status(400).json(result);
      }
      recordAudit(
        "root_admin", "real_unreal.health_check_network.succeeded",
        result.record?.id ?? "",
      );
      return res.json(result);
    },
  );

  app.get(
    `${PREFIX}/real-unreal/setup/health-check-history`,
    requireRootAdmin,
    (_req, res) => {
      const history = listRealUnrealHealthCheckHistory();
      return res.json({ ok: true, history });
    },
  );

  /* ---- Real Unreal Dry-Run Package Validation (no real send) ---- */
  app.get(`${PREFIX}/real-unreal/dry-run-validation/status`, requireRootAdmin, (_req, res) => {
    const status = getRealUnrealDryRunValidationStatus();
    recordAudit("root_admin", "real_unreal.dry_run.status_viewed", "");
    return res.json({ ok: true, ...status });
  });

  app.post(
    `${PREFIX}/real-unreal/dry-run-validation/:productionId/validate-local`,
    requireRootAdmin,
    (req, res) => {
      const id = String(req.params.productionId);
      recordAudit("root_admin", "real_unreal.dry_run.local_validation_attempted", id);
      const result = validatePackageLocally(id);
      const action = result.ok
        ? "real_unreal.dry_run.local_validation_passed"
        : "real_unreal.dry_run.local_validation_failed";
      recordAudit("root_admin", action, `${id}:${result.status}:${result.failures.join(",")}`);
      const httpStatus = result.status === "rejected" ? 404 : result.ok ? 200 : 400;
      return res.status(httpStatus).json({
        ok: result.ok, productionId: id, status: result.status,
        checks: result.checks, failures: result.failures, record: result.record,
        approvalStage: result.approvalStage,
        readinessOverallScore: result.readinessOverallScore,
        realSendAllowed: false, publishingEnabled: false,
      });
    },
  );

  app.post(
    `${PREFIX}/real-unreal/dry-run-validation/:productionId/validate-bridge`,
    requireRootAdmin,
    (req, res) => {
      const id = String(req.params.productionId);
      const confirm = (req.body ?? {}).confirm === true;
      recordAudit("root_admin", "real_unreal.dry_run.bridge_validation_attempted", id);
      const result = validatePackageOnBridge({ productionId: id, confirm });
      if (!result.ok) {
        const action = result.status === "rejected"
          ? "real_unreal.dry_run.bridge_validation_rejected"
          : "real_unreal.dry_run.bridge_validation_failed";
        recordAudit("root_admin", action, `${id}:${result.errorCodes.join(",")}`);
        const httpStatus = result.errorCodes.includes("production_not_found") ? 404 : 400;
        return res.status(httpStatus).json({
          ok: false, productionId: id, status: result.status,
          message: result.message, errorCodes: result.errorCodes, record: result.record,
          realSendAllowed: false, publishingEnabled: false,
        });
      }
      recordAudit("root_admin", "real_unreal.dry_run.bridge_validation_passed", id);
      return res.json({
        ok: true, productionId: id, status: result.status,
        message: result.message, record: result.record,
        sanitizedRequest: result.sanitizedRequest,
        realSendAllowed: false, publishingEnabled: false,
      });
    },
  );

  app.post(
    `${PREFIX}/real-unreal/dry-run-validation/:productionId/validate-bridge-network`,
    requireRootAdmin,
    async (req, res) => {
      const id = String(req.params.productionId);
      const confirm = (req.body ?? {}).confirm === true;
      recordAudit("root_admin", "real_unreal.dry_run.bridge_network_attempted", id);
      const result = await validatePackageOnBridgeNetwork({ productionId: id, confirm });
      if (!result.ok) {
        const action = result.status === "rejected"
          ? "real_unreal.dry_run.bridge_network_rejected"
          : "real_unreal.dry_run.bridge_network_failed";
        recordAudit("root_admin", action, `${id}:${result.errorCodes.join(",")}`);
        const httpStatus = result.errorCodes.includes("production_not_found") ? 404 : 400;
        return res.status(httpStatus).json({
          ok: false, productionId: id, status: result.status,
          message: result.message, errorCodes: result.errorCodes, record: result.record,
          realSendAllowed: false, publishingEnabled: false,
        });
      }
      recordAudit("root_admin", "real_unreal.dry_run.bridge_network_passed", id);
      return res.json({
        ok: true, productionId: id, status: result.status,
        message: result.message, record: result.record,
        sanitizedRequest: result.sanitizedRequest,
        realSendAllowed: false, publishingEnabled: false,
      });
    },
  );

  /* ---- Real Unreal Prepare-Scene Dry-Run Network Call ---- */
  app.get(
    `${PREFIX}/real-unreal/prepare-scene-dry-run/status`,
    requireRootAdmin,
    (_req, res) => {
      const status = getRealUnrealPrepareSceneDryRunStatus();
      recordAudit("root_admin", "real_unreal.prepare_scene.status_viewed", "—");
      return res.json({ ok: true, ...status });
    },
  );
  app.post(
    `${PREFIX}/real-unreal/prepare-scene-dry-run/:productionId/send`,
    requireRootAdmin,
    async (req, res) => {
      const id = String(req.params.productionId);
      const confirm = (req.body ?? {}).confirm === true;
      recordAudit("root_admin", "real_unreal.prepare_scene.attempted", id);
      const result = await sendRealUnrealPrepareSceneDryRun({ productionId: id, confirm });
      if (!result.ok) {
        const action = result.status === "rejected"
          ? "real_unreal.prepare_scene.rejected"
          : "real_unreal.prepare_scene.failed";
        recordAudit("root_admin", action, `${id}:${result.errorCodes.join(",")}`);
        const httpStatus = result.errorCodes.includes("production_not_found") ? 404 : 400;
        return res.status(httpStatus).json({
          ok: false, productionId: id, status: result.status,
          message: result.message, errorCodes: result.errorCodes, record: result.record,
          realSendAllowed: false, publishingEnabled: false,
        });
      }
      recordAudit("root_admin", "real_unreal.prepare_scene.passed", id);
      return res.json({
        ok: true, productionId: id, status: result.status,
        message: result.message, record: result.record,
        sanitizedRequest: result.sanitizedRequest,
        realSendAllowed: false, publishingEnabled: false,
      });
    },
  );
  app.get(
    `${PREFIX}/real-unreal/prepare-scene-dry-run/history`,
    requireRootAdmin,
    (req, res) => {
      const productionId = typeof req.query.productionId === "string"
        ? req.query.productionId : undefined;
      const history = listRealUnrealPrepareSceneDryRunHistory(productionId);
      recordAudit(
        "root_admin", "real_unreal.prepare_scene.history_viewed",
        `${productionId ?? "all"}:n=${history.length}`,
      );
      return res.json({ ok: true, productionId: productionId ?? null, history });
    },
  );

  /* ---- Real Unreal Set-Camera Dry-Run Network Call ---- */
  app.get(
    `${PREFIX}/real-unreal/set-camera-dry-run/status`,
    requireRootAdmin,
    (_req, res) => {
      const status = getRealUnrealSetCameraDryRunStatus();
      recordAudit("root_admin", "real_unreal.set_camera.status_viewed", "—");
      return res.json({ ok: true, ...status });
    },
  );
  app.post(
    `${PREFIX}/real-unreal/set-camera-dry-run/:productionId/send`,
    requireRootAdmin,
    async (req, res) => {
      const id = String(req.params.productionId);
      const body = req.body ?? {};
      const confirm = body.confirm === true;
      const cameraPreset = typeof body.cameraPreset === "string"
        ? body.cameraPreset : "custom_static";
      recordAudit("root_admin", "real_unreal.set_camera.attempted", id);
      const result = await sendRealUnrealSetCameraDryRun({
        productionId: id, confirm, cameraPreset: cameraPreset as any,
      });
      if (!result.ok) {
        const action = result.status === "rejected"
          ? "real_unreal.set_camera.rejected"
          : "real_unreal.set_camera.failed";
        recordAudit("root_admin", action, `${id}:${result.errorCodes.join(",")}`);
        const httpStatus = result.errorCodes.includes("production_not_found") ? 404 : 400;
        return res.status(httpStatus).json({
          ok: false, productionId: id, status: result.status,
          message: result.message, errorCodes: result.errorCodes, record: result.record,
          realSendAllowed: false, publishingEnabled: false,
        });
      }
      recordAudit("root_admin", "real_unreal.set_camera.passed", id);
      return res.json({
        ok: true, productionId: id, status: result.status,
        message: result.message, record: result.record,
        sanitizedRequest: result.sanitizedRequest,
        realSendAllowed: false, publishingEnabled: false,
      });
    },
  );
  app.get(
    `${PREFIX}/real-unreal/set-camera-dry-run/history`,
    requireRootAdmin,
    (req, res) => {
      const productionId = typeof req.query.productionId === "string"
        ? req.query.productionId : undefined;
      const history = listRealUnrealSetCameraDryRunHistory(productionId);
      recordAudit(
        "root_admin", "real_unreal.set_camera.history_viewed",
        `${productionId ?? "all"}:n=${history.length}`,
      );
      return res.json({ ok: true, productionId: productionId ?? null, history });
    },
  );

  /* ---- Real Unreal Set-Lighting Dry-Run Network Call ---- */
  app.get(
    `${PREFIX}/real-unreal/set-lighting/status`,
    requireRootAdmin,
    (_req, res) => {
      const status = getRealUnrealSetLightingDryRunStatus();
      recordAudit("root_admin", "real_unreal.set_lighting.status_viewed", "—");
      return res.json({ ok: true, ...status });
    },
  );
  app.post(
    `${PREFIX}/real-unreal/set-lighting/send`,
    requireRootAdmin,
    async (req, res) => {
      const body = req.body ?? {};
      const id = String(body.productionId ?? "");
      const confirm = body.confirm === true;
      const lightingPreset = typeof body.lightingPreset === "string"
        ? body.lightingPreset : "standby_dim";
      recordAudit("root_admin", "real_unreal.set_lighting.attempted", id || "—");
      const result = await sendRealUnrealSetLightingDryRun({
        productionId: id, confirm, lightingPreset: lightingPreset as any,
      });
      if (!result.ok) {
        const action = result.status === "rejected"
          ? "real_unreal.set_lighting.rejected"
          : "real_unreal.set_lighting.failed";
        recordAudit("root_admin", action, `${id || "—"}:${result.errorCodes.join(",")}`);
        const httpStatus = result.errorCodes.includes("production_not_found") ? 404 : 400;
        return res.status(httpStatus).json({
          ok: false, productionId: id, status: result.status,
          message: result.message, errorCodes: result.errorCodes, record: result.record,
          realSendAllowed: false, publishingEnabled: false,
        });
      }
      recordAudit("root_admin", "real_unreal.set_lighting.passed", id);
      return res.json({
        ok: true, productionId: id, status: result.status,
        message: result.message, record: result.record,
        sanitizedRequest: result.sanitizedRequest,
        realSendAllowed: false, publishingEnabled: false,
      });
    },
  );
  app.get(
    `${PREFIX}/real-unreal/set-lighting/history`,
    requireRootAdmin,
    (req, res) => {
      const productionId = typeof req.query.productionId === "string"
        ? req.query.productionId : undefined;
      const history = listRealUnrealSetLightingDryRunHistory(productionId);
      recordAudit(
        "root_admin", "real_unreal.set_lighting.history_viewed",
        `${productionId ?? "all"}:n=${history.length}`,
      );
      return res.json({ ok: true, productionId: productionId ?? null, history });
    },
  );

  /* ---- Real Unreal Set-Panels Dry-Run Network Call ---- */
  app.get(
    `${PREFIX}/real-unreal/set-panels/status`,
    requireRootAdmin,
    (_req, res) => {
      const status = getRealUnrealSetPanelsDryRunStatus();
      recordAudit("root_admin", "real_unreal.set_panels.status_viewed", "—");
      return res.json({ ok: true, ...status });
    },
  );
  app.post(
    `${PREFIX}/real-unreal/set-panels/send`,
    requireRootAdmin,
    async (req, res) => {
      const body = req.body ?? {};
      const id = String(body.productionId ?? "");
      const confirm = body.confirm === true;
      const panelPreset = typeof body.panelPreset === "string"
        ? body.panelPreset : "standby_brand_loop";
      recordAudit("root_admin", "real_unreal.set_panels.attempted", id || "—");
      const result = await sendRealUnrealSetPanelsDryRun({
        productionId: id, confirm, panelPreset: panelPreset as any,
        headline: typeof body.headline === "string" ? body.headline : undefined,
        subtitle: typeof body.subtitle === "string" ? body.subtitle : undefined,
        tickerItems: Array.isArray(body.tickerItems) ? body.tickerItems : undefined,
        sourcePanel: body.sourcePanel && typeof body.sourcePanel === "object" ? body.sourcePanel : undefined,
        confidenceLabel: typeof body.confidenceLabel === "string" ? body.confidenceLabel : undefined,
        mapPanel: body.mapPanel && typeof body.mapPanel === "object" ? body.mapPanel : undefined,
        timelinePanel: body.timelinePanel && typeof body.timelinePanel === "object" ? body.timelinePanel : undefined,
        marketOrDataPanel: body.marketOrDataPanel && typeof body.marketOrDataPanel === "object" ? body.marketOrDataPanel : undefined,
        mediaRefs: Array.isArray(body.mediaRefs) ? body.mediaRefs : undefined,
      });
      if (!result.ok) {
        const action = result.status === "rejected"
          ? "real_unreal.set_panels.rejected"
          : "real_unreal.set_panels.failed";
        recordAudit("root_admin", action, `${id || "—"}:${result.errorCodes.join(",")}`);
        const httpStatus = result.errorCodes.includes("production_not_found") ? 404 : 400;
        return res.status(httpStatus).json({
          ok: false, productionId: id, status: result.status,
          message: result.message, errorCodes: result.errorCodes, record: result.record,
          realSendAllowed: false, publishingEnabled: false,
          liveStreamingEnabled: false, socialEnabled: false,
        });
      }
      recordAudit("root_admin", "real_unreal.set_panels.passed", id);
      return res.json({
        ok: true, productionId: id, status: result.status,
        message: result.message, record: result.record,
        sanitizedRequest: result.sanitizedRequest,
        realSendAllowed: false, publishingEnabled: false,
        liveStreamingEnabled: false, socialEnabled: false,
      });
    },
  );
  app.get(
    `${PREFIX}/real-unreal/set-panels/history`,
    requireRootAdmin,
    (req, res) => {
      const productionId = typeof req.query.productionId === "string"
        ? req.query.productionId : undefined;
      const history = listRealUnrealSetPanelsDryRunHistory(productionId);
      recordAudit(
        "root_admin", "real_unreal.set_panels.history_viewed",
        `${productionId ?? "all"}:n=${history.length}`,
      );
      return res.json({ ok: true, productionId: productionId ?? null, history });
    },
  );

  /* ---- Real Unreal Render-Preview Contract Dry-Run (CONTRACT ONLY) ---- */
  app.get(
    `${PREFIX}/real-unreal/render-preview-contract/status`,
    requireRootAdmin,
    (_req, res) => {
      const status = getRealUnrealRenderPreviewContractStatus();
      recordAudit("root_admin", "real_unreal.render_preview_contract.status_viewed", "—");
      return res.json({ ok: true, ...status });
    },
  );
  app.post(
    `${PREFIX}/real-unreal/render-preview-contract/:productionId/validate-local`,
    requireRootAdmin,
    (req, res) => {
      const productionId = String(req.params.productionId);
      const panelsUsed = (req.body ?? {}).panelsUsed === true;
      recordAudit(
        "root_admin",
        "real_unreal.render_preview_contract.local_validation_attempted",
        productionId,
      );
      const result = validateRenderPreviewContractLocal({ productionId, panelsUsed });
      if (!result.ok) {
        recordAudit(
          "root_admin",
          "real_unreal.render_preview_contract.local_validation_failed",
          `${productionId}:${result.errorCodes.join(",")}`,
        );
        const httpStatus = result.errorCodes.includes("production_not_found") ? 404 : 400;
        return res.status(httpStatus).json({
          ok: false, productionId, status: result.status,
          message: result.message, errorCodes: result.errorCodes, record: result.record,
          realSendAllowed: false,
        });
      }
      recordAudit(
        "root_admin",
        "real_unreal.render_preview_contract.local_validation_passed",
        productionId,
      );
      return res.json({
        ok: true, productionId, status: result.status,
        message: result.message, contract: result.contract, record: result.record,
        realSendAllowed: false,
      });
    },
  );
  app.post(
    `${PREFIX}/real-unreal/render-preview-contract/:productionId/send-dry-run`,
    requireRootAdmin,
    async (req, res) => {
      const productionId = String(req.params.productionId);
      const body = req.body ?? {};
      const confirm = body.confirm === true;
      const panelsUsed = body.panelsUsed === true;
      recordAudit(
        "root_admin",
        "real_unreal.render_preview_contract.network_attempted",
        productionId,
      );
      const result = await sendRealUnrealRenderPreviewContractDryRun({
        productionId, confirm, panelsUsed,
      });
      if (!result.ok) {
        const action = result.status === "rejected"
          ? "real_unreal.render_preview_contract.network_rejected"
          : "real_unreal.render_preview_contract.network_failed";
        recordAudit("root_admin", action, `${productionId}:${result.errorCodes.join(",")}`);
        const httpStatus = result.errorCodes.includes("production_not_found") ? 404 : 400;
        return res.status(httpStatus).json({
          ok: false, productionId, status: result.status,
          message: result.message, errorCodes: result.errorCodes, record: result.record,
          realSendAllowed: false, publishingEnabled: false,
          liveStreamingEnabled: false, socialEnabled: false,
        });
      }
      recordAudit(
        "root_admin",
        "real_unreal.render_preview_contract.network_passed",
        productionId,
      );
      return res.json({
        ok: true, productionId, status: result.status,
        message: result.message, record: result.record,
        sanitizedRequest: result.sanitizedRequest, contract: result.contract,
        realSendAllowed: false, publishingEnabled: false,
        liveStreamingEnabled: false, socialEnabled: false,
      });
    },
  );
  /* ---- Real Unreal Live Command Safety Switch (governance only) ------ */
  app.get(
    `${PREFIX}/real-unreal/safety-switch/status`,
    requireRootAdmin,
    (_req, res) => {
      const status = getRealUnrealSafetySwitchStatus();
      recordAudit(
        "root_admin",
        "real_unreal.safety_switch.status_viewed",
        `state=${status.state}:blockers=${status.blockers.length}`,
      );
      return res.json({ ok: true, ...status });
    },
  );
  app.post(
    `${PREFIX}/real-unreal/safety-switch/evaluate`,
    requireRootAdmin,
    (_req, res) => {
      recordAudit("root_admin", "real_unreal.safety_switch.evaluation_attempted", "");
      const result = evaluateRealUnrealSafetySwitch();
      recordAudit(
        "root_admin",
        "real_unreal.safety_switch.evaluation_completed",
        `${result.record.id}:state=${result.record.state}:blockers=${result.record.blockers.length}`,
      );
      return res.json({
        ok: result.ok,
        message: result.message,
        record: result.record,
        liveExecutionEnabled: false,
        realSendAllowed: false,
        executionEnabled: false,
        emergencyLocked: true,
      });
    },
  );
  app.get(
    `${PREFIX}/real-unreal/safety-switch/history`,
    requireRootAdmin,
    (_req, res) => {
      const history = listRealUnrealSafetySwitchHistory();
      recordAudit(
        "root_admin",
        "real_unreal.safety_switch.history_viewed",
        `n=${history.length}`,
      );
      return res.json({
        ok: true, history,
        liveExecutionEnabled: false,
        realSendAllowed: false,
        executionEnabled: false,
        emergencyLocked: true,
      });
    },
  );

  /* ---- 3D/4D Room Generator (draft/internal-only) -------------------- */
  app.get(`${PREFIX}/room-generator/list`, requireRootAdmin, (_req, res) => {
    return res.json({ ok: true, rooms: listGeneratedRooms(),
      visibility: "admin_only_internal",
      realSendAllowed: false, executionEnabled: false });
  });
  app.post(`${PREFIX}/room-generator/generate`, requireRootAdmin, (req, res) => {
    const body = (req.body ?? {}) as any;
    recordAudit("root_admin", "room_generator.generate_attempted",
      String(body.prompt ?? "").slice(0, 200));
    const r = generateGeneratedRoom({
      prompt: body.prompt ?? "",
      productionId: body.productionId ?? null,
      roomName: body.roomName,
      roomCategory: body.roomCategory,
    });
    recordAudit("root_admin", "room_generator.generated",
      `${r.record.roomId}:${r.record.roomCategory}`);
    return res.json({ ok: true, room: r.record,
      visibility: "admin_only_internal",
      realSendAllowed: false, executionEnabled: false });
  });
  app.get(`${PREFIX}/room-generator/:roomId`, requireRootAdmin, (req, res) => {
    const r = getGeneratedRoom(String(req.params.roomId));
    if (!r) return res.status(404).json({ ok: false, error: "room_not_found" });
    return res.json({ ok: true, room: r });
  });

  /* ---- Avatar & Accessories Creator (draft/internal-only) ----------- */
  app.get(`${PREFIX}/avatar-creator/list`, requireRootAdmin, (_req, res) => {
    return res.json({ ok: true,
      avatars: listGeneratedAvatars(),
      accessories: listAvatarAccessories(),
      visibility: "admin_only_internal",
      realSendAllowed: false, executionEnabled: false });
  });
  app.post(`${PREFIX}/avatar-creator/generate`, requireRootAdmin, (req, res) => {
    const body = (req.body ?? {}) as any;
    recordAudit("root_admin", "avatar_creator.generate_attempted",
      String(body.prompt ?? "").slice(0, 200));
    const r = generateGeneratedAvatar({
      prompt: body.prompt ?? "",
      productionId: body.productionId ?? null,
      avatarName: body.avatarName,
      avatarRole: body.avatarRole,
      accessoryList: body.accessoryList,
    });
    recordAudit("root_admin", "avatar_creator.generated",
      `${r.record.avatarId}:${r.record.avatarRole}`);
    return res.json({ ok: true, avatar: r.record,
      visibility: "admin_only_internal",
      realSendAllowed: false, executionEnabled: false });
  });
  app.post(`${PREFIX}/avatar-creator/accessories/generate`, requireRootAdmin, (req, res) => {
    const body = (req.body ?? {}) as any;
    const r = generateAvatarAccessory({
      prompt: body.prompt ?? "",
      avatarId: body.avatarId ?? null,
      accessoryType: body.accessoryType,
      label: body.label,
    });
    return res.json({ ok: true, accessory: r.record,
      visibility: "admin_only_internal" });
  });
  app.get(`${PREFIX}/avatar-creator/:avatarId`, requireRootAdmin, (req, res) => {
    const r = getGeneratedAvatar(String(req.params.avatarId));
    if (!r) return res.status(404).json({ ok: false, error: "avatar_not_found" });
    return res.json({ ok: true, avatar: r });
  });

  /* ---- Production Units Builder (draft/internal-only) --------------- */
  app.get(`${PREFIX}/production-units/list`, requireRootAdmin, (_req, res) => {
    return res.json({ ok: true, units: listProductionUnits(),
      visibility: "admin_only_internal",
      realSendAllowed: false, executionEnabled: false });
  });
  app.post(`${PREFIX}/production-units/create`, requireRootAdmin, (req, res) => {
    const body = (req.body ?? {}) as any;
    recordAudit("root_admin", "production_unit.create_attempted",
      `${body.unitType ?? ""}:${String(body.unitName ?? "").slice(0,120)}`);
    if (!body.unitName || !body.unitType) {
      return res.status(400).json({ ok: false, error: "unit_name_and_type_required" });
    }
    const r = createProductionUnit({
      unitName: body.unitName, unitType: body.unitType,
      productionId: body.productionId ?? null,
      roomId: body.roomId ?? null,
      avatarIds: body.avatarIds ?? [],
      voiceAssetIds: body.voiceAssetIds ?? [],
      meshyJobIds: body.meshyJobIds ?? [],
      runwayJobIds: body.runwayJobIds ?? [],
      fourDCuePlanId: body.fourDCuePlanId ?? null,
      mediaPackageIds: body.mediaPackageIds ?? [],
    });
    recordAudit("root_admin", "production_unit.created",
      `${r.record.unitId}:${r.record.unitType}`);
    return res.json({ ok: true, unit: r.record,
      visibility: "admin_only_internal",
      realSendAllowed: false, executionEnabled: false });
  });
  app.get(`${PREFIX}/production-units/:unitId`, requireRootAdmin, (req, res) => {
    const r = getProductionUnit(String(req.params.unitId));
    if (!r) return res.status(404).json({ ok: false, error: "unit_not_found" });
    return res.json({ ok: true, unit: r });
  });

  /* ---- Media & Content Pipeline (draft/internal-only) --------------- */
  app.get(`${PREFIX}/media-pipeline/packages`, requireRootAdmin, (_req, res) => {
    return res.json({ ok: true, packages: listMediaPackages(),
      visibility: "admin_only_internal",
      realSendAllowed: false, executionEnabled: false });
  });
  app.post(`${PREFIX}/media-pipeline/generate`, requireRootAdmin, (req, res) => {
    const body = (req.body ?? {}) as any;
    recordAudit("root_admin", "media_pipeline.generate_attempted",
      String(body.prompt ?? body.sourceTopic ?? "").slice(0, 200));
    const r = generateMediaPackage({
      prompt: body.prompt ?? body.sourceTopic ?? "",
      productionId: body.productionId ?? null,
      packageType: body.packageType,
      sourceTopic: body.sourceTopic,
      targetFormat: body.targetFormat,
    });
    recordAudit("root_admin", "media_pipeline.generated",
      `${r.record.packageId}:${r.record.packageType}`);
    return res.json({ ok: true, package: r.record,
      visibility: "admin_only_internal",
      realSendAllowed: false, executionEnabled: false });
  });
  app.post(
    `${PREFIX}/media-pipeline/packages/:packageId/3d-selection`,
    requireRootAdmin,
    (req, res) => {
      const packageId = String(req.params.packageId);
      const body = (req.body ?? {}) as any;
      const parseRef = (v: unknown): string | null | undefined => {
        if (v === undefined) return undefined;
        if (v === null || v === "") return null;
        if (typeof v !== "string") return undefined;
        const s = v.trim();
        if (s.length === 0) return null;
        if (s.length > 120) return s.slice(0, 120);
        return s;
      };
      const setManifestId = parseRef(body.setManifestId);
      const rigAssetId = parseRef(body.rigAssetId);
      if (setManifestId === undefined && rigAssetId === undefined) {
        recordAudit(
          "root_admin",
          "media_pipeline.package.3d_selection.rejected",
          `${packageId}:no_fields`,
        );
        return err(res, 400, "no_selection_fields");
      }
      const existing = getMediaPackage(packageId);
      if (!existing) {
        recordAudit(
          "root_admin",
          "media_pipeline.package.3d_selection.rejected",
          `${packageId}:not_found`,
        );
        return err(res, 404, "package_not_found");
      }
      const r = updateMediaPackage3DSelection(packageId, {
        ...(setManifestId !== undefined ? { setManifestId } : {}),
        ...(rigAssetId !== undefined ? { rigAssetId } : {}),
      });
      if (!r.ok) {
        recordAudit(
          "root_admin",
          "media_pipeline.package.3d_selection.rejected",
          `${packageId}:${r.error}`,
        );
        return err(res, 404, r.error);
      }
      recordAudit(
        "root_admin",
        "media_pipeline.package.3d_selection.saved",
        `${packageId}:set=${r.record.setManifestId ?? "null"}:rig=${r.record.rigAssetId ?? "null"}`,
      );
      return res.json({
        ok: true,
        package: r.record,
        visibility: "admin_only_internal",
        realSendAllowed: false,
        executionEnabled: false,
      });
    },
  );
  app.post(`${PREFIX}/media-pipeline/news-to-debate`, requireRootAdmin, (req, res) => {
    const body = (req.body ?? {}) as any;
    recordAudit("root_admin", "media_pipeline.news_to_debate_attempted",
      String(body.newsTopic ?? "").slice(0, 200));
    if (!body.newsTopic) {
      return res.status(400).json({ ok: false, error: "news_topic_required" });
    }
    const r = generateNewsToDebatePackage({
      newsTopic: body.newsTopic,
      productionId: body.productionId ?? null,
    });
    recordAudit("root_admin", "media_pipeline.news_to_debate_generated",
      `${r.record.packageId}:${r.record.sourceTopic.slice(0,80)}`);
    return res.json({ ok: true, package: r.record,
      visibility: "admin_only_internal",
      realSendAllowed: false, executionEnabled: false });
  });

  /* ---- Guided Production Wizard (draft/internal-only, mock) --------- */
  app.get(`${PREFIX}/wizard/status`, requireRootAdmin, (_req, res) => {
    recordAudit("root_admin", "wizard.status_viewed", "wizard");
    return res.json({
      ok: true,
      productionTypes: WIZARD_PRODUCTION_TYPES,
      steps: [
        { n: 1, key: "production_type", label: "Production Type" },
        { n: 2, key: "prompt",          label: "Prompt / Topic" },
        { n: 3, key: "room",            label: "Room Generation" },
        { n: 4, key: "avatar_accessories", label: "Avatar & Accessories" },
        { n: 5, key: "media_package",   label: "Media Package" },
        { n: 6, key: "four_d_cues",     label: "4D Cue Suggestions" },
        { n: 7, key: "cinematic_preview", label: "Cinematic Preview" },
        { n: 8, key: "save_draft",      label: "Save Draft Package" },
      ],
      sessions: listProductionWizardSessions().slice(0, 25),
      adminPreviewOnly: true, notRendered: true, notPublished: true,
      noUnrealExecution: true, noFourDHardware: true,
      visibility: "admin_only_internal",
      realSendAllowed: false, executionEnabled: false,
    });
  });
  app.get(`${PREFIX}/wizard/history`, requireRootAdmin, (_req, res) => {
    recordAudit("root_admin", "wizard.history_viewed", "all");
    return res.json({ ok: true,
      sessions: listProductionWizardSessions(),
      adminPreviewOnly: true, notRendered: true, notPublished: true,
      noUnrealExecution: true, noFourDHardware: true,
      visibility: "admin_only_internal",
      realSendAllowed: false, executionEnabled: false });
  });
  app.post(`${PREFIX}/wizard/start`, requireRootAdmin, (req, res) => {
    const parsed = WizardStartInputSchema.safeParse(req.body);
    if (!parsed.success) return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    try {
      const r = startProductionWizard({
        productionType: parsed.data.productionType,
        prompt: parsed.data.prompt,
        productionId: parsed.data.productionId ?? null,
      });
      recordAudit("root_admin", "wizard.started",
        `${r.record.wizardId}:${r.record.productionType}`);
      return res.json({ ok: true, wizard: r.record,
        adminPreviewOnly: true, notRendered: true, notPublished: true,
        noUnrealExecution: true, noFourDHardware: true,
        visibility: "admin_only_internal",
        realSendAllowed: false, executionEnabled: false });
    } catch (e) {
      return err(res, 400, String((e as Error).message));
    }
  });
  app.post(`${PREFIX}/wizard/:wizardId/step`, requireRootAdmin, (req, res) => {
    const wid = String(req.params.wizardId);
    const parsed = WizardStepInputSchema.safeParse(req.body);
    if (!parsed.success) return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    try {
      const r = advanceProductionWizardStep(wid, parsed.data.step);
      recordAudit("root_admin", "wizard.step_completed",
        `${wid}:step_${parsed.data.step}`);
      return res.json({ ok: true, wizard: r.record,
        adminPreviewOnly: true, notRendered: true, notPublished: true,
        noUnrealExecution: true, noFourDHardware: true,
        visibility: "admin_only_internal",
        realSendAllowed: false, executionEnabled: false });
    } catch (e) {
      const msg = String((e as Error).message);
      const code = msg === "wizard_not_found" ? 404 : 400;
      return err(res, code, msg);
    }
  });
  app.post(`${PREFIX}/wizard/:wizardId/finalize`, requireRootAdmin, (req, res) => {
    const wid = String(req.params.wizardId);
    try {
      const r = finalizeProductionWizard(wid);
      recordAudit("root_admin", "wizard.finalized", wid);
      return res.json({ ok: true, wizard: r.record,
        adminPreviewOnly: true, notRendered: true, notPublished: true,
        noUnrealExecution: true, noFourDHardware: true,
        visibility: "admin_only_internal",
        realSendAllowed: false, executionEnabled: false });
    } catch (e) {
      const msg = String((e as Error).message);
      const code = msg === "wizard_not_found" ? 404 : 400;
      return err(res, code, msg);
    }
  });
  app.post(`${PREFIX}/wizard/:wizardId/send-to-review`, requireRootAdmin, (req, res) => {
    const wid = String(req.params.wizardId);
    const parsed = WizardSendToReviewInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    try {
      const r = sendWizardToReview(wid);
      recordAudit("root_admin", "wizard.sent_to_review",
        `${wid}:${r.productionId}:${r.approvalStage}`);
      return res.json({
        ok: true,
        review: r.review,
        wizard: r.wizard,
        productionId: r.productionId,
        readinessReportId: r.readinessReportId,
        approvalStage: r.approvalStage,
        approvalTransition: r.approvalTransition,
        adminPreviewOnly: true, notRendered: true, notPublished: true,
        noUnrealExecution: true, noFourDHardware: true,
        visibility: "admin_only_internal",
        realSendAllowed: false, executionEnabled: false,
      });
    } catch (e) {
      const msg = String((e as Error).message);
      const code = msg === "wizard_not_found" || msg === "production_not_found"
        ? 404 : 400;
      return err(res, code, msg);
    }
  });
  app.get(`${PREFIX}/wizard/:wizardId`, requireRootAdmin, (req, res) => {
    const wid = String(req.params.wizardId);
    const w = getProductionWizard(wid);
    if (!w) return err(res, 404, "wizard_not_found");
    recordAudit("root_admin", "wizard.viewed", wid);
    const review = getWizardReviewLinkByWizardId(wid);
    return res.json({ ok: true, wizard: w, review,
      adminPreviewOnly: true, notRendered: true, notPublished: true,
      noUnrealExecution: true, noFourDHardware: true,
      visibility: "admin_only_internal",
      realSendAllowed: false, executionEnabled: false });
  });

  /* ---- Admin Preview Screen (draft/internal-only, mock) ------------- */
  app.get(`${PREFIX}/preview/list`, requireRootAdmin, (req, res) => {
    const pid = (req.query?.productionId as string | undefined) || undefined;
    const snapshots = listPreviewSnapshots(pid);
    return res.json({ ok: true, snapshots,
      adminPreviewOnly: true, notRendered: true, notPublished: true,
      noUnrealExecution: true, noFourDHardware: true,
      visibility: "admin_only_internal",
      realSendAllowed: false, executionEnabled: false });
  });
  app.get(`${PREFIX}/preview/by-id/:previewId`, requireRootAdmin, (req, res) => {
    const id = String(req.params.previewId);
    const snap = getPreviewSnapshotById(id);
    if (!snap) return res.status(404).json({ ok: false, error: "preview_not_found" });
    recordAudit("root_admin", "preview.cinematic.viewed", id);
    return res.json({ ok: true, snapshot: snap,
      adminPreviewOnly: true, notRendered: true, notPublished: true,
      noUnrealExecution: true, noFourDHardware: true,
      visibility: "admin_only_internal",
      realSendAllowed: false, executionEnabled: false });
  });
  app.get(`${PREFIX}/preview/:productionId`, requireRootAdmin, (req, res) => {
    const id = String(req.params.productionId);
    recordAudit("root_admin", "preview.viewed", id);
    const snapshot = getLatestPreviewSnapshot(id);
    return res.json({ ok: true,
      productionId: id, snapshot,
      history: listPreviewSnapshots(id).slice(0, 50),
      adminPreviewOnly: true, notRendered: true, notPublished: true,
      noUnrealExecution: true, noFourDHardware: true,
      visibility: "admin_only_internal",
      realSendAllowed: false, executionEnabled: false });
  });
  app.post(`${PREFIX}/preview/:productionId/generate-cinematic`, requireRootAdmin, (req, res) => {
    const id = String(req.params.productionId);
    const body = (req.body ?? {}) as any;
    recordAudit("root_admin", "preview.cinematic.generate_attempted", id);
    try {
      const r = generateCinematicPreview({
        productionId: id,
        previewMode: body.previewMode,
        layoutPreset: body.layoutPreset,
        roomId: body.roomId ?? body.selectedRoomId ?? null,
        avatarIds: body.avatarIds ?? body.selectedAvatarIds ?? [],
        selectedMediaPackageIds: body.selectedMediaPackageIds ?? [],
        selectedCueIds: body.selectedCueIds ?? [],
        cameraPreset: body.cameraPreset,
        lightingPreset: body.lightingPreset,
        lowerThirdText: body.lowerThirdText,
        tickerText: body.tickerText,
        panelSummary: body.panelSummary,
        mediaPackageType: body.mediaPackageType ?? null,
      });
      recordAudit("root_admin", "preview.cinematic.generated", r.record.snapshotId);
      return res.json({ ok: true, snapshot: r.record,
        adminPreviewOnly: true, notRendered: true, notPublished: true,
        noUnrealExecution: true, noFourDHardware: true,
        visibility: "admin_only_internal",
        realSendAllowed: false, executionEnabled: false });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      return res.status(msg === "production_not_found" ? 404 : 400)
        .json({ ok: false, error: msg });
    }
  });
  app.post(`${PREFIX}/preview/:previewId/duplicate`, requireRootAdmin, (req, res) => {
    const id = String(req.params.previewId);
    try {
      const r = duplicatePreviewSnapshot(id);
      recordAudit("root_admin", "preview.cinematic.duplicated",
        `${id}->${r.record.snapshotId}`);
      return res.json({ ok: true, snapshot: r.record,
        adminPreviewOnly: true, notRendered: true, notPublished: true,
        noUnrealExecution: true, noFourDHardware: true,
        visibility: "admin_only_internal",
        realSendAllowed: false, executionEnabled: false });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      return res.status(msg === "preview_not_found" ? 404 : 400)
        .json({ ok: false, error: msg });
    }
  });
  app.post(`${PREFIX}/preview/:previewId/update-layout`, requireRootAdmin, (req, res) => {
    const id = String(req.params.previewId);
    const body = (req.body ?? {}) as any;
    try {
      const r = updatePreviewLayout(id, body);
      recordAudit("root_admin", "preview.cinematic.layout_updated", id);
      return res.json({ ok: true, snapshot: r.record,
        adminPreviewOnly: true, notRendered: true, notPublished: true,
        noUnrealExecution: true, noFourDHardware: true,
        visibility: "admin_only_internal",
        realSendAllowed: false, executionEnabled: false });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      return res.status(msg === "preview_not_found" ? 404 : 400)
        .json({ ok: false, error: msg });
    }
  });
  app.post(`${PREFIX}/preview/:productionId/generate`, requireRootAdmin, (req, res) => {
    const id = String(req.params.productionId);
    const body = (req.body ?? {}) as any;
    recordAudit("root_admin", "preview.generate_attempted", id);
    try {
      const r = generatePreviewSnapshot({
        productionId: id,
        roomId: body.roomId ?? null,
        avatarIds: body.avatarIds ?? [],
        mediaPackageType: body.mediaPackageType ?? null,
      });
      recordAudit("root_admin", "preview.generated", `${r.record.snapshotId}`);
      return res.json({ ok: true, snapshot: r.record,
        adminPreviewOnly: true, notRendered: true, notPublished: true,
        noUnrealExecution: true, noFourDHardware: true,
        visibility: "admin_only_internal",
        realSendAllowed: false, executionEnabled: false });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const status = msg === "production_not_found" ? 404 : 400;
      return res.status(status).json({ ok: false, error: msg });
    }
  });

  /* ---- Real Unreal Live Command Migration Plan (planning only) ------ */
  app.get(
    `${PREFIX}/real-unreal/migration-plan/status`,
    requireRootAdmin,
    (_req, res) => {
      const status = getRealUnrealMigrationPlanStatus();
      recordAudit(
        "root_admin",
        "real_unreal.migration_plan.status_viewed",
        `blockers=${status.blockers.length}:plans=${status.counts.totalPlans}`,
      );
      return res.json({ ok: true, ...status });
    },
  );
  app.post(
    `${PREFIX}/real-unreal/migration-plan/generate`,
    requireRootAdmin,
    (_req, res) => {
      recordAudit("root_admin", "real_unreal.migration_plan.generate_attempted", "");
      const result = generateRealUnrealMigrationPlan();
      recordAudit(
        "root_admin",
        "real_unreal.migration_plan.generated",
        `${result.record.id}:blockers=${result.record.blockers.length}`,
      );
      return res.json({
        ok: result.ok,
        message: result.message,
        record: result.record,
        liveExecutionEnabled: false,
        realSendAllowed: false,
        executionEnabled: false,
        emergencyLocked: true,
      });
    },
  );
  app.get(
    `${PREFIX}/real-unreal/migration-plan/history`,
    requireRootAdmin,
    (_req, res) => {
      const history = listRealUnrealMigrationPlanHistory();
      recordAudit(
        "root_admin",
        "real_unreal.migration_plan.history_viewed",
        `n=${history.length}`,
      );
      return res.json({
        ok: true, history,
        liveExecutionEnabled: false,
        realSendAllowed: false,
        executionEnabled: false,
        emergencyLocked: true,
      });
    },
  );
  app.get(
    `${PREFIX}/real-unreal/migration-plan/export`,
    requireRootAdmin,
    (_req, res) => {
      const exportPayload = exportRealUnrealMigrationPlan();
      recordAudit(
        "root_admin",
        "real_unreal.migration_plan.exported",
        `history=${exportPayload.history.length}:milestones=${exportPayload.milestones.length}`,
      );
      return res.json({ ok: true, export: exportPayload });
    },
  );

  /* ---- Real Unreal Level-Load Contract (contract-only, no execution) ---- */
  app.get(
    `${PREFIX}/real-unreal/level-load-contract/status`,
    requireRootAdmin,
    (_req, res) => {
      const status = getRealUnrealLevelLoadContractStatus();
      recordAudit(
        "root_admin",
        "real_unreal.level_load_contract.status_viewed",
        `total=${status.counts.total}:created=${status.counts.created}:rejected=${status.counts.rejected}`,
      );
      return res.json({ ok: true, ...status });
    },
  );
  app.post(
    `${PREFIX}/real-unreal/level-load-contract/:productionId/validate`,
    requireRootAdmin,
    (req, res) => {
      recordAudit(
        "root_admin",
        "real_unreal.level_load_contract.validation_attempted",
        `${req.params.productionId}`,
      );
      const parsed = RealUnrealLevelLoadContractValidateInputSchema.safeParse({
        productionId: req.params.productionId,
        proposedLevelName: req.body?.proposedLevelName,
      });
      if (!parsed.success) {
        recordAudit(
          "root_admin",
          "real_unreal.level_load_contract.validation_failed",
          `${req.params.productionId}:invalid_body:${parsed.error.issues.map((i) => i.path.join(".")).join(",")}`,
        );
        return err(res, 400, "invalid_body", {
          issues: parsed.error.issues,
          realSendAllowed: false,
          executionEnabled: false,
        });
      }
      const result = validateRealUnrealLevelLoadContract(parsed.data);
      recordAudit(
        "root_admin",
        result.ok
          ? "real_unreal.level_load_contract.validation_passed"
          : "real_unreal.level_load_contract.validation_failed",
        `${parsed.data.productionId}:${parsed.data.proposedLevelName}:${result.errorCodes.join(",")}`,
      );
      const { ok: _ok, ...rest } = result;
      return res.json({ ok: result.ok, ...rest });
    },
  );
  app.post(
    `${PREFIX}/real-unreal/level-load-contract/:productionId/create`,
    requireRootAdmin,
    (req, res) => {
      recordAudit(
        "root_admin",
        "real_unreal.level_load_contract.create_attempted",
        `${req.params.productionId}`,
      );
      const parsed = RealUnrealLevelLoadContractCreateInputSchema.safeParse({
        productionId: req.params.productionId,
        proposedLevelName: req.body?.proposedLevelName,
        confirm: req.body?.confirm,
      });
      if (!parsed.success) {
        recordAudit(
          "root_admin",
          "real_unreal.level_load_contract.rejected",
          `${req.params.productionId}:invalid_body:${parsed.error.issues.map((i) => i.path.join(".")).join(",")}`,
        );
        return err(res, 400, "invalid_body", {
          issues: parsed.error.issues,
          realSendAllowed: false,
          executionEnabled: false,
        });
      }
      const result = createRealUnrealLevelLoadContract(parsed.data);
      if (!result.ok) {
        recordAudit(
          "root_admin",
          "real_unreal.level_load_contract.rejected",
          `${parsed.data.productionId}:${parsed.data.proposedLevelName}:${result.errorCodes.join(",")}`,
        );
        const httpStatus = result.errorCodes.includes("production_not_found")
          ? 404
          : 400;
        return res.status(httpStatus).json({
          ok: false,
          status: result.status,
          message: result.message,
          errorCodes: result.errorCodes,
          realSendAllowed: false,
          executionEnabled: false,
        });
      }
      recordAudit(
        "root_admin",
        "real_unreal.level_load_contract.created",
        `${result.record?.id}:${parsed.data.productionId}:${parsed.data.proposedLevelName}`,
      );
      return res.json({
        ok: true,
        status: result.status,
        message: result.message,
        record: result.record,
        realSendAllowed: false,
        executionEnabled: false,
      });
    },
  );
  app.get(
    `${PREFIX}/real-unreal/level-load-contract/history`,
    requireRootAdmin,
    (req, res) => {
      const productionId =
        typeof req.query.productionId === "string"
          ? req.query.productionId
          : undefined;
      const history = listRealUnrealLevelLoadContractHistory(productionId);
      recordAudit(
        "root_admin",
        "real_unreal.level_load_contract.history_viewed",
        `${productionId ?? "all"}:n=${history.length}`,
      );
      return res.json({
        ok: true,
        productionId: productionId ?? null,
        history,
        realSendAllowed: false,
        executionEnabled: false,
      });
    },
  );

  /* ---- Real Unreal Command Approval Gate (governance only, no exec) ---- */
  app.get(
    `${PREFIX}/real-unreal/command-approval/status`,
    requireRootAdmin,
    (_req, res) => {
      const status = getRealUnrealCommandApprovalStatus();
      recordAudit(
        "root_admin",
        "real_unreal.command_approval.status_viewed",
        `total=${status.counts.total}:req=${status.counts.requested}:appr=${status.counts.approved}:rej=${status.counts.rejected}`,
      );
      return res.json({ ok: true, ...status });
    },
  );
  app.post(
    `${PREFIX}/real-unreal/command-approval/request`,
    requireRootAdmin,
    (req, res) => {
      const parsed = RealUnrealCommandApprovalRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        recordAudit(
          "root_admin",
          "real_unreal.command_approval.request_rejected",
          `invalid_body:${parsed.error.issues.map((i) => i.path.join(".")).join(",")}`,
        );
        return err(res, 400, "invalid_body", {
          issues: parsed.error.issues,
          realSendAllowed: false,
          executionEnabled: false,
        });
      }
      const result = requestRealUnrealCommandApproval(parsed.data);
      if (!result.ok) {
        recordAudit(
          "root_admin",
          "real_unreal.command_approval.request_rejected",
          `${parsed.data.productionId}:${parsed.data.commandType}:${result.errorCodes.join(",")}`,
        );
        const httpStatus = result.errorCodes.includes("production_not_found")
          ? 404
          : 400;
        return res.status(httpStatus).json({
          ok: false,
          status: result.status,
          message: result.message,
          errorCodes: result.errorCodes,
          realSendAllowed: false,
          executionEnabled: false,
        });
      }
      return res.json({
        ok: true,
        status: result.status,
        message: result.message,
        record: result.record,
        realSendAllowed: false,
        executionEnabled: false,
      });
    },
  );
  app.post(
    `${PREFIX}/real-unreal/command-approval/decision`,
    requireRootAdmin,
    (req, res) => {
      const parsed = RealUnrealCommandApprovalDecisionSchema.safeParse(req.body);
      if (!parsed.success) {
        recordAudit(
          "root_admin",
          "real_unreal.command_approval.decision_rejected",
          `invalid_body:${parsed.error.issues.map((i) => i.path.join(".")).join(",")}`,
        );
        return err(res, 400, "invalid_body", {
          issues: parsed.error.issues,
          realSendAllowed: false,
          executionEnabled: false,
        });
      }
      const result = decideRealUnrealCommandApproval(parsed.data);
      if (!result.ok) {
        recordAudit(
          "root_admin",
          "real_unreal.command_approval.decision_rejected",
          `${parsed.data.id}:${result.errorCodes.join(",")}`,
        );
        const httpStatus = result.errorCodes.includes("request_not_found")
          ? 404
          : 400;
        return res.status(httpStatus).json({
          ok: false,
          status: result.status,
          message: result.message,
          errorCodes: result.errorCodes,
          realSendAllowed: false,
          executionEnabled: false,
        });
      }
      return res.json({
        ok: true,
        status: result.status,
        message: result.message,
        record: result.record,
        realSendAllowed: false,
        executionEnabled: false,
      });
    },
  );
  app.get(
    `${PREFIX}/real-unreal/command-approval/history`,
    requireRootAdmin,
    (req, res) => {
      const productionId =
        typeof req.query.productionId === "string"
          ? req.query.productionId
          : undefined;
      const history = listRealUnrealCommandApprovalHistory(productionId);
      recordAudit(
        "root_admin",
        "real_unreal.command_approval.history_viewed",
        `${productionId ?? "all"}:n=${history.length}`,
      );
      return res.json({
        ok: true,
        productionId: productionId ?? null,
        history,
        realSendAllowed: false,
        executionEnabled: false,
      });
    },
  );

  app.get(
    `${PREFIX}/real-unreal/render-preview-contract/history`,
    requireRootAdmin,
    (req, res) => {
      const productionId = typeof req.query.productionId === "string"
        ? req.query.productionId : undefined;
      const history = listRealUnrealRenderPreviewContractHistory(productionId);
      recordAudit(
        "root_admin",
        "real_unreal.render_preview_contract.history_viewed",
        `${productionId ?? "all"}:n=${history.length}`,
      );
      return res.json({ ok: true, productionId: productionId ?? null, history });
    },
  );

  app.get(
    `${PREFIX}/real-unreal/dry-run-validation/history`,
    requireRootAdmin,
    (req, res) => {
      const productionId = typeof req.query.productionId === "string"
        ? req.query.productionId : undefined;
      const history = listRealUnrealDryRunValidationHistory(productionId);
      recordAudit(
        "root_admin", "real_unreal.dry_run.history_viewed",
        `${productionId ?? "all"}:n=${history.length}`,
      );
      return res.json({ ok: true, productionId: productionId ?? null, history });
    },
  );

  /* ---- Production Approval Board (internal workflow only) ---- */
  app.get(`${PREFIX}/approval-board`, requireRootAdmin, (_req, res) => {
    const board = getApprovalBoard();
    recordAudit("root_admin", "approval_board.viewed", `n=${board.length}`);
    return res.json({
      ok: true, board,
      realSendAllowed: false, publishingEnabled: false, autoApprovalEnabled: false,
    });
  });

  app.get(`${PREFIX}/approval-board/:productionId`, requireRootAdmin, (req, res) => {
    const id = String(req.params.productionId);
    const detail = getApprovalBoardProduction(id);
    recordAudit("root_admin", "approval_board.production_viewed", id);
    if (!detail) return res.status(404).json({ ok: false, error: "production_not_found" });
    return res.json({
      ok: true, ...detail,
      realSendAllowed: false, publishingEnabled: false, autoApprovalEnabled: false,
    });
  });

  app.post(`${PREFIX}/approval-board/:productionId/transition`, requireRootAdmin, (req, res) => {
    const id = String(req.params.productionId);
    const toState = String((req.body ?? {}).toState ?? "");
    const reason = typeof (req.body ?? {}).reason === "string" ? (req.body ?? {}).reason : "";
    recordAudit("root_admin", "approval_board.transition_attempted", `${id}:→${toState}`);
    const result = transitionApprovalStage({
      productionId: id, toState: toState as any, reason,
    });
    if (!result.ok) {
      recordAudit(
        "root_admin", "approval_board.transition_rejected",
        `${id}:${result.fromState}→${result.toState}:${result.error}`,
      );
      const status = result.error === "production_not_found" ? 404 : 400;
      return res.status(status).json({
        ok: false, error: result.error, message: result.message,
        fromState: result.fromState, toState: result.toState,
      });
    }
    recordAudit(
      "root_admin", "approval_board.transition_accepted",
      `${id}:${result.fromState}→${result.toState}`,
    );
    return res.json({
      ok: true, productionId: id,
      fromState: result.fromState, toState: result.toState,
      entry: result.entry, readinessReportId: result.readinessReportId,
      realSendAllowed: false, publishingEnabled: false, autoApprovalEnabled: false,
    });
  });

  app.get(`${PREFIX}/approval-board/:productionId/history`, requireRootAdmin, (req, res) => {
    const id = String(req.params.productionId);
    const history = listApprovalHistory(id);
    recordAudit("root_admin", "approval_board.history_viewed", `${id}:n=${history.length}`);
    return res.json({ ok: true, productionId: id, history });
  });

  /* ---- Production Readiness Scoring (internal analysis only) ---- */
  app.get(`${PREFIX}/readiness/:productionId`, requireRootAdmin, (req, res) => {
    const id = String(req.params.productionId);
    const latest = getLatestReadinessReport(id);
    recordAudit("root_admin", "readiness.viewed", id);
    return res.json({
      ok: true,
      productionId: id,
      hasReport: !!latest,
      report: latest,
      futureRealUnrealEnabled: false,
      futureReal4DEnabled: false,
      realSendAllowed: false,
      publishingEnabled: false,
      autoApprovalEnabled: false,
    });
  });

  app.post(`${PREFIX}/readiness/:productionId/analyze`, requireRootAdmin, (req, res) => {
    const id = String(req.params.productionId);
    recordAudit("root_admin", "readiness.analysis_requested", id);
    const report = analyzeProductionReadiness(id);
    if (!report) {
      return res.status(404).json({ ok: false, error: "production_not_found" });
    }
    recordAudit(
      "root_admin",
      "readiness.analysis_completed",
      `${id}:${report.overallScore}:b${report.blockers.length}/w${report.warnings.length}`,
    );
    return res.json({
      ok: true,
      productionId: id,
      report,
      futureRealUnrealEnabled: false,
      futureReal4DEnabled: false,
      realSendAllowed: false,
      publishingEnabled: false,
      autoApprovalEnabled: false,
    });
  });

  app.get(`${PREFIX}/readiness/:productionId/history`, requireRootAdmin, (req, res) => {
    const id = String(req.params.productionId);
    const reports = listReadinessReports(id);
    recordAudit("root_admin", "readiness.history_viewed", `${id}:n=${reports.length}`);
    return res.json({ ok: true, productionId: id, reports });
  });

  /* ---- 4D Hardware Sandbox (mock-only, never controls physical HW) ---- */
  app.get(`${PREFIX}/4d/sandbox/health`, requireRootAdmin, (_req, res) => {
    const h = getFourDSandboxHealth();
    recordAudit("root_admin", "4d.sandbox.health_viewed", "");
    return res.json(h);
  });

  app.get(`${PREFIX}/4d/sandbox/supported-effects`, requireRootAdmin, (_req, res) => {
    const effects = listFourDSandboxSupportedEffects();
    const examples = listFourDSandboxExampleCues();
    recordAudit("root_admin", "4d.sandbox.effects_viewed", `n=${effects.length}`);
    return res.json({
      ok: true,
      mode: "4d_sandbox",
      dryRunOnly: true,
      realSendAllowed: false,
      effects,
      examples,
    });
  });

  app.post(`${PREFIX}/4d/sandbox/validate-cue`, requireRootAdmin, (req, res) => {
    const result = validateFourDSandboxCue(req.body);
    if (result.ok) {
      recordAudit("root_admin", "4d.sandbox.cue_validated", "ok");
    } else {
      recordAudit(
        "root_admin",
        "4d.sandbox.cue_rejected",
        result.errorCodes.join(",") || "unknown",
      );
    }
    return res.json({
      ok: true,
      mode: "4d_sandbox",
      dryRunOnly: true,
      realSendAllowed: false,
      validation: result,
    });
  });

  app.post(`${PREFIX}/4d/sandbox/send`, requireRootAdmin, (req, res) => {
    recordAudit("root_admin", "4d.sandbox.send_attempted", "");
    const result = sendFourDSandboxCue(req.body);
    if (result.accepted) {
      recordAudit(
        "root_admin",
        "4d.sandbox.accepted",
        `${result.job.productionId}:${result.job.effectType}:${result.job.id}`,
      );
    } else {
      recordAudit(
        "root_admin",
        "4d.sandbox.cue_rejected",
        result.errorCodes.join(",") || "unknown",
      );
    }
    return res.json({
      ok: true,
      mode: "4d_sandbox",
      realSendAllowed: false,
      dryRun: true,
      accepted: result.accepted,
      cueJobId: result.job.id,
      status: result.job.status,
      message: result.accepted
        ? "4D sandbox cue accepted. No real hardware command was sent."
        : "4D sandbox cue rejected. No real hardware command was sent.",
      failures: result.failures,
      errorCodes: result.errorCodes,
      job: result.job,
    });
  });

  app.get(`${PREFIX}/4d/sandbox/history`, requireRootAdmin, (req, res) => {
    const pid = typeof req.query.productionId === "string" ? req.query.productionId : undefined;
    const jobs = listFourDSandboxJobs(pid);
    recordAudit("root_admin", "4d.sandbox.history_viewed", `count=${jobs.length}`);
    return res.json({ ok: true, jobs });
  });

  /* ---- Local Unreal Bridge Stub (mock-only, never connects to UE) ---- */
  app.get(`${PREFIX}/local-bridge/stub/health`, requireRootAdmin, (_req, res) => {
    const h = getLocalBridgeStubHealth();
    recordAudit("root_admin", "local_bridge.stub.health_viewed", "");
    return res.json(h);
  });

  app.get(
    `${PREFIX}/local-bridge/stub/supported-commands`,
    requireRootAdmin,
    (_req, res) => {
      const cmds = listLocalBridgeStubSupportedCommands();
      recordAudit("root_admin", "local_bridge.stub.commands_viewed", `n=${cmds.length}`);
      return res.json({
        ok: true,
        mode: "local_stub",
        dryRunOnly: true,
        realSendAllowed: false,
        commands: cmds,
      });
    },
  );

  app.post(`${PREFIX}/local-bridge/stub/send`, requireRootAdmin, (req, res) => {
    recordAudit("root_admin", "local_bridge.stub.send_attempted", "");
    const result = sendLocalBridgeStub(req.body);
    recordAudit(
      "root_admin",
      result.accepted ? "local_bridge.stub.accepted" : "local_bridge.stub.rejected",
      `${result.job.productionId}:${result.job.commandType}:${result.job.id}`,
    );
    return res.json({
      ok: true,
      mode: "local_stub",
      dryRunOnly: true,
      realSendAllowed: false,
      accepted: result.accepted,
      bridgeJobId: result.job.id,
      status: result.job.status,
      failures: result.failures,
      errorCodes: result.errorCodes,
      job: result.job,
    });
  });

  app.get(`${PREFIX}/local-bridge/stub/history`, requireRootAdmin, (req, res) => {
    const pid = typeof req.query.productionId === "string" ? req.query.productionId : undefined;
    const jobs = listLocalBridgeStubJobs(pid);
    recordAudit("root_admin", "local_bridge.stub.history_viewed", `count=${jobs.length}`);
    return res.json({ ok: true, jobs });
  });

  /* ---- Unreal Local Bridge Contract (docs + validation only) ---- */
  app.get(`${PREFIX}/unreal/bridge-contract`, requireRootAdmin, (_req, res) => {
    const contract = getBridgeContract();
    recordAudit("root_admin", "unreal.bridge_contract.viewed", `v=${contract.version}`);
    return res.json({ ok: true, contract });
  });

  app.get(
    `${PREFIX}/unreal/bridge-contract/example-payloads`,
    requireRootAdmin,
    (_req, res) => {
      const examples = getExamplePayloads();
      recordAudit("root_admin", "unreal.bridge_contract.examples_viewed", `n=${examples.length}`);
      return res.json({
        ok: true,
        examples,
        mode: "local_bridge",
        realSendAllowed: false,
        dryRun: true,
      });
    },
  );

  app.get(
    `${PREFIX}/unreal/bridge-contract/export`,
    requireRootAdmin,
    (_req, res) => {
      const contract = getBridgeContract();
      const examples = getExamplePayloads();
      recordAudit("root_admin", "unreal.bridge_contract.exported", `v=${contract.version}`);
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="mougle-unreal-bridge-contract-${contract.version}.json"`,
      );
      return res.send(
        JSON.stringify(
          { contract, examples, supportedCommandTypes: BRIDGE_COMMAND_TYPES },
          null,
          2,
        ),
      );
    },
  );

  app.post(
    `${PREFIX}/unreal/bridge-contract/validate-payload`,
    requireRootAdmin,
    (req, res) => {
      const result = validateBridgePayload(req.body);
      if (result.ok) {
        recordAudit("root_admin", "unreal.bridge_contract.payload_validated", "ok");
        return res.json({ ok: true, validation: result, mode: "local_bridge", realSendAllowed: false });
      }
      recordAudit(
        "root_admin",
        "unreal.bridge_contract.payload_rejected",
        result.errorCodes.join(",") || "unknown",
      );
      return res.json({
        ok: true,
        validation: result,
        mode: "local_bridge",
        realSendAllowed: false,
      });
    },
  );

  app.get(`${PREFIX}/unreal/sandbox/history`, requireRootAdmin, (req, res) => {
    const pid = typeof req.query.productionId === "string" ? req.query.productionId : undefined;
    const cmds = listUnrealSandboxCommands(pid);
    recordAudit("root_admin", "unreal.sandbox.history.viewed", `count=${cmds.length}`);
    return res.json({ ok: true, commands: cmds });
  });

  /* --- Rooms --- */
  app.get(`${PREFIX}/rooms`, requireRootAdmin, (_req, res) =>
    res.json({ ok: true, rooms: listRooms() }),
  );
  app.post(`${PREFIX}/rooms`, requireRootAdmin, (req, res) => {
    const parsed = RoomCreateSchema.safeParse(req.body);
    if (!parsed.success) return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    return res.json({ ok: true, room: createRoom(parsed.data) });
  });

  /* --- Avatars --- */
  app.get(`${PREFIX}/avatars`, requireRootAdmin, (_req, res) =>
    res.json({ ok: true, avatars: listAvatars() }),
  );
  app.post(`${PREFIX}/avatars`, requireRootAdmin, (req, res) => {
    const parsed = AvatarCreateSchema.safeParse(req.body);
    if (!parsed.success) return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    return res.json({ ok: true, avatar: createAvatar(parsed.data) });
  });

  /* --- Halls --- */
  app.get(`${PREFIX}/halls`, requireRootAdmin, (_req, res) =>
    res.json({ ok: true, halls: listHalls() }),
  );
  app.post(`${PREFIX}/halls`, requireRootAdmin, (req, res) => {
    const parsed = HallCreateSchema.safeParse(req.body);
    if (!parsed.success) return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    return res.json({ ok: true, hall: createHall(parsed.data) });
  });

  /* --- Podcasts --- */
  app.get(`${PREFIX}/podcasts`, requireRootAdmin, (_req, res) =>
    res.json({ ok: true, podcasts: listPodcasts() }),
  );
  app.post(`${PREFIX}/podcasts`, requireRootAdmin, (req, res) => {
    const parsed = PodcastCreateSchema.safeParse(req.body);
    if (!parsed.success) return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    return res.json({ ok: true, podcast: createPodcast(parsed.data) });
  });

  /* --- Newsroom productions --- */
  app.get(`${PREFIX}/newsroom-productions`, requireRootAdmin, (_req, res) =>
    res.json({ ok: true, newsroomProductions: listNewsroomProductions() }),
  );
  app.post(`${PREFIX}/newsroom-productions`, requireRootAdmin, (req, res) => {
    const parsed = NewsroomCreateSchema.safeParse(req.body);
    if (!parsed.success) return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    return res.json({ ok: true, newsroomProduction: createNewsroomProduction(parsed.data) });
  });

  /* --- Productions --- */
  app.get(`${PREFIX}/productions`, requireRootAdmin, (req, res) => {
    const q = req.query;
    const any = ["productionType", "approvalStatus", "roomType", "avatarId", "q", "dateFrom", "dateTo"]
      .some((k) => typeof q[k] === "string" && (q[k] as string).length > 0);
    const productions = any
      ? listProductionsFiltered({
          productionType: q.productionType as string | undefined,
          approvalStatus: q.approvalStatus as string | undefined,
          roomType: q.roomType as string | undefined,
          avatarId: q.avatarId as string | undefined,
          q: q.q as string | undefined,
          dateFrom: q.dateFrom as string | undefined,
          dateTo: q.dateTo as string | undefined,
        })
      : listProductions();
    return res.json({ ok: true, productions });
  });
  app.post(`${PREFIX}/productions`, requireRootAdmin, (req, res) => {
    const parsed = ProductionCreateSchema.safeParse(req.body);
    if (!parsed.success) return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    return res.json({ ok: true, production: createProduction(parsed.data) });
  });
  app.post(`${PREFIX}/productions/:id/approve`, requireRootAdmin, (req, res) => {
    const parsed = ApproveSchema.safeParse(req.body);
    if (!parsed.success) return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    try {
      const p = setProductionStatus(String(req.params.id), parsed.data.status);
      return res.json({ ok: true, production: p });
    } catch (e) {
      return err(res, 404, String((e as Error).message));
    }
  });

  /* --- 4D Cues --- */
  app.get(`${PREFIX}/4d-cues`, requireRootAdmin, (_req, res) =>
    res.json({ ok: true, cues: listFourDCues() }),
  );
  app.post(`${PREFIX}/4d-cues`, requireRootAdmin, (req, res) => {
    const parsed = FourDCueCreateSchema.safeParse(req.body);
    if (!parsed.success) return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    return res.json({ ok: true, cue: createFourDCue(parsed.data) });
  });
  app.post(`${PREFIX}/4d/send-cue`, requireRootAdmin, (req, res) => {
    const parsed = FourDSendSchema.safeParse(req.body);
    if (!parsed.success) return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    const r = sendFourDCue(parsed.data.cueId);
    return res.status(r.ok ? 200 : 409).json({ ok: r.ok, dryRun: r.dryRun, reason: r.reason });
  });
  app.post(`${PREFIX}/4d/send-timeline`, requireRootAdmin, (req, res) => {
    const parsed = FourDTimelineSchema.safeParse(req.body);
    if (!parsed.success) return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    const r = sendFourDTimeline(parsed.data.productionId);
    return res
      .status(r.ok ? 200 : 409)
      .json({ ok: r.ok, dryRun: r.dryRun, cueCount: r.cueCount, reason: r.reason });
  });
  app.get(`${PREFIX}/4d/status`, requireRootAdmin, (_req, res) =>
    res.json({
      ok: true,
      realHardwareSendAllowed: false,
      dryRun: true,
      message:
        "No real 4D hardware bridge is used in this MVP. All sends are mock and never open a socket.",
    }),
  );

  /* --- Unreal --- */
  const unrealRoute = (command: any) =>
    ((req: any, res: any) => {
      const parsed = UnrealSendSchema.safeParse(req.body);
      if (!parsed.success) return err(res, 400, "invalid_body", { issues: parsed.error.issues });
      const cmd = sendUnrealCommand(command, parsed.data.payload, parsed.data.productionId);
      return res.status(cmd.status === "mock_accepted" ? 200 : 409).json({ ok: true, command: cmd });
    }) as RequestHandler;

  app.post(`${PREFIX}/unreal/send-command`, requireRootAdmin, unrealRoute("send_scene_manifest"));
  app.post(`${PREFIX}/unreal/load-level`, requireRootAdmin, unrealRoute("load_level"));
  app.post(`${PREFIX}/unreal/set-camera`, requireRootAdmin, unrealRoute("set_camera"));
  app.post(`${PREFIX}/unreal/set-lighting`, requireRootAdmin, unrealRoute("set_lighting"));
  app.post(`${PREFIX}/unreal/start-sequence`, requireRootAdmin, unrealRoute("start_sequence"));
  app.post(`${PREFIX}/unreal/render`, requireRootAdmin, unrealRoute("render"));
  app.get(`${PREFIX}/unreal/status`, requireRootAdmin, (_req, res) =>
    res.json({
      ok: true,
      realUnrealSendAllowed: false,
      dryRun: true,
      lastCommands: listUnrealCommands().slice(-20),
      message:
        "Unreal Remote Control is not contacted in this MVP. All commands are mock and never open a socket.",
    }),
  );

  /* --- Render jobs / audit / integrations / manifests --- */
  app.get(`${PREFIX}/render-jobs`, requireRootAdmin, (_req, res) =>
    res.json({ ok: true, jobs: listRenderJobs() }),
  );
  app.get(`${PREFIX}/audit`, requireRootAdmin, (req, res) => {
    const lim = Number(req.query.limit);
    const limit = Number.isFinite(lim) && lim > 0 ? Math.min(500, Math.floor(lim)) : 100;
    return res.json({ ok: true, events: listAudit(limit) });
  });
  app.get(`${PREFIX}/integrations`, requireRootAdmin, (_req, res) =>
    res.json({ ok: true, integrations: integrationsStatus() }),
  );
  app.post(`${PREFIX}/integrations/test`, requireRootAdmin, (req, res) => {
    const parsed = z
      .object({ provider: z.enum(INTEGRATION_PROVIDERS) })
      .safeParse(req.body);
    if (!parsed.success) return err(res, 400, "invalid_body", { issues: parsed.error.issues });
    const result = testIntegration(parsed.data.provider);
    return res.json({ ok: true, result });
  });
  /* --- Storage info, manifest snapshots, exports --- */
  app.get(`${PREFIX}/storage-info`, requireRootAdmin, (_req, res) =>
    res.json({ ok: true, storage: getStorageInfo() }),
  );
  app.get(`${PREFIX}/manifest-snapshots`, requireRootAdmin, (_req, res) =>
    res.json({ ok: true, snapshots: listManifestSnapshots() }),
  );
  app.get(`${PREFIX}/manifest-snapshots/:productionId`, requireRootAdmin, (req, res) => {
    const snap = getManifestSnapshot(String(req.params.productionId));
    if (!snap) return err(res, 404, "snapshot_not_found");
    return res.json({ ok: true, snapshot: snap });
  });

  /** Export a single manifest (or the full package) as a downloadable JSON file. */
  app.get(`${PREFIX}/productions/:productionId/export/:type`, requireRootAdmin, (req, res) => {
    const id = String(req.params.productionId);
    const type = String(req.params.type);
    const p = getProduction(id);
    if (!p) return err(res, 404, "production_not_found");
    const room = p.roomId ? getRoom(p.roomId) : undefined;
    const avatars = p.avatarIds.map(getAvatar).filter((a): a is NonNullable<typeof a> => !!a);
    const production = buildProductionManifest(p);
    const unrealScene = buildUnrealSceneManifest(p);
    const avatarManifests = avatars.map((a) => buildAvatarManifest(a));
    const fourDCues = buildFourDCueManifest(p.id);
    let payload: unknown;
    let filename: string;
    switch (type) {
      case "production":
        payload = production;
        filename = `production-${id}.json`;
        break;
      case "unreal":
        payload = unrealScene;
        filename = `unreal-scene-${id}.json`;
        break;
      case "avatar":
        payload = avatarManifests;
        filename = `avatars-${id}.json`;
        break;
      case "4d":
        payload = fourDCues;
        filename = `4d-cues-${id}.json`;
        break;
      case "full":
        payload = {
          productionId: id,
          exportedAt: new Date().toISOString(),
          room: room?.name ?? null,
          production,
          unrealScene,
          avatars: avatarManifests,
          fourDCues,
          voiceAssets: listVoiceAssets(id),
          assetJobs: listAssetJobs(id),
          videoJobs: listVideoJobs(id),
          unrealSandboxCommands: listUnrealSandboxCommands(id),
          localBridgeStubJobs: listLocalBridgeStubJobs(id),
          fourDSandboxJobs: listFourDSandboxJobs(id),
          readinessReport: getLatestReadinessReport(id),
          approvalHistory: listApprovalHistory(id),
          realUnrealHandshakeHistory: listRealUnrealHandshakeHistory()
            .slice(0, 50)
            .map((h) => ({
              id: h.id, mode: h.mode, endpointHost: h.endpointHost,
              status: h.status, realSendAllowed: h.realSendAllowed,
              createdAt: h.createdAt,
            })),
          realUnrealHealthCheckHistory: listRealUnrealHealthCheckHistory()
            .slice(0, 50)
            .map((h) => ({
              id: h.id, mode: h.mode, endpointHost: h.endpointHost,
              endpointPath: h.endpointPath, status: h.status,
              httpStatus: h.httpStatus, realSendAllowed: h.realSendAllowed,
              createdAt: h.createdAt,
            })),
          realUnrealDryRunValidationHistory: listRealUnrealDryRunValidationHistory(id)
            .slice(0, 50)
            .map((r) => ({
              id: r.id, productionId: r.productionId, mode: r.mode,
              validationType: r.validationType, status: r.status,
              realSendAllowed: r.realSendAllowed, endpointHost: r.endpointHost,
              endpointPath: r.endpointPath, httpStatus: r.httpStatus,
              createdAt: r.createdAt,
              failedCheckIds: r.localChecks.filter((c) => !c.ok).map((c) => c.id),
            })),
          realUnrealPrepareSceneDryRunHistory: listRealUnrealPrepareSceneDryRunHistory(id)
            .slice(0, 50)
            .map((r) => ({
              id: r.id, productionId: r.productionId, mode: r.mode,
              commandType: r.commandType, status: r.status,
              realSendAllowed: r.realSendAllowed,
              endpointHost: r.endpointHost, endpointPath: r.endpointPath,
              httpStatus: r.httpStatus, createdAt: r.createdAt,
            })),
          realUnrealSetCameraDryRunHistory: listRealUnrealSetCameraDryRunHistory(id)
            .slice(0, 50)
            .map((r) => ({
              id: r.id, productionId: r.productionId, mode: r.mode,
              commandType: r.commandType, cameraPreset: r.cameraPreset,
              status: r.status, realSendAllowed: r.realSendAllowed,
              endpointHost: r.endpointHost, endpointPath: r.endpointPath,
              httpStatus: r.httpStatus, createdAt: r.createdAt,
            })),
          realUnrealSetLightingDryRunHistory: listRealUnrealSetLightingDryRunHistory(id)
            .slice(0, 50)
            .map((r) => ({
              id: r.id, productionId: r.productionId, mode: r.mode,
              commandType: r.commandType, lightingPreset: r.lightingPreset,
              status: r.status, realSendAllowed: r.realSendAllowed,
              endpointHost: r.endpointHost, endpointPath: r.endpointPath,
              httpStatus: r.httpStatus, createdAt: r.createdAt,
            })),
          realUnrealSetPanelsDryRunHistory: listRealUnrealSetPanelsDryRunHistory(id)
            .slice(0, 50)
            .map((r) => ({
              id: r.id, productionId: r.productionId, mode: r.mode,
              commandType: r.commandType, panelPreset: r.panelPreset,
              status: r.status, realSendAllowed: r.realSendAllowed,
              endpointHost: r.endpointHost, endpointPath: r.endpointPath,
              httpStatus: r.httpStatus, createdAt: r.createdAt,
              sanitizationStats: r.sanitizationStats,
            })),
          realUnrealRenderPreviewContractHistory:
            listRealUnrealRenderPreviewContractHistory(id)
              .slice(0, 50)
              .map((r) => ({
                id: r.id, productionId: r.productionId, mode: r.mode,
                commandType: r.commandType, status: r.status,
                phase: r.phase, realSendAllowed: r.realSendAllowed,
                endpointHost: r.endpointHost, endpointPath: r.endpointPath,
                httpStatus: r.httpStatus, createdAt: r.createdAt,
              })),
          realUnrealSafetySwitchReports:
            listRealUnrealSafetySwitchHistory()
              .slice(0, 50)
              .map((r) => ({
                id: r.id, state: r.state,
                liveExecutionEnabled: r.liveExecutionEnabled,
                realSendAllowed: r.realSendAllowed,
                executionEnabled: r.executionEnabled,
                emergencyLocked: r.emergencyLocked,
                checks: r.checks, blockers: r.blockers,
                warnings: r.warnings, createdAt: r.createdAt,
              })),
          generatedRooms: listGeneratedRooms().slice(0, 50),
          generatedAvatars: listGeneratedAvatars().slice(0, 50),
          avatarAccessories: listAvatarAccessories().slice(0, 50),
          productionUnits: listProductionUnits()
            .filter((u) => u.productionId === id || u.productionId === null)
            .slice(0, 50),
          mediaPackages: listMediaPackages()
            .filter((p) => p.productionId === id || p.productionId === null)
            .slice(0, 50),
          previewSnapshots: listPreviewSnapshots(id).slice(0, 50),
          productionWizardSessions: listProductionWizardSessions()
            .filter((w) => w.productionId === id || w.productionId === null)
            .slice(0, 50)
            .map((w) => ({
              wizardId: w.wizardId,
              productionId: w.productionId,
              productionType: w.productionType,
              prompt: w.prompt,
              currentStep: w.currentStep,
              completedSteps: w.completedSteps,
              generatedRoomId: w.generatedRoomId,
              generatedAvatarIds: w.generatedAvatarIds,
              generatedAccessoryIds: w.generatedAccessoryIds,
              generatedMediaPackageId: w.generatedMediaPackageId,
              generatedPreviewId: w.generatedPreviewId,
              fourDCueSuggestions: w.fourDCueSuggestions,
              status: w.status,
              visibility: w.visibility,
              publicUrl: w.publicUrl,
              signedUrl: w.signedUrl,
              realSendAllowed: w.realSendAllowed,
              executionEnabled: w.executionEnabled,
              adminPreviewOnly: w.adminPreviewOnly,
              notRendered: w.notRendered,
              notPublished: w.notPublished,
              noUnrealExecution: w.noUnrealExecution,
              noFourDHardware: w.noFourDHardware,
              createdAt: w.createdAt,
              updatedAt: w.updatedAt,
            })),
          wizardReviewLinks: listWizardReviewLinks(id).slice(0, 50).map((w) => ({
            reviewId: w.reviewId,
            wizardId: w.wizardId,
            productionId: w.productionId,
            linkedRoomId: w.linkedRoomId,
            linkedAvatarIds: w.linkedAvatarIds,
            linkedAccessoryIds: w.linkedAccessoryIds,
            linkedMediaPackageId: w.linkedMediaPackageId,
            linkedPreviewId: w.linkedPreviewId,
            linkedFourDCueSuggestions: w.linkedFourDCueSuggestions,
            readinessReportId: w.readinessReportId,
            approvalStage: w.approvalStage,
            approvalEntryId: w.approvalEntryId,
            status: w.status,
            visibility: w.visibility,
            publicUrl: w.publicUrl,
            signedUrl: w.signedUrl,
            realSendAllowed: w.realSendAllowed,
            executionEnabled: w.executionEnabled,
            adminPreviewOnly: w.adminPreviewOnly,
            notRendered: w.notRendered,
            notPublished: w.notPublished,
            noUnrealExecution: w.noUnrealExecution,
            noFourDHardware: w.noFourDHardware,
            createdAt: w.createdAt,
          })),
          realUnrealMigrationPlans:
            listRealUnrealMigrationPlanHistory()
              .slice(0, 50)
              .map((r) => ({
                id: r.id, status: r.status,
                liveExecutionEnabled: r.liveExecutionEnabled,
                realSendAllowed: r.realSendAllowed,
                executionEnabled: r.executionEnabled,
                emergencyLocked: r.emergencyLocked,
                milestones: r.milestones, blockers: r.blockers,
                externalDependencies: r.externalDependencies,
                riskMatrix: r.riskMatrix.map((m) => ({
                  commandType: m.commandType, riskLevel: m.riskLevel,
                  requiredApprovals: m.requiredApprovals,
                  requiredDryRuns: m.requiredDryRuns,
                  rollbackRequirement: m.rollbackRequirement,
                  executionEnabled: false, realSendAllowed: false,
                })),
                generatedAt: r.generatedAt,
              })),
          realUnrealLevelLoadContracts:
            listRealUnrealLevelLoadContractHistory(id)
              .slice(0, 50)
              .map((r) => ({
                id: r.id, productionId: r.productionId,
                proposedLevelName: r.proposedLevelName,
                commandType: r.commandType, mode: r.mode, status: r.status,
                realSendAllowed: r.realSendAllowed,
                executionEnabled: r.executionEnabled,
                approvalRequestId: r.approvalRequestId,
                dryRunChainSummary: r.dryRunChainSummary,
                requestSummary: r.requestSummary,
                responseSummary: r.responseSummary,
                createdAt: r.createdAt,
              })),
          realUnrealCommandApprovalHistory:
            listRealUnrealCommandApprovalHistory(id)
              .slice(0, 50)
              .map((r) => ({
                id: r.id, productionId: r.productionId,
                commandType: r.commandType, status: r.status,
                reason: r.reason, decisionReason: r.decisionReason,
                panelsUsed: r.panelsUsed,
                realSendAllowed: r.realSendAllowed,
                executionEnabled: r.executionEnabled,
                endpointHost: r.endpointHost,
                approvalStageAtRequest: r.approvalStageAtRequest,
                readinessReportId: r.readinessReportId,
                readinessSummary: r.readinessSummary,
                dryRunChainSummary: r.dryRunChainSummary,
                createdAt: r.createdAt, decidedAt: r.decidedAt,
              })),
          readinessHistory:
            String(req.query.includeReadinessHistory ?? "") === "true"
              ? listReadinessReports(id)
              : undefined,
        };
        filename = `production-package-${id}.json`;
        break;
      case "asset-bundle":
        payload = {
          productionId: id,
          exportedAt: new Date().toISOString(),
          visibility: "admin_only_internal" as const,
          voiceAssets: listVoiceAssets(id),
          assetJobs: listAssetJobs(id),
          videoJobs: listVideoJobs(id),
        };
        filename = `asset-bundle-${id}.json`;
        break;
      default:
        return err(res, 400, "unknown_export_type");
    }
    recordAudit("root_admin", "production_package.exported", `${id}:${type}`);
    recordAudit("root_admin", "manifest_exported", `${id}:${type}`);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(JSON.stringify(payload, null, 2));
  });

  app.get(`${PREFIX}/manifests/:productionId`, requireRootAdmin, (req, res) => {
    const p = getProduction(String(req.params.productionId));
    if (!p) return err(res, 404, "production_not_found");
    const room = p.roomId ? getRoom(p.roomId) : undefined;
    const avatars = p.avatarIds.map(getAvatar).filter((a): a is NonNullable<typeof a> => !!a);
    recordAudit("root_admin", "manifest_built_production", p.id);
    return res.json({
      ok: true,
      manifests: {
        production: buildProductionManifest(p),
        unrealScene: buildUnrealSceneManifest(p),
        avatars: avatars.map((a) => buildAvatarManifest(a)),
        fourDCues: buildFourDCueManifest(p.id),
      },
      meta: { room: room?.name ?? null, avatarCount: avatars.length },
    });
  });
}
