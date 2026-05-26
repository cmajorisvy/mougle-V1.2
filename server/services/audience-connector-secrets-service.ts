/**
 * Audience Connector Secrets Service (Task #380).
 *
 * Per-connector encrypted platform access token storage used by the
 * `audience-platform-gateway-service` when `AUDIENCE_GATEWAY_LIVE_DISPATCH`
 * is enabled. Tokens are encrypted at rest with AES-256-GCM using a key
 * derived from `AUDIENCE_GATEWAY_SECRETS_KEY` (32 raw bytes, hex- or
 * base64-encoded). The key never leaves this module; the raw token is
 * only returned by the private `getDecryptedToken` boundary that the
 * gateway calls immediately before issuing the platform HTTP request.
 *
 * Rotation is supported via `rotateToken` which updates the encrypted
 * blob, IV, auth-tag, and increments `rotationCount` while preserving
 * the connector's existing audit trail.
 *
 * Safety rules:
 *   - Plaintext tokens NEVER appear in API responses, bus events,
 *     audit logs, or thrown errors.
 *   - When no `AUDIENCE_GATEWAY_SECRETS_KEY` is configured the service
 *     refuses every write — fail closed, never store plaintext.
 *   - Reading a secret requires the same key version it was written
 *     with. A key change forces an explicit re-rotation.
 */

import * as crypto from "crypto";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";

import { db } from "../db";
import {
  type AudienceConnectorSecretMetadata,
  type AudienceConnectorSecretRotationAction,
  type AudienceConnectorSecretRotationEntry,
  type AudienceConnectorSecretRotationRow,
  type AudienceConnectorSecretRow,
  type AudiencePlatform,
  audienceConnectorSecretRotations,
  audienceConnectorSecrets,
} from "../../shared/omni-channel-audience-schema";
import { neuralNewsroomBus } from "./neural-newsroom-bus";

export interface AudienceConnectorSecretRotationEvent {
  connectorId: string;
  platform: AudiencePlatform;
  action: AudienceConnectorSecretRotationAction;
  rotatedBy: string | null;
  rotatedAt: string;
  rotationCount: number;
  keyVersion: number;
}

const KEY_ENV = "AUDIENCE_GATEWAY_SECRETS_KEY";
const KEY_VERSION_ENV = "AUDIENCE_GATEWAY_SECRETS_KEY_VERSION";
const ALGO = "aes-256-gcm";

function currentKeyVersion(): number {
  const raw = process.env[KEY_VERSION_ENV];
  if (!raw) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return 1;
  return n;
}

function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test";
}

function loadKey(): Buffer | null {
  const raw = process.env[KEY_ENV];
  if (!raw || raw.trim().length === 0) return null;
  const trimmed = raw.trim();
  // Accept hex (64 chars) or base64 (44 chars including padding). Reject
  // anything that does not yield exactly 32 bytes.
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
  return null;
}

function rowToMetadata(row: AudienceConnectorSecretRow): AudienceConnectorSecretMetadata {
  return {
    connectorId: row.connectorId,
    platform: row.platform as AudiencePlatform,
    keyVersion: row.keyVersion,
    rotationCount: row.rotationCount,
    lastRotatedBy: row.lastRotatedBy ?? null,
    lastRotatedAt: (row.lastRotatedAt as Date).toISOString(),
    createdAt: (row.createdAt as Date).toISOString(),
  };
}

function rowToRotation(
  row: AudienceConnectorSecretRotationRow,
): AudienceConnectorSecretRotationEntry {
  return {
    id: row.id,
    connectorId: row.connectorId,
    platform: row.platform as AudiencePlatform,
    action: row.action as AudienceConnectorSecretRotationAction,
    rotatedBy: row.rotatedBy ?? null,
    rotatedAt: (row.rotatedAt as Date).toISOString(),
    rotationCount: row.rotationCount,
    keyVersion: row.keyVersion,
  };
}

export interface SetTokenInput {
  connectorId: string;
  platform: AudiencePlatform;
  token: string;
  rotatedBy: string | null;
}

export class AudienceConnectorSecretsService {
  /** True iff a usable encryption key is configured in the environment. */
  isConfigured(): boolean {
    return loadKey() !== null;
  }

  /**
   * Install or rotate a per-connector platform access token. The plaintext
   * `token` is encrypted before being persisted; the value is never
   * mirrored onto the connector row or any log surface. Rotating an
   * existing secret preserves `createdAt` and increments `rotationCount`.
   */
  async setToken(input: SetTokenInput): Promise<AudienceConnectorSecretMetadata> {
    const key = loadKey();
    if (!key) throw new Error("secrets_key_not_configured");
    if (!input.token || input.token.length === 0) throw new Error("token_empty");

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const enc = Buffer.concat([cipher.update(input.token, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    const existing = await this.getMetadata(input.connectorId);
    const rotationCount = existing ? existing.rotationCount + 1 : 1;
    const keyVersion = currentKeyVersion();
    const now = new Date();

    await db
      .insert(audienceConnectorSecrets)
      .values({
        connectorId: input.connectorId,
        platform: input.platform,
        encryptedToken: enc.toString("base64"),
        iv: iv.toString("base64"),
        authTag: tag.toString("base64"),
        keyVersion,
        rotationCount,
        lastRotatedBy: input.rotatedBy,
        lastRotatedAt: now,
      })
      .onConflictDoUpdate({
        target: audienceConnectorSecrets.connectorId,
        set: {
          platform: input.platform,
          encryptedToken: enc.toString("base64"),
          iv: iv.toString("base64"),
          authTag: tag.toString("base64"),
          keyVersion,
          rotationCount,
          lastRotatedBy: input.rotatedBy,
          lastRotatedAt: now,
        },
      });

    const action: AudienceConnectorSecretRotationAction = existing ? "rotate" : "set";
    await this.recordRotationAudit({
      connectorId: input.connectorId,
      platform: input.platform,
      action,
      rotatedBy: input.rotatedBy,
      rotatedAt: now,
      rotationCount,
      keyVersion,
    });

    const eventName =
      action === "rotate"
        ? "audience.connector_secret_rotated"
        : "audience.connector_secret_set";
    try {
      neuralNewsroomBus.emit(eventName, {
        connectorId: input.connectorId,
        platform: input.platform,
        action,
        rotatedBy: input.rotatedBy,
        rotatedAt: now.toISOString(),
        rotationCount,
        keyVersion,
      } satisfies AudienceConnectorSecretRotationEvent);
    } catch (err) {
      console.error(
        "[audience-connector-secrets] bus emit failed:",
        (err as Error)?.message ?? err,
      );
    }

    return (await this.getMetadata(input.connectorId))!;
  }

  /** Convenience wrapper that documents intent at the call site. */
  async rotateToken(input: SetTokenInput): Promise<AudienceConnectorSecretMetadata> {
    return this.setToken(input);
  }

  async deleteToken(
    connectorId: string,
    options: { deletedBy?: string | null } = {},
  ): Promise<boolean> {
    const existing = await this.getMetadata(connectorId);
    const r = await db
      .delete(audienceConnectorSecrets)
      .where(eq(audienceConnectorSecrets.connectorId, connectorId));
    const deleted = (r?.rowCount ?? 0) > 0;
    if (deleted && existing) {
      const rotatedAt = new Date();
      await this.recordRotationAudit({
        connectorId,
        platform: existing.platform,
        action: "delete",
        rotatedBy: options.deletedBy ?? null,
        rotatedAt,
        rotationCount: existing.rotationCount,
        keyVersion: existing.keyVersion,
      });
      try {
        neuralNewsroomBus.emit("audience.connector_secret_deleted", {
          connectorId,
          platform: existing.platform,
          action: "delete",
          rotatedBy: options.deletedBy ?? null,
          rotatedAt: rotatedAt.toISOString(),
          rotationCount: existing.rotationCount,
          keyVersion: existing.keyVersion,
        } satisfies AudienceConnectorSecretRotationEvent);
      } catch (err) {
        console.error(
          "[audience-connector-secrets] bus emit failed:",
          (err as Error)?.message ?? err,
        );
      }
    }
    return deleted;
  }

  private async recordRotationAudit(entry: {
    connectorId: string;
    platform: AudiencePlatform;
    action: AudienceConnectorSecretRotationAction;
    rotatedBy: string | null;
    rotatedAt: Date;
    rotationCount: number;
    keyVersion: number;
  }): Promise<void> {
    await db.insert(audienceConnectorSecretRotations).values({
      connectorId: entry.connectorId,
      platform: entry.platform,
      action: entry.action,
      rotatedBy: entry.rotatedBy,
      rotatedAt: entry.rotatedAt,
      rotationCount: entry.rotationCount,
      keyVersion: entry.keyVersion,
    });
  }

  /**
   * Return the rotation audit history for a connector, newest first.
   * Each entry captures who rotated and when; the plaintext token is
   * NEVER stored on the audit row.
   */
  async listRotations(
    connectorId: string,
    limit = 50,
  ): Promise<AudienceConnectorSecretRotationEntry[]> {
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const rows = await db
      .select()
      .from(audienceConnectorSecretRotations)
      .where(eq(audienceConnectorSecretRotations.connectorId, connectorId))
      .orderBy(desc(audienceConnectorSecretRotations.rotatedAt))
      .limit(safeLimit);
    return rows.map(rowToRotation);
  }

  /**
   * Return rotation audit history across every connector for the
   * compliance / incident-review export (Task #497). Newest first.
   * Filters are optional. NEVER returns ciphertext / IV / auth-tag —
   * only the metadata captured on `audience_connector_secret_rotations`.
   */
  async listAllRotations(filters: {
    fromDate?: Date;
    toDate?: Date;
    platform?: AudiencePlatform;
    connectorId?: string;
    limit?: number;
  } = {}): Promise<AudienceConnectorSecretRotationEntry[]> {
    const safeLimit = Math.max(
      1,
      Math.min(100_000, Math.floor(filters.limit ?? 10_000)),
    );
    const conds: SQL[] = [];
    if (filters.fromDate)
      conds.push(gte(audienceConnectorSecretRotations.rotatedAt, filters.fromDate));
    if (filters.toDate)
      conds.push(lte(audienceConnectorSecretRotations.rotatedAt, filters.toDate));
    if (filters.platform)
      conds.push(eq(audienceConnectorSecretRotations.platform, filters.platform));
    if (filters.connectorId)
      conds.push(eq(audienceConnectorSecretRotations.connectorId, filters.connectorId));

    const baseQuery = db.select().from(audienceConnectorSecretRotations);
    const filtered =
      conds.length > 0
        ? baseQuery.where(conds.length === 1 ? conds[0] : and(...conds))
        : baseQuery;
    const rows = await filtered
      .orderBy(desc(audienceConnectorSecretRotations.rotatedAt))
      .limit(safeLimit);
    return rows.map(rowToRotation);
  }

  /**
   * Count rotation audit rows across every connector matching the
   * supplied filters (Task #576). Used by the admin UI to preflight
   * the secret-rotations CSV export and warn when the filtered total
   * exceeds the server-side row cap so the operator can narrow before
   * pulling a silently-truncated file.
   */
  async countAllRotations(filters: {
    fromDate?: Date;
    toDate?: Date;
    platform?: AudiencePlatform;
    connectorId?: string;
  } = {}): Promise<number> {
    const conds: SQL[] = [];
    if (filters.fromDate)
      conds.push(gte(audienceConnectorSecretRotations.rotatedAt, filters.fromDate));
    if (filters.toDate)
      conds.push(lte(audienceConnectorSecretRotations.rotatedAt, filters.toDate));
    if (filters.platform)
      conds.push(eq(audienceConnectorSecretRotations.platform, filters.platform));
    if (filters.connectorId)
      conds.push(eq(audienceConnectorSecretRotations.connectorId, filters.connectorId));
    const baseQuery = db
      .select({ n: sql<number>`count(*)::int` })
      .from(audienceConnectorSecretRotations);
    const filtered =
      conds.length > 0
        ? baseQuery.where(conds.length === 1 ? conds[0] : and(...conds))
        : baseQuery;
    const rows = await filtered;
    return Number(rows[0]?.n ?? 0);
  }

  async getMetadata(connectorId: string): Promise<AudienceConnectorSecretMetadata | null> {
    const rows = await db
      .select()
      .from(audienceConnectorSecrets)
      .where(eq(audienceConnectorSecrets.connectorId, connectorId))
      .limit(1);
    return rows[0] ? rowToMetadata(rows[0]) : null;
  }

  async listMetadata(): Promise<AudienceConnectorSecretMetadata[]> {
    const rows = await db.select().from(audienceConnectorSecrets);
    return rows.map(rowToMetadata);
  }

  /**
   * INTERNAL transport-boundary call. Returns the plaintext token for the
   * given connector or `null` if no secret is stored, the encryption key
   * is missing, the key has rotated to a new version, or decryption fails
   * (e.g. tampered row). Callers MUST treat the returned string as
   * sensitive and never log / emit / surface it.
   */
  async getDecryptedToken(connectorId: string): Promise<string | null> {
    const key = loadKey();
    if (!key) return null;
    const rows = await db
      .select()
      .from(audienceConnectorSecrets)
      .where(eq(audienceConnectorSecrets.connectorId, connectorId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.keyVersion !== currentKeyVersion()) return null;
    try {
      const iv = Buffer.from(row.iv, "base64");
      const tag = Buffer.from(row.authTag, "base64");
      const enc = Buffer.from(row.encryptedToken, "base64");
      const decipher = crypto.createDecipheriv(ALGO, key, iv);
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
      return dec.toString("utf8");
    } catch {
      return null;
    }
  }

  /** Test-only: truncate the secrets + rotation-audit tables. */
  async reset(): Promise<void> {
    if (!isTestEnv()) return;
    await db.execute(
      sql`TRUNCATE TABLE audience_connector_secrets, audience_connector_secret_rotations`,
    );
  }
}

export const audienceConnectorSecretsService = new AudienceConnectorSecretsService();
