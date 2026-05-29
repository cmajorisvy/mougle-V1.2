/**
 * Mougle AI Production House — pluggable storage adapter.
 *
 * SAFETY:
 *   - This module only persists structural Production House data
 *     (productions / rooms / avatars / cues / render-job records /
 *     audit logs / manifest snapshots). It NEVER reads or writes
 *     environment variables, secrets, API keys, or anything outside the
 *     allow-listed collections.
 *   - The file adapter writes JSON to a local directory; it does NOT open
 *     any network socket and does NOT call the database. Postgres-backed
 *     persistence is a separate, explicitly-approved future task.
 *   - The in-memory adapter is the test / fallback implementation.
 */

import * as fs from "fs";
import * as path from "path";
import type {
  AuditLog,
  Avatar,
  FourDCue,
  Hall,
  NewsroomProduction,
  Podcast,
  Production,
  RenderJob,
  Room,
  UnrealCommand,
  UnrealSandboxCommand,
  LocalBridgeStubJob,
  FourDSandboxJob,
  ReadinessReport,
  ApprovalHistoryEntry,
  ApprovalStage,
  RealUnrealHandshakeRecord,
  RealUnrealDryRunValidationRecord,
  RealUnrealHealthCheckRecord,
  RealUnrealPrepareSceneRecord,
  RealUnrealSetCameraRecord,
  RealUnrealSetLightingRecord,
  RealUnrealSetPanelsRecord,
  RealUnrealRenderPreviewContractRecord,
  RealUnrealCommandApprovalRecord,
  RealUnrealLevelLoadContractRecord,
  RealUnrealSafetySwitchReport,
  RealUnrealMigrationPlanRecord,
  GeneratedRoomRecord,
  GeneratedAvatarRecord,
  AvatarAccessoryRecord,
  ProductionUnitRecord,
  MediaPackageRecord,
  PreviewSnapshotRecord,
  Cinema4DAnchorCharacterManifest,
  Cinema4DCharacterAccessoryManifest,
  Cinema4DRoomCharacterScriptManifest,
  PreviewStudioState,
  PreviewStudioEditArtifact,
  VoiceAsset,
  AssetJob,
  VideoJob,
} from "../../shared/production-house";

export type CollectionName =
  | "rooms"
  | "avatars"
  | "halls"
  | "podcasts"
  | "newsroomProductions"
  | "productions"
  | "fourDCues"
  | "renderJobs"
  | "voiceAssets"
  | "assetJobs"
  | "videoJobs"
  | "unrealSandboxCommands"
  | "localBridgeStubJobs"
  | "fourDSandboxJobs"
  | "readinessReports"
  | "approvalHistory"
  | "approvalStates"
  | "realUnrealHandshakeHistory"
  | "realUnrealDryRunValidationHistory"
  | "realUnrealHealthCheckHistory"
  | "realUnrealPrepareSceneDryRunHistory"
  | "realUnrealSetCameraDryRunHistory"
  | "realUnrealSetLightingDryRunHistory"
  | "realUnrealSetPanelsDryRunHistory"
  | "realUnrealRenderPreviewContractHistory"
  | "realUnrealCommandApprovalRequests"
  | "realUnrealLevelLoadContracts"
  | "realUnrealSafetySwitchReports"
  | "realUnrealMigrationPlans"
  | "generatedRooms"
  | "generatedAvatars"
  | "avatarAccessories"
  | "productionUnits"
  | "mediaPackages"
  | "previewSnapshots"
  | "cinema4DAnchorCharacters"
  | "cinema4DCharacterAccessories"
  | "cinema4DRoomCharacterScripts"
  | "productionWizardSessions"
  | "wizardReviewLinks"
  | "previewStudioStates"
  | "previewStudioEditArtifacts";

export interface ManifestSnapshot {
  productionId: string;
  savedAt: string;
  production: unknown;
  unrealScene: unknown;
  avatars: unknown[];
  fourDCues: unknown;
}

export interface PersistedState {
  rooms: Room[];
  avatars: Avatar[];
  halls: Hall[];
  podcasts: Podcast[];
  newsroomProductions: NewsroomProduction[];
  productions: Production[];
  fourDCues: FourDCue[];
  renderJobs: RenderJob[];
  unrealCommands: UnrealCommand[];
  auditLogs: AuditLog[];
  voiceAssets: VoiceAsset[];
  assetJobs: AssetJob[];
  videoJobs: VideoJob[];
  unrealSandboxCommands: UnrealSandboxCommand[];
  localBridgeStubJobs: LocalBridgeStubJob[];
  fourDSandboxJobs: FourDSandboxJob[];
  readinessReports: ReadinessReport[];
  approvalHistory: ApprovalHistoryEntry[];
  approvalStates: Array<{ productionId: string; stage: ApprovalStage }>;
  realUnrealHandshakeHistory: RealUnrealHandshakeRecord[];
  realUnrealDryRunValidationHistory: RealUnrealDryRunValidationRecord[];
  realUnrealHealthCheckHistory: RealUnrealHealthCheckRecord[];
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
  productionWizardSessions: any[];
  wizardReviewLinks: any[];
  previewStudioStates: PreviewStudioState[];
  previewStudioEditArtifacts: PreviewStudioEditArtifact[];
}

export interface ProductionHouseStorage {
  readonly kind: "file" | "memory";
  readonly location: string;
  /**
   * Internal-only directory for raw voice/audio binaries. Always lives under the
   * storage root. Files written here are never served publicly (no public/signed
   * URLs are ever created for them).
   */
  readonly voiceAssetDir: string;
  /** Internal-only directory for 3D asset binaries (Meshy/mock). Never served publicly. */
  readonly meshyAssetDir: string;
  /** Internal-only directory for video binaries (Runway/mock). Never served publicly. */
  readonly runwayVideoDir: string;
  loadAll(): PersistedState;
  saveCollection(name: CollectionName, items: any[]): void;
  saveUnrealCommands(items: UnrealCommand[]): void;
  saveAuditLogs(items: AuditLog[]): void;
  saveManifestSnapshot(snap: ManifestSnapshot): void;
  getManifestSnapshot(productionId: string): ManifestSnapshot | null;
  listManifestSnapshots(): ManifestSnapshot[];
  /** Persist a voice binary internally; returns the absolute file path. */
  writeVoiceBinary(filename: string, data: Buffer | Uint8Array | string): string;
  /** Persist a 3D asset binary internally; returns the absolute file path. */
  writeMeshyBinary(filename: string, data: Buffer | Uint8Array | string): string;
  /** Persist a video binary internally; returns the absolute file path. */
  writeRunwayBinary(filename: string, data: Buffer | Uint8Array | string): string;
}

/* ------------------------------------------------------------------ */
export class MemoryProductionHouseStorage implements ProductionHouseStorage {
  readonly kind = "memory" as const;
  readonly location = "memory://production-house";
  readonly voiceAssetDir = "memory://production-house/assets/voice";
  readonly meshyAssetDir = "memory://production-house/assets/meshy";
  readonly runwayVideoDir = "memory://production-house/assets/video";
  private snaps = new Map<string, ManifestSnapshot>();
  private voiceBlobs = new Map<string, Buffer>();
  private meshyBlobs = new Map<string, Buffer>();
  private runwayBlobs = new Map<string, Buffer>();
  loadAll(): PersistedState {
    return {
      rooms: [],
      avatars: [],
      halls: [],
      podcasts: [],
      newsroomProductions: [],
      productions: [],
      fourDCues: [],
      renderJobs: [],
      unrealCommands: [],
      auditLogs: [],
      voiceAssets: [],
      assetJobs: [],
      videoJobs: [],
      unrealSandboxCommands: [],
      localBridgeStubJobs: [],
      fourDSandboxJobs: [],
      readinessReports: [],
      approvalHistory: [],
      approvalStates: [],
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
      productionWizardSessions: [],
      wizardReviewLinks: [],
      realUnrealHealthCheckHistory: [],
      previewStudioStates: [],
      previewStudioEditArtifacts: [],
    };
  }
  saveCollection(_name: CollectionName, _items: any[]): void {}
  saveUnrealCommands(_items: UnrealCommand[]): void {}
  saveAuditLogs(_items: AuditLog[]): void {}
  saveManifestSnapshot(s: ManifestSnapshot): void {
    this.snaps.set(s.productionId, s);
  }
  getManifestSnapshot(id: string): ManifestSnapshot | null {
    return this.snaps.get(id) ?? null;
  }
  listManifestSnapshots(): ManifestSnapshot[] {
    return [...this.snaps.values()];
  }
  writeVoiceBinary(filename: string, data: Buffer | Uint8Array | string): string {
    const buf = Buffer.isBuffer(data)
      ? data
      : typeof data === "string"
      ? Buffer.from(data, "utf-8")
      : Buffer.from(data);
    const fakePath = `${this.voiceAssetDir}/${filename}`;
    this.voiceBlobs.set(fakePath, buf);
    return fakePath;
  }
  writeMeshyBinary(filename: string, data: Buffer | Uint8Array | string): string {
    const buf = Buffer.isBuffer(data)
      ? data
      : typeof data === "string"
      ? Buffer.from(data, "utf-8")
      : Buffer.from(data);
    const fakePath = `${this.meshyAssetDir}/${filename}`;
    this.meshyBlobs.set(fakePath, buf);
    return fakePath;
  }
  writeRunwayBinary(filename: string, data: Buffer | Uint8Array | string): string {
    const buf = Buffer.isBuffer(data)
      ? data
      : typeof data === "string"
      ? Buffer.from(data, "utf-8")
      : Buffer.from(data);
    const fakePath = `${this.runwayVideoDir}/${filename}`;
    this.runwayBlobs.set(fakePath, buf);
    return fakePath;
  }
}

/* ------------------------------------------------------------------ */
export class FileProductionHouseStorage implements ProductionHouseStorage {
  readonly kind = "file" as const;
  readonly location: string;
  readonly voiceAssetDir: string;
  readonly meshyAssetDir: string;
  readonly runwayVideoDir: string;
  private snapsDir: string;

  constructor(dir: string) {
    this.location = dir;
    this.snapsDir = path.join(dir, "manifest-snapshots");
    this.voiceAssetDir = path.join(dir, "assets", "voice");
    this.meshyAssetDir = path.join(dir, "assets", "meshy");
    this.runwayVideoDir = path.join(dir, "assets", "video");
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(this.snapsDir, { recursive: true });
    fs.mkdirSync(this.voiceAssetDir, { recursive: true });
    fs.mkdirSync(this.meshyAssetDir, { recursive: true });
    fs.mkdirSync(this.runwayVideoDir, { recursive: true });
  }

  private readJson<T>(name: string, fallback: T): T {
    const p = path.join(this.location, `${name}.json`);
    try {
      if (!fs.existsSync(p)) return fallback;
      const raw = fs.readFileSync(p, "utf-8");
      return JSON.parse(raw) as T;
    } catch (e) {
      console.warn(
        `[production-house-storage] failed to read ${name}:`,
        (e as Error).message,
      );
      return fallback;
    }
  }

  private writeJsonAtomic(filePath: string, data: unknown): void {
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmp, filePath);
  }

  loadAll(): PersistedState {
    return {
      rooms: this.readJson<Room[]>("rooms", []),
      avatars: this.readJson<Avatar[]>("avatars", []),
      halls: this.readJson<Hall[]>("halls", []),
      podcasts: this.readJson<Podcast[]>("podcasts", []),
      newsroomProductions: this.readJson<NewsroomProduction[]>(
        "newsroomProductions",
        [],
      ),
      productions: this.readJson<Production[]>("productions", []),
      fourDCues: this.readJson<FourDCue[]>("fourDCues", []),
      renderJobs: this.readJson<RenderJob[]>("renderJobs", []),
      unrealCommands: this.readJson<UnrealCommand[]>("unrealCommands", []),
      auditLogs: this.readJson<AuditLog[]>("auditLogs", []),
      voiceAssets: this.readJson<VoiceAsset[]>("voiceAssets", []),
      assetJobs: this.readJson<AssetJob[]>("assetJobs", []),
      videoJobs: this.readJson<VideoJob[]>("videoJobs", []),
      unrealSandboxCommands: this.readJson<UnrealSandboxCommand[]>(
        "unrealSandboxCommands",
        [],
      ),
      localBridgeStubJobs: this.readJson<LocalBridgeStubJob[]>(
        "localBridgeStubJobs",
        [],
      ),
      fourDSandboxJobs: this.readJson<FourDSandboxJob[]>(
        "fourDSandboxJobs",
        [],
      ),
      readinessReports: this.readJson<ReadinessReport[]>("readinessReports", []),
      approvalHistory: this.readJson<ApprovalHistoryEntry[]>("approvalHistory", []),
      approvalStates: this.readJson<Array<{ productionId: string; stage: ApprovalStage }>>(
        "approvalStates", [],
      ),
      realUnrealHandshakeHistory: this.readJson<RealUnrealHandshakeRecord[]>(
        "realUnrealHandshakeHistory", [],
      ),
      realUnrealDryRunValidationHistory: this.readJson<RealUnrealDryRunValidationRecord[]>(
        "realUnrealDryRunValidationHistory", [],
      ),
      realUnrealHealthCheckHistory: this.readJson<RealUnrealHealthCheckRecord[]>(
        "realUnrealHealthCheckHistory", [],
      ),
      realUnrealPrepareSceneDryRunHistory: this.readJson<RealUnrealPrepareSceneRecord[]>(
        "realUnrealPrepareSceneDryRunHistory", [],
      ),
      realUnrealSetCameraDryRunHistory: this.readJson<RealUnrealSetCameraRecord[]>(
        "realUnrealSetCameraDryRunHistory", [],
      ),
      realUnrealSetLightingDryRunHistory: this.readJson<RealUnrealSetLightingRecord[]>(
        "realUnrealSetLightingDryRunHistory", [],
      ),
      realUnrealSetPanelsDryRunHistory: this.readJson<RealUnrealSetPanelsRecord[]>(
        "realUnrealSetPanelsDryRunHistory", [],
      ),
      realUnrealRenderPreviewContractHistory:
        this.readJson<RealUnrealRenderPreviewContractRecord[]>(
          "realUnrealRenderPreviewContractHistory", [],
        ),
      realUnrealCommandApprovalRequests:
        this.readJson<RealUnrealCommandApprovalRecord[]>(
          "realUnrealCommandApprovalRequests", [],
        ),
      realUnrealLevelLoadContracts:
        this.readJson<RealUnrealLevelLoadContractRecord[]>(
          "realUnrealLevelLoadContracts", [],
        ),
      realUnrealSafetySwitchReports:
        this.readJson<RealUnrealSafetySwitchReport[]>(
          "realUnrealSafetySwitchReports", [],
        ),
      realUnrealMigrationPlans:
        this.readJson<RealUnrealMigrationPlanRecord[]>(
          "realUnrealMigrationPlans", [],
        ),
      generatedRooms:
        this.readJson<GeneratedRoomRecord[]>("generatedRooms", []),
      generatedAvatars:
        this.readJson<GeneratedAvatarRecord[]>("generatedAvatars", []),
      avatarAccessories:
        this.readJson<AvatarAccessoryRecord[]>("avatarAccessories", []),
      productionUnits:
        this.readJson<ProductionUnitRecord[]>("productionUnits", []),
      mediaPackages:
        this.readJson<MediaPackageRecord[]>("mediaPackages", []),
      previewSnapshots:
        this.readJson<PreviewSnapshotRecord[]>("previewSnapshots", []),
      cinema4DAnchorCharacters:
        this.readJson<Cinema4DAnchorCharacterManifest[]>("cinema4DAnchorCharacters", []),
      cinema4DCharacterAccessories:
        this.readJson<Cinema4DCharacterAccessoryManifest[]>("cinema4DCharacterAccessories", []),
      cinema4DRoomCharacterScripts:
        this.readJson<Cinema4DRoomCharacterScriptManifest[]>("cinema4DRoomCharacterScripts", []),
      productionWizardSessions:
        this.readJson<any[]>("productionWizardSessions", []),
      wizardReviewLinks:
        this.readJson<any[]>("wizardReviewLinks", []),
      previewStudioStates:
        this.readJson<PreviewStudioState[]>("previewStudioStates", []),
      previewStudioEditArtifacts:
        this.readJson<PreviewStudioEditArtifact[]>("previewStudioEditArtifacts", []),
    };
  }

  writeVoiceBinary(filename: string, data: Buffer | Uint8Array | string): string {
    // Sanitize: only basename, no traversal, no separators.
    const safe = path.basename(filename).replace(/[^A-Za-z0-9._-]/g, "_");
    const full = path.join(this.voiceAssetDir, safe);
    const tmp = `${full}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, data as any);
    fs.renameSync(tmp, full);
    return full;
  }
  writeMeshyBinary(filename: string, data: Buffer | Uint8Array | string): string {
    const safe = path.basename(filename).replace(/[^A-Za-z0-9._-]/g, "_");
    const full = path.join(this.meshyAssetDir, safe);
    const tmp = `${full}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, data as any);
    fs.renameSync(tmp, full);
    return full;
  }
  writeRunwayBinary(filename: string, data: Buffer | Uint8Array | string): string {
    const safe = path.basename(filename).replace(/[^A-Za-z0-9._-]/g, "_");
    const full = path.join(this.runwayVideoDir, safe);
    const tmp = `${full}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, data as any);
    fs.renameSync(tmp, full);
    return full;
  }

  saveCollection(name: CollectionName, items: any[]): void {
    this.writeJsonAtomic(path.join(this.location, `${name}.json`), items);
  }
  saveUnrealCommands(items: UnrealCommand[]): void {
    this.writeJsonAtomic(path.join(this.location, "unrealCommands.json"), items);
  }
  saveAuditLogs(items: AuditLog[]): void {
    this.writeJsonAtomic(path.join(this.location, "auditLogs.json"), items);
  }
  saveManifestSnapshot(snap: ManifestSnapshot): void {
    this.writeJsonAtomic(
      path.join(this.snapsDir, `${snap.productionId}.json`),
      snap,
    );
  }
  getManifestSnapshot(productionId: string): ManifestSnapshot | null {
    const p = path.join(this.snapsDir, `${productionId}.json`);
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch {
      return null;
    }
  }
  listManifestSnapshots(): ManifestSnapshot[] {
    if (!fs.existsSync(this.snapsDir)) return [];
    return fs
      .readdirSync(this.snapsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(
            fs.readFileSync(path.join(this.snapsDir, f), "utf-8"),
          );
        } catch {
          return null;
        }
      })
      .filter((x): x is ManifestSnapshot => !!x);
  }
}

/* ------------------------------------------------------------------ */
/**
 * Choose a default adapter:
 *   - NODE_ENV=test (without an explicit PRODUCTION_HOUSE_DATA_DIR) → memory
 *   - PRODUCTION_HOUSE_DATA_DIR=memory                              → memory
 *   - otherwise                                                     → file
 *     (defaults to <cwd>/data/production-house)
 *
 * Falls back to memory if the file directory cannot be created or written to.
 */
export function createDefaultStorage(): ProductionHouseStorage {
  const explicit = process.env.PRODUCTION_HOUSE_DATA_DIR?.trim();
  if (explicit === "memory") return new MemoryProductionHouseStorage();
  if (process.env.NODE_ENV === "test" && !explicit) {
    return new MemoryProductionHouseStorage();
  }
  const dir = explicit || path.join(process.cwd(), "data", "production-house");
  try {
    return new FileProductionHouseStorage(dir);
  } catch (e) {
    console.warn(
      "[production-house] file storage unavailable, falling back to memory:",
      (e as Error).message,
    );
    return new MemoryProductionHouseStorage();
  }
}
