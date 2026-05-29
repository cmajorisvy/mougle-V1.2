import type { LocalFakeAdapterDryRunRequest, LocalFakeAdapterDryRunResponse } from "@shared/models/council-governance";

export const sampleLocalFakeAdapterDryRunRequest: LocalFakeAdapterDryRunRequest = {
  envelope: {
    eventId: "evt_fake_adapter_preview_001",
    eventType: "provider_pilot.fake_adapter.dry_run_requested",
    phase: "Phase 36C12",
    activationLevel: "dry_run",
    actorType: "root_admin",
    requiresAdminApproval: true,
    allowedActions: ["normalize_static_council_output", "return_admin_only_preview", "preserve_publish_gate"],
    forbiddenActions: ["external_provider_call", "database_write", "publish", "private_memory_access"],
    policyChecks: ["redaction_wall", "forbidden_field_scan", "publish_gate", "private_memory_boundary"],
    auditContext: {
      requestReason: "Static fake adapter preview for governance readiness.",
      sourceRoute: "/admin/council-governance",
      safetyNotes: ["Local fake output only", "No external calls", "No publish action"],
    },
    sourcePackageId: "NEWS-PREVIEW-001",
    idempotencyKey: "fake-adapter-preview-news-001",
    createdAt: "2026-05-04T00:00:00.000Z",
    requestedBy: "root_admin_preview",
  },
  packageId: "NEWS-PREVIEW-001",
  councilType: "news_verification_council",
  councilAgentName: "VECTOR",
  councilRole: "Consistency Auditor",
  adapterSlotId: "adapter-slot-preview-vector",
  dryRunOnly: true,
  requiresAdminApproval: true,
  allowedInputs: ["public_safe_evidence_references", "source_tier_labels", "claim_summary"],
  forbiddenOutputs: ["provider_identity", "raw_output", "routing_details", "publish_command", "private_memory"],
  policyChecks: ["redaction_wall", "forbidden_field_scan", "phase_36c3_policy_check"],
};

export function runLocalFakeAdapterDryRun(
  request: LocalFakeAdapterDryRunRequest = sampleLocalFakeAdapterDryRunRequest,
): LocalFakeAdapterDryRunResponse {
  return {
    pilotRunId: "fake-pilot-run-001",
    packageId: request.packageId,
    councilAgentName: request.councilAgentName,
    councilRole: request.councilRole,
    normalizedCouncilOutput:
      "Static fake adapter output: keep the package in review, attach stronger primary evidence, and preserve Publish Decision Required.",
    confidence: 0.68,
    evidenceReferences: ["evidence-ref-001", "evidence-ref-002"],
    riskFlags: ["dry_run_only", "needs_primary_source", "admin_review_required"],
    redactionStatus: "passed",
    policyCheckStatus: "pass",
    adminReviewStatus: "waiting_for_admin_review",
    auditNotes: [
      "Local fake adapter only.",
      "No external provider call was made.",
      "No private memory was requested.",
      "Publish Decision Required remains locked.",
    ],
    publishDecision: "publish_decision_required",
  };
}
