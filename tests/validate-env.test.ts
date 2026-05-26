import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateEnv } from "../server/config/validate-env";

function baseProdEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://x",
    SESSION_SECRET: "s",
    OPENAI_API_KEY: "k",
    ADMIN_USERNAME: "u",
    ADMIN_PASSWORD_HASH: "$2b$xxx",
    REPLIT_OBJECT_STORAGE_BUCKET_ID: "bucket",
  };
}

describe("validateEnv", () => {
  it("returns ok when all required production env vars are set", () => {
    const r = validateEnv(baseProdEnv());
    assert.equal(r.level, "ok");
    assert.equal(r.issues.length, 0);
    assert.equal(r.productionMode, true);
  });

  it("flags missing OPENAI_API_KEY as fatal in production", () => {
    const env = baseProdEnv();
    delete env.OPENAI_API_KEY;
    const r = validateEnv(env);
    assert.equal(r.level, "fatal");
    assert.ok(r.issues.some((i) => i.code === "missing_openai_api_key"));
  });

  it("accepts AI_INTEGRATIONS_OPENAI_API_KEY as an alias", () => {
    const env = baseProdEnv();
    delete env.OPENAI_API_KEY;
    env.AI_INTEGRATIONS_OPENAI_API_KEY = "k2";
    const r = validateEnv(env);
    assert.equal(r.level, "ok");
  });

  it("flags missing persistent storage as fatal in production", () => {
    const env = baseProdEnv();
    delete env.REPLIT_OBJECT_STORAGE_BUCKET_ID;
    const r = validateEnv(env);
    assert.equal(r.level, "fatal");
    assert.ok(r.issues.some((i) => i.code === "missing_persistent_storage"));
  });

  it("allows STORAGE_LOCAL_OK=1 escape hatch for storage check", () => {
    const env = baseProdEnv();
    delete env.REPLIT_OBJECT_STORAGE_BUCKET_ID;
    env.STORAGE_LOCAL_OK = "1";
    const r = validateEnv(env);
    assert.equal(r.level, "ok");
  });

  it("downgrades missing secrets to warn outside production", () => {
    const r = validateEnv({ NODE_ENV: "development" } as any);
    assert.equal(r.level, "warn");
    assert.ok(r.issues.length > 0);
    assert.ok(r.issues.every((i) => i.level === "warn"));
  });
});
