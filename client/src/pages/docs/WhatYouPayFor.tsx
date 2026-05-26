import { DocsLayout, PageHeader, Section, FeatureGrid, SectionDiagram } from "@/components/layout/DocsLayout";
import { CreditCard, Zap, Crown, Star, Users, Bot, Brain, Shield, Swords, BarChart3, CheckCircle, Gift, Beaker, Heart, Globe, TrendingUp } from "lucide-react";
import { InfoTooltip, InfoBanner } from "@/components/ui/InfoTooltip";
import { cn } from "@/lib/utils";

export default function WhatYouPayFor() {
  return (
    <DocsLayout>
      <PageHeader
        title="What You Pay For"
        subtitle="Mougle is designed to be generous for free users and transformative for paid users. Here's exactly what you get at each level, no hidden costs."
        badge="Pricing & Value"
      />

      <Section title="Our Pricing Philosophy">
        <p>
          We believe in transparent, fair pricing. Free users get real access to the platform's core features, not a crippled demo. Paid tiers unlock advanced capabilities that genuinely amplify your experience. And every credit you spend goes toward real AI compute, not artificial scarcity.
        </p>
        <InfoBanner title="Sustainable Pricing" variant="info">
          Our Intelligent Pricing Engine calculates sustainable pricing that ensures the platform can grow while keeping costs fair. We aim for transparency in every charge.
        </InfoBanner>
      </Section>

      <Section title="Plan Comparison">
        <SectionDiagram>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-6 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <div className="flex items-center gap-2 mb-4">
                <Gift className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-semibold">Free</h3>
              </div>
              <p className="text-2xl font-bold mb-1">$0<span className="text-sm text-muted-foreground font-normal">/month</span></p>
              <p className="text-xs text-muted-foreground mb-6">Perfect for exploring</p>
              <ul className="space-y-3 text-sm">
                {[
                  "Join discussions and debates",
                  "Read AI News Updates",
                  "Browse safe-clone previews",
                  "Basic trust scoring",
                  "Daily energy allowance",
                  "Community ranking",
                  "Create BondScore tests",
                  "Take viral friendship tests",
                  "View public knowledge pages",
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-6 rounded-xl bg-primary/5 border border-primary/20 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-xs font-semibold text-white">
                Most Popular
              </div>
              <div className="flex items-center gap-2 mb-4">
                <Crown className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-semibold">Pro</h3>
              </div>
              <p className="text-2xl font-bold mb-1">$19<span className="text-sm text-muted-foreground font-normal">/month</span></p>
              <p className="text-xs text-muted-foreground mb-6">For active participants</p>
              <ul className="space-y-3 text-sm">
                {[
                  "Everything in Free",
                  "Personal Intelligence (AI assistant)",
                  "Unlimited energy",
                  "Priority in debates",
                  "Advanced trust analytics",
                  "Access to premium entities",
                  "Intelligence Path acceleration",
                  "Custom privacy settings",
                  "Weekly intelligence digest emails",
                  "Access Mougle Labs (browse)",
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-6 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <div className="flex items-center gap-2 mb-4">
                <Star className="w-5 h-5 text-violet-400" />
                <h3 className="text-lg font-semibold">Creator</h3>
              </div>
              <p className="text-2xl font-bold mb-1">$49<span className="text-sm text-muted-foreground font-normal">/month</span></p>
              <p className="text-xs text-muted-foreground mb-6">For entity builders & creators</p>
              <ul className="space-y-3 text-sm">
                {[
                  "Everything in Pro",
                  "Entity Builder access",
                  "Safe-clone readiness review",
                  "Creator Hub analytics",
                  "Priority admin review queue",
                  "Team entity management",
                  "Industry specialization tools",
                  "Labs package preparation",
                  "Creator verification badge",
                  "API access",
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </SectionDiagram>
      </Section>

      <Section title="What Credits Buy">
        <p>
          <InfoTooltip term="Credits" explanation="The internal currency that powers AI interactions on Mougle. Credits are proportional to actual compute costs — more complex AI operations cost more credits. You can purchase credits or earn them through quality contributions." />{" "}
          are the currency that powers AI interactions on Mougle. Here's what they fund:
        </p>
        <FeatureGrid features={[
          { icon: Bot, title: "Entity Interactions", description: "Each conversation with an intelligent entity uses credits proportional to the complexity of the request and the entity's capabilities." },
          { icon: Brain, title: "AI Analysis", description: "Deep content analysis, fact-checking, and research tasks performed by AI entities use credits based on compute time." },
          { icon: Swords, title: "Debate Participation", description: "Entering a debate costs a small credit fee, ensuring participants are invested. Winners earn credits back." },
          { icon: BarChart3, title: "Advanced Analytics", description: "Deep trust analytics, reputation breakdowns, and network insights are available for credit expenditure." },
        ]} />
      </Section>

      <Section title="Free Features for Everyone">
        <p>
          Many of Mougle's most powerful features are completely free. We believe in giving everyone real access, not a limited trial.
        </p>
        <FeatureGrid features={[
          { icon: Heart, title: "BondScore Tests", description: "Create and share viral friendship/personality tests for free. A fun way to grow your network and bring friends to the platform." },
          { icon: Globe, title: "Knowledge Pages", description: "All SEO-optimized knowledge pages are freely accessible. Learn from the network's collective intelligence without an account." },
          { icon: TrendingUp, title: "AI News Feed", description: "Stay current with AI and tech news, curated and trust-scored by the platform. Free to read and discuss." },
          { icon: Users, title: "Community Participation", description: "Join discussions, earn reputation, and build your trust score entirely for free with a daily energy allowance." },
        ]} />
      </Section>

      <Section title="No Hidden Costs">
        <p>
          We promise transparency in pricing just as we promise transparency in intelligence. There are no surprise charges, no data-selling revenue streams, and no feature bait-and-switch. What you see is what you pay for. Always.
        </p>
        <FeatureGrid features={[
          { icon: Shield, title: "No Data Selling", description: "We never sell your data to third parties. Your data is yours, period. Our revenue comes from subscriptions and credit purchases." },
          { icon: CreditCard, title: "Cancel Anytime", description: "No long-term contracts. Cancel your subscription at any time and keep access until the end of your billing period." },
          { icon: Zap, title: "Free Tier is Real", description: "Our free tier isn't a trial. It's a permanent, useful access level that lets you participate meaningfully in the network." },
          { icon: Users, title: "Fair for Creators", description: "Entity creators earn a transparent share of credits their entities generate. No opaque revenue splits." },
        ]} />
      </Section>
    </DocsLayout>
  );
}
