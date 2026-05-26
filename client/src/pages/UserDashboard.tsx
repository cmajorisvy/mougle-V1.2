import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Bell,
  Bot,
  Brain,
  Briefcase,
  ChevronRight,
  CircleDollarSign,
  Compass,
  CreditCard,
  Database,
  FileText,
  FlaskConical,
  Loader2,
  MessageSquare,
  Rocket,
  Settings,
  Shield,
  Sparkles,
  Store,
  User,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Layout } from "@/components/layout/Layout";
import { useAuth } from "@/context/AuthContext";
import { useDashboardData } from "@/components/dashboard/hooks/useDashboardData";
import { GluonSafetyDisclaimer } from "@/components/gluon/GluonPublic";

type CommandCardProps = {
  title: string;
  description: string;
  href: string;
  icon: any;
  status?: string;
  meta?: string;
};

function getDisplayName(user: any) {
  return user?.displayName || user?.name || user?.username || "Mougle user";
}

function getInitial(user: any) {
  return String(getDisplayName(user).charAt(0) || "M").toUpperCase();
}

function StatTile({ label, value, icon: Icon, loading }: { label: string; value: string | number; icon: any; loading?: boolean }) {
  return (
    <Card className="rounded-lg border-white/[0.06] bg-card/60 p-4 shadow-none">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          {loading ? <Skeleton className="mt-2 h-6 w-16" /> : <p className="text-2xl font-semibold text-foreground">{value}</p>}
        </div>
      </div>
    </Card>
  );
}

function CommandCard({ title, description, href, icon: Icon, status, meta }: CommandCardProps) {
  return (
    <Link href={href}>
      <Card className="group h-full cursor-pointer rounded-lg border-white/[0.06] bg-card/50 p-4 shadow-none transition-colors hover:border-primary/30 hover:bg-card/80">
        <div className="flex h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-foreground">{title}</h3>
              {status && <Badge variant="outline" className="border-primary/20 bg-primary/5 text-[10px] text-primary">{status}</Badge>}
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
          {meta && <p className="mt-auto text-xs text-muted-foreground/80">{meta}</p>}
        </div>
      </Card>
    </Link>
  );
}

function ActivityRow({ icon: Icon, title, href, detail }: { icon: any; title: string; href: string; detail?: string }) {
  return (
    <Link href={href}>
      <div className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.03] p-3 transition-colors hover:border-primary/20 hover:bg-white/[0.06]">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  );
}

export default function UserDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const {
    agents,
    debates,
    discussions,
    projects,
    passports,
    personal,
    loading,
    intelligenceLevel,
    weeklyGrowth,
    journey,
  } = useDashboardData();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth/signin", { replace: true });
    }
  }, [authLoading, navigate, user]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const activeAgents = agents.filter((agent: any) => agent.status === "active").length;
  const recentDebate = debates[0];
  const recentPost = discussions[0];
  const recentProject = projects[0];
  const displayName = getDisplayName(user);
  const accountStatus = user?.emailVerified === false ? "Verify email" : "Active";
  const credits = user?.energy ?? user?.credits ?? personal?.wallet?.credits ?? 0;

  return (
    <Layout>
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-lg border border-white/[0.08] bg-card/50 p-5 shadow-none">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-xl font-semibold text-primary">
                {getInitial(user)}
              </div>
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl" data-testid="text-dashboard-title">
                    {displayName}'s dashboard
                  </h1>
                  <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                    {accountStatus}
                  </Badge>
                </div>
                <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  Your Mougle operating center for agents, credits, debates, projects, memory controls, and account activity.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" className="bg-primary text-primary-foreground">
                <Link href="/agent-builder">
                  <Wrench className="h-4 w-4" />
                  Build Agent
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/credits">
                  <CreditCard className="h-4 w-4" />
                  Credits
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="My Agents" value={agents.length} icon={Bot} loading={loading} />
          <StatTile label="Active Agents" value={activeAgents} icon={Rocket} loading={loading} />
          <StatTile label="Credits" value={credits} icon={CircleDollarSign} loading={loading} />
          <StatTile label="Projects" value={projects.length} icon={Briefcase} loading={loading} />
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="grid gap-4 md:grid-cols-2 xl:col-span-2">
            <CommandCard
              title="Profile & Account"
              description="Account identity, profile details, verification state, and public presence."
              href="/profile"
              icon={User}
              status={accountStatus}
              meta={user?.username ? `@${user.username}` : "Account"}
            />
            <CommandCard
              title="My Agents"
              description="Your owned agent roster, private readiness status, usage, and agent performance signals."
              href="/my-agents"
              icon={Bot}
              status={`${agents.length} total`}
              meta={`${activeAgents} active`}
            />
            <CommandCard
              title="Agent Builder & Training"
              description="Create a private user-owned agent, classify training sources, and review memory safety."
              href="/agent-builder"
              icon={Wrench}
              status="Safe builder"
              meta="Text and link training"
            />
            <CommandCard
              title="Compute Credits"
              description="Compute credits, billing path, balance, and transaction history. Separate from Gluon IDs and contribution records."
              href="/credits"
              icon={CreditCard}
              status={`${credits} credits`}
              meta="Billing available from credits"
            />
          </div>

          <Card className="rounded-lg border-white/[0.06] bg-card/50 p-4 shadow-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Operating Status</p>
                <p className="text-xs text-muted-foreground">Current Mougle path</p>
              </div>
              <Badge variant="outline" className="border-sky-500/20 bg-sky-500/10 text-sky-300">{intelligenceLevel}</Badge>
            </div>
            <div className="mt-4 space-y-3">
              <ActivityRow
                icon={Compass}
                title={journey?.stage || "Dashboard ready"}
                href="/dashboard"
                detail={journey?.nextGoal || "Your main user entry point is active."}
              />
              <ActivityRow
                icon={Sparkles}
                title={weeklyGrowth > 0 ? `+${weeklyGrowth} growth this week` : "No weekly growth yet"}
                href="/debates"
                detail="Debates, projects, and agents raise your signal."
              />
              <ActivityRow
                icon={Shield}
                title={`${passports.length} agent passport${passports.length === 1 ? "" : "s"}`}
                href="/privacy-center"
                detail="Memory and trust controls remain under user control."
              />
            </div>
          </Card>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <CommandCard
            title="Debates, Posts & Activity"
            description="Discussions, debate participation, recent activity, and knowledge signals."
            href="/debates"
            icon={MessageSquare}
            status={`${debates.length} debates`}
            meta={`${discussions.length} discussions indexed`}
          />
          <CommandCard
            title="Projects"
            description="Generated project blueprints and work derived from debate outcomes."
            href="/projects"
            icon={Briefcase}
            status={`${projects.length} projects`}
            meta={recentProject?.title || "No recent project"}
          />
          <CommandCard
            title="Notifications & Settings"
            description="Alerts, account preferences, privacy choices, and session controls."
            href="/notifications"
            icon={Bell}
            status="Inbox"
            meta="Settings linked from the account menu"
          />
          <CommandCard
            title="Knowledge & Memory Controls"
            description="Trust, privacy, vaults, and memory boundaries for future user-owned agents."
            href="/privacy-center"
            icon={Database}
            status="Control"
            meta="Trust center remains available"
          />
          <CommandCard
            title="Safe Clone Sandbox"
            description="Admin-reviewed agent previews for sandbox testing. No checkout or production deployment is enabled."
            href="/agent-store"
            icon={Store}
            status="Sandbox only"
            meta="No checkout"
          />
          <CommandCard
            title="User-Owned Agent Path"
            description="Personal agent, builder, passport, and future ownership flow in one path."
            href="/my-agent"
            icon={Brain}
            status="Path"
            meta={personal ? "Personal agent connected" : "Personal agent not connected"}
          />
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="rounded-lg border-white/[0.06] bg-card/50 p-4 shadow-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-foreground">Recent Signals</h2>
                <p className="text-xs text-muted-foreground">Debates, posts, and projects</p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/discussions">Open Discussions</Link>
              </Button>
            </div>
            <div className="mt-4 space-y-2">
              {loading ? (
                <>
                  <Skeleton className="h-14 w-full rounded-lg" />
                  <Skeleton className="h-14 w-full rounded-lg" />
                  <Skeleton className="h-14 w-full rounded-lg" />
                </>
              ) : (
                <>
                  {recentDebate && (
                    <ActivityRow icon={FlaskConical} title={recentDebate.title || recentDebate.topic || "Recent debate"} href={`/debate/${recentDebate.id}`} detail={recentDebate.status || "Debate"} />
                  )}
                  {recentPost && (
                    <ActivityRow icon={FileText} title={recentPost.title || "Recent post"} href={`/post/${recentPost.id}`} detail={recentPost.author?.name || recentPost.author?.username || "Discussion"} />
                  )}
                  {recentProject && (
                    <ActivityRow icon={Briefcase} title={recentProject.title || "Recent project"} href={`/projects/${recentProject.id}`} detail={recentProject.status || "Project"} />
                  )}
                  {!recentDebate && !recentPost && !recentProject && (
                    <div className="rounded-lg border border-white/[0.04] bg-white/[0.03] p-4 text-sm text-muted-foreground">
                      No recent dashboard signals yet.
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>

          <Card className="rounded-lg border-white/[0.06] bg-card/50 p-4 shadow-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-foreground">Next Actions</h2>
                <p className="text-xs text-muted-foreground">High-value user paths</p>
              </div>
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">Blueprint path</Badge>
            </div>
            <div className="mt-4 grid gap-2">
              <ActivityRow icon={Bot} title="Review your agents" href="/my-agents" detail="Owned agents, usage, and training status." />
              <ActivityRow icon={CreditCard} title="Check compute credits and billing" href="/credits" detail="Credit balance and transaction history. Gluon IDs are contribution records." />
              <ActivityRow icon={Settings} title="Update controls" href="/settings" detail="Preferences, account controls, and security." />
            </div>
          </Card>
        </section>

        <GluonSafetyDisclaimer />
      </div>
    </Layout>
  );
}
