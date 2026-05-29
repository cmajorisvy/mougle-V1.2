import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  Box,
  EyeOff,
  Film,
  Lock,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MANIFESTS } from "@/components/production-house/virtual-sets/manifests";
import type {
  AssetSlotKind,
  ScenePackageManifest,
  SetType,
} from "@/components/production-house/virtual-sets/types";
import type { SlotBinding } from "@/components/production-house/virtual-sets/VirtualSet";

const VirtualSet = lazy(
  () => import("@/components/production-house/virtual-sets/VirtualSet"),
);

const SAFETY_BADGES: { label: string; icon: typeof ShieldCheck; testId: string }[] = [
  { label: "Admin preview only", icon: ShieldCheck, testId: "badge-admin-preview-only" },
  { label: "Static prototype", icon: Box, testId: "badge-static-prototype" },
  { label: "No data binding", icon: EyeOff, testId: "badge-no-data-binding" },
  { label: "No render", icon: Film, testId: "badge-no-render" },
  { label: "No publishing", icon: Send, testId: "badge-no-publishing" },
  { label: "No provider calls", icon: Server, testId: "badge-no-provider-calls" },
  { label: "Approved internal only", icon: Lock, testId: "badge-approved-internal-only" },
];

const SET_TYPE_OPTIONS: { value: SetType; label: string }[] = [
  { value: "newsroom", label: "Newsroom" },
  { value: "podcast_room", label: "Podcast room" },
  { value: "debate_room", label: "Debate room" },
];

interface ApprovedAsset {
  id: string;
  name: string;
  format: string;
  byteSize: number;
  metadata?: { slotKind?: AssetSlotKind } | null;
}

interface ApprovedListResponse {
  ok?: boolean;
  items?: ApprovedAsset[];
}

interface SignedUrlResponse {
  url?: string;
  expiresAt?: string;
}

function inferKindFromName(name: string): AssetSlotKind | null {
  const n = name.toLowerCase();
  const order: AssetSlotKind[] = [
    "anchor_stand",
    "mic_stand",
    "podium",
    "chair",
    "desk",
    "screen",
    "camera",
    "light",
    "prop",
  ];
  for (const k of order) {
    if (n.includes(k.replace("_", " ")) || n.includes(k)) return k;
  }
  return null;
}

function pickAssetForSlot(
  kind: AssetSlotKind,
  pool: ApprovedAsset[],
  usedIds: Set<string>,
): ApprovedAsset | null {
  for (const a of pool) {
    if (usedIds.has(a.id)) continue;
    const metaKind = a.metadata?.slotKind;
    if (metaKind && metaKind === kind) return a;
  }
  for (const a of pool) {
    if (usedIds.has(a.id)) continue;
    if (inferKindFromName(a.name) === kind) return a;
  }
  return null;
}

export default function VirtualSetPreview() {
  const [setType, setSetType] = useState<SetType>("newsroom");
  const manifest: ScenePackageManifest = MANIFESTS[setType];

  const [approvedAssets, setApprovedAssets] = useState<ApprovedAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  const [slotBindings, setSlotBindings] = useState<SlotBinding[]>([]);
  const [bindingsLoading, setBindingsLoading] = useState(false);
  const [bindingError, setBindingError] = useState<string | null>(null);

  const [slotErrors, setSlotErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let aborted = false;
    setAssetsLoading(true);
    setAssetsError(null);
    fetch(
      "/api/admin/production-assets?approvalGate=approved_internal&status=active&limit=50",
      { credentials: "include" },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ApprovedListResponse;
      })
      .then((data) => {
        if (aborted) return;
        const items: ApprovedAsset[] = Array.isArray(data?.items)
          ? data.items.map((a: any) => ({
              id: String(a.id),
              name: String(a.name ?? a.id),
              format: String(a.format ?? "glb"),
              byteSize: Number(a.byteSize ?? 0),
              metadata: a.metadata ?? null,
            }))
          : [];
        setApprovedAssets(items);
      })
      .catch((err: any) => {
        if (aborted) return;
        setAssetsError(err?.message ?? "Failed to load approved internal assets.");
      })
      .finally(() => {
        if (!aborted) setAssetsLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, []);

  useEffect(() => {
    setSlotBindings([]);
    setSlotErrors({});
    setBindingError(null);

    if (assetsLoading) return;

    let aborted = false;

    const buildBindings = async () => {
      setBindingsLoading(true);
      const used = new Set<string>();
      const pending: SlotBinding[] = [];

      for (const slot of manifest.assetSlots) {
        const pick = pickAssetForSlot(slot.kind, approvedAssets, used);
        if (!pick) {
          pending.push({
            slotId: slot.id,
            url: null,
            reason: "no approved asset",
          });
          continue;
        }
        used.add(pick.id);
        try {
          const r = await fetch(
            `/api/admin/production-assets/${encodeURIComponent(pick.id)}/signed-preview-url`,
            {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ttlSeconds: 900 }),
            },
          );
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = (await r.json()) as SignedUrlResponse;
          if (!data?.url) throw new Error("Missing signed URL.");
          pending.push({
            slotId: slot.id,
            url: data.url,
            reason: pick.name,
          });
        } catch (err: any) {
          pending.push({
            slotId: slot.id,
            url: null,
            reason: `sign failed: ${err?.message ?? "unknown"}`,
          });
          if (!aborted) {
            setBindingError(
              `Some slots fell back to placeholders (sign failed for ${pick.name}).`,
            );
          }
        }
        if (aborted) return;
      }

      if (!aborted) setSlotBindings(pending);
      setBindingsLoading(false);
    };

    if (approvedAssets.length === 0) {
      const empties: SlotBinding[] = manifest.assetSlots.map((s) => ({
        slotId: s.id,
        url: null,
        reason: "no approved asset",
      }));
      setSlotBindings(empties);
      setBindingsLoading(false);
      return () => {
        aborted = true;
      };
    }

    void buildBindings();
    return () => {
      aborted = true;
    };
  }, [setType, approvedAssets, assetsLoading, manifest]);

  const placeholderCount = useMemo(
    () => slotBindings.filter((b) => !b.url).length,
    [slotBindings],
  );

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      data-testid="page-virtual-set-preview"
    >
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href="/admin/dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back-to-dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to dashboard
            </Button>
          </Link>
          <Badge
            variant="outline"
            className="border-fuchsia-500/40 text-fuchsia-300"
            data-testid="badge-r6-phase"
          >
            R6B · Static virtual set
          </Badge>
        </div>

        <Card data-testid="card-virtual-set-header">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Sparkles className="h-5 w-5 text-fuchsia-400" />
                  Virtual Set Preview
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Admin-only static composer for newsroom, podcast, and debate sets.
                  Uses <strong>approved-internal</strong> 3D assets only via the R5H
                  signed-preview URL endpoint. No data binding, no render, no publishing.
                </p>
              </div>
              <Badge
                variant="outline"
                className="border-amber-500/40 text-amber-300"
                data-testid="badge-static-prototype-tag"
              >
                <ShieldAlert className="mr-1 h-3 w-3" />
                Static prototype
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2" data-testid="safety-badges">
              {SAFETY_BADGES.map(({ label, icon: Icon, testId }) => (
                <Badge
                  key={testId}
                  variant="outline"
                  className="border-emerald-500/40 text-emerald-300"
                  data-testid={testId}
                >
                  <Icon className="mr-1 h-3 w-3" />
                  {label}
                </Badge>
              ))}
            </div>

            <div
              className="mb-3 flex flex-wrap items-center gap-3 rounded border border-border bg-muted/20 px-3 py-2"
              data-testid="set-type-controls"
            >
              <Label htmlFor="select-set-type" className="text-sm">
                Set type
              </Label>
              <Select
                value={setType}
                onValueChange={(v) => setSetType(v as SetType)}
              >
                <SelectTrigger
                  id="select-set-type"
                  className="w-[220px]"
                  data-testid="select-set-type"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SET_TYPE_OPTIONS.map((o) => (
                    <SelectItem
                      key={o.value}
                      value={o.value}
                      data-testid={`option-set-type-${o.value}`}
                    >
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span
                className="text-[11px] text-muted-foreground"
                data-testid="text-manifest-title"
              >
                {manifest.title} · camera <code>{manifest.cameraPreset}</code> · lighting{" "}
                <code>{manifest.lightingPreset}</code>
              </span>
              {(assetsLoading || bindingsLoading) && (
                <span
                  className="text-[11px] text-muted-foreground"
                  data-testid="text-binding-status"
                >
                  Resolving approved-internal assets…
                </span>
              )}
              {!assetsLoading && !bindingsLoading && (
                <span
                  className="text-[11px] text-muted-foreground"
                  data-testid="text-placeholder-count"
                >
                  {placeholderCount === 0
                    ? "All slots bound."
                    : `${placeholderCount} of ${manifest.assetSlots.length} slot${manifest.assetSlots.length === 1 ? "" : "s"} fell back to placeholder.`}
                </span>
              )}
            </div>

            {assetsError && (
              <div
                className="mb-3 flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground"
                data-testid="assets-error"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Failed to load approved internal assets:</strong> {assetsError}
                </span>
              </div>
            )}

            {bindingError && (
              <div
                className="mb-3 flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
                data-testid="binding-error"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{bindingError}</span>
              </div>
            )}

            <Suspense
              fallback={
                <div
                  className="flex h-[540px] w-full items-center justify-center rounded border border-border bg-muted/30 text-sm text-muted-foreground"
                  data-testid="virtual-set-suspense"
                >
                  Loading virtual set canvas…
                </div>
              }
            >
              <VirtualSet
                manifest={manifest}
                slotBindings={slotBindings}
                onSlotError={(slotId, msg) =>
                  setSlotErrors((prev) => ({ ...prev, [slotId]: msg }))
                }
              />
            </Suspense>

            {Object.keys(slotErrors).length > 0 && (
              <div
                className="mt-3 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground"
                data-testid="slot-errors"
              >
                <strong>Slot errors:</strong>
                <ul className="ml-4 list-disc">
                  {Object.entries(slotErrors).map(([slotId, msg]) => (
                    <li key={slotId} data-testid={`slot-error-${slotId}`}>
                      <code>{slotId}</code>: {msg}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 grid gap-2 rounded border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
              <div data-testid="text-manifest-summary">
                <strong className="text-foreground">Manifest:</strong>{" "}
                {manifest.assetSlots.length} asset slot
                {manifest.assetSlots.length === 1 ? "" : "s"} ·{" "}
                {manifest.screenPanels.length} screen panel
                {manifest.screenPanels.length === 1 ? "" : "s"} · safety envelope locked.
              </div>
              <div data-testid="text-safety-note">
                <strong className="text-foreground">Safety envelope:</strong>{" "}
                adminOnly · staticPrototype · noDataBinding · noRender · noPublishing ·
                noProviderCalls. Signed URLs are held in component state only and dropped
                when the set type changes or the page unmounts.
              </div>
              <div data-testid="text-perf-notes">
                <strong className="text-foreground">Performance guard:</strong>{" "}
                lazy-loaded Canvas · DPR cap <code>[1, 1.5]</code> ·{" "}
                <code>frameloop=&quot;demand&quot;</code> · low-power GL preference ·
                WebGL availability fallback · per-slot Suspense + ErrorBoundary.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
