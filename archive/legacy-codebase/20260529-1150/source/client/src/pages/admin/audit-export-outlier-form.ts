export interface AuditExportOutlierFormState {
  enabled: boolean;
  windowSizeText: string;
  medianMultiplierText: string;
  minSampleSizeText: string;
  minTotalRowCountText: string;
}

export interface AuditExportOutlierPutPayload {
  enabled: boolean;
  windowSize: number;
  medianMultiplier: number;
  minSampleSize: number;
  minTotalRowCount: number;
}

export const AUDIT_EXPORT_OUTLIER_ERRORS = {
  windowSize: "Window size must be an integer between 5 and 1000.",
  medianMultiplier: "Median multiplier must be between 2 and 1000.",
  minSampleSize: "Minimum sample size must be an integer between 2 and 1000.",
  minTotalRowCount:
    "Minimum total row count must be between 0 and 1,000,000,000.",
} as const;

export function buildAuditExportOutlierPayload(
  state: AuditExportOutlierFormState,
): AuditExportOutlierPutPayload {
  const windowSize = Math.floor(Number(state.windowSizeText));
  const medianMultiplier = Number(state.medianMultiplierText);
  const minSampleSize = Math.floor(Number(state.minSampleSizeText));
  const minTotalRowCount = Math.floor(Number(state.minTotalRowCountText));
  if (!Number.isFinite(windowSize) || windowSize < 5 || windowSize > 1000) {
    throw new Error(AUDIT_EXPORT_OUTLIER_ERRORS.windowSize);
  }
  if (
    !Number.isFinite(medianMultiplier) ||
    medianMultiplier < 2 ||
    medianMultiplier > 1000
  ) {
    throw new Error(AUDIT_EXPORT_OUTLIER_ERRORS.medianMultiplier);
  }
  if (
    !Number.isFinite(minSampleSize) ||
    minSampleSize < 2 ||
    minSampleSize > 1000
  ) {
    throw new Error(AUDIT_EXPORT_OUTLIER_ERRORS.minSampleSize);
  }
  if (
    !Number.isFinite(minTotalRowCount) ||
    minTotalRowCount < 0 ||
    minTotalRowCount > 1_000_000_000
  ) {
    throw new Error(AUDIT_EXPORT_OUTLIER_ERRORS.minTotalRowCount);
  }
  return {
    enabled: state.enabled,
    windowSize,
    medianMultiplier,
    minSampleSize,
    minTotalRowCount,
  };
}

export const AUDIT_EXPORT_OUTLIER_CONFIG_URL =
  "/api/admin/newsroom/audience/export-outlier-config";
