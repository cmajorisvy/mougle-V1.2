import OpenAI from "openai";
import { db } from "../db";
import {
  bondscoreTests, bondscoreQuestions, bondscoreAttempts, users
} from "@shared/schema";
import { eq, desc, sql, count, and, avg } from "drizzle-orm";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "missing",
    });
  }
  return _openai;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function generateShareId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

class BondscoreService {

  async createTest(creatorId: string, data: {
    title: string;
    description?: string;
    coverEmoji?: string;
    questions: { questionText: string; answers: string[]; correctIndex: number }[];
  }) {
    if (!data.questions || data.questions.length < 1) throw { status: 400, message: "At least 1 question required" };
    if (data.questions.length > 10) throw { status: 400, message: "Maximum 10 questions" };

    for (const q of data.questions) {
      if (!q.answers || q.answers.length !== 4) throw { status: 400, message: "Each question must have exactly 4 answers" };
      if (q.correctIndex < 0 || q.correctIndex > 3) throw { status: 400, message: "correctIndex must be 0-3" };
    }

    const slug = slugify(data.title) + "-" + Date.now().toString(36);

    const [test] = await db.insert(bondscoreTests).values({
      creatorId,
      title: data.title,
      description: data.description || "",
      slug,
      coverEmoji: data.coverEmoji || "🔗",
      isPublished: true,
    }).returning();

    const questionValues = data.questions.map((q, i) => ({
      testId: test.id,
      questionText: q.questionText,
      orderIndex: i,
      answers: q.answers,
      correctIndex: q.correctIndex,
    }));

    await db.insert(bondscoreQuestions).values(questionValues);

    return test;
  }

  async getTestBySlug(slug: string) {
    const [test] = await db.select().from(bondscoreTests).where(eq(bondscoreTests.slug, slug));
    if (!test) return null;

    const questions = await db.select().from(bondscoreQuestions)
      .where(eq(bondscoreQuestions.testId, test.id))
      .orderBy(bondscoreQuestions.orderIndex);

    const [creator] = await db.select({
      displayName: users.displayName,
      avatar: users.avatar,
      username: users.username,
    }).from(users).where(eq(users.id, test.creatorId));

    const publicQuestions = questions.map(q => ({
      id: q.id,
      questionText: q.questionText,
      orderIndex: q.orderIndex,
      answers: q.answers,
    }));

    return { ...test, questions: publicQuestions, creator: creator || { displayName: "Unknown", avatar: null, username: "unknown" } };
  }

  async submitAttempt(testId: string, data: {
    guestId: string;
    selectedAnswers: number[];
  }) {
    const questions = await db.select().from(bondscoreQuestions)
      .where(eq(bondscoreQuestions.testId, testId))
      .orderBy(bondscoreQuestions.orderIndex);

    if (data.selectedAnswers.length !== questions.length) {
      throw { status: 400, message: `Expected ${questions.length} answers` };
    }

    let correct = 0;
    questions.forEach((q, i) => {
      if (data.selectedAnswers[i] === q.correctIndex) correct++;
    });
    const score = Math.round((correct / questions.length) * 100);

    const shareId = generateShareId();

    const [attempt] = await db.insert(bondscoreAttempts).values({
      testId,
      guestId: data.guestId,
      score,
      totalQuestions: questions.length,
      shareId,
      selectedAnswers: data.selectedAnswers,
      completed: true,
      claimed: false,
    }).returning();

    const [test] = await db.select().from(bondscoreTests).where(eq(bondscoreTests.id, testId));
    if (test) {
      const allAttempts = await db.select({ score: bondscoreAttempts.score })
        .from(bondscoreAttempts)
        .where(and(eq(bondscoreAttempts.testId, testId), eq(bondscoreAttempts.completed, true)));
      const avgScore = allAttempts.length > 0
        ? Math.round(allAttempts.reduce((s, a) => s + (a.score || 0), 0) / allAttempts.length)
        : 0;
      await db.update(bondscoreTests).set({
        participantCount: allAttempts.length,
        avgScore,
      }).where(eq(bondscoreTests.id, testId));
    }

    return { attemptId: attempt.id, shareId, score: null };
  }

  async claimAttempt(shareId: string, userId: string) {
    const [attempt] = await db.select().from(bondscoreAttempts).where(eq(bondscoreAttempts.shareId, shareId));
    if (!attempt) throw { status: 404, message: "Attempt not found" };

    const [updated] = await db.update(bondscoreAttempts).set({
      userId,
      claimed: true,
    }).where(eq(bondscoreAttempts.id, attempt.id)).returning();

    return updated;
  }

  async getResult(shareId: string, userId?: string) {
    const [attempt] = await db.select().from(bondscoreAttempts).where(eq(bondscoreAttempts.shareId, shareId));
    if (!attempt) throw { status: 404, message: "Result not found" };

    const isOwner = userId && attempt.claimed && attempt.userId === userId;
    if (!attempt.claimed || !isOwner) {
      return {
        needsSignup: !attempt.claimed,
        alreadyClaimed: attempt.claimed && !isOwner,
        shareId,
        testId: attempt.testId,
      };
    }

    const [test] = await db.select().from(bondscoreTests).where(eq(bondscoreTests.id, attempt.testId));
    const questions = await db.select().from(bondscoreQuestions)
      .where(eq(bondscoreQuestions.testId, attempt.testId))
      .orderBy(bondscoreQuestions.orderIndex);

    const [creator] = test ? await db.select({
      displayName: users.displayName,
      avatar: users.avatar,
      username: users.username,
    }).from(users).where(eq(users.id, test.creatorId)) : [null];

    const comparison = questions.map((q, i) => ({
      questionText: q.questionText,
      answers: q.answers,
      creatorAnswer: q.correctIndex,
      takerAnswer: (attempt.selectedAnswers as number[])[i],
      matched: (attempt.selectedAnswers as number[])[i] === q.correctIndex,
    }));

    return {
      needsSignup: false,
      score: attempt.score,
      totalQuestions: attempt.totalQuestions,
      shareId: attempt.shareId,
      test: test ? { title: test.title, description: test.description, coverEmoji: test.coverEmoji, slug: test.slug } : null,
      creator: creator || { displayName: "Unknown", avatar: null, username: "unknown" },
      comparison,
    };
  }

  async getMyTests(userId: string) {
    return db.select().from(bondscoreTests)
      .where(eq(bondscoreTests.creatorId, userId))
      .orderBy(desc(bondscoreTests.createdAt));
  }

  async getDashboardStats(userId: string) {
    const tests = await db.select().from(bondscoreTests)
      .where(eq(bondscoreTests.creatorId, userId));

    const totalTests = tests.length;
    const totalParticipants = tests.reduce((s, t) => s + (t.participantCount || 0), 0);
    const avgScore = totalTests > 0
      ? Math.round(tests.reduce((s, t) => s + (t.avgScore || 0), 0) / totalTests)
      : 0;

    return { totalTests, totalParticipants, avgScore, tests };
  }

  async generateAIQuestions(topic?: string): Promise<{ questionText: string; answers: string[]; correctIndex: number }[]> {
    const prompt = `Generate 10 fun, creative "How well do you know me?" personality questions for a friendship/bond test.
${topic ? `Theme/Topic: ${topic}` : "Make them general friendship/personality questions."}

Each question should have exactly 4 possible answers. The "correctIndex" represents the creator's preferred/true answer (0-3).

Return JSON array with objects containing:
- "questionText": The question (fun, engaging, personal)
- "answers": Array of exactly 4 answer options (short, distinct, fun)
- "correctIndex": Random number 0-3 (simulating creator's answer)

Examples of good questions:
- "What's my go-to comfort food?"
- "What would I do with a surprise day off?"
- "What's my biggest pet peeve?"

Make questions fun and shareable. Avoid anything too personal or sensitive.`;

    try {
      const resp = await getOpenAI().chat.completions.create({
        model: "gpt-5.5",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      });
      const data = JSON.parse(resp.choices[0].message.content || "{}");
      const questions = data.questions || data;
      if (Array.isArray(questions) && questions.length > 0) {
        return questions.slice(0, 10).map((q: any) => ({
          questionText: q.questionText || q.question || "",
          answers: (q.answers || q.options || []).slice(0, 4),
          correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : 0,
        }));
      }
    } catch (err) {
      console.error("[BondScore] AI generation error:", err);
    }

    return [
      { questionText: "What's my favorite way to spend a weekend?", answers: ["Netflix binge", "Outdoor adventure", "Cooking at home", "Shopping spree"], correctIndex: 0 },
      { questionText: "What's my go-to comfort food?", answers: ["Pizza", "Ice cream", "Pasta", "Chocolate"], correctIndex: 0 },
      { questionText: "What would I grab if the house was on fire?", answers: ["Phone", "Pet", "Photo album", "Laptop"], correctIndex: 0 },
      { questionText: "What's my biggest fear?", answers: ["Heights", "Spiders", "Public speaking", "Being alone"], correctIndex: 0 },
      { questionText: "How do I react to surprises?", answers: ["Scream with joy", "Stay calm", "Cry happy tears", "Freeze completely"], correctIndex: 0 },
      { questionText: "What's my dream vacation?", answers: ["Beach paradise", "Mountain retreat", "City exploration", "Road trip"], correctIndex: 0 },
      { questionText: "What's my morning routine like?", answers: ["Hit snooze 5 times", "Up with the sun", "Coffee first everything", "Workout warrior"], correctIndex: 0 },
      { questionText: "What's my hidden talent?", answers: ["Singing", "Drawing", "Cooking", "Dancing"], correctIndex: 0 },
      { questionText: "How do I handle stress?", answers: ["Listen to music", "Go for a walk", "Talk to friends", "Sleep it off"], correctIndex: 0 },
      { questionText: "What makes me laugh the hardest?", answers: ["Memes", "Dad jokes", "Slapstick comedy", "Sarcasm"], correctIndex: 0 },
    ];
  }

  async getAdminStats() {
    const [testCount] = await db.select({ cnt: count() }).from(bondscoreTests);
    const [attemptCount] = await db.select({ cnt: count() }).from(bondscoreAttempts);
    const avgScoreResult = await db.select({
      avg: sql<number>`COALESCE(AVG(${bondscoreAttempts.score}), 0)`,
    }).from(bondscoreAttempts).where(eq(bondscoreAttempts.completed, true));

    const recentTests = await db.select().from(bondscoreTests)
      .orderBy(desc(bondscoreTests.createdAt)).limit(10);

    return {
      totalTests: testCount?.cnt || 0,
      totalAttempts: attemptCount?.cnt || 0,
      avgScore: Math.round(Number(avgScoreResult[0]?.avg || 0)),
      recentTests,
    };
  }
}

export const bondscoreService = new BondscoreService();
