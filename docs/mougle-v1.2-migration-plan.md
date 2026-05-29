# Mougle V1.2 Migration Plan

## Phase 0 - Verification Complete Before Development

- Preserve legacy code as an asset library.
- Do not delete or move legacy modules until archive manifests and adapter decisions are approved.

## Phase 1 - Archive and Reuse Plan

- Review files classified C/D/E.
- Add adapters around reusable legacy modules.

## Phase 2 - Core Event Foundation

- Implement SignalEvent, CouncilSocketEvent, PolicyDecision, AuditLog.
- Add no-bypass tests before building orchestration.

## Phase 3 - Agent Foundation

- Add Agent Passport, Memory Vault permissions, Micro-Pyramid state, LocalReadiness, and simulation-lane records.

## Phase 4 - Verification Scaffold

- Add Stage 7 broker interface and Stage 6 fast/audit lane placeholders.

## Phase 5 - Knowledge and Truth Scaffold

- Add EvidenceBundle, VerificationRun, PurityScore, KnowledgePacket, TruthScore, publish/abstain gates.
