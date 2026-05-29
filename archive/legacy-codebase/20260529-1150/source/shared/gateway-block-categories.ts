/**
 * Task #444 — Categorise gateway block reasons.
 *
 * Shared between `server/services/gateway-block-alert-service.ts` (alert
 * payload `reasonCategoryCounts`) and the admin omni-channel audience
 * widget (`client/src/pages/admin/OmniChannelAudience.tsx`, category
 * badges). Keeping the map in `shared/` so the alert and the UI agree
 * on which bucket a reason belongs to.
 *
 * Categories chosen to match how an admin triages a block storm:
 *   - auth          → token / credential is missing or invalid
 *   - permission    → the connector is not allowed to send (scopes,
 *                     approval flags, command mode, api access mode)
 *   - rate_limit    → bucket exhausted
 *   - decision      → upstream moderation decision changed / not eligible
 *   - adapter       → no adapter / action not implemented
 *   - http          → platform returned non-2xx or fetch threw
 *   - other         → anything we have not classified yet
 */

export type GatewayBlockCategory =
  | "auth"
  | "permission"
  | "rate_limit"
  | "decision"
  | "adapter"
  | "http"
  | "other";

export const GATEWAY_BLOCK_CATEGORIES: ReadonlyArray<GatewayBlockCategory> = [
  "auth",
  "permission",
  "rate_limit",
  "decision",
  "adapter",
  "http",
  "other",
];

export const GATEWAY_BLOCK_CATEGORY_LABELS: Record<GatewayBlockCategory, string> = {
  auth: "Auth / token",
  permission: "Permission",
  rate_limit: "Rate limit",
  decision: "Decision tamper",
  adapter: "Adapter",
  http: "HTTP / network",
  other: "Other",
};

/**
 * Map a raw block reason string emitted by the platform gateway into
 * one of the triage categories above. Falls back to `"other"` for any
 * reason we have not classified yet so the UI never silently drops a
 * count.
 */
export function categorizeGatewayBlockReason(
  reason: string | null | undefined,
): GatewayBlockCategory {
  if (!reason || typeof reason !== "string") return "other";
  const r = reason.toLowerCase();

  if (r === "platform_token_missing" || r === "token_invalid" || r === "connector_expired") {
    return "auth";
  }
  if (r.includes("token") || r.startsWith("auth_") || r.includes("credential")) {
    return "auth";
  }

  if (r === "rate_limit_exceeded" || r === "rate_limited" || r.startsWith("rate_limit")) {
    return "rate_limit";
  }

  if (
    r === "decision_changed_since_build" ||
    r === "decision_fingerprint_mismatch" ||
    r === "decision_not_action_eligible" ||
    r === "decision_not_found" ||
    r.startsWith("decision_")
  ) {
    return "decision";
  }

  if (
    r === "no_adapter_for_platform" ||
    r === "action_not_supported_by_adapter" ||
    r.startsWith("adapter_")
  ) {
    return "adapter";
  }

  if (r.startsWith("platform_http_") || r.startsWith("platform_fetch_error") || r.startsWith("http_")) {
    return "http";
  }

  if (
    r === "permission_missing" ||
    r === "permissions_missing" ||
    r === "connector_not_platform_send_approved" ||
    r === "not_platform_send_approved" ||
    r === "human_approval_required" ||
    r === "forbidden" ||
    r === "command_not_allowed" ||
    r.startsWith("api_access_mode_") ||
    r.startsWith("command_mode_") ||
    r.startsWith("permission")
  ) {
    return "permission";
  }

  return "other";
}

/**
 * Bucket a list of reasons into `{ category: count }`. Categories with
 * zero entries are omitted so the alert payload stays compact.
 */
export function countReasonsByCategory(
  reasons: ReadonlyArray<string>,
): Partial<Record<GatewayBlockCategory, number>> {
  const out: Partial<Record<GatewayBlockCategory, number>> = {};
  for (const reason of reasons) {
    const cat = categorizeGatewayBlockReason(reason);
    out[cat] = (out[cat] ?? 0) + 1;
  }
  return out;
}
