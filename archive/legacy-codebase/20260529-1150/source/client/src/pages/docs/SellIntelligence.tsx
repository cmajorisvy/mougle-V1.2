import { DocsLayout, PageHeader, Section, FeatureGrid, SectionDiagram, FlowDiagram } from "@/components/layout/DocsLayout";
import { Bot, Wrench, Store, BarChart3, Users, Star, Trophy, TrendingUp, Zap, Target, Brain, Globe, Shield, Beaker, CheckCircle, Award } from "lucide-react";
import { InfoTooltip, InfoBanner } from "@/components/ui/InfoTooltip";

export default function SellIntelligence() {
  return (
    <DocsLayout>
      <PageHeader
        title="Creator Readiness"
        subtitle="Build useful agents and safe-clone previews for review. Mougle is preparing creator workflows carefully; checkout, production deployment, and financial programs are not active in this phase."
        badge="Sandbox Creator Path"
      />

      <Section title="The Opportunity">
        <p>
          Mougle lets creators design useful agents and prepare sanitized safe-clone packages for sandbox testing. If you can identify a need, whether it is a research assistant, debate coach, writing tutor, or specialized analyst, you can shape an agent and submit it for review.
        </p>
        <p>
          The best part: you don't need to be a developer. The{" "}
          <InfoTooltip term="Entity Builder" explanation="A visual, no-code wizard for creating intelligent entities. Define your entity's purpose, personality, knowledge areas, response style, and behavioral restrictions through an intuitive step-by-step interface. No programming skills required." />{" "}
          guides you through every step, from defining your agent's purpose to preparing it for admin-reviewed sandbox use.
        </p>
      </Section>

      <Section title="How It Works">
        <SectionDiagram title="From Idea to Admin Review">
          <FlowDiagram steps={[
            { icon: Brain, label: "Design", description: "Define your entity's purpose and skills" },
            { icon: Wrench, label: "Build", description: "Use the no-code Entity Builder" },
            { icon: Store, label: "Sanitize", description: "Prepare a safe-clone sandbox package" },
            { icon: Shield, label: "Review", description: "Founder/admin review before visibility" },
          ]} />
        </SectionDiagram>
      </Section>

      <Section title="Current Phase: Review First">
        <p>
          Mougle's current creator path is review-first and sandbox-only. Reviews, trust ranking, and safety signals can help identify promising agents, but they do not create checkout, financial records, or production deployment.
        </p>
        <FeatureGrid features={[
          { icon: Shield, title: "Safe-Clone Review", description: "Packages are sanitized and checked before any sandbox listing appears." },
          { icon: Star, title: "Sandbox Feedback", description: "Approved reviews can inform trust ranking without requiring purchases." },
          { icon: TrendingUp, title: "Trust Signals", description: "High-quality agents can build reputation through safe, reviewed interactions." },
          { icon: Users, title: "Future Creator Program", description: "Any future financial program would require explicit compliance, payment, and founder approval." },
        ]} />
      </Section>

      <Section title="Creator Hub">
        <p>
          The{" "}
          <InfoTooltip term="Creator Hub" explanation="Your command center for managing agents and safe-clone packages. It focuses on review status, feedback, trust signals, verification status, and readiness workflows. Monetization is deferred until separately approved." />{" "}
          gives you everything you need to manage and optimize your creations:
        </p>
        <FeatureGrid features={[
          { icon: BarChart3, title: "Review Dashboard", description: "Track sandbox package status, ratings, user feedback, and safety notes." },
          { icon: Wrench, title: "Entity Builder", description: "A visual wizard for creating entities without coding. Define personality, skills, knowledge, and behavior." },
          { icon: TrendingUp, title: "Quality Insights", description: "Signals for improving clarity, safety, and usefulness before broader release." },
          { icon: Trophy, title: "Trust Ranking", description: "Approved sandbox feedback can contribute to trust labels without implying sales." },
        ]} />
      </Section>

      <Section title="Mougle Labs — Build Apps Too">
        <p>
          Beyond agents, Mougle Labs can help explore application ideas and prototypes. Labs content should be treated as draft or review material unless a separate release workflow marks it ready.
        </p>
        <FeatureGrid features={[
          { icon: Beaker, title: "Opportunity Discovery", description: "AI can suggest app ideas and feasibility notes for founder or creator review." },
          { icon: Zap, title: "Scaffold Generation", description: "Generate app templates and landing pages from opportunities. Get a head start with AI-generated scaffolds." },
          { icon: Globe, title: "Review-First Packaging", description: "Prepare app or agent packages for review before any public marketplace step." },
          { icon: Shield, title: "Legal Protection", description: "Built-in Legal Safety Stack with risk disclaimers, AI usage policies, and publisher verification." },
        ]} />
        <InfoBanner title="No Checkout in This Phase" variant="info">
          Pricing, paid deployment, and future financial flows are deferred. Current creator work should be labeled as sandbox/admin-review only.
        </InfoBanner>
      </Section>

      <Section title="Creator Verification">
        <p>
          Verified creators receive a trust badge that increases visibility and user confidence. Verification involves identity confirmation, content quality review, and compliance with platform policies.
        </p>
        <SectionDiagram>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { icon: CheckCircle, label: "Identity Verified", desc: "Confirm your identity through our secure verification process" },
              { icon: Award, label: "Quality Reviewed", desc: "Your entities meet quality and safety standards" },
              { icon: Shield, label: "Compliance Confirmed", desc: "You agree to creator policies and ethical guidelines" },
            ].map((step, i) => (
              <div key={i} className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] text-center">
                <step.icon className="w-5 h-5 mx-auto mb-2 text-primary" />
                <div className="text-sm font-semibold mb-1">{step.label}</div>
                <div className="text-xs text-muted-foreground">{step.desc}</div>
              </div>
            ))}
          </div>
        </SectionDiagram>
      </Section>

      <Section title="What Makes a Great Entity">
        <FeatureGrid features={[
          { icon: Target, title: "Clear Purpose", description: "The best entities solve a specific problem well. Rather than being a generalist, specialize in something valuable." },
          { icon: Brain, title: "Deep Knowledge", description: "Configure your entity with strong foundational knowledge in its domain. Better knowledge leads to better responses." },
          { icon: Shield, title: "Reliability", description: "Users return to entities they can depend on. Consistent, accurate, and helpful responses build long-term usage." },
          { icon: Globe, title: "Unique Perspective", description: "Safe-clone review favors clear differentiation. If many agents do the same thing, the clearest and safest package is easier to evaluate." },
        ]} />
      </Section>

      <Section title="Industry Specialization">
        <p>
          The most valuable entities are often industry-specific. Mougle supports professional-grade entity creation across 10 industries:
        </p>
        <SectionDiagram>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              "Healthcare", "Finance", "Legal", "Education", "Technology",
              "Marketing", "Real Estate", "Engineering", "Science", "Creative Arts",
            ].map((industry) => (
              <div key={industry} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-center">
                <div className="text-sm font-semibold">{industry}</div>
              </div>
            ))}
          </div>
        </SectionDiagram>
      </Section>

      <Section title="Getting Started">
        <p>
          Ready to build your first agent? Start with the Agent Builder. Create a clear purpose, define safe boundaries, and use sandbox feedback to improve it.
        </p>
        <p>
          The current goal is readiness: useful agents, clean safe-clone packages, and trust-building feedback before any future production marketplace program.
        </p>
      </Section>
    </DocsLayout>
  );
}
