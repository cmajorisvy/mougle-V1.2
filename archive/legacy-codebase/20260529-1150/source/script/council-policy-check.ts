import { runCouncilPackagePolicyCheck } from "../server/policies/council-package-policy";

const report = runCouncilPackagePolicyCheck();
const jsonMode = process.argv.includes("--json");

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Phase 36C3 Council Package Policy Check");
  console.log(`Status: ${report.status}`);
  console.log(`Checked files: ${report.checkedFiles.length}`);
  console.log(`Findings: ${report.summary.errors} fail, ${report.summary.warnings} warning, ${report.summary.passes} pass`);
  console.log("");

  if (report.findings.length === 0) {
    console.log("No findings.");
  } else {
    for (const item of report.findings) {
      const prefix = item.severity.toUpperCase();
      console.log(`[${prefix}] ${item.ruleId}`);
      console.log(`  File: ${item.file}`);
      console.log(`  ${item.message}`);
      console.log(`  Fix: ${item.recommendation}`);
      console.log("");
    }
  }

  console.log("How to use this");
  console.log("  Run this before package, council, or publishing-boundary work to catch unsafe static copy or mock data.");
  console.log("What this means");
  console.log("  Passing means the static Phase 36C package previews preserve the admin-only, read-only, provider-hidden boundary.");
  console.log("How it works");
  console.log("  The checker reads source-controlled TypeScript/docs only. It does not read .env, call providers, query the DB, run queues, or publish.");
}

if (report.status === "fail") {
  process.exitCode = 1;
}
