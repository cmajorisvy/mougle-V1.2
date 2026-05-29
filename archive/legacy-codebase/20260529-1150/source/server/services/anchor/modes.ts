/**
 * T7 — Anchor mode registry.
 *
 * Each mode defines how the AI anchor delivers a beat:
 *  - HeyGen preset id (placeholder when no real account is configured)
 *  - camera framing string for downstream compositor hints
 *  - prompt-prefix used by the heygen adapter
 *  - whether the mode is allowed on stories tagged `sensitive=true`
 *
 * The `shapeshift_explainer` mode is explicitly forbidden on sensitive
 * stories. Enforcement lives in `assertModeAllowedForSensitivity` (and
 * is re-checked at the director and adapter layers).
 */

export const ANCHOR_MODES = [
  "desk_anchor",
  "walking_presenter",
  "corner_explainer",
  "field_reporter",
  "data_wall_analyst",
  "shapeshift_explainer",
] as const;

export type AnchorMode = (typeof ANCHOR_MODES)[number];

export interface AnchorModeDefinition {
  mode: AnchorMode;
  label: string;
  description: string;
  presetId: string;
  framing: string;
  promptPrefix: string;
  /** When true, this mode may be picked for stories tagged sensitive=true. */
  allowedForSensitive: boolean;
}

export const ANCHOR_MODE_REGISTRY: Record<AnchorMode, AnchorModeDefinition> = {
  desk_anchor: {
    mode: "desk_anchor",
    label: "Desk Anchor",
    description: "Studio-desk delivery, neutral and authoritative.",
    presetId: "heygen_preset_desk_anchor_v1",
    framing: "medium_shot_desk",
    promptPrefix:
      "Deliver this beat as a calm, authoritative news desk anchor. Eye-line to camera, professional cadence.",
    allowedForSensitive: true,
  },
  walking_presenter: {
    mode: "walking_presenter",
    label: "Walking Presenter",
    description: "Walk-and-talk through the newsroom for energy and pacing.",
    presetId: "heygen_preset_walking_presenter_v1",
    framing: "tracking_medium",
    promptPrefix:
      "Deliver this beat as a walking presenter in the newsroom. Confident pace, natural gestures, no breaking-news urgency.",
    allowedForSensitive: true,
  },
  corner_explainer: {
    mode: "corner_explainer",
    label: "Corner Explainer",
    description: "Lower-corner inset over the wall, used for quick context.",
    presetId: "heygen_preset_corner_explainer_v1",
    framing: "lower_right_inset",
    promptPrefix:
      "Deliver this beat as a corner-inset explainer. Concise, supportive of the main visual, no dramatic intonation.",
    allowedForSensitive: true,
  },
  field_reporter: {
    mode: "field_reporter",
    label: "Field-Style Reporter",
    description: "Field-style stand-up framing for on-location stories.",
    presetId: "heygen_preset_field_reporter_v1",
    framing: "stand_up_field",
    promptPrefix:
      "Deliver this beat as a field-style stand-up reporter. Measured, observational, no dramatization of suffering.",
    allowedForSensitive: true,
  },
  data_wall_analyst: {
    mode: "data_wall_analyst",
    label: "Data Wall Analyst",
    description: "Analyst in front of the data wall walking through numbers.",
    presetId: "heygen_preset_data_wall_v1",
    framing: "wide_data_wall",
    promptPrefix:
      "Deliver this beat as a data-wall analyst. Walk the viewer through the numbers calmly. No speculation beyond what's stated.",
    allowedForSensitive: true,
  },
  shapeshift_explainer: {
    mode: "shapeshift_explainer",
    label: "Shapeshift Explainer",
    description:
      "Stylized morph between anchor and explainer character for non-sensitive feature stories only.",
    presetId: "heygen_preset_shapeshift_v1",
    framing: "stylized_morph",
    promptPrefix:
      "Deliver this beat as a playful shapeshift explainer. Light tone. Never use this style for harm, conflict, or grief.",
    allowedForSensitive: false,
  },
};

/**
 * Event types considered sensitive by default. The director also accepts
 * an explicit `sensitive=true` flag from the brief; both are OR-ed.
 */
export const SENSITIVE_EVENT_TYPES = new Set<string>([
  "disaster",
  "natural_disaster",
  "conflict",
  "war",
  "violence",
  "death",
  "fatality",
  "casualty",
  "casualties",
  "missing_persons",
  "investigation",
  "ongoing_investigation",
  "crime",
  "abuse",
  "terror",
  "terrorism",
  "shooting",
  "outbreak",
  "epidemic",
  "pandemic",
  "humanitarian_crisis",
  "mass_casualty",
]);

/**
 * Moods that, if requested by the brief, also force sensitive treatment.
 */
export const SENSITIVE_MOODS = new Set<string>([
  "somber",
  "grave",
  "tragic",
  "mournful",
  "urgent_breaking",
  "crisis",
]);

export function isSensitiveBeat(input: {
  sensitive?: boolean | null;
  eventType?: string | null;
  mood?: string | null;
}): boolean {
  if (input.sensitive === true) return true;
  const et = (input.eventType || "").trim().toLowerCase();
  if (et && SENSITIVE_EVENT_TYPES.has(et)) return true;
  const mood = (input.mood || "").trim().toLowerCase();
  if (mood && SENSITIVE_MOODS.has(mood)) return true;
  return false;
}

export function listModes(): AnchorModeDefinition[] {
  return ANCHOR_MODES.map((m) => ANCHOR_MODE_REGISTRY[m]);
}

export function getMode(mode: string): AnchorModeDefinition | null {
  if ((ANCHOR_MODES as readonly string[]).includes(mode)) {
    return ANCHOR_MODE_REGISTRY[mode as AnchorMode];
  }
  return null;
}

export class AnchorModeError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Hard rejection: shapeshift on sensitive stories is forbidden. Other
 * modes are currently allowed everywhere, but this function is the
 * single enforcement point so additional restrictions stay in one place.
 */
export function assertModeAllowedForSensitivity(
  mode: AnchorMode,
  sensitive: boolean,
): void {
  const def = ANCHOR_MODE_REGISTRY[mode];
  if (!def) {
    throw new AnchorModeError("unknown_mode", `Unknown anchor mode "${mode}"`);
  }
  if (sensitive && !def.allowedForSensitive) {
    throw new AnchorModeError(
      "mode_blocked_sensitive",
      `Mode "${mode}" is blocked on sensitive stories (disasters, conflict, deaths, ongoing investigations).`,
      403,
    );
  }
}
