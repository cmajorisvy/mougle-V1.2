import http from "node:http";
import https from "node:https";
import net from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import { URL } from "node:url";

export class SafeFetchError extends Error {
  status: number;
  code: string;
  constructor(code: string, status = 400, message?: string) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

export function isPrivateIp(ip: string): boolean {
  const fam = net.isIP(ip);
  if (fam === 4) {
    const parts = ip.split(".").map((x) => Number(x));
    if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (fam === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true;
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
    if (lower.startsWith("ff")) return true;
    const m = lower.match(/^::ffff:([0-9.]+)$/);
    if (m) return isPrivateIp(m[1]);
    return false;
  }
  return true;
}

export async function resolvePublicAddress(
  hostname: string,
): Promise<{ address: string; family: 4 | 6 }> {
  const fam = net.isIP(hostname);
  if (fam) {
    if (isPrivateIp(hostname)) {
      throw new SafeFetchError("blocked_private_address", 400);
    }
    return { address: hostname, family: fam as 4 | 6 };
  }
  let records: { address: string; family: number }[];
  try {
    records = await dnsLookup(hostname, { all: true });
  } catch {
    throw new SafeFetchError("dns_lookup_failed", 400);
  }
  if (!records.length) throw new SafeFetchError("dns_no_records", 400);
  for (const r of records) {
    if (isPrivateIp(r.address)) {
      throw new SafeFetchError("blocked_private_address", 400);
    }
  }
  const first = records[0];
  return { address: first.address, family: first.family as 4 | 6 };
}

export interface SafeImageFetchResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export interface SafeImageFetchOptions {
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  acceptHeader?: string;
  userAgent?: string;
}

export type SafeFetchOptions = SafeImageFetchOptions;
export type SafeFetchResult = SafeImageFetchResult;

/**
 * General-purpose SSRF-safe outbound HTTP fetcher. Same DNS-pinning and
 * private-IP blocking as `safeImageFetch`, but with a wider default Accept
 * header (`* / *`) so it can be used for RSS feeds, JSON APIs, etc.
 *
 * Always provide an explicit `maxBytes` cap appropriate for the caller.
 */
export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOptions,
): Promise<SafeFetchResult> {
  return safeImageFetch(rawUrl, {
    ...opts,
    acceptHeader: opts.acceptHeader ?? "*/*",
  });
}

export async function safeImageFetch(
  rawUrl: string,
  opts: SafeImageFetchOptions,
): Promise<SafeImageFetchResult> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxRedirects = opts.maxRedirects ?? 5;
  const accept = opts.acceptHeader ?? "image/*";

  let currentUrl: URL;
  try {
    currentUrl = new URL(rawUrl);
  } catch {
    throw new SafeFetchError("invalid_url", 400);
  }

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
      throw new SafeFetchError("invalid_protocol", 400);
    }
    const resolved = await resolvePublicAddress(currentUrl.hostname);
    const result = await requestOnce(currentUrl, resolved, {
      timeoutMs,
      maxBytes: opts.maxBytes,
      accept,
      userAgent: opts.userAgent,
    });
    if (result.kind === "response") return result.value;
    // Follow redirect
    let next: URL;
    try {
      next = new URL(result.location, currentUrl);
    } catch {
      throw new SafeFetchError("invalid_redirect", 400);
    }
    currentUrl = next;
  }
  throw new SafeFetchError("too_many_redirects", 400);
}

interface RequestOnceResult {
  kind: "response" | "redirect";
  value: SafeImageFetchResult;
  location: string;
}

function requestOnce(
  url: URL,
  resolved: { address: string; family: 4 | 6 },
  opts: { timeoutMs: number; maxBytes: number; accept: string; userAgent?: string },
): Promise<
  | { kind: "response"; value: SafeImageFetchResult; location: string }
  | { kind: "redirect"; value: SafeImageFetchResult; location: string }
> {
  return new Promise((resolveP, rejectP) => {
    const isHttps = url.protocol === "https:";
    const mod = isHttps ? https : http;
    const req = mod.request(
      {
        protocol: url.protocol,
        host: url.hostname,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search || ""}` || "/",
        method: "GET",
        headers: {
          Accept: opts.accept,
          Host: url.host,
          ...(opts.userAgent ? { "User-Agent": opts.userAgent } : {}),
        },
        // Pin DNS to the pre-validated address to defeat DNS rebinding.
        lookup: (
          _hostname: string,
          _options: unknown,
          cb: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
        ) => {
          cb(null, resolved.address, resolved.family);
        },
        servername: isHttps ? url.hostname : undefined,
      } as http.RequestOptions,
      (res) => {
        const status = res.statusCode || 0;
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === "string") headers[k.toLowerCase()] = v;
          else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(", ");
        }
        if (status >= 300 && status < 400 && headers["location"]) {
          res.resume();
          resolveP({
            kind: "redirect",
            location: headers["location"],
            value: { status, headers, body: Buffer.alloc(0) },
          });
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        let aborted = false;
        res.on("data", (chunk: Buffer) => {
          if (aborted) return;
          total += chunk.length;
          if (total > opts.maxBytes) {
            aborted = true;
            req.destroy(new SafeFetchError("upload_too_large", 413));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (aborted) return;
          resolveP({
            kind: "response",
            location: "",
            value: { status, headers, body: Buffer.concat(chunks) },
          });
        });
        res.on("error", (e) => rejectP(e));
      },
    );
    req.setTimeout(opts.timeoutMs, () => {
      req.destroy(new SafeFetchError("request_timeout", 504));
    });
    req.on("error", (err) => rejectP(err));
    req.end();
  });
}
