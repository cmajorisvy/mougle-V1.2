import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";

import {
  AudienceConnectorSecretsService,
} from "../server/services/audience-connector-secrets-service";
import { rotateAudienceSecretsKey } from "../scripts/rotate-audience-secrets-key";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

const OLD_KEY = crypto.randomBytes(32);
const NEW_KEY = crypto.randomBytes(32);

let secrets: AudienceConnectorSecretsService;

async function truncate() {
  await db.execute(sql`TRUNCATE TABLE audience_connector_secrets`);
}

beforeEach(async () => {
  process.env.AUDIENCE_GATEWAY_SECRETS_KEY = OLD_KEY.toString("hex");
  delete process.env.AUDIENCE_GATEWAY_SECRETS_KEY_VERSION;
  secrets = new AudienceConnectorSecretsService();
  await truncate();
});

afterEach(() => {
  delete process.env.AUDIENCE_GATEWAY_SECRETS_KEY;
  delete process.env.AUDIENCE_GATEWAY_SECRETS_KEY_VERSION;
});

async function seedToken(connectorId: string, token: string) {
  await secrets.setToken({
    connectorId,
    platform: "youtube",
    token,
    rotatedBy: "root_admin",
  });
}

/* 1 */
test("rotation re-encrypts every row, bumps key_version, and preserves plaintext", async () => {
  await seedToken("c_a", "token_alpha");
  await seedToken("c_b", "token_bravo");

  const summary = await rotateAudienceSecretsKey(OLD_KEY, NEW_KEY);
  assert.equal(summary.total, 2);
  assert.equal(summary.rotated, 2);
  assert.equal(summary.skipped, 0);
  assert.equal(summary.failed, 0);
  assert.equal(summary.nextKeyVersion, 2);

  // After rotation, the service must use the new key + version to read.
  process.env.AUDIENCE_GATEWAY_SECRETS_KEY = NEW_KEY.toString("hex");
  process.env.AUDIENCE_GATEWAY_SECRETS_KEY_VERSION = String(summary.nextKeyVersion);
  const s2 = new AudienceConnectorSecretsService();
  assert.equal(await s2.getDecryptedToken("c_a"), "token_alpha");
  assert.equal(await s2.getDecryptedToken("c_b"), "token_bravo");
});

/* 2 */
test("rotation is idempotent — rerunning skips already-rotated rows", async () => {
  await seedToken("c_a", "token_alpha");
  const first = await rotateAudienceSecretsKey(OLD_KEY, NEW_KEY);
  assert.equal(first.rotated, 1);

  const second = await rotateAudienceSecretsKey(OLD_KEY, NEW_KEY);
  assert.equal(second.total, 1);
  assert.equal(second.rotated, 0);
  assert.equal(second.skipped, 1);
  assert.equal(second.failed, 0);
});

/* 3 */
test("rotation rolls back when a row cannot be decrypted with the old key", async () => {
  await seedToken("c_good", "token_good");
  // Seed a second row encrypted with an unrelated key (simulates corruption).
  process.env.AUDIENCE_GATEWAY_SECRETS_KEY = crypto.randomBytes(32).toString("hex");
  const stranger = new AudienceConnectorSecretsService();
  await stranger.setToken({
    connectorId: "c_bad",
    platform: "youtube",
    token: "token_bad",
    rotatedBy: "root_admin",
  });
  process.env.AUDIENCE_GATEWAY_SECRETS_KEY = OLD_KEY.toString("hex");

  await assert.rejects(
    () => rotateAudienceSecretsKey(OLD_KEY, NEW_KEY),
    /rotation_failed/,
  );

  // Good row must still be readable with the OLD key (rollback).
  const s = new AudienceConnectorSecretsService();
  assert.equal(await s.getDecryptedToken("c_good"), "token_good");
});

/* 4 */
test("dry-run reports what would change but writes nothing", async () => {
  await seedToken("c_a", "token_alpha");
  const summary = await rotateAudienceSecretsKey(OLD_KEY, NEW_KEY, { dryRun: true });
  assert.equal(summary.rotated, 1);
  assert.equal(summary.dryRun, true);

  // Old key must still decrypt the row.
  const s = new AudienceConnectorSecretsService();
  assert.equal(await s.getDecryptedToken("c_a"), "token_alpha");
});
