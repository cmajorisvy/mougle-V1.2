import { Resend } from "resend";

const ENV_RESEND_API_KEY = process.env.RESEND_API_KEY;
const ENV_RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
const APP_BASE_URL = process.env.APP_BASE_URL || "https://www.mougle.com";

// Resend integration via Replit connector
let connectionSettings: any;

async function getCredentials() {
  if (ENV_RESEND_API_KEY) {
    return {
      apiKey: ENV_RESEND_API_KEY,
      fromEmail: ENV_RESEND_FROM_EMAIL || "noreply@mougle.com",
    };
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error("Resend credentials not found (set RESEND_API_KEY or connect Resend on Replit).");
  }

  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=resend",
    {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: xReplitToken,
      },
    }
  )
    .then((res) => res.json())
    .then((data) => data.items?.[0]);

  if (!connectionSettings || !connectionSettings.settings.api_key) {
    throw new Error("Resend not connected");
  }
  const connectorFromEmail = connectionSettings.settings.from_email;
  const fromEmail = connectorFromEmail && connectorFromEmail.includes("@mougle.com")
    ? connectorFromEmail
    : "noreply@mougle.com";
  return {
    apiKey: connectionSettings.settings.api_key,
    fromEmail,
  };
}

async function getResendClient() {
  const { apiKey } = await getCredentials();
  return { client: new Resend(apiKey) };
}

console.log(`[Email] Sender addresses configured → noreply: ${process.env.EMAIL_NOREPLY || "noreply@mougle.com"}, verify: ${process.env.EMAIL_VERIFY || "verify@mougle.com"}, support: ${process.env.EMAIL_SUPPORT || "support@mougle.com"}`);

const SENDER_CONFIG: Record<string, { label: string; address: string }> = {
  noreply: { label: "Mougle", address: process.env.EMAIL_NOREPLY || "noreply@mougle.com" },
  notify: { label: "Mougle Notifications", address: process.env.EMAIL_NOREPLY || "noreply@mougle.com" },
  verify: { label: "Mougle Verification", address: process.env.EMAIL_VERIFY || "verify@mougle.com" },
  support: { label: "Mougle Support", address: process.env.EMAIL_SUPPORT || "support@mougle.com" },
  billing: { label: "Mougle Billing", address: process.env.EMAIL_NOREPLY || "noreply@mougle.com" },
  admin: { label: "Mougle Admin", address: process.env.EMAIL_NOREPLY || "noreply@mougle.com" },
};

function getSender(type: keyof typeof SENDER_CONFIG): string {
  const config = SENDER_CONFIG[type] || SENDER_CONFIG.noreply;
  return `${config.label} <${config.address}>`;
}

function baseUrl(): string {
  return APP_BASE_URL;
}

function wrapTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0b10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background:linear-gradient(135deg,#4f7df9,#8b5cf6);border-radius:14px;padding:12px 20px;margin-bottom:12px;">
        <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:1px;">M</span>
      </div>
      <h1 style="color:#fff;font-size:22px;margin:0;font-weight:700;">Mougle</h1>
      <p style="color:#6b7280;font-size:11px;margin:4px 0 0;letter-spacing:2px;text-transform:uppercase;">Hybrid Intelligence Network</p>
    </div>
    ${content}
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
      <p style="color:#374151;font-size:10px;margin:0 0 4px;">Digitally signed by Mougle Platform Security</p>
      <p style="color:#374151;font-size:10px;margin:0 0 8px;font-family:monospace;">sig: mgl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}</p>
      <p style="color:#4b5563;font-size:10px;margin:0 0 4px;">This is an automated message from Mougle. Please do not reply to this email.</p>
      <p style="color:#374151;font-size:10px;margin:0;">&copy; ${new Date().getFullYear()} Mougle. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

function cardWrap(inner: string): string {
  return `<div style="background:#12141e;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:32px;text-align:center;">${inner}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Task #585 — Build a tiny inline SVG sparkline for one retention-backlog
 * series (messages / decisions / commands). Inline SVG markup is rendered
 * by Apple Mail, Outlook desktop, Thunderbird, and most modern web clients;
 * Gmail strips it, but the existing monospace text block in the digest
 * stays as the fallback so plaintext-only clients still get the data.
 */
export function buildStalePendingSparklineSvg(values: number[]): string {
  const width = 120;
  const height = 24;
  const pad = 2;
  if (!values || values.length < 2) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="sparkline (insufficient data)"><line x1="${pad}" y1="${height / 2}" x2="${width - pad}" y2="${height / 2}" stroke="#6b7280" stroke-width="1" stroke-dasharray="2,2"/></svg>`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const stepX = values.length === 1 ? 0 : innerW / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + stepX * i;
    const y = pad + innerH - ((v - min) / range) * innerH;
    return { x, y };
  });
  const polyline = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const first = values[0];
  const last = values[values.length - 1];
  const stroke = last > first ? "#ef4444" : last < first ? "#10b981" : "#9ca3af";
  const lastPoint = points[points.length - 1];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="sparkline of ${values.length} samples, latest ${last}"><polyline fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" points="${polyline}"/><circle cx="${lastPoint.x.toFixed(2)}" cy="${lastPoint.y.toFixed(2)}" r="1.8" fill="${stroke}"/></svg>`;
}

function buildStalePendingSparklineRow(label: string, values: number[]): string {
  const latest = values.length > 0 ? values[values.length - 1] : 0;
  const svg = buildStalePendingSparklineSvg(values);
  return `<div style="display:flex;align-items:center;gap:8px;margin:0 0 4px;font-family:monospace;font-size:11px;color:#9ca3af;">
    <span style="display:inline-block;min-width:64px;color:#9ca3af;">${escapeHtml(label)}</span>
    <span style="display:inline-block;line-height:0;">${svg}</span>
    <span style="display:inline-block;color:#6b7280;">latest ${latest}</span>
  </div>`;
}

export interface AudienceAuditExportNotificationPayload {
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
  };
  rowCounts: {
    connectors: number;
    messages: number;
    decisions: number;
    commands: number;
    total: number;
  };
  riskSignals?: string[];
  /**
   * Task #459: optional subset of riskSignals loud enough to appear in
   * the subject `[RISK: ...]` prefix. When undefined, falls back to
   * `riskSignals` (today's behavior).
   */
  riskSubjectSignals?: string[];
  exportedAt: string;
  thresholdRowCount: number;
  thresholdExceeded: boolean;
  suppressedCount?: number;
  suppressedSince?: string | null;
  outlier?: {
    isOutlier: boolean;
    rollingMedian: number;
    rollingP95: number;
    threshold: number;
    sampleSize: number;
    multiplier: number;
  } | null;
}

export class EmailService {
  async sendVerificationEmail(to: string, code: string, displayName: string) {
    try {
      const { client } = await getResendClient();
      const result = await client.emails.send({
        from: getSender("verify"),
        to,
        subject: `${code} is your Mougle verification code`,
        html: wrapTemplate(cardWrap(`
          <p style="color:#e5e7eb;font-size:15px;margin:0 0 8px;">Hi ${displayName},</p>
          <p style="color:#9ca3af;font-size:13px;margin:0 0 24px;">Enter this code to verify your email address:</p>
          <div style="background:#0a0b10;border:2px solid #4f7df9;border-radius:12px;padding:20px;margin:0 auto;display:inline-block;">
            <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#4f7df9;font-family:monospace;">${code}</span>
          </div>
          <p style="color:#6b7280;font-size:12px;margin:24px 0 0;">This code expires in 30 minutes. If you didn't create an account, ignore this email.</p>
        `)),
      });
      console.log(`[Email] Verification sent to ${to}`, result);
      return result;
    } catch (err) {
      console.error(`[Email] Failed verification to ${to}:`, err);
    }
  }

  async sendWelcomeEmail(to: string, displayName: string) {
    try {
      const { client } = await getResendClient();
      const result = await client.emails.send({
        from: getSender("noreply"),
        to,
        subject: "Welcome to Mougle — Your Intelligence Journey Starts Now",
        html: wrapTemplate(cardWrap(`
          <p style="color:#e5e7eb;font-size:16px;margin:0 0 8px;font-weight:600;">Welcome, ${displayName}!</p>
          <p style="color:#9ca3af;font-size:13px;margin:0 0 20px;line-height:1.6;">
            You've joined Mougle — the world's first Hybrid Intelligence Network where humans and AI collaborate to create verified knowledge.
          </p>
          <div style="text-align:left;margin:20px 0;">
            <p style="color:#e5e7eb;font-size:13px;margin:0 0 12px;font-weight:600;">Here's what you can do:</p>
            <p style="color:#9ca3af;font-size:12px;margin:0 0 8px;">&#x2713; Explore topics and contribute insights</p>
            <p style="color:#9ca3af;font-size:12px;margin:0 0 8px;">&#x2713; Build your trust score and reputation</p>
            <p style="color:#9ca3af;font-size:12px;margin:0 0 8px;">&#x2713; Create AI agents and publish apps</p>
            <p style="color:#9ca3af;font-size:12px;margin:0 0 8px;">&#x2713; Join live debates and earn credits</p>
          </div>
          <a href="${baseUrl()}" style="display:inline-block;background:linear-gradient(135deg,#4f7df9,#8b5cf6);color:#fff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:10px;text-decoration:none;margin-top:12px;">Start Exploring</a>
        `)),
      });
      console.log(`[Email] Welcome sent to ${to}`, result);
      return result;
    } catch (err) {
      console.error(`[Email] Failed welcome to ${to}:`, err);
    }
  }

  async sendAccountVerifiedEmail(to: string, displayName: string) {
    try {
      const { client } = await getResendClient();
      const result = await client.emails.send({
        from: getSender("verify"),
        to,
        subject: "Your Mougle Account is Verified!",
        html: wrapTemplate(cardWrap(`
          <div style="font-size:48px;margin-bottom:16px;">&#x2705;</div>
          <p style="color:#e5e7eb;font-size:16px;margin:0 0 8px;font-weight:600;">Account Verified, ${displayName}!</p>
          <p style="color:#9ca3af;font-size:13px;margin:0 0 20px;line-height:1.6;">
            Your email has been verified and your Mougle account is now fully active.
            You can now access all platform features.
          </p>
          <a href="${baseUrl()}" style="display:inline-block;background:linear-gradient(135deg,#4f7df9,#8b5cf6);color:#fff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:10px;text-decoration:none;">Go to Dashboard</a>
        `)),
      });
      console.log(`[Email] Account verified sent to ${to}`, result);
      return result;
    } catch (err) {
      console.error(`[Email] Failed account verified to ${to}:`, err);
    }
  }

  async sendPurchaseConfirmation(to: string, displayName: string, purchase: { plan: string; amount: string; transactionId: string; date: string }) {
    try {
      const { client } = await getResendClient();
      const result = await client.emails.send({
        from: getSender("billing"),
        to,
        subject: `Payment Confirmed — ${purchase.plan} Plan`,
        html: wrapTemplate(cardWrap(`
          <div style="font-size:48px;margin-bottom:16px;">&#x1F4B3;</div>
          <p style="color:#e5e7eb;font-size:16px;margin:0 0 8px;font-weight:600;">Payment Confirmed!</p>
          <p style="color:#9ca3af;font-size:13px;margin:0 0 20px;">Hi ${displayName}, your purchase has been processed successfully.</p>
          <div style="background:#0a0b10;border-radius:12px;padding:20px;text-align:left;margin:0 0 20px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span style="color:#6b7280;font-size:12px;">Plan</span>
              <span style="color:#e5e7eb;font-size:12px;font-weight:600;">${purchase.plan}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span style="color:#6b7280;font-size:12px;">Amount</span>
              <span style="color:#10b981;font-size:12px;font-weight:600;">${purchase.amount}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span style="color:#6b7280;font-size:12px;">Transaction ID</span>
              <span style="color:#e5e7eb;font-size:12px;font-family:monospace;">${purchase.transactionId}</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span style="color:#6b7280;font-size:12px;">Date</span>
              <span style="color:#e5e7eb;font-size:12px;">${purchase.date}</span>
            </div>
          </div>
          <a href="${baseUrl()}/billing" style="display:inline-block;background:linear-gradient(135deg,#4f7df9,#8b5cf6);color:#fff;font-size:13px;font-weight:600;padding:10px 28px;border-radius:10px;text-decoration:none;">View Billing</a>
        `)),
      });
      console.log(`[Email] Purchase confirmation sent to ${to}`, result);
      return result;
    } catch (err) {
      console.error(`[Email] Failed purchase confirmation to ${to}:`, err);
    }
  }

  async sendInvoiceEmail(to: string, displayName: string, invoice: { invoiceId: string; amount: string; period: string; items: { name: string; amount: string }[] }) {
    try {
      const { client } = await getResendClient();
      const itemsHtml = invoice.items.map(i =>
        `<tr><td style="color:#9ca3af;font-size:12px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);">${i.name}</td><td style="color:#e5e7eb;font-size:12px;padding:8px 0;text-align:right;border-bottom:1px solid rgba(255,255,255,0.04);">${i.amount}</td></tr>`
      ).join("");
      const result = await client.emails.send({
        from: getSender("billing"),
        to,
        subject: `Invoice ${invoice.invoiceId} — Mougle`,
        html: wrapTemplate(cardWrap(`
          <p style="color:#e5e7eb;font-size:16px;margin:0 0 8px;font-weight:600;">Invoice</p>
          <p style="color:#9ca3af;font-size:13px;margin:0 0 20px;">Hi ${displayName}, here's your invoice for ${invoice.period}.</p>
          <div style="background:#0a0b10;border-radius:12px;padding:16px;margin:0 0 16px;">
            <p style="color:#6b7280;font-size:10px;margin:0 0 4px;">Invoice ID</p>
            <p style="color:#e5e7eb;font-size:13px;font-family:monospace;margin:0 0 12px;">${invoice.invoiceId}</p>
            <table style="width:100%;border-collapse:collapse;">${itemsHtml}
              <tr><td style="color:#e5e7eb;font-size:13px;padding:12px 0 0;font-weight:700;">Total</td><td style="color:#10b981;font-size:14px;padding:12px 0 0;text-align:right;font-weight:700;">${invoice.amount}</td></tr>
            </table>
          </div>
          <a href="${baseUrl()}/billing" style="display:inline-block;background:linear-gradient(135deg,#4f7df9,#8b5cf6);color:#fff;font-size:13px;font-weight:600;padding:10px 28px;border-radius:10px;text-decoration:none;">View Invoice</a>
        `)),
      });
      console.log(`[Email] Invoice sent to ${to}`, result);
      return result;
    } catch (err) {
      console.error(`[Email] Failed invoice to ${to}:`, err);
    }
  }

  async sendPolicyNotification(to: string, displayName: string, policy: { title: string; summary: string; effectiveDate: string }) {
    try {
      const { client } = await getResendClient();
      const result = await client.emails.send({
        from: getSender("notify"),
        to,
        subject: `Policy Update: ${policy.title} — Mougle`,
        html: wrapTemplate(cardWrap(`
          <div style="font-size:48px;margin-bottom:16px;">&#x1F4DC;</div>
          <p style="color:#e5e7eb;font-size:16px;margin:0 0 8px;font-weight:600;">Policy Update</p>
          <p style="color:#9ca3af;font-size:13px;margin:0 0 20px;">Hi ${displayName}, we've updated our <strong style="color:#e5e7eb;">${policy.title}</strong>.</p>
          <div style="background:#0a0b10;border-radius:12px;padding:16px;text-align:left;margin:0 0 16px;">
            <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 8px;">What Changed</p>
            <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.5;">${policy.summary}</p>
          </div>
          <p style="color:#6b7280;font-size:11px;margin:0 0 16px;">Effective: ${policy.effectiveDate}</p>
          <a href="${baseUrl()}/policy/${policy.title.toLowerCase().replace(/\s+/g, '-')}" style="display:inline-block;background:linear-gradient(135deg,#4f7df9,#8b5cf6);color:#fff;font-size:13px;font-weight:600;padding:10px 28px;border-radius:10px;text-decoration:none;">Read Full Policy</a>
        `)),
      });
      console.log(`[Email] Policy notification sent to ${to}`, result);
      return result;
    } catch (err) {
      console.error(`[Email] Failed policy notification to ${to}:`, err);
    }
  }

  async sendAdminAlert(to: string, alert: { title: string; severity: string; message: string; actionUrl?: string }) {
    try {
      const { client } = await getResendClient();
      const severityColor = alert.severity === "critical" ? "#ef4444" : alert.severity === "high" ? "#f97316" : "#eab308";
      const result = await client.emails.send({
        from: getSender("admin"),
        to,
        subject: `[${alert.severity.toUpperCase()}] ${alert.title} — Mougle Admin`,
        html: wrapTemplate(cardWrap(`
          <div style="background:${severityColor};display:inline-block;padding:4px 12px;border-radius:6px;margin-bottom:16px;">
            <span style="color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;">${alert.severity}</span>
          </div>
          <p style="color:#e5e7eb;font-size:16px;margin:0 0 12px;font-weight:600;">${alert.title}</p>
          <p style="color:#9ca3af;font-size:13px;margin:0 0 20px;line-height:1.6;">${alert.message}</p>
          ${alert.actionUrl ? `<a href="${alert.actionUrl}" style="display:inline-block;background:${severityColor};color:#fff;font-size:13px;font-weight:600;padding:10px 28px;border-radius:10px;text-decoration:none;">Take Action</a>` : ""}
        `)),
      });
      console.log(`[Email] Admin alert sent to ${to}`, result);
      return result;
    } catch (err) {
      console.error(`[Email] Failed admin alert to ${to}:`, err);
    }
  }

  async sendAdminAccessRequestReviewEmail(to: string, request: {
    requestId: string;
    fullName: string;
    email: string;
    username: string;
    requestedAccessType: string;
    requestedRole: string;
    requestedPermissions: string[];
    reason: string;
    approveUrl: string;
    rejectUrl: string;
    expiresAt: Date;
  }) {
    try {
      const { client } = await getResendClient();
      const accessLabel = request.requestedAccessType === "main_admin"
        ? "Main Admin / Admin Control Center"
        : "Staff Admin / Staff Dashboard";
      const permissions = request.requestedPermissions.length > 0
        ? request.requestedPermissions.map((permission) => `<span style="display:inline-block;background:#0a0b10;border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:4px 8px;margin:2px;color:#d1d5db;font-size:11px;">${escapeHtml(permission)}</span>`).join("")
        : `<span style="color:#6b7280;font-size:12px;">No permissions requested</span>`;

      const result = await client.emails.send({
        from: getSender("admin"),
        to,
        subject: `Review Mougle admin access request — ${request.fullName}`,
        html: wrapTemplate(cardWrap(`
          <p style="color:#e5e7eb;font-size:16px;margin:0 0 8px;font-weight:600;">Admin/staff access request</p>
          <p style="color:#9ca3af;font-size:13px;margin:0 0 20px;line-height:1.6;">
            A requester is asking for internal Mougle access. Approval activates the account; rejection keeps login blocked.
          </p>
          <div style="background:#0a0b10;border-radius:12px;padding:16px;text-align:left;margin:0 0 18px;">
            <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Requester</p>
            <p style="color:#e5e7eb;font-size:13px;margin:0 0 12px;">${escapeHtml(request.fullName)} &lt;${escapeHtml(request.email)}&gt;</p>
            <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Username</p>
            <p style="color:#e5e7eb;font-size:13px;margin:0 0 12px;font-family:monospace;">${escapeHtml(request.username)}</p>
            <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Requested access</p>
            <p style="color:#e5e7eb;font-size:13px;margin:0 0 12px;">${escapeHtml(accessLabel)} · ${escapeHtml(request.requestedRole)}</p>
            <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 6px;">Permissions after approval</p>
            <div style="margin:0 0 12px;">${permissions}</div>
            <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Reason</p>
            <p style="color:#d1d5db;font-size:12px;line-height:1.5;white-space:pre-wrap;margin:0;">${escapeHtml(request.reason)}</p>
          </div>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin:0 0 18px;">
            <a href="${request.approveUrl}" style="display:inline-block;background:#16a34a;color:#fff;font-size:13px;font-weight:700;padding:11px 24px;border-radius:10px;text-decoration:none;">Approve Access</a>
            <a href="${request.rejectUrl}" style="display:inline-block;background:#dc2626;color:#fff;font-size:13px;font-weight:700;padding:11px 24px;border-radius:10px;text-decoration:none;">Reject Request</a>
          </div>
          <p style="color:#6b7280;font-size:11px;margin:0 0 8px;">These per-recipient review links expire at ${escapeHtml(request.expiresAt.toUTCString())}.</p>
          <p style="color:#4b5563;font-size:10px;margin:0;word-break:break-all;">Request ID: ${escapeHtml(request.requestId)}</p>
        `)),
      });
      console.log(`[Email] Admin access request review sent to ${to}`, result);
      return result;
    } catch (err) {
      console.error(`[Email] Failed admin access request review to ${to}:`, err);
    }
  }

  async sendPasswordResetEmail(to: string, resetToken: string, displayName: string) {
    try {
      const { client } = await getResendClient();
      const resetLink = `${baseUrl()}/auth/reset-password?token=${resetToken}`;
      const result = await client.emails.send({
        from: getSender("verify"),
        to,
        subject: "Reset your Mougle password",
        html: wrapTemplate(cardWrap(`
          <p style="color:#e5e7eb;font-size:15px;margin:0 0 8px;">Hi ${displayName},</p>
          <p style="color:#9ca3af;font-size:13px;margin:0 0 24px;">We received a request to reset your password. Click the button below to choose a new one:</p>
          <a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#4f7df9,#8b5cf6);color:#fff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:10px;text-decoration:none;">Reset Password</a>
          <p style="color:#6b7280;font-size:12px;margin:24px 0 0;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
          <p style="color:#4b5563;font-size:11px;margin:16px 0 0;word-break:break-all;">${resetLink}</p>
        `)),
      });
      console.log(`[Email] Password reset sent to ${to}`, result);
      return result;
    } catch (err) {
      console.error(`[Email] Failed password reset to ${to}:`, err);
    }
  }

  async sendSupportTicketReply(to: string, displayName: string, ticket: { ticketId: string; subject: string; replyContent: string }) {
    try {
      const { client } = await getResendClient();
      const result = await client.emails.send({
        from: getSender("support"),
        to,
        subject: `Re: ${ticket.subject} [Ticket #${ticket.ticketId}]`,
        html: wrapTemplate(cardWrap(`
          <p style="color:#e5e7eb;font-size:15px;margin:0 0 8px;">Hi ${displayName},</p>
          <p style="color:#9ca3af;font-size:13px;margin:0 0 4px;">Our team has responded to your support ticket:</p>
          <p style="color:#6b7280;font-size:11px;margin:0 0 20px;font-family:monospace;">Ticket #${ticket.ticketId}</p>
          <div style="background:#0a0b10;border-left:3px solid #4f7df9;border-radius:8px;padding:16px;text-align:left;margin:0 0 20px;">
            <p style="color:#e5e7eb;font-size:13px;margin:0;line-height:1.6;white-space:pre-wrap;">${ticket.replyContent}</p>
          </div>
          <a href="${baseUrl()}/support" style="display:inline-block;background:linear-gradient(135deg,#4f7df9,#8b5cf6);color:#fff;font-size:13px;font-weight:600;padding:10px 28px;border-radius:10px;text-decoration:none;">View Ticket</a>
        `)),
      });
      console.log(`[Email] Support reply sent to ${to}`, result);
      return result;
    } catch (err) {
      console.error(`[Email] Failed support reply to ${to}:`, err);
    }
  }

  async sendTicketCreatedNotification(to: string, displayName: string, ticket: { ticketId: string; subject: string }) {
    try {
      const { client } = await getResendClient();
      const result = await client.emails.send({
        from: getSender("support"),
        to,
        subject: `Support Ticket Created [#${ticket.ticketId}]`,
        html: wrapTemplate(cardWrap(`
          <p style="color:#e5e7eb;font-size:15px;margin:0 0 8px;">Hi ${displayName},</p>
          <p style="color:#9ca3af;font-size:13px;margin:0 0 20px;">Your support ticket has been created. Our team will review it shortly.</p>
          <div style="background:#0a0b10;border-radius:12px;padding:16px;text-align:left;margin:0 0 20px;">
            <p style="color:#6b7280;font-size:10px;margin:0 0 4px;">Ticket ID</p>
            <p style="color:#e5e7eb;font-size:13px;font-family:monospace;margin:0 0 12px;">#${ticket.ticketId}</p>
            <p style="color:#6b7280;font-size:10px;margin:0 0 4px;">Subject</p>
            <p style="color:#e5e7eb;font-size:13px;margin:0;">${ticket.subject}</p>
          </div>
          <a href="${baseUrl()}/support" style="display:inline-block;background:linear-gradient(135deg,#4f7df9,#8b5cf6);color:#fff;font-size:13px;font-weight:600;padding:10px 28px;border-radius:10px;text-decoration:none;">Track Your Ticket</a>
        `)),
      });
      console.log(`[Email] Ticket created notification sent to ${to}`, result);
      return result;
    } catch (err) {
      console.error(`[Email] Failed ticket created notification to ${to}:`, err);
    }
  }

  buildAudienceAuditExportEmail(payload: {
    cadence: string;
    windowFrom: Date;
    windowTo: Date;
    messageCount: number;
    decisionCount: number;
    commandCount: number;
    connectorCount: number;
    jsonContent: string;
    csvContent: string;
    jsonFilename: string;
    csvFilename: string;
    triggeredBy: "scheduler" | "manual";
    stalePendingTrendLine?: string;
    stalePendingHistoryLines?: string;
    stalePendingHistoryLength?: number;
    stalePendingSeries?: {
      messages: number[];
      decisions: number[];
      commands: number[];
    };
  }): {
    subject: string;
    html: string;
    attachments: Array<{ filename: string; sizeBytes: number }>;
  } {
    const from = payload.windowFrom.toISOString();
    const to = payload.windowTo.toISOString();
    const subject = `Mougle audience moderation audit — ${payload.cadence} (${from.slice(0, 10)} → ${to.slice(0, 10)})`;
    const trendLine = payload.stalePendingTrendLine ?? "";
    const historyLines = payload.stalePendingHistoryLines ?? "";
    const historyLen = payload.stalePendingHistoryLength ?? 0;
    const series = payload.stalePendingSeries;
    const sparklineBlock = series && (series.messages.length >= 2 || series.decisions.length >= 2 || series.commands.length >= 2)
      ? `<div style="margin:8px 0 0;">
          ${buildStalePendingSparklineRow("messages", series.messages)}
          ${buildStalePendingSparklineRow("decisions", series.decisions)}
          ${buildStalePendingSparklineRow("commands", series.commands)}
        </div>`
      : "";
    const backlogBlock = (trendLine || historyLines)
      ? `
        <div style="background:#0a0b10;border-radius:12px;padding:16px;text-align:left;margin:0 0 16px;">
          <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Retention backlog trend</p>
          ${trendLine
            ? `<p style="color:#e5e7eb;font-size:12px;font-family:monospace;margin:0 0 8px;">${escapeHtml(trendLine)}</p>`
            : `<p style="color:#9ca3af;font-size:12px;margin:0 0 8px;">Not enough samples yet to compute direction.</p>`}
          ${sparklineBlock}
          ${historyLines
            ? `<p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:8px 0 4px;">Recent stale-pending samples (last ${historyLen} sweep${historyLen === 1 ? "" : "s"})</p>
               <pre style="color:#9ca3af;font-size:11px;font-family:monospace;white-space:pre-wrap;margin:0;">${escapeHtml(historyLines)}</pre>`
            : ""}
        </div>`
      : "";
    const html = wrapTemplate(cardWrap(`
        <p style="color:#e5e7eb;font-size:16px;margin:0 0 8px;font-weight:600;">Compliance audit export</p>
        <p style="color:#9ca3af;font-size:13px;margin:0 0 16px;line-height:1.6;">
          Scheduled ${escapeHtml(payload.cadence)} export of the Mougle omni-channel
          audience moderation audit trail. PII is redacted at ingestion (hashed
          author IDs, scrubbed metadata). No platform API was called.
        </p>
        <div style="background:#0a0b10;border-radius:12px;padding:16px;text-align:left;margin:0 0 16px;">
          <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Window</p>
          <p style="color:#e5e7eb;font-size:12px;font-family:monospace;margin:0 0 12px;">${escapeHtml(from)} → ${escapeHtml(to)}</p>
          <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Records</p>
          <p style="color:#e5e7eb;font-size:12px;margin:0 0 4px;">Connectors: ${payload.connectorCount}</p>
          <p style="color:#e5e7eb;font-size:12px;margin:0 0 4px;">Messages: ${payload.messageCount}</p>
          <p style="color:#e5e7eb;font-size:12px;margin:0 0 4px;">Decisions: ${payload.decisionCount}</p>
          <p style="color:#e5e7eb;font-size:12px;margin:0 0 4px;">Commands: ${payload.commandCount}</p>
          <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:12px 0 4px;">Trigger</p>
          <p style="color:#e5e7eb;font-size:12px;margin:0;">${escapeHtml(payload.triggeredBy)}</p>
        </div>${backlogBlock}
        <p style="color:#6b7280;font-size:11px;margin:0;">Both JSON and CSV exports are attached. platformSendAllowed:false · realSendAllowed:false.</p>
      `));
    return {
      subject,
      html,
      attachments: [
        { filename: payload.jsonFilename, sizeBytes: Buffer.byteLength(payload.jsonContent, "utf-8") },
        { filename: payload.csvFilename, sizeBytes: Buffer.byteLength(payload.csvContent, "utf-8") },
      ],
    };
  }

  async sendAudienceAuditExport(
    recipients: string[],
    payload: {
      cadence: string;
      windowFrom: Date;
      windowTo: Date;
      messageCount: number;
      decisionCount: number;
      commandCount: number;
      connectorCount: number;
      jsonContent: string;
      csvContent: string;
      jsonFilename: string;
      csvFilename: string;
      triggeredBy: "scheduler" | "manual";
      stalePendingTrendLine?: string;
      stalePendingHistoryLines?: string;
      stalePendingHistoryLength?: number;
      stalePendingSeries?: {
        messages: number[];
        decisions: number[];
        commands: number[];
      };
    },
  ) {
    if (recipients.length === 0) {
      throw new Error("no_recipients");
    }
    const { client } = await getResendClient();
    const built = this.buildAudienceAuditExportEmail(payload);
    const result = await client.emails.send({
      from: getSender("admin"),
      to: recipients,
      subject: built.subject,
      html: built.html,
      attachments: [
        {
          filename: payload.jsonFilename,
          content: Buffer.from(payload.jsonContent, "utf-8"),
        },
        {
          filename: payload.csvFilename,
          content: Buffer.from(payload.csvContent, "utf-8"),
        },
      ],
    });
    console.log(`[Email] Audience audit export sent to ${recipients.join(", ")}`, result);
    return result;
  }

  buildAudienceAuditHistoryExportEmail(payload: {
    cadence: string;
    totalExports: number;
    exportedAt: string;
    jsonContent: string;
    csvContent: string;
    jsonFilename: string;
    csvFilename: string;
    triggeredBy: "scheduler" | "manual";
  }): {
    subject: string;
    html: string;
    attachments: Array<{ filename: string; sizeBytes: number }>;
  } {
    const subject = `Mougle audit-export history — ${payload.cadence} (${payload.exportedAt.slice(0, 10)})`;
    const html = wrapTemplate(cardWrap(`
        <p style="color:#e5e7eb;font-size:16px;margin:0 0 8px;font-weight:600;">Audit-export history</p>
        <p style="color:#9ca3af;font-size:13px;margin:0 0 16px;line-height:1.6;">
          Scheduled ${escapeHtml(payload.cadence)} delivery of the Mougle
          omni-channel audience moderation <strong>meta-audit</strong> trail
          — the "who exported what, when" log for every audit-trail download.
          No platform API was called. This send is itself logged in the same
          history table with format <code>json-history</code> and <code>csv-history</code>.
        </p>
        <div style="background:#0a0b10;border-radius:12px;padding:16px;text-align:left;margin:0 0 16px;">
          <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Exported at</p>
          <p style="color:#e5e7eb;font-size:12px;font-family:monospace;margin:0 0 12px;">${escapeHtml(payload.exportedAt)}</p>
          <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Records</p>
          <p style="color:#e5e7eb;font-size:12px;margin:0 0 4px;">Total history rows: ${payload.totalExports}</p>
          <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:12px 0 4px;">Trigger</p>
          <p style="color:#e5e7eb;font-size:12px;margin:0;">${escapeHtml(payload.triggeredBy)}</p>
        </div>
        <p style="color:#6b7280;font-size:11px;margin:0;">Both JSON and CSV variants are attached. platformSendAllowed:false · realSendAllowed:false.</p>
      `));
    return {
      subject,
      html,
      attachments: [
        { filename: payload.jsonFilename, sizeBytes: Buffer.byteLength(payload.jsonContent, "utf-8") },
        { filename: payload.csvFilename, sizeBytes: Buffer.byteLength(payload.csvContent, "utf-8") },
      ],
    };
  }

  async sendAudienceAuditHistoryExport(
    recipients: string[],
    payload: {
      cadence: string;
      totalExports: number;
      exportedAt: string;
      jsonContent: string;
      csvContent: string;
      jsonFilename: string;
      csvFilename: string;
      triggeredBy: "scheduler" | "manual";
    },
  ) {
    if (recipients.length === 0) {
      throw new Error("no_recipients");
    }
    const { client } = await getResendClient();
    const built = this.buildAudienceAuditHistoryExportEmail(payload);
    const result = await client.emails.send({
      from: getSender("admin"),
      to: recipients,
      subject: built.subject,
      html: built.html,
      attachments: [
        { filename: payload.jsonFilename, content: Buffer.from(payload.jsonContent, "utf-8") },
        { filename: payload.csvFilename, content: Buffer.from(payload.csvContent, "utf-8") },
      ],
    });
    console.log(`[Email] Audience audit history export sent to ${recipients.join(", ")}`, result);
    return result;
  }

  buildAudienceAuditExportNotificationEmail(
    payload: AudienceAuditExportNotificationPayload,
  ): { subject: string; html: string } {
    // Task #426: human-friendly labels for each auto-detected risk signal.
    const RISK_LABELS: Record<string, string> = {
      full_trail: "FULL TRAIL (no filters)",
      no_date_window: "no date window",
      wide_date_window: "wide date window (>90 days)",
      first_export_by_actor: "first-ever export by this actor",
      new_production_for_actor: "new productionId for this actor",
      format_change: "format change vs prior export",
    };
    const riskSignals = Array.isArray(payload.riskSignals) ? payload.riskSignals : [];
    const riskLabels = riskSignals.map((s) => RISK_LABELS[s] ?? s);
    // Task #459: subject prefix uses the "loud" subset; defaults to all
    // signals so behavior is unchanged when no rules are configured.
    const subjectSignals = Array.isArray(payload.riskSubjectSignals)
      ? payload.riskSubjectSignals
      : riskSignals;
    const riskTag = subjectSignals.length > 0 ? `[RISK: ${subjectSignals.join(", ")}] ` : "";
    const suppressedCount = payload.suppressedCount ?? 0;
    const suppressedSince = payload.suppressedSince ?? null;
    const burstSuffix =
      suppressedCount > 0
        ? ` — ${suppressedCount} similar export${suppressedCount === 1 ? "" : "s"} suppressed`
        : "";
    // Task #428 — prefix the subject and add a banner when this export
    // is flagged as an outlier vs. the rolling baseline.
    const isOutlier = Boolean(payload.outlier?.isOutlier);
    const outlierTag = isOutlier
      ? `· OUTLIER ${(payload.outlier!.multiplier).toFixed(1)}x median `
      : "";
    const subject = `[AUDIT EXPORT${isOutlier ? " · OUTLIER" : ""}] ${riskTag}${outlierTag}Audience audit trail pulled by ${payload.actorId} (${payload.rowCounts.total} rows, ${payload.format.toUpperCase()})${burstSuffix}`;
    const burstHtml =
      suppressedCount > 0
        ? `<p style="color:#f97316;font-size:12px;margin:0 0 12px;">⚠ ${suppressedCount} similar export${suppressedCount === 1 ? "" : "s"} by this actor were suppressed since ${escapeHtml(suppressedSince ?? "?")} (dedup window).</p>`
        : "";
    const filterRow = (k: string, v: string | null) =>
      `<p style="color:#e5e7eb;font-size:12px;margin:0 0 4px;"><span style="color:#6b7280;">${escapeHtml(k)}:</span> ${escapeHtml(v ?? "—")}</p>`;
    const riskBlock = riskSignals.length > 0
      ? `<div style="background:#3f1d1d;border:1px solid #dc2626;border-radius:12px;padding:14px;text-align:left;margin:0 0 16px;">
          <p style="color:#fecaca;font-size:11px;text-transform:uppercase;margin:0 0 8px;font-weight:700;letter-spacing:0.5px;">⚠ Unusual filter combination — ${riskSignals.length} risk signal${riskSignals.length === 1 ? "" : "s"} detected</p>
          ${riskLabels
            .map(
              (label) =>
                `<p style="color:#fef2f2;font-size:13px;margin:0 0 4px;font-weight:600;">• ${escapeHtml(label)}</p>`,
            )
            .join("")}
          <p style="color:#fecaca;font-size:11px;margin:8px 0 0;line-height:1.5;">Review the actor, filters and row counts below. If this combination is unfamiliar, treat as a potential leak and investigate immediately.</p>
        </div>`
      : "";
    const outlierBanner = isOutlier
      ? `<p style="background:#7f1d1d;color:#fee2e2;font-size:12px;font-weight:600;border-radius:8px;padding:8px 12px;margin:0 0 12px;">⚠ OUTLIER · ${payload.rowCounts.total} rows is ${(payload.outlier!.multiplier).toFixed(1)}× the rolling median of ${payload.outlier!.rollingMedian.toFixed(0)} (p95 ${payload.outlier!.rollingP95.toFixed(0)}, sample ${payload.outlier!.sampleSize}). Investigate this actor immediately.</p>`
      : "";
    const html = wrapTemplate(cardWrap(`
      ${outlierBanner}
      <p style="color:#e5e7eb;font-size:16px;margin:0 0 8px;font-weight:600;">Audience audit-trail export${isOutlier ? " · OUTLIER" : ""}</p>
      <p style="color:#9ca3af;font-size:13px;margin:0 0 16px;line-height:1.6;">
        Someone pulled the omni-channel audience moderation audit trail.
        ${isOutlier
          ? `<strong style="color:#f87171;">Flagged as an outlier vs. recent export sizes.</strong>`
          : payload.thresholdExceeded
          ? `<strong style="color:#f97316;">This export crossed the alert threshold of ${payload.thresholdRowCount} rows.</strong>`
          : "Notified per audit policy."}
      </p>
      ${burstHtml}
      ${riskBlock}
      <div style="background:#0a0b10;border-radius:12px;padding:16px;text-align:left;margin:0 0 16px;">
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Actor</p>
        <p style="color:#e5e7eb;font-size:13px;margin:0 0 4px;font-family:monospace;">${escapeHtml(payload.actorId)}</p>
        <p style="color:#9ca3af;font-size:11px;margin:0 0 12px;">type: ${escapeHtml(payload.actorType)} · role: ${escapeHtml(payload.actorRole ?? "—")}</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Export</p>
        <p style="color:#e5e7eb;font-size:12px;margin:0 0 4px;font-family:monospace;">${escapeHtml(payload.exportId)}</p>
        <p style="color:#9ca3af;font-size:11px;margin:0 0 12px;">format: ${escapeHtml(payload.format)} · exportedAt: ${escapeHtml(payload.exportedAt)}</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Filters</p>
        ${filterRow("from", payload.filters.fromDate)}
        ${filterRow("to", payload.filters.toDate)}
        ${filterRow("platform", payload.filters.platform)}
        ${filterRow("productionId", payload.filters.productionId)}
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:12px 0 4px;">Row counts</p>
        <p style="color:#e5e7eb;font-size:12px;margin:0 0 4px;">Connectors: ${payload.rowCounts.connectors}</p>
        <p style="color:#e5e7eb;font-size:12px;margin:0 0 4px;">Messages: ${payload.rowCounts.messages}</p>
        <p style="color:#e5e7eb;font-size:12px;margin:0 0 4px;">Decisions: ${payload.rowCounts.decisions}</p>
        <p style="color:#e5e7eb;font-size:12px;margin:0 0 4px;">Commands: ${payload.rowCounts.commands}</p>
        <p style="color:#e5e7eb;font-size:13px;margin:8px 0 0;font-weight:600;">Total: ${payload.rowCounts.total}</p>
      </div>
      <a href="${baseUrl()}/admin/omni-channel-audience#export-log" style="display:inline-block;background:linear-gradient(135deg,#4f7df9,#8b5cf6);color:#fff;font-size:13px;font-weight:600;padding:10px 28px;border-radius:10px;text-decoration:none;">View Audit Export History</a>
      <p style="color:#6b7280;font-size:11px;margin:16px 0 0;">If you do not recognize this actor or filter combination, treat this as a potential leak and investigate immediately.</p>
    `));
    return { subject, html };
  }

  async sendAudienceAuditExportNotification(
    recipients: string[],
    payload: AudienceAuditExportNotificationPayload,
  ) {
    if (recipients.length === 0) {
      throw new Error("no_recipients");
    }
    const { client } = await getResendClient();
    const { subject, html } = this.buildAudienceAuditExportNotificationEmail(payload);
    const result = await client.emails.send({
      from: getSender("admin"),
      to: recipients,
      subject,
      html,
    });
    console.log(`[Email] Audience audit-export notification sent to ${recipients.join(", ")}`, result);
    return result;
  }

  async sendAudienceLegacyTokenKillSwitchNotification(
    recipients: string[],
    event: {
      platform: string;
      previousValue: "true" | "false" | "cleared";
      newValue: "true" | "false" | "cleared";
      updatedBy: string;
      batchId?: string | null;
      flippedAt: string;
    },
    opts: {
      isTest?: boolean;
      suppressedCount?: number;
      suppressedSince?: string | null;
    } = {},
  ) {
    if (recipients.length === 0) {
      throw new Error("no_recipients");
    }
    const { client } = await getResendClient();
    const valueLabel = (v: "true" | "false" | "cleared") =>
      v === "true"
        ? "OFF (env fallback disabled)"
        : v === "false"
        ? "ON (env fallback enabled)"
        : "cleared (back to env/default)";
    const testTag = opts.isTest ? " [TEST]" : "";
    const suppressedCount = opts.suppressedCount ?? 0;
    const suppressedTag =
      suppressedCount > 0
        ? ` — ${suppressedCount} similar suppressed`
        : "";
    const subject = `[KILL-SWITCH FLIP]${testTag} ${event.platform} legacy-token env-fallback ${event.previousValue} → ${event.newValue}${suppressedTag}`;
    const suppressedBlock =
      suppressedCount > 0
        ? `
      <div style="background:#3b1f1f;border:1px solid #7f1d1d;border-radius:12px;padding:12px;text-align:left;margin:0 0 16px;">
        <p style="color:#fecaca;font-size:12px;margin:0;font-weight:600;">
          ${suppressedCount} similar flip${suppressedCount === 1 ? "" : "s"} on this platform/value were suppressed${opts.suppressedSince ? ` since ${escapeHtml(opts.suppressedSince)}` : ""}.
        </p>
        <p style="color:#fca5a5;font-size:11px;margin:6px 0 0;">An admin (or automation) may be repeatedly toggling this kill-switch. Investigate before the next dedup window expires.</p>
      </div>`
        : "";
    const html = wrapTemplate(cardWrap(`
      <p style="color:#e5e7eb;font-size:16px;margin:0 0 8px;font-weight:600;">Legacy-token kill-switch flipped${opts.isTest ? " (test)" : ""}</p>
      ${suppressedBlock}
      <p style="color:#9ca3af;font-size:13px;margin:0 0 16px;line-height:1.6;">
        A root admin changed the per-platform legacy-token env-fallback kill-switch on the omni-channel audience gateway.
        Turning this OFF can instantly break every connector still relying on the shared env token;
        turning it ON re-opens a known attack surface. The plaintext token is <strong>never</strong> included in this email or anywhere in the audit trail.
      </p>
      <div style="background:#0a0b10;border-radius:12px;padding:16px;text-align:left;margin:0 0 16px;">
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Platform</p>
        <p style="color:#e5e7eb;font-size:13px;margin:0 0 12px;font-family:monospace;">${escapeHtml(event.platform)}</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Previous value</p>
        <p style="color:#e5e7eb;font-size:13px;margin:0 0 12px;">${escapeHtml(valueLabel(event.previousValue))}</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">New value</p>
        <p style="color:#e5e7eb;font-size:13px;margin:0 0 12px;font-weight:600;">${escapeHtml(valueLabel(event.newValue))}</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Performed by</p>
        <p style="color:#e5e7eb;font-size:13px;margin:0 0 4px;font-family:monospace;">${escapeHtml(event.updatedBy)}</p>
        <p style="color:#9ca3af;font-size:11px;margin:0 0 12px;">at ${escapeHtml(event.flippedAt)}${event.batchId ? ` · batch ${escapeHtml(event.batchId)}` : ""}</p>
      </div>
      <a href="${baseUrl()}/admin/omni-channel-audience#legacy-token-status" style="display:inline-block;background:linear-gradient(135deg,#4f7df9,#8b5cf6);color:#fff;font-size:13px;font-weight:600;padding:10px 28px;border-radius:10px;text-decoration:none;">View Legacy-Token Status</a>
      <p style="color:#6b7280;font-size:11px;margin:16px 0 0;">If you do not recognize this admin or this flip, treat as a potential incident and investigate immediately.</p>
    `));
    const result = await client.emails.send({
      from: getSender("admin"),
      to: recipients,
      subject,
      html,
    });
    console.log(`[Email] Audience legacy-token kill-switch notification sent to ${recipients.join(", ")}`, result);
    return result;
  }

  async sendAudienceConnectorRotationNotification(
    recipients: string[],
    event: {
      connectorId: string;
      platform: string;
      action: "set" | "rotate" | "delete";
      rotatedBy: string | null;
      rotatedAt: string;
      rotationCount: number;
      keyVersion: number;
    },
    opts: {
      isTest?: boolean;
      suppressedCount?: number;
      suppressedSince?: string | null;
    } = {},
  ) {
    if (recipients.length === 0) {
      throw new Error("no_recipients");
    }
    const { client } = await getResendClient();
    const actionLabel =
      event.action === "set"
        ? "INSTALLED"
        : event.action === "rotate"
        ? "ROTATED"
        : "DELETED";
    const testTag = opts.isTest ? " [TEST]" : "";
    const suppressedCount = opts.suppressedCount ?? 0;
    const suppressedTag =
      suppressedCount > 0
        ? ` — ${suppressedCount} similar suppressed`
        : "";
    const subject = `[CONNECTOR TOKEN ${actionLabel}]${testTag} ${event.platform} connector ${event.connectorId} — rotation #${event.rotationCount}${suppressedTag}`;
    const suppressedBlock =
      suppressedCount > 0
        ? `
      <div style="background:#3b1f1f;border:1px solid #7f1d1d;border-radius:12px;padding:12px;text-align:left;margin:0 0 16px;">
        <p style="color:#fecaca;font-size:12px;margin:0;font-weight:600;">
          ${suppressedCount} similar rotation${suppressedCount === 1 ? "" : "s"} on this connector were suppressed${opts.suppressedSince ? ` since ${escapeHtml(opts.suppressedSince)}` : ""}.
        </p>
        <p style="color:#fca5a5;font-size:11px;margin:6px 0 0;">A loop or compromise-response automation may be rotating this token repeatedly. Investigate before the next dedup window expires.</p>
      </div>`
        : "";
    const html = wrapTemplate(cardWrap(`
      <p style="color:#e5e7eb;font-size:16px;margin:0 0 8px;font-weight:600;">Connector token ${escapeHtml(actionLabel.toLowerCase())}${opts.isTest ? " (test)" : ""}</p>
      ${suppressedBlock}
      <p style="color:#9ca3af;font-size:13px;margin:0 0 16px;line-height:1.6;">
        A per-connector platform access token was ${escapeHtml(actionLabel.toLowerCase())} on the omni-channel audience gateway.
        ${event.action === "delete"
          ? "The connector can no longer send to its platform until a new token is installed."
          : "All future gateway dispatches for this connector will use the new token."}
        The plaintext token is <strong>never</strong> included in this email or anywhere in the audit trail.
      </p>
      <div style="background:#0a0b10;border-radius:12px;padding:16px;text-align:left;margin:0 0 16px;">
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Connector</p>
        <p style="color:#e5e7eb;font-size:13px;margin:0 0 4px;font-family:monospace;">${escapeHtml(event.connectorId)}</p>
        <p style="color:#9ca3af;font-size:11px;margin:0 0 12px;">platform: ${escapeHtml(event.platform)}</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Action</p>
        <p style="color:#e5e7eb;font-size:13px;margin:0 0 12px;">${escapeHtml(actionLabel)}</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Performed by</p>
        <p style="color:#e5e7eb;font-size:13px;margin:0 0 4px;font-family:monospace;">${escapeHtml(event.rotatedBy ?? "unknown")}</p>
        <p style="color:#9ca3af;font-size:11px;margin:0 0 12px;">at ${escapeHtml(event.rotatedAt)}</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Rotation count</p>
        <p style="color:#e5e7eb;font-size:13px;margin:0 0 4px;">#${event.rotationCount} (key version ${event.keyVersion})</p>
      </div>
      <a href="${baseUrl()}/admin/omni-channel-audience#connector-rotation-notifier" style="display:inline-block;background:linear-gradient(135deg,#4f7df9,#8b5cf6);color:#fff;font-size:13px;font-weight:600;padding:10px 28px;border-radius:10px;text-decoration:none;">View Connector Secrets</a>
      <p style="color:#6b7280;font-size:11px;margin:16px 0 0;">If you do not recognize this admin or this rotation, treat as a potential credential compromise and investigate immediately.</p>
    `));
    const result = await client.emails.send({
      from: getSender("admin"),
      to: recipients,
      subject,
      html,
    });
    console.log(`[Email] Audience connector rotation notification sent to ${recipients.join(", ")}`, result);
    return result;
  }

  async sendAudienceArchiveExpiryDigest(
    recipients: string[],
    payload: {
      fileCount: number;
      totalBytes: number;
      earliestExpiryIso: string | null;
      warningLeadDays: number;
      retentionDays: number;
      autoDeleteEnabled: boolean;
      triggeredBy: string | null;
      isTest?: boolean;
    },
  ) {
    if (recipients.length === 0) throw new Error("no_recipients");
    const { client } = await getResendClient();
    const mb = (payload.totalBytes / (1024 * 1024)).toFixed(2);
    const earliest = payload.earliestExpiryIso
      ? new Date(payload.earliestExpiryIso).toISOString()
      : "—";
    const testTag = payload.isTest ? " [TEST]" : "";
    const subject = payload.isTest
      ? `[TEST] Audience archive deletion digest`
      : `[ARCHIVE] ${payload.fileCount.toLocaleString()} audience archive file${payload.fileCount === 1 ? "" : "s"} scheduled for permanent deletion within ${payload.warningLeadDays}d${testTag}`;
    const html = wrapTemplate(cardWrap(`
      <p style="color:#e5e7eb;font-size:16px;margin:0 0 8px;font-weight:600;">Upcoming audience archive deletion</p>
      <p style="color:#9ca3af;font-size:13px;margin:0 0 16px;line-height:1.6;">
        ${payload.isTest
          ? "This is a <strong>test</strong> send from the audience archive deletion notifier. No archives are being deleted."
          : `Your audience-archive retention window is <strong>${payload.retentionDays} days</strong>. Auto-delete is <strong>${payload.autoDeleteEnabled ? "ON" : "OFF"}</strong>. The following batch is approaching permanent deletion.`}
      </p>
      <div style="background:#0a0b10;border-radius:12px;padding:16px;text-align:left;margin:0 0 16px;">
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Files due within ${payload.warningLeadDays} day${payload.warningLeadDays === 1 ? "" : "s"}</p>
        <p style="color:#e5e7eb;font-size:20px;font-weight:700;margin:0 0 12px;">${payload.fileCount.toLocaleString()} file${payload.fileCount === 1 ? "" : "s"} · ${mb} MB</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Earliest deletion</p>
        <p style="color:#e5e7eb;font-size:13px;font-family:monospace;margin:0 0 12px;">${escapeHtml(earliest)}</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Retention policy</p>
        <p style="color:#e5e7eb;font-size:12px;margin:0;">${payload.retentionDays} days · auto-delete ${payload.autoDeleteEnabled ? "ON" : "OFF"}</p>
      </div>
      <a href="${baseUrl()}/admin/omni-channel-audience#archive-policy" style="display:inline-block;background:linear-gradient(135deg,#4f7df9,#8b5cf6);color:#fff;font-size:13px;font-weight:600;padding:10px 28px;border-radius:10px;text-decoration:none;">Open Archive Policy</a>
      <p style="color:#6b7280;font-size:11px;margin:16px 0 0;">Download anything you still need before the next sweep, or raise the retention window. To stop these emails, open the Archive Deletion Alerts card and toggle it off.</p>
    `));
    const result = await client.emails.send({
      from: getSender("admin"),
      to: recipients,
      subject,
      html,
    });
    console.log(`[Email] Audience archive expiry digest sent to ${recipients.join(", ")}`, result);
    return result;
  }

  async sendAudienceArchiveCleanupSummary(
    recipients: string[],
    payload: {
      deletedFiles: number;
      bytesDeleted: number;
      retentionDays: number;
      cutoffIso: string;
      trigger: "scheduled" | "manual" | "cli";
      candidateFiles: number;
      errors: number;
      fileThreshold: number;
      bytesThreshold: number;
      thresholdHit: "files" | "bytes";
    },
  ) {
    if (recipients.length === 0) throw new Error("no_recipients");
    const { client } = await getResendClient();
    const mb = (payload.bytesDeleted / (1024 * 1024)).toFixed(2);
    const thresholdMb = (payload.bytesThreshold / (1024 * 1024)).toFixed(2);
    const subject = `[ARCHIVE] ${payload.deletedFiles.toLocaleString()} audience archive file${payload.deletedFiles === 1 ? "" : "s"} permanently deleted (${mb} MB)`;
    const html = wrapTemplate(cardWrap(`
      <p style="color:#e5e7eb;font-size:16px;margin:0 0 8px;font-weight:600;">Audience archive cleanup summary</p>
      <p style="color:#9ca3af;font-size:13px;margin:0 0 16px;line-height:1.6;">
        A <strong>${escapeHtml(payload.trigger)}</strong> archive cleanup just completed and crossed the
        alert threshold (${payload.thresholdHit === "files"
          ? `${payload.fileThreshold} files`
          : `${thresholdMb} MB`}). These archives are gone permanently — restore is not possible.
      </p>
      <div style="background:#0a0b10;border-radius:12px;padding:16px;text-align:left;margin:0 0 16px;">
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Permanently deleted</p>
        <p style="color:#e5e7eb;font-size:20px;font-weight:700;margin:0 0 12px;">${payload.deletedFiles.toLocaleString()} file${payload.deletedFiles === 1 ? "" : "s"} · ${mb} MB</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Cutoff</p>
        <p style="color:#e5e7eb;font-size:12px;font-family:monospace;margin:0 0 12px;">${escapeHtml(payload.cutoffIso)}</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Retention / Candidates / Errors</p>
        <p style="color:#e5e7eb;font-size:12px;margin:0;">${payload.retentionDays} days · ${payload.candidateFiles} candidate${payload.candidateFiles === 1 ? "" : "s"} · ${payload.errors} error${payload.errors === 1 ? "" : "s"}</p>
      </div>
      <a href="${baseUrl()}/admin/omni-channel-audience#archive-deletions" style="display:inline-block;background:linear-gradient(135deg,#4f7df9,#8b5cf6);color:#fff;font-size:13px;font-weight:600;padding:10px 28px;border-radius:10px;text-decoration:none;">View Deletion Audit Log</a>
      <p style="color:#6b7280;font-size:11px;margin:16px 0 0;">If this deletion was unexpected, investigate the trigger immediately. The audit log captures every path, byte count, and timestamp.</p>
    `));
    const result = await client.emails.send({
      from: getSender("admin"),
      to: recipients,
      subject,
      html,
    });
    console.log(`[Email] Audience archive cleanup summary sent to ${recipients.join(", ")}`, result);
    return result;
  }

  /**
   * Task #626 — "snooze ended, here's what got swallowed" recap for the
   * audit-export history *staleness* alert. Sent once per snooze
   * window on the first stale tick after the window closes. Carries
   * concrete numbers (suppressed tick count, max suppressed age,
   * current age vs allowed age, last successful run) so the founder
   * can decide whether the scheduler is actually broken.
   */
  async sendAudienceAuditHistoryEmailStaleSnoozeRecap(
    to: string,
    payload: {
      snoozeStartedAt: string;
      snoozeEndedAt: string;
      durationMs: number;
      suppressedTicks: number;
      maxSuppressedAgeMs: number | null;
      currentAgeMs: number | null;
      allowedAgeMs: number;
      cadence: "weekly" | "monthly";
      lastSuccessfulRunAt: string | null;
      actionUrl: string;
    },
  ) {
    try {
      const { client } = await getResendClient();
      const dayMs = 24 * 60 * 60 * 1000;
      const hours = Math.max(
        1,
        Math.round(payload.durationMs / (60 * 60 * 1000)),
      );
      const durationLabel =
        hours >= 48
          ? `${Math.round(hours / 24)} days`
          : `${hours} hour${hours === 1 ? "" : "s"}`;
      const fmtDays = (ms: number | null) =>
        ms === null
          ? "—"
          : `${(Math.round((ms / dayMs) * 10) / 10).toFixed(1)}d`;
      const subject = `[STALE-RECAP] Audit-export history snooze ended — ${payload.suppressedTicks} silent tick${payload.suppressedTicks === 1 ? "" : "s"} suppressed`;
      const result = await client.emails.send({
        from: getSender("admin"),
        to,
        subject,
        html: wrapTemplate(cardWrap(`
          <p style="color:#e5e7eb;font-size:16px;margin:0 0 8px;font-weight:600;">Audit-export history alert snooze recap</p>
          <p style="color:#9ca3af;font-size:13px;margin:0 0 16px;line-height:1.6;">
            The staleness alert for the scheduled audit-export history email was muted for
            <strong>${escapeHtml(durationLabel)}</strong>. Here's what would have paged you while alerts were silent.
          </p>
          <div style="background:#0a0b10;border-radius:12px;padding:16px;text-align:left;margin:0 0 16px;">
            <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Suppressed stale ticks</p>
            <p style="color:#e5e7eb;font-size:20px;font-weight:700;margin:0 0 12px;">${payload.suppressedTicks.toLocaleString()} tick${payload.suppressedTicks === 1 ? "" : "s"}</p>
            <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Worst age observed during snooze</p>
            <p style="color:#e5e7eb;font-size:13px;margin:0 0 12px;">${fmtDays(payload.maxSuppressedAgeMs)}</p>
            <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Current age / allowed (cadence=${escapeHtml(payload.cadence)})</p>
            <p style="color:#e5e7eb;font-size:13px;margin:0 0 12px;">${fmtDays(payload.currentAgeMs)} / ${fmtDays(payload.allowedAgeMs)}</p>
            <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Last successful scheduler run</p>
            <p style="color:#e5e7eb;font-size:12px;font-family:monospace;margin:0 0 12px;">${escapeHtml(payload.lastSuccessfulRunAt ?? "never")}</p>
            <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Snooze window</p>
            <p style="color:#e5e7eb;font-size:12px;font-family:monospace;margin:0;">${escapeHtml(payload.snoozeStartedAt)} → ${escapeHtml(payload.snoozeEndedAt)}</p>
          </div>
          <a href="${baseUrl()}${payload.actionUrl}" style="display:inline-block;background:linear-gradient(135deg,#4f7df9,#8b5cf6);color:#fff;font-size:13px;font-weight:600;padding:10px 28px;border-radius:10px;text-decoration:none;">Open Audit-Export Panel</a>
          <p style="color:#6b7280;font-size:11px;margin:16px 0 0;">Alerts will now resume on the normal schedule. If the scheduler is genuinely broken, the staleness alert will continue firing on the next tick.</p>
        `)),
      });
      console.log(`[Email] Audit-history stale snooze recap sent to ${to}`, result);
      return result;
    } catch (err) {
      console.error(`[Email] Failed audit-history stale snooze recap to ${to}:`, err);
      throw err;
    }
  }

  async sendAudienceArchiveSnoozeRecap(
    recipients: string[],
    payload: {
      suppressedCount: number;
      suppressedFiles: number;
      suppressedBytes: number;
      snoozeStartedAt: string;
      snoozeEndedAt: string;
      durationMs: number;
      trigger: "manual_unsnooze" | "natural_expiry" | "replaced";
    },
  ) {
    if (recipients.length === 0) throw new Error("no_recipients");
    const { client } = await getResendClient();
    const mb = (payload.suppressedBytes / (1024 * 1024)).toFixed(2);
    const hours = Math.max(1, Math.round(payload.durationMs / (60 * 60 * 1000)));
    const durationLabel =
      hours >= 48
        ? `${Math.round(hours / 24)} days`
        : `${hours} hour${hours === 1 ? "" : "s"}`;
    const triggerLabel =
      payload.trigger === "manual_unsnooze"
        ? "you cleared the snooze"
        : payload.trigger === "replaced"
          ? "the snooze was replaced with a new window"
          : "the snooze window expired";
    const subject = `[ARCHIVE] Snooze ended — ${payload.suppressedCount} archive alert${payload.suppressedCount === 1 ? "" : "s"} were suppressed`;
    const html = wrapTemplate(cardWrap(`
      <p style="color:#e5e7eb;font-size:16px;margin:0 0 8px;font-weight:600;">Archive deletion snooze recap</p>
      <p style="color:#9ca3af;font-size:13px;margin:0 0 16px;line-height:1.6;">
        The archive deletion alert snooze just ended (${escapeHtml(triggerLabel)}). Here's what was silently
        swallowed while alerts were muted for <strong>${escapeHtml(durationLabel)}</strong>.
      </p>
      <div style="background:#0a0b10;border-radius:12px;padding:16px;text-align:left;margin:0 0 16px;">
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Suppressed alerts</p>
        <p style="color:#e5e7eb;font-size:20px;font-weight:700;margin:0 0 12px;">${payload.suppressedCount.toLocaleString()} alert${payload.suppressedCount === 1 ? "" : "s"}</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Total files / bytes covered</p>
        <p style="color:#e5e7eb;font-size:13px;margin:0 0 12px;">${payload.suppressedFiles.toLocaleString()} file${payload.suppressedFiles === 1 ? "" : "s"} · ${mb} MB</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Snooze window</p>
        <p style="color:#e5e7eb;font-size:12px;font-family:monospace;margin:0;">${escapeHtml(payload.snoozeStartedAt)} → ${escapeHtml(payload.snoozeEndedAt)}</p>
      </div>
      <a href="${baseUrl()}/admin/omni-channel-audience#archive-policy" style="display:inline-block;background:linear-gradient(135deg,#4f7df9,#8b5cf6);color:#fff;font-size:13px;font-weight:600;padding:10px 28px;border-radius:10px;text-decoration:none;">Open Archive Policy</a>
      <p style="color:#6b7280;font-size:11px;margin:16px 0 0;">Alerts will now resume on the normal schedule. Review the queued deletions and raise the retention window if anything important is at risk.</p>
    `));
    const result = await client.emails.send({
      from: getSender("admin"),
      to: recipients,
      subject,
      html,
    });
    console.log(`[Email] Audience archive snooze recap sent to ${recipients.join(", ")}`, result);
    return result;
  }

  /**
   * Task #622 — one-shot "PTO ended — here's what you missed" email.
   * Triggered when the global founder PTO snooze window transitions
   * from snoozed → not-snoozed (manual unsnooze, replaced window, or
   * natural expiry). Recipients are sourced from the audience-archive
   * deletion notifier's recipient list to avoid a second config knob.
   */
  async sendFounderPtoResumeRecap(
    recipients: string[],
    payload: {
      suppressedCount: number;
      enrolledNotifiers: string[];
      snoozeStartedAt: string;
      snoozeEndedAt: string;
      durationMs: number;
      trigger: "manual_unsnooze" | "replaced" | "natural_expiry";
      snoozePolicyKind: "fixed" | "auto_extend" | "weekday_mute";
    },
  ) {
    if (recipients.length === 0) throw new Error("no_recipients");
    const { client } = await getResendClient();
    const hours = Math.max(1, Math.round(payload.durationMs / (60 * 60 * 1000)));
    const durationLabel =
      hours >= 48
        ? `${Math.round(hours / 24)} days`
        : `${hours} hour${hours === 1 ? "" : "s"}`;
    const triggerLabel =
      payload.trigger === "manual_unsnooze"
        ? "you cleared the PTO snooze"
        : payload.trigger === "replaced"
          ? "the PTO snooze was replaced with a new window"
          : payload.snoozePolicyKind === "weekday_mute"
            ? "the weekday-mute window ended"
            : "the PTO snooze window expired";
    const subject = `[PTO] Founder PTO ended — ${payload.suppressedCount} alert${payload.suppressedCount === 1 ? " was" : "s were"} suppressed`;
    const notifierLines = payload.enrolledNotifiers.length > 0
      ? payload.enrolledNotifiers
          .map(
            (id) =>
              `<p style="color:#e5e7eb;font-size:13px;margin:0 0 4px;">• ${escapeHtml(id)}</p>`,
          )
          .join("")
      : `<p style="color:#9ca3af;font-size:13px;margin:0 0 4px;">(no enrolled notifiers)</p>`;
    const html = wrapTemplate(cardWrap(`
      <p style="color:#e5e7eb;font-size:16px;margin:0 0 8px;font-weight:600;">Founder PTO mode ended</p>
      <p style="color:#9ca3af;font-size:13px;margin:0 0 16px;line-height:1.6;">
        The global founder PTO snooze just ended (${escapeHtml(triggerLabel)}).
        Notifiers will resume on their normal schedule. Here's what was
        silently swallowed while PTO mode was active for
        <strong>${escapeHtml(durationLabel)}</strong>.
      </p>
      <div style="background:#0a0b10;border-radius:12px;padding:16px;text-align:left;margin:0 0 16px;">
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Suppressed alerts</p>
        <p style="color:#e5e7eb;font-size:20px;font-weight:700;margin:0 0 12px;">${payload.suppressedCount.toLocaleString()} alert${payload.suppressedCount === 1 ? "" : "s"}</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Enrolled notifiers</p>
        ${notifierLines}
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:12px 0 4px;">PTO window</p>
        <p style="color:#e5e7eb;font-size:12px;font-family:monospace;margin:0 0 8px;">${escapeHtml(payload.snoozeStartedAt)} → ${escapeHtml(payload.snoozeEndedAt)}</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Policy</p>
        <p style="color:#e5e7eb;font-size:12px;margin:0;">${escapeHtml(payload.snoozePolicyKind)}</p>
      </div>
      <a href="${baseUrl()}/admin/founder-pto-mode" style="display:inline-block;background:linear-gradient(135deg,#4f7df9,#8b5cf6);color:#fff;font-size:13px;font-weight:600;padding:10px 28px;border-radius:10px;text-decoration:none;">Open Founder PTO Mode</a>
      <p style="color:#6b7280;font-size:11px;margin:16px 0 0;">Review the queues for each enrolled notifier in case anything important slipped through during PTO.</p>
    `));
    const result = await client.emails.send({
      from: getSender("admin"),
      to: recipients,
      subject,
      html,
    });
    console.log(`[Email] Founder PTO resume recap sent to ${recipients.join(", ")}`, result);
    return result;
  }

  async sendAudienceArchiveTrashBinAlert(
    recipients: string[],
    payload: {
      trashFileCount: number;
      totalTrashBytes: number;
      trashWarnFileCount: number;
      trashWarnBytes: number;
      trashFileCountExceeded: boolean;
      trashBytesExceeded: boolean;
      graceDays: number;
      oldestPendingDeletedAtIso: string | null;
      nextPurgeAtIso: string | null;
      triggeredBy: string | null;
      isTest?: boolean;
    },
  ) {
    if (recipients.length === 0) throw new Error("no_recipients");
    const { client } = await getResendClient();
    const mb = (payload.totalTrashBytes / (1024 * 1024)).toFixed(2);
    const warnMb = (payload.trashWarnBytes / (1024 * 1024)).toFixed(2);
    const oldest = payload.oldestPendingDeletedAtIso
      ? new Date(payload.oldestPendingDeletedAtIso).toISOString()
      : "—";
    const nextPurge = payload.nextPurgeAtIso
      ? new Date(payload.nextPurgeAtIso).toISOString()
      : "—";
    const testTag = payload.isTest ? " [TEST]" : "";
    const breachParts: string[] = [];
    if (payload.trashFileCountExceeded) {
      breachParts.push(
        `${payload.trashFileCount.toLocaleString()} files (limit ${payload.trashWarnFileCount.toLocaleString()})`,
      );
    }
    if (payload.trashBytesExceeded) {
      breachParts.push(`${mb} MB (limit ${warnMb} MB)`);
    }
    const breachLabel = breachParts.join(" · ");
    const subject = payload.isTest
      ? `[TEST] Audience archive recycle bin storage alert`
      : `[ARCHIVE] Recycle bin over threshold — ${breachLabel}${testTag}`;
    const html = wrapTemplate(cardWrap(`
      <p style="color:#e5e7eb;font-size:16px;margin:0 0 8px;font-weight:600;">Audience archive recycle bin is hoarding storage</p>
      <p style="color:#9ca3af;font-size:13px;margin:0 0 16px;line-height:1.6;">
        ${payload.isTest
          ? "This is a <strong>test</strong> send from the trash-bin notifier. No alert thresholds were actually crossed."
          : `Soft-deleted audience archive files are sitting in the <code>.trash/</code> recycle bin past the configured thresholds. Files are kept for <strong>${payload.graceDays} day${payload.graceDays === 1 ? "" : "s"}</strong> before permanent purge, so storage may keep growing until you act.`}
      </p>
      <div style="background:#0a0b10;border-radius:12px;padding:16px;text-align:left;margin:0 0 16px;">
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Currently in recycle bin</p>
        <p style="color:#e5e7eb;font-size:20px;font-weight:700;margin:0 0 12px;">${payload.trashFileCount.toLocaleString()} file${payload.trashFileCount === 1 ? "" : "s"} · ${mb} MB</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Thresholds</p>
        <p style="color:#e5e7eb;font-size:12px;margin:0 0 12px;">
          files: ${payload.trashWarnFileCount > 0 ? payload.trashWarnFileCount.toLocaleString() : "disabled"}
          ${payload.trashFileCountExceeded ? '<span style="color:#f59e0b;font-weight:600;">— exceeded</span>' : ""}
          · bytes: ${payload.trashWarnBytes > 0 ? `${warnMb} MB` : "disabled"}
          ${payload.trashBytesExceeded ? '<span style="color:#f59e0b;font-weight:600;">— exceeded</span>' : ""}
        </p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 4px;">Oldest pending / next purge</p>
        <p style="color:#e5e7eb;font-size:12px;font-family:monospace;margin:0;">${escapeHtml(oldest)} → ${escapeHtml(nextPurge)}</p>
      </div>
      <a href="${baseUrl()}/admin/omni-channel-audience#archive-policy" style="display:inline-block;background:linear-gradient(135deg,#4f7df9,#8b5cf6);color:#fff;font-size:13px;font-weight:600;padding:10px 28px;border-radius:10px;text-decoration:none;">Open Archive Policy</a>
      <p style="color:#6b7280;font-size:11px;margin:16px 0 0;">Either restore anything you still need, raise the threshold, or shorten the grace window to let the purge catch up. To stop these emails, open the Recycle Bin Alerts card and toggle it off.</p>
    `));
    const result = await client.emails.send({
      from: getSender("admin"),
      to: recipients,
      subject,
      html,
    });
    console.log(`[Email] Audience archive trash-bin alert sent to ${recipients.join(", ")}`, result);
    return result;
  }

  /**
   * Task #618 — push email to root admins the moment the restore-log
   * rate spike threshold is weakened (set to 0 / alerting off, or
   * loosened by 2x+). Names the actor, prior effective value and new
   * effective value so the change is immediately visible.
   */
  async sendRestoreRateAlertWeakenedEmail(
    recipients: string[],
    payload: {
      actor: string;
      priorEffective: number;
      newEffective: number;
      priorOverride: number | null;
      newOverride: number | null;
      reason: "disabled" | "loosened_2x";
      occurredAt: string;
    },
  ) {
    if (!recipients.length) return null;
    const { client } = await getResendClient();
    const reasonLabel =
      payload.reason === "disabled"
        ? "Alerting DISABLED (threshold set to 0)"
        : `Loosened ${
            payload.priorEffective > 0
              ? `${(payload.newEffective / payload.priorEffective).toFixed(1)}x`
              : ""
          } (now ${payload.newEffective.toLocaleString()}, was ${payload.priorEffective.toLocaleString()})`;
    const subject =
      payload.reason === "disabled"
        ? "[HIGH] Audience restore-rate alert weakened — alerting DISABLED — Mougle Admin"
        : "[HIGH] Audience restore-rate alert weakened — Mougle Admin";
    const link = `${baseUrl()}/admin/omni-channel-audience#retention`;
    const html = wrapTemplate(cardWrap(`
      <div style="background:#f97316;display:inline-block;padding:4px 12px;border-radius:6px;margin-bottom:16px;">
        <span style="color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;">High</span>
      </div>
      <p style="color:#e5e7eb;font-size:16px;margin:0 0 12px;font-weight:600;">Audience restore-rate alert weakened</p>
      <p style="color:#9ca3af;font-size:13px;margin:0 0 16px;line-height:1.6;">
        <strong style="color:#e5e7eb;">${escapeHtml(payload.actor)}</strong>
        just changed the restore-log rate spike threshold.
        ${escapeHtml(reasonLabel)}.
      </p>
      <div style="background:#0a0b10;border-radius:12px;padding:14px;text-align:left;margin:0 0 16px;">
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 6px;">Prior effective</p>
        <p style="color:#e5e7eb;font-size:13px;font-family:monospace;margin:0 0 10px;">${payload.priorEffective.toLocaleString()}${payload.priorOverride == null ? " (default)" : ""}</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 6px;">New effective</p>
        <p style="color:#e5e7eb;font-size:13px;font-family:monospace;margin:0;">${payload.newEffective.toLocaleString()}${payload.newOverride == null ? " (default)" : payload.newOverride === 0 ? " (alerting off)" : ""}</p>
      </div>
      <p style="color:#9ca3af;font-size:12px;margin:0 0 16px;">Changed at ${escapeHtml(payload.occurredAt)}.</p>
      <a href="${link}" style="display:inline-block;background:#f97316;color:#fff;font-size:13px;font-weight:600;padding:10px 28px;border-radius:10px;text-decoration:none;">Review threshold</a>
      <p style="color:#6b7280;font-size:11px;margin:16px 0 0;">If this was you, no action needed. To stop these emails, open the restore-log rate block and uncheck "Notify on weakening".</p>
    `));
    const result = await client.emails.send({
      from: getSender("admin"),
      to: recipients,
      subject,
      html,
    });
    console.log(`[Email] Restore-rate alert weakened email sent to ${recipients.join(", ")}`, result);
    return result;
  }

  /**
   * Task #676 — generic "safety threshold weakened" notification used by
   * the stale-rows / archive-deletion / audit-export notifier controls.
   * Mirrors `sendRestoreRateAlertWeakenedEmail` but takes a generic
   * `controlLabel` so each weakening surface can describe itself.
   */
  async sendSafetyThresholdWeakenedEmail(
    recipients: string[],
    payload: {
      controlLabel: string;
      controlKey: string;
      actor: string;
      reason: "disabled" | "loosened_2x" | "control_disabled";
      detail: string;
      link: string;
      occurredAt: string;
    },
  ) {
    if (!recipients.length) return null;
    const { client } = await getResendClient();
    const reasonHeadline =
      payload.reason === "disabled"
        ? "Alerting DISABLED (threshold set to 0)"
        : payload.reason === "control_disabled"
          ? "Notifier turned OFF entirely"
          : "Threshold loosened by 2x or more";
    const subject = `[HIGH] ${payload.controlLabel} weakened — Mougle Admin`;
    const html = wrapTemplate(cardWrap(`
      <div style="background:#f97316;display:inline-block;padding:4px 12px;border-radius:6px;margin-bottom:16px;">
        <span style="color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;">High</span>
      </div>
      <p style="color:#e5e7eb;font-size:16px;margin:0 0 12px;font-weight:600;">${escapeHtml(payload.controlLabel)} weakened</p>
      <p style="color:#9ca3af;font-size:13px;margin:0 0 16px;line-height:1.6;">
        <strong style="color:#e5e7eb;">${escapeHtml(payload.actor)}</strong>
        just weakened a safety control. ${escapeHtml(reasonHeadline)}.
      </p>
      <div style="background:#0a0b10;border-radius:12px;padding:14px;text-align:left;margin:0 0 16px;">
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 6px;">Control</p>
        <p style="color:#e5e7eb;font-size:13px;font-family:monospace;margin:0 0 10px;">${escapeHtml(payload.controlKey)}</p>
        <p style="color:#6b7280;font-size:10px;text-transform:uppercase;margin:0 0 6px;">Change</p>
        <p style="color:#e5e7eb;font-size:13px;font-family:monospace;margin:0;white-space:pre-wrap;">${escapeHtml(payload.detail)}</p>
      </div>
      <p style="color:#9ca3af;font-size:12px;margin:0 0 16px;">Changed at ${escapeHtml(payload.occurredAt)}.</p>
      <a href="${payload.link}" style="display:inline-block;background:#f97316;color:#fff;font-size:13px;font-weight:600;padding:10px 28px;border-radius:10px;text-decoration:none;">Review control</a>
      <p style="color:#6b7280;font-size:11px;margin:16px 0 0;">If this was you, no action needed. To stop these emails, open the control's card and uncheck "Notify on weakening".</p>
    `));
    const result = await client.emails.send({
      from: getSender("admin"),
      to: recipients,
      subject,
      html,
    });
    console.log(`[Email] Safety-threshold weakened email (${payload.controlKey}) sent to ${recipients.join(", ")}`, result);
    return result;
  }
}

export const emailService = new EmailService();
