/**
 * T10 — Cost Control safety tests.
 *
 * Invariants this test guards:
 *   - paused state blocks every cost kind
 *   - resume + no broadcast/brief => allowed (within caps)
 *   - cost_events table is treated as immutable from the application layer
 *     (service exports no update/delete paths; routes do not write
 *     UPDATE/DELETE statements against cost_events)
 *   - unknown kinds are rejected
 *   - read-only preview (skipAudit) does NOT append to cost_events
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canSpend,
  pausePaidApis,
  resumePaidApis,
  getPolicy,
  updatePolicy,
  listRecentEvents,
  CostControlError,
  costControlService,
} from "../../server/services/cost-control-service";
import { COST_KINDS } from "../../shared/schema";

const SERVICE_PATH = resolve(process.cwd(), "server/services/cost-control-service.ts");
const ROUTES_PATH = resolve(process.cwd(), "server/routes/cost.ts");

let originalPaused = true;
let originalDailyCap = 5;
let originalMonthlyCap = 100;

describe("cost control — service surface", () => {
  before(async () => {
    const p = await getPolicy();
    originalPaused = p.paidApisPaused;
    originalDailyCap = p.dailyCapUsd;
    originalMonthlyCap = p.monthlyCapUsd;
  });

  after(async () => {
    await updatePolicy({
      paidApisPaused: originalPaused,
      dailyCapUsd: originalDailyCap,
      monthlyCapUsd: originalMonthlyCap,
      updatedBy: "safety_test_cleanup",
    });
  });

  it("exposes the documented public API", () => {
    assert.equal(typeof costControlService.canSpend, "function");
    assert.equal(typeof costControlService.assertCanSpend, "function");
    assert.equal(typeof costControlService.getPolicy, "function");
    assert.equal(typeof costControlService.updatePolicy, "function");
    assert.equal(typeof costControlService.pausePaidApis, "function");
    assert.equal(typeof costControlService.resumePaidApis, "function");
    assert.equal(typeof costControlService.listRecentEvents, "function");
  });

  it("does not export any update or delete cost-event mutator", () => {
    const exported = Object.keys(costControlService);
    for (const name of exported) {
      const lc = name.toLowerCase();
      assert.ok(
        !(lc.includes("updateevent") || lc.includes("deleteevent") || lc.includes("removeevent")),
        `cost service exposes a mutation on events: ${name}`,
      );
    }
  });
});

describe("cost control — gating semantics", () => {
  it("rejects unknown cost kinds", async () => {
    await assert.rejects(
      // @ts-expect-error - intentionally invalid kind
      () => canSpend({ kind: "this_kind_does_not_exist" }),
      (err: unknown) => {
        assert.ok(err instanceof CostControlError);
        assert.equal((err as CostControlError).code, "invalid_kind");
        return true;
      },
    );
  });

  it("paused state blocks every documented kind", async () => {
    await pausePaidApis("safety_test");
    for (const kind of COST_KINDS) {
      const r = await canSpend({ kind, skipAudit: true, estUsd: 0 });
      assert.equal(r.allowed, false, `kind ${kind} should be blocked when paused`);
      assert.ok(
        r.reasons.includes("paid_apis_paused"),
        `kind ${kind} should report paid_apis_paused (got ${r.reasons.join(",")})`,
      );
    }
  });

  it("resume + within caps + no brief/broadcast => allowed", async () => {
    await updatePolicy({
      paidApisPaused: false,
      dailyCapUsd: 100,
      monthlyCapUsd: 1000,
      updatedBy: "safety_test",
    });
    const r = await canSpend({ kind: "broll_paid", estUsd: 0.01, skipAudit: true });
    assert.equal(r.allowed, true, `expected allow, got reasons=${r.reasons.join(",")}`);
  });

  it("missing broadcast id is reported as broadcast_not_found", async () => {
    await updatePolicy({ paidApisPaused: false, updatedBy: "safety_test" });
    const r = await canSpend({
      kind: "broadcast_full",
      broadcastId: "00000000-0000-0000-0000-000000000000",
      skipAudit: true,
    });
    assert.equal(r.allowed, false);
    assert.ok(r.reasons.includes("broadcast_not_found"));
  });

  it("missing brief id is reported as brief_not_found", async () => {
    await updatePolicy({ paidApisPaused: false, updatedBy: "safety_test" });
    const r = await canSpend({
      kind: "broll_paid",
      briefId: "00000000-0000-0000-0000-000000000000",
      skipAudit: true,
    });
    assert.equal(r.allowed, false);
    assert.ok(r.reasons.includes("brief_not_found"));
  });

  it("daily cap exceeded fires when est pushes us over", async () => {
    await updatePolicy({
      paidApisPaused: false,
      dailyCapUsd: 0.01,
      monthlyCapUsd: 1000,
      updatedBy: "safety_test",
    });
    const r = await canSpend({ kind: "broll_paid", estUsd: 5, skipAudit: true });
    assert.equal(r.allowed, false);
    assert.ok(r.reasons.includes("daily_cap_exceeded"));
  });
});

describe("cost control — audit immutability", () => {
  it("skipAudit=true does not append to cost_events", async () => {
    const before = await listRecentEvents(5);
    await canSpend({ kind: "broll_paid", estUsd: 0, skipAudit: true });
    const after = await listRecentEvents(5);
    assert.deepEqual(
      after.map((e) => e.id),
      before.map((e) => e.id),
      "preview path must not write to cost_events",
    );
  });

  it("service source code contains no UPDATE/DELETE against cost_events", () => {
    const src = readFileSync(SERVICE_PATH, "utf8");
    assert.ok(
      !/update\s*\(\s*costEvents\s*\)/i.test(src),
      "service must not call db.update(costEvents)",
    );
    assert.ok(
      !/delete\s*\(\s*costEvents\s*\)/i.test(src),
      "service must not call db.delete(costEvents)",
    );
  });

  it("route source code contains no UPDATE/DELETE against cost_events", () => {
    const src = readFileSync(ROUTES_PATH, "utf8");
    assert.ok(
      !/update\s*\(\s*costEvents\s*\)/i.test(src),
      "routes must not call db.update(costEvents)",
    );
    assert.ok(
      !/delete\s*\(\s*costEvents\s*\)/i.test(src),
      "routes must not call db.delete(costEvents)",
    );
    assert.ok(
      !/app\.(delete|put|patch)\([^)]*cost\/events/i.test(src),
      "routes must not expose UPDATE/DELETE/PUT/PATCH on /cost/events",
    );
  });
});
