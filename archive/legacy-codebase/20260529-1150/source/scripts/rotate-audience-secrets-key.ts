/**
 * Rotate the AUDIENCE_GATEWAY_SECRETS_KEY without losing stored tokens
 * (Task #431).
 *
 * Re-encrypts every row in `audience_connector_secrets` from the old
 * master key to a new one, bumping `key_version`. The whole sweep runs
 * inside a single transaction so a failure mid-rotation rolls back.
 *
 * Usage:
 *   tsx scripts/rotate-audience-secrets-key.ts \
 *     --old=<hex-or-base64-32-bytes> \
 *     --new=<hex-or-base64-32-bytes> \
 *     [--dry-run]
 *
 * Idempotency:
 *   Rows already decryptable with the new key are left untouched and
 *   counted as `skipped`. Rerunning the script after a partial /
 *   successful rotation is safe.
 *
 * After a successful rotation:
 *   1. Set `AUDIENCE_GATEWAY_SECRETS_KEY` in Replit Secrets to the new key.
 *   2. Bump `AUDIENCE_GATEWAY_SECRETS_KEY_VERSION` to match the new
 *      `key_version` value reported by this script.
 *   3. Restart the workflow so the audience-platform-gateway picks up
 *      the new key.
 */

import * as crypto from "crypto";
import { sql } from "drizzle-orm";

import { db, pool } from "../server/db";
import { audienceConnectorSecrets } from "../shared/omni-channel-audience-schema";

const ALGO = "aes-256-gcm";

function parseKey(label: string, raw: string | undefined): Buffer {
  if (!raw || raw.trim().length === 0) {
    throw new Error(`missing --${label} key`);
  }
  const trimmed = raw.trim();
  const candidates: Buffer[] = [];
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === 64) {
    candidates.push(Buffer.from(trimmed, "hex"));
  }
  try {
    candidates.push(Buffer.from(trimmed, "base64"));
  } catch {
    /* ignore */
  }
  for (const c of candidates) {
    if (c.length === 32) return c;
  }
  throw new Error(`--${label} key must decode to exactly 32 bytes (hex or base64)`);
}

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function tryDecrypt(key: Buffer, ivB64: string, tagB64: string, encB64: string): string | null {
  try {
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const enc = Buffer.from(encB64, "base64");
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

function encrypt(key: Buffer, plaintext: string): { iv: string; tag: string; enc: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    enc: enc.toString("base64"),
  };
}

export interface RotateSummary {
  total: number;
  rotated: number;
  skipped: number;
  failed: number;
  failedConnectorIds: string[];
  nextKeyVersion: number;
  dryRun: boolean;
}

export async function rotateAudienceSecretsKey(
  oldKey: Buffer,
  newKey: Buffer,
  options: { dryRun?: boolean } = {},
): Promise<RotateSummary> {
  const dryRun = options.dryRun === true;
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(audienceConnectorSecrets);
    const nextKeyVersion =
      rows.reduce((m, r) => (r.keyVersion > m ? r.keyVersion : m), 0) + 1;
    const summary: RotateSummary = {
      total: rows.length,
      rotated: 0,
      skipped: 0,
      failed: 0,
      failedConnectorIds: [],
      nextKeyVersion,
      dryRun,
    };

    for (const row of rows) {
      if (tryDecrypt(newKey, row.iv, row.authTag, row.encryptedToken) !== null) {
        summary.skipped += 1;
        continue;
      }
      const plaintext = tryDecrypt(oldKey, row.iv, row.authTag, row.encryptedToken);
      if (plaintext === null) {
        summary.failed += 1;
        summary.failedConnectorIds.push(row.connectorId);
        continue;
      }
      if (dryRun) {
        summary.rotated += 1;
        continue;
      }
      const { iv, tag, enc } = encrypt(newKey, plaintext);
      await tx
        .update(audienceConnectorSecrets)
        .set({
          encryptedToken: enc,
          iv,
          authTag: tag,
          keyVersion: nextKeyVersion,
        })
        .where(sql`${audienceConnectorSecrets.connectorId} = ${row.connectorId}`);
      summary.rotated += 1;
    }

    if (summary.failed > 0) {
      throw Object.assign(
        new Error(
          `rotation_failed: ${summary.failed} row(s) could not be decrypted with the old key`,
        ),
        { summary },
      );
    }

    return summary;
  });
}

async function main() {
  const oldKey = parseKey("old", getArg("old"));
  const newKey = parseKey("new", getArg("new"));
  if (oldKey.equals(newKey)) {
    throw new Error("--old and --new keys must differ");
  }
  const dryRun = process.argv.includes("--dry-run");

  console.log(
    `[rotate-audience-secrets-key] starting${dryRun ? " (dry-run)" : ""}...`,
  );
  try {
    const summary = await rotateAudienceSecretsKey(oldKey, newKey, { dryRun });
    console.log(JSON.stringify(summary, null, 2));
    if (!dryRun && summary.rotated > 0) {
      console.log(
        `[rotate-audience-secrets-key] success — set AUDIENCE_GATEWAY_SECRETS_KEY to the new key and AUDIENCE_GATEWAY_SECRETS_KEY_VERSION=${summary.nextKeyVersion}, then restart the workflow.`,
      );
    }
  } catch (e: unknown) {
    const err = e as { message?: string; summary?: RotateSummary };
    console.error(
      `[rotate-audience-secrets-key] failed: ${err.message ?? String(e)}`,
    );
    if (err.summary) {
      console.error(JSON.stringify(err.summary, null, 2));
    }
    process.exitCode = 1;
  }
}

const isDirectRun =
  typeof require !== "undefined" && require.main === module;
if (isDirectRun) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end().catch(() => {});
    });
}
