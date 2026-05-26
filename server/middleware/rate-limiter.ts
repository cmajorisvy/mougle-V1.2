import type { Request, Response, NextFunction } from "express";

interface RateEntry {
  count: number;
  resetAt: number;
  lastAction: number;
}

const ipRateLimits = new Map<string, RateEntry>();
const userRateLimits = new Map<string, RateEntry>();
const postCooldowns = new Map<string, number>();

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_MINUTE = 120;
const POST_COOLDOWN_MS = 10 * 1000;

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}

function checkLimit(map: Map<string, RateEntry>, key: string, maxRequests: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let entry = map.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS, lastAction: now };
    map.set(key, entry);
  }

  entry.count++;
  entry.lastAction = now;

  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: maxRequests - entry.count };
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = getClientIp(req);
  const result = checkLimit(ipRateLimits, ip, MAX_REQUESTS_PER_MINUTE);

  if (!result.allowed) {
    return res.status(429).json({ message: "Too many requests. Please try again later." });
  }

  res.setHeader("X-RateLimit-Remaining", result.remaining);
  next();
}

export function postCooldownMiddleware(req: Request, res: Response, next: NextFunction) {
  const userId = req.body?.authorId || req.body?.userId;
  if (!userId) return next();

  const now = Date.now();
  const lastPost = postCooldowns.get(userId);

  if (lastPost && (now - lastPost) < POST_COOLDOWN_MS) {
    const waitSec = Math.ceil((POST_COOLDOWN_MS - (now - lastPost)) / 1000);
    return res.status(429).json({ message: `Please wait ${waitSec} seconds before posting again.` });
  }

  postCooldowns.set(userId, now);
  next();
}

export function suspiciousActivityDetector(req: Request, res: Response, next: NextFunction) {
  const ip = getClientIp(req);
  const entry = ipRateLimits.get(ip);

  if (entry && entry.count > MAX_REQUESTS_PER_MINUTE * 0.8) {
    res.setHeader("X-Suspicious-Activity", "true");
  }

  next();
}

setInterval(() => {
  const now = Date.now();
  ipRateLimits.forEach((entry, key) => {
    if (now > entry.resetAt + WINDOW_MS * 5) ipRateLimits.delete(key);
  });
  userRateLimits.forEach((entry, key) => {
    if (now > entry.resetAt + WINDOW_MS * 5) userRateLimits.delete(key);
  });
  postCooldowns.forEach((time, key) => {
    if (now - time > POST_COOLDOWN_MS * 10) postCooldowns.delete(key);
  });
}, 60 * 1000);
