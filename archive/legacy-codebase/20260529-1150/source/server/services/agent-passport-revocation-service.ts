import { storage } from "../storage";

export async function revokePassport(exportId: string, sessionUserId: string, reason?: string | null) {
  const revoked = await storage.revokeAgentPassportExport(exportId, sessionUserId, reason);
  if (!revoked) {
    const err: any = new Error("Passport export not found");
    err.status = 404;
    throw err;
  }

  await storage.createPlatformEvent({
    eventType: "agent_passport_revoked",
    actorId: sessionUserId,
    entityType: "agent_passport_export",
    entityId: revoked.id,
    payload: { passportHash: revoked.exportHash, agentId: revoked.agentId, reason: revoked.revocationReason },
    severity: "info",
  });

  return revoked;
}

export const agentPassportRevocationService = {
  revokePassport,
};
