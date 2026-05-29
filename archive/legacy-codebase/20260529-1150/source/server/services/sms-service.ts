/**
 * Minimal best-effort SMS sender.
 *
 * Uses Twilio's REST API via `fetch` when the following env vars are
 * configured:
 *   - TWILIO_ACCOUNT_SID
 *   - TWILIO_AUTH_TOKEN
 *   - TWILIO_FROM_NUMBER
 *
 * Recipient lookup helpers prefer `FOUNDER_PHONE` (single number) and
 * fall back to a comma-separated `FOUNDER_PHONES` list.
 *
 * All public functions are best-effort:
 *  - Missing credentials -> log and return `false`, never throw.
 *  - Network/Twilio errors -> log and return `false`, never throw.
 *
 * This is intentionally tiny — it only exists so safety-critical alert
 * services can page the founder by SMS without coupling to a heavier
 * notifications stack.
 */

export interface SendSmsResult {
  ok: boolean;
  to: string;
  error?: string;
}

function getCreds(): { sid: string; token: string; from: string } | null {
  const sid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = (process.env.TWILIO_FROM_NUMBER || "").trim();
  if (!sid || !token || !from) return null;
  return { sid, token, from };
}

export function getFounderPhones(): string[] {
  const single = (process.env.FOUNDER_PHONE || "").trim();
  const list = (process.env.FOUNDER_PHONES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [single, ...list]) {
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

export async function sendSms(to: string, body: string): Promise<SendSmsResult> {
  if (!to) return { ok: false, to, error: "no_recipient" };
  const creds = getCreds();
  if (!creds) {
    console.log("[SmsService] skipping send: Twilio credentials not configured");
    return { ok: false, to, error: "no_credentials" };
  }
  try {
    const auth = Buffer.from(`${creds.sid}:${creds.token}`).toString("base64");
    const params = new URLSearchParams({
      To: to,
      From: creds.from,
      Body: body.slice(0, 1500),
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds.sid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[SmsService] Twilio send failed status=${res.status} body=${text.slice(0, 200)}`,
      );
      return { ok: false, to, error: `twilio_status_${res.status}` };
    }
    return { ok: true, to };
  } catch (err) {
    console.error("[SmsService] send threw:", err);
    return { ok: false, to, error: String((err as Error)?.message || err).slice(0, 200) };
  }
}

export async function sendFounderSms(body: string): Promise<SendSmsResult[]> {
  const phones = getFounderPhones();
  if (phones.length === 0) {
    console.log("[SmsService] no founder phone configured (FOUNDER_PHONE / FOUNDER_PHONES)");
    return [];
  }
  const results: SendSmsResult[] = [];
  for (const phone of phones) {
    try {
      results.push(await sendSms(phone, body));
    } catch (err) {
      results.push({
        ok: false,
        to: phone,
        error: String((err as Error)?.message || err).slice(0, 200),
      });
    }
  }
  return results;
}
