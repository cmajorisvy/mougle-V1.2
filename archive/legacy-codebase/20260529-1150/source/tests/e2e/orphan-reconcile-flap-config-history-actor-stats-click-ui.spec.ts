/**
 * Task #857 — Browser-level UI test for the Task #848 "Top changers"
 * leaderboard on OrphanReconcilePanel.
 *
 * Task #852 added server-side coverage for the change leaderboard, but the
 * click-to-filter UX (clicking a leaderboard row pre-fills the audit-card
 * actor filter) was still only manually tested. This spec covers:
 *   - Clicking a row whose `actorUserId` is a real user populates the audit
 *     filter input with that exact actor id and re-issues the history-audit
 *     request with `?actorUserId=<id>`.
 *   - Clicking a row whose `actorUserId` is null populates the input with
 *     the literal "system" — matching the label the leaderboard surfaces
 *     for null-actor rows — and re-issues the history-audit request with
 *     `?actorUserId=system`.
 */

import { test, expect, type Route } from "@playwright/test";

type ActorStatRow = {
  actorUserId: string | null;
  changeCount: number;
  lastChangeAt: string;
};

type FlapHistoryAuditItem = {
  id: string;
  occurredAt: string;
  updatedBy: string | null;
  action: "updated" | "restored_default";
  previousConfig: { flappingThreshold: number; flappingWindowMs: number } | null;
  newConfig: { flappingThreshold: number; flappingWindowMs: number } | null;
  changedFields: Array<"flappingThreshold" | "flappingWindowMs">;
};

const HISTORY_AUDIT_URL =
  "**/api/admin/production-assets/orphans/sweep/flapping/config-history?**";
const HISTORY_AUDIT_URL_NOQ =
  "**/api/admin/production-assets/orphans/sweep/flapping/config-history";
const ACTOR_STATS_URL =
  "**/api/admin/production-assets/orphans/sweep/flapping/config-history/actor-stats**";

test.describe("Task #857 — top-changer click applies audit filter", () => {
  test("clicking a leaderboard row prefills the audit actor filter (real actor + null actor)", async ({
    page,
  }) => {
    const historyRequests: Array<{ url: string; actorUserId: string | null }> = [];

    // (a) Broadest admin catch-all so unrelated cards don't crash the page.
    await page.route("**/api/admin/**", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    // (b) production-assets fallback — empty list payload.
    await page.route(
      "**/api/admin/production-assets**",
      async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            items: [],
            total: 0,
            limit: 20,
            offset: 0,
          }),
        });
      },
    );

    // (c) CSRF.
    await page.route("**/api/auth/csrf-token", async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ csrfToken: "test-csrf-token" }),
      });
    });

    // (d) Sweep status — minimal payload.
    await page.route(
      "**/api/admin/production-assets/orphan-sweep/status",
      async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            status: {
              lastScanAt: null,
              lastOrphanCount: 0,
              threshold: 5,
              wasAboveThreshold: false,
              nextScanAt: null,
              intervalMs: null,
              lastAutoResolvedAt: null,
              lastAutoResolvedCount: null,
              flapping: false,
              flappingCount: 0,
              flappingWindowMs: 60 * 60 * 1000,
              flappingThreshold: 3,
            },
          }),
        });
      },
    );

    // (e) Orphans list — empty so we don't have to stub per-row endpoints.
    await page.route(
      "**/api/admin/production-assets/orphans/list",
      async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, items: [] }),
        });
      },
    );

    // (f) Actor-stats leaderboard — two rows: one real actor, one null.
    const actorStatsRows: ActorStatRow[] = [
      {
        actorUserId: "root-admin",
        changeCount: 4,
        lastChangeAt: "2026-05-22T11:00:00.000Z",
      },
      {
        actorUserId: null,
        changeCount: 2,
        lastChangeAt: "2026-05-22T10:00:00.000Z",
      },
    ];
    await page.route(ACTOR_STATS_URL, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, items: actorStatsRows }),
      });
    });

    // (g) History audit endpoint — capture the actor filter on every fetch.
    const auditRow: FlapHistoryAuditItem = {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      occurredAt: "2026-05-22T12:00:00.000Z",
      updatedBy: "root-admin",
      action: "updated",
      previousConfig: { flappingThreshold: 3, flappingWindowMs: 60 * 60 * 1000 },
      newConfig: { flappingThreshold: 4, flappingWindowMs: 60 * 60 * 1000 },
      changedFields: ["flappingThreshold"],
    };
    const handleHistoryAudit = async (route: Route) => {
      const u = new URL(route.request().url());
      historyRequests.push({
        url: u.pathname + u.search,
        actorUserId: u.searchParams.get("actorUserId"),
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          items: [auditRow],
          limit: Number(u.searchParams.get("limit") ?? "10"),
        }),
      });
    };
    await page.route(HISTORY_AUDIT_URL_NOQ, handleHistoryAudit);
    await page.route(HISTORY_AUDIT_URL, handleHistoryAudit);

    await page.goto("/admin/3d-assets", { waitUntil: "domcontentloaded" });

    // The leaderboard mounts and renders both rows.
    await expect(
      page.getByTestId("card-flap-config-history-actor-stats"),
    ).toBeVisible();
    const list = page.getByTestId("list-flap-config-history-actor-stats");
    await expect(list).toBeVisible();
    await expect(
      page.getByTestId("flap-config-history-actor-stats-row-root-admin"),
    ).toBeVisible();
    await expect(
      page.getByTestId("flap-config-history-actor-stats-row-__system__"),
    ).toBeVisible();

    // Audit filter input starts empty.
    const actorInput = page.getByTestId("input-flap-config-history-audit-actor");
    await expect(actorInput).toHaveValue("");

    // Wait for the initial history-audit request (no actor filter yet).
    await expect.poll(() => historyRequests.length).toBeGreaterThanOrEqual(1);
    expect(historyRequests[0].actorUserId).toBeNull();

    // --- Click the first (real-actor) row. ---
    const beforeRealActorCount = historyRequests.length;
    await page
      .getByTestId("button-flap-config-history-actor-stats-apply-root-admin")
      .click();

    // The audit filter input is populated with that row's actorUserId.
    await expect(actorInput).toHaveValue("root-admin");
    // The "Filtering by actor …" hint reflects the same value.
    await expect(
      page.getByTestId("text-flap-config-history-audit-actor-filter"),
    ).toContainText("root-admin");
    // And the history-audit request re-fires with ?actorUserId=root-admin.
    await expect
      .poll(() => historyRequests.length, {
        message:
          "history-audit must re-fire after clicking a leaderboard row",
      })
      .toBeGreaterThan(beforeRealActorCount);
    expect(historyRequests[historyRequests.length - 1].actorUserId).toBe(
      "root-admin",
    );

    // --- Click the null-actor row. ---
    const beforeNullActorCount = historyRequests.length;
    await page
      .getByTestId("button-flap-config-history-actor-stats-apply-__system__")
      .click();

    // The filter input is populated with the literal "system" — matching the
    // label the leaderboard surfaces for null-actor rows.
    await expect(actorInput).toHaveValue("system");
    await expect(
      page.getByTestId("text-flap-config-history-audit-actor-filter"),
    ).toContainText("system");
    await expect
      .poll(() => historyRequests.length, {
        message:
          "history-audit must re-fire after clicking the null-actor row",
      })
      .toBeGreaterThan(beforeNullActorCount);
    expect(historyRequests[historyRequests.length - 1].actorUserId).toBe(
      "system",
    );

    // --- Task #860 — the null-actor row is now the active filter, so its
    // button must be marked aria-pressed=true and its row data-active=true,
    // while the other (non-matching) row stays aria-pressed=false. ---
    const systemRow = page.getByTestId(
      "flap-config-history-actor-stats-row-__system__",
    );
    const systemButton = page.getByTestId(
      "button-flap-config-history-actor-stats-apply-__system__",
    );
    const realActorRow = page.getByTestId(
      "flap-config-history-actor-stats-row-root-admin",
    );
    const realActorButton = page.getByTestId(
      "button-flap-config-history-actor-stats-apply-root-admin",
    );
    await expect(systemRow).toHaveAttribute("data-active", "true");
    await expect(systemButton).toHaveAttribute("aria-pressed", "true");
    await expect(realActorRow).toHaveAttribute("data-active", "false");
    await expect(realActorButton).toHaveAttribute("aria-pressed", "false");

    // --- Task #860 — clicking the already-active null-actor row a second
    // time must clear the filter (toggle back to "any actor"), re-fire the
    // history-audit request without an actorUserId param, drop the
    // "Filtering by actor" hint, and reset the row to aria-pressed=false. ---
    const beforeToggleOffCount = historyRequests.length;
    await systemButton.click();
    await expect(actorInput).toHaveValue("");
    await expect(
      page.getByTestId("text-flap-config-history-audit-actor-filter"),
    ).toHaveCount(0);
    await expect
      .poll(() => historyRequests.length, {
        message:
          "history-audit must re-fire after toggling the leaderboard row off",
      })
      .toBeGreaterThan(beforeToggleOffCount);
    expect(historyRequests[historyRequests.length - 1].actorUserId).toBeNull();
    await expect(systemRow).toHaveAttribute("data-active", "false");
    await expect(systemButton).toHaveAttribute("aria-pressed", "false");
    await expect(realActorRow).toHaveAttribute("data-active", "false");
    await expect(realActorButton).toHaveAttribute("aria-pressed", "false");

    // --- Task #860 — re-applying the real-actor row activates only that
    // row, then clicking it again toggles it back off, end-to-end. ---
    const beforeReApplyCount = historyRequests.length;
    await realActorButton.click();
    await expect(actorInput).toHaveValue("root-admin");
    await expect
      .poll(() => historyRequests.length)
      .toBeGreaterThan(beforeReApplyCount);
    expect(historyRequests[historyRequests.length - 1].actorUserId).toBe(
      "root-admin",
    );
    await expect(realActorRow).toHaveAttribute("data-active", "true");
    await expect(realActorButton).toHaveAttribute("aria-pressed", "true");
    await expect(systemRow).toHaveAttribute("data-active", "false");
    await expect(systemButton).toHaveAttribute("aria-pressed", "false");

    const beforeRealToggleOffCount = historyRequests.length;
    await realActorButton.click();
    await expect(actorInput).toHaveValue("");
    await expect
      .poll(() => historyRequests.length)
      .toBeGreaterThan(beforeRealToggleOffCount);
    expect(historyRequests[historyRequests.length - 1].actorUserId).toBeNull();
    await expect(realActorRow).toHaveAttribute("data-active", "false");
    await expect(realActorButton).toHaveAttribute("aria-pressed", "false");
  });
});
