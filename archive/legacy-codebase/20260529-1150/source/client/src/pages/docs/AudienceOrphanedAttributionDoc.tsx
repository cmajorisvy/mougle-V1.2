/**
 * Public explainer for the "Orphaned attribution rows" admin card
 * (Task #634). Kept as inline React content (rather than serving the
 * raw markdown file) so the SPA routing always resolves the link.
 */
export default function AudienceOrphanedAttributionDoc() {
  return (
    <div
      className="container mx-auto max-w-3xl p-6 space-y-4 text-sm leading-6"
      data-testid="page-audience-orphaned-attribution-doc"
    >
      <h1 className="text-2xl font-bold">Audience orphaned attribution rows</h1>

      <p>
        Several <code>audience_*</code> tables had attribution columns
        (<code>connector_id</code>, <code>platform</code>,
        <code> command_id</code>, <code>rotated_by</code>) added partway
        through the project. Rows persisted before those columns existed
        remain in the database with <code>NULL</code> values for those
        columns.
      </p>

      <p>
        The admin dashboard surfaces a per-(table, column) summary of
        these orphan rows at the "Orphaned attribution rows" card on the
        <strong> Omni-Channel Audience</strong> page so admins can see how
        much history is unattributed and whether anything can be done
        about it.
      </p>

      <h2 className="text-lg font-semibold pt-2">
        What each backfill status means
      </h2>

      <ul className="list-disc pl-6 space-y-2">
        <li>
          <strong>backfillable</strong> — A one-shot script exists that
          can fill in the missing values by joining back to a sibling
          table. Today this only covers
          <code> audience_gateway_events.connector_id</code>, which can
          be recovered from the matching
          <code> audience_moderation_commands</code> row when the event
          still carries a <code>command_id</code>. Run:
          <pre className="rounded bg-muted p-2 mt-1 text-xs overflow-x-auto">
            tsx scripts/backfill-audience-gateway-event-connectors.ts --dry-run{"\n"}
            tsx scripts/backfill-audience-gateway-event-connectors.ts
          </pre>
        </li>
        <li>
          <strong>manual_only</strong> — There is no automatic backfill,
          but an operator with access to the underlying platform records
          may be able to reconcile rows by hand. File a follow-up task
          before doing this.
        </li>
        <li>
          <strong>no_backfill_path</strong> — The attribution was never
          recorded at write time and cannot be reconstructed. These rows
          are kept for audit completeness, but the
          <code> Connector</code> / <code>Command</code> filters on the
          gateway activity view will not match them. The retention
          sweeper will eventually prune them on the audit-window cadence.
        </li>
      </ul>

      <h2 className="text-lg font-semibold pt-2">
        Adding a new column to the summary
      </h2>

      <p>
        Edit <code>AUDIENCE_ORPHANED_ATTRIBUTION_TARGETS</code> in
        <code>
          {" "}
          server/services/audience-orphaned-attribution-service.ts
        </code>{" "}
        to add a new{" "}
        <code>{`{ table, column, label, description, backfillStatus, docHref }`}</code>{" "}
        entry. The admin card picks it up automatically — no schema or UI
        changes are required.
      </p>
    </div>
  );
}
