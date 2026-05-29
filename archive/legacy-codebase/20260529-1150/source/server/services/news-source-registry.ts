/**
 * Newsroom T2 — Global Source Registry helpers.
 *
 * Loads sources from the DB-backed `news_sources` registry and provides a
 * deterministic safety filter so any source missing a known license status
 * (i.e. `licenseStatus === 'unknown'`) is excluded from the active pipeline.
 *
 * Also exposes a one-time seeder that migrates the deprecated
 * `config/rssFeeds.json` rows into the registry when the table is empty.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { storage } from "../storage";
import type { NewsSource, InsertNewsSource } from "@shared/schema";

export interface ActiveNewsSource {
  id: string;
  name: string;
  url: string;
  type: string;
  country: string;
  language: string;
  reliabilityScore: number;
  licenseStatus: string;
  tier: string;
}

export function isActiveLicense(licenseStatus: string | null | undefined): boolean {
  if (!licenseStatus) return false;
  if (licenseStatus === "unknown") return false;
  return true;
}

/** Filters out disabled or unknown-license rows. Pure & deterministic. */
export function filterActiveSources<T extends { enabled?: boolean; licenseStatus?: string | null }>(
  rows: T[],
): T[] {
  return rows.filter((r) => r.enabled !== false && isActiveLicense(r.licenseStatus));
}

export function toActiveSource(row: NewsSource): ActiveNewsSource {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    type: row.type,
    country: row.country,
    language: row.language,
    reliabilityScore: row.reliabilityScore,
    licenseStatus: row.licenseStatus,
    tier: row.tier,
  };
}

export async function loadActiveSources(): Promise<ActiveNewsSource[]> {
  const rows = await storage.listNewsSources({ activeOnly: true });
  return rows.map(toActiveSource);
}

interface LegacyFeedConfig {
  name: string;
  url: string;
  category?: string;
}

function loadLegacyFeeds(): LegacyFeedConfig[] {
  try {
    const configPath = resolve(process.cwd(), "config/rssFeeds.json");
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Seeds the registry from `config/rssFeeds.json` if it is currently empty.
 * Legacy RSS rows are marked `licenseStatus = 'public_rss'` so they are
 * eligible for the active pipeline by default.
 *
 * Returns the number of rows inserted.
 */
export async function seedRegistryFromLegacyJson(): Promise<number> {
  const existing = await storage.listNewsSources();
  if (existing.length > 0) return 0;

  const legacy = loadLegacyFeeds();
  if (legacy.length === 0) return 0;

  let inserted = 0;
  for (const feed of legacy) {
    if (!feed?.name || !feed?.url) continue;
    const seed: InsertNewsSource = {
      name: feed.name,
      url: feed.url,
      type: "free",
      country: "global",
      language: "en",
      reliabilityScore: 0.7,
      licenseStatus: "public_rss",
      tier: "standard",
      enabled: true,
      notes: "Seeded from config/rssFeeds.json (deprecated reference).",
    };
    try {
      const existingByUrl = await storage.getNewsSourceByUrl(feed.url);
      if (existingByUrl) continue;
      await storage.createNewsSource(seed);
      inserted++;
    } catch (err) {
      console.warn(`[news-source-registry] seed skipped for ${feed.name}: ${(err as Error).message}`);
    }
  }
  return inserted;
}

/** Public-safe projection (no notes / IDs are fine; license + tier are public-safe metadata). */
export function publicProjection(row: NewsSource) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    country: row.country,
    language: row.language,
    reliabilityScore: row.reliabilityScore,
    licenseStatus: row.licenseStatus,
    tier: row.tier,
  };
}
