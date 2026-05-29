# V1.2 Schema Modularization Plan

Date: 2026-05-26
Branch: `cleanup/v1-2-stabilization`

## Scope and safety

- Reviewed `shared/schema.ts`, `migrations/`, and migration metadata.
- No destructive migration was run.
- No tables were dropped.

## Schema domain classification

| Domain | Representative tables |
|---|---|
| identity | `users`, `session`, `admin_staff`, `admin_staff_access_requests`, `external_agent_api_keys` |
| workspaces | `projects`, `project_packages`, `project_agent_contributions`, `project_feedback`, `team_workspaces` |
| agents | `user_agents`, `agent_learning_profiles`, `agent_cost_logs`, `agent_skill_nodes`, `agent_unlocked_skills` |
| agent passports | `agent_passports`, `agent_passport_exports` |
| vaults | `agent_privacy_vaults`, `user_trust_vaults`, `trust_permission_tokens`, `privacy_access_logs` |
| task contracts | `task_contracts`, `task_bids`, `delegated_tasks` |
| approvals | `broadcast_package_approvals`, `gluon_redemption_eligibility_reviews`, `production_asset_audit_log`, `production_rig_audit_log` |
| audit | `moderation_logs`, `risk_audit_logs`, `compliance_audit_log`, `ai_job_events`, `ai_export_events` |
| truth | `trust_scores`, `truth_memories`, `truth_evolution_events`, `truth_alignment_snapshots`, `reality_claims`, `claim_evidence`, `consensus_records` |
| news | `news_articles`, `news_comments`, `news_reactions`, `news_shares`, `news_sources` |
| discussions | `posts`, `comments`, `claims`, `evidence`, `topics` |
| debates | `live_debates`, `debate_participants`, `debate_turns` |
| marketplace | `marketplace_listings`, `agent_marketplace_clone_packages`, `marketplace_orders`, `creator_earnings`, `agent_purchases` |
| production | `production_assets`, `production_rigs`, `permanent_avatars`, `broadcasts`, `broll_plans`, `social_drafts`, `playout_queue` |
| value ledger | `transactions`, `gluon_ledger_entries`, `gluon_value_baselines`, `gluon_value_index_snapshots` |
| metrics | `civilization_metrics`, `network_gravity`, `activity_metrics`, `authority_flywheel_snapshots`, `inevitable_platform_snapshots` |
| admin | `support_tickets`, `ticket_messages`, `ops_engine_snapshots`, `ops_actions`, `system_settings`, `safe_mode_controls` |
| experimental/legacy | `global_metrics`, `global_goal_field`, `global_insights`, `civilizations`, `society_members`, `super_loop_*`, `growth_*` |

## Legacy or mismatched table review

| Table/group | Finding | Recommendation |
|---|---|---|
| `task_contracts` + `task_bids` | Mixes contract semantics with market bidding behavior | rename later |
| `users.byoai_api_key` | Provider secret is stored directly on users table | migrate later |
| `global_metrics`, `global_goal_field`, `global_insights` | Experimental civilization/global scoring, unclear active usage | needs human review |
| `transactions` and `gluon_*` value tables | Multiple ledger/value abstractions co-exist | migrate later |
| `marketplace_orders` + `creator_earnings` | Future execution surfaces co-exist with current preview/sandbox flows | keep (gated) |
| `super_loop_cycles`, `super_loop_metrics` | Future loop system present in main schema | keep (feature-flag disabled) |
| `growth_autopilot_*` tables | Advanced growth automation schema active in prototype but not canonical for stabilization | keep (internal/admin only) |

## Migration notes

- `migrations/0000_baseline_pre_r5d.sql` is large and historical.
- R5/R7 avatar and production migrations exist and should remain untouched in this cleanup.
- `0004_r7b_permanent_avatars.sql` and `0004_task_806_orphan_sweep_flapping_snoozes.sql` coexist; keep as-is and review migration naming normalization later.

## Next safe schema phase

1. Create domain-specific schema files under `shared/schema/` without dropping legacy exports.
2. Move table declarations in small batches and re-export from `shared/schema.ts` for compatibility.
3. Create explicit migration plan for `users.byoai_api_key -> provider_credentials` before any destructive change.
