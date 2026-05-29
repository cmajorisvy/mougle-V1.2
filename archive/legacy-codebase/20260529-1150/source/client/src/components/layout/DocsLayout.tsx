import { Link, useLocation } from "wouter";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Info, Layers, Brain, Bot, Shield, CreditCard, DollarSign,
  FileText, Cookie, Scale, Cpu, ChevronRight, ArrowLeft, Menu, X,
  BookOpen, ChevronDown
} from "lucide-react";
import { useState } from "react";

const explainerPages = [
  { icon: Info, label: "About Us", href: "/docs/about" },
  { icon: Layers, label: "How It Works", href: "/docs/how-it-works" },
  { icon: Brain, label: "What Is Intelligence", href: "/docs/intelligence" },
  { icon: Bot, label: "Entities & Agents", href: "/docs/entities" },
  { icon: Shield, label: "Privacy & Safety", href: "/docs/privacy-safety" },
  { icon: CreditCard, label: "What You Pay For", href: "/docs/pricing" },
  { icon: DollarSign, label: "Sell Your Intelligence", href: "/docs/sell" },
];

const legalPages = [
  { icon: FileText, label: "Privacy Policy", href: "/legal/privacy" },
  { icon: Scale, label: "Terms of Service", href: "/legal/terms" },
  { icon: Cookie, label: "Cookie Policy", href: "/legal/cookies" },
  { icon: Cpu, label: "AI Usage Policy", href: "/legal/ai-usage" },
];

export { explainerPages, legalPages };

export function DocsLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => location === href;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col ambient-bg">
      <header className="h-14 glass-header sticky top-0 z-50 flex items-center px-4 justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-8 w-8 text-muted-foreground"
            onClick={() => setMobileOpen(true)}
            data-testid="button-docs-mobile-menu"
          >
            <Menu className="w-4 h-4" />
          </Button>
          <Link href="/">
            <div className="cursor-pointer group transition-transform hover:scale-[1.02]" data-testid="link-docs-home-logo">
              <Logo size="md" showText={true} animated={true} />
            </div>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5" data-testid="link-back-to-app">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to App
            </Button>
          </Link>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative z-10">
        <aside className="hidden md:flex flex-col w-[260px] glass-sidebar flex-shrink-0 overflow-y-auto">
          <nav className="py-4 px-3 space-y-1">
            <div className="px-2.5 pb-2 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase tracking-widest">Documentation</span>
            </div>

            <div className="space-y-0.5">
              <div className="px-2.5 pt-3 pb-1">
                <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Learn</span>
              </div>
              {explainerPages.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={cn(
                        "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all cursor-pointer group/item relative",
                        isActive(item.href)
                          ? "bg-primary/10 text-primary active-indicator"
                          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                      )}
                      data-testid={`link-docs-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Icon className={cn("w-4 h-4 flex-shrink-0", isActive(item.href) && "text-primary")} />
                      <span>{item.label}</span>
                      {isActive(item.href) && <ChevronRight className="w-3 h-3 ml-auto text-primary/60" />}
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="h-px bg-white/[0.06] my-3" />

            <div className="space-y-0.5">
              <div className="px-2.5 pt-1 pb-1">
                <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Legal</span>
              </div>
              {legalPages.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={cn(
                        "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all cursor-pointer group/item relative",
                        isActive(item.href)
                          ? "bg-primary/10 text-primary active-indicator"
                          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                      )}
                      data-testid={`link-legal-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Icon className={cn("w-4 h-4 flex-shrink-0", isActive(item.href) && "text-primary")} />
                      <span>{item.label}</span>
                      {isActive(item.href) && <ChevronRight className="w-3 h-3 ml-auto text-primary/60" />}
                    </div>
                  </Link>
                );
              })}
            </div>
          </nav>
        </aside>

        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="fixed inset-y-0 left-0 z-50 w-[280px] glass-sidebar md:hidden flex flex-col animate-in slide-in-from-left duration-200 overflow-y-auto">
              <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06]">
                <span className="text-sm font-semibold">Documentation</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <nav className="py-3 px-2 space-y-1">
                <div className="px-2.5 pt-1 pb-1">
                  <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Learn</span>
                </div>
                {explainerPages.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        className={cn(
                          "flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer relative",
                          isActive(item.href) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                        )}
                        onClick={() => setMobileOpen(false)}
                      >
                        <Icon className="w-4 h-4" />
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
                <div className="h-px bg-white/[0.06] my-2" />
                <div className="px-2.5 pt-1 pb-1">
                  <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">Legal</span>
                </div>
                {legalPages.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        className={cn(
                          "flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer relative",
                          isActive(item.href) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                        )}
                        onClick={() => setMobileOpen(false)}
                      >
                        <Icon className="w-4 h-4" />
                        {item.label}
                      </div>
                    </Link>
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
        </main>
      </div>

      <DocsFooter />
    </div>
  );
}

export function DocsFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-background/80 backdrop-blur-xl" data-testid="docs-footer">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-widest mb-4">Platform</h4>
            <ul className="space-y-2.5">
              {explainerPages.map((p) => (
                <li key={p.href}>
                  <Link href={p.href}>
                    <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid={`footer-link-${p.label.toLowerCase().replace(/\s+/g, '-')}`}>
                      {p.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-widest mb-4">Legal</h4>
            <ul className="space-y-2.5">
              {legalPages.map((p) => (
                <li key={p.href}>
                  <Link href={p.href}>
                    <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid={`footer-link-${p.label.toLowerCase().replace(/\s+/g, '-')}`}>
                      {p.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-widest mb-4">Get Started</h4>
            <ul className="space-y-2.5">
              <li><Link href="/auth/signup"><span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="footer-link-sign-up">Sign Up</span></Link></li>
              <li><Link href="/auth/signin"><span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="footer-link-sign-in">Sign In</span></Link></li>
              <li><Link href="/discussions"><span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="footer-link-discussions">Discussions</span></Link></li>
              <li><Link href="/agent-store"><span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="footer-link-entity-store">Safe Clone Store Preview</span></Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-widest mb-4">Community</h4>
            <ul className="space-y-2.5">
              <li><Link href="/ranking"><span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="footer-link-rankings">Rankings</span></Link></li>
              <li><Link href="/ai-news-updates"><span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="footer-link-ai-news">AI News</span></Link></li>
              <li><Link href="/network"><span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="footer-link-network">Network</span></Link></li>
              <li><Link href="/dashboard"><span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="footer-link-creator-hub">Creator Hub</span></Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/[0.06] flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo size="sm" showText={true} animated={false} />
            <span className="text-xs text-muted-foreground">Where Intelligence Evolves</span>
          </div>
          <p className="text-xs text-muted-foreground/60" data-testid="text-copyright">
            &copy; {new Date().getFullYear()} Mougle. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export function SectionDiagram({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="my-8 p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] relative overflow-hidden">
      {title && (
        <div className="text-xs font-semibold text-primary uppercase tracking-widest mb-4">{title}</div>
      )}
      {children}
    </div>
  );
}

type IconComponent = React.ComponentType<{ className?: string }>;

export function FlowDiagram({ steps }: { steps: { label: string; description?: string; icon?: IconComponent }[] }) {
  return (
    <div className="flex flex-col md:flex-row items-stretch gap-2 md:gap-0">
      {steps.map((step, i) => {
        const Icon = step.icon;
        return (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div className="flex-1 p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] text-center">
              {Icon && <Icon className="w-5 h-5 mx-auto mb-2 text-primary" />}
              <div className="text-sm font-semibold mb-1">{step.label}</div>
              {step.description && <div className="text-xs text-muted-foreground">{step.description}</div>}
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 hidden md:block" />
            )}
            {i < steps.length - 1 && (
              <ChevronDown className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 md:hidden mx-auto" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function LayerDiagram({ layers }: { layers: { name: string; description: string; color: string }[] }) {
  return (
    <div className="space-y-2">
      {layers.map((layer, i) => (
        <div key={i} className={cn("p-4 rounded-xl border border-white/[0.08] flex items-start gap-3", layer.color)}>
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-sm font-bold flex-shrink-0">
            L{layers.length - i}
          </div>
          <div>
            <div className="text-sm font-semibold">{layer.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{layer.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function FeatureGrid({ features }: { features: { icon: IconComponent; title: string; description: string }[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {features.map((f, i) => {
        const Icon = f.icon;
        return (
          <div key={i} className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-all">
            <Icon className="w-5 h-5 text-primary mb-3" />
            <h4 className="text-sm font-semibold mb-1">{f.title}</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
          </div>
        );
      })}
    </div>
  );
}

export function PageHeader({ title, subtitle, badge }: { title: string; subtitle: string; badge?: string }) {
  return (
    <div className="mb-8">
      {badge && (
        <div className="inline-block px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary mb-4">
          {badge}
        </div>
      )}
      <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight mb-3" data-testid="text-page-title">{title}</h1>
      <p className="text-muted-foreground text-base leading-relaxed max-w-2xl" data-testid="text-page-subtitle">{subtitle}</p>
    </div>
  );
}

export function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="mb-10" id={id}>
      <h2 className="text-xl font-display font-semibold mb-4 flex items-center gap-2">
        <div className="w-1 h-5 rounded-full bg-primary" />
        {title}
      </h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-4">
        {children}
      </div>
    </section>
  );
}
