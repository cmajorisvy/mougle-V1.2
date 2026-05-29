# Release Notes

Operationally-relevant changes founders should know about between deploys.
Newest entries on top.

## Audit retention: `*_AUDIT_MAX_ARCHIVES=0` is no longer honoured (task #334)

**Affected env vars**

- `FALLBACK_PRESET_AUDIT_MAX_ARCHIVES`
- `COVER_SWEEP_AUDIT_MAX_ARCHIVES`
- `MEDIA_SWEEP_AUDIT_MAX_ARCHIVES`

**What changed**

Previously, setting any of the above env vars to `0` meant
"rotate-and-immediately-delete" — every rotation wiped the prior archive,
so only the live `.jsonl` tail was kept. The new DB-backed retention
settings (and the matching cover- and media-sweep services) enforce a
minimum of **1** archive because an audit log with zero retained
archives wipes its own evidence on every rotation, defeating the audit's
purpose.

**What you'll see on upgrade**

- If your deployment had one of these env vars set to `0`, that value is
  now treated as "unset" and the service falls through to the platform
  default of **4 archives**. Storage usage for these audit logs will
  grow modestly compared to the old zero-retention behaviour.
- The new admin UI for these retention settings rejects values below
  `1` with `out_of_range`. There is no way to configure `0` from the
  dashboard.
- Founders who genuinely want "rotate-and-delete" should disable the
  audit log at the source rather than configuring zero retention.

**Why**

The fallback-preset, cover-sweep, and media-sweep audit logs all exist
so that founders can reconstruct what the system did after the fact
(which scenes were marked orphan, which preset overrode which broadcast,
etc.). Allowing `0` archives reintroduces a silent failure mode where
the rotation succeeds but the historical trail is lost, which is
exactly the scenario the audit logs were added to prevent.

**Relevant files**

- `server/services/fallback-preset-audit-settings-service.ts`
- `server/services/cover-orphan-alert-service.ts`
- `server/services/media-orphan-alert-service.ts`
