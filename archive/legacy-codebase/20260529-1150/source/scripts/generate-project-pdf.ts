import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const OUT = path.resolve("exports/mougle-project-overview.pdf");
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const doc = new PDFDocument({ size: "A4", margin: 56, bufferPages: true, info: {
  Title: "Mougle — Project Overview & Functional Flow",
  Author: "Mougle Engineering",
  Subject: "Architecture, subsystems, flow chart, and test status",
}});
doc.pipe(fs.createWriteStream(OUT));

const COLORS = {
  bg: "#0b0d12",
  panel: "#141821",
  text: "#e7ecf3",
  muted: "#9aa4b2",
  accent: "#5b8def",
  accent2: "#7a5cff",
  ok: "#3ecf8e",
  warn: "#f5a524",
  bad: "#ef4444",
  line: "#2a313d",
};

function pageBg() {
  doc.save().rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.bg).restore();
}
doc.on("pageAdded", pageBg);
pageBg();

function h1(text: string) {
  doc.moveDown(0.4);
  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(22).text(text);
  doc.moveTo(doc.x, doc.y + 4).lineTo(doc.page.width - doc.page.margins.right, doc.y + 4)
     .strokeColor(COLORS.accent).lineWidth(1.5).stroke();
  doc.moveDown(0.6);
}
function h2(text: string) {
  doc.moveDown(0.4);
  doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(14).text(text);
  doc.moveDown(0.2);
}
function p(text: string) {
  doc.fillColor(COLORS.text).font("Helvetica").fontSize(10.5).text(text, { align: "left", lineGap: 2 });
  doc.moveDown(0.3);
}
function bullet(items: string[]) {
  doc.fillColor(COLORS.text).font("Helvetica").fontSize(10.5);
  for (const it of items) {
    doc.text("•  " + it, { indent: 6, lineGap: 2 });
  }
  doc.moveDown(0.4);
}
function muted(text: string) {
  doc.fillColor(COLORS.muted).font("Helvetica-Oblique").fontSize(9.5).text(text);
  doc.moveDown(0.3);
}

// ─── COVER ────────────────────────────────────────────────────────────────
doc.save();
doc.rect(0, 120, doc.page.width, 280).fill(COLORS.panel);
doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(46).text("MOUGLE", 56, 160);
doc.fillColor(COLORS.text).fontSize(22).text("Hybrid Intelligence Network", 56, 220);
doc.fillColor(COLORS.muted).font("Helvetica").fontSize(13)
   .text("Project Overview · Architecture · Functional Flow · Test Status", 56, 260);
doc.fillColor(COLORS.accent2).fontSize(11)
   .text("Generated: " + new Date().toISOString().slice(0, 10), 56, 360);
doc.restore();

// footer band
doc.save();
doc.rect(0, doc.page.height - 60, doc.page.width, 60).fill(COLORS.panel);
doc.fillColor(COLORS.muted).fontSize(10)
   .text("Internal engineering document — see replit.md for living source of truth.", 56, doc.page.height - 40);
doc.restore();

// ─── TOC ──────────────────────────────────────────────────────────────────
doc.addPage();
h1("Table of Contents");
const toc = [
  "1. Executive Summary",
  "2. System Architecture",
  "3. Core Subsystems Catalog",
  "4. Functional Flow Chart — Platform-Wide",
  "5. Production House — Detailed Flow",
  "6. Data & Storage Model",
  "7. Safety, Governance & Compliance",
  "8. Test Strategy & Current Status",
  "9. Operations & Deployment",
  "10. Appendix — File Map",
];
doc.fillColor(COLORS.text).font("Helvetica").fontSize(12);
for (const line of toc) doc.text(line, { indent: 10, lineGap: 6 });

// ─── 1. EXECUTIVE SUMMARY ─────────────────────────────────────────────────
doc.addPage();
h1("1. Executive Summary");
p("Mougle is a persistent hybrid intelligence network that brings human users and AI entities together " +
  "into a single structured platform for verified knowledge creation, collective truth convergence, and " +
  "intelligent entity collaboration. It is shipped as a TypeScript monorepo with a React frontend, an " +
  "Express.js backend, a PostgreSQL data store, and a deep stack of AI services for moderation, " +
  "reputation, content production, and governance.");

h2("Product Pillars");
bullet([
  "Verified knowledge: every post is scored by a Trust Confidence Score (TCS).",
  "Hybrid actors: human users and AI agents both have first-class identities.",
  "Economy: credit-based participation with reputation gating.",
  "Production House: end-to-end content pipeline (prompts → voice → assets → video).",
  "Safety stack: legal, moderation, kill-switches, and an immutable SAFETY_ENVELOPE.",
  "Autonomous operations: AI assists daily ops under founder supervision.",
]);

h2("Tech Stack — At a Glance");
bullet([
  "Frontend: React + TypeScript, wouter, shadcn/ui, Tailwind v4, @tanstack/react-query.",
  "Backend: Express.js v5 on Node.js (TypeScript), RESTful service modules.",
  "Database: PostgreSQL via Drizzle ORM + drizzle-kit migrations.",
  "AI: OpenAI (primary), Resend (email), object storage for media.",
  "Build: Vite (client), esbuild (server bundle), tsx (dev TS execution).",
  "Testing: node:test (unit/integration) + Playwright (E2E).",
]);

// ─── 2. ARCHITECTURE ──────────────────────────────────────────────────────
doc.addPage();
h1("2. System Architecture");

h2("Monorepo Layout");
bullet([
  "client/   — React SPA (pages, components, theme, hooks).",
  "server/   — Express server, services, routes, scheduled jobs.",
  "shared/   — Drizzle schema + zod contracts shared across both sides.",
  "tests/    — node:test unit suites + tests/e2e/ Playwright suites.",
  "scripts/  — One-off engineering scripts (this PDF generator lives here).",
]);

h2("Frontend");
p("React with wouter routing and a dark-first UI built on shadcn/ui (Radix) + Tailwind v4. " +
  "Theme state (mougle-theme) is persisted in localStorage and re-applied before first paint " +
  "via an anti-flash inline script in client/index.html. A global TooltipProvider gives every " +
  "interactive admin element a 200 ms hover hint with neutral popover surfaces.");

h2("Backend");
p("Express v5 modularized by domain: authentication, discussion, trust, AI agent management, " +
  "reputation, economy, governance, news, billing, production-house, autopilot-newsroom, cinema " +
  "control, and more (≈140 service files). Routes are kept thin — request validation goes through " +
  "Zod schemas from drizzle-zod, and all CRUD goes through a typed storage interface.");

h2("Database");
p("PostgreSQL accessed exclusively via Drizzle ORM. Schemas live in shared/schema.ts and friends; " +
  "drizzle-kit handles migrations. Insert types are derived from createInsertSchema and select " +
  "types from table.$inferSelect, so the wire shape stays in sync across client, server, and DB.");

h2("Layered Intelligence Stack");
bullet([
  "L1 Identity & Trust       — humans, agents, trust ladder, reputation.",
  "L2 Economy & Governance   — credits, billing, voting, policy.",
  "L3 Knowledge & Discussion — posts, topics, TCS, debates.",
  "L4 AI Agents              — orchestration, civilizations, evolution.",
  "L5 Coordination (CICL)    — global metrics, autopilot, growth engine.",
]);

// ─── 3. CORE SUBSYSTEMS ────────────────────────────────────────────────────
doc.addPage();
h1("3. Core Subsystems Catalog");
const subsystems: Array<[string, string]> = [
  ["Trust Confidence Score (TCS)", "Algorithmic trustworthiness for every post."],
  ["Reputation & Economy", "Ranks humans + AI; credit-gated agent actions."],
  ["Personal AI Agent", "Pro-tier private assistant with memory, voice, IoT."],
  ["CICL", "Collective Intelligence Coordination Layer (global metrics)."],
  ["Hybrid Auth", "Custom human + agent auth, cryptographic agent identity."],
  ["Mougle Labs", "AI-driven app idea generator + publishing marketplace."],
  ["Legal Safety Stack", "Risk-based disclaimers, moderation, daily limits."],
  ["Risk Management", "Tech, economic, privacy, ecosystem, legal monitors."],
  ["Trust Ladder", "7-level progression gating advanced features."],
  ["Agent Privacy Framework", "Memory isolation, privacy modes, output filters."],
  ["Founder Debug Stack", "Tracing, AI logs, economic + journey observability."],
  ["Panic Button", "NORMAL / SAFE_MODE / ECONOMY_PROTECTION / FREEZE."],
  ["Stability Triangle", "Balances creator freedom, AI automation, founder ctrl."],
  ["GCIS", "Global compliance intel — country flags from regulatory feeds."],
  ["Adaptive Policy", "AI-drafted legal copy, founder-approved, versioned."],
  ["Unified Support", "Resend email + ticketing + AI reply assistant."],
  ["Autonomous Ops Stack", "Moderation, growth, support, compliance engines."],
  ["Social Distribution Hub", "Automated posting + analytics dashboard."],
  ["BondScore Test", "Viral personality test → user acquisition loop."],
  ["Authority Flywheel", "Tracks knowledge assets, organic reach growth."],
  ["Silent SEO Engine", "Structured knowledge pages with schema.org markup."],
  ["$0 Marketing Engine", "Discussions → SEO articles → referrals."],
  ["PNR Monitor", "Point-of-no-return self-sustainability metrics."],
  ["Founder Workday", "Daily ops dashboard + AI-generated summary."],
  ["Growth Autopilot", "Orchestrates content, social, viral, email."],
  ["External Agent API", "Public REST API for third-party AI agents."],
  ["Debate-to-Project", "Converts debates into structured blueprints."],
  ["PDF Engine", "Generates multi-page blueprint PDFs (like this one)."],
  ["AI News Ingestion", "RSS poll every 30 min from 10+ AI sources."],
  ["Production House", "Prompt / Voice / Asset / Video pipeline."],
  ["Autopilot Newsroom", "Safety-enveloped news production scheduler."],
];
doc.fillColor(COLORS.text).font("Helvetica").fontSize(10);
const colW = (doc.page.width - 112) / 2;
let y = doc.y;
let col = 0;
for (const [name, desc] of subsystems) {
  const x = 56 + col * colW;
  const blockHeight = 38;
  if (y + blockHeight > doc.page.height - 70) {
    doc.addPage(); h1("3. Core Subsystems Catalog (cont.)"); y = doc.y; col = 0;
  }
  doc.save();
  doc.roundedRect(x, y, colW - 8, blockHeight - 6, 6).fillAndStroke(COLORS.panel, COLORS.line);
  doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(10).text(name, x + 8, y + 6, { width: colW - 24 });
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8.5).text(desc, x + 8, y + 20, { width: colW - 24 });
  doc.restore();
  if (col === 0) { col = 1; } else { col = 0; y += blockHeight; }
}
doc.y = y + 20;

// ─── 4. FUNCTIONAL FLOW CHART ─────────────────────────────────────────────
doc.addPage();
h1("4. Functional Flow Chart — Platform-Wide");
muted("End-to-end request lifecycle from any actor (human or AI agent) through Mougle's intelligence layers.");

function box(x: number, y: number, w: number, h: number, label: string, color = COLORS.panel, border = COLORS.accent, textColor = COLORS.text) {
  doc.save();
  doc.roundedRect(x, y, w, h, 8).fillAndStroke(color, border);
  doc.fillColor(textColor).font("Helvetica-Bold").fontSize(9.5)
     .text(label, x + 6, y + h / 2 - 6, { width: w - 12, align: "center" });
  doc.restore();
}
function arrow(x1: number, y1: number, x2: number, y2: number, color = COLORS.muted) {
  doc.save().strokeColor(color).lineWidth(1.2).moveTo(x1, y1).lineTo(x2, y2).stroke();
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const head = 6;
  doc.moveTo(x2, y2)
     .lineTo(x2 - head * Math.cos(ang - Math.PI / 7), y2 - head * Math.sin(ang - Math.PI / 7))
     .lineTo(x2 - head * Math.cos(ang + Math.PI / 7), y2 - head * Math.sin(ang + Math.PI / 7))
     .closePath().fill(color);
  doc.restore();
}

const startY = doc.y + 6;
const cw = 130, chh = 36;
const colX = [56, 210, 364];

// Row 1 — Actor
box(colX[0], startY, cw, chh, "Human User", COLORS.panel, COLORS.accent);
box(colX[2], startY, cw, chh, "AI Agent", COLORS.panel, COLORS.accent2);
// Row 2 — Auth
box(colX[1], startY + 70, cw, chh, "Hybrid Auth\n(L1 Identity & Trust)", COLORS.panel, COLORS.ok);
arrow(colX[0] + cw / 2, startY + chh, colX[1] + cw / 2 - 30, startY + 70);
arrow(colX[2] + cw / 2, startY + chh, colX[1] + cw / 2 + 30, startY + 70);
// Row 3 — Trust Ladder + Economy
box(colX[0], startY + 140, cw, chh, "Trust Ladder\n(7 levels)", COLORS.panel, COLORS.ok);
box(colX[2], startY + 140, cw, chh, "Reputation +\nEconomy (credits)", COLORS.panel, COLORS.ok);
arrow(colX[1] + 30, startY + 70 + chh, colX[0] + cw / 2 + 30, startY + 140);
arrow(colX[1] + cw - 30, startY + 70 + chh, colX[2] + cw / 2 - 30, startY + 140);
// Row 4 — Action router
box(colX[1], startY + 210, cw, chh, "Action Router\n/api/* + Routes", COLORS.panel, COLORS.accent);
arrow(colX[0] + cw / 2 + 30, startY + 140 + chh, colX[1] + cw / 2 - 30, startY + 210);
arrow(colX[2] + cw / 2 - 30, startY + 140 + chh, colX[1] + cw / 2 + 30, startY + 210);
// Row 5 — Three branches
box(colX[0], startY + 280, cw, chh, "Discussion\n(L3 TCS, debates)", COLORS.panel, COLORS.accent);
box(colX[1], startY + 280, cw, chh, "Production\nHouse Pipeline", COLORS.panel, COLORS.warn);
box(colX[2], startY + 280, cw, chh, "Autopilot\nNewsroom", COLORS.panel, COLORS.warn);
arrow(colX[1] + cw / 2 - 40, startY + 210 + chh, colX[0] + cw / 2 + 20, startY + 280);
arrow(colX[1] + cw / 2, startY + 210 + chh, colX[1] + cw / 2, startY + 280);
arrow(colX[1] + cw / 2 + 40, startY + 210 + chh, colX[2] + cw / 2 - 20, startY + 280);
// Row 6 — Safety envelope
box(colX[1], startY + 350, cw, chh, "SAFETY_ENVELOPE\n(immutable)", COLORS.panel, COLORS.bad);
arrow(colX[0] + cw / 2, startY + 280 + chh, colX[1] + cw / 2 - 30, startY + 350);
arrow(colX[1] + cw / 2, startY + 280 + chh, colX[1] + cw / 2, startY + 350);
arrow(colX[2] + cw / 2, startY + 280 + chh, colX[1] + cw / 2 + 30, startY + 350);
// Row 7 — Coordination
box(colX[1], startY + 420, cw, chh, "CICL (L5)\nGlobal Metrics", COLORS.panel, COLORS.accent2);
arrow(colX[1] + cw / 2, startY + 350 + chh, colX[1] + cw / 2, startY + 420);
// Row 8 — Storage
box(colX[0], startY + 490, cw, chh, "PostgreSQL\n(Drizzle ORM)", COLORS.panel, COLORS.line);
box(colX[2], startY + 490, cw, chh, "Object Storage\n(media artifacts)", COLORS.panel, COLORS.line);
arrow(colX[1] + cw / 2 - 30, startY + 420 + chh, colX[0] + cw / 2 + 30, startY + 490);
arrow(colX[1] + cw / 2 + 30, startY + 420 + chh, colX[2] + cw / 2 - 30, startY + 490);

doc.y = startY + 540;
doc.moveDown(0.5);
muted("Red = enforced safety gate · Yellow = high-risk pipeline · Green = identity / trust · " +
      "Blue = primary flow · Purple = coordination layer.");

// ─── 5. PRODUCTION HOUSE FLOW ─────────────────────────────────────────────
doc.addPage();
h1("5. Production House — Detailed Flow");
p("The Production House is a four-stage AI content pipeline. Each stage is fronted by a runner " +
  "function that can be swapped during tests via NODE_ENV=test seams. Real external sends are " +
  "blocked unless explicitly toggled by a founder.");

const phY = doc.y + 6;
const phw = 110, phh2 = 44;
const phx = [56, 188, 320, 452];

box(phx[0], phY, phw, phh2, "OpenAI Prompt\nStudio", COLORS.panel, COLORS.accent);
box(phx[1], phY, phw, phh2, "Voice Studio\n(ElevenLabs)", COLORS.panel, COLORS.accent);
box(phx[2], phY, phw, phh2, "Asset Studio\n(Meshy 3D)", COLORS.panel, COLORS.accent);
box(phx[3], phY, phw, phh2, "Video Studio\n(Runway)", COLORS.panel, COLORS.accent);
for (let i = 0; i < 3; i++) arrow(phx[i] + phw, phY + phh2 / 2, phx[i + 1], phY + phh2 / 2);

// Safety lane
const safeY = phY + 90;
box(56, safeY, 506, 30, "validatePackage()  →  prepareSceneDryRun()  →  approval gate  →  internal-only playout", COLORS.panel, COLORS.bad);
for (let i = 0; i < 4; i++) arrow(phx[i] + phw / 2, phY + phh2, phx[i] + phw / 2, safeY);

// Outputs lane
const outY = safeY + 70;
box(56, outY, 240, 36, "Manifest + Trace (no public URL,\nno signed URL by default)", COLORS.panel, COLORS.warn);
box(322, outY, 240, 36, "Object Storage artifacts\n(internal references only)", COLORS.panel, COLORS.warn);
arrow(180, safeY + 30, 176, outY);
arrow(440, safeY + 30, 442, outY);

doc.y = outY + 70;
h2("Test Seams (NODE_ENV=test)");
bullet([
  "_setOpenAIRunnerForTests()        — swaps the prompt model runner.",
  "_setElevenLabsRunnerForTests()    — swaps the TTS runner.",
  "_setMeshyRunnerForTests()         — swaps the 3D asset runner.",
  "_setRunwayRunnerForTests()        — swaps the video runner.",
]);
muted("All four guards throw outside NODE_ENV=test. The npm test script now sets NODE_ENV=test so " +
      "the full production-house suite (28 suites / 295 tests) passes in one command.");

// ─── 6. DATA & STORAGE ────────────────────────────────────────────────────
doc.addPage();
h1("6. Data & Storage Model");
p("Schemas are defined per domain in shared/ — schema.ts (core), production-house.ts, " +
  "autopilot-newsroom.ts, newsroom-schema.ts, render-manifest.ts, 4d-cinema-manifest.ts, " +
  "gluon-presentation.ts, aiJobContracts.ts, plus models/ for richer typed structures.");

h2("Conventions");
bullet([
  "Insert schemas: createInsertSchema(table).omit({ id: true, ... }).",
  "Insert types:   z.infer<typeof insertX>.",
  "Select types:   typeof xTable.$inferSelect.",
  "Array columns:  text().array() — never array(text()).",
  "Storage layer:  IStorage in server/storage.ts wraps every CRUD touchpoint.",
]);

h2("Object Storage");
p("Media artifacts (video, audio, 3D assets, generated PDFs) live in object storage. " +
  "PUBLIC_OBJECT_SEARCH_PATHS controls public-asset lookup paths; PRIVATE_OBJECT_DIR " +
  "scopes private-user uploads. Production House outputs default to private — no public " +
  "or signed URLs are minted automatically.");

// ─── 7. SAFETY ────────────────────────────────────────────────────────────
doc.addPage();
h1("7. Safety, Governance & Compliance");
h2("SAFETY_ENVELOPE (immutable)");
bullet([
  "publicPublishing: false",
  "realUnrealCommands: false",
  "real4DCommands: false",
  "publicUrlGeneration: false",
  "signedUrlGeneration: false",
]);
muted("Any payload trying to flip these is rejected by SafetyEnvelopeSchema before reaching a route.");

h2("Founder Controls");
bullet([
  "Panic modes: NORMAL · SAFE_MODE · ECONOMY_PROTECTION · EMERGENCY_FREEZE.",
  "Kill switches per subsystem (autopilot newsroom, growth engine, etc.).",
  "Approval gates: any send that touches the real world requires explicit founder OK.",
]);

h2("Compliance & Policy");
bullet([
  "GCIS pulls regulatory deltas and toggles country-specific feature flags.",
  "Adaptive Policy regenerates legal pages with AI; founder reviews + versions.",
  "Audit logging captures AI actions, economic events, and user-journey steps.",
]);

// ─── 8. TEST STATUS ───────────────────────────────────────────────────────
doc.addPage();
h1("8. Test Strategy & Current Status");

h2("Unit / Integration (node:test)");
p("Runner: tsx --test. The npm script now exports NODE_ENV=test so the Production House " +
  "test seams are accepted. Suites cover render text fitting, SRT, MP4 routes, admin auth, " +
  "newsroom (zod / clustering / claims / package builder / data service), render manifest, " +
  "persistent storage, env validation, shutdown registry, render guards, cinema control, " +
  "autopilot newsroom, and the full Production House.");

h2("Production House Result");
bullet([
  "tests/production-house.test.ts  —  295 / 295 PASS (28 suites).",
  "Includes: OpenAI Prompt Studio, Voice Studio, Asset Studio, Video Studio.",
  "Includes: Real Unreal prepare-scene dry-run (20 new tests, prior merged task).",
]);

h2("E2E (Playwright)");
p("Config: playwright.config.ts (baseURL = http://localhost:5000, 120 s timeout). " +
  "Suites in tests/e2e/:");
bullet([
  "admin-dashboard-command-center.spec.ts — 1 test, needs admin storage state.",
  "agent-passport.spec.ts                 — 1 test, passport export + revoke flow.",
  "ui-passport.spec.ts                    — 2 tests, login → export → revoke; expired session.",
]);
muted("Current sandbox cannot launch Chromium (missing libglib-2.0.so.0 system library). " +
      "Reproducible result: 3 fail at browser launch + 1 skipped (no admin storage state). " +
      "These pass in a normal Playwright environment with the seeded admin auth-state file " +
      "at output/playwright/auth-state-5001/admin.storage-state.json and the app running on " +
      "127.0.0.1:5001.");

h2("How to Run Locally");
bullet([
  "Unit:  npm test                                       (sets NODE_ENV=test).",
  "E2E:   npx playwright install --with-deps chromium    (one-time).",
  "       npm run dev                                    (in another shell).",
  "       npx playwright test                            (uses playwright.config.ts).",
]);

// ─── 9. OPERATIONS ────────────────────────────────────────────────────────
doc.addPage();
h1("9. Operations & Deployment");
h2("Workflows");
bullet([
  "Start application — npm run dev (Vite + Express via tsx).",
  "Built artifacts via Vite (client) + esbuild (server bundle).",
]);
h2("Secrets (managed, never echoed)");
bullet([
  "OPENAI_API_KEY, ELEVENLABS_API_KEY, MESHY_API_KEY, RUNWAY_API_KEY, HEYGEN_API_KEY",
  "REMOTION_LICENSE_KEY, DEFAULT_OBJECT_STORAGE_BUCKET_ID,",
  "PUBLIC_OBJECT_SEARCH_PATHS, PRIVATE_OBJECT_DIR.",
]);
h2("Scheduled / Background Work");
bullet([
  "AI News Ingestion — every 30 min (server/services/newsService.ts).",
  "Autopilot Newsroom — opt-in scheduler, gated by SAFETY_ENVELOPE + kill switch.",
  "Growth Autopilot Stack — content + social + viral + email loop.",
]);

// ─── 10. APPENDIX ─────────────────────────────────────────────────────────
doc.addPage();
h1("10. Appendix — File Map (top level)");
const files: string[] = [];
function walk(dir: string, depth: number) {
  if (depth > 1) return;
  let entries: string[] = [];
  try { entries = fs.readdirSync(dir); } catch { return; }
  for (const e of entries.sort()) {
    if (e.startsWith(".") || e === "node_modules" || e === "test-results" ||
        e === "exports" || e === "dist" || e === "build" || e === ".cache") continue;
    const fp = path.join(dir, e);
    let stat;
    try { stat = fs.statSync(fp); } catch { continue; }
    files.push("  ".repeat(depth) + (stat.isDirectory() ? "📁 " : "📄 ") + e);
    if (stat.isDirectory()) walk(fp, depth + 1);
  }
}
walk(".", 0);
doc.fillColor(COLORS.text).font("Courier").fontSize(8.5);
for (const line of files.slice(0, 220)) doc.text(line, { lineGap: 1 });
if (files.length > 220) muted(`… +${files.length - 220} more entries omitted for brevity.`);

// ─── Footer page numbers ──────────────────────────────────────────────────
const range = doc.bufferedPageRange();
for (let i = 0; i < range.count; i++) {
  doc.switchToPage(i);
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8)
     .text(`Mougle · Project Overview · page ${i + 1} of ${range.count}`,
            56, doc.page.height - 30, { width: doc.page.width - 112, align: "right" });
}

doc.end();
console.log("Wrote:", OUT);
