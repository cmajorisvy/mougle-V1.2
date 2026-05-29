const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

let csrfToken: string | null = null;

export class AdminApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function readResponseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(status: number, payload: unknown): string {
  const raw =
    payload && typeof payload === "object"
      ? String((payload as any).message ?? (payload as any).error ?? "")
      : typeof payload === "string"
        ? payload
        : "";
  if (status === 401) return raw || "Admin authentication required.";
  if (status === 403) {
    if (/csrf/i.test(raw)) return "Invalid CSRF token. Refresh the page and try again.";
    return raw || "Admin action forbidden.";
  }
  return raw || `Admin API request failed with status ${status}.`;
}

export async function fetchAdminCsrfToken(): Promise<string | null> {
  const res = await fetch("/api/auth/csrf-token", { credentials: "include" });
  if (!res.ok) return null;
  const body = await readResponseBody(res);
  if (body && typeof body === "object" && typeof (body as any).csrfToken === "string") {
    csrfToken = (body as any).csrfToken;
    return csrfToken;
  }
  return null;
}

async function ensureCsrfToken(method: string): Promise<string | null> {
  if (SAFE_METHODS.has(method.toUpperCase())) return null;
  if (csrfToken) return csrfToken;
  return fetchAdminCsrfToken();
}

export function resetAdminCsrfTokenForTests(): void {
  csrfToken = null;
}

export async function adminApiJson<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method ?? "GET").toString().toUpperCase();
  const token = await ensureCsrfToken(method);
  const headers = new Headers(options.headers);

  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token && !SAFE_METHODS.has(method)) {
    headers.set("X-CSRF-Token", token);
  }

  const res = await fetch(url, {
    ...options,
    method,
    credentials: "include",
    headers,
  });
  const body = await readResponseBody(res);

  if (!res.ok) {
    throw new AdminApiError(res.status, errorMessage(res.status, body), body);
  }
  return body as T;
}

export function adminGetJson<T = any>(url: string): Promise<T> {
  return adminApiJson<T>(url);
}

export function adminPostJson<T = any>(url: string, body?: unknown): Promise<T> {
  return adminApiJson<T>(url, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function adminPutJson<T = any>(url: string, body?: unknown): Promise<T> {
  return adminApiJson<T>(url, {
    method: "PUT",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function adminPatchJson<T = any>(url: string, body?: unknown): Promise<T> {
  return adminApiJson<T>(url, {
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function adminDeleteJson<T = any>(url: string, body?: unknown): Promise<T> {
  return adminApiJson<T>(url, {
    method: "DELETE",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
