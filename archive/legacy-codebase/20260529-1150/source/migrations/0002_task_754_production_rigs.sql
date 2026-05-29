CREATE TABLE "production_rig_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rig_id" varchar NOT NULL,
	"actor_user_id" text NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_rigs" (
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
	CONSTRAINT "production_rigs_sha256_unique" UNIQUE("sha256"),
	CONSTRAINT "production_rigs_public_url_must_be_null" CHECK ("production_rigs"."public_url" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "production_rig_audit_log" ADD CONSTRAINT "production_rig_audit_log_rig_id_production_rigs_id_fk" FOREIGN KEY ("rig_id") REFERENCES "public"."production_rigs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_production_rig_audit_log_rig_created" ON "production_rig_audit_log" USING btree ("rig_id","created_at");--> statement-breakpoint
CREATE INDEX "IDX_production_rig_audit_log_event" ON "production_rig_audit_log" USING btree ("event");--> statement-breakpoint
CREATE INDEX "IDX_production_rigs_status" ON "production_rigs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_production_rigs_safety_review" ON "production_rigs" USING btree ("safety_review");--> statement-breakpoint
CREATE INDEX "IDX_production_rigs_approval_gate" ON "production_rigs" USING btree ("approval_gate");--> statement-breakpoint
CREATE INDEX "IDX_production_rigs_created_at" ON "production_rigs" USING btree ("created_at");