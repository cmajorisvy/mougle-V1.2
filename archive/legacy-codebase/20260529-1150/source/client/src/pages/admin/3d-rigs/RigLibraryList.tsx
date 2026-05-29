import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, PersonStanding, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { RigSafetyBadges } from "./safety-badges";
import R7bE2eCleanupPanel from "../3d-assets/R7bE2eCleanupPanel";

const PAGE_SIZE = 20;

type Rig = {
  id: string;
  name: string;
  format: string;
  byteSize: number;
  status: string;
  lifecycleState: string;
  licenseStatus: string;
  safetyReview: string;
  approvalGate: string;
  createdAt: string;
};

type ListResponse = {
  ok: boolean;
  items: Rig[];
  total: number;
  limit: number;
  offset: number;
};

const STATUS_OPTIONS = ["any", "draft", "active", "archived"] as const;
const SAFETY_OPTIONS = [
  "any",
  "pending",
  "approved_internal",
  "rejected",
  "needs_changes",
] as const;
const GATE_OPTIONS = ["any", "not_approved", "approved_internal"] as const;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function RigLibraryList() {
  const [status, setStatus] = useState<string>("any");
  const [safetyReview, setSafetyReview] = useState<string>("any");
  const [approvalGate, setApprovalGate] = useState<string>("any");
  const [offset, setOffset] = useState(0);

  const params = new URLSearchParams();
  if (status !== "any") params.set("status", status);
  if (safetyReview !== "any") params.set("safetyReview", safetyReview);
  if (approvalGate !== "any") params.set("approvalGate", approvalGate);
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));

  const url = `/api/admin/production-rigs?${params.toString()}`;

  const { data, isLoading, error, refetch, isFetching } = useQuery<ListResponse>({
    queryKey: [url],
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="page-3d-rigs-list">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href="/admin/dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back-to-dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to dashboard
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/admin/avatar-rig-preview">
              <Button variant="outline" size="sm" data-testid="link-rig-preview">
                Rig preview
              </Button>
            </Link>
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
            <Link href="/admin/3d-rigs/upload">
              <Button size="sm" data-testid="button-upload-new">
                <Plus className="mr-2 h-4 w-4" />
                Upload rig
              </Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <PersonStanding className="h-5 w-5 text-fuchsia-400" />
                  Avatar Rig Library
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Admin-only catalog of humanoid avatar rigs (GLB / GLTF). Private
                  storage, license + safety + approval lifecycle. No public URLs in
                  this phase. Signed preview URLs ≤ 15 min, never persisted.
                </p>
              </div>
              <Badge
                variant="outline"
                className="border-fuchsia-500/40 text-fuchsia-500"
                data-testid="badge-rig-phase"
              >
                Task #754 · Admin library
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <RigSafetyBadges />

            <R7bE2eCleanupPanel kind="rig" />

            <div className="mb-4 grid gap-3 sm:grid-cols-3" data-testid="filters">
              <div>
                <Label htmlFor="filter-status" className="text-xs">Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => {
                    setOffset(0);
                    setStatus(v);
                  }}
                >
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
                <Label htmlFor="filter-safety-review" className="text-xs">Safety review</Label>
                <Select
                  value={safetyReview}
                  onValueChange={(v) => {
                    setOffset(0);
                    setSafetyReview(v);
                  }}
                >
                  <SelectTrigger id="filter-safety-review" data-testid="filter-safety-review">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SAFETY_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s} data-testid={`filter-safety-review-option-${s}`}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="filter-approval-gate" className="text-xs">Approval gate</Label>
                <Select
                  value={approvalGate}
                  onValueChange={(v) => {
                    setOffset(0);
                    setApprovalGate(v);
                  }}
                >
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
            </div>

            {isLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground" data-testid="text-loading">
                Loading rigs…
              </div>
            ) : error ? (
              <div className="py-10 text-center text-sm text-destructive" data-testid="text-error">
                Failed to load rigs: {(error as Error).message}
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground" data-testid="text-empty">
                No rigs match the current filters.
              </div>
            ) : (
              <div className="overflow-x-auto rounded border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Format</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>License</TableHead>
                      <TableHead>Safety</TableHead>
                      <TableHead>Gate</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((a) => (
                      <TableRow key={a.id} data-testid={`row-rig-${a.id}`}>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell><code className="text-xs">{a.format}</code></TableCell>
                        <TableCell>{formatBytes(a.byteSize)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" data-testid={`pill-status-${a.id}`}>{a.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" data-testid={`pill-license-${a.id}`}>{a.licenseStatus}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" data-testid={`pill-safety-${a.id}`}>{a.safetyReview}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" data-testid={`pill-gate-${a.id}`}>{a.approvalGate}</Badge>
                        </TableCell>
                        <TableCell>
                          <Link href={`/admin/3d-rigs/${a.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`link-rig-detail-${a.id}`}
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
