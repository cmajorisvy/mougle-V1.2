// T289 — Pure helpers extracted from `BroadcastPreview.tsx` so the
// shared scheduled-preview auto-revert behavior (T287) is unit-testable.
// The component owns the actual React state, but the *rules* — when a
// preview snapshot is considered expired, what the reset state looks
// like, how the URL parameter is mirrored, and when the shared banner
// should render — live here so a regression like "banner stays up after
// the previewed moment passes" is caught by `tests/`.

export type PreviewSource = "url" | "picker" | null;

export interface SharedPreviewState {
  scheduledPreviewAt: Date | null;
  previewSource: PreviewSource;
  sharedBannerDismissed: boolean;
}

export const SCHEDULED_PREVIEW_URL_PARAM = "scheduledPreviewAt";

export function isPreviewInPast(
  scheduledPreviewAt: Date | null,
  scheduleNow: Date,
): boolean {
  return (
    scheduledPreviewAt !== null &&
    scheduledPreviewAt.getTime() <= scheduleNow.getTime()
  );
}

export function revertExpiredPreviewState(): SharedPreviewState {
  return {
    scheduledPreviewAt: null,
    previewSource: null,
    sharedBannerDismissed: false,
  };
}

export function applyScheduledPreviewToUrl(
  url: URL,
  scheduledPreviewAt: Date | null,
): URL {
  if (scheduledPreviewAt) {
    url.searchParams.set(
      SCHEDULED_PREVIEW_URL_PARAM,
      scheduledPreviewAt.toISOString(),
    );
  } else {
    url.searchParams.delete(SCHEDULED_PREVIEW_URL_PARAM);
  }
  return url;
}

// T294 — When an admin copies a scheduled-preview link whose moment is only
// a few minutes away, the recipient may open it after the moment has already
// passed and silently land on the live rotation (see T287 auto-revert). Warn
// at copy time when the preview is within this window of "now".
export const PREVIEW_EXPIRES_SOON_THRESHOLD_MS = 5 * 60 * 1000;

export function previewExpiresSoon(
  scheduledPreviewAt: Date | null,
  scheduleNow: Date,
  thresholdMs: number = PREVIEW_EXPIRES_SOON_THRESHOLD_MS,
): boolean {
  if (scheduledPreviewAt === null) return false;
  const delta = scheduledPreviewAt.getTime() - scheduleNow.getTime();
  return delta > 0 && delta < thresholdMs;
}

export function shouldShowSharedPreviewBanner(
  state: SharedPreviewState,
): boolean {
  return (
    state.scheduledPreviewAt !== null &&
    state.previewSource === "url" &&
    !state.sharedBannerDismissed
  );
}
