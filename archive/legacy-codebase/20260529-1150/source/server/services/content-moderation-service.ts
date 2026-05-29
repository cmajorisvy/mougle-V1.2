import { storage } from "../storage";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq, sql as dsql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

let blockedTerms: any = null;
function loadBlockedTerms() {
  if (blockedTerms) return blockedTerms;
  try {
    const filePath = path.resolve(process.cwd(), "config/blocked_terms.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    blockedTerms = JSON.parse(raw);
  } catch {
    blockedTerms = {
      sexual_explicit_terms: [],
      adult_services_terms: [],
      gambling_terms: [],
      narcotics_terms: [],
      spam_phrases: [],
      blocked_domains: [],
    };
  }
  return blockedTerms;
}

const SPAM_PATTERNS = [
  /(?:https?:\/\/[^\s]+){3,}/i,
  /(?:earn|make|win)\s+\$?\d+[\s,]*(?:per|a|each)\s*(?:day|hour|week|month)/i,
  /(?:click|visit)\s+(?:here|this|my)\s+(?:link|site|page|url)/i,
  /(?:free|cheap)\s+(?:iphone|ipad|macbook|laptop|samsung|gift card)/i,
  /(?:100%|guaranteed)\s+(?:free|money|income|profit|return)/i,
  /(?:work|earn)\s+(?:from|at)\s+home\s+\$?\d+/i,
  /(?:limited|exclusive)\s+(?:time|offer).*(?:act|hurry|now|fast)/i,
  /(?:nigerian|prince|inheritance|lottery)\s+(?:email|money|fund|winner)/i,
  /(?:crypto|bitcoin|ethereum)\s+(?:investment|opportunity|guaranteed|doubl)/i,
  /(?:telegram|whatsapp|signal)\s+(?:me|us|group)\s+(?:for|to)\s+(?:buy|get|earn)/i,
  /(?:dm|message)\s+(?:me|us)\s+(?:for|to)\s+(?:buy|order|get)/i,
  /(?:weight\s+loss|lose\s+weight)\s+(?:fast|quick|pill|supplement)/i,
  /(?:enlarg|grow|bigger)\s+(?:your|penis|breast|muscle)/i,
  /(?:v[1i]agra|c[1i]al[1i]s|kamagra|levitra)/i,
  /(.)\1{5,}/i,
  /[A-Z\s]{30,}/,
  /(?:subscribe|follow|like)\s+(?:my|our)\s+(?:channel|page|account)/i,
  /check\s+(?:my|out\s+my)\s+(?:profile|bio|link)/i,
];

const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

export type ContentCategory = "SAFE" | "ADULT" | "SEXUAL" | "GAMBLING" | "DRUGS" | "SPAM" | "SCAM";

export interface ModerationResult {
  allowed: boolean;
  reasons: string[];
  category: ContentCategory;
  isSpam: boolean;
  spamScore: number;
  severity: "clean" | "low" | "medium" | "high";
  blockedDomains: string[];
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5\$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[8]/g, "b")
    .replace(/\s+/g, " ")
    .trim();
}

function checkTerms(text: string, terms: string[]): string[] {
  const normalized = normalizeText(text);
  const found: string[] = [];
  for (const term of terms) {
    if (normalized.includes(term.toLowerCase())) {
      found.push(term);
    }
  }
  return found;
}

function calculateSpamScore(text: string): number {
  let score = 0;

  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(text)) score += 15;
  }

  const urls = text.match(URL_PATTERN) || [];
  if (urls.length >= 3) score += 25;
  if (urls.length >= 5) score += 25;

  const hashtagCount = (text.match(/#\w+/g) || []).length;
  if (hashtagCount > 5) score += 15;
  if (hashtagCount > 10) score += 20;

  if (hasExcessiveRepetition(text)) score += 20;

  if (/(.{20,})\1{2,}/i.test(text)) score += 30;

  const capsRatio = (text.replace(/[^A-Z]/g, "").length) / Math.max(text.length, 1);
  if (capsRatio > 0.7 && text.length > 20) score += 15;

  return Math.min(score, 100);
}

function hasExcessiveRepetition(text: string): boolean {
  const words = text.toLowerCase().split(/\s+/);
  if (words.length < 5) return false;
  const freq: Record<string, number> = {};
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
  }
  const maxFreq = Math.max(...Object.values(freq));
  return maxFreq > words.length * 0.5 && maxFreq > 3;
}

function extractDomains(text: string): string[] {
  const urls = text.match(URL_PATTERN) || [];
  const domains: string[] = [];
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      domains.push(parsed.hostname.replace(/^www\./, ""));
    } catch {}
  }
  return domains;
}

function checkBlockedDomains(text: string): string[] {
  const terms = loadBlockedTerms();
  const blockedList: string[] = terms.blocked_domains || [];
  const domains = extractDomains(text);
  const blocked: string[] = [];
  for (const domain of domains) {
    for (const bd of blockedList) {
      if (domain === bd || domain.endsWith(`.${bd}`)) {
        blocked.push(domain);
        break;
      }
    }
  }
  return blocked;
}

export function sanitizeHTML(text: string): string {
  return text
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>/gi, "")
    .replace(/<form[\s\S]*?>[\s\S]*?<\/form>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/on\w+\s*=\s*\S+/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/vbscript\s*:/gi, "")
    .replace(/data\s*:\s*text\/html/gi, "");
}

export function sanitizeLinks(html: string): string {
  return html.replace(
    /<a\s+([^>]*?)href\s*=\s*["']?(https?:\/\/[^"'\s>]+)["']?([^>]*)>/gi,
    (match, before, url, after) => {
      const cleanBefore = before.replace(/rel\s*=\s*["'][^"']*["']/gi, "").trim();
      const cleanAfter = after.replace(/rel\s*=\s*["'][^"']*["']/gi, "").trim();
      return `<a ${cleanBefore} href="${url}" rel="nofollow noopener noreferrer" target="_blank" ${cleanAfter}>`;
    }
  );
}

function classifyContent(text: string): ContentCategory {
  const terms = loadBlockedTerms();

  const sexualMatches = checkTerms(text, [
    ...(terms.sexual_explicit_terms || []),
    ...(terms.adult_services_terms || []),
  ]);
  if (sexualMatches.length > 0) return "ADULT";

  const gamblingMatches = checkTerms(text, terms.gambling_terms || []);
  if (gamblingMatches.length > 0) return "GAMBLING";

  const narcoticsMatches = checkTerms(text, terms.narcotics_terms || []);
  if (narcoticsMatches.length > 0) return "DRUGS";

  const spamMatches = checkTerms(text, terms.spam_phrases || []);
  if (spamMatches.length > 0) return "SCAM";

  const spamScore = calculateSpamScore(text);
  if (spamScore >= 40) return "SPAM";

  return "SAFE";
}

export function moderateContent(text: string, title?: string): ModerationResult {
  const fullText = title ? `${title} ${text}` : text;
  const sanitized = sanitizeHTML(fullText);
  const reasons: string[] = [];
  let severity: ModerationResult["severity"] = "clean";
  let isSpam = false;

  const category = classifyContent(sanitized);
  const spamScore = calculateSpamScore(sanitized);
  const blocked = checkBlockedDomains(sanitized);

  if (category === "ADULT" || category === "SEXUAL") {
    reasons.push("Contains prohibited adult/explicit content");
    severity = "high";
  }

  if (category === "GAMBLING") {
    reasons.push("Contains prohibited gambling-related content");
    severity = severity === "high" ? "high" : "medium";
  }

  if (category === "DRUGS") {
    reasons.push("Contains prohibited narcotics/drug-related content");
    severity = "high";
  }

  if (category === "SCAM") {
    reasons.push("Content detected as scam/fraud");
    isSpam = true;
    severity = "high";
  }

  if (category === "SPAM" || spamScore >= 40) {
    reasons.push("Content detected as spam");
    isSpam = true;
    severity = severity === "clean" ? "medium" : severity;
  }

  if (blocked.length > 0) {
    reasons.push(`Contains links to blocked domains: ${blocked.join(", ")}`);
    severity = "high";
  }

  if (hasExcessiveRepetition(sanitized)) {
    reasons.push("Excessive word repetition detected");
    isSpam = true;
    severity = severity === "clean" ? "low" : severity;
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    category,
    isSpam,
    spamScore,
    severity,
    blockedDomains: blocked,
  };
}

export function moderateUsername(username: string): ModerationResult {
  return moderateContent(username);
}

const WARNING_THRESHOLD = 3;
const RESTRICTION_THRESHOLD = 5;
const SPAMMER_THRESHOLD = 8;

export async function recordViolation(
  userId: string,
  isSpam: boolean,
  category: ContentCategory,
  contentType: string,
  contentSnippet?: string
): Promise<{ markedAsSpammer: boolean; totalViolations: number }> {
  try {
    const increment = isSpam ? 2 : 1;
    const spamIncrement = isSpam ? 15 : 5;

    const [updated] = await db.update(users)
      .set({
        spamViolations: dsql`${users.spamViolations} + ${increment}`,
        spamScore: dsql`LEAST(${users.spamScore} + ${spamIncrement}, 100)`,
      })
      .where(eq(users.id, userId))
      .returning({ spamViolations: users.spamViolations, spamScore: users.spamScore });

    try {
      await storage.createModerationLog({
        userId,
        contentType,
        contentSnippet: contentSnippet ? contentSnippet.substring(0, 200) : undefined,
        reason: `Category: ${category}`,
        category,
        actionTaken: "blocked",
        severity: category === "SAFE" ? "low" : "high",
      });
    } catch {}

    if (updated) {
      if (updated.spamViolations >= SPAMMER_THRESHOLD) {
        await storage.markUserAsSpammer(userId);
        return { markedAsSpammer: true, totalViolations: updated.spamViolations };
      }
      if (updated.spamViolations >= RESTRICTION_THRESHOLD) {
        await storage.shadowBanUser(userId);
      }
    }

    return { markedAsSpammer: false, totalViolations: updated?.spamViolations || 0 };
  } catch {
    return { markedAsSpammer: false, totalViolations: 0 };
  }
}

export async function isUserSpammer(userId: string): Promise<boolean> {
  try {
    const user = await storage.getUser(userId);
    return user?.isSpammer === true;
  } catch {
    return false;
  }
}

export async function isUserShadowBanned(userId: string): Promise<boolean> {
  try {
    const user = await storage.getUser(userId);
    return user?.isShadowBanned === true;
  } catch {
    return false;
  }
}

export async function getUserModerationStatus(userId: string): Promise<{
  isSpammer: boolean;
  isShadowBanned: boolean;
  spamScore: number;
  spamViolations: number;
  canPost: boolean;
  canPostLinks: boolean;
}> {
  try {
    const user = await storage.getUser(userId);
    if (!user) return { isSpammer: false, isShadowBanned: false, spamScore: 0, spamViolations: 0, canPost: true, canPostLinks: true };
    return {
      isSpammer: user.isSpammer,
      isShadowBanned: user.isShadowBanned,
      spamScore: user.spamScore,
      spamViolations: user.spamViolations,
      canPost: !user.isSpammer,
      canPostLinks: !user.isSpammer && user.spamViolations < RESTRICTION_THRESHOLD,
    };
  } catch {
    return { isSpammer: false, isShadowBanned: false, spamScore: 0, spamViolations: 0, canPost: true, canPostLinks: true };
  }
}

export function stripLinksForSpammer(text: string): string {
  return text.replace(URL_PATTERN, "[link removed]");
}
