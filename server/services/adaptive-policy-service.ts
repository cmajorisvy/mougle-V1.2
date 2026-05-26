import OpenAI from "openai";
import { db } from "../db";
import { policyTemplates, policyDrafts, policyVersions, complianceNotifications } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "https://api.openai.com/v1",
    });
  }
  return _openai;
}

const DEFAULT_TEMPLATES = [
  { slug: "privacy-policy", title: "Privacy Policy", category: "legal", description: "Platform privacy policy covering data collection, usage, and user rights" },
  { slug: "terms-of-service", title: "Terms of Service", category: "legal", description: "Platform terms governing user and creator behavior" },
  { slug: "cookies-policy", title: "Cookies Policy", category: "legal", description: "Cookie usage, tracking, and consent policy" },
  { slug: "creator-agreement", title: "Creator Agreement", category: "agreement", description: "Agreement for creators publishing on the platform" },
  { slug: "ai-usage-policy", title: "AI Usage Policy", category: "legal", description: "Policy governing AI agent behavior and data processing" },
  { slug: "help-getting-started", title: "Getting Started Guide", category: "help", description: "Onboarding guide for new users" },
  { slug: "help-creators", title: "Creator Help Center", category: "help", description: "Help documentation for platform creators" },
  { slug: "email-welcome", title: "Welcome Email", category: "email", description: "Email sent to new users upon registration" },
  { slug: "email-policy-update", title: "Policy Update Email", category: "email", description: "Email template for notifying users about policy changes" },
  { slug: "email-creator-update", title: "Creator Update Email", category: "email", description: "Email template for notifying creators about platform changes" },
];

export class AdaptivePolicyService {
  async initializeTemplates(): Promise<void> {
    for (const t of DEFAULT_TEMPLATES) {
      const existing = await db.select().from(policyTemplates).where(eq(policyTemplates.slug, t.slug)).limit(1);
      if (existing.length === 0) {
        await db.insert(policyTemplates).values({
          slug: t.slug,
          title: t.title,
          category: t.category,
          description: t.description,
          currentContent: "",
          currentVersion: 0,
          isPublished: false,
        });
      }
    }
  }

  async getTemplates(category?: string) {
    if (category) {
      return db.select().from(policyTemplates).where(eq(policyTemplates.category, category)).orderBy(policyTemplates.title);
    }
    return db.select().from(policyTemplates).orderBy(policyTemplates.title);
  }

  async getTemplate(id: string) {
    const [t] = await db.select().from(policyTemplates).where(eq(policyTemplates.id, id)).limit(1);
    return t || null;
  }

  async getTemplateBySlug(slug: string) {
    const [t] = await db.select().from(policyTemplates).where(eq(policyTemplates.slug, slug)).limit(1);
    return t || null;
  }

  async getDrafts(status?: string) {
    if (status) {
      return db.select().from(policyDrafts).where(eq(policyDrafts.status, status)).orderBy(desc(policyDrafts.createdAt));
    }
    return db.select().from(policyDrafts).orderBy(desc(policyDrafts.createdAt));
  }

  async getDraft(id: string) {
    const [d] = await db.select().from(policyDrafts).where(eq(policyDrafts.id, id)).limit(1);
    return d || null;
  }

  async generateDraft(templateId: string, triggerType: string, triggerDetails?: any): Promise<any> {
    const template = await this.getTemplate(templateId);
    if (!template) throw new Error("Template not found");

    const categoryPrompts: Record<string, string> = {
      legal: `You are a legal document writer for a technology platform called Mougle, a Hybrid Intelligence Network. Generate a comprehensive, legally sound ${template.title} document. Include standard clauses for data protection (GDPR, CCPA), user rights, platform liability, dispute resolution, and AI-specific provisions. Use clear, professional language. Format with markdown headers and sections.`,
      agreement: `You are drafting a ${template.title} for Mougle, a Hybrid Intelligence Network platform. Include terms for content ownership, revenue sharing, platform responsibilities, creator obligations, AI interaction policies, content standards, and termination conditions. Format with markdown.`,
      help: `You are writing a ${template.title} help page for Mougle, a Hybrid Intelligence Network. Write clear, helpful content that guides users through the platform features. Include step-by-step instructions where appropriate. Format with markdown, use friendly tone.`,
      email: `You are writing a ${template.title} email template for Mougle, a Hybrid Intelligence Network. Write professional, friendly email content. Keep it concise and actionable. Include placeholder variables like {{user_name}}, {{action_url}} where appropriate. Format with markdown.`,
    };

    const systemPrompt = categoryPrompts[template.category] || categoryPrompts.legal;

    let changeContext = `Generate a new version of this document.`;
    if (triggerType === "compliance_change") {
      changeContext = `A compliance rule change has occurred: ${JSON.stringify(triggerDetails)}. Update the document to reflect the new legal requirements.`;
    } else if (triggerType === "feature_change") {
      changeContext = `A platform feature has changed: ${JSON.stringify(triggerDetails)}. Update the document to accurately reflect the new feature.`;
    } else if (triggerType === "manual") {
      changeContext = `The founder has requested an update: ${triggerDetails?.reason || "General update needed"}.`;
    }

    const existingContent = template.currentContent || "";
    const userPrompt = existingContent
      ? `Here is the current document content:\n\n${existingContent}\n\n${changeContext}\n\nGenerate an updated version that incorporates the required changes. Return ONLY the document content.`
      : `${changeContext}\n\nThis is a new document with no existing content. Generate a complete initial version. Return ONLY the document content.`;

    try {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-5.5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 4000,
        temperature: 0.3,
      });

      const draftContent = response.choices[0]?.message?.content || "";

      const summaryResp = await getOpenAI().chat.completions.create({
        model: "gpt-5.5",
        messages: [
          { role: "system", content: "Summarize the key changes between two document versions in 2-3 concise bullet points. If the previous version is empty, summarize the new document instead." },
          { role: "user", content: `Previous:\n${existingContent || "(empty - new document)"}\n\nNew:\n${draftContent}` },
        ],
        max_tokens: 300,
        temperature: 0.2,
      });

      const changeSummary = summaryResp.choices[0]?.message?.content || "New draft generated";
      const diffHtml = this.generateDiffHtml(existingContent, draftContent);

      const [draft] = await db.insert(policyDrafts).values({
        templateId,
        title: template.title,
        draftContent,
        previousContent: existingContent,
        changeReason: triggerDetails?.reason || `${triggerType} update`,
        changeSummary,
        diffHtml,
        triggerType,
        triggerDetails,
        status: "pending",
      }).returning();

      await db.insert(complianceNotifications).values({
        type: "policy_draft",
        title: `New Policy Draft: ${template.title}`,
        message: `A new draft for "${template.title}" has been generated and requires your approval. Trigger: ${triggerType}.`,
        targetAudience: "founder",
      });

      return draft;
    } catch (error: any) {
      const [draft] = await db.insert(policyDrafts).values({
        templateId,
        title: template.title,
        draftContent: existingContent || `[AI generation failed - please edit manually]\n\n# ${template.title}\n\nContent to be written.`,
        previousContent: existingContent,
        changeReason: triggerDetails?.reason || `${triggerType} update`,
        changeSummary: `AI generation error: ${error.message}. Manual editing required.`,
        diffHtml: "",
        triggerType,
        triggerDetails,
        status: "pending",
      }).returning();

      return draft;
    }
  }

  private generateDiffHtml(oldText: string, newText: string): string {
    const oldLines = (oldText || "").split("\n");
    const newLines = (newText || "").split("\n");
    const diff: string[] = [];

    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      if (oldLine === undefined && newLine !== undefined) {
        diff.push(`<div class="diff-added">+ ${this.escapeHtml(newLine)}</div>`);
      } else if (newLine === undefined && oldLine !== undefined) {
        diff.push(`<div class="diff-removed">- ${this.escapeHtml(oldLine)}</div>`);
      } else if (oldLine !== newLine) {
        diff.push(`<div class="diff-removed">- ${this.escapeHtml(oldLine || "")}</div>`);
        diff.push(`<div class="diff-added">+ ${this.escapeHtml(newLine || "")}</div>`);
      } else {
        diff.push(`<div class="diff-context">  ${this.escapeHtml(oldLine || "")}</div>`);
      }
    }

    return diff.join("\n");
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  async approveDraft(draftId: string, reviewerName?: string): Promise<any> {
    const draft = await this.getDraft(draftId);
    if (!draft) throw new Error("Draft not found");
    if (draft.status !== "pending") throw new Error("Draft is not pending approval");

    const template = await this.getTemplate(draft.templateId);
    if (!template) throw new Error("Template not found");

    const newVersion = template.currentVersion + 1;

    await db.update(policyVersions).set({ isActive: false }).where(eq(policyVersions.templateId, template.id));

    const [version] = await db.insert(policyVersions).values({
      templateId: template.id,
      version: newVersion,
      content: draft.draftContent,
      changeSummary: draft.changeSummary,
      changeReason: draft.changeReason,
      publishedBy: reviewerName || "founder",
      isActive: true,
    }).returning();

    await db.update(policyTemplates).set({
      currentContent: draft.draftContent,
      currentVersion: newVersion,
      isPublished: true,
      lastPublishedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(policyTemplates.id, template.id));

    await db.update(policyDrafts).set({
      status: "approved",
      reviewedBy: reviewerName || "founder",
      reviewedAt: new Date(),
    }).where(eq(policyDrafts.id, draftId));

    if (template.category === "legal" || template.category === "agreement") {
      await db.insert(complianceNotifications).values({
        type: "policy_published",
        title: `Policy Updated: ${template.title}`,
        message: `${template.title} (v${newVersion}) has been published. All users and creators will be notified.`,
        targetAudience: "all",
      });
    }

    return { version, template: { ...template, currentVersion: newVersion } };
  }

  async rejectDraft(draftId: string, reason: string, reviewerName?: string): Promise<void> {
    await db.update(policyDrafts).set({
      status: "rejected",
      rejectionReason: reason,
      reviewedBy: reviewerName || "founder",
      reviewedAt: new Date(),
    }).where(eq(policyDrafts.id, draftId));
  }

  async getVersionHistory(templateId: string) {
    return db.select().from(policyVersions).where(eq(policyVersions.templateId, templateId)).orderBy(desc(policyVersions.version));
  }

  async rollbackToVersion(templateId: string, versionId: string): Promise<any> {
    const version = await db.select().from(policyVersions).where(eq(policyVersions.id, versionId)).limit(1);
    if (!version[0]) throw new Error("Version not found");

    const template = await this.getTemplate(templateId);
    if (!template) throw new Error("Template not found");

    await db.update(policyVersions).set({ isActive: false }).where(eq(policyVersions.templateId, templateId));
    await db.update(policyVersions).set({ isActive: true }).where(eq(policyVersions.id, versionId));

    await db.update(policyTemplates).set({
      currentContent: version[0].content,
      currentVersion: version[0].version,
      lastPublishedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(policyTemplates.id, templateId));

    await db.insert(complianceNotifications).values({
      type: "policy_rollback",
      title: `Policy Rolled Back: ${template.title}`,
      message: `${template.title} has been rolled back to version ${version[0].version}.`,
      targetAudience: "founder",
    });

    return { template, version: version[0] };
  }

  async getDashboard() {
    const templates = await db.select().from(policyTemplates).orderBy(policyTemplates.title);
    const pendingDrafts = await db.select().from(policyDrafts).where(eq(policyDrafts.status, "pending")).orderBy(desc(policyDrafts.createdAt));
    const recentApproved = await db.select().from(policyDrafts).where(eq(policyDrafts.status, "approved")).orderBy(desc(policyDrafts.reviewedAt)).limit(5);
    const totalVersions = await db.select({ count: sql<number>`count(*)` }).from(policyVersions);

    return {
      stats: {
        totalTemplates: templates.length,
        publishedTemplates: templates.filter(t => t.isPublished).length,
        pendingDrafts: pendingDrafts.length,
        totalVersions: Number(totalVersions[0]?.count || 0),
      },
      templates,
      pendingDrafts,
      recentApproved,
    };
  }

  async detectAndTriggerUpdates(): Promise<any[]> {
    const triggered: any[] = [];

    const templates = await db.select().from(policyTemplates);
    for (const t of templates) {
      if (!t.currentContent || t.currentContent.trim() === "") {
        const draft = await this.generateDraft(t.id, "initial_generation", { reason: "Initial document generation" });
        triggered.push({ template: t.title, draft });
      }
    }

    return triggered;
  }

  async getPublicPolicy(slug: string) {
    const template = await this.getTemplateBySlug(slug);
    if (!template || !template.isPublished) return null;
    return {
      title: template.title,
      content: template.currentContent,
      version: template.currentVersion,
      lastUpdated: template.lastPublishedAt,
    };
  }
}

export const adaptivePolicyService = new AdaptivePolicyService();
