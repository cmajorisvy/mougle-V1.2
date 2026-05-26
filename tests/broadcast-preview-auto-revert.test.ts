import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isPreviewInPast,
  revertExpiredPreviewState,
  applyScheduledPreviewToUrl,
  shouldShowSharedPreviewBanner,
  previewExpiresSoon,
  PREVIEW_EXPIRES_SOON_THRESHOLD_MS,
  SCHEDULED_PREVIEW_URL_PARAM,
  type SharedPreviewState,
} from "../client/src/pages/admin/scheduledPreviewAutoRevert";

// T289 — Regression coverage for T287's auto-revert behavior on the
// shared scheduled-preview banner / amber indicator in `BroadcastPreview`.
// Without these guards a future refactor of the preview state could
// silently keep stale banners on screen even after the previewed moment
// slipped into the past — exactly the bug T287 originally fixed.

// Simulates the React state + ticking clock without actually mounting
// the component: we drive the `scheduleNow` value forward and apply the
// same effect rule the component uses (revert when previewIsInPast).
function tickAndMaybeRevert(
  state: SharedPreviewState,
  scheduleNow: Date,
  url: URL,
): { state: SharedPreviewState; url: URL; reverted: boolean } {
  let next = state;
  let nextUrl = url;
  let reverted = false;
  if (isPreviewInPast(state.scheduledPreviewAt, scheduleNow)) {
    next = revertExpiredPreviewState();
    reverted = true;
  }
  // Mirrors the URL-sync effect in BroadcastPreview, which runs whenever
  // scheduledPreviewAt changes.
  nextUrl = applyScheduledPreviewToUrl(
    new URL(nextUrl.toString()),
    next.scheduledPreviewAt,
  );
  return { state: next, url: nextUrl, reverted };
}

const BASE_URL = "https://app.example/admin/broadcasts";

describe("scheduled preview auto-revert — pure helpers", () => {
  it("isPreviewInPast returns false when no preview is set", () => {
    assert.equal(isPreviewInPast(null, new Date()), false);
  });

  it("isPreviewInPast returns false when preview is in the future", () => {
    const now = new Date("2026-05-18T10:00:00Z");
    const future = new Date("2026-05-18T11:00:00Z");
    assert.equal(isPreviewInPast(future, now), false);
  });

  it("isPreviewInPast returns true when preview equals or is before now", () => {
    const now = new Date("2026-05-18T10:00:00Z");
    assert.equal(isPreviewInPast(now, now), true);
    const past = new Date("2026-05-18T09:00:00Z");
    assert.equal(isPreviewInPast(past, now), true);
  });

  it("revertExpiredPreviewState resets all three pieces of preview state", () => {
    const reset = revertExpiredPreviewState();
    assert.equal(reset.scheduledPreviewAt, null);
    assert.equal(reset.previewSource, null);
    assert.equal(reset.sharedBannerDismissed, false);
  });

  it("applyScheduledPreviewToUrl removes the query param when preview is null", () => {
    const url = new URL(`${BASE_URL}?${SCHEDULED_PREVIEW_URL_PARAM}=2026-05-18T11%3A00%3A00.000Z&other=1`);
    applyScheduledPreviewToUrl(url, null);
    assert.equal(url.searchParams.has(SCHEDULED_PREVIEW_URL_PARAM), false);
    assert.equal(url.searchParams.get("other"), "1");
  });

  it("applyScheduledPreviewToUrl writes the ISO timestamp when a preview is set", () => {
    const url = new URL(BASE_URL);
    const at = new Date("2026-05-18T11:00:00Z");
    applyScheduledPreviewToUrl(url, at);
    assert.equal(
      url.searchParams.get(SCHEDULED_PREVIEW_URL_PARAM),
      at.toISOString(),
    );
  });

  it("shouldShowSharedPreviewBanner only fires for URL-sourced previews that aren't dismissed", () => {
    const at = new Date("2026-05-18T11:00:00Z");
    assert.equal(
      shouldShowSharedPreviewBanner({
        scheduledPreviewAt: at,
        previewSource: "url",
        sharedBannerDismissed: false,
      }),
      true,
    );
    assert.equal(
      shouldShowSharedPreviewBanner({
        scheduledPreviewAt: at,
        previewSource: "picker",
        sharedBannerDismissed: false,
      }),
      false,
    );
    assert.equal(
      shouldShowSharedPreviewBanner({
        scheduledPreviewAt: at,
        previewSource: "url",
        sharedBannerDismissed: true,
      }),
      false,
    );
    assert.equal(
      shouldShowSharedPreviewBanner({
        scheduledPreviewAt: null,
        previewSource: "url",
        sharedBannerDismissed: false,
      }),
      false,
    );
  });
});

describe("previewExpiresSoon — copy-link warning window (T294)", () => {
  const now = new Date("2026-05-18T10:00:00Z");

  it("returns false when no preview is set", () => {
    assert.equal(previewExpiresSoon(null, now), false);
  });

  it("returns false when the preview is already in the past", () => {
    const past = new Date(now.getTime() - 60_000);
    assert.equal(previewExpiresSoon(past, now), false);
  });

  it("returns false when the preview is exactly now (auto-revert handles it)", () => {
    assert.equal(previewExpiresSoon(now, now), false);
  });

  it("returns true when the preview is within the 5-minute window", () => {
    const soon = new Date(now.getTime() + 2 * 60_000);
    assert.equal(previewExpiresSoon(soon, now), true);
  });

  it("returns false when the preview is comfortably outside the window", () => {
    const later = new Date(now.getTime() + 30 * 60_000);
    assert.equal(previewExpiresSoon(later, now), false);
  });

  it("returns false at exactly the threshold boundary", () => {
    const atBoundary = new Date(now.getTime() + PREVIEW_EXPIRES_SOON_THRESHOLD_MS);
    assert.equal(previewExpiresSoon(atBoundary, now), false);
  });

  it("honors a caller-provided threshold override", () => {
    const tenMinutesOut = new Date(now.getTime() + 10 * 60_000);
    assert.equal(previewExpiresSoon(tenMinutesOut, now), false);
    assert.equal(previewExpiresSoon(tenMinutesOut, now, 15 * 60_000), true);
  });

  it("exposes a single named constant for the threshold", () => {
    assert.equal(PREVIEW_EXPIRES_SOON_THRESHOLD_MS, 5 * 60 * 1000);
  });
});

describe("scheduled preview auto-revert — URL-shared source", () => {
  it("clears banner, amber indicator, and ?scheduledPreviewAt once the moment passes", () => {
    const previewedAt = new Date("2026-05-18T11:00:00Z");
    let state: SharedPreviewState = {
      scheduledPreviewAt: previewedAt,
      previewSource: "url",
      sharedBannerDismissed: false,
    };
    let url = new URL(BASE_URL);
    url = applyScheduledPreviewToUrl(url, state.scheduledPreviewAt);

    // Sanity check before time advances: banner is visible, the indicator
    // would show as "live future preview" (not in the past), and the URL
    // carries the shareable param.
    assert.equal(shouldShowSharedPreviewBanner(state), true);
    assert.equal(
      isPreviewInPast(state.scheduledPreviewAt, new Date("2026-05-18T10:59:00Z")),
      false,
    );
    assert.equal(
      url.searchParams.get(SCHEDULED_PREVIEW_URL_PARAM),
      previewedAt.toISOString(),
    );

    // Advance the live clock past the previewed moment.
    const tick = tickAndMaybeRevert(
      state,
      new Date("2026-05-18T11:00:30Z"),
      url,
    );
    state = tick.state;
    url = tick.url;

    assert.equal(tick.reverted, true);
    // Banner is gone.
    assert.equal(shouldShowSharedPreviewBanner(state), false);
    // Amber-indicator state collapses to "live" — derived from
    // scheduledPreviewAt being null.
    assert.equal(
      isPreviewInPast(state.scheduledPreviewAt, new Date("2026-05-18T11:00:30Z")),
      false,
    );
    assert.equal(state.scheduledPreviewAt, null);
    assert.equal(state.previewSource, null);
    assert.equal(state.sharedBannerDismissed, false);
    // URL param is cleared so a subsequent "Copy link" yields a live link.
    assert.equal(url.searchParams.has(SCHEDULED_PREVIEW_URL_PARAM), false);
  });

  it("does not revert while the previewed moment is still in the future", () => {
    const state: SharedPreviewState = {
      scheduledPreviewAt: new Date("2026-05-18T12:00:00Z"),
      previewSource: "url",
      sharedBannerDismissed: false,
    };
    const url = applyScheduledPreviewToUrl(new URL(BASE_URL), state.scheduledPreviewAt);
    const tick = tickAndMaybeRevert(state, new Date("2026-05-18T10:00:00Z"), url);
    assert.equal(tick.reverted, false);
    assert.equal(tick.state.scheduledPreviewAt?.toISOString(), state.scheduledPreviewAt!.toISOString());
    assert.equal(tick.state.previewSource, "url");
    assert.equal(
      tick.url.searchParams.get(SCHEDULED_PREVIEW_URL_PARAM),
      state.scheduledPreviewAt!.toISOString(),
    );
    assert.equal(shouldShowSharedPreviewBanner(tick.state), true);
  });
});

describe("scheduled preview auto-revert — picker source", () => {
  it("clears the picker-set preview and amber indicator once the moment passes", () => {
    const previewedAt = new Date("2026-05-18T11:00:00Z");
    let state: SharedPreviewState = {
      scheduledPreviewAt: previewedAt,
      previewSource: "picker",
      sharedBannerDismissed: false,
    };
    // Picker source never wrote the URL param via a user-shared link, but the
    // component still mirrors any active preview to the URL — match that.
    let url = applyScheduledPreviewToUrl(new URL(BASE_URL), state.scheduledPreviewAt);

    // Before the tick: no banner (picker source) but the amber indicator
    // would not yet flag "in the past."
    assert.equal(shouldShowSharedPreviewBanner(state), false);
    assert.equal(
      isPreviewInPast(state.scheduledPreviewAt, new Date("2026-05-18T10:59:00Z")),
      false,
    );

    const tick = tickAndMaybeRevert(
      state,
      new Date("2026-05-18T11:00:30Z"),
      url,
    );
    state = tick.state;
    url = tick.url;

    assert.equal(tick.reverted, true);
    assert.equal(state.scheduledPreviewAt, null);
    assert.equal(state.previewSource, null);
    assert.equal(state.sharedBannerDismissed, false);
    assert.equal(
      isPreviewInPast(state.scheduledPreviewAt, new Date("2026-05-18T11:00:30Z")),
      false,
    );
    assert.equal(shouldShowSharedPreviewBanner(state), false);
    assert.equal(url.searchParams.has(SCHEDULED_PREVIEW_URL_PARAM), false);
  });
});
