import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api, type AdminVerifyResponse } from "@/lib/api";

type UseAdminAuthOptions = {
  redirectTo?: string;
  requiredPermission?: string;
};

function hasPermission(admin: AdminVerifyResponse | undefined, permission?: string) {
  if (!admin?.valid) return false;
  if (!permission) return true;
  return admin.permissions.includes("*") || admin.permissions.includes(permission);
}

export function useAdminAuth(options: UseAdminAuthOptions = {}) {
  const [, navigate] = useLocation();
  const redirectTo = options.redirectTo || "/admin/login";
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-verify"],
    queryFn: () => api.admin.verify(),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const isAuthenticated = !!data?.valid && !isError;
  const isAuthorized = hasPermission(data, options.requiredPermission);

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isAuthorized)) {
      navigate(redirectTo, { replace: true });
    }
  }, [isLoading, isAuthenticated, isAuthorized, navigate, redirectTo]);

  return {
    admin: data,
    isAuthenticated,
    isAuthorized,
    isLoading,
    role: data?.role || null,
    permissions: data?.permissions || [],
    hasPermission: (permission: string) => hasPermission(data, permission),
  };
}
