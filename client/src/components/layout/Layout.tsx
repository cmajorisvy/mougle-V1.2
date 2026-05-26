import { Link, useLocation } from "wouter";
import { 
  Search, Bell, Plus, Zap, User, Menu, X,
  Home, MessageSquare, Newspaper, Bot,
  Trophy, CreditCard, Settings, LogOut,
  PanelLeftClose, PanelLeft,
  Sparkles, Activity, Crown, Globe, Store, Wrench, Shield, Brain, Network, Beaker, TrendingUp, ShoppingBag, Download, Smartphone, LayoutDashboard
} from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/Logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CreateModal } from "@/components/create/CreateModal";
import { AIInsightPanel } from "@/components/layout/AIInsightPanel";
import { InstallPrompt, useInstallPrompt } from "@/components/pwa/InstallPrompt";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { explainerPages, legalPages } from "@/components/layout/DocsLayout";

const NAV_GROUP_COLORS: Record<string, string> = {
  "Create": "bg-purple-500",
  "Discover": "bg-blue-500",
  "Grow": "bg-emerald-500",
  "Sandbox": "bg-cyan-500",
  "System": "bg-zinc-400",
};

const mainNav = [
  { icon: Home, label: "Home", href: "/", group: "" },
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", group: "" },
  { icon: Bot, label: "Personal Agent", href: "/my-agent", group: "Create" },
  { icon: Wrench, label: "Agent Builder", href: "/agent-builder", group: "Create" },
  { icon: Beaker, label: "Labs", href: "/labs", group: "Create" },
  { icon: Globe, label: "My Agents", href: "/my-agents", group: "Create" },
  { icon: MessageSquare, label: "Discussions", href: "/discussions", group: "Discover" },
  { icon: Newspaper, label: "AI News", href: "/ai-news-updates", group: "Discover" },
  { icon: Brain, label: "Debates", href: "/ai-debates", group: "Discover" },
  { icon: Network, label: "Network", href: "/network", group: "Discover" },
  { icon: Sparkles, label: "Intelligence Path", href: "/intelligence", group: "Grow" },
  { icon: Trophy, label: "Rankings", href: "/ranking", group: "Grow" },
  { icon: TrendingUp, label: "Growth Insights", href: "/psychology", group: "Grow" },
  { icon: Store, label: "Safe Clone Sandbox", href: "/agent-marketplace", group: "Sandbox" },
  { icon: Crown, label: "Creator Readiness", href: "/creator-earnings", group: "Sandbox" },
  { icon: ShoppingBag, label: "Agent Store Preview", href: "/agent-store", group: "Sandbox" },
  { icon: Shield, label: "Trust Center", href: "/trust-moat", group: "System" },
  { icon: CreditCard, label: "Credits & Billing", href: "/billing", group: "System" },
  { icon: Settings, label: "Settings", href: "/settings", group: "System" },
];

const mobileNav = [
  { icon: Home, label: "Home", href: "/" },
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: MessageSquare, label: "Discover", href: "/discussions" },
  { icon: Plus, label: "Create", href: "/my-agent" },
];


export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const { logout, user } = useAuth();
  const { isInstallable, isInstalled, install } = useInstallPrompt();
  const currentUserId = user?.id || null;
  const { data: currentUser } = useQuery({
    queryKey: ["/api/users", currentUserId],
    queryFn: () => api.users.get(currentUserId!),
    enabled: !!currentUserId,
  });

  useEffect(() => {
    if (!currentUserId) {
      api.seed().catch(() => {});
    }
  }, [currentUserId]);

  const handleLogout = async () => {
    await fetch("/api/auth/signout", { method: "POST", credentials: "include" });
    await logout();
    if (typeof window !== "undefined") {
      (window as any).__mougleUserId = null;
    }
    window.location.href = "/auth/signin";
  };

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };

  const sidebarWidth = sidebarCollapsed ? "w-[68px]" : "w-[240px]";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col ambient-bg">
      <header className="h-14 glass-header sticky top-0 z-50 flex items-center px-4 justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 text-muted-foreground" onClick={() => setSidebarOpen(true)} data-testid="button-mobile-menu">
            <Menu className="w-4 h-4" />
          </Button>
          <Link href="/">
            <div className="cursor-pointer group transition-transform hover:scale-[1.02]" data-testid="link-home-logo">
              <Logo size="md" showText={true} animated={true} />
            </div>
          </Link>
        </div>

        <div className="flex-1 max-w-md relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
          <Input 
            data-testid="input-search"
            placeholder="Search discussions, news, agents..."
            className="pl-9 h-8 text-sm bg-white/[0.04] border-white/[0.06] rounded-lg focus:border-primary/40 focus:bg-white/[0.06] transition-all placeholder:text-muted-foreground/40"
          />
        </div>

        <div className="flex items-center gap-2">

          {currentUser ? (
            <>
              <Button 
                data-testid="button-create"
                size="sm"
                className="hidden md:flex h-8 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white text-xs font-medium shadow-lg shadow-primary/20 rounded-lg gap-1.5 animate-glow-pulse"
                onClick={() => setCreateModalOpen(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                Create
              </Button>

              <Link href="/notifications">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground relative" data-testid="button-notifications">
                  <Bell className="w-4 h-4" />
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                </Button>
              </Link>

              <Link href="/credits">
                <div className="hidden md:flex items-center gap-1.5 h-8 px-2.5 rounded-lg glass-card hover:bg-white/[0.06] transition-colors cursor-pointer" data-testid="text-energy">
                  <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400 animate-float" />
                  <span className="font-mono font-semibold text-xs text-amber-400">{currentUser.energy}</span>
                </div>
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Avatar className="w-7 h-7 cursor-pointer ring-1 ring-white/10 hover:ring-primary/50 transition-all hover-scale" data-testid="button-profile">
                    <AvatarImage src={currentUser?.avatar} />
                    <AvatarFallback className="text-[10px] bg-primary/20 text-primary">{currentUser?.displayName?.[0] || "?"}</AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 glass-panel rounded-xl shadow-2xl">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold">{currentUser?.displayName || "Guest"}</span>
                      <span className="text-xs text-muted-foreground">@{currentUser?.username}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-white/[0.06]" />
                  <Link href="/profile">
                    <DropdownMenuItem className="cursor-pointer text-xs gap-2 rounded-md">
                      <User className="w-3.5 h-3.5" /> Profile
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/credits">
                    <DropdownMenuItem className="cursor-pointer text-xs gap-2 rounded-md">
                      <CreditCard className="w-3.5 h-3.5" /> Compute Credits
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/settings">
                    <DropdownMenuItem className="cursor-pointer text-xs gap-2 rounded-md">
                      <Settings className="w-3.5 h-3.5" /> Settings
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuSeparator className="bg-white/[0.06]" />
                  <DropdownMenuItem className="text-destructive cursor-pointer text-xs gap-2 rounded-md" onClick={handleLogout}>
                    <LogOut className="w-3.5 h-3.5" /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/auth/signin">
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground" data-testid="button-header-signin">
                  Sign In
                </Button>
              </Link>
              <Link href="/auth/signup">
                <Button size="sm" className="h-8 text-xs bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white font-medium rounded-lg" data-testid="button-header-signup">
                  Sign Up
                </Button>
              </Link>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative z-10">
        <aside className={cn(
          "hidden md:flex flex-col glass-sidebar transition-all duration-300 ease-in-out flex-shrink-0",
          sidebarWidth
        )}>
          <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
              {mainNav.map((item, idx) => {
                const prevGroup = idx > 0 ? mainNav[idx - 1].group : "";
                const showGroupHeader = item.group && item.group !== prevGroup;
                const active = isActive(item.href);
                const groupColor = item.group ? NAV_GROUP_COLORS[item.group] : "";
                const navItem = (
                  <Link key={item.href} href={item.href}>
                    <div className={cn(
                      "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all cursor-pointer group/item relative",
                      active 
                        ? "bg-primary/10 text-primary active-indicator" 
                        : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                      sidebarCollapsed && "justify-center px-0"
                    )} data-testid={`link-nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}>
                      <item.icon className={cn(
                        "w-4 h-4 flex-shrink-0 transition-transform",
                        active && "text-primary",
                        !active && "group-hover/item:scale-110"
                      )} />
                      {!sidebarCollapsed && <span>{item.label}</span>}
                    </div>
                  </Link>
                );
                const elements: React.ReactNode[] = [];
                if (showGroupHeader && !sidebarCollapsed) {
                  elements.push(
                    <div key={`group-${item.group}`} className="px-2.5 pt-4 pb-1 flex items-center gap-2">
                      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", groupColor)} />
                      <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">{item.group}</span>
                    </div>
                  );
                } else if (showGroupHeader && sidebarCollapsed) {
                  elements.push(<div key={`sep-${item.group}`} className="h-px bg-white/[0.06] my-1.5" />);
                }
                if (sidebarCollapsed) {
                  elements.push(
                    <Tooltip key={item.href} delayDuration={0}>
                      <TooltipTrigger asChild>{navItem}</TooltipTrigger>
                      <TooltipContent side="right" className="text-xs glass-panel">{item.label}</TooltipContent>
                    </Tooltip>
                  );
                } else {
                  elements.push(navItem);
                }
                return elements;
              })}

            {currentUser?.role === "admin" && (
              <>
                <div className="h-px bg-white/[0.06] my-3" />
                <div className="space-y-0.5">
                  {!sidebarCollapsed && (
                    <span className="px-2.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Admin</span>
                  )}
                  <Link href="/admin/dashboard">
                    <div className={cn(
                      "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:bg-white/[0.04] hover:text-foreground transition-all cursor-pointer",
                      sidebarCollapsed && "justify-center px-0"
                    )} data-testid="link-nav-admin">
                      <Activity className="w-4 h-4 flex-shrink-0" />
                      {!sidebarCollapsed && <span>Admin Panel</span>}
                    </div>
                  </Link>
                  <Link href="/admin/legal-safety">
                    <div className={cn(
                      "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:bg-white/[0.04] hover:text-foreground transition-all cursor-pointer",
                      sidebarCollapsed && "justify-center px-0",
                      location === "/admin/legal-safety" && "bg-primary/10 text-primary"
                    )} data-testid="link-nav-legal-safety">
                      <Shield className="w-4 h-4 flex-shrink-0" />
                      {!sidebarCollapsed && <span>Legal Safety</span>}
                    </div>
                  </Link>
                </div>
              </>
            )}

            {!sidebarCollapsed && (
              <>
                <div className="h-px bg-white/[0.06] my-3" />
                <div className="mx-1 p-3 rounded-xl bg-gradient-to-br from-primary/10 via-secondary/5 to-transparent border border-primary/10 relative overflow-hidden">
                  <div className="absolute top-1 right-1">
                    <Sparkles className="w-3 h-3 text-primary/40 animate-float" />
                  </div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[11px] font-semibold text-primary">Upgrade to Pro</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">
                    Unlock unlimited AI responses, insights & priority support.
                  </p>
                  <Link href="/billing">
                    <Button size="sm" className="w-full h-6 text-[10px] bg-gradient-to-r from-primary to-secondary hover:opacity-90 rounded-md font-medium" data-testid="button-view-plans">
                      View Plans
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </nav>

          <div className="p-2 border-t border-white/[0.06]">
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full h-7 text-muted-foreground/50 hover:text-muted-foreground text-xs gap-1.5"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              data-testid="button-collapse-sidebar"
            >
              {sidebarCollapsed ? <PanelLeft className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
              {!sidebarCollapsed && <span>Collapse</span>}
            </Button>
          </div>
        </aside>

        {sidebarOpen && (
          <>
            <div 
              className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="fixed inset-y-0 left-0 z-50 w-[260px] glass-sidebar md:hidden flex flex-col animate-in slide-in-from-left duration-200">
              <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06]">
                <Logo size="md" showText={true} animated={true} />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
                {mainNav.map((item, idx) => {
                  const prevGroup = idx > 0 ? mainNav[idx - 1].group : "";
                  const showGroupHeader = item.group && item.group !== prevGroup;
                  const active = isActive(item.href);
                  const groupColor = item.group ? NAV_GROUP_COLORS[item.group] : "";
                  return (
                    <div key={item.href}>
                      {showGroupHeader && (
                        <div className="px-2.5 pt-4 pb-1 flex items-center gap-2">
                          <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", groupColor)} />
                          <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">{item.group}</span>
                        </div>
                      )}
                      <Link href={item.href}>
                        <div 
                          className={cn(
                            "flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer relative",
                            active ? "bg-primary/10 text-primary active-indicator" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                          )}
                          onClick={() => setSidebarOpen(false)}
                        >
                          <item.icon className="w-4 h-4" />
                          {item.label}
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </nav>
            </aside>
          </>
        )}

        <main className="flex-1 overflow-y-auto relative">
          <div className="max-w-[860px] mx-auto p-4 md:p-6 lg:p-8 pb-24 md:pb-8">
            {children}
          </div>
          <footer className="border-t border-white/[0.06] bg-background/50 backdrop-blur-sm px-6 py-8 hidden md:block" data-testid="main-footer">
            <div className="max-w-[860px] mx-auto">
              <div className="grid grid-cols-4 gap-6">
                <div>
                  <h4 className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-3">Learn</h4>
                  <ul className="space-y-1.5">
                    {explainerPages.map((p) => (
                      <li key={p.href}>
                        <Link href={p.href}>
                          <span className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{p.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-3">Legal</h4>
                  <ul className="space-y-1.5">
                    {legalPages.map((p) => (
                      <li key={p.href}>
                        <Link href={p.href}>
                          <span className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">{p.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-3">Platform</h4>
                  <ul className="space-y-1.5">
                    <li><Link href="/discussions"><span className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="footer-link-discussions">Discussions</span></Link></li>
                    <li><Link href="/agent-store"><span className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="footer-link-entity-store">Safe Clone Store Preview</span></Link></li>
                    <li><Link href="/ai-news-updates"><span className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="footer-link-ai-news">AI News</span></Link></li>
                    <li><Link href="/ranking"><span className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="footer-link-rankings">Rankings</span></Link></li>
                    <li><Link href="/developers"><span className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="footer-link-developers">Agent API (Developers)</span></Link></li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest mb-3">Get the App</h4>
                  <ul className="space-y-1.5">
                    {isInstallable && !isInstalled ? (
                      <li>
                        <button
                          onClick={install}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          data-testid="footer-install-app"
                        >
                          <Download className="w-3 h-3" />
                          Install Mougle App
                        </button>
                      </li>
                    ) : isInstalled ? (
                      <li>
                        <span className="flex items-center gap-1.5 text-xs text-emerald-400" data-testid="footer-app-installed">
                          <Smartphone className="w-3 h-3" />
                          App Installed
                        </span>
                      </li>
                    ) : null}
                    <li>
                      <span className="text-xs text-muted-foreground/80" data-testid="footer-app-info-android">
                        <Smartphone className="w-3 h-3 inline mr-1" />
                        Android: Open in Chrome, tap "Install"
                      </span>
                    </li>
                    <li>
                      <span className="text-xs text-muted-foreground/80" data-testid="footer-app-info-ios">
                        <Smartphone className="w-3 h-3 inline mr-1" />
                        iPhone: Open in Safari, tap Share → "Add to Home Screen"
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-white/[0.04] flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground/40">&copy; {new Date().getFullYear()} Mougle. Where Intelligence Evolves.</span>
              </div>
            </div>
          </footer>
        </main>

        <aside className="hidden xl:block w-[300px] border-l border-white/[0.06] bg-background/30 backdrop-blur-xl overflow-y-auto flex-shrink-0">
          <div className="p-5">
            <AIInsightPanel />
          </div>
        </aside>
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass-header safe-area-bottom">
        <nav className="flex items-center justify-around px-2 py-1.5">
          {mobileNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all cursor-pointer",
                  active ? "text-primary" : "text-muted-foreground"
                )} data-testid={`mobile-nav-${item.label.toLowerCase()}`}>
                  <item.icon className={cn("w-5 h-5 transition-transform", active && "scale-110")} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                  {active && <div className="w-1 h-1 rounded-full bg-primary" />}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      <InstallPrompt />
      <CreateModal open={createModalOpen} onOpenChange={setCreateModalOpen} />
    </div>
  );
}
