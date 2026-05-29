/**
 * Direct-SQL migration for the Neural Newsroom Automation stack.
 *
 * Creates screen_presets / screen_take_plans / screen_safety_validations
 * and seeds locked preset rows. Idempotent — safe to re-run.
 *
 * Usage: tsx scripts/migrate-neural-newsroom.ts
 */

import { Pool } from "pg";
import { resolveSupabaseDatabaseUrl } from "../server/config/supabase-db";

const DDL = `
CREATE TABLE IF NOT EXISTS screen_presets (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id text NOT NULL UNIQUE,
  name text NOT NULL,
  target_screen_object_name text NOT NULL,
  screen_role text NOT NULL,
  x real NOT NULL,
  y real NOT NULL,
  width real NOT NULL,
  height real NOT NULL,
  crop_rect jsonb,
  zoom_rect jsonb,
  safe_area jsonb NOT NULL,
  allowed_source_types text[] NOT NULL,
  allowed_sensitivity_classes text[] NOT NULL,
  fallback_preset_id text,
  locked boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IDX_screen_presets_screen_role" ON screen_presets(screen_role);

CREATE TABLE IF NOT EXISTS screen_take_plans (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  take_plan_id text NOT NULL UNIQUE,
  production_id text NOT NULL,
  story_id text NOT NULL,
  broadcast_brief_id text,
  screen_data_id text,
  visual_plan_id text,
  requested_by text NOT NULL,
  mode text NOT NULL DEFAULT 'fully_automatic_simulation',
  current_script_beat_id text,
  source_id text,
  source_license_status text NOT NULL DEFAULT 'rights_unknown',
  source_approval_status text NOT NULL DEFAULT 'unapproved',
  target_screen_object_name text NOT NULL,
  target_output_id text,
  screen_role text NOT NULL,
  preset_id text NOT NULL,
  action text NOT NULL,
  transition text NOT NULL DEFAULT 'cut',
  duration_ms integer NOT NULL DEFAULT 0,
  crop_rect jsonb,
  zoom_rect jsonb,
  fallback_source_id text,
  fallback_preset_id text NOT NULL,
  restore_default_route_id text NOT NULL,
  sensitivity_class text NOT NULL DEFAULT 'normal',
  confidence_vector jsonb NOT NULL,
  c_total real NOT NULL,
  tier_band text NOT NULL,
  validation_status text NOT NULL DEFAULT 'pending',
  approval_status text NOT NULL DEFAULT 'draft',
  visibility text NOT NULL DEFAULT 'admin_only_internal',
  public_url text,
  signed_url text,
  real_send_allowed boolean NOT NULL DEFAULT false,
  execution_enabled boolean NOT NULL DEFAULT false,
  hardware_send_allowed boolean NOT NULL DEFAULT false,
  not_published boolean NOT NULL DEFAULT true,
  safety_envelope jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IDX_screen_take_plans_story_id" ON screen_take_plans(story_id);
CREATE INDEX IF NOT EXISTS "IDX_screen_take_plans_production_id" ON screen_take_plans(production_id);
CREATE INDEX IF NOT EXISTS "IDX_screen_take_plans_validation_status" ON screen_take_plans(validation_status);
CREATE INDEX IF NOT EXISTS "IDX_screen_take_plans_created_at" ON screen_take_plans(created_at);

CREATE TABLE IF NOT EXISTS screen_safety_validations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_id text NOT NULL UNIQUE,
  take_plan_id text NOT NULL,
  passed boolean NOT NULL,
  blockers text[] NOT NULL DEFAULT '{}',
  warnings text[] NOT NULL DEFAULT '{}',
  checks jsonb NOT NULL,
  checked_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UX_screen_safety_validations_take_plan_id" ON screen_safety_validations(take_plan_id);
CREATE INDEX IF NOT EXISTS "IDX_screen_safety_validations_passed" ON screen_safety_validations(passed);
`;

const SAFE_AREA = { x: 0, y: 0, w: 1920, h: 1080 };
const PRESET_SEEDS = [
  {
    preset_id: "preset_world_map_default",
    name: "World Map (default safe route)",
    target_screen_object_name: "world_map_screen",
    screen_role: "world_map",
    x: 0, y: 0, width: 1920, height: 1080,
    allowed_source_types: ["map", "vector", "owned_graphic"],
    allowed_sensitivity_classes: ["normal", "sensitive", "disaster", "war", "crime", "medical", "children", "active_crisis"],
    fallback_preset_id: null,
  },
  {
    preset_id: "preset_event_wall_default",
    name: "Event Display Wall",
    target_screen_object_name: "event_wall_screen",
    screen_role: "event_wall",
    x: 0, y: 0, width: 1920, height: 1080,
    allowed_source_types: ["owned_graphic", "licensed_photo", "map"],
    allowed_sensitivity_classes: ["normal", "sensitive", "disaster"],
    fallback_preset_id: "preset_world_map_default",
  },
  {
    preset_id: "preset_event_wall_breaking",
    name: "Event Display Wall — Breaking",
    target_screen_object_name: "event_wall_screen",
    screen_role: "event_wall",
    x: 0, y: 0, width: 1920, height: 1080,
    allowed_source_types: ["owned_graphic", "licensed_photo", "map"],
    allowed_sensitivity_classes: ["normal", "sensitive", "disaster", "active_crisis"],
    fallback_preset_id: "preset_world_map_default",
  },
  {
    preset_id: "preset_source_panel_default",
    name: "Source / Confidence Panel",
    target_screen_object_name: "source_panel_screen",
    screen_role: "source_panel",
    x: 1440, y: 0, width: 480, height: 540,
    allowed_source_types: ["owned_graphic", "data_panel"],
    allowed_sensitivity_classes: ["normal", "sensitive", "disaster", "war", "crime", "medical", "children", "active_crisis"],
    fallback_preset_id: "preset_world_map_default",
  },
  {
    preset_id: "preset_claims_panel_default",
    name: "Claims Panel",
    target_screen_object_name: "claims_panel_screen",
    screen_role: "claims_panel",
    x: 0, y: 540, width: 960, height: 540,
    allowed_source_types: ["owned_graphic", "data_panel"],
    allowed_sensitivity_classes: ["normal", "sensitive", "disaster", "war", "crime", "medical", "children", "active_crisis"],
    fallback_preset_id: "preset_world_map_default",
  },
  {
    preset_id: "preset_timeline_panel_default",
    name: "Timeline Panel",
    target_screen_object_name: "timeline_panel_screen",
    screen_role: "timeline_panel",
    x: 960, y: 540, width: 960, height: 540,
    allowed_source_types: ["owned_graphic", "data_panel"],
    allowed_sensitivity_classes: ["normal", "sensitive", "disaster", "war", "crime", "medical", "children", "active_crisis"],
    fallback_preset_id: "preset_world_map_default",
  },
];

async function main() {
  const url = resolveSupabaseDatabaseUrl();
  const pool = new Pool({ connectionString: url, max: 2, ssl: { rejectUnauthorized: false } });
  try {
    console.log("[neural-newsroom-migration] applying DDL...");
    await pool.query(DDL);
    console.log("[neural-newsroom-migration] seeding presets...");
    for (const p of PRESET_SEEDS) {
      await pool.query(
        `INSERT INTO screen_presets
          (preset_id, name, target_screen_object_name, screen_role, x, y, width, height, safe_area, allowed_source_types, allowed_sensitivity_classes, fallback_preset_id, locked)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,true)
         ON CONFLICT (preset_id) DO NOTHING`,
        [
          p.preset_id, p.name, p.target_screen_object_name, p.screen_role,
          p.x, p.y, p.width, p.height,
          JSON.stringify(SAFE_AREA),
          p.allowed_source_types, p.allowed_sensitivity_classes,
          p.fallback_preset_id,
        ],
      );
    }
    console.log("[neural-newsroom-migration] done");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
