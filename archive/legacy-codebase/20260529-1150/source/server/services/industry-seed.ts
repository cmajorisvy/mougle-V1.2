import { db } from "../db";
import { industries, industryCategories, agentRoles, knowledgePacks, agentSkillNodes } from "@shared/schema";
import { sql } from "drizzle-orm";

export async function seedIndustryData() {
  const existing = await db.select({ id: industries.id }).from(industries).limit(1);
  if (existing.length > 0) return;

  await db.insert(industries).values([
    { slug: "finance", name: "Finance & Banking", icon: "DollarSign", color: "#22c55e", regulated: true, disclaimer: "This AI agent provides general financial information only. It is not a licensed financial advisor. Always consult a qualified professional before making financial decisions.", sortOrder: 1 },
    { slug: "healthcare", name: "Healthcare & Medical", icon: "Heart", color: "#ef4444", regulated: true, disclaimer: "This AI agent provides general health information only. It does not provide medical diagnoses or treatment plans. Always consult a licensed healthcare professional.", sortOrder: 2 },
    { slug: "legal", name: "Legal & Compliance", icon: "Scale", color: "#8b5cf6", regulated: true, disclaimer: "This AI agent provides general legal information only. It does not constitute legal advice. Always consult a qualified attorney for legal matters.", sortOrder: 3 },
    { slug: "technology", name: "Technology & Software", icon: "Code", color: "#3b82f6", regulated: false, sortOrder: 4 },
    { slug: "marketing", name: "Marketing & Sales", icon: "Megaphone", color: "#f97316", regulated: false, sortOrder: 5 },
    { slug: "education", name: "Education & Training", icon: "GraduationCap", color: "#06b6d4", regulated: false, sortOrder: 6 },
    { slug: "realestate", name: "Real Estate", icon: "Building", color: "#a855f7", regulated: true, disclaimer: "This AI agent provides general real estate information only. It is not a licensed real estate agent or broker.", sortOrder: 7 },
    { slug: "ecommerce", name: "E-Commerce & Retail", icon: "ShoppingCart", color: "#eab308", regulated: false, sortOrder: 8 },
    { slug: "media", name: "Media & Content", icon: "Film", color: "#ec4899", regulated: false, sortOrder: 9 },
    { slug: "hr", name: "HR & Recruiting", icon: "Users", color: "#14b8a6", regulated: false, sortOrder: 10 },
  ]);

  await db.insert(industryCategories).values([
    { industrySlug: "finance", slug: "fin-advisory", name: "Financial Advisory", sortOrder: 1 },
    { industrySlug: "finance", slug: "fin-analysis", name: "Market Analysis", sortOrder: 2 },
    { industrySlug: "finance", slug: "fin-compliance", name: "Regulatory Compliance", sortOrder: 3 },
    { industrySlug: "finance", slug: "fin-crypto", name: "Cryptocurrency & DeFi", sortOrder: 4 },
    { industrySlug: "healthcare", slug: "hc-clinical", name: "Clinical Support", sortOrder: 1 },
    { industrySlug: "healthcare", slug: "hc-research", name: "Medical Research", sortOrder: 2 },
    { industrySlug: "healthcare", slug: "hc-wellness", name: "Wellness & Prevention", sortOrder: 3 },
    { industrySlug: "legal", slug: "legal-contracts", name: "Contract Analysis", sortOrder: 1 },
    { industrySlug: "legal", slug: "legal-ip", name: "Intellectual Property", sortOrder: 2 },
    { industrySlug: "legal", slug: "legal-compliance", name: "Corporate Compliance", sortOrder: 3 },
    { industrySlug: "technology", slug: "tech-dev", name: "Software Development", sortOrder: 1 },
    { industrySlug: "technology", slug: "tech-devops", name: "DevOps & Infrastructure", sortOrder: 2 },
    { industrySlug: "technology", slug: "tech-security", name: "Cybersecurity", sortOrder: 3 },
    { industrySlug: "technology", slug: "tech-data", name: "Data Science & AI", sortOrder: 4 },
    { industrySlug: "marketing", slug: "mkt-content", name: "Content Marketing", sortOrder: 1 },
    { industrySlug: "marketing", slug: "mkt-seo", name: "SEO & Growth", sortOrder: 2 },
    { industrySlug: "marketing", slug: "mkt-social", name: "Social Media", sortOrder: 3 },
    { industrySlug: "marketing", slug: "mkt-sales", name: "Sales & CRM", sortOrder: 4 },
    { industrySlug: "education", slug: "edu-tutoring", name: "Tutoring & Mentoring", sortOrder: 1 },
    { industrySlug: "education", slug: "edu-curriculum", name: "Curriculum Design", sortOrder: 2 },
    { industrySlug: "education", slug: "edu-assessment", name: "Assessment & Testing", sortOrder: 3 },
    { industrySlug: "realestate", slug: "re-residential", name: "Residential Sales", sortOrder: 1 },
    { industrySlug: "realestate", slug: "re-commercial", name: "Commercial Property", sortOrder: 2 },
    { industrySlug: "realestate", slug: "re-investment", name: "Property Investment", sortOrder: 3 },
    { industrySlug: "ecommerce", slug: "ec-product", name: "Product Management", sortOrder: 1 },
    { industrySlug: "ecommerce", slug: "ec-support", name: "Customer Support", sortOrder: 2 },
    { industrySlug: "ecommerce", slug: "ec-analytics", name: "E-Commerce Analytics", sortOrder: 3 },
    { industrySlug: "media", slug: "media-writing", name: "Content Writing", sortOrder: 1 },
    { industrySlug: "media", slug: "media-video", name: "Video Production", sortOrder: 2 },
    { industrySlug: "media", slug: "media-journalism", name: "Journalism & Research", sortOrder: 3 },
    { industrySlug: "hr", slug: "hr-recruiting", name: "Talent Acquisition", sortOrder: 1 },
    { industrySlug: "hr", slug: "hr-culture", name: "Culture & Engagement", sortOrder: 2 },
    { industrySlug: "hr", slug: "hr-payroll", name: "Payroll & Benefits", sortOrder: 3 },
  ]);

  await db.insert(agentRoles).values([
    { categorySlug: "fin-advisory", industrySlug: "finance", slug: "financial-advisor", name: "Financial Advisor", description: "Provides investment guidance and portfolio analysis", systemPromptTemplate: "You are a knowledgeable financial advisor specializing in investment strategies, portfolio management, and wealth planning. Provide data-driven analysis with clear risk assessments.", defaultSkills: ["portfolio-analysis", "risk-assessment", "tax-planning"], defaultTemperature: 0.5 },
    { categorySlug: "fin-analysis", industrySlug: "finance", slug: "market-analyst", name: "Market Analyst", description: "Analyzes market trends, stocks, and economic indicators", systemPromptTemplate: "You are an expert market analyst who tracks financial markets, evaluates trends, and provides actionable insights. Use quantitative reasoning and cite data sources.", defaultSkills: ["market-research", "technical-analysis", "forecasting"], defaultTemperature: 0.4 },
    { categorySlug: "fin-compliance", industrySlug: "finance", slug: "compliance-officer", name: "Compliance Officer", description: "Ensures regulatory compliance and risk management", systemPromptTemplate: "You are a compliance specialist who helps organizations navigate financial regulations (SEC, FINRA, etc.). Provide clear guidance on compliance requirements.", defaultSkills: ["regulatory-analysis", "risk-management", "audit-support"], defaultTemperature: 0.3 },
    { categorySlug: "fin-crypto", industrySlug: "finance", slug: "crypto-analyst", name: "Crypto Analyst", description: "Specializes in blockchain, DeFi, and crypto markets", systemPromptTemplate: "You are a cryptocurrency and DeFi analyst. Provide analysis on blockchain projects, tokenomics, market movements, and DeFi protocols.", defaultSkills: ["blockchain-analysis", "defi-research", "tokenomics"], defaultTemperature: 0.5 },
    { categorySlug: "hc-clinical", industrySlug: "healthcare", slug: "clinical-assistant", name: "Clinical Assistant", description: "Supports clinical decision-making with medical literature", systemPromptTemplate: "You are a clinical support assistant with deep knowledge of medical literature. Help synthesize research findings and provide evidence-based summaries. Always remind users to consult healthcare professionals.", defaultSkills: ["literature-review", "clinical-guidelines", "drug-interactions"], defaultTemperature: 0.3 },
    { categorySlug: "hc-research", industrySlug: "healthcare", slug: "research-analyst", name: "Medical Research Analyst", description: "Analyzes clinical studies and research papers", systemPromptTemplate: "You are a medical research analyst who evaluates clinical studies, trial designs, and research methodologies. Provide objective, evidence-based analysis.", defaultSkills: ["study-analysis", "methodology-review", "data-interpretation"], defaultTemperature: 0.4 },
    { categorySlug: "hc-wellness", industrySlug: "healthcare", slug: "wellness-coach", name: "Wellness Coach", description: "Provides wellness and prevention guidance", systemPromptTemplate: "You are a wellness coach focused on preventive health, nutrition, fitness, and mental well-being. Provide evidence-based wellness advice.", defaultSkills: ["nutrition-guidance", "fitness-planning", "mental-wellness"], defaultTemperature: 0.6 },
    { categorySlug: "legal-contracts", industrySlug: "legal", slug: "contract-analyst", name: "Contract Analyst", description: "Reviews and analyzes legal contracts and agreements", systemPromptTemplate: "You are a contract analysis specialist. Review documents for key terms, potential risks, and compliance issues. Highlight areas of concern clearly.", defaultSkills: ["contract-review", "risk-identification", "clause-analysis"], defaultTemperature: 0.3 },
    { categorySlug: "legal-ip", industrySlug: "legal", slug: "ip-specialist", name: "IP Specialist", description: "Specializes in patents, trademarks, and copyrights", systemPromptTemplate: "You are an intellectual property specialist. Analyze patent claims, trademark conflicts, and copyright issues with technical precision.", defaultSkills: ["patent-analysis", "trademark-search", "copyright-review"], defaultTemperature: 0.4 },
    { categorySlug: "tech-dev", industrySlug: "technology", slug: "code-reviewer", name: "Code Reviewer", description: "Reviews code for quality, security, and best practices", systemPromptTemplate: "You are a senior software engineer who performs thorough code reviews. Focus on code quality, security vulnerabilities, performance, and adherence to best practices.", defaultSkills: ["code-review", "security-audit", "performance-optimization"], defaultTemperature: 0.4 },
    { categorySlug: "tech-dev", industrySlug: "technology", slug: "architect", name: "System Architect", description: "Designs scalable software architectures", systemPromptTemplate: "You are a system architect who designs scalable, maintainable software systems. Consider trade-offs between different architectural patterns.", defaultSkills: ["system-design", "scalability", "architecture-patterns"], defaultTemperature: 0.5 },
    { categorySlug: "tech-data", industrySlug: "technology", slug: "data-scientist", name: "Data Scientist", description: "Analyzes data and builds ML models", systemPromptTemplate: "You are a data scientist who specializes in statistical analysis, machine learning, and data visualization. Provide clear methodology explanations.", defaultSkills: ["statistical-analysis", "ml-modeling", "data-visualization"], defaultTemperature: 0.5 },
    { categorySlug: "tech-security", industrySlug: "technology", slug: "security-analyst", name: "Security Analyst", description: "Identifies vulnerabilities and security threats", systemPromptTemplate: "You are a cybersecurity analyst who identifies vulnerabilities, assesses threats, and recommends security measures. Follow OWASP and NIST frameworks.", defaultSkills: ["vulnerability-assessment", "threat-modeling", "incident-response"], defaultTemperature: 0.3 },
    { categorySlug: "mkt-content", industrySlug: "marketing", slug: "content-strategist", name: "Content Strategist", description: "Plans and creates content marketing strategies", systemPromptTemplate: "You are a content marketing strategist. Create compelling content strategies, editorial calendars, and audience-targeted messaging.", defaultSkills: ["content-planning", "audience-analysis", "copywriting"], defaultTemperature: 0.7 },
    { categorySlug: "mkt-seo", industrySlug: "marketing", slug: "seo-specialist", name: "SEO Specialist", description: "Optimizes content for search engines", systemPromptTemplate: "You are an SEO specialist. Provide actionable recommendations for improving search rankings, keyword strategy, and content optimization.", defaultSkills: ["keyword-research", "on-page-seo", "link-building"], defaultTemperature: 0.5 },
    { categorySlug: "mkt-social", industrySlug: "marketing", slug: "social-media-manager", name: "Social Media Manager", description: "Manages social media presence and campaigns", systemPromptTemplate: "You are a social media manager. Create engaging posts, develop platform strategies, and analyze social metrics.", defaultSkills: ["social-strategy", "content-creation", "analytics"], defaultTemperature: 0.7 },
    { categorySlug: "edu-tutoring", industrySlug: "education", slug: "tutor", name: "AI Tutor", description: "Provides personalized tutoring and explanations", systemPromptTemplate: "You are a patient, encouraging AI tutor. Break down complex concepts into digestible explanations. Adapt your teaching style to the student.", defaultSkills: ["adaptive-teaching", "concept-explanation", "practice-generation"], defaultTemperature: 0.6 },
    { categorySlug: "edu-curriculum", industrySlug: "education", slug: "curriculum-designer", name: "Curriculum Designer", description: "Creates structured learning programs", systemPromptTemplate: "You are a curriculum designer. Create structured learning paths with clear objectives, assessments, and engaging activities.", defaultSkills: ["learning-design", "assessment-creation", "content-sequencing"], defaultTemperature: 0.5 },
    { categorySlug: "ec-support", industrySlug: "ecommerce", slug: "support-agent", name: "Customer Support Agent", description: "Handles customer inquiries and issues", systemPromptTemplate: "You are a professional customer support agent. Be helpful, empathetic, and solution-oriented. Resolve issues efficiently.", defaultSkills: ["issue-resolution", "product-knowledge", "communication"], defaultTemperature: 0.5 },
    { categorySlug: "media-writing", industrySlug: "media", slug: "writer", name: "Content Writer", description: "Creates articles, blogs, and written content", systemPromptTemplate: "You are a professional content writer. Create engaging, well-structured content with clear narratives and strong hooks.", defaultSkills: ["creative-writing", "editing", "storytelling"], defaultTemperature: 0.8 },
    { categorySlug: "hr-recruiting", industrySlug: "hr", slug: "recruiter", name: "AI Recruiter", description: "Screens candidates and manages hiring pipelines", systemPromptTemplate: "You are a talent acquisition specialist. Screen candidates objectively, identify key qualifications, and provide hiring recommendations.", defaultSkills: ["candidate-screening", "interview-design", "talent-assessment"], defaultTemperature: 0.5 },
  ]);

  await db.insert(knowledgePacks).values([
    { industrySlug: "finance", slug: "kp-sec-regulations", name: "SEC Regulations Pack", description: "Key SEC compliance rules and guidelines", contentSummary: "Covers Regulation D, Regulation S, SOX compliance, insider trading rules", sourceCount: 12, creditCost: 50, featured: true },
    { industrySlug: "finance", slug: "kp-market-fundamentals", name: "Market Fundamentals", description: "Core financial analysis and valuation methods", contentSummary: "DCF analysis, P/E ratios, technical indicators, market cycles", sourceCount: 8, creditCost: 30 },
    { industrySlug: "finance", slug: "kp-crypto-defi", name: "Crypto & DeFi Essentials", description: "Blockchain technology and DeFi protocol knowledge", contentSummary: "Smart contracts, liquidity pools, yield farming, tokenomics models", sourceCount: 10, creditCost: 40 },
    { industrySlug: "healthcare", slug: "kp-clinical-guidelines", name: "Clinical Guidelines Pack", description: "Evidence-based clinical practice guidelines", contentSummary: "WHO guidelines, CDC recommendations, drug interaction databases", sourceCount: 15, creditCost: 60, featured: true },
    { industrySlug: "healthcare", slug: "kp-medical-terminology", name: "Medical Terminology", description: "Comprehensive medical vocabulary and terminology", contentSummary: "ICD-10 codes, medical abbreviations, anatomy terms", sourceCount: 6, creditCost: 20 },
    { industrySlug: "legal", slug: "kp-contract-law", name: "Contract Law Essentials", description: "Core contract law principles and clause templates", contentSummary: "UCC provisions, common clauses, boilerplate analysis, liability frameworks", sourceCount: 10, creditCost: 45, featured: true },
    { industrySlug: "legal", slug: "kp-ip-law", name: "IP Law Fundamentals", description: "Patent, trademark, and copyright law basics", contentSummary: "Patent prosecution, trademark classes, fair use doctrine", sourceCount: 8, creditCost: 35 },
    { industrySlug: "technology", slug: "kp-system-design", name: "System Design Patterns", description: "Modern software architecture and design patterns", contentSummary: "Microservices, event-driven architecture, CQRS, distributed systems", sourceCount: 12, creditCost: 40, featured: true },
    { industrySlug: "technology", slug: "kp-security-frameworks", name: "Security Frameworks", description: "Cybersecurity frameworks and best practices", contentSummary: "OWASP Top 10, NIST framework, zero trust architecture", sourceCount: 10, creditCost: 35 },
    { industrySlug: "marketing", slug: "kp-seo-playbook", name: "SEO Playbook", description: "Complete SEO strategy and tactics", contentSummary: "Google algorithm updates, keyword strategies, content optimization, technical SEO", sourceCount: 8, creditCost: 30, featured: true },
    { industrySlug: "marketing", slug: "kp-social-strategy", name: "Social Media Strategy", description: "Platform-specific social media strategies", contentSummary: "Algorithm optimization, content calendars, engagement tactics", sourceCount: 6, creditCost: 25 },
    { industrySlug: "education", slug: "kp-pedagogy", name: "Modern Pedagogy", description: "Evidence-based teaching methods", contentSummary: "Bloom's taxonomy, active learning, differentiated instruction, formative assessment", sourceCount: 8, creditCost: 30, featured: true },
    { industrySlug: "ecommerce", slug: "kp-conversion", name: "Conversion Optimization", description: "E-commerce conversion rate optimization", contentSummary: "A/B testing, funnel optimization, UX best practices, cart abandonment", sourceCount: 7, creditCost: 25 },
    { industrySlug: "hr", slug: "kp-hiring-best", name: "Hiring Best Practices", description: "Structured hiring and assessment methods", contentSummary: "Behavioral interviews, skills assessments, bias reduction, onboarding frameworks", sourceCount: 6, creditCost: 20, featured: true },
  ]);

  const skillNodeValues = [
    ...generateSkillTree("finance", [
      { tier: 1, slug: "fin-fundamentals", name: "Financial Fundamentals", desc: "Core financial analysis skills", xp: 50, level: 1, effect: "boost", key: "accuracy", val: 1.05 },
      { tier: 1, slug: "fin-data-reading", name: "Data Reading", desc: "Parse financial reports and statements", xp: 75, level: 1, effect: "boost", key: "speed", val: 1.1 },
      { tier: 2, slug: "fin-risk-assessment", name: "Risk Assessment", desc: "Advanced risk modeling", xp: 150, level: 3, effect: "boost", key: "accuracy", val: 1.1, prereqs: ["fin-fundamentals"] },
      { tier: 2, slug: "fin-market-prediction", name: "Market Prediction", desc: "Trend forecasting models", xp: 200, level: 4, effect: "boost", key: "creativity", val: 1.15, prereqs: ["fin-data-reading"] },
      { tier: 3, slug: "fin-portfolio-master", name: "Portfolio Mastery", desc: "Expert portfolio optimization", xp: 400, level: 7, effect: "boost", key: "accuracy", val: 1.2, prereqs: ["fin-risk-assessment", "fin-market-prediction"], credits: 50 },
      { tier: 4, slug: "fin-quant-strategist", name: "Quant Strategist", desc: "Quantitative strategy development", xp: 800, level: 10, effect: "unlock", key: "quant_mode", val: 1, prereqs: ["fin-portfolio-master"], credits: 100 },
    ]),
    ...generateSkillTree("healthcare", [
      { tier: 1, slug: "hc-medical-vocab", name: "Medical Vocabulary", desc: "Precise medical terminology", xp: 50, level: 1, effect: "boost", key: "accuracy", val: 1.05 },
      { tier: 1, slug: "hc-patient-comm", name: "Patient Communication", desc: "Clear patient-friendly explanations", xp: 75, level: 1, effect: "boost", key: "empathy", val: 1.1 },
      { tier: 2, slug: "hc-evidence-based", name: "Evidence-Based Analysis", desc: "Clinical study evaluation", xp: 150, level: 3, effect: "boost", key: "accuracy", val: 1.1, prereqs: ["hc-medical-vocab"] },
      { tier: 2, slug: "hc-drug-knowledge", name: "Pharmacology", desc: "Drug interactions and effects", xp: 200, level: 4, effect: "boost", key: "safety", val: 1.15, prereqs: ["hc-medical-vocab"] },
      { tier: 3, slug: "hc-clinical-expert", name: "Clinical Expert", desc: "Advanced clinical decision support", xp: 400, level: 7, effect: "boost", key: "accuracy", val: 1.2, prereqs: ["hc-evidence-based", "hc-drug-knowledge"], credits: 50 },
      { tier: 4, slug: "hc-research-master", name: "Research Master", desc: "Advanced research methodology", xp: 800, level: 10, effect: "unlock", key: "research_mode", val: 1, prereqs: ["hc-clinical-expert"], credits: 100 },
    ]),
    ...generateSkillTree("legal", [
      { tier: 1, slug: "legal-terminology", name: "Legal Terminology", desc: "Precise legal language", xp: 50, level: 1, effect: "boost", key: "accuracy", val: 1.05 },
      { tier: 1, slug: "legal-research", name: "Legal Research", desc: "Case law and statute research", xp: 75, level: 1, effect: "boost", key: "thoroughness", val: 1.1 },
      { tier: 2, slug: "legal-contract-mastery", name: "Contract Mastery", desc: "Advanced contract analysis", xp: 200, level: 4, effect: "boost", key: "accuracy", val: 1.15, prereqs: ["legal-terminology", "legal-research"] },
      { tier: 3, slug: "legal-risk-counsel", name: "Risk Counsel", desc: "Strategic risk assessment", xp: 400, level: 7, effect: "boost", key: "strategic", val: 1.2, prereqs: ["legal-contract-mastery"], credits: 50 },
      { tier: 4, slug: "legal-expert-witness", name: "Expert Analysis", desc: "Expert-level legal reasoning", xp: 800, level: 10, effect: "unlock", key: "expert_mode", val: 1, prereqs: ["legal-risk-counsel"], credits: 100 },
    ]),
    ...generateSkillTree("technology", [
      { tier: 1, slug: "tech-code-quality", name: "Code Quality", desc: "Clean code and best practices", xp: 50, level: 1, effect: "boost", key: "accuracy", val: 1.05 },
      { tier: 1, slug: "tech-debugging", name: "Debugging", desc: "Systematic debugging approach", xp: 75, level: 1, effect: "boost", key: "speed", val: 1.1 },
      { tier: 2, slug: "tech-architecture", name: "Architecture", desc: "System design patterns", xp: 150, level: 3, effect: "boost", key: "creativity", val: 1.1, prereqs: ["tech-code-quality"] },
      { tier: 2, slug: "tech-security", name: "Security Focus", desc: "Security-first development", xp: 200, level: 4, effect: "boost", key: "safety", val: 1.15, prereqs: ["tech-debugging"] },
      { tier: 3, slug: "tech-full-stack", name: "Full-Stack Mastery", desc: "Complete system expertise", xp: 400, level: 7, effect: "boost", key: "versatility", val: 1.2, prereqs: ["tech-architecture", "tech-security"], credits: 50 },
      { tier: 4, slug: "tech-principal", name: "Principal Engineer", desc: "Technical leadership abilities", xp: 800, level: 10, effect: "unlock", key: "leadership_mode", val: 1, prereqs: ["tech-full-stack"], credits: 100 },
    ]),
    ...generateSkillTree("marketing", [
      { tier: 1, slug: "mkt-copywriting", name: "Copywriting", desc: "Persuasive writing skills", xp: 50, level: 1, effect: "boost", key: "creativity", val: 1.1 },
      { tier: 1, slug: "mkt-analytics", name: "Analytics", desc: "Marketing metrics analysis", xp: 75, level: 1, effect: "boost", key: "accuracy", val: 1.05 },
      { tier: 2, slug: "mkt-growth-hacking", name: "Growth Hacking", desc: "Creative growth strategies", xp: 200, level: 4, effect: "boost", key: "creativity", val: 1.15, prereqs: ["mkt-copywriting", "mkt-analytics"] },
      { tier: 3, slug: "mkt-brand-master", name: "Brand Mastery", desc: "Strategic brand development", xp: 400, level: 7, effect: "boost", key: "strategic", val: 1.2, prereqs: ["mkt-growth-hacking"], credits: 50 },
      { tier: 4, slug: "mkt-cmo-level", name: "CMO-Level Strategy", desc: "Executive marketing leadership", xp: 800, level: 10, effect: "unlock", key: "executive_mode", val: 1, prereqs: ["mkt-brand-master"], credits: 100 },
    ]),
    ...generateSkillTree("education", [
      { tier: 1, slug: "edu-clarity", name: "Clarity", desc: "Clear and simple explanations", xp: 50, level: 1, effect: "boost", key: "empathy", val: 1.1 },
      { tier: 1, slug: "edu-engagement", name: "Engagement", desc: "Interactive teaching methods", xp: 75, level: 1, effect: "boost", key: "creativity", val: 1.1 },
      { tier: 2, slug: "edu-adaptive", name: "Adaptive Teaching", desc: "Personalized learning paths", xp: 200, level: 4, effect: "boost", key: "accuracy", val: 1.15, prereqs: ["edu-clarity", "edu-engagement"] },
      { tier: 3, slug: "edu-master-teacher", name: "Master Teacher", desc: "Expert pedagogical skills", xp: 400, level: 7, effect: "boost", key: "empathy", val: 1.2, prereqs: ["edu-adaptive"], credits: 50 },
    ]),
  ];

  await db.insert(agentSkillNodes).values(skillNodeValues);

  console.log("[IndustrySeed] Seeded industries, categories, roles, knowledge packs, and skill trees");
}

interface SkillDef {
  tier: number;
  slug: string;
  name: string;
  desc: string;
  xp: number;
  level: number;
  effect: string;
  key: string;
  val: number;
  prereqs?: string[];
  credits?: number;
}

function generateSkillTree(industrySlug: string, skills: SkillDef[]) {
  return skills.map((s, i) => ({
    industrySlug,
    treeTier: s.tier,
    slug: s.slug,
    name: s.name,
    description: s.desc,
    xpCost: s.xp,
    creditCost: s.credits || 0,
    levelRequired: s.level,
    prerequisiteSlugs: s.prereqs || [],
    effectType: s.effect,
    effectKey: s.key,
    effectValue: s.val,
    sortOrder: i + 1,
  }));
}
