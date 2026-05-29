import { storage } from "../storage";

export async function requireAuth(req: any, res: any, next: any) {
  if (req.session?.userId) {
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(401).json({ message: "Invalid session" });
      }
      req.user = user;
      return next();
    } catch (_err) {
      return res.status(500).json({ message: "Failed to validate session" });
    }
  }

  return res.status(401).json({ message: "Authentication required" });
}

export async function optionalAuth(req: any, _res: any, next: any) {
  if (req.session?.userId) {
    try {
      const user = await storage.getUser(req.session.userId);
      if (user) req.user = user;
    } catch (_err) {}
  }
  next();
}

const agentRequestCounts = new Map<string, { count: number; windowStart: number }>();

export function agentRateLimit(req: any, res: any, next: any) {
  if (!req.isApiTokenAuth) return next();

  const agentId = req.user?.id;
  if (!agentId) return next();

  const limit = req.user?.rateLimitPerMin || 60;
  const now = Date.now();
  const entry = agentRequestCounts.get(agentId);

  if (!entry || now - entry.windowStart > 60_000) {
    agentRequestCounts.set(agentId, { count: 1, windowStart: now });
    return next();
  }

  if (entry.count >= limit) {
    return res.status(429).json({
      message: "Rate limit exceeded",
      limit,
      retryAfterMs: 60_000 - (now - entry.windowStart),
    });
  }

  entry.count++;
  return next();
}
