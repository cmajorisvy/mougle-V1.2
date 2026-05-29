import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Rocket, Star, Download, Users, Shield, ExternalLink,
  ArrowRight, CheckCircle2, Sparkles, Globe, Share2
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useParams, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function LabsLandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();

  const { data: page, isLoading } = useQuery({
    queryKey: ["labs-landing", slug],
    queryFn: () => api.labs.flywheel.getLandingPage(slug!),
    enabled: !!slug,
  });

  const conversionMutation = useMutation({
    mutationFn: () => api.labs.flywheel.trackConversion(slug!),
  });

  const handleGetStarted = () => {
    conversionMutation.mutate();
    if (page?.ctaUrl) {
      window.location.href = page.ctaUrl;
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied!", description: "Share this link to spread the word" });
    } catch {
      toast({ title: "Share this link", description: url });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white">
        <div className="max-w-4xl mx-auto px-4 py-16 space-y-8">
          <Skeleton className="w-64 h-10 mx-auto" />
          <Skeleton className="w-96 h-6 mx-auto" />
          <Skeleton className="w-full h-64" />
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <Globe className="w-16 h-16 text-muted-foreground/30 mx-auto" />
          <h2 className="text-xl font-semibold" data-testid="text-landing-not-found">Page not found</h2>
          <Link href="/labs/apps"><Button variant="outline" data-testid="link-back-app-store">Browse App Store</Button></Link>
        </div>
      </div>
    );
  }

  const socialProof = page.socialProof as { installs: number; rating: number; reviews: number } | null;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <nav className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer" data-testid="link-landing-logo">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="font-display font-bold text-sm">Mougle</span>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleShare} data-testid="button-landing-share">
            <Share2 className="w-4 h-4 mr-1" /> Share
          </Button>
          <Link href="/auth/signup">
            <Button size="sm" className="bg-primary hover:bg-primary/90" data-testid="link-landing-signup">
              Join Mougle <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-16 space-y-12">
        <div className="text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm">
            <Rocket className="w-4 h-4" /> Built with Mougle Labs
          </div>

          <h1 className="text-4xl md:text-5xl font-display font-bold leading-tight" data-testid="text-landing-headline">
            {page.headline}
          </h1>

          {page.subheadline && (
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed" data-testid="text-landing-subheadline">
              {page.subheadline}
            </p>
          )}

          <div className="flex items-center justify-center gap-4 pt-4">
            <Button
              size="lg"
              className="bg-primary hover:bg-primary/90 text-lg px-8"
              onClick={handleGetStarted}
              data-testid="button-landing-cta"
            >
              {page.ctaText} <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>

        {socialProof && (
          <div className="flex items-center justify-center gap-8" data-testid="section-social-proof">
            <div className="text-center">
              <div className="text-2xl font-bold">{socialProof.installs}</div>
              <div className="text-xs text-muted-foreground">Installs</div>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="text-center">
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span className="text-2xl font-bold">{socialProof.rating.toFixed(1)}</span>
              </div>
              <div className="text-xs text-muted-foreground">Rating</div>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="text-center">
              <div className="text-2xl font-bold">{socialProof.reviews}</div>
              <div className="text-xs text-muted-foreground">Reviews</div>
            </div>
          </div>
        )}

        {page.features && page.features.length > 0 && (
          <Card className="glass-card rounded-2xl p-8" data-testid="section-features">
            <h2 className="text-xl font-semibold mb-6 text-center">Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {page.features.map((feature: string, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03]">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-sm text-muted-foreground">{feature}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {page.testimonials && (page.testimonials as any[]).length > 0 && (
          <div className="space-y-4" data-testid="section-testimonials">
            <h2 className="text-xl font-semibold text-center">What People Say</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(page.testimonials as any[]).map((t: any, i: number) => (
                <Card key={i} className="glass-card rounded-xl p-5">
                  <p className="text-sm text-muted-foreground italic mb-3">"{t.quote}"</p>
                  <div className="text-xs font-semibold">{t.name}</div>
                </Card>
              ))}
            </div>
          </div>
        )}

        <Card className="glass-card rounded-2xl p-8 border-primary/20 bg-gradient-to-r from-primary/5 to-violet-500/5 text-center" data-testid="section-cta-bottom">
          <h2 className="text-2xl font-bold mb-3">Ready to get started?</h2>
          <p className="text-muted-foreground mb-6">Join Mougle to discover, build, and prepare intelligent applications for review</p>
          <div className="flex items-center justify-center gap-4">
            <Button size="lg" className="bg-primary hover:bg-primary/90" onClick={handleGetStarted} data-testid="button-landing-cta-bottom">
              {page.ctaText} <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Link href="/auth/signup">
              <Button size="lg" variant="outline" data-testid="link-landing-join">
                <Users className="w-5 h-5 mr-2" /> Join Mougle
              </Button>
            </Link>
          </div>
        </Card>

        <footer className="text-center text-xs text-muted-foreground/50 pt-8 border-t border-white/[0.06]">
          <p>
            Built on <Link href="/"><span className="text-primary hover:underline cursor-pointer" data-testid="link-landing-platform">Mougle</span></Link> — Where Intelligence Evolves
          </p>
          {page.referralCode && (
            <p className="mt-2">Referral: {page.referralCode}</p>
          )}
        </footer>
      </div>
    </div>
  );
}
