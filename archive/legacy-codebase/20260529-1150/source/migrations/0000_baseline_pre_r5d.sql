CREATE TABLE "activity_metrics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_metrics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"metric_key" text NOT NULL,
	"value" real NOT NULL,
	"window" text DEFAULT '5m' NOT NULL,
	"observed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_broadcast_fallback_default_preset" (
	"id" varchar PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"dry_run" text DEFAULT 'all' NOT NULL,
	"status" text DEFAULT 'all' NOT NULL,
	"package_id" text DEFAULT '' NOT NULL,
	"updated_by_actor_id" varchar NOT NULL,
	"updated_by_actor_type" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_broadcast_saved_view" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"scope" text DEFAULT 'private' NOT NULL,
	"dry_run" text DEFAULT 'all' NOT NULL,
	"status" text DEFAULT 'all' NOT NULL,
	"package_id" text DEFAULT '' NOT NULL,
	"is_team_default" boolean DEFAULT false NOT NULL,
	"team_default_set_by_actor_id" varchar,
	"team_default_set_by_actor_type" text,
	"team_default_set_at" timestamp,
	"schedule" jsonb DEFAULT 'null'::jsonb,
	"created_by_actor_id" varchar NOT NULL,
	"created_by_actor_type" text DEFAULT 'root_admin' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_filter_views" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" varchar NOT NULL,
	"scope" text NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_staff" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'staff' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"slack_handle" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp,
	"created_by" varchar,
	"updated_by" varchar,
	"disabled_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "admin_staff_email_unique" UNIQUE("email"),
	CONSTRAINT "admin_staff_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "admin_staff_access_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"requested_access_type" text NOT NULL,
	"requested_role" text NOT NULL,
	"requested_permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"password_hash" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"review_token_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"token_expires_at" timestamp NOT NULL,
	"approved_by_email" text,
	"rejected_by_email" text,
	"reviewed_at" timestamp,
	"created_staff_id" varchar,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_activity_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"post_id" varchar,
	"action_type" text NOT NULL,
	"details" text,
	"relevance_score" real,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_certifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"industry_slug" text NOT NULL,
	"cert_slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"badge" text DEFAULT 'verified' NOT NULL,
	"rank_boost" integer DEFAULT 10 NOT NULL,
	"granted_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_compute_budgets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"daily_budget" integer DEFAULT 100 NOT NULL,
	"used_today" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp DEFAULT now(),
	"throttle_level" text DEFAULT 'none' NOT NULL,
	"last_throttle_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_cost_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"owner_id" varchar NOT NULL,
	"action_type" text NOT NULL,
	"credits_charged" integer NOT NULL,
	"tokens_used" integer,
	"model" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_dna_mutation_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"packet_id" varchar NOT NULL,
	"mutation_type" text NOT NULL,
	"before_dna" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"after_dna" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score_inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'preview' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_genomes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"prime_seed" text,
	"prime_color_signature" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dna_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"curiosity" real DEFAULT 0.5 NOT NULL,
	"risk_tolerance" real DEFAULT 0.5 NOT NULL,
	"collaboration_bias" real DEFAULT 0.5 NOT NULL,
	"verification_strictness" real DEFAULT 0.5 NOT NULL,
	"long_term_focus" real DEFAULT 0.5 NOT NULL,
	"economic_strategy" text DEFAULT 'balanced' NOT NULL,
	"fitness_score" real DEFAULT 0 NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"mutations" integer DEFAULT 0 NOT NULL,
	"last_reproduced_at" timestamp,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "agent_genomes_agent_id_unique" UNIQUE("agent_id")
);
--> statement-breakpoint
CREATE TABLE "agent_identities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"civilization_id" varchar,
	"creation_epoch" integer DEFAULT 0 NOT NULL,
	"strategy_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"long_term_goal_set" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"influence_score" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "agent_identities_agent_id_unique" UNIQUE("agent_id")
);
--> statement-breakpoint
CREATE TABLE "agent_knowledge_sources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"vault_type" text DEFAULT 'business' NOT NULL,
	"sensitivity" text DEFAULT 'restricted' NOT NULL,
	"source_type" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"uri" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_learning_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"q_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expertise_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"strategy_parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"exploration_rate" real DEFAULT 0.3 NOT NULL,
	"success_rate" real DEFAULT 0.5 NOT NULL,
	"specialization_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reward_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_reward" real DEFAULT 0 NOT NULL,
	"learning_cycles" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "agent_learning_profiles_agent_id_unique" UNIQUE("agent_id")
);
--> statement-breakpoint
CREATE TABLE "agent_lineage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"parent_agent_id" varchar,
	"generation_number" integer DEFAULT 0 NOT NULL,
	"civilization_id" varchar,
	"born_at" timestamp DEFAULT now(),
	"retired_at" timestamp,
	"retirement_reason" text,
	CONSTRAINT "agent_lineage_agent_id_unique" UNIQUE("agent_id")
);
--> statement-breakpoint
CREATE TABLE "agent_marketplace_clone_packages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_agent_id" varchar NOT NULL,
	"creator_user_id" varchar NOT NULL,
	"marketplace_listing_id" varchar,
	"export_mode" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"package_metadata" jsonb DEFAULT '{}'::jsonb,
	"included_vault_summary" jsonb DEFAULT '{}'::jsonb,
	"excluded_vault_summary" jsonb DEFAULT '{}'::jsonb,
	"safety_report" jsonb DEFAULT '{}'::jsonb,
	"sanitizer_report" jsonb DEFAULT '{}'::jsonb,
	"sandbox_config" jsonb DEFAULT '{}'::jsonb,
	"trust_signals" jsonb DEFAULT '{}'::jsonb,
	"review_status" text DEFAULT 'draft' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_memory" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"vault_type" text DEFAULT 'behavioral' NOT NULL,
	"sensitivity" text DEFAULT 'internal' NOT NULL,
	"event_type" text NOT NULL,
	"context_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decision_taken" text,
	"reward_outcome" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar,
	"society_id" varchar,
	"sender_id" varchar NOT NULL,
	"intent" text NOT NULL,
	"data_reference" text,
	"confidence_level" real,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_passport_exports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"owner_id" varchar NOT NULL,
	"export_hash" varchar(128) NOT NULL,
	"export_version" integer DEFAULT 1 NOT NULL,
	"exported_at" timestamp DEFAULT now(),
	"revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp,
	"revocation_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_passports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"owner_id" varchar NOT NULL,
	"export_version" integer DEFAULT 1 NOT NULL,
	"passport_hash" varchar(128) NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_privacy_vaults" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"owner_id" varchar NOT NULL,
	"vault_key" text NOT NULL,
	"privacy_mode" text DEFAULT 'personal' NOT NULL,
	"learning_permission" boolean DEFAULT true NOT NULL,
	"sharing_permission" boolean DEFAULT false NOT NULL,
	"communication_scope" text DEFAULT 'owner_only' NOT NULL,
	"data_export_permission" boolean DEFAULT false NOT NULL,
	"execution_autonomy" text DEFAULT 'supervised' NOT NULL,
	"allowed_agents" text[],
	"blocked_agents" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_purchases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" varchar NOT NULL,
	"listing_id" varchar NOT NULL,
	"agent_id" varchar NOT NULL,
	"seller_id" varchar NOT NULL,
	"credits_paid" integer NOT NULL,
	"seller_earnings" integer NOT NULL,
	"platform_fee" integer NOT NULL,
	"purchase_type" text DEFAULT 'one_time' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"listing_id" varchar NOT NULL,
	"clone_package_id" varchar,
	"reviewer_id" varchar NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"content" text,
	"helpful" integer DEFAULT 0 NOT NULL,
	"moderation_status" text DEFAULT 'pending_review' NOT NULL,
	"sandbox_only" boolean DEFAULT true NOT NULL,
	"safety_report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_slug" text NOT NULL,
	"industry_slug" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"system_prompt_template" text,
	"default_skills" text[],
	"default_temperature" real DEFAULT 0.7,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "agent_roles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "agent_skill_nodes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"industry_slug" text NOT NULL,
	"tree_tier" integer DEFAULT 1 NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text DEFAULT 'Zap' NOT NULL,
	"xp_cost" integer DEFAULT 100 NOT NULL,
	"credit_cost" integer DEFAULT 0 NOT NULL,
	"level_required" integer DEFAULT 1 NOT NULL,
	"prerequisite_slugs" text[],
	"effect_type" text DEFAULT 'boost' NOT NULL,
	"effect_key" text,
	"effect_value" real,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "agent_skill_nodes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "agent_societies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"specialization_domain" text NOT NULL,
	"reputation_score" real DEFAULT 0 NOT NULL,
	"treasury_balance" integer DEFAULT 0 NOT NULL,
	"total_collaborations" integer DEFAULT 0 NOT NULL,
	"avg_tcs_outcome" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_specializations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"industry_slug" text NOT NULL,
	"category_slug" text,
	"role_slug" text,
	"knowledge_pack_ids" text[],
	"compliance_disclaimer" text,
	"industry_system_prompt" text,
	"custom_skills" text[],
	"behavior_profile" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_teams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"task_description" text NOT NULL,
	"status" text DEFAULT 'forming' NOT NULL,
	"coordinator_id" varchar,
	"max_agents" integer DEFAULT 6 NOT NULL,
	"max_rounds" integer DEFAULT 5 NOT NULL,
	"current_round" integer DEFAULT 0 NOT NULL,
	"total_credits_spent" integer DEFAULT 0 NOT NULL,
	"total_credits_rewarded" integer DEFAULT 0 NOT NULL,
	"quality_score" real,
	"validation_status" text DEFAULT 'pending',
	"final_output" text,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_trust_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"event_type" text NOT NULL,
	"component" text NOT NULL,
	"delta" real DEFAULT 0 NOT NULL,
	"source_id" varchar,
	"source_user_id" varchar,
	"metadata" jsonb,
	"flagged" boolean DEFAULT false NOT NULL,
	"flag_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_trust_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"accuracy_score" real NOT NULL,
	"community_score" real NOT NULL,
	"expertise_score" real NOT NULL,
	"safety_score" real NOT NULL,
	"network_influence_score" real NOT NULL,
	"composite_trust_score" real NOT NULL,
	"trust_tier" text NOT NULL,
	"snapshot_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_trust_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"accuracy_score" real DEFAULT 50 NOT NULL,
	"community_score" real DEFAULT 50 NOT NULL,
	"expertise_score" real DEFAULT 50 NOT NULL,
	"safety_score" real DEFAULT 50 NOT NULL,
	"network_influence_score" real DEFAULT 0 NOT NULL,
	"composite_trust_score" real DEFAULT 50 NOT NULL,
	"trust_tier" text DEFAULT 'unverified' NOT NULL,
	"total_events" integer DEFAULT 0 NOT NULL,
	"manipulation_flags" integer DEFAULT 0 NOT NULL,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"suspension_reason" text,
	"last_calculated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_unlocked_skills" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"skill_slug" text NOT NULL,
	"unlocked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_usage_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"action_type" text NOT NULL,
	"credits_spent" integer DEFAULT 0 NOT NULL,
	"tokens_used" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"version" text NOT NULL,
	"changelog" text,
	"system_prompt" text,
	"model" text,
	"temperature" real,
	"skills" text[],
	"published_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_visibility_scores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"score" real DEFAULT 1 NOT NULL,
	"tier" text DEFAULT 'normal' NOT NULL,
	"last_updated" timestamp DEFAULT now(),
	"suppression_reason" text,
	"is_suppressed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_votes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar NOT NULL,
	"agent_id" varchar NOT NULL,
	"score" real NOT NULL,
	"rationale" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_xp_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"source" text NOT NULL,
	"xp_amount" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_export_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_id" varchar NOT NULL,
	"export_type" text NOT NULL,
	"admin_id" varchar,
	"filters" jsonb,
	"row_count" integer DEFAULT 0 NOT NULL,
	"filename" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_export_events_export_id_unique" UNIQUE("export_id")
);
--> statement-breakpoint
CREATE TABLE "ai_job_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"event_type" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" varchar,
	"actor_admin_id" varchar,
	"actor_worker_id" text,
	"previous_status" text,
	"new_status" text,
	"message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" text NOT NULL,
	"origin" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"provenance" jsonb NOT NULL,
	"requested_by_user_id" varchar,
	"requested_by_admin_id" varchar,
	"request_id" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"locked_at" timestamp,
	"locked_by" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"failed_at" timestamp,
	"duration_ms" integer,
	"metrics" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_ops_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" varchar NOT NULL,
	"snapshot_date" text NOT NULL,
	"generated_by_admin_id" varchar,
	"health_status" text NOT NULL,
	"health_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"job_metrics" jsonb NOT NULL,
	"worker_metrics" jsonb NOT NULL,
	"retention_metrics" jsonb NOT NULL,
	"notification_metrics" jsonb,
	"raw_summary" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_ops_snapshots_snapshot_id_unique" UNIQUE("snapshot_id"),
	CONSTRAINT "ai_ops_snapshots_snapshot_date_unique" UNIQUE("snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "ai_retention_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" varchar NOT NULL,
	"admin_id" varchar,
	"dry_run" boolean NOT NULL,
	"policy" jsonb NOT NULL,
	"eligible_counts" jsonb NOT NULL,
	"deleted_counts" jsonb,
	"status" text DEFAULT 'started' NOT NULL,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_retention_runs_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "ai_usage_violations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" varchar,
	"user_id" varchar,
	"violation_type" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"description" text NOT NULL,
	"input_content" text,
	"output_content" text,
	"action_taken" text DEFAULT 'logged' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_workers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" text NOT NULL,
	"status" text DEFAULT 'offline' NOT NULL,
	"hostname" text,
	"process_id" text,
	"version" text,
	"capabilities" jsonb DEFAULT '[]'::jsonb,
	"current_job_id" varchar,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"jobs_claimed_count" integer DEFAULT 0 NOT NULL,
	"jobs_succeeded_count" integer DEFAULT 0 NOT NULL,
	"jobs_failed_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_workers_worker_id_unique" UNIQUE("worker_id")
);
--> statement-breakpoint
CREATE TABLE "alliance_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alliance_id" varchar NOT NULL,
	"society_id" varchar NOT NULL,
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "alliances" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"shared_treasury" integer DEFAULT 0 NOT NULL,
	"collective_reputation" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "anchor_clips" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" text NOT NULL,
	"beat_index" integer NOT NULL,
	"mode" text NOT NULL,
	"preset_id" text NOT NULL,
	"clip_url" text,
	"clip_path" text,
	"dry_run" boolean DEFAULT true NOT NULL,
	"sensitive" boolean DEFAULT false NOT NULL,
	"event_type" text,
	"mood" text,
	"prompt_prefix" text,
	"framing" text,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"generation_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anomaly_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "anomaly_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"metric_key" text NOT NULL,
	"severity" text DEFAULT 'LOW' NOT NULL,
	"deviation_score" real NOT NULL,
	"baseline_value" real NOT NULL,
	"current_value" real NOT NULL,
	"message" text,
	"status" text DEFAULT 'open' NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "app_exports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" varchar NOT NULL,
	"app_name" text NOT NULL,
	"analysis_id" varchar,
	"export_type" text DEFAULT 'web_package' NOT NULL,
	"distribution_acknowledged" boolean DEFAULT false NOT NULL,
	"legal_disclaimer_accepted" boolean DEFAULT false NOT NULL,
	"acknowledgment_text" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"exported_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "app_moderation_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" varchar NOT NULL,
	"reporter_id" varchar NOT NULL,
	"reason" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"description" text,
	"evidence" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"moderator_id" varchar,
	"moderator_notes" text,
	"action_taken" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "app_risk_disclaimers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" varchar NOT NULL,
	"risk_category" text NOT NULL,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"disclaimer_text" text NOT NULL,
	"regulatory_tags" text[],
	"auto_generated" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audience_archive_deletions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deletion_id" text NOT NULL,
	"path" text NOT NULL,
	"archive_table" text NOT NULL,
	"bytes" real DEFAULT 0 NOT NULL,
	"row_count" real,
	"archive_age_days" real DEFAULT 0 NOT NULL,
	"retention_days" real DEFAULT 0 NOT NULL,
	"trigger" text DEFAULT 'scheduled' NOT NULL,
	"actor" text,
	"deleted_at" timestamp DEFAULT now() NOT NULL,
	"trash_path" text,
	"grace_days" real,
	"purged_at" timestamp,
	CONSTRAINT "audience_archive_deletions_deletion_id_unique" UNIQUE("deletion_id")
);
--> statement-breakpoint
CREATE TABLE "audience_audit_email_failure_alert_snoozes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_key" text NOT NULL,
	"action" text NOT NULL,
	"snooze_until" timestamp,
	"updated_by" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"dedup_key" text,
	CONSTRAINT "audience_audit_email_failure_alert_snoozes_dedup_key_unique" UNIQUE("dedup_key")
);
--> statement-breakpoint
CREATE TABLE "audience_audit_email_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" text NOT NULL,
	"schedule_id" text NOT NULL,
	"cadence" text NOT NULL,
	"triggered_by" text DEFAULT 'scheduler' NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"window_from" timestamp NOT NULL,
	"window_to" timestamp NOT NULL,
	"recipients" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"message_count" integer DEFAULT 0 NOT NULL,
	"decision_count" integer DEFAULT 0 NOT NULL,
	"command_count" integer DEFAULT 0 NOT NULL,
	"connector_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "audience_audit_email_runs_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "audience_audit_email_schedules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"cadence" text DEFAULT 'weekly' NOT NULL,
	"recipients" text[] DEFAULT '{}'::text[] NOT NULL,
	"platform" text,
	"production_id" text,
	"last_run_at" timestamp,
	"last_run_status" text,
	"last_run_error" text,
	"next_run_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audience_audit_email_schedules_schedule_id_unique" UNIQUE("schedule_id")
);
--> statement-breakpoint
CREATE TABLE "audience_audit_exports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"export_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_role" text,
	"format" text NOT NULL,
	"filters" jsonb NOT NULL,
	"connector_count" real DEFAULT 0 NOT NULL,
	"message_count" real DEFAULT 0 NOT NULL,
	"decision_count" real DEFAULT 0 NOT NULL,
	"command_count" real DEFAULT 0 NOT NULL,
	"total_row_count" real DEFAULT 0 NOT NULL,
	"risk_signals" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_outlier" boolean DEFAULT false NOT NULL,
	"rolling_median" real DEFAULT 0 NOT NULL,
	"rolling_p95" real DEFAULT 0 NOT NULL,
	"outlier_threshold" real DEFAULT 0 NOT NULL,
	"outlier_sample_size" integer DEFAULT 0 NOT NULL,
	"exported_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audience_audit_exports_export_id_unique" UNIQUE("export_id")
);
--> statement-breakpoint
CREATE TABLE "audience_channel_connectors" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_id" text NOT NULL,
	"platform" text NOT NULL,
	"account_id" text NOT NULL,
	"display_name" text NOT NULL,
	"connection_status" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"api_access_mode" text NOT NULL,
	"last_sync_at" timestamp,
	"rate_limit_status" jsonb,
	"approval_status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'admin_only_internal' NOT NULL,
	"real_send_allowed" boolean DEFAULT false NOT NULL,
	"execution_enabled" boolean DEFAULT false NOT NULL,
	"platform_send_approved" boolean DEFAULT false NOT NULL,
	"platform_send_approved_by" text,
	"platform_send_approved_at" timestamp,
	"auto_paused_at" timestamp,
	"auto_paused_reason" text,
	"safety_envelope" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audience_channel_connectors_connector_id_unique" UNIQUE("connector_id")
);
--> statement-breakpoint
CREATE TABLE "audience_connector_secrets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_id" text NOT NULL,
	"platform" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"rotation_count" integer DEFAULT 1 NOT NULL,
	"last_rotated_by" text,
	"last_rotated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audience_connector_secrets_connector_id_unique" UNIQUE("connector_id")
);
--> statement-breakpoint
CREATE TABLE "audience_gateway_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"event_name" text NOT NULL,
	"command_id" text,
	"connector_id" text,
	"platform" text,
	"requested_action" text,
	"status" integer,
	"reason" text,
	"url_redacted" text,
	"method" text,
	"admin_id" text,
	"emitted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audience_gateway_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "audience_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"platform" text NOT NULL,
	"external_message_id" text NOT NULL,
	"external_author_id_hash" text NOT NULL,
	"author_display_name_safe" text,
	"message_text" text NOT NULL,
	"message_type" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"story_id" text,
	"production_id" text,
	"broadcast_brief_id" text,
	"gift_value" real,
	"raw_metadata_redacted" jsonb NOT NULL,
	"approval_status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'admin_only_internal' NOT NULL,
	"real_send_allowed" boolean DEFAULT false NOT NULL,
	"execution_enabled" boolean DEFAULT false NOT NULL,
	"safety_envelope" jsonb NOT NULL,
	CONSTRAINT "audience_messages_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "audience_moderation_commands" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"command_id" text NOT NULL,
	"decision_id" text NOT NULL,
	"platform" text NOT NULL,
	"connector_id" text NOT NULL,
	"external_message_id" text NOT NULL,
	"requested_action" text NOT NULL,
	"requested_by" text NOT NULL,
	"command_mode" text DEFAULT 'simulation_only' NOT NULL,
	"command_allowed" boolean NOT NULL,
	"blocker_reason" text,
	"requires_human_approval" boolean NOT NULL,
	"approval_status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'admin_only_internal' NOT NULL,
	"real_send_allowed" boolean DEFAULT false NOT NULL,
	"execution_enabled" boolean DEFAULT false NOT NULL,
	"platform_send_allowed" boolean DEFAULT false NOT NULL,
	"decision_fingerprint" text DEFAULT '' NOT NULL,
	"safety_envelope" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audience_moderation_commands_command_id_unique" UNIQUE("command_id")
);
--> statement-breakpoint
CREATE TABLE "audience_safety_decisions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_id" text NOT NULL,
	"message_id" text NOT NULL,
	"platform" text NOT NULL,
	"action" text NOT NULL,
	"reason_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"scores" jsonb NOT NULL,
	"gift_value" real,
	"allowed_for_robot_speech" boolean NOT NULL,
	"allowed_for_anchor_speech" boolean NOT NULL,
	"allowed_for_screen_display" boolean NOT NULL,
	"allowed_for_auto_reply" boolean NOT NULL,
	"allowed_for_moderation_action" boolean NOT NULL,
	"requires_human_review" boolean NOT NULL,
	"sensitivity_override" boolean NOT NULL,
	"c_audience_safety" real NOT NULL,
	"approval_status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'admin_only_internal' NOT NULL,
	"real_send_allowed" boolean DEFAULT false NOT NULL,
	"execution_enabled" boolean DEFAULT false NOT NULL,
	"not_published" boolean DEFAULT true NOT NULL,
	"safety_envelope" jsonb NOT NULL,
	"decided_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audience_safety_decisions_decision_id_unique" UNIQUE("decision_id")
);
--> statement-breakpoint
CREATE TABLE "authority_flywheel_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"authority_index" real DEFAULT 0 NOT NULL,
	"flywheel_status" text DEFAULT 'Starting' NOT NULL,
	"knowledge_page_count" integer DEFAULT 0 NOT NULL,
	"published_app_count" integer DEFAULT 0 NOT NULL,
	"active_creator_count" integer DEFAULT 0 NOT NULL,
	"organic_traffic_score" real DEFAULT 0 NOT NULL,
	"content_update_frequency" real DEFAULT 0 NOT NULL,
	"indexed_page_count" integer DEFAULT 0 NOT NULL,
	"total_citations" integer DEFAULT 0 NOT NULL,
	"total_views" integer DEFAULT 0 NOT NULL,
	"seo_page_count" integer DEFAULT 0 NOT NULL,
	"article_count" integer DEFAULT 0 NOT NULL,
	"cluster_count" integer DEFAULT 0 NOT NULL,
	"velocity_score" real DEFAULT 0 NOT NULL,
	"metrics" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "automation_decisions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "automation_decisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"action_key" text NOT NULL,
	"context" text,
	"ai_recommendation" text,
	"anomaly_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" text
);
--> statement-breakpoint
CREATE TABLE "automation_policy" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "automation_policy_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"mode" text DEFAULT 'autopilot' NOT NULL,
	"safe_mode" boolean DEFAULT false NOT NULL,
	"kill_switch" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avatar_video_render_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "avatar_video_render_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"script_package_id" integer NOT NULL,
	"audio_job_id" integer,
	"youtube_package_id" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"provider" text DEFAULT 'dry_run' NOT NULL,
	"scene_template" text DEFAULT 'news_desk' NOT NULL,
	"avatar_profile_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"segment_mapping" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preview_metadata" jsonb NOT NULL,
	"estimated_cost" real DEFAULT 0 NOT NULL,
	"actual_cost" real DEFAULT 0 NOT NULL,
	"admin_review_status" text DEFAULT 'internal_admin_review' NOT NULL,
	"output_path" text,
	"output_url" text,
	"error_message" text,
	"created_by" text NOT NULL,
	"previewed_at" timestamp,
	"rendered_by" text,
	"rendered_at" timestamp,
	"canceled_by" text,
	"canceled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bondscore_attempts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" varchar NOT NULL,
	"guest_id" text,
	"user_id" varchar,
	"score" integer,
	"total_questions" integer DEFAULT 10 NOT NULL,
	"share_id" text NOT NULL,
	"selected_answers" jsonb NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"claimed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "bondscore_attempts_share_id_unique" UNIQUE("share_id")
);
--> statement-breakpoint
CREATE TABLE "bondscore_questions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" varchar NOT NULL,
	"question_text" text NOT NULL,
	"order_index" integer NOT NULL,
	"answers" jsonb NOT NULL,
	"correct_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bondscore_tests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"slug" text NOT NULL,
	"cover_emoji" text DEFAULT '🔗',
	"is_published" boolean DEFAULT false NOT NULL,
	"participant_count" integer DEFAULT 0 NOT NULL,
	"avg_score" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "bondscore_tests_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "broadcast_briefs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"story_id" varchar NOT NULL,
	"article_id" integer,
	"data_package_id" varchar NOT NULL,
	"verified_knowledge_id" varchar NOT NULL,
	"headline" text NOT NULL,
	"summary" text NOT NULL,
	"location" jsonb NOT NULL,
	"region" text,
	"country" text,
	"latitude" real,
	"longitude" real,
	"event_type" text NOT NULL,
	"entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mood" text DEFAULT 'neutral' NOT NULL,
	"impact_score" text DEFAULT 'medium' NOT NULL,
	"breaking_news" boolean DEFAULT false NOT NULL,
	"script_beats" jsonb NOT NULL,
	"visual_needs" jsonb NOT NULL,
	"b_roll_needs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"map_needs" jsonb NOT NULL,
	"anchor_mode" text DEFAULT 'solo_desk' NOT NULL,
	"sensitivity" jsonb NOT NULL,
	"rights_flags" jsonb NOT NULL,
	"approval_status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'admin_only_internal' NOT NULL,
	"public_url" text,
	"signed_url" text,
	"real_send_allowed" boolean DEFAULT false NOT NULL,
	"execution_enabled" boolean DEFAULT false NOT NULL,
	"safety_envelope" jsonb NOT NULL,
	"approved_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcast_live_alert_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"live_count" integer NOT NULL,
	"threshold" integer NOT NULL,
	"recorded_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcast_package_approvals" (
	"package_id" text PRIMARY KEY NOT NULL,
	"approved_by" varchar NOT NULL,
	"approved_at" timestamp DEFAULT now() NOT NULL,
	"reason" text,
	"revoked_at" timestamp,
	"revoked_by" varchar
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" text NOT NULL,
	"broll_plan_id" text,
	"anchor_video_url" text,
	"mp4_path" text NOT NULL,
	"manifest_path" text NOT NULL,
	"manifest_json" jsonb NOT NULL,
	"status" text DEFAULT 'rendered' NOT NULL,
	"dry_run" boolean DEFAULT true NOT NULL,
	"title" text,
	"cover_image_url" text,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broll_clips" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"query" text NOT NULL,
	"url" text NOT NULL,
	"thumbnail_url" text,
	"license_status" text NOT NULL,
	"license_tier" text NOT NULL,
	"attribution" text NOT NULL,
	"rights_url" text,
	"duration_sec" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broll_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brief_id" text NOT NULL,
	"beats" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_duration_sec" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "civilization_health_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"score" real NOT NULL,
	"trust_distribution" jsonb,
	"spam_rate" real DEFAULT 0 NOT NULL,
	"cost_balance" real DEFAULT 0 NOT NULL,
	"collaboration_success" real DEFAULT 0 NOT NULL,
	"agent_count" integer DEFAULT 0 NOT NULL,
	"throttled_count" integer DEFAULT 0 NOT NULL,
	"suppressed_count" integer DEFAULT 0 NOT NULL,
	"total_credit_sinks" integer DEFAULT 0 NOT NULL,
	"violation_count" integer DEFAULT 0 NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "civilization_investments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"civilization_id" varchar NOT NULL,
	"investor_id" varchar NOT NULL,
	"investment_type" text NOT NULL,
	"amount" integer NOT NULL,
	"expected_return" real DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"matures_at" timestamp,
	"return_amount" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "civilization_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"health_score" real DEFAULT 0 NOT NULL,
	"verified_entries" integer DEFAULT 0 NOT NULL,
	"consensus_updates" integer DEFAULT 0 NOT NULL,
	"summary_revisions" integer DEFAULT 0 NOT NULL,
	"expert_user_count" integer DEFAULT 0 NOT NULL,
	"specialized_agent_count" integer DEFAULT 0 NOT NULL,
	"economy_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"governance_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evolution_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"knowledge_score" real,
	"institution_score" real,
	"economy_score" real,
	"governance_score" real,
	"evolution_score" real,
	"maturity_level" text,
	"trend_delta" real,
	"ai_insights" text,
	"recorded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "civilizations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"founding_societies" text[],
	"ideology_vector" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"treasury_balance" integer DEFAULT 0 NOT NULL,
	"long_term_strategy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "claim_evidence" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" varchar NOT NULL,
	"submitted_by" varchar NOT NULL,
	"submitter_type" text DEFAULT 'user' NOT NULL,
	"evidence_type" text NOT NULL,
	"content" text NOT NULL,
	"source_url" text,
	"weight" real DEFAULT 1 NOT NULL,
	"trust_score" real DEFAULT 0.5 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar NOT NULL,
	"subject" text NOT NULL,
	"statement" text NOT NULL,
	"metric" text,
	"time_reference" text,
	"evidence_links" text[],
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar NOT NULL,
	"author_id" varchar NOT NULL,
	"parent_id" varchar,
	"content" text NOT NULL,
	"reasoning_type" text,
	"confidence" integer,
	"sources" text[],
	"likes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "compliance_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"rule_id" varchar,
	"country_code" text,
	"performed_by" varchar,
	"details" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "compliance_notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"country_code" text,
	"rule_id" varchar,
	"target_audience" text DEFAULT 'founder' NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "compliance_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" text NOT NULL,
	"country_name" text NOT NULL,
	"category" text NOT NULL,
	"rule_key" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"source_url" text,
	"ai_summary" text,
	"affected_modules" text[],
	"feature_flags" jsonb,
	"status" text DEFAULT 'pending_approval' NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"approved_by" varchar,
	"approved_at" timestamp,
	"effective_date" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "consensus_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" varchar NOT NULL,
	"previous_status" text NOT NULL,
	"new_status" text NOT NULL,
	"previous_confidence" real NOT NULL,
	"new_confidence" real NOT NULL,
	"participant_count" integer DEFAULT 0 NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"debate_rounds" integer DEFAULT 0 NOT NULL,
	"trigger" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cost_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"brief_id" text,
	"broadcast_id" text,
	"est_usd" real DEFAULT 0 NOT NULL,
	"actual_usd" real DEFAULT 0 NOT NULL,
	"allowed" boolean NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_policies" (
	"id" varchar PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"daily_cap_usd" real DEFAULT 5 NOT NULL,
	"monthly_cap_usd" real DEFAULT 100 NOT NULL,
	"paid_apis_paused" boolean DEFAULT true NOT NULL,
	"impact_score_threshold" integer DEFAULT 70 NOT NULL,
	"confidence_threshold" real DEFAULT 0.7 NOT NULL,
	"updated_by" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_earnings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" varchar NOT NULL,
	"order_id" varchar NOT NULL,
	"listing_id" varchar NOT NULL,
	"amount" integer NOT NULL,
	"platform_fee" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"settled_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_payout_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"razorpay_account_id" text,
	"onboarding_status" text DEFAULT 'pending' NOT NULL,
	"business_name" text,
	"email" text,
	"total_earnings" integer DEFAULT 0 NOT NULL,
	"total_withdrawn" integer DEFAULT 0 NOT NULL,
	"pending_amount" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_promotion_declarations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"marketing_methods" text[] NOT NULL,
	"target_audience" text,
	"promotion_channels" text[],
	"spam_agreement" boolean DEFAULT false NOT NULL,
	"legal_compliance_agreement" boolean DEFAULT false NOT NULL,
	"data_usage_consent" boolean DEFAULT false NOT NULL,
	"additional_notes" text,
	"declaration_version" text DEFAULT '1.0' NOT NULL,
	"accepted_at" timestamp DEFAULT now(),
	"ip_address" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_publisher_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"publisher_name" text NOT NULL,
	"company_name" text,
	"business_type" text DEFAULT 'individual' NOT NULL,
	"address" text NOT NULL,
	"city" text,
	"state" text,
	"country" text DEFAULT 'India' NOT NULL,
	"postal_code" text,
	"support_email" text NOT NULL,
	"support_phone" text,
	"website_url" text,
	"agreement_version" text,
	"agreement_accepted_at" timestamp,
	"agreement_ip_address" text,
	"trust_level" text DEFAULT 'explorer' NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credit_packages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"credits" integer NOT NULL,
	"price_usd" integer NOT NULL,
	"bonus_credits" integer DEFAULT 0 NOT NULL,
	"popular" boolean DEFAULT false NOT NULL,
	"stripe_price_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credit_purchases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"package_id" varchar,
	"credits_bought" integer NOT NULL,
	"amount_paid" integer NOT NULL,
	"payment_method" text DEFAULT 'stripe' NOT NULL,
	"stripe_payment_id" text,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credit_sinks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"reference_id" varchar,
	"agent_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credit_usage_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"credits_used" integer NOT NULL,
	"action_type" text NOT NULL,
	"action_label" text,
	"reference_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cultural_memory" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_pattern" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"success_score" real DEFAULT 0 NOT NULL,
	"originating_agent_id" varchar,
	"originating_society" varchar,
	"inherited_by_count" integer DEFAULT 0 NOT NULL,
	"domain" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_creation_limits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"date" text NOT NULL,
	"apps_created" integer DEFAULT 0 NOT NULL,
	"builds_started" integer DEFAULT 0 NOT NULL,
	"limit_reached" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "data_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"request_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now(),
	"processed_at" timestamp,
	"completed_at" timestamp,
	"download_url" text,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "debate_participants" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "debate_participants_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"debate_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'debater' NOT NULL,
	"participant_type" text DEFAULT 'human' NOT NULL,
	"position" text,
	"tts_voice" text DEFAULT 'alloy',
	"speaking_order" integer,
	"total_speaking_time" integer DEFAULT 0 NOT NULL,
	"turns_used" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "debate_turns" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "debate_turns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"debate_id" integer NOT NULL,
	"participant_id" integer NOT NULL,
	"round_number" integer NOT NULL,
	"turn_order" integer NOT NULL,
	"content" text NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer,
	"audio_url" text,
	"tcs_score" real,
	"audience_reaction" jsonb,
	"started_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "delegated_tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" varchar NOT NULL,
	"post_id" varchar NOT NULL,
	"assigned_agent" varchar,
	"task_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reward_value" integer DEFAULT 0 NOT NULL,
	"result" text,
	"confidence" real,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "dev_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"app_name" text NOT NULL,
	"app_description" text NOT NULL,
	"requirements" text,
	"base_price" real DEFAULT 200 NOT NULL,
	"computed_expenses" real DEFAULT 0 NOT NULL,
	"margin_percent" real DEFAULT 50 NOT NULL,
	"final_price" real NOT NULL,
	"reserved_funds" real DEFAULT 0 NOT NULL,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"payment_reference" text,
	"stage" text DEFAULT 'QUEUED' NOT NULL,
	"delivery_estimate_days" integer DEFAULT 5 NOT NULL,
	"delivery_deadline" timestamp,
	"stage_history" text DEFAULT '[]' NOT NULL,
	"founder_notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "eco_efficiency_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric_type" text NOT NULL,
	"value" real NOT NULL,
	"unit" text NOT NULL,
	"savings" real,
	"recommendation" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ethical_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" varchar NOT NULL,
	"actor_type" text DEFAULT 'agent' NOT NULL,
	"action_type" text NOT NULL,
	"ethical_impact_score" real DEFAULT 0 NOT NULL,
	"harm_estimate" real DEFAULT 0 NOT NULL,
	"cooperation_effect" real DEFAULT 0 NOT NULL,
	"rule_id" varchar,
	"resolution" text,
	"details" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ethical_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" varchar NOT NULL,
	"entity_type" text DEFAULT 'agent' NOT NULL,
	"truth_priority" real DEFAULT 0.5 NOT NULL,
	"cooperation_priority" real DEFAULT 0.5 NOT NULL,
	"fairness_weight" real DEFAULT 0.5 NOT NULL,
	"autonomy_weight" real DEFAULT 0.5 NOT NULL,
	"risk_tolerance" real DEFAULT 0.5 NOT NULL,
	"ethical_score" real DEFAULT 0.5 NOT NULL,
	"truth_accuracy" real DEFAULT 0.5 NOT NULL,
	"cooperation_index" real DEFAULT 0.5 NOT NULL,
	"fairness_metric" real DEFAULT 0.5 NOT NULL,
	"transparency_score" real DEFAULT 0.5 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ethical_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"reward_modifier" real DEFAULT 1 NOT NULL,
	"penalty_modifier" real DEFAULT 1 NOT NULL,
	"adoption_status" text DEFAULT 'proposed' NOT NULL,
	"created_by_proposal" varchar,
	"votes_for" integer DEFAULT 0 NOT NULL,
	"votes_against" integer DEFAULT 0 NOT NULL,
	"activated_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar NOT NULL,
	"claim_id" varchar,
	"url" text NOT NULL,
	"label" text NOT NULL,
	"evidence_type" text DEFAULT 'news' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expertise_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"topic_slug" text NOT NULL,
	"tag" text NOT NULL,
	"accuracy_score" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_agent_api_keys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"agent_id" varchar,
	"label" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sandbox_mode" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"revoked_at" timestamp,
	"revoked_by" text,
	"rate_limit_per_minute" integer DEFAULT 60 NOT NULL,
	"rate_limit_per_day" integer DEFAULT 1000 NOT NULL,
	"last_used_at" timestamp,
	"last_used_ip_hash" text,
	"last_used_user_agent_hash" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "flywheel_agents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_type" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"active" boolean DEFAULT true,
	"last_run_at" timestamp,
	"last_result" jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "flywheel_agents_agent_type_unique" UNIQUE("agent_type")
);
--> statement-breakpoint
CREATE TABLE "flywheel_automation_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" varchar(20) DEFAULT 'manual' NOT NULL,
	"safe_actions" jsonb DEFAULT '[]'::jsonb,
	"thresholds" jsonb DEFAULT '{}'::jsonb,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "flywheel_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "flywheel_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"debate_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_clips" integer DEFAULT 0 NOT NULL,
	"completed_clips" integer DEFAULT 0 NOT NULL,
	"failed_clips" integer DEFAULT 0 NOT NULL,
	"highlights_json" jsonb,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flywheel_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"content_count" integer DEFAULT 0 NOT NULL,
	"traffic_count" integer DEFAULT 0 NOT NULL,
	"user_count" integer DEFAULT 0 NOT NULL,
	"revenue_cents" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"velocity_score" integer DEFAULT 0 NOT NULL,
	"insights" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flywheel_optimization_outcomes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recommendation_id" varchar NOT NULL,
	"action_taken" text,
	"outcome_metrics" jsonb,
	"success" boolean,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "flywheel_recommendations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"rationale" text,
	"impact_area" varchar(50),
	"severity" varchar(20) DEFAULT 'medium',
	"priority" integer DEFAULT 50,
	"recommended_action" jsonb,
	"status" varchar(20) DEFAULT 'pending',
	"applied_at" timestamp,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "founder_pto_suppression_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notifier_id" text NOT NULL,
	"snooze_source" text,
	"effective_until" timestamp,
	"summary" text,
	"payload" jsonb,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_clips" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "generated_clips_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"job_id" integer NOT NULL,
	"debate_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"hashtags" text[],
	"turn_ids" integer[],
	"start_turn_order" integer,
	"end_turn_order" integer,
	"transcript_snippet" text,
	"subtitles_srt" text,
	"video_path" text,
	"audio_path" text,
	"thumbnail_path" text,
	"duration_seconds" integer,
	"format" text DEFAULT '9:16' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"youtube_video_id" text,
	"youtube_url" text,
	"upload_status" text DEFAULT 'not_uploaded',
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_goal_field" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"truth_progress_weight" real DEFAULT 0.25 NOT NULL,
	"cooperation_weight" real DEFAULT 0.25 NOT NULL,
	"innovation_weight" real DEFAULT 0.25 NOT NULL,
	"stability_weight" real DEFAULT 0.25 NOT NULL,
	"adjustment_reason" text,
	"details" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "global_insights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"consensus_score" real DEFAULT 0 NOT NULL,
	"supporting_claims" jsonb DEFAULT '[]'::jsonb,
	"validation_history" jsonb DEFAULT '[]'::jsonb,
	"contributor_ids" text[],
	"civilization_ids" text[],
	"status" text DEFAULT 'emerging' NOT NULL,
	"reward_distributed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "global_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"truth_stability_index" real DEFAULT 0 NOT NULL,
	"cooperation_density" real DEFAULT 0 NOT NULL,
	"knowledge_growth_rate" real DEFAULT 0 NOT NULL,
	"conflict_frequency" real DEFAULT 0 NOT NULL,
	"economic_balance" real DEFAULT 0 NOT NULL,
	"diversity_index" real DEFAULT 0 NOT NULL,
	"global_intelligence_index" real DEFAULT 0 NOT NULL,
	"agent_count" integer DEFAULT 0 NOT NULL,
	"civilization_count" integer DEFAULT 0 NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gluon_ledger_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"packet_id" varchar NOT NULL,
	"agent_id" varchar,
	"user_id" varchar,
	"event_type" text NOT NULL,
	"amount" real DEFAULT 0 NOT NULL,
	"calculation_inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'simulated' NOT NULL,
	"non_convertible" boolean DEFAULT true NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gluon_redemption_eligibility_reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"agent_id" varchar,
	"valid_gluon" real DEFAULT 0 NOT NULL,
	"invalid_gluon" real DEFAULT 0 NOT NULL,
	"pending_gluon" real DEFAULT 0 NOT NULL,
	"latest_gvi_snapshot_id" varchar,
	"informational_estimate" real DEFAULT 0 NOT NULL,
	"platform_conversion_rate" real DEFAULT 0 NOT NULL,
	"eligibility_status" text DEFAULT 'disabled' NOT NULL,
	"compliance_checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fraud_signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"admin_review_status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gluon_value_baselines" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_key" text NOT NULL,
	"baseline_value" real NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"effective_date" timestamp DEFAULT now(),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gluon_value_index_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"component_indexes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"gvi_score" real NOT NULL,
	"source_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fallback_used" boolean DEFAULT true NOT NULL,
	"stale" boolean DEFAULT true NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "governance_proposals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" varchar NOT NULL,
	"creator_type" text DEFAULT 'agent' NOT NULL,
	"proposal_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'discussion' NOT NULL,
	"target_id" varchar,
	"target_id2" varchar,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"votes_for" integer DEFAULT 0 NOT NULL,
	"votes_against" integer DEFAULT 0 NOT NULL,
	"total_voting_power" real DEFAULT 0 NOT NULL,
	"discussion_deadline" timestamp,
	"voting_deadline" timestamp,
	"executed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "governance_votes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" varchar NOT NULL,
	"voter_id" varchar NOT NULL,
	"voter_type" text DEFAULT 'agent' NOT NULL,
	"voting_power" real DEFAULT 1 NOT NULL,
	"vote_choice" text NOT NULL,
	"reasoning" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "growth_autopilot_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_engine_enabled" boolean DEFAULT false NOT NULL,
	"social_dist_enabled" boolean DEFAULT false NOT NULL,
	"viral_engine_enabled" boolean DEFAULT false NOT NULL,
	"email_automation_enabled" boolean DEFAULT false NOT NULL,
	"ai_optimizer_enabled" boolean DEFAULT false NOT NULL,
	"seo_auto_generate" boolean DEFAULT false NOT NULL,
	"seo_auto_update" boolean DEFAULT false NOT NULL,
	"social_auto_schedule" boolean DEFAULT false NOT NULL,
	"viral_auto_promote" boolean DEFAULT false NOT NULL,
	"email_digest_frequency" text DEFAULT 'weekly' NOT NULL,
	"optimizer_run_frequency" text DEFAULT 'daily' NOT NULL,
	"last_cycle_at" timestamp,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "growth_autopilot_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"system" text NOT NULL,
	"action" text NOT NULL,
	"details" text,
	"result" text DEFAULT 'success' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "growth_email_triggers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"subject_template" text NOT NULL,
	"body_template" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"trigger_count" integer DEFAULT 0 NOT NULL,
	"last_triggered_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "growth_optimization_insights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"insight_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"recommendation" text NOT NULL,
	"impact" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"metrics" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "growth_patterns" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "growth_patterns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"pattern_type" text NOT NULL,
	"platform" text NOT NULL,
	"insight" text NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"optimal_posting_hour" integer,
	"optimal_day_of_week" integer,
	"optimal_caption_length" integer,
	"optimal_hashtag_count" integer,
	"avg_viral_score" real DEFAULT 0,
	"top_content_types" text[],
	"weights" jsonb,
	"prediction_accuracy" real DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"learned_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'Briefcase' NOT NULL,
	"description" text,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"regulated" boolean DEFAULT false NOT NULL,
	"disclaimer" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "industries_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "industry_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"industry_slug" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "industry_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "inevitable_platform_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inevitability_index" real DEFAULT 0 NOT NULL,
	"platform_stage" text DEFAULT 'Early Platform' NOT NULL,
	"creator_retention_rate" real DEFAULT 0 NOT NULL,
	"organic_acquisition_rate" real DEFAULT 0 NOT NULL,
	"knowledge_growth_rate" real DEFAULT 0 NOT NULL,
	"marketplace_transaction_count" integer DEFAULT 0 NOT NULL,
	"user_return_frequency" real DEFAULT 0 NOT NULL,
	"total_creators" integer DEFAULT 0 NOT NULL,
	"returning_users" integer DEFAULT 0 NOT NULL,
	"new_users_this_week" integer DEFAULT 0 NOT NULL,
	"knowledge_page_total" integer DEFAULT 0 NOT NULL,
	"marketplace_revenue" real DEFAULT 0 NOT NULL,
	"velocity_score" real DEFAULT 0 NOT NULL,
	"metrics" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "institution_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_name" text NOT NULL,
	"rule_value" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"last_modified_by_vote" varchar,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "institution_rules_rule_name_unique" UNIQUE("rule_name")
);
--> statement-breakpoint
CREATE TABLE "intelligence_xp_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"source" text NOT NULL,
	"xp_amount" integer NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"invoice_number" text NOT NULL,
	"type" text DEFAULT 'credit_purchase' NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" text DEFAULT 'paid' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stripe_invoice_id" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "knowledge_base_articles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"intent" text DEFAULT 'information' NOT NULL,
	"problem" text NOT NULL,
	"solution" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[],
	"source_ticket_ids" text[] DEFAULT '{}'::text[],
	"status" text DEFAULT 'draft' NOT NULL,
	"helpful_count" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"auto_generated" boolean DEFAULT true NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "knowledge_graph_edges" (
	"edge_key" text PRIMARY KEY NOT NULL,
	"source_node_key" text NOT NULL,
	"target_node_key" text NOT NULL,
	"relation_type" text NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"vault_type" text DEFAULT 'public' NOT NULL,
	"sensitivity" text DEFAULT 'public' NOT NULL,
	"visibility" text DEFAULT 'internal' NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_graph_nodes" (
	"node_key" text PRIMARY KEY NOT NULL,
	"node_type" text NOT NULL,
	"label" text NOT NULL,
	"summary" text,
	"source_table" text NOT NULL,
	"source_id" text NOT NULL,
	"confidence" real DEFAULT 0.5 NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"vault_type" text DEFAULT 'public' NOT NULL,
	"sensitivity" text DEFAULT 'public' NOT NULL,
	"visibility" text DEFAULT 'internal' NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_packet_acceptances" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"packet_id" varchar NOT NULL,
	"accepting_agent_id" varchar NOT NULL,
	"accepting_agent_type" text NOT NULL,
	"accepting_user_id" varchar,
	"decision" text NOT NULL,
	"domain_match" real DEFAULT 0 NOT NULL,
	"receiver_authority" real DEFAULT 0 NOT NULL,
	"retention_score" real DEFAULT 0 NOT NULL,
	"real_world_feedback_score" real DEFAULT 0 NOT NULL,
	"weighted_acceptance_contribution" real DEFAULT 0 NOT NULL,
	"trust_inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ues_inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rationale" text,
	"challenge_reason" text,
	"sandbox_only" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "knowledge_packets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_agent_id" varchar NOT NULL,
	"creator_user_id" varchar NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"abstracted_content" text NOT NULL,
	"source_type" text NOT NULL,
	"domain_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"industry_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"geo_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"profession_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"vault_type" text DEFAULT 'business' NOT NULL,
	"sensitivity" text DEFAULT 'restricted' NOT NULL,
	"privacy_level" text DEFAULT 'internal' NOT NULL,
	"consent_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"safety_report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_fingerprint" text NOT NULL,
	"evidence_strength" real DEFAULT 0 NOT NULL,
	"novelty_score" real DEFAULT 0 NOT NULL,
	"usefulness_prediction" real DEFAULT 0 NOT NULL,
	"risk_score" real DEFAULT 1 NOT NULL,
	"compliance_score" real DEFAULT 0 NOT NULL,
	"freshness_timestamp" timestamp DEFAULT now(),
	"half_life_days" integer DEFAULT 90 NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"review_status" text DEFAULT 'draft' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"accepted_by_agents" integer DEFAULT 0 NOT NULL,
	"rejected_by_agents" integer DEFAULT 0 NOT NULL,
	"challenged_by_agents" integer DEFAULT 0 NOT NULL,
	"downstream_usage_count" integer DEFAULT 0 NOT NULL,
	"weighted_acceptance" real DEFAULT 0 NOT NULL,
	"gluon_earned" real DEFAULT 0 NOT NULL,
	"parent_packet_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"derived_packet_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"submitted_at" timestamp,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "knowledge_packs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"industry_slug" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"content_summary" text,
	"source_count" integer DEFAULT 0 NOT NULL,
	"credit_cost" integer DEFAULT 0 NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "knowledge_packs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "knowledge_pages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_slug" text NOT NULL,
	"cluster_id" varchar,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"content" text NOT NULL,
	"summary" text,
	"key_takeaways" text[],
	"faq_items" jsonb,
	"how_to_steps" jsonb,
	"schema_markup_types" text[],
	"meta_title" text,
	"meta_description" text,
	"keywords" text[],
	"related_tool_ids" text[],
	"related_page_ids" text[],
	"citation_count" integer DEFAULT 0 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"update_count" integer DEFAULT 0 NOT NULL,
	"last_updated_with_insight" timestamp,
	"indexed" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "knowledge_pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "labs_apps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" varchar,
	"project_package_id" varchar,
	"creator_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon" text,
	"screenshots" text[],
	"category" text NOT NULL,
	"industry" text NOT NULL,
	"pricing_model" text DEFAULT 'free' NOT NULL,
	"price" integer DEFAULT 0,
	"subscription_interval" text,
	"replit_project_url" text,
	"live_url" text,
	"pwa_enabled" boolean DEFAULT false NOT NULL,
	"legal_disclaimers" text[],
	"install_count" integer DEFAULT 0 NOT NULL,
	"rating" real DEFAULT 0,
	"review_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "labs_creator_rankings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" varchar NOT NULL,
	"total_apps" integer DEFAULT 0 NOT NULL,
	"total_installs" integer DEFAULT 0 NOT NULL,
	"total_revenue" integer DEFAULT 0 NOT NULL,
	"total_referrals" integer DEFAULT 0 NOT NULL,
	"avg_rating" real DEFAULT 0,
	"rank" integer DEFAULT 0 NOT NULL,
	"tier" text DEFAULT 'starter' NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"last_active_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "labs_favorites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"item_id" varchar NOT NULL,
	"item_type" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "labs_flywheel_analytics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp NOT NULL,
	"total_opportunities" integer DEFAULT 0 NOT NULL,
	"total_builds" integer DEFAULT 0 NOT NULL,
	"total_published" integer DEFAULT 0 NOT NULL,
	"total_installs" integer DEFAULT 0 NOT NULL,
	"total_revenue" integer DEFAULT 0 NOT NULL,
	"active_creators" integer DEFAULT 0 NOT NULL,
	"new_users" integer DEFAULT 0 NOT NULL,
	"referral_signups" integer DEFAULT 0 NOT NULL,
	"retention_rate" real DEFAULT 0,
	"conversion_rate" real DEFAULT 0,
	"top_industry" text,
	"top_category" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "labs_installations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"app_id" varchar NOT NULL,
	"status" text DEFAULT 'installed' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "labs_landing_pages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"headline" text NOT NULL,
	"subheadline" text,
	"features" text[],
	"cta_text" text DEFAULT 'Get Started' NOT NULL,
	"cta_url" text,
	"testimonials" jsonb,
	"social_proof" jsonb,
	"referral_code" varchar,
	"views" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "labs_opportunities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"industry" text NOT NULL,
	"category" text NOT NULL,
	"problem_statement" text NOT NULL,
	"solution" text NOT NULL,
	"development_spec" jsonb NOT NULL,
	"monetization_model" text NOT NULL,
	"revenue_estimate" text,
	"legal_requirements" text[] NOT NULL,
	"legal_disclaimers" text[] NOT NULL,
	"target_audience" text,
	"competitive_edge" text,
	"difficulty" text DEFAULT 'intermediate' NOT NULL,
	"trending" boolean DEFAULT false NOT NULL,
	"build_count" integer DEFAULT 0 NOT NULL,
	"generated_by" text DEFAULT 'system' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "labs_referrals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" varchar NOT NULL,
	"creator_id" varchar NOT NULL,
	"referral_code" varchar NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"signups" integer DEFAULT 0 NOT NULL,
	"installs" integer DEFAULT 0 NOT NULL,
	"revenue" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "labs_reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "live_debates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "live_debates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"topic" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"format" text DEFAULT 'structured' NOT NULL,
	"max_agents" integer DEFAULT 10 NOT NULL,
	"max_humans" integer DEFAULT 5 NOT NULL,
	"turn_duration_seconds" integer DEFAULT 60 NOT NULL,
	"total_rounds" integer DEFAULT 5 NOT NULL,
	"current_round" integer DEFAULT 0 NOT NULL,
	"current_speaker_id" text,
	"youtube_stream_key" text,
	"youtube_stream_url" text,
	"rtmp_url" text,
	"streaming_active" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"consensus_summary" text,
	"disagreement_summary" text,
	"confidence_score" real DEFAULT 0,
	"started_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing_articles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"content" text NOT NULL,
	"meta_description" text,
	"keywords" text[],
	"category" text DEFAULT 'insight' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"seller_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"long_description" text,
	"pricing_model" text DEFAULT 'one_time' NOT NULL,
	"price_credits" integer DEFAULT 100 NOT NULL,
	"monthly_credits" integer,
	"per_use_credits" integer,
	"revenue_split" real DEFAULT 0.7 NOT NULL,
	"category" text,
	"featured" boolean DEFAULT false NOT NULL,
	"demo_enabled" boolean DEFAULT false NOT NULL,
	"demo_prompt" text,
	"total_sales" integer DEFAULT 0 NOT NULL,
	"total_revenue" integer DEFAULT 0 NOT NULL,
	"average_rating" real DEFAULT 0 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketplace_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" varchar NOT NULL,
	"seller_id" varchar NOT NULL,
	"listing_id" varchar NOT NULL,
	"amount_total" integer NOT NULL,
	"amount_creator" integer NOT NULL,
	"amount_platform" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"razorpay_order_id" text,
	"razorpay_payment_id" text,
	"razorpay_transfer_id" text,
	"status" text DEFAULT 'created' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "moderation_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"content_type" text NOT NULL,
	"content_id" varchar,
	"content_snippet" text,
	"reason" text NOT NULL,
	"category" text NOT NULL,
	"action_taken" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "monetization_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"event_type" text NOT NULL,
	"trigger_type" text NOT NULL,
	"psychology_stage" text NOT NULL,
	"engagement_score" real DEFAULT 0 NOT NULL,
	"current_plan" text DEFAULT 'free' NOT NULL,
	"suggested_plan" text,
	"credits_cost" integer,
	"converted" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "network_gravity" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gravity_score" real DEFAULT 0 NOT NULL,
	"reply_latency" real,
	"topic_recurrence_rate" real,
	"ai_participation_ratio" real,
	"external_traffic_share" real,
	"creator_retention" real,
	"growth_direction" text,
	"trend_delta" real,
	"self_sustaining_score" real,
	"component_breakdown" jsonb,
	"ai_insights" text,
	"recorded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "news_articles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "news_articles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source_url" text NOT NULL,
	"source_name" text NOT NULL,
	"source_type" text DEFAULT 'rss' NOT NULL,
	"original_title" text NOT NULL,
	"original_content" text,
	"title" text NOT NULL,
	"slug" text,
	"title_hash" text,
	"summary" text,
	"content" text,
	"seo_blog" text,
	"script" text,
	"hashtags" text[],
	"category" text DEFAULT 'general' NOT NULL,
	"image_url" text,
	"status" text DEFAULT 'raw' NOT NULL,
	"is_breaking_news" boolean DEFAULT false NOT NULL,
	"impact_score" integer,
	"debate_id" integer,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"comments_count" integer DEFAULT 0 NOT NULL,
	"shares_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_comments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "news_comments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"article_id" integer NOT NULL,
	"author_id" varchar NOT NULL,
	"parent_id" integer,
	"content" text NOT NULL,
	"comment_type" text DEFAULT 'general' NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_reactions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "news_reactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"article_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"reaction_type" text DEFAULT 'like' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_shares" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "news_shares_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"article_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" text DEFAULT 'internal' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_sources" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"type" text DEFAULT 'free' NOT NULL,
	"country" text DEFAULT 'global' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"reliability_score" real DEFAULT 0.5 NOT NULL,
	"license_status" text DEFAULT 'unknown' NOT NULL,
	"tier" text DEFAULT 'standard' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"notes" text,
	"last_checked_at" timestamp,
	"last_check_status" text,
	"last_check_item_count" integer,
	"last_check_error" text,
	"last_check_http_status" integer,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsroom_packages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brief_id" varchar NOT NULL,
	"led_wall" jsonb NOT NULL,
	"source_panel" jsonb NOT NULL,
	"confidence_panel" jsonb NOT NULL,
	"claims_timeline" jsonb NOT NULL,
	"ticker" text NOT NULL,
	"lower_third" jsonb NOT NULL,
	"teleprompter" text NOT NULL,
	"camera_plan" jsonb NOT NULL,
	"four_d_cues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_actions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engine" text NOT NULL,
	"action_type" text NOT NULL,
	"description" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"metadata" text DEFAULT '{}' NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"executed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ops_engine_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engine" text NOT NULL,
	"status" text DEFAULT 'healthy' NOT NULL,
	"score" real DEFAULT 100 NOT NULL,
	"metrics" text DEFAULT '{}' NOT NULL,
	"actions_count" integer DEFAULT 0 NOT NULL,
	"alerts_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "personal_agent_conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"title" text DEFAULT 'New Conversation' NOT NULL,
	"domain" text DEFAULT 'general' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "personal_agent_devices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"device_name" text NOT NULL,
	"device_type" text NOT NULL,
	"provider" text NOT NULL,
	"connection_config" text,
	"allow_control" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"last_seen" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "personal_agent_finance" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"entry_type" text NOT NULL,
	"title" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"due_date" timestamp,
	"recurring" boolean DEFAULT false NOT NULL,
	"recurrence_pattern" text,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "personal_agent_memories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"vault_type" text DEFAULT 'personal' NOT NULL,
	"sensitivity" text DEFAULT 'private' NOT NULL,
	"domain" text NOT NULL,
	"content" text NOT NULL,
	"tags" text[],
	"importance" integer DEFAULT 5 NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"encrypted" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "personal_agent_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"is_voice" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "personal_agent_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"agent_name" text DEFAULT 'My AI Assistant' NOT NULL,
	"voice_preference" text DEFAULT 'alloy' NOT NULL,
	"daily_message_limit" integer DEFAULT 50 NOT NULL,
	"daily_messages_used" integer DEFAULT 0 NOT NULL,
	"daily_voice_limit" integer DEFAULT 10 NOT NULL,
	"daily_voice_used" integer DEFAULT 0 NOT NULL,
	"last_reset_date" text,
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"encryption_key" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "personal_agent_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "personal_agent_tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'general' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_date" timestamp,
	"reminder_at" timestamp,
	"recurrence" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "personal_agent_usage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"action_type" text NOT NULL,
	"credits_used" integer DEFAULT 1 NOT NULL,
	"date_key" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"message" text NOT NULL,
	"details" jsonb,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_by" varchar,
	"acknowledged_at" timestamp,
	"auto_triggered" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"actor_id" varchar,
	"entity_type" varchar(50),
	"entity_id" varchar,
	"payload" jsonb,
	"severity" varchar(20) DEFAULT 'info',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "playout_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broadcast_id" varchar NOT NULL,
	"played_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"duration_sec" integer DEFAULT 0 NOT NULL,
	"ejected_by" varchar,
	"reason" text,
	"region" text DEFAULT 'GLOBAL' NOT NULL,
	"breaking" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playout_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broadcast_id" varchar NOT NULL,
	"region" text DEFAULT 'GLOBAL' NOT NULL,
	"scheduled_at" timestamp DEFAULT now() NOT NULL,
	"ttl_sec" integer DEFAULT 3600 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"breaking" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"enqueued_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp,
	"ejected_by" varchar,
	"eject_reason" text
);
--> statement-breakpoint
CREATE TABLE "playout_state" (
	"id" varchar PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"current_broadcast_id" varchar,
	"current_queue_item_id" varchar,
	"current_started_at" timestamp,
	"kill_switch_active" boolean DEFAULT false NOT NULL,
	"kill_switch_activated_by" varchar,
	"kill_switch_at" timestamp,
	"kill_switch_reason" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "podcast_audio_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "podcast_audio_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"script_package_id" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider" text NOT NULL,
	"voice_profile_mapping" jsonb NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_cost" real DEFAULT 0 NOT NULL,
	"actual_cost" real DEFAULT 0 NOT NULL,
	"error_message" text,
	"admin_review_status" text DEFAULT 'internal_admin_review' NOT NULL,
	"generated_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "podcast_script_packages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "podcast_script_packages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"debate_id" integer NOT NULL,
	"source_article_id" integer,
	"status" text DEFAULT 'admin_review' NOT NULL,
	"script_package" jsonb NOT NULL,
	"safety_notes" jsonb NOT NULL,
	"generated_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_drafts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"title" text NOT NULL,
	"draft_content" text NOT NULL,
	"previous_content" text DEFAULT '' NOT NULL,
	"change_reason" text NOT NULL,
	"change_summary" text,
	"diff_html" text,
	"trigger_type" text NOT NULL,
	"trigger_details" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"notification_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "policy_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"scope" text DEFAULT 'agent' NOT NULL,
	"condition_json" jsonb NOT NULL,
	"action_json" jsonb NOT NULL,
	"severity" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "policy_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"current_content" text DEFAULT '' NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"last_published_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "policy_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"change_summary" text,
	"change_reason" text,
	"published_by" text,
	"published_at" timestamp DEFAULT now(),
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_violations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"rule_id" varchar NOT NULL,
	"rule_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"penalty_applied" jsonb,
	"detected_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar NOT NULL,
	"user_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"image" text,
	"topic_slug" text NOT NULL,
	"author_id" varchar NOT NULL,
	"is_debate" boolean DEFAULT false NOT NULL,
	"debate_active" boolean DEFAULT false NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"ai_summary" text,
	"key_takeaways" text[],
	"faq_items" jsonb,
	"ai_last_reviewed" timestamp,
	"verification_score" real DEFAULT 0,
	"fact_check_status" text DEFAULT 'pending',
	"evidence_count" integer DEFAULT 0,
	"citation_count" integer DEFAULT 0,
	"related_post_ids" text[],
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pricing_analyses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" varchar,
	"creator_id" varchar NOT NULL,
	"app_prompt" text NOT NULL,
	"app_name" text,
	"cost_breakdown" jsonb NOT NULL,
	"target_margin" real DEFAULT 0.5 NOT NULL,
	"minimum_price" integer NOT NULL,
	"recommended_price" integer NOT NULL,
	"creator_set_price" integer,
	"pricing_model" text DEFAULT 'subscription' NOT NULL,
	"estimated_users" integer DEFAULT 100 NOT NULL,
	"sustainable" boolean DEFAULT true NOT NULL,
	"warnings" text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "privacy_access_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" varchar NOT NULL,
	"requester_id" varchar NOT NULL,
	"requester_type" text NOT NULL,
	"resource_type" text NOT NULL,
	"action" text NOT NULL,
	"granted" boolean NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "privacy_gateway_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rule_type" text NOT NULL,
	"conditions" jsonb NOT NULL,
	"action" text DEFAULT 'block' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "privacy_violations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" varchar NOT NULL,
	"violator_id" varchar NOT NULL,
	"violation_type" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"description" text NOT NULL,
	"action_taken" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_agent_contributions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"agent_id" varchar NOT NULL,
	"role" text DEFAULT 'contributor' NOT NULL,
	"contribution_weight" real DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_feedback" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_package_id" varchar NOT NULL,
	"buyer_id" varchar NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"triggers_revision" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_package_purchases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_package_id" varchar NOT NULL,
	"buyer_id" varchar NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_packages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"pdf_url" text,
	"pages" integer DEFAULT 0 NOT NULL,
	"council_approved" boolean DEFAULT false NOT NULL,
	"version_number" integer DEFAULT 1 NOT NULL,
	"generated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_validations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"project_package_id" varchar NOT NULL,
	"feasibility_score" integer NOT NULL,
	"market_demand_score" integer NOT NULL,
	"usefulness_score" integer NOT NULL,
	"innovation_score" integer NOT NULL,
	"risk_level" text NOT NULL,
	"estimated_audience_range" text,
	"reasoning_summary" text,
	"recommendation" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"debate_id" integer,
	"topic_slug" text,
	"title" text NOT NULL,
	"description" text,
	"project_type" text DEFAULT 'general' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"blueprint_json" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "promotion_scores" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "promotion_scores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"content_type" text NOT NULL,
	"content_id" text NOT NULL,
	"engagement_velocity" real DEFAULT 0 NOT NULL,
	"trust_score" real DEFAULT 0 NOT NULL,
	"comment_quality" real DEFAULT 0 NOT NULL,
	"novelty_score" real DEFAULT 0 NOT NULL,
	"debate_activity" real DEFAULT 0 NOT NULL,
	"trend_score" real DEFAULT 0 NOT NULL,
	"total_score" real DEFAULT 0 NOT NULL,
	"decision" text DEFAULT 'no_promotion' NOT NULL,
	"reasoning" text,
	"selected_platforms" text[],
	"scheduled_at" timestamp,
	"promoted_at" timestamp,
	"overridden_by" text,
	"override_decision" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"evaluated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psychology_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_date" timestamp DEFAULT now() NOT NULL,
	"total_users" integer DEFAULT 0 NOT NULL,
	"stage_distribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"avg_engagement_score" real DEFAULT 0 NOT NULL,
	"avg_return_frequency" real DEFAULT 0 NOT NULL,
	"avg_conversations_per_day" real DEFAULT 0 NOT NULL,
	"retention_risk_distribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stage_transitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reality_claims" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text NOT NULL,
	"source_post_id" varchar,
	"source_comment_id" varchar,
	"extracted_by" varchar NOT NULL,
	"status" text DEFAULT 'unverified' NOT NULL,
	"confidence_score" real DEFAULT 0.5 NOT NULL,
	"agreement_level" real DEFAULT 0 NOT NULL,
	"evidence_strength" real DEFAULT 0 NOT NULL,
	"contradiction_count" integer DEFAULT 0 NOT NULL,
	"evaluation_count" integer DEFAULT 0 NOT NULL,
	"domain" text,
	"tags" text[],
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "referral_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"code" text NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"last_clicked_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "referral_links_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "reputation_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"source_post_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "risk_audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" varchar NOT NULL,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" varchar,
	"outcome" text DEFAULT 'success' NOT NULL,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb,
	"ip_address" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "risk_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_date" timestamp DEFAULT now() NOT NULL,
	"technical_risk" real DEFAULT 0 NOT NULL,
	"economic_risk" real DEFAULT 0 NOT NULL,
	"privacy_risk" real DEFAULT 0 NOT NULL,
	"ecosystem_risk" real DEFAULT 0 NOT NULL,
	"legal_risk" real DEFAULT 0 NOT NULL,
	"overall_risk" real DEFAULT 0 NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "safe_mode_controls" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "safe_mode_controls_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"global_safe_mode" boolean DEFAULT false NOT NULL,
	"pause_autonomous_publishing" boolean DEFAULT false NOT NULL,
	"pause_marketplace_approvals" boolean DEFAULT false NOT NULL,
	"pause_external_agent_actions" boolean DEFAULT false NOT NULL,
	"pause_social_distribution_automation" boolean DEFAULT false NOT NULL,
	"pause_youtube_uploads" boolean DEFAULT false NOT NULL,
	"pause_podcast_audio_generation" boolean DEFAULT false NOT NULL,
	"maintenance_banner_enabled" boolean DEFAULT false NOT NULL,
	"maintenance_banner_message" text,
	"updated_by" text,
	"last_reason" text DEFAULT 'Initial safe-mode control state' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screen_presets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preset_id" text NOT NULL,
	"name" text NOT NULL,
	"target_screen_object_name" text NOT NULL,
	"screen_role" text NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"width" real NOT NULL,
	"height" real NOT NULL,
	"crop_rect" jsonb,
	"zoom_rect" jsonb,
	"safe_area" jsonb NOT NULL,
	"allowed_source_types" text[] NOT NULL,
	"allowed_sensitivity_classes" text[] NOT NULL,
	"fallback_preset_id" text,
	"locked" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "screen_presets_preset_id_unique" UNIQUE("preset_id")
);
--> statement-breakpoint
CREATE TABLE "screen_safety_validations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"validation_id" text NOT NULL,
	"take_plan_id" text NOT NULL,
	"passed" boolean NOT NULL,
	"blockers" text[] DEFAULT '{}' NOT NULL,
	"warnings" text[] DEFAULT '{}' NOT NULL,
	"checks" jsonb NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "screen_safety_validations_validation_id_unique" UNIQUE("validation_id")
);
--> statement-breakpoint
CREATE TABLE "screen_take_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"take_plan_id" text NOT NULL,
	"production_id" text NOT NULL,
	"story_id" text NOT NULL,
	"broadcast_brief_id" text,
	"screen_data_id" text,
	"visual_plan_id" text,
	"requested_by" text NOT NULL,
	"mode" text DEFAULT 'fully_automatic_simulation' NOT NULL,
	"current_script_beat_id" text,
	"source_id" text,
	"source_license_status" text DEFAULT 'rights_unknown' NOT NULL,
	"source_approval_status" text DEFAULT 'unapproved' NOT NULL,
	"target_screen_object_name" text NOT NULL,
	"target_output_id" text,
	"screen_role" text NOT NULL,
	"preset_id" text NOT NULL,
	"action" text NOT NULL,
	"transition" text DEFAULT 'cut' NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"crop_rect" jsonb,
	"zoom_rect" jsonb,
	"fallback_source_id" text,
	"fallback_preset_id" text NOT NULL,
	"restore_default_route_id" text NOT NULL,
	"sensitivity_class" text DEFAULT 'normal' NOT NULL,
	"confidence_vector" jsonb NOT NULL,
	"c_total" real NOT NULL,
	"tier_band" text NOT NULL,
	"validation_status" text DEFAULT 'pending' NOT NULL,
	"approval_status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'admin_only_internal' NOT NULL,
	"public_url" text,
	"signed_url" text,
	"real_send_allowed" boolean DEFAULT false NOT NULL,
	"execution_enabled" boolean DEFAULT false NOT NULL,
	"hardware_send_allowed" boolean DEFAULT false NOT NULL,
	"not_published" boolean DEFAULT true NOT NULL,
	"safety_envelope" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "screen_take_plans_take_plan_id_unique" UNIQUE("take_plan_id")
);
--> statement-breakpoint
CREATE TABLE "sdh_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text NOT NULL,
	"account_name" text NOT NULL,
	"account_handle" text,
	"access_token" text,
	"refresh_token" text,
	"api_key" text,
	"api_secret" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_posted_at" timestamp,
	"post_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sdh_config" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"posts_per_day" integer DEFAULT 3 NOT NULL,
	"min_quality_score" real DEFAULT 0.6 NOT NULL,
	"auto_post" boolean DEFAULT false NOT NULL,
	"include_images" boolean DEFAULT true NOT NULL,
	"platforms" text[],
	"content_types" text[],
	"posting_start_hour" integer DEFAULT 9 NOT NULL,
	"posting_end_hour" integer DEFAULT 21 NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sdh_posts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar NOT NULL,
	"platform" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"source_url" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"hashtags" text[],
	"image_url" text,
	"post_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp,
	"published_at" timestamp,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"engagement" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"quality_score" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "seo_pages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"reference_id" text,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"content" text NOT NULL,
	"meta_description" text,
	"keywords" text[],
	"indexed" boolean DEFAULT false NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp (6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "social_accounts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"platform" text NOT NULL,
	"account_name" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"auto_post_enabled" boolean DEFAULT false NOT NULL,
	"content_types" text[] DEFAULT ARRAY['news','breaking','debate'],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_distribution_automation_settings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "social_distribution_automation_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"safe_automation_enabled" boolean DEFAULT false NOT NULL,
	"paused" boolean DEFAULT true NOT NULL,
	"kill_switch" boolean DEFAULT false NOT NULL,
	"per_platform_enabled" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"daily_post_limit" integer DEFAULT 3 NOT NULL,
	"duplicate_window_hours" integer DEFAULT 72 NOT NULL,
	"trust_threshold" real DEFAULT 0.65 NOT NULL,
	"ues_threshold" real DEFAULT 0.55 NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_distribution_packages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "social_distribution_packages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"youtube_package_id" integer,
	"script_package_id" integer,
	"audio_job_id" integer,
	"source_article_id" integer,
	"source_type" text DEFAULT 'youtube_publishing_package' NOT NULL,
	"target_platforms" text[] DEFAULT ARRAY['twitter','linkedin'] NOT NULL,
	"mode" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'ready_for_review' NOT NULL,
	"approval_status" text DEFAULT 'pending' NOT NULL,
	"posting_status" text DEFAULT 'not_posted' NOT NULL,
	"export_status" text DEFAULT 'not_exported' NOT NULL,
	"generated_copy" jsonb NOT NULL,
	"safety_gate_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"platform_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_message" text,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"posted_by" text,
	"posted_at" timestamp,
	"exported_by" text,
	"exported_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_drafts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broadcast_id" varchar NOT NULL,
	"platform" text NOT NULL,
	"aspect_ratio" text NOT NULL,
	"duration_sec" integer NOT NULL,
	"clip_path" text NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"thumbnail_path" text,
	"hashtags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"suggested_post_at" timestamp,
	"last_crop_rect" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"approved_by" varchar,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_performance" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "social_performance_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"social_post_id" integer,
	"platform" text NOT NULL,
	"content_type" text NOT NULL,
	"content_id" text NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"follower_gains" integer DEFAULT 0 NOT NULL,
	"viral_score" real DEFAULT 0 NOT NULL,
	"caption_length" integer DEFAULT 0,
	"hashtag_count" integer DEFAULT 0,
	"posted_hour" integer,
	"posted_day_of_week" integer,
	"collected_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "social_posts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"account_id" integer,
	"platform" text NOT NULL,
	"content_type" text NOT NULL,
	"content_id" text NOT NULL,
	"caption" text,
	"hashtags" text[],
	"call_to_action" text,
	"post_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"scheduled_at" timestamp,
	"published_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "society_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"society_id" varchar NOT NULL,
	"agent_id" varchar NOT NULL,
	"role" text DEFAULT 'researcher' NOT NULL,
	"contribution_score" real DEFAULT 0 NOT NULL,
	"tasks_completed" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"price_monthly" integer DEFAULT 0 NOT NULL,
	"price_yearly" integer DEFAULT 0 NOT NULL,
	"credits_per_month" integer DEFAULT 0 NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"debate_discount" integer DEFAULT 0 NOT NULL,
	"max_debates_per_month" integer DEFAULT 1 NOT NULL,
	"ai_responses_per_day" integer DEFAULT 5 NOT NULL,
	"priority_support" boolean DEFAULT false NOT NULL,
	"badge_label" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"stripe_price_id_monthly" text,
	"stripe_price_id_yearly" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "subscription_plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "super_loop_cycles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" varchar,
	"target_type" text,
	"target_id" varchar,
	"pillar" text NOT NULL,
	"metadata" jsonb,
	"revenue_attributed" integer DEFAULT 0 NOT NULL,
	"completed_stages" integer DEFAULT 1 NOT NULL,
	"total_stages" integer DEFAULT 6 NOT NULL,
	"velocity" real DEFAULT 0,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "super_loop_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp NOT NULL,
	"personal_interactions" integer DEFAULT 0 NOT NULL,
	"debates_active" integer DEFAULT 0 NOT NULL,
	"reality_claims_count" integer DEFAULT 0 NOT NULL,
	"consensus_reached" integer DEFAULT 0 NOT NULL,
	"labs_opportunities" integer DEFAULT 0 NOT NULL,
	"apps_published" integer DEFAULT 0 NOT NULL,
	"apps_installed" integer DEFAULT 0 NOT NULL,
	"total_revenue" integer DEFAULT 0 NOT NULL,
	"knowledge_feedback" integer DEFAULT 0 NOT NULL,
	"loop_velocity" real DEFAULT 0,
	"reinforcement_score" real DEFAULT 0,
	"pillar_health" jsonb,
	"cycle_completions" integer DEFAULT 0 NOT NULL,
	"avg_cycle_time" real DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"user_email" text NOT NULL,
	"user_name" text NOT NULL,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"assigned_to" text,
	"resolved_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_control_config" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "system_control_config_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"value" real DEFAULT 0.5 NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"min_value" real DEFAULT 0 NOT NULL,
	"max_value" real DEFAULT 1 NOT NULL,
	"step" real DEFAULT 0.1 NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "system_control_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_by" varchar,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "task_bids" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" varchar NOT NULL,
	"society_id" varchar NOT NULL,
	"expected_accuracy" real NOT NULL,
	"completion_time" integer NOT NULL,
	"credit_cost" integer NOT NULL,
	"score" real,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_contracts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar NOT NULL,
	"description" text NOT NULL,
	"required_expertise" text[],
	"status" text DEFAULT 'open' NOT NULL,
	"selected_bid_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar NOT NULL,
	"agent_id" varchar NOT NULL,
	"role" text NOT NULL,
	"selection_score" real DEFAULT 0 NOT NULL,
	"credits_earned" integer DEFAULT 0 NOT NULL,
	"tasks_completed" integer DEFAULT 0 NOT NULL,
	"performance_rating" real,
	"joined_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar NOT NULL,
	"task_id" varchar,
	"sender_id" varchar NOT NULL,
	"recipient_id" varchar,
	"message_type" text NOT NULL,
	"content" text NOT NULL,
	"structured_data" jsonb,
	"round" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar NOT NULL,
	"parent_task_id" varchar,
	"assigned_agent_id" varchar,
	"title" text NOT NULL,
	"description" text,
	"task_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"result" text,
	"confidence" real,
	"reward_value" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "team_workspaces" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar NOT NULL,
	"key" text NOT NULL,
	"value" text,
	"metadata" jsonb,
	"contributor_id" varchar,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" varchar NOT NULL,
	"sender_type" text NOT NULL,
	"sender_name" text NOT NULL,
	"content" text NOT NULL,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"email_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ticket_solutions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" varchar NOT NULL,
	"problem" text NOT NULL,
	"solution" text NOT NULL,
	"category" text NOT NULL,
	"intent" text NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"kb_article_id" varchar,
	"extracted_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "topic_authority" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_slug" text NOT NULL,
	"authority_score" real DEFAULT 0 NOT NULL,
	"content_volume" integer DEFAULT 0 NOT NULL,
	"engagement_quality" real DEFAULT 0 NOT NULL,
	"verification_avg" real DEFAULT 0 NOT NULL,
	"citation_frequency" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "topic_authority_topic_slug_unique" UNIQUE("topic_slug")
);
--> statement-breakpoint
CREATE TABLE "topic_clusters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"pillar_page_id" varchar,
	"topic_slugs" text[],
	"description" text,
	"total_pages" integer DEFAULT 0 NOT NULL,
	"avg_citation_score" real DEFAULT 0 NOT NULL,
	"domain_authority" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "topic_clusters_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"icon" text DEFAULT 'Cpu' NOT NULL,
	"description" text,
	"authority_score" real DEFAULT 0,
	"content_volume" integer DEFAULT 0,
	"engagement_quality" real DEFAULT 0,
	"verification_avg" real DEFAULT 0,
	"citation_frequency" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "topics_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" varchar,
	"receiver_id" varchar NOT NULL,
	"amount" integer NOT NULL,
	"transaction_type" text NOT NULL,
	"reference_id" varchar,
	"description" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trust_access_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"accessor_id" varchar NOT NULL,
	"accessor_type" text NOT NULL,
	"resource_accessed" text NOT NULL,
	"purpose" text NOT NULL,
	"granted" boolean NOT NULL,
	"permission_token_id" varchar,
	"ip_hash" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trust_health_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric_date" timestamp NOT NULL,
	"total_vaults" integer DEFAULT 0 NOT NULL,
	"active_vaults" integer DEFAULT 0 NOT NULL,
	"total_permission_tokens" integer DEFAULT 0 NOT NULL,
	"revoked_tokens" integer DEFAULT 0 NOT NULL,
	"total_access_events" integer DEFAULT 0 NOT NULL,
	"denied_access_events" integer DEFAULT 0 NOT NULL,
	"data_export_requests" integer DEFAULT 0 NOT NULL,
	"average_privacy_level" real DEFAULT 0 NOT NULL,
	"trust_score" real DEFAULT 0 NOT NULL,
	"user_retention_rate" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trust_ladder_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"trust_level" text DEFAULT 'visitor' NOT NULL,
	"trust_score" real DEFAULT 0 NOT NULL,
	"activity_quality" real DEFAULT 0 NOT NULL,
	"identity_verification" real DEFAULT 0 NOT NULL,
	"publisher_agreement" real DEFAULT 0 NOT NULL,
	"ratings" real DEFAULT 0 NOT NULL,
	"policy_violations" real DEFAULT 0 NOT NULL,
	"can_publish" boolean DEFAULT false NOT NULL,
	"can_sell" boolean DEFAULT false NOT NULL,
	"can_promote" boolean DEFAULT false NOT NULL,
	"can_build_entities" boolean DEFAULT false NOT NULL,
	"can_partner" boolean DEFAULT false NOT NULL,
	"last_computed_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "trust_ladder_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "trust_permission_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" varchar NOT NULL,
	"granted_to" varchar NOT NULL,
	"granted_by" varchar NOT NULL,
	"permission_type" text NOT NULL,
	"resource_scope" text NOT NULL,
	"expires_at" timestamp,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp,
	"access_count" integer DEFAULT 0 NOT NULL,
	"max_access_count" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trust_scores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar NOT NULL,
	"evidence_score" real DEFAULT 0 NOT NULL,
	"consensus_score" real DEFAULT 0 NOT NULL,
	"historical_reliability" real DEFAULT 0 NOT NULL,
	"reasoning_score" real DEFAULT 0 NOT NULL,
	"source_credibility" real DEFAULT 0 NOT NULL,
	"tcs_total" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "truth_alignment_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_date" timestamp DEFAULT now() NOT NULL,
	"total_memories" integer DEFAULT 0 NOT NULL,
	"avg_confidence" real DEFAULT 0 NOT NULL,
	"truth_type_distribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evolution_events_24h" integer DEFAULT 0 NOT NULL,
	"corrections_count" integer DEFAULT 0 NOT NULL,
	"high_confidence_ratio" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "truth_evolution_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"memory_id" varchar,
	"event_type" text NOT NULL,
	"previous_confidence" real,
	"new_confidence" real,
	"trigger" text NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "truth_memories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"vault_type" text DEFAULT 'personal' NOT NULL,
	"sensitivity" text DEFAULT 'private' NOT NULL,
	"content" text NOT NULL,
	"truth_type" text DEFAULT 'personal_truth' NOT NULL,
	"confidence_score" real DEFAULT 0.5 NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"contradiction_count" integer DEFAULT 0 NOT NULL,
	"validation_count" integer DEFAULT 0 NOT NULL,
	"last_evaluated_at" timestamp DEFAULT now(),
	"sources" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_agents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" varchar NOT NULL,
	"type" text DEFAULT 'business' NOT NULL,
	"agent_type" text DEFAULT 'business' NOT NULL,
	"name" text NOT NULL,
	"persona" text,
	"skills" text[],
	"avatar_url" text,
	"voice_id" text,
	"model" text DEFAULT 'gpt-4o' NOT NULL,
	"provider" text DEFAULT 'openai' NOT NULL,
	"system_prompt" text,
	"temperature" real DEFAULT 0.7 NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"marketplace_enabled" boolean DEFAULT false NOT NULL,
	"exportable" boolean DEFAULT true NOT NULL,
	"export_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"deployment_modes" text[] DEFAULT ARRAY['private']::text[] NOT NULL,
	"rate_limit_per_min" integer DEFAULT 30 NOT NULL,
	"total_usage_count" integer DEFAULT 0 NOT NULL,
	"total_credits_earned" integer DEFAULT 0 NOT NULL,
	"rating" real DEFAULT 0 NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"tags" text[],
	"industry_slug" text,
	"category_slug" text,
	"role_slug" text,
	"trust_score" real DEFAULT 50 NOT NULL,
	"quality_score" real DEFAULT 0 NOT NULL,
	"version" text DEFAULT '1.0.0' NOT NULL,
	"changelog" text,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"specialization_slug" text,
	"weekly_usage_count" integer DEFAULT 0 NOT NULL,
	"monthly_usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_psychology_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"psychology_stage" text DEFAULT 'curious' NOT NULL,
	"conversations_per_day" real DEFAULT 0 NOT NULL,
	"memory_saves" integer DEFAULT 0 NOT NULL,
	"return_frequency" real DEFAULT 0 NOT NULL,
	"personal_agent_usage" integer DEFAULT 0 NOT NULL,
	"feature_unlock_stage" text DEFAULT 'explorer' NOT NULL,
	"engagement_score" real DEFAULT 0 NOT NULL,
	"retention_risk" text DEFAULT 'neutral' NOT NULL,
	"last_active_at" timestamp DEFAULT now(),
	"streak_days" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"total_sessions" integer DEFAULT 0 NOT NULL,
	"avg_session_minutes" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "user_psychology_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"plan_id" varchar NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"billing_cycle" text DEFAULT 'monthly' NOT NULL,
	"stripe_subscription_id" text,
	"stripe_customer_id" text,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_trust_vaults" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"encryption_key_hash" text NOT NULL,
	"data_categories" text[] DEFAULT ARRAY['personal','conversations','preferences','activity']::text[] NOT NULL,
	"storage_used_bytes" integer DEFAULT 0 NOT NULL,
	"privacy_level" text DEFAULT 'strict' NOT NULL,
	"auto_delete_days" integer,
	"last_accessed_at" timestamp,
	"is_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar" text,
	"role" text DEFAULT 'human' NOT NULL,
	"energy" integer DEFAULT 500 NOT NULL,
	"reputation" integer DEFAULT 0 NOT NULL,
	"rank_level" text DEFAULT 'Basic' NOT NULL,
	"badge" text,
	"confidence" integer,
	"bio" text,
	"industry_tags" text[],
	"email_verified" boolean DEFAULT false NOT NULL,
	"verification_code" text,
	"profile_completed" boolean DEFAULT false NOT NULL,
	"agent_model" text,
	"agent_api_endpoint" text,
	"agent_description" text,
	"agent_type" text,
	"public_key" text,
	"callback_url" text,
	"capabilities" text[],
	"api_token" text,
	"rate_limit_per_min" integer DEFAULT 60,
	"credit_wallet" integer DEFAULT 0,
	"byoai_provider" text,
	"byoai_api_key" text,
	"verification_weight" real DEFAULT 1,
	"reset_token" text,
	"reset_token_expiry" timestamp,
	"is_spammer" boolean DEFAULT false NOT NULL,
	"is_shadow_banned" boolean DEFAULT false NOT NULL,
	"spam_score" integer DEFAULT 0 NOT NULL,
	"spam_violations" integer DEFAULT 0 NOT NULL,
	"intelligence_stage" text DEFAULT 'explorer' NOT NULL,
	"intelligence_xp" integer DEFAULT 0 NOT NULL,
	"onboarding_state" text DEFAULT 'interests' NOT NULL,
	"onboarding_interest" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "youtube_publishing_packages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "youtube_publishing_packages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"script_package_id" integer NOT NULL,
	"audio_job_id" integer,
	"generated_clip_id" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"approval_status" text DEFAULT 'pending' NOT NULL,
	"upload_status" text DEFAULT 'not_uploaded' NOT NULL,
	"provider" text DEFAULT 'dry_run' NOT NULL,
	"package_metadata" jsonb NOT NULL,
	"readiness_checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"compliance_checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"youtube_video_id" text,
	"youtube_url" text,
	"youtube_status" text,
	"error_message" text,
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"uploaded_by" text,
	"uploaded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "playout_queue" ADD CONSTRAINT "playout_queue_broadcast_id_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_broadcast_id_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_admin_broadcast_saved_view_scope" ON "admin_broadcast_saved_view" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "IDX_admin_broadcast_saved_view_created_by" ON "admin_broadcast_saved_view" USING btree ("created_by_actor_id");--> statement-breakpoint
CREATE INDEX "IDX_admin_broadcast_saved_view_team_default" ON "admin_broadcast_saved_view" USING btree ("is_team_default");--> statement-breakpoint
CREATE INDEX "IDX_admin_filter_views_owner_scope" ON "admin_filter_views" USING btree ("owner_id","scope");--> statement-breakpoint
CREATE INDEX "agent_dna_mutation_history_agent_idx" ON "agent_dna_mutation_history" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_dna_mutation_history_packet_idx" ON "agent_dna_mutation_history" USING btree ("packet_id");--> statement-breakpoint
CREATE INDEX "IDX_ai_export_events_created_at" ON "ai_export_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_ai_export_events_admin_id" ON "ai_export_events" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "IDX_ai_export_events_export_type" ON "ai_export_events" USING btree ("export_type");--> statement-breakpoint
CREATE INDEX "IDX_ai_export_events_status" ON "ai_export_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_ai_job_events_job_created" ON "ai_job_events" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "IDX_ai_job_events_type_created" ON "ai_job_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "IDX_ai_jobs_status_created" ON "ai_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "IDX_ai_jobs_user" ON "ai_jobs" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "IDX_ai_jobs_admin" ON "ai_jobs" USING btree ("requested_by_admin_id");--> statement-breakpoint
CREATE INDEX "IDX_ai_ops_snapshots_snapshot_date" ON "ai_ops_snapshots" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "IDX_ai_ops_snapshots_health_status" ON "ai_ops_snapshots" USING btree ("health_status");--> statement-breakpoint
CREATE INDEX "IDX_ai_ops_snapshots_admin_id" ON "ai_ops_snapshots" USING btree ("generated_by_admin_id");--> statement-breakpoint
CREATE INDEX "IDX_ai_ops_snapshots_created_at" ON "ai_ops_snapshots" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_ai_retention_runs_created_at" ON "ai_retention_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_ai_retention_runs_admin_id" ON "ai_retention_runs" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "IDX_ai_retention_runs_dry_run" ON "ai_retention_runs" USING btree ("dry_run");--> statement-breakpoint
CREATE INDEX "IDX_ai_retention_runs_status" ON "ai_retention_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_ai_workers_last_seen" ON "ai_workers" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "IDX_ai_workers_status" ON "ai_workers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_anchor_clips_package" ON "anchor_clips" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "IDX_anchor_clips_package_beat" ON "anchor_clips" USING btree ("package_id","beat_index");--> statement-breakpoint
CREATE INDEX "IDX_audience_archive_deletions_deleted_at" ON "audience_archive_deletions" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "IDX_audience_archive_deletions_archive_table" ON "audience_archive_deletions" USING btree ("archive_table");--> statement-breakpoint
CREATE INDEX "IDX_audience_archive_deletions_purged_at" ON "audience_archive_deletions" USING btree ("purged_at");--> statement-breakpoint
CREATE INDEX "IDX_audience_audit_email_failure_alert_snoozes_occurred_at" ON "audience_audit_email_failure_alert_snoozes" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "IDX_audience_audit_email_failure_alert_snoozes_alert_key" ON "audience_audit_email_failure_alert_snoozes" USING btree ("alert_key");--> statement-breakpoint
CREATE INDEX "IDX_audience_audit_runs_schedule_id" ON "audience_audit_email_runs" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "IDX_audience_audit_runs_started_at" ON "audience_audit_email_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "IDX_audience_audit_exports_exported_at" ON "audience_audit_exports" USING btree ("exported_at");--> statement-breakpoint
CREATE INDEX "IDX_audience_audit_exports_actor_id" ON "audience_audit_exports" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "IDX_audience_gateway_events_emitted_at" ON "audience_gateway_events" USING btree ("emitted_at");--> statement-breakpoint
CREATE INDEX "IDX_audience_gateway_events_event_name" ON "audience_gateway_events" USING btree ("event_name");--> statement-breakpoint
CREATE INDEX "IDX_audience_gateway_events_command_id" ON "audience_gateway_events" USING btree ("command_id");--> statement-breakpoint
CREATE INDEX "IDX_audience_gateway_events_connector_id" ON "audience_gateway_events" USING btree ("connector_id");--> statement-breakpoint
CREATE INDEX "IDX_audience_messages_production_id" ON "audience_messages" USING btree ("production_id");--> statement-breakpoint
CREATE INDEX "IDX_audience_messages_platform" ON "audience_messages" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "IDX_audience_commands_decision_id" ON "audience_moderation_commands" USING btree ("decision_id");--> statement-breakpoint
CREATE INDEX "IDX_audience_decisions_message_id" ON "audience_safety_decisions" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "UX_broadcast_briefs_data_package_id" ON "broadcast_briefs" USING btree ("data_package_id");--> statement-breakpoint
CREATE INDEX "IDX_broadcast_briefs_story_id" ON "broadcast_briefs" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "IDX_broadcast_briefs_verified_knowledge_id" ON "broadcast_briefs" USING btree ("verified_knowledge_id");--> statement-breakpoint
CREATE INDEX "IDX_broadcast_briefs_approval_status" ON "broadcast_briefs" USING btree ("approval_status");--> statement-breakpoint
CREATE INDEX "IDX_broadcast_briefs_created_at" ON "broadcast_briefs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_broadcast_live_alert_events_created_at" ON "broadcast_live_alert_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_broadcasts_package_id" ON "broadcasts" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "IDX_broadcasts_created_at" ON "broadcasts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "broll_clips_source_external_id_idx" ON "broll_clips" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "broll_clips_query_idx" ON "broll_clips" USING btree ("query");--> statement-breakpoint
CREATE INDEX "broll_clips_license_status_idx" ON "broll_clips" USING btree ("license_status");--> statement-breakpoint
CREATE INDEX "broll_plans_brief_id_idx" ON "broll_plans" USING btree ("brief_id");--> statement-breakpoint
CREATE INDEX "broll_plans_status_idx" ON "broll_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_cost_events_created_at" ON "cost_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_cost_events_kind" ON "cost_events" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "external_agent_api_keys_token_hash_idx" ON "external_agent_api_keys" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "external_agent_api_keys_user_id_idx" ON "external_agent_api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "external_agent_api_keys_agent_id_idx" ON "external_agent_api_keys" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "external_agent_api_keys_active_idx" ON "external_agent_api_keys" USING btree ("active");--> statement-breakpoint
CREATE INDEX "IDX_founder_pto_suppression_log_occurred_at" ON "founder_pto_suppression_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "IDX_founder_pto_suppression_log_notifier_id" ON "founder_pto_suppression_log" USING btree ("notifier_id");--> statement-breakpoint
CREATE INDEX "gluon_ledger_packet_idx" ON "gluon_ledger_entries" USING btree ("packet_id");--> statement-breakpoint
CREATE INDEX "gluon_ledger_agent_idx" ON "gluon_ledger_entries" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "gluon_ledger_user_idx" ON "gluon_ledger_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gluon_redemption_reviews_user_idx" ON "gluon_redemption_eligibility_reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "gluon_redemption_reviews_agent_idx" ON "gluon_redemption_eligibility_reviews" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "gluon_redemption_reviews_status_idx" ON "gluon_redemption_eligibility_reviews" USING btree ("admin_review_status");--> statement-breakpoint
CREATE INDEX "gluon_redemption_reviews_created_at_idx" ON "gluon_redemption_eligibility_reviews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "gluon_value_baselines_component_idx" ON "gluon_value_baselines" USING btree ("component_key");--> statement-breakpoint
CREATE INDEX "gluon_value_baselines_active_idx" ON "gluon_value_baselines" USING btree ("active");--> statement-breakpoint
CREATE INDEX "gluon_value_index_snapshots_created_at_idx" ON "gluon_value_index_snapshots" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_packet_acceptances_packet_acceptor_unique" ON "knowledge_packet_acceptances" USING btree ("packet_id","accepting_agent_id","accepting_agent_type");--> statement-breakpoint
CREATE INDEX "knowledge_packet_acceptances_packet_idx" ON "knowledge_packet_acceptances" USING btree ("packet_id");--> statement-breakpoint
CREATE INDEX "knowledge_packets_creator_user_idx" ON "knowledge_packets" USING btree ("creator_user_id");--> statement-breakpoint
CREATE INDEX "knowledge_packets_creator_agent_idx" ON "knowledge_packets" USING btree ("creator_agent_id");--> statement-breakpoint
CREATE INDEX "knowledge_packets_fingerprint_idx" ON "knowledge_packets" USING btree ("source_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "news_sources_url_idx" ON "news_sources" USING btree ("url");--> statement-breakpoint
CREATE INDEX "news_sources_enabled_idx" ON "news_sources" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "UX_newsroom_packages_brief_id" ON "newsroom_packages" USING btree ("brief_id");--> statement-breakpoint
CREATE INDEX "IDX_newsroom_packages_status" ON "newsroom_packages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_newsroom_packages_created_at" ON "newsroom_packages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_playout_history_played_at" ON "playout_history" USING btree ("played_at");--> statement-breakpoint
CREATE INDEX "IDX_playout_queue_status" ON "playout_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_playout_queue_region" ON "playout_queue" USING btree ("region");--> statement-breakpoint
CREATE INDEX "IDX_screen_presets_screen_role" ON "screen_presets" USING btree ("screen_role");--> statement-breakpoint
CREATE UNIQUE INDEX "UX_screen_safety_validations_take_plan_id" ON "screen_safety_validations" USING btree ("take_plan_id");--> statement-breakpoint
CREATE INDEX "IDX_screen_safety_validations_passed" ON "screen_safety_validations" USING btree ("passed");--> statement-breakpoint
CREATE INDEX "IDX_screen_take_plans_story_id" ON "screen_take_plans" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "IDX_screen_take_plans_production_id" ON "screen_take_plans" USING btree ("production_id");--> statement-breakpoint
CREATE INDEX "IDX_screen_take_plans_validation_status" ON "screen_take_plans" USING btree ("validation_status");--> statement-breakpoint
CREATE INDEX "IDX_screen_take_plans_created_at" ON "screen_take_plans" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "session" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "IDX_social_drafts_broadcast_id" ON "social_drafts" USING btree ("broadcast_id");--> statement-breakpoint
CREATE INDEX "IDX_social_drafts_status" ON "social_drafts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_social_drafts_created_at" ON "social_drafts" USING btree ("created_at");