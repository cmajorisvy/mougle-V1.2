import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  registerShutdown,
  runShutdownRegistry,
  getRegisteredShutdowns,
  __resetShutdownRegistryForTests,
} from "../server/services/shutdown-registry";

describe("shutdown-registry", () => {
  beforeEach(() => __resetShutdownRegistryForTests());

  it("invokes registered stoppers in reverse registration order", async () => {
    const order: string[] = [];
    registerShutdown("a", () => { order.push("a"); });
    registerShutdown("b", async () => { order.push("b"); });
    registerShutdown("c", () => { order.push("c"); });
    await runShutdownRegistry(1000);
    assert.deepEqual(order, ["c", "b", "a"]);
  });

  it("continues even if one stopper throws", async () => {
    const order: string[] = [];
    registerShutdown("ok1", () => { order.push("ok1"); });
    registerShutdown("boom", () => { throw new Error("nope"); });
    registerShutdown("ok2", () => { order.push("ok2"); });
    await runShutdownRegistry(1000);
    assert.deepEqual(order, ["ok2", "ok1"]);
  });

  it("times out a hanging stopper without blocking others", async () => {
    const order: string[] = [];
    registerShutdown("fast", () => { order.push("fast"); });
    registerShutdown("hang", () => new Promise<void>(() => { /* never */ }));
    const start = Date.now();
    await runShutdownRegistry(50);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 500, `expected fast exit, took ${elapsed}ms`);
    assert.deepEqual(order, ["fast"]);
  });

  it("is idempotent — second run does nothing", async () => {
    const order: string[] = [];
    registerShutdown("once", () => { order.push("once"); });
    await runShutdownRegistry(100);
    await runShutdownRegistry(100);
    assert.deepEqual(order, ["once"]);
  });

  it("getRegisteredShutdowns reflects registration", () => {
    registerShutdown("x", () => {});
    registerShutdown("y", () => {});
    assert.deepEqual(getRegisteredShutdowns(), ["x", "y"]);
  });
});
