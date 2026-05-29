import { db } from "../db";
import { storage } from "../storage";
import {
  labsOpportunities, labsApps, labsFavorites, labsInstallations, labsReviews,
  type LabsOpportunity, type InsertLabsOpportunity,
  type LabsApp, type InsertLabsApp,
  type LabsFavorite, type LabsInstallation, type LabsReview,
} from "@shared/schema";
import { eq, desc, and, sql, asc } from "drizzle-orm";
import { generateUniqueName, isNameGeneric } from "./product-naming-service";

const INDUSTRIES = [
  "Healthcare", "Finance", "Education", "Real Estate", "Legal",
  "Retail", "Agriculture", "Energy", "Transportation", "Entertainment",
  "Manufacturing", "Cybersecurity", "HR & Recruitment", "Marketing",
  "Food & Beverage", "Travel", "Insurance", "Logistics", "SaaS", "AI/ML"
];

const CATEGORIES = [
  "Automation", "Analytics", "Marketplace", "Communication", "Compliance",
  "CRM", "Scheduling", "Inventory", "Content", "Monitoring"
];

const LEGAL_DISCLAIMERS: Record<string, string[]> = {
  Healthcare: [
    "This application is not a substitute for professional medical advice.",
    "HIPAA compliance required for handling patient data.",
    "Medical data must be encrypted at rest and in transit.",
    "Users must consent to data collection per healthcare regulations."
  ],
  Finance: [
    "This application does not constitute financial advice.",
    "Must comply with PCI-DSS for payment data processing.",
    "Securities regulations may apply. Consult a legal advisor.",
    "Financial data retention policies must be implemented."
  ],
  Legal: [
    "This tool does not replace licensed legal counsel.",
    "Attorney-client privilege considerations apply.",
    "Data handling must comply with local bar association rules.",
    "Court filing integrations require jurisdiction-specific compliance."
  ],
  Education: [
    "FERPA/COPPA compliance required for student data.",
    "Parental consent needed for users under 13.",
    "Accessibility standards (WCAG 2.1) should be maintained.",
    "Student data may not be used for advertising purposes."
  ],
  "Real Estate": [
    "Fair Housing Act compliance required.",
    "Property data accuracy is not guaranteed.",
    "Licensing requirements vary by state/jurisdiction.",
    "MLS data usage subject to local board rules."
  ],
  Insurance: [
    "Not a substitute for professional insurance advice.",
    "Rate calculations are estimates only.",
    "State insurance regulations apply.",
    "Data privacy laws for policyholder information must be followed."
  ],
  default: [
    "This application is provided as-is without warranty.",
    "User data is handled according to our privacy policy.",
    "Terms of service apply to all usage.",
    "Compliance with local regulations is the user's responsibility."
  ]
};

function getDisclaimersForIndustry(industry: string): string[] {
  return LEGAL_DISCLAIMERS[industry] || LEGAL_DISCLAIMERS.default;
}

const OPPORTUNITY_TEMPLATES = [
  {
    industry: "Healthcare",
    category: "Automation",
    problemStatement: "Small clinics struggle with patient appointment scheduling, leading to no-shows and scheduling conflicts.",
    solution: "AI-powered appointment scheduler with automated reminders, waitlist management, and smart rescheduling that reduces no-shows by 40%.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL", "Twilio"], features: ["Smart scheduling", "SMS reminders", "Waitlist auto-fill", "Analytics dashboard"], estimatedHours: 40, complexity: "intermediate", scaffoldTemplate: "fullstack-appointment" },
    monetizationModel: "subscription",
    revenueEstimate: "$2,000-5,000/month per clinic",
    targetAudience: "Small to mid-size medical clinics",
    competitiveEdge: "AI predicts optimal scheduling slots based on historical data",
    difficulty: "intermediate"
  },
  {
    industry: "Finance",
    category: "Analytics",
    problemStatement: "Freelancers and small businesses lack affordable tools for expense tracking and tax preparation.",
    solution: "Intelligent expense categorizer with receipt scanning, tax deduction suggestions, and quarterly tax estimate generation.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL", "OpenAI"], features: ["Receipt OCR scanning", "Auto-categorization", "Tax deduction finder", "Quarterly reports"], estimatedHours: 60, complexity: "advanced", scaffoldTemplate: "fullstack-finance" },
    monetizationModel: "subscription",
    revenueEstimate: "$5,000-15,000/month",
    targetAudience: "Freelancers and small business owners",
    competitiveEdge: "AI-powered deduction suggestions save users average $3,200/year",
    difficulty: "advanced"
  },
  {
    industry: "Education",
    category: "Content",
    problemStatement: "Teachers spend 10+ hours per week creating lesson plans, quizzes, and study materials from scratch.",
    solution: "AI lesson plan generator that creates curriculum-aligned content, interactive quizzes, and differentiated materials for diverse learners.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL", "OpenAI"], features: ["Curriculum alignment", "Quiz generator", "Differentiated materials", "Progress tracking"], estimatedHours: 45, complexity: "intermediate", scaffoldTemplate: "fullstack-education" },
    monetizationModel: "subscription",
    revenueEstimate: "$3,000-8,000/month",
    targetAudience: "K-12 teachers and educational institutions",
    competitiveEdge: "Reduces lesson planning time by 70% with curriculum-aware AI",
    difficulty: "intermediate"
  },
  {
    industry: "Real Estate",
    category: "CRM",
    problemStatement: "Independent real estate agents lose leads due to poor follow-up and lack of automated nurturing sequences.",
    solution: "Lead nurturing CRM with automated email sequences, property matching, and AI-generated market insights for client communications.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL", "SendGrid"], features: ["Lead scoring", "Auto email sequences", "Property matching", "Market reports"], estimatedHours: 55, complexity: "advanced", scaffoldTemplate: "fullstack-crm" },
    monetizationModel: "subscription",
    revenueEstimate: "$4,000-12,000/month",
    targetAudience: "Independent real estate agents and small brokerages",
    competitiveEdge: "AI matches leads with properties using preference analysis",
    difficulty: "advanced"
  },
  {
    industry: "Retail",
    category: "Inventory",
    problemStatement: "Small retailers frequently overstock or understock products, leading to lost revenue and waste.",
    solution: "AI inventory optimizer that predicts demand, automates reorder points, and provides seasonal trend analysis.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL"], features: ["Demand forecasting", "Auto-reorder alerts", "Seasonal analysis", "Waste reduction tracker"], estimatedHours: 50, complexity: "intermediate", scaffoldTemplate: "fullstack-inventory" },
    monetizationModel: "subscription",
    revenueEstimate: "$3,000-10,000/month",
    targetAudience: "Small to medium retail businesses",
    competitiveEdge: "Machine learning reduces stockouts by 60%",
    difficulty: "intermediate"
  },
  {
    industry: "Marketing",
    category: "Content",
    problemStatement: "Content marketers struggle to maintain consistent output across social media, blogs, and newsletters.",
    solution: "AI content calendar that generates, schedules, and repurposes content across platforms with brand voice consistency.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL", "OpenAI"], features: ["Multi-platform scheduling", "Content generation", "Brand voice training", "Analytics"], estimatedHours: 55, complexity: "advanced", scaffoldTemplate: "fullstack-marketing" },
    monetizationModel: "subscription",
    revenueEstimate: "$5,000-20,000/month",
    targetAudience: "Marketing agencies and content teams",
    competitiveEdge: "Learns brand voice and maintains consistency across channels",
    difficulty: "advanced"
  },
  {
    industry: "Legal",
    category: "Automation",
    problemStatement: "Small law firms spend excessive time on contract review and document preparation.",
    solution: "AI contract analyzer that highlights key clauses, identifies risks, and generates standard legal documents from templates.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL", "OpenAI"], features: ["Contract analysis", "Risk highlighting", "Template generation", "Clause library"], estimatedHours: 65, complexity: "advanced", scaffoldTemplate: "fullstack-legal" },
    monetizationModel: "subscription",
    revenueEstimate: "$8,000-25,000/month",
    targetAudience: "Solo practitioners and small law firms",
    competitiveEdge: "Reduces contract review time by 80%",
    difficulty: "advanced"
  },
  {
    industry: "Food & Beverage",
    category: "Marketplace",
    problemStatement: "Local food producers lack affordable platforms to sell directly to consumers and restaurants.",
    solution: "Farm-to-table marketplace connecting local producers with restaurants and consumers, with route-optimized delivery scheduling.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL", "Stripe"], features: ["Producer profiles", "Order management", "Delivery routing", "Subscription boxes"], estimatedHours: 70, complexity: "advanced", scaffoldTemplate: "fullstack-marketplace" },
    monetizationModel: "one-time",
    revenueEstimate: "$6,000-18,000/month via commissions",
    targetAudience: "Local farmers, artisan food producers, restaurants",
    competitiveEdge: "Route optimization reduces delivery costs by 35%",
    difficulty: "advanced"
  },
  {
    industry: "HR & Recruitment",
    category: "Automation",
    problemStatement: "Small companies spend weeks screening resumes and scheduling interviews for open positions.",
    solution: "AI recruitment assistant that screens resumes, ranks candidates, and automates interview scheduling with calendar integration.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL", "OpenAI"], features: ["Resume parsing", "Candidate ranking", "Auto scheduling", "Pipeline tracking"], estimatedHours: 50, complexity: "intermediate", scaffoldTemplate: "fullstack-hr" },
    monetizationModel: "subscription",
    revenueEstimate: "$4,000-12,000/month",
    targetAudience: "SMBs with 10-200 employees",
    competitiveEdge: "Reduces time-to-hire by 50%",
    difficulty: "intermediate"
  },
  {
    industry: "Energy",
    category: "Monitoring",
    problemStatement: "Homeowners and small businesses lack visibility into their energy usage patterns and waste.",
    solution: "Smart energy monitor with usage analytics, cost optimization recommendations, and solar ROI calculator.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL"], features: ["Usage dashboards", "Cost projections", "Optimization tips", "Solar calculator"], estimatedHours: 40, complexity: "intermediate", scaffoldTemplate: "fullstack-energy" },
    monetizationModel: "free",
    revenueEstimate: "$2,000-8,000/month via premium tier",
    targetAudience: "Homeowners and small businesses",
    competitiveEdge: "Identifies hidden energy waste with anomaly detection",
    difficulty: "beginner"
  },
  {
    industry: "Cybersecurity",
    category: "Compliance",
    problemStatement: "Small businesses lack resources to maintain cybersecurity compliance and vulnerability assessments.",
    solution: "Automated security compliance checker that scans infrastructure, generates reports, and provides remediation steps.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL"], features: ["Compliance scanning", "Vulnerability reports", "Remediation guides", "Audit trails"], estimatedHours: 60, complexity: "advanced", scaffoldTemplate: "fullstack-security" },
    monetizationModel: "subscription",
    revenueEstimate: "$5,000-15,000/month",
    targetAudience: "SMBs requiring SOC2/GDPR compliance",
    competitiveEdge: "Automated scanning reduces compliance costs by 70%",
    difficulty: "advanced"
  },
  {
    industry: "Agriculture",
    category: "Analytics",
    problemStatement: "Small farmers lack data-driven tools to optimize crop yields and manage resources efficiently.",
    solution: "Smart farming dashboard with weather integration, soil analysis tracking, and AI crop recommendations.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL"], features: ["Weather integration", "Soil tracking", "Crop recommendations", "Yield predictions"], estimatedHours: 45, complexity: "intermediate", scaffoldTemplate: "fullstack-agriculture" },
    monetizationModel: "subscription",
    revenueEstimate: "$2,000-6,000/month",
    targetAudience: "Small to medium-sized farms",
    competitiveEdge: "Hyperlocal weather data combined with soil analysis",
    difficulty: "intermediate"
  },
  {
    industry: "Transportation",
    category: "Scheduling",
    problemStatement: "Small fleet operators struggle with route optimization and driver scheduling.",
    solution: "Fleet management system with AI route optimization, driver scheduling, and real-time tracking dashboard.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL", "MapBox"], features: ["Route optimization", "Driver scheduling", "Live tracking", "Fuel analytics"], estimatedHours: 55, complexity: "advanced", scaffoldTemplate: "fullstack-fleet" },
    monetizationModel: "subscription",
    revenueEstimate: "$4,000-15,000/month",
    targetAudience: "Small fleet operators with 5-50 vehicles",
    competitiveEdge: "AI reduces fuel costs by 25% through smart routing",
    difficulty: "advanced"
  },
  {
    industry: "Entertainment",
    category: "Marketplace",
    problemStatement: "Independent musicians lack tools to manage bookings, promote events, and handle payments.",
    solution: "Musician booking platform with gig management, fan engagement tools, and integrated ticketing.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL", "Stripe"], features: ["Gig calendar", "Booking requests", "Fan messaging", "Ticket sales"], estimatedHours: 50, complexity: "intermediate", scaffoldTemplate: "fullstack-entertainment" },
    monetizationModel: "one-time",
    revenueEstimate: "$3,000-10,000/month via commissions",
    targetAudience: "Independent musicians and small venues",
    competitiveEdge: "Integrated fan engagement increases repeat bookings",
    difficulty: "intermediate"
  },
  {
    industry: "SaaS",
    category: "Analytics",
    problemStatement: "SaaS founders lack affordable tools to track key metrics like MRR, churn, and customer lifetime value.",
    solution: "SaaS metrics dashboard integrating with Stripe and billing APIs to provide real-time business intelligence.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL", "Stripe API"], features: ["MRR tracking", "Churn analysis", "LTV calculator", "Cohort analysis"], estimatedHours: 45, complexity: "intermediate", scaffoldTemplate: "fullstack-saas-metrics" },
    monetizationModel: "subscription",
    revenueEstimate: "$5,000-20,000/month",
    targetAudience: "SaaS founders and growth teams",
    competitiveEdge: "One-click Stripe integration with predictive churn alerts",
    difficulty: "intermediate"
  },
  {
    industry: "Travel",
    category: "Communication",
    problemStatement: "Travel agencies struggle to provide personalized itineraries at scale.",
    solution: "AI travel itinerary builder that generates personalized trip plans based on preferences, budget, and travel style.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL", "OpenAI"], features: ["Preference quiz", "AI itinerary generation", "Budget optimizer", "Booking links"], estimatedHours: 40, complexity: "intermediate", scaffoldTemplate: "fullstack-travel" },
    monetizationModel: "one-time",
    revenueEstimate: "$3,000-12,000/month",
    targetAudience: "Travel agencies and independent travelers",
    competitiveEdge: "GPT-powered personalization with real-time pricing",
    difficulty: "intermediate"
  },
  {
    industry: "Logistics",
    category: "Automation",
    problemStatement: "E-commerce businesses struggle with returns management and reverse logistics.",
    solution: "Returns management platform with automated RMA processing, carrier integration, and refund analytics.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL"], features: ["RMA automation", "Carrier integration", "Refund tracking", "Return analytics"], estimatedHours: 50, complexity: "intermediate", scaffoldTemplate: "fullstack-logistics" },
    monetizationModel: "subscription",
    revenueEstimate: "$4,000-12,000/month",
    targetAudience: "E-commerce businesses processing 100+ returns/month",
    competitiveEdge: "Reduces return processing time by 60%",
    difficulty: "intermediate"
  },
  {
    industry: "Manufacturing",
    category: "Monitoring",
    problemStatement: "Small manufacturers lack affordable predictive maintenance solutions for their equipment.",
    solution: "Equipment monitoring dashboard with anomaly detection, maintenance scheduling, and downtime prediction.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL"], features: ["Sensor dashboards", "Anomaly alerts", "Maintenance schedules", "Downtime reports"], estimatedHours: 55, complexity: "advanced", scaffoldTemplate: "fullstack-manufacturing" },
    monetizationModel: "subscription",
    revenueEstimate: "$5,000-20,000/month",
    targetAudience: "Small to mid-size manufacturers",
    competitiveEdge: "Predictive models reduce unplanned downtime by 45%",
    difficulty: "advanced"
  },
  {
    industry: "AI/ML",
    category: "Automation",
    problemStatement: "Data teams spend excessive time on repetitive data cleaning and preprocessing tasks.",
    solution: "AI data preparation tool that automates cleaning, normalization, and feature engineering with visual pipeline builder.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL", "Python"], features: ["Visual pipeline builder", "Auto-cleaning", "Feature engineering", "Data quality reports"], estimatedHours: 65, complexity: "advanced", scaffoldTemplate: "fullstack-data-prep" },
    monetizationModel: "subscription",
    revenueEstimate: "$8,000-30,000/month",
    targetAudience: "Data science teams and ML engineers",
    competitiveEdge: "Reduces data preparation time by 75%",
    difficulty: "advanced"
  },
  {
    industry: "Healthcare",
    category: "Communication",
    problemStatement: "Mental health providers lack affordable tools for patient check-ins between sessions.",
    solution: "Patient wellness tracker with mood journaling, symptom tracking, and secure provider communication.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL"], features: ["Mood tracking", "Symptom journal", "Secure messaging", "Provider dashboard"], estimatedHours: 45, complexity: "intermediate", scaffoldTemplate: "fullstack-wellness" },
    monetizationModel: "subscription",
    revenueEstimate: "$3,000-10,000/month",
    targetAudience: "Mental health providers and therapists",
    competitiveEdge: "HIPAA-compliant with AI-powered risk alerting",
    difficulty: "intermediate"
  },
  {
    industry: "Finance",
    category: "CRM",
    problemStatement: "Independent financial advisors lack tools to manage client portfolios and automate reporting.",
    solution: "Client portfolio dashboard with automated performance reports, rebalancing alerts, and meeting scheduler.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL"], features: ["Portfolio tracking", "Performance reports", "Rebalancing alerts", "Client portal"], estimatedHours: 55, complexity: "advanced", scaffoldTemplate: "fullstack-portfolio" },
    monetizationModel: "subscription",
    revenueEstimate: "$6,000-20,000/month",
    targetAudience: "Independent financial advisors and RIAs",
    competitiveEdge: "Automated compliance-ready reporting saves 15 hours/week",
    difficulty: "advanced"
  },
  {
    industry: "Education",
    category: "Marketplace",
    problemStatement: "Tutors lack platforms to manage students, schedule sessions, and process payments efficiently.",
    solution: "Tutoring management platform with booking, video sessions, progress tracking, and parent communication.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL", "Stripe"], features: ["Session booking", "Video integration", "Progress reports", "Payment processing"], estimatedHours: 50, complexity: "intermediate", scaffoldTemplate: "fullstack-tutoring" },
    monetizationModel: "subscription",
    revenueEstimate: "$3,000-10,000/month",
    targetAudience: "Independent tutors and tutoring centers",
    competitiveEdge: "Integrated video + payments reduces admin work by 60%",
    difficulty: "intermediate"
  },
  {
    industry: "Retail",
    category: "Analytics",
    problemStatement: "Small e-commerce stores lack affordable customer behavior analytics and personalization.",
    solution: "E-commerce analytics dashboard with customer segmentation, product recommendations, and A/B testing tools.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL"], features: ["Customer segments", "Product recs", "A/B testing", "Revenue attribution"], estimatedHours: 50, complexity: "intermediate", scaffoldTemplate: "fullstack-ecom-analytics" },
    monetizationModel: "subscription",
    revenueEstimate: "$4,000-15,000/month",
    targetAudience: "Small e-commerce businesses",
    competitiveEdge: "AI recommendations increase average order value by 20%",
    difficulty: "intermediate"
  },
  {
    industry: "Marketing",
    category: "Automation",
    problemStatement: "Small agencies struggle to manage and report on multiple client campaigns across platforms.",
    solution: "Multi-client campaign manager with cross-platform reporting, budget tracking, and automated performance alerts.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL"], features: ["Multi-client dashboard", "Cross-platform reports", "Budget tracking", "Alert system"], estimatedHours: 55, complexity: "advanced", scaffoldTemplate: "fullstack-campaign-mgr" },
    monetizationModel: "subscription",
    revenueEstimate: "$5,000-18,000/month",
    targetAudience: "Marketing agencies managing 10+ clients",
    competitiveEdge: "Unified reporting across all major ad platforms",
    difficulty: "advanced"
  },
  {
    industry: "Insurance",
    category: "Compliance",
    problemStatement: "Insurance agents spend hours comparing policies and generating quotes for clients.",
    solution: "Policy comparison engine with automated quote generation, coverage gap analysis, and client recommendation reports.",
    developmentSpec: { techStack: ["React", "Node.js", "PostgreSQL"], features: ["Policy comparison", "Quote generator", "Coverage analysis", "Client reports"], estimatedHours: 50, complexity: "intermediate", scaffoldTemplate: "fullstack-insurance" },
    monetizationModel: "subscription",
    revenueEstimate: "$5,000-15,000/month",
    targetAudience: "Independent insurance agents",
    competitiveEdge: "AI identifies coverage gaps competitors miss",
    difficulty: "intermediate"
  }
];

class LabsService {
  async generateDailyOpportunities(): Promise<LabsOpportunity[]> {
    const count = 20 + Math.floor(Math.random() * 11);
    const opportunities: LabsOpportunity[] = [];

    for (let i = 0; i < count; i++) {
      const template = OPPORTUNITY_TEMPLATES[i % OPPORTUNITY_TEMPLATES.length];
      const variation = this.createVariation(template, i);
      const [opp] = await db.insert(labsOpportunities).values(variation).returning();
      opportunities.push(opp);
    }

    return opportunities;
  }

  private createVariation(template: typeof OPPORTUNITY_TEMPLATES[0], index: number): InsertLabsOpportunity {
    const disclaimers = getDisclaimersForIndustry(template.industry);
    return {
      industry: template.industry,
      category: template.category,
      problemStatement: template.problemStatement,
      solution: template.solution,
      developmentSpec: template.developmentSpec,
      monetizationModel: template.monetizationModel,
      revenueEstimate: template.revenueEstimate || null,
      legalRequirements: [`${template.industry} industry regulations apply`, "Data protection compliance required", "User consent mechanisms needed"],
      legalDisclaimers: disclaimers,
      targetAudience: template.targetAudience || null,
      competitiveEdge: template.competitiveEdge || null,
      difficulty: template.difficulty,
      trending: index < 5,
      buildCount: 0,
      generatedBy: "system",
      status: "active",
    };
  }

  async getOpportunities(filters?: { industry?: string; category?: string; difficulty?: string }): Promise<LabsOpportunity[]> {
    let query = db.select().from(labsOpportunities).where(eq(labsOpportunities.status, "active")).orderBy(desc(labsOpportunities.createdAt));

    const results = await query;

    let filtered = results;
    if (filters?.industry) {
      filtered = filtered.filter(o => o.industry === filters.industry);
    }
    if (filters?.category) {
      filtered = filtered.filter(o => o.category === filters.category);
    }
    if (filters?.difficulty) {
      filtered = filtered.filter(o => o.difficulty === filters.difficulty);
    }

    return filtered;
  }

  async getOpportunity(id: string): Promise<LabsOpportunity | undefined> {
    const [opp] = await db.select().from(labsOpportunities).where(eq(labsOpportunities.id, id));
    return opp;
  }

  async incrementBuildCount(id: string): Promise<void> {
    await db.update(labsOpportunities).set({ buildCount: sql`${labsOpportunities.buildCount} + 1` }).where(eq(labsOpportunities.id, id));
  }

  async getScaffoldSpec(opportunityId: string) {
    const opp = await this.getOpportunity(opportunityId);
    if (!opp) throw new Error("Opportunity not found");
    return {
      name: `mougle-${opp.industry.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${opp.category.toLowerCase()}`,
      description: opp.solution,
      techStack: opp.developmentSpec.techStack,
      features: opp.developmentSpec.features,
      industry: opp.industry,
      legalDisclaimers: opp.legalDisclaimers,
      scaffoldTemplate: opp.developmentSpec.scaffoldTemplate,
      files: this.generateScaffoldFiles(opp),
    };
  }

  private generateScaffoldFiles(opp: LabsOpportunity): Record<string, string> {
    const appName = `${opp.industry} ${opp.category} App`;
    return {
      "README.md": `# ${appName}\n\n${opp.solution}\n\n## Features\n${opp.developmentSpec.features.map(f => `- ${f}`).join('\n')}\n\n## Tech Stack\n${opp.developmentSpec.techStack.map(t => `- ${t}`).join('\n')}\n\n## Legal\n${opp.legalDisclaimers.map(d => `- ${d}`).join('\n')}\n\nBuilt with Mougle Labs`,
      "package.json": JSON.stringify({ name: `mougle-${opp.category.toLowerCase()}`, version: "1.0.0", private: true, scripts: { dev: "vite", build: "vite build" } }, null, 2),
    };
  }

  async publishApp(data: InsertLabsApp): Promise<LabsApp> {
    const nameNeedsGeneration = !data.name || isNameGeneric(data.name);
    let finalName = data.name;
    if (nameNeedsGeneration) {
      finalName = await generateUniqueName({
        niche: `${data.industry || ""} ${data.category || ""}`,
        exists: async (name) => {
          const [existing] = await db.select().from(labsApps).where(eq(labsApps.name, name)).limit(1);
          return !!existing;
        },
      });
    }
    if (data.projectPackageId) {
      const pkg = await storage.getProjectPackage(data.projectPackageId);
      if (!pkg) throw new Error("Project package not found for marketplace validation");
      if (!pkg.councilApproved) {
        const validation = await storage.getLatestProjectValidationForPackage(data.projectPackageId);
        if (!validation || validation.recommendation !== "LABS_APPROVED") {
          throw new Error("Project validation not approved for marketplace listing");
        }
      }
    }
    const disclaimers = getDisclaimersForIndustry(data.industry);
    const [app] = await db.insert(labsApps).values({
      ...data,
      name: finalName || data.name,
      legalDisclaimers: [...(data.legalDisclaimers || []), ...disclaimers],
      status: "published",
    }).returning();
    return app;
  }

  async getPublishedApps(filters?: { category?: string; pricingModel?: string; industry?: string }): Promise<LabsApp[]> {
    const results = await db.select().from(labsApps).where(eq(labsApps.status, "published")).orderBy(desc(labsApps.createdAt));

    let filtered = results;
    if (filters?.category) filtered = filtered.filter(a => a.category === filters.category);
    if (filters?.pricingModel) filtered = filtered.filter(a => a.pricingModel === filters.pricingModel);
    if (filters?.industry) filtered = filtered.filter(a => a.industry === filters.industry);
    return filtered;
  }

  async getApp(id: string): Promise<LabsApp | undefined> {
    const [app] = await db.select().from(labsApps).where(eq(labsApps.id, id));
    return app;
  }

  async getUserApps(userId: string): Promise<LabsApp[]> {
    return db.select().from(labsApps).where(eq(labsApps.creatorId, userId)).orderBy(desc(labsApps.createdAt));
  }

  async installApp(userId: string, appId: string): Promise<LabsInstallation> {
    const existing = await db.select().from(labsInstallations).where(and(eq(labsInstallations.userId, userId), eq(labsInstallations.appId, appId)));
    if (existing.length > 0) return existing[0];

    await db.update(labsApps).set({ installCount: sql`${labsApps.installCount} + 1` }).where(eq(labsApps.id, appId));
    const [install] = await db.insert(labsInstallations).values({ userId, appId, status: "installed" }).returning();
    return install;
  }

  async uninstallApp(userId: string, appId: string): Promise<void> {
    await db.delete(labsInstallations).where(and(eq(labsInstallations.userId, userId), eq(labsInstallations.appId, appId)));
  }

  async getUserInstallations(userId: string): Promise<LabsInstallation[]> {
    return db.select().from(labsInstallations).where(eq(labsInstallations.userId, userId));
  }

  async toggleFavorite(userId: string, itemId: string, itemType: string): Promise<{ favorited: boolean }> {
    const existing = await db.select().from(labsFavorites).where(and(eq(labsFavorites.userId, userId), eq(labsFavorites.itemId, itemId)));
    if (existing.length > 0) {
      await db.delete(labsFavorites).where(eq(labsFavorites.id, existing[0].id));
      return { favorited: false };
    }
    await db.insert(labsFavorites).values({ userId, itemId, itemType }).returning();
    return { favorited: true };
  }

  async getUserFavorites(userId: string): Promise<LabsFavorite[]> {
    return db.select().from(labsFavorites).where(eq(labsFavorites.userId, userId));
  }

  async addReview(data: { appId: string; userId: string; rating: number; comment?: string }): Promise<LabsReview> {
    const [review] = await db.insert(labsReviews).values(data).returning();
    const reviews = await db.select().from(labsReviews).where(eq(labsReviews.appId, data.appId));
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    await db.update(labsApps).set({ rating: avgRating, reviewCount: reviews.length }).where(eq(labsApps.id, data.appId));
    return review;
  }

  async getAppReviews(appId: string): Promise<LabsReview[]> {
    return db.select().from(labsReviews).where(eq(labsReviews.appId, appId)).orderBy(desc(labsReviews.createdAt));
  }

  async seedIfEmpty(): Promise<void> {
    const existing = await db.select().from(labsOpportunities).limit(1);
    if (existing.length === 0) {
      await this.generateDailyOpportunities();
    }
  }

  getIndustries(): string[] {
    return INDUSTRIES;
  }

  getCategories(): string[] {
    return CATEGORIES;
  }

  getDisclaimers(industry: string): string[] {
    return getDisclaimersForIndustry(industry);
  }
}

export const labsService = new LabsService();
