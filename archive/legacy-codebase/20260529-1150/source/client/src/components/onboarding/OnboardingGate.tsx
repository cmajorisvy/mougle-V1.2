import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

const ALLOWED_PREFIXES = ["/onboarding", "/auth", "/docs", "/legal"];

function getTargetPath(state?: string | null) {
  if (state === "interests") return "/onboarding/interests";
  if (state === "debate") return "/onboarding/debate";
  return null;
}

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [location, navigate] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/onboarding/state"],
    queryFn: () => api.onboarding.state(),
    enabled: !!user,
  });

  const onboardingState = useMemo(() => {
    if (data?.state) return data.state;
    return (user as any)?.onboardingState || null;
  }, [data?.state, user]);

  useEffect(() => {
    if (loading || isLoading) return;
    if (!user) return;

    const target = getTargetPath(onboardingState);

    if (target && location !== target) {
      if (!location.startsWith("/auth/verify") && !location.startsWith("/auth/profile")) {
        navigate(target, { replace: true });
      }
      return;
    }

    if (onboardingState === "complete" && location.startsWith("/onboarding")) {
      navigate("/dashboard", { replace: true });
      return;
    }

    if (!target && location.startsWith("/onboarding")) {
      navigate("/dashboard", { replace: true });
      return;
    }

    if (target && ALLOWED_PREFIXES.some((prefix) => location.startsWith(prefix)) && location === target) {
      return;
    }
  }, [loading, isLoading, user, location, onboardingState, navigate]);

  return <>{children}</>;
}
