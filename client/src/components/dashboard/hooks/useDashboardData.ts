import { useAuth } from "@/context/AuthContext";
import { useQuery } from "@tanstack/react-query";

type LabsOpportunity = {
  id: string;
  industry: string;
  category: string;
  solution: string;
};

export type DashboardData = {
  userId: string | null;
  agents: any[];
  debates: any[];
  discussions: any[];
  labsOps: LabsOpportunity[];
  labsApps: any[];
  passports: any[];
  projects: any[];
  personal: any | null;
  personalError: boolean;
  loading: boolean;
  intelligenceScore: number;
  intelligenceLevel: string;
  weeklyGrowth: number;
  nextAction: {
    title: string;
    description: string;
    cta: string;
  };
  capabilities: {
    timeline: boolean;
    civilizationMap: boolean;
    labsPanel: boolean;
    passportTrust: boolean;
    activityFeed: boolean;
    nextAction: boolean;
    personalPanel: boolean;
  };
  journey: {
    stage: string;
    nextGoal: string;
    reputation: number;
  } | null;
};

export function useDashboardData(): DashboardData {
  const { user } = useAuth();
  const userId = user?.id || null;

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ["dashboard", "agents", userId],
    queryFn: async () => {
      if (!userId) return [];
      const res = await fetch(`/api/user-agents?ownerId=${userId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: debates = [], isLoading: debatesLoading } = useQuery({
    queryKey: ["dashboard", "debates"],
    queryFn: async () => {
      const res = await fetch("/api/debates");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: discussions = [], isLoading: discussionsLoading } = useQuery({
    queryKey: ["dashboard", "discussions"],
    queryFn: async () => {
      const res = await fetch("/api/posts");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: labsOps = [], isLoading: labsOpsLoading } = useQuery({
    queryKey: ["dashboard", "labs-opps"],
    queryFn: async () => {
      const res = await fetch("/api/labs/opportunities");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: labsApps = [], isLoading: labsAppsLoading } = useQuery({
    queryKey: ["dashboard", "labs-apps"],
    queryFn: async () => {
      const res = await fetch("/api/labs/apps");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: passports = [], isLoading: passportsLoading } = useQuery({
    queryKey: ["dashboard", "passports", userId],
    queryFn: async () => {
      if (!userId) return [];
      const res = await fetch("/api/agents/passport/exports", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["dashboard", "projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: personal = null, isError: personalError, isLoading: personalLoading } = useQuery({
    queryKey: ["dashboard", "personal", userId],
    queryFn: async () => {
      if (!userId) return null;
      const res = await fetch("/api/personal-agent/dashboard", { credentials: "include" });
      if (!res.ok) throw new Error("No personal access");
      return res.json();
    },
    enabled: !!userId,
    retry: false,
  });

  const { data: capabilitiesResult = null, isLoading: capabilitiesLoading } = useQuery({
    queryKey: ["dashboard", "capabilities", userId],
    queryFn: async () => {
      if (!userId) return null;
      const res = await fetch("/api/capabilities/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!userId,
  });

  const { data: journey = null, isLoading: journeyLoading } = useQuery({
    queryKey: ["dashboard", "journey", userId],
    queryFn: async () => {
      if (!userId) return null;
      const res = await fetch("/api/journey/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!userId,
  });

  const validationsCount = projects.length;
  const intelligenceScore = Math.min(
    1000,
    Math.max(
      0,
      Math.round(
        (agents.length * 10)
        + (debates.length * 5)
        + (validationsCount * 25)
        + (projects.length * 40)
        + (passports.length * 15)
      )
    )
  );

  const intelligenceLevel =
    intelligenceScore >= 800 ? "Architect" :
    intelligenceScore >= 600 ? "Strategist" :
    intelligenceScore >= 400 ? "Builder" :
    intelligenceScore >= 200 ? "Explorer" :
    "Initiate";

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const isRecent = (value: string | number | Date | undefined) => {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    return date >= weekAgo;
  };

  const recentAgents = agents.filter((a: any) => isRecent(a.createdAt)).length;
  const recentDebates = debates.filter((d: any) => isRecent(d.createdAt || d.updatedAt)).length;
  const recentValidations = projects.filter((p: any) => isRecent(p.createdAt)).length;
  const recentProjects = projects.filter((p: any) => isRecent(p.createdAt)).length;
  const recentPassports = passports.filter((p: any) => isRecent(p.exportedAt || p.createdAt)).length;

  const weeklyGrowth = Math.max(
    0,
    Math.round(
      (recentAgents * 10)
      + (recentDebates * 5)
      + (recentValidations * 25)
      + (recentProjects * 40)
      + (recentPassports * 15)
    )
  );

  const determineNextAction = () => {
    const activeDebate = debates.find((d: any) => String(d.status || "").toLowerCase() === "active");
    if (activeDebate) {
      return {
        title: "Active debate in progress",
        description: "Join or monitor the live debate to capture consensus signals.",
        cta: "View Debate",
      };
    }

    if (projects.length > 0) {
      return {
        title: "Validated idea ready",
        description: "Review the latest project blueprint and package it for labs.",
        cta: "Open Project",
      };
    }

    if (labsOps.length > 0 && labsApps.length === 0) {
      return {
        title: "Prepare your first labs package",
        description: "Turn a labs opportunity into an admin-reviewed readiness package.",
        cta: "Prepare in Labs",
      };
    }

    if (agents.length === 0) {
      return {
        title: "Create your first agent",
        description: "Define an intelligence persona to activate your ecosystem.",
        cta: "Create Agent",
      };
    }

    return {
      title: "Explore the intelligence graph",
      description: "Run a new debate or explore labs to grow your network.",
      cta: "Explore",
    };
  };

  const defaultCapabilities = {
    timeline: true,
    civilizationMap: true,
    labsPanel: true,
    passportTrust: true,
    activityFeed: true,
    nextAction: true,
    personalPanel: true,
  };

  return {
    userId,
    agents,
    debates,
    discussions,
    labsOps,
    labsApps,
    passports,
    projects,
    personal,
    personalError: !!personalError,
    loading: agentsLoading || debatesLoading || discussionsLoading || labsOpsLoading || labsAppsLoading || passportsLoading || projectsLoading || personalLoading || capabilitiesLoading || journeyLoading,
    intelligenceScore,
    intelligenceLevel,
    weeklyGrowth,
    nextAction: determineNextAction(),
    capabilities: capabilitiesResult?.capabilities || defaultCapabilities,
    journey,
  };
}
