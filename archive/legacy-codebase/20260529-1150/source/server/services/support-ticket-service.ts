import { db } from "../db";
import { supportTickets, ticketMessages, type SupportTicket, type TicketMessage } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { emailService } from "./email-service";
import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    });
  }
  return _openai;
}

const VALID_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"] as const;

export class SupportTicketService {
  async createTicket(data: {
    userId?: string;
    userEmail: string;
    userName: string;
    subject: string;
    description: string;
    category?: string;
    priority?: string;
  }): Promise<SupportTicket> {
    const [ticket] = await db.insert(supportTickets).values({
      userId: data.userId || null,
      userEmail: data.userEmail,
      userName: data.userName,
      subject: data.subject,
      description: data.description,
      category: data.category || "general",
      priority: data.priority || "medium",
      status: "OPEN",
    }).returning();

    await db.insert(ticketMessages).values({
      ticketId: ticket.id,
      senderType: "user",
      senderName: data.userName,
      content: data.description,
    });

    try {
      await emailService.sendTicketCreatedNotification(data.userEmail, data.userName, {
        ticketId: ticket.id,
        subject: data.subject,
      });
    } catch (e) {
      console.error("[SupportTicket] Failed to send creation email:", e);
    }

    return ticket;
  }

  async getTicketById(ticketId: string): Promise<SupportTicket | null> {
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
    return ticket || null;
  }

  async getTicketsByUser(userId: string): Promise<SupportTicket[]> {
    return db.select().from(supportTickets).where(eq(supportTickets.userId, userId)).orderBy(desc(supportTickets.createdAt));
  }

  async getAllTickets(filter?: { status?: string }): Promise<SupportTicket[]> {
    if (filter?.status) {
      return db.select().from(supportTickets).where(eq(supportTickets.status, filter.status)).orderBy(desc(supportTickets.createdAt));
    }
    return db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt));
  }

  async getTicketMessages(ticketId: string): Promise<TicketMessage[]> {
    return db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, ticketId)).orderBy(ticketMessages.createdAt);
  }

  async addMessage(ticketId: string, data: {
    senderType: string;
    senderName: string;
    content: string;
    isAiGenerated?: boolean;
  }): Promise<TicketMessage> {
    const [message] = await db.insert(ticketMessages).values({
      ticketId,
      senderType: data.senderType,
      senderName: data.senderName,
      content: data.content,
      isAiGenerated: data.isAiGenerated || false,
      emailSent: false,
    }).returning();

    if (data.senderType === "admin" || data.senderType === "system") {
      const ticket = await this.getTicketById(ticketId);
      if (ticket) {
        try {
          await emailService.sendSupportTicketReply(ticket.userEmail, ticket.userName, {
            ticketId: ticket.id,
            subject: ticket.subject,
            replyContent: data.content,
          });
          await db.update(ticketMessages).set({ emailSent: true }).where(eq(ticketMessages.id, message.id));
        } catch (e) {
          console.error("[SupportTicket] Failed to send reply email:", e);
        }
      }
    }

    return message;
  }

  async updateStatus(ticketId: string, status: string): Promise<SupportTicket | null> {
    if (!VALID_STATUSES.includes(status as any)) {
      throw new Error(`Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(", ")}`);
    }
    const updates: any = { status, updatedAt: new Date() };
    if (status === "RESOLVED") updates.resolvedAt = new Date();
    if (status === "CLOSED") updates.closedAt = new Date();

    const [ticket] = await db.update(supportTickets).set(updates).where(eq(supportTickets.id, ticketId)).returning();
    return ticket || null;
  }

  async generateAiReply(ticketId: string): Promise<string> {
    const ticket = await this.getTicketById(ticketId);
    if (!ticket) throw new Error("Ticket not found");

    const messages = await this.getTicketMessages(ticketId);
    const conversationHistory = messages.map(m =>
      `[${m.senderType.toUpperCase()} - ${m.senderName}]: ${m.content}`
    ).join("\n\n");

    const response = await getOpenAI().chat.completions.create({
      model: "gpt-5.5",
      messages: [
        {
          role: "system",
          content: `You are a professional support agent for Mougle, a Hybrid Intelligence Network platform. 
Write a grammatically correct, helpful, and empathetic reply to the user's support ticket.
Be concise but thorough. Address the user's specific issue.
Use a professional yet friendly tone. Sign off as "Mougle Support Team".
Do not include subject line or email headers - just the reply body.`,
        },
        {
          role: "user",
          content: `Ticket Subject: ${ticket.subject}
Category: ${ticket.category}
Priority: ${ticket.priority}

Conversation so far:
${conversationHistory}

Generate a helpful reply to the user's latest message.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    return response.choices[0]?.message?.content || "Thank you for contacting Mougle Support. We're looking into your issue and will follow up shortly.";
  }

  async getTicketStats(): Promise<{ total: number; open: number; inProgress: number; waitingUser: number; resolved: number; closed: number }> {
    const all = await db.select().from(supportTickets);
    return {
      total: all.length,
      open: all.filter(t => t.status === "OPEN").length,
      inProgress: all.filter(t => t.status === "IN_PROGRESS").length,
      waitingUser: all.filter(t => t.status === "WAITING_USER").length,
      resolved: all.filter(t => t.status === "RESOLVED").length,
      closed: all.filter(t => t.status === "CLOSED").length,
    };
  }
}

export const supportTicketService = new SupportTicketService();
