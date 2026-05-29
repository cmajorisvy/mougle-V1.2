import OpenAI from "openai";
import crypto from "crypto";
import { storage } from "../storage";
import type { PersonalAgentMemory } from "@shared/schema";
import { truthEvolutionService } from "./truth-evolution-service";

const MEMORY_DOMAINS = ["personal", "work", "study", "home", "finance", "conversation"] as const;

const DAILY_MESSAGE_LIMIT = 50;
const DAILY_VOICE_LIMIT = 10;
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

function getClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
  });
}

function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

function encrypt(text: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

function decrypt(encryptedText: string, keyHex: string): string {
  try {
    const key = Buffer.from(keyHex, "hex");
    const [ivHex, authTagHex, encrypted] = encryptedText.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return encryptedText;
  }
}

function getDateKey(): string {
  return new Date().toISOString().split("T")[0];
}

class PersonalAgentService {
  async isProUser(userId: string): Promise<boolean> {
    const user = await storage.getUser(userId);
    if (!user) return false;
    const subs = await storage.getUserSubscription?.(userId);
    if (subs && subs.status === "active") return true;
    const proRanks = ["Premium", "VIP", "VVIP", "Elite", "Legend"];
    return proRanks.includes((user as any).rankLevel || "");
  }

  async getOrCreateProfile(userId: string) {
    let profile = await storage.getPersonalAgentProfile(userId);
    if (!profile) {
      profile = await storage.createPersonalAgentProfile({
        userId,
        agentName: "My AI Assistant",
        voicePreference: "alloy",
        dailyMessageLimit: DAILY_MESSAGE_LIMIT,
        dailyMessagesUsed: 0,
        dailyVoiceLimit: DAILY_VOICE_LIMIT,
        dailyVoiceUsed: 0,
        encryptionKey: generateEncryptionKey(),
        isActive: true,
        preferences: {},
      });
    }
    const today = getDateKey();
    if (profile.lastResetDate !== today) {
      profile = await storage.updatePersonalAgentProfile(userId, {
        dailyMessagesUsed: 0,
        dailyVoiceUsed: 0,
        lastResetDate: today,
      });
    }
    return profile;
  }

  async checkDailyLimit(userId: string, type: "message" | "voice"): Promise<{ allowed: boolean; remaining: number }> {
    const profile = await this.getOrCreateProfile(userId);
    if (type === "message") {
      const remaining = profile.dailyMessageLimit - profile.dailyMessagesUsed;
      return { allowed: remaining > 0, remaining: Math.max(0, remaining) };
    }
    const remaining = profile.dailyVoiceLimit - profile.dailyVoiceUsed;
    return { allowed: remaining > 0, remaining: Math.max(0, remaining) };
  }

  private async incrementUsage(userId: string, type: "message" | "voice") {
    const profile = await this.getOrCreateProfile(userId);
    if (type === "message") {
      await storage.updatePersonalAgentProfile(userId, { dailyMessagesUsed: profile.dailyMessagesUsed + 1 });
    } else {
      await storage.updatePersonalAgentProfile(userId, { dailyVoiceUsed: profile.dailyVoiceUsed + 1 });
    }
    await storage.createPersonalAgentUsage({
      userId,
      actionType: type,
      creditsUsed: type === "voice" ? 3 : 1,
      dateKey: getDateKey(),
    });
  }

  async chat(userId: string, conversationId: string, userMessage: string): Promise<{ reply: string; memorySuggestions: any[]; truthMetrics?: any }> {
    const limit = await this.checkDailyLimit(userId, "message");
    if (!limit.allowed) throw { status: 429, message: `Daily message limit reached. Resets tomorrow. (${limit.remaining} remaining)` };

    const profile = await this.getOrCreateProfile(userId);
    const messages = await storage.getPersonalAgentMessages(conversationId);
    const confirmedMemories = await storage.getConfirmedMemories(userId);

    const agentId = `personal-${userId}`;

    const truthMemories = await truthEvolutionService.getAgentMemories(agentId, { limit: 30 }).catch(() => []);

    const decryptedMemories = confirmedMemories.slice(0, 20).map(m => {
      const content = m.encrypted ? decrypt(m.content, profile.encryptionKey) : m.content;
      return `[${m.domain}] ${content}`;
    });

    const truthContext = truthMemories
      .filter(tm => tm.confidenceScore >= 0.3)
      .map(tm => {
        const weight = truthEvolutionService.getConfidenceWeight(tm.confidenceScore);
        const reliability = tm.confidenceScore >= 0.8 ? "HIGH" : tm.confidenceScore >= 0.5 ? "MEDIUM" : "LOW";
        return `[${tm.truthType}|${reliability}|w:${weight}] ${tm.content}`;
      });

    await storage.createPersonalAgentMessage({
      conversationId,
      userId,
      role: "user",
      content: userMessage,
      isVoice: false,
    });

    const contextMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are ${profile.agentName}, a personal AI assistant for a Pro user on Mougle. You help with personal, professional, educational, and home automation tasks.

You evolve through Truth-Anchored Evolution: your knowledge is classified by truth type and weighted by factual confidence. You prioritize high-confidence knowledge and flag uncertain claims.

Personal memories:
${decryptedMemories.length > 0 ? decryptedMemories.join("\n") : "No memories stored yet."}

${truthContext.length > 0 ? `Truth-anchored knowledge (weighted by confidence):
${truthContext.join("\n")}` : ""}

Guidelines:
- Be helpful, concise, and proactive
- When stating facts, indicate your confidence level (high/medium/low)
- If you detect a contradiction with existing knowledge, flag it clearly
- If new evidence supports or contradicts a previous statement, mention it
- Suggest creating reminders or tasks when appropriate
- If you learn something new about the user, suggest saving it as a memory
- For factual claims, suggest truth classification

End your response with a JSON block for memory and truth operations:
<!--AGENT_OPS:{"memorySuggestions": [{"domain": "personal|work|study|home|finance|conversation", "content": "what to remember", "importance": 1-10}], "truthOps": [{"op": "create|evidence|contradict|correct", "content": "the factual content", "truthType": "personal_truth|objective_fact|contextual_interpretation", "memoryId": "optional-existing-id", "source": "optional-source"}]}-->`,
      },
    ];

    const recentMessages = messages.slice(-20);
    for (const msg of recentMessages) {
      contextMessages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }
    contextMessages.push({ role: "user", content: userMessage });

    const client = getClient();
    const completion = await client.chat.completions.create({
      model: "gpt-5.5",
      messages: contextMessages,
      max_tokens: 1000,
      temperature: 0.7,
    });

    const fullReply = completion.choices[0]?.message?.content || "I'm sorry, I couldn't process that.";

    let reply = fullReply;
    let memorySuggestions: any[] = [];
    let truthOps: any[] = [];

    const opsMatch = fullReply.match(/<!--AGENT_OPS:([\s\S]*?)-->/);
    const legacyMatch = fullReply.match(/<!--MEMORY_SUGGESTIONS:([\s\S]*?)-->/);

    if (opsMatch) {
      reply = fullReply.replace(/<!--AGENT_OPS:[\s\S]*?-->/, "").trim();
      try {
        const parsed = JSON.parse(opsMatch[1]);
        memorySuggestions = parsed.memorySuggestions || [];
        truthOps = parsed.truthOps || [];
      } catch {}
    } else if (legacyMatch) {
      reply = fullReply.replace(/<!--MEMORY_SUGGESTIONS:[\s\S]*?-->/, "").trim();
      try {
        const parsed = JSON.parse(legacyMatch[1]);
        memorySuggestions = parsed.memorySuggestions || [];
      } catch {}
    }

    reply = reply
      .replace(/<!--AGENT_OPS:[\s\S]*?-->/g, "")
      .replace(/<!--MEMORY_SUGGESTIONS:[\s\S]*?-->/g, "")
      .replace(/<!--AGENT_OPS:[\s\S]*$/g, "")
      .replace(/<!--MEMORY_SUGGESTIONS:[\s\S]*$/g, "")
      .replace(/<!\-\-AGENT_OPS[\s\S]*/g, "")
      .trim();

    await storage.createPersonalAgentMessage({
      conversationId,
      userId,
      role: "assistant",
      content: reply,
      isVoice: false,
    });

    for (const suggestion of memorySuggestions) {
      const domain = MEMORY_DOMAINS.includes(suggestion.domain) ? suggestion.domain : "conversation";
      await storage.createPersonalAgentMemory({
        userId,
        domain,
        content: encrypt(suggestion.content, profile.encryptionKey),
        tags: [],
        importance: suggestion.importance || 5,
        confirmed: false,
        encrypted: true,
      });

      const truthType = truthEvolutionService.classifyTruth(suggestion.content, {
        isPersonal: domain === "personal" || domain === "conversation",
        hasSource: false,
      });
      await truthEvolutionService.createMemory({
        agentId,
        userId,
        content: suggestion.content,
        truthType,
        confidenceScore: truthType === "objective_fact" ? 0.5 : 0.7,
        sources: [],
      }).catch(err => console.error("[TruthEvolution] Failed to create truth memory:", err));
    }

    for (const op of truthOps) {
      try {
        switch (op.op) {
          case "create":
            await truthEvolutionService.createMemory({
              agentId,
              userId,
              content: op.content,
              truthType: op.truthType || truthEvolutionService.classifyTruth(op.content),
              confidenceScore: op.truthType === "objective_fact" ? 0.5 : 0.7,
              sources: op.source ? [op.source] : [],
            });
            break;
          case "evidence":
            if (op.memoryId) {
              await truthEvolutionService.addEvidence(op.memoryId, op.source || op.content);
            }
            break;
          case "contradict":
            if (op.memoryId) {
              await truthEvolutionService.recordContradiction(op.memoryId, op.content);
            } else {
              await this.detectAndRecordContradictions(agentId, op.content);
            }
            break;
          case "correct":
            if (op.memoryId) {
              await truthEvolutionService.correctFact(op.memoryId, op.content);
            }
            break;
        }
      } catch (err) {
        console.error(`[TruthEvolution] Failed truth op ${op.op}:`, err);
      }
    }

    await this.autoDetectTruthSignals(agentId, userId, userMessage, reply);

    await this.incrementUsage(userId, "message");

    const agentTruthMetrics = await this.getAgentTruthMetrics(agentId);

    return { reply, memorySuggestions, truthMetrics: agentTruthMetrics };
  }

  private async detectAndRecordContradictions(agentId: string, content: string): Promise<void> {
    const existing = await truthEvolutionService.getAgentMemories(agentId, { limit: 50 });
    for (const mem of existing) {
      if (mem.truthType === "objective_fact" && mem.confidenceScore >= 0.3) {
        const contentWords = content.toLowerCase().split(/\s+/);
        const memWords = mem.content.toLowerCase().split(/\s+/);
        const overlap = contentWords.filter(w => w.length > 4 && memWords.includes(w));
        if (overlap.length >= 3) {
          await truthEvolutionService.recordContradiction(mem.id, content);
          break;
        }
      }
    }
  }

  private async autoDetectTruthSignals(agentId: string, userId: string, userMessage: string, agentReply: string): Promise<void> {
    const evidenceIndicators = /\b(actually|research shows|according to|studies found|data shows|source:|citing|reference:)\b/i;
    const correctionIndicators = /\b(that's wrong|incorrect|not true|actually it's|correction:|the correct|in fact)\b/i;

    if (correctionIndicators.test(userMessage)) {
      const existing = await truthEvolutionService.getAgentMemories(agentId, { limit: 20 });
      const replyWords = agentReply.toLowerCase().split(/\s+/);
      for (const mem of existing) {
        const memWords = mem.content.toLowerCase().split(/\s+/);
        const overlap = replyWords.filter(w => w.length > 4 && memWords.includes(w));
        if (overlap.length >= 2) {
          await truthEvolutionService.recordContradiction(mem.id, userMessage);
          break;
        }
      }
    }

    if (evidenceIndicators.test(userMessage)) {
      const factContent = userMessage.replace(evidenceIndicators, "").trim();
      if (factContent.length > 10) {
        await truthEvolutionService.createMemory({
          agentId,
          userId,
          content: factContent,
          truthType: "objective_fact",
          confidenceScore: 0.6,
          sources: ["user_provided"],
        }).catch(() => {});
      }
    }
  }

  async getAgentTruthMetrics(agentId: string) {
    const memories = await truthEvolutionService.getAgentMemories(agentId, { limit: 100 }).catch(() => []);
    if (memories.length === 0) return { totalTruthMemories: 0, avgConfidence: 0, distribution: { personal_truth: 0, objective_fact: 0, contextual_interpretation: 0 }, highConfidenceCount: 0, factualReliability: 0 };

    const totalConfidence = memories.reduce((sum, m) => sum + m.confidenceScore, 0);
    const avgConfidence = totalConfidence / memories.length;
    const distribution = {
      personal_truth: memories.filter(m => m.truthType === "personal_truth").length,
      objective_fact: memories.filter(m => m.truthType === "objective_fact").length,
      contextual_interpretation: memories.filter(m => m.truthType === "contextual_interpretation").length,
    };
    const highConfidenceCount = memories.filter(m => m.confidenceScore >= 0.8).length;
    const factualReliability = memories.length > 0 ? highConfidenceCount / memories.length : 0;

    return { totalTruthMemories: memories.length, avgConfidence: Math.round(avgConfidence * 100) / 100, distribution, highConfidenceCount, factualReliability: Math.round(factualReliability * 100) / 100 };
  }

  async speechToText(userId: string, audioBuffer: Buffer): Promise<string> {
    const limit = await this.checkDailyLimit(userId, "voice");
    if (!limit.allowed) throw { status: 429, message: "Daily voice limit reached." };

    const client = getClient();
    const file = new File([audioBuffer], "audio.webm", { type: "audio/webm" });
    const transcription = await client.audio.transcriptions.create({
      model: "whisper-1",
      file,
    });
    return transcription.text;
  }

  async textToSpeech(userId: string, text: string, voice?: string): Promise<Buffer> {
    const profile = await this.getOrCreateProfile(userId);
    const client = getClient();
    const response = await client.audio.speech.create({
      model: "tts-1",
      voice: (voice || profile.voicePreference || "alloy") as any,
      input: text,
    });
    const arrayBuffer = await response.arrayBuffer();
    await this.incrementUsage(userId, "voice");
    return Buffer.from(arrayBuffer);
  }

  async voiceChat(userId: string, conversationId: string, audioBuffer: Buffer): Promise<{ reply: string; audioBuffer: Buffer; memorySuggestions: any[] }> {
    const transcription = await this.speechToText(userId, audioBuffer);
    const { reply, memorySuggestions } = await this.chat(userId, conversationId, transcription);
    const audioReply = await this.textToSpeech(userId, reply);
    return { reply, audioBuffer: audioReply, memorySuggestions };
  }

  async confirmMemory(userId: string, memoryId: string): Promise<PersonalAgentMemory> {
    return storage.updatePersonalAgentMemory(memoryId, { confirmed: true });
  }

  async dismissMemory(memoryId: string): Promise<void> {
    await storage.deletePersonalAgentMemory(memoryId);
  }

  async getMemories(userId: string, domain?: string) {
    const profile = await this.getOrCreateProfile(userId);
    const memories = await storage.getPersonalAgentMemories(userId, domain);
    return memories.map(m => ({
      ...m,
      content: m.encrypted ? decrypt(m.content, profile.encryptionKey) : m.content,
    }));
  }

  async addManualMemory(userId: string, domain: string, content: string, importance = 5) {
    const profile = await this.getOrCreateProfile(userId);
    const validDomain = MEMORY_DOMAINS.includes(domain as any) ? domain : "personal";
    const memory = await storage.createPersonalAgentMemory({
      userId,
      domain: validDomain,
      content: encrypt(content, profile.encryptionKey),
      tags: [],
      importance,
      confirmed: true,
      encrypted: true,
    });

    const agentId = `personal-${userId}`;
    const truthType = truthEvolutionService.classifyTruth(content, {
      isPersonal: validDomain === "personal" || validDomain === "conversation",
      hasSource: false,
    });
    await truthEvolutionService.createMemory({
      agentId,
      userId,
      content,
      truthType,
      confidenceScore: truthType === "objective_fact" ? 0.5 : 0.7,
      sources: ["manual_entry"],
    }).catch(err => console.error("[TruthEvolution] Failed to create truth memory for manual entry:", err));

    return memory;
  }

  async createConversation(userId: string, title?: string, domain?: string) {
    return storage.createPersonalAgentConversation({
      userId,
      title: title || "New Conversation",
      domain: domain || "general",
      isActive: true,
    });
  }

  async getConversations(userId: string) {
    return storage.getPersonalAgentConversations(userId);
  }

  async getMessages(conversationId: string) {
    return storage.getPersonalAgentMessages(conversationId);
  }

  async createTask(userId: string, data: { title: string; description?: string; category?: string; priority?: string; dueDate?: string; reminderAt?: string; recurrence?: string }) {
    return storage.createPersonalAgentTask({
      userId,
      title: data.title,
      description: data.description || null,
      category: data.category || "general",
      priority: data.priority || "medium",
      status: "pending",
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      reminderAt: data.reminderAt ? new Date(data.reminderAt) : null,
      recurrence: data.recurrence || null,
    });
  }

  async getTasks(userId: string, status?: string) {
    return storage.getPersonalAgentTasks(userId, status);
  }

  async updateTask(taskId: string, data: Partial<{ title: string; description: string; status: string; priority: string; dueDate: string; reminderAt: string }>) {
    const updateData: any = { ...data };
    if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
    if (data.reminderAt) updateData.reminderAt = new Date(data.reminderAt);
    if (data.status === "completed") updateData.completedAt = new Date();
    return storage.updatePersonalAgentTask(taskId, updateData);
  }

  async deleteTask(taskId: string) {
    return storage.deletePersonalAgentTask(taskId);
  }

  async getDueReminders(userId: string) {
    const tasks = await storage.getPersonalAgentTasks(userId, "pending");
    const now = new Date();
    return tasks.filter(t => t.reminderAt && new Date(t.reminderAt) <= now);
  }

  async addDevice(userId: string, data: { deviceName: string; deviceType: string; provider: string; connectionConfig?: string }) {
    const profile = await this.getOrCreateProfile(userId);
    return storage.createPersonalAgentDevice({
      userId,
      deviceName: data.deviceName,
      deviceType: data.deviceType,
      provider: data.provider,
      connectionConfig: data.connectionConfig ? encrypt(data.connectionConfig, profile.encryptionKey) : null,
      allowControl: false,
      status: "disconnected",
    });
  }

  async getDevices(userId: string) {
    return storage.getPersonalAgentDevices(userId);
  }

  async updateDevice(deviceId: string, data: Partial<{ allowControl: boolean; status: string; deviceName: string }>) {
    return storage.updatePersonalAgentDevice(deviceId, data);
  }

  async controlDevice(userId: string, deviceId: string, command: string): Promise<{ success: boolean; message: string }> {
    const devices = await storage.getPersonalAgentDevices(userId);
    const device = devices.find(d => d.id === deviceId);
    if (!device) throw { status: 404, message: "Device not found" };
    if (!device.allowControl) throw { status: 403, message: "Device control not permitted. Enable control first." };
    return { success: true, message: `Command '${command}' sent to ${device.deviceName}. (Simulated - connect real IoT API for actual control)` };
  }

  async removeDevice(deviceId: string) {
    return storage.deletePersonalAgentDevice(deviceId);
  }

  async addFinanceEntry(userId: string, data: { entryType: string; title: string; amount: number; currency?: string; dueDate?: string; recurring?: boolean; recurrencePattern?: string; notes?: string }) {
    return storage.createPersonalAgentFinance({
      userId,
      entryType: data.entryType,
      title: data.title,
      amount: data.amount,
      currency: data.currency || "USD",
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      recurring: data.recurring || false,
      recurrencePattern: data.recurrencePattern || null,
      status: "active",
      notes: data.notes || null,
    });
  }

  async getFinanceEntries(userId: string) {
    return storage.getPersonalAgentFinance(userId);
  }

  async updateFinanceEntry(entryId: string, data: Partial<{ title: string; amount: number; status: string; notes: string; dueDate: string }>) {
    const updateData: any = { ...data };
    if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
    return storage.updatePersonalAgentFinance(entryId, updateData);
  }

  async deleteFinanceEntry(entryId: string) {
    return storage.deletePersonalAgentFinance(entryId);
  }

  async getFinanceReminders(userId: string) {
    const entries = await storage.getPersonalAgentFinance(userId);
    const now = new Date();
    const upcoming = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return entries.filter(e => e.status === "active" && e.dueDate && new Date(e.dueDate) <= upcoming);
  }

  async exportAllData(userId: string) {
    const profile = await this.getOrCreateProfile(userId);
    const memories = await this.getMemories(userId);
    const conversations = await storage.getPersonalAgentConversations(userId);
    const allMessages: any[] = [];
    for (const conv of conversations) {
      const msgs = await storage.getPersonalAgentMessages(conv.id);
      allMessages.push({ conversation: conv, messages: msgs });
    }
    const tasks = await storage.getPersonalAgentTasks(userId);
    const devices = await storage.getPersonalAgentDevices(userId);
    const finance = await storage.getPersonalAgentFinance(userId);
    return { profile: { ...profile, encryptionKey: "[REDACTED]" }, memories, conversations: allMessages, tasks, devices, finance };
  }

  async deleteAllData(userId: string) {
    await storage.deleteAllPersonalAgentData(userId);
    return { success: true, message: "All personal agent data has been permanently deleted." };
  }

  async getDashboard(userId: string) {
    const profile = await this.getOrCreateProfile(userId);
    const memories = await storage.getPersonalAgentMemories(userId);
    const conversations = await storage.getPersonalAgentConversations(userId);
    const tasks = await storage.getPersonalAgentTasks(userId);
    const devices = await storage.getPersonalAgentDevices(userId);
    const finance = await storage.getPersonalAgentFinance(userId);
    const dueReminders = await this.getDueReminders(userId);
    const financeReminders = await this.getFinanceReminders(userId);

    const agentId = `personal-${userId}`;
    const truthMetrics = await this.getAgentTruthMetrics(agentId);
    const recentEvolution = await truthEvolutionService.getEvolutionHistory(agentId, 5).catch(() => []);

    return {
      profile: { ...profile, encryptionKey: undefined },
      stats: {
        totalMemories: memories.length,
        confirmedMemories: memories.filter(m => m.confirmed).length,
        pendingMemories: memories.filter(m => !m.confirmed).length,
        totalConversations: conversations.length,
        totalTasks: tasks.length,
        pendingTasks: tasks.filter(t => t.status === "pending").length,
        completedTasks: tasks.filter(t => t.status === "completed").length,
        totalDevices: devices.length,
        connectedDevices: devices.filter(d => d.status === "connected").length,
        totalFinanceEntries: finance.length,
        dueReminders: dueReminders.length,
        upcomingBills: financeReminders.length,
        messagesUsedToday: profile.dailyMessagesUsed,
        messagesRemaining: profile.dailyMessageLimit - profile.dailyMessagesUsed,
        voiceUsedToday: profile.dailyVoiceUsed,
        voiceRemaining: profile.dailyVoiceLimit - profile.dailyVoiceUsed,
      },
      memoryDomains: MEMORY_DOMAINS.map(d => ({
        domain: d,
        count: memories.filter(m => m.domain === d).length,
      })),
      truthEvolution: {
        ...truthMetrics,
        recentEvents: recentEvolution.map(e => ({
          id: e.id,
          eventType: e.eventType,
          description: e.description,
          previousConfidence: e.previousConfidence,
          newConfidence: e.newConfidence,
          trigger: e.trigger,
          createdAt: e.createdAt,
        })),
      },
    };
  }
}

export const personalAgentService = new PersonalAgentService();
