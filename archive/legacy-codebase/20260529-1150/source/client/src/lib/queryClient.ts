import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

let csrfTokenCache: string | null = null;

async function ensureCsrfTokenForMethod(method: string): Promise<string | null> {
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD" || verb === "OPTIONS") return null;
  if (csrfTokenCache) return csrfTokenCache;
  try {
    const res = await fetch("/api/auth/csrf-token", { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as
      | { csrfToken?: string }
      | null;
    if (data?.csrfToken) {
      csrfTokenCache = data.csrfToken;
      return csrfTokenCache;
    }
  } catch {
    return null;
  }
  return null;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const csrfToken = await ensureCsrfTokenForMethod(method);
  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });
  if (res.status === 403) {
    // Token may have rotated — refetch once and retry.
    csrfTokenCache = null;
    const refreshed = await ensureCsrfTokenForMethod(method);
    if (refreshed && refreshed !== csrfToken) {
      const retryHeaders: Record<string, string> = { ...headers };
      retryHeaders["X-CSRF-Token"] = refreshed;
      const retry = await fetch(url, {
        method,
        headers: retryHeaders,
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
      });
      await throwIfResNotOk(retry);
      return retry;
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
