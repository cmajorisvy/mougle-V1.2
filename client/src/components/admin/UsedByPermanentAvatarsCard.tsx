import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { UserSquare2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type PermanentAvatarRow = {
  id: string;
  displayName: string;
  slug: string;
  lifecycleState: string;
  status: string;
  approvalGate: string;
  bodyAssetId: string;
  rigId: string;
};

type ListResponse = {
  ok: boolean;
  items: PermanentAvatarRow[];
  total: number;
};

type Filter =
  | { kind: "bodyAsset"; id: string }
  | { kind: "rig"; id: string };

type FetchResult = { items: PermanentAvatarRow[]; total: number };

export const PERMANENT_AVATAR_USED_BY_ANCHOR = "used-by-permanent-avatars";

// Server endpoint clamps limit to 100. We page through it until we have every
// row so operators see EVERY permanent avatar that binds the subject (the
// 409 archive/delete deep-link relies on this list being complete).
const PAGE_SIZE = 100;
const MAX_PAGES = 50; // hard ceiling — 5 000 rows is well past any realistic case

export function UsedByPermanentAvatarsCard({ filter }: { filter: Filter }) {
  const param = filter.kind === "bodyAsset" ? "bodyAssetId" : "rigId";
  const subjectLabel = filter.kind === "bodyAsset" ? "body asset" : "rig";
  const baseUrl = `/api/admin/permanent-avatars?${param}=${encodeURIComponent(
    filter.id,
  )}`;

  const { data, isLoading, error } = useQuery<FetchResult>({
    queryKey: ["used-by-permanent-avatars", filter.kind, filter.id],
    enabled: !!filter.id,
    queryFn: async () => {
      const collected: PermanentAvatarRow[] = [];
      let offset = 0;
      let total = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await fetch(
          `${baseUrl}&limit=${PAGE_SIZE}&offset=${offset}`,
          { credentials: "include" },
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as ListResponse;
        const items = json?.items ?? [];
        total = json?.total ?? collected.length + items.length;
        collected.push(...items);
        if (items.length < PAGE_SIZE) break;
        if (collected.length >= total) break;
        offset += PAGE_SIZE;
      }
      return { items: collected, total };
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? items.length;

  return (
    <Card
      className="mb-4"
      id={PERMANENT_AVATAR_USED_BY_ANCHOR}
      data-testid="card-used-by-permanent-avatars"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserSquare2 className="h-5 w-5 text-fuchsia-400" />
          Used by permanent avatars
          {!isLoading && !error && (
            <Badge
              variant="outline"
              className="ml-1 text-xs"
              data-testid="badge-used-by-count"
            >
              {total}
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Permanent avatars that bind this {subjectLabel}. While any avatar
          listed here binds it, archive or permanent-delete is refused with
          HTTP 409. Open each avatar and rebind or archive it first to clear
          the block.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div
            className="py-6 text-center text-xs text-muted-foreground"
            data-testid="text-used-by-loading"
          >
            Loading permanent avatars…
          </div>
        ) : error ? (
          <div
            className="py-6 text-center text-xs text-destructive"
            data-testid="text-used-by-error"
          >
            Failed to load: {(error as Error).message}
          </div>
        ) : items.length === 0 ? (
          <div
            className="py-6 text-center text-xs text-muted-foreground"
            data-testid="text-used-by-empty"
          >
            No permanent avatar currently binds this {subjectLabel}.
          </div>
        ) : (
          <ul className="space-y-2" data-testid="list-used-by">
            {items.map((a) => (
              <li
                key={a.id}
                className="rounded border border-border bg-muted/20 p-2 text-xs"
                data-testid={`row-used-by-${a.id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/permanent-avatars/${a.id}`}
                      className="inline-flex items-center gap-1 font-medium text-primary underline"
                      data-testid={`link-used-by-${a.id}`}
                    >
                      {a.displayName}
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                    <div className="mt-0.5 text-muted-foreground">
                      <code>{a.slug}</code>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge
                      variant="outline"
                      data-testid={`pill-used-by-lifecycle-${a.id}`}
                    >
                      lifecycle: {a.lifecycleState}
                    </Badge>
                    <Badge
                      variant="outline"
                      data-testid={`pill-used-by-status-${a.id}`}
                    >
                      status: {a.status}
                    </Badge>
                    <Badge
                      variant="outline"
                      data-testid={`pill-used-by-gate-${a.id}`}
                    >
                      gate: {a.approvalGate}
                    </Badge>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
