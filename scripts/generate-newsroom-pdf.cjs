const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const OUT = path.resolve(__dirname, "..", "downloads", "MOUGLE_NEWSROOM_ARCHITECTURE.pdf");
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const doc = new PDFDocument({ size: "A4", margin: 56, info: {
  Title: "Mougle Newsroom — Functional Flow & Data Structures",
  Author: "Mougle Platform",
  Subject: "Backend-derived newsroom architecture",
}});
doc.pipe(fs.createWriteStream(OUT));

const C = { ink: "#111111", mute: "#555555", rule: "#dddddd", accent: "#1f4ed8", bg: "#f4f6fb", code: "#0b1020" };

function ensureSpace(h) { if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage(); }
function h1(t) { ensureSpace(60); doc.moveDown(0.4); doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(20).text(t); doc.moveTo(doc.page.margins.left, doc.y + 2).lineTo(doc.page.width - doc.page.margins.right, doc.y + 2).strokeColor(C.accent).lineWidth(1.2).stroke(); doc.moveDown(0.6); }
function h2(t) { ensureSpace(40); doc.moveDown(0.4); doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(14).text(t); doc.moveDown(0.3); }
function h3(t) { ensureSpace(28); doc.moveDown(0.3); doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(11.5).text(t); doc.moveDown(0.2); }
function p(t)  { doc.fillColor(C.ink).font("Helvetica").fontSize(10.2).text(t, { align: "left", lineGap: 2 }); doc.moveDown(0.3); }
function bullet(t){ doc.fillColor(C.ink).font("Helvetica").fontSize(10.2).text("•  " + t, { indent: 6, lineGap: 2 }); }
function muted(t){ doc.fillColor(C.mute).font("Helvetica-Oblique").fontSize(9.5).text(t); doc.fillColor(C.ink); doc.moveDown(0.3); }
function code(block) {
  const lines = block.split("\n");
  const lh = 11.5;
  const padding = 8;
  const boxH = lines.length * lh + padding * 2;
  ensureSpace(boxH + 6);
  const x = doc.page.margins.left, y = doc.y, w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.save().rect(x, y, w, boxH).fill(C.code).restore();
  doc.fillColor("#e6e8ef").font("Courier").fontSize(8.6);
  let yy = y + padding;
  for (const line of lines) { doc.text(line, x + padding, yy, { width: w - padding * 2, lineBreak: false }); yy += lh; }
  doc.y = y + boxH + 6; doc.fillColor(C.ink);
}
function table(headers, rows, widths) {
  const x0 = doc.page.margins.left;
  const totalW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const sum = widths.reduce((a,b)=>a+b,0);
  const cols = widths.map(w => (w/sum)*totalW);
  const rowH = (cells, font, size) => {
    doc.font(font).fontSize(size);
    let max = 0;
    cells.forEach((c, i) => { const h = doc.heightOfString(String(c), { width: cols[i] - 8 }); if (h > max) max = h; });
    return max + 8;
  };
  const drawRow = (cells, font, size, fill) => {
    const h = rowH(cells, font, size);
    ensureSpace(h + 2);
    const y = doc.y;
    if (fill) { doc.save().rect(x0, y, totalW, h).fill(fill).restore(); }
    doc.fillColor(C.ink).font(font).fontSize(size);
    let cx = x0;
    cells.forEach((c, i) => { doc.text(String(c), cx + 4, y + 4, { width: cols[i] - 8 }); cx += cols[i]; });
    doc.strokeColor(C.rule).lineWidth(0.5).moveTo(x0, y + h).lineTo(x0 + totalW, y + h).stroke();
    doc.y = y + h;
  };
  drawRow(headers, "Helvetica-Bold", 9.5, C.bg);
  rows.forEach(r => drawRow(r, "Helvetica", 9, null));
  doc.moveDown(0.4);
}

doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(26).text("Mougle Newsroom");
doc.fillColor(C.accent).font("Helvetica-Bold").fontSize(14).text("Functional Flow & Data Structures");
doc.moveDown(0.3);
doc.fillColor(C.mute).font("Helvetica").fontSize(10).text("Derived from the live backend: server/services/news*, server/services/newsroom/*, server/routes/*newsroom*, and shared/schema.ts.");
doc.moveDown(0.2);
doc.text(new Date().toISOString().slice(0,10));
doc.moveDown(1);

h1("1. High-Level Functional Flow");
p("The newsroom is a multi-stage pipeline that turns raw RSS items into Verified Knowledge, which downstream services (debates, podcasts, videos, social posts) consume. Each stage owns one responsibility and writes to a specific table or in-memory queue.");
code(
`RSS feeds (10 sources: OpenAI, DeepMind, MIT TR, VentureBeat,
            TechCrunch, The Verge, HuggingFace, NVIDIA,
            Stanford HAI, arXiv AI)
            |  every 30-60 min
            v
[1] INGESTION ............ news-pipeline-service.ts
            |  raw rows in news_articles
            v
[2] PROCESSING (AI) ...... gpt-5.5: summary, SEO, classify
            |  status='processed'
            v
[3] BREAKING EVAL ........ breaking-news-agent.ts (impact 0-100)
            v
[4] CLUSTERING ........... newsroom/clusteringService.ts
            |  EventCluster
            v
[5] CLAIM EXTRACTION ..... newsroom/claimExtractionService.ts
            |  ClusterExtraction
            v
[6] VERIFICATION GATE .... newsroom-data-package-service.ts
            |  human root-admin -> verified_knowledge
            v
[7] PACKAGING ............ newsroom/newsroomDataPackageBuilder.ts
            |  DataPackagePayload
            v
[8] AUTOPILOT DISPATCH ... continuousNewsroomScheduler.ts
                           + autopilotDecisionService.ts (safety)
            |        |          |             |
            v        v          v             v
         Debate   Podcast    Avatar Video   Social
         pipeline script eng  render svc    distribution`);

h1("2. Stage-by-Stage Reference");
table(
  ["#", "Stage", "Service file", "AI model", "Tables R/W"],
  [
    ["1","Ingestion","newsService.ts / news-pipeline-service.ts","—","news_articles (W)"],
    ["2","Processing","news-pipeline-service.ts","gpt-5.5","news_articles (R/W)"],
    ["3","Breaking eval","breaking-news-agent.ts","gpt-5.5","news_articles (R/W)"],
    ["4","Clustering","newsroom/clusteringService.ts","extractor","news_articles (R)"],
    ["5","Claim extraction","newsroom/claimExtractionService.ts","extractor","in-memory"],
    ["6","Verification gate","newsroom-data-package-service.ts","— (human)","verified_knowledge, verified_claims, verified_timeline_events (W)"],
    ["7","Packaging","newsroom/newsroomDataPackageBuilder.ts","—","verified_* (R)"],
    ["8","Autopilot dispatch","continuousNewsroomScheduler.ts + autopilotDecisionService.ts","—","downstream tables + state"],
  ],
  [0.5, 2.2, 4.5, 1.8, 3.5]
);

h1("3. Trust & Safety Gates (in order)");
[
  "Deduplication — URL + title hash (news-pipeline-service.ts).",
  "Classification — AI category (research / product / funding / policy / open-source / breakthrough).",
  "Impact scoring — breaking-news-agent.ts, 0–100; >80 triggers breaking flag.",
  "Clustering — Jaccard similarity + time window.",
  "Claim extraction — lexical extraction + dispute detection.",
  "TCS (Trust Confidence Score) — trust-engine.ts on extracted claims.",
  "Content moderation — global middleware (blocked terms, spammers).",
  "Root-admin verification — hard gate; nothing reaches autopilot/public without verified_knowledge.status='verified'.",
  "Autopilot decision — re-checks rate limits, dry-run flag, kill-switch.",
].forEach(bullet);
doc.moveDown(0.4);

h1("4. Data Structures");

h2("4.1  news_articles  (primary ingestion table)");
table(["Column","Type","Notes"],[
  ["id","uuid PK",""],
  ["title","text","AI-rewritten headline"],
  ["slug","text unique","drives /api/news/:slug"],
  ["originalTitle / originalContent","text","RSS source body"],
  ["summary","text","2-sentence AI summary"],
  ["content","text","normalized body"],
  ["seoBlog","text","long-form SEO draft"],
  ["script","text","short video/podcast script seed"],
  ["hashtags","text[]","for social distribution"],
  ["category","text","research/product/funding/policy/open-source/breakthrough"],
  ["imageUrl","text","hero image"],
  ["sourceUrl / sourceName / sourceType","text","provenance"],
  ["status","text","raw -> processed -> published"],
  ["impactScore","int","0–100"],
  ["isBreakingNews","bool","impactScore > 80"],
  ["debateId","uuid FK -> live_debates.id","set when converted"],
  ["publishedAt","timestamp",""],
],[3, 2.6, 4.4]);

h2("4.2  Engagement tables");
p("news_comments, news_reactions, news_shares. news_comments.commentType is one of {verification, expert, critic} and is AI-tagged.");

h2("4.3  verified_sources");
p("Reliability registry: sourceName, domain, tier (A/B/C), baseScore. Feeds TCS.");

h2("4.4  verified_knowledge  (immutable canonical story)");
table(["Column","Type","Notes"],[
  ["id","uuid PK",""],
  ["clusterId","text","upstream cluster ref"],
  ["status","text","draft / verified / retracted"],
  ["canonicalTitle / canonicalSummary","text","one-true headline + summary"],
  ["keyFacts","jsonb","array of fact objects"],
  ["confidence","jsonb","per-fact scores"],
  ["sourceCoverage","jsonb","sources confirming/disputing"],
  ["approvedBy","uuid FK -> users","root-admin signer"],
],[3.4, 2.4, 4.2]);

h2("4.5  verified_claims");
table(["Column","Type","Notes"],[
  ["id","uuid PK",""],
  ["verifiedKnowledgeId","FK",""],
  ["clusterId","text",""],
  ["statement","text","single fact claim"],
  ["verdict","text","confirmed / disputed / unverified"],
  ["evidence","jsonb","sources, quotes, links"],
],[3, 2, 5]);

h2("4.6  verified_timeline_events");
p("Append-only history per verifiedKnowledgeId. eventType is one of {anchor, update, correction}.");

h2("4.7  verified_media_references");
p("Image / clip references with rights status. Consumed by avatar video render.");

h2("4.8  podcast_script_packages  (downstream join)");
table(["Column","Notes"],[
  ["id","PK"],
  ["debateId","FK -> live_debates.id"],
  ["sourceArticleId","FK -> news_articles.id"],
  ["status","draft / approved / rendered"],
  ["scriptPackage","jsonb (2-min brief + 10-min script)"],
],[3, 7]);

h1("5. API Surface");

h2("5.1  Public");
table(["Method","Path","Purpose"],[
  ["GET","/api/news","list published articles"],
  ["GET","/api/news/:slug","article detail"],
],[1.2, 4, 4.8]);

h2("5.2  Admin (gated)");
table(["Method","Path","Gate","Purpose"],[
  ["POST","/api/news/trigger","requireAnyAdminPermission(['content:manage','news:manage'])","manual RSS pipeline run"],
  ["POST","/api/admin/news-to-debate/generate","requireRootAdmin","convert article -> debate draft"],
  ["POST","/api/admin/podcast-scripts/generate","requireRootAdmin","convert debate -> podcast package"],
  ["GET","/api/admin/autopilot/status","requireRootAdmin","24/7 newsroom state"],
  ["POST","/api/admin/autopilot/start","requireRootAdmin","start continuous scheduler"],
  ["POST","/api/admin/autopilot/kill-switch","requireRootAdmin","emergency stop"],
],[1.1, 4.4, 3.6, 3.5]);
muted("All POSTs sit behind global csrfMiddleware first, then the admin gate. Anonymous POST without a CSRF token returns 403 from CSRF; with a token but no admin session returns 401 from the admin gate.");

h1("6. Downstream Join Points");
table(["Downstream","Service","Joined via","Result"],[
  ["Debate","news-to-debate-service.ts","news_articles.id -> live_debates.sourceArticleId","draft debate, agents picked by category"],
  ["Podcast","podcast-script-engine.ts","live_debates.id + news_articles.id","podcast_script_packages row"],
  ["Video","avatar-video-render-service.ts","scriptPackageId + audioJobId + verified_media_references","render job"],
  ["Social","social-distribution-service.ts","listens for new knowledgePages / news_articles","per-platform post draft"],
],[1.5, 3.2, 4.5, 3.4]);

h1("7. Schedulers");
table(["Loop","Owner","Interval","Notes"],[
  ["RSS fetch","newsService.ts","30 min","startup-registered"],
  ["Pipeline drain","news-pipeline-service.ts","continuous","processes status='raw'"],
  ["Continuous newsroom","newsroom/continuousNewsroomScheduler.ts","configurable","autopilot loop; respects kill-switch"],
],[2.2, 3.6, 2.2, 4.5]);

h1("8. Failure & Safety Behavior");
[
  "Dedupe collision -> row skipped, counter incremented.",
  "AI call failure -> article stays at status='raw'; retried next pass.",
  "Verification missing -> no autopilot dispatch, no public exposure.",
  "Kill-switch ON -> scheduler skips all downstream dispatch but ingestion continues.",
  "Dry-run mode -> downstream jobs enqueued but marked dryRun=true; no external publish.",
].forEach(bullet);
doc.moveDown(0.5);
muted("Re-generate this document whenever a new stage, table, or downstream consumer is added.");

const range = doc.bufferedPageRange ? doc.bufferedPageRange() : { start: 0, count: doc._pageBuffer ? doc._pageBuffer.length : 1 };
doc.end();
doc.on("end", () => console.log("OK", OUT));
console.log("writing", OUT);
