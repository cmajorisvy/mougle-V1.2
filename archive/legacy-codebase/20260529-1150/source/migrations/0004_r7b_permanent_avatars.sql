-- R7B-Schema — permanent_avatars + permanent_avatar_audit_log + permanent_avatar_tombstones
-- Design: docs/design/R7B_PERMANENT_AVATAR_ENTITY_DESIGN.md
-- This file ships SCHEMA ONLY. No routes, UI, provider calls, R3F changes, or back-ref columns
-- on production_assets / production_rigs. Hard safety invariants are CHECK-pinned at the DB layer
-- so no future route mutation can flip publicUrl, realSendAllowed, executionEnabled, visibility,
-- or approvalGate to a forbidden value.
--
-- Drift reconciliation: drizzle-kit generate also detected four pre-existing
-- `production_asset_orphan_sweep_*` tables that live in shared/schema.ts but were never journaled
-- (applied to the live DB by an earlier `drizzle-kit push`; the corresponding
-- `migrations/0004_task_806_orphan_sweep_flapping_snoozes.sql` file exists but was never added to
-- `_journal.json`). To make this migration safe on BOTH the existing live DB and a fresh empty DB,
-- those CREATE statements are included below with `IF NOT EXISTS`. The snapshot
-- (`migrations/meta/0004_snapshot.json`) advances to include those tables as well, so future
-- `drizzle generate` runs do not re-emit them.

CREATE TABLE "permanent_avatar_audit_log" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "permanent_avatar_id" varchar NOT NULL,
        "actor_user_id" text NOT NULL,
        "event" text NOT NULL,
        "payload" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permanent_avatar_tombstones" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "original_permanent_avatar_id" varchar NOT NULL,
        "slug" text NOT NULL,
        "display_name" text NOT NULL,
        "body_asset_id" varchar NOT NULL,
        "rig_id" varchar NOT NULL,
        "final_snapshot" jsonb NOT NULL,
        "audit_log_count" integer NOT NULL,
        "deleted_by_user_id" text NOT NULL,
        "deletion_reason" text NOT NULL,
        "deleted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permanent_avatars" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "display_name" text NOT NULL,
        "slug" text NOT NULL,
        "persona_summary" text DEFAULT '' NOT NULL,
        "role_preset" text DEFAULT 'custom' NOT NULL,
        "voice_profile_hint" text DEFAULT '' NOT NULL,
        "language_hint" text DEFAULT '' NOT NULL,
        "body_asset_id" varchar NOT NULL,
        "rig_id" varchar NOT NULL,
        "default_room_kind" text,
        "default_room_id" varchar,
        "status" text DEFAULT 'draft' NOT NULL,
        "lifecycle_state" text DEFAULT 'composed' NOT NULL,
        "identity_review" text DEFAULT 'pending' NOT NULL,
        "identity_review_note" text,
        "safety_review" text DEFAULT 'pending' NOT NULL,
        "safety_review_note" text,
        "approval_gate" text DEFAULT 'not_approved' NOT NULL,
        "public_url" text DEFAULT NULL,
        "real_send_allowed" boolean DEFAULT false NOT NULL,
        "execution_enabled" boolean DEFAULT false NOT NULL,
        "visibility" text DEFAULT 'admin_only_internal' NOT NULL,
        "created_by_user_id" text NOT NULL,
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "permanent_avatars_slug_unique" UNIQUE("slug"),
        CONSTRAINT "permanent_avatars_public_url_must_be_null" CHECK ("permanent_avatars"."public_url" IS NULL),
        CONSTRAINT "permanent_avatars_real_send_must_be_false" CHECK ("permanent_avatars"."real_send_allowed" = FALSE),
        CONSTRAINT "permanent_avatars_execution_must_be_false" CHECK ("permanent_avatars"."execution_enabled" = FALSE),
        CONSTRAINT "permanent_avatars_visibility_admin_only" CHECK ("permanent_avatars"."visibility" = 'admin_only_internal'),
        CONSTRAINT "permanent_avatars_status_allow_list" CHECK ("permanent_avatars"."status" IN ('draft','active','archived')),
        CONSTRAINT "permanent_avatars_lifecycle_state_allow_list" CHECK ("permanent_avatars"."lifecycle_state" IN ('composed','identity_reviewed','safety_reviewed','approved_internal')),
        CONSTRAINT "permanent_avatars_identity_review_allow_list" CHECK ("permanent_avatars"."identity_review" IN ('pending','approved_internal','rejected','needs_changes')),
        CONSTRAINT "permanent_avatars_safety_review_allow_list" CHECK ("permanent_avatars"."safety_review" IN ('pending','approved_internal','rejected','needs_changes')),
        CONSTRAINT "permanent_avatars_approval_gate_no_public" CHECK ("permanent_avatars"."approval_gate" IN ('not_approved','approved_internal')),
        CONSTRAINT "permanent_avatars_role_preset_allow_list" CHECK ("permanent_avatars"."role_preset" IN ('news_anchor','podcast_host','debate_moderator','guest','analyst','field_reporter','teacher','virtual_ceo','ai_assistant','custom')),
        CONSTRAINT "permanent_avatars_default_room_kind_allow_list" CHECK ("permanent_avatars"."default_room_kind" IS NULL OR "permanent_avatars"."default_room_kind" IN ('news_room','podcast_room','debate_studio','living_room'))
);
--> statement-breakpoint
ALTER TABLE "permanent_avatar_audit_log" ADD CONSTRAINT "permanent_avatar_audit_log_permanent_avatar_id_permanent_avatars_id_fk" FOREIGN KEY ("permanent_avatar_id") REFERENCES "public"."permanent_avatars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permanent_avatars" ADD CONSTRAINT "permanent_avatars_body_asset_id_production_assets_id_fk" FOREIGN KEY ("body_asset_id") REFERENCES "public"."production_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permanent_avatars" ADD CONSTRAINT "permanent_avatars_rig_id_production_rigs_id_fk" FOREIGN KEY ("rig_id") REFERENCES "public"."production_rigs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_permanent_avatar_audit_log_avatar_created" ON "permanent_avatar_audit_log" USING btree ("permanent_avatar_id","created_at");--> statement-breakpoint
CREATE INDEX "IDX_permanent_avatar_audit_log_event" ON "permanent_avatar_audit_log" USING btree ("event");--> statement-breakpoint
CREATE INDEX "IDX_permanent_avatar_tombstones_slug" ON "permanent_avatar_tombstones" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "IDX_permanent_avatar_tombstones_original_id" ON "permanent_avatar_tombstones" USING btree ("original_permanent_avatar_id");--> statement-breakpoint
CREATE INDEX "IDX_permanent_avatar_tombstones_deleted_at" ON "permanent_avatar_tombstones" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "IDX_permanent_avatars_status" ON "permanent_avatars" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_permanent_avatars_safety_review" ON "permanent_avatars" USING btree ("safety_review");--> statement-breakpoint
CREATE INDEX "IDX_permanent_avatars_identity_review" ON "permanent_avatars" USING btree ("identity_review");--> statement-breakpoint
CREATE INDEX "IDX_permanent_avatars_approval_gate" ON "permanent_avatars" USING btree ("approval_gate");--> statement-breakpoint
CREATE INDEX "IDX_permanent_avatars_body_asset" ON "permanent_avatars" USING btree ("body_asset_id");--> statement-breakpoint
CREATE INDEX "IDX_permanent_avatars_rig" ON "permanent_avatars" USING btree ("rig_id");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_permanent_avatars_body_rig_pair" ON "permanent_avatars" USING btree ("body_asset_id","rig_id");--> statement-breakpoint

-- Tombstone immutability guard: tombstones are forensic records. Once written, they must never
-- be UPDATEd or DELETEd by application code. Enforced at the DB layer (not just policy) so a
-- buggy future route handler cannot silently mutate them.
CREATE OR REPLACE FUNCTION "permanent_avatar_tombstones_block_mutations"()
RETURNS trigger AS $$
BEGIN
        RAISE EXCEPTION 'permanent_avatar_tombstones rows are immutable (forensic record)';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "permanent_avatar_tombstones_no_update"
BEFORE UPDATE ON "permanent_avatar_tombstones"
FOR EACH ROW EXECUTE FUNCTION "permanent_avatar_tombstones_block_mutations"();
--> statement-breakpoint
CREATE TRIGGER "permanent_avatar_tombstones_no_delete"
BEFORE DELETE ON "permanent_avatar_tombstones"
FOR EACH ROW EXECUTE FUNCTION "permanent_avatar_tombstones_block_mutations"();
--> statement-breakpoint

-- Pre-existing drift reconciliation (see header comment). IF NOT EXISTS keeps this safe on the
-- live DB where these tables were created out-of-band by an earlier push.
CREATE TABLE IF NOT EXISTS "production_asset_orphan_sweep_flapping_config_history" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "occurred_at" timestamp DEFAULT now() NOT NULL,
        "updated_by" text,
        "action" text NOT NULL,
        "previous_config" jsonb,
        "new_config" jsonb,
        "changed_fields" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "production_asset_orphan_sweep_flapping_snoozes" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "action" text NOT NULL,
        "snooze_until" timestamp,
        "updated_by" text,
        "reason" text,
        "suppressed_count" integer DEFAULT 0 NOT NULL,
        "occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "production_asset_orphan_sweep_threshold_changes" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "previous_value" text,
        "new_value" text NOT NULL,
        "actor_user_id" varchar,
        "changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "production_asset_sweep_flapping_config_changes" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "setting" text NOT NULL,
        "previous_value" text,
        "new_value" text NOT NULL,
        "actor_user_id" varchar,
        "changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_paossfch_occurred_at" ON "production_asset_orphan_sweep_flapping_config_history" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_paossfs_occurred_at" ON "production_asset_orphan_sweep_flapping_snoozes" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_pa_sweep_thresh_changed_at" ON "production_asset_orphan_sweep_threshold_changes" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_pa_sweep_flap_cfg_changed_at" ON "production_asset_sweep_flapping_config_changes" USING btree ("changed_at");
