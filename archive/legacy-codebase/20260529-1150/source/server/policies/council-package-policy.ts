import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  councilGovernanceOverview,
  debateCouncilAgents,
  newsVerificationCouncilAgents,
  sampleDebatePackage,
  sampleLedgerEntries,
  sampleNewsPackage,
} from "../data/council-governance-registry";
import { runLocalFakeAdapterDryRun, sampleLocalFakeAdapterDryRunRequest } from "../services/council-fake-adapter-service";
import type {
  CouncilAgentSlot,
  CouncilDecisionLedgerEntry,
  DebateContentPackage,
  LocalFakeAdapterDryRunResponse,
  NewsContentPackage,
} from "@shared/models/council-governance";
import type { CouncilPackagePolicyReport, PolicyFinding, PolicySeverity } from "@shared/models/council-policy";

type FindingInput = Omit<PolicyFinding, "severity"> & {
  severity?: PolicySeverity;
};

const checkedFiles = [
  "shared/models/council-governance.ts",
  "shared/models/council-policy.ts",
  "server/data/council-governance-registry.ts",
  "server/services/council-governance-service.ts",
  "server/services/council-fake-adapter-service.ts",
  "server/policies/council-package-policy.ts",
  "client/src/pages/admin/CouncilGovernance.tsx",
  "docs/architecture/PHASE_36C_NEWS_DEBATE_COUNCILS.md",
  "docs/architecture/PHASE_36C3_STATIC_POLICY_VALIDATION_SPEC.md",
  "docs/architecture/PHASE_36C4_EVENT_WORKER_ARCHITECTURE_PLAN.md",
  "docs/architecture/PHASE_36C5_PROVIDER_ADAPTER_CONTRACTS.md",
  "docs/architecture/PHASE_36C6_MANUAL_GATED_PROVIDER_PILOT_GOVERNANCE_PLAN.md",
  "docs/architecture/PHASE_36C_REMAINING_ROADMAP_PROMPTS.md",
  "docs/learning/PHASE_36C_NEWS_DEBATE_EXPLAINER_SCRIPT.md",
];

const redactionScanFiles = [
  "shared/models/council-governance.ts",
  "server/data/council-governance-registry.ts",
  "server/services/council-governance-service.ts",
  "server/services/council-fake-adapter-service.ts",
  "client/src/pages/admin/CouncilGovernance.tsx",
  "docs/learning/PHASE_36C_NEWS_DEBATE_EXPLAINER_SCRIPT.md",
];

const providerDisclosureTerms = [
  /\bGPT\b/i,
  /\bAnthropic\b/i,
  /\bClaude\b/i,
  /\bGrok\b/i,
  /\bGemini\b/i,
  /\bCopilot\b/i,
  /\bOpenAI\b/i,
  /powered by/i,
  /model version/i,
  /provider route/i,
  /API provider/i,
  /routed through/i,
];

const unsafePublishTerms = [
  /automatically publishes/i,
  /automatically posts/i,
  /autonomous publishing/i,
  /auto-publish/i,
  /live provider active/i,
  /provider calls are active/i,
  /guaranteed truth/i,
  /no risk/i,
];

const copyRiskTerms = [
  /copies source/i,
  /copy source/i,
  /rewrite source article/i,
  /rewrites source article/i,
  /remake source video/i,
  /remakes source video/i,
  /reuse third-party footage/i,
  /uses copyrighted footage/i,
];

const redactionWallForbiddenFields = [
  "providerName",
  "modelName",
  "modelVersion",
  "endpoint",
  "apiKey",
  "organizationId",
  "projectId",
  "routingPolicy",
  "fallbackProvider",
  "fallbackModel",
  "rawResponse",
  "rawPrompt",
  "rawCompletion",
  "rawProviderError",
  "providerTokenUsage",
  "environmentValue",
];

const allowlistedProviderFiles = new Set<string>();
const ruleDefinitionFiles = new Set<string>([
  "server/policies/council-package-policy.ts",
  "docs/architecture/PHASE_36C3_STATIC_POLICY_VALIDATION_SPEC.md",
  "docs/architecture/PHASE_36C4_EVENT_WORKER_ARCHITECTURE_PLAN.md",
  "docs/architecture/PHASE_36C5_PROVIDER_ADAPTER_CONTRACTS.md",
  "docs/architecture/PHASE_36C6_MANUAL_GATED_PROVIDER_PILOT_GOVERNANCE_PLAN.md",
  "docs/architecture/PHASE_36C_REMAINING_ROADMAP_PROMPTS.md",
]);

const safeNegationTerms = [
  "no ",
  "not ",
  "must not",
  "does not",
  "do not",
  "avoid",
  "block",
  "blocked",
  "fail if",
  "non-goal",
  "non-goals",
  "unsafe",
  "future ci/static policy checks should block",
];

function finding(input: FindingInput): PolicyFinding {
  return {
    severity: input.severity ?? "fail",
    ruleId: input.ruleId,
    file: input.file,
    message: input.message,
    recommendation: input.recommendation,
  };
}

function pass(ruleId: string, file: string, message: string): PolicyFinding {
  return finding({
    ruleId,
    severity: "pass",
    file,
    message,
    recommendation: "No action required.",
  });
}

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function isScore(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value >= 0 && value <= 1);
}

function validateCommonPackage(pkg: NewsContentPackage | DebateContentPackage, file: string): PolicyFinding[] {
  const findings: PolicyFinding[] = [];

  if (pkg.sourceCount < 0) {
    findings.push(
      finding({
        ruleId: "package.source_count_non_negative",
        file,
        message: `${pkg.schemaType} has a negative sourceCount.`,
        recommendation: "Use a non-negative source count for static package previews.",
      }),
    );
  }

  if (!isScore(pkg.MougleChiefScore) || pkg.MougleChiefScore === null) {
    findings.push(
      finding({
        ruleId: "package.chief_score_range",
        file,
        message: `${pkg.schemaType} MougleChiefScore must be between 0 and 1.`,
        recommendation: "Keep mock chief scores normalized between 0 and 1.",
      }),
    );
  }

  if (!isScore(pkg.TCS) || !isScore(pkg.UES)) {
    findings.push(
      finding({
        ruleId: "package.truth_scores_range",
        file,
        message: `${pkg.schemaType} TCS/UES must be null or between 0 and 1.`,
        recommendation: "Use null when a score is unavailable, or a normalized 0-1 value when attached.",
      }),
    );
  }

  if (pkg.publishDecision !== "publish_decision_required") {
    findings.push(
      finding({
        ruleId: "publish_gate.required",
        file,
        message: `${pkg.schemaType} does not preserve Publish Decision Required.`,
        recommendation: "Keep static previews gated unless deliberately blocked or rejected in a future approved flow.",
      }),
    );
  }

  if (pkg.chiefDecision !== "publish_decision_required") {
    findings.push(
      finding({
        ruleId: "publish_gate.chief_decision_required",
        file,
        message: `${pkg.schemaType} chiefDecision is not gated by Publish Decision Required.`,
        recommendation: "Keep chief decisions gated in mock previews.",
      }),
    );
  }

  const joinedTargets = pkg.publishTargets.join(" ");
  if (!/planned|configured/i.test(joinedTargets)) {
    findings.push(
      finding({
        ruleId: "publish_gate.planned_targets",
        severity: "warning",
        file,
        message: `${pkg.schemaType} publishTargets do not clearly use planned/configured language.`,
        recommendation: "Use planned/configured target wording until real publish workflows are explicitly approved.",
      }),
    );
  }

  if (pkg.originalityStatus !== "original" && pkg.originalityStatus !== "reference_safe") {
    findings.push(
      finding({
        ruleId: "rights_gate.originality_ready",
        severity: "warning",
        file,
        message: `${pkg.schemaType} originalityStatus is ${pkg.originalityStatus}.`,
        recommendation: "Keep package previews visibly blocked or rewrite-required when originality is not safe.",
      }),
    );
  }

  if (!pkg.copyrightRisk.trim()) {
    findings.push(
      finding({
        ruleId: "rights_gate.copyright_risk_present",
        file,
        message: `${pkg.schemaType} is missing copyrightRisk copy.`,
        recommendation: "Add a clear copyright-risk summary to every package preview.",
      }),
    );
  }

  if (!pkg.evidenceReferences.length || !pkg.claimSummary.length) {
    findings.push(
      finding({
        ruleId: "evidence.trace_present",
        file,
        message: `${pkg.schemaType} is missing evidence references or claim summary.`,
        recommendation: "Keep evidence references and claim summaries visible in package previews.",
      }),
    );
  }

  return findings;
}

function validateNewsPackage(pkg: NewsContentPackage): PolicyFinding[] {
  const findings = validateCommonPackage(pkg, "server/data/council-governance-registry.ts");

  if (pkg.schemaType !== "NewsContentPackage") {
    findings.push(
      finding({
        ruleId: "package.news_schema_type",
        file: "server/data/council-governance-registry.ts",
        message: "News package schemaType does not match NewsContentPackage.",
        recommendation: "Set news mock package schemaType to NewsContentPackage.",
      }),
    );
  }

  if (pkg.sourceTier === "tier_4_social_signal" && pkg.verificationStatus === "verified") {
    findings.push(
      finding({
        ruleId: "source_tier.social_not_verified_fact",
        file: "server/data/council-governance-registry.ts",
        message: "News package treats a social signal tier as verified.",
        recommendation: "Social signals may show trend attention but must not support verified fact labels alone.",
      }),
    );
  }

  if (!/trend|social/i.test(pkg.socialTrendSummary)) {
    findings.push(
      finding({
        ruleId: "truth_meaning.social_signal_separation",
        severity: "warning",
        file: "server/data/council-governance-registry.ts",
        message: "News package socialTrendSummary does not clearly label trend/social context.",
        recommendation: "Keep social attention separate from verified fact in news package copy.",
      }),
    );
  }

  return findings;
}

function validateDebatePackage(pkg: DebateContentPackage): PolicyFinding[] {
  const findings = validateCommonPackage(pkg, "server/data/council-governance-registry.ts");

  if (pkg.schemaType !== "DebateContentPackage") {
    findings.push(
      finding({
        ruleId: "package.debate_schema_type",
        file: "server/data/council-governance-registry.ts",
        message: "Debate package schemaType does not match DebateContentPackage.",
        recommendation: "Set debate mock package schemaType to DebateContentPackage.",
      }),
    );
  }

  if (!pkg.positions.length || !pkg.unresolvedQuestions.length) {
    findings.push(
      finding({
        ruleId: "truth_meaning.debate_structure",
        file: "server/data/council-governance-registry.ts",
        message: "Debate package is missing positions or unresolved questions.",
        recommendation: "Keep debate packages focused on strongest positions, consensus, disagreement, and unresolved questions.",
      }),
    );
  }

  return findings;
}

function validateAgents(agents: CouncilAgentSlot[], councilName: string): PolicyFinding[] {
  const findings: PolicyFinding[] = [];

  for (const agent of agents) {
    if (agent.providerDisclosurePolicy !== "never_disclose_provider") {
      findings.push(
        finding({
          ruleId: "provider.disclosure_policy",
          file: "server/data/council-governance-registry.ts",
          message: `${agent.publicDisplayName} in ${councilName} does not use never_disclose_provider.`,
          recommendation: "Keep council slots provider-abstracted and hidden from public/product surfaces.",
        }),
      );
    }

    if (agent.publicDisplayName.includes("-") || agent.publicDisplayName.includes("_")) {
      findings.push(
        finding({
          ruleId: "agent.robot_name_primary",
          severity: "warning",
          file: "server/data/council-governance-registry.ts",
          message: `${agent.publicDisplayName} looks like a machine slot rather than a robot-style council name.`,
          recommendation: "Use memorable robot-style display names as primary identities.",
        }),
      );
    }
  }

  return findings;
}

function validateLedger(entries: CouncilDecisionLedgerEntry[]): PolicyFinding[] {
  const findings: PolicyFinding[] = [];

  for (const entry of entries) {
    if (entry.finalChiefDecision !== "publish_decision_required") {
      findings.push(
        finding({
          ruleId: "ledger.publish_decision_required",
          file: "server/data/council-governance-registry.ts",
          message: `${entry.packageId} ledger entry is not gated by Publish Decision Required.`,
          recommendation: "Keep sample ledger entries gated until a future approved publish workflow exists.",
        }),
      );
    }

    if (!entry.evidenceUsed.length) {
      findings.push(
        finding({
          ruleId: "ledger.evidence_trace",
          file: "server/data/council-governance-registry.ts",
          message: `${entry.packageId} ledger entry has no evidence trace.`,
          recommendation: "Every ledger preview should reference evidence used by the council slot.",
        }),
      );
    }
  }

  return findings;
}

function validateFakeAdapterOutput(output: LocalFakeAdapterDryRunResponse): PolicyFinding[] {
  const findings: PolicyFinding[] = [];

  if (output.publishDecision !== "publish_decision_required") {
    findings.push(
      finding({
        ruleId: "fake_adapter.publish_gate",
        file: "server/services/council-fake-adapter-service.ts",
        message: "Local fake adapter output does not preserve Publish Decision Required.",
        recommendation: "Keep fake adapter output gated and non-publishing.",
      }),
    );
  }

  if (output.redactionStatus !== "passed") {
    findings.push(
      finding({
        ruleId: "fake_adapter.redaction_status",
        file: "server/services/council-fake-adapter-service.ts",
        message: "Local fake adapter output did not pass redaction.",
        recommendation: "Only expose normalized, redacted council output.",
      }),
    );
  }

  if (output.adminReviewStatus !== "waiting_for_admin_review") {
    findings.push(
      finding({
        ruleId: "fake_adapter.admin_review_required",
        file: "server/services/council-fake-adapter-service.ts",
        message: "Local fake adapter output is not waiting for admin review.",
        recommendation: "Keep fake adapter output admin-review-only.",
      }),
    );
  }

  if (!isScore(output.confidence) || output.confidence === null) {
    findings.push(
      finding({
        ruleId: "fake_adapter.confidence_range",
        file: "server/services/council-fake-adapter-service.ts",
        message: "Local fake adapter confidence must be between 0 and 1.",
        recommendation: "Keep fake adapter confidence normalized.",
      }),
    );
  }

  return findings;
}

function validateFileText(relativePath: string): PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  if (ruleDefinitionFiles.has(relativePath)) {
    return findings;
  }

  const text = readProjectFile(relativePath);
  const lines = text.split(/\r?\n/);

  if (!allowlistedProviderFiles.has(relativePath)) {
    for (const [index, line] of lines.entries()) {
      if (isNegatedSafetyContext(line)) continue;
      for (const pattern of providerDisclosureTerms) {
        if (pattern.test(line)) {
          findings.push(
            finding({
              ruleId: "provider.no_disclosure_terms",
              file: relativePath,
              message: `Provider/model disclosure pattern matched on line ${index + 1}: ${pattern.source}`,
              recommendation: "Use provider-abstracted council language and keep provider/model details internal-only.",
            }),
          );
        }
      }
    }
  }

  for (const [index, line] of lines.entries()) {
    if (isNegatedSafetyContext(line)) continue;
    for (const pattern of unsafePublishTerms) {
      if (pattern.test(line)) {
        findings.push(
          finding({
            ruleId: "publish.no_active_or_autonomous_claims",
            file: relativePath,
            message: `Unsafe publish/live claim matched on line ${index + 1}: ${pattern.source}`,
            recommendation: "Use live-ready, planned/configured target, and Publish Decision Required language.",
          }),
        );
      }
    }
  }

  for (const [index, line] of lines.entries()) {
    if (isNegatedSafetyContext(line)) continue;
    for (const pattern of copyRiskTerms) {
      if (pattern.test(line)) {
        findings.push(
          finding({
            ruleId: "rights.no_copy_or_rewrite_claims",
            file: relativePath,
            message: `Unsafe copy/rewrite claim matched on line ${index + 1}: ${pattern.source}`,
            recommendation: "Say facts may be used after verification, while expression and final packages must be original to Mougle.",
          }),
        );
      }
    }
  }

  return findings;
}

function validateRedactionWallFile(relativePath: string): PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  const text = readProjectFile(relativePath);
  const lines = text.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    if (isNegatedSafetyContext(line)) continue;
    for (const field of redactionWallForbiddenFields) {
      const pattern = new RegExp(`\\b${field}\\b`);
      if (pattern.test(line)) {
        findings.push(
          finding({
            ruleId: "redaction_wall.forbidden_field",
            file: relativePath,
            message: `Forbidden Redaction Wall field matched on line ${index + 1}: ${field}`,
            recommendation: "Keep provider, routing, raw-output, credential, and environment-value fields behind internal-only policy documentation.",
          }),
        );
      }
    }
  }

  return findings;
}

function validateLearningSections(): PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  const uiText = readProjectFile("client/src/pages/admin/CouncilGovernance.tsx");
  const requiredPhrases = ["How to use this", "What this means", "How it works", "What cannot happen from this screen"];

  for (const phrase of requiredPhrases) {
    if (!uiText.includes(phrase)) {
      findings.push(
        finding({
          ruleId: "learning.required_bottom_section",
          file: "client/src/pages/admin/CouncilGovernance.tsx",
          message: `Missing required staff/admin learning section: ${phrase}`,
          recommendation: "Add bottom learning sections for every new admin-facing governance concept.",
        }),
      );
    }
  }

  if (!uiText.includes("InfoTip")) {
    findings.push(
      finding({
        ruleId: "learning.tooltip_required",
        file: "client/src/pages/admin/CouncilGovernance.tsx",
        message: "Council Governance admin page does not expose reusable tooltip help.",
        recommendation: "Use tooltips for new admin-facing governance concepts.",
      }),
    );
  }

  return findings;
}

function validateActivationAndManualGate(): PolicyFinding[] {
  const findings: PolicyFinding[] = [];

  if (sampleLocalFakeAdapterDryRunRequest.envelope.activationLevel !== "dry_run") {
    findings.push(
      finding({
        ruleId: "activation.fake_adapter_dry_run",
        file: "server/services/council-fake-adapter-service.ts",
        message: "Local fake adapter request is not marked dry_run.",
        recommendation: "Keep local fake adapter harness dry-run only.",
      }),
    );
  }

  if (!sampleLocalFakeAdapterDryRunRequest.requiresAdminApproval) {
    findings.push(
      finding({
        ruleId: "manual_gate.fake_adapter_requires_admin",
        file: "server/services/council-fake-adapter-service.ts",
        message: "Local fake adapter request does not require admin approval.",
        recommendation: "Keep all adapter dry-runs manually gated.",
      }),
    );
  }

  if (!sampleLocalFakeAdapterDryRunRequest.dryRunOnly) {
    findings.push(
      finding({
        ruleId: "activation.fake_adapter_dry_run_only",
        file: "server/services/council-fake-adapter-service.ts",
        message: "Local fake adapter request is not dryRunOnly.",
        recommendation: "Keep fake adapter harness non-executing and local-only.",
      }),
    );
  }

  return findings;
}

function isNegatedSafetyContext(line: string): boolean {
  const normalized = line.trim().toLowerCase();
  return safeNegationTerms.some((term) => normalized.includes(term));
}

function validateMivBoundary(): PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  const definition = councilGovernanceOverview.mivSummary.definition.toLowerCase();

  if (!definition.includes("governed view")) {
    findings.push(
      finding({
        ruleId: "miv.governed_view",
        file: "server/data/council-governance-registry.ts",
        message: "MIV is not described as a governed view.",
        recommendation: "Keep MIV framed as a policy-filtered virtual layer, not one mixed memory table.",
      }),
    );
  }

  if (!/not available/i.test(councilGovernanceOverview.mivSummary.privateMemoryRule)) {
    findings.push(
      finding({
        ruleId: "miv.private_memory_excluded",
        file: "server/data/council-governance-registry.ts",
        message: "MIV private memory rule does not clearly exclude private user memory.",
        recommendation: "State that private user memory is unavailable unless an explicit permissioned workflow exists.",
      }),
    );
  }

  return findings;
}

export function runCouncilPackagePolicyCheck(): CouncilPackagePolicyReport {
  const fakeAdapterOutput = runLocalFakeAdapterDryRun();
  const findings: PolicyFinding[] = [
    ...validateNewsPackage(sampleNewsPackage),
    ...validateDebatePackage(sampleDebatePackage),
    ...validateAgents(newsVerificationCouncilAgents, "news verification council"),
    ...validateAgents(debateCouncilAgents, "debate council"),
    ...validateLedger(sampleLedgerEntries),
    ...validateFakeAdapterOutput(fakeAdapterOutput),
    ...validateMivBoundary(),
    ...validateLearningSections(),
    ...validateActivationAndManualGate(),
  ];

  for (const file of checkedFiles) {
    findings.push(...validateFileText(file));
  }

  for (const file of redactionScanFiles) {
    findings.push(...validateRedactionWallFile(file));
  }

  if (findings.length === 0) {
    findings.push(pass("policy.all_checks_passed", "Phase 36C3", "Council package policy checks passed."));
  }

  const errors = findings.filter((item) => item.severity === "fail").length;
  const warnings = findings.filter((item) => item.severity === "warning").length;
  const passes = findings.filter((item) => item.severity === "pass").length;

  return {
    status: errors > 0 ? "fail" : warnings > 0 ? "pass_with_warnings" : "pass",
    checkedAt: new Date().toISOString(),
    checkedFiles,
    findings,
    summary: {
      errors,
      warnings,
      passes,
    },
  };
}
