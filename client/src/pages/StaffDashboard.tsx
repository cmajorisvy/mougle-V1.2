import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  ClipboardList,
  Eye,
  FileText,
  Headphones,
  Loader2,
  Lock,
  LogOut,
  Receipt,
  Shield,
  ShieldAlert,
  UserCog,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type StaffWorkArea = {
  id: string;
  group: "work" | "visibility" | "access";
  title: string;
  description: string;
  href: string;
  permissions: string[];
  icon: any;
  accessLabel: string;
  safetyNote: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

const STAFF_SAFE_WORK_AREAS: StaffWorkArea[] = [
  {
    id: "support",
    group: "work",
    title: "Assigned Support Work",
    description: "Review tickets, reply to users, and move support cases through the queue.",
    href: "/admin/support",
    permissions: ["support:view", "support:manage"],
    icon: Headphones,
    accessLabel: "Support",
    safetyNote: "Staff support surface. No secrets or founder controls are linked here.",
    secondaryHref: "/admin/knowledge-base",
    secondaryLabel: "Knowledge Base",
  },
  {
    id: "moderation",
    group: "work",
    title: "Moderation Queue",
    description: "Review reports, safety flags, and moderation activity assigned to operations staff.",
    href: "/admin/legal-safety",
    permissions: ["moderation:view", "moderation:manage", "legal-safety:view"],
    icon: Shield,
    accessLabel: "Moderation",
    safetyNote: "Uses the existing legal safety tool. Deeper API permission hardening is deferred.",
  },
  {
    id: "content-news",
    group: "work",
    title: "Content / News Review",
    description: "Monitor articles, SEO pages, and content workflows before broader publication.",
    href: "/admin/marketing",
    permissions: ["content:view", "content:manage", "news:manage", "marketing:manage"],
    icon: ClipboardList,
    accessLabel: "Content",
    safetyNote: "Staff access is limited to content operations links from this dashboard.",
    secondaryHref: "/admin/seo",
    secondaryLabel: "SEO Review",
  },
  {
    id: "ai-ops",
    group: "visibility",
    title: "AI Operations Monitoring",
    description: "Inspect AI usage, cost analytics, BYOAI adoption, and platform cost signals.",
    href: "/admin/agent-costs",
    permissions: ["ai:ops", "ai:manage", "costs:view"],
    icon: Bot,
    accessLabel: "Monitor",
    safetyNote: "Links to analytics rather than founder-only AI kill switches or root controls.",
  },
  {
    id: "billing",
    group: "visibility",
    title: "Billing / Revenue Support",
    description: "View revenue health and billing-support context without exposing secrets or tokens.",
    href: "/admin/revenue",
    permissions: ["billing:view", "revenue:view"],
    icon: Receipt,
    accessLabel: "Read-only",
    safetyNote: "Treat as support visibility. Payment secrets and root finance controls are not linked.",
  },
  {
    id: "audit-risk",
    group: "visibility",
    title: "Audit / Risk Visibility",
    description: "Review audit, risk, and compliance signals assigned to staff operations.",
    href: "/admin/risk-center",
    permissions: ["audit:view", "risk:manage", "compliance:manage"],
    icon: ShieldAlert,
    accessLabel: "Risk",
    safetyNote: "Visibility is staff-safe from this hub; server-side permission tightening remains separate.",
  },
  {
    id: "operations",
    group: "visibility",
    title: "Operations Work",
    description: "Track operations health, pending work, and build queue status for assigned duties.",
    href: "/admin/operations",
    permissions: ["operations:view", "operations:manage", "build:manage"],
    icon: BriefcaseBusiness,
    accessLabel: "Operations",
    safetyNote: "Founder-only command center and kill-switch surfaces are intentionally excluded.",
    secondaryHref: "/admin/build-queue",
    secondaryLabel: "Build Queue",
  },
  {
    id: "staff-management",
    group: "access",
    title: "Staff Management",
    description: "Manage internal staff access only when the account has staff management permission.",
    href: "/admin/staff",
    permissions: ["staff:manage"],
    icon: Users,
    accessLabel: "Staff access",
    safetyNote: "Available only to staff accounts with staff management scope or staff-safe wildcard access.",
  },
];

const EXCLUDED_FOUNDER_TOOLS = [
  "Founder control",
  "Command center",
  "Debug console",
  "Kill switches",
  "Panic buttons",
  "Secrets",
  "Root settings",
  "Full admin dashboard",
];

function canOpenArea(userPermissions: string[], areaPermissions: string[]) {
  return userPermissions.includes("*") || areaPermissions.some((permission) => userPermissions.includes(permission));
}

function matchedPermissions(userPermissions: string[], areaPermissions: string[]) {
  if (userPermissions.includes("*")) return ["*"];
  return areaPermissions.filter((permission) => userPermissions.includes(permission));
}

function WorkAreaCard({ area, permissions, onOpen }: { area: StaffWorkArea; permissions: string[]; onOpen: (href: string) => void }) {
  const Icon = area.icon;
  const matches = matchedPermissions(permissions, area.permissions);

  return (
    <Card className="bg-gray-900/70 border-gray-800/70 p-4 rounded-lg hover:border-purple-500/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-300 flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
        <Badge variant="outline" className="border-purple-500/20 bg-purple-500/10 text-purple-200 text-[11px]">
          {area.accessLabel}
        </Badge>
      </div>

      <div className="mt-4 space-y-2">
        <h3 className="font-semibold text-white">{area.title}</h3>
        <p className="text-sm text-gray-400 leading-relaxed min-h-[62px]">{area.description}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {matches.map((permission) => (
          <span key={permission} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-300">
            {permission}
          </span>
        ))}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-gray-500">{area.safetyNote}</p>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="px-0 text-purple-300 hover:text-white hover:bg-transparent"
          onClick={() => onOpen(area.href)}
        >
          Open
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
        {area.secondaryHref && (
          <Button
            variant="ghost"
            size="sm"
            className="px-0 text-gray-400 hover:text-white hover:bg-transparent"
            onClick={() => onOpen(area.secondaryHref!)}
          >
            {area.secondaryLabel}
          </Button>
        )}
      </div>
    </Card>
  );
}

function Section({
  title,
  description,
  areas,
  permissions,
  onOpen,
}: {
  title: string;
  description: string;
  areas: StaffWorkArea[];
  permissions: string[];
  onOpen: (href: string) => void;
}) {
  if (areas.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {areas.map((area) => (
          <WorkAreaCard key={area.id} area={area} permissions={permissions} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

export default function StaffDashboard() {
  const [, navigate] = useLocation();
  const { admin, isLoading, isAuthenticated, permissions, role } = useAdminAuth();
  const isStaffActor = admin?.actor?.type === "staff";
  const isDbMainAdmin = isStaffActor && role === "admin" && permissions.includes("*");

  useEffect(() => {
    if (!isLoading && isAuthenticated && (!isStaffActor || isDbMainAdmin)) {
      navigate("/admin/dashboard", { replace: true });
    }
  }, [isAuthenticated, isLoading, isDbMainAdmin, isStaffActor, navigate]);

  const handleLogout = async () => {
    await api.admin.logout().catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["admin-verify"] });
    navigate("/admin/login");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#060611] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (!isAuthenticated || !isStaffActor || isDbMainAdmin) return null;

  const availableAreas = STAFF_SAFE_WORK_AREAS.filter((area) => canOpenArea(permissions, area.permissions));
  const groupedAreas = {
    work: availableAreas.filter((area) => area.group === "work"),
    visibility: availableAreas.filter((area) => area.group === "visibility"),
    access: availableAreas.filter((area) => area.group === "access"),
  };
  const permissionLabels = permissions.length ? permissions : ["No scoped permissions"];
  const hasWildcard = permissions.includes("*");

  return (
    <div className="min-h-screen bg-[#060611] text-white">
      <div className="border-b border-white/5 bg-gray-950/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-purple-300/70">Mougle Staff</p>
            <h1 className="text-lg font-semibold">Staff Work Center</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-gray-300 hover:text-white">
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <section className="rounded-lg border border-white/10 bg-gray-900/60 p-5">
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-5">
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 flex items-center justify-center">
                  <UserCog className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Assigned Staff Operations</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    This dashboard only shows staff-safe work areas assigned to this session.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-gray-500">Actor</p>
                  <p className="mt-1 font-semibold text-white">Staff</p>
                  <p className="mt-1 text-[11px] text-gray-500 truncate">{admin?.actor?.id}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-gray-500">Role</p>
                  <p className="mt-1 font-semibold text-white">{role || "staff"}</p>
                  <p className="mt-1 text-[11px] text-gray-500">Database-backed staff session</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-gray-500">Assigned Areas</p>
                  <p className="mt-1 font-semibold text-white">{availableAreas.length}</p>
                  <p className="mt-1 text-[11px] text-gray-500">{hasWildcard ? "Wildcard limited to staff-safe areas" : "Scoped permissions"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#080812] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Lock className="w-4 h-4 text-purple-300" />
                Permission Summary
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {permissionLabels.map((permission) => (
                  <span key={permission} className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-gray-300">
                    {permission}
                  </span>
                ))}
              </div>
              {hasWildcard && (
                <p className="mt-3 text-xs leading-relaxed text-amber-200/80">
                  Wildcard staff access expands only to staff-safe work areas in this dashboard. Founder/root controls are excluded.
                </p>
              )}
            </div>
          </div>
        </section>

        {availableAreas.length === 0 ? (
          <Card className="bg-gray-900/70 border-gray-800/70 p-6 rounded-lg">
            <h3 className="text-lg font-semibold text-white">No staff tools assigned</h3>
            <p className="text-sm text-gray-400 mt-2">
              This account is active, but it does not have scoped work permissions yet.
            </p>
          </Card>
        ) : (
          <>
            <Section
              title="Assigned Work"
              description="Queues and work surfaces staff can act on."
              areas={groupedAreas.work}
              permissions={permissions}
              onOpen={navigate}
            />
            <Section
              title="Operational Visibility"
              description="Monitoring and support views that help staff handle platform operations."
              areas={groupedAreas.visibility}
              permissions={permissions}
              onOpen={navigate}
            />
            <Section
              title="Access Administration"
              description="Internal employee access tools shown only when permissioned."
              areas={groupedAreas.access}
              permissions={permissions}
              onOpen={navigate}
            />
          </>
        )}

        <section className="rounded-lg border border-red-500/10 bg-red-500/[0.03] p-5">
          <div className="flex items-start gap-3">
            <Eye className="w-5 h-5 text-red-300 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-red-100">Founder-only tools excluded</h2>
              <p className="text-sm text-red-100/60 mt-1">
                Staff are not root admins. These controls are intentionally absent from this work center.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {EXCLUDED_FOUNDER_TOOLS.map((tool) => (
                  <span key={tool} className="rounded-md border border-red-500/10 bg-red-500/5 px-2.5 py-1 text-xs text-red-100/70">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
