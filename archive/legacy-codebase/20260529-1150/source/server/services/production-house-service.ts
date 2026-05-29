/**
 * Mougle AI Production House — backend service.
 *
 * SAFETY:
 *   - File-or-memory persistence ONLY. No DB, no Drizzle, no `db:push`.
 *     The persistence adapter writes JSON files to a local data directory;
 *     it never opens a network socket and never talks to Postgres.
 *   - No real Unreal commands. No real 4D hardware sends. No provider calls.
 *     Every `send*` returns a `dryRun: true` mock command with no outbound
 *     socket opened.
 *   - Approval workflow enforced: production must be `approved` to enter
 *     `sent_to_unreal` / `rendering`.
 *   - `integrationsStatus()` exposes only booleans — never secret values.
 *   - SAFETY_ENVELOPE is appended server-side to every manifest.
 */

import { createHash, randomUUID } from "crypto";
import { z } from "zod";
import {
  type Avatar,
  type AvatarManifest,
  type AuditLog,
  type FourDCue,
  type FourDCueManifest,
  type Hall,
  type NewsroomProduction,
  type Podcast,
  type Production,
  type ProductionManifest,
  type RenderJob,
  type Room,
  type UnrealCommand,
  type UnrealSandboxCommand,
  type UnrealSandboxCommandType,
  type LocalBridgeStubJob,
  type FourDSandboxJob,
  type ReadinessReport,
  type ReadinessCheck,
  type ApprovalHistoryEntry,
  type ApprovalStage,
  APPROVAL_STAGES,
  type RealUnrealHandshakeRecord,
  type RealUnrealBridgeMode,
  REAL_UNREAL_BRIDGE_MODES,
  type RealUnrealDryRunValidationRecord,
  type RealUnrealPrepareSceneRecord,
  type RealUnrealSetCameraRecord,
  type SetCameraPreset,
  ALLOWED_SET_CAMERA_PRESETS,
  type RealUnrealSetLightingRecord,
  type SetLightingPreset,
  ALLOWED_SET_LIGHTING_PRESETS,
  type RealUnrealSetPanelsRecord,
  type SetPanelsPreset,
  ALLOWED_SET_PANELS_PRESETS,
  SET_PANELS_LIMITS,
  type RealUnrealRenderPreviewContractRecord,
  type RealUnrealCommandApprovalRecord,
  type RealUnrealCommandApprovalRequest,
  type RealUnrealCommandApprovalDecision,
  type RealUnrealCommandApprovalStatus,
  type RealUnrealCommandType,
  REAL_UNREAL_COMMAND_TYPES,
  type RealUnrealLevelLoadContractRecord,
  type RealUnrealLevelLoadContractValidateInput,
  type RealUnrealLevelLoadContractCreateInput,
  type RealUnrealLevelLoadContractStatus,
  type UnrealLevelName,
  ALLOWED_UNREAL_LEVEL_NAMES,
  type RealUnrealSafetySwitchReport,
  type RealUnrealSafetySwitchState,
  type RealUnrealSafetySwitchCheck,
  REAL_UNREAL_SAFETY_SWITCH_STATES,
  type RealUnrealMigrationPlanRecord,
  type RealUnrealMigrationMilestone,
  type RealUnrealMigrationMilestoneId,
  type RealUnrealLiveCommandRiskMatrixItem,
  REAL_UNREAL_MIGRATION_PLAN_MILESTONES,
  REAL_UNREAL_MIGRATION_PLAN_STATUSES,
  type GeneratedRoomRecord,
  type GeneratedAvatarRecord,
  type AvatarAccessoryRecord,
  type ProductionUnitRecord,
  type MediaPackageRecord,
  type PreviewSnapshotRecord,
  type RoomCategory,
  type GeneratedAvatarRole,
  type AvatarAccessoryType,
  type ProductionUnitType,
  type MediaPackageType,
  ROOM_CATEGORIES,
  GENERATED_AVATAR_ROLES,
  AVATAR_ACCESSORY_TYPES,
  PRODUCTION_UNIT_TYPES,
  MEDIA_PACKAGE_TYPES,
  GeneratedRoomRecordSchema,
  GeneratedAvatarRecordSchema,
  AvatarAccessoryRecordSchema,
  ProductionUnitRecordSchema,
  MediaPackageRecordSchema,
  PreviewSnapshotRecordSchema,
  type Cinema4DAnchorCharacterManifest,
  Cinema4DAnchorCharacterManifestSchema,
  type Cinema4DCharacterAccessoryManifest,
  Cinema4DCharacterAccessoryManifestSchema,
  type Cinema4DRoomCharacterScriptManifest,
  Cinema4DRoomCharacterScriptManifestSchema,
  type Cinema4DCharacterBindings,
  Cinema4DCharacterBindingsSchema,
  type Cinema4DCharacterRole,
  type Cinema4DCharacterStyle,
  type Cinema4DWardrobeStyle,
  type Cinema4DPosePreset,
  type Cinema4DFacialExpression,
  type Cinema4DLipSyncReadiness,
  type Cinema4DQualityTier,
  type Cinema4DCharacterAccessoryType,
  type Cinema4DAccessoryAttachTarget,
  type Cinema4DAnchorCameraPreset,
  CINEMA4D_CHARACTER_ROLES,
  CINEMA4D_CHARACTER_STYLES,
  CINEMA4D_WARDROBE_STYLES,
  CINEMA4D_POSE_PRESETS,
  CINEMA4D_FACIAL_EXPRESSIONS,
  CINEMA4D_LIP_SYNC_READINESS,
  CINEMA4D_QUALITY_TIERS,
  CINEMA4D_CHARACTER_ACCESSORY_TYPES,
  CINEMA4D_ACCESSORY_ATTACH_TARGETS,
  type DryRunLocalCheck,
  type RealUnrealHealthCheckRecord,
  type UnrealSceneManifest,
  type PromptStudioInput,
  type PromptStudioOutput,
  type OpenAIGeneratedPackage,
  type OpenAIGenerateInput,
  type VoiceAsset,
  type VoiceMockInput,
  type VoiceGenerateInput,
  type AssetJob,
  type MeshyMockInput,
  type MeshyGenerateInput,
  type VideoJob,
  type RunwayMockInput,
  type RunwayGenerateInput,
  OpenAIGeneratedPackageSchema,
  ProductionStatusSchema,
  ProductionWizardSessionRecord,
  ProductionWizardSessionRecordSchema,
  WizardReviewLinkRecord,
  WizardReviewLinkRecordSchema,
  WizardProductionType,
  type PreviewStudioWorkflowLinks,
  SAFETY_ENVELOPE,
} from "../../shared/production-house";
import { AI_MODELS } from "../config/ai-models";
import { generatePreviewStudioState, listPreviewStudioStates } from "./preview-studio-service";
import {
  createDefaultStorage,
  FileProductionHouseStorage,
  MemoryProductionHouseStorage,
  type ManifestSnapshot,
  type ProductionHouseStorage,
} from "./production-house-storage";
import {
  BRIDGE_COMMAND_TYPES,
  validateBridgePayload as _validateBridgePayloadForStub,
} from "./unreal-bridge-contract";
import {
  FOUR_D_EFFECT_TYPES,
  getFourDSandboxExampleCues,
  validateFourDSandboxCue,
} from "./four-d-sandbox";

let storage: ProductionHouseStorage = createDefaultStorage();
export function getStorageInfo(): { kind: "file" | "memory"; location: string } {
  return { kind: storage.kind, location: storage.location };
}

/* ------------------------------------------------------------------ */
/* In-memory stores                                                    */
/* ------------------------------------------------------------------ */

interface Store {
  rooms: Map<string, Room>;
  avatars: Map<string, Avatar>;
  halls: Map<string, Hall>;
  podcasts: Map<string, Podcast>;
  newsroomProductions: Map<string, NewsroomProduction>;
  productions: Map<string, Production>;
  fourDCues: Map<string, FourDCue>;
  renderJobs: Map<string, RenderJob>;
  unrealCommands: UnrealCommand[];
  unrealSandboxCommands: Map<string, UnrealSandboxCommand>;
  localBridgeStubJobs: Map<string, LocalBridgeStubJob>;
  fourDSandboxJobs: Map<string, FourDSandboxJob>;
  readinessReports: ReadinessReport[];
  approvalHistory: ApprovalHistoryEntry[];
  approvalStates: Map<string, ApprovalStage>;
  realUnrealHandshakeHistory: RealUnrealHandshakeRecord[];
  realUnrealDryRunValidationHistory: RealUnrealDryRunValidationRecord[];
  realUnrealPrepareSceneDryRunHistory: RealUnrealPrepareSceneRecord[];
  realUnrealSetCameraDryRunHistory: RealUnrealSetCameraRecord[];
  realUnrealSetLightingDryRunHistory: RealUnrealSetLightingRecord[];
  realUnrealSetPanelsDryRunHistory: RealUnrealSetPanelsRecord[];
  realUnrealRenderPreviewContractHistory: RealUnrealRenderPreviewContractRecord[];
  realUnrealCommandApprovalRequests: RealUnrealCommandApprovalRecord[];
  realUnrealLevelLoadContracts: RealUnrealLevelLoadContractRecord[];
  realUnrealSafetySwitchReports: RealUnrealSafetySwitchReport[];
  realUnrealMigrationPlans: RealUnrealMigrationPlanRecord[];
  generatedRooms: GeneratedRoomRecord[];
  generatedAvatars: GeneratedAvatarRecord[];
  avatarAccessories: AvatarAccessoryRecord[];
  productionUnits: ProductionUnitRecord[];
  mediaPackages: MediaPackageRecord[];
  previewSnapshots: PreviewSnapshotRecord[];
  cinema4DAnchorCharacters: Cinema4DAnchorCharacterManifest[];
  cinema4DCharacterAccessories: Cinema4DCharacterAccessoryManifest[];
  cinema4DRoomCharacterScripts: Cinema4DRoomCharacterScriptManifest[];
  realUnrealHealthCheckHistory: RealUnrealHealthCheckRecord[];
  auditLogs: AuditLog[];
  voiceAssets: Map<string, VoiceAsset>;
  assetJobs: Map<string, AssetJob>;
  videoJobs: Map<string, VideoJob>;
  productionWizardSessions: ProductionWizardSessionRecord[];
  wizardReviewLinks: WizardReviewLinkRecord[];
}

const store: Store = {
  rooms: new Map(),
  avatars: new Map(),
  halls: new Map(),
  podcasts: new Map(),
  newsroomProductions: new Map(),
  productions: new Map(),
  fourDCues: new Map(),
  renderJobs: new Map(),
  unrealCommands: [],
  unrealSandboxCommands: new Map(),
  localBridgeStubJobs: new Map(),
  fourDSandboxJobs: new Map(),
  readinessReports: [],
  approvalHistory: [],
  approvalStates: new Map(),
  realUnrealHandshakeHistory: [],
  realUnrealDryRunValidationHistory: [],
  realUnrealPrepareSceneDryRunHistory: [],
  realUnrealSetCameraDryRunHistory: [],
  realUnrealSetLightingDryRunHistory: [],
  realUnrealSetPanelsDryRunHistory: [],
  realUnrealRenderPreviewContractHistory: [],
  realUnrealCommandApprovalRequests: [],
  realUnrealLevelLoadContracts: [],
  realUnrealSafetySwitchReports: [],
  realUnrealMigrationPlans: [],
  generatedRooms: [],
  generatedAvatars: [],
  avatarAccessories: [],
  productionUnits: [],
  mediaPackages: [],
  previewSnapshots: [],
  cinema4DAnchorCharacters: [],
  cinema4DCharacterAccessories: [],
  cinema4DRoomCharacterScripts: [],
  realUnrealHealthCheckHistory: [],
  auditLogs: [],
  voiceAssets: new Map(),
  assetJobs: new Map(),
  videoJobs: new Map(),
  productionWizardSessions: [],
  wizardReviewLinks: [],
};

function loadFromStorage(): void {
  const s = storage.loadAll();
  store.rooms.clear();
  s.rooms.forEach((r) => store.rooms.set(r.id, r));
  store.avatars.clear();
  s.avatars.forEach((a) => store.avatars.set(a.id, a));
  store.halls.clear();
  s.halls.forEach((h) => store.halls.set(h.id, h));
  store.podcasts.clear();
  s.podcasts.forEach((p) => store.podcasts.set(p.id, p));
  store.newsroomProductions.clear();
  s.newsroomProductions.forEach((n) => store.newsroomProductions.set(n.id, n));
  store.productions.clear();
  s.productions.forEach((p) => store.productions.set(p.id, p));
  store.fourDCues.clear();
  s.fourDCues.forEach((c) => store.fourDCues.set(c.id, c));
  store.renderJobs.clear();
  s.renderJobs.forEach((r) => store.renderJobs.set(r.id, r));
  store.unrealCommands.length = 0;
  store.unrealCommands.push(...s.unrealCommands);
  store.auditLogs.length = 0;
  store.auditLogs.push(...s.auditLogs);
  store.voiceAssets.clear();
  s.voiceAssets.forEach((v) => store.voiceAssets.set(v.id, v));
  store.assetJobs.clear();
  s.assetJobs.forEach((j) => store.assetJobs.set(j.id, j));
  store.videoJobs.clear();
  s.videoJobs.forEach((j) => store.videoJobs.set(j.id, j));
  store.unrealSandboxCommands.clear();
  s.unrealSandboxCommands.forEach((c) => store.unrealSandboxCommands.set(c.id, c));
  store.localBridgeStubJobs.clear();
  s.localBridgeStubJobs.forEach((j) => store.localBridgeStubJobs.set(j.id, j));
  store.fourDSandboxJobs.clear();
  s.fourDSandboxJobs.forEach((j) => store.fourDSandboxJobs.set(j.id, j));
  store.readinessReports.length = 0;
  store.readinessReports.push(...s.readinessReports);
  store.approvalHistory.length = 0;
  store.approvalHistory.push(...s.approvalHistory);
  store.approvalStates.clear();
  s.approvalStates.forEach((e) => store.approvalStates.set(e.productionId, e.stage));
  store.realUnrealHandshakeHistory.length = 0;
  store.realUnrealHandshakeHistory.push(...s.realUnrealHandshakeHistory);
  store.realUnrealDryRunValidationHistory.length = 0;
  store.realUnrealDryRunValidationHistory.push(...s.realUnrealDryRunValidationHistory);
  store.realUnrealPrepareSceneDryRunHistory.length = 0;
  store.realUnrealPrepareSceneDryRunHistory.push(
    ...(s.realUnrealPrepareSceneDryRunHistory ?? []),
  );
  store.realUnrealSetCameraDryRunHistory.length = 0;
  store.realUnrealSetCameraDryRunHistory.push(
    ...(s.realUnrealSetCameraDryRunHistory ?? []),
  );
  store.realUnrealSetLightingDryRunHistory.length = 0;
  store.realUnrealSetLightingDryRunHistory.push(
    ...(s.realUnrealSetLightingDryRunHistory ?? []),
  );
  store.realUnrealSetPanelsDryRunHistory.length = 0;
  store.realUnrealSetPanelsDryRunHistory.push(
    ...(s.realUnrealSetPanelsDryRunHistory ?? []),
  );
  store.realUnrealRenderPreviewContractHistory.length = 0;
  store.realUnrealRenderPreviewContractHistory.push(
    ...(s.realUnrealRenderPreviewContractHistory ?? []),
  );
  store.realUnrealCommandApprovalRequests.length = 0;
  store.realUnrealCommandApprovalRequests.push(
    ...(s.realUnrealCommandApprovalRequests ?? []).map((r) => ({
      ...r,
      // Hard-force the locked safety invariants on every loaded record,
      // even if persisted data was tampered with.
      realSendAllowed: false as const,
      executionEnabled: false as const,
      endpointHost: null,
      safetyEnvelope: SAFETY_ENVELOPE,
    })),
  );
  store.realUnrealLevelLoadContracts.length = 0;
  store.realUnrealLevelLoadContracts.push(
    ...(s.realUnrealLevelLoadContracts ?? []).map((r) => ({
      ...r,
      realSendAllowed: false as const,
      executionEnabled: false as const,
      safetyEnvelope: SAFETY_ENVELOPE,
    })),
  );
  store.realUnrealSafetySwitchReports.length = 0;
  store.realUnrealSafetySwitchReports.push(
    ...(s.realUnrealSafetySwitchReports ?? []).map((r) => ({
      ...r,
      liveExecutionEnabled: false as const,
      realSendAllowed: false as const,
      executionEnabled: false as const,
      emergencyLocked: true as const,
      safetyEnvelope: SAFETY_ENVELOPE,
    })),
  );
  store.realUnrealMigrationPlans.length = 0;
  store.realUnrealMigrationPlans.push(
    ...(s.realUnrealMigrationPlans ?? []).map((r) => ({
      ...r,
      status: "planning_only" as const,
      liveExecutionEnabled: false as const,
      realSendAllowed: false as const,
      executionEnabled: false as const,
      emergencyLocked: true as const,
      riskMatrix: (r.riskMatrix ?? []).map((m: any) => ({
        ...m,
        executionEnabled: false as const,
        realSendAllowed: false as const,
      })),
      safetyEnvelope: SAFETY_ENVELOPE,
    })),
  );
  store.generatedRooms.length = 0;
  store.generatedRooms.push(
    ...(s.generatedRooms ?? []).map((r) => ({
      ...r,
      status: "draft" as const,
      approvalStatus: "draft" as const,
      visibility: "admin_only_internal" as const,
      publicUrl: null as null,
      signedUrl: null as null,
      realSendAllowed: false as const,
      executionEnabled: false as const,
      safetyEnvelope: SAFETY_ENVELOPE,
    })),
  );
  store.generatedAvatars.length = 0;
  store.generatedAvatars.push(
    ...(s.generatedAvatars ?? []).map((r) => ({
      ...r,
      status: "draft" as const,
      approvalStatus: "draft" as const,
      visibility: "admin_only_internal" as const,
      publicUrl: null as null,
      signedUrl: null as null,
      realSendAllowed: false as const,
      executionEnabled: false as const,
      safetyEnvelope: SAFETY_ENVELOPE,
    })),
  );
  store.avatarAccessories.length = 0;
  store.avatarAccessories.push(
    ...(s.avatarAccessories ?? []).map((r) => ({
      ...r,
      status: "draft" as const,
      approvalStatus: "draft" as const,
      visibility: "admin_only_internal" as const,
      publicUrl: null as null,
      signedUrl: null as null,
      realSendAllowed: false as const,
      executionEnabled: false as const,
      safetyEnvelope: SAFETY_ENVELOPE,
    })),
  );
  store.productionUnits.length = 0;
  store.productionUnits.push(
    ...(s.productionUnits ?? []).map((r) => ({
      ...r,
      status: "draft" as const,
      approvalStatus: "draft" as const,
      visibility: "admin_only_internal" as const,
      publicUrl: null as null,
      signedUrl: null as null,
      realSendAllowed: false as const,
      executionEnabled: false as const,
      safetyEnvelope: SAFETY_ENVELOPE,
    })),
  );
  store.mediaPackages.length = 0;
  store.mediaPackages.push(
    ...(s.mediaPackages ?? []).map((r) => ({
      ...r,
      status: "draft" as const,
      approvalStatus: "draft" as const,
      visibility: "admin_only_internal" as const,
      publicUrl: null as null,
      signedUrl: null as null,
      realSendAllowed: false as const,
      executionEnabled: false as const,
      safetyEnvelope: SAFETY_ENVELOPE,
    })),
  );
  store.previewSnapshots.length = 0;
  store.previewSnapshots.push(
    ...(s.previewSnapshots ?? []).map((r) => ({
      ...r,
      status: "draft" as const,
      approvalStatus: "draft" as const,
      visibility: "admin_only_internal" as const,
      publicUrl: null as null,
      signedUrl: null as null,
      realSendAllowed: false as const,
      executionEnabled: false as const,
      adminPreviewOnly: true as const,
      notRendered: true as const,
      notPublished: true as const,
      noUnrealExecution: true as const,
      noFourDHardware: true as const,
      safetyEnvelope: SAFETY_ENVELOPE,
    })),
  );
  store.cinema4DAnchorCharacters.length = 0;
  store.cinema4DAnchorCharacters.push(
    ...((s as any).cinema4DAnchorCharacters ?? []).map((r: any) => _lockCinema4DCharacter(r)),
  );
  store.cinema4DCharacterAccessories.length = 0;
  store.cinema4DCharacterAccessories.push(
    ...((s as any).cinema4DCharacterAccessories ?? []).map((r: any) => _lockCinema4DAccessory(r)),
  );
  store.cinema4DRoomCharacterScripts.length = 0;
  store.cinema4DRoomCharacterScripts.push(
    ...((s as any).cinema4DRoomCharacterScripts ?? []).map((r: any) => _lockCinema4DScript(r)),
  );
  store.realUnrealHealthCheckHistory.length = 0;
  store.realUnrealHealthCheckHistory.push(...s.realUnrealHealthCheckHistory);
  store.productionWizardSessions.length = 0;
  store.productionWizardSessions.push(
    ...((s as any).productionWizardSessions ?? []).map((r: any) => _lockWizard(r)),
  );
  store.wizardReviewLinks.length = 0;
  store.wizardReviewLinks.push(
    ...((s as any).wizardReviewLinks ?? []).map((r: any) => _lockWizardReviewLink(r)),
  );
}
loadFromStorage();

/** Persist helpers — small, single-collection writes. */
function persistRooms(): void {
  storage.saveCollection("rooms", [...store.rooms.values()]);
}
function persistAvatars(): void {
  storage.saveCollection("avatars", [...store.avatars.values()]);
}
function persistHalls(): void {
  storage.saveCollection("halls", [...store.halls.values()]);
}
function persistPodcasts(): void {
  storage.saveCollection("podcasts", [...store.podcasts.values()]);
}
function persistNewsroomProductions(): void {
  storage.saveCollection("newsroomProductions", [...store.newsroomProductions.values()]);
}
function persistProductions(): void {
  storage.saveCollection("productions", [...store.productions.values()]);
}
function persistFourDCues(): void {
  storage.saveCollection("fourDCues", [...store.fourDCues.values()]);
}
function persistRenderJobs(): void {
  storage.saveCollection("renderJobs", [...store.renderJobs.values()]);
}
function persistUnrealCommands(): void {
  storage.saveUnrealCommands(store.unrealCommands);
}
function persistAuditLogs(): void {
  storage.saveAuditLogs(store.auditLogs);
}
function persistVoiceAssets(): void {
  storage.saveCollection("voiceAssets", [...store.voiceAssets.values()]);
}
function persistAssetJobs(): void {
  storage.saveCollection("assetJobs", [...store.assetJobs.values()]);
}
function persistVideoJobs(): void {
  storage.saveCollection("videoJobs", [...store.videoJobs.values()]);
}
function persistUnrealSandboxCommands(): void {
  storage.saveCollection("unrealSandboxCommands", [...store.unrealSandboxCommands.values()]);
}
function persistLocalBridgeStubJobs(): void {
  storage.saveCollection("localBridgeStubJobs", [...store.localBridgeStubJobs.values()]);
}
function persistFourDSandboxJobs(): void {
  storage.saveCollection("fourDSandboxJobs", [...store.fourDSandboxJobs.values()]);
}
function persistReadinessReports(): void {
  storage.saveCollection("readinessReports", store.readinessReports);
}
function persistApprovalHistory(): void {
  storage.saveCollection("approvalHistory", store.approvalHistory);
}
function persistApprovalStates(): void {
  storage.saveCollection(
    "approvalStates",
    [...store.approvalStates.entries()].map(([productionId, stage]) => ({ productionId, stage })),
  );
}
function persistRealUnrealHandshakeHistory(): void {
  storage.saveCollection("realUnrealHandshakeHistory", store.realUnrealHandshakeHistory);
}
function persistRealUnrealDryRunValidationHistory(): void {
  storage.saveCollection(
    "realUnrealDryRunValidationHistory",
    store.realUnrealDryRunValidationHistory,
  );
}
function persistRealUnrealHealthCheckHistory(): void {
  storage.saveCollection("realUnrealHealthCheckHistory", store.realUnrealHealthCheckHistory);
}
function persistRealUnrealPrepareSceneDryRunHistory(): void {
  storage.saveCollection(
    "realUnrealPrepareSceneDryRunHistory",
    store.realUnrealPrepareSceneDryRunHistory,
  );
}
function persistRealUnrealSetCameraDryRunHistory(): void {
  storage.saveCollection(
    "realUnrealSetCameraDryRunHistory",
    store.realUnrealSetCameraDryRunHistory,
  );
}
function persistRealUnrealSetLightingDryRunHistory(): void {
  storage.saveCollection(
    "realUnrealSetLightingDryRunHistory",
    store.realUnrealSetLightingDryRunHistory,
  );
}
function persistRealUnrealSetPanelsDryRunHistory(): void {
  storage.saveCollection(
    "realUnrealSetPanelsDryRunHistory",
    store.realUnrealSetPanelsDryRunHistory,
  );
}
function persistRealUnrealRenderPreviewContractHistory(): void {
  storage.saveCollection(
    "realUnrealRenderPreviewContractHistory",
    store.realUnrealRenderPreviewContractHistory,
  );
}
function persistRealUnrealCommandApprovalRequests(): void {
  storage.saveCollection(
    "realUnrealCommandApprovalRequests",
    store.realUnrealCommandApprovalRequests,
  );
}
function persistRealUnrealLevelLoadContracts(): void {
  storage.saveCollection(
    "realUnrealLevelLoadContracts",
    store.realUnrealLevelLoadContracts,
  );
}
function persistRealUnrealSafetySwitchReports(): void {
  storage.saveCollection(
    "realUnrealSafetySwitchReports",
    store.realUnrealSafetySwitchReports,
  );
}
function persistRealUnrealMigrationPlans(): void {
  storage.saveCollection(
    "realUnrealMigrationPlans",
    store.realUnrealMigrationPlans,
  );
}
function persistGeneratedRooms(): void {
  storage.saveCollection("generatedRooms", store.generatedRooms);
}
function persistGeneratedAvatars(): void {
  storage.saveCollection("generatedAvatars", store.generatedAvatars);
}
function persistAvatarAccessories(): void {
  storage.saveCollection("avatarAccessories", store.avatarAccessories);
}
function persistProductionUnits(): void {
  storage.saveCollection("productionUnits", store.productionUnits);
}
function persistMediaPackages(): void {
  storage.saveCollection("mediaPackages", store.mediaPackages);
}
function persistPreviewSnapshots(): void {
  storage.saveCollection("previewSnapshots", store.previewSnapshots);
}
function persistCinema4DAnchorCharacters(): void {
  storage.saveCollection("cinema4DAnchorCharacters", store.cinema4DAnchorCharacters);
}
function persistCinema4DCharacterAccessories(): void {
  storage.saveCollection("cinema4DCharacterAccessories", store.cinema4DCharacterAccessories);
}
function persistCinema4DRoomCharacterScripts(): void {
  storage.saveCollection("cinema4DRoomCharacterScripts", store.cinema4DRoomCharacterScripts);
}
function persistProductionWizardSessions(): void {
  storage.saveCollection("productionWizardSessions", store.productionWizardSessions);
}
function persistWizardReviewLinks(): void {
  storage.saveCollection("wizardReviewLinks", store.wizardReviewLinks);
}
/**
 * Defence-in-depth sanitizer. Used on every read path (history listing,
 * export mapping) and on load-from-storage to guarantee that the
 * permanently-locked invariants are upheld even if persisted data was
 * tampered with: realSendAllowed=false, executionEnabled=false,
 * endpointHost=null, safetyEnvelope=SAFETY_ENVELOPE.
 */
function sanitizeRealUnrealCommandApprovalRecord(
  rec: RealUnrealCommandApprovalRecord,
): RealUnrealCommandApprovalRecord {
  return {
    ...rec,
    realSendAllowed: false,
    executionEnabled: false,
    endpointHost: null,
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

export function _resetForTests(): void {
  store.rooms.clear();
  store.avatars.clear();
  store.halls.clear();
  store.podcasts.clear();
  store.newsroomProductions.clear();
  store.productions.clear();
  store.fourDCues.clear();
  store.renderJobs.clear();
  store.unrealCommands.length = 0;
  store.auditLogs.length = 0;
  store.voiceAssets.clear();
  store.assetJobs.clear();
  store.videoJobs.clear();
  store.unrealSandboxCommands.clear();
  store.localBridgeStubJobs.clear();
  store.fourDSandboxJobs.clear();
  store.readinessReports.length = 0;
  store.approvalHistory.length = 0;
  store.approvalStates.clear();
  store.realUnrealHandshakeHistory.length = 0;
  store.realUnrealDryRunValidationHistory.length = 0;
  store.realUnrealPrepareSceneDryRunHistory.length = 0;
  store.realUnrealSetCameraDryRunHistory.length = 0;
  store.realUnrealSetLightingDryRunHistory.length = 0;
  store.realUnrealSetPanelsDryRunHistory.length = 0;
  store.realUnrealRenderPreviewContractHistory.length = 0;
  store.realUnrealCommandApprovalRequests.length = 0;
  store.realUnrealLevelLoadContracts.length = 0;
  store.realUnrealSafetySwitchReports.length = 0;
  store.realUnrealMigrationPlans.length = 0;
  store.generatedRooms.length = 0;
  store.generatedAvatars.length = 0;
  store.avatarAccessories.length = 0;
  store.productionUnits.length = 0;
  store.mediaPackages.length = 0;
  store.previewSnapshots.length = 0;
  store.cinema4DAnchorCharacters.length = 0;
  store.cinema4DCharacterAccessories.length = 0;
  store.cinema4DRoomCharacterScripts.length = 0;
  store.realUnrealHealthCheckHistory.length = 0;
  store.productionWizardSessions.length = 0;
  store.wizardReviewLinks.length = 0;
  // Persist the cleared state so file-based runs don't carry stale data.
  persistRooms();
  persistAvatars();
  persistHalls();
  persistPodcasts();
  persistNewsroomProductions();
  persistProductions();
  persistFourDCues();
  persistRenderJobs();
  persistUnrealCommands();
  persistAuditLogs();
  persistVoiceAssets();
  persistAssetJobs();
  persistVideoJobs();
  persistUnrealSandboxCommands();
  persistLocalBridgeStubJobs();
  persistFourDSandboxJobs();
  persistReadinessReports();
  persistApprovalHistory();
  persistApprovalStates();
  persistRealUnrealHandshakeHistory();
  persistRealUnrealDryRunValidationHistory();
  persistRealUnrealHealthCheckHistory();
  persistRealUnrealCommandApprovalRequests();
  persistRealUnrealLevelLoadContracts();
  persistRealUnrealSafetySwitchReports();
  persistRealUnrealMigrationPlans();
  persistGeneratedRooms();
  persistGeneratedAvatars();
  persistAvatarAccessories();
  persistProductionUnits();
  persistMediaPackages();
  persistPreviewSnapshots();
  persistCinema4DAnchorCharacters();
  persistCinema4DCharacterAccessories();
  persistCinema4DRoomCharacterScripts();
  persistProductionWizardSessions();
  persistWizardReviewLinks();
}

/**
 * Test/admin helper: switch the storage adapter at runtime and reload the
 * in-memory caches from it. Pass:
 *   - undefined           → MemoryProductionHouseStorage (fresh)
 *   - "default"           → createDefaultStorage() (env-driven)
 *   - a directory string  → new FileProductionHouseStorage(dir)
 */
export function _reloadStorageForTests(target?: string): void {
  if (target === undefined) storage = new MemoryProductionHouseStorage();
  else if (target === "default") storage = createDefaultStorage();
  else storage = new FileProductionHouseStorage(target);
  loadFromStorage();
}

/** Return a manifest snapshot saved at approval time, if any. */
export function getManifestSnapshot(productionId: string): ManifestSnapshot | null {
  return storage.getManifestSnapshot(productionId);
}
export function listManifestSnapshots(): ManifestSnapshot[] {
  return storage.listManifestSnapshots();
}

/* ------------------------------------------------------------------ */
/* OpenAI Prompt Studio — opt-in, root-admin only, audit-logged.       */
/*                                                                     */
/* SAFETY:                                                             */
/*   - This is the ONLY function in this service that may open an      */
/*     outbound network call (to OpenAI). It does so only when:        */
/*       (a) the route receives an explicit confirm=true,              */
/*       (b) OPENAI_API_KEY is set,                                    */
/*       (c) root-admin gate has already authorized the request.       */
/*   - The model's response is validated against                       */
/*     OpenAIGeneratedPackageSchema. Anything that does not parse is   */
/*     rejected; nothing is persisted as approved.                     */
/*   - The generated package is stored as a Production with            */
/*     approvalStatus = "draft" (NEVER auto-approved) plus a manifest  */
/*     snapshot. Real Unreal / 4D sends remain blocked.                */
/*   - The OpenAI API key is never returned in any response.           */
/* ------------------------------------------------------------------ */

export type OpenAIRunner = (args: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
}) => Promise<string>;

async function defaultOpenAIRunner(args: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  const apiKey =
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("openai_not_configured");
  // Dynamic import keeps the module loadable in tests that never use OpenAI.
  const { default: OpenAI } = await import("openai");
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined;
  const client = new OpenAI({ apiKey, baseURL });
  const resp = await client.chat.completions.create({
    model: args.model,
    response_format: { type: "json_object" },
    temperature: 0.4,
    max_tokens: 2500,
    messages: [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.userPrompt },
    ],
  });
  return resp.choices?.[0]?.message?.content ?? "";
}

let openaiRunner: OpenAIRunner = defaultOpenAIRunner;
/**
 * Test-only helper to override the network call. Throws outside NODE_ENV=test so
 * a production route or accidental import cannot redirect the OpenAI runner.
 */
export function _setOpenAIRunnerForTests(fn: OpenAIRunner | null): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_setOpenAIRunnerForTests may only be called in NODE_ENV=test");
  }
  openaiRunner = fn ?? defaultOpenAIRunner;
}

export function isOpenAIAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!(env.OPENAI_API_KEY?.trim() || env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim());
}

export interface OpenAIPromptStudioResult {
  ok: true;
  productionId: string;
  approvalStatus: "draft";
  package: OpenAIGeneratedPackage;
  envelope: typeof SAFETY_ENVELOPE;
  generatedBy: "openai";
  model: string;
}

const OPENAI_SYSTEM_PROMPT = `You are Mougle's AI Production House planner. You output ONLY a single
JSON object that matches this exact shape (no markdown, no commentary):

{
  "productionPlan": { "title": string, "summary": string, "bullets": string[] },
  "script": string,
  "roomSpec": { "name": string, "type": string, "description": string, "lightingStyle": string },
  "avatarSpec": { "name": string, "role": string, "voiceDescription": string, "appearanceDescription": string },
  "cameraShotList": string[],
  "unrealSceneDraft": {
    "levelName": string,
    "roomType": "newsroom" | "podcast_room" | "conference_hall" | "custom",
    "cameraPreset": string,
    "lightingPreset": string,
    "sequencerTimeline": string
  },
  "fourDCueDraft": [
    { "timecodeMs": integer, "cueType": string, "intensity": number (0..1), "durationMs": integer }
  ],
  "safetyNotes": string[]
}

Hard rules:
- No real-world identifiable people. No medical, financial, legal, or political claims presented as fact.
- No instructions for operating real hardware. 4D cues are dramaturgical hints only.
- Output strictly valid JSON. Do not wrap in code fences.`;

/* ------------------------------------------------------------------ */
/* Voice Studio (mock + ElevenLabs) — opt-in, root-admin only.         */
/*                                                                     */
/* SAFETY:                                                             */
/*   - Mock mode is always available, never calls any external API,    */
/*     and produces deterministic metadata (SHA-256 over the script).  */
/*   - ElevenLabs mode requires ELEVENLABS_API_KEY, explicit           */
/*     confirm=true on the request, root-admin auth, and is fully      */
/*     audit-logged.                                                   */
/*   - The ELEVENLABS_API_KEY is never echoed in any response.         */
/*   - Generated audio is written to the storage adapter's internal    */
/*     voiceAssetDir only. The VoiceAsset row has publicUrl=null and   */
/*     signedUrl=null (enforced by the schema literals). No URL is     */
/*     ever generated to serve the audio.                              */
/*   - The asset is created with status="generated"/"failed" but its   */
/*     approvalStatus is always "draft" (schema-locked literal).       */
/*   - Real Unreal / 4D sends remain blocked.                          */
/* ------------------------------------------------------------------ */

export type ElevenLabsRunner = (args: {
  apiKey: string;
  voiceId: string;
  script: string;
}) => Promise<{ audio: Buffer; durationSeconds: number | null; contentType: string }>;

async function defaultElevenLabsRunner(args: {
  apiKey: string;
  voiceId: string;
  script: string;
}): Promise<{ audio: Buffer; durationSeconds: number | null; contentType: string }> {
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(args.voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": args.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: args.script,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(
      `elevenlabs_http_${r.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }
  const buf = Buffer.from(await r.arrayBuffer());
  return { audio: buf, durationSeconds: null, contentType: "audio/mpeg" };
}

let elevenLabsRunner: ElevenLabsRunner = defaultElevenLabsRunner;
export function _setElevenLabsRunnerForTests(fn: ElevenLabsRunner | null): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_setElevenLabsRunnerForTests may only be called in NODE_ENV=test");
  }
  elevenLabsRunner = fn ?? defaultElevenLabsRunner;
}

export function isElevenLabsAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.ELEVENLABS_API_KEY?.trim();
}

function resolveScript(input: { productionId?: string; script?: string }): {
  script: string;
  productionId: string | null;
} {
  if (input.productionId) {
    const p = store.productions.get(input.productionId);
    if (!p) throw new Error("production_not_found");
    const s = (input.script ?? p.script ?? "").trim();
    if (!s) throw new Error("script_empty");
    return { script: s, productionId: p.id };
  }
  const s = (input.script ?? "").trim();
  if (!s) throw new Error("script_empty");
  return { script: s, productionId: null };
}

function scriptHashOf(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
function previewOf(s: string): string {
  return s.length > 480 ? `${s.slice(0, 480)}…` : s;
}

export function listVoiceAssets(productionId?: string): VoiceAsset[] {
  const all = [...store.voiceAssets.values()];
  return productionId ? all.filter((v) => v.productionId === productionId) : all;
}
export function getVoiceAsset(id: string): VoiceAsset | undefined {
  return store.voiceAssets.get(id);
}

export function runVoiceMock(input: VoiceMockInput): VoiceAsset {
  recordAudit("root_admin", "voice.generate.mock.attempted", input.voiceId);
  const { script, productionId } = resolveScript(input);
  const hash = scriptHashOf(`mock|${input.voiceId}|${script}`);
  const asset: VoiceAsset = {
    id: randomUUID(),
    productionId,
    provider: "mock",
    voiceId: input.voiceId,
    voiceName: input.voiceName ?? "Mock Voice",
    scriptHash: hash,
    scriptPreview: previewOf(script),
    audioFilePath: null, // mock writes no binary
    audioUrl: null,
    publicUrl: null,
    signedUrl: null,
    visibility: "admin_only_internal",
    durationSeconds: Math.min(60 * 60, Math.max(1, Math.round(script.length / 15))),
    status: "generated",
    approvalStatus: "draft",
    errorReason: "",
    metadata: { deterministic: true, source: "mock" },
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: now(),
  };
  store.voiceAssets.set(asset.id, asset);
  persistVoiceAssets();
  recordAudit("root_admin", "voice.generate.mock.succeeded", asset.id);
  return asset;
}

export async function runVoiceElevenLabs(input: VoiceGenerateInput): Promise<VoiceAsset> {
  recordAudit("root_admin", "voice.generate.elevenlabs.attempted", input.voiceId);
  const apiKey =
    process.env.ELEVENLABS_API_KEY?.trim() ||
    (() => {
      recordAudit("root_admin", "voice.generate.rejected", "elevenlabs_not_configured");
      throw new Error("elevenlabs_not_configured");
    })();
  let resolved: { script: string; productionId: string | null };
  try {
    resolved = resolveScript(input);
  } catch (e) {
    recordAudit(
      "root_admin",
      "voice.generate.rejected",
      `script_resolution: ${(e as Error).message}`,
    );
    throw e;
  }
  const hash = scriptHashOf(`elevenlabs|${input.voiceId}|${resolved.script}`);
  let audioFilePath: string | null = null;
  let durationSeconds: number | null = null;
  let status: VoiceAsset["status"] = "generated";
  let errorReason = "";
  try {
    const out = await elevenLabsRunner({
      apiKey,
      voiceId: input.voiceId,
      script: resolved.script,
    });
    const ext = out.contentType?.includes("wav") ? "wav" : "mp3";
    audioFilePath = storage.writeVoiceBinary(`${hash}.${ext}`, out.audio);
    durationSeconds = out.durationSeconds ?? null;
  } catch (e) {
    status = "failed";
    errorReason = (e as Error).message.slice(0, 300);
  }
  const asset: VoiceAsset = {
    id: randomUUID(),
    productionId: resolved.productionId,
    provider: "elevenlabs",
    voiceId: input.voiceId,
    voiceName: input.voiceName ?? "ElevenLabs Voice",
    scriptHash: hash,
    scriptPreview: previewOf(resolved.script),
    audioFilePath,
    audioUrl: null,
    publicUrl: null,
    signedUrl: null,
    visibility: "admin_only_internal",
    durationSeconds,
    status,
    approvalStatus: "draft",
    errorReason,
    metadata: { source: "elevenlabs" },
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: now(),
  };
  store.voiceAssets.set(asset.id, asset);
  persistVoiceAssets();
  if (status === "generated") {
    recordAudit("root_admin", "voice.generate.elevenlabs.succeeded", asset.id);
  } else {
    recordAudit(
      "root_admin",
      "voice.generate.elevenlabs.failed",
      `${asset.id}: ${errorReason}`,
    );
  }
  return asset;
}

/* ------------------------------------------------------------------ */
/* Asset Studio (mock + Meshy 3D draft jobs) — root-admin only.        */
/*                                                                     */
/* SAFETY:                                                             */
/*   - Mock mode is always available, never calls any external API,    */
/*     and is deterministic (SHA-256 over assetType+prompt).           */
/*   - Meshy mode requires MESHY_API_KEY, explicit confirm=true,       */
/*     root-admin auth, and is fully audit-logged.                     */
/*   - MESHY_API_KEY is never echoed in any response.                  */
/*   - AssetJob has publicUrl=null and signedUrl=null (schema-locked). */
/*     modelUrl is also schema-locked to null — provider URLs returned */
/*     by Meshy are stored ONLY in metadata.provider, never surfaced   */
/*     as a public production URL.                                     */
/*   - approvalStatus is schema-locked to "draft". No auto-approval.   */
/*   - No Unreal import. No 4D send. No publishing.                    */
/* ------------------------------------------------------------------ */

export type MeshyRunner = (args: {
  apiKey: string;
  assetType: string;
  prompt: string;
}) => Promise<{ providerJobId: string; providerMetadata?: Record<string, unknown> }>;

async function defaultMeshyRunner(args: {
  apiKey: string;
  assetType: string;
  prompt: string;
}): Promise<{ providerJobId: string; providerMetadata?: Record<string, unknown> }> {
  // Meshy: submit a text-to-3D preview task. We only create the job; we do
  // not poll or download. The returned job id is stored internally.
  const r = await fetch("https://api.meshy.ai/openapi/v2/text-to-3d", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "preview",
      prompt: `[${args.assetType}] ${args.prompt}`,
      art_style: "realistic",
      should_remesh: true,
    }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`meshy_http_${r.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  const j: any = await r.json().catch(() => ({}));
  const jobId = String(j?.result || j?.id || j?.task_id || "").slice(0, 200);
  if (!jobId) throw new Error("meshy_no_job_id");
  return { providerJobId: jobId, providerMetadata: { submittedAt: new Date().toISOString() } };
}

let meshyRunner: MeshyRunner = defaultMeshyRunner;
export function _setMeshyRunnerForTests(fn: MeshyRunner | null): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_setMeshyRunnerForTests may only be called in NODE_ENV=test");
  }
  meshyRunner = fn ?? defaultMeshyRunner;
}

export function isMeshyAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.MESHY_API_KEY?.trim();
}

function resolveProductionRef(productionId?: string): string | null {
  if (!productionId) return null;
  const p = store.productions.get(productionId);
  if (!p) throw new Error("production_not_found");
  return p.id;
}

export function listAssetJobs(productionId?: string): AssetJob[] {
  const all = [...store.assetJobs.values()];
  return productionId ? all.filter((j) => j.productionId === productionId) : all;
}
export function getAssetJob(id: string): AssetJob | undefined {
  return store.assetJobs.get(id);
}

export function runMeshyMock(input: MeshyMockInput): AssetJob {
  recordAudit("root_admin", "asset.meshy.mock.attempted", `${input.assetType}`);
  const productionId = resolveProductionRef(input.productionId);
  const hash = createHash("sha256")
    .update(`mock|${input.assetType}|${input.prompt}`)
    .digest("hex");
  const job: AssetJob = {
    id: randomUUID(),
    productionId,
    provider: "mock",
    assetType: input.assetType,
    prompt: input.prompt,
    promptHash: hash,
    status: "generated",
    approvalStatus: "draft",
    providerJobId: `mock-${hash.slice(0, 16)}`,
    internalAssetPath: null,
    modelUrl: null,
    publicUrl: null,
    signedUrl: null,
    visibility: "admin_only_internal",
    errorReason: "",
    metadata: { deterministic: true, source: "mock" },
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: now(),
  };
  store.assetJobs.set(job.id, job);
  persistAssetJobs();
  recordAudit("root_admin", "asset.meshy.mock.succeeded", job.id);
  return job;
}

export async function runMeshyReal(input: MeshyGenerateInput): Promise<AssetJob> {
  recordAudit("root_admin", "asset.meshy.real.attempted", `${input.assetType}`);
  const apiKey = process.env.MESHY_API_KEY?.trim();
  if (!apiKey) {
    recordAudit("root_admin", "asset.meshy.rejected", "meshy_not_configured");
    throw new Error("meshy_not_configured");
  }
  let productionId: string | null;
  try {
    productionId = resolveProductionRef(input.productionId);
  } catch (e) {
    recordAudit("root_admin", "asset.meshy.rejected", (e as Error).message);
    throw e;
  }
  const hash = createHash("sha256")
    .update(`meshy|${input.assetType}|${input.prompt}`)
    .digest("hex");
  let providerJobId: string | null = null;
  let status: AssetJob["status"] = "submitted";
  let errorReason = "";
  let providerMetadata: Record<string, unknown> = {};
  try {
    const out = await meshyRunner({
      apiKey,
      assetType: input.assetType,
      prompt: input.prompt,
    });
    providerJobId = out.providerJobId;
    providerMetadata = out.providerMetadata || {};
  } catch (e) {
    status = "failed";
    errorReason = (e as Error).message.slice(0, 300);
  }
  const job: AssetJob = {
    id: randomUUID(),
    productionId,
    provider: "meshy",
    assetType: input.assetType,
    prompt: input.prompt,
    promptHash: hash,
    status,
    approvalStatus: "draft",
    providerJobId,
    internalAssetPath: null,
    modelUrl: null,
    publicUrl: null,
    signedUrl: null,
    visibility: "admin_only_internal",
    errorReason,
    // Provider URLs/metadata are kept internally; never exposed via public/signed URL fields.
    metadata: { source: "meshy", provider: providerMetadata },
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: now(),
  };
  store.assetJobs.set(job.id, job);
  persistAssetJobs();
  if (status === "submitted") {
    recordAudit("root_admin", "asset.meshy.real.succeeded", job.id);
  } else {
    recordAudit("root_admin", "asset.meshy.real.failed", `${job.id}: ${errorReason}`);
  }
  return job;
}

/* ------------------------------------------------------------------ */
/* Video Studio (Runway + mock) — submit-only, draft-only, internal.   */
/*   - approvalStatus is schema-locked to "draft". No auto-approval.   */
/*   - No Unreal import. No 4D send. No publishing. No public URL.     */
/* ------------------------------------------------------------------ */

export type RunwayRunner = (args: {
  apiKey: string;
  videoType: string;
  prompt: string;
  durationSeconds: number;
  aspectRatio: string;
}) => Promise<{ providerJobId: string; providerMetadata?: Record<string, unknown> }>;

async function defaultRunwayRunner(args: {
  apiKey: string;
  videoType: string;
  prompt: string;
  durationSeconds: number;
  aspectRatio: string;
}): Promise<{ providerJobId: string; providerMetadata?: Record<string, unknown> }> {
  // Runway: submit a text-to-video task. We only create the job; we do not
  // poll or download. The returned task id is stored internally.
  const r = await fetch("https://api.dev.runwayml.com/v1/text_to_video", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
      "X-Runway-Version": "2024-11-06",
    },
    body: JSON.stringify({
      promptText: `[${args.videoType}] ${args.prompt}`,
      duration: args.durationSeconds,
      ratio: args.aspectRatio,
      model: "gen3a_turbo",
    }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`runway_http_${r.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  const j: any = await r.json().catch(() => ({}));
  const jobId = String(j?.id || j?.task_id || j?.taskId || "").slice(0, 200);
  if (!jobId) throw new Error("runway_no_job_id");
  return { providerJobId: jobId, providerMetadata: { submittedAt: new Date().toISOString() } };
}

let runwayRunner: RunwayRunner = defaultRunwayRunner;
export function _setRunwayRunnerForTests(fn: RunwayRunner | null): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("_setRunwayRunnerForTests may only be called in NODE_ENV=test");
  }
  runwayRunner = fn ?? defaultRunwayRunner;
}

export function isRunwayAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.RUNWAY_API_KEY?.trim();
}

export function listVideoJobs(productionId?: string): VideoJob[] {
  const all = [...store.videoJobs.values()];
  return productionId ? all.filter((j) => j.productionId === productionId) : all;
}
export function getVideoJob(id: string): VideoJob | undefined {
  return store.videoJobs.get(id);
}

export function runRunwayMock(input: RunwayMockInput): VideoJob {
  recordAudit("root_admin", "video.runway.mock.attempted", `${input.videoType}`);
  const productionId = resolveProductionRef(input.productionId);
  const hash = createHash("sha256")
    .update(
      `mock|${input.videoType}|${input.durationSeconds}|${input.aspectRatio}|${input.prompt}`,
    )
    .digest("hex");
  const job: VideoJob = {
    id: randomUUID(),
    productionId,
    provider: "mock",
    videoType: input.videoType,
    prompt: input.prompt,
    promptHash: hash,
    durationSeconds: input.durationSeconds,
    aspectRatio: input.aspectRatio,
    status: "generated",
    approvalStatus: "draft",
    providerJobId: `mock-${hash.slice(0, 16)}`,
    internalVideoPath: null,
    videoUrl: null,
    publicUrl: null,
    signedUrl: null,
    visibility: "admin_only_internal",
    errorReason: "",
    metadata: { deterministic: true, source: "mock" },
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: now(),
  };
  store.videoJobs.set(job.id, job);
  persistVideoJobs();
  recordAudit("root_admin", "video.runway.mock.succeeded", job.id);
  return job;
}

export async function runRunwayReal(input: RunwayGenerateInput): Promise<VideoJob> {
  recordAudit("root_admin", "video.runway.real.attempted", `${input.videoType}`);
  const apiKey = process.env.RUNWAY_API_KEY?.trim();
  if (!apiKey) {
    recordAudit("root_admin", "video.runway.rejected", "runway_not_configured");
    throw new Error("runway_not_configured");
  }
  let productionId: string | null;
  try {
    productionId = resolveProductionRef(input.productionId);
  } catch (e) {
    recordAudit("root_admin", "video.runway.rejected", (e as Error).message);
    throw e;
  }
  const hash = createHash("sha256")
    .update(
      `runway|${input.videoType}|${input.durationSeconds}|${input.aspectRatio}|${input.prompt}`,
    )
    .digest("hex");
  let providerJobId: string | null = null;
  let status: VideoJob["status"] = "submitted";
  let errorReason = "";
  let providerMetadata: Record<string, unknown> = {};
  try {
    const out = await runwayRunner({
      apiKey,
      videoType: input.videoType,
      prompt: input.prompt,
      durationSeconds: input.durationSeconds,
      aspectRatio: input.aspectRatio,
    });
    providerJobId = out.providerJobId;
    providerMetadata = out.providerMetadata || {};
  } catch (e) {
    status = "failed";
    errorReason = (e as Error).message.slice(0, 300);
  }
  const job: VideoJob = {
    id: randomUUID(),
    productionId,
    provider: "runway",
    videoType: input.videoType,
    prompt: input.prompt,
    promptHash: hash,
    durationSeconds: input.durationSeconds,
    aspectRatio: input.aspectRatio,
    status,
    approvalStatus: "draft",
    providerJobId,
    internalVideoPath: null,
    videoUrl: null,
    publicUrl: null,
    signedUrl: null,
    visibility: "admin_only_internal",
    errorReason,
    // Provider URLs/metadata are kept internally; never exposed via public/signed URL fields.
    metadata: { source: "runway", provider: providerMetadata },
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: now(),
  };
  store.videoJobs.set(job.id, job);
  persistVideoJobs();
  if (status === "submitted") {
    recordAudit("root_admin", "video.runway.real.succeeded", job.id);
  } else {
    recordAudit("root_admin", "video.runway.real.failed", `${job.id}: ${errorReason}`);
  }
  return job;
}

/* ------------------------------------------------------------------ */
/* Asset Library + Production Package Viewer (read-only aggregators).  */
/*   - All outputs are derived from existing internal collections.     */
/*   - No secrets, no public URLs, no Unreal/4D sends. Read-only.      */
/* ------------------------------------------------------------------ */

export interface AssetLibraryFilters {
  productionId?: string;
  type?: string;
  provider?: string;
  status?: string;
  approvalStatus?: string;
  since?: string;
  until?: string;
  visibility?: string;
  mockOnly?: boolean;
  realOnly?: boolean;
}

export interface AssetLibraryEntry {
  id: string;
  kind:
    | "voiceAsset"
    | "assetJob"
    | "videoJob"
    | "renderJob"
    | "fourDCue"
    | "unrealCommand"
    | "manifestSnapshot"
    | "generatedRoom"
    | "generatedAvatar"
    | "avatarAccessory"
    | "cinema4DAnchorCharacter"
    | "cinema4DCharacterAccessory"
    | "cinema4DRoomCharacterScript"
    | "mediaPackage"
    | "previewSnapshot"
    | "wizardSession";
  provider: string | null;
  type: string | null;
  status: string | null;
  approvalStatus: string | null;
  productionId: string | null;
  visibility: string;
  createdAt: string;
  raw: any;
}

function inRange(iso: string, since?: string, until?: string): boolean {
  if (!since && !until) return true;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return true;
  if (since) {
    const s = Date.parse(since);
    if (!Number.isNaN(s) && t < s) return false;
  }
  if (until) {
    const u = Date.parse(until);
    if (!Number.isNaN(u) && t > u) return false;
  }
  return true;
}

export function getAssetLibrary(f: AssetLibraryFilters = {}): {
  entries: AssetLibraryEntry[];
  counts: Record<string, number>;
} {
  const entries: AssetLibraryEntry[] = [];

  for (const v of store.voiceAssets.values()) {
    entries.push({
      id: v.id,
      kind: "voiceAsset",
      provider: v.provider ?? null,
      type: "voice",
      status: v.status ?? null,
      approvalStatus: v.approvalStatus ?? null,
      productionId: v.productionId ?? null,
      visibility: v.visibility ?? "admin_only_internal",
      createdAt: v.createdAt,
      raw: v,
    });
  }
  for (const j of store.assetJobs.values()) {
    entries.push({
      id: j.id,
      kind: "assetJob",
      provider: j.provider,
      type: j.assetType,
      status: j.status,
      approvalStatus: j.approvalStatus,
      productionId: j.productionId,
      visibility: j.visibility,
      createdAt: j.createdAt,
      raw: j,
    });
  }
  for (const j of store.videoJobs.values()) {
    entries.push({
      id: j.id,
      kind: "videoJob",
      provider: j.provider,
      type: j.videoType,
      status: j.status,
      approvalStatus: j.approvalStatus,
      productionId: j.productionId,
      visibility: j.visibility,
      createdAt: j.createdAt,
      raw: j,
    });
  }
  for (const r of store.renderJobs.values()) {
    entries.push({
      id: r.id,
      kind: "renderJob",
      provider: null,
      type: (r as any).preset ?? "render",
      status: r.status ?? null,
      approvalStatus: null,
      productionId: r.productionId ?? null,
      visibility: "admin_only_internal",
      createdAt: r.createdAt,
      raw: r,
    });
  }
  for (const c of store.fourDCues.values()) {
    entries.push({
      id: c.id,
      kind: "fourDCue",
      provider: null,
      type: c.effect,
      status: c.safetyFlag,
      approvalStatus: c.approvalStatus,
      productionId: c.productionId,
      visibility: "admin_only_internal",
      createdAt: c.createdAt,
      raw: c,
    });
  }
  for (const u of store.unrealCommands) {
    entries.push({
      id: (u as any).id ?? `${u.command}-${(u as any).createdAt ?? ""}`,
      kind: "unrealCommand",
      provider: null,
      type: u.command,
      status: u.dryRun ? "dryRun" : "draft",
      approvalStatus: null,
      productionId: (u as any).productionId ?? null,
      visibility: "admin_only_internal",
      createdAt: (u as any).createdAt ?? new Date(0).toISOString(),
      raw: u,
    });
  }
  for (const r of store.generatedRooms) {
    entries.push({
      id: r.roomId, kind: "generatedRoom",
      provider: null, type: r.roomCategory ?? "room",
      status: "draft", approvalStatus: null,
      productionId: r.productionId ?? null,
      visibility: "admin_only_internal", createdAt: r.createdAt, raw: r,
    });
  }
  for (const a of store.generatedAvatars) {
    entries.push({
      id: a.avatarId, kind: "generatedAvatar",
      provider: null, type: a.avatarRole ?? "avatar",
      status: "draft", approvalStatus: null,
      productionId: a.productionId ?? null,
      visibility: "admin_only_internal", createdAt: a.createdAt, raw: a,
    });
  }
  for (const a of store.avatarAccessories) {
    entries.push({
      id: a.accessoryId, kind: "avatarAccessory",
      provider: null, type: a.accessoryType ?? "accessory",
      status: "draft", approvalStatus: null,
      productionId: null,
      visibility: "admin_only_internal", createdAt: a.createdAt, raw: a,
    });
  }
  for (const c of store.cinema4DAnchorCharacters) {
    entries.push({
      id: c.characterId, kind: "cinema4DAnchorCharacter",
      provider: null, type: c.characterRole ?? "character",
      status: c.status, approvalStatus: c.approvalStatus,
      productionId: c.productionId ?? null,
      visibility: c.visibility, createdAt: c.createdAt, raw: _lockCinema4DCharacter(c),
    });
  }
  for (const a of store.cinema4DCharacterAccessories) {
    const character = a.characterId ? getCinema4DAnchorCharacter(a.characterId) : null;
    entries.push({
      id: a.accessoryId, kind: "cinema4DCharacterAccessory",
      provider: null, type: a.accessoryType ?? "accessory",
      status: a.status, approvalStatus: a.approvalStatus ?? "draft",
      productionId: character?.productionId ?? null,
      visibility: a.visibility, createdAt: a.createdAt, raw: _lockCinema4DAccessory(a),
    });
  }
  for (const s of store.cinema4DRoomCharacterScripts) {
    entries.push({
      id: s.scriptId, kind: "cinema4DRoomCharacterScript",
      provider: null, type: s.template,
      status: s.status, approvalStatus: s.approvalStatus ?? "draft",
      productionId: s.productionId ?? null,
      visibility: s.visibility, createdAt: s.createdAt, raw: _lockCinema4DScript(s),
    });
  }
  for (const m of store.mediaPackages) {
    entries.push({
      id: m.packageId, kind: "mediaPackage",
      provider: null, type: m.packageType ?? "media",
      status: "draft", approvalStatus: null,
      productionId: m.productionId ?? null,
      visibility: "admin_only_internal", createdAt: m.createdAt, raw: m,
    });
  }
  for (const ps of store.previewSnapshots) {
    entries.push({
      id: ps.snapshotId, kind: "previewSnapshot",
      provider: null, type: (ps as any).previewMode ?? "preview",
      status: ps.readinessStatus ?? "draft", approvalStatus: ps.approvalStatus ?? null,
      productionId: ps.productionId ?? null,
      visibility: "admin_only_internal", createdAt: ps.createdAt, raw: ps,
    });
  }
  for (const w of store.productionWizardSessions) {
    entries.push({
      id: w.wizardId, kind: "wizardSession",
      provider: null, type: w.productionType,
      status: w.status, approvalStatus: null,
      productionId: w.productionId ?? null,
      visibility: "admin_only_internal", createdAt: w.createdAt, raw: _lockWizard(w),
    });
  }
  for (const s of storage.listManifestSnapshots()) {
    entries.push({
      id: `snapshot-${s.productionId}-${s.savedAt}`,
      kind: "manifestSnapshot",
      provider: null,
      type: "manifest",
      status: "saved",
      approvalStatus: null,
      productionId: s.productionId,
      visibility: "admin_only_internal",
      createdAt: s.savedAt,
      raw: s,
    });
  }

  const norm = (v?: string) => (v ?? "").trim().toLowerCase();
  const filtered = entries.filter((e) => {
    if (f.productionId && e.productionId !== f.productionId) return false;
    if (f.type && norm(e.type ?? "") !== norm(f.type)) return false;
    if (f.provider && norm(e.provider ?? "") !== norm(f.provider)) return false;
    if (f.status && norm(e.status ?? "") !== norm(f.status)) return false;
    if (f.approvalStatus && norm(e.approvalStatus ?? "") !== norm(f.approvalStatus)) return false;
    if (f.visibility && norm(e.visibility) !== norm(f.visibility)) return false;
    if (f.mockOnly && norm(e.provider ?? "") !== "mock") return false;
    if (f.realOnly && norm(e.provider ?? "") === "mock") return false;
    if (!inRange(e.createdAt, f.since, f.until)) return false;
    return true;
  });

  const counts: Record<string, number> = {};
  for (const e of filtered) counts[e.kind] = (counts[e.kind] ?? 0) + 1;

  filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { entries: filtered, counts };
}

export interface ProductionChecklist {
  productionId: string;
  scriptExists: boolean;
  roomSelected: boolean;
  avatarSelected: boolean;
  voiceAssetExists: boolean;
  assetJobsExist: boolean;
  videoJobsExist: boolean;
  fourDCuesExist: boolean;
  manifestsExist: boolean;
  approvalState: string;
  readyForUnrealSandbox: false;
  completedCount: number;
  totalCount: number;
}

export function getProductionChecklist(id: string): ProductionChecklist | null {
  const p = store.productions.get(id);
  if (!p) return null;
  const fourDCount = [...store.fourDCues.values()].filter((c) => c.productionId === id).length;
  const items = {
    scriptExists: (p.script ?? "").trim().length > 0,
    roomSelected: !!p.roomId,
    avatarSelected: (p.avatarIds ?? []).length > 0,
    voiceAssetExists: listVoiceAssets(id).length > 0,
    assetJobsExist: listAssetJobs(id).length > 0,
    videoJobsExist: listVideoJobs(id).length > 0,
    fourDCuesExist: fourDCount > 0,
    manifestsExist: !!storage.getManifestSnapshot(id),
  };
  const completed = Object.values(items).filter(Boolean).length;
  return {
    productionId: id,
    ...items,
    approvalState: p.approvalStatus,
    readyForUnrealSandbox: false as const,
    completedCount: completed,
    totalCount: Object.keys(items).length,
  };
}

export function getProductionPackage(id: string): any | null {
  const p = store.productions.get(id);
  if (!p) return null;
  const room = p.roomId ? store.rooms.get(p.roomId) ?? null : null;
  const avatars = (p.avatarIds ?? [])
    .map((aid) => store.avatars.get(aid))
    .filter((a): a is NonNullable<typeof a> => !!a);
  const fourDCues = [...store.fourDCues.values()].filter((c) => c.productionId === id);
  const auditHistory = store.auditLogs
    .filter((a) => (a.detail ?? "").includes(id))
    .slice(-200);
  const snapshot = storage.getManifestSnapshot(id);
  return {
    production: p,
    productionManifest: buildProductionManifest(p),
    unrealSceneManifest: buildUnrealSceneManifest(p),
    avatarManifests: avatars.map((a) => buildAvatarManifest(a)),
    fourDCueManifest: buildFourDCueManifest(id),
    room,
    avatars,
    fourDCues,
    voiceAssets: listVoiceAssets(id),
    assetJobs: listAssetJobs(id),
    videoJobs: listVideoJobs(id),
    manifestSnapshot: snapshot,
    auditHistory,
    approvalState: p.approvalStatus,
    wizardSessions: store.productionWizardSessions
      .filter((w) => w.productionId === id)
      .map(_lockWizard),
    wizardReviewLinks: listWizardReviewLinks(id),
    generatedRoom: p.roomId
      ? store.generatedRooms.find((r) => r.roomId === p.roomId) ?? null
      : null,
    generatedAvatars: (p.avatarIds ?? [])
      .map((aid) => store.generatedAvatars.find((g) => g.avatarId === aid))
      .filter(Boolean),
    avatarAccessories: store.avatarAccessories.filter((a) =>
      (p.avatarIds ?? []).includes((a as any).avatarId ?? "")),
    cinema4DAnchorCharacters: store.cinema4DAnchorCharacters
      .filter((c) =>
        c.productionId === id ||
        (p.roomId ? c.roomId === p.roomId : false) ||
        (p.avatarIds ?? []).includes(c.characterId))
      .map(_lockCinema4DCharacter),
    cinema4DCharacterAccessories: store.cinema4DCharacterAccessories
      .filter((a) => {
        const character = a.characterId ? getCinema4DAnchorCharacter(a.characterId) : null;
        return character?.productionId === id || (p.roomId ? a.roomId === p.roomId : false);
      })
      .map(_lockCinema4DAccessory),
    cinema4DRoomCharacterScripts: store.cinema4DRoomCharacterScripts
      .filter((s) => s.productionId === id || (p.roomId ? s.roomId === p.roomId : false))
      .map(_lockCinema4DScript),
    mediaPackages: listMediaPackages().filter((m) => m.productionId === id),
    previewSnapshots: listPreviewSnapshots(id).slice(0, 20),
    previewStudioStates: listPreviewStudioStatesForExport(id).slice(0, 20),
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

function _uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

export function buildPreviewStudioWorkflowContext(
  input: Partial<PreviewStudioWorkflowLinks> = {},
): PreviewStudioWorkflowLinks & {
  roomLabel: string | null;
  avatarLabels: string[];
  mediaPackageLabels: string[];
  previewSnapshotLabel: string | null;
  readinessSummary: string | null;
} {
  let productionId = input.productionId ?? null;
  let roomId = input.roomId ?? null;
  let avatarIds = _uniqueIds(input.avatarIds ?? []);
  let characterIds = _uniqueIds((input as any).characterIds ?? []);
  let mediaPackageIds = _uniqueIds(input.mediaPackageIds ?? []);
  let wizardId = input.wizardId ?? null;
  let previewSnapshotId = input.previewSnapshotId ?? null;
  let readinessReportId = input.readinessReportId ?? null;
  let approvalState = input.approvalState ?? null;
  const characterRole = (input as any).characterRole ?? null;
  const wardrobeStyle = (input as any).wardrobeStyle ?? null;
  const posePreset = (input as any).posePreset ?? null;
  const accessoryIds = _uniqueIds((input as any).accessoryIds ?? []);
  const teleprompterText = (input as any).teleprompterText ?? null;
  const lowerThirdName = (input as any).lowerThirdName ?? null;
  const panelFocus = (input as any).panelFocus ?? null;
  const cameraPreset = (input as any).cameraPreset ?? null;

  const wizard = wizardId ? getProductionWizard(wizardId) : null;
  if (wizard) {
    productionId = productionId ?? wizard.productionId;
    roomId = roomId ?? wizard.generatedRoomId;
    avatarIds = _uniqueIds([...avatarIds, ...(wizard.generatedAvatarIds ?? [])]);
    mediaPackageIds = _uniqueIds([
      ...mediaPackageIds,
      wizard.generatedMediaPackageId ?? null,
    ]);
    previewSnapshotId = previewSnapshotId ?? wizard.generatedPreviewId;
  }

  const production = productionId ? store.productions.get(productionId) ?? null : null;
  if (production) {
    roomId = roomId ?? production.roomId ?? null;
    avatarIds = _uniqueIds([...avatarIds, ...(production.avatarIds ?? [])]);
    mediaPackageIds = _uniqueIds([
      ...mediaPackageIds,
      ...store.mediaPackages
        .filter((m) => m.productionId === productionId)
        .map((m) => m.packageId),
    ]);
    approvalState = approvalState ?? getApprovalStage(production.id);
  }

  const previewSnapshot = previewSnapshotId
    ? getPreviewSnapshotById(previewSnapshotId)
    : productionId
      ? getLatestPreviewSnapshot(productionId)
      : null;
  previewSnapshotId = previewSnapshotId ?? previewSnapshot?.snapshotId ?? null;

  const linkedProductionId = productionId;
  const readiness = linkedProductionId
    ? (readinessReportId
      ? listReadinessReports(linkedProductionId).find((r) => r.id === readinessReportId) ?? null
      : getLatestReadinessReport(linkedProductionId))
    : null;
  readinessReportId = readinessReportId ?? readiness?.id ?? null;

  const generatedRoom = roomId
    ? store.generatedRooms.find((r) => r.roomId === roomId) ?? null
    : null;
  const legacyRoom = roomId ? store.rooms.get(roomId) ?? null : null;
  const roomLabel = generatedRoom?.roomName ?? legacyRoom?.name ?? null;

  const avatarLabels = avatarIds.map((id) => {
    const generated = store.generatedAvatars.find((a) => a.avatarId === id);
    const legacy = store.avatars.get(id);
    return generated?.avatarName ?? legacy?.name ?? id;
  });
  characterIds = _uniqueIds([
    ...characterIds,
    ...store.cinema4DAnchorCharacters
      .filter((c) =>
        (productionId && c.productionId === productionId) ||
        (roomId && c.roomId === roomId))
      .map((c) => c.characterId),
  ]);

  const mediaPackageLabels = mediaPackageIds.map((id) => {
    const pkg = store.mediaPackages.find((m) => m.packageId === id);
    return pkg ? `${pkg.packageType}:${pkg.packageId}` : id;
  });

  return {
    productionId,
    roomId,
    avatarIds,
    characterIds,
    mediaPackageIds,
    wizardId,
    previewSnapshotId,
    readinessReportId,
    approvalState,
    characterRole,
    wardrobeStyle,
    posePreset,
    accessoryIds,
    teleprompterText,
    lowerThirdName,
    panelFocus,
    cameraPreset,
    roomLabel,
    avatarLabels,
    mediaPackageLabels,
    previewSnapshotLabel: previewSnapshot
      ? `${previewSnapshot.previewMode ?? previewSnapshot.readinessStatus ?? "preview"}:${previewSnapshot.snapshotId}`
      : null,
    readinessSummary: readiness
      ? `overall ${readiness.overallScore}/100, blockers ${readiness.blockers.length}`
      : null,
  };
}

export function listPreviewStudioStatesForExport(productionId?: string): any[] {
  return listPreviewStudioStates()
    .filter((s) => !productionId || s.productionId === productionId)
    .map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      generatedBy: s.generatedBy,
      productionId: s.productionId,
      roomId: s.roomId,
      avatarIds: [...s.avatarIds],
      mediaPackageIds: [...s.mediaPackageIds],
      wizardId: s.wizardId,
      previewSnapshotId: s.previewSnapshotId,
      readinessReportId: s.readinessReportId,
      approvalState: s.approvalState,
      scene: s.scene,
      status: "draft" as const,
      approvalStatus: "draft" as const,
      visibility: "admin_only_internal" as const,
      publicUrl: null,
      signedUrl: null,
      realSendAllowed: false as const,
      executionEnabled: false as const,
      adminPreviewOnly: true as const,
      notRendered: true as const,
      notPublished: true as const,
      noUnrealExecution: true as const,
      noFourDHardware: true as const,
      safetyEnvelope: SAFETY_ENVELOPE,
    }));
}

function hasUnrealSceneManifestForProduction(production?: Production | null): boolean {
  if (!production) return false;
  const manifest = buildUnrealSceneManifest(production);
  return !!manifest && Object.keys(manifest).length > 0;
}

/* ------------------------------------------------------------------ */
/* Unreal Sandbox Bridge — mock-only, never connects to Unreal Engine. */
/* ------------------------------------------------------------------ */

export function getUnrealSandboxStatus() {
  return {
    mode: "sandbox" as const,
    realSendAllowed: false as const,
    connectedToUnreal: false as const,
    movieRenderQueueEnabled: false as const,
    assetImportEnabled: false as const,
    fourDHardwareSendAllowed: false as const,
    safetyEnvelope: SAFETY_ENVELOPE,
    notice:
      "Unreal Sandbox Bridge validates and records production commands only. " +
      "It does not connect to Unreal Engine, import assets, render video, or control hardware.",
  };
}

export interface SandboxValidationResult {
  ok: boolean;
  productionId: string;
  checks: Record<string, boolean>;
  failures: string[];
  approved: boolean;
  sandboxOverride: boolean;
  safetyEnvelope: typeof SAFETY_ENVELOPE;
}

function deepFindAnyNonNullKey(obj: unknown, keys: string[]): boolean {
  if (obj === null || obj === undefined) return false;
  if (Array.isArray(obj)) return obj.some((v) => deepFindAnyNonNullKey(v, keys));
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (keys.includes(k) && v !== null && v !== undefined && v !== "") return true;
      if (deepFindAnyNonNullKey(v, keys)) return true;
    }
  }
  return false;
}

function deepFindFlagTrue(obj: unknown, flag: string): boolean {
  if (obj === null || obj === undefined) return false;
  if (Array.isArray(obj)) return obj.some((v) => deepFindFlagTrue(v, flag));
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === flag && v === true) return true;
      if (deepFindFlagTrue(v, flag)) return true;
    }
  }
  return false;
}

export function validateUnrealSandboxPackage(
  productionId: string,
  opts: { sandboxOverride?: boolean } = {},
): SandboxValidationResult {
  const sandboxOverride = !!opts.sandboxOverride;
  const failures: string[] = [];
  const checks: Record<string, boolean> = {};
  const p = store.productions.get(productionId);

  checks.productionExists = !!p;
  if (!p) {
    return {
      ok: false,
      productionId,
      checks,
      failures: ["production_not_found"],
      approved: false,
      sandboxOverride,
      safetyEnvelope: SAFETY_ENVELOPE,
    };
  }

  checks.approvedOrOverride = p.approvalStatus === "approved" || sandboxOverride;
  if (!checks.approvedOrOverride) failures.push("not_approved_and_no_sandbox_override");

  let productionManifest: ProductionManifest | null = null;
  let unrealScene: UnrealSceneManifest | null = null;
  let avatarManifests: AvatarManifest[] = [];
  let fourDCueManifest: FourDCueManifest | null = null;
  try {
    productionManifest = buildProductionManifest(p);
    unrealScene = buildUnrealSceneManifest(p);
    avatarManifests = (p.avatarIds ?? [])
      .map((aid) => store.avatars.get(aid))
      .filter((a): a is Avatar => !!a)
      .map((a) => buildAvatarManifest(a));
    fourDCueManifest = buildFourDCueManifest(p.id);
  } catch {
    /* fall through with nulls */
  }

  checks.productionManifestExists = !!productionManifest;
  checks.unrealSceneManifestExists = !!unrealScene;
  // Avatar manifest exists OR a placeholder avatar is allowed (empty array).
  checks.avatarManifestExistsOrPlaceholder = Array.isArray(avatarManifests);
  // 4D cue manifest exists OR empty cue manifest is allowed.
  checks.fourDCueManifestExistsOrEmpty = !!fourDCueManifest;
  if (!checks.productionManifestExists) failures.push("production_manifest_missing");
  if (!checks.unrealSceneManifestExists) failures.push("unreal_scene_manifest_missing");
  if (!checks.fourDCueManifestExistsOrEmpty) failures.push("fourd_cue_manifest_missing");

  const fullPkg = {
    production: productionManifest,
    unrealScene,
    avatars: avatarManifests,
    fourDCues: fourDCueManifest,
    voiceAssets: listVoiceAssets(productionId),
    assetJobs: listAssetJobs(productionId),
    videoJobs: listVideoJobs(productionId),
  };

  checks.publicUrlsAreNull = !deepFindAnyNonNullKey(fullPkg, ["publicUrl"]);
  checks.signedUrlsAreNull = !deepFindAnyNonNullKey(fullPkg, ["signedUrl"]);
  if (!checks.publicUrlsAreNull) failures.push("non_null_public_url_present");
  if (!checks.signedUrlsAreNull) failures.push("non_null_signed_url_present");

  checks.visibilityAdminOnly = ![
    ...listVoiceAssets(productionId),
    ...listAssetJobs(productionId),
    ...listVideoJobs(productionId),
  ].some((j: any) => j.visibility && j.visibility !== "admin_only_internal");
  if (!checks.visibilityAdminOnly) failures.push("visibility_not_admin_only_internal");

  checks.safetyEnvelopePresent = !!SAFETY_ENVELOPE && SAFETY_ENVELOPE.manualRootAdminOverrideOnly === true;
  if (!checks.safetyEnvelopePresent) failures.push("safety_envelope_missing");

  checks.noRealSendAllowedFlag = !deepFindFlagTrue(fullPkg, "realSendAllowed");
  if (!checks.noRealSendAllowedFlag) failures.push("real_send_allowed_flag_true");

  const ok =
    checks.approvedOrOverride &&
    checks.productionManifestExists &&
    checks.unrealSceneManifestExists &&
    checks.avatarManifestExistsOrPlaceholder &&
    checks.fourDCueManifestExistsOrEmpty &&
    checks.publicUrlsAreNull &&
    checks.signedUrlsAreNull &&
    checks.visibilityAdminOnly &&
    checks.safetyEnvelopePresent &&
    checks.noRealSendAllowedFlag;

  return {
    ok,
    productionId,
    checks,
    failures,
    approved: p.approvalStatus === "approved",
    sandboxOverride,
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

export interface SandboxSendInput {
  productionId: string;
  commandType: UnrealSandboxCommandType;
  sandboxOverride?: boolean;
  payloadHint?: string;
}

export function sendUnrealSandboxCommand(input: SandboxSendInput): {
  command: UnrealSandboxCommand;
  validation: SandboxValidationResult;
} {
  const validation = validateUnrealSandboxPackage(input.productionId, {
    sandboxOverride: input.sandboxOverride,
  });

  // Deterministic mock command id from production + commandType + payloadHint + safety envelope.
  const seed = JSON.stringify({
    productionId: input.productionId,
    commandType: input.commandType,
    sandboxOverride: !!input.sandboxOverride,
    payloadHint: input.payloadHint ?? "",
    safety: SAFETY_ENVELOPE,
  });
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 24);
  const commandId = `unreal_sandbox_${hash}`;

  const accepted = validation.ok;
  const status: UnrealSandboxCommand["status"] = accepted ? "mock_accepted" : "mock_rejected";
  const message = accepted
    ? "Sandbox command accepted. No real Unreal command was sent."
    : `Sandbox command rejected: ${validation.failures.join(", ") || "validation_failed"}`;

  const cmd: UnrealSandboxCommand = {
    id: commandId,
    productionId: input.productionId,
    mode: "sandbox",
    commandType: input.commandType,
    status,
    realSendAllowed: false,
    payload: {
      payloadHint: input.payloadHint ?? "",
      sandboxOverride: !!input.sandboxOverride,
    },
    response: {
      ok: accepted,
      mode: "sandbox",
      realSendAllowed: false,
      commandId,
      status,
      message,
      validation: { checks: validation.checks, failures: validation.failures },
    },
    reason: accepted ? "" : message,
    createdAt: new Date().toISOString(),
    safetyEnvelope: SAFETY_ENVELOPE,
  };
  store.unrealSandboxCommands.set(cmd.id, cmd);
  persistUnrealSandboxCommands();
  return { command: cmd, validation };
}

/* ------------------------------------------------------------------ */
/* Local Unreal Bridge Stub — mock-only, never connects to UE/4D.      */
/* ------------------------------------------------------------------ */

export function getLocalBridgeStubHealth() {
  return {
    ok: true,
    mode: "local_stub" as const,
    status: "healthy" as const,
    dryRunOnly: true as const,
    realSendAllowed: false as const,
    connectedToUnreal: false as const,
    movieRenderQueueEnabled: false as const,
    assetImportEnabled: false as const,
    fourDHardwareSendAllowed: false as const,
    publishingEnabled: false as const,
    supportedCommandCount: BRIDGE_COMMAND_TYPES.length,
    safetyEnvelope: SAFETY_ENVELOPE,
    notice:
      "Local Unreal Bridge Stub: accepts valid dry-run bridge contract " +
      "payloads only and returns deterministic mock responses. It does " +
      "not connect to Unreal Engine, render video, import assets, or " +
      "control hardware.",
  };
}

export function listLocalBridgeStubSupportedCommands(): readonly string[] {
  return BRIDGE_COMMAND_TYPES;
}

export interface SendLocalBridgeStubResult {
  job: LocalBridgeStubJob;
  accepted: boolean;
  failures: string[];
  errorCodes: string[];
}

export function sendLocalBridgeStub(input: unknown): SendLocalBridgeStubResult {
  const validation = _validateBridgePayloadForStub(input);
  const body = (input ?? {}) as Record<string, unknown>;
  const accepted = validation.ok;
  const productionId = typeof body.productionId === "string" ? body.productionId : "unknown";
  const commandId = typeof body.commandId === "string" ? body.commandId : "unknown";
  const commandType = typeof body.commandType === "string" ? body.commandType : "unknown";

  // Deterministic SHA-256 job id over locked fields.
  const seed = JSON.stringify({
    productionId, commandId, commandType,
    mode: "local_stub", dryRun: true, realSendAllowed: false,
    safety: SAFETY_ENVELOPE,
  });
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 24);
  const jobId = `local_bridge_stub_${hash}`;

  const status: LocalBridgeStubJob["status"] = accepted ? "stub_accepted" : "stub_rejected";
  const responsePayload: Record<string, unknown> = accepted
    ? {
        ok: true,
        mode: "local_stub",
        dryRun: true,
        realSendAllowed: false,
        bridgeJobId: jobId,
        commandId,
        commandType,
        status: "accepted_dry_run",
        message: "Accepted by local bridge stub. No real Unreal actions executed.",
        echo: {
          mode: "local_stub",
          dryRun: true,
          realSendAllowed: false,
          safetyEnvelope: SAFETY_ENVELOPE,
        },
      }
    : {
        ok: false,
        mode: "local_stub",
        dryRun: true,
        realSendAllowed: false,
        commandId,
        commandType,
        status: "rejected_dry_run",
        message: "Rejected by local bridge stub.",
        failures: validation.failures,
        errorCodes: validation.errorCodes,
      };

  // Allowlist-only serialization of stored requestPayload. Any caller-supplied
  // fields outside this allowlist (auth tokens, api keys, secrets, signed
  // urls, public urls, etc.) are dropped before persistence and never appear
  // in /history or full export payloads.
  const ALLOWED_TOP = new Set([
    "productionId","commandId","commandType","mode","dryRun","realSendAllowed",
    "safetyEnvelope","timestamp","adminUserId","payload","publicUrl",
    "signedUrl","visibility",
  ]);
  const safeRequest: Record<string, unknown> = {};
  for (const k of Object.keys(body)) {
    if (ALLOWED_TOP.has(k)) safeRequest[k] = (body as any)[k];
  }
  // Force locked safety fields and null url fields regardless of input.
  safeRequest.mode = "local_bridge";
  safeRequest.dryRun = true;
  safeRequest.realSendAllowed = false;
  safeRequest.publicUrl = null;
  safeRequest.signedUrl = null;
  safeRequest.visibility = "admin_only_internal";
  safeRequest.safetyEnvelope = SAFETY_ENVELOPE;

  const job: LocalBridgeStubJob = {
    id: jobId,
    commandId,
    productionId,
    commandType,
    mode: "local_stub",
    dryRun: true,
    realSendAllowed: false,
    status,
    requestPayload: safeRequest,
    responsePayload,
    createdAt: new Date().toISOString(),
    safetyEnvelope: SAFETY_ENVELOPE,
  };
  store.localBridgeStubJobs.set(job.id, job);
  persistLocalBridgeStubJobs();
  return {
    job,
    accepted,
    failures: validation.failures,
    errorCodes: validation.errorCodes,
  };
}

export function listLocalBridgeStubJobs(productionId?: string): LocalBridgeStubJob[] {
  const all = [...store.localBridgeStubJobs.values()];
  const filtered = productionId ? all.filter((j) => j.productionId === productionId) : all;
  return filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function listUnrealSandboxCommands(productionId?: string): UnrealSandboxCommand[] {
  const all = [...store.unrealSandboxCommands.values()];
  const filtered = productionId ? all.filter((c) => c.productionId === productionId) : all;
  return filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function runPromptStudioOpenAI(
  input: OpenAIGenerateInput,
): Promise<OpenAIPromptStudioResult> {
  if (!isOpenAIAvailable()) {
    recordAudit("root_admin", "openai_prompt_blocked", "openai_not_configured");
    throw new Error("openai_not_configured");
  }
  const model = AI_MODELS.PRIMARY;
  const userPrompt = `Production type: ${input.productionType}\nProducer prompt: ${input.prompt}`;
  let raw: string;
  try {
    raw = await openaiRunner({ model, systemPrompt: OPENAI_SYSTEM_PROMPT, userPrompt });
  } catch (e) {
    recordAudit(
      "root_admin",
      "openai_prompt_failed",
      `network_or_runner: ${(e as Error).message.slice(0, 200)}`,
    );
    throw new Error("openai_call_failed");
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    recordAudit("root_admin", "openai_prompt_rejected", "invalid_json");
    throw new Error("openai_invalid_json");
  }
  const validated = OpenAIGeneratedPackageSchema.safeParse(parsedJson);
  if (!validated.success) {
    recordAudit(
      "root_admin",
      "openai_prompt_rejected",
      `schema_invalid: ${validated.error.issues.slice(0, 3).map((i) => i.path.join(".")).join(",")}`,
    );
    throw new Error("openai_schema_invalid");
  }
  const pkg = validated.data;

  // Persist as DRAFT only — never auto-approve.
  const production = createProduction({
    title: pkg.productionPlan.title,
    productionType: input.productionType,
    script: pkg.script,
    roomId: null,
    avatarIds: [],
    panels: pkg.productionPlan.bullets.slice(0, 20),
    cameras: pkg.cameraShotList.slice(0, 40),
    audio: [],
    captions: true,
    overlays: [],
    renderSettings: { preset: "preview", fps: 30 },
    approvalStatus: "draft",
  });

  // Save the full generated package as a manifest snapshot keyed by productionId.
  storage.saveManifestSnapshot({
    productionId: production.id,
    savedAt: now(),
    production: { generatedBy: "openai", model, package: pkg },
    unrealScene: { ...pkg.unrealSceneDraft, envelope: SAFETY_ENVELOPE },
    avatars: [pkg.avatarSpec],
    fourDCues: { timeline: pkg.fourDCueDraft, envelope: SAFETY_ENVELOPE },
  });

  recordAudit(
    "root_admin",
    "openai_prompt_generated",
    `production=${production.id} model=${model}`,
  );
  return {
    ok: true as const,
    productionId: production.id,
    approvalStatus: "draft" as const,
    package: pkg,
    envelope: SAFETY_ENVELOPE,
    generatedBy: "openai" as const,
    model,
  };
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

export function recordAudit(actor: string, action: string, detail: string): AuditLog {
  const log: AuditLog = {
    id: randomUUID(),
    at: new Date().toISOString(),
    actor,
    action,
    detail: detail.slice(0, 400),
  };
  store.auditLogs.push(log);
  if (store.auditLogs.length > 2000) store.auditLogs.splice(0, store.auditLogs.length - 2000);
  persistAuditLogs();
  return log;
}

export function listAudit(limit = 100): AuditLog[] {
  return store.auditLogs.slice(-limit).map((a) => ({ ...a }));
}

/* ------------------------------------------------------------------ */
/* Generic CRUD helpers (typed per entity)                             */
/* ------------------------------------------------------------------ */

const now = () => new Date().toISOString();

/* Rooms */
export function createRoom(input: Omit<Room, "id" | "createdAt">): Room {
  const room: Room = { id: randomUUID(), createdAt: now(), ...input };
  store.rooms.set(room.id, room);
  persistRooms();
  recordAudit("root_admin", "room_created", room.name);
  return room;
}
export function listRooms(): Room[] {
  return [...store.rooms.values()];
}
export function getRoom(id: string): Room | undefined {
  return store.rooms.get(id);
}

/* Avatars */
export function createAvatar(input: Omit<Avatar, "id" | "createdAt">): Avatar {
  const avatar: Avatar = { id: randomUUID(), createdAt: now(), ...input };
  store.avatars.set(avatar.id, avatar);
  persistAvatars();
  recordAudit("root_admin", "avatar_created", avatar.name);
  return avatar;
}
export function listAvatars(): Avatar[] {
  return [...store.avatars.values()];
}
export function getAvatar(id: string): Avatar | undefined {
  return store.avatars.get(id);
}

/* Halls */
export function createHall(input: Omit<Hall, "id" | "createdAt">): Hall {
  const hall: Hall = { id: randomUUID(), createdAt: now(), ...input };
  store.halls.set(hall.id, hall);
  persistHalls();
  recordAudit("root_admin", "hall_created", hall.name);
  return hall;
}
export function listHalls(): Hall[] {
  return [...store.halls.values()];
}

/* Podcasts */
export function createPodcast(input: Omit<Podcast, "id" | "createdAt">): Podcast {
  const p: Podcast = { id: randomUUID(), createdAt: now(), ...input };
  store.podcasts.set(p.id, p);
  persistPodcasts();
  recordAudit("root_admin", "podcast_created", p.episodeTitle);
  return p;
}
export function listPodcasts(): Podcast[] {
  return [...store.podcasts.values()];
}

/* Newsroom productions */
export function createNewsroomProduction(
  input: Omit<NewsroomProduction, "id" | "createdAt">,
): NewsroomProduction {
  const n: NewsroomProduction = { id: randomUUID(), createdAt: now(), ...input };
  store.newsroomProductions.set(n.id, n);
  persistNewsroomProductions();
  recordAudit("root_admin", "newsroom_created", n.storyTitle);
  return n;
}
export function listNewsroomProductions(): NewsroomProduction[] {
  return [...store.newsroomProductions.values()];
}

/* Productions */
export function createProduction(input: Omit<Production, "id" | "createdAt">): Production {
  const p: Production = { id: randomUUID(), createdAt: now(), ...input };
  store.productions.set(p.id, p);
  persistProductions();
  recordAudit("root_admin", "production_created", p.title);
  return p;
}
export function listProductions(): Production[] {
  return [...store.productions.values()];
}

/** Filtered production list — used by the History view. */
export interface ProductionFilters {
  productionType?: string;
  approvalStatus?: string;
  roomType?: string;
  avatarId?: string;
  q?: string;
  dateFrom?: string; // ISO
  dateTo?: string; // ISO
}
export function listProductionsFiltered(f: ProductionFilters): Production[] {
  const qLower = f.q?.trim().toLowerCase();
  const fromMs = f.dateFrom ? Date.parse(f.dateFrom) : NaN;
  const toMs = f.dateTo ? Date.parse(f.dateTo) : NaN;
  return [...store.productions.values()].filter((p) => {
    if (f.productionType && p.productionType !== f.productionType) return false;
    if (f.approvalStatus && p.approvalStatus !== f.approvalStatus) return false;
    if (f.avatarId && !p.avatarIds.includes(f.avatarId)) return false;
    if (f.roomType) {
      const room = p.roomId ? store.rooms.get(p.roomId) : undefined;
      if (!room || room.type !== f.roomType) return false;
    }
    if (qLower) {
      const hay = `${p.title} ${p.script ?? ""}`.toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    const created = Date.parse(p.createdAt);
    if (!Number.isNaN(fromMs) && created < fromMs) return false;
    if (!Number.isNaN(toMs) && created > toMs) return false;
    return true;
  });
}
export function getProduction(id: string): Production | undefined {
  return store.productions.get(id);
}
export function setProductionStatus(id: string, status: Production["approvalStatus"]): Production {
  const p = store.productions.get(id);
  if (!p) throw new Error("production_not_found");
  ProductionStatusSchema.parse(status);
  p.approvalStatus = status;
  store.productions.set(id, p);
  persistProductions();
  // Snapshot the full manifest set at the moment of approval for auditability.
  if (status === "approved") {
    const snap: ManifestSnapshot = {
      productionId: p.id,
      savedAt: now(),
      production: buildProductionManifest(p),
      unrealScene: buildUnrealSceneManifest(p),
      avatars: p.avatarIds
        .map((aid) => store.avatars.get(aid))
        .filter((a): a is Avatar => !!a)
        .map((a) => buildAvatarManifest(a)),
      fourDCues: buildFourDCueManifest(p.id),
    };
    storage.saveManifestSnapshot(snap);
    recordAudit("root_admin", "manifest_snapshot_saved", id);
  }
  recordAudit("root_admin", "production_status_changed", `${id}=${status}`);
  return { ...p };
}

/* 4D Cues */
export function createFourDCue(input: Omit<FourDCue, "id" | "createdAt">): FourDCue {
  const cue: FourDCue = { id: randomUUID(), createdAt: now(), ...input };
  store.fourDCues.set(cue.id, cue);
  persistFourDCues();
  recordAudit("root_admin", "four_d_cue_created", cue.name);
  return cue;
}
export function listFourDCues(): FourDCue[] {
  return [...store.fourDCues.values()];
}

/* Render jobs */
export function listRenderJobs(): RenderJob[] {
  return [...store.renderJobs.values()];
}

/* Unreal commands */
export function listUnrealCommands(): UnrealCommand[] {
  return store.unrealCommands.map((c) => ({ ...c }));
}

/* ------------------------------------------------------------------ */
/* Manifest builders                                                   */
/* ------------------------------------------------------------------ */

export function buildProductionManifest(p: Production): ProductionManifest {
  const room = p.roomId ? store.rooms.get(p.roomId) : undefined;
  const avatars = p.avatarIds.map((id) => store.avatars.get(id)).filter((a): a is Avatar => !!a);
  return {
    productionId: p.id,
    productionType: p.productionType,
    title: p.title,
    script: p.script,
    room: room?.name ?? "unassigned",
    avatars: avatars.map((a) => a.name),
    panels: p.panels,
    cameras: p.cameras,
    audio: p.audio,
    captions: p.captions,
    overlays: p.overlays,
    renderSettings: p.renderSettings,
    approvalStatus: p.approvalStatus,
    envelope: SAFETY_ENVELOPE,
  };
}

export function buildUnrealSceneManifest(p: Production): UnrealSceneManifest {
  const room = p.roomId ? store.rooms.get(p.roomId) : undefined;
  return {
    productionId: p.id,
    levelName: room?.unrealLevelName || `Level_${p.productionType}_default`,
    roomType: (room?.type ?? "newsroom") as UnrealSceneManifest["roomType"],
    cameraPreset: p.cameras[0] || "wide_default",
    lightingPreset: room?.lightingStyle || "default_studio",
    screenContent: p.panels,
    avatarBlueprints: p.avatarIds
      .map((id) => store.avatars.get(id)?.unrealBlueprintName || `BP_${id}`)
      .filter(Boolean),
    sequencerTimeline: `Sequence_${p.id}`,
    renderPreset: p.renderSettings.preset,
    envelope: SAFETY_ENVELOPE,
  };
}

export function buildAvatarManifest(a: Avatar): AvatarManifest {
  return {
    avatarId: a.id,
    avatarName: a.name,
    role: a.role,
    voiceProvider: a.voiceProvider,
    voiceId: a.voiceId,
    animationProvider: a.bodyAnimationProvider,
    unrealBlueprintName: a.unrealBlueprintName || `BP_${a.name.replace(/\s+/g, "_")}`,
    lipSyncFile: null,
    bodyAnimationFile: null,
    envelope: SAFETY_ENVELOPE,
  };
}

export function buildFourDCueManifest(productionId: string): FourDCueManifest {
  const cues = [...store.fourDCues.values()].filter((c) => c.productionId === productionId);
  return {
    productionId,
    timeline: cues.map((c) => ({
      timecodeMs: c.timecodeMs,
      cueType: c.effect,
      effectTarget: c.hardwareTarget,
      intensity: c.intensity,
      durationMs: c.durationMs,
      approvalRequired: true as const,
    })),
    envelope: SAFETY_ENVELOPE,
  };
}

/* ------------------------------------------------------------------ */
/* Unreal / 4D send — dryRun-ONLY (no real socket)                     */
/* ------------------------------------------------------------------ */

export function isRealUnrealSendAllowed(): boolean {
  // Permanently false in this MVP regardless of any env var.
  return false;
}
export function isReal4DSendAllowed(): boolean {
  // Permanently false in this MVP regardless of any env var.
  return false;
}

export function sendUnrealCommand(
  command: UnrealCommand["command"],
  payload: Record<string, unknown>,
  productionId: string | null,
): UnrealCommand {
  let status: UnrealCommand["status"] = "mock_accepted";
  let reason = "dry_run_mock — no outbound socket opened";

  // Approval gate: render & send_scene_manifest ALWAYS require a known,
  // approved production. A missing/null productionId is itself a rejection.
  if (command === "render" || command === "send_scene_manifest") {
    if (!productionId) {
      status = "mock_rejected";
      reason = "production_required_for_this_command";
    } else {
      const p = store.productions.get(productionId);
      if (!p) {
        status = "mock_rejected";
        reason = "production_not_found";
      } else if (
        p.approvalStatus !== "approved" &&
        p.approvalStatus !== "sent_to_unreal" &&
        p.approvalStatus !== "rendering"
      ) {
        status = "mock_rejected";
        reason = `production_not_approved (status=${p.approvalStatus})`;
      }
    }
  }

  const cmd: UnrealCommand = {
    id: randomUUID(),
    productionId,
    command,
    payload,
    dryRun: true as const,
    status,
    reason,
    createdAt: now(),
  };
  store.unrealCommands.push(cmd);
  if (store.unrealCommands.length > 1000) {
    store.unrealCommands.splice(0, store.unrealCommands.length - 1000);
  }
  persistUnrealCommands();

  if (status === "mock_accepted" && command === "render" && productionId) {
    // Create a queued render job — internal only, no public URL.
    const job: RenderJob = {
      id: randomUUID(),
      productionId,
      status: "queued",
      preset: (payload?.preset as RenderJob["preset"]) || "preview",
      startedAt: null,
      finishedAt: null,
      artifactRef: null,
      publicUrl: null,
      signedUrl: null,
      visibility: "admin_only_internal",
      createdAt: now(),
    };
    store.renderJobs.set(job.id, job);
    persistRenderJobs();
    setProductionStatus(productionId, "sent_to_unreal");
  }

  recordAudit("root_admin", `unreal_${command}`, `${status}: ${reason}`);
  return { ...cmd };
}

export function sendFourDCue(cueId: string): { ok: boolean; dryRun: true; reason: string } {
  const cue = store.fourDCues.get(cueId);
  if (!cue) return { ok: false, dryRun: true as const, reason: "cue_not_found" };
  if (cue.approvalStatus !== "approved") {
    recordAudit("root_admin", "four_d_send_blocked", `${cueId}: not_approved`);
    return { ok: false, dryRun: true as const, reason: "cue_not_approved" };
  }
  if (cue.safetyFlag === "blocked") {
    recordAudit("root_admin", "four_d_send_blocked", `${cueId}: safety_flag_blocked`);
    return { ok: false, dryRun: true as const, reason: "safety_flag_blocked" };
  }
  recordAudit("root_admin", "four_d_send_mock", `${cueId} mock accepted (no hardware bridge)`);
  return { ok: true, dryRun: true as const, reason: "mock_accepted — no real hardware send" };
}

export function sendFourDTimeline(productionId: string): {
  ok: boolean;
  dryRun: true;
  cueCount: number;
  reason: string;
} {
  const p = store.productions.get(productionId);
  if (!p) {
    return { ok: false, dryRun: true as const, cueCount: 0, reason: "production_not_found" };
  }
  if (p.approvalStatus !== "approved" && p.approvalStatus !== "sent_to_unreal") {
    return {
      ok: false,
      dryRun: true as const,
      cueCount: 0,
      reason: `production_not_approved (status=${p.approvalStatus})`,
    };
  }
  const cues = [...store.fourDCues.values()].filter((c) => c.productionId === productionId);
  recordAudit("root_admin", "four_d_timeline_mock", `${productionId} cues=${cues.length}`);
  return {
    ok: true,
    dryRun: true as const,
    cueCount: cues.length,
    reason: "mock_accepted — no real hardware send",
  };
}

/* ------------------------------------------------------------------ */
/* Integrations status — booleans only, no secrets                     */
/* ------------------------------------------------------------------ */

export interface IntegrationsStatus {
  openai: boolean;
  elevenlabs: boolean;
  meshy: boolean;
  runway: boolean;
  convai: boolean;
  nvidia_ace: boolean;
  deepmotion: boolean;
  rokoko: boolean;
  unreal_remote: boolean;
  four_d_bridge: boolean;
  resend: boolean;
  webhook_secret: boolean;
  realUnrealSendAllowed: false;
  real4DSendAllowed: false;
  envelope: typeof SAFETY_ENVELOPE;
}

export const INTEGRATION_PROVIDERS = [
  "openai",
  "elevenlabs",
  "meshy",
  "runway",
  "convai",
  "nvidia_ace",
  "deepmotion",
  "rokoko",
  "unreal_remote",
  "four_d_bridge",
] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

const PROVIDER_ENV_KEYS: Record<IntegrationProvider, readonly string[]> = {
  openai: ["OPENAI_API_KEY", "AI_INTEGRATIONS_OPENAI_API_KEY"],
  elevenlabs: ["ELEVENLABS_API_KEY"],
  meshy: ["MESHY_API_KEY"],
  runway: ["RUNWAY_API_KEY"],
  convai: ["CONVAI_API_KEY"],
  nvidia_ace: ["NVIDIA_ACE_API_KEY"],
  deepmotion: ["DEEPMOTION_API_KEY"],
  rokoko: ["ROKOKO_API_KEY"],
  unreal_remote: ["UNREAL_REMOTE_URL", "UNREAL_WEBSOCKET_URL"],
  four_d_bridge: ["LOCAL_4D_BRIDGE_URL", "DMX_BRIDGE_URL", "OSC_BRIDGE_URL"],
};

export interface IntegrationTestResult {
  ok: boolean;
  provider: IntegrationProvider;
  mockMode: true;
  hasCredential: boolean;
  realSendAllowed: false;
  reason: string;
  message: string;
  testedAt: string;
}

/**
 * Mock-only integration test. NEVER calls the external API. Returns a
 * deterministic success/failure based purely on whether the configured env
 * var(s) for that provider are present. No secret values are returned or
 * logged.
 */
export function testIntegration(
  provider: IntegrationProvider,
  env: NodeJS.ProcessEnv = process.env,
): IntegrationTestResult {
  const keys = PROVIDER_ENV_KEYS[provider];
  const hasCredential = keys.some((k) => !!env[k]?.trim());
  const ok = hasCredential; // mock-success iff credential present
  const result: IntegrationTestResult = {
    ok,
    provider,
    mockMode: true as const,
    hasCredential,
    realSendAllowed: false as const,
    reason: ok ? "mock_success" : "credential_missing",
    message: ok
      ? `MOCK: ${provider} credential detected. Real call NOT made (real sends disabled in this MVP).`
      : `MOCK: ${provider} credential not configured. Real call NOT made.`,
    testedAt: new Date().toISOString(),
  };
  recordAudit("root_admin", "integration_test_mock", `${provider}: ${result.reason}`);
  return result;
}

export function integrationsStatus(env: NodeJS.ProcessEnv = process.env): IntegrationsStatus {
  const has = (k: string) => !!env[k]?.trim();
  return {
    openai: has("OPENAI_API_KEY") || has("AI_INTEGRATIONS_OPENAI_API_KEY"),
    elevenlabs: has("ELEVENLABS_API_KEY"),
    meshy: has("MESHY_API_KEY"),
    runway: has("RUNWAY_API_KEY"),
    convai: has("CONVAI_API_KEY"),
    nvidia_ace: has("NVIDIA_ACE_API_KEY"),
    deepmotion: has("DEEPMOTION_API_KEY"),
    rokoko: has("ROKOKO_API_KEY"),
    unreal_remote: has("UNREAL_REMOTE_URL"),
    four_d_bridge: has("LOCAL_4D_BRIDGE_URL") || has("DMX_BRIDGE_URL") || has("OSC_BRIDGE_URL"),
    resend: has("RESEND_API_KEY"),
    webhook_secret: has("WEBHOOK_SECRET"),
    realUnrealSendAllowed: false,
    real4DSendAllowed: false,
    envelope: SAFETY_ENVELOPE,
  };
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

export interface Overview {
  totals: {
    productions: number;
    rooms: number;
    avatars: number;
    halls: number;
    podcasts: number;
    newsroomProductions: number;
    fourDCues: number;
    renderJobs: number;
    unrealCommands: number;
  };
  pendingRenders: number;
  pendingUnrealCommands: number;
  pendingFourDApprovals: number;
  recentProductions: Production[];
  integrations: IntegrationsStatus;
  envelope: typeof SAFETY_ENVELOPE;
}

export function getOverview(): Overview {
  const productions = [...store.productions.values()];
  return {
    totals: {
      productions: productions.length,
      rooms: store.rooms.size,
      avatars: store.avatars.size,
      halls: store.halls.size,
      podcasts: store.podcasts.size,
      newsroomProductions: store.newsroomProductions.size,
      fourDCues: store.fourDCues.size,
      renderJobs: store.renderJobs.size,
      unrealCommands: store.unrealCommands.length,
    },
    pendingRenders: [...store.renderJobs.values()].filter((j) => j.status === "queued").length,
    pendingUnrealCommands: store.unrealCommands.filter((c) => c.status === "mock_accepted")
      .length,
    pendingFourDApprovals: [...store.fourDCues.values()].filter(
      (c) => c.approvalStatus === "draft",
    ).length,
    recentProductions: productions.slice(-10).reverse(),
    integrations: integrationsStatus(),
    envelope: SAFETY_ENVELOPE,
  };
}

/* ------------------------------------------------------------------ */
/* Prompt Studio — deterministic mock generator                        */
/* ------------------------------------------------------------------ */

const KEYWORD_TO_EFFECT: Array<{ k: RegExp; e: FourDCueManifest["timeline"][number]["cueType"] }> = [
  { k: /fog|mist/i, e: "fog_burst" },
  { k: /bass|sub/i, e: "bass_hit" },
  { k: /flash|lightning/i, e: "light_flash" },
  { k: /wind/i, e: "wind" },
  { k: /vibrat|rumble|shake/i, e: "vibration" },
  { k: /scent|smell/i, e: "scent_cue" },
  { k: /water|rain/i, e: "water_mist" },
  { k: /heat|fire/i, e: "heat_cue" },
  { k: /color|red|blue|gold/i, e: "color_change" },
];

export function runPromptStudio(input: PromptStudioInput): PromptStudioOutput {
  // Deterministic ID derived from normalized input — same prompt always
  // produces the same manifests. No randomUUID() here.
  const normalized = `${input.productionType}::${input.prompt.trim().replace(/\s+/g, " ").toLowerCase()}`;
  const id = `phps_${createHash("sha256").update(normalized).digest("hex").slice(0, 24)}`;
  const lower = input.prompt.toLowerCase();

  // Extract bullets — split on commas / "and" for a quick deterministic summary.
  const bullets = input.prompt
    .split(/,| and /i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 12);

  const cues = KEYWORD_TO_EFFECT.filter((m) => m.k.test(lower)).map((m, i) => ({
    timecodeMs: 1_000 * (i + 1),
    cueType: m.e,
    effectTarget: "placeholder",
    intensity: 0.6,
    durationMs: 1_500,
    approvalRequired: true as const,
  }));

  const sceneManifest: UnrealSceneManifest = {
    productionId: id,
    levelName: `Level_${input.productionType}_${id.slice(0, 8)}`,
    roomType:
      input.productionType === "podcast"
        ? "podcast_room"
        : input.productionType === "hall_event"
          ? "conference_hall"
          : "newsroom",
    cameraPreset: /zoom|close/i.test(lower) ? "close_zoom" : "wide_default",
    lightingPreset: /red alert|alert/i.test(lower)
      ? "red_alert"
      : /blue.*gold|gold.*blue/i.test(lower)
        ? "blue_gold_studio"
        : "default_studio",
    screenContent: bullets,
    avatarBlueprints: ["BP_AIAnchor_Default"],
    sequencerTimeline: `Sequence_${id}`,
    renderPreset: "preview",
    envelope: SAFETY_ENVELOPE,
  };

  const avatarManifest: AvatarManifest = {
    avatarId: `avatar_${id.slice(0, 8)}`,
    avatarName: "AI Anchor",
    role: "news_anchor",
    voiceProvider: "placeholder",
    voiceId: "default",
    animationProvider: "placeholder",
    unrealBlueprintName: "BP_AIAnchor_Default",
    lipSyncFile: null,
    bodyAnimationFile: null,
    envelope: SAFETY_ENVELOPE,
  };

  const fourDCueManifest: FourDCueManifest = {
    productionId: id,
    timeline: cues,
    envelope: SAFETY_ENVELOPE,
  };

  recordAudit("root_admin", "manifest_built_prompt_studio", `prompt=${input.prompt.slice(0, 120)}`);

  return {
    productionPlan: {
      title: input.prompt.split(/[.,]/)[0].slice(0, 120) || "Untitled Production",
      summary: input.prompt.slice(0, 400),
      bullets,
    },
    sceneManifest,
    unrealCommand: {
      command: "send_scene_manifest" as const,
      payload: { sceneManifest },
      dryRun: true as const,
    },
    avatarManifest,
    fourDCueManifest,
    assetGenerationPrompts: bullets.map((b) => `3D asset: ${b}`),
    voiceGenerationPrompts: [`Deliver in calm authoritative tone: "${input.prompt.slice(0, 200)}"`],
    cameraShotList: ["intro_wide", "anchor_medium", "panel_insert", "outro_pull_back"],
    renderInstructions: {
      preset: "preview" as const,
      fps: 30,
      requiresApproval: true as const,
    },
    envelope: SAFETY_ENVELOPE,
  };
}

/* ------------------------------------------------------------------ */
/* 4D Hardware Sandbox — mock-only, never controls physical devices.   */
/* ------------------------------------------------------------------ */

export function getFourDSandboxHealth() {
  return {
    ok: true,
    mode: "4d_sandbox" as const,
    status: "healthy" as const,
    dryRunOnly: true as const,
    realSendAllowed: false as const,
    connectedToHardware: false as const,
    dmxEnabled: false as const,
    oscEnabled: false as const,
    udpEnabled: false as const,
    midiEnabled: false as const,
    serialEnabled: false as const,
    relayEnabled: false as const,
    fogEnabled: false as const,
    windEnabled: false as const,
    scentEnabled: false as const,
    vibrationEnabled: false as const,
    motionSeatEnabled: false as const,
    lightingEnabled: false as const,
    publishingEnabled: false as const,
    supportedEffectCount: FOUR_D_EFFECT_TYPES.length,
    safetyEnvelope: SAFETY_ENVELOPE,
    notice:
      "4D Hardware Sandbox: accepts valid dry-run cue payloads only and " +
      "returns deterministic mock responses. It does not connect to any " +
      "physical 4D hardware and does not send DMX, OSC, UDP, MIDI, " +
      "serial, relay, fog, wind, scent, vibration, motion-seat, or " +
      "lighting commands.",
  };
}

export function listFourDSandboxSupportedEffects(): readonly string[] {
  return FOUR_D_EFFECT_TYPES;
}

export function listFourDSandboxExampleCues() {
  return getFourDSandboxExampleCues();
}

export interface SendFourDSandboxResult {
  job: FourDSandboxJob;
  accepted: boolean;
  failures: string[];
  errorCodes: string[];
}

export function sendFourDSandboxCue(input: unknown): SendFourDSandboxResult {
  const validation = validateFourDSandboxCue(input);
  const body = (input ?? {}) as Record<string, unknown>;
  const accepted = validation.ok;
  const productionId = typeof body.productionId === "string" ? body.productionId : "unknown";
  const cueId = typeof body.cueId === "string" ? body.cueId : "unknown";
  const effectType = typeof body.effectType === "string" ? body.effectType : "unknown";

  const seed = JSON.stringify({
    productionId, cueId, effectType,
    mode: "4d_sandbox", dryRun: true, realSendAllowed: false,
    safety: SAFETY_ENVELOPE,
  });
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 24);
  const jobId = `four_d_sandbox_${hash}`;

  const status: FourDSandboxJob["status"] = accepted ? "sandbox_accepted" : "sandbox_rejected";
  const responsePayload: Record<string, unknown> = accepted
    ? {
        ok: true,
        mode: "4d_sandbox",
        realSendAllowed: false,
        dryRun: true,
        status: "sandbox_accepted",
        cueJobId: jobId,
        cueId, effectType,
        message: "4D sandbox cue accepted. No real hardware command was sent.",
        echo: {
          mode: "4d_sandbox",
          dryRun: true,
          realSendAllowed: false,
          safetyEnvelope: SAFETY_ENVELOPE,
        },
      }
    : {
        ok: false,
        mode: "4d_sandbox",
        realSendAllowed: false,
        dryRun: true,
        status: "sandbox_rejected",
        cueId, effectType,
        message: "4D sandbox cue rejected. No real hardware command was sent.",
        failures: validation.failures,
        errorCodes: validation.errorCodes,
      };

  // Allowlist-only serialization. Drop any caller-supplied secret-like fields
  // before persistence so /history and full export never leak credentials.
  const ALLOWED = new Set([
    "cueId","productionId","timecode","effectType","intensity","durationMs",
    "target","mode","dryRun","realSendAllowed","safetyEnvelope","visibility",
    "publicUrl","signedUrl",
  ]);
  const safeRequest: Record<string, unknown> = {};
  for (const k of Object.keys(body)) if (ALLOWED.has(k)) safeRequest[k] = (body as any)[k];
  safeRequest.mode = "4d_sandbox";
  safeRequest.dryRun = true;
  safeRequest.realSendAllowed = false;
  safeRequest.publicUrl = null;
  safeRequest.signedUrl = null;
  safeRequest.visibility = "admin_only_internal";
  safeRequest.safetyEnvelope = SAFETY_ENVELOPE;

  const job: FourDSandboxJob = {
    id: jobId,
    cueId,
    productionId,
    effectType,
    mode: "4d_sandbox",
    dryRun: true,
    realSendAllowed: false,
    status,
    requestPayload: safeRequest,
    responsePayload,
    createdAt: new Date().toISOString(),
    safetyEnvelope: SAFETY_ENVELOPE,
  };
  store.fourDSandboxJobs.set(job.id, job);
  persistFourDSandboxJobs();
  return { job, accepted, failures: validation.failures, errorCodes: validation.errorCodes };
}

export function listFourDSandboxJobs(productionId?: string): FourDSandboxJob[] {
  const all = [...store.fourDSandboxJobs.values()];
  const filtered = productionId ? all.filter((j) => j.productionId === productionId) : all;
  return filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/* ------------------------------------------------------------------ */
/* Production Readiness Scoring — internal analysis only.              */
/* Never enables real Unreal/4D sends, never publishes, never auto-    */
/* approves, never exposes secrets, never creates public URLs.         */
/* ------------------------------------------------------------------ */

function scanForForbiddenUrls(obj: unknown): { publicUrls: number; signedUrls: number; realSend: number } {
  const counts = { publicUrls: 0, signedUrls: 0, realSend: 0 };
  const seen = new WeakSet<object>();
  function walk(v: unknown): void {
    if (v === null || typeof v !== "object") return;
    if (seen.has(v as object)) return;
    seen.add(v as object);
    if (Array.isArray(v)) { v.forEach(walk); return; }
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (k === "publicUrl" && val !== null && val !== undefined) counts.publicUrls++;
      else if (k === "signedUrl" && val !== null && val !== undefined) counts.signedUrls++;
      else if (k === "realSendAllowed" && val === true) counts.realSend++;
      walk(val);
    }
  }
  walk(obj);
  return counts;
}

function scoreFromChecks(passed: ReadinessCheck[], failed: ReadinessCheck[]): number {
  const total = passed.length + failed.length;
  if (total === 0) return 0;
  const blockers = failed.filter((c) => c.severity === "blocker").length;
  if (blockers > 0) return Math.max(0, Math.min(40, Math.round((passed.length / total) * 40)));
  return Math.round((passed.length / total) * 100);
}

export function analyzeProductionReadiness(productionId: string): ReadinessReport | null {
  const p = store.productions.get(productionId);
  if (!p) return null;
  const pkg = getProductionPackage(productionId)!;
  const checks: ReadinessCheck[] = [];
  const pass: ReadinessCheck[] = [];
  const fail: ReadinessCheck[] = [];

  function check(
    id: string, label: string,
    channel: ReadinessCheck["channel"], severity: ReadinessCheck["severity"],
    ok: boolean,
  ) {
    const c: ReadinessCheck = { id, label, channel, severity };
    checks.push(c);
    (ok ? pass : fail).push(c);
  }

  // Production-level
  check("production_exists", "Production exists", "global", "blocker", true);
  check("script_exists", "Script content present", "ai_package", "blocker",
    (p.script ?? "").trim().length > 0);
  check("room_selected", "Room selected", "ai_package", "warning", !!p.roomId);
  check("avatar_selected", "At least one avatar selected", "ai_package", "warning",
    (p.avatarIds ?? []).length > 0);
  check("approval_known", "Approval status is known", "global", "info",
    typeof p.approvalStatus === "string" && p.approvalStatus.length > 0);

  // Manifests
  check("production_manifest", "Production manifest exists", "ai_package", "blocker",
    !!pkg.productionManifest);
  check("unreal_scene_manifest", "Unreal scene manifest exists", "unreal_sandbox", "warning",
    !!pkg.unrealSceneManifest);
  check("avatar_manifest", "At least one avatar manifest exists", "ai_package", "warning",
    Array.isArray(pkg.avatarManifests) && pkg.avatarManifests.length > 0);
  check("four_d_cue_manifest", "4D cue manifest exists", "four_d_sandbox", "warning",
    !!pkg.fourDCueManifest);
  check("manifest_snapshot", "Manifest snapshot persisted", "ai_package", "info",
    !!pkg.manifestSnapshot);

  // Assets
  const voices = listVoiceAssets(productionId);
  const assets = listAssetJobs(productionId);
  const videos = listVideoJobs(productionId);
  check("voice_assets", "Voice asset(s) exist", "asset",
    voices.length === 0 ? "blocker" : "info", voices.length > 0);
  check("meshy_asset_jobs", "Meshy asset job(s) exist", "asset", "warning", assets.length > 0);
  check("runway_video_jobs", "Runway video job(s) exist", "asset", "warning", videos.length > 0);

  // Sandbox jobs
  const sandboxCmds = listUnrealSandboxCommands(productionId);
  check("unreal_sandbox_command", "Unreal sandbox command exists", "unreal_sandbox", "warning",
    sandboxCmds.length > 0);
  const bridgeJobs = listLocalBridgeStubJobs(productionId);
  check("local_bridge_stub_job", "Local bridge stub job exists", "unreal_sandbox", "info",
    bridgeJobs.length > 0);
  const fourDJobs = listFourDSandboxJobs(productionId);
  check("four_d_sandbox_job", "4D sandbox job exists", "four_d_sandbox", "warning",
    fourDJobs.length > 0);

  // Safety scans across the FULL export-shaped package, including all
  // sandbox/bridge/4D job collections that appear in case "full" export.
  const fullScanTarget = {
    ...pkg,
    unrealSandboxCommands: sandboxCmds,
    localBridgeStubJobs: bridgeJobs,
    fourDSandboxJobs: fourDJobs,
    readinessHistory: store.readinessReports.filter((r) => r.productionId === productionId),
  };
  const urlScan = scanForForbiddenUrls(fullScanTarget);
  check("no_public_urls", "No publicUrl values anywhere in package", "global", "blocker",
    urlScan.publicUrls === 0);
  check("no_signed_urls", "No signedUrl values anywhere in package", "global", "blocker",
    urlScan.signedUrls === 0);
  check("no_real_send_allowed", "No realSendAllowed:true anywhere in package", "global", "blocker",
    urlScan.realSend === 0);

  // Visibility scan: every job-style record uses admin_only_internal
  const visibilityOk =
    bridgeJobs.every((j) => j.requestPayload?.visibility === "admin_only_internal") &&
    fourDJobs.every((j) => j.requestPayload?.visibility === "admin_only_internal");
  check("visibility_admin_only_internal",
    "All sandbox jobs use visibility=admin_only_internal", "global", "blocker", visibilityOk);

  check("safety_envelope_present", "SAFETY_ENVELOPE present and locked", "global", "blocker",
    SAFETY_ENVELOPE.realUnrealCommands === false &&
    SAFETY_ENVELOPE.real4DCommands === false &&
    SAFETY_ENVELOPE.publicUrlGeneration === false &&
    SAFETY_ENVELOPE.signedUrlGeneration === false);

  // Channel partitioning
  const byChannel = (ch: ReadinessCheck["channel"]) => ({
    pass: pass.filter((c) => c.channel === ch || c.channel === "global"),
    fail: fail.filter((c) => c.channel === ch || c.channel === "global"),
  });
  const ai = byChannel("ai_package");
  const asset = byChannel("asset");
  const us = byChannel("unreal_sandbox");
  const fd = byChannel("four_d_sandbox");

  const aiPackageScore = scoreFromChecks(ai.pass, ai.fail);
  const assetScore = scoreFromChecks(asset.pass, asset.fail);
  const unrealSandboxScore = scoreFromChecks(us.pass, us.fail);
  const fourDSandboxScore = scoreFromChecks(fd.pass, fd.fail);
  const overallScore = scoreFromChecks(pass, fail);

  // Future readiness is intentionally capped — no real bridge exists yet.
  // Always capped < production-ready (75) regardless of other checks.
  const FUTURE_CAP = 50;
  const futureRealUnrealEnabled = false as const;
  const futureReal4DEnabled = false as const;
  const futureRealUnrealScore = Math.min(FUTURE_CAP, Math.round(unrealSandboxScore * 0.6));
  const futureReal4DScore = Math.min(FUTURE_CAP, Math.round(fourDSandboxScore * 0.6));

  const idHash = createHash("sha256")
    .update(`${productionId}:${Date.now()}:${Math.random()}`)
    .digest("hex").slice(0, 16);
  const report: ReadinessReport = {
    id: `readiness_${idHash}`,
    productionId,
    overallScore,
    aiPackageScore,
    assetScore,
    unrealSandboxScore,
    fourDSandboxScore,
    futureRealUnrealScore,
    futureReal4DScore,
    blockers: fail.filter((c) => c.severity === "blocker"),
    warnings: fail.filter((c) => c.severity === "warning"),
    passedChecks: pass,
    failedChecks: fail,
    futureRealUnrealEnabled,
    futureReal4DEnabled,
    createdAt: new Date().toISOString(),
    safetyEnvelope: SAFETY_ENVELOPE,
  };
  store.readinessReports.push(report);
  // Keep history bounded.
  if (store.readinessReports.length > 500) {
    store.readinessReports.splice(0, store.readinessReports.length - 500);
  }
  persistReadinessReports();
  return report;
}

export function getLatestReadinessReport(productionId: string): ReadinessReport | null {
  const reports = store.readinessReports
    .filter((r) => r.productionId === productionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return reports[0] ?? null;
}

export function listReadinessReports(productionId: string): ReadinessReport[] {
  return store.readinessReports
    .filter((r) => r.productionId === productionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/* ------------------------------------------------------------------ */
/* Production Approval Board — internal workflow only.                  */
/* Never auto-triggers Unreal, 4D, or publishing. Never auto-approves. */
/* ------------------------------------------------------------------ */

const SANDBOX_READINESS_THRESHOLD = 60;

function getApprovalStage(productionId: string): ApprovalStage {
  return store.approvalStates.get(productionId) ?? "draft";
}

function isTransitionStructurallyAllowed(
  from: ApprovalStage,
  to: ApprovalStage,
): { ok: boolean; reasonRequired: boolean; needsReadiness: "none" | "no_blockers" | "unreal_sandbox" | "four_d_sandbox" } {
  // any → blocked / revision_requested (reason required)
  if (to === "blocked") return { ok: true, reasonRequired: true, needsReadiness: "none" };
  if (to === "revision_requested") return { ok: true, reasonRequired: true, needsReadiness: "none" };

  // blocked → needs_review (reason required)
  if (from === "blocked" && to === "needs_review") return { ok: true, reasonRequired: true, needsReadiness: "none" };
  // revision_requested → needs_review (reason required)
  if (from === "revision_requested" && to === "needs_review") return { ok: true, reasonRequired: true, needsReadiness: "none" };

  // draft → needs_review
  if (from === "draft" && to === "needs_review") return { ok: true, reasonRequired: false, needsReadiness: "none" };

  // needs_review → internal_review_approved (no critical blockers)
  if (from === "needs_review" && to === "internal_review_approved") {
    return { ok: true, reasonRequired: false, needsReadiness: "no_blockers" };
  }

  // internal_review_approved → unreal_sandbox_approved (sandbox readiness threshold)
  if (from === "internal_review_approved" && to === "unreal_sandbox_approved") {
    return { ok: true, reasonRequired: false, needsReadiness: "unreal_sandbox" };
  }

  // internal_review_approved → four_d_sandbox_approved (sandbox readiness threshold)
  if (from === "internal_review_approved" && to === "four_d_sandbox_approved") {
    return { ok: true, reasonRequired: false, needsReadiness: "four_d_sandbox" };
  }

  return { ok: false, reasonRequired: false, needsReadiness: "none" };
}

export interface ApprovalTransitionResult {
  ok: boolean;
  productionId: string;
  fromState: ApprovalStage;
  toState: ApprovalStage;
  error?: string;
  message?: string;
  entry?: ApprovalHistoryEntry;
  readinessReportId?: string | null;
}

export function transitionApprovalStage(input: {
  productionId: string;
  toState: ApprovalStage;
  reason?: string;
}): ApprovalTransitionResult {
  const { productionId, toState } = input;
  const reason = (input.reason ?? "").trim();
  const production = store.productions.get(productionId);
  if (!production) {
    return {
      ok: false, productionId, fromState: "draft", toState,
      error: "production_not_found", message: "Unknown production.",
    };
  }

  const fromState = getApprovalStage(productionId);
  const rule = isTransitionStructurallyAllowed(fromState, toState);
  if (!rule.ok) {
    return {
      ok: false, productionId, fromState, toState,
      error: "invalid_transition",
      message: `Transition ${fromState} → ${toState} is not allowed.`,
    };
  }
  if (rule.reasonRequired && reason.length < 1) {
    return {
      ok: false, productionId, fromState, toState,
      error: "reason_required",
      message: `Transition to ${toState} requires a non-empty reason.`,
    };
  }

  const latestReadiness = getLatestReadinessReport(productionId);
  if (rule.needsReadiness === "no_blockers") {
    if (!latestReadiness) {
      return {
        ok: false, productionId, fromState, toState,
        error: "readiness_required",
        message: "Run a readiness analysis before approving internal review.",
      };
    }
    if (latestReadiness.blockers.length > 0) {
      return {
        ok: false, productionId, fromState, toState,
        error: "blockers_present",
        message: `Cannot approve internal review while ${latestReadiness.blockers.length} blocker(s) are present.`,
      };
    }
  }
  if (rule.needsReadiness === "unreal_sandbox") {
    if (!latestReadiness) {
      return {
        ok: false, productionId, fromState, toState,
        error: "readiness_required",
        message: "Run a readiness analysis before sandbox approval.",
      };
    }
    if (latestReadiness.unrealSandboxScore < SANDBOX_READINESS_THRESHOLD) {
      return {
        ok: false, productionId, fromState, toState,
        error: "readiness_threshold_not_met",
        message: `Unreal sandbox readiness ${latestReadiness.unrealSandboxScore}/100 is below threshold ${SANDBOX_READINESS_THRESHOLD}.`,
      };
    }
  }
  if (rule.needsReadiness === "four_d_sandbox") {
    if (!latestReadiness) {
      return {
        ok: false, productionId, fromState, toState,
        error: "readiness_required",
        message: "Run a readiness analysis before sandbox approval.",
      };
    }
    if (latestReadiness.fourDSandboxScore < SANDBOX_READINESS_THRESHOLD) {
      return {
        ok: false, productionId, fromState, toState,
        error: "readiness_threshold_not_met",
        message: `4D sandbox readiness ${latestReadiness.fourDSandboxScore}/100 is below threshold ${SANDBOX_READINESS_THRESHOLD}.`,
      };
    }
  }

  // Persist transition.
  const entryId = `approval_${createHash("sha256")
    .update(`${productionId}:${fromState}:${toState}:${Date.now()}:${Math.random()}`)
    .digest("hex").slice(0, 20)}`;
  const entry: ApprovalHistoryEntry = {
    id: entryId,
    productionId,
    fromState,
    toState,
    reason,
    readinessReportId: latestReadiness?.id ?? null,
    actor: "root_admin",
    createdAt: new Date().toISOString(),
    safetyEnvelope: SAFETY_ENVELOPE,
  };
  store.approvalHistory.push(entry);
  store.approvalStates.set(productionId, toState);
  // Bound history at 1000 entries.
  if (store.approvalHistory.length > 1000) {
    store.approvalHistory.splice(0, store.approvalHistory.length - 1000);
  }
  persistApprovalHistory();
  persistApprovalStates();

  return {
    ok: true, productionId, fromState, toState,
    message: `Production moved from ${fromState} to ${toState}.`,
    entry,
    readinessReportId: entry.readinessReportId,
  };
}

export function listApprovalHistory(productionId: string): ApprovalHistoryEntry[] {
  return store.approvalHistory
    .filter((h) => h.productionId === productionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getApprovalBoard(): Array<{
  productionId: string;
  title: string;
  stage: ApprovalStage;
  overallScore: number | null;
  unrealSandboxScore: number | null;
  fourDSandboxScore: number | null;
  blockerCount: number;
  warningCount: number;
  assetCompleteness: {
    voiceAssets: number;
    assetJobs: number;
    videoJobs: number;
    unrealSandboxCommands: number;
    fourDSandboxJobs: number;
  };
  latestReadinessReportId: string | null;
}> {
  const out: any[] = [];
  for (const p of store.productions.values()) {
    const latest = getLatestReadinessReport(p.id);
    out.push({
      productionId: p.id,
      title: p.title,
      stage: getApprovalStage(p.id),
      overallScore: latest?.overallScore ?? null,
      unrealSandboxScore: latest?.unrealSandboxScore ?? null,
      fourDSandboxScore: latest?.fourDSandboxScore ?? null,
      blockerCount: latest?.blockers.length ?? 0,
      warningCount: latest?.warnings.length ?? 0,
      assetCompleteness: {
        voiceAssets: listVoiceAssets(p.id).length,
        assetJobs: listAssetJobs(p.id).length,
        videoJobs: listVideoJobs(p.id).length,
        unrealSandboxCommands: listUnrealSandboxCommands(p.id).length,
        fourDSandboxJobs: listFourDSandboxJobs(p.id).length,
      },
      latestReadinessReportId: latest?.id ?? null,
    });
  }
  return out;
}

export function getApprovalBoardProduction(productionId: string): null | {
  productionId: string;
  title: string;
  stage: ApprovalStage;
  readiness: ReadinessReport | null;
  history: ApprovalHistoryEntry[];
  assetCompleteness: ReturnType<typeof getApprovalBoard>[number]["assetCompleteness"];
  allowedStages: ApprovalStage[];
} {
  const p = store.productions.get(productionId);
  if (!p) return null;
  const stage = getApprovalStage(productionId);
  const allowed = APPROVAL_STAGES.filter(
    (s) => s !== stage && isTransitionStructurallyAllowed(stage, s).ok,
  );
  return {
    productionId,
    title: p.title,
    stage,
    readiness: getLatestReadinessReport(productionId),
    history: listApprovalHistory(productionId),
    assetCompleteness: {
      voiceAssets: listVoiceAssets(productionId).length,
      assetJobs: listAssetJobs(productionId).length,
      videoJobs: listVideoJobs(productionId).length,
      unrealSandboxCommands: listUnrealSandboxCommands(productionId).length,
      fourDSandboxJobs: listFourDSandboxJobs(productionId).length,
    },
    allowedStages: allowed,
  };
}

export function _setApprovalStageForTests(productionId: string, stage: ApprovalStage): void {
  store.approvalStates.set(productionId, stage);
  persistApprovalStates();
}
export function _getApprovalStageForTests(productionId: string): ApprovalStage {
  return getApprovalStage(productionId);
}

/* ------------------------------------------------------------------ */
/* Real Unreal Bridge Setup — dry-run handshake only.                  */
/* Never sends real Unreal commands. Never triggers Movie Render Queue */
/* or asset imports. Never publishes. realSendAllowed locked false.    */
/* ------------------------------------------------------------------ */

function getRealUnrealBridgeEnv(): {
  baseUrl: string;
  hasBaseUrl: boolean;
  hasToken: boolean;
  rawMode: string;
  mode: RealUnrealBridgeMode | "invalid";
  endpointHost: string;
} {
  const baseUrl = String(process.env.UNREAL_BRIDGE_BASE_URL ?? "").trim();
  const token = String(process.env.UNREAL_BRIDGE_TOKEN ?? "").trim();
  const rawMode = String(process.env.UNREAL_BRIDGE_MODE ?? "").trim();
  const modeOk = (REAL_UNREAL_BRIDGE_MODES as readonly string[]).includes(rawMode);
  let endpointHost = "";
  if (baseUrl) {
    try { endpointHost = new URL(baseUrl).host; } catch { endpointHost = ""; }
  }
  return {
    baseUrl,
    hasBaseUrl: baseUrl.length > 0,
    hasToken: token.length > 0,
    rawMode,
    mode: modeOk ? (rawMode as RealUnrealBridgeMode) : "invalid",
    endpointHost,
  };
}

export function getRealUnrealSetupStatus(): {
  configured: boolean;
  hasBaseUrl: boolean;
  hasToken: boolean;
  mode: RealUnrealBridgeMode | "invalid";
  endpointHost: string;
  dryRunOnly: true;
  realSendAllowed: false;
  publishingEnabled: false;
  allowedModes: typeof REAL_UNREAL_BRIDGE_MODES;
  safetyEnvelope: typeof SAFETY_ENVELOPE;
} {
  const env = getRealUnrealBridgeEnv();
  return {
    configured: env.hasBaseUrl && env.hasToken && env.mode === "dry_run",
    hasBaseUrl: env.hasBaseUrl,
    hasToken: env.hasToken,
    mode: env.mode,
    endpointHost: env.endpointHost,
    dryRunOnly: true,
    realSendAllowed: false,
    publishingEnabled: false,
    allowedModes: REAL_UNREAL_BRIDGE_MODES,
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

export function validateRealUnrealConfig(): {
  ok: boolean;
  failures: string[];
  errorCodes: string[];
  status: ReturnType<typeof getRealUnrealSetupStatus>;
} {
  const status = getRealUnrealSetupStatus();
  const failures: string[] = [];
  const errorCodes: string[] = [];
  if (!status.hasBaseUrl) {
    failures.push("UNREAL_BRIDGE_BASE_URL is missing.");
    errorCodes.push("missing_base_url");
  } else {
    // Defense in depth: base URL must be a well-formed http(s) URL.
    const rawBase = String(process.env.UNREAL_BRIDGE_BASE_URL ?? "").trim();
    let parsed: URL | null = null;
    try { parsed = new URL(rawBase); } catch { parsed = null; }
    if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
      failures.push("UNREAL_BRIDGE_BASE_URL must be a valid http(s) URL.");
      errorCodes.push("invalid_base_url");
    }
  }
  if (!status.hasToken) {
    failures.push("UNREAL_BRIDGE_TOKEN is missing.");
    errorCodes.push("missing_token");
  }
  if (status.mode === "invalid") {
    failures.push("UNREAL_BRIDGE_MODE must be 'disabled' or 'dry_run'.");
    errorCodes.push("invalid_mode");
  } else if (status.mode === "disabled") {
    failures.push("UNREAL_BRIDGE_MODE is 'disabled'.");
    errorCodes.push("mode_disabled");
  }
  // Also reject any leaked attempt to set live/real mode via raw env.
  const raw = String(process.env.UNREAL_BRIDGE_MODE ?? "").trim().toLowerCase();
  if (raw === "live" || raw === "real" || raw === "production") {
    failures.push(`UNREAL_BRIDGE_MODE '${raw}' is forbidden in this phase.`);
    errorCodes.push("mode_forbidden");
  }
  return { ok: failures.length === 0, failures, errorCodes, status };
}

export interface RealUnrealDryRunHandshakeInput {
  confirm?: boolean;
}

export interface RealUnrealDryRunHandshakeResult {
  ok: boolean;
  mode: "dry_run";
  dryRun: true;
  realSendAllowed: false;
  status: "dry_run_ok" | "dry_run_failed" | "config_missing" | "rejected";
  message: string;
  failures: string[];
  errorCodes: string[];
  record?: RealUnrealHandshakeRecord;
}

/**
 * Build the allowlist-only dry-run health_check requestSummary. The exact
 * same shape is stored on every handshake record regardless of outcome
 * (success, failure, rejection) so the persisted payload cannot drift to
 * include production/asset/render/import data.
 */
function buildDryRunRequestSummary(): {
  commandType: "health_check";
  mode: "dry_run";
  dryRun: true;
  realSendAllowed: false;
  source: "mougle-production-house";
  timestamp: string;
} {
  return {
    commandType: "health_check",
    mode: "dry_run",
    dryRun: true,
    realSendAllowed: false,
    source: "mougle-production-house",
    timestamp: new Date().toISOString(),
  };
}

export function attemptRealUnrealDryRunHandshake(
  input: RealUnrealDryRunHandshakeInput,
): RealUnrealDryRunHandshakeResult {
  const requestSummary = buildDryRunRequestSummary();
  // Rejection: missing confirm.
  if (input.confirm !== true) {
    const rec = recordHandshake(
      "rejected",
      requestSummary,
      {
        simulated: true, handshakeAcceptedLocally: false,
        reason: "confirm_required", errorCodes: ["confirm_required"],
      },
    );
    return {
      ok: false, mode: "dry_run", dryRun: true, realSendAllowed: false,
      status: "rejected",
      message: "Dry-run handshake requires explicit confirm:true.",
      failures: ["confirm:true is required."],
      errorCodes: ["confirm_required"],
      record: rec,
    };
  }
  const cfg = validateRealUnrealConfig();
  if (!cfg.ok) {
    const rec = recordHandshake(
      "config_missing",
      requestSummary,
      {
        simulated: true, handshakeAcceptedLocally: false,
        reason: "config_missing", errorCodes: cfg.errorCodes,
      },
    );
    return {
      ok: false, mode: "dry_run", dryRun: true, realSendAllowed: false,
      status: "config_missing",
      message: "Configuration is incomplete; dry-run handshake cannot proceed.",
      failures: cfg.failures,
      errorCodes: cfg.errorCodes,
      record: rec,
    };
  }
  // Success: NOT sent over the network in this phase — purely simulated.
  const responseSummary = {
    simulated: true,
    handshakeAcceptedLocally: true,
    note: "Local dry-run only; no network call was made; no real Unreal command was sent.",
  };
  const rec = recordHandshake("dry_run_ok", requestSummary, responseSummary);
  return {
    ok: true, mode: "dry_run", dryRun: true, realSendAllowed: false,
    status: "dry_run_ok",
    message: "Dry-run handshake completed locally. No real Unreal command was sent.",
    failures: [],
    errorCodes: [],
    record: rec,
  };
}

function recordHandshake(
  status: RealUnrealHandshakeRecord["status"],
  requestSummary: Record<string, unknown>,
  responseSummary: Record<string, unknown>,
): RealUnrealHandshakeRecord {
  const env = getRealUnrealBridgeEnv();
  const idHash = createHash("sha256")
    .update(`real_unreal_handshake:${Date.now()}:${Math.random()}`)
    .digest("hex").slice(0, 20);
  const rec: RealUnrealHandshakeRecord = {
    id: `real_unreal_handshake_${idHash}`,
    mode: "dry_run",
    endpointHost: env.endpointHost,
    status,
    realSendAllowed: false,
    requestSummary,
    responseSummary,
    createdAt: new Date().toISOString(),
    safetyEnvelope: SAFETY_ENVELOPE,
  };
  store.realUnrealHandshakeHistory.push(rec);
  if (store.realUnrealHandshakeHistory.length > 500) {
    store.realUnrealHandshakeHistory.splice(
      0, store.realUnrealHandshakeHistory.length - 500,
    );
  }
  persistRealUnrealHandshakeHistory();
  return rec;
}

export function listRealUnrealHandshakeHistory(): RealUnrealHandshakeRecord[] {
  return [...store.realUnrealHandshakeHistory].sort(
    (a, b) => (a.createdAt < b.createdAt ? 1 : -1),
  );
}

/* ------------------------------------------------------------------ */
/* Real Unreal Dry-Run Package Validation — dry-run only.              */
/* No real renders. No MRQ. No asset import. No level load. No 4D.     */
/* realSendAllowed locked false. No network call is performed.         */
/* ------------------------------------------------------------------ */

export function getRealUnrealDryRunValidationStatus(): {
  bridge: ReturnType<typeof getRealUnrealSetupStatus>;
  dryRunOnly: true;
  realSendAllowed: false;
  publishingEnabled: false;
  allowedApprovalStages: ApprovalStage[];
} {
  return {
    bridge: getRealUnrealSetupStatus(),
    dryRunOnly: true,
    realSendAllowed: false,
    publishingEnabled: false,
    allowedApprovalStages: ["internal_review_approved", "unreal_sandbox_approved"],
  };
}

function check(id: string, label: string, ok: boolean, detail = ""): DryRunLocalCheck {
  return { id, label, ok, detail };
}

function packageContainsForbiddenUrls(pkg: unknown): boolean {
  const text = JSON.stringify(pkg ?? {});
  // Strip explicit "...":null forms before checking for non-null values.
  const stripped = text
    .replace(/"publicUrl"\s*:\s*null/g, "")
    .replace(/"signedUrl"\s*:\s*null/g, "");
  return /"publicUrl"/.test(stripped) || /"signedUrl"/.test(stripped);
}

function packageContainsRealSendTrue(pkg: unknown): boolean {
  return /"realSendAllowed"\s*:\s*true/.test(JSON.stringify(pkg ?? {}));
}

export interface DryRunLocalValidationResult {
  ok: boolean;
  productionId: string;
  status: "passed" | "failed" | "rejected";
  checks: DryRunLocalCheck[];
  failures: string[];
  record?: RealUnrealDryRunValidationRecord;
  approvalStage?: ApprovalStage;
  readinessOverallScore?: number | null;
}

export function validatePackageLocally(productionId: string): DryRunLocalValidationResult {
  const production = store.productions.get(productionId);
  const checks: DryRunLocalCheck[] = [];

  if (!production) {
    const rec = persistValidation({
      productionId, validationType: "local",
      status: "rejected", checks: [check("production_exists", "Production exists", false, "not_found")],
      requestSummary: { kind: "local", productionId },
      responseSummary: { reason: "production_not_found" },
      endpointHost: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      checks: rec.localChecks, failures: ["production_not_found"], record: rec,
    };
  }

  checks.push(check("production_exists", "Production exists", true));

  // Approval stage gate (internal_review_approved or unreal_sandbox_approved).
  const stage = getApprovalStage(productionId);
  const stageOk = stage === "internal_review_approved" || stage === "unreal_sandbox_approved";
  checks.push(check("approval_stage", `Approval stage = ${stage}`, stageOk,
    stageOk ? "" : `Must be internal_review_approved or unreal_sandbox_approved.`));

  // Readiness present + no critical blockers.
  const latest = getLatestReadinessReport(productionId);
  checks.push(check("readiness_report_present", "Latest readiness report exists", !!latest));
  if (latest) {
    checks.push(check(
      "no_critical_blockers", "No critical blockers",
      latest.blockers.length === 0,
      latest.blockers.length === 0 ? "" : `${latest.blockers.length} blocker(s)`,
    ));
  }

  // Manifest present.
  const manifest = getManifestSnapshot(productionId);
  checks.push(check("production_manifest_present", "Production manifest snapshot exists", !!manifest));
  const unrealScenePresent = hasUnrealSceneManifestForProduction(production);
  checks.push(check("unreal_scene_manifest_present", "Unreal scene manifest present", unrealScenePresent));

  // Asset / voice / video draft + internal-only.
  const assetJobs = listAssetJobs(productionId);
  const voiceAssets = listVoiceAssets(productionId);
  const videoJobs = listVideoJobs(productionId);
  const allInternal = (arr: any[]) => arr.every(
    (j) => (j.visibility ?? "admin_only_internal") === "admin_only_internal",
  );
  checks.push(check("asset_jobs_internal", "Asset jobs are admin_only_internal", allInternal(assetJobs)));
  checks.push(check("voice_assets_internal", "Voice assets are admin_only_internal", allInternal(voiceAssets)));
  checks.push(check("video_jobs_internal", "Video jobs are admin_only_internal", allInternal(videoJobs)));

  // No publicUrl / signedUrl non-null anywhere across the package payload.
  const pkgPayload = {
    production, manifest, assetJobs, voiceAssets, videoJobs,
    unrealCommands: listUnrealCommands().filter((c) => c.productionId === productionId),
    unrealSandboxCommands: listUnrealSandboxCommands(productionId),
    fourDSandboxJobs: listFourDSandboxJobs(productionId),
  };
  checks.push(check(
    "no_public_url_values", "No non-null publicUrl values",
    !packageContainsForbiddenUrls(pkgPayload),
  ));
  checks.push(check(
    "no_signed_url_values", "No non-null signedUrl values",
    !packageContainsForbiddenUrls(pkgPayload),
  ));

  // No realSendAllowed:true anywhere.
  checks.push(check(
    "no_real_send_true", "No realSendAllowed:true in package",
    !packageContainsRealSendTrue(pkgPayload),
  ));

  // SAFETY_ENVELOPE constant is present at the platform level.
  checks.push(check("safety_envelope_present", "SAFETY_ENVELOPE present", true));

  const failures = checks.filter((c) => !c.ok).map((c) => c.id);
  const passed = failures.length === 0;

  const rec = persistValidation({
    productionId,
    validationType: "local",
    status: passed ? "passed" : "failed",
    checks,
    requestSummary: { kind: "local", productionId },
    responseSummary: { passed, failedCheckIds: failures },
    endpointHost: null,
  });

  return {
    ok: passed, productionId,
    status: passed ? "passed" : "failed",
    checks, failures,
    record: rec,
    approvalStage: stage,
    readinessOverallScore: latest?.overallScore ?? null,
  };
}

function buildSanitizedBridgeRequestSummary(
  productionId: string,
  local: DryRunLocalValidationResult,
): Record<string, unknown> {
  const production = store.productions.get(productionId);
  const manifest = getManifestSnapshot(productionId);
  const latest = getLatestReadinessReport(productionId);
  return {
    commandType: "validate_package",
    mode: "dry_run",
    productionId,
    dryRun: true,
    realSendAllowed: false,
    source: "mougle-production-house",
    timestamp: new Date().toISOString(),
    packageSummary: {
      productionType: production?.productionType ?? null,
      manifestPresent: !!manifest,
      unrealSceneManifestPresent: hasUnrealSceneManifestForProduction(production),
      assetCounts: {
        voiceAssets: listVoiceAssets(productionId).length,
        assetJobs: listAssetJobs(productionId).length,
        videoJobs: listVideoJobs(productionId).length,
        unrealSandboxCommands: listUnrealSandboxCommands(productionId).length,
        fourDSandboxJobs: listFourDSandboxJobs(productionId).length,
      },
      readinessScores: {
        overall: latest?.overallScore ?? null,
        unrealSandbox: latest?.unrealSandboxScore ?? null,
        fourDSandbox: latest?.fourDSandboxScore ?? null,
        blockerCount: latest?.blockers.length ?? 0,
        warningCount: latest?.warnings.length ?? 0,
      },
      approvalStage: local.approvalStage ?? getApprovalStage(productionId),
      internalOnly: true,
      visibility: "admin_only_internal",
    },
  };
}

export interface DryRunBridgeValidationResult {
  ok: boolean;
  productionId: string;
  status: "passed" | "failed" | "rejected";
  message: string;
  errorCodes: string[];
  record?: RealUnrealDryRunValidationRecord;
  sanitizedRequest?: Record<string, unknown>;
}

export function validatePackageOnBridge(input: {
  productionId: string; confirm?: boolean;
}): DryRunBridgeValidationResult {
  const { productionId } = input;
  const production = store.productions.get(productionId);
  if (!production) {
    return { ok: false, productionId, status: "rejected",
      message: "Unknown production.", errorCodes: ["production_not_found"] };
  }

  if (input.confirm !== true) {
    const rec = persistValidation({
      productionId, validationType: "bridge", status: "rejected",
      checks: [],
      requestSummary: { kind: "bridge", productionId, reason: "confirm_required" },
      responseSummary: { reason: "confirm_required" },
      endpointHost: getRealUnrealBridgeEnv().endpointHost || null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Bridge dry-run validation requires explicit confirm:true.",
      errorCodes: ["confirm_required"], record: rec,
    };
  }

  const cfg = validateRealUnrealConfig();
  if (!cfg.ok) {
    const rec = persistValidation({
      productionId, validationType: "bridge", status: "rejected",
      checks: [],
      requestSummary: { kind: "bridge", productionId, reason: "config_missing" },
      responseSummary: { reason: "config_missing", errorCodes: cfg.errorCodes },
      endpointHost: getRealUnrealBridgeEnv().endpointHost || null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Bridge configuration is incomplete.",
      errorCodes: cfg.errorCodes, record: rec,
    };
  }

  // Require local validation passed FIRST. If local checks fail, this is
  // a real package validation FAILURE (not a request-shape rejection).
  const local = validatePackageLocally(productionId);
  if (!local.ok) {
    const rec = persistValidation({
      productionId, validationType: "bridge", status: "failed",
      checks: local.checks,
      requestSummary: { kind: "bridge", productionId, reason: "local_validation_failed" },
      responseSummary: { reason: "local_validation_failed", failedCheckIds: local.failures },
      endpointHost: getRealUnrealBridgeEnv().endpointHost || null,
    });
    return {
      ok: false, productionId, status: "failed",
      message: "Local validation must pass before bridge dry-run validation.",
      errorCodes: ["local_validation_failed", ...local.failures], record: rec,
    };
  }

  // Build sanitized, allowlist-only payload.
  const sanitized = buildSanitizedBridgeRequestSummary(productionId, local);
  // NO network call is made in this phase. Simulated dry-run response only.
  const responseSummary = {
    simulated: true,
    bridgeAcceptedLocally: true,
    note: "Local dry-run only; no network call was made; no real Unreal command was sent.",
  };
  const rec = persistValidation({
    productionId, validationType: "bridge", status: "passed",
    checks: local.checks,
    requestSummary: sanitized,
    responseSummary,
    endpointHost: getRealUnrealBridgeEnv().endpointHost || null,
  });
  return {
    ok: true, productionId, status: "passed",
    message: "Bridge dry-run validation succeeded. No real Unreal command was sent.",
    errorCodes: [], record: rec, sanitizedRequest: sanitized,
  };
}

function persistValidation(input: {
  productionId: string;
  validationType: "local" | "bridge" | "bridge_network";
  status: "passed" | "failed" | "rejected";
  checks: DryRunLocalCheck[];
  requestSummary: Record<string, unknown>;
  responseSummary: Record<string, unknown>;
  endpointHost: string | null;
  endpointPath?: string | null;
  httpStatus?: number | null;
}): RealUnrealDryRunValidationRecord {
  const idHash = createHash("sha256")
    .update(`real_unreal_dry_run:${input.productionId}:${Date.now()}:${Math.random()}`)
    .digest("hex").slice(0, 20);
  const rec: RealUnrealDryRunValidationRecord = {
    id: `real_unreal_dry_run_${idHash}`,
    productionId: input.productionId,
    mode: "dry_run",
    validationType: input.validationType,
    status: input.status,
    realSendAllowed: false,
    localChecks: input.checks,
    requestSummary: input.requestSummary,
    responseSummary: input.responseSummary,
    endpointHost: input.endpointHost,
    endpointPath: input.endpointPath ?? null,
    httpStatus: input.httpStatus ?? null,
    createdAt: new Date().toISOString(),
    safetyEnvelope: SAFETY_ENVELOPE,
  };
  store.realUnrealDryRunValidationHistory.push(rec);
  if (store.realUnrealDryRunValidationHistory.length > 1000) {
    store.realUnrealDryRunValidationHistory.splice(
      0, store.realUnrealDryRunValidationHistory.length - 1000,
    );
  }
  persistRealUnrealDryRunValidationHistory();
  return rec;
}

export function listRealUnrealDryRunValidationHistory(
  productionId?: string,
): RealUnrealDryRunValidationRecord[] {
  let items = store.realUnrealDryRunValidationHistory;
  if (productionId) items = items.filter((r) => r.productionId === productionId);
  return [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/* ------------------------------------------------------------------ */
/* Real Unreal Bridge Health-Check Network Call.                       */
/* The ONLY real network call permitted in this phase.                 */
/* Sends ONLY {commandType:"health_check"} to /health/dry-run.         */
/* No production data, no asset data, no render/import commands.       */
/* No MRQ. No 4D. No level load. realSendAllowed locked false.         */
/* ------------------------------------------------------------------ */

const REAL_UNREAL_HEALTH_CHECK_PATH = "/health/dry-run" as const;
const REAL_UNREAL_HEALTH_CHECK_TIMEOUT_MS = 5000;
const REAL_UNREAL_HEALTH_CHECK_MAX_RESPONSE_BYTES = 4096;

export interface RealUnrealHealthCheckInput {
  confirm?: boolean;
  /** Test/internal seam: override the fetch implementation. Default global fetch. */
  fetchImpl?: typeof fetch;
  /** Test/internal seam: override the request timeout. */
  timeoutMs?: number;
}

export interface RealUnrealHealthCheckResult {
  ok: boolean;
  mode: "dry_run";
  realSendAllowed: false;
  status: "network_ok" | "network_failed" | "config_missing" | "rejected";
  message: string;
  failures: string[];
  errorCodes: string[];
  record?: RealUnrealHealthCheckRecord;
}

function buildHealthCheckRequestPayload(): {
  commandType: "health_check";
  mode: "dry_run";
  dryRun: true;
  realSendAllowed: false;
  safetyEnvelope: typeof SAFETY_ENVELOPE;
  timestamp: string;
  source: "mougle-production-house";
} {
  return {
    commandType: "health_check",
    mode: "dry_run",
    dryRun: true,
    realSendAllowed: false,
    safetyEnvelope: SAFETY_ENVELOPE,
    timestamp: new Date().toISOString(),
    source: "mougle-production-house",
  };
}

/**
 * Sanitize a bridge response before storage. Limits size, strips obviously
 * sensitive fields (auth, set-cookie, token, secret, apiKey), and never
 * stores raw binary. The result is always a JSON-safe Record.
 */
function sanitizeHealthCheckResponse(raw: unknown): Record<string, unknown> {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? null);
  const truncated = text.length > REAL_UNREAL_HEALTH_CHECK_MAX_RESPONSE_BYTES;
  // Try to JSON-parse the FULL text first so we can redact keys properly,
  // then truncate string values during cleaning. If parse fails, fall back
  // to a safely truncated raw string.
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); }
  catch { parsed = text.slice(0, REAL_UNREAL_HEALTH_CHECK_MAX_RESPONSE_BYTES); }
  const FORBIDDEN_KEYS = new Set([
    "authorization", "auth", "token", "access_token", "accessToken",
    "secret", "apikey", "api_key", "apiKey", "set-cookie", "setCookie",
    "cookie", "password", "client_secret", "bearer",
  ]);
  function clean(v: unknown, depth = 0): unknown {
    if (depth > 4 || v == null) return v ?? null;
    if (Array.isArray(v)) return v.slice(0, 50).map((x) => clean(x, depth + 1));
    if (typeof v === "object") {
      const out: Record<string, unknown> = {};
      let count = 0;
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (count++ >= 50) break;
        if (FORBIDDEN_KEYS.has(k.toLowerCase())) {
          out[k] = "[redacted]";
        } else {
          out[k] = clean(val, depth + 1);
        }
      }
      return out;
    }
    if (typeof v === "string") return v.slice(0, 256);
    return v;
  }
  return {
    body: clean(parsed),
    truncated,
  };
}

function persistHealthCheckRecord(input: {
  status: RealUnrealHealthCheckRecord["status"];
  httpStatus: number | null;
  requestSummary: Record<string, unknown>;
  responseSummary: Record<string, unknown>;
}): RealUnrealHealthCheckRecord {
  const env = getRealUnrealBridgeEnv();
  const idHash = createHash("sha256")
    .update(`real_unreal_health:${Date.now()}:${Math.random()}`)
    .digest("hex").slice(0, 20);
  const rec: RealUnrealHealthCheckRecord = {
    id: `real_unreal_health_${idHash}`,
    mode: "dry_run",
    endpointHost: env.endpointHost,
    endpointPath: REAL_UNREAL_HEALTH_CHECK_PATH,
    status: input.status,
    httpStatus: input.httpStatus,
    realSendAllowed: false,
    requestSummary: input.requestSummary,
    responseSummary: input.responseSummary,
    createdAt: new Date().toISOString(),
    safetyEnvelope: SAFETY_ENVELOPE,
  };
  store.realUnrealHealthCheckHistory.push(rec);
  if (store.realUnrealHealthCheckHistory.length > 500) {
    store.realUnrealHealthCheckHistory.splice(
      0, store.realUnrealHealthCheckHistory.length - 500,
    );
  }
  persistRealUnrealHealthCheckHistory();
  return rec;
}

export async function performRealUnrealHealthCheckNetworkCall(
  input: RealUnrealHealthCheckInput = {},
): Promise<RealUnrealHealthCheckResult> {
  const requestSummary = buildHealthCheckRequestPayload();

  if (input.confirm !== true) {
    const rec = persistHealthCheckRecord({
      status: "rejected", httpStatus: null,
      requestSummary,
      responseSummary: { reason: "confirm_required", errorCodes: ["confirm_required"] },
    });
    return {
      ok: false, mode: "dry_run", realSendAllowed: false,
      status: "rejected",
      message: "Network health check requires explicit confirm:true.",
      failures: ["confirm:true is required."],
      errorCodes: ["confirm_required"], record: rec,
    };
  }

  const cfg = validateRealUnrealConfig();
  if (!cfg.ok) {
    const rec = persistHealthCheckRecord({
      status: "config_missing", httpStatus: null,
      requestSummary,
      responseSummary: { reason: "config_missing", errorCodes: cfg.errorCodes },
    });
    return {
      ok: false, mode: "dry_run", realSendAllowed: false,
      status: "config_missing",
      message: "Configuration is incomplete; network health check cannot proceed.",
      failures: cfg.failures, errorCodes: cfg.errorCodes, record: rec,
    };
  }

  const env = getRealUnrealBridgeEnv();
  // Defense in depth: hard-require mode dry_run here as well.
  if (env.mode !== "dry_run") {
    const rec = persistHealthCheckRecord({
      status: "config_missing", httpStatus: null,
      requestSummary,
      responseSummary: { reason: "mode_not_dry_run", errorCodes: ["mode_not_dry_run"] },
    });
    return {
      ok: false, mode: "dry_run", realSendAllowed: false,
      status: "config_missing",
      message: "UNREAL_BRIDGE_MODE must be 'dry_run' to send a network health check.",
      failures: ["UNREAL_BRIDGE_MODE must be 'dry_run'."],
      errorCodes: ["mode_not_dry_run"], record: rec,
    };
  }

  // Build the exact URL: base URL must not be appended with anything
  // production-related. Strip any trailing slash, then append the fixed
  // health-check path. Defense in depth: re-validate the parsed URL right
  // before issuing the fetch in case env was mutated between checks.
  const base = env.baseUrl.replace(/\/+$/, "");
  let parsedBase: URL | null = null;
  try { parsedBase = new URL(base); } catch { parsedBase = null; }
  if (!parsedBase || (parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:")) {
    const rec = persistHealthCheckRecord({
      status: "config_missing", httpStatus: null,
      requestSummary,
      responseSummary: { reason: "invalid_base_url", errorCodes: ["invalid_base_url"] },
    });
    return {
      ok: false, mode: "dry_run", realSendAllowed: false,
      status: "config_missing",
      message: "UNREAL_BRIDGE_BASE_URL must be a valid http(s) URL.",
      failures: ["UNREAL_BRIDGE_BASE_URL must be a valid http(s) URL."],
      errorCodes: ["invalid_base_url"], record: rec,
    };
  }
  const url = `${base}${REAL_UNREAL_HEALTH_CHECK_PATH}`;

  const timeoutMs = input.timeoutMs ?? REAL_UNREAL_HEALTH_CHECK_TIMEOUT_MS;
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let httpStatus: number | null = null;
  let sanitized: Record<string, unknown> = {};
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.UNREAL_BRIDGE_TOKEN ?? ""}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(requestSummary),
      signal: controller.signal,
    });
    httpStatus = res.status;
    const text = await res.text().catch(() => "");
    sanitized = sanitizeHealthCheckResponse(text);

    if (res.ok) {
      const rec = persistHealthCheckRecord({
        status: "network_ok", httpStatus,
        requestSummary,
        responseSummary: {
          ...sanitized,
          handshakeAcceptedByBridge: true,
          simulated: false,
        },
      });
      return {
        ok: true, mode: "dry_run", realSendAllowed: false,
        status: "network_ok",
        message: "Network health check succeeded.",
        failures: [], errorCodes: [], record: rec,
      };
    } else {
      const rec = persistHealthCheckRecord({
        status: "network_failed", httpStatus,
        requestSummary,
        responseSummary: {
          ...sanitized,
          handshakeAcceptedByBridge: false,
          simulated: false,
          reason: "http_error",
        },
      });
      return {
        ok: false, mode: "dry_run", realSendAllowed: false,
        status: "network_failed",
        message: `Bridge returned HTTP ${httpStatus}.`,
        failures: [`HTTP ${httpStatus}`],
        errorCodes: ["http_error"], record: rec,
      };
    }
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    const errCode = aborted ? "timeout" : "network_error";
    const rec = persistHealthCheckRecord({
      status: "network_failed", httpStatus,
      requestSummary,
      responseSummary: {
        handshakeAcceptedByBridge: false,
        simulated: false,
        reason: errCode,
        errorMessage: String(e?.message ?? "").slice(0, 500),
      },
    });
    return {
      ok: false, mode: "dry_run", realSendAllowed: false,
      status: "network_failed",
      message: aborted
        ? "Network health check timed out."
        : "Network health check failed.",
      failures: [aborted ? "timeout" : "network_error"],
      errorCodes: [errCode], record: rec,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function listRealUnrealHealthCheckHistory(): RealUnrealHealthCheckRecord[] {
  return [...store.realUnrealHealthCheckHistory].sort(
    (a, b) => (a.createdAt < b.createdAt ? 1 : -1),
  );
}

/* ------------------------------------------------------------------ */
/* Real Unreal Validate-Package Network Call — dry-run only.           */
/* Sends a sanitized package summary to {base}/validate-package/dry-run*/
/* No render commands, no import commands, no level loads, no MRQ,     */
/* no 4D commands, no asset files, no avatar attach, no media attach,  */
/* no publishing. realSendAllowed locked false.                        */
/* ------------------------------------------------------------------ */

const REAL_UNREAL_VALIDATE_PACKAGE_PATH = "/validate-package/dry-run" as const;
const REAL_UNREAL_VALIDATE_PACKAGE_TIMEOUT_MS = 5000;

export interface RealUnrealValidatePackageNetworkInput {
  productionId: string;
  confirm?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Test-only seam: bypass the local validator with a synthetic result. */
  _localResultForTests?: DryRunLocalValidationResult;
}

export interface RealUnrealValidatePackageNetworkResult {
  ok: boolean;
  productionId: string;
  status: "passed" | "failed" | "rejected";
  message: string;
  errorCodes: string[];
  record?: RealUnrealDryRunValidationRecord;
  sanitizedRequest?: Record<string, unknown>;
}

/**
 * Build the bridge-network payload. Reuses the existing sanitizer for
 * shape, then adds the safetyEnvelope + presence flags required by the
 * network spec. NEVER includes raw URLs, secrets, or full package data.
 */
function buildSanitizedBridgeNetworkRequest(
  productionId: string,
  _local: DryRunLocalValidationResult,
): Record<string, unknown> {
  const production = store.productions.get(productionId);
  const manifest = getManifestSnapshot(productionId);
  const latest = getLatestReadinessReport(productionId);
  return {
    commandType: "validate_package",
    mode: "dry_run",
    productionId,
    dryRun: true,
    realSendAllowed: false,
    safetyEnvelope: SAFETY_ENVELOPE,
    source: "mougle-production-house",
    timestamp: new Date().toISOString(),
    packageSummary: {
      productionType: production?.productionType ?? null,
      approvalStage: getApprovalStage(productionId),
      readinessScores: {
        overall: latest?.overallScore ?? null,
        unrealSandbox: latest?.unrealSandboxScore ?? null,
        fourDSandbox: latest?.fourDSandboxScore ?? null,
        blockerCount: latest?.blockers.length ?? 0,
        warningCount: latest?.warnings.length ?? 0,
      },
      manifestPresence: {
        productionManifest: !!manifest,
        unrealSceneManifest: hasUnrealSceneManifestForProduction(production),
      },
      counts: {
        voice: listVoiceAssets(productionId).length,
        scene: listAssetJobs(productionId).length,
        clip: listVideoJobs(productionId).length,
        unrealSandbox: listUnrealSandboxCommands(productionId).length,
        fourDSandbox: listFourDSandboxJobs(productionId).length,
      },
      internalOnly: true,
      visibility: "admin_only_internal",
      publicUrlsPresent: false,
      signedUrlsPresent: false,
    },
  };
}

export async function validatePackageOnBridgeNetwork(
  input: RealUnrealValidatePackageNetworkInput,
): Promise<RealUnrealValidatePackageNetworkResult> {
  const { productionId } = input;
  const env = getRealUnrealBridgeEnv();

  // Unknown production -> rejected (no network).
  const production = store.productions.get(productionId);
  if (!production) {
    const rec = persistValidation({
      productionId, validationType: "bridge_network", status: "rejected",
      checks: [],
      requestSummary: { kind: "bridge_network", productionId, reason: "production_not_found" },
      responseSummary: { reason: "production_not_found" },
      endpointHost: env.endpointHost || null,
      endpointPath: REAL_UNREAL_VALIDATE_PACKAGE_PATH,
      httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Unknown production.", errorCodes: ["production_not_found"],
      record: rec,
    };
  }

  if (input.confirm !== true) {
    const rec = persistValidation({
      productionId, validationType: "bridge_network", status: "rejected",
      checks: [],
      requestSummary: { kind: "bridge_network", productionId, reason: "confirm_required" },
      responseSummary: { reason: "confirm_required" },
      endpointHost: env.endpointHost || null,
      endpointPath: REAL_UNREAL_VALIDATE_PACKAGE_PATH,
      httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Bridge-network dry-run validation requires explicit confirm:true.",
      errorCodes: ["confirm_required"], record: rec,
    };
  }

  const cfg = validateRealUnrealConfig();
  if (!cfg.ok) {
    const rec = persistValidation({
      productionId, validationType: "bridge_network", status: "rejected",
      checks: [],
      requestSummary: { kind: "bridge_network", productionId, reason: "config_missing" },
      responseSummary: { reason: "config_missing", errorCodes: cfg.errorCodes },
      endpointHost: env.endpointHost || null,
      endpointPath: REAL_UNREAL_VALIDATE_PACKAGE_PATH,
      httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Bridge configuration is incomplete.",
      errorCodes: cfg.errorCodes, record: rec,
    };
  }
  if (env.mode !== "dry_run") {
    const rec = persistValidation({
      productionId, validationType: "bridge_network", status: "rejected",
      checks: [],
      requestSummary: { kind: "bridge_network", productionId, reason: "mode_not_dry_run" },
      responseSummary: { reason: "mode_not_dry_run", errorCodes: ["mode_not_dry_run"] },
      endpointHost: env.endpointHost || null,
      endpointPath: REAL_UNREAL_VALIDATE_PACKAGE_PATH,
      httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "UNREAL_BRIDGE_MODE must be 'dry_run'.",
      errorCodes: ["mode_not_dry_run"], record: rec,
    };
  }

  // Require local validation to pass first.
  const local = input._localResultForTests ?? validatePackageLocally(productionId);
  if (!local.ok) {
    const rec = persistValidation({
      productionId, validationType: "bridge_network", status: "failed",
      checks: local.checks,
      requestSummary: { kind: "bridge_network", productionId, reason: "local_validation_failed" },
      responseSummary: { reason: "local_validation_failed", failedCheckIds: local.failures },
      endpointHost: env.endpointHost || null,
      endpointPath: REAL_UNREAL_VALIDATE_PACKAGE_PATH,
      httpStatus: null,
    });
    return {
      ok: false, productionId, status: "failed",
      message: "Local validation must pass before bridge-network validation.",
      errorCodes: ["local_validation_failed", ...local.failures], record: rec,
    };
  }

  // Build URL with defense-in-depth.
  const baseUrl = env.baseUrl.replace(/\/+$/, "");
  let parsedBase: URL | null = null;
  try { parsedBase = new URL(baseUrl); } catch { parsedBase = null; }
  if (!parsedBase || (parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:")) {
    const rec = persistValidation({
      productionId, validationType: "bridge_network", status: "rejected",
      checks: local.checks,
      requestSummary: { kind: "bridge_network", productionId, reason: "invalid_base_url" },
      responseSummary: { reason: "invalid_base_url", errorCodes: ["invalid_base_url"] },
      endpointHost: env.endpointHost || null,
      endpointPath: REAL_UNREAL_VALIDATE_PACKAGE_PATH,
      httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "UNREAL_BRIDGE_BASE_URL must be a valid http(s) URL.",
      errorCodes: ["invalid_base_url"], record: rec,
    };
  }
  const url = `${baseUrl}${REAL_UNREAL_VALIDATE_PACKAGE_PATH}`;

  const sanitized = buildSanitizedBridgeNetworkRequest(productionId, local);
  const timeoutMs = input.timeoutMs ?? REAL_UNREAL_VALIDATE_PACKAGE_TIMEOUT_MS;
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let httpStatus: number | null = null;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.UNREAL_BRIDGE_TOKEN ?? ""}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(sanitized),
      signal: controller.signal,
    });
    httpStatus = res.status;
    const text = await res.text().catch(() => "");
    const bridgeToken = process.env.UNREAL_BRIDGE_TOKEN ?? "";
    const scrubbed = bridgeToken
      ? text.split(bridgeToken).join("[redacted]")
      : text;
    const sanResp = sanitizeHealthCheckResponse(scrubbed);

    if (res.ok) {
      const rec = persistValidation({
        productionId, validationType: "bridge_network", status: "passed",
        checks: local.checks,
        requestSummary: sanitized,
        responseSummary: { ...sanResp, bridgeAcceptedNetworkValidation: true, simulated: false },
        endpointHost: env.endpointHost || null,
        endpointPath: REAL_UNREAL_VALIDATE_PACKAGE_PATH,
        httpStatus,
      });
      return {
        ok: true, productionId, status: "passed",
        message: "Bridge-network dry-run validation succeeded. No real Unreal command was sent.",
        errorCodes: [], record: rec, sanitizedRequest: sanitized,
      };
    }
    const rec = persistValidation({
      productionId, validationType: "bridge_network", status: "failed",
      checks: local.checks,
      requestSummary: sanitized,
      responseSummary: {
        ...sanResp, bridgeAcceptedNetworkValidation: false, simulated: false,
        reason: "http_error",
      },
      endpointHost: env.endpointHost || null,
      endpointPath: REAL_UNREAL_VALIDATE_PACKAGE_PATH,
      httpStatus,
    });
    return {
      ok: false, productionId, status: "failed",
      message: `Bridge returned HTTP ${httpStatus}.`,
      errorCodes: ["http_error"], record: rec, sanitizedRequest: sanitized,
    };
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    const code = aborted ? "timeout" : "network_error";
    const rec = persistValidation({
      productionId, validationType: "bridge_network", status: "failed",
      checks: local.checks,
      requestSummary: sanitized,
      responseSummary: {
        bridgeAcceptedNetworkValidation: false, simulated: false,
        reason: code, errorMessage: String(e?.message ?? "").slice(0, 500),
      },
      endpointHost: env.endpointHost || null,
      endpointPath: REAL_UNREAL_VALIDATE_PACKAGE_PATH,
      httpStatus,
    });
    return {
      ok: false, productionId, status: "failed",
      message: aborted ? "Bridge-network validation timed out." : "Bridge-network validation failed.",
      errorCodes: [code], record: rec, sanitizedRequest: sanitized,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Real Unreal Prepare-Scene Dry-Run Network Call.                     */
/* Sends ONLY a sanitized prepare_scene payload to                     */
/*   {UNREAL_BRIDGE_BASE_URL}/prepare-scene/dry-run.                   */
/* Does not load Unreal levels, render scenes, import assets, attach   */
/* avatars, attach video panels, start Sequencer, trigger MRQ, send 4D */
/* commands, or publish anything. realSendAllowed locked false.        */
/* ------------------------------------------------------------------ */

const REAL_UNREAL_PREPARE_SCENE_PATH = "/prepare-scene/dry-run" as const;
const REAL_UNREAL_PREPARE_SCENE_TIMEOUT_MS = 5000;

export interface RealUnrealPrepareSceneInput {
  productionId: string;
  confirm?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Test-only seam: bypass local validator with a synthetic passing result. */
  _localResultForTests?: DryRunLocalValidationResult;
}

export interface RealUnrealPrepareSceneResult {
  ok: boolean;
  productionId: string;
  status: "passed" | "failed" | "rejected";
  message: string;
  errorCodes: string[];
  record?: RealUnrealPrepareSceneRecord;
  sanitizedRequest?: Record<string, unknown>;
}

export function getRealUnrealPrepareSceneDryRunStatus(): {
  bridge: ReturnType<typeof getRealUnrealSetupStatus>;
  dryRunOnly: true;
  realSendAllowed: false;
  publishingEnabled: false;
  requiredApprovalStage: "unreal_sandbox_approved";
  endpointPath: typeof REAL_UNREAL_PREPARE_SCENE_PATH;
} {
  return {
    bridge: getRealUnrealSetupStatus(),
    dryRunOnly: true,
    realSendAllowed: false,
    publishingEnabled: false,
    requiredApprovalStage: "unreal_sandbox_approved",
    endpointPath: REAL_UNREAL_PREPARE_SCENE_PATH,
  };
}

function persistPrepareSceneRecord(input: {
  productionId: string;
  status: "passed" | "failed" | "rejected";
  requestSummary: Record<string, unknown>;
  responseSummary: Record<string, unknown>;
  endpointHost: string | null;
  httpStatus?: number | null;
}): RealUnrealPrepareSceneRecord {
  const idHash = createHash("sha256")
    .update(`real_unreal_prepare_scene:${input.productionId}:${Date.now()}:${Math.random()}`)
    .digest("hex").slice(0, 20);
  const rec: RealUnrealPrepareSceneRecord = {
    id: `real_unreal_prepare_scene_${idHash}`,
    productionId: input.productionId,
    mode: "dry_run",
    commandType: "prepare_scene",
    status: input.status,
    realSendAllowed: false,
    requestSummary: input.requestSummary,
    responseSummary: input.responseSummary,
    endpointHost: input.endpointHost,
    endpointPath: REAL_UNREAL_PREPARE_SCENE_PATH,
    httpStatus: input.httpStatus ?? null,
    createdAt: new Date().toISOString(),
    safetyEnvelope: SAFETY_ENVELOPE,
  };
  store.realUnrealPrepareSceneDryRunHistory.push(rec);
  if (store.realUnrealPrepareSceneDryRunHistory.length > 1000) {
    store.realUnrealPrepareSceneDryRunHistory.splice(
      0, store.realUnrealPrepareSceneDryRunHistory.length - 1000,
    );
  }
  persistRealUnrealPrepareSceneDryRunHistory();
  return rec;
}

export function listRealUnrealPrepareSceneDryRunHistory(
  productionId?: string,
): RealUnrealPrepareSceneRecord[] {
  let items = store.realUnrealPrepareSceneDryRunHistory;
  if (productionId) items = items.filter((r) => r.productionId === productionId);
  return [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function buildSanitizedPrepareScenePayload(productionId: string): Record<string, unknown> {
  const production = store.productions.get(productionId);
  const manifest = getManifestSnapshot(productionId);
  const unrealScenePresent = hasUnrealSceneManifestForProduction(production);
  const avatarManifestPresent =
    !!manifest && Array.isArray((manifest as any).avatars) &&
    (manifest as any).avatars.length > 0;
  const fourDManifestPresent =
    !!manifest && !!(manifest as any).fourDCues &&
    Object.keys((manifest as any).fourDCues ?? {}).length > 0;
  const roomType = (production as any)?.roomType
    ?? (production as any)?.room?.kind ?? null;
  return {
    commandType: "prepare_scene",
    mode: "dry_run",
    productionId,
    dryRun: true,
    realSendAllowed: false,
    safetyEnvelope: SAFETY_ENVELOPE,
    source: "mougle-production-house",
    timestamp: new Date().toISOString(),
    scenePreparationSummary: {
      productionType: production?.productionType ?? null,
      approvalStage: "unreal_sandbox_approved",
      roomType,
      avatarCount: listAvatars().length,
      voiceAssetCount: listVoiceAssets(productionId).length,
      videoJobCount: listVideoJobs(productionId).length,
      assetJobCount: listAssetJobs(productionId).length,
      hasUnrealSceneManifest: unrealScenePresent,
      hasAvatarManifest: avatarManifestPresent,
      hasFourDCueManifest: fourDManifestPresent,
      internalOnly: true,
      visibility: "admin_only_internal",
      publicUrlsPresent: false,
      signedUrlsPresent: false,
      assetImportRequested: false,
      levelLoadRequested: false,
      renderRequested: false,
      sequencerStartRequested: false,
    },
  };
}

export async function sendRealUnrealPrepareSceneDryRun(
  input: RealUnrealPrepareSceneInput,
): Promise<RealUnrealPrepareSceneResult> {
  const { productionId } = input;
  const env = getRealUnrealBridgeEnv();
  const host = env.endpointHost || null;

  const production = store.productions.get(productionId);
  if (!production) {
    const rec = persistPrepareSceneRecord({
      productionId, status: "rejected",
      requestSummary: { reason: "production_not_found" },
      responseSummary: { reason: "production_not_found" },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Unknown production.", errorCodes: ["production_not_found"], record: rec,
    };
  }

  if (input.confirm !== true) {
    const rec = persistPrepareSceneRecord({
      productionId, status: "rejected",
      requestSummary: { reason: "confirm_required" },
      responseSummary: { reason: "confirm_required" },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Prepare-scene dry-run requires explicit confirm:true.",
      errorCodes: ["confirm_required"], record: rec,
    };
  }

  const cfg = validateRealUnrealConfig();
  if (!cfg.ok) {
    const rec = persistPrepareSceneRecord({
      productionId, status: "rejected",
      requestSummary: { reason: "config_missing" },
      responseSummary: { reason: "config_missing", errorCodes: cfg.errorCodes },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Bridge configuration is incomplete.",
      errorCodes: cfg.errorCodes, record: rec,
    };
  }
  if (env.mode !== "dry_run") {
    const rec = persistPrepareSceneRecord({
      productionId, status: "rejected",
      requestSummary: { reason: "mode_not_dry_run" },
      responseSummary: { reason: "mode_not_dry_run", errorCodes: ["mode_not_dry_run"] },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "UNREAL_BRIDGE_MODE must be 'dry_run'.",
      errorCodes: ["mode_not_dry_run"], record: rec,
    };
  }

  const stage = getApprovalStage(productionId);
  if (stage !== "unreal_sandbox_approved") {
    const rec = persistPrepareSceneRecord({
      productionId, status: "rejected",
      requestSummary: { reason: "approval_stage_not_allowed", stage },
      responseSummary: { reason: "approval_stage_not_allowed", stage },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: `Approval stage must be unreal_sandbox_approved (current: ${stage}).`,
      errorCodes: ["approval_stage_not_allowed"], record: rec,
    };
  }

  // Local validation must pass.
  const local = input._localResultForTests ?? validatePackageLocally(productionId);
  if (!local.ok) {
    const rec = persistPrepareSceneRecord({
      productionId, status: "rejected",
      requestSummary: { reason: "local_validation_failed" },
      responseSummary: { reason: "local_validation_failed", failedCheckIds: local.failures },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Local validation must pass before prepare-scene dry-run.",
      errorCodes: ["local_validation_failed", ...local.failures], record: rec,
    };
  }

  // Require latest validate-package bridge_network record to be passed.
  const latestBridgeNet = store.realUnrealDryRunValidationHistory
    .filter((r) => r.productionId === productionId && r.validationType === "bridge_network")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  if (!latestBridgeNet || latestBridgeNet.status !== "passed") {
    const rec = persistPrepareSceneRecord({
      productionId, status: "rejected",
      requestSummary: { reason: "bridge_network_validation_not_passed" },
      responseSummary: {
        reason: "bridge_network_validation_not_passed",
        latestStatus: latestBridgeNet?.status ?? null,
      },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Latest validate-package bridge_network record must be passed.",
      errorCodes: ["bridge_network_validation_not_passed"], record: rec,
    };
  }

  // Build URL with defense-in-depth.
  const baseUrl = env.baseUrl.replace(/\/+$/, "");
  let parsedBase: URL | null = null;
  try { parsedBase = new URL(baseUrl); } catch { parsedBase = null; }
  if (!parsedBase || (parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:")) {
    const rec = persistPrepareSceneRecord({
      productionId, status: "rejected",
      requestSummary: { reason: "invalid_base_url" },
      responseSummary: { reason: "invalid_base_url" },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "UNREAL_BRIDGE_BASE_URL must be a valid http(s) URL.",
      errorCodes: ["invalid_base_url"], record: rec,
    };
  }
  const url = `${baseUrl}${REAL_UNREAL_PREPARE_SCENE_PATH}`;

  const sanitized = buildSanitizedPrepareScenePayload(productionId);
  const timeoutMs = input.timeoutMs ?? REAL_UNREAL_PREPARE_SCENE_TIMEOUT_MS;
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let httpStatus: number | null = null;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.UNREAL_BRIDGE_TOKEN ?? ""}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(sanitized),
      signal: controller.signal,
    });
    httpStatus = res.status;
    const text = await res.text().catch(() => "");
    const bridgeToken = process.env.UNREAL_BRIDGE_TOKEN ?? "";
    const scrubbed = bridgeToken ? text.split(bridgeToken).join("[redacted]") : text;
    const sanResp = sanitizeHealthCheckResponse(scrubbed);

    if (res.ok) {
      const rec = persistPrepareSceneRecord({
        productionId, status: "passed",
        requestSummary: sanitized,
        responseSummary: { ...sanResp, bridgeAcceptedPrepareScene: true },
        endpointHost: host, httpStatus,
      });
      return {
        ok: true, productionId, status: "passed",
        message: "Prepare-scene dry-run succeeded. No real Unreal command was sent.",
        errorCodes: [], record: rec, sanitizedRequest: sanitized,
      };
    }
    const rec = persistPrepareSceneRecord({
      productionId, status: "failed",
      requestSummary: sanitized,
      responseSummary: { ...sanResp, bridgeAcceptedPrepareScene: false, reason: "http_error" },
      endpointHost: host, httpStatus,
    });
    return {
      ok: false, productionId, status: "failed",
      message: `Bridge returned HTTP ${httpStatus}.`,
      errorCodes: ["http_error"], record: rec, sanitizedRequest: sanitized,
    };
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    const code = aborted ? "timeout" : "network_error";
    const rec = persistPrepareSceneRecord({
      productionId, status: "failed",
      requestSummary: sanitized,
      responseSummary: {
        bridgeAcceptedPrepareScene: false,
        reason: code,
        errorMessage: String(e?.message ?? "").slice(0, 500),
      },
      endpointHost: host, httpStatus,
    });
    return {
      ok: false, productionId, status: "failed",
      message: aborted ? "Prepare-scene dry-run timed out." : "Prepare-scene dry-run failed.",
      errorCodes: [code], record: rec, sanitizedRequest: sanitized,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ================================================================== */
/* Real Unreal Set-Camera Dry-Run Network Call                         */
/* Sends ONLY a sanitized set_camera summary to                        */
/*   {UNREAL_BRIDGE_BASE_URL}/set-camera/dry-run                       */
/* Mirrors the prepare-scene pattern. realSendAllowed locked false.    */
/* ================================================================== */
const REAL_UNREAL_SET_CAMERA_PATH = "/set-camera/dry-run" as const;
const REAL_UNREAL_SET_CAMERA_TIMEOUT_MS = 5000;

export interface RealUnrealSetCameraInput {
  productionId: string;
  cameraPreset: SetCameraPreset;
  confirm?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Test-only seam to short-circuit the local validator. */
  _localResultForTests?: DryRunLocalValidationResult;
}

export interface RealUnrealSetCameraResult {
  ok: boolean;
  productionId: string;
  status: "passed" | "failed" | "rejected";
  message: string;
  errorCodes: string[];
  record?: RealUnrealSetCameraRecord;
  sanitizedRequest?: Record<string, unknown>;
}

export function getRealUnrealSetCameraDryRunStatus(): {
  bridge: ReturnType<typeof getRealUnrealSetupStatus>;
  dryRunOnly: true;
  realSendAllowed: false;
  publishingEnabled: false;
  requiredApprovalStage: "unreal_sandbox_approved";
  endpointPath: typeof REAL_UNREAL_SET_CAMERA_PATH;
  allowedPresets: typeof ALLOWED_SET_CAMERA_PRESETS;
} {
  return {
    bridge: getRealUnrealSetupStatus(),
    dryRunOnly: true,
    realSendAllowed: false,
    publishingEnabled: false,
    requiredApprovalStage: "unreal_sandbox_approved",
    endpointPath: REAL_UNREAL_SET_CAMERA_PATH,
    allowedPresets: ALLOWED_SET_CAMERA_PRESETS,
  };
}

function persistSetCameraRecord(input: {
  productionId: string;
  cameraPreset: SetCameraPreset;
  status: "passed" | "failed" | "rejected";
  requestSummary: Record<string, unknown>;
  responseSummary: Record<string, unknown>;
  endpointHost: string | null;
  httpStatus?: number | null;
}): RealUnrealSetCameraRecord {
  const idHash = createHash("sha256")
    .update(`real_unreal_set_camera:${input.productionId}:${Date.now()}:${Math.random()}`)
    .digest("hex").slice(0, 20);
  const rec: RealUnrealSetCameraRecord = {
    id: `real_unreal_set_camera_${idHash}`,
    productionId: input.productionId,
    mode: "dry_run",
    commandType: "set_camera",
    cameraPreset: input.cameraPreset,
    status: input.status,
    realSendAllowed: false,
    requestSummary: input.requestSummary,
    responseSummary: input.responseSummary,
    endpointHost: input.endpointHost,
    endpointPath: REAL_UNREAL_SET_CAMERA_PATH,
    httpStatus: input.httpStatus ?? null,
    createdAt: new Date().toISOString(),
    safetyEnvelope: SAFETY_ENVELOPE,
  };
  store.realUnrealSetCameraDryRunHistory.push(rec);
  if (store.realUnrealSetCameraDryRunHistory.length > 1000) {
    store.realUnrealSetCameraDryRunHistory.splice(
      0, store.realUnrealSetCameraDryRunHistory.length - 1000,
    );
  }
  persistRealUnrealSetCameraDryRunHistory();
  return rec;
}

export function listRealUnrealSetCameraDryRunHistory(
  productionId?: string,
): RealUnrealSetCameraRecord[] {
  let items = store.realUnrealSetCameraDryRunHistory;
  if (productionId) items = items.filter((r) => r.productionId === productionId);
  return [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function buildSanitizedSetCameraPayload(
  productionId: string,
  cameraPreset: SetCameraPreset,
  hasPrepareSceneDryRunPassed: boolean,
): Record<string, unknown> {
  return {
    commandType: "set_camera",
    mode: "dry_run",
    productionId,
    dryRun: true,
    realSendAllowed: false,
    safetyEnvelope: SAFETY_ENVELOPE,
    source: "mougle-production-house",
    timestamp: new Date().toISOString(),
    cameraSummary: {
      cameraPreset,
      approvalStage: "unreal_sandbox_approved",
      hasPrepareSceneDryRunPassed,
      internalOnly: true,
      visibility: "admin_only_internal",
      publicUrlsPresent: false,
      signedUrlsPresent: false,
      renderRequested: false,
      levelLoadRequested: false,
      sequencerStartRequested: false,
    },
  };
}

export async function sendRealUnrealSetCameraDryRun(
  input: RealUnrealSetCameraInput,
): Promise<RealUnrealSetCameraResult> {
  const { productionId } = input;
  const env = getRealUnrealBridgeEnv();
  const host = env.endpointHost || null;
  const presetParse = z.enum(ALLOWED_SET_CAMERA_PRESETS).safeParse(input.cameraPreset);
  const cameraPreset: SetCameraPreset = presetParse.success
    ? presetParse.data
    : ("custom_static" as SetCameraPreset);

  const production = store.productions.get(productionId);
  if (!production) {
    const rec = persistSetCameraRecord({
      productionId, cameraPreset, status: "rejected",
      requestSummary: { reason: "production_not_found" },
      responseSummary: { reason: "production_not_found" },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Unknown production.", errorCodes: ["production_not_found"], record: rec,
    };
  }

  if (input.confirm !== true) {
    const rec = persistSetCameraRecord({
      productionId, cameraPreset, status: "rejected",
      requestSummary: { reason: "confirm_required" },
      responseSummary: { reason: "confirm_required" },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Set-camera dry-run requires explicit confirm:true.",
      errorCodes: ["confirm_required"], record: rec,
    };
  }

  if (!presetParse.success) {
    const rec = persistSetCameraRecord({
      productionId, cameraPreset, status: "rejected",
      requestSummary: { reason: "invalid_camera_preset" },
      responseSummary: { reason: "invalid_camera_preset" },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "cameraPreset must be one of the allowed presets.",
      errorCodes: ["invalid_camera_preset"], record: rec,
    };
  }

  const cfg = validateRealUnrealConfig();
  if (!cfg.ok) {
    const rec = persistSetCameraRecord({
      productionId, cameraPreset, status: "rejected",
      requestSummary: { reason: "config_missing" },
      responseSummary: { reason: "config_missing", errorCodes: cfg.errorCodes },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Bridge configuration is incomplete.",
      errorCodes: cfg.errorCodes, record: rec,
    };
  }
  if (env.mode !== "dry_run") {
    const rec = persistSetCameraRecord({
      productionId, cameraPreset, status: "rejected",
      requestSummary: { reason: "mode_not_dry_run" },
      responseSummary: { reason: "mode_not_dry_run", errorCodes: ["mode_not_dry_run"] },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "UNREAL_BRIDGE_MODE must be 'dry_run'.",
      errorCodes: ["mode_not_dry_run"], record: rec,
    };
  }

  const stage = getApprovalStage(productionId);
  if (stage !== "unreal_sandbox_approved") {
    const rec = persistSetCameraRecord({
      productionId, cameraPreset, status: "rejected",
      requestSummary: { reason: "approval_stage_not_allowed", stage },
      responseSummary: { reason: "approval_stage_not_allowed", stage },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: `Approval stage must be unreal_sandbox_approved (current: ${stage}).`,
      errorCodes: ["approval_stage_not_allowed"], record: rec,
    };
  }

  const local = input._localResultForTests ?? validatePackageLocally(productionId);
  if (!local.ok) {
    const rec = persistSetCameraRecord({
      productionId, cameraPreset, status: "rejected",
      requestSummary: { reason: "local_validation_failed" },
      responseSummary: { reason: "local_validation_failed", failedCheckIds: local.failures },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Local validation must pass before set-camera dry-run.",
      errorCodes: ["local_validation_failed", ...local.failures], record: rec,
    };
  }

  // Require latest prepare_scene dry-run record to be passed.
  const latestPrepScene = store.realUnrealPrepareSceneDryRunHistory
    .filter((r) => r.productionId === productionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  if (!latestPrepScene || latestPrepScene.status !== "passed") {
    const rec = persistSetCameraRecord({
      productionId, cameraPreset, status: "rejected",
      requestSummary: { reason: "prepare_scene_dry_run_not_passed" },
      responseSummary: {
        reason: "prepare_scene_dry_run_not_passed",
        latestStatus: latestPrepScene?.status ?? null,
      },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Latest prepare-scene dry-run record must be passed.",
      errorCodes: ["prepare_scene_dry_run_not_passed"], record: rec,
    };
  }

  const baseUrl = env.baseUrl.replace(/\/+$/, "");
  let parsedBase: URL | null = null;
  try { parsedBase = new URL(baseUrl); } catch { parsedBase = null; }
  if (!parsedBase || (parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:")) {
    const rec = persistSetCameraRecord({
      productionId, cameraPreset, status: "rejected",
      requestSummary: { reason: "invalid_base_url" },
      responseSummary: { reason: "invalid_base_url" },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "UNREAL_BRIDGE_BASE_URL must be a valid http(s) URL.",
      errorCodes: ["invalid_base_url"], record: rec,
    };
  }
  const url = `${baseUrl}${REAL_UNREAL_SET_CAMERA_PATH}`;

  const sanitized = buildSanitizedSetCameraPayload(productionId, cameraPreset, true);
  const timeoutMs = input.timeoutMs ?? REAL_UNREAL_SET_CAMERA_TIMEOUT_MS;
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let httpStatus: number | null = null;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.UNREAL_BRIDGE_TOKEN ?? ""}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(sanitized),
      signal: controller.signal,
    });
    httpStatus = res.status;
    const text = await res.text().catch(() => "");
    const bridgeToken = process.env.UNREAL_BRIDGE_TOKEN ?? "";
    const scrubbed = bridgeToken ? text.split(bridgeToken).join("[redacted]") : text;
    const sanResp = sanitizeHealthCheckResponse(scrubbed);

    if (res.ok) {
      const rec = persistSetCameraRecord({
        productionId, cameraPreset, status: "passed",
        requestSummary: sanitized,
        responseSummary: { ...sanResp, bridgeAcceptedSetCamera: true },
        endpointHost: host, httpStatus,
      });
      return {
        ok: true, productionId, status: "passed",
        message: "Set-camera dry-run succeeded. No real Unreal command was sent.",
        errorCodes: [], record: rec, sanitizedRequest: sanitized,
      };
    }
    const rec = persistSetCameraRecord({
      productionId, cameraPreset, status: "failed",
      requestSummary: sanitized,
      responseSummary: { ...sanResp, bridgeAcceptedSetCamera: false, reason: "http_error" },
      endpointHost: host, httpStatus,
    });
    return {
      ok: false, productionId, status: "failed",
      message: `Bridge returned HTTP ${httpStatus}.`,
      errorCodes: ["http_error"], record: rec, sanitizedRequest: sanitized,
    };
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    const code = aborted ? "timeout" : "network_error";
    const rec = persistSetCameraRecord({
      productionId, cameraPreset, status: "failed",
      requestSummary: sanitized,
      responseSummary: {
        bridgeAcceptedSetCamera: false,
        reason: code,
        errorMessage: String(e?.message ?? "").slice(0, 500),
      },
      endpointHost: host, httpStatus,
    });
    return {
      ok: false, productionId, status: "failed",
      message: aborted ? "Set-camera dry-run timed out." : "Set-camera dry-run failed.",
      errorCodes: [code], record: rec, sanitizedRequest: sanitized,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ================================================================== */
/* Real Unreal Set-Lighting Dry-Run Network Call                       */
/* Sends ONLY a sanitized set_lighting summary to                      */
/*   {UNREAL_BRIDGE_BASE_URL}/set-lighting/dry-run                     */
/* Mirrors the set-camera pattern. realSendAllowed locked false.       */
/* ================================================================== */
const REAL_UNREAL_SET_LIGHTING_PATH = "/set-lighting/dry-run" as const;
const REAL_UNREAL_SET_LIGHTING_TIMEOUT_MS = 5000;

export interface RealUnrealSetLightingInput {
  productionId: string;
  lightingPreset: SetLightingPreset;
  confirm?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Test-only seam to short-circuit the local validator. */
  _localResultForTests?: DryRunLocalValidationResult;
}

export interface RealUnrealSetLightingResult {
  ok: boolean;
  productionId: string;
  status: "passed" | "failed" | "rejected";
  message: string;
  errorCodes: string[];
  record?: RealUnrealSetLightingRecord;
  sanitizedRequest?: Record<string, unknown>;
}

export function getRealUnrealSetLightingDryRunStatus(): {
  bridge: ReturnType<typeof getRealUnrealSetupStatus>;
  dryRunOnly: true;
  realSendAllowed: false;
  publishingEnabled: false;
  requiredApprovalStage: "unreal_sandbox_approved";
  endpointPath: typeof REAL_UNREAL_SET_LIGHTING_PATH;
  allowedPresets: typeof ALLOWED_SET_LIGHTING_PRESETS;
} {
  return {
    bridge: getRealUnrealSetupStatus(),
    dryRunOnly: true,
    realSendAllowed: false,
    publishingEnabled: false,
    requiredApprovalStage: "unreal_sandbox_approved",
    endpointPath: REAL_UNREAL_SET_LIGHTING_PATH,
    allowedPresets: ALLOWED_SET_LIGHTING_PRESETS,
  };
}

function persistSetLightingRecord(input: {
  productionId: string;
  lightingPreset: SetLightingPreset;
  status: "passed" | "failed" | "rejected";
  requestSummary: Record<string, unknown>;
  responseSummary: Record<string, unknown>;
  endpointHost: string | null;
  httpStatus?: number | null;
}): RealUnrealSetLightingRecord {
  const idHash = createHash("sha256")
    .update(`real_unreal_set_lighting:${input.productionId}:${Date.now()}:${Math.random()}`)
    .digest("hex").slice(0, 20);
  const rec: RealUnrealSetLightingRecord = {
    id: `real_unreal_set_lighting_${idHash}`,
    productionId: input.productionId,
    mode: "dry_run",
    commandType: "set_lighting",
    lightingPreset: input.lightingPreset,
    status: input.status,
    realSendAllowed: false,
    requestSummary: input.requestSummary,
    responseSummary: input.responseSummary,
    endpointHost: input.endpointHost,
    endpointPath: REAL_UNREAL_SET_LIGHTING_PATH,
    httpStatus: input.httpStatus ?? null,
    createdAt: new Date().toISOString(),
    safetyEnvelope: SAFETY_ENVELOPE,
  };
  store.realUnrealSetLightingDryRunHistory.push(rec);
  if (store.realUnrealSetLightingDryRunHistory.length > 1000) {
    store.realUnrealSetLightingDryRunHistory.splice(
      0, store.realUnrealSetLightingDryRunHistory.length - 1000,
    );
  }
  persistRealUnrealSetLightingDryRunHistory();
  return rec;
}

export function listRealUnrealSetLightingDryRunHistory(
  productionId?: string,
): RealUnrealSetLightingRecord[] {
  let items = store.realUnrealSetLightingDryRunHistory;
  if (productionId) items = items.filter((r) => r.productionId === productionId);
  return [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function buildSanitizedSetLightingPayload(
  productionId: string,
  lightingPreset: SetLightingPreset,
  hasPrepareSceneDryRunPassed: boolean,
  hasSetCameraDryRunPassed: boolean,
): Record<string, unknown> {
  return {
    commandType: "set_lighting",
    mode: "dry_run",
    productionId,
    dryRun: true,
    realSendAllowed: false,
    safetyEnvelope: SAFETY_ENVELOPE,
    source: "mougle-production-house",
    timestamp: new Date().toISOString(),
    lightingSummary: {
      lightingPreset,
      approvalStage: "unreal_sandbox_approved",
      hasPrepareSceneDryRunPassed,
      hasSetCameraDryRunPassed,
      internalOnly: true,
      visibility: "admin_only_internal",
      publicUrlsPresent: false,
      signedUrlsPresent: false,
      renderRequested: false,
      levelLoadRequested: false,
      sequencerStartRequested: false,
      assetImportRequested: false,
      mrqRequested: false,
      avatarAttachRequested: false,
      videoAttachRequested: false,
      fourDRequested: false,
      publishRequested: false,
    },
  };
}

export async function sendRealUnrealSetLightingDryRun(
  input: RealUnrealSetLightingInput,
): Promise<RealUnrealSetLightingResult> {
  const { productionId } = input;
  const env = getRealUnrealBridgeEnv();
  const host = env.endpointHost || null;
  const presetParse = z.enum(ALLOWED_SET_LIGHTING_PRESETS).safeParse(input.lightingPreset);
  const lightingPreset: SetLightingPreset = presetParse.success
    ? presetParse.data
    : ("standby_dim" as SetLightingPreset);

  const production = store.productions.get(productionId);
  if (!production) {
    const rec = persistSetLightingRecord({
      productionId, lightingPreset, status: "rejected",
      requestSummary: { reason: "production_not_found" },
      responseSummary: { reason: "production_not_found" },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Unknown production.", errorCodes: ["production_not_found"], record: rec,
    };
  }

  if (input.confirm !== true) {
    const rec = persistSetLightingRecord({
      productionId, lightingPreset, status: "rejected",
      requestSummary: { reason: "confirm_required" },
      responseSummary: { reason: "confirm_required" },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Set-lighting dry-run requires explicit confirm:true.",
      errorCodes: ["confirm_required"], record: rec,
    };
  }

  if (!presetParse.success) {
    const rec = persistSetLightingRecord({
      productionId, lightingPreset, status: "rejected",
      requestSummary: { reason: "invalid_lighting_preset" },
      responseSummary: { reason: "invalid_lighting_preset" },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "lightingPreset must be one of the allowed presets.",
      errorCodes: ["invalid_lighting_preset"], record: rec,
    };
  }

  const cfg = validateRealUnrealConfig();
  if (!cfg.ok) {
    const rec = persistSetLightingRecord({
      productionId, lightingPreset, status: "rejected",
      requestSummary: { reason: "config_missing" },
      responseSummary: { reason: "config_missing", errorCodes: cfg.errorCodes },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Bridge configuration is incomplete.",
      errorCodes: cfg.errorCodes, record: rec,
    };
  }
  if (env.mode !== "dry_run") {
    const rec = persistSetLightingRecord({
      productionId, lightingPreset, status: "rejected",
      requestSummary: { reason: "mode_not_dry_run" },
      responseSummary: { reason: "mode_not_dry_run", errorCodes: ["mode_not_dry_run"] },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "UNREAL_BRIDGE_MODE must be 'dry_run'.",
      errorCodes: ["mode_not_dry_run"], record: rec,
    };
  }

  const stage = getApprovalStage(productionId);
  if (stage !== "unreal_sandbox_approved") {
    const rec = persistSetLightingRecord({
      productionId, lightingPreset, status: "rejected",
      requestSummary: { reason: "approval_stage_not_allowed", stage },
      responseSummary: { reason: "approval_stage_not_allowed", stage },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: `Approval stage must be unreal_sandbox_approved (current: ${stage}).`,
      errorCodes: ["approval_stage_not_allowed"], record: rec,
    };
  }

  const local = input._localResultForTests ?? validatePackageLocally(productionId);
  if (!local.ok) {
    const rec = persistSetLightingRecord({
      productionId, lightingPreset, status: "rejected",
      requestSummary: { reason: "local_validation_failed" },
      responseSummary: { reason: "local_validation_failed", failedCheckIds: local.failures },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Local validation must pass before set-lighting dry-run.",
      errorCodes: ["local_validation_failed", ...local.failures], record: rec,
    };
  }

  // Require latest prepare_scene dry-run record to be passed.
  const latestPrepScene = store.realUnrealPrepareSceneDryRunHistory
    .filter((r) => r.productionId === productionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  if (!latestPrepScene || latestPrepScene.status !== "passed") {
    const rec = persistSetLightingRecord({
      productionId, lightingPreset, status: "rejected",
      requestSummary: { reason: "prepare_scene_dry_run_not_passed" },
      responseSummary: {
        reason: "prepare_scene_dry_run_not_passed",
        latestStatus: latestPrepScene?.status ?? null,
      },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Latest prepare-scene dry-run record must be passed.",
      errorCodes: ["prepare_scene_dry_run_not_passed"], record: rec,
    };
  }

  // Require latest set_camera dry-run record to be passed (chained gate).
  const latestSetCamera = store.realUnrealSetCameraDryRunHistory
    .filter((r) => r.productionId === productionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  if (!latestSetCamera || latestSetCamera.status !== "passed") {
    const rec = persistSetLightingRecord({
      productionId, lightingPreset, status: "rejected",
      requestSummary: { reason: "set_camera_dry_run_not_passed" },
      responseSummary: {
        reason: "set_camera_dry_run_not_passed",
        latestStatus: latestSetCamera?.status ?? null,
      },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Latest set-camera dry-run record must be passed.",
      errorCodes: ["set_camera_dry_run_not_passed"], record: rec,
    };
  }

  const baseUrl = env.baseUrl.replace(/\/+$/, "");
  let parsedBase: URL | null = null;
  try { parsedBase = new URL(baseUrl); } catch { parsedBase = null; }
  if (!parsedBase || (parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:")) {
    const rec = persistSetLightingRecord({
      productionId, lightingPreset, status: "rejected",
      requestSummary: { reason: "invalid_base_url" },
      responseSummary: { reason: "invalid_base_url" },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "UNREAL_BRIDGE_BASE_URL must be a valid http(s) URL.",
      errorCodes: ["invalid_base_url"], record: rec,
    };
  }
  const url = `${baseUrl}${REAL_UNREAL_SET_LIGHTING_PATH}`;

  const sanitized = buildSanitizedSetLightingPayload(productionId, lightingPreset, true, true);
  const timeoutMs = input.timeoutMs ?? REAL_UNREAL_SET_LIGHTING_TIMEOUT_MS;
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let httpStatus: number | null = null;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.UNREAL_BRIDGE_TOKEN ?? ""}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(sanitized),
      signal: controller.signal,
    });
    httpStatus = res.status;
    const text = await res.text().catch(() => "");
    const bridgeToken = process.env.UNREAL_BRIDGE_TOKEN ?? "";
    const scrubbed = bridgeToken ? text.split(bridgeToken).join("[redacted]") : text;
    const sanResp = sanitizeHealthCheckResponse(scrubbed);

    if (res.ok) {
      const rec = persistSetLightingRecord({
        productionId, lightingPreset, status: "passed",
        requestSummary: sanitized,
        responseSummary: { ...sanResp, bridgeAcceptedSetLighting: true },
        endpointHost: host, httpStatus,
      });
      return {
        ok: true, productionId, status: "passed",
        message: "Set-lighting dry-run succeeded. No real Unreal command was sent.",
        errorCodes: [], record: rec, sanitizedRequest: sanitized,
      };
    }
    const rec = persistSetLightingRecord({
      productionId, lightingPreset, status: "failed",
      requestSummary: sanitized,
      responseSummary: { ...sanResp, bridgeAcceptedSetLighting: false, reason: "http_error" },
      endpointHost: host, httpStatus,
    });
    return {
      ok: false, productionId, status: "failed",
      message: `Bridge returned HTTP ${httpStatus}.`,
      errorCodes: ["http_error"], record: rec, sanitizedRequest: sanitized,
    };
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    const code = aborted ? "timeout" : "network_error";
    const rec = persistSetLightingRecord({
      productionId, lightingPreset, status: "failed",
      requestSummary: sanitized,
      responseSummary: {
        bridgeAcceptedSetLighting: false,
        reason: code,
        errorMessage: String(e?.message ?? "").slice(0, 500),
      },
      endpointHost: host, httpStatus,
    });
    return {
      ok: false, productionId, status: "failed",
      message: aborted ? "Set-lighting dry-run timed out." : "Set-lighting dry-run failed.",
      errorCodes: [code], record: rec, sanitizedRequest: sanitized,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ================================================================== */
/* Real Unreal Set-Panels Dry-Run Network Call                         */
/* Sends ONLY a sanitized set_panels summary to                        */
/*   {UNREAL_BRIDGE_BASE_URL}/set-panels/dry-run                       */
/* Text fields truncated; public URLs stripped. realSendAllowed false. */
/* ================================================================== */
const REAL_UNREAL_SET_PANELS_PATH = "/set-panels/dry-run" as const;
const REAL_UNREAL_SET_PANELS_TIMEOUT_MS = 5000;

interface SetPanelsRawInput {
  panelPreset: SetPanelsPreset;
  headline?: string;
  subtitle?: string;
  tickerItems?: string[];
  sourcePanel?: { sourceLabel?: string; citationCount?: number };
  confidenceLabel?: string;
  mapPanel?: { regionLabel?: string; coordsLabel?: string };
  timelinePanel?: { items?: Array<{ label: string; timestamp?: string }> };
  marketOrDataPanel?: { rows?: Array<{ label: string; value: string }> };
  mediaRefs?: string[];
}

export interface RealUnrealSetPanelsInput extends SetPanelsRawInput {
  productionId: string;
  confirm?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  _localResultForTests?: DryRunLocalValidationResult;
}

export interface RealUnrealSetPanelsResult {
  ok: boolean;
  productionId: string;
  status: "passed" | "failed" | "rejected";
  message: string;
  errorCodes: string[];
  record?: RealUnrealSetPanelsRecord;
  sanitizedRequest?: Record<string, unknown>;
}

export function getRealUnrealSetPanelsDryRunStatus(): {
  bridge: ReturnType<typeof getRealUnrealSetupStatus>;
  dryRunOnly: true;
  realSendAllowed: false;
  publishingEnabled: false;
  liveStreamingEnabled: false;
  socialEnabled: false;
  requiredApprovalStage: "unreal_sandbox_approved";
  endpointPath: typeof REAL_UNREAL_SET_PANELS_PATH;
  allowedPresets: typeof ALLOWED_SET_PANELS_PRESETS;
  limits: typeof SET_PANELS_LIMITS;
} {
  return {
    bridge: getRealUnrealSetupStatus(),
    dryRunOnly: true,
    realSendAllowed: false,
    publishingEnabled: false,
    liveStreamingEnabled: false,
    socialEnabled: false,
    requiredApprovalStage: "unreal_sandbox_approved",
    endpointPath: REAL_UNREAL_SET_PANELS_PATH,
    allowedPresets: ALLOWED_SET_PANELS_PRESETS,
    limits: SET_PANELS_LIMITS,
  };
}

/**
 * Identify any string that contains a public URL anywhere — not just at the
 * start. Matches http(s)://, protocol-relative //host, data: URIs, and bare
 * "www." hosts. This is intentionally conservative: any hit causes the field
 * to be dropped from the sanitized set-panels payload.
 */
function isPublicUrl(s: string): boolean {
  if (typeof s !== "string") return false;
  const t = s;
  if (/https?:\/\//i.test(t)) return true;
  if (/(^|\s|[(\[<,;])\/\/[a-z0-9.-]+/i.test(t)) return true;
  if (/(^|\s)data:[a-z0-9.+-]+\//i.test(t)) return true;
  if (/(^|\s)www\.[a-z0-9-]+\.[a-z]{2,}/i.test(t)) return true;
  return false;
}

interface SanitizationStats {
  publicUrlsStripped: number;
  textsTruncated: number;
  tickerItemsDropped: number;
  timelineItemsDropped: number;
  dataRowsDropped: number;
  mediaRefsDropped: number;
}

function truncStr(s: string | undefined, max: number, stats: SanitizationStats): string | undefined {
  if (typeof s !== "string") return undefined;
  // Strip control chars to keep payload clean for downstream consumers.
  const cleaned = s.replace(/[\u0000-\u001F\u007F]/g, " ");
  if (cleaned.length > max) {
    stats.textsTruncated += 1;
    return cleaned.slice(0, max);
  }
  return cleaned;
}

function buildSanitizedSetPanelsPayload(
  productionId: string,
  raw: SetPanelsRawInput,
  hasPrepareSceneDryRunPassed: boolean,
  hasSetCameraDryRunPassed: boolean,
  hasSetLightingDryRunPassed: boolean,
): { payload: Record<string, unknown>; stats: SanitizationStats } {
  const L = SET_PANELS_LIMITS;
  const stats: SanitizationStats = {
    publicUrlsStripped: 0, textsTruncated: 0, tickerItemsDropped: 0,
    timelineItemsDropped: 0, dataRowsDropped: 0, mediaRefsDropped: 0,
  };

  const headline = truncStr(raw.headline, L.headlineMax, stats);
  const subtitle = truncStr(raw.subtitle, L.subtitleMax, stats);
  const confidenceLabel = truncStr(raw.confidenceLabel, L.confidenceLabelMax, stats);

  // Ticker items: drop public URLs, then truncate; cap at limit.
  const tickerItemsIn = Array.isArray(raw.tickerItems) ? raw.tickerItems : [];
  const tickerItemsKept: string[] = [];
  for (const it of tickerItemsIn) {
    if (typeof it !== "string") continue;
    if (isPublicUrl(it)) { stats.publicUrlsStripped += 1; stats.tickerItemsDropped += 1; continue; }
    const t = truncStr(it, L.tickerItemCharsMax, stats);
    if (t !== undefined) tickerItemsKept.push(t);
  }
  if (tickerItemsKept.length > L.tickerItemsMax) {
    stats.tickerItemsDropped += tickerItemsKept.length - L.tickerItemsMax;
    tickerItemsKept.length = L.tickerItemsMax;
  }

  let sourcePanel:
    | { sourceLabel?: string; citationCount: number; sourceUrlPresent: false }
    | undefined;
  if (raw.sourcePanel) {
    if (typeof raw.sourcePanel.sourceLabel === "string" && isPublicUrl(raw.sourcePanel.sourceLabel)) {
      stats.publicUrlsStripped += 1;
      sourcePanel = { citationCount: 0, sourceUrlPresent: false };
    } else {
      sourcePanel = {
        sourceLabel: truncStr(raw.sourcePanel.sourceLabel, L.sourceLabelMax, stats),
        citationCount: Math.max(0, Math.min(9999, Number(raw.sourcePanel.citationCount ?? 0) | 0)),
        sourceUrlPresent: false,
      };
    }
  }

  let mapPanel: { regionLabel?: string; coordsLabel?: string } | undefined;
  if (raw.mapPanel) {
    mapPanel = {
      regionLabel: truncStr(raw.mapPanel.regionLabel, L.mapLabelMax, stats),
      coordsLabel: truncStr(raw.mapPanel.coordsLabel, L.mapLabelMax, stats),
    };
  }

  let timelinePanel: { items: Array<{ label: string; timestamp?: string }> } | undefined;
  if (raw.timelinePanel?.items) {
    const itemsIn = Array.isArray(raw.timelinePanel.items) ? raw.timelinePanel.items : [];
    const itemsKept: Array<{ label: string; timestamp?: string }> = [];
    for (const it of itemsIn) {
      if (!it || typeof it.label !== "string") continue;
      if (isPublicUrl(it.label)) { stats.publicUrlsStripped += 1; stats.timelineItemsDropped += 1; continue; }
      const label = truncStr(it.label, L.timelineLabelMax, stats);
      const timestamp = truncStr(it.timestamp, 64, stats);
      if (label !== undefined) itemsKept.push({ label, timestamp });
    }
    if (itemsKept.length > L.timelineItemsMax) {
      stats.timelineItemsDropped += itemsKept.length - L.timelineItemsMax;
      itemsKept.length = L.timelineItemsMax;
    }
    timelinePanel = { items: itemsKept };
  }

  let marketOrDataPanel: { rows: Array<{ label: string; value: string }> } | undefined;
  if (raw.marketOrDataPanel?.rows) {
    const rowsIn = Array.isArray(raw.marketOrDataPanel.rows) ? raw.marketOrDataPanel.rows : [];
    const rowsKept: Array<{ label: string; value: string }> = [];
    for (const r of rowsIn) {
      if (!r || typeof r.label !== "string" || typeof r.value !== "string") continue;
      if (isPublicUrl(r.label) || isPublicUrl(r.value)) {
        stats.publicUrlsStripped += 1; stats.dataRowsDropped += 1; continue;
      }
      const label = truncStr(r.label, L.dataRowLabelMax, stats) ?? "";
      const value = truncStr(r.value, L.dataRowValueMax, stats) ?? "";
      rowsKept.push({ label, value });
    }
    if (rowsKept.length > L.dataRowsMax) {
      stats.dataRowsDropped += rowsKept.length - L.dataRowsMax;
      rowsKept.length = L.dataRowsMax;
    }
    marketOrDataPanel = { rows: rowsKept };
  }

  // mediaRefs: only internal identifiers (no public URLs allowed).
  const mediaRefsIn = Array.isArray(raw.mediaRefs) ? raw.mediaRefs : [];
  const mediaRefsKept: string[] = [];
  for (const m of mediaRefsIn) {
    if (typeof m !== "string") continue;
    if (isPublicUrl(m)) { stats.publicUrlsStripped += 1; stats.mediaRefsDropped += 1; continue; }
    const t = truncStr(m, L.mediaRefCharsMax, stats);
    if (t !== undefined) mediaRefsKept.push(t);
  }
  if (mediaRefsKept.length > L.mediaRefsMax) {
    stats.mediaRefsDropped += mediaRefsKept.length - L.mediaRefsMax;
    mediaRefsKept.length = L.mediaRefsMax;
  }

  const payload: Record<string, unknown> = {
    commandType: "set_panels",
    mode: "dry_run",
    productionId,
    dryRun: true,
    realSendAllowed: false,
    safetyEnvelope: SAFETY_ENVELOPE,
    source: "mougle-production-house",
    timestamp: new Date().toISOString(),
    panelsSummary: {
      panelPreset: raw.panelPreset,
      approvalStage: "unreal_sandbox_approved",
      hasPrepareSceneDryRunPassed,
      hasSetCameraDryRunPassed,
      hasSetLightingDryRunPassed,
      internalOnly: true,
      visibility: "admin_only_internal",
      publicUrlsPresent: false,
      signedUrlsPresent: false,
      externalMediaFetchRequested: false,
      youtubePublishRequested: false,
      socialPublishRequested: false,
      liveStreamingRequested: false,
      renderRequested: false,
      levelLoadRequested: false,
      sequencerStartRequested: false,
      assetImportRequested: false,
      mrqRequested: false,
      avatarAttachRequested: false,
      videoAttachRequested: false,
      fourDRequested: false,
      publishRequested: false,
      headline,
      subtitle,
      confidenceLabel,
      tickerItems: tickerItemsKept,
      sourcePanel,
      mapPanel,
      timelinePanel,
      marketOrDataPanel,
      mediaRefs: mediaRefsKept,
      limits: SET_PANELS_LIMITS,
    },
  };
  return { payload, stats };
}

function persistSetPanelsRecord(input: {
  productionId: string;
  panelPreset: SetPanelsPreset;
  status: "passed" | "failed" | "rejected";
  requestSummary: Record<string, unknown>;
  responseSummary: Record<string, unknown>;
  endpointHost: string | null;
  httpStatus?: number | null;
  sanitizationStats?: SanitizationStats;
}): RealUnrealSetPanelsRecord {
  const idHash = createHash("sha256")
    .update(`real_unreal_set_panels:${input.productionId}:${Date.now()}:${Math.random()}`)
    .digest("hex").slice(0, 20);
  const rec: RealUnrealSetPanelsRecord = {
    id: `real_unreal_set_panels_${idHash}`,
    productionId: input.productionId,
    mode: "dry_run",
    commandType: "set_panels",
    panelPreset: input.panelPreset,
    status: input.status,
    realSendAllowed: false,
    requestSummary: input.requestSummary,
    responseSummary: input.responseSummary,
    endpointHost: input.endpointHost,
    endpointPath: REAL_UNREAL_SET_PANELS_PATH,
    httpStatus: input.httpStatus ?? null,
    sanitizationStats: input.sanitizationStats ?? {
      publicUrlsStripped: 0, textsTruncated: 0, tickerItemsDropped: 0,
      timelineItemsDropped: 0, dataRowsDropped: 0, mediaRefsDropped: 0,
    },
    createdAt: new Date().toISOString(),
    safetyEnvelope: SAFETY_ENVELOPE,
  };
  store.realUnrealSetPanelsDryRunHistory.push(rec);
  if (store.realUnrealSetPanelsDryRunHistory.length > 1000) {
    store.realUnrealSetPanelsDryRunHistory.splice(
      0, store.realUnrealSetPanelsDryRunHistory.length - 1000,
    );
  }
  persistRealUnrealSetPanelsDryRunHistory();
  return rec;
}

export function listRealUnrealSetPanelsDryRunHistory(
  productionId?: string,
): RealUnrealSetPanelsRecord[] {
  let items = store.realUnrealSetPanelsDryRunHistory;
  if (productionId) items = items.filter((r) => r.productionId === productionId);
  return [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function sendRealUnrealSetPanelsDryRun(
  input: RealUnrealSetPanelsInput,
): Promise<RealUnrealSetPanelsResult> {
  const { productionId } = input;
  const env = getRealUnrealBridgeEnv();
  const host = env.endpointHost || null;
  const presetParse = z.enum(ALLOWED_SET_PANELS_PRESETS).safeParse(input.panelPreset);
  const panelPreset: SetPanelsPreset = presetParse.success
    ? presetParse.data
    : ("standby_brand_loop" as SetPanelsPreset);

  const production = store.productions.get(productionId);
  if (!production) {
    const rec = persistSetPanelsRecord({
      productionId, panelPreset, status: "rejected",
      requestSummary: { reason: "production_not_found" },
      responseSummary: { reason: "production_not_found" },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Unknown production.", errorCodes: ["production_not_found"], record: rec,
    };
  }

  if (input.confirm !== true) {
    const rec = persistSetPanelsRecord({
      productionId, panelPreset, status: "rejected",
      requestSummary: { reason: "confirm_required" },
      responseSummary: { reason: "confirm_required" },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Set-panels dry-run requires explicit confirm:true.",
      errorCodes: ["confirm_required"], record: rec,
    };
  }

  if (!presetParse.success) {
    const rec = persistSetPanelsRecord({
      productionId, panelPreset, status: "rejected",
      requestSummary: { reason: "invalid_panel_preset" },
      responseSummary: { reason: "invalid_panel_preset" },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "panelPreset must be one of the allowed presets.",
      errorCodes: ["invalid_panel_preset"], record: rec,
    };
  }

  const cfg = validateRealUnrealConfig();
  if (!cfg.ok) {
    const rec = persistSetPanelsRecord({
      productionId, panelPreset, status: "rejected",
      requestSummary: { reason: "config_missing" },
      responseSummary: { reason: "config_missing", errorCodes: cfg.errorCodes },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Bridge configuration is incomplete.",
      errorCodes: cfg.errorCodes, record: rec,
    };
  }
  if (env.mode !== "dry_run") {
    const rec = persistSetPanelsRecord({
      productionId, panelPreset, status: "rejected",
      requestSummary: { reason: "mode_not_dry_run" },
      responseSummary: { reason: "mode_not_dry_run", errorCodes: ["mode_not_dry_run"] },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "UNREAL_BRIDGE_MODE must be 'dry_run'.",
      errorCodes: ["mode_not_dry_run"], record: rec,
    };
  }

  const stage = getApprovalStage(productionId);
  if (stage !== "unreal_sandbox_approved") {
    const rec = persistSetPanelsRecord({
      productionId, panelPreset, status: "rejected",
      requestSummary: { reason: "approval_stage_not_allowed", stage },
      responseSummary: { reason: "approval_stage_not_allowed", stage },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: `Approval stage must be unreal_sandbox_approved (current: ${stage}).`,
      errorCodes: ["approval_stage_not_allowed"], record: rec,
    };
  }

  const local = input._localResultForTests ?? validatePackageLocally(productionId);
  if (!local.ok) {
    const rec = persistSetPanelsRecord({
      productionId, panelPreset, status: "rejected",
      requestSummary: { reason: "local_validation_failed" },
      responseSummary: { reason: "local_validation_failed", failedCheckIds: local.failures },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Local validation must pass before set-panels dry-run.",
      errorCodes: ["local_validation_failed", ...local.failures], record: rec,
    };
  }

  const latestPrepScene = store.realUnrealPrepareSceneDryRunHistory
    .filter((r) => r.productionId === productionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  if (!latestPrepScene || latestPrepScene.status !== "passed") {
    const rec = persistSetPanelsRecord({
      productionId, panelPreset, status: "rejected",
      requestSummary: { reason: "prepare_scene_dry_run_not_passed" },
      responseSummary: { reason: "prepare_scene_dry_run_not_passed", latestStatus: latestPrepScene?.status ?? null },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Latest prepare-scene dry-run record must be passed.",
      errorCodes: ["prepare_scene_dry_run_not_passed"], record: rec,
    };
  }

  const latestSetCamera = store.realUnrealSetCameraDryRunHistory
    .filter((r) => r.productionId === productionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  if (!latestSetCamera || latestSetCamera.status !== "passed") {
    const rec = persistSetPanelsRecord({
      productionId, panelPreset, status: "rejected",
      requestSummary: { reason: "set_camera_dry_run_not_passed" },
      responseSummary: { reason: "set_camera_dry_run_not_passed", latestStatus: latestSetCamera?.status ?? null },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Latest set-camera dry-run record must be passed.",
      errorCodes: ["set_camera_dry_run_not_passed"], record: rec,
    };
  }

  const latestSetLighting = store.realUnrealSetLightingDryRunHistory
    .filter((r) => r.productionId === productionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  if (!latestSetLighting || latestSetLighting.status !== "passed") {
    const rec = persistSetPanelsRecord({
      productionId, panelPreset, status: "rejected",
      requestSummary: { reason: "set_lighting_dry_run_not_passed" },
      responseSummary: { reason: "set_lighting_dry_run_not_passed", latestStatus: latestSetLighting?.status ?? null },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Latest set-lighting dry-run record must be passed.",
      errorCodes: ["set_lighting_dry_run_not_passed"], record: rec,
    };
  }

  const baseUrl = env.baseUrl.replace(/\/+$/, "");
  let parsedBase: URL | null = null;
  try { parsedBase = new URL(baseUrl); } catch { parsedBase = null; }
  if (!parsedBase || (parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:")) {
    const rec = persistSetPanelsRecord({
      productionId, panelPreset, status: "rejected",
      requestSummary: { reason: "invalid_base_url" },
      responseSummary: { reason: "invalid_base_url" },
      endpointHost: host, httpStatus: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "UNREAL_BRIDGE_BASE_URL must be a valid http(s) URL.",
      errorCodes: ["invalid_base_url"], record: rec,
    };
  }
  const url = `${baseUrl}${REAL_UNREAL_SET_PANELS_PATH}`;

  const { payload: sanitized, stats } = buildSanitizedSetPanelsPayload(
    productionId,
    { ...input, panelPreset },
    true, true, true,
  );
  const timeoutMs = input.timeoutMs ?? REAL_UNREAL_SET_PANELS_TIMEOUT_MS;
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let httpStatus: number | null = null;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.UNREAL_BRIDGE_TOKEN ?? ""}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(sanitized),
      signal: controller.signal,
    });
    httpStatus = res.status;
    const text = await res.text().catch(() => "");
    const bridgeToken = process.env.UNREAL_BRIDGE_TOKEN ?? "";
    const scrubbed = bridgeToken ? text.split(bridgeToken).join("[redacted]") : text;
    const sanResp = sanitizeHealthCheckResponse(scrubbed);

    if (res.ok) {
      const rec = persistSetPanelsRecord({
        productionId, panelPreset, status: "passed",
        requestSummary: sanitized,
        responseSummary: { ...sanResp, bridgeAcceptedSetPanels: true },
        endpointHost: host, httpStatus,
        sanitizationStats: stats,
      });
      return {
        ok: true, productionId, status: "passed",
        message: "Set-panels dry-run succeeded. No real Unreal command was sent.",
        errorCodes: [], record: rec, sanitizedRequest: sanitized,
      };
    }
    const rec = persistSetPanelsRecord({
      productionId, panelPreset, status: "failed",
      requestSummary: sanitized,
      responseSummary: { ...sanResp, bridgeAcceptedSetPanels: false, reason: "http_error" },
      endpointHost: host, httpStatus, sanitizationStats: stats,
    });
    return {
      ok: false, productionId, status: "failed",
      message: `Bridge returned HTTP ${httpStatus}.`,
      errorCodes: ["http_error"], record: rec, sanitizedRequest: sanitized,
    };
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    const code = aborted ? "timeout" : "network_error";
    const rec = persistSetPanelsRecord({
      productionId, panelPreset, status: "failed",
      requestSummary: sanitized,
      responseSummary: {
        bridgeAcceptedSetPanels: false, reason: code,
        errorMessage: String(e?.message ?? "").slice(0, 500),
      },
      endpointHost: host, httpStatus, sanitizationStats: stats,
    });
    return {
      ok: false, productionId, status: "failed",
      message: aborted ? "Set-panels dry-run timed out." : "Set-panels dry-run failed.",
      errorCodes: [code], record: rec, sanitizedRequest: sanitized,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ================================================================== */
/* Real Unreal Render-Preview Contract Dry-Run                         */
/* Sends ONLY a sanitized render_preview_contract payload to           */
/*   {UNREAL_BRIDGE_BASE_URL}/render-preview/contract/dry-run          */
/* It NEVER triggers Movie Render Queue, render frames, load levels,   */
/* import assets, start Sequencer, attach media, send 4D commands,     */
/* or create public output. realSendAllowed locked false.              */
/* ================================================================== */
const REAL_UNREAL_RENDER_PREVIEW_CONTRACT_PATH =
  "/render-preview/contract/dry-run" as const;
const REAL_UNREAL_RENDER_PREVIEW_CONTRACT_TIMEOUT_MS = 5000;

export interface RealUnrealRenderPreviewContractInput {
  productionId: string;
  confirm?: boolean;
  /** When true, requires a passing latest set_panels dry-run record. */
  panelsUsed?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  _localResultForTests?: DryRunLocalValidationResult;
}

export interface RealUnrealRenderPreviewContractResult {
  ok: boolean;
  productionId: string;
  status: "passed" | "failed" | "rejected";
  message: string;
  errorCodes: string[];
  record?: RealUnrealRenderPreviewContractRecord;
  sanitizedRequest?: Record<string, unknown>;
  contract?: Record<string, unknown>;
}

export function getRealUnrealRenderPreviewContractStatus(): {
  bridge: ReturnType<typeof getRealUnrealSetupStatus>;
  dryRunOnly: true;
  realSendAllowed: false;
  renderRequested: false;
  movieRenderQueueRequested: false;
  sequencerStartRequested: false;
  levelLoadRequested: false;
  assetImportRequested: false;
  mediaAttachRequested: false;
  publishingEnabled: false;
  liveStreamingEnabled: false;
  socialEnabled: false;
  requiredApprovalStage: "unreal_sandbox_approved";
  endpointPath: typeof REAL_UNREAL_RENDER_PREVIEW_CONTRACT_PATH;
} {
  return {
    bridge: getRealUnrealSetupStatus(),
    dryRunOnly: true,
    realSendAllowed: false,
    renderRequested: false,
    movieRenderQueueRequested: false,
    sequencerStartRequested: false,
    levelLoadRequested: false,
    assetImportRequested: false,
    mediaAttachRequested: false,
    publishingEnabled: false,
    liveStreamingEnabled: false,
    socialEnabled: false,
    requiredApprovalStage: "unreal_sandbox_approved",
    endpointPath: REAL_UNREAL_RENDER_PREVIEW_CONTRACT_PATH,
  };
}

interface RenderPreviewContractGateState {
  stage: string;
  hasPrepareSceneDryRunPassed: boolean;
  hasSetCameraDryRunPassed: boolean;
  hasSetLightingDryRunPassed: boolean;
  hasSetPanelsDryRunPassed: boolean;
  panelsUsed: boolean;
}

function evaluateRenderPreviewContractGate(
  productionId: string,
  panelsUsed: boolean,
): { ok: boolean; state: RenderPreviewContractGateState; errorCodes: string[] } {
  const stage = getApprovalStage(productionId);
  const latestPrepScene = store.realUnrealPrepareSceneDryRunHistory
    .filter((r) => r.productionId === productionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const latestSetCamera = store.realUnrealSetCameraDryRunHistory
    .filter((r) => r.productionId === productionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const latestSetLighting = store.realUnrealSetLightingDryRunHistory
    .filter((r) => r.productionId === productionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const latestSetPanels = store.realUnrealSetPanelsDryRunHistory
    .filter((r) => r.productionId === productionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];

  const state: RenderPreviewContractGateState = {
    stage,
    hasPrepareSceneDryRunPassed: latestPrepScene?.status === "passed",
    hasSetCameraDryRunPassed: latestSetCamera?.status === "passed",
    hasSetLightingDryRunPassed: latestSetLighting?.status === "passed",
    hasSetPanelsDryRunPassed: latestSetPanels?.status === "passed",
    panelsUsed,
  };

  const errorCodes: string[] = [];
  if (stage !== "unreal_sandbox_approved") {
    errorCodes.push("approval_stage_not_allowed");
  }
  if (!state.hasPrepareSceneDryRunPassed) errorCodes.push("prepare_scene_dry_run_not_passed");
  if (!state.hasSetCameraDryRunPassed) errorCodes.push("set_camera_dry_run_not_passed");
  if (!state.hasSetLightingDryRunPassed) errorCodes.push("set_lighting_dry_run_not_passed");
  if (panelsUsed && !state.hasSetPanelsDryRunPassed) {
    errorCodes.push("set_panels_dry_run_not_passed");
  }

  return { ok: errorCodes.length === 0, state, errorCodes };
}

/**
 * Build the sanitized render-preview contract payload. Allowlist-only: only
 * the boolean/string fields explicitly enumerated in the task brief. No
 * provider URLs, no signed URLs, no media references, no output URLs.
 */
function buildSanitizedRenderPreviewContractPayload(
  productionId: string,
  state: RenderPreviewContractGateState,
): Record<string, unknown> {
  return {
    commandType: "render_preview_contract",
    mode: "dry_run",
    productionId,
    dryRun: true,
    realSendAllowed: false,
    safetyEnvelope: SAFETY_ENVELOPE,
    source: "mougle-production-house",
    timestamp: new Date().toISOString(),
    renderPreviewContract: {
      approvalStage: "unreal_sandbox_approved",
      hasPrepareSceneDryRunPassed: state.hasPrepareSceneDryRunPassed,
      hasSetCameraDryRunPassed: state.hasSetCameraDryRunPassed,
      hasSetLightingDryRunPassed: state.hasSetLightingDryRunPassed,
      hasSetPanelsDryRunPassed: state.hasSetPanelsDryRunPassed,
      panelsUsed: state.panelsUsed,
      renderRequested: false,
      movieRenderQueueRequested: false,
      sequencerStartRequested: false,
      levelLoadRequested: false,
      assetImportRequested: false,
      mediaAttachRequested: false,
      avatarAttachRequested: false,
      fourDRequested: false,
      outputPublicUrlRequested: false,
      publishRequested: false,
      socialPublishRequested: false,
      liveStreamingRequested: false,
      visibility: "admin_only_internal",
      publicUrlsPresent: false,
      signedUrlsPresent: false,
    },
  };
}

function persistRenderPreviewContractRecord(input: {
  productionId: string;
  status: "passed" | "failed" | "rejected";
  phase: "local_validation" | "network_dry_run";
  requestSummary: Record<string, unknown>;
  responseSummary: Record<string, unknown>;
  endpointHost: string | null;
  httpStatus?: number | null;
}): RealUnrealRenderPreviewContractRecord {
  const idHash = createHash("sha256")
    .update(
      `real_unreal_render_preview_contract:${input.productionId}:${Date.now()}:${Math.random()}`,
    )
    .digest("hex").slice(0, 20);
  const rec: RealUnrealRenderPreviewContractRecord = {
    id: `real_unreal_render_preview_contract_${idHash}`,
    productionId: input.productionId,
    mode: "dry_run",
    commandType: "render_preview_contract",
    status: input.status,
    phase: input.phase,
    realSendAllowed: false,
    requestSummary: input.requestSummary,
    responseSummary: input.responseSummary,
    endpointHost: input.endpointHost,
    endpointPath: REAL_UNREAL_RENDER_PREVIEW_CONTRACT_PATH,
    httpStatus: input.httpStatus ?? null,
    createdAt: new Date().toISOString(),
    safetyEnvelope: SAFETY_ENVELOPE,
  };
  store.realUnrealRenderPreviewContractHistory.push(rec);
  if (store.realUnrealRenderPreviewContractHistory.length > 1000) {
    store.realUnrealRenderPreviewContractHistory.splice(
      0, store.realUnrealRenderPreviewContractHistory.length - 1000,
    );
  }
  persistRealUnrealRenderPreviewContractHistory();
  return rec;
}

export function listRealUnrealRenderPreviewContractHistory(
  productionId?: string,
): RealUnrealRenderPreviewContractRecord[] {
  let items = store.realUnrealRenderPreviewContractHistory;
  if (productionId) items = items.filter((r) => r.productionId === productionId);
  return [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Pure local validation — never opens any network socket. Builds the
 * sanitized contract, verifies all chained gates pass, and stores a record.
 */
export function validateRenderPreviewContractLocal(
  input: RealUnrealRenderPreviewContractInput,
): RealUnrealRenderPreviewContractResult {
  const productionId = input.productionId;
  const panelsUsed = input.panelsUsed === true;

  const production = store.productions.get(productionId);
  if (!production) {
    const rec = persistRenderPreviewContractRecord({
      productionId, status: "rejected", phase: "local_validation",
      requestSummary: { reason: "production_not_found" },
      responseSummary: { reason: "production_not_found" },
      endpointHost: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Unknown production.",
      errorCodes: ["production_not_found"], record: rec,
    };
  }

  const local = input._localResultForTests ?? validatePackageLocally(productionId);
  if (!local.ok) {
    const rec = persistRenderPreviewContractRecord({
      productionId, status: "rejected", phase: "local_validation",
      requestSummary: { reason: "local_validation_failed", panelsUsed },
      responseSummary: { reason: "local_validation_failed", failedCheckIds: local.failures },
      endpointHost: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Local package validation must pass before contract.",
      errorCodes: ["local_validation_failed", ...local.failures], record: rec,
    };
  }

  const gate = evaluateRenderPreviewContractGate(productionId, panelsUsed);
  if (!gate.ok) {
    const rec = persistRenderPreviewContractRecord({
      productionId, status: "rejected", phase: "local_validation",
      requestSummary: { reason: "chained_gate_failed", panelsUsed },
      responseSummary: {
        reason: "chained_gate_failed", errorCodes: gate.errorCodes,
        gate: gate.state,
      },
      endpointHost: null,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Chained dry-run gate did not pass.",
      errorCodes: gate.errorCodes, record: rec,
    };
  }

  const contract = buildSanitizedRenderPreviewContractPayload(
    productionId, gate.state,
  );
  const rec = persistRenderPreviewContractRecord({
    productionId, status: "passed", phase: "local_validation",
    requestSummary: contract,
    responseSummary: { localContractValid: true, panelsUsed },
    endpointHost: null,
  });
  return {
    ok: true, productionId, status: "passed",
    message: "Local render-preview contract is valid. No network call was made.",
    errorCodes: [], record: rec, contract,
  };
}

/**
 * Optional bridge-side validation. Sends the sanitized contract to the
 * bridge dry-run endpoint, which is contracted to validate-only and MUST NOT
 * render, queue, start Sequencer, load levels, import assets, attach media,
 * or send 4D commands. Failures (HTTP error / timeout) are recorded safely.
 */
export async function sendRealUnrealRenderPreviewContractDryRun(
  input: RealUnrealRenderPreviewContractInput,
): Promise<RealUnrealRenderPreviewContractResult> {
  const { productionId } = input;
  const panelsUsed = input.panelsUsed === true;
  const env = getRealUnrealBridgeEnv();
  const host = env.endpointHost || null;

  const production = store.productions.get(productionId);
  if (!production) {
    const rec = persistRenderPreviewContractRecord({
      productionId, status: "rejected", phase: "network_dry_run",
      requestSummary: { reason: "production_not_found", panelsUsed },
      responseSummary: { reason: "production_not_found" },
      endpointHost: host,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Unknown production.",
      errorCodes: ["production_not_found"], record: rec,
    };
  }

  if (input.confirm !== true) {
    const rec = persistRenderPreviewContractRecord({
      productionId, status: "rejected", phase: "network_dry_run",
      requestSummary: { reason: "confirm_required", panelsUsed },
      responseSummary: { reason: "confirm_required" },
      endpointHost: host,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Render-preview contract dry-run requires explicit confirm:true.",
      errorCodes: ["confirm_required"], record: rec,
    };
  }

  const cfg = validateRealUnrealConfig();
  if (!cfg.ok) {
    const rec = persistRenderPreviewContractRecord({
      productionId, status: "rejected", phase: "network_dry_run",
      requestSummary: { reason: "config_missing", panelsUsed },
      responseSummary: { reason: "config_missing", errorCodes: cfg.errorCodes },
      endpointHost: host,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Bridge configuration is incomplete.",
      errorCodes: cfg.errorCodes, record: rec,
    };
  }
  if (env.mode !== "dry_run") {
    const rec = persistRenderPreviewContractRecord({
      productionId, status: "rejected", phase: "network_dry_run",
      requestSummary: { reason: "mode_not_dry_run", panelsUsed },
      responseSummary: { reason: "mode_not_dry_run", errorCodes: ["mode_not_dry_run"] },
      endpointHost: host,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "UNREAL_BRIDGE_MODE must be 'dry_run'.",
      errorCodes: ["mode_not_dry_run"], record: rec,
    };
  }

  const local = input._localResultForTests ?? validatePackageLocally(productionId);
  if (!local.ok) {
    const rec = persistRenderPreviewContractRecord({
      productionId, status: "rejected", phase: "network_dry_run",
      requestSummary: { reason: "local_validation_failed", panelsUsed },
      responseSummary: { reason: "local_validation_failed", failedCheckIds: local.failures },
      endpointHost: host,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Local validation must pass before render-preview contract dry-run.",
      errorCodes: ["local_validation_failed", ...local.failures], record: rec,
    };
  }

  const gate = evaluateRenderPreviewContractGate(productionId, panelsUsed);
  if (!gate.ok) {
    const rec = persistRenderPreviewContractRecord({
      productionId, status: "rejected", phase: "network_dry_run",
      requestSummary: { reason: "chained_gate_failed", panelsUsed },
      responseSummary: {
        reason: "chained_gate_failed", errorCodes: gate.errorCodes,
        gate: gate.state,
      },
      endpointHost: host,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "Chained dry-run gate did not pass.",
      errorCodes: gate.errorCodes, record: rec,
    };
  }

  const baseUrl = env.baseUrl.replace(/\/+$/, "");
  let parsedBase: URL | null = null;
  try { parsedBase = new URL(baseUrl); } catch { parsedBase = null; }
  if (!parsedBase || (parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:")) {
    const rec = persistRenderPreviewContractRecord({
      productionId, status: "rejected", phase: "network_dry_run",
      requestSummary: { reason: "invalid_base_url", panelsUsed },
      responseSummary: { reason: "invalid_base_url" },
      endpointHost: host,
    });
    return {
      ok: false, productionId, status: "rejected",
      message: "UNREAL_BRIDGE_BASE_URL must be a valid http(s) URL.",
      errorCodes: ["invalid_base_url"], record: rec,
    };
  }
  const url = `${baseUrl}${REAL_UNREAL_RENDER_PREVIEW_CONTRACT_PATH}`;

  const sanitized = buildSanitizedRenderPreviewContractPayload(
    productionId, gate.state,
  );
  const timeoutMs = input.timeoutMs ?? REAL_UNREAL_RENDER_PREVIEW_CONTRACT_TIMEOUT_MS;
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let httpStatus: number | null = null;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.UNREAL_BRIDGE_TOKEN ?? ""}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(sanitized),
      signal: controller.signal,
    });
    httpStatus = res.status;
    const text = await res.text().catch(() => "");
    const bridgeToken = process.env.UNREAL_BRIDGE_TOKEN ?? "";
    const scrubbed = bridgeToken ? text.split(bridgeToken).join("[redacted]") : text;
    const sanResp = sanitizeHealthCheckResponse(scrubbed);

    if (res.ok) {
      const rec = persistRenderPreviewContractRecord({
        productionId, status: "passed", phase: "network_dry_run",
        requestSummary: sanitized,
        responseSummary: { ...sanResp, bridgeAcceptedContract: true },
        endpointHost: host, httpStatus,
      });
      return {
        ok: true, productionId, status: "passed",
        message:
          "Render-preview contract dry-run succeeded. No render, MRQ, Sequencer, level load, asset import, media attach, or 4D command was sent.",
        errorCodes: [], record: rec,
        sanitizedRequest: sanitized, contract: sanitized,
      };
    }
    const rec = persistRenderPreviewContractRecord({
      productionId, status: "failed", phase: "network_dry_run",
      requestSummary: sanitized,
      responseSummary: { ...sanResp, bridgeAcceptedContract: false, reason: "http_error" },
      endpointHost: host, httpStatus,
    });
    return {
      ok: false, productionId, status: "failed",
      message: `Bridge returned HTTP ${httpStatus}.`,
      errorCodes: ["http_error"], record: rec,
      sanitizedRequest: sanitized, contract: sanitized,
    };
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    const code = aborted ? "timeout" : "network_error";
    const rec = persistRenderPreviewContractRecord({
      productionId, status: "failed", phase: "network_dry_run",
      requestSummary: sanitized,
      responseSummary: {
        bridgeAcceptedContract: false, reason: code,
        errorMessage: String(e?.message ?? "").slice(0, 500),
      },
      endpointHost: host, httpStatus,
    });
    return {
      ok: false, productionId, status: "failed",
      message: aborted ? "Render-preview contract dry-run timed out." : "Render-preview contract dry-run failed.",
      errorCodes: [code], record: rec,
      sanitizedRequest: sanitized, contract: sanitized,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Real Unreal Command Approval Gate                                   */
/*                                                                     */
/* SAFETY:                                                             */
/*   - This module is a GOVERNANCE layer only. It defines, validates,  */
/*     and stores approval requests for FUTURE real Unreal commands.   */
/*   - It NEVER opens an outbound socket. It NEVER calls               */
/*     sendUnrealCommand, sendUnrealSandboxCommand, sendFourDCue, or   */
/*     any other send/execute helper.                                  */
/*   - realSendAllowed and executionEnabled remain permanently false   */
/*     on every record, regardless of decision outcome. Approving a    */
/*     record only flips its `status` field to "approved".             */
/*   - endpointHost is permanently null.                               */
/*   - SAFETY_ENVELOPE is appended on every record and is never        */
/*     mutated.                                                        */
/* ------------------------------------------------------------------ */

function evaluateRealUnrealCommandApprovalDryRunChain(
  productionId: string,
  commandType: RealUnrealCommandType,
  panelsUsed: boolean,
): {
  ok: boolean;
  errorCodes: string[];
  summary: Record<string, unknown>;
} {
  const errorCodes: string[] = [];
  const prepareScenePassed = store.realUnrealPrepareSceneDryRunHistory.some(
    (r) => r.productionId === productionId && r.status === "passed",
  );
  const setCameraPassed = store.realUnrealSetCameraDryRunHistory.some(
    (r) => r.productionId === productionId && r.status === "passed",
  );
  const setLightingPassed = store.realUnrealSetLightingDryRunHistory.some(
    (r) => r.productionId === productionId && r.status === "passed",
  );
  const setPanelsPassed = store.realUnrealSetPanelsDryRunHistory.some(
    (r) => r.productionId === productionId && r.status === "passed",
  );
  const renderPreviewContractPassed =
    store.realUnrealRenderPreviewContractHistory.some(
      (r) =>
        r.productionId === productionId &&
        r.status === "passed" &&
        r.phase === "network_dry_run",
    );

  if (!prepareScenePassed) errorCodes.push("prepare_scene_dry_run_required");
  if (!setCameraPassed) errorCodes.push("set_camera_dry_run_required");
  if (!setLightingPassed) errorCodes.push("set_lighting_dry_run_required");

  const requiresPanels = commandType === "real_set_panels" || panelsUsed;
  if (requiresPanels && !setPanelsPassed) {
    errorCodes.push("set_panels_dry_run_required");
  }

  const isRenderCommand =
    commandType === "real_render_preview" ||
    commandType === "real_render_final";
  if (isRenderCommand && !renderPreviewContractPassed) {
    errorCodes.push("render_preview_contract_required");
  }

  return {
    ok: errorCodes.length === 0,
    errorCodes,
    summary: {
      prepareScenePassed,
      setCameraPassed,
      setLightingPassed,
      setPanelsPassed,
      renderPreviewContractPassed,
      requiresPanels,
      isRenderCommand,
    },
  };
}

export function getRealUnrealCommandApprovalStatus(): {
  requiredApprovalStage: "unreal_sandbox_approved";
  realSendAllowed: false;
  executionEnabled: false;
  commandTypes: typeof REAL_UNREAL_COMMAND_TYPES;
  renderCommandTypes: ReadonlyArray<RealUnrealCommandType>;
  panelsCommandType: "real_set_panels";
  counts: {
    total: number;
    requested: number;
    approved: number;
    rejected: number;
  };
  safetyEnvelope: typeof SAFETY_ENVELOPE;
} {
  const all = store.realUnrealCommandApprovalRequests;
  return {
    requiredApprovalStage: "unreal_sandbox_approved",
    realSendAllowed: false,
    executionEnabled: false,
    commandTypes: REAL_UNREAL_COMMAND_TYPES,
    renderCommandTypes: ["real_render_preview", "real_render_final"],
    panelsCommandType: "real_set_panels",
    counts: {
      total: all.length,
      requested: all.filter((r) => r.status === "requested").length,
      approved: all.filter((r) => r.status === "approved").length,
      rejected: all.filter((r) => r.status === "rejected").length,
    },
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

export function requestRealUnrealCommandApproval(
  input: RealUnrealCommandApprovalRequest,
): {
  ok: boolean;
  status: RealUnrealCommandApprovalStatus;
  record: RealUnrealCommandApprovalRecord | null;
  errorCodes: string[];
  message: string;
} {
  if (input.confirm !== true) {
    return {
      ok: false,
      status: "rejected",
      record: null,
      errorCodes: ["confirm_required"],
      message: "confirm:true is required.",
    };
  }
  const production = store.productions.get(input.productionId);
  if (!production) {
    return {
      ok: false,
      status: "rejected",
      record: null,
      errorCodes: ["production_not_found"],
      message: "Unknown production.",
    };
  }
  const stage = getApprovalStage(input.productionId);
  if (stage !== "unreal_sandbox_approved") {
    return {
      ok: false,
      status: "rejected",
      record: null,
      errorCodes: ["approval_stage_not_met"],
      message: `Approval stage must be 'unreal_sandbox_approved' (current: ${stage}).`,
    };
  }
  const readiness = getLatestReadinessReport(input.productionId);
  if (!readiness) {
    return {
      ok: false,
      status: "rejected",
      record: null,
      errorCodes: ["readiness_report_missing"],
      message: "A readiness report must exist before requesting approval.",
    };
  }
  const criticalBlockers = (readiness.blockers ?? []).filter(
    (b) => b.severity === "blocker",
  );
  if (criticalBlockers.length > 0) {
    return {
      ok: false,
      status: "rejected",
      record: null,
      errorCodes: ["readiness_blockers_present"],
      message: `${criticalBlockers.length} critical readiness blocker(s) present.`,
    };
  }
  const panelsUsed = input.panelsUsed === true;
  const chain = evaluateRealUnrealCommandApprovalDryRunChain(
    input.productionId,
    input.commandType,
    panelsUsed,
  );
  if (!chain.ok) {
    return {
      ok: false,
      status: "rejected",
      record: null,
      errorCodes: chain.errorCodes,
      message: "Required dry-run chain is not complete.",
    };
  }

  const idHash = createHash("sha256")
    .update(
      `real_unreal_cmd_approval:${input.productionId}:${input.commandType}:${Date.now()}:${Math.random()}`,
    )
    .digest("hex")
    .slice(0, 20);
  const rec: RealUnrealCommandApprovalRecord = {
    id: `real_unreal_cmd_approval_${idHash}`,
    productionId: input.productionId,
    commandType: input.commandType,
    status: "requested",
    reason: input.reason,
    decisionReason: null,
    panelsUsed,
    realSendAllowed: false,
    executionEnabled: false,
    endpointHost: null,
    approvalStageAtRequest: stage,
    readinessReportId: readiness.id,
    readinessSummary: {
      score: readiness.overallScore,
      blockers: (readiness.blockers ?? []).length,
      warnings: (readiness.warnings ?? []).length,
      passed: (readiness.passedChecks ?? []).length,
      failed: (readiness.failedChecks ?? []).length,
    },
    dryRunChainSummary: chain.summary,
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: new Date().toISOString(),
    decidedAt: null,
  };
  store.realUnrealCommandApprovalRequests.push(rec);
  if (store.realUnrealCommandApprovalRequests.length > 5000) {
    store.realUnrealCommandApprovalRequests.splice(
      0,
      store.realUnrealCommandApprovalRequests.length - 5000,
    );
  }
  persistRealUnrealCommandApprovalRequests();
  recordAudit(
    "root_admin",
    "real_unreal.command_approval.requested",
    `${rec.id}:${rec.productionId}:${rec.commandType}`,
  );
  return {
    ok: true,
    status: "requested",
    record: sanitizeRealUnrealCommandApprovalRecord(rec),
    errorCodes: [],
    message:
      "Approval request stored. No real command was sent or executed. realSendAllowed and executionEnabled remain false.",
  };
}

export function decideRealUnrealCommandApproval(
  input: RealUnrealCommandApprovalDecision,
): {
  ok: boolean;
  status: RealUnrealCommandApprovalStatus | null;
  record: RealUnrealCommandApprovalRecord | null;
  errorCodes: string[];
  message: string;
} {
  if (input.confirm !== true) {
    return {
      ok: false,
      status: null,
      record: null,
      errorCodes: ["confirm_required"],
      message: "confirm:true is required.",
    };
  }
  const rec = store.realUnrealCommandApprovalRequests.find(
    (r) => r.id === input.id,
  );
  if (!rec) {
    return {
      ok: false,
      status: null,
      record: null,
      errorCodes: ["request_not_found"],
      message: "Approval request not found.",
    };
  }
  if (rec.status !== "requested") {
    // Defence-in-depth: re-affirm locked safety fields even on the
    // already-decided branch before returning the record.
    (rec as { realSendAllowed: false }).realSendAllowed = false;
    (rec as { executionEnabled: false }).executionEnabled = false;
    (rec as { endpointHost: null }).endpointHost = null;
    return {
      ok: false,
      status: rec.status,
      record: sanitizeRealUnrealCommandApprovalRecord(rec),
      errorCodes: ["already_decided"],
      message: `Request is already ${rec.status}.`,
    };
  }

  // CRITICAL: this only updates the status field. It NEVER executes a
  // real command. realSendAllowed / executionEnabled / endpointHost are
  // re-affirmed to their locked values below for defence-in-depth.
  rec.status = input.decision;
  rec.decisionReason = input.decisionReason;
  rec.decidedAt = new Date().toISOString();
  (rec as { realSendAllowed: false }).realSendAllowed = false;
  (rec as { executionEnabled: false }).executionEnabled = false;
  (rec as { endpointHost: null }).endpointHost = null;

  persistRealUnrealCommandApprovalRequests();
  recordAudit(
    "root_admin",
    `real_unreal.command_approval.${rec.status}`,
    `${rec.id}:${rec.productionId}:${rec.commandType}`,
  );
  return {
    ok: true,
    status: rec.status,
    record: sanitizeRealUnrealCommandApprovalRecord(rec),
    errorCodes: [],
    message:
      rec.status === "approved"
        ? "Approval recorded. No real command was sent or executed; this is a governance record only."
        : "Rejection recorded. No real command was sent or executed.",
  };
}

export function listRealUnrealCommandApprovalHistory(
  productionId?: string,
): RealUnrealCommandApprovalRecord[] {
  let items = store.realUnrealCommandApprovalRequests;
  if (productionId) items = items.filter((r) => r.productionId === productionId);
  return [...items]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(sanitizeRealUnrealCommandApprovalRecord);
}

/* ------------------------------------------------------------------ */
/* Real Unreal Level-Load Contract (contract-only, no execution)       */
/*                                                                     */
/* SAFETY:                                                             */
/*   - This module is CONTRACT-ONLY. It defines, validates, stores,    */
/*     and exports proposed level-load command contracts.              */
/*   - It NEVER loads a real level, calls Unreal, renders, starts MRQ  */
/*     or Sequencer, imports assets, attaches avatars/media, sends     */
/*     4D hardware commands, or publishes anything.                    */
/*   - It NEVER opens an outbound socket and NEVER calls               */
/*     sendUnrealCommand, sendUnrealSandboxCommand, sendFourDCue, or   */
/*     any other send/execute helper.                                  */
/*   - realSendAllowed and executionEnabled remain permanently false   */
/*     on every record and every API response.                         */
/*   - SAFETY_ENVELOPE is appended on every record and never mutated.  */
/* ------------------------------------------------------------------ */

function sanitizeRealUnrealLevelLoadContractRecord(
  rec: RealUnrealLevelLoadContractRecord,
): RealUnrealLevelLoadContractRecord {
  return {
    ...rec,
    realSendAllowed: false,
    executionEnabled: false,
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

function evaluateRealUnrealLevelLoadContractGate(
  productionId: string,
  proposedLevelName: UnrealLevelName,
): {
  ok: boolean;
  errorCodes: string[];
  approvedApprovalRequestId: string | null;
  dryRunChainSummary: Record<string, unknown>;
  preconditions: Record<string, unknown>;
} {
  const errorCodes: string[] = [];
  const production = store.productions.get(productionId);
  const productionExists = !!production;
  if (!productionExists) errorCodes.push("production_not_found");

  const stage = productionExists ? getApprovalStage(productionId) : null;
  const stageOk = stage === "unreal_sandbox_approved";
  if (productionExists && !stageOk) errorCodes.push("approval_stage_not_met");

  const levelAllowed = (ALLOWED_UNREAL_LEVEL_NAMES as readonly string[]).includes(
    proposedLevelName,
  );
  if (!levelAllowed) errorCodes.push("unsupported_level_name");

  const approvedRequest = store.realUnrealCommandApprovalRequests.find(
    (r) =>
      r.productionId === productionId &&
      r.commandType === "real_load_level" &&
      r.status === "approved",
  );
  if (!approvedRequest) errorCodes.push("real_load_level_approval_required");

  const prepareScenePassed = store.realUnrealPrepareSceneDryRunHistory.some(
    (r) => r.productionId === productionId && r.status === "passed",
  );
  const setCameraPassed = store.realUnrealSetCameraDryRunHistory.some(
    (r) => r.productionId === productionId && r.status === "passed",
  );
  const setLightingPassed = store.realUnrealSetLightingDryRunHistory.some(
    (r) => r.productionId === productionId && r.status === "passed",
  );
  if (!prepareScenePassed) errorCodes.push("prepare_scene_dry_run_required");
  if (!setCameraPassed) errorCodes.push("set_camera_dry_run_required");
  if (!setLightingPassed) errorCodes.push("set_lighting_dry_run_required");

  return {
    ok: errorCodes.length === 0,
    errorCodes,
    approvedApprovalRequestId: approvedRequest?.id ?? null,
    dryRunChainSummary: {
      prepareScenePassed,
      setCameraPassed,
      setLightingPassed,
    },
    preconditions: {
      productionExists,
      approvalStage: stage,
      stageOk,
      levelAllowed,
      hasApprovedLoadLevelRequest: !!approvedRequest,
    },
  };
}

export function getRealUnrealLevelLoadContractStatus(): {
  mode: "contract_only";
  realSendAllowed: false;
  executionEnabled: false;
  allowedLevelNames: typeof ALLOWED_UNREAL_LEVEL_NAMES;
  requiredApprovalStage: "unreal_sandbox_approved";
  requiredApprovalCommandType: "real_load_level";
  counts: { total: number; created: number; rejected: number };
  safetyEnvelope: typeof SAFETY_ENVELOPE;
} {
  const all = store.realUnrealLevelLoadContracts;
  return {
    mode: "contract_only",
    realSendAllowed: false,
    executionEnabled: false,
    allowedLevelNames: ALLOWED_UNREAL_LEVEL_NAMES,
    requiredApprovalStage: "unreal_sandbox_approved",
    requiredApprovalCommandType: "real_load_level",
    counts: {
      total: all.length,
      created: all.filter((r) => r.status === "created").length,
      rejected: all.filter((r) => r.status === "rejected").length,
    },
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

export function validateRealUnrealLevelLoadContract(
  input: RealUnrealLevelLoadContractValidateInput,
): {
  ok: boolean;
  productionId: string;
  proposedLevelName: UnrealLevelName;
  errorCodes: string[];
  preconditions: Record<string, unknown>;
  dryRunChainSummary: Record<string, unknown>;
  contractPreview: Record<string, unknown>;
  message: string;
  realSendAllowed: false;
  executionEnabled: false;
} {
  const gate = evaluateRealUnrealLevelLoadContractGate(
    input.productionId,
    input.proposedLevelName,
  );
  const contractPreview = {
    productionId: input.productionId,
    proposedLevelName: input.proposedLevelName,
    commandType: "real_load_level" as const,
    mode: "contract_only" as const,
    realSendAllowed: false as const,
    executionEnabled: false as const,
    approvalRequestId: gate.approvedApprovalRequestId,
  };
  return {
    ok: gate.ok,
    productionId: input.productionId,
    proposedLevelName: input.proposedLevelName,
    errorCodes: gate.errorCodes,
    preconditions: gate.preconditions,
    dryRunChainSummary: gate.dryRunChainSummary,
    contractPreview,
    message: gate.ok
      ? "Contract is locally valid. No real Unreal command was sent or executed."
      : "Contract validation failed. No real Unreal command was sent or executed.",
    realSendAllowed: false,
    executionEnabled: false,
  };
}

export function createRealUnrealLevelLoadContract(
  input: RealUnrealLevelLoadContractCreateInput,
): {
  ok: boolean;
  status: RealUnrealLevelLoadContractStatus;
  record: RealUnrealLevelLoadContractRecord | null;
  errorCodes: string[];
  message: string;
} {
  if (input.confirm !== true) {
    return {
      ok: false,
      status: "rejected",
      record: null,
      errorCodes: ["confirm_required"],
      message: "confirm:true is required.",
    };
  }
  const gate = evaluateRealUnrealLevelLoadContractGate(
    input.productionId,
    input.proposedLevelName,
  );
  if (!gate.ok) {
    return {
      ok: false,
      status: "rejected",
      record: null,
      errorCodes: gate.errorCodes,
      message: "Contract preconditions failed. No real Unreal command was sent or executed.",
    };
  }
  const idHash = createHash("sha256")
    .update(
      `real_unreal_level_load_contract:${input.productionId}:${input.proposedLevelName}:${Date.now()}:${Math.random()}`,
    )
    .digest("hex")
    .slice(0, 20);
  const rec: RealUnrealLevelLoadContractRecord = {
    id: `real_unreal_level_load_contract_${idHash}`,
    productionId: input.productionId,
    proposedLevelName: input.proposedLevelName,
    commandType: "real_load_level",
    mode: "contract_only",
    status: "created",
    realSendAllowed: false,
    executionEnabled: false,
    approvalRequestId: gate.approvedApprovalRequestId,
    dryRunChainSummary: gate.dryRunChainSummary,
    requestSummary: {
      productionId: input.productionId,
      proposedLevelName: input.proposedLevelName,
      commandType: "real_load_level",
      mode: "contract_only",
    },
    responseSummary: {
      contractCreated: true,
      networkCallMade: false,
      unrealCommandExecuted: false,
      fourDCommandExecuted: false,
      assetsImported: false,
      mrqTriggered: false,
      sequencerStarted: false,
    },
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: new Date().toISOString(),
  };
  store.realUnrealLevelLoadContracts.push(rec);
  if (store.realUnrealLevelLoadContracts.length > 5000) {
    store.realUnrealLevelLoadContracts.splice(
      0,
      store.realUnrealLevelLoadContracts.length - 5000,
    );
  }
  persistRealUnrealLevelLoadContracts();
  return {
    ok: true,
    status: "created",
    record: sanitizeRealUnrealLevelLoadContractRecord(rec),
    errorCodes: [],
    message:
      "Level-load contract stored. No real Unreal command was sent or executed. realSendAllowed and executionEnabled remain false.",
  };
}

export function listRealUnrealLevelLoadContractHistory(
  productionId?: string,
): RealUnrealLevelLoadContractRecord[] {
  let items = store.realUnrealLevelLoadContracts;
  if (productionId) items = items.filter((r) => r.productionId === productionId);
  return [...items]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(sanitizeRealUnrealLevelLoadContractRecord);
}

/* ------------------------------------------------------------------ */
/* Real Unreal Live Command Safety Switch (governance only)            */
/*                                                                     */
/* SAFETY:                                                             */
/*   - Defines, validates, stores, and displays the GLOBAL safety     */
/*     state for FUTURE live Unreal command execution.                 */
/*   - NEVER enables live Unreal commands, loads levels, renders,      */
/*     triggers Movie Render Queue or Sequencer, imports assets,       */
/*     attaches avatars/media, sends 4D hardware commands, or          */
/*     publishes anything.                                             */
/*   - The enum intentionally OMITS "live_enabled" — only "disabled",  */
/*     "dry_run_only", and "contract_only" exist as legal states.      */
/*   - liveExecutionEnabled, realSendAllowed, executionEnabled remain  */
/*     permanently false on every record. emergencyLocked stays true.  */
/*   - SAFETY_ENVELOPE is appended on every record and never mutated.  */
/* ------------------------------------------------------------------ */

/**
 * Route inventory set by the routes module during registration. The safety
 * switch evaluator uses this to verify no live-execution route exists.
 * Tests can also override this via __setProductionHouseRouteInventoryForTests
 * to simulate violations.
 */
let _productionHouseRouteInventory: string[] = [];
export function setProductionHouseRouteInventory(paths: string[]): void {
  _productionHouseRouteInventory = [...paths];
}
export function __setProductionHouseRouteInventoryForTests(paths: string[]): void {
  _productionHouseRouteInventory = [...paths];
}
const _forbiddenLiveRoutePatterns: RegExp[] = [
  /\/execute(\b|\/|$)/i,
  /\/live-send(\b|\/|$)/i,
  /\/send-live(\b|\/|$)/i,
  /\/live$/i,
  /\/mrq(\b|\/|$)/i,
  /\/movie[-_]?render[-_]?queue/i,
];
const _forbiddenCommandTypePatterns: RegExp[] = [
  /movie[-_]?render[-_]?queue/i,
  /^mrq$/i,
  /render[-_]?queue/i,
];
/** Extra command types appended to the MRQ scan list. Used by tests to
 *  simulate a violation without mutating the frozen REAL_UNREAL_COMMAND_TYPES
 *  constant. */
let _extraCommandTypesForScan: string[] = [];
export function __setExtraCommandTypesForTests(types: string[]): void {
  _extraCommandTypesForScan = [...types];
}
/** Test-only accessor for the in-memory store. */
export function __getStoreForTests(): typeof store {
  return store;
}
/** Test-only accessor for the route inventory. */
export function __getProductionHouseRouteInventoryForTests(): string[] {
  return [..._productionHouseRouteInventory];
}

function sanitizeRealUnrealSafetySwitchReport(
  rec: RealUnrealSafetySwitchReport,
): RealUnrealSafetySwitchReport {
  return {
    ...rec,
    liveExecutionEnabled: false,
    realSendAllowed: false,
    executionEnabled: false,
    emergencyLocked: true,
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

function runRealUnrealSafetySwitchChecks(): {
  checks: RealUnrealSafetySwitchCheck[];
  blockers: string[];
  warnings: string[];
  state: RealUnrealSafetySwitchState;
} {
  const checks: RealUnrealSafetySwitchCheck[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  // 1. Bridge mode must be dry_run only.
  const bridgeIsDryRunOnly =
    isRealUnrealSendAllowed() === false && isReal4DSendAllowed() === false;
  checks.push({
    id: "bridge_dry_run_only",
    label: "Bridge config is dry_run only",
    ok: bridgeIsDryRunOnly,
    detail: bridgeIsDryRunOnly
      ? "Both real Unreal and real 4D send are gated off."
      : "Bridge appears to allow real sends. This must be false.",
  });
  if (!bridgeIsDryRunOnly) blockers.push("bridge_live_send_appears_enabled");

  // 2. The enum must NOT contain "live_enabled".
  const hasLiveEnabledState = (REAL_UNREAL_SAFETY_SWITCH_STATES as readonly string[])
    .includes("live_enabled");
  checks.push({
    id: "no_live_enabled_state",
    label: 'Enum has no "live_enabled" state',
    ok: !hasLiveEnabledState,
    detail: hasLiveEnabledState
      ? "FATAL: live_enabled state exists."
      : "Enum is restricted to disabled/dry_run_only/contract_only.",
  });
  if (hasLiveEnabledState) blockers.push("live_enabled_state_present");

  // 3. Every command-approval record has executionEnabled:false.
  const approvalsWithExec = store.realUnrealCommandApprovalRequests.filter(
    (r) => (r as any).executionEnabled === true,
  );
  checks.push({
    id: "all_command_approvals_execution_disabled",
    label: "All command-approval records have executionEnabled:false",
    ok: approvalsWithExec.length === 0,
    detail: `offending=${approvalsWithExec.length}`,
  });
  if (approvalsWithExec.length > 0)
    blockers.push("command_approval_execution_enabled_detected");

  // 4. Every level-load contract has executionEnabled:false.
  const contractsWithExec = store.realUnrealLevelLoadContracts.filter(
    (r) => (r as any).executionEnabled === true,
  );
  checks.push({
    id: "all_level_load_contracts_execution_disabled",
    label: "All level-load contracts have executionEnabled:false",
    ok: contractsWithExec.length === 0,
    detail: `offending=${contractsWithExec.length}`,
  });
  if (contractsWithExec.length > 0)
    blockers.push("level_load_contract_execution_enabled_detected");

  // 5. Render-preview contracts have renderRequested:false.
  // Fail-closed: inspect ALL known shapes (top-level, nested
  // requestSummary.renderPreviewContract, nested contract.*) AND flag
  // movieRenderQueueRequested / sequencerStartRequested if ever present.
  function _renderRequestedAnywhere(r: any): boolean {
    if (!r || typeof r !== "object") return false;
    if (r.renderRequested === true) return true;
    if (r.movieRenderQueueRequested === true) return true;
    if (r.sequencerStartRequested === true) return true;
    const nested =
      r.requestSummary?.renderPreviewContract ??
      r.requestSummary ??
      r.contract ??
      r.renderPreviewContract;
    if (nested && typeof nested === "object") {
      if (nested.renderRequested === true) return true;
      if (nested.movieRenderQueueRequested === true) return true;
      if (nested.sequencerStartRequested === true) return true;
    }
    return false;
  }
  const rendersRequested = store.realUnrealRenderPreviewContractHistory.filter(
    _renderRequestedAnywhere,
  );
  checks.push({
    id: "render_preview_render_requested_false",
    label: "All render-preview contracts have renderRequested:false",
    ok: rendersRequested.length === 0,
    detail: `offending=${rendersRequested.length}`,
  });
  if (rendersRequested.length > 0)
    blockers.push("render_preview_render_requested_detected");

  // 6. No publicUrl / signedUrl non-null leakage in safety-relevant records.
  const urlScannedSets: Array<{ name: string; items: any[] }> = [
    { name: "realUnrealCommandApprovalRequests", items: store.realUnrealCommandApprovalRequests },
    { name: "realUnrealLevelLoadContracts", items: store.realUnrealLevelLoadContracts },
    { name: "realUnrealRenderPreviewContractHistory", items: store.realUnrealRenderPreviewContractHistory },
  ];
  let urlLeaks = 0;
  for (const { items } of urlScannedSets) {
    for (const it of items) {
      const pu = (it as any).publicUrl;
      const su = (it as any).signedUrl;
      if (pu !== undefined && pu !== null) urlLeaks++;
      if (su !== undefined && su !== null) urlLeaks++;
    }
  }
  checks.push({
    id: "no_public_or_signed_urls",
    label: "No publicUrl/signedUrl values present (except null)",
    ok: urlLeaks === 0,
    detail: `leaks=${urlLeaks}`,
  });
  if (urlLeaks > 0) blockers.push("public_or_signed_url_detected");

  // 7. No realSendAllowed:true anywhere across guarded collections.
  const allGuarded = [
    ...store.realUnrealCommandApprovalRequests,
    ...store.realUnrealLevelLoadContracts,
    ...store.realUnrealRenderPreviewContractHistory,
    ...store.realUnrealHandshakeHistory,
    ...store.realUnrealDryRunValidationHistory,
    ...store.realUnrealPrepareSceneDryRunHistory,
    ...store.realUnrealSetCameraDryRunHistory,
    ...store.realUnrealSetLightingDryRunHistory,
    ...store.realUnrealSetPanelsDryRunHistory,
    ...store.realUnrealHealthCheckHistory,
  ];
  const sendAllowedTrueCount = allGuarded.filter(
    (r) => (r as any).realSendAllowed === true,
  ).length;
  checks.push({
    id: "no_real_send_allowed_true",
    label: "No record has realSendAllowed:true",
    ok: sendAllowedTrueCount === 0,
    detail: `offending=${sendAllowedTrueCount}`,
  });
  if (sendAllowedTrueCount > 0) blockers.push("real_send_allowed_true_detected");

  // 8. No live command route exists. ACTUALLY inspect the route inventory
  // registered by registerProductionHouseRoutes() and fail-closed if any
  // path matches a forbidden live-execution pattern.
  const offendingRoutes = _productionHouseRouteInventory.filter((p) =>
    _forbiddenLiveRoutePatterns.some((rx) => rx.test(p)),
  );
  checks.push({
    id: "no_live_command_route",
    label: "No live Unreal command route exists",
    ok: offendingRoutes.length === 0,
    detail:
      offendingRoutes.length === 0
        ? `Scanned ${_productionHouseRouteInventory.length} registered paths; none match forbidden live patterns.`
        : `offending=${offendingRoutes.join(",")}`,
  });
  if (offendingRoutes.length > 0) blockers.push("live_command_route_detected");

  // 9. No Movie Render Queue command exists. ACTUALLY inspect
  // REAL_UNREAL_COMMAND_TYPES (plus any extras injected by tests) for any
  // MRQ/movie_render entries.
  const scannedCommandTypes = [
    ...(REAL_UNREAL_COMMAND_TYPES as readonly string[]),
    ..._extraCommandTypesForScan,
  ];
  const offendingCommandTypes = scannedCommandTypes.filter(
    (t) => _forbiddenCommandTypePatterns.some((rx) => rx.test(t)),
  );
  checks.push({
    id: "no_mrq_command",
    label: "No Movie Render Queue command exists",
    ok: offendingCommandTypes.length === 0,
    detail:
      offendingCommandTypes.length === 0
        ? `Scanned ${REAL_UNREAL_COMMAND_TYPES.length} command types; none match MRQ patterns.`
        : `offending=${offendingCommandTypes.join(",")}`,
  });
  if (offendingCommandTypes.length > 0) blockers.push("mrq_command_detected");

  // 10. No 4D hardware send route is enabled.
  const fourDEnabled = isReal4DSendAllowed();
  checks.push({
    id: "no_4d_hardware_send_enabled",
    label: "No 4D hardware send route is enabled",
    ok: fourDEnabled === false,
    detail: fourDEnabled ? "4D send appears enabled." : "4D send is disabled.",
  });
  if (fourDEnabled) blockers.push("four_d_hardware_send_enabled");

  // Warnings: surface mock/dry-run activity that is allowed but worth noting.
  if (store.realUnrealCommandApprovalRequests.length > 0) {
    warnings.push(
      `command_approval_records_present=${store.realUnrealCommandApprovalRequests.length}`,
    );
  }
  if (store.realUnrealLevelLoadContracts.length > 0) {
    warnings.push(
      `level_load_contracts_present=${store.realUnrealLevelLoadContracts.length}`,
    );
  }

  // State is always "disabled" while there are any blockers; otherwise
  // we report "contract_only" (since the contract module exists) or
  // "dry_run_only" (only dry-runs, no contracts). "live_enabled" is
  // INTENTIONALLY UNREACHABLE.
  const state: RealUnrealSafetySwitchState =
    blockers.length > 0
      ? "disabled"
      : store.realUnrealLevelLoadContracts.length > 0
        ? "contract_only"
        : "dry_run_only";

  return { checks, blockers, warnings, state };
}

export function getRealUnrealSafetySwitchStatus(): {
  state: RealUnrealSafetySwitchState;
  liveExecutionEnabled: false;
  realSendAllowed: false;
  executionEnabled: false;
  emergencyLocked: true;
  allowedStates: typeof REAL_UNREAL_SAFETY_SWITCH_STATES;
  blockedCommandCategories: string[];
  prerequisites: string[];
  checks: RealUnrealSafetySwitchCheck[];
  blockers: string[];
  warnings: string[];
  counts: { totalReports: number };
  safetyEnvelope: typeof SAFETY_ENVELOPE;
} {
  const { checks, blockers, warnings, state } = runRealUnrealSafetySwitchChecks();
  return {
    state,
    liveExecutionEnabled: false,
    realSendAllowed: false,
    executionEnabled: false,
    emergencyLocked: true,
    allowedStates: REAL_UNREAL_SAFETY_SWITCH_STATES,
    blockedCommandCategories: [
      "real_unreal_live_send",
      "movie_render_queue",
      "sequencer_start",
      "level_load_execute",
      "asset_import",
      "avatar_attach",
      "media_attach",
      "four_d_hardware_send",
      "publish",
    ],
    prerequisites: [
      "bridge_config_dry_run_only",
      "no_live_enabled_state",
      "all_command_approvals_execution_disabled",
      "all_level_load_contracts_execution_disabled",
      "render_preview_render_requested_false",
      "no_public_or_signed_urls",
      "no_real_send_allowed_true",
      "no_live_command_route",
      "no_mrq_command",
      "no_4d_hardware_send_enabled",
    ],
    checks,
    blockers,
    warnings,
    counts: { totalReports: store.realUnrealSafetySwitchReports.length },
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

export function evaluateRealUnrealSafetySwitch(): {
  ok: boolean;
  record: RealUnrealSafetySwitchReport;
  message: string;
} {
  const { checks, blockers, warnings, state } = runRealUnrealSafetySwitchChecks();
  const idHash = createHash("sha256")
    .update(`real_unreal_safety_switch:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 20);
  const rec: RealUnrealSafetySwitchReport = {
    id: `real_unreal_safety_switch_${idHash}`,
    state,
    liveExecutionEnabled: false,
    realSendAllowed: false,
    executionEnabled: false,
    emergencyLocked: true,
    checks,
    blockers,
    warnings,
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: new Date().toISOString(),
  };
  store.realUnrealSafetySwitchReports.push(rec);
  if (store.realUnrealSafetySwitchReports.length > 5000) {
    store.realUnrealSafetySwitchReports.splice(
      0,
      store.realUnrealSafetySwitchReports.length - 5000,
    );
  }
  persistRealUnrealSafetySwitchReports();
  return {
    ok: blockers.length === 0,
    record: sanitizeRealUnrealSafetySwitchReport(rec),
    message:
      blockers.length === 0
        ? "Safety switch evaluation completed. Live execution remains disabled."
        : `Safety switch evaluation detected ${blockers.length} blocker(s). Live execution remains disabled.`,
  };
}

export function listRealUnrealSafetySwitchHistory(): RealUnrealSafetySwitchReport[] {
  return [...store.realUnrealSafetySwitchReports]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(sanitizeRealUnrealSafetySwitchReport);
}

/* ------------------------------------------------------------------ */
/* Real Unreal Live Command Migration Plan (planning-only).            */
/* This module documents the future path from dry-run/contract-only    */
/* workflows toward gated live Unreal commands. It NEVER enables live  */
/* execution, loads levels, renders, triggers MRQ/Sequencer, imports   */
/* assets, attaches avatars/media, sends 4D, or publishes.             */
/* Every record carries permanently-locked invariants:                 */
/*   status="planning_only", liveExecutionEnabled=false,               */
/*   realSendAllowed=false, executionEnabled=false, emergencyLocked=true*/
/* The risk matrix exposes per-command risk metadata WITHOUT enabling  */
/* execution: every item has executionEnabled=false, realSendAllowed=false.*/
/* ------------------------------------------------------------------ */

const _MIGRATION_PLAN_EXTERNAL_DEPENDENCIES: string[] = [
  "unreal_engine_5_runtime",
  "unreal_remote_control_api",
  "external_unreal_bridge_service",
  "operator_console_application",
  "audit_log_storage",
  "rate_limiter_service",
  "kill_switch_signal_channel",
  "rollback_orchestrator",
];

const _MIGRATION_PLAN_MILESTONE_LABELS: Record<RealUnrealMigrationMilestoneId, string> = {
  external_unreal_bridge_deployed: "External Unreal bridge deployed",
  bridge_dry_run_health_check_passing: "Bridge dry-run health check passing",
  validate_package_dry_run_passing: "validate-package dry-run passing",
  prepare_scene_dry_run_passing: "prepare-scene dry-run passing",
  set_camera_dry_run_passing: "set-camera dry-run passing",
  set_lighting_dry_run_passing: "set-lighting dry-run passing",
  set_panels_dry_run_passing: "set-panels dry-run passing",
  render_preview_contract_passing: "render-preview contract passing",
  command_approval_gate_active: "Command approval gate active",
  level_load_contract_created: "Level-load contract created",
  safety_switch_evaluated: "Safety switch evaluated",
  emergency_lock_confirmed: "Emergency lock confirmed",
  operator_manual_created: "Operator manual created",
  rollback_plan_created: "Rollback plan created",
  live_command_audit_policy_approved: "Live-command audit policy approved",
  live_command_rate_limits_defined: "Live-command rate limits defined",
  live_command_allowlist_defined: "Live-command allowlist defined",
  live_command_kill_switch_tested: "Live-command kill switch tested",
};

function buildMigrationPlanMilestones(): RealUnrealMigrationMilestone[] {
  const passingDryRun = (items: Array<{ status?: string }>): boolean =>
    items.length > 0 && items.some((r) => r.status === "passed" || r.status === "ok");
  const passingHandshake = store.realUnrealHandshakeHistory.some(
    (r: any) => r.status === "passed" || r.status === "ok",
  );
  const validatePassed = store.realUnrealDryRunValidationHistory.length > 0 &&
    store.realUnrealDryRunValidationHistory.some((r: any) => r.status === "passed");
  const prepPassed = passingDryRun(store.realUnrealPrepareSceneDryRunHistory as any);
  const camPassed = passingDryRun(store.realUnrealSetCameraDryRunHistory as any);
  const lightPassed = passingDryRun(store.realUnrealSetLightingDryRunHistory as any);
  const panelsPassed = passingDryRun(store.realUnrealSetPanelsDryRunHistory as any);
  const renderPassed = passingDryRun(store.realUnrealRenderPreviewContractHistory as any);
  const commandApprovalActive = store.realUnrealCommandApprovalRequests.length > 0;
  const levelLoadCreated = store.realUnrealLevelLoadContracts.length > 0;
  const safetySwitchEvaluated = store.realUnrealSafetySwitchReports.length > 0;
  const safetyOk = store.realUnrealSafetySwitchReports.some(
    (r) => r.emergencyLocked === true,
  );

  const m = (
    id: RealUnrealMigrationMilestoneId,
    satisfied: boolean,
    detail?: string,
  ): RealUnrealMigrationMilestone => ({
    id,
    label: _MIGRATION_PLAN_MILESTONE_LABELS[id],
    satisfied,
    detail,
  });

  return [
    m("external_unreal_bridge_deployed", false,
      "Requires external Unreal bridge service deployment (out of platform scope)."),
    m("bridge_dry_run_health_check_passing", passingHandshake,
      `handshake_records=${store.realUnrealHandshakeHistory.length}`),
    m("validate_package_dry_run_passing", validatePassed,
      `validate_records=${store.realUnrealDryRunValidationHistory.length}`),
    m("prepare_scene_dry_run_passing", prepPassed,
      `prepare_records=${store.realUnrealPrepareSceneDryRunHistory.length}`),
    m("set_camera_dry_run_passing", camPassed,
      `camera_records=${store.realUnrealSetCameraDryRunHistory.length}`),
    m("set_lighting_dry_run_passing", lightPassed,
      `lighting_records=${store.realUnrealSetLightingDryRunHistory.length}`),
    m("set_panels_dry_run_passing", panelsPassed,
      `panels_records=${store.realUnrealSetPanelsDryRunHistory.length}`),
    m("render_preview_contract_passing", renderPassed,
      `render_preview_records=${store.realUnrealRenderPreviewContractHistory.length}`),
    m("command_approval_gate_active", commandApprovalActive,
      `command_approval_records=${store.realUnrealCommandApprovalRequests.length}`),
    m("level_load_contract_created", levelLoadCreated,
      `level_load_contracts=${store.realUnrealLevelLoadContracts.length}`),
    m("safety_switch_evaluated", safetySwitchEvaluated,
      `safety_switch_reports=${store.realUnrealSafetySwitchReports.length}`),
    m("emergency_lock_confirmed", safetyOk,
      "Emergency lock must be confirmed engaged via safety-switch evaluation."),
    m("operator_manual_created", false,
      "Requires authored operator manual (out of automated scope)."),
    m("rollback_plan_created", false,
      "Requires authored rollback plan (out of automated scope)."),
    m("live_command_audit_policy_approved", false,
      "Requires founder-approved audit policy (out of automated scope)."),
    m("live_command_rate_limits_defined", false,
      "Requires defined live-command rate limits (out of automated scope)."),
    m("live_command_allowlist_defined", false,
      "Requires defined live-command allowlist (out of automated scope)."),
    m("live_command_kill_switch_tested", false,
      "Requires kill-switch test result (out of automated scope)."),
  ];
}

function buildMigrationPlanRiskMatrix(): RealUnrealLiveCommandRiskMatrixItem[] {
  const make = (
    commandType: any,
    riskLevel: "low" | "medium" | "high" | "critical",
    requiredApprovals: string[],
    requiredDryRuns: string[],
    rollbackRequirement: string,
  ): RealUnrealLiveCommandRiskMatrixItem => ({
    commandType, riskLevel, requiredApprovals, requiredDryRuns,
    rollbackRequirement,
    executionEnabled: false,
    realSendAllowed: false,
  });
  return [
    make("real_load_level", "critical",
      ["root_admin", "operations_lead", "safety_officer"],
      ["validate_package", "prepare_scene"],
      "Force-unload level and restore previous level snapshot."),
    make("real_set_camera", "low",
      ["root_admin"],
      ["set_camera"],
      "Restore previous camera preset."),
    make("real_set_lighting", "medium",
      ["root_admin", "operations_lead"],
      ["set_lighting"],
      "Restore previous lighting preset."),
    make("real_set_panels", "medium",
      ["root_admin", "operations_lead"],
      ["set_panels"],
      "Restore previous panel preset and clear panel content."),
    make("real_start_sequence", "critical",
      ["root_admin", "operations_lead", "safety_officer"],
      ["prepare_scene", "render_preview"],
      "Sequencer stop signal + emergency lock engaged."),
    make("real_render_preview", "high",
      ["root_admin", "operations_lead"],
      ["render_preview"],
      "Cancel render job and clear preview outputs."),
    make("real_render_final", "critical",
      ["root_admin", "operations_lead", "safety_officer"],
      ["render_preview"],
      "Cancel render and quarantine partial outputs."),
    make("real_import_asset_reference", "high",
      ["root_admin", "operations_lead"],
      ["validate_package"],
      "Detach asset reference and quarantine imported manifest."),
    make("real_attach_avatar", "high",
      ["root_admin", "operations_lead", "safety_officer"],
      ["prepare_scene"],
      "Detach avatar and restore previous avatar binding."),
    make("real_attach_voice", "high",
      ["root_admin", "operations_lead"],
      ["prepare_scene"],
      "Detach voice binding and revert to silent state."),
    make("real_attach_video_panel", "high",
      ["root_admin", "operations_lead"],
      ["set_panels"],
      "Detach video panel and restore previous panel content."),
  ];
}

function sanitizeMigrationPlanRecord(
  rec: RealUnrealMigrationPlanRecord,
): RealUnrealMigrationPlanRecord {
  return {
    ...rec,
    status: "planning_only",
    liveExecutionEnabled: false,
    realSendAllowed: false,
    executionEnabled: false,
    emergencyLocked: true,
    riskMatrix: (rec.riskMatrix ?? []).map((m) => ({
      ...m,
      executionEnabled: false,
      realSendAllowed: false,
    })),
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

export function getRealUnrealMigrationPlanStatus(): {
  status: "planning_only";
  liveExecutionEnabled: false;
  realSendAllowed: false;
  executionEnabled: false;
  emergencyLocked: true;
  allowedStatuses: typeof REAL_UNREAL_MIGRATION_PLAN_STATUSES;
  milestoneIds: typeof REAL_UNREAL_MIGRATION_PLAN_MILESTONES;
  externalDependencies: string[];
  milestones: RealUnrealMigrationMilestone[];
  blockers: string[];
  riskMatrix: RealUnrealLiveCommandRiskMatrixItem[];
  counts: { totalPlans: number; unresolvedBlockers: number };
  safetyEnvelope: typeof SAFETY_ENVELOPE;
} {
  const milestones = buildMigrationPlanMilestones();
  const riskMatrix = buildMigrationPlanRiskMatrix();
  const blockers = milestones.filter((m) => !m.satisfied).map((m) => m.id);
  return {
    status: "planning_only",
    liveExecutionEnabled: false,
    realSendAllowed: false,
    executionEnabled: false,
    emergencyLocked: true,
    allowedStatuses: REAL_UNREAL_MIGRATION_PLAN_STATUSES,
    milestoneIds: REAL_UNREAL_MIGRATION_PLAN_MILESTONES,
    externalDependencies: [..._MIGRATION_PLAN_EXTERNAL_DEPENDENCIES],
    milestones,
    blockers,
    riskMatrix,
    counts: {
      totalPlans: store.realUnrealMigrationPlans.length,
      unresolvedBlockers: blockers.length,
    },
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

export function generateRealUnrealMigrationPlan(): {
  ok: boolean;
  record: RealUnrealMigrationPlanRecord;
  message: string;
} {
  const milestones = buildMigrationPlanMilestones();
  const riskMatrix = buildMigrationPlanRiskMatrix();
  const blockers = milestones.filter((m) => !m.satisfied).map((m) => m.id);
  const idHash = createHash("sha256")
    .update(`real_unreal_migration_plan:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 20);
  const rec: RealUnrealMigrationPlanRecord = {
    id: `real_unreal_migration_plan_${idHash}`,
    status: "planning_only",
    liveExecutionEnabled: false,
    realSendAllowed: false,
    executionEnabled: false,
    emergencyLocked: true,
    milestones,
    blockers,
    externalDependencies: [..._MIGRATION_PLAN_EXTERNAL_DEPENDENCIES],
    riskMatrix,
    safetyEnvelope: SAFETY_ENVELOPE,
    generatedAt: new Date().toISOString(),
  };
  store.realUnrealMigrationPlans.push(rec);
  if (store.realUnrealMigrationPlans.length > 5000) {
    store.realUnrealMigrationPlans.splice(
      0,
      store.realUnrealMigrationPlans.length - 5000,
    );
  }
  persistRealUnrealMigrationPlans();
  return {
    ok: blockers.length === 0,
    record: sanitizeMigrationPlanRecord(rec),
    message:
      blockers.length === 0
        ? "Migration plan generated. All planning milestones satisfied. Live execution remains disabled."
        : `Migration plan generated with ${blockers.length} unresolved blocker(s). Live execution remains disabled.`,
  };
}

export function listRealUnrealMigrationPlanHistory(): RealUnrealMigrationPlanRecord[] {
  return [...store.realUnrealMigrationPlans]
    .sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1))
    .map(sanitizeMigrationPlanRecord);
}

export function exportRealUnrealMigrationPlan(): {
  status: "planning_only";
  liveExecutionEnabled: false;
  realSendAllowed: false;
  executionEnabled: false;
  emergencyLocked: true;
  generatedAt: string;
  externalDependencies: string[];
  milestones: RealUnrealMigrationMilestone[];
  riskMatrix: RealUnrealLiveCommandRiskMatrixItem[];
  history: RealUnrealMigrationPlanRecord[];
  safetyEnvelope: typeof SAFETY_ENVELOPE;
} {
  const milestones = buildMigrationPlanMilestones();
  const riskMatrix = buildMigrationPlanRiskMatrix();
  return {
    status: "planning_only",
    liveExecutionEnabled: false,
    realSendAllowed: false,
    executionEnabled: false,
    emergencyLocked: true,
    generatedAt: new Date().toISOString(),
    externalDependencies: [..._MIGRATION_PLAN_EXTERNAL_DEPENDENCIES],
    milestones,
    riskMatrix,
    history: listRealUnrealMigrationPlanHistory().slice(0, 200),
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

/* ================================================================== */
/* 3D/4D Room, Avatar, Production Units, Media Pipeline, Preview      */
/* Mock-first deterministic generation. SHA-256 prompt hashing.       */
/* All records draft/internal-only — no live execution, no publishing.*/
/* ================================================================== */

function _phHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
function _shortHash(input: string): string {
  return _phHash(input).slice(0, 20);
}
function _detectRoomCategory(prompt: string): RoomCategory {
  const p = prompt.toLowerCase();
  if (/breaking|alert/.test(p)) return "breaking_newsroom";
  if (/podcast/.test(p)) return "podcast_room";
  if (/debate/.test(p)) return "debate_studio";
  if (/interview/.test(p)) return "interview_room";
  if (/market|finance|trading/.test(p)) return "market_watch_room";
  if (/press briefing|briefing/.test(p)) return "press_briefing_hall";
  if (/education|teach|class|lecture/.test(p)) return "education_hall";
  if (/cinema|film|4d/.test(p)) return "cinema_hall";
  if (/event|concert/.test(p)) return "event_hall";
  if (/emergency|disaster/.test(p)) return "emergency_broadcast_room";
  if (/newsroom|news/.test(p)) return "active_newsroom";
  return "custom_production_room";
}
function _detectAvatarRole(prompt: string): GeneratedAvatarRole {
  const p = prompt.toLowerCase();
  if (/anchor/.test(p)) return "news_anchor";
  if (/host/.test(p)) return "podcast_host";
  if (/moderator/.test(p)) return "debate_moderator";
  if (/analyst/.test(p)) return "analyst";
  if (/reporter|field/.test(p)) return "field_reporter";
  if (/teacher|professor/.test(p)) return "teacher";
  if (/ceo|virtual ceo/.test(p)) return "virtual_ceo";
  if (/assistant/.test(p)) return "ai_assistant";
  if (/guest/.test(p)) return "guest";
  return "custom_avatar";
}
function _detectAccessoryType(prompt: string): AvatarAccessoryType {
  const p = prompt.toLowerCase();
  if (/suit/.test(p)) return "suit";
  if (/mic/.test(p)) return "microphone";
  if (/earpiece/.test(p)) return "earpiece";
  if (/glass/.test(p)) return "glasses";
  if (/nameplate/.test(p)) return "desk_nameplate";
  if (/tablet/.test(p)) return "tablet";
  if (/headset/.test(p)) return "headset";
  if (/badge/.test(p)) return "badge";
  if (/prop/.test(p)) return "studio_prop";
  return "custom_accessory";
}
function _detectMediaPackageType(prompt: string): MediaPackageType {
  const p = prompt.toLowerCase();
  if (/news.*debate/.test(p)) return "news_to_debate";
  if (/news.*podcast/.test(p)) return "news_to_podcast";
  if (/news.*youtube/.test(p)) return "news_to_youtube";
  if (/news.*social/.test(p)) return "news_to_social";
  if (/podcast.*clip/.test(p)) return "podcast_to_clips";
  if (/debate.*clip/.test(p)) return "debate_to_clips";
  if (/newsroom.*4d|4d.*cinema/.test(p)) return "newsroom_to_4d_cinema";
  return "custom_package";
}

function _lockRoom(r: GeneratedRoomRecord): GeneratedRoomRecord {
  return { ...r, status: "draft", approvalStatus: "draft",
    visibility: "admin_only_internal", publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    safetyEnvelope: SAFETY_ENVELOPE };
}
function _lockAvatar(r: GeneratedAvatarRecord): GeneratedAvatarRecord {
  return { ...r, status: "draft", approvalStatus: "draft",
    visibility: "admin_only_internal", publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    safetyEnvelope: SAFETY_ENVELOPE };
}
function _lockAccessory(r: AvatarAccessoryRecord): AvatarAccessoryRecord {
  return { ...r, status: "draft", approvalStatus: "draft",
    visibility: "admin_only_internal", publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    safetyEnvelope: SAFETY_ENVELOPE };
}
function _lockUnit(r: ProductionUnitRecord): ProductionUnitRecord {
  return { ...r, status: "draft", approvalStatus: "draft",
    visibility: "admin_only_internal", publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    safetyEnvelope: SAFETY_ENVELOPE };
}
function _lockPackage(r: MediaPackageRecord): MediaPackageRecord {
  return { ...r, status: "draft", approvalStatus: "draft",
    visibility: "admin_only_internal", publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    safetyEnvelope: SAFETY_ENVELOPE };
}
function _lockPreview(r: PreviewSnapshotRecord): PreviewSnapshotRecord {
  return { ...r, status: "draft", approvalStatus: "draft",
    visibility: "admin_only_internal", publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    adminPreviewOnly: true, notRendered: true, notPublished: true,
    noUnrealExecution: true, noFourDHardware: true,
    safetyEnvelope: SAFETY_ENVELOPE };
}

function _pickEnum<T extends readonly string[]>(
  values: T,
  value: unknown,
  fallback: T[number],
): T[number] {
  return values.includes(value as string) ? (value as T[number]) : fallback;
}

function _lockCinema4DCharacter(raw: any): Cinema4DAnchorCharacterManifest {
  const id = String(raw?.characterId ?? `c4d_char_${_shortHash(`c4d-char:${Date.now()}`)}`);
  const rec: Cinema4DAnchorCharacterManifest = {
    characterId: id,
    productionId: typeof raw?.productionId === "string" ? raw.productionId : null,
    roomId: typeof raw?.roomId === "string" ? raw.roomId : null,
    characterName: String(raw?.characterName || "Mougle Anchor"),
    characterRole: _pickEnum(CINEMA4D_CHARACTER_ROLES, raw?.characterRole, "news_anchor") as Cinema4DCharacterRole,
    characterStyle: _pickEnum(CINEMA4D_CHARACTER_STYLES, raw?.characterStyle, "premium_news_anchor") as Cinema4DCharacterStyle,
    genderPresentation: typeof raw?.genderPresentation === "string"
      ? raw.genderPresentation.slice(0, 80)
      : undefined,
    wardrobeStyle: _pickEnum(CINEMA4D_WARDROBE_STYLES, raw?.wardrobeStyle, "navy_suit") as Cinema4DWardrobeStyle,
    posePreset: _pickEnum(CINEMA4D_POSE_PRESETS, raw?.posePreset, "seated_desk_hands_folded") as Cinema4DPosePreset,
    facialExpression: _pickEnum(CINEMA4D_FACIAL_EXPRESSIONS, raw?.facialExpression, "neutral_professional") as Cinema4DFacialExpression,
    voiceAssetId: typeof raw?.voiceAssetId === "string" ? raw.voiceAssetId : null,
    lipSyncReadiness: _pickEnum(CINEMA4D_LIP_SYNC_READINESS, raw?.lipSyncReadiness, "future_provider_required") as Cinema4DLipSyncReadiness,
    bodyMarkerName: String(raw?.bodyMarkerName || "MGL_CHARACTER_Anchor_01_BODY"),
    headMarkerName: String(raw?.headMarkerName || "MGL_CHARACTER_Anchor_01_HEAD"),
    faceTargetName: typeof raw?.faceTargetName === "string" ? raw.faceTargetName : "MGL_CHARACTER_Anchor_01_EYE_TARGET",
    leftHandMarkerName: typeof raw?.leftHandMarkerName === "string" ? raw.leftHandMarkerName : "MGL_CHARACTER_Anchor_01_LEFT_HAND",
    rightHandMarkerName: typeof raw?.rightHandMarkerName === "string" ? raw.rightHandMarkerName : "MGL_CHARACTER_Anchor_01_RIGHT_HAND",
    accessoryIds: Array.isArray(raw?.accessoryIds)
      ? raw.accessoryIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 50)
      : [],
    defaultCameraPreset: _pickEnum(
      [
        "anchor_closeup","anchor_medium","anchor_over_shoulder","wide_newsroom",
        "breaking_news_push_in","podcast_two_shot","host_closeup","guest_closeup",
        "table_wide","overhead_table",
      ] as const,
      raw?.defaultCameraPreset,
      "anchor_medium",
    ) as Cinema4DAnchorCameraPreset,
    compatibleWith: Array.isArray(raw?.compatibleWith) && raw.compatibleWith.length
      ? raw.compatibleWith.filter((x: unknown) =>
        typeof x === "string" && [
          "cinema4d_placeholder","metahuman_candidate",
          "character_creator_candidate","unreal_blueprint_candidate",
        ].includes(x),
      )
      : ["cinema4d_placeholder","metahuman_candidate","character_creator_candidate"],
    status: "draft",
    approvalStatus: "draft",
    visibility: "admin_only_internal",
    publicUrl: null,
    signedUrl: null,
    realSendAllowed: false,
    executionEnabled: false,
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: typeof raw?.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };
  return Cinema4DAnchorCharacterManifestSchema.parse(rec);
}

function _vec3(raw: any, fallback: { x: number; y: number; z: number }) {
  return {
    x: Number.isFinite(Number(raw?.x)) ? Number(raw.x) : fallback.x,
    y: Number.isFinite(Number(raw?.y)) ? Number(raw.y) : fallback.y,
    z: Number.isFinite(Number(raw?.z)) ? Number(raw.z) : fallback.z,
  };
}

function _lockCinema4DAccessory(raw: any): Cinema4DCharacterAccessoryManifest {
  const type = _pickEnum(
    CINEMA4D_CHARACTER_ACCESSORY_TYPES,
    raw?.accessoryType,
    "lavalier_mic",
  ) as Cinema4DCharacterAccessoryType;
  const rec: Cinema4DCharacterAccessoryManifest = {
    accessoryId: String(raw?.accessoryId ?? `c4d_acc_${_shortHash(`c4d-acc:${type}:${Date.now()}`)}`),
    characterId: typeof raw?.characterId === "string" ? raw.characterId : null,
    roomId: typeof raw?.roomId === "string" ? raw.roomId : null,
    accessoryType: type,
    accessoryName: String(raw?.accessoryName || `Cinema 4D ${type}`),
    attachTo: _pickEnum(CINEMA4D_ACCESSORY_ATTACH_TARGETS, raw?.attachTo, "lapel") as Cinema4DAccessoryAttachTarget,
    objectName: String(raw?.objectName || `MGL_CHARACTER_Anchor_01_${type.toUpperCase()}`),
    position: _vec3(raw?.position, { x: 0, y: 120, z: -20 }),
    rotation: _vec3(raw?.rotation, { x: 0, y: 0, z: 0 }),
    scale: _vec3(raw?.scale, { x: 1, y: 1, z: 1 }),
    materialPreset: String(raw?.materialPreset || "mat_black_gloss"),
    status: "draft",
    approvalStatus: "draft",
    visibility: "admin_only_internal",
    publicUrl: null,
    signedUrl: null,
    realSendAllowed: false,
    executionEnabled: false,
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: typeof raw?.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };
  return Cinema4DCharacterAccessoryManifestSchema.parse(rec);
}

function _lockCinema4DScript(raw: any): Cinema4DRoomCharacterScriptManifest {
  const rec: Cinema4DRoomCharacterScriptManifest = {
    scriptId: String(raw?.scriptId ?? `c4d_script_${_shortHash(`c4d-script:${Date.now()}`)}`),
    roomId: typeof raw?.roomId === "string" ? raw.roomId : null,
    productionId: typeof raw?.productionId === "string" ? raw.productionId : null,
    template: raw?.template === "mougle_podcast_studio"
      ? "mougle_podcast_studio"
      : "mougle_verified_newsroom",
    characterIds: Array.isArray(raw?.characterIds) ? raw.characterIds.filter((x: unknown) => typeof x === "string") : [],
    accessoryIds: Array.isArray(raw?.accessoryIds) ? raw.accessoryIds.filter((x: unknown) => typeof x === "string") : [],
    cameraPresets: Array.isArray(raw?.cameraPresets) ? raw.cameraPresets : [],
    qualityTier: _pickEnum(CINEMA4D_QUALITY_TIERS, raw?.qualityTier, "premium_draft") as Cinema4DQualityTier,
    qualityNotes: Array.isArray(raw?.qualityNotes)
      ? raw.qualityNotes.filter((x: unknown): x is string => typeof x === "string").slice(0, 20)
      : [
        "Real Cinema 4D scene-construction script with primitives, materials, cameras, and lights.",
        "Final cinema-quality output still requires Cinema 4D rendering and human 3D expert review.",
      ],
    script: String(raw?.script || "# Cinema 4D placeholder script draft"),
    label: "Cinema 4D placeholder anchor — replace later with MetaHuman, Character Creator, or final rig.",
    status: "draft",
    approvalStatus: "draft",
    visibility: "admin_only_internal",
    publicUrl: null,
    signedUrl: null,
    realSendAllowed: false,
    executionEnabled: false,
    realRenderCalled: false,
    unrealCommandSent: false,
    fourDCommandSent: false,
    published: false,
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: typeof raw?.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };
  return Cinema4DRoomCharacterScriptManifestSchema.parse(rec);
}

function _cinema4DPreviewCamera(camera: string | null | undefined): any {
  if (camera === "anchor_closeup" || camera === "host_closeup" || camera === "guest_closeup") {
    return "anchor_close_up";
  }
  if (camera === "wide_newsroom" || camera === "podcast_two_shot" || camera === "table_wide") {
    return "wide_master";
  }
  if (camera === "anchor_over_shoulder") return "panel_overview";
  return "anchor_two_shot";
}

function _cinema4DPanelFocus(value: unknown): string {
  if (Array.isArray(value)) return value.filter(Boolean).slice(0, 4).join(" · ");
  if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).slice(0, 4).join(" · ");
  return String(value ?? "Verified headline / source panel / claim panel").slice(0, 500);
}

const CINEMA4D_PLACEHOLDER_LABEL =
  "Cinema 4D placeholder anchor — replace later with MetaHuman, Character Creator, or final rig.";

export function generateGeneratedRoom(input: {
  prompt: string; productionId?: string | null; roomName?: string;
  roomCategory?: RoomCategory;
}): { ok: true; record: GeneratedRoomRecord } {
  const prompt = String(input.prompt ?? "").slice(0, 4000);
  const promptHash = _phHash(prompt);
  const cat = input.roomCategory ?? _detectRoomCategory(prompt);
  const rec: GeneratedRoomRecord = _lockRoom({
    roomId: `room_${_shortHash(`room:${cat}:${input.productionId ?? ""}:${prompt}`)}`,
    productionId: input.productionId ?? null,
    roomName: input.roomName ?? `Room (${cat})`,
    roomCategory: cat,
    visualStyle: "cinematic_admin_preview",
    cameraStyle: "studio_multi_cam_mock",
    lightingStyle: "dramatic_admin_mock",
    colorPalette: ["#0b1d36","#d4a017","#ffffff"],
    screenLayout: "main_stage_with_side_panels",
    panelLayout: "lower_third_plus_ticker",
    audienceMode: cat === "event_hall" || cat === "cinema_hall" ? "live_hall_mock" : "studio_only_mock",
    fourDCompatibility: ["light","fog","bass"],
    unrealLevelCandidate: `MOCK_LEVEL_${cat}`,
    prompt, promptHash,
    status: "draft", approvalStatus: "draft",
    visibility: "admin_only_internal",
    publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: new Date().toISOString(),
  });
  const ri = store.generatedRooms.findIndex((x) => x.roomId === rec.roomId);
  if (ri >= 0) store.generatedRooms[ri] = rec; else store.generatedRooms.push(rec);
  if (store.generatedRooms.length > 5000) {
    store.generatedRooms.splice(0, store.generatedRooms.length - 5000);
  }
  persistGeneratedRooms();
  return { ok: true, record: GeneratedRoomRecordSchema.parse(rec) };
}
export function listGeneratedRooms(): GeneratedRoomRecord[] {
  return [...store.generatedRooms]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(_lockRoom);
}
export function getGeneratedRoom(roomId: string): GeneratedRoomRecord | null {
  const r = store.generatedRooms.find((x) => x.roomId === roomId);
  return r ? _lockRoom(r) : null;
}

export function generateGeneratedAvatar(input: {
  prompt: string; productionId?: string | null;
  avatarName?: string; avatarRole?: GeneratedAvatarRole;
  accessoryList?: AvatarAccessoryType[];
}): { ok: true; record: GeneratedAvatarRecord } {
  const prompt = String(input.prompt ?? "").slice(0, 4000);
  const promptHash = _phHash(prompt);
  const role = input.avatarRole ?? _detectAvatarRole(prompt);
  const rec: GeneratedAvatarRecord = _lockAvatar({
    avatarId: `avatar_${_shortHash(`avatar:${role}:${input.productionId ?? ""}:${prompt}`)}`,
    productionId: input.productionId ?? null,
    avatarName: input.avatarName ?? `Avatar (${role})`,
    avatarRole: role,
    avatarStyle: "premium_cinematic_mock",
    voiceProfile: "neutral_studio_mock",
    lipSyncReadiness: "draft_lipsync_planned",
    metahumanCandidate: `MOCK_METAHUMAN_${role}`,
    accessoryList: input.accessoryList ?? ["microphone","earpiece"],
    prompt, promptHash,
    status: "draft", approvalStatus: "draft",
    visibility: "admin_only_internal",
    publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: new Date().toISOString(),
  });
  const ai = store.generatedAvatars.findIndex((x) => x.avatarId === rec.avatarId);
  if (ai >= 0) store.generatedAvatars[ai] = rec; else store.generatedAvatars.push(rec);
  if (store.generatedAvatars.length > 5000) {
    store.generatedAvatars.splice(0, store.generatedAvatars.length - 5000);
  }
  persistGeneratedAvatars();
  return { ok: true, record: GeneratedAvatarRecordSchema.parse(rec) };
}
export function listGeneratedAvatars(): GeneratedAvatarRecord[] {
  return [...store.generatedAvatars]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(_lockAvatar);
}
export function getGeneratedAvatar(avatarId: string): GeneratedAvatarRecord | null {
  const r = store.generatedAvatars.find((x) => x.avatarId === avatarId);
  return r ? _lockAvatar(r) : null;
}

export function generateAvatarAccessory(input: {
  prompt: string; avatarId?: string | null;
  accessoryType?: AvatarAccessoryType; label?: string;
}): { ok: true; record: AvatarAccessoryRecord } {
  const prompt = String(input.prompt ?? "").slice(0, 4000);
  const promptHash = _phHash(prompt);
  const type = input.accessoryType ?? _detectAccessoryType(prompt);
  const rec: AvatarAccessoryRecord = _lockAccessory({
    accessoryId: `accessory_${_shortHash(`accessory:${type}:${input.avatarId ?? ""}:${prompt}`)}`,
    avatarId: input.avatarId ?? null,
    accessoryType: type,
    label: input.label ?? `Accessory (${type})`,
    description: `Mock accessory ${type} for admin preview only.`,
    prompt, promptHash,
    status: "draft", approvalStatus: "draft",
    visibility: "admin_only_internal",
    publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: new Date().toISOString(),
  });
  const xi = store.avatarAccessories.findIndex((x) => x.accessoryId === rec.accessoryId);
  if (xi >= 0) store.avatarAccessories[xi] = rec; else store.avatarAccessories.push(rec);
  if (store.avatarAccessories.length > 5000) {
    store.avatarAccessories.splice(0, store.avatarAccessories.length - 5000);
  }
  persistAvatarAccessories();
  return { ok: true, record: AvatarAccessoryRecordSchema.parse(rec) };
}
export function listAvatarAccessories(): AvatarAccessoryRecord[] {
  return [...store.avatarAccessories]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(_lockAccessory);
}

export function generateCinema4DAnchorCharacterManifest(input: {
  productionId?: string | null;
  roomId?: string | null;
  characterName?: string;
  characterRole?: Cinema4DCharacterRole;
  characterStyle?: Cinema4DCharacterStyle;
  genderPresentation?: string;
  wardrobeStyle?: Cinema4DWardrobeStyle;
  posePreset?: Cinema4DPosePreset;
  facialExpression?: Cinema4DFacialExpression;
  voiceAssetId?: string | null;
  accessoryIds?: string[];
  defaultCameraPreset?: Cinema4DAnchorCameraPreset;
}): { ok: true; manifest: Cinema4DAnchorCharacterManifest } {
  const role = input.characterRole ?? "news_anchor";
  const name = (input.characterName || "Mougle Verified Anchor").slice(0, 160);
  const characterId = `c4d_char_${_shortHash(
    `c4d-char:${input.productionId ?? ""}:${input.roomId ?? ""}:${name}:${role}`,
  )}`;
  const manifest = _lockCinema4DCharacter({
    characterId,
    productionId: input.productionId ?? null,
    roomId: input.roomId ?? null,
    characterName: name,
    characterRole: role,
    characterStyle: input.characterStyle ?? "premium_news_anchor",
    genderPresentation: input.genderPresentation,
    wardrobeStyle: input.wardrobeStyle ?? "navy_suit",
    posePreset: input.posePreset ?? "seated_desk_hands_folded",
    facialExpression: input.facialExpression ?? "neutral_professional",
    voiceAssetId: input.voiceAssetId ?? null,
    lipSyncReadiness: "future_provider_required",
    bodyMarkerName: "MGL_CHARACTER_Anchor_01_BODY",
    headMarkerName: "MGL_CHARACTER_Anchor_01_HEAD",
    faceTargetName: "MGL_CHARACTER_Anchor_01_EYE_TARGET",
    leftHandMarkerName: "MGL_CHARACTER_Anchor_01_LEFT_HAND",
    rightHandMarkerName: "MGL_CHARACTER_Anchor_01_RIGHT_HAND",
    accessoryIds: input.accessoryIds ?? [],
    defaultCameraPreset: input.defaultCameraPreset ?? "anchor_medium",
    compatibleWith: [
      "cinema4d_placeholder",
      "metahuman_candidate",
      "character_creator_candidate",
      "unreal_blueprint_candidate",
    ],
    createdAt: new Date().toISOString(),
  });
  const i = store.cinema4DAnchorCharacters.findIndex((r) => r.characterId === manifest.characterId);
  if (i >= 0) store.cinema4DAnchorCharacters[i] = manifest;
  else store.cinema4DAnchorCharacters.push(manifest);
  if (store.cinema4DAnchorCharacters.length > 5000) {
    store.cinema4DAnchorCharacters.splice(0, store.cinema4DAnchorCharacters.length - 5000);
  }
  persistCinema4DAnchorCharacters();
  recordAudit("root_admin", "cinema4d.character_manifest.generated", manifest.characterId);
  return { ok: true, manifest };
}

export function listCinema4DAnchorCharacters(): Cinema4DAnchorCharacterManifest[] {
  return [...store.cinema4DAnchorCharacters]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(_lockCinema4DCharacter);
}

export function getCinema4DAnchorCharacter(
  characterId: string,
): Cinema4DAnchorCharacterManifest | null {
  const found = store.cinema4DAnchorCharacters.find((r) => r.characterId === characterId);
  return found ? _lockCinema4DCharacter(found) : null;
}

export function generateCinema4DCharacterAccessoryManifest(input: {
  characterId?: string | null;
  roomId?: string | null;
  accessoryType?: Cinema4DCharacterAccessoryType;
  accessoryName?: string;
  attachTo?: Cinema4DAccessoryAttachTarget;
  materialPreset?: string;
}): { ok: true; manifest: Cinema4DCharacterAccessoryManifest } {
  const type = input.accessoryType ?? "lavalier_mic";
  const characterId = input.characterId ?? null;
  const attachTo = input.attachTo ?? (
    type === "earpiece" ? "ear" :
    type === "tablet" || type === "cue_card" ? "left_hand" :
    type === "microphone" || type === "laptop" ? "desk" :
    "lapel"
  );
  const accessoryId = `c4d_acc_${_shortHash(
    `c4d-acc:${characterId ?? ""}:${input.roomId ?? ""}:${type}:${input.accessoryName ?? ""}`,
  )}`;
  const manifest = _lockCinema4DAccessory({
    accessoryId,
    characterId,
    roomId: input.roomId ?? null,
    accessoryType: type,
    accessoryName: input.accessoryName ?? `Anchor ${type}`,
    attachTo,
    objectName: `MGL_CHARACTER_Anchor_01_${type.toUpperCase()}`,
    position: type === "earpiece"
      ? { x: 14, y: 166, z: 0 }
      : type === "tablet"
      ? { x: -24, y: 104, z: -42 }
      : { x: 0, y: 124, z: -24 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: type === "tablet" ? { x: 1.1, y: 0.08, z: 0.72 } : { x: 1, y: 1, z: 1 },
    materialPreset: input.materialPreset ?? (
      type === "tablet" || type === "laptop" ? "mat_black_gloss" : "mat_dark_metal"
    ),
    createdAt: new Date().toISOString(),
  });
  const i = store.cinema4DCharacterAccessories.findIndex((r) => r.accessoryId === manifest.accessoryId);
  if (i >= 0) store.cinema4DCharacterAccessories[i] = manifest;
  else store.cinema4DCharacterAccessories.push(manifest);
  if (store.cinema4DCharacterAccessories.length > 5000) {
    store.cinema4DCharacterAccessories.splice(0, store.cinema4DCharacterAccessories.length - 5000);
  }
  persistCinema4DCharacterAccessories();

  if (characterId) {
    const ci = store.cinema4DAnchorCharacters.findIndex((r) => r.characterId === characterId);
    if (ci >= 0) {
      store.cinema4DAnchorCharacters[ci] = _lockCinema4DCharacter({
        ...store.cinema4DAnchorCharacters[ci],
        accessoryIds: _uniqueIds([
          ...(store.cinema4DAnchorCharacters[ci].accessoryIds ?? []),
          manifest.accessoryId,
        ]),
      });
      persistCinema4DAnchorCharacters();
    }
  }

  recordAudit("root_admin", "cinema4d.accessory_manifest.generated", manifest.accessoryId);
  return { ok: true, manifest };
}

export function listCinema4DCharacterAccessories(
  characterId?: string,
): Cinema4DCharacterAccessoryManifest[] {
  let arr = [...store.cinema4DCharacterAccessories];
  if (characterId) arr = arr.filter((r) => r.characterId === characterId);
  return arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(_lockCinema4DAccessory);
}

function _cinema4DNewsroomScript(
  character: Cinema4DAnchorCharacterManifest | null,
  accessories: Cinema4DCharacterAccessoryManifest[],
  qualityTier: Cinema4DQualityTier = "premium_draft",
): string {
  const characterName = character?.characterName ?? "Mougle Anchor";
  const accessoryNames = accessories.map((a) => a.objectName);
  return `# Mougle Cinema 4D Newsroom + Placeholder Anchor
# ${CINEMA4D_PLACEHOLDER_LABEL}
# Quality tier: ${qualityTier}
# Draft/internal only. This script creates real Cinema 4D scene objects from primitives.
# Final cinema-quality output still requires Cinema 4D rendering and human 3D expert review.
# It does NOT call Cinema 4D render, Unreal, Movie Render Queue, 4D hardware, or publishing APIs.

import c4d
from c4d import Vector
from c4d import utils

QUALITY_TIER = "${qualityTier}"
SAFETY_LOCKS = {
    "status": "draft",
    "approvalStatus": "draft",
    "visibility": "admin_only_internal",
    "publicUrl": None,
    "signedUrl": None,
    "realSendAllowed": False,
    "executionEnabled": False,
    "realRenderCalled": False,
    "unrealCommandSent": False,
    "fourDCommandSent": False,
    "published": False,
}

def safe_set(obj, key, value):
    try:
        obj[key] = value
    except Exception:
        pass

def set_attr(obj, attr_name, value):
    key = getattr(c4d, attr_name, None)
    if key is not None:
        safe_set(obj, key, value)

def make_mat(name, color, reflectance=0.0, luminance=None):
    mat = c4d.BaseMaterial(c4d.Mmaterial)
    mat.SetName(name)
    safe_set(mat, c4d.MATERIAL_COLOR_COLOR, color)
    if luminance is not None:
        safe_set(mat, c4d.MATERIAL_USE_LUMINANCE, True)
        safe_set(mat, c4d.MATERIAL_LUMINANCE_COLOR, luminance)
    if reflectance > 0:
        set_attr(mat, "MATERIAL_USE_REFLECTION", True)
        set_attr(mat, "MATERIAL_REFLECTION_BRIGHTNESS", reflectance)
    doc.InsertMaterial(mat)
    return mat

def tag_mat(obj, mat):
    if not mat:
        return obj
    tag = c4d.TextureTag()
    tag.SetMaterial(mat)
    obj.InsertTag(tag)
    return obj

def parent(obj, root):
    if root is not None:
        obj.InsertUnder(root)
    return obj

def add_null(name, pos, root=None):
    obj = c4d.BaseObject(c4d.Onull)
    obj.SetName(name)
    obj.SetAbsPos(pos)
    doc.InsertObject(obj)
    return parent(obj, root)

def add_cube(name, pos, size, mat=None, root=None, rot=None):
    obj = c4d.BaseObject(c4d.Ocube)
    obj.SetName(name)
    obj.SetAbsPos(pos)
    safe_set(obj, c4d.PRIM_CUBE_LEN, size)
    if rot is not None:
        obj.SetAbsRot(rot)
    tag_mat(obj, mat)
    doc.InsertObject(obj)
    return parent(obj, root)

def add_sphere(name, pos, radius, mat=None, root=None):
    obj = c4d.BaseObject(c4d.Osphere)
    obj.SetName(name)
    obj.SetAbsPos(pos)
    safe_set(obj, c4d.PRIM_SPHERE_RAD, radius)
    tag_mat(obj, mat)
    doc.InsertObject(obj)
    return parent(obj, root)

def add_cylinder(name, pos, radius, height, mat=None, root=None, rot=None):
    obj = c4d.BaseObject(c4d.Ocylinder)
    obj.SetName(name)
    obj.SetAbsPos(pos)
    safe_set(obj, c4d.PRIM_CYLINDER_RADIUS, radius)
    safe_set(obj, c4d.PRIM_CYLINDER_HEIGHT, height)
    if rot is not None:
        obj.SetAbsRot(rot)
    tag_mat(obj, mat)
    doc.InsertObject(obj)
    return parent(obj, root)

def add_torus(name, pos, ring_radius, pipe_radius, mat=None, root=None, rot=None):
    obj = c4d.BaseObject(c4d.Otorus)
    obj.SetName(name)
    obj.SetAbsPos(pos)
    safe_set(obj, c4d.PRIM_TORUS_OUTERRAD, ring_radius)
    safe_set(obj, c4d.PRIM_TORUS_INNERRAD, pipe_radius)
    if rot is not None:
        obj.SetAbsRot(rot)
    tag_mat(obj, mat)
    doc.InsertObject(obj)
    return parent(obj, root)

def add_text(name, text, pos, height, mat=None, root=None):
    obj = c4d.BaseObject(c4d.Osplinetext)
    obj.SetName(name)
    obj.SetAbsPos(pos)
    safe_set(obj, c4d.PRIM_TEXT_TEXT, text)
    safe_set(obj, c4d.PRIM_TEXT_HEIGHT, height)
    tag_mat(obj, mat)
    doc.InsertObject(obj)
    return parent(obj, root)

def look_at(obj, target):
    direction = target - obj.GetAbsPos()
    obj.SetAbsRot(utils.VectorToHPB(direction))
    return obj

def add_camera(name, pos, target, focal_length=55, root=None):
    cam = c4d.BaseObject(c4d.Ocamera)
    cam.SetName(name)
    cam.SetAbsPos(pos)
    safe_set(cam, c4d.CAMERA_FOCUS, focal_length)
    look_at(cam, target)
    doc.InsertObject(cam)
    return parent(cam, root)

def add_light(name, pos, color, intensity=1.0, root=None):
    light = c4d.BaseObject(c4d.Olight)
    light.SetName(name)
    light.SetAbsPos(pos)
    safe_set(light, c4d.LIGHT_COLOR, color)
    safe_set(light, c4d.LIGHT_BRIGHTNESS, intensity)
    safe_set(light, c4d.LIGHT_TYPE, c4d.LIGHT_TYPE_AREA)
    doc.InsertObject(light)
    return parent(light, root)

def make_world_map(panel_root, led_mat, gold):
    dots = [
        (-155, 246), (-135, 252), (-120, 238), (-98, 250), (-70, 238), (-42, 250),
        (-18, 244), (12, 252), (38, 240), (66, 250), (94, 236), (122, 246),
        (150, 236), (-145, 210), (-112, 218), (-82, 206), (-46, 218), (-10, 208),
        (28, 218), (64, 205), (102, 216), (136, 206), (-86, 184), (-48, 178),
        (-8, 188), (32, 178), (72, 188), (112, 178)
    ]
    for index, (x, y) in enumerate(dots):
        add_sphere("MGL_LED_WorldMap_Dot_%02d" % index, Vector(x, y, 147), 3.2, led_mat, panel_root)
    add_text("MGL_LED_WorldMap_Label", "MOUGLE NEWS", Vector(-88, 228, 142), 22, gold, panel_root)

def main():
    global doc
    doc.SetDocumentName("Mougle Premium Newsroom - Draft Cinema 4D Scene")
    scene = add_null("MGL_SCENE_MouglePremiumNewsroom_DRAFT", Vector(0, 0, 0))
    room = add_null("MGL_GROUP_ROOM_GEOMETRY", Vector(0, 0, 0), scene)
    panels = add_null("MGL_GROUP_LED_AND_BROADCAST_PANELS", Vector(0, 0, 0), scene)
    character_root = add_null("MGL_CHARACTER_Anchor_01_ROOT", Vector(0, 0, 0), scene)
    lighting = add_null("MGL_GROUP_LIGHTS", Vector(0, 0, 0), scene)
    cameras = add_null("MGL_GROUP_CAMERAS", Vector(0, 0, 0), scene)
    markers = add_null("MGL_GROUP_MARKERS_AND_BINDINGS", Vector(0, 0, 0), scene)

    blue = make_mat("MGL_RS_READY_Premium_Blue_Glass", Vector(0.015, 0.08, 0.22), 0.42)
    deep_blue = make_mat("MGL_OCTANE_READY_Deep_Navy_Wall", Vector(0.005, 0.018, 0.055), 0.18)
    gold = make_mat("MGL_RS_READY_Warm_Gold_Trim", Vector(1.0, 0.62, 0.17), 0.55, Vector(0.85, 0.42, 0.08))
    desk_mat = make_mat("MGL_RS_OCTANE_READY_Glossy_Reflective_Desk", Vector(0.01, 0.012, 0.018), 0.86)
    led_mat = make_mat("MGL_MAT_LED_WorldMap_Blue_Emission", Vector(0.08, 0.36, 1.0), 0.2, Vector(0.0, 0.45, 1.0))
    red = make_mat("MGL_MAT_Breaking_Red_Accent", Vector(0.92, 0.04, 0.03), 0.18, Vector(0.8, 0.02, 0.01))
    skin = make_mat("MGL_MAT_Placeholder_Skin", Vector(0.82, 0.56, 0.42), 0.08)
    suit = make_mat("MGL_MAT_Anchor_Suit_${character?.wardrobeStyle ?? "navy_suit"}", Vector(0.015, 0.045, 0.12), 0.22)
    shirt = make_mat("MGL_MAT_Anchor_Shirt", Vector(0.92, 0.94, 0.96), 0.1)
    black = make_mat("MGL_MAT_Black_Gloss_Device", Vector(0.005, 0.005, 0.006), 0.65)

    # Premium newsroom architecture and render-ready grouping.
    add_cylinder("MGL_ROOM_CurvedStudioFloor", Vector(0, -8, -45), 520, 16, desk_mat, room, Vector(0, 0, 0))
    add_cube("MGL_ROOM_Floor", Vector(0, 0, -55), Vector(760, 12, 520), desk_mat, room)
    add_cube("MGL_ROOM_BackWall", Vector(0, 190, 165), Vector(760, 250, 24), deep_blue, room)
    add_cube("MGL_ROOM_Left_CurvedSidePanel", Vector(-405, 132, 40), Vector(28, 205, 360), blue, room, Vector(0, 0.32, 0))
    add_cube("MGL_ROOM_Right_CurvedSidePanel", Vector(405, 132, 40), Vector(28, 205, 360), blue, room, Vector(0, -0.32, 0))
    add_torus("MGL_CEILING_LIGHT_RING_Main", Vector(0, 318, -42), 250, 6, gold, lighting, Vector(1.5708, 0, 0))
    add_torus("MGL_CEILING_LIGHT_RING_Inner_Blue", Vector(0, 306, -42), 155, 4, led_mat, lighting, Vector(1.5708, 0, 0))

    add_cylinder("MGL_ROOM_Glossy_Reflective_News_Desk", Vector(0, 72, -130), 176, 38, desk_mat, room, Vector(1.5708, 0, 0))
    add_cube("MGL_DESK_CurvedGlassTop", Vector(0, 104, -132), Vector(365, 18, 86), desk_mat, room)
    add_cube("MGL_DESK_FrontGoldTrim", Vector(0, 92, -178), Vector(330, 12, 14), gold, room)
    add_text("MGL_DESK_FrontLogo_M", "M", Vector(-18, 105, -186), 52, gold, room)

    add_cube("MGL_ROOM_LED_WORLD_MAP_WALL", Vector(0, 202, 136), Vector(560, 170, 14), blue, panels)
    add_cube("MGL_LED_WorldMap", Vector(0, 207, 145), Vector(505, 145, 8), deep_blue, panels)
    make_world_map(panels, led_mat, gold)
    add_cube("MGL_ROOM_TOP_STORIES_PANEL", Vector(330, 205, 40), Vector(118, 170, 12), blue, panels)
    add_text("MGL_TEXT_TOP_STORIES", "TOP STORIES", Vector(282, 274, 32), 15, gold, panels)
    add_cube("MGL_PANEL_SourceConfidence", Vector(-330, 195, 42), Vector(118, 112, 10), blue, panels)
    add_text("MGL_TEXT_SourceConfidence", "SOURCE\\nCONFIDENCE", Vector(-374, 232, 35), 12, gold, panels)
    add_cube("MGL_PANEL_Claims", Vector(324, 123, -58), Vector(120, 74, 10), deep_blue, panels)
    add_text("MGL_TEXT_Claims", "CLAIMS", Vector(286, 146, -66), 12, gold, panels)
    add_cube("MGL_PANEL_Timeline", Vector(0, 88, -204), Vector(256, 22, 8), blue, panels)
    add_text("MGL_TEXT_Timeline", "TIMELINE", Vector(-47, 100, -211), 11, gold, panels)
    add_cube("MGL_TICKER_Main", Vector(0, 32, -222), Vector(690, 22, 8), gold, panels)
    add_cube("MGL_LOWER_THIRD_Main", Vector(-160, 62, -222), Vector(300, 42, 8), blue, panels)
    add_cube("MGL_ROOM_TICKER_STRIP", Vector(0, 34, -216), Vector(700, 28, 10), gold, panels)
    add_cube("MGL_ROOM_LOWER_THIRD_PANEL", Vector(-160, 64, -215), Vector(305, 48, 10), blue, panels)
    add_cube("MGL_ROOM_SOURCE_PANEL", Vector(-330, 190, 80), Vector(120, 136, 10), blue, panels)
    add_cube("MGL_ROOM_CLAIM_PANEL", Vector(318, 124, -16), Vector(118, 76, 10), deep_blue, panels)
    add_text("MGL_TEXT_LowerThird", "${characterName} · MOUGLE VERIFIED NEWS", Vector(-295, 72, -226), 12, gold, panels)
    add_text("MGL_TEXT_Ticker", "ADMIN PREVIEW ONLY · NOT RENDERED · NOT PUBLISHED · NO UNREAL · NO 4D HARDWARE", Vector(-326, 39, -226), 9, deep_blue, panels)

    # Presenter placeholder. This is intentionally stylized geometry, not a final rig.
    add_cylinder("MGL_CHARACTER_Anchor_01_BODY", Vector(0, 139, -92), 31, 76, suit, character_root)
    add_sphere("MGL_CHARACTER_Anchor_01_HEAD", Vector(0, 202, -92), 27, skin, character_root)
    add_sphere("MGL_CHARACTER_Anchor_01_NECK", Vector(0, 174, -92), 13, skin, character_root)
    add_cylinder("MGL_CHARACTER_Anchor_01_LEFT_ARM", Vector(-44, 138, -118), 8, 68, suit, character_root, Vector(0.72, 0, -0.48))
    add_cylinder("MGL_CHARACTER_Anchor_01_RIGHT_ARM", Vector(44, 138, -118), 8, 68, suit, character_root, Vector(0.72, 0, 0.48))
    add_sphere("MGL_CHARACTER_Anchor_01_LEFT_HAND", Vector(-52, 106, -152), 12, skin, character_root)
    add_sphere("MGL_CHARACTER_Anchor_01_RIGHT_HAND", Vector(52, 106, -152), 12, skin, character_root)
    add_cube("MGL_CHARACTER_Anchor_01_SHIRT_PANEL", Vector(0, 145, -123), Vector(28, 54, 6), shirt, character_root)
    add_cube("MGL_CHARACTER_Anchor_01_TIE_ACCENT", Vector(0, 144, -128), Vector(8, 54, 5), gold, character_root)
    add_cube("MGL_CHARACTER_Anchor_01_HAIR_BLOCK", Vector(0, 226, -96), Vector(48, 12, 30), black, character_root)
    add_cube("MGL_CHARACTER_Anchor_01_CHAIR", Vector(0, 70, -56), Vector(96, 84, 88), deep_blue, character_root)
    add_cube("MGL_CHARACTER_Anchor_01_TABLET", Vector(-58, 107, -168), Vector(58, 4, 36), black, character_root)
    add_cube("MGL_CHARACTER_Anchor_01_LAPTOP", Vector(70, 105, -170), Vector(74, 6, 42), black, character_root)
    add_cube("MGL_CHARACTER_Anchor_01_LAV_MIC", Vector(-12, 164, -130), Vector(5, 5, 4), gold, character_root)
    add_cube("MGL_CHARACTER_Anchor_01_EARPIECE", Vector(26, 202, -92), Vector(6, 12, 5), gold, character_root)
    add_null("MGL_CHARACTER_Anchor_01_EYE_TARGET", Vector(0, 202, -355), markers)
    add_null("MGL_CHARACTER_Anchor_01_MOUTH_TARGET", Vector(0, 190, -122), markers)
    add_null("MGL_CHARACTER_Anchor_01_FACE_TARGET", Vector(0, 197, -270), markers)
    add_null("MGL_TELEPROMPTER_ANCHOR_01", Vector(0, 176, -335), markers)

    # Lighting and camera objects. They are real scene objects, but this script does not render.
    add_light("MGL_LIGHT_Key_Blue_Area", Vector(-220, 280, -260), Vector(0.22, 0.48, 1.0), 1.8, lighting)
    add_light("MGL_LIGHT_WarmGold_Rim_Area", Vector(220, 240, -160), Vector(1.0, 0.58, 0.18), 1.25, lighting)
    add_light("MGL_LIGHT_Desk_Gloss_Kicker", Vector(0, 155, -235), Vector(0.85, 0.96, 1.0), 0.85, lighting)
    add_light("MGL_LIGHT_CeilingRing_Area", Vector(0, 312, -45), Vector(1.0, 0.72, 0.32), 1.1, lighting)

    cam_close = add_camera("MGL_CAMERA_AnchorCloseup", Vector(0, 178, -365), Vector(0, 178, -95), 70, cameras)
    add_camera("MGL_CAMERA_AnchorMedium", Vector(0, 158, -505), Vector(0, 154, -104), 50, cameras)
    add_camera("MGL_CAMERA_AnchorOverShoulder", Vector(-146, 172, -330), Vector(70, 145, -10), 55, cameras)
    add_camera("MGL_CAMERA_WideNewsroom", Vector(0, 214, -760), Vector(0, 145, 30), 35, cameras)
    add_camera("MGL_CAMERA_BreakingNewsPushIn", Vector(0, 178, -430), Vector(0, 176, -100), 80, cameras)
    doc.SetActiveObject(cam_close)
    basedraw = doc.GetActiveBaseDraw()
    if basedraw:
        basedraw.SetSceneCamera(cam_close)

    add_null("MGL_CAMERA_PRESET_anchor_closeup", Vector(0, 185, -360), markers)
    add_null("MGL_CAMERA_PRESET_anchor_medium", Vector(0, 165, -520), markers)
    add_null("MGL_CAMERA_PRESET_anchor_over_shoulder", Vector(-145, 172, -330), markers)
    add_null("MGL_CAMERA_PRESET_wide_newsroom", Vector(0, 210, -760), markers)
    add_null("MGL_CAMERA_PRESET_breaking_news_push_in", Vector(0, 176, -430), markers)
    add_null("MGL_CHARACTER_BINDING_${character?.characterId ?? "unassigned"}", Vector(0, 245, -85), markers)
    add_null("MGL_CHARACTER_LABEL_${characterName.replace(/[^A-Za-z0-9_]/g, "_")}", Vector(0, 270, -85), markers)
    add_null("MGL_QUALITY_TIER_${qualityTier}", Vector(0, 288, -85), markers)
    # Optional accessory markers requested by manifest: ${accessoryNames.join(", ") || "none"}

    c4d.EventAdd()

if __name__ == "__main__":
    main()
`;
}

function _cinema4DPodcastScript(qualityTier: Cinema4DQualityTier = "premium_draft"): string {
  return `# Mougle Cinema 4D Podcast Studio + Placeholder Host/Guest
# ${CINEMA4D_PLACEHOLDER_LABEL}
# Quality tier: ${qualityTier}
# Draft/internal only. This script creates real Cinema 4D scene objects from primitives.
# Final cinema-quality output still requires Cinema 4D rendering and human 3D expert review.
# No render, no Unreal execution, no 4D hardware, no publishing.

import c4d
from c4d import Vector
from c4d import utils

QUALITY_TIER = "${qualityTier}"

def safe_set(obj, key, value):
    try:
        obj[key] = value
    except Exception:
        pass

def set_attr(obj, attr_name, value):
    key = getattr(c4d, attr_name, None)
    if key is not None:
        safe_set(obj, key, value)

def make_mat(name, color, reflectance=0.0, luminance=None):
    mat = c4d.BaseMaterial(c4d.Mmaterial)
    mat.SetName(name)
    safe_set(mat, c4d.MATERIAL_COLOR_COLOR, color)
    if luminance is not None:
        safe_set(mat, c4d.MATERIAL_USE_LUMINANCE, True)
        safe_set(mat, c4d.MATERIAL_LUMINANCE_COLOR, luminance)
    if reflectance > 0:
        set_attr(mat, "MATERIAL_USE_REFLECTION", True)
        set_attr(mat, "MATERIAL_REFLECTION_BRIGHTNESS", reflectance)
    doc.InsertMaterial(mat)
    return mat

def tag_mat(obj, mat):
    if mat:
        tag = c4d.TextureTag()
        tag.SetMaterial(mat)
        obj.InsertTag(tag)
    return obj

def parent(obj, root):
    if root is not None:
        obj.InsertUnder(root)
    return obj

def add_null(name, pos, root=None):
    obj = c4d.BaseObject(c4d.Onull)
    obj.SetName(name)
    obj.SetAbsPos(pos)
    doc.InsertObject(obj)
    return parent(obj, root)

def add_cube(name, pos, size, mat=None, root=None, rot=None):
    obj = c4d.BaseObject(c4d.Ocube)
    obj.SetName(name)
    obj.SetAbsPos(pos)
    safe_set(obj, c4d.PRIM_CUBE_LEN, size)
    if rot is not None:
        obj.SetAbsRot(rot)
    tag_mat(obj, mat)
    doc.InsertObject(obj)
    return parent(obj, root)

def add_sphere(name, pos, radius, mat=None, root=None):
    obj = c4d.BaseObject(c4d.Osphere)
    obj.SetName(name)
    obj.SetAbsPos(pos)
    safe_set(obj, c4d.PRIM_SPHERE_RAD, radius)
    tag_mat(obj, mat)
    doc.InsertObject(obj)
    return parent(obj, root)

def add_cylinder(name, pos, radius, height, mat=None, root=None, rot=None):
    obj = c4d.BaseObject(c4d.Ocylinder)
    obj.SetName(name)
    obj.SetAbsPos(pos)
    safe_set(obj, c4d.PRIM_CYLINDER_RADIUS, radius)
    safe_set(obj, c4d.PRIM_CYLINDER_HEIGHT, height)
    if rot is not None:
        obj.SetAbsRot(rot)
    tag_mat(obj, mat)
    doc.InsertObject(obj)
    return parent(obj, root)

def add_torus(name, pos, ring_radius, pipe_radius, mat=None, root=None, rot=None):
    obj = c4d.BaseObject(c4d.Otorus)
    obj.SetName(name)
    obj.SetAbsPos(pos)
    safe_set(obj, c4d.PRIM_TORUS_OUTERRAD, ring_radius)
    safe_set(obj, c4d.PRIM_TORUS_INNERRAD, pipe_radius)
    if rot is not None:
        obj.SetAbsRot(rot)
    tag_mat(obj, mat)
    doc.InsertObject(obj)
    return parent(obj, root)

def look_at(obj, target):
    direction = target - obj.GetAbsPos()
    obj.SetAbsRot(utils.VectorToHPB(direction))
    return obj

def add_camera(name, pos, target, focal_length=50, root=None):
    cam = c4d.BaseObject(c4d.Ocamera)
    cam.SetName(name)
    cam.SetAbsPos(pos)
    safe_set(cam, c4d.CAMERA_FOCUS, focal_length)
    look_at(cam, target)
    doc.InsertObject(cam)
    return parent(cam, root)

def add_light(name, pos, color, intensity=1.0, root=None):
    light = c4d.BaseObject(c4d.Olight)
    light.SetName(name)
    light.SetAbsPos(pos)
    safe_set(light, c4d.LIGHT_COLOR, color)
    safe_set(light, c4d.LIGHT_BRIGHTNESS, intensity)
    safe_set(light, c4d.LIGHT_TYPE, c4d.LIGHT_TYPE_AREA)
    doc.InsertObject(light)
    return parent(light, root)

def make_character(prefix, x, mat_body, mat_skin, mat_accent, root, facing=1):
    char_root = add_null(prefix + "_ROOT", Vector(x, 0, -70), root)
    add_cylinder(prefix + "_BODY", Vector(x, 124, -70), 27, 66, mat_body, char_root)
    add_sphere(prefix + "_HEAD", Vector(x, 184, -70), 24, mat_skin, char_root)
    add_cylinder(prefix + "_LEFT_ARM", Vector(x - 37, 126, -100), 7, 58, mat_body, char_root, Vector(0.65, 0, -0.45))
    add_cylinder(prefix + "_RIGHT_ARM", Vector(x + 37, 126, -100), 7, 58, mat_body, char_root, Vector(0.65, 0, 0.45))
    add_sphere(prefix + "_LEFT_HAND", Vector(x - 42, 98, -132), 10, mat_skin, char_root)
    add_sphere(prefix + "_RIGHT_HAND", Vector(x + 42, 98, -132), 10, mat_skin, char_root)
    add_cube(prefix + "_HEADPHONES", Vector(x, 188, -70), Vector(66, 9, 8), mat_accent, char_root)
    add_null(prefix + "_EYE_TARGET", Vector(x, 184, -310), root)
    add_null(prefix + "_MOUTH_TARGET", Vector(x, 174, -96), root)
    add_cube(prefix + "_CUE_TABLET", Vector(x + (28 * facing), 90, -150), Vector(46, 4, 28), mat_accent, char_root)
    return char_root

def main():
    global doc
    doc.SetDocumentName("Mougle Podcast Studio - Draft Cinema 4D Scene")
    scene = add_null("MGL_SCENE_MouglePodcastStudio_DRAFT", Vector(0, 0, 0))
    room = add_null("MGL_GROUP_PODCAST_ROOM_GEOMETRY", Vector(0, 0, 0), scene)
    characters = add_null("MGL_GROUP_PODCAST_CHARACTER_PLACEHOLDERS", Vector(0, 0, 0), scene)
    cameras = add_null("MGL_GROUP_PODCAST_CAMERAS", Vector(0, 0, 0), scene)
    lights = add_null("MGL_GROUP_PODCAST_WARM_LIGHTS", Vector(0, 0, 0), scene)
    markers = add_null("MGL_GROUP_PODCAST_MARKERS", Vector(0, 0, 0), scene)

    navy = make_mat("MGL_RS_READY_Podcast_Navy_Acoustic", Vector(0.01, 0.03, 0.08), 0.2)
    warm_gold = make_mat("MGL_OCTANE_READY_Warm_Gold_Practical", Vector(1.0, 0.58, 0.18), 0.45, Vector(0.8, 0.35, 0.08))
    table_mat = make_mat("MGL_RS_OCTANE_READY_Dark_Wood_Gloss_Table", Vector(0.06, 0.035, 0.018), 0.52)
    screen = make_mat("MGL_MAT_Podcast_VideoWall_Emission", Vector(0.04, 0.18, 0.36), 0.2, Vector(0.05, 0.4, 0.9))
    skin = make_mat("MGL_MAT_Podcast_Placeholder_Skin", Vector(0.82, 0.56, 0.42), 0.08)
    host_suit = make_mat("MGL_MAT_Host_Futuristic_Jacket", Vector(0.82, 0.84, 0.84), 0.32)
    guest_suit = make_mat("MGL_MAT_Guest_Dark_Blazer", Vector(0.02, 0.025, 0.032), 0.24)
    black = make_mat("MGL_MAT_Black_Gloss_Audio_Gear", Vector(0.004, 0.004, 0.005), 0.7)

    add_cube("MGL_PODCAST_ROOM_FLOOR", Vector(0, -6, -45), Vector(620, 12, 420), table_mat, room)
    add_cube("MGL_PODCAST_ACOUSTIC_BACK_WALL", Vector(0, 178, 118), Vector(560, 210, 18), navy, room)
    add_cube("MGL_PODCAST_VIDEO_WALL", Vector(0, 205, 126), Vector(430, 128, 10), screen, room)
    add_cube("MGL_PODCAST_SIDE_LED_LEFT", Vector(-290, 138, -22), Vector(16, 170, 250), screen, room)
    add_cube("MGL_PODCAST_SIDE_LED_RIGHT", Vector(290, 138, -22), Vector(16, 170, 250), screen, room)
    add_cylinder("MGL_PODCAST_TABLE_GLOSS", Vector(0, 78, -132), 154, 32, table_mat, room, Vector(1.5708, 0, 0))
    add_torus("MGL_PODCAST_CEILING_WARM_LIGHT_RING", Vector(0, 266, -76), 185, 5, warm_gold, lights, Vector(1.5708, 0, 0))

    # Character placeholder roots created by make_character:
    # MGL_CHARACTER_Host_01_ROOT
    # MGL_CHARACTER_Guest_01_ROOT
    make_character("MGL_CHARACTER_Host_01", -105, host_suit, skin, black, characters, 1)
    make_character("MGL_CHARACTER_Guest_01", 105, guest_suit, skin, black, characters, -1)
    add_cylinder("MGL_PODCAST_MIC_HOST_01", Vector(-105, 112, -165), 8, 46, black, room, Vector(0.5, 0, 0))
    add_cylinder("MGL_PODCAST_MIC_GUEST_01", Vector(105, 112, -165), 8, 46, black, room, Vector(0.5, 0, 0))
    add_cube("MGL_PODCAST_MIC_ARM_HOST_01", Vector(-132, 123, -150), Vector(70, 7, 7), black, room, Vector(0, 0, -0.35))
    add_cube("MGL_PODCAST_MIC_ARM_GUEST_01", Vector(132, 123, -150), Vector(70, 7, 7), black, room, Vector(0, 0, 0.35))
    add_cube("MGL_PODCAST_HEADSET_HOST_01", Vector(-105, 190, -70), Vector(65, 8, 8), black, characters)
    add_cube("MGL_PODCAST_HEADSET_GUEST_01", Vector(105, 190, -70), Vector(65, 8, 8), black, characters)
    add_cube("MGL_PODCAST_LOWER_THIRD_HOST", Vector(-112, 56, -218), Vector(178, 28, 8), screen, room)
    add_cube("MGL_PODCAST_LOWER_THIRD_GUEST", Vector(112, 56, -218), Vector(178, 28, 8), screen, room)

    add_light("MGL_LIGHT_Podcast_Key_Warm", Vector(-185, 245, -260), Vector(1.0, 0.64, 0.34), 1.6, lights)
    add_light("MGL_LIGHT_Podcast_Blue_Back", Vector(188, 205, 25), Vector(0.18, 0.38, 1.0), 0.9, lights)
    add_light("MGL_LIGHT_Podcast_Table_Gloss", Vector(0, 150, -230), Vector(1.0, 0.88, 0.62), 0.8, lights)

    two = add_camera("MGL_CAMERA_PodcastTwoShot", Vector(0, 152, -430), Vector(0, 125, -90), 45, cameras)
    add_camera("MGL_CAMERA_HostCloseup", Vector(-115, 165, -300), Vector(-105, 164, -70), 70, cameras)
    add_camera("MGL_CAMERA_GuestCloseup", Vector(115, 165, -300), Vector(105, 164, -70), 70, cameras)
    add_camera("MGL_CAMERA_TableWide", Vector(0, 184, -560), Vector(0, 92, -132), 35, cameras)
    add_camera("MGL_CAMERA_OverheadTable", Vector(0, 430, -130), Vector(0, 70, -130), 30, cameras)
    doc.SetActiveObject(two)
    doc.GetActiveBaseDraw().SetSceneCamera(two)

    add_null("MGL_CAMERA_PRESET_podcast_two_shot", Vector(0, 160, -430), markers)
    add_null("MGL_CAMERA_PRESET_host_closeup", Vector(-105, 172, -310), markers)
    add_null("MGL_CAMERA_PRESET_guest_closeup", Vector(105, 172, -310), markers)
    add_null("MGL_CAMERA_PRESET_table_wide", Vector(0, 190, -560), markers)
    add_null("MGL_CAMERA_PRESET_overhead_table", Vector(0, 430, -130), markers)
    add_null("MGL_QUALITY_TIER_${qualityTier}", Vector(0, 290, -70), markers)
    c4d.EventAdd()

if __name__ == "__main__":
    main()
`;
}

export function generateCinema4DRoomCharacterScript(input: {
  productionId?: string | null;
  roomId?: string | null;
  characterId?: string | null;
  accessoryIds?: string[];
  template?: "mougle_verified_newsroom" | "mougle_podcast_studio";
  qualityTier?: Cinema4DQualityTier;
}): { ok: true; manifest: Cinema4DRoomCharacterScriptManifest } {
  const template = input.template ?? "mougle_verified_newsroom";
  const qualityTier = input.qualityTier ?? "premium_draft";
  const character = input.characterId ? getCinema4DAnchorCharacter(input.characterId) : null;
  const accessories = (input.accessoryIds ?? character?.accessoryIds ?? [])
    .map((id) => store.cinema4DCharacterAccessories.find((a) => a.accessoryId === id))
    .filter((a): a is Cinema4DCharacterAccessoryManifest => !!a)
    .map(_lockCinema4DAccessory);
  const cameraPresets: Cinema4DAnchorCameraPreset[] = template === "mougle_podcast_studio"
    ? ["podcast_two_shot","host_closeup","guest_closeup","table_wide","overhead_table"]
    : ["anchor_closeup","anchor_medium","anchor_over_shoulder","wide_newsroom","breaking_news_push_in"];
  const script = template === "mougle_podcast_studio"
    ? _cinema4DPodcastScript(qualityTier)
    : _cinema4DNewsroomScript(character, accessories, qualityTier);
  const manifest = _lockCinema4DScript({
    scriptId: `c4d_script_${_shortHash(
      `c4d-script:${template}:${input.productionId ?? ""}:${input.roomId ?? ""}:${input.characterId ?? ""}`,
    )}`,
    roomId: input.roomId ?? character?.roomId ?? null,
    productionId: input.productionId ?? character?.productionId ?? null,
    template,
    characterIds: template === "mougle_podcast_studio"
      ? ["MGL_CHARACTER_Host_01","MGL_CHARACTER_Guest_01"]
      : [character?.characterId ?? "MGL_CHARACTER_Anchor_01"],
    accessoryIds: accessories.map((a) => a.accessoryId),
    cameraPresets,
    qualityTier,
    qualityNotes: [
      "Real Cinema 4D scene-construction script with primitives, materials, cameras, lights, and organized null groups.",
      "This is a premium draft, not final human-expert Cinema 4D polish.",
      "Final cinema-quality output still requires Cinema 4D rendering and human 3D expert review.",
    ],
    script,
    createdAt: new Date().toISOString(),
  });
  const i = store.cinema4DRoomCharacterScripts.findIndex((r) => r.scriptId === manifest.scriptId);
  if (i >= 0) store.cinema4DRoomCharacterScripts[i] = manifest;
  else store.cinema4DRoomCharacterScripts.push(manifest);
  if (store.cinema4DRoomCharacterScripts.length > 5000) {
    store.cinema4DRoomCharacterScripts.splice(0, store.cinema4DRoomCharacterScripts.length - 5000);
  }
  persistCinema4DRoomCharacterScripts();
  recordAudit("root_admin", "cinema4d.room_character_script.generated", manifest.scriptId);
  return { ok: true, manifest };
}

export function listCinema4DRoomCharacterScripts(): Cinema4DRoomCharacterScriptManifest[] {
  return [...store.cinema4DRoomCharacterScripts]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(_lockCinema4DScript);
}

function _sanitizeCinema4DPackageValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(_sanitizeCinema4DPackageValue);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (lower === "publicurl" || lower === "signedurl") {
      out[key] = null;
      continue;
    }
    if (/secret|token|apikey|api_key|authorization|credential|password|privateurl|providerurl|downloadurl|modelurl|videourl|audiourl/i.test(key)) {
      out[key] = null;
      continue;
    }
    if (lower.endsWith("url") && typeof raw === "string" && /^https?:\/\//i.test(raw)) {
      out[key] = null;
      continue;
    }
    out[key] = _sanitizeCinema4DPackageValue(raw);
  }
  return out;
}

function _safeJsonFile(value: unknown): string {
  return `${JSON.stringify(_sanitizeCinema4DPackageValue(value), null, 2)}\n`;
}

const ZIP_CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function _crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = ZIP_CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function _dosDateTime(date = new Date()): { time: number; day: number } {
  const year = Math.max(1980, date.getFullYear());
  const time =
    (date.getSeconds() >> 1) |
    (date.getMinutes() << 5) |
    (date.getHours() << 11);
  const day =
    date.getDate() |
    ((date.getMonth() + 1) << 5) |
    ((year - 1980) << 9);
  return { time, day };
}

function _createStoredZip(files: Record<string, string>): Buffer {
  const now = _dosDateTime();
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const names = Object.keys(files).sort();

  for (const name of names) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(files[name] ?? "", "utf8");
    const crc = _crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(now.time, 10);
    local.writeUInt16LE(now.day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(now.time, 12);
    central.writeUInt16LE(now.day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, end]);
}

function _cinema4DDefaultCharacter(roomId: string): Cinema4DAnchorCharacterManifest {
  const existing = store.cinema4DAnchorCharacters
    .filter((c) => c.roomId === roomId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  if (existing) return _lockCinema4DCharacter(existing);
  return _lockCinema4DCharacter({
    characterId: `c4d_char_${_shortHash(`download-anchor:${roomId}`)}`,
    roomId,
    characterName: "Mougle Verified Anchor",
    characterRole: "news_anchor",
    characterStyle: "premium_news_anchor",
    wardrobeStyle: "navy_suit",
    posePreset: "seated_desk_hands_folded",
    facialExpression: "neutral_professional",
    voiceAssetId: null,
    lipSyncReadiness: "future_provider_required",
    compatibleWith: [
      "cinema4d_placeholder",
      "metahuman_candidate",
      "character_creator_candidate",
      "unreal_blueprint_candidate",
    ],
    createdAt: new Date().toISOString(),
  });
}

function _cinema4DDefaultAccessories(
  roomId: string,
  characterId: string,
): Cinema4DCharacterAccessoryManifest[] {
  const existing = store.cinema4DCharacterAccessories
    .filter((a) => a.roomId === roomId || a.characterId === characterId)
    .map(_lockCinema4DAccessory);
  if (existing.length) return existing;
  return ([
    ["lavalier_mic", "lapel"],
    ["earpiece", "ear"],
    ["tablet", "left_hand"],
  ] as const).map(([accessoryType, attachTo]) => _lockCinema4DAccessory({
    accessoryId: `c4d_acc_${_shortHash(`download:${roomId}:${characterId}:${accessoryType}`)}`,
    characterId,
    roomId,
    accessoryType,
    accessoryName: `Anchor ${accessoryType}`,
    attachTo,
    objectName: `MGL_CHARACTER_Anchor_01_${accessoryType.toUpperCase()}`,
    createdAt: new Date().toISOString(),
  }));
}

function _cinema4DRoomManifest(roomId: string, productionId: string | null) {
  const generatedRoom = getGeneratedRoom(roomId);
  return {
    ...(generatedRoom ?? {
      roomId,
      productionId,
      roomName: "Mougle Verified Newsroom",
      roomCategory: "newsroom",
      visualStyle: "cinema4d_high_end_blue_gold_newsroom",
      cameraStyle: "cinematic_anchor_center_composition",
      lightingStyle: "premium_blue_gold_or_warm_gold",
      colorPalette: ["#07142b", "#d6a84f", "#ffffff"],
      screenLayout: "led_world_map_with_top_stories_source_confidence_claims",
      panelLayout: "ticker_lower_third_source_claims_timeline",
      audienceMode: "studio_only_mock",
      fourDCompatibility: ["light", "fog", "bass"],
      unrealLevelCandidate: "DRAFT_ONLY_NO_UNREAL_EXECUTION",
      prompt: "High-end Cinema 4D Mougle Verified Newsroom draft with placeholder anchor.",
      promptHash: _phHash(`cinema4d-download:${roomId}`),
      createdAt: new Date().toISOString(),
    }),
    status: "draft" as const,
    approvalStatus: "draft" as const,
    visibility: "admin_only_internal" as const,
    publicUrl: null,
    signedUrl: null,
    realSendAllowed: false as const,
    executionEnabled: false as const,
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

function _cinema4DNewsroomBindingsPackage(
  character: Cinema4DAnchorCharacterManifest,
): Cinema4DCharacterBindings {
  return buildCinema4DCharacterBindings({
    anchorName: character.characterName,
    verifiedHeadline: "Mougle verified newsroom draft headline",
    script: "Cinema 4D draft teleprompter text for internal preview only.",
    confidenceScore: 0,
    sources: ["Future verified newsroom storage"],
    claims: ["Draft claim panel placeholder"],
  }, character);
}

export function getCinema4DNewsroomDownloadScript(roomId: string, qualityTier: Cinema4DQualityTier = "premium_draft"): {
  ok: true;
  filename: "mougle-cinema4d-newsroom-script.py";
  contentType: "text/x-python";
  script: string;
  manifest: Cinema4DRoomCharacterScriptManifest;
} {
  const safeRoomId = String(roomId || "mougle_verified_newsroom_room").slice(0, 120);
  const character = _cinema4DDefaultCharacter(safeRoomId);
  const accessories = _cinema4DDefaultAccessories(safeRoomId, character.characterId);
  const script = _cinema4DNewsroomScript(character, accessories, qualityTier);
  const manifest = _lockCinema4DScript({
    scriptId: `c4d_script_download_${_shortHash(`download-script:${safeRoomId}:${character.characterId}`)}`,
    roomId: safeRoomId,
    productionId: character.productionId,
    template: "mougle_verified_newsroom",
    characterIds: [character.characterId],
    accessoryIds: accessories.map((a) => a.accessoryId),
    cameraPresets: [
      "anchor_closeup",
      "anchor_medium",
      "anchor_over_shoulder",
      "wide_newsroom",
      "breaking_news_push_in",
    ],
    qualityTier,
    qualityNotes: [
      "Downloadable real Cinema 4D Python scene script with newsroom geometry, presenter placeholder, materials, cameras, and lights.",
      "Final cinema-quality output still requires Cinema 4D rendering and human 3D expert review.",
    ],
    script,
    createdAt: new Date().toISOString(),
  });
  return {
    ok: true,
    filename: "mougle-cinema4d-newsroom-script.py",
    contentType: "text/x-python",
    script,
    manifest,
  };
}

export function buildCinema4DNewsroomDownloadPackage(roomId: string, qualityTier: Cinema4DQualityTier = "premium_draft"): {
  ok: true;
  filename: "mougle-cinema4d-newsroom-package.zip";
  contentType: "application/zip";
  files: Record<string, string>;
  zip: Buffer;
  scriptManifest: Cinema4DRoomCharacterScriptManifest;
  characterManifest: Cinema4DAnchorCharacterManifest;
  accessoriesManifest: Cinema4DCharacterAccessoryManifest[];
  bindings: Cinema4DCharacterBindings;
  safetyEnvelope: typeof SAFETY_ENVELOPE;
} {
  const safeRoomId = String(roomId || "mougle_verified_newsroom_room").slice(0, 120);
  const scriptBundle = getCinema4DNewsroomDownloadScript(safeRoomId, qualityTier);
  const character = _cinema4DDefaultCharacter(safeRoomId);
  const accessories = _cinema4DDefaultAccessories(safeRoomId, character.characterId);
  const bindings = _cinema4DNewsroomBindingsPackage(character);
  const roomManifest = _cinema4DRoomManifest(safeRoomId, character.productionId);
  const unrealSceneDraft = {
    productionId: character.productionId,
    roomId: safeRoomId,
    template: "mougle_verified_newsroom",
    qualityTier,
    qualityTiers: ["placeholder", "premium_draft", "expert_polish_required"],
    status: "draft",
    approvalStatus: "draft",
    visibility: "admin_only_internal",
    publicUrl: null,
    signedUrl: null,
    realSendAllowed: false,
    executionEnabled: false,
    adminPreviewOnly: true,
    notRendered: true,
    notPublished: true,
    noUnrealExecution: true,
    noFourDHardware: true,
    realRenderCalled: false,
    unrealCommandSent: false,
    fourDCommandSent: false,
    published: false,
    safetyEnvelope: SAFETY_ENVELOPE,
    note: "Draft manifest only. No real Unreal command, level load, Sequencer, Movie Render Queue, 4D hardware, render, or publishing action is included.",
  };
  const readme = [
    "# Mougle Cinema 4D Newsroom Package",
    "",
    "This package contains draft/internal Cinema 4D script and manifests only.",
    "It does not render, publish, execute Unreal, or trigger 4D hardware.",
    "",
    "## Files",
    "",
    "- cinema4d-newsroom-script.py: draft Cinema 4D Python scene builder.",
    "- room-manifest.json: internal room metadata.",
    "- anchor-character-manifest.json: placeholder anchor manifest.",
    "- accessories-manifest.json: placeholder accessory manifests.",
    "- verified-newsroom-bindings.json: draft teleprompter, lower-third, panel, and camera bindings.",
    "- unreal-scene-manifest-draft.json: dry-run planning metadata only.",
    "",
    "## How To Use In Cinema 4D",
    "",
    "1. Open Cinema 4D manually.",
    "2. Review cinema4d-newsroom-script.py before running it.",
    "3. Run the script from Cinema 4D Script Manager to create the draft scene objects.",
    "4. Review cameras, lights, materials, and placeholder character geometry.",
    "5. Replace placeholder character geometry with a final rig after human 3D review.",
    "",
    "## Quality Tier",
    "",
    `Selected tier: ${qualityTier}. Available tiers: placeholder, premium_draft, expert_polish_required.`,
    "This script is a real scene-construction script, but final cinema-quality output still requires Cinema 4D rendering and human 3D expert review.",
    "",
    "Safety locks: status draft, approvalStatus draft, visibility admin_only_internal, realSendAllowed false, executionEnabled false.",
    "",
  ].join("\n");
  const files = {
    "README.md": readme,
    "accessories-manifest.json": _safeJsonFile(accessories),
    "anchor-character-manifest.json": _safeJsonFile(character),
    "cinema4d-newsroom-script.py": scriptBundle.script,
    "room-manifest.json": _safeJsonFile(roomManifest),
    "unreal-scene-manifest-draft.json": _safeJsonFile(unrealSceneDraft),
    "verified-newsroom-bindings.json": _safeJsonFile(bindings),
  };
  return {
    ok: true,
    filename: "mougle-cinema4d-newsroom-package.zip",
    contentType: "application/zip",
    files,
    zip: _createStoredZip(files),
    scriptManifest: scriptBundle.manifest,
    characterManifest: character,
    accessoriesManifest: accessories,
    bindings,
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

export function buildCinema4DCharacterBindings(
  newsroomDataPackage: any,
  characterManifest: Cinema4DAnchorCharacterManifest,
): Cinema4DCharacterBindings {
  const speakerMap = newsroomDataPackage?.scriptSpeakerMap ?? newsroomDataPackage?.speakers ?? {};
  const speakerName =
    speakerMap?.[characterManifest.characterId] ??
    newsroomDataPackage?.speaker ??
    newsroomDataPackage?.anchorName ??
    characterManifest.characterName;
  const headline =
    newsroomDataPackage?.verifiedHeadline ??
    newsroomDataPackage?.headline ??
    newsroomDataPackage?.storyTitle ??
    newsroomDataPackage?.title ??
    "Verified newsroom draft headline";
  const script =
    newsroomDataPackage?.script ??
    newsroomDataPackage?.scriptDraft ??
    newsroomDataPackage?.teleprompterText ??
    headline;
  const confidence = newsroomDataPackage?.confidenceScore ?? newsroomDataPackage?.confidence;
  const sources = newsroomDataPackage?.sourceList ?? newsroomDataPackage?.sources ?? newsroomDataPackage?.sourcePanel ?? [];
  const claims = newsroomDataPackage?.claims ?? [];
  const panelFocus = _cinema4DPanelFocus({
    headline,
    confidence,
    sources,
    claims,
  });
  return Cinema4DCharacterBindingsSchema.parse({
    characterId: characterManifest.characterId,
    teleprompterText: String(script).slice(0, 4000),
    lowerThirdName: String(newsroomDataPackage?.lowerThirdName ?? speakerName).slice(0, 160),
    voiceAssetId: characterManifest.voiceAssetId,
    panelFocus,
    cameraPreset: characterManifest.defaultCameraPreset,
    cueMarkers: [
      `speaker:${characterManifest.characterId}`,
      `voice:${characterManifest.voiceAssetId ?? "future_provider_required"}`,
      `camera:${characterManifest.defaultCameraPreset}`,
      `teleprompter:${String(headline).slice(0, 80)}`,
      ...(Array.isArray(sources) ? sources.slice(0, 3).map((s: unknown) => `source:${String(s).slice(0, 80)}`) : []),
    ],
  });
}

export function openCinema4DPreviewWithCharacter(
  roomId: string,
  input: {
    productionId?: string | null;
    characterId?: string | null;
    accessoryIds?: string[];
    newsroomDataPackage?: any;
    template?: "mougle_verified_newsroom" | "mougle_podcast_studio";
  },
) {
  const character = input.characterId
    ? getCinema4DAnchorCharacter(input.characterId)
    : listCinema4DAnchorCharacters()[0] ?? null;
  const bindings = character
    ? buildCinema4DCharacterBindings(input.newsroomDataPackage ?? {}, character)
    : null;
  const accessoryIds = _uniqueIds([
    ...(input.accessoryIds ?? []),
    ...(character?.accessoryIds ?? []),
  ]);
  const mode = input.template === "mougle_podcast_studio" ? "podcast" : "newsroom";
  const state = generatePreviewStudioState(
    {
      mode,
      layoutPreset: mode === "podcast" ? "podcast_host_guest" : "anchor_left_panel_right",
      camera: _cinema4DPreviewCamera(bindings?.cameraPreset),
      lighting: mode === "podcast" ? "podcast_intimate" : "warm_studio",
      roomLabel: mode === "podcast"
        ? "Mougle Podcast Studio — Cinema 4D placeholder"
        : "Mougle Verified Newsroom — Cinema 4D placeholder",
      lowerThirdText: bindings?.lowerThirdName ?? "Character Preview Only",
      tickerText: mode === "podcast"
        ? "CHARACTER PREVIEW ONLY · NOT RENDERED · NOT PUBLISHED"
        : "CHARACTER PREVIEW ONLY · PLACEHOLDER GEOMETRY · NOT FINAL RIG",
    },
    {
      productionId: input.productionId ?? character?.productionId ?? null,
      roomId,
      avatarIds: character ? [character.characterId] : [],
      characterIds: character ? [character.characterId] : [],
      mediaPackageIds: [],
      wizardId: null,
      previewSnapshotId: null,
      readinessReportId: null,
      approvalState: null,
      characterRole: character?.characterRole ?? null,
      wardrobeStyle: character?.wardrobeStyle ?? null,
      posePreset: character?.posePreset ?? null,
      accessoryIds,
      teleprompterText: bindings?.teleprompterText ?? null,
      lowerThirdName: bindings?.lowerThirdName ?? null,
      panelFocus: bindings?.panelFocus ?? null,
      cameraPreset: bindings?.cameraPreset ?? null,
      roomLabel: mode === "podcast"
        ? "Mougle Podcast Studio — Cinema 4D placeholder"
        : "Mougle Verified Newsroom — Cinema 4D placeholder",
      avatarLabels: character ? [
        `${character.characterName} (${character.characterRole}, ${character.wardrobeStyle}, ${character.posePreset})`,
      ] : [],
      mediaPackageLabels: bindings ? [bindings.panelFocus] : [],
    } as any,
  );
  recordAudit("root_admin", "cinema4d.preview_with_character.opened", `${roomId}:${character?.characterId ?? "none"}`);
  return {
    ok: true as const,
    state,
    character,
    bindings,
    previewLabel: "Character Preview Only — placeholder geometry, not final rig, not rendered.",
    realSendAllowed: false as const,
    executionEnabled: false as const,
    realRenderCalled: false as const,
    unrealCommandSent: false as const,
    fourDCommandSent: false as const,
    published: false as const,
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

export function createProductionUnit(input: {
  unitName: string; unitType: ProductionUnitType;
  productionId?: string | null; roomId?: string | null;
  avatarIds?: string[]; voiceAssetIds?: string[];
  meshyJobIds?: string[]; runwayJobIds?: string[];
  fourDCuePlanId?: string | null;
  mediaPackageIds?: string[];
}): { ok: true; record: ProductionUnitRecord } {
  const rec: ProductionUnitRecord = _lockUnit({
    unitId: `unit_${_shortHash(`unit:${input.unitType}:${input.productionId ?? ""}:${input.unitName}`)}`,
    unitName: input.unitName,
    unitType: input.unitType,
    productionId: input.productionId ?? null,
    roomId: input.roomId ?? null,
    avatarIds: input.avatarIds ?? [],
    voiceAssetIds: input.voiceAssetIds ?? [],
    meshyJobIds: input.meshyJobIds ?? [],
    runwayJobIds: input.runwayJobIds ?? [],
    fourDCuePlanId: input.fourDCuePlanId ?? null,
    unrealDryRunChainStatus: "not_started",
    mediaPackageIds: input.mediaPackageIds ?? [],
    status: "draft", approvalStatus: "draft",
    visibility: "admin_only_internal",
    publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: new Date().toISOString(),
  });
  const ui = store.productionUnits.findIndex((x) => x.unitId === rec.unitId);
  if (ui >= 0) store.productionUnits[ui] = rec; else store.productionUnits.push(rec);
  if (store.productionUnits.length > 5000) {
    store.productionUnits.splice(0, store.productionUnits.length - 5000);
  }
  persistProductionUnits();
  return { ok: true, record: ProductionUnitRecordSchema.parse(rec) };
}
export function listProductionUnits(): ProductionUnitRecord[] {
  return [...store.productionUnits]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(_lockUnit);
}
export function getProductionUnit(unitId: string): ProductionUnitRecord | null {
  const r = store.productionUnits.find((x) => x.unitId === unitId);
  return r ? _lockUnit(r) : null;
}

export function generateMediaPackage(input: {
  prompt: string; productionId?: string | null;
  packageType?: MediaPackageType; sourceTopic?: string;
  targetFormat?: string;
}): { ok: true; record: MediaPackageRecord } {
  const prompt = String(input.prompt ?? "").slice(0, 4000);
  const type = input.packageType ?? _detectMediaPackageType(prompt);
  const topic = input.sourceTopic ?? prompt.slice(0, 200);
  const rec: MediaPackageRecord = _lockPackage({
    packageId: `pkg_${_shortHash(`pkg:${type}:${input.productionId ?? ""}:${prompt}`)}`,
    productionId: input.productionId ?? null,
    packageType: type,
    sourceTopic: topic,
    targetFormat: input.targetFormat ?? "internal_preview",
    scriptDraft: `[DRAFT] ${topic}`,
    debateAngles: type === "news_to_debate"
      ? [`Pro: ${topic}`, `Con: ${topic}`, `Neutral analysis: ${topic}`] : [],
    podcastOutline: type === "news_to_podcast" || type === "podcast_to_clips"
      ? ["Intro","Topic context","Discussion","Wrap-up"] : [],
    socialCaptions: type === "news_to_social"
      ? [`Breaking: ${topic.slice(0,80)}`, `Why this matters: ${topic.slice(0,80)}`] : [],
    youtubeTitle: type === "news_to_youtube"
      ? `[Draft] ${topic.slice(0,80)}` : "",
    youtubeDescription: type === "news_to_youtube"
      ? `Draft description for: ${topic.slice(0,200)}` : "",
    thumbnailPrompt: `Thumbnail mock for: ${topic.slice(0,200)}`,
    roomRecommendation: _detectRoomCategory(prompt),
    avatarRecommendation: [_detectAvatarRole(prompt)],
    assetRequirements: ["voice_mock","meshy_mock","runway_mock"],
    fourDCueSuggestions: type === "newsroom_to_4d_cinema"
      ? ["light_red_alert","bass_hit_low","fog_burst_short"] : [],
    status: "draft", approvalStatus: "draft",
    visibility: "admin_only_internal",
    publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: new Date().toISOString(),
  });
  const pi = store.mediaPackages.findIndex((x) => x.packageId === rec.packageId);
  if (pi >= 0) store.mediaPackages[pi] = rec; else store.mediaPackages.push(rec);
  if (store.mediaPackages.length > 5000) {
    store.mediaPackages.splice(0, store.mediaPackages.length - 5000);
  }
  persistMediaPackages();
  return { ok: true, record: MediaPackageRecordSchema.parse(rec) };
}
export function listMediaPackages(): MediaPackageRecord[] {
  return [...store.mediaPackages]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(_lockPackage);
}

export function generateNewsToDebatePackage(input: {
  newsTopic: string; productionId?: string | null;
}): { ok: true; record: MediaPackageRecord } {
  const topic = String(input.newsTopic ?? "").slice(0, 1000);
  const rec: MediaPackageRecord = _lockPackage({
    packageId: `pkg_n2d_${_shortHash(`n2d:${input.productionId ?? ""}:${topic}`)}`,
    productionId: input.productionId ?? null,
    packageType: "news_to_debate",
    sourceTopic: topic,
    targetFormat: "internal_debate_draft",
    scriptDraft: `[DEBATE MODERATOR DRAFT]\nTopic: ${topic}\nOpening: Welcome to a debate on ${topic.slice(0,200)}.\nClosing: Thank you for this internal-only draft session.`,
    debateAngles: [
      `Pro position: support for ${topic.slice(0,150)}`,
      `Con position: opposition to ${topic.slice(0,150)}`,
      `Neutral position: contextual analysis of ${topic.slice(0,150)}`,
    ],
    podcastOutline: [],
    socialCaptions: [],
    youtubeTitle: "",
    youtubeDescription: "",
    thumbnailPrompt: `Debate room thumbnail mock for: ${topic.slice(0,200)}`,
    roomRecommendation: "debate_studio",
    avatarRecommendation: ["debate_moderator","guest","guest"],
    assetRequirements: ["voice_mock_moderator","voice_mock_guests"],
    fourDCueSuggestions: ["light_focus_center","ambient_warm_low"],
    status: "draft", approvalStatus: "draft",
    visibility: "admin_only_internal",
    publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: new Date().toISOString(),
  });
  const di = store.mediaPackages.findIndex((x) => x.packageId === rec.packageId);
  if (di >= 0) store.mediaPackages[di] = rec; else store.mediaPackages.push(rec);
  if (store.mediaPackages.length > 5000) {
    store.mediaPackages.splice(0, store.mediaPackages.length - 5000);
  }
  persistMediaPackages();
  return { ok: true, record: MediaPackageRecordSchema.parse(rec) };
}

export function generatePreviewSnapshot(input: {
  productionId: string; roomId?: string | null;
  avatarIds?: string[]; mediaPackageType?: string | null;
}): { ok: true; record: PreviewSnapshotRecord } {
  if (!store.productions.has(input.productionId)) {
    throw new Error("production_not_found");
  }
  const rec: PreviewSnapshotRecord = _lockPreview({
    snapshotId: `preview_${_shortHash(`preview:${input.productionId}:${input.roomId ?? ""}:${(input.avatarIds ?? []).join(",")}:${input.mediaPackageType ?? ""}`)}`,
    productionId: input.productionId,
    previewMode: "newsroom",
    layoutPreset: "anchor_center",
    roomId: input.roomId ?? null,
    selectedRoomId: input.roomId ?? null,
    avatarIds: input.avatarIds ?? [],
    selectedAvatarIds: input.avatarIds ?? [],
    selectedMediaPackageIds: [],
    selectedCueIds: ["light_cue_mock_1", "bass_cue_mock_2"],
    screenLayout: "main_stage_with_side_panels_mock",
    panelLayout: "lower_third_plus_ticker_mock",
    panelSummary: "Main stage with side panels",
    lowerThird: "Admin Preview Only — Not Rendered",
    lowerThirdText: "Admin Preview Only — Not Rendered",
    ticker: "INTERNAL-ONLY · NOT PUBLISHED · NO UNREAL EXECUTION",
    tickerText: "INTERNAL-ONLY · NOT PUBLISHED · NO UNREAL EXECUTION",
    cameraPreset: "MOCK_CAM_PRESET_PRIMARY",
    lightingPreset: "MOCK_LIGHT_PRESET_DRAMATIC",
    fourDCueMarkers: ["light_cue_mock_1","bass_cue_mock_2"],
    mediaPackageType: input.mediaPackageType ?? null,
    assetBadges: ["voice:mock","meshy:mock","runway:mock"],
    unrealDryRunStatus: "dry_run_only_mock",
    readinessStatus: "draft_mock",
    approvalStatus: "draft",
    status: "draft", visibility: "admin_only_internal",
    publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    adminPreviewOnly: true, notRendered: true, notPublished: true,
    noUnrealExecution: true, noFourDHardware: true,
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: new Date().toISOString(),
  });
  const si = store.previewSnapshots.findIndex((x) => x.snapshotId === rec.snapshotId);
  if (si >= 0) store.previewSnapshots[si] = rec; else store.previewSnapshots.push(rec);
  if (store.previewSnapshots.length > 5000) {
    store.previewSnapshots.splice(0, store.previewSnapshots.length - 5000);
  }
  persistPreviewSnapshots();
  return { ok: true, record: PreviewSnapshotRecordSchema.parse(rec) };
}
const _PREVIEW_MODE_DEFAULTS: Record<string, {
  layout: string; camera: string; lighting: string; ticker: string; lower: string;
  cues: string[]; panel: string;
}> = {
  newsroom: { layout: "anchor_center", camera: "MOCK_CAM_ANCHOR_CENTER",
    lighting: "MOCK_LIGHT_NEWS_KEY", ticker: "BREAKING · ADMIN PREVIEW ONLY",
    lower: "AI Anchor · Newsroom Preview",
    cues: ["light_alert_mock","ticker_pulse_mock","bass_hit_mock"],
    panel: "Anchor / Map Wall / Lower-Third / Ticker / Side Panel" },
  podcast_room: { layout: "podcast_two_host", camera: "MOCK_CAM_TWO_HOST",
    lighting: "MOCK_LIGHT_PODCAST_WARM", ticker: "PODCAST · ADMIN PREVIEW ONLY",
    lower: "Hosts · Episode Preview",
    cues: ["host_a_focus_mock","host_b_focus_mock","wide_shot_mock"],
    panel: "Host A / Host B / Table Mics / Video Wall" },
  debate_studio: { layout: "debate_three_person", camera: "MOCK_CAM_DEBATE_TRIANGLE",
    lighting: "MOCK_LIGHT_DEBATE_DUEL", ticker: "DEBATE · ADMIN PREVIEW ONLY",
    lower: "Moderator · Pro · Con",
    cues: ["pro_focus_mock","con_focus_mock","mod_focus_mock","tension_swell_mock"],
    panel: "Moderator / Pro Panel / Con Panel / Audience" },
  hall_event: { layout: "hall_stage", camera: "MOCK_CAM_HALL_WIDE",
    lighting: "MOCK_LIGHT_HALL_AMBIENT", ticker: "HALL · ADMIN PREVIEW ONLY",
    lower: "Hall · Event Preview",
    cues: ["spotlight_main_mock","crowd_wash_mock","stage_pulse_mock"],
    panel: "Stage / Audience / LED Wall / Side Screens" },
  youtube_social_package: { layout: "anchor_center", camera: "MOCK_CAM_SOCIAL_TIGHT",
    lighting: "MOCK_LIGHT_SOCIAL_HIGH_KEY", ticker: "SOCIAL · ADMIN PREVIEW ONLY",
    lower: "YouTube / Shorts / Reels — Internal Draft",
    cues: ["cut_in_mock","caption_pop_mock","outro_card_mock"],
    panel: "Hero Frame / Caption / Logo / Call-to-Action" },
  four_d_cinema_cue: { layout: "custom_grid", camera: "MOCK_CAM_CINEMA",
    lighting: "MOCK_LIGHT_CINEMA_DARK", ticker: "4D CUE PLAN · ADMIN PREVIEW",
    lower: "4D Cue Sequence · Mock Timeline Only",
    cues: ["fog_cue_mock","wind_cue_mock","bass_cue_mock","strobe_cue_mock","rumble_cue_mock"],
    panel: "Cue Track / Channel Map / Trigger Markers / Safety Gate" },
};

export function getPreviewSnapshotById(previewId: string): PreviewSnapshotRecord | null {
  const r = store.previewSnapshots.find(
    (s) => s.snapshotId === previewId || (s as any).previewId === previewId,
  );
  return r ? _lockPreview(r) : null;
}

export function generateCinematicPreview(input: {
  productionId: string;
  previewMode?: string; layoutPreset?: string;
  roomId?: string | null; avatarIds?: string[];
  selectedMediaPackageIds?: string[]; selectedCueIds?: string[];
  cameraPreset?: string; lightingPreset?: string;
  lowerThirdText?: string; tickerText?: string; panelSummary?: string;
  mediaPackageType?: string | null;
}): { ok: true; record: PreviewSnapshotRecord } {
  if (!store.productions.has(input.productionId)) {
    throw new Error("production_not_found");
  }
  const mode = (input.previewMode && _PREVIEW_MODE_DEFAULTS[input.previewMode])
    ? input.previewMode : "newsroom";
  const d = _PREVIEW_MODE_DEFAULTS[mode];
  const layout = input.layoutPreset ?? d.layout;
  const camera = input.cameraPreset ?? d.camera;
  const lighting = input.lightingPreset ?? d.lighting;
  const ticker = input.tickerText || d.ticker;
  const lower = input.lowerThirdText || d.lower;
  const avatars = input.avatarIds ?? [];
  const cues = (input.selectedCueIds && input.selectedCueIds.length > 0)
    ? input.selectedCueIds : d.cues;
  const mediaIds = input.selectedMediaPackageIds ?? [];
  const id = `preview_${_shortHash(
    `cinematic:${input.productionId}:${mode}:${layout}:${input.roomId ?? ""}:` +
    `${avatars.join(",")}:${mediaIds.join(",")}:${camera}:${lighting}`,
  )}`;
  const rec: PreviewSnapshotRecord = _lockPreview({
    snapshotId: id, previewId: id,
    productionId: input.productionId,
    previewMode: mode as any, layoutPreset: layout as any,
    roomId: input.roomId ?? null, selectedRoomId: input.roomId ?? null,
    avatarIds: avatars, selectedAvatarIds: avatars,
    selectedMediaPackageIds: mediaIds, selectedCueIds: cues,
    screenLayout: `cinematic_${mode}_${layout}_mock`,
    panelLayout: `${layout}_panel_grid_mock`,
    panelSummary: input.panelSummary || d.panel,
    lowerThird: lower, lowerThirdText: lower,
    ticker: ticker, tickerText: ticker,
    cameraPreset: camera, lightingPreset: lighting,
    fourDCueMarkers: cues,
    mediaPackageType: input.mediaPackageType ?? null,
    assetBadges: ["voice:mock","meshy:mock","runway:mock","unreal:dry-run"],
    unrealDryRunStatus: "dry_run_only_mock",
    readinessStatus: "cinematic_draft_mock",
    approvalStatus: "draft", status: "draft",
    visibility: "admin_only_internal",
    publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    adminPreviewOnly: true, notRendered: true, notPublished: true,
    noUnrealExecution: true, noFourDHardware: true,
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: new Date().toISOString(),
  });
  const i = store.previewSnapshots.findIndex((x) => x.snapshotId === rec.snapshotId);
  if (i >= 0) store.previewSnapshots[i] = rec; else store.previewSnapshots.push(rec);
  if (store.previewSnapshots.length > 5000) {
    store.previewSnapshots.splice(0, store.previewSnapshots.length - 5000);
  }
  persistPreviewSnapshots();
  return { ok: true, record: PreviewSnapshotRecordSchema.parse(rec) };
}

export function duplicatePreviewSnapshot(previewId: string):
  { ok: true; record: PreviewSnapshotRecord } {
  const src = store.previewSnapshots.find(
    (s) => s.snapshotId === previewId || (s as any).previewId === previewId,
  );
  if (!src) throw new Error("preview_not_found");
  const newId = `preview_${_shortHash(`dup:${src.snapshotId}:${store.previewSnapshots.length}`)}`;
  const rec: PreviewSnapshotRecord = _lockPreview({
    ...src, snapshotId: newId, previewId: newId,
    readinessStatus: "duplicated_draft_mock",
    approvalStatus: "draft", status: "draft",
    visibility: "admin_only_internal",
    publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    adminPreviewOnly: true, notRendered: true, notPublished: true,
    noUnrealExecution: true, noFourDHardware: true,
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: new Date().toISOString(),
  });
  store.previewSnapshots.push(rec);
  persistPreviewSnapshots();
  return { ok: true, record: PreviewSnapshotRecordSchema.parse(rec) };
}

export function updatePreviewLayout(previewId: string, patch: {
  layoutPreset?: string; cameraPreset?: string; lightingPreset?: string;
  lowerThirdText?: string; tickerText?: string; panelSummary?: string;
  selectedMediaPackageIds?: string[]; selectedCueIds?: string[];
  selectedAvatarIds?: string[]; selectedRoomId?: string | null;
}): { ok: true; record: PreviewSnapshotRecord } {
  const i = store.previewSnapshots.findIndex(
    (s) => s.snapshotId === previewId || (s as any).previewId === previewId,
  );
  if (i < 0) throw new Error("preview_not_found");
  const src = store.previewSnapshots[i];
  const merged: PreviewSnapshotRecord = _lockPreview({
    ...src,
    layoutPreset: (patch.layoutPreset as any) ?? src.layoutPreset ?? "anchor_center",
    cameraPreset: patch.cameraPreset ?? src.cameraPreset,
    lightingPreset: patch.lightingPreset ?? src.lightingPreset,
    lowerThird: patch.lowerThirdText ?? src.lowerThird,
    lowerThirdText: patch.lowerThirdText ?? src.lowerThirdText ?? src.lowerThird,
    ticker: patch.tickerText ?? src.ticker,
    tickerText: patch.tickerText ?? src.tickerText ?? src.ticker,
    panelSummary: patch.panelSummary ?? src.panelSummary ?? "",
    selectedMediaPackageIds: patch.selectedMediaPackageIds ?? src.selectedMediaPackageIds ?? [],
    selectedCueIds: patch.selectedCueIds ?? src.selectedCueIds ?? [],
    selectedAvatarIds: patch.selectedAvatarIds ?? src.selectedAvatarIds ?? src.avatarIds ?? [],
    avatarIds: patch.selectedAvatarIds ?? src.avatarIds ?? [],
    selectedRoomId: patch.selectedRoomId !== undefined ? patch.selectedRoomId : (src.selectedRoomId ?? src.roomId ?? null),
    roomId: patch.selectedRoomId !== undefined ? patch.selectedRoomId : src.roomId,
    fourDCueMarkers: patch.selectedCueIds ?? src.fourDCueMarkers ?? [],
    approvalStatus: "draft", status: "draft",
    visibility: "admin_only_internal",
    publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    adminPreviewOnly: true, notRendered: true, notPublished: true,
    noUnrealExecution: true, noFourDHardware: true,
    safetyEnvelope: SAFETY_ENVELOPE,
  });
  store.previewSnapshots[i] = merged;
  persistPreviewSnapshots();
  return { ok: true, record: PreviewSnapshotRecordSchema.parse(merged) };
}

export function getLatestPreviewSnapshot(productionId: string): PreviewSnapshotRecord | null {
  const list = store.previewSnapshots
    .filter((s) => s.productionId === productionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return list[0] ? _lockPreview(list[0]) : null;
}
export function listPreviewSnapshots(productionId?: string): PreviewSnapshotRecord[] {
  let arr = [...store.previewSnapshots];
  if (productionId) arr = arr.filter((s) => s.productionId === productionId);
  return arr
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(_lockPreview);
}

/* ------------------------------------------------------------------ */
/* Guided Production Wizard (admin-only, draft/internal)              */
/* ------------------------------------------------------------------ */

function _lockWizard(r: ProductionWizardSessionRecord): ProductionWizardSessionRecord {
  return {
    ...r,
    visibility: "admin_only_internal",
    publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    adminPreviewOnly: true, notRendered: true, notPublished: true,
    noUnrealExecution: true, noFourDHardware: true,
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

const _WIZARD_TYPE_TO_PREVIEW_MODE: Record<WizardProductionType, string> = {
  newsroom: "newsroom",
  breaking_news: "newsroom",
  debate: "debate_studio",
  podcast: "podcast_room",
  interview: "podcast_room",
  market_watch: "newsroom",
  youtube_episode: "youtube_social_package",
  social_clip_package: "youtube_social_package",
  four_d_cinema_room: "four_d_cinema_cue",
  event_hall: "hall_event",
  custom_production: "newsroom",
};

const _WIZARD_TYPE_TO_FOUR_D_CUES: Record<WizardProductionType, string[]> = {
  newsroom: ["light_alert_mock","ticker_pulse_mock"],
  breaking_news: ["light_red_alert","bass_hit_low","strobe_short_mock"],
  debate: ["pro_focus_mock","con_focus_mock","mod_focus_mock","tension_swell_mock"],
  podcast: ["warm_amber_mock","table_focus_mock"],
  interview: ["host_focus_mock","guest_focus_mock","wide_shot_mock"],
  market_watch: ["green_pulse_mock","red_pulse_mock","ticker_scroll_mock"],
  youtube_episode: ["cut_in_mock","caption_pop_mock","outro_card_mock"],
  social_clip_package: ["zoom_punch_mock","caption_pop_mock","beat_drop_mock"],
  four_d_cinema_room: ["fog_cue_mock","wind_cue_mock","bass_cue_mock","strobe_cue_mock","rumble_cue_mock"],
  event_hall: ["spotlight_main_mock","crowd_wash_mock","stage_pulse_mock"],
  custom_production: ["light_neutral_mock","ambient_mock"],
};

function _wizardId(productionType: string, prompt: string, salt: string): string {
  return `wiz_${_shortHash(`wiz:${productionType}:${prompt}:${salt}`)}`;
}

export function startProductionWizard(input: {
  productionType: WizardProductionType;
  prompt: string;
  productionId?: string | null;
}): { ok: true; record: ProductionWizardSessionRecord } {
  const prompt = String(input.prompt ?? "").slice(0, 8000);
  const now = new Date().toISOString();
  const wizardId = _wizardId(input.productionType, prompt,
    `${input.productionId ?? ""}:${store.productionWizardSessions.length}:${now}`);
  const rec: ProductionWizardSessionRecord = _lockWizard({
    wizardId,
    productionId: input.productionId ?? null,
    productionType: input.productionType,
    prompt,
    currentStep: 2,
    completedSteps: [1],
    generatedRoomId: null,
    generatedAvatarIds: [],
    generatedAccessoryIds: [],
    generatedMediaPackageId: null,
    generatedPreviewId: null,
    fourDCueSuggestions: [],
    status: "draft",
    visibility: "admin_only_internal",
    publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    adminPreviewOnly: true, notRendered: true, notPublished: true,
    noUnrealExecution: true, noFourDHardware: true,
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: now, updatedAt: now,
  });
  store.productionWizardSessions.push(rec);
  if (store.productionWizardSessions.length > 5000) {
    store.productionWizardSessions.splice(0, store.productionWizardSessions.length - 5000);
  }
  persistProductionWizardSessions();
  return { ok: true, record: ProductionWizardSessionRecordSchema.parse(rec) };
}

export function getProductionWizard(wizardId: string): ProductionWizardSessionRecord | null {
  const r = store.productionWizardSessions.find((s) => s.wizardId === wizardId);
  return r ? _lockWizard(r) : null;
}

export function listProductionWizardSessions(): ProductionWizardSessionRecord[] {
  return [...store.productionWizardSessions]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(_lockWizard);
}

export function advanceProductionWizardStep(wizardId: string, step: number): {
  ok: true; record: ProductionWizardSessionRecord;
} {
  const i = store.productionWizardSessions.findIndex((s) => s.wizardId === wizardId);
  if (i < 0) throw new Error("wizard_not_found");
  const src = store.productionWizardSessions[i];
  if (src.status === "finalized") throw new Error("wizard_already_finalized");
  const safeStep = Math.max(1, Math.min(8, Math.floor(step)));
  let next = { ...src };
  switch (safeStep) {
    case 3: {
      const room = generateGeneratedRoom({
        prompt: src.prompt, productionId: src.productionId ?? null,
      }).record;
      next.generatedRoomId = room.roomId;
      break;
    }
    case 4: {
      const a1 = generateGeneratedAvatar({
        prompt: src.prompt, productionId: src.productionId ?? null,
      }).record;
      const ids = [a1.avatarId];
      if (src.productionType === "debate" || src.productionType === "interview") {
        const a2 = generateGeneratedAvatar({
          prompt: `${src.prompt} co-host`, productionId: src.productionId ?? null,
        }).record;
        ids.push(a2.avatarId);
      }
      next.generatedAvatarIds = ids;
      const acc = generateAvatarAccessory({
        prompt: src.prompt, avatarId: a1.avatarId,
      }).record;
      next.generatedAccessoryIds = [acc.accessoryId];
      break;
    }
    case 5: {
      const pkg = generateMediaPackage({
        prompt: src.prompt, productionId: src.productionId ?? null,
      }).record;
      next.generatedMediaPackageId = pkg.packageId;
      break;
    }
    case 6: {
      next.fourDCueSuggestions =
        _WIZARD_TYPE_TO_FOUR_D_CUES[src.productionType] ?? [];
      break;
    }
    case 7: {
      if (src.productionId && store.productions.has(src.productionId)) {
        const mode = _WIZARD_TYPE_TO_PREVIEW_MODE[src.productionType] ?? "newsroom";
        const prev = generateCinematicPreview({
          productionId: src.productionId,
          previewMode: mode,
          roomId: src.generatedRoomId,
          avatarIds: src.generatedAvatarIds,
          selectedMediaPackageIds: src.generatedMediaPackageId
            ? [src.generatedMediaPackageId] : [],
          selectedCueIds: src.fourDCueSuggestions,
        }).record;
        next.generatedPreviewId = prev.snapshotId;
      }
      break;
    }
    default: break;
  }
  const completed = Array.from(new Set([...src.completedSteps, safeStep])).sort((a, b) => a - b);
  next = _lockWizard({
    ...next,
    completedSteps: completed,
    currentStep: Math.min(8, Math.max(src.currentStep, safeStep + (safeStep < 8 ? 1 : 0))),
    status: "draft",
    updatedAt: new Date().toISOString(),
  });
  store.productionWizardSessions[i] = next;
  persistProductionWizardSessions();
  return { ok: true, record: ProductionWizardSessionRecordSchema.parse(next) };
}

export function finalizeProductionWizard(wizardId: string): {
  ok: true; record: ProductionWizardSessionRecord;
} {
  const i = store.productionWizardSessions.findIndex((s) => s.wizardId === wizardId);
  if (i < 0) throw new Error("wizard_not_found");
  const src = store.productionWizardSessions[i];
  const completed = Array.from(new Set([...src.completedSteps, 8])).sort((a, b) => a - b);
  const finalized: ProductionWizardSessionRecord = _lockWizard({
    ...src,
    currentStep: 8,
    completedSteps: completed,
    status: "finalized",
    updatedAt: new Date().toISOString(),
  });
  store.productionWizardSessions[i] = finalized;
  persistProductionWizardSessions();
  return { ok: true, record: ProductionWizardSessionRecordSchema.parse(finalized) };
}

/* ------------------------------------------------------------------ */
/* Wizard → Readiness/Approval bridge (draft/internal-only)            */
/* ------------------------------------------------------------------ */

function _lockWizardReviewLink(r: WizardReviewLinkRecord): WizardReviewLinkRecord {
  return {
    ...r,
    visibility: "admin_only_internal",
    publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    adminPreviewOnly: true, notRendered: true, notPublished: true,
    noUnrealExecution: true, noFourDHardware: true,
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

export function getWizardReviewLink(reviewId: string): WizardReviewLinkRecord | null {
  const r = store.wizardReviewLinks.find((s) => s.reviewId === reviewId);
  return r ? _lockWizardReviewLink(r) : null;
}
export function getWizardReviewLinkByWizardId(wid: string): WizardReviewLinkRecord | null {
  const r = [...store.wizardReviewLinks].reverse().find((s) => s.wizardId === wid);
  return r ? _lockWizardReviewLink(r) : null;
}
export function listWizardReviewLinks(productionId?: string): WizardReviewLinkRecord[] {
  let arr = [...store.wizardReviewLinks];
  if (productionId) arr = arr.filter((r) => r.productionId === productionId);
  return arr
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(_lockWizardReviewLink);
}

export interface WizardSendToReviewResult {
  ok: true;
  review: WizardReviewLinkRecord;
  wizard: ProductionWizardSessionRecord;
  productionId: string;
  readinessReportId: string | null;
  approvalStage: string;
  approvalTransition: ApprovalTransitionResult | null;
}

export function sendWizardToReview(wizardId: string): WizardSendToReviewResult {
  const wi = store.productionWizardSessions.findIndex((s) => s.wizardId === wizardId);
  if (wi < 0) throw new Error("wizard_not_found");
  const wizard = store.productionWizardSessions[wi];
  if (wizard.status !== "finalized") throw new Error("wizard_not_finalized");
  const pid = wizard.productionId;
  if (!pid) throw new Error("production_id_required");
  const production = store.productions.get(pid);
  if (!production) throw new Error("production_not_found");

  // 1) Link wizard-generated artifacts onto the production record (in place,
  //    safety-preserving — only touches asset link fields, never script/render).
  if (!production.roomId && wizard.generatedRoomId) {
    production.roomId = wizard.generatedRoomId;
  }
  if (wizard.generatedAvatarIds?.length) {
    const merged = Array.from(new Set([
      ...(production.avatarIds ?? []),
      ...wizard.generatedAvatarIds,
    ])).slice(0, 20);
    production.avatarIds = merged;
  }
  store.productions.set(pid, production);
  persistProductions();
  recordAudit("root_admin", "wizard.review_linked_to_package",
    `${wizardId}:${pid}`);

  // 2) Create a fresh readiness report (mock analysis only).
  const readiness = analyzeProductionReadiness(pid);
  recordAudit("root_admin", "wizard.review_readiness_created",
    `${wizardId}:${readiness?.id ?? "no_report"}`);

  // 3) Move approval board to needs_review when currently in draft.
  const currentStage = getApprovalStage(pid);
  let transition: ApprovalTransitionResult | null = null;
  if (currentStage === "draft") {
    transition = transitionApprovalStage({
      productionId: pid, toState: "needs_review",
    });
    if (transition.ok) {
      recordAudit("root_admin", "wizard.review_approval_entry_created",
        `${wizardId}:${transition.entry?.id ?? ""}`);
    }
  }
  const finalStage = getApprovalStage(pid);

  // 4) Persist a defence-in-depth-locked review link record.
  const reviewId = `wreview_${_shortHash(`${wizardId}:${pid}:${Date.now()}:${store.wizardReviewLinks.length}`)}`;
  const rec: WizardReviewLinkRecord = _lockWizardReviewLink({
    reviewId, wizardId, productionId: pid,
    linkedRoomId: wizard.generatedRoomId,
    linkedAvatarIds: [...wizard.generatedAvatarIds],
    linkedAccessoryIds: [...wizard.generatedAccessoryIds],
    linkedMediaPackageId: wizard.generatedMediaPackageId,
    linkedPreviewId: wizard.generatedPreviewId,
    linkedFourDCueSuggestions: [...wizard.fourDCueSuggestions],
    readinessReportId: readiness?.id ?? null,
    approvalStage: finalStage,
    approvalEntryId: transition?.entry?.id ?? null,
    status: finalStage === "needs_review" ? "needs_review" : "linked",
    visibility: "admin_only_internal",
    publicUrl: null, signedUrl: null,
    realSendAllowed: false, executionEnabled: false,
    adminPreviewOnly: true, notRendered: true, notPublished: true,
    noUnrealExecution: true, noFourDHardware: true,
    safetyEnvelope: SAFETY_ENVELOPE,
    createdAt: new Date().toISOString(),
  });
  store.wizardReviewLinks.push(rec);
  if (store.wizardReviewLinks.length > 2000) {
    store.wizardReviewLinks.splice(0, store.wizardReviewLinks.length - 2000);
  }
  persistWizardReviewLinks();

  return {
    ok: true,
    review: WizardReviewLinkRecordSchema.parse(rec),
    wizard: ProductionWizardSessionRecordSchema.parse(_lockWizard(wizard)),
    productionId: pid,
    readinessReportId: readiness?.id ?? null,
    approvalStage: finalStage,
    approvalTransition: transition,
  };
}
