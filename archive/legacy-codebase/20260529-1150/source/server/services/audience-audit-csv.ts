/**
 * CSV serializer for the audience moderation audit trail (Task #382 + #385).
 * Shared by the admin download route and the scheduled compliance email.
 */

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvSection(title: string, headers: string[], rows: any[]): string {
  const out: string[] = [];
  out.push(`# ${title}`);
  out.push(headers.join(","));
  for (const row of rows) {
    out.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  out.push("");
  return out.join("\r\n");
}

export function buildAudienceAuditCsv(data: {
  connectors: any[];
  messages: any[];
  decisions: any[];
  commands: any[];
  filters: Record<string, unknown>;
  exportedAt: string;
  // Task #632 — hard row cap signal. Optional for back-compat with the
  // legacy email-attachment caller; the admin download route always
  // passes both.
  truncated?: boolean;
  rowCap?: number | null;
}): string {
  const meta = csvSection(
    "audience_audit_export",
    [
      "exportedAt",
      "fromDate",
      "toDate",
      "platform",
      "productionId",
      "truncated",
      "rowCap",
      "platformSendAllowed",
      "realSendAllowed",
    ],
    [
      {
        exportedAt: data.exportedAt,
        fromDate: data.filters.fromDate,
        toDate: data.filters.toDate,
        platform: data.filters.platform,
        productionId: data.filters.productionId,
        truncated: data.truncated ?? false,
        rowCap: data.rowCap ?? null,
        platformSendAllowed: false,
        realSendAllowed: false,
      },
    ],
  );
  const connectors = csvSection(
    "connectors",
    [
      "connectorId",
      "platform",
      "accountId",
      "displayName",
      "connectionStatus",
      "apiAccessMode",
      "permissions",
    ],
    data.connectors,
  );
  const messages = csvSection(
    "messages",
    [
      "messageId",
      "connectorId",
      "platform",
      "externalMessageId",
      "externalAuthorIdHash",
      "authorDisplayNameSafe",
      "messageText",
      "messageType",
      "receivedAt",
      "storyId",
      "productionId",
      "broadcastBriefId",
      "giftValue",
      "rawMetadataRedacted",
    ],
    data.messages,
  );
  const decisions = csvSection(
    "decisions",
    [
      "decisionId",
      "messageId",
      "platform",
      "action",
      "reasonCodes",
      "scores",
      "giftValue",
      "allowedForRobotSpeech",
      "allowedForAnchorSpeech",
      "allowedForScreenDisplay",
      "allowedForAutoReply",
      "allowedForModerationAction",
      "requiresHumanReview",
      "sensitivityOverride",
      "cAudienceSafety",
    ],
    data.decisions,
  );
  const commands = csvSection(
    "commands",
    [
      "commandId",
      "decisionId",
      "platform",
      "connectorId",
      "externalMessageId",
      "requestedAction",
      "requestedBy",
      "commandMode",
      "commandAllowed",
      "blockerReason",
      "requiresHumanApproval",
      "platformSendAllowed",
    ],
    data.commands,
  );
  return [meta, connectors, messages, decisions, commands].join("\r\n");
}

/**
 * CSV serializer for the meta-audit export history (Task #398). Lets
 * regulators and incident responders take the "who exported what, when"
 * trail with them as its own file. Format markers `csv-history` /
 * `json-history` make the recursion obvious.
 */
export function buildAudienceAuditExportLogCsv(data: {
  exports: Array<{
    exportId: string;
    actorId: string;
    actorType: string;
    actorRole: string | null;
    format: "json" | "csv" | "json-history" | "csv-history";
    filters: {
      fromDate: string | null;
      toDate: string | null;
      platform: string | null;
      productionId: string | null;
      actorId?: string | null;
    };
    rowCounts: {
      connectors: number;
      messages: number;
      decisions: number;
      commands: number;
      total: number;
    };
    exportedAt: string;
  }>;
  exportedAt: string;
  totalExports: number;
  // Task #632 — hard row cap signal for history downloads.
  truncated?: boolean;
  rowCap?: number | null;
}): string {
  const meta = csvSection(
    "audience_audit_export_log",
    [
      "exportedAt",
      "totalExports",
      "truncated",
      "rowCap",
      "platformSendAllowed",
      "realSendAllowed",
    ],
    [
      {
        exportedAt: data.exportedAt,
        totalExports: data.totalExports,
        truncated: data.truncated ?? false,
        rowCap: data.rowCap ?? null,
        platformSendAllowed: false,
        realSendAllowed: false,
      },
    ],
  );
  const rows = data.exports.map((e) => ({
    exportId: e.exportId,
    exportedAt: e.exportedAt,
    actorId: e.actorId,
    actorType: e.actorType,
    actorRole: e.actorRole,
    format: e.format,
    filterFromDate: e.filters.fromDate,
    filterToDate: e.filters.toDate,
    filterPlatform: e.filters.platform,
    filterProductionId: e.filters.productionId,
    filterActorId: e.filters.actorId ?? null,
    connectorCount: e.rowCounts.connectors,
    messageCount: e.rowCounts.messages,
    decisionCount: e.rowCounts.decisions,
    commandCount: e.rowCounts.commands,
    totalRowCount: e.rowCounts.total,
  }));
  const log = csvSection(
    "exports",
    [
      "exportId",
      "exportedAt",
      "actorId",
      "actorType",
      "actorRole",
      "format",
      "filterFromDate",
      "filterToDate",
      "filterPlatform",
      "filterProductionId",
      "filterActorId",
      "connectorCount",
      "messageCount",
      "decisionCount",
      "commandCount",
      "totalRowCount",
    ],
    rows,
  );
  return [meta, log].join("\r\n");
}

/**
 * CSV serializer for the permanent gateway events log (Task #492). Lets
 * admins download the same filtered slice they were just viewing in the
 * Recent gateway events panel for incident / regulator review.
 */
export function buildAudienceGatewayEventsCsv(data: {
  events: Array<{
    id: string;
    name: string;
    emittedAt: string;
    payload: {
      commandId?: string | null;
      platform?: string | null;
      requestedAction?: string | null;
      url?: string | null;
      method?: string | null;
      status?: number | null;
      reason?: string | null;
      adminId?: string | null;
    };
  }>;
  filters: {
    fromDate: string | null;
    toDate: string | null;
    // Task #537: surface the platform/kind filters used to scope the
    // download so reviewers can tell from the file itself which slice
    // was pulled.
    platform?: string | null;
    kind?: string | null;
    // Task #573: per-admin slice — the actor id whose dispatches were
    // pulled. `null` means "all admins".
    adminId?: string | null;
    // Task #584: also surface the connector filter so a CSV pulled for
    // one channel can be told apart from a wider platform slice.
    connectorId?: string | null;
  };
  exportedAt: string;
  totalEvents: number;
  truncated: boolean;
  rowCap: number;
}): string {
  const meta = csvSection(
    "audience_gateway_events_export",
    [
      "exportedAt",
      "fromDate",
      "toDate",
      "platform",
      "kind",
      "adminId",
      "connectorId",
      "totalEvents",
      "truncated",
      "rowCap",
      "platformSendAllowed",
      "realSendAllowed",
    ],
    [
      {
        exportedAt: data.exportedAt,
        fromDate: data.filters.fromDate,
        toDate: data.filters.toDate,
        platform: data.filters.platform ?? null,
        kind: data.filters.kind ?? null,
        adminId: data.filters.adminId ?? null,
        connectorId: data.filters.connectorId ?? null,
        totalEvents: data.totalEvents,
        truncated: data.truncated,
        rowCap: data.rowCap,
        platformSendAllowed: false,
        realSendAllowed: false,
      },
    ],
  );
  const rows = data.events.map((e) => ({
    eventId: e.id,
    eventName: e.name,
    emittedAt: e.emittedAt,
    commandId: e.payload.commandId ?? null,
    platform: e.payload.platform ?? null,
    requestedAction: e.payload.requestedAction ?? null,
    status: e.payload.status ?? null,
    reason: e.payload.reason ?? null,
    method: e.payload.method ?? null,
    url: e.payload.url ?? null,
    adminId: e.payload.adminId ?? null,
  }));
  const log = csvSection(
    "gateway_events",
    [
      "eventId",
      "eventName",
      "emittedAt",
      "commandId",
      "platform",
      "requestedAction",
      "status",
      "reason",
      "method",
      "url",
      "adminId",
    ],
    rows,
  );
  return [meta, log].join("\r\n");
}

/**
 * CSV serializer for the connector token rotation audit log (Task #497).
 * Output is metadata-only: who rotated, when, action (set/rotate/delete),
 * resulting rotation count and key version. NEVER includes ciphertext,
 * IV, or auth-tag.
 */
export function buildAudienceConnectorSecretRotationsCsv(data: {
  rotations: Array<{
    id: string;
    connectorId: string;
    platform: string;
    action: "set" | "rotate" | "delete";
    rotatedBy: string | null;
    rotatedAt: string;
    rotationCount: number;
    keyVersion: number;
  }>;
  filters: {
    fromDate: string | null;
    toDate: string | null;
    platform: string | null;
    connectorId: string | null;
  };
  exportedAt: string;
}): string {
  const meta = csvSection(
    "audience_connector_secret_rotations_export",
    [
      "exportedAt",
      "fromDate",
      "toDate",
      "platform",
      "connectorId",
      "totalRotations",
      "platformSendAllowed",
      "realSendAllowed",
    ],
    [
      {
        exportedAt: data.exportedAt,
        fromDate: data.filters.fromDate,
        toDate: data.filters.toDate,
        platform: data.filters.platform,
        connectorId: data.filters.connectorId,
        totalRotations: data.rotations.length,
        platformSendAllowed: false,
        realSendAllowed: false,
      },
    ],
  );
  const rotations = csvSection(
    "rotations",
    [
      "id",
      "connectorId",
      "platform",
      "action",
      "rotatedBy",
      "rotatedAt",
      "rotationCount",
      "keyVersion",
    ],
    data.rotations,
  );
  return [meta, rotations].join("\r\n");
}
