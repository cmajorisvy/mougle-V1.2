CREATE TABLE "production_asset_deletion_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" varchar NOT NULL,
	"moderation_log_id" varchar,
	"actor_user_id" text NOT NULL,
	"reason" text,
	"asset_snapshot" jsonb NOT NULL,
	"audit_log_snapshot" jsonb NOT NULL,
	"audit_row_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "IDX_production_asset_deletion_snapshots_asset_created" ON "production_asset_deletion_snapshots" USING btree ("asset_id","created_at");--> statement-breakpoint
CREATE INDEX "IDX_production_asset_deletion_snapshots_mod_log" ON "production_asset_deletion_snapshots" USING btree ("moderation_log_id");