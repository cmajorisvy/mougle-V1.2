# Mougle V1.2 Architecture Gaps

| Severity | Rule | File | Finding |
| --- | --- | --- | --- |
| P0 | secret_vault_to_llm | .env.example:5 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | AGENTS.md:34 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | AGENTS.md:100 | Potential secret/private vault value exposed to LLM context. |
| P0 | gluon_money_confusion | client/src/pages/Billing.tsx:351 | Potential conversion of Gluon-like credit into money. |
| P0 | gluon_money_confusion | client/src/pages/admin/AdminDashboard.tsx:210 | Potential conversion of Gluon-like credit into money. |
| P0 | gluon_money_confusion | client/src/pages/admin/AdminDashboard.tsx:1406 | Potential conversion of Gluon-like credit into money. |
| P0 | gluon_money_confusion | client/src/pages/admin/KnowledgeEconomy.tsx:100 | Potential conversion of Gluon-like credit into money. |
| P0 | gluon_money_confusion | client/src/pages/admin/KnowledgeEconomy.tsx:543 | Potential conversion of Gluon-like credit into money. |
| P0 | gluon_money_confusion | client/src/pages/admin/KnowledgeEconomy.tsx:647 | Potential conversion of Gluon-like credit into money. |
| P0 | gluon_money_confusion | client/src/pages/docs/EntitiesExplained.tsx:98 | Potential conversion of Gluon-like credit into money. |
| P0 | gluon_money_confusion | client/src/pages/docs/HowItWorks.tsx:149 | Potential conversion of Gluon-like credit into money. |
| P0 | gluon_money_confusion | docs/FINAL_MOUGLE_V2_STATUS.md:45 | Potential conversion of Gluon-like credit into money. |
| P0 | gluon_money_confusion | docs/FINAL_MOUGLE_V2_STATUS.md:85 | Potential conversion of Gluon-like credit into money. |
| P0 | gluon_money_confusion | docs/FINAL_MOUGLE_V2_STATUS.md:198 | Potential conversion of Gluon-like credit into money. |
| P0 | gluon_money_confusion | docs/FINAL_MOUGLE_V2_STATUS.md:201 | Potential conversion of Gluon-like credit into money. |
| P0 | reputation_payout_confusion | docs/FINAL_MOUGLE_V2_STATUS.md:201 | Potential use of reputation/UES as payout or approval. |
| P0 | gluon_money_confusion | docs/FINAL_MOUGLE_V2_STATUS.md:203 | Potential conversion of Gluon-like credit into money. |
| P0 | direct_verified_knowledge_write | docs/architecture/CODEX_PHASE_1B_VERIFIED_NEWSROOM_ARCHITECTURE.md:435 | Potential direct write to Stage 4 verified knowledge. |
| P0 | destructive_database_command | docs/architecture/CODEX_PHASE_1B_VERIFIED_NEWSROOM_ARCHITECTURE.md:748 | Potential destructive DB command. |
| P0 | gluon_money_confusion | docs/architecture/MOUGLE_ADMIN_DASHBOARD_REDESIGN_REPORT.md:184 | Potential conversion of Gluon-like credit into money. |
| P0 | secret_vault_to_llm | docs/architecture/PHASE_36C_REMAINING_ROADMAP_PROMPTS.md:193 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/archive/cleanup-archive-2026-05-22/codex-phase-1-2026-05/CODEX_GO_LIVE_BLOCKER_POST_FIX_AUDIT.md:48 | Potential secret/private vault value exposed to LLM context. |
| P0 | destructive_database_command | docs/archive/cleanup-archive-2026-05-22/codex-phase-1-2026-05/CODEX_GO_LIVE_BLOCKER_POST_FIX_AUDIT.md:216 | Potential destructive DB command. |
| P0 | destructive_database_command | docs/archive/cleanup-archive-2026-05-22/codex-phase-1-2026-05/CODEX_GO_LIVE_BLOCKER_POST_FIX_AUDIT.md:253 | Potential destructive DB command. |
| P0 | reputation_payout_confusion | docs/backend-routes.md:1220 | Potential use of reputation/UES as payout or approval. |
| P0 | publish_without_verification | docs/backend-services.md:159 | Potential public publishing or external execution without verification. |
| P0 | publish_without_verification | docs/content-flywheels.md:211 | Potential public publishing or external execution without verification. |
| P0 | secret_vault_to_llm | docs/design/PROMPT_TO_PRODUCTION_CREATOR_CONSOLE_DESIGN.md:360 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/library/INDEX.md:143 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:5 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:6 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:7 | Potential secret/private vault value exposed to LLM context. |
| P0 | reputation_payout_confusion | docs/mougle-v1.2-architecture-gaps.md:20 | Potential use of reputation/UES as payout or approval. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:25 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:26 | Potential secret/private vault value exposed to LLM context. |
| P0 | reputation_payout_confusion | docs/mougle-v1.2-architecture-gaps.md:29 | Potential use of reputation/UES as payout or approval. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:32 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:33 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:34 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:35 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:36 | Potential secret/private vault value exposed to LLM context. |
| P0 | reputation_payout_confusion | docs/mougle-v1.2-architecture-gaps.md:37 | Potential use of reputation/UES as payout or approval. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:38 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:39 | Potential secret/private vault value exposed to LLM context. |
| P0 | reputation_payout_confusion | docs/mougle-v1.2-architecture-gaps.md:40 | Potential use of reputation/UES as payout or approval. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:41 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:42 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:43 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:44 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:45 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:46 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:47 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:48 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:49 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:50 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:51 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:52 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:53 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:54 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:55 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:56 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:57 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:58 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:59 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:60 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:61 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:62 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:63 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:64 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:65 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:66 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:67 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:68 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:69 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:70 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:71 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:72 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:73 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:74 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:75 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:76 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:77 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:78 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:79 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:80 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:81 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:82 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:83 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:84 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:85 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:86 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:87 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:88 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:89 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:90 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:91 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:92 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:93 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:94 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:95 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:96 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:97 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:98 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:99 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:100 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:101 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:102 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:103 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:104 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:105 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:106 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:107 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:108 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:109 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:110 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:111 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:112 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:113 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:114 | Potential secret/private vault value exposed to LLM context. |
| P0 | secret_vault_to_llm | docs/mougle-v1.2-architecture-gaps.md:115 | Potential secret/private vault value exposed to LLM context. |

## Missing Services

- SignalEventService
- SignalCultureRouter
- AgentPassportService
- MemoryVaultEngine
- UserAgentMicroPyramidService
- CouncilSocketFabricService
- Stage7ExternalVerificationBroker
- Stage6HardMeshFastLane
- Stage6HardMeshAuditLane
- Stage5PurityScoringService
- Stage4KnowledgePacketService
- Stage1TruthCrownService
- PTEEService
- PolicyDecisionService
- AuditLogService
- LegalFinancialReviewService
