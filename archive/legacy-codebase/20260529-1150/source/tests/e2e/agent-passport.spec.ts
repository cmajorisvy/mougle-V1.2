import { test, expect } from "@playwright/test";

async function getCsrfToken(request: any) {
  const res = await request.get("/api/auth/csrf-token");
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(data.csrfToken).toBeTruthy();
  return data.csrfToken;
}

test("passport export + revoke flow", async ({ request }) => {
  const csrf = await getCsrfToken(request);

  const email = `e2e_${Date.now()}_${Math.random().toString(36).slice(2)}@mougle.test`;
  const password = "Value@1978";

  const signupRes = await request.post("/api/auth/signup", {
    data: { email, password, username: `e2e_${Date.now()}` },
    headers: { "X-CSRF-Token": csrf },
  });
  expect(signupRes.ok()).toBeTruthy();

  const csrfAfterSignup = await getCsrfToken(request);
  const signinRes = await request.post("/api/auth/signin", {
    data: { email, password },
    headers: { "X-CSRF-Token": csrfAfterSignup },
  });
  expect(signinRes.ok()).toBeTruthy();

  const csrfAfterSignin = await getCsrfToken(request);

  const createAgentRes = await request.post("/api/user-agents", {
    data: {
      name: "E2E Personal Agent",
      type: "personal",
      persona: "Personal assistant",
      model: "gpt-4o",
      provider: "openai",
    },
    headers: { "X-CSRF-Token": csrfAfterSignin },
  });
  expect(createAgentRes.ok()).toBeTruthy();

  const exportRes = await request.post("/api/agents/personal/export", {
    headers: { "X-CSRF-Token": csrfAfterSignin },
  });
  expect(exportRes.ok()).toBeTruthy();
  const exportContent = await exportRes.text();
  expect(exportContent).toContain("mougle-agent-passport");

  const historyRes = await request.get("/api/agents/passport/exports");
  expect(historyRes.ok()).toBeTruthy();
  const history = await historyRes.json();
  expect(Array.isArray(history)).toBeTruthy();
  const latest = history[0];
  expect(latest?.id).toBeTruthy();

  const verifyRes = await request.get(`/api/passport/verify/${latest.id}`);
  expect(verifyRes.ok()).toBeTruthy();
  const verify = await verifyRes.json();
  expect(verify.valid).toBe(true);
  expect(verify.revoked).toBe(false);
  expect(verify.origin).toBe("mougle.com");
  expect(verify.standard).toBe("MAP-1");

  const revokeRes = await request.post(`/api/agents/passport/${latest.id}/revoke`, {
    data: { reason: "e2e_test" },
    headers: { "X-CSRF-Token": csrfAfterSignin },
  });
  expect(revokeRes.ok()).toBeTruthy();

  const verifyAfterRes = await request.get(`/api/passport/verify/${latest.id}`);
  expect(verifyAfterRes.ok()).toBeTruthy();
  const verifyAfter = await verifyAfterRes.json();
  expect(verifyAfter.valid).toBe(false);
  expect(verifyAfter.revoked).toBe(true);
});
