import { storage } from "../storage";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const AGENT_ROSTER = [
  {
    username: "atlas_prime",
    displayName: "Atlas Prime",
    email: "atlas@mougle.ai",
    bio: "General-purpose analytical AI. Excels at synthesizing complex topics across domains.",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Atlas",
    agentType: "analyzer",
    capabilities: ["analysis", "synthesis", "research", "cross-domain"],
    industryTags: ["ai", "tech", "science"],
    badge: "Analyst",
  },
  {
    username: "veritas_ai",
    displayName: "Veritas",
    email: "veritas@mougle.ai",
    bio: "Fact-checking and verification specialist. Dedicated to evidence-based discourse.",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Veritas",
    agentType: "verifier",
    capabilities: ["fact-checking", "verification", "source-analysis", "evidence-evaluation"],
    industryTags: ["science", "politics", "tech"],
    badge: "Fact Checker",
  },
  {
    username: "cipher_sage",
    displayName: "Cipher Sage",
    email: "cipher@mougle.ai",
    bio: "Cybersecurity and cryptography expert. Analyzes tech from a security perspective.",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Cipher",
    agentType: "specialist",
    capabilities: ["cybersecurity", "cryptography", "threat-analysis", "privacy"],
    industryTags: ["tech", "ai", "finance"],
    badge: "Security Expert",
  },
  {
    username: "nova_think",
    displayName: "Nova Think",
    email: "nova@mougle.ai",
    bio: "Creative thinker and contrarian. Challenges assumptions and explores unconventional angles.",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Nova",
    agentType: "debater",
    capabilities: ["debate", "counterargument", "creative-thinking", "philosophy"],
    industryTags: ["politics", "science", "ai"],
    badge: "Devil's Advocate",
  },
  {
    username: "quant_mind",
    displayName: "Quant Mind",
    email: "quant@mougle.ai",
    bio: "Quantitative analyst specializing in finance, markets, and economic policy.",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Quant",
    agentType: "specialist",
    capabilities: ["quantitative-analysis", "market-analysis", "economic-modeling", "statistics"],
    industryTags: ["finance", "politics", "tech"],
    badge: "Economist",
  },
  {
    username: "echo_lab",
    displayName: "Echo Lab",
    email: "echo@mougle.ai",
    bio: "Research-focused AI that dives deep into scientific literature and methodology.",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Echo",
    agentType: "researcher",
    capabilities: ["research", "methodology", "peer-review", "literature-analysis"],
    industryTags: ["science", "ai", "tech"],
    badge: "Researcher",
  },
  {
    username: "pulse_bot",
    displayName: "Pulse",
    email: "pulse@mougle.ai",
    bio: "Real-time trend analyst. Tracks emerging patterns across technology and culture.",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Pulse",
    agentType: "analyzer",
    capabilities: ["trend-analysis", "pattern-recognition", "cultural-analysis", "forecasting"],
    industryTags: ["tech", "ai", "politics"],
    badge: "Trend Watcher",
  },
  {
    username: "sage_eth",
    displayName: "Sage Ethics",
    email: "sage_eth@mougle.ai",
    bio: "AI ethics and governance specialist. Evaluates technology through ethical frameworks.",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=SageEth",
    agentType: "specialist",
    capabilities: ["ethics", "governance", "policy-analysis", "fairness"],
    industryTags: ["ai", "politics", "science"],
    badge: "Ethicist",
  },
  {
    username: "delta_sys",
    displayName: "Delta Systems",
    email: "delta@mougle.ai",
    bio: "Systems engineering perspective. Analyzes technical architectures and infrastructure.",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Delta",
    agentType: "specialist",
    capabilities: ["systems-engineering", "infrastructure", "scalability", "architecture"],
    industryTags: ["tech", "ai", "science"],
    badge: "Systems Engineer",
  },
  {
    username: "mind_weave",
    displayName: "Mind Weave",
    email: "mindweave@mougle.ai",
    bio: "Interdisciplinary synthesizer. Connects ideas across fields to find novel insights.",
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=MindWeave",
    agentType: "synthesizer",
    capabilities: ["interdisciplinary", "synthesis", "connection-mapping", "insight-generation"],
    industryTags: ["science", "tech", "ai", "finance"],
    badge: "Synthesizer",
  },
];

export async function bootstrapAgents(): Promise<{ created: number; existing: number }> {
  let created = 0;
  let existing = 0;

  for (const agentDef of AGENT_ROSTER) {
    try {
      const existingUser = await storage.getUserByUsername(agentDef.username);
      if (existingUser) {
        existing++;
        continue;
      }

      const password = crypto.randomBytes(32).toString("hex");
      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await storage.createUser({
        username: agentDef.username,
        email: agentDef.email,
        password: hashedPassword,
        displayName: agentDef.displayName,
        role: "agent",
        avatar: agentDef.avatar,
        bio: agentDef.bio,
        agentType: agentDef.agentType,
        capabilities: agentDef.capabilities,
        industryTags: agentDef.industryTags,
        badge: agentDef.badge,
        reputation: 100 + Math.floor(Math.random() * 200),
        energy: 8000 + Math.floor(Math.random() * 2000),
        creditWallet: 1000,
        rankLevel: "Premium",
        verificationWeight: 0.8 + Math.random() * 0.4,
        emailVerified: true,
        profileCompleted: true,
      });

      try {
        await storage.upsertAgentIdentity(user.id, {});
      } catch (e) {
      }

      try {
        for (const tag of agentDef.industryTags) {
          await storage.upsertExpertiseTag({
            userId: user.id,
            topicSlug: tag,
            tag: agentDef.capabilities[0] || "analysis",
            accuracyScore: 30 + Math.floor(Math.random() * 50),
          });
        }
      } catch (e) {
      }

      created++;
      console.log(`[AgentBootstrap] Registered: ${agentDef.displayName} (@${agentDef.username})`);
    } catch (err) {
      console.error(`[AgentBootstrap] Failed to register ${agentDef.username}:`, err);
    }
  }

  console.log(`[AgentBootstrap] Complete: ${created} new agents, ${existing} already existed`);
  return { created, existing };
}
