# Phase 36C - Mougle Council Governance Layer for News and Debates

## Status

Internal admin implementation, architecture-boundary, governance-layer, and copy-label alignment only.

This phase adds a root-admin read-only dashboard, static council registry, mock package previews, and planned ledger previews. It does not add live external provider integration, queue workers, schema changes, database writes, autonomous publishing, payment behavior, or provider/model disclosure.

## Core Governance Flow

Mougle Intelligence Vault, MIV
-> Council Review
-> Council Decision Ledger
-> Original Content Package
-> Publish Decision Required

Every package remains gated. A package preview is not a publishable item.

## Shared Data Layer

Mougle Intelligence Vault, MIV, is a governed view over approved knowledge, evidence, claims, source reliability, public-safe graph data, content packages, and review outputs.

MIV is not:

- one mixed memory table
- unrestricted shared memory
- raw scrape database
- private memory pool
- direct user-memory database

MIV aggregates controlled views over:

- past intelligence
- present live intelligence
- future plans intelligence
- news records
- debate records
- claims and evidence
- source reliability scores
- consensus records
- public-safe knowledge graph data
- knowledge packets
- TCS / UES signals where available
- originality and rights checks
- approved scripts
- video packages
- social distribution packages
- council review outputs
- decision ledger outputs

MIV respects memory separation:

- personal memory
- business memory
- public knowledge
- behavioral memory
- verified knowledge

Private user memory is not available to News or Debate councils unless an explicit permissioned workflow exists.

## Truth vs Meaning

News answers: what happened, and how verified is it?

Debates answer: what does it mean, what are the strongest positions, and what remains unresolved?

News uses neutral factual tone, separates trend signal from verified fact, and produces live-ready news packages.

Debates use structured disagreement, compare positions, and produce live-ready debate packages.

## Provider Non-Disclosure Policy

Provider names, model names, versions, routing, fallbacks, and orchestration details are internal-only and must not appear in public/user-facing UI, scripts, metadata, agent dialogue, social captions, or product copy.

Allowed public-facing language:

- Mougle News Verification Council
- Mougle Debate Council
- specialist AI agents
- council agents
- provider-abstracted role slots
- Mougle in-house verification agents
- council review
- evidence review
- source reliability review
- debate judgment
- final council verdict

Admin/debug views may show machine slots and backend roles, but the primary display name should remain the robot-style public council name.

## Council Registry

Each static registry entry includes:

- publicDisplayName
- publicProfession
- councilType
- adminMachineSlot
- backendRole
- providerDisclosurePolicy
- allowedInputs
- allowedOutputs
- forbiddenOutputs
- shortTooltip
- status

The registry is TypeScript-only. It is not a database table and does not introduce a migration.

## News Verification Council

The News Verification Council answers what happened and how verified it is.

| Name | Profession | Machine Slot | Backend Role |
| --- | --- | --- | --- |
| NEXA | Event Synthesist | GP-Agent | general_news_reasoning_slot |
| THETA | Context Ethicist | AN-Agent | safety_nuance_sensitive_wording_slot |
| PULSE | Social Signal Mapper | GX-Agent | public_trend_social_signal_slot |
| CIVIX | Civic and Business Analyst | MS-Agent | business_public_web_context_slot |
| ORION | Research Lens | GM-Agent | broad_research_multimodal_context_slot |
| VECTOR | Consistency Auditor | FC-Agent-1 | source_consistency_fact_check_slot |
| CHRONOS | Timeline and Quote Verifier | FC-Agent-2 | date_number_quote_timeline_verification_slot |
| ATLAS | Source Reliability Cartographer | MV-Agent | mougle_source_reliability_slot |
| COBRA | Evidence Examiner | MC-Agent | mougle_claims_evidence_slot |
| AURUM | Chief News Verifier | CH-Agent | mougle_chief_news_verifier |

## Live-ready News Pipeline

Authoritative RSS/news/podcast/video sources
-> Source Reliability Engine
-> Story Deduplication Engine
-> Claim Extraction Engine
-> Multi-Source Evidence Verification Engine
-> Source-Tier Classification
-> News Verification Council
-> Final News Verdict
-> Mougle Originality & Rights Gate
-> Original Mougle Live-ready News Script
-> Metadata: title, tags, short description, category, schema
-> Licensed / AI-generated / reference-safe visual package
-> AI video rendering package
-> Publish Decision Required
-> planned/configured targets: Mougle Videos > News, configured video target, configured social clips

## NewsContentPackage

Docs-level and TypeScript-only contract fields:

- contentType
- category
- status
- title
- shortDescription
- longDescription
- tags
- topic
- industry
- verificationStatus
- sourceTier
- sourceCount
- evidenceReferences
- claimSummary
- factVerdict
- socialTrendSummary
- councilVerdict
- chiefDecision
- MougleChiefScore
- TCS
- UES
- originalityStatus
- copyrightRisk
- visualPackageType
- thumbnailPrompt
- schemaType
- publishTargets
- publishDecision

Phase 36C1 tightens package fields with TypeScript-only unions:

- contentType: live_ready_news_package, live_news_segment, recorded_news_video, news_short, developing_story_update, monitoring_only_item
- status and verificationStatus: verified, developing, monitoring_only, rejected_for_publication
- sourceTier: tier_1_official_primary, tier_2_authoritative_outlet, tier_3_expert_secondary, tier_4_social_signal, tier_5_unverified_claim
- originalityStatus: original, reference_safe, needs_rewrite, blocked_rights_risk
- visualPackageType: reference_safe_visual_package, licensed_media_package, owned_media_package, public_domain_government_media_package, ai_generated_visual_package
- publishDecision: publish_decision_required, blocked_by_verification, blocked_by_originality_or_rights, rejected_for_publication

## Debate Council

The Debate Council answers what verified facts mean, which positions are strongest, and what remains unresolved.

| Name | Profession | Machine Slot | Backend Role |
| --- | --- | --- | --- |
| RAGNAROK | Argument Architect | GP-Debater | structured_argument_strategy_slot |
| SENTINEL | Critical Examiner | AN-Critic | critique_safety_nuance_slot |
| ECHO | Public Pulse Analyst | GX-Sentiment | public_sentiment_trend_argument_slot |
| STRATOS | Policy and Impact Strategist | MS-Policy | policy_business_practical_impact_slot |
| PANDORA | Research Advocate | GM-Research | broad_research_context_slot |
| KRAKEN | Opposition Sentinel | OP-Agent | strongest_opposition_slot |
| EQUINOX | Neutral Arbiter | NJ-Agent | neutral_judging_slot |
| ARGUS | Evidence Prosecutor | ME-Agent | mougle_evidence_prosecutor |
| HARMONIX | Consensus Weaver | CB-Agent | mougle_consensus_builder |
| OMEGA | Chief Debate Judge | CJ-Agent | mougle_chief_debate_judge |

## Live-ready Debate Pipeline

Verified topic / industry topic / breaking issue
-> Topic and Industry Classification
-> Evidence Packet from Mougle Intelligence Vault
-> Debate Council
-> Structured Debate Rounds
-> Argument Quality Scoring
-> Claim/Evidence Scoring
-> Consensus / Disagreement / Unresolved Questions
-> Final Debate Verdict
-> Mougle Originality & Rights Gate
-> Original Mougle Debate Script
-> Metadata: title, tags, short description, category, schema
-> Licensed / AI-generated / reference-safe visual package
-> AI video rendering package
-> Publish Decision Required
-> planned/configured targets: Mougle Videos > Debates, configured video target, configured social clips

## DebateContentPackage

Docs-level and TypeScript-only contract fields:

- contentType
- category
- status
- title
- shortDescription
- longDescription
- tags
- topic
- industry
- sourceTier
- sourceCount
- evidenceReferences
- positions
- argumentScores
- claimSummary
- consensus
- disagreement
- unresolvedQuestions
- debateVerdict
- councilVerdict
- chiefDecision
- MougleChiefScore
- TCS
- UES
- originalityStatus
- copyrightRisk
- visualPackageType
- thumbnailPrompt
- schemaType
- publishTargets
- publishDecision

Phase 36C1 tightens debate package fields with TypeScript-only unions:

- contentType: live_ready_debate_package, live_debate, recorded_debate, debate_short, developing_story_update, monitoring_only_item
- status: verified, developing, monitoring_only, rejected_for_publication
- sourceTier: tier_1_official_primary, tier_2_authoritative_outlet, tier_3_expert_secondary, tier_4_social_signal, tier_5_unverified_claim
- originalityStatus: original, reference_safe, needs_rewrite, blocked_rights_risk
- visualPackageType: reference_safe_visual_package, licensed_media_package, owned_media_package, public_domain_government_media_package, ai_generated_visual_package
- publishDecision: publish_decision_required, blocked_by_verification, blocked_by_originality_or_rights, rejected_for_publication

## Council Decision Ledger

The Council Decision Ledger is a planned audit concept only in this phase. It is not a DB table.

Planned ledger fields:

- packageId
- councilType
- councilAgent
- agentRole
- stance
- evidenceUsed
- confidence
- disagreement
- riskFlags
- originalityFlags
- finalChiefDecision
- timestamp

## Status Ladder

- verified: confirmed by multiple authoritative or high-trust sources, with evidence and no major unresolved contradiction
- developing: credible but still changing or partially confirmed
- monitoring_only: tracked internally or clearly labeled, not eligible as standard verified news
- rejected_for_publication: fails verification, rights, safety, policy, privacy, or originality checks

## Source-Tier Taxonomy

- tier_1_official_primary
- tier_2_authoritative_outlet
- tier_3_expert_secondary
- tier_4_social_signal
- tier_5_unverified_claim

Social signals may influence trend detection, but they must not be treated as verified facts.

## Mougle Originality & Rights Gate

The Originality & Rights Gate checks:

- copied phrasing risk
- article rewrite risk
- podcast transcript rewrite risk
- video transcript rewrite risk
- title-style imitation risk
- copyrighted visual risk
- slide/graphic imitation risk
- third-party footage risk
- safe visual source type

Allowed visual/source types:

- licensed media
- owned media
- public-domain/government media where legally usable
- AI-generated visuals
- reference-safe visual packages
- cited links/references without copying expression

Facts may be used after verification. The wording, narration, structure, visuals, script, title style, and final video package must be original to Mougle.

## Originality Risk Ladder

- original
- reference_safe
- needs_rewrite
- blocked_rights_risk

## Admin Dashboard and Internal API

Root-admin read-only endpoints:

- GET /api/admin/council-governance/overview
- GET /api/admin/council-governance/news-council
- GET /api/admin/council-governance/debate-council
- GET /api/admin/council-governance/package-contracts
- GET /api/admin/council-governance/sample-ledger
- GET /api/admin/council-governance/status-taxonomy

All endpoints return static/configured/mock data. They do not call external providers, do not mutate data, do not publish, and do not require schema changes.

### Phase 36C2 Package Review Workbench

The admin package preview should present mock `NewsContentPackage` and `DebateContentPackage` data as a review workbench, not as raw JSON or a publish control.

Required grouped sections:

- package identity
- verification and source status
- evidence summary
- council verdict
- originality and rights gate
- visual package
- publish decision

The workbench must include tooltips and bottom learning blocks for:

- How to use this
- What this means
- How it works

The workbench remains admin-only, read-only, static/mock, and gated by `Publish Decision Required`.

## Video and Distribution Package Rules

Use planned/configured target language. Do not imply active live streaming, active provider publishing, automatic posting, or autonomous distribution.

Preferred labels:

- Live-ready News Package
- Live-ready Debate Package
- News video package
- Debate video package
- Planned publish target
- Configured publish target
- Publish Decision Required

## Tooltip and Learning UX

Admin-facing concepts should include helper text where practical:

- Mougle Intelligence Vault
- News Verification Council
- Debate Council
- Council Registry
- NewsContentPackage
- DebateContentPackage
- Council Decision Ledger
- Mougle Originality & Rights Gate
- verified
- developing
- monitoring_only
- rejected_for_publication
- original
- reference_safe
- needs_rewrite
- blocked_rights_risk
- Publish Decision Required
- Reference-Safe Visuals
- Original Mougle Script
- Live-ready News Package
- Live-ready Debate Package

Learning blocks should explain:

- How to use this
- What this means
- How it works

## Future Static Policy Checks

Future CI/static policy checks should block unsafe provider/model disclosure, active autonomous publishing claims, active live-provider claims, guaranteed-truth claims, and no-risk claims in public Phase 36C surfaces.

This phase documents that future check only. It does not implement CI policy tooling.

## Current Implementation Limits

- No live external provider integration
- No autonomous publishing
- No queue/worker implementation
- No schema migration
- No provider or model names exposed
- No machine slots used as primary public names
- No DB mutation
- No payment, payout, checkout, or marketplace deployment behavior
