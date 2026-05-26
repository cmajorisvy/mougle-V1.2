/**
 * Autopilot decision service — PURE functions only.
 *
 * SAFETY:
 *   - No DB. No drizzle. No provider calls. No rendering. No publishing.
 *   - Deterministic: same input → same decision. Easy to unit-test.
 *   - Every block reason is explained in the returned `reasons[]` / gates.
 *   - The returned `envelope` is the immutable SAFETY_ENVELOPE with
 *     `internalAutopilotAllowed` adjusted to the operator's settings.
 */

import {
  type AutopilotDecision,
  type AutopilotSafetyGate,
  type AutopilotSettings,
  type AutopilotStoryInput,
  type BlockedCategory,
  type SafetyEnvelope,
  BLOCKED_CATEGORIES,
  SAFETY_ENVELOPE,
} from "../../../shared/autopilot-newsroom";

const HIGH_RISK_REQUIRES_MANUAL: ReadonlySet<string> = new Set([
  "elections",
  "war_conflict_escalation",
  "health_medical_advice",
  "financial_recommendation",
  "legal_accusation",
  "death_report",
  "criminal_allegation",
  "minors",
  "graphic_violence",
]);

function envelopeFor(settings: AutopilotSettings): SafetyEnvelope {
  // Allowed iff mode is internal_playout AND kill switch is not engaged.
  // For preview / manual, autopilot is not allowed to play internally.
  return {
    ...SAFETY_ENVELOPE,
    internalAutopilotAllowed:
      settings.mode === "autopilot_internal_playout" && !settings.killSwitchEngaged,
  };
}

/** Returns categories that we recognise as hard blockers. */
function detectBlockedCategories(input: AutopilotStoryInput): BlockedCategory[] {
  const found: BlockedCategory[] = [];
  for (const c of input.categories) {
    const normalised = c.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if ((BLOCKED_CATEGORIES as readonly string[]).includes(normalised)) {
      found.push(normalised as BlockedCategory);
    }
  }
  if (input.disputed) found.push("disputed");
  if (input.rightsBlocked) found.push("rights_blocked_media");
  if (input.involvesMinors) found.push("minors");
  return [...new Set(found)];
}

export function requireManualReviewReasons(
  input: AutopilotStoryInput,
  _settings: AutopilotSettings,
): string[] {
  const reasons: string[] = [];
  for (const c of input.categories) {
    const norm = c.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (HIGH_RISK_REQUIRES_MANUAL.has(norm)) {
      reasons.push(`high_risk_category:${norm}`);
    }
  }
  if (input.involvesMinors) reasons.push("involves_minors");
  return [...new Set(reasons)];
}

export function deriveAutopilotSafetyGates(
  input: AutopilotStoryInput,
  settings: AutopilotSettings,
): AutopilotSafetyGate[] {
  const blockedCats = detectBlockedCategories(input);
  const manualCats = requireManualReviewReasons(input, settings);
  const gates: AutopilotSafetyGate[] = [
    {
      gate: "kill_switch",
      passed: !settings.killSwitchEngaged,
      detail: settings.killSwitchEngaged
        ? "kill switch engaged — all autopilot actions blocked"
        : "kill switch disengaged",
    },
    {
      gate: "mode_allows_autopilot",
      passed:
        settings.mode === "autopilot_preview" ||
        settings.mode === "autopilot_internal_playout",
      detail: `mode=${settings.mode}`,
    },
    {
      gate: "status_verified_or_approved_internal",
      passed: input.status === "verified" || input.status === "approved_internal",
      detail: `status=${input.status}`,
    },
    {
      gate: "not_rejected",
      passed: input.status !== "rejected",
      detail: "rejected items never qualify",
    },
    {
      gate: "not_disputed",
      passed: !input.disputed,
      detail: input.disputed ? "story is disputed" : "no dispute flag",
    },
    {
      gate: "correction_only_when_correction_safe",
      passed:
        input.status !== "correction" || (settings.allowCorrectionsInternal && input.correctionSafe),
      detail:
        input.status === "correction"
          ? `allowCorrectionsInternal=${settings.allowCorrectionsInternal} correctionSafe=${input.correctionSafe}`
          : "not a correction",
    },
    {
      gate: "developing_only_with_internal_flag",
      passed: input.status !== "developing" || settings.allowDevelopingInternalOnly,
      detail:
        input.status === "developing"
          ? `allowDevelopingInternalOnly=${settings.allowDevelopingInternalOnly}`
          : "not a developing story",
    },
    {
      gate: "confidence_above_threshold",
      passed: input.confidence >= settings.minConfidence,
      detail: `confidence=${input.confidence.toFixed(2)} threshold=${settings.minConfidence.toFixed(2)}`,
    },
    {
      gate: "source_count_above_min",
      passed: input.sourceCount >= settings.minSourceCount,
      detail: `sources=${input.sourceCount} min=${settings.minSourceCount}`,
    },
    {
      gate: "no_rights_blocked_media",
      passed: !input.rightsBlocked,
      detail: input.rightsBlocked ? "rights_blocked_media" : "no rights block",
    },
    {
      gate: "required_fields_present",
      passed: !!input.headline?.trim() && !!input.script?.toString().trim(),
      detail: `headline=${!!input.headline?.trim()} script=${!!input.script?.toString().trim()}`,
    },
    {
      gate: "not_stale",
      passed: input.ageMs <= settings.staleItemAgeMs,
      detail: `ageMs=${input.ageMs} maxMs=${settings.staleItemAgeMs}`,
    },
    {
      gate: "no_high_risk_categories_requiring_manual",
      passed: manualCats.length === 0,
      detail: manualCats.length ? `manual_required:${manualCats.join(",")}` : "none",
    },
    {
      gate: "no_blocked_categories",
      passed: blockedCats.filter((c) => c !== "disputed" && c !== "rights_blocked_media").length === 0,
      detail: blockedCats.length ? `blocked:${blockedCats.join(",")}` : "none",
    },
    {
      gate: "public_publishing_disabled",
      passed: true,
      detail: "publicPublishing locked false in SAFETY_ENVELOPE",
    },
  ];
  return gates;
}

export function evaluateAutopilotEligibility(
  input: AutopilotStoryInput,
  settings: AutopilotSettings,
): AutopilotDecision {
  const envelope = envelopeFor(settings);
  const gates = deriveAutopilotSafetyGates(input, settings);
  const blockedCategories = detectBlockedCategories(input);
  const manualReviewReasons = requireManualReviewReasons(input, settings);

  const failingGates = gates.filter((g) => !g.passed);
  const reasons = failingGates.map((g) => `gate:${g.gate} — ${g.detail}`);

  // Eligible only if every gate passes AND we are in an autopilot mode
  // (preview or internal_playout). Manual mode never auto-plays.
  const eligible =
    failingGates.length === 0 &&
    (settings.mode === "autopilot_preview" || settings.mode === "autopilot_internal_playout") &&
    !settings.killSwitchEngaged;

  // Will play internally only if eligible AND mode is internal_playout AND
  // there are no manual-review-required categories.
  const willPlayInternally =
    eligible &&
    settings.mode === "autopilot_internal_playout" &&
    manualReviewReasons.length === 0;

  return {
    eligible,
    mode: settings.mode,
    reasons,
    manualReviewReasons,
    blockedCategories,
    gates,
    willPublishPublicly: false, // permanently false — locked literal
    willPlayInternally,
    envelope,
  };
}

export function explainAutopilotDecision(decision: AutopilotDecision): string {
  const lines: string[] = [];
  lines.push(`mode=${decision.mode}`);
  lines.push(`eligible=${decision.eligible}`);
  lines.push(`willPlayInternally=${decision.willPlayInternally}`);
  lines.push(`willPublishPublicly=${decision.willPublishPublicly}`);
  if (decision.blockedCategories.length) {
    lines.push(`blockedCategories=${decision.blockedCategories.join(",")}`);
  }
  if (decision.manualReviewReasons.length) {
    lines.push(`manualReviewReasons=${decision.manualReviewReasons.join(",")}`);
  }
  for (const g of decision.gates) {
    lines.push(`gate.${g.gate}=${g.passed ? "pass" : "fail"} (${g.detail})`);
  }
  return lines.join("\n");
}
