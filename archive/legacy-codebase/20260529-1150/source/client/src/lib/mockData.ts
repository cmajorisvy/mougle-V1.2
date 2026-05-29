export const aiInsights = {
  summary: "Discussions today are heavily focused on LLM efficiency and quantum error correction breakthroughs. Sentiment is cautiously optimistic across AI Research and Science topics.",
  factCheck: {
    status: "verified",
    label: "Verified",
    details: "Multiple sources confirm the MoE leak aligns with recent patent filings."
  },
  relatedTopics: ["Transformer Architecture", "Qubit Stability", "NVIDIA H200"]
};

export const chartData = [
  { name: "Mon", github: 120, funding: 80 },
  { name: "Tue", github: 180, funding: 110 },
  { name: "Wed", github: 150, funding: 140 },
  { name: "Thu", github: 240, funding: 170 },
  { name: "Fri", github: 210, funding: 190 },
  { name: "Sat", github: 260, funding: 160 },
  { name: "Sun", github: 310, funding: 220 },
];

export const articles = [
  {
    id: "agentic-market-map",
    slug: "agentic-market-map",
    title: "Agentic Market Map Signals A Shift In Applied AI",
    excerpt: "Autonomous agents are moving from demos into narrow, revenue-linked workflows where evaluation and trust matter more than novelty.",
    image: "/hero-bg.png",
    category: "AI Research",
    date: "Apr 30, 2026",
    readTime: "6 min read",
    tags: ["agents", "markets", "trust"],
    signal_score: 87,
    content: {
      summary: "Agent adoption is concentrating around measurable business workflows rather than broad assistant experiences.",
      executive_analysis: "The strongest signal is a move from generic assistants toward accountable agent workflows with explicit cost, quality, and trust constraints.",
      technical_breakdown: "Teams are combining retrieval, task routing, evaluation logs, and human review loops instead of relying on a single unconstrained model call.",
      market_implications: "Platforms that expose measurable agent performance and buyer trust signals are positioned better than tools that only showcase generation quality.",
      forward_outlook: "Expect consolidation around agent marketplaces, vertical workflow copilots, and governance tools for cost and reliability.",
      competitive_landscape: "The market is splitting between infrastructure providers, workflow-specific products, and marketplaces that package reusable agent capabilities.",
    },
  },
  {
    id: "trust-inference-stack",
    slug: "trust-inference-stack",
    title: "Trust Infrastructure Becomes The AI Platform Layer",
    excerpt: "Reputation, provenance, moderation, and audit trails are becoming core platform primitives for human-AI networks.",
    image: "/opengraph.jpg",
    category: "Trust Systems",
    date: "Apr 29, 2026",
    readTime: "5 min read",
    tags: ["trust", "governance", "safety"],
    signal_score: 82,
    content: {
      summary: "Trust layers are becoming essential for platforms that coordinate human and AI participants.",
      executive_analysis: "The defensible layer is shifting toward verified identity, provenance, policy enforcement, and transparent performance histories.",
      technical_breakdown: "A trust stack typically combines identity state, action logs, risk scoring, moderation records, permission scopes, and domain-specific review workflows.",
      market_implications: "Products with durable trust signals can support higher-value marketplaces and more autonomous workflows.",
      forward_outlook: "Trust, compliance, and cost controls will likely become default features in serious agent platforms.",
      competitive_landscape: "Early platforms compete on model quality, but mature platforms compete on reliability, auditability, and participant accountability.",
    },
  },
];

export function getCurrentUserId(): string | null {
  if (typeof window === "undefined") return null;
  // Transitional compatibility only. Session is the source of truth.
  return (window as any).__mougleUserId ?? null;
}

export function setCurrentUserId(id: string): void {
  if (typeof window === "undefined") return;
  // Transitional compatibility only. Session is the source of truth.
  (window as any).__mougleUserId = id;
}
