import { useMemo } from "react";
import { useLocalStoragePreference } from "@/hooks/use-local-storage-preference";

export const ADMIN_TIME_ZONE_STORAGE_KEY = "mougle.admin.timeZone";

const LEGACY_ADMIN_TIME_ZONE_KEYS = [
  "mougle.admin.flapDailyStatsTimeZone",
] as const;

export const COMMON_ADMIN_TIME_ZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Athens",
  "Europe/Moscow",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

export function isValidIanaTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function resolveBrowserTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && isValidIanaTimeZone(tz)) return tz;
  } catch {
    /* ignore */
  }
  return "UTC";
}

let legacyMigrated = false;
function migrateLegacyAdminTimeZoneKeyOnce(): void {
  if (legacyMigrated) return;
  legacyMigrated = true;
  if (typeof window === "undefined") return;
  try {
    const current = window.localStorage.getItem(ADMIN_TIME_ZONE_STORAGE_KEY);
    if (current === null) {
      for (const legacyKey of LEGACY_ADMIN_TIME_ZONE_KEYS) {
        const raw = window.localStorage.getItem(legacyKey);
        if (raw === null) continue;
        try {
          const parsed: unknown = JSON.parse(raw);
          if (isValidIanaTimeZone(parsed)) {
            window.localStorage.setItem(
              ADMIN_TIME_ZONE_STORAGE_KEY,
              JSON.stringify(parsed),
            );
            break;
          }
        } catch {
          /* ignore malformed legacy values */
        }
      }
    }
    for (const legacyKey of LEGACY_ADMIN_TIME_ZONE_KEYS) {
      try {
        window.localStorage.removeItem(legacyKey);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function useAdminTimeZonePreference(): {
  timeZone: string;
  browserTimeZone: string;
  setTimeZone: (tz: string) => void;
  resetTimeZone: () => void;
} {
  migrateLegacyAdminTimeZoneKeyOnce();
  const browserTimeZone = useMemo(() => resolveBrowserTimeZone(), []);
  const [timeZone, setTimeZone, resetTimeZone] =
    useLocalStoragePreference<string>(
      ADMIN_TIME_ZONE_STORAGE_KEY,
      browserTimeZone,
      { validate: isValidIanaTimeZone },
    );
  return { timeZone, browserTimeZone, setTimeZone, resetTimeZone };
}
