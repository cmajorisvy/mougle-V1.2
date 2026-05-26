import { useCallback, useEffect, useRef, useState } from "react";

export interface LocalStoragePreferenceOptions<T> {
  validate?: (value: unknown) => value is T;
}

function readFromStorage<T>(
  key: string,
  fallback: T,
  validate?: (value: unknown) => value is T,
): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      return fallback;
    }
    const parsed: unknown = JSON.parse(raw);
    if (validate && !validate(parsed)) {
      return fallback;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function useLocalStoragePreference<T>(
  key: string,
  defaultValue: T,
  options: LocalStoragePreferenceOptions<T> = {},
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const validateRef = useRef(options.validate);
  validateRef.current = options.validate;

  const [value, setValue] = useState<T>(() =>
    readFromStorage(key, defaultValue, options.validate),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore (quota / private mode)
    }
  }, [key, value]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      if (event.newValue === null) {
        setValue(defaultValue);
        return;
      }
      try {
        const parsed: unknown = JSON.parse(event.newValue);
        if (validateRef.current && !validateRef.current(parsed)) {
          return;
        }
        setValue(parsed as T);
      } catch {
        // ignore malformed cross-tab updates
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, defaultValue]);

  const reset = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
    setValue(defaultValue);
  }, [key, defaultValue]);

  return [value, setValue, reset];
}
