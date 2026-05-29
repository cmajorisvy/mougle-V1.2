import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";

type AuthUser = any;

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Failed to load session user");
  return res.json();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const didInit = useRef(false);

  const refreshUser = useCallback(async () => {
    try {
      setLoading(true);
      const me = await fetchMe();
      setUser(me);
      if (me) {
        await api.auth.fetchCsrfToken();
      }
      if (typeof window !== "undefined") {
        // Transitional compatibility only. Session is the source of truth.
        (window as any).__mougleUserId = me?.id || null;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/signout", { method: "POST", credentials: "include" });
    await refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const me = await fetchMe();
        if (!cancelled) {
          setUser(me);
          if (me) {
            await api.auth.fetchCsrfToken();
          }
          if (typeof window !== "undefined") {
            // Transitional compatibility only. Session is the source of truth.
            (window as any).__mougleUserId = me?.id || null;
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    isAuthenticated: !!user,
    refreshUser,
    logout,
  }), [user, loading, refreshUser, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
