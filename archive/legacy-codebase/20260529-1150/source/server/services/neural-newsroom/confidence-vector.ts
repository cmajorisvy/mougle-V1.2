/**
 * Confidence Vector — MIN-based deterministic safety score.
 *
 * Spec §6: a story may be verified while the media source is still unsafe;
 * therefore C_total uses MIN across the seven sub-scores, not average.
 *
 * Tier routing:
 *   ≥ 0.90  → auto       (automatic simulation allowed)
 *   ≥ 0.75  → assisted   (assisted preview only)
 *   ≥ 0.50  → review     (admin review required)
 *   <  0.50 → reject     (reject + fallback)
 *
 * C_audience_safety defaults to 1.0 here; the Omni-Channel Audience Safety
 * Layer (Task #371,
 * `server/services/omni-channel-audience-safety-service.ts`) overrides it
 * from per-platform AudienceSafetyDecision rows
 * (clean → 1.0, sensitivity-review → 0.6, any hard blocker → 0.0). The MIN
 * rule then drives C_total: a single abusive/spam/PII/misinfo audience
 * message is enough to push the take-plan tier band into `reject`.
 */

export interface ConfidenceVector {
  cSource: number;
  cVerification: number;
  cLicense: number;
  cScreenMatch: number;
  cSensitivity: number;
  cAudienceSafety: number;
  cFallback: number;
}

export type TierBand = "auto" | "assisted" | "review" | "reject";

export function computeCTotal(v: ConfidenceVector): number {
  return Math.min(
    v.cSource,
    v.cVerification,
    v.cLicense,
    v.cScreenMatch,
    v.cSensitivity,
    v.cAudienceSafety,
    v.cFallback,
  );
}

export function tierBandFor(cTotal: number): TierBand {
  if (cTotal >= 0.9) return "auto";
  if (cTotal >= 0.75) return "assisted";
  if (cTotal >= 0.5) return "review";
  return "reject";
}

export function vectorAsRecord(v: ConfidenceVector): Record<string, number> {
  return {
    C_source: v.cSource,
    C_verification: v.cVerification,
    C_license: v.cLicense,
    C_screen_match: v.cScreenMatch,
    C_sensitivity: v.cSensitivity,
    C_audience_safety: v.cAudienceSafety,
    C_fallback: v.cFallback,
  };
}
