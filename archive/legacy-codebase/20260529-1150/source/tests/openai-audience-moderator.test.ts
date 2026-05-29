import { test } from "node:test";
import assert from "node:assert/strict";

import { createOpenAiAudienceModerator } from "../server/services/openai-audience-moderator";

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;
const ORIGINAL_ALT = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

function withFakeKey<T>(fn: () => Promise<T>): Promise<T> {
  process.env.OPENAI_API_KEY = "sk-test-fake";
  delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  return fn().finally(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_KEY;
    if (ORIGINAL_ALT === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    else process.env.AI_INTEGRATIONS_OPENAI_API_KEY = ORIGINAL_ALT;
  });
}

test("returns null when no API key is configured", async () => {
  const prev = process.env.OPENAI_API_KEY;
  const prevAlt = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  try {
    const fn = createOpenAiAudienceModerator();
    const out = await fn("hello");
    assert.equal(out, null);
  } finally {
    if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    if (prevAlt !== undefined) process.env.AI_INTEGRATIONS_OPENAI_API_KEY = prevAlt;
  }
});

function makeStubClient(create: (input: unknown) => Promise<any>): any {
  return { moderations: { create } };
}

test("maps OpenAI moderation category_scores into AiModerationResult", async () => {
  const client = makeStubClient(async () => ({
    id: "mod-1",
    model: "stub-model",
    results: [
      {
        flagged: true,
        categories: {},
        category_applied_input_types: {},
        category_scores: {
          harassment: 0.42,
          "harassment/threatening": 0.81,
          hate: 0.1,
          "hate/threatening": 0.05,
          sexual: 0.2,
          "sexual/minors": 0.0,
          violence: 0.3,
          "violence/graphic": 0.6,
          "self-harm": 0.05,
          "self-harm/intent": 0.7,
          "self-harm/instructions": 0.1,
        },
      },
    ],
  }));
  const fn = createOpenAiAudienceModerator({ ratePerMinute: 1000, client });
  const result = await fn("Some borderline message");
  assert.ok(result);
  assert.equal(result!.abuse, 0.81);
  assert.equal(result!.hate, 0.1);
  assert.equal(result!.sexual, 0.2);
  assert.equal(result!.violence, 0.6);
  assert.equal(result!.selfHarm, 0.7);
  assert.equal(result!.toxicity, 0.81);
  assert.equal(result!.spam, undefined);
  assert.equal(result!.misinformation, undefined);
});

test("enforces per-minute rate limit and falls back to null when exceeded", async () => {
  let calls = 0;
  const client = makeStubClient(async () => {
    calls++;
    return {
      id: "m",
      model: "x",
      results: [
        {
          flagged: false,
          categories: {},
          category_applied_input_types: {},
          category_scores: { harassment: 0.1 },
        },
      ],
    };
  });
  const fn = createOpenAiAudienceModerator({ ratePerMinute: 2, client });
  assert.ok(await fn("a"));
  assert.ok(await fn("b"));
  const third = await fn("c");
  assert.equal(third, null);
  assert.equal(calls, 2);
});

test("returns null when OpenAI throws (deterministic-only fallback)", async () => {
  const client = makeStubClient(async () => {
    throw new Error("boom");
  });
  const fn = createOpenAiAudienceModerator({ ratePerMinute: 10, client });
  const result = await fn("hi");
  assert.equal(result, null);
});

test("returns null on empty input without spending rate budget", async () => {
  let calls = 0;
  const client = makeStubClient(async () => {
    calls++;
    return { id: "m", model: "x", results: [] };
  });
  const fn = createOpenAiAudienceModerator({ ratePerMinute: 1, client });
  assert.equal(await fn("   "), null);
  assert.equal(calls, 0);
});
