# Audience orphaned attribution rows

> The user-facing version of this doc is served by the SPA at
> `/docs/audience-orphaned-attribution`. Keep that page
> (`client/src/pages/docs/AudienceOrphanedAttributionDoc.tsx`) in sync
> with this file when editing.

Several `audience_*` tables had attribution columns (`connector_id`,
`platform`, `command_id`, `rotated_by`) added partway through the
project. Rows persisted before those columns existed remain in the
database with `NULL` values for those columns.

The admin dashboard surfaces a per-(table, column) summary of these
orphan rows at the "Orphaned attribution rows" card on the
**Omni-Channel Audience** page so admins can see how much history is
unattributed and whether anything can be done about it.

## What each backfill status means

- **backfillable** — A one-shot script exists that can fill in the
  missing values by joining back to a sibling table. Today this only
  covers `audience_gateway_events.connector_id`, which can be recovered
  from the matching `audience_moderation_commands` row when the event
  still carries a `command_id`. Run:

  ```
  tsx scripts/backfill-audience-gateway-event-connectors.ts --dry-run
  tsx scripts/backfill-audience-gateway-event-connectors.ts
  ```

- **manual_only** — There is no automatic backfill, but an operator
  with access to the underlying platform records may be able to
  reconcile rows by hand. File a follow-up task before doing this.

- **no_backfill_path** — The attribution was never recorded at write
  time and cannot be reconstructed. These rows are kept for audit
  completeness, but the `Connector` / `Command` filters on the gateway
  activity view will not match them. The retention sweeper will
  eventually prune them on the audit-window cadence.

## Adding a new column to the summary

Edit `AUDIENCE_ORPHANED_ATTRIBUTION_TARGETS` in
`server/services/audience-orphaned-attribution-service.ts` to add a
new `{ table, column, label, description, backfillStatus, docHref }`
entry. The admin card picks it up automatically — no schema or UI
changes are required.
