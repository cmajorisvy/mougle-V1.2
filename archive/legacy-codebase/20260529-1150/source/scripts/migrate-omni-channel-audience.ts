/**
 * Optional direct-SQL DDL for the Omni-Channel Audience Safety Layer.
 *
 * Task #371 keeps live state in-memory (mirrors apexload / precognition /
 * flowstate) so the safety stack stays fully functional without DB writes.
 * This script provisions the persistence tables so a future task can opt
 * into durable audit storage without changing the service contract.
 *
 * Idempotent — safe to re-run. Usage: tsx scripts/migrate-omni-channel-audience.ts
 */

import { Pool } from "pg";
import { resolveSupabaseDatabaseUrl } from "../server/config/supabase-db";

const DDL = `
CREATE TABLE IF NOT EXISTS audience_channel_connectors (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id text NOT NULL UNIQUE,
  platform text NOT NULL,
  account_id text NOT NULL,
  display_name text NOT NULL,
  connection_status text NOT NULL,
  permissions jsonb NOT NULL,
  api_access_mode text NOT NULL,
  last_sync_at timestamp,
  rate_limit_status jsonb,
  approval_status text NOT NULL DEFAULT 'draft',
  visibility text NOT NULL DEFAULT 'admin_only_internal',
  real_send_allowed boolean NOT NULL DEFAULT false,
  execution_enabled boolean NOT NULL DEFAULT false,
  platform_send_approved boolean NOT NULL DEFAULT false,
  platform_send_approved_by text,
  platform_send_approved_at timestamp,
  safety_envelope jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE audience_channel_connectors
  ADD COLUMN IF NOT EXISTS platform_send_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS platform_send_approved_by text,
  ADD COLUMN IF NOT EXISTS platform_send_approved_at timestamp,
  ADD COLUMN IF NOT EXISTS auto_paused_at timestamp,
  ADD COLUMN IF NOT EXISTS auto_paused_reason text;

CREATE TABLE IF NOT EXISTS audience_messages (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text NOT NULL UNIQUE,
  connector_id text NOT NULL,
  platform text NOT NULL,
  external_message_id text NOT NULL,
  external_author_id_hash text NOT NULL,
  author_display_name_safe text,
  message_text text NOT NULL,
  message_type text NOT NULL,
  received_at timestamp NOT NULL DEFAULT now(),
  story_id text,
  production_id text,
  broadcast_brief_id text,
  gift_value real,
  raw_metadata_redacted jsonb NOT NULL,
  approval_status text NOT NULL DEFAULT 'draft',
  visibility text NOT NULL DEFAULT 'admin_only_internal',
  real_send_allowed boolean NOT NULL DEFAULT false,
  execution_enabled boolean NOT NULL DEFAULT false,
  safety_envelope jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_audience_messages_production_id" ON audience_messages(production_id);
CREATE INDEX IF NOT EXISTS "IDX_audience_messages_platform" ON audience_messages(platform);

CREATE TABLE IF NOT EXISTS audience_safety_decisions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id text NOT NULL UNIQUE,
  message_id text NOT NULL,
  platform text NOT NULL,
  action text NOT NULL,
  reason_codes text[] NOT NULL DEFAULT '{}',
  scores jsonb NOT NULL,
  gift_value real,
  allowed_for_robot_speech boolean NOT NULL,
  allowed_for_anchor_speech boolean NOT NULL,
  allowed_for_screen_display boolean NOT NULL,
  allowed_for_auto_reply boolean NOT NULL,
  allowed_for_moderation_action boolean NOT NULL,
  requires_human_review boolean NOT NULL,
  sensitivity_override boolean NOT NULL,
  c_audience_safety real NOT NULL,
  approval_status text NOT NULL DEFAULT 'draft',
  visibility text NOT NULL DEFAULT 'admin_only_internal',
  real_send_allowed boolean NOT NULL DEFAULT false,
  execution_enabled boolean NOT NULL DEFAULT false,
  not_published boolean NOT NULL DEFAULT true,
  safety_envelope jsonb NOT NULL,
  decided_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IDX_audience_decisions_message_id" ON audience_safety_decisions(message_id);

CREATE TABLE IF NOT EXISTS audience_moderation_commands (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id text NOT NULL UNIQUE,
  decision_id text NOT NULL,
  platform text NOT NULL,
  connector_id text NOT NULL,
  external_message_id text NOT NULL,
  requested_action text NOT NULL,
  requested_by text NOT NULL,
  command_mode text NOT NULL DEFAULT 'simulation_only',
  command_allowed boolean NOT NULL,
  blocker_reason text,
  requires_human_approval boolean NOT NULL,
  approval_status text NOT NULL DEFAULT 'draft',
  visibility text NOT NULL DEFAULT 'admin_only_internal',
  real_send_allowed boolean NOT NULL DEFAULT false,
  execution_enabled boolean NOT NULL DEFAULT false,
  platform_send_allowed boolean NOT NULL DEFAULT false,
  decision_fingerprint text NOT NULL DEFAULT '',
  safety_envelope jsonb NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE audience_moderation_commands
  ADD COLUMN IF NOT EXISTS decision_fingerprint text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "IDX_audience_commands_decision_id" ON audience_moderation_commands(decision_id);

CREATE TABLE IF NOT EXISTS audience_audit_email_schedules (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  cadence text NOT NULL DEFAULT 'weekly',
  recipients text[] NOT NULL DEFAULT '{}',
  platform text,
  production_id text,
  last_run_at timestamp,
  last_run_status text,
  last_run_error text,
  next_run_at timestamp,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audience_audit_email_runs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL UNIQUE,
  schedule_id text NOT NULL,
  cadence text NOT NULL,
  triggered_by text NOT NULL DEFAULT 'scheduler',
  is_test boolean NOT NULL DEFAULT false,
  window_from timestamp NOT NULL,
  window_to timestamp NOT NULL,
  recipients text[] NOT NULL DEFAULT '{}',
  status text NOT NULL,
  error_message text,
  message_count integer NOT NULL DEFAULT 0,
  decision_count integer NOT NULL DEFAULT 0,
  command_count integer NOT NULL DEFAULT 0,
  connector_count integer NOT NULL DEFAULT 0,
  started_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp
);
ALTER TABLE audience_audit_email_runs
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "IDX_audience_audit_runs_schedule_id" ON audience_audit_email_runs(schedule_id);
CREATE INDEX IF NOT EXISTS "IDX_audience_audit_runs_started_at" ON audience_audit_email_runs(started_at);

CREATE TABLE IF NOT EXISTS audience_audit_exports (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id text NOT NULL UNIQUE,
  actor_id text NOT NULL,
  actor_type text NOT NULL,
  actor_role text,
  format text NOT NULL,
  filters jsonb NOT NULL,
  connector_count real NOT NULL DEFAULT 0,
  message_count real NOT NULL DEFAULT 0,
  decision_count real NOT NULL DEFAULT 0,
  command_count real NOT NULL DEFAULT 0,
  total_row_count real NOT NULL DEFAULT 0,
  risk_signals text[] NOT NULL DEFAULT '{}'::text[],
  exported_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE audience_audit_exports
  ADD COLUMN IF NOT EXISTS risk_signals text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS is_outlier boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rolling_median real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rolling_p95 real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outlier_threshold real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outlier_sample_size integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "IDX_audience_audit_exports_exported_at" ON audience_audit_exports(exported_at);
CREATE INDEX IF NOT EXISTS "IDX_audience_audit_exports_actor_id" ON audience_audit_exports(actor_id);
CREATE INDEX IF NOT EXISTS "IDX_audience_audit_exports_is_outlier" ON audience_audit_exports(is_outlier);

-- Task #421: permanent log of every gated moderation send.
  CREATE TABLE IF NOT EXISTS audience_gateway_events (
    id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id text NOT NULL UNIQUE,
    event_name text NOT NULL,
    command_id text,
    platform text,
    requested_action text,
    status integer,
    reason text,
    url_redacted text,
    method text,
    admin_id text,
    emitted_at timestamp NOT NULL DEFAULT now()
  );
  -- Task #532: per-connector attribution so admins with multiple
  -- connectors of the same platform (e.g. two YouTube channels) can
  -- isolate one connector's gateway traffic. Backfill is intentionally
  -- left NULL for pre-#532 rows since the source attribution was lost.
  ALTER TABLE audience_gateway_events
    ADD COLUMN IF NOT EXISTS connector_id text;
  CREATE INDEX IF NOT EXISTS "IDX_audience_gateway_events_emitted_at" ON audience_gateway_events(emitted_at);
  CREATE INDEX IF NOT EXISTS "IDX_audience_gateway_events_event_name" ON audience_gateway_events(event_name);
  CREATE INDEX IF NOT EXISTS "IDX_audience_gateway_events_command_id" ON audience_gateway_events(command_id);
  CREATE INDEX IF NOT EXISTS "IDX_audience_gateway_events_connector_id" ON audience_gateway_events(connector_id);
  
-- Task #380: per-connector encrypted platform access tokens used by the
-- audience platform gateway when AUDIENCE_GATEWAY_LIVE_DISPATCH=true.
CREATE TABLE IF NOT EXISTS audience_connector_secrets (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id text NOT NULL UNIQUE,
  platform text NOT NULL,
  encrypted_token text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  rotation_count integer NOT NULL DEFAULT 1,
  last_rotated_by text,
  last_rotated_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);

-- Task #448: persistent history of audit-export email notifications.
CREATE TABLE IF NOT EXISTS audience_audit_export_notifications (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id text NOT NULL UNIQUE,
  export_id text NOT NULL,
  actor_id text NOT NULL,
  actor_type text NOT NULL,
  actor_role text,
  format text NOT NULL,
  total_row_count integer NOT NULL DEFAULT 0,
  threshold_row_count integer NOT NULL DEFAULT 0,
  threshold_exceeded boolean NOT NULL DEFAULT false,
  recipients text[] NOT NULL DEFAULT '{}'::text[],
  notified boolean NOT NULL DEFAULT false,
  reason text NOT NULL,
  is_test boolean NOT NULL DEFAULT false,
  error_message text,
  occurred_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IDX_audience_audit_export_notifications_occurred_at" ON audience_audit_export_notifications(occurred_at);
CREATE INDEX IF NOT EXISTS "IDX_audience_audit_export_notifications_actor_id" ON audience_audit_export_notifications(actor_id);

-- Task #728: persistent history of audit-export notifier config changes.
CREATE TABLE IF NOT EXISTS audience_audit_export_notifier_config_history (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamp NOT NULL DEFAULT now(),
  updated_by text,
  action text NOT NULL,
  previous_config jsonb,
  new_config jsonb,
  changed_fields text[] NOT NULL DEFAULT '{}'::text[],
  dedup_key text UNIQUE
);
CREATE INDEX IF NOT EXISTS "IDX_audience_audit_export_notifier_config_history_occurred_at" ON audience_audit_export_notifier_config_history(occurred_at);

-- Task #562: persistent history of Archive Deletion Alerts snooze windows.
CREATE TABLE IF NOT EXISTS audience_archive_notifier_snooze_log (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  snooze_id text NOT NULL UNIQUE,
  started_at timestamp NOT NULL DEFAULT now(),
  ended_at timestamp,
  ended_reason text,
  source text NOT NULL,
  policy_kind text NOT NULL,
  policy_extend_days integer,
  policy_days integer[],
  policy_start_hour integer,
  policy_end_hour integer,
  snooze_until timestamp,
  created_by text,
  suppressed_count integer NOT NULL DEFAULT 0,
  suppressed_files integer NOT NULL DEFAULT 0,
  suppressed_bytes integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "IDX_audience_archive_notifier_snooze_log_started_at" ON audience_archive_notifier_snooze_log(started_at);
CREATE INDEX IF NOT EXISTS "IDX_audience_archive_notifier_snooze_log_ended_at" ON audience_archive_notifier_snooze_log(ended_at);

-- Task #613: persistent history of snooze actions on the two audit-email
-- failure alerts (trail email + history email, Task #560).
CREATE TABLE IF NOT EXISTS audience_audit_email_failure_alert_snoozes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key text NOT NULL,
  action text NOT NULL,
  snooze_until timestamp,
  updated_by text,
  occurred_at timestamp NOT NULL DEFAULT now(),
  dedup_key text UNIQUE
);
CREATE INDEX IF NOT EXISTS "IDX_audience_audit_email_failure_alert_snoozes_occurred_at" ON audience_audit_email_failure_alert_snoozes(occurred_at);
CREATE INDEX IF NOT EXISTS "IDX_audience_audit_email_failure_alert_snoozes_alert_key" ON audience_audit_email_failure_alert_snoozes(alert_key);

-- Task #692: persistent history of every snooze window on the audit-export
-- history email staleness alert (mirrors audience_archive_notifier_snooze_log).
CREATE TABLE IF NOT EXISTS audience_audit_history_email_stale_snooze_log (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  snooze_id text NOT NULL UNIQUE,
  snooze_started_at timestamp NOT NULL DEFAULT now(),
  snooze_until timestamp,
  ended_at timestamp,
  ended_reason text,
  policy_kind text NOT NULL,
  policy_extend_days integer,
  policy_days integer[],
  policy_start_hour integer,
  policy_end_hour integer,
  created_by text,
  suppressed_ticks integer NOT NULL DEFAULT 0,
  max_age_ms_observed integer,
  last_successful_run_at_at_close timestamp
);
ALTER TABLE audience_audit_history_email_stale_snooze_log
  DROP COLUMN IF EXISTS source,
  ADD COLUMN IF NOT EXISTS snooze_started_at timestamp NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS snooze_until timestamp,
  ADD COLUMN IF NOT EXISTS ended_at timestamp,
  ADD COLUMN IF NOT EXISTS ended_reason text,
  ADD COLUMN IF NOT EXISTS policy_kind text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS policy_extend_days integer,
  ADD COLUMN IF NOT EXISTS policy_days integer[],
  ADD COLUMN IF NOT EXISTS policy_start_hour integer,
  ADD COLUMN IF NOT EXISTS policy_end_hour integer,
  ADD COLUMN IF NOT EXISTS created_by text,
  ADD COLUMN IF NOT EXISTS suppressed_ticks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_age_ms_observed integer,
  ADD COLUMN IF NOT EXISTS last_successful_run_at_at_close timestamp;
CREATE INDEX IF NOT EXISTS "IDX_audience_audit_history_email_stale_snooze_log_started_at" ON audience_audit_history_email_stale_snooze_log(snooze_started_at);
CREATE INDEX IF NOT EXISTS "IDX_audience_audit_history_email_stale_snooze_log_ended_at" ON audience_audit_history_email_stale_snooze_log(ended_at);

-- Task #545: persistent history of connector token rotation notifier sends.
CREATE TABLE IF NOT EXISTS audience_connector_rotation_notifications (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id text NOT NULL UNIQUE,
  connector_id text NOT NULL,
  platform text NOT NULL,
  action text NOT NULL,
  rotated_by text,
  rotation_count integer NOT NULL DEFAULT 0,
  key_version integer NOT NULL DEFAULT 1,
  event jsonb NOT NULL,
  recipients text[] NOT NULL DEFAULT '{}'::text[],
  notified boolean NOT NULL DEFAULT false,
  reason text NOT NULL,
  is_test boolean NOT NULL DEFAULT false,
  error_message text,
  occurred_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IDX_audience_connector_rotation_notifications_occurred_at" ON audience_connector_rotation_notifications(occurred_at);
CREATE INDEX IF NOT EXISTS "IDX_audience_connector_rotation_notifications_connector_id" ON audience_connector_rotation_notifications(connector_id);

-- Task #589: persistent per-connector dedup state for the rotation notifier.
CREATE TABLE IF NOT EXISTS audience_connector_rotation_dedup_state (
  connector_id text PRIMARY KEY,
  last_sent_at timestamp NOT NULL,
  last_action text NOT NULL,
  suppressed_count integer NOT NULL DEFAULT 0,
  suppressed_since timestamp,
  updated_at timestamp NOT NULL DEFAULT now()
);

-- Task #549: persistent history of legacy-token dispatch alert decisions.
CREATE TABLE IF NOT EXISTS audience_legacy_token_dispatch_alerts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id text NOT NULL UNIQUE,
  connector_id text,
  connector_display_name text,
  platform text,
  command_id text,
  requested_action text,
  api_access_mode text,
  token_source text,
  platform_send_approved boolean NOT NULL DEFAULT false,
  recipients text[] NOT NULL DEFAULT '{}'::text[],
  notified boolean NOT NULL DEFAULT false,
  reason text NOT NULL,
  dedup_window_ms integer NOT NULL DEFAULT 0,
  error_message text,
  occurred_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IDX_audience_legacy_token_dispatch_alerts_occurred_at" ON audience_legacy_token_dispatch_alerts(occurred_at);
CREATE INDEX IF NOT EXISTS "IDX_audience_legacy_token_dispatch_alerts_connector_id" ON audience_legacy_token_dispatch_alerts(connector_id);

-- Task #463: append-only audit log of per-connector platform-token
-- rotations (set / rotate / delete). Surfaces in the admin connector
-- detail view so admins can confirm a compromise-response rotation
-- actually landed. NEVER stores the plaintext token.
CREATE TABLE IF NOT EXISTS audience_connector_secret_rotations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id text NOT NULL,
  platform text NOT NULL,
  action text NOT NULL,
  rotated_by text,
  rotated_at timestamp NOT NULL DEFAULT now(),
  rotation_count integer NOT NULL DEFAULT 0,
  key_version integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS "IDX_audience_connector_secret_rotations_connector_id" ON audience_connector_secret_rotations(connector_id);
CREATE INDEX IF NOT EXISTS "IDX_audience_connector_secret_rotations_rotated_at" ON audience_connector_secret_rotations(rotated_at);

CREATE TABLE IF NOT EXISTS audience_restore_log (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  restored_at timestamp NOT NULL DEFAULT now(),
  archive_path text NOT NULL,
  table_name text NOT NULL,
  restored_by text NOT NULL,
  rows_parsed integer NOT NULL DEFAULT 0,
  rows_inserted integer NOT NULL DEFAULT 0,
  rows_skipped integer NOT NULL DEFAULT 0,
  error text
);
CREATE INDEX IF NOT EXISTS "IDX_audience_restore_log_restored_at" ON audience_restore_log(restored_at);

-- Task #413: per-deletion audit log for permanently removed archive files.
CREATE TABLE IF NOT EXISTS audience_archive_deletions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  deletion_id text NOT NULL UNIQUE,
  path text NOT NULL,
  archive_table text NOT NULL,
  bytes real NOT NULL DEFAULT 0,
  row_count real,
  archive_age_days real NOT NULL DEFAULT 0,
  retention_days real NOT NULL DEFAULT 0,
  trigger text NOT NULL DEFAULT 'scheduled',
  actor text,
  deleted_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IDX_audience_archive_deletions_deleted_at" ON audience_archive_deletions(deleted_at);
CREATE INDEX IF NOT EXISTS "IDX_audience_archive_deletions_archive_table" ON audience_archive_deletions(archive_table);

-- Task #439: soft-delete grace window for archive cleanup. runArchiveCleanup
-- now moves expired files to a .trash/<deletionId>/ prefix instead of
-- calling delete() directly; a second sweep hard-deletes trash entries
-- older than the configured grace window and sets purged_at.
ALTER TABLE audience_archive_deletions ADD COLUMN IF NOT EXISTS trash_path text;
ALTER TABLE audience_archive_deletions ADD COLUMN IF NOT EXISTS grace_days real;
ALTER TABLE audience_archive_deletions ADD COLUMN IF NOT EXISTS purged_at timestamp;
CREATE INDEX IF NOT EXISTS "IDX_audience_archive_deletions_purged_at" ON audience_archive_deletions(purged_at);

-- Task #557: per-run audit log for recycle-bin (.trash/) hard-delete sweeps.
CREATE TABLE IF NOT EXISTS audience_archive_trash_purges (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamp NOT NULL DEFAULT now(),
  finished_at timestamp NOT NULL DEFAULT now(),
  trigger text NOT NULL DEFAULT 'scheduled',
  actor text,
  grace_days real NOT NULL DEFAULT 0,
  candidate_entries integer NOT NULL DEFAULT 0,
  purged_entries integer NOT NULL DEFAULT 0,
  bytes_purged real NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "IDX_audience_archive_trash_purges_started_at" ON audience_archive_trash_purges(started_at);

-- Task #454: audit trail of every change to gateway block-alert thresholds.
CREATE TABLE IF NOT EXISTS gateway_alert_settings_audit (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  field text NOT NULL,
  old_value text,
  new_value text,
  action text NOT NULL DEFAULT 'update',
  updated_by text NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IDX_gateway_alert_settings_audit_updated_at" ON gateway_alert_settings_audit(updated_at);

-- Task #558: append-only audit log for per-platform legacy-token env-fallback
-- kill-switch changes (who flipped what, when, old -> new).
CREATE TABLE IF NOT EXISTS audience_legacy_token_kill_switch_audit (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  previous_value text NOT NULL,
  new_value text NOT NULL,
  updated_by text NOT NULL,
  batch_id varchar,
  updated_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE audience_legacy_token_kill_switch_audit
  ADD COLUMN IF NOT EXISTS batch_id varchar;
CREATE INDEX IF NOT EXISTS "IDX_audience_legacy_token_kill_switch_audit_updated_at"
  ON audience_legacy_token_kill_switch_audit(updated_at);
CREATE INDEX IF NOT EXISTS "IDX_audience_legacy_token_kill_switch_audit_platform"
  ON audience_legacy_token_kill_switch_audit(platform);
CREATE INDEX IF NOT EXISTS "IDX_audience_legacy_token_kill_switch_audit_batch_id"
  ON audience_legacy_token_kill_switch_audit(batch_id);

-- Task #441: per-sweep snapshot of per-table stale-pending-archive counts.
CREATE TABLE IF NOT EXISTS audience_retention_stale_history (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at timestamp NOT NULL DEFAULT now(),
  retention_days integer NOT NULL,
  stale_pending_messages integer NOT NULL DEFAULT 0,
  stale_pending_decisions integer NOT NULL DEFAULT 0,
  stale_pending_commands integer NOT NULL DEFAULT 0,
  sweep_trigger text NOT NULL DEFAULT 'scheduled',
  sweep_error text
);
CREATE INDEX IF NOT EXISTS "IDX_audience_retention_stale_history_recorded_at" ON audience_retention_stale_history(recorded_at);

-- Task #556: append-only audit trail of stale-rows alert threshold changes.
CREATE TABLE IF NOT EXISTS audience_stale_rows_threshold_history (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  prior_override jsonb,
  new_override jsonb,
  updated_by text,
  occurred_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IDX_audience_stale_rows_threshold_history_occurred_at" ON audience_stale_rows_threshold_history(occurred_at);

-- Task #571: append-only audit trail of restore-log rate spike threshold changes.
CREATE TABLE IF NOT EXISTS audience_restore_log_rate_threshold_history (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  prior_override integer,
  new_override integer,
  updated_by text,
  occurred_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IDX_audience_restore_log_rate_threshold_history_occurred_at" ON audience_restore_log_rate_threshold_history(occurred_at);

-- Task #677: persistent history of restore-log rate weakening email attempts.
CREATE TABLE IF NOT EXISTS audience_restore_log_rate_weakening_notifications (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id text NOT NULL UNIQUE,
  actor text NOT NULL,
  reason text NOT NULL,
  prior_effective integer NOT NULL,
  new_effective integer NOT NULL,
  prior_override integer,
  new_override integer,
  recipients text[] NOT NULL DEFAULT '{}'::text[],
  sent boolean NOT NULL DEFAULT false,
  error_message text,
  occurred_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IDX_audience_restore_log_rate_weakening_notifications_occurred_at" ON audience_restore_log_rate_weakening_notifications(occurred_at);
`;

async function main() {
  const url = resolveSupabaseDatabaseUrl();
  const pool = new Pool({ connectionString: url, max: 2, ssl: { rejectUnauthorized: false } });
  try {
    console.log("[omni-channel-audience-migration] applying DDL...");
    await pool.query(DDL);
    console.log("[omni-channel-audience-migration] done");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
