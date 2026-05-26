CREATE TABLE "production_asset_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" varchar NOT NULL,
	"actor_user_id" text NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_assets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"format" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"original_source_url" text,
	"storage_key" text NOT NULL,
	"uploader_user_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"lifecycle_state" text DEFAULT 'uploaded' NOT NULL,
	"license_status" text DEFAULT 'unknown' NOT NULL,
	"license_source" text,
	"license_note" text,
	"safety_review" text DEFAULT 'pending' NOT NULL,
	"safety_note" text,
	"approval_gate" text DEFAULT 'not_approved' NOT NULL,
	"public_url" text DEFAULT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "production_assets_sha256_unique" UNIQUE("sha256"),
	CONSTRAINT "production_assets_public_url_must_be_null_in_r5c" CHECK ("production_assets"."public_url" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "production_asset_audit_log" ADD CONSTRAINT "production_asset_audit_log_asset_id_production_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."production_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_production_asset_audit_log_asset_created" ON "production_asset_audit_log" USING btree ("asset_id","created_at");--> statement-breakpoint
CREATE INDEX "IDX_production_asset_audit_log_event" ON "production_asset_audit_log" USING btree ("event");--> statement-breakpoint
CREATE INDEX "IDX_production_assets_status" ON "production_assets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_production_assets_safety_review" ON "production_assets" USING btree ("safety_review");--> statement-breakpoint
CREATE INDEX "IDX_production_assets_approval_gate" ON "production_assets" USING btree ("approval_gate");--> statement-breakpoint
CREATE INDEX "IDX_production_assets_created_at" ON "production_assets" USING btree ("created_at");