import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Repeat, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PermanentAvatar, PermanentAvatarSafetyBadges } from "./shared";

type DetailResponse = { ok: boolean; permanentAvatar: PermanentAvatar };
type ApprovedRow = { id: string; name: string };
type ListResponse = { ok: boolean; items: ApprovedRow[] };

const ASSETS_URL =
  "/api/admin/production-assets?status=active&approvalGate=approved_internal&limit=200";
const RIGS_URL =
  "/api/admin/production-rigs?status=active&approvalGate=approved_internal&limit=200";

export default function PermanentAvatarRebind() {
  const [, params] = useRoute<{ id: string }>("/admin/permanent-avatars/:id/rebind");
  const id = params?.id ?? "";
  const [, navigate] = useLocation();
  const detailUrl = `/api/admin/permanent-avatars/${id}`;

  const { data: detailData, isLoading } = useQuery<DetailResponse>({
    queryKey: [detailUrl],
    enabled: !!id,
  });
  const { data: assetsData } = useQuery<ListResponse>({ queryKey: [ASSETS_URL] });
  const { data: rigsData } = useQuery<ListResponse>({ queryKey: [RIGS_URL] });

  const [bodyAssetId, setBodyAssetId] = useState<string>("");
  const [rigId, setRigId] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; reason?: string } | null>(null);

  useEffect(() => {
    if (detailData?.permanentAvatar) {
      setBodyAssetId(detailData.permanentAvatar.bodyAssetId);
      setRigId(detailData.permanentAvatar.rigId);
    }
  }, [detailData?.permanentAvatar]);

  async function submit() {
    if (!bodyAssetId || !rigId) {
      setError({ message: "Both body asset and rig are required." });
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await apiRequest(
        "POST",
        `/api/admin/permanent-avatars/${id}/rebind`,
        { bodyAssetId, rigId },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError({
          message: json?.message || `Rebind failed (HTTP ${res.status})`,
          reason: json?.reason || json?.error,
        });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: [detailUrl] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/permanent-avatars"] });
      navigate(`/admin/permanent-avatars/${id}`);
    } catch (err: any) {
      setError({ message: err?.message || "Rebind failed" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="page-permanent-avatars-rebind">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href={`/admin/permanent-avatars/${id}`}>
            <Button variant="ghost" size="sm" data-testid="button-back-to-detail">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to permanent avatar
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Repeat className="h-5 w-5 text-amber-400" />
              Rebind body asset and / or rig
            </CardTitle>
            {detailData?.permanentAvatar && (
              <p className="mt-1 text-sm text-muted-foreground" data-testid="text-current-binding">
                Current: body <code>{detailData.permanentAvatar.bodyAssetId.slice(0, 8)}…</code>{" "}
                · rig <code>{detailData.permanentAvatar.rigId.slice(0, 8)}…</code>
              </p>
            )}
          </CardHeader>
          <CardContent>
            <PermanentAvatarSafetyBadges />

            <div
              className="mb-4 flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
              data-testid="text-rebind-warning"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                Rebinding demotes this avatar to <code>composed</code>. Both identity and
                safety reviews are reset to <code>pending</code> and the approval gate is
                reset to <code>not_approved</code>. The avatar must be re-reviewed and
                re-approved before it can return to <code>approved_internal</code>.
              </span>
            </div>

            {error && (
              <div
                className="mb-4 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground"
                data-testid="text-rebind-error"
              >
                <strong>Failed:</strong> {error.message}
                {error.reason ? <> · <code>{error.reason}</code></> : null}
              </div>
            )}

            {isLoading ? (
              <div className="py-6 text-sm text-muted-foreground" data-testid="text-loading">Loading…</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="select-rebind-body-asset">Body asset (approved internal only)</Label>
                  <Select value={bodyAssetId} onValueChange={setBodyAssetId}>
                    <SelectTrigger id="select-rebind-body-asset" data-testid="select-rebind-body-asset">
                      <SelectValue placeholder="Choose body asset" />
                    </SelectTrigger>
                    <SelectContent>
                      {(assetsData?.items ?? []).map((a) => (
                        <SelectItem key={a.id} value={a.id} data-testid={`select-rebind-body-asset-option-${a.id}`}>
                          {a.name} · {a.id.slice(0, 8)}…
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="select-rebind-rig">Rig (approved internal only)</Label>
                  <Select value={rigId} onValueChange={setRigId}>
                    <SelectTrigger id="select-rebind-rig" data-testid="select-rebind-rig">
                      <SelectValue placeholder="Choose rig" />
                    </SelectTrigger>
                    <SelectContent>
                      {(rigsData?.items ?? []).map((r) => (
                        <SelectItem key={r.id} value={r.id} data-testid={`select-rebind-rig-option-${r.id}`}>
                          {r.name} · {r.id.slice(0, 8)}…
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={submit} disabled={pending} data-testid="button-submit-rebind">
                  <Repeat className="mr-2 h-4 w-4" />
                  {pending ? "Rebinding…" : "Rebind and reset reviews"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
