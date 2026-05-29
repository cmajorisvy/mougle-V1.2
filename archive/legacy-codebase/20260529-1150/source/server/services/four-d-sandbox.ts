/**
 * 4D Hardware Sandbox Contract — mock-only validator + supported effects.
 *
 * SAFETY: never connects to physical devices, never sends DMX/OSC/UDP/MIDI/
 * serial/relay/fog/wind/scent/vibration/motion-seat/lighting commands.
 * All cues are dry-run only; realSendAllowed is locked to false.
 */
import { SAFETY_ENVELOPE, FOUR_D_EFFECT_TYPES } from "../../shared/production-house";

export { FOUR_D_EFFECT_TYPES };

export const FOUR_D_MAX_DURATION_MS = 60_000;

export interface FourDValidationResult {
  ok: boolean;
  failures: string[];
  errorCodes: string[];
}

export interface FourDExampleCue {
  name: string;
  description: string;
  cue: Record<string, unknown>;
}

export function makeExampleCue(
  name: string,
  description: string,
  overrides: Record<string, unknown>,
): FourDExampleCue {
  return {
    name,
    description,
    cue: {
      cueId: `cue_${name}_001`,
      productionId: "p_example_001",
      timecode: "00:00:01.000",
      effectType: "light_flash",
      intensity: 0.5,
      durationMs: 500,
      target: "main_stage",
      mode: "4d_sandbox",
      dryRun: true,
      realSendAllowed: false,
      safetyEnvelope: SAFETY_ENVELOPE,
      visibility: "admin_only_internal",
      publicUrl: null,
      signedUrl: null,
      ...overrides,
    },
  };
}

export function getFourDSandboxExampleCues(): FourDExampleCue[] {
  return [
    makeExampleCue("light_flash", "Quick studio light flash", { effectType: "light_flash", intensity: 0.7, durationMs: 200 }),
    makeExampleCue("color_change", "LED wall color shift", { effectType: "color_change", intensity: 0.6, durationMs: 1500, target: "led_wall_back" }),
    makeExampleCue("fog_burst", "Short fog burst", { effectType: "fog_burst", intensity: 0.4, durationMs: 800, target: "fog_machine_left" }),
    makeExampleCue("wind", "Wind gust", { effectType: "wind", intensity: 0.5, durationMs: 2000, target: "wind_fan_array" }),
    makeExampleCue("vibration", "Seat vibration", { effectType: "vibration", intensity: 0.3, durationMs: 600, target: "seat_row_A" }),
    makeExampleCue("bass_hit", "Bass hit cue", { effectType: "bass_hit", intensity: 0.8, durationMs: 300, target: "subwoofer_array" }),
    makeExampleCue("motion_seat", "Motion seat tilt", { effectType: "motion_seat", intensity: 0.5, durationMs: 1200, target: "seat_row_A" }),
    makeExampleCue("scent", "Scent diffuser pulse", { effectType: "scent", intensity: 0.2, durationMs: 1000, target: "scent_diffuser_1" }),
    makeExampleCue("water_mist", "Water mist", { effectType: "water_mist", intensity: 0.3, durationMs: 400, target: "mist_nozzle_front" }),
    makeExampleCue("heat", "Heat lamp pulse", { effectType: "heat", intensity: 0.4, durationMs: 1500, target: "heat_lamp_top" }),
    makeExampleCue("spatial_audio", "Spatial audio sweep", { effectType: "spatial_audio", intensity: 0.6, durationMs: 2500, target: "atmos_bus_1" }),
    makeExampleCue("led_wall", "LED wall pattern", { effectType: "led_wall", intensity: 0.7, durationMs: 1800, target: "led_wall_main" }),
    makeExampleCue("custom", "Custom effect", { effectType: "custom", intensity: 0.5, durationMs: 1000, target: "custom_device_1" }),
  ];
}

export function validateFourDSandboxCue(input: unknown): FourDValidationResult {
  const failures: string[] = [];
  const codes: string[] = [];
  if (!input || typeof input !== "object") {
    return { ok: false, failures: ["payload_not_object"], errorCodes: ["INVALID_PAYLOAD"] };
  }
  const c = input as Record<string, unknown>;

  if (c.realSendAllowed !== false) {
    failures.push("real_send_not_allowed");
    codes.push("FORBIDDEN_REAL_SEND");
  }
  if (c.dryRun !== true) {
    failures.push("dry_run_required");
    codes.push("FORBIDDEN_NON_DRY_RUN");
  }
  const env = c.safetyEnvelope as any;
  if (
    !env || typeof env !== "object" ||
    env.realUnrealCommands !== false ||
    env.real4DCommands !== false ||
    env.publicUrlGeneration !== false ||
    env.signedUrlGeneration !== false
  ) {
    failures.push("safety_envelope_invalid");
    codes.push("SAFETY_ENVELOPE_INVALID");
  }
  if (typeof c.cueId !== "string" || !c.cueId) {
    failures.push("cue_id_missing"); codes.push("CUE_ID_MISSING");
  }
  if (typeof c.productionId !== "string" || !c.productionId) {
    failures.push("production_id_missing"); codes.push("PRODUCTION_ID_MISSING");
  }
  if (typeof c.timecode !== "string" || !c.timecode) {
    failures.push("timecode_missing"); codes.push("TIMECODE_MISSING");
  }
  if (typeof c.target !== "string" || !c.target) {
    failures.push("target_missing"); codes.push("TARGET_MISSING");
  }
  if (typeof c.effectType !== "string" || !(FOUR_D_EFFECT_TYPES as readonly string[]).includes(c.effectType)) {
    failures.push("effect_type_unsupported"); codes.push("UNSUPPORTED_EFFECT_TYPE");
  }
  if (typeof c.intensity !== "number" || !Number.isFinite(c.intensity) || c.intensity < 0 || c.intensity > 1) {
    failures.push("intensity_out_of_range"); codes.push("INTENSITY_OUT_OF_RANGE");
  }
  if (
    typeof c.durationMs !== "number" || !Number.isFinite(c.durationMs) ||
    c.durationMs < 0 || c.durationMs > FOUR_D_MAX_DURATION_MS
  ) {
    failures.push("duration_invalid"); codes.push("DURATION_INVALID");
  }
  if (c.publicUrl !== null && c.publicUrl !== undefined) {
    failures.push("public_url_not_allowed"); codes.push("PUBLIC_URL_NOT_ALLOWED");
  }
  if (c.signedUrl !== null && c.signedUrl !== undefined) {
    failures.push("signed_url_not_allowed"); codes.push("SIGNED_URL_NOT_ALLOWED");
  }
  if (c.visibility !== "admin_only_internal") {
    failures.push("visibility_not_allowed"); codes.push("VISIBILITY_NOT_ALLOWED");
  }
  if (c.mode !== "4d_sandbox") {
    failures.push("mode_invalid"); codes.push("MODE_INVALID");
  }
  return { ok: failures.length === 0, failures, errorCodes: codes };
}
