# Mougle V1.2 Database Gap Report

## Detected Tables / Models

| Table | File | V12 | Concern |
| --- | --- | --- | --- |
| screen_presets | shared/neural-newsroom-schema.ts | legacy/needs review | none |
| screen_take_plans | shared/neural-newsroom-schema.ts | legacy/needs review | none |
| screen_safety_validations | shared/neural-newsroom-schema.ts | legacy/needs review | none |
| verified_sources | shared/newsroom-schema.ts | legacy/needs review | Stage 6 no-bypass gate required |
| verified_knowledge | shared/newsroom-schema.ts | truth/knowledge | Stage 6 no-bypass gate required |
| verified_claims | shared/newsroom-schema.ts | truth/knowledge | Stage 6 no-bypass gate required |
| verified_timeline_events | shared/newsroom-schema.ts | signal/event | Stage 6 no-bypass gate required |
| verified_media_references | shared/newsroom-schema.ts | legacy/needs review | Stage 6 no-bypass gate required |
| verification_audit_events | shared/newsroom-schema.ts | truth/knowledge | none |
| broadcast_briefs | shared/newsroom-schema.ts | legacy/needs review | none |
| newsroom_packages | shared/newsroom-schema.ts | legacy/needs review | none |
| audience_channel_connectors | shared/omni-channel-audience-schema.ts | legacy/needs review | none |
| audience_connector_secrets | shared/omni-channel-audience-schema.ts | legacy/needs review | privacy/secret boundary required |
| audience_connector_secret_rotations | shared/omni-channel-audience-schema.ts | legacy/needs review | privacy/secret boundary required |
| audience_messages | shared/omni-channel-audience-schema.ts | legacy/needs review | none |
| audience_safety_decisions | shared/omni-channel-audience-schema.ts | legacy/needs review | none |
| audience_audit_exports | shared/omni-channel-audience-schema.ts | governance | none |
| audience_audit_export_notifications | shared/omni-channel-audience-schema.ts | governance | none |
| audience_audit_export_notifier_config_history | shared/omni-channel-audience-schema.ts | governance | none |
| audience_archive_notifier_snooze_log | shared/omni-channel-audience-schema.ts | legacy/needs review | none |
| audience_audit_email_failure_alert_snoozes | shared/omni-channel-audience-schema.ts | governance | none |
| audience_audit_history_email_stale_snooze_log | shared/omni-channel-audience-schema.ts | governance | none |
| audience_connector_rotation_notifications | shared/omni-channel-audience-schema.ts | legacy/needs review | none |
| audience_connector_rotation_dedup_state | shared/omni-channel-audience-schema.ts | legacy/needs review | none |
| audience_legacy_token_dispatch_alerts | shared/omni-channel-audience-schema.ts | legacy/needs review | none |
| audience_stale_rows_threshold_history | shared/omni-channel-audience-schema.ts | legacy/needs review | none |
| audience_restore_log_rate_threshold_history | shared/omni-channel-audience-schema.ts | legacy/needs review | none |
| audience_restore_log_rate_weakening_notifications | shared/omni-channel-audience-schema.ts | legacy/needs review | none |
| audience_restore_log | shared/omni-channel-audience-schema.ts | legacy/needs review | none |
| audience_moderation_commands | shared/omni-channel-audience-schema.ts | governance | none |
| audience_gateway_events | shared/omni-channel-audience-schema.ts | signal/event | none |
| audience_audit_email_schedules | shared/omni-channel-audience-schema.ts | governance | none |
| audience_audit_email_runs | shared/omni-channel-audience-schema.ts | governance | none |
| audience_archive_deletions | shared/omni-channel-audience-schema.ts | legacy/needs review | none |
| gateway_alert_settings_audit | shared/omni-channel-audience-schema.ts | governance | none |
| audience_legacy_token_kill_switch_audit | shared/omni-channel-audience-schema.ts | governance | none |
| audience_retention_stale_history | shared/omni-channel-audience-schema.ts | legacy/needs review | none |
| audience_archive_trash_purges | shared/omni-channel-audience-schema.ts | legacy/needs review | none |
| session | shared/schema.ts | identity/auth | none |
| users | shared/schema.ts | identity/auth | none |
| admin_staff | shared/schema.ts | governance | none |
| admin_staff_access_requests | shared/schema.ts | governance | none |
| external_agent_api_keys | shared/schema.ts | agent foundation | none |
| provider_credentials | shared/schema.ts | memory/vault | privacy/secret boundary required |
| topics | shared/schema.ts | signal/event | none |
| posts | shared/schema.ts | legacy/needs review | none |
| comments | shared/schema.ts | legacy/needs review | none |
| post_likes | shared/schema.ts | legacy/needs review | none |
| claims | shared/schema.ts | truth/knowledge | none |
| evidence | shared/schema.ts | truth/knowledge | none |
| trust_scores | shared/schema.ts | legacy/needs review | none |
| agent_votes | shared/schema.ts | agent foundation | none |
| reputation_history | shared/schema.ts | legacy/needs review | none |
| expertise_tags | shared/schema.ts | legacy/needs review | none |
| transactions | shared/schema.ts | legacy/needs review | none |
| agent_learning_profiles | shared/schema.ts | agent foundation | none |
| agent_societies | shared/schema.ts | agent foundation | none |
| society_members | shared/schema.ts | legacy/needs review | none |
| delegated_tasks | shared/schema.ts | legacy/needs review | none |
| agent_messages | shared/schema.ts | agent foundation | none |
| governance_proposals | shared/schema.ts | legacy/needs review | none |
| governance_votes | shared/schema.ts | legacy/needs review | none |
| alliances | shared/schema.ts | legacy/needs review | none |
| alliance_members | shared/schema.ts | legacy/needs review | none |
| institution_rules | shared/schema.ts | legacy/needs review | none |
| task_contracts | shared/schema.ts | legacy/needs review | none |
| task_bids | shared/schema.ts | legacy/needs review | none |
| civilizations | shared/schema.ts | legacy/needs review | none |
| agent_identities | shared/schema.ts | agent foundation | none |
| agent_memory | shared/schema.ts | agent foundation | privacy/secret boundary required |
| civilization_investments | shared/schema.ts | legacy/needs review | none |
| agent_genomes | shared/schema.ts | agent foundation | none |
| agent_lineage | shared/schema.ts | agent foundation | none |
| cultural_memory | shared/schema.ts | memory/vault | privacy/secret boundary required |
| ethical_profiles | shared/schema.ts | legacy/needs review | none |
| ethical_rules | shared/schema.ts | legacy/needs review | none |
| ethical_events | shared/schema.ts | signal/event | none |
| global_metrics | shared/schema.ts | legacy/needs review | none |
| global_goal_field | shared/schema.ts | legacy/needs review | none |
| global_insights | shared/schema.ts | legacy/needs review | none |
| agent_activity_log | shared/schema.ts | agent foundation | none |
| live_debates | shared/schema.ts | legacy/needs review | none |
| debate_participants | shared/schema.ts | legacy/needs review | none |
| debate_turns | shared/schema.ts | legacy/needs review | none |
| flywheel_jobs | shared/schema.ts | legacy/needs review | none |
| generated_clips | shared/schema.ts | legacy/needs review | none |
| podcast_script_packages | shared/schema.ts | legacy/needs review | none |
| podcast_audio_jobs | shared/schema.ts | legacy/needs review | none |
| youtube_publishing_packages | shared/schema.ts | legacy/needs review | none |
| avatar_video_render_jobs | shared/schema.ts | legacy/needs review | none |
| social_distribution_packages | shared/schema.ts | legacy/needs review | none |
| social_distribution_automation_settings | shared/schema.ts | legacy/needs review | none |
| news_articles | shared/schema.ts | legacy/needs review | none |
| news_comments | shared/schema.ts | legacy/needs review | none |
| news_reactions | shared/schema.ts | legacy/needs review | none |
| news_shares | shared/schema.ts | legacy/needs review | none |
| news_sources | shared/schema.ts | legacy/needs review | none |
| social_accounts | shared/schema.ts | legacy/needs review | none |
| social_posts | shared/schema.ts | legacy/needs review | none |
| promotion_scores | shared/schema.ts | legacy/needs review | none |
| social_performance | shared/schema.ts | legacy/needs review | none |
| growth_patterns | shared/schema.ts | legacy/needs review | none |
| system_control_config | shared/schema.ts | legacy/needs review | none |
| activity_metrics | shared/schema.ts | legacy/needs review | none |
| anomaly_events | shared/schema.ts | signal/event | none |
| automation_decisions | shared/schema.ts | legacy/needs review | none |
| automation_policy | shared/schema.ts | governance | none |
| safe_mode_controls | shared/schema.ts | legacy/needs review | none |
| subscription_plans | shared/schema.ts | marketplace/finance | none |
| user_subscriptions | shared/schema.ts | marketplace/finance | none |
| credit_packages | shared/schema.ts | legacy/needs review | none |
| credit_purchases | shared/schema.ts | marketplace/finance | none |
| invoices | shared/schema.ts | legacy/needs review | none |
| credit_usage_log | shared/schema.ts | legacy/needs review | none |
| flywheel_metrics | shared/schema.ts | legacy/needs review | none |
| moderation_logs | shared/schema.ts | governance | none |
| topic_authority | shared/schema.ts | signal/event | none |
| civilization_metrics | shared/schema.ts | legacy/needs review | none |
| network_gravity | shared/schema.ts | legacy/needs review | none |
| user_agents | shared/schema.ts | agent foundation | none |
| agent_knowledge_sources | shared/schema.ts | agent foundation | Stage 6 no-bypass gate required |
| marketplace_listings | shared/schema.ts | marketplace/finance | none |
| agent_marketplace_clone_packages | shared/schema.ts | agent foundation | none |
| knowledge_packets | shared/schema.ts | truth/knowledge | Stage 6 no-bypass gate required |
| knowledge_packet_acceptances | shared/schema.ts | truth/knowledge | Stage 6 no-bypass gate required |
| gluon_ledger_entries | shared/schema.ts | marketplace/finance | financial policy gate required |
| gluon_value_baselines | shared/schema.ts | legacy/needs review | none |
| gluon_value_index_snapshots | shared/schema.ts | legacy/needs review | none |
| gluon_redemption_eligibility_reviews | shared/schema.ts | legacy/needs review | none |
| agent_dna_mutation_history | shared/schema.ts | agent foundation | none |
| agent_purchases | shared/schema.ts | agent foundation | none |
| agent_usage_logs | shared/schema.ts | agent foundation | none |
| agent_reviews | shared/schema.ts | agent foundation | none |
| agent_versions | shared/schema.ts | agent foundation | none |
| industries | shared/schema.ts | legacy/needs review | none |
| industry_categories | shared/schema.ts | legacy/needs review | none |
| agent_roles | shared/schema.ts | agent foundation | none |
| knowledge_packs | shared/schema.ts | truth/knowledge | Stage 6 no-bypass gate required |
| agent_specializations | shared/schema.ts | agent foundation | none |
| agent_cost_logs | shared/schema.ts | agent foundation | none |
| agent_skill_nodes | shared/schema.ts | agent foundation | none |
| agent_unlocked_skills | shared/schema.ts | agent foundation | none |
| agent_xp_logs | shared/schema.ts | agent foundation | none |
| agent_certifications | shared/schema.ts | agent foundation | none |
| agent_trust_profiles | shared/schema.ts | agent foundation | none |
| agent_trust_events | shared/schema.ts | agent foundation | none |
| agent_trust_history | shared/schema.ts | agent foundation | none |
| agent_teams | shared/schema.ts | agent foundation | none |
| team_members | shared/schema.ts | legacy/needs review | none |
| team_tasks | shared/schema.ts | legacy/needs review | none |
| team_messages | shared/schema.ts | legacy/needs review | none |
| team_workspaces | shared/schema.ts | legacy/needs review | none |
| agent_compute_budgets | shared/schema.ts | agent foundation | none |
| agent_visibility_scores | shared/schema.ts | agent foundation | none |
| policy_rules | shared/schema.ts | governance | none |
| policy_violations | shared/schema.ts | governance | none |
| credit_sinks | shared/schema.ts | legacy/needs review | none |
| civilization_health_snapshots | shared/schema.ts | legacy/needs review | none |
| platform_events | shared/schema.ts | signal/event | none |
| agent_passports | shared/schema.ts | agent foundation | none |

## Missing Planned Models

- accounts
- sessions
- roles
- permissions
- user_settings
- agent_profiles
- agent_skills
- agent_rank_records
- agent_rooms
- agent_action_requests
- agent_simulation_runs
- memories
- vaults
- memory_permissions
- consent_records
- agent_vault_permissions
- agent_memory_records
- evidence_bundles
- verification_runs
- truth_scores
- purity_scores
- provenance_records
- lineage_records
- hardmesh_clusters
- hardmesh_runs
- hardmesh_metrics
- anomaly_records
- query_tank_items
- cluster_stability_scores
- equation_versions
- calibration_runs
- publish_gate_decisions
- verified_knowledge_graph_nodes
- verified_knowledge_graph_edges
- knowledge_packet_versions
- claim_status_history
- topology_snapshots
- ptee_versions
- topology_stability_signals
- topology_evolution_jobs
- rollback_states
- ues_records
- purchases
- subscriptions
- revenue_splits
- payout_records
- ledger_entries
- settlement_records
- signal_events
- signal_vectors
- signal_routes
- event_archive
- signal_node_states
- signal_spikes
- signal_threshold_configs
- signal_weight_profiles
- signal_decay_profiles
- audit_logs
- admin_actions
- policy_decisions
- legal_review_queue
- moderation_queue
- approval_requests
- debug_approval_requests

No migration command was run. No database connection was opened.
