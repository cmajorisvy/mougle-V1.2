import { useCallback, useEffect, useMemo, useState } from "react";

export type AiOpsNotification = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  count: number;
  actionLabel: string;
  actionUrl: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/**
 * Stable fingerprint per notification. Changes (and therefore
 * re-shows the nudge) whenever severity, count, or metadata change.
 */
export function dismissKeyFor(n: AiOpsNotification): string {
  return `${n.id}:${n.severity}:${n.count}:${stableStringify(n.metadata ?? {})}`;
}

function storageKey(adminId: string | null | undefined): string {
  return `mougle.ai-ops.dismissed.${adminId ?? "anon"}`;
}

function readKeys(adminId: string | null | undefined): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(adminId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeKeys(adminId: string | null | undefined, keys: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(adminId), JSON.stringify(keys));
  } catch {
    /* ignore quota errors */
  }
}

export function useAiOpsNotificationDismissals(
  notifications: AiOpsNotification[] | undefined,
  adminId: string | null | undefined,
) {
  const [dismissed, setDismissed] = useState<string[]>(() => readKeys(adminId));

  useEffect(() => {
    setDismissed(readKeys(adminId));
  }, [adminId]);

  const persist = useCallback(
    (next: string[]) => {
      setDismissed(next);
      writeKeys(adminId, next);
    },
    [adminId],
  );

  const isDismissed = useCallback(
    (n: AiOpsNotification) => dismissed.includes(dismissKeyFor(n)),
    [dismissed],
  );

  const dismissNotification = useCallback(
    (n: AiOpsNotification) => {
      const key = dismissKeyFor(n);
      if (dismissed.includes(key)) return;
      persist([...dismissed, key]);
    },
    [dismissed, persist],
  );

  const restoreNotification = useCallback(
    (n: AiOpsNotification) => {
      const key = dismissKeyFor(n);
      if (!dismissed.includes(key)) return;
      persist(dismissed.filter((k) => k !== key));
    },
    [dismissed, persist],
  );

  const clearAllDismissals = useCallback(() => persist([]), [persist]);

  const { visibleNotifications, dismissedNotifications } = useMemo(() => {
    const list = notifications ?? [];
    const visible: AiOpsNotification[] = [];
    const hidden: AiOpsNotification[] = [];
    for (const n of list) {
      if (dismissed.includes(dismissKeyFor(n))) hidden.push(n);
      else visible.push(n);
    }
    return { visibleNotifications: visible, dismissedNotifications: hidden };
  }, [notifications, dismissed]);

  return {
    getDismissedKeys: () => dismissed,
    dismissNotification,
    restoreNotification,
    clearAllDismissals,
    isDismissed,
    visibleNotifications,
    dismissedNotifications,
  };
}
