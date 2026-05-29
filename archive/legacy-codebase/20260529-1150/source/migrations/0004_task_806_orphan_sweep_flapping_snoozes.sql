CREATE TABLE "production_asset_orphan_sweep_flapping_snoozes" (
"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
"action" text NOT NULL,
"snooze_until" timestamp,
"updated_by" text,
"reason" text,
"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "IDX_paossfs_occurred_at" ON "production_asset_orphan_sweep_flapping_snoozes" USING btree ("occurred_at");
