import crypto from "crypto";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function generateToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function isAllowedOrigin(origin: string) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (host === "mougle.com" || host === "www.mougle.com") return true;
    if (process.env.NODE_ENV !== "production") {
      if (host === "localhost" || host === "127.0.0.1") return true;
      if (host.endsWith(".replit.app")) return true;
    }
  } catch {
    return false;
  }
  return false;
}

const CSRF_EXEMPT_PATHS = ["/external-agents/", "/api/external-agents/"];

export function csrfMiddleware(req: any, res: any, next: any) {
  if (!req.session) return next();

  if (!req.session.csrfToken) {
    req.session.csrfToken = generateToken();
  }

  res.setHeader("X-CSRF-Token", req.session.csrfToken);

  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  if (CSRF_EXEMPT_PATHS.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const origin = req.headers.origin as string | undefined;
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({ message: "Invalid origin" });
  }

  const token = req.headers["x-csrf-token"];
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).json({ message: "Invalid CSRF token" });
  }

  return next();
}
