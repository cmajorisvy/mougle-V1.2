/* ------------------------------------------------------------------ */
/* Unreal Local Bridge — formal contract specification.                */
/*                                                                     */
/* This module is DOCUMENTATION + VALIDATION ONLY. It never connects   */
/* to Unreal Engine, never triggers Movie Render Queue, never imports  */
/* assets, never sends 4D hardware commands, and never publishes.      */
/* `realSendAllowed` is locked to false at every layer.                */
/* ------------------------------------------------------------------ */

import { z } from "zod";
import { SAFETY_ENVELOPE, SafetyEnvelopeSchema } from "../../shared/production-house";

export const BRIDGE_COMMAND_TYPES = [
  "health_check",
  "validate_package",
  "load_level",
  "prepare_scene",
  "set_camera",
  "set_lighting",
  "attach_avatar",
  "attach_voice_asset",
  "attach_video_panel",
  "attach_3d_asset_reference",
  "start_sequence",
  "render_preview",
  "render_final",
  "cancel_job",
  "get_job_status",
] as const;

export const BridgeCommandTypeSchema = z.enum(BRIDGE_COMMAND_TYPES);
export type BridgeCommandType = z.infer<typeof BridgeCommandTypeSchema>;

/** Every bridge payload must include these locked fields. */
export const BridgePayloadSchema = z.object({
  productionId: z.string().min(1).max(120),
  commandId: z.string().min(1).max(120),
  commandType: BridgeCommandTypeSchema,
  mode: z.literal("local_bridge"),
  dryRun: z.literal(true),
  realSendAllowed: z.literal(false),
  safetyEnvelope: SafetyEnvelopeSchema,
  timestamp: z.string().min(1).max(64),
  adminUserId: z.string().min(1).max(120),
  payload: z.record(z.unknown()).default({}),
  publicUrl: z.null().optional().default(null),
  signedUrl: z.null().optional().default(null),
  visibility: z.literal("admin_only_internal").default("admin_only_internal"),
});
export type BridgePayload = z.infer<typeof BridgePayloadSchema>;

export interface BridgeContract {
  version: string;
  mode: "local_bridge";
  realSendAllowed: false;
  dryRunDefault: true;
  notice: string;
  bridgeUrl: {
    structure: string;
    examples: string[];
    notes: string[];
  };
  authentication: {
    requiredHeaders: Array<{ header: string; description: string; example: string }>;
    notes: string[];
  };
  supportedCommands: Array<{
    type: BridgeCommandType;
    description: string;
    requiresPayloadFields: string[];
  }>;
  requestEnvelope: {
    requiredFields: string[];
    notes: string[];
  };
  responseEnvelope: {
    successShape: Record<string, unknown>;
    errorShape: Record<string, unknown>;
  };
  safetyRules: string[];
  packageValidation: {
    rules: string[];
  };
  errorResponseFormat: {
    httpCodes: Record<string, string>;
    bodyShape: Record<string, unknown>;
    errorCodes: string[];
  };
  auditRequirements: string[];
  safetyEnvelope: typeof SAFETY_ENVELOPE;
}

export function getBridgeContract(): BridgeContract {
  return {
    version: "0.1.0-spec",
    mode: "local_bridge",
    realSendAllowed: false,
    dryRunDefault: true,
    notice:
      "This contract describes a FUTURE external Unreal workstation bridge. " +
      "No real Unreal Engine, Movie Render Queue, asset import, 4D hardware, " +
      "or publishing is enabled by this contract. All payloads in this phase " +
      "must be dry-run with realSendAllowed:false.",
    bridgeUrl: {
      structure: "http://<workstation-host>:<port>/mougle-bridge/<commandType>",
      examples: [
        "http://127.0.0.1:8765/mougle-bridge/health_check",
        "http://127.0.0.1:8765/mougle-bridge/validate_package",
        "http://127.0.0.1:8765/mougle-bridge/load_level",
        "http://127.0.0.1:8765/mougle-bridge/start_sequence",
      ],
      notes: [
        "Bridge must bind to loopback (127.0.0.1) only during this phase.",
        "Public exposure of the bridge port is prohibited.",
        "TLS recommended for any non-loopback deployment in a later phase.",
      ],
    },
    authentication: {
      requiredHeaders: [
        {
          header: "X-Mougle-Bridge-Token",
          description: "Static shared secret rotated by root admin.",
          example: "X-Mougle-Bridge-Token: <secret>",
        },
        {
          header: "X-Mougle-Admin-UserId",
          description: "Root-admin user id that initiated the command.",
          example: "X-Mougle-Admin-UserId: root_admin_001",
        },
        {
          header: "X-Mougle-Mode",
          description: "Must be exactly 'local_bridge'.",
          example: "X-Mougle-Mode: local_bridge",
        },
        {
          header: "X-Mougle-Dry-Run",
          description: "Must be exactly 'true' in this phase.",
          example: "X-Mougle-Dry-Run: true",
        },
        {
          header: "Content-Type",
          description: "application/json.",
          example: "Content-Type: application/json",
        },
      ],
      notes: [
        "Bridge token MUST never be logged or returned in any response body.",
        "All header values are case-insensitive on the header name only.",
      ],
    },
    supportedCommands: [
      { type: "health_check", description: "Bridge liveness probe.", requiresPayloadFields: [] },
      {
        type: "validate_package",
        description: "Run pre-flight validation on a production package without modifying scene state.",
        requiresPayloadFields: ["productionId"],
      },
      {
        type: "load_level",
        description: "Load a Mougle level/world (newsroom, podcast room, hall, etc.).",
        requiresPayloadFields: ["levelName"],
      },
      {
        type: "prepare_scene",
        description: "Prepare scene actors based on a production manifest.",
        requiresPayloadFields: ["roomId"],
      },
      {
        type: "set_camera",
        description: "Set a camera transform/preset.",
        requiresPayloadFields: ["cameraName", "transform"],
      },
      {
        type: "set_lighting",
        description: "Apply a lighting preset.",
        requiresPayloadFields: ["lightingPreset"],
      },
      {
        type: "attach_avatar",
        description: "Attach an AI avatar manifest to a slot.",
        requiresPayloadFields: ["avatarId", "slotId"],
      },
      {
        type: "attach_voice_asset",
        description: "Attach an ElevenLabs voice asset reference (no audio file content).",
        requiresPayloadFields: ["voiceAssetId"],
      },
      {
        type: "attach_video_panel",
        description: "Attach a Runway video panel reference to a screen actor.",
        requiresPayloadFields: ["videoJobId", "screenActor"],
      },
      {
        type: "attach_3d_asset_reference",
        description: "Attach a Meshy 3D asset reference (NO mesh import).",
        requiresPayloadFields: ["assetJobId", "slotId"],
      },
      {
        type: "start_sequence",
        description: "Start a Sequencer timeline.",
        requiresPayloadFields: ["sequenceName"],
      },
      {
        type: "render_preview",
        description: "Request a preview render. DRY RUN — no MRQ execution.",
        requiresPayloadFields: ["sequenceName"],
      },
      {
        type: "render_final",
        description: "Request a final render. DRY RUN — no MRQ execution.",
        requiresPayloadFields: ["sequenceName"],
      },
      { type: "cancel_job", description: "Cancel an in-progress bridge job.", requiresPayloadFields: ["jobId"] },
      { type: "get_job_status", description: "Query bridge job status.", requiresPayloadFields: ["jobId"] },
    ],
    requestEnvelope: {
      requiredFields: [
        "productionId",
        "commandId",
        "commandType",
        "mode (must be 'local_bridge')",
        "dryRun (must be true)",
        "realSendAllowed (must be false)",
        "safetyEnvelope (full SAFETY_ENVELOPE)",
        "timestamp (ISO-8601)",
        "adminUserId",
        "payload (command-specific object)",
        "visibility (must be 'admin_only_internal')",
        "publicUrl (must be null)",
        "signedUrl (must be null)",
      ],
      notes: [
        "Bridge MUST reject any payload with realSendAllowed:true.",
        "Bridge MUST reject any payload with dryRun:false in this phase.",
        "Bridge MUST reject any payload with non-null publicUrl or signedUrl.",
      ],
    },
    responseEnvelope: {
      successShape: {
        ok: true,
        mode: "local_bridge",
        realSendAllowed: false,
        dryRun: true,
        commandId: "<commandId>",
        commandType: "<commandType>",
        bridgeJobId: "<bridge-side job id>",
        status: "accepted_dry_run",
        message: "Accepted as dry-run. No Unreal Engine actions executed.",
        echo: { /* echoed safety-relevant fields */ },
      },
      errorShape: {
        ok: false,
        mode: "local_bridge",
        realSendAllowed: false,
        commandId: "<commandId>",
        errorCode: "<error_code>",
        message: "<human readable>",
        failures: ["<failure_code>", "..."],
      },
    },
    safetyRules: [
      "Bridge must NEVER execute Movie Render Queue.",
      "Bridge must NEVER import assets into the Unreal project.",
      "Bridge must NEVER write to disk outside its sandbox working directory.",
      "Bridge must NEVER call 4D hardware integrations.",
      "Bridge must NEVER publish, upload, or stream to any public endpoint.",
      "Bridge must NEVER generate signed or public URLs.",
      "Bridge must NEVER echo authentication headers in responses.",
      "Bridge must NEVER accept a payload whose realSendAllowed is true.",
      "Bridge must always set dryRun:true in this phase.",
      "Bridge must drop any field it does not recognize rather than forwarding it.",
    ],
    packageValidation: {
      rules: [
        "Production must exist and be approved (or sandboxOverride:true).",
        "Production manifest must be present.",
        "Unreal scene manifest must be present.",
        "All voice/asset/video records must have visibility='admin_only_internal'.",
        "All publicUrl and signedUrl fields must be null.",
        "safetyEnvelope must equal SAFETY_ENVELOPE exactly.",
        "No nested object may set realSendAllowed:true.",
      ],
    },
    errorResponseFormat: {
      httpCodes: {
        "400": "Invalid payload",
        "401": "Missing or invalid bridge token / admin marker",
        "403": "Operation forbidden by safety policy",
        "404": "Unknown commandType or bridgeJobId",
        "409": "State conflict (e.g. job already cancelled)",
        "422": "Validation failed",
        "500": "Bridge internal error",
      },
      bodyShape: {
        ok: false,
        errorCode: "<UPPER_SNAKE>",
        message: "<human readable>",
        failures: ["<failure_code>", "..."],
      },
      errorCodes: [
        "INVALID_PAYLOAD",
        "MISSING_AUTH",
        "FORBIDDEN_REAL_SEND",
        "FORBIDDEN_NON_DRY_RUN",
        "UNSUPPORTED_COMMAND_TYPE",
        "PRODUCTION_NOT_FOUND",
        "PACKAGE_VALIDATION_FAILED",
        "PUBLIC_URL_NOT_ALLOWED",
        "SIGNED_URL_NOT_ALLOWED",
        "VISIBILITY_NOT_ALLOWED",
        "SAFETY_ENVELOPE_INVALID",
        "BRIDGE_INTERNAL_ERROR",
      ],
    },
    auditRequirements: [
      "Bridge MUST log: timestamp, commandId, commandType, productionId, adminUserId, status.",
      "Bridge MUST NOT log: bridge token, payload binaries, secrets.",
      "Mougle server records every contract view, validation, rejection, and export.",
      "Audit retention must follow root-admin policy.",
    ],
    safetyEnvelope: SAFETY_ENVELOPE,
  };
}

function makeExample(
  commandType: BridgeCommandType,
  productionId: string,
  adminUserId: string,
  payload: Record<string, unknown>,
): BridgePayload {
  return {
    productionId,
    commandId: `cmd_${commandType}_${productionId}`,
    commandType,
    mode: "local_bridge",
    dryRun: true,
    realSendAllowed: false,
    safetyEnvelope: SAFETY_ENVELOPE,
    timestamp: "2026-01-01T00:00:00.000Z",
    adminUserId,
    payload,
    publicUrl: null,
    signedUrl: null,
    visibility: "admin_only_internal",
  };
}

export interface BridgeExample {
  name: string;
  description: string;
  payload: BridgePayload;
}

export function getExamplePayloads(): BridgeExample[] {
  const pid = "prod_example_001";
  const admin = "root_admin_001";
  return [
    {
      name: "load_mougle_newsroom_level",
      description: "Load the Mougle Newsroom level on the bridge.",
      payload: makeExample("load_level", pid, admin, {
        levelName: "MougleNewsroom_v1",
        levelPath: "/Game/Mougle/Levels/MougleNewsroom_v1",
      }),
    },
    {
      name: "prepare_podcast_room",
      description: "Prepare the Podcast Room scene actors from a production manifest.",
      payload: makeExample("prepare_scene", pid, admin, {
        roomId: "room_podcast_001",
        roomKind: "podcast_room",
      }),
    },
    {
      name: "attach_ai_avatar",
      description: "Attach an AI avatar manifest reference to a stage slot.",
      payload: makeExample("attach_avatar", pid, admin, {
        avatarId: "avatar_example_001",
        slotId: "slot_host_main",
      }),
    },
    {
      name: "attach_elevenlabs_voice_asset",
      description: "Attach an ElevenLabs voice asset reference (no audio file content).",
      payload: makeExample("attach_voice_asset", pid, admin, {
        voiceAssetId: "voice_example_001",
        trackName: "host_voice_track",
      }),
    },
    {
      name: "attach_runway_video_panel",
      description: "Attach a Runway video reference to a panel actor.",
      payload: makeExample("attach_video_panel", pid, admin, {
        videoJobId: "video_example_001",
        screenActor: "BP_VideoPanel_Main",
      }),
    },
    {
      name: "attach_meshy_asset_reference",
      description: "Attach a Meshy 3D asset reference. NO mesh import is performed.",
      payload: makeExample("attach_3d_asset_reference", pid, admin, {
        assetJobId: "asset_example_001",
        slotId: "slot_set_dressing_a",
      }),
    },
    {
      name: "start_sequencer_timeline",
      description: "Start the Sequencer timeline for the production.",
      payload: makeExample("start_sequence", pid, admin, {
        sequenceName: "SEQ_MougleNewsroom_Main",
      }),
    },
    {
      name: "render_preview_dry_run",
      description: "Request a preview render. DRY RUN — no Movie Render Queue execution.",
      payload: makeExample("render_preview", pid, admin, {
        sequenceName: "SEQ_MougleNewsroom_Main",
        resolution: "1280x720",
        fps: 30,
        maxDurationSeconds: 30,
      }),
    },
  ];
}

export interface BridgeValidationResult {
  ok: boolean;
  failures: string[];
  errorCodes: string[];
}

function findNonNullKey(obj: unknown, keys: string[]): boolean {
  if (obj === null || obj === undefined) return false;
  if (Array.isArray(obj)) return obj.some((v) => findNonNullKey(v, keys));
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (keys.includes(k) && v !== null && v !== undefined && v !== "") return true;
      if (findNonNullKey(v, keys)) return true;
    }
  }
  return false;
}

export function validateBridgePayload(input: unknown): BridgeValidationResult {
  const failures: string[] = [];
  const errorCodes: string[] = [];
  const obj = (input ?? {}) as Record<string, unknown>;

  if (obj.realSendAllowed === true) {
    failures.push("real_send_allowed_true");
    errorCodes.push("FORBIDDEN_REAL_SEND");
  }
  if (obj.dryRun !== true) {
    failures.push("dry_run_not_true");
    errorCodes.push("FORBIDDEN_NON_DRY_RUN");
  }
  if (!obj.safetyEnvelope) {
    failures.push("safety_envelope_missing");
    errorCodes.push("SAFETY_ENVELOPE_INVALID");
  } else {
    const parsed = SafetyEnvelopeSchema.safeParse(obj.safetyEnvelope);
    if (!parsed.success) {
      failures.push("safety_envelope_invalid");
      errorCodes.push("SAFETY_ENVELOPE_INVALID");
    }
  }
  if (!obj.productionId || typeof obj.productionId !== "string") {
    failures.push("production_id_missing");
    errorCodes.push("INVALID_PAYLOAD");
  }
  if (!obj.commandId || typeof obj.commandId !== "string") {
    failures.push("command_id_missing");
    errorCodes.push("INVALID_PAYLOAD");
  }
  if (
    typeof obj.commandType !== "string" ||
    !(BRIDGE_COMMAND_TYPES as readonly string[]).includes(obj.commandType)
  ) {
    failures.push("command_type_unsupported");
    errorCodes.push("UNSUPPORTED_COMMAND_TYPE");
  }
  if (obj.mode !== "local_bridge") {
    failures.push("mode_not_local_bridge");
    errorCodes.push("INVALID_PAYLOAD");
  }
  if (obj.publicUrl !== null && obj.publicUrl !== undefined) {
    failures.push("public_url_not_null");
    errorCodes.push("PUBLIC_URL_NOT_ALLOWED");
  }
  if (obj.signedUrl !== null && obj.signedUrl !== undefined) {
    failures.push("signed_url_not_null");
    errorCodes.push("SIGNED_URL_NOT_ALLOWED");
  }
  if (obj.visibility && obj.visibility !== "admin_only_internal") {
    failures.push("visibility_not_admin_only_internal");
    errorCodes.push("VISIBILITY_NOT_ALLOWED");
  }
  // Deep scan for any nested non-null publicUrl/signedUrl or realSendAllowed:true.
  if (findNonNullKey(obj.payload, ["publicUrl"])) {
    failures.push("nested_public_url_not_null");
    errorCodes.push("PUBLIC_URL_NOT_ALLOWED");
  }
  if (findNonNullKey(obj.payload, ["signedUrl"])) {
    failures.push("nested_signed_url_not_null");
    errorCodes.push("SIGNED_URL_NOT_ALLOWED");
  }

  // Final strict schema parse only if everything else is clean.
  if (failures.length === 0) {
    const parsed = BridgePayloadSchema.safeParse(obj);
    if (!parsed.success) {
      failures.push("schema_parse_failed");
      errorCodes.push("INVALID_PAYLOAD");
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    errorCodes: Array.from(new Set(errorCodes)),
  };
}
