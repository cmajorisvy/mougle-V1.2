export type FeatureStatus =
  | "active"
  | "preview"
  | "dry_run"
  | "approval_required"
  | "admin_only"
  | "disabled"
  | "future";

export type FeatureExposure = "public" | "admin" | "internal";

export type FeatureFlag = {
  key: string;
  label: string;
  enabled: boolean;
  status: FeatureStatus;
  exposure: FeatureExposure;
  description: string;
};

export const FEATURE_FLAGS: Record<string, FeatureFlag> = {
  home: {
    key: "home",
    label: "Home",
    enabled: true,
    status: "active",
    exposure: "public",
    description: "Primary public landing surface.",
  },
  dashboard: {
    key: "dashboard",
    label: "Dashboard",
    enabled: true,
    status: "active",
    exposure: "public",
    description: "Primary signed-in user dashboard.",
  },
  auth: {
    key: "auth",
    label: "Auth",
    enabled: true,
    status: "active",
    exposure: "public",
    description: "Sign-in, sign-up, profile setup, and account routes.",
  },
  agentBuilderShell: {
    key: "agentBuilderShell",
    label: "Agent Builder Shell",
    enabled: true,
    status: "preview",
    exposure: "public",
    description: "User-facing builder shell with safe constraints.",
  },
  myAgentsShell: {
    key: "myAgentsShell",
    label: "My Agents Shell",
    enabled: true,
    status: "preview",
    exposure: "public",
    description: "User-facing owned agent management shell.",
  },
  trustCenter: {
    key: "trustCenter",
    label: "Trust Center",
    enabled: true,
    status: "active",
    exposure: "public",
    description: "Trust/governance user-facing center.",
  },
  discussions: {
    key: "discussions",
    label: "Discussions",
    enabled: true,
    status: "active",
    exposure: "public",
    description: "Public discussion system.",
  },
  aiNews: {
    key: "aiNews",
    label: "AI News",
    enabled: true,
    status: "preview",
    exposure: "public",
    description: "News feed and article surfaces.",
  },
  debatesPreview: {
    key: "debatesPreview",
    label: "Debates (Read/Preview)",
    enabled: true,
    status: "preview",
    exposure: "public",
    description: "Debate reading and preview surfaces.",
  },
  adminSafeMode: {
    key: "adminSafeMode",
    label: "Admin Safe Mode",
    enabled: true,
    status: "admin_only",
    exposure: "admin",
    description: "Founder/admin controls for manual pausing.",
  },
  productionHousePreview: {
    key: "productionHousePreview",
    label: "Production House Preview",
    enabled: true,
    status: "dry_run",
    exposure: "admin",
    description: "Preview-first production workflows with dry-run posture.",
  },
  safeCloneStudio: {
    key: "safeCloneStudio",
    label: "Safe Clone Studio",
    enabled: true,
    status: "preview",
    exposure: "public",
    description: "Sandbox-only safe clone studio.",
  },
  creatorReadiness: {
    key: "creatorReadiness",
    label: "Creator Readiness",
    enabled: true,
    status: "preview",
    exposure: "public",
    description: "Readiness-only creator surface (no payouts execution).",
  },
  storePreview: {
    key: "storePreview",
    label: "Store Preview",
    enabled: true,
    status: "preview",
    exposure: "public",
    description: "Preview-only marketplace/store surface.",
  },
  payouts: {
    key: "payouts",
    label: "Payouts",
    enabled: false,
    status: "disabled",
    exposure: "admin",
    description: "Payout execution remains disabled.",
  },
  creatorEarningsExecution: {
    key: "creatorEarningsExecution",
    label: "Creator Earnings Execution",
    enabled: false,
    status: "disabled",
    exposure: "admin",
    description: "Real creator earnings execution remains disabled.",
  },
  creatorFinance: {
    key: "creatorFinance",
    label: "Creator Finance",
    enabled: false,
    status: "disabled",
    exposure: "admin",
    description: "Creator finance execution surfaces remain disabled.",
  },
  pricingEngine: {
    key: "pricingEngine",
    label: "Pricing Engine",
    enabled: false,
    status: "disabled",
    exposure: "admin",
    description: "Dynamic pricing execution remains disabled.",
  },
  aiTeams: {
    key: "aiTeams",
    label: "AI Teams",
    enabled: false,
    status: "future",
    exposure: "public",
    description: "AI teams surface is reserved for future controlled rollout.",
  },
  superLoop: {
    key: "superLoop",
    label: "Super Loop",
    enabled: false,
    status: "future",
    exposure: "admin",
    description: "Super loop automation is future-only.",
  },
  marketplaceCheckout: {
    key: "marketplaceCheckout",
    label: "Marketplace Checkout",
    enabled: false,
    status: "disabled",
    exposure: "public",
    description: "Checkout and purchase execution are disabled.",
  },
  autonomousPublishing: {
    key: "autonomousPublishing",
    label: "Autonomous Publishing",
    enabled: false,
    status: "disabled",
    exposure: "admin",
    description: "Autonomous publish flows are disabled.",
  },
  youtubePublishingAutomation: {
    key: "youtubePublishingAutomation",
    label: "YouTube Publishing Automation",
    enabled: false,
    status: "disabled",
    exposure: "admin",
    description: "Automated YouTube publishing is disabled.",
  },
  socialDistributionAutomation: {
    key: "socialDistributionAutomation",
    label: "Social Distribution Automation",
    enabled: false,
    status: "disabled",
    exposure: "admin",
    description: "Automated social distribution is disabled.",
  },
  liveDebateAutoRunner: {
    key: "liveDebateAutoRunner",
    label: "Live Debate Auto-Runner",
    enabled: false,
    status: "disabled",
    exposure: "admin",
    description: "Autonomous live debate runner is disabled.",
  },
  fourDHardwareExecution: {
    key: "fourDHardwareExecution",
    label: "4D Hardware Execution",
    enabled: false,
    status: "future",
    exposure: "admin",
    description: "Real 4D hardware execution is future-only.",
  },
  unrealRealExecution: {
    key: "unrealRealExecution",
    label: "Unreal Real Execution",
    enabled: false,
    status: "future",
    exposure: "admin",
    description: "Real Unreal execution is future-only.",
  },
  unityBuildExecution: {
    key: "unityBuildExecution",
    label: "Unity Build Execution",
    enabled: false,
    status: "future",
    exposure: "admin",
    description: "Unity build execution is future-only.",
  },
  blenderCinemaExecution: {
    key: "blenderCinemaExecution",
    label: "Blender/Cinema Execution",
    enabled: false,
    status: "future",
    exposure: "admin",
    description: "Blender/Cinema execution is future-only.",
  },
  realDeviceSosExecution: {
    key: "realDeviceSosExecution",
    label: "Real Device/SOS Execution",
    enabled: false,
    status: "future",
    exposure: "admin",
    description: "Real device/SOS execution is future-only.",
  },
  publicProductionHousePublishing: {
    key: "publicProductionHousePublishing",
    label: "Public Production House Publishing",
    enabled: false,
    status: "disabled",
    exposure: "admin",
    description: "Public production publishing is disabled.",
  },
  browserRealProviderCalls: {
    key: "browserRealProviderCalls",
    label: "Browser Real Provider Calls",
    enabled: false,
    status: "disabled",
    exposure: "public",
    description: "Browser-side real provider calls are disabled.",
  },
};

export function getFeatureFlag(key: string): FeatureFlag | undefined {
  return FEATURE_FLAGS[key];
}

export function isFeatureEnabled(key: string): boolean {
  return FEATURE_FLAGS[key]?.enabled === true;
}
