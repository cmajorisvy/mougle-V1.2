import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, UserSquare2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  GATE_OPTIONS,
  PermanentAvatar,
  PermanentAvatarSafetyBadges,
  REVIEW_OPTIONS,
  STATUS_OPTIONS,
} from "./shared";

const PAGE_SIZE = 20;

type ListResponse = {
  ok: boolean;
  items: PermanentAvatar[];
  total: number;
  limit: number;
  offset: number;
};

export default function PermanentAvatarList() {
  const [status, setStatus] = useState<string>("any");
  const [approvalGate, setApprovalGate] = useState<string>("any");
  const [identityReview, setIdentityReview] = useState<string>("any");
  const [safetyReview, setSafetyReview] = useState<string>("any");
  const [bodyAssetId, setBodyAssetId] = useState<string>("");
  const [rigId, setRigId] = useState<string>("");
  const [offset, setOffset] = useState(0);

  const params = new URLSearchParams();
  if (status !== "any") params.set("status", status);
  if (approvalGate !== "any") params.set("approvalGate", approvalGate);
  if (identityReview !== "any") params.set("identityReview", identityReview);
  if (safetyReview !== "any") params.set("safetyReview", safetyReview);
  if (bodyAssetId.trim()) params.set("bodyAssetId", bodyAssetId.trim());
  if (rigId.trim()) params.set("rigId", rigId.trim());
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));

  const url = `/api/admin/permanent-avatars?${params.toString()}`;
  const { data, isLoading, error, refetch, isFetching } = useQuery<ListResponse>({
    queryKey: [url],
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="page-permanent-avatars-list">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href="/admin/dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back-to-dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to dashboard
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Link href="/admin/permanent-avatars/new">
              <Button size="sm" data-testid="button-new-permanent-avatar">
                <Plus className="mr-2 h-4 w-4" />
                New permanent avatar
              </Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <UserSquare2 className="h-5 w-5 text-fuchsia-400" />
                  Permanent Avatar Library
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Admin-only library of permanent avatars. Each avatar binds one approved
                  body asset to one approved rig and carries identity / persona / default-room
                  metadata. No public URLs, no provider calls, no render or publish.
                </p>
              </div>
              <Badge
                variant="outline"
                className="border-fuchsia-500/40 text-fuchsia-500"
                data-testid="badge-phase"
              >
                R7B · Admin library
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <PermanentAvatarSafetyBadges />

            <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="filters">
              <div>
                <Label htmlFor="filter-status" className="text-xs">Status</Label>
                <Select value={status} onValueChange={(v) => { setOffset(0); setStatus(v); }}>
                  <SelectTrigger id="filter-status" data-testid="filter-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s} data-testid={`filter-status-option-${s}`}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="filter-approval-gate" className="text-xs">Approval gate</Label>
                <Select value={approvalGate} onValueChange={(v) => { setOffset(0); setApprovalGate(v); }}>
                  <SelectTrigger id="filter-approval-gate" data-testid="filter-approval-gate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GATE_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s} data-testid={`filter-approval-gate-option-${s}`}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="filter-identity-review" className="text-xs">Identity review</Label>
                <Select value={identityReview} onValueChange={(v) => { setOffset(0); setIdentityReview(v); }}>
                  <SelectTrigger id="filter-identity-review" data-testid="filter-identity-review">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REVIEW_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s} data-testid={`filter-identity-review-option-${s}`}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="filter-safety-review" className="text-xs">Safety review</Label>
                <Select value={safetyReview} onValueChange={(v) => { setOffset(0); setSafetyReview(v); }}>
                  <SelectTrigger id="filter-safety-review" data-testid="filter-safety-review">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REVIEW_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s} data-testid={`filter-safety-review-option-${s}`}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="filter-body-asset" className="text-xs">Body asset ID</Label>
                <Input
                  id="filter-body-asset"
                  value={bodyAssetId}
                  onChange={(e) => { setOffset(0); setBodyAssetId(e.target.value); }}
                  placeholder="asset uuid"
                  data-testid="filter-body-asset"
                />
              </div>
              <div>
                <Label htmlFor="filter-rig" className="text-xs">Rig ID</Label>
                <Input
                  id="filter-rig"
                  value={rigId}
                  onChange={(e) => { setOffset(0); setRigId(e.target.value); }}
                  placeholder="rig uuid"
                  data-testid="filter-rig"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground" data-testid="text-loading">
                Loading permanent avatars…
              </div>
            ) : error ? (
              <div className="py-10 text-center text-sm text-destructive" data-testid="text-error">
                Failed to load: {(error as Error).message}
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground" data-testid="text-empty">
                No permanent avatars match the current filters.
              </div>
            ) : (
              <div className="overflow-x-auto rounded border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Display name</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Role preset</TableHead>
                      <TableHead>Lifecycle</TableHead>
                      <TableHead>Body asset</TableHead>
                      <TableHead>Rig</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((a) => (
                      <TableRow key={a.id} data-testid={`row-permanent-avatar-${a.id}`}>
                        <TableCell className="font-medium" data-testid={`text-display-name-${a.id}`}>{a.displayName}</TableCell>
                        <TableCell><code className="text-xs">{a.slug}</code></TableCell>
                        <TableCell>
                          <Badge variant="outline" data-testid={`pill-role-${a.id}`}>{a.rolePreset}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" data-testid={`pill-lifecycle-${a.id}`}>{a.lifecycleState}</Badge>
                        </TableCell>
                        <TableCell>
                          <Link href={`/admin/3d-assets/${a.bodyAssetId}`}>
                            <code className="text-xs text-primary underline" data-testid={`link-body-asset-${a.id}`}>
                              {a.bodyAssetId.slice(0, 8)}…
                            </code>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/admin/3d-rigs/${a.rigId}`}>
                            <code className="text-xs text-primary underline" data-testid={`link-rig-${a.id}`}>
                              {a.rigId.slice(0, 8)}…
                            </code>
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(a.updatedAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Link href={`/admin/permanent-avatars/${a.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`link-permanent-avatar-detail-${a.id}`}
                            >
                              Open
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span data-testid="text-pagination-info">
                Showing {items.length === 0 ? 0 : offset + 1}–{offset + items.length} of {total}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0 || isFetching}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  data-testid="button-prev-page"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + items.length >= total || isFetching}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  data-testid="button-next-page"
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
