export const GLUON_PUBLIC_DISCLAIMER =
  "Gluon IDs are contribution records, not cash, tokens, shares, or payout promises.";

export const GLUON_SHORT_BADGE = "Contribution identity only";

export const GLUON_PUBLIC_ALLOWED_FIELDS = [
  "displayId",
  "subtype",
  "subtypeLabel",
  "status",
  "statusLabel",
  "visibility",
  "visibilityLabel",
  "displayLabel",
  "shortDisclaimer",
  "disclaimer",
  "reviewedAt",
  "sourceType",
] as const;

export const GLUON_PUBLIC_FORBIDDEN_FIELDS = [
  "gvi",
  "GVI",
  "ues",
  "UES",
  "uesDelta",
  "trustImpact",
  "decayWeight",
  "informationalEstimate",
  "platformConversionRate",
  "redemptionPreview",
  "redemptionEstimate",
  "riskFlags",
  "auditTrail",
  "adminNotes",
  "formula",
  "calculationInputs",
  "rankingInternals",
  "ownerRisk",
  "fraudFlags",
  "conversionRate",
  "payoutEstimate",
  "cashoutEstimate",
  "tokenValue",
  "walletBalance",
] as const;

export type GluonSubtype = "genesis" | "genome" | "signal" | "packet" | "legacy";
export type GluonStatus = "pending" | "reviewed" | "archived" | "revoked";
export type GluonVisibility = "public" | "private" | "admin_reviewed" | "public_safe";

export type PublicGluonView = {
  displayId: string;
  subtype: GluonSubtype;
  subtypeLabel: string;
  status: GluonStatus;
  statusLabel: string;
  visibility: GluonVisibility;
  visibilityLabel: string;
  displayLabel: string;
  shortDisclaimer: string;
  disclaimer?: string;
  reviewedAt?: string | Date | null;
  sourceType?: string | null;
};

export type AdminGluonAnalysisView = PublicGluonView & {
  internalId?: string;
  ownerId?: string;
  sourceEventId?: string;
  contributionType?: string;
  trustImpact?: number;
  uesDelta?: number;
  gviReference?: number;
  evidenceIds?: string[];
  riskFlags?: string[];
  decayWeight?: number;
  informationalEstimate?: number;
  platformConversionRate?: number;
  redemptionPreview?: unknown;
  auditTrail?: unknown[];
  adminNotes?: string;
};

export const GLUON_SUBTYPE_LABELS: Record<GluonSubtype, string> = {
  genesis: "Genesis",
  genome: "Genome",
  signal: "Signal",
  packet: "Packet",
  legacy: "Legacy",
};

export const GLUON_STATUS_LABELS: Record<GluonStatus, string> = {
  pending: "Pending",
  reviewed: "Admin-reviewed",
  archived: "Archived",
  revoked: "Revoked",
};

export const GLUON_VISIBILITY_LABELS: Record<GluonVisibility, string> = {
  public: "Public",
  private: "Private",
  admin_reviewed: "Admin-reviewed",
  public_safe: "Public-safe",
};

const SUBTYPE_PREFIXES: Record<GluonSubtype, string> = {
  genesis: "GEN",
  genome: "GNM",
  signal: "SIG",
  packet: "PKT",
  legacy: "LEG",
};

const FORBIDDEN_FIELD_SET = new Set(GLUON_PUBLIC_FORBIDDEN_FIELDS.map((field) => field.toLowerCase()));

function stableNumber(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 1_000_000;
}

function normalizeSubtype(value: unknown, fallback: GluonSubtype = "legacy"): GluonSubtype {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized.includes("genesis")) return "genesis";
  if (normalized.includes("genome") || normalized.includes("dna")) return "genome";
  if (normalized.includes("signal") || normalized.includes("trust")) return "signal";
  if (normalized.includes("packet") || normalized.includes("knowledge")) return "packet";
  if (normalized.includes("legacy") || normalized.includes("import")) return "legacy";
  return fallback;
}

function normalizeStatus(value: unknown): GluonStatus {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (["accepted", "approved", "verified", "reviewed", "admin_reviewed", "supported"].includes(normalized)) return "reviewed";
  if (["archived", "retired"].includes(normalized)) return "archived";
  if (["revoked", "rejected", "blocked", "deleted"].includes(normalized)) return "revoked";
  return "pending";
}

function normalizeVisibility(value: unknown): GluonVisibility {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (["public_safe", "public-safe", "safe_public", "safe-public"].includes(normalized)) return "public_safe";
  if (normalized === "public") return "public";
  if (["admin_reviewed", "admin-reviewed", "internal", "reviewed"].includes(normalized)) return "admin_reviewed";
  return "private";
}

export function deriveGluonDisplayId(input: {
  subtype?: unknown;
  id?: unknown;
  internalId?: unknown;
  sourceEventId?: unknown;
  sourceId?: unknown;
  createdAt?: unknown;
}) {
  const subtype = normalizeSubtype(input.subtype);
  const seed = String(input.id ?? input.internalId ?? input.sourceEventId ?? input.sourceId ?? input.createdAt ?? `${subtype}:mougle`);
  const suffix = stableNumber(`${subtype}:${seed}`).toString().padStart(6, "0");
  return `${SUBTYPE_PREFIXES[subtype]}-${suffix}`;
}

export function toPublicGluonView(input: {
  displayId?: unknown;
  subtype?: unknown;
  status?: unknown;
  visibility?: unknown;
  id?: unknown;
  internalId?: unknown;
  sourceEventId?: unknown;
  sourceId?: unknown;
  createdAt?: unknown;
  reviewedAt?: unknown;
  sourceType?: unknown;
} = {}): PublicGluonView {
  const subtype = normalizeSubtype(input.subtype);
  const status = normalizeStatus(input.status);
  const visibility = normalizeVisibility(input.visibility);
  const displayId = typeof input.displayId === "string" && input.displayId.trim()
    ? input.displayId.trim()
    : deriveGluonDisplayId({ ...input, subtype });

  return {
    displayId,
    subtype,
    subtypeLabel: GLUON_SUBTYPE_LABELS[subtype],
    status,
    statusLabel: GLUON_STATUS_LABELS[status],
    visibility,
    visibilityLabel: GLUON_VISIBILITY_LABELS[visibility],
    displayLabel: `${GLUON_SUBTYPE_LABELS[subtype]} ID: ${displayId}`,
    shortDisclaimer: GLUON_SHORT_BADGE,
    disclaimer: GLUON_PUBLIC_DISCLAIMER,
    reviewedAt: input.reviewedAt as string | Date | null | undefined,
    sourceType: typeof input.sourceType === "string" ? input.sourceType : null,
  };
}

export function toAdminGluonAnalysisView(input: Partial<AdminGluonAnalysisView> & {
  displayId?: unknown;
  subtype?: unknown;
  status?: unknown;
  visibility?: unknown;
  id?: unknown;
  internalId?: unknown;
  sourceEventId?: unknown;
  sourceId?: unknown;
  createdAt?: unknown;
  reviewedAt?: unknown;
  sourceType?: unknown;
} = {}): AdminGluonAnalysisView {
  const publicView = toPublicGluonView(input);
  return {
    ...publicView,
    internalId: typeof input.internalId === "string" ? input.internalId : undefined,
    ownerId: typeof input.ownerId === "string" ? input.ownerId : undefined,
    sourceEventId: typeof input.sourceEventId === "string" ? input.sourceEventId : undefined,
    contributionType: typeof input.contributionType === "string" ? input.contributionType : undefined,
    trustImpact: input.trustImpact,
    uesDelta: input.uesDelta,
    gviReference: input.gviReference,
    evidenceIds: input.evidenceIds,
    riskFlags: input.riskFlags,
    decayWeight: input.decayWeight,
    informationalEstimate: input.informationalEstimate,
    platformConversionRate: input.platformConversionRate,
    redemptionPreview: input.redemptionPreview,
    auditTrail: input.auditTrail,
    adminNotes: input.adminNotes,
  };
}

export function stripPublicGluonForbiddenFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripPublicGluonForbiddenFields(item)) as T;
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_FIELD_SET.has(key.toLowerCase())) continue;
    output[key] = stripPublicGluonForbiddenFields(nestedValue);
  }
  return output as T;
}
