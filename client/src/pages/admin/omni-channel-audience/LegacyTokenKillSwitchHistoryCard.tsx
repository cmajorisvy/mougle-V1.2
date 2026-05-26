import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface LegacyTokenKillSwitchAuditEntry {
  id: string;
  platform: string;
  previousValue: "true" | "false" | "cleared";
  newValue: "true" | "false" | "cleared";
  updatedBy: string;
  batchId?: string | null;
  updatedAt: string;
}

interface GroupedEntry {
  key: string;
  batchId: string | null;
  updatedBy: string;
  updatedAt: string;
  items: LegacyTokenKillSwitchAuditEntry[];
}

function killSwitchValueLabel(v: "true" | "false" | "cleared"): string {
  if (v === "true") return "OFF (disabled)";
  if (v === "false") return "ON (enabled)";
  return "cleared";
}

function groupEntries(
  entries: LegacyTokenKillSwitchAuditEntry[],
): GroupedEntry[] {
  const groups: GroupedEntry[] = [];
  const byBatch = new Map<string, GroupedEntry>();
  for (const e of entries) {
    if (e.batchId) {
      const existing = byBatch.get(e.batchId);
      if (existing) {
        existing.items.push(e);
        // Keep the newest timestamp as the group's timestamp.
        if (new Date(e.updatedAt) > new Date(existing.updatedAt)) {
          existing.updatedAt = e.updatedAt;
        }
        continue;
      }
      const g: GroupedEntry = {
        key: `batch_${e.batchId}`,
        batchId: e.batchId,
        updatedBy: e.updatedBy,
        updatedAt: e.updatedAt,
        items: [e],
      };
      byBatch.set(e.batchId, g);
      groups.push(g);
    } else {
      groups.push({
        key: `single_${e.id}`,
        batchId: null,
        updatedBy: e.updatedBy,
        updatedAt: e.updatedAt,
        items: [e],
      });
    }
  }
  // Re-sort newest first by group's representative timestamp.
  groups.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  return groups;
}

export function LegacyTokenKillSwitchHistoryCard() {
  const query = useQuery<{ entries: LegacyTokenKillSwitchAuditEntry[] }>({
    queryKey: ["/api/admin/newsroom/audience/legacy-token-status/history"],
    refetchInterval: 60_000,
  });
  const entries = query.data?.entries ?? [];
  const groups = groupEntries(entries);
  return (
    <Card data-testid="card-legacy-token-kill-switch-history">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Legacy token kill-switch history</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            asChild
            data-testid="button-legacy-token-kill-switch-history-download-csv"
          >
            <a
              href="/api/admin/newsroom/audience/legacy-token-status/history.csv"
              download
            >
              Download CSV
            </a>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Audit trail of every per-platform legacy-token env-fallback
          kill-switch flip. Newest first; capped at the most recent 50
          changes. Bulk actions (e.g. "Disable env-fallback everywhere",
          "Clear all overrides") appear as a single grouped entry. Pruned
          on the standard audience retention cadence.
        </p>
        {query.isLoading ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="text-legacy-token-kill-switch-history-loading"
          >
            Loading…
          </p>
        ) : groups.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="text-legacy-token-kill-switch-history-empty"
          >
            No kill-switch changes recorded yet.
          </p>
        ) : (
          <div className="space-y-1">
            {groups.map((g) =>
              g.batchId ? (
                <div
                  key={g.key}
                  className="rounded border p-2 text-xs space-y-1"
                  data-testid={`row-legacy-token-kill-switch-history-batch-${g.batchId}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>Bulk ({g.items.length})</Badge>
                    <span
                      data-testid={`text-kill-switch-history-actor-${g.key}`}
                    >
                      by {g.updatedBy}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span data-testid={`text-kill-switch-history-at-${g.key}`}>
                      {new Date(g.updatedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="space-y-0.5 pl-2">
                    {g.items.map((e) => (
                      <div
                        key={e.id}
                        className="flex flex-wrap items-center gap-2"
                        data-testid={`row-legacy-token-kill-switch-history-${e.id}`}
                      >
                        <Badge variant="outline">{e.platform}</Badge>
                        <span
                          data-testid={`text-kill-switch-history-prev-${e.id}`}
                        >
                          {killSwitchValueLabel(e.previousValue)}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span
                          className="font-medium"
                          data-testid={`text-kill-switch-history-new-${e.id}`}
                        >
                          {killSwitchValueLabel(e.newValue)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  key={g.key}
                  className="rounded border p-2 text-xs flex flex-wrap items-center gap-2"
                  data-testid={`row-legacy-token-kill-switch-history-${g.items[0].id}`}
                >
                  <Badge variant="outline">{g.items[0].platform}</Badge>
                  <span
                    data-testid={`text-kill-switch-history-prev-${g.items[0].id}`}
                  >
                    {killSwitchValueLabel(g.items[0].previousValue)}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span
                    className="font-medium"
                    data-testid={`text-kill-switch-history-new-${g.items[0].id}`}
                  >
                    {killSwitchValueLabel(g.items[0].newValue)}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span
                    data-testid={`text-kill-switch-history-actor-${g.items[0].id}`}
                  >
                    by {g.updatedBy}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span
                    data-testid={`text-kill-switch-history-at-${g.items[0].id}`}
                  >
                    {new Date(g.updatedAt).toLocaleString()}
                  </span>
                </div>
              ),
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
