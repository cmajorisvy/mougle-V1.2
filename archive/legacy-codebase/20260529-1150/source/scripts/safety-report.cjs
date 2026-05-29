#!/usr/bin/env node
/* Safety E2E report generator.
 *
 * Reads a JSON results payload from stdin (or a file path argv[2]) of the
 * shape:
 *
 *   {
 *     "generatedAt": "2026-...Z",
 *     "gates": [
 *       { "id": "licensed_media_only", "status": "pass"|"fail", "details": "...", "fixtures": ["fix_..."] },
 *       ...
 *     ]
 *   }
 *
 * Writes a Markdown report to docs/SAFETY_E2E_REPORT.md.
 */
"use strict";

const fs = require("fs");
const path = require("path");

function renderReport(payload) {
  const lines = [];
  lines.push("# Newsroom Safety — End-to-End Report");
  lines.push("");
  lines.push(`Generated at: \`${payload.generatedAt}\``);
  lines.push("");
  const total = payload.gates.length;
  const passed = payload.gates.filter((g) => g.status === "pass").length;
  const failed = total - passed;
  lines.push(`**Result:** ${passed}/${total} gates passing` + (failed ? ` — ${failed} failing` : ""));
  lines.push("");
  lines.push("## Universal Gates");
  lines.push("");
  lines.push("| # | Gate | Status | Details |");
  lines.push("|---|------|--------|---------|");
  payload.gates.forEach((g, i) => {
    const icon = g.status === "pass" ? "PASS" : "FAIL";
    const details = (g.details || "").replace(/\|/g, "\\|").replace(/\n+/g, " ");
    lines.push(`| ${i + 1} | \`${g.id}\` | ${icon} | ${details} |`);
  });
  lines.push("");
  if (Array.isArray(payload.fixtures) && payload.fixtures.length) {
    lines.push("## Adversarial Fixtures");
    lines.push("");
    lines.push("| Fixture | Adversarial | Expected Gate | Rejected At | Outcome |");
    lines.push("|---------|-------------|---------------|-------------|---------|");
    payload.fixtures.forEach((f) => {
      lines.push(
        `| \`${f.id}\` | ${f.adversarial ? "yes" : "no"} | ${f.expectGate ? `\`${f.expectGate}\`` : "—"} | ${f.rejectAtStage || "—"} | ${f.outcome} |`,
      );
    });
    lines.push("");
  }
  lines.push("## Notes");
  lines.push("");
  lines.push(
    "This report is regenerated on every `npm test` run by `tests/safety/e2e-newsroom.test.ts`. " +
      "Each gate corresponds to one of the ten universal safety IDs declared in `shared/safety-types.ts`. " +
      "Failures here MUST block merge.",
  );
  lines.push("");
  return lines.join("\n");
}

function main() {
  const src = process.argv[2];
  let raw;
  if (src) {
    raw = fs.readFileSync(src, "utf8");
  } else {
    raw = fs.readFileSync(0, "utf8");
  }
  const payload = JSON.parse(raw);
  const out = path.resolve(process.cwd(), "docs/SAFETY_E2E_REPORT.md");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, renderReport(payload), "utf8");
  process.stdout.write(`safety-report: wrote ${out}\n`);
}

if (require.main === module) main();

module.exports = { renderReport };
