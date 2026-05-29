import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  Box,
  EyeOff,
  Film,
  Lock,
  PersonStanding,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  Cpu,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import type { RigInfo } from "@/components/production-house/r3f/AvatarRigCanvas";

const VirtualSet = lazy(
  () => import("@/components/production-house/virtual-sets/VirtualSet"),
);
const AvatarRigCanvas = lazy(
  () => import("@/components/production-house/r3f/AvatarRigCanvas"),
);

const SAFETY_BADGES: { label: string; icon: typeof ShieldCheck; testId: string }[] = [
  { label: "Admin only", icon: ShieldCheck, testId: "badge-pkg3d-admin-only" },
  { label: "Read-only", icon: EyeOff, testId: "badge-pkg3d-read-only" },
  { label: "No render", icon: Film, testId: "badge-pkg3d-no-render" },
  { label: "No publishing", icon: Send, testId: "badge-pkg3d-no-publishing" },
  { label: "No provider calls", icon: Server, testId: "badge-pkg3d-no-provider-calls" },
  { label: "Approved internal only", icon: Lock, testId: "badge-pkg3d-approved-internal-only" },
  { label: "No Unreal execution", icon: Cpu, testId: "badge-pkg3d-no-unreal" },
  { label: "No 4D hardware", icon: Sparkles, testId: "badge-pkg3d-no-4d" },
];

const SET_TYPE_OPTIONS: { value: SetType; label: string }[] = [
  { value: "newsroom", label: "Newsroom" },
  { value: "podcast_room", label: "Podcast room" },
  { value: "debate_room", label: "Debate room" },
];

function defaultSetForPackageType(packageType?: string | null): SetType {
  switch ((packageType ?? "").toLowerCase()) {
    case "podcast_to_clips":
    case "news_to_podcast":
    case "podcast_video":
      return "podcast_room";
    case "debate_to_clips":
    case "news_to_debate":
    case "debate_video":
      return "debate_room";
    default:
      return "newsroom";
  }
}

function coerceSetType(v: unknown): SetType | null {
  if (typeof v !== "string") return null;
  const lc = v.toLowerCase();
  if (lc === "newsroom" || lc === "podcast_room" || lc === "debate_room") {
    return lc as SetType;
  }
  return null;
}

interface MediaPackageRowLite {
  packageId: string;
  packageType?: string | null;
  setManifestId?: string | null;
  rigAssetId?: string | null;
  createdAt?: string | null;
}

function listMediaPackageRows(pkg: any): MediaPackageRowLite[] {
  if (!pkg) return [];
  const raw = Array.isArray(pkg.mediaPackages) ? pkg.mediaPackages : [];
  const out: MediaPackageRowLite[] = [];
  for (const m of raw) {
    const id = m?.packageId;
    if (typeof id !== "string" || id.length === 0) continue;
    out.push({
      packageId: id,
      packageType: typeof m?.packageType === "string" ? m.packageType : null,
      setManifestId:
        typeof m?.setManifestId === "string" ? m.setManifestId : null,
      rigAssetId: typeof m?.rigAssetId === "string" ? m.rigAssetId : null,
      createdAt: typeof m?.createdAt === "string" ? m.createdAt : null,
    });
  }
  return out;
}

function findMediaPackageRow(
  pkg: any,
  packageId: string | null,
): MediaPackageRowLite | null {
  if (!packageId) return null;
  for (const m of listMediaPackageRows(pkg)) {
    if (m.packageId === packageId) return m;
  }
  return null;
}

function readRowSetRef(
  pkg: any,
  row: MediaPackageRowLite | null,
): SetType | null {
  return (
    coerceSetType(row?.setManifestId ?? null) ||
    coerceSetType(pkg?.setManifestId) ||
    coerceSetType(pkg?.setType) ||
    coerceSetType(pkg?.preview3d?.setManifestId) ||
    coerceSetType(pkg?.metadata?.setManifestId) ||
    coerceSetType(pkg?.package?.setManifestId) ||
    coerceSetType(pkg?.package?.roomRecommendation) ||
    coerceSetType(pkg?.roomRecommendation)
  );
}

function readRowRigRef(
  pkg: any,
  row: MediaPackageRowLite | null,
): string | null {
  const candidates: unknown[] = [
    row?.rigAssetId ?? null,
    pkg?.rigAssetId,
    pkg?.avatarRigId,
    pkg?.preview3d?.rigAssetId,
    pkg?.metadata?.rigAssetId,
    pkg?.package?.rigAssetId,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}

const R7_DEMO_RIG_REF = "r7_demo_rig:avatar-rig-demo.glb";

interface ApprovedAsset {
  id: string;
  name: string;
  format: string;
  byteSize: number;
  metadata?: { slotKind?: AssetSlotKind; assetKind?: "rig" | "set_prop" } | null;
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

interface Props {
  productionId: string;
  packageType?: string | null;
  pkg?: any;
}

export default function Package3DPreviewSection({ productionId, packageType, pkg }: Props) {
  const mediaPackageRows = useMemo(() => listMediaPackageRows(pkg), [pkg]);

  const [targetPackageId, setTargetPackageId] = useState<string | null>(
    () => mediaPackageRows[0]?.packageId ?? null,
  );

  // Keep selection valid as pkg changes; preserve current pick if still present.
  useEffect(() => {
    if (mediaPackageRows.length === 0) {
      setTargetPackageId(null);
      return;
    }
    setTargetPackageId((prev) => {
      if (prev && mediaPackageRows.some((m) => m.packageId === prev)) {
        return prev;
      }
      return mediaPackageRows[0].packageId;
    });
  }, [mediaPackageRows]);

  const targetRow = useMemo(
    () => findMediaPackageRow(pkg, targetPackageId),
    [pkg, targetPackageId],
  );

  // savedSetRef / savedRigRef mirror what is persisted on the chosen row.
  const [savedSetRef, setSavedSetRef] = useState<SetType | null>(() =>
    readRowSetRef(pkg, findMediaPackageRow(pkg, mediaPackageRows[0]?.packageId ?? null)),
  );
  const [savedRigRef, setSavedRigRef] = useState<string | null>(() =>
    readRowRigRef(pkg, findMediaPackageRow(pkg, mediaPackageRows[0]?.packageId ?? null)),
  );

  useEffect(() => {
    setSavedSetRef(readRowSetRef(pkg, targetRow));
    setSavedRigRef(readRowRigRef(pkg, targetRow));
  }, [pkg, targetRow]);

  const packageSetRef = savedSetRef;
  const packageRigRef = savedRigRef;

  const defaultSet = useMemo(
    () => packageSetRef ?? defaultSetForPackageType(packageType),
    [packageSetRef, packageType],
  );

  const [setChosen, setSetChosen] = useState<boolean>(Boolean(packageSetRef));
  const [setType, setSetType] = useState<SetType>(defaultSet);
  const [rigChosen, setRigChosen] = useState<boolean>(Boolean(packageRigRef));

  // pendingRigValue is initialized to the saved rig and only mutated by
  // explicit user actions ("Load R7 visual stand-in" or "Clear rig"). This
  // prevents toggling the preview canvas from silently overwriting a real
  // rig id with the demo placeholder on save.
  const [pendingRigValue, setPendingRigValue] = useState<string | null>(
    () => packageRigRef ?? null,
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  useEffect(() => {
    setSetType(defaultSet);
    setSetChosen(Boolean(packageSetRef));
  }, [defaultSet, packageSetRef]);

  useEffect(() => {
    setRigChosen(Boolean(packageRigRef));
    setPendingRigValue(packageRigRef ?? null);
    setSaveError(null);
    setSaveOk(null);
  }, [packageRigRef, targetPackageId]);

  const pendingSetValue: string | null = setChosen ? setType : null;

  const dirty =
    Boolean(targetPackageId) &&
    (pendingSetValue !== (packageSetRef ?? null) ||
      pendingRigValue !== (packageRigRef ?? null));

  async function handleSaveSelection() {
    if (!targetPackageId) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(null);
    try {
      const r = await fetch(
        `/api/admin/production-house/media-pipeline/packages/${encodeURIComponent(targetPackageId)}/3d-selection`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            setManifestId: pendingSetValue,
            rigAssetId: pendingRigValue,
          }),
        },
      );
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`HTTP ${r.status}${txt ? `: ${txt.slice(0, 200)}` : ""}`);
      }
      const data = (await r.json()) as {
        ok?: boolean;
        package?: { setManifestId?: string | null; rigAssetId?: string | null };
      };
      const newSet = coerceSetType(data?.package?.setManifestId ?? null);
      const newRig =
        typeof data?.package?.rigAssetId === "string"
          ? data.package!.rigAssetId
          : null;
      setSavedSetRef(newSet);
      setSavedRigRef(newRig);
      setPendingRigValue(newRig);
      setSaveOk("Selection saved to package row.");
    } catch (err: any) {
      setSaveError(err?.message ?? "Failed to save selection.");
    } finally {
      setSaving(false);
    }
  }

  const manifest: ScenePackageManifest = MANIFESTS[setType];

  const [approvedAssets, setApprovedAssets] = useState<ApprovedAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  const [slotBindings, setSlotBindings] = useState<SlotBinding[]>([]);
  const [bindingsLoading, setBindingsLoading] = useState(false);
  const [bindingError, setBindingError] = useState<string | null>(null);

  const [rigInfo, setRigInfo] = useState<RigInfo | null>(null);
  const [rigError, setRigError] = useState<string | null>(null);

  // Approved-internal rig catalog (analogous to R5C set props, filtered to
  // metadata.assetKind === "rig").
  const [rigAssets, setRigAssets] = useState<ApprovedAsset[]>([]);
  const [rigsLoading, setRigsLoading] = useState(false);
  const [rigsError, setRigsError] = useState<string | null>(null);
  const [pickerRigId, setPickerRigId] = useState<string>("");
  const [rigSignedUrl, setRigSignedUrl] = useState<string | null>(null);
  const [rigSignedExpiresAt, setRigSignedExpiresAt] = useState<string | null>(null);
  const [rigSigning, setRigSigning] = useState(false);

  // Inline preview state — lets admins render the picker's currently-selected
  // rig in a small canvas WITHOUT committing it to pendingRigValue / rigChosen.
  // Signed URLs here are component-local and disappear when the picker changes
  // or the component unmounts.
  const [previewRigId, setPreviewRigId] = useState<string | null>(null);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);
  const [previewExpiresAt, setPreviewExpiresAt] = useState<string | null>(null);
  const [previewSigning, setPreviewSigning] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRigInfo, setPreviewRigInfo] = useState<RigInfo | null>(null);

  useEffect(() => {
    let aborted = false;
    setRigsLoading(true);
    setRigsError(null);
    fetch(
      "/api/admin/production-assets?approvalGate=approved_internal&status=active&assetKind=rig&limit=50",
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
        setRigAssets(items);
      })
      .catch((err: any) => {
        if (aborted) return;
        setRigsError(err?.message ?? "Failed to load approved-internal rigs.");
      })
      .finally(() => {
        if (!aborted) setRigsLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, []);

  // When the saved rig changes (e.g., after Save or row switch), default the
  // picker selection to it when the catalog contains it.
  useEffect(() => {
    if (packageRigRef && rigAssets.some((a) => a.id === packageRigRef)) {
      setPickerRigId(packageRigRef);
    } else if (!pickerRigId && rigAssets.length > 0) {
      setPickerRigId(rigAssets[0].id);
    }
    // Loading a new rig invalidates any signed URL we held.
    setRigSignedUrl(null);
    setRigSignedExpiresAt(null);
  }, [packageRigRef, rigAssets]);

  // Changing the picker selection invalidates any inline preview we held.
  useEffect(() => {
    if (previewRigId && pickerRigId !== previewRigId) {
      setPreviewSignedUrl(null);
      setPreviewExpiresAt(null);
      setPreviewError(null);
      setPreviewRigInfo(null);
      setPreviewRigId(null);
    }
  }, [pickerRigId, previewRigId]);

  async function previewPickerRig() {
    if (!pickerRigId) return;
    setPreviewSigning(true);
    setPreviewError(null);
    try {
      const r = await fetch(
        `/api/admin/production-assets/${encodeURIComponent(pickerRigId)}/signed-preview-url`,
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
      setPreviewSignedUrl(data.url);
      setPreviewExpiresAt(data.expiresAt ?? null);
      setPreviewRigId(pickerRigId);
      setPreviewRigInfo(null);
    } catch (err: any) {
      setPreviewError(err?.message ?? "Failed to issue signed preview URL.");
    } finally {
      setPreviewSigning(false);
    }
  }

  function clearInlinePreview() {
    setPreviewSignedUrl(null);
    setPreviewExpiresAt(null);
    setPreviewError(null);
    setPreviewRigInfo(null);
    setPreviewRigId(null);
  }

  async function loadPickerRig() {
    if (!pickerRigId) return;
    setRigSigning(true);
    setRigError(null);
    setRigsError(null);
    try {
      const r = await fetch(
        `/api/admin/production-assets/${encodeURIComponent(pickerRigId)}/signed-preview-url`,
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
      setRigSignedUrl(data.url);
      setRigSignedExpiresAt(data.expiresAt ?? null);
      setPendingRigValue(pickerRigId);
      setRigChosen(true);
    } catch (err: any) {
      setRigsError(err?.message ?? "Failed to issue signed rig URL.");
    } finally {
      setRigSigning(false);
    }
  }

  const pickerRigMeta = useMemo(
    () => rigAssets.find((a) => a.id === pickerRigId) ?? null,
    [rigAssets, pickerRigId],
  );

  const activeRigMeta = useMemo(
    () => rigAssets.find((a) => a.id === pendingRigValue) ?? null,
    [rigAssets, pendingRigValue],
  );

  const isDemoStandIn = pendingRigValue === R7_DEMO_RIG_REF;

  useEffect(() => {
    if (!setChosen) return;
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
  }, [setChosen]);

  useEffect(() => {
    if (!setChosen) return;
    setSlotBindings([]);
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
          pending.push({ slotId: slot.id, url: null, reason: "no approved asset" });
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
          pending.push({ slotId: slot.id, url: data.url, reason: pick.name });
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
  }, [setChosen, setType, approvedAssets, assetsLoading, manifest]);

  const placeholderCount = useMemo(
    () => slotBindings.filter((b) => !b.url).length,
    [slotBindings],
  );

  return (
    <div
      className="rounded border border-border p-4 space-y-4"
      data-testid="section-package-3d-preview"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-fuchsia-400" />
            3D Preview (read-only)
          </div>
          <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
            Admin-only R3F preview of the package's set and avatar rig. Reuses the
            R3F sandbox safety envelope. No render execution, no publishing,
            no provider calls. The package row is not edited by this preview.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Production ID: <code data-testid="text-pkg3d-production-id">{productionId}</code>
            {packageType ? (
              <>
                {" "}· Package type: <code data-testid="text-pkg3d-package-type">{packageType}</code>
              </>
            ) : null}
          </p>
          <p className="mt-1 text-[11px]">
            <span
              className={packageSetRef ? "text-emerald-400" : "text-muted-foreground"}
              data-testid="text-pkg3d-set-ref-status"
            >
              Package set ref: {packageSetRef ?? "none on row (schema delta deferred)"}
            </span>
            {"  ·  "}
            <span
              className={packageRigRef ? "text-emerald-400" : "text-muted-foreground"}
              data-testid="text-pkg3d-rig-ref-status"
            >
              Package rig ref: {packageRigRef ?? "none on row (schema delta deferred)"}
            </span>
          </p>
        </div>
        <Link href="/admin/3d-assets">
          <Button variant="outline" size="sm" data-testid="button-pkg3d-browse-assets">
            Browse approved internal assets
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="pkg3d-safety-badges">
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

      {/* SET preview */}
      <div className="rounded border border-border bg-muted/10 p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium flex items-center gap-2">
            <Box className="h-4 w-4 text-fuchsia-400" /> Virtual set
          </div>
          {setChosen && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSetChosen(false)}
              data-testid="button-pkg3d-clear-set"
            >
              Clear set
            </Button>
          )}
        </div>
        {!setChosen ? (
          <div
            className="flex flex-col items-start gap-3 rounded border border-dashed border-border/60 p-4"
            data-testid="empty-state-pkg3d-set"
          >
            <div className="text-sm">
              <strong>No set selected for this package.</strong>
              <div className="text-xs text-muted-foreground mt-1">
                The Production House package row does not yet carry a set reference
                (schema delta is a separate gated task). Choose a set to preview here,
                or open the virtual set picker.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="pkg3d-set-type-empty" className="text-xs">
                Set type
              </Label>
              <Select value={setType} onValueChange={(v) => setSetType(v as SetType)}>
                <SelectTrigger
                  id="pkg3d-set-type-empty"
                  className="w-[200px]"
                  data-testid="select-pkg3d-set-type-empty"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SET_TYPE_OPTIONS.map((o) => (
                    <SelectItem
                      key={o.value}
                      value={o.value}
                      data-testid={`option-pkg3d-set-type-empty-${o.value}`}
                    >
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => setSetChosen(true)}
                data-testid="button-pkg3d-choose-set"
              >
                Choose set
              </Button>
              <Link href="/admin/virtual-set-preview">
                <Button variant="outline" size="sm" data-testid="link-pkg3d-open-set-picker">
                  Open set picker
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div
              className="flex flex-wrap items-center gap-3 rounded border border-border bg-muted/20 px-3 py-2"
              data-testid="pkg3d-set-controls"
            >
              <Label htmlFor="pkg3d-set-type" className="text-xs">
                Set type
              </Label>
              <Select value={setType} onValueChange={(v) => setSetType(v as SetType)}>
                <SelectTrigger
                  id="pkg3d-set-type"
                  className="w-[200px]"
                  data-testid="select-pkg3d-set-type"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SET_TYPE_OPTIONS.map((o) => (
                    <SelectItem
                      key={o.value}
                      value={o.value}
                      data-testid={`option-pkg3d-set-type-${o.value}`}
                    >
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[11px] text-muted-foreground" data-testid="text-pkg3d-manifest-title">
                {manifest.title} · camera <code>{manifest.cameraPreset}</code> · lighting{" "}
                <code>{manifest.lightingPreset}</code>
              </span>
              {(assetsLoading || bindingsLoading) && (
                <span className="text-[11px] text-muted-foreground" data-testid="text-pkg3d-binding-status">
                  Resolving approved-internal assets…
                </span>
              )}
              {!assetsLoading && !bindingsLoading && slotBindings.length > 0 && (
                <span className="text-[11px] text-muted-foreground" data-testid="text-pkg3d-placeholder-count">
                  {placeholderCount === 0
                    ? "All slots bound."
                    : `${placeholderCount} of ${manifest.assetSlots.length} slot${manifest.assetSlots.length === 1 ? "" : "s"} fell back to placeholder.`}
                </span>
              )}
            </div>

            {assetsError && (
              <div
                className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground"
                data-testid="pkg3d-assets-error"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Failed to load approved internal assets:</strong> {assetsError}
                </span>
              </div>
            )}

            {bindingError && (
              <div
                className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
                data-testid="pkg3d-binding-error"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{bindingError}</span>
              </div>
            )}

            <Suspense
              fallback={
                <div
                  className="flex h-[400px] w-full items-center justify-center rounded border border-border bg-muted/30 text-sm text-muted-foreground"
                  data-testid="pkg3d-set-suspense"
                >
                  Loading virtual set canvas…
                </div>
              }
            >
              <VirtualSet manifest={manifest} slotBindings={slotBindings} />
            </Suspense>

            {slotBindings.length > 0 && (
              <div
                className="rounded border border-border bg-muted/10 p-2 text-[11px]"
                data-testid="pkg3d-set-binding-list"
              >
                <div className="font-semibold mb-1">
                  Bound slots (approved-internal assets only)
                </div>
                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {slotBindings.map((b) => (
                    <li
                      key={b.slotId}
                      className={
                        b.url
                          ? "font-mono truncate text-emerald-300"
                          : "font-mono truncate text-muted-foreground"
                      }
                      data-testid={`pkg3d-set-binding-${b.slotId}`}
                    >
                      {b.slotId}: {b.url ? `bound · ${b.reason}` : `placeholder · ${b.reason}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {/* RIG preview */}
      <div className="rounded border border-border bg-muted/10 p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium flex items-center gap-2">
            <PersonStanding className="h-4 w-4 text-fuchsia-400" /> Avatar rig
          </div>
          {rigChosen ? (
            <div className="flex items-center gap-2">
              <Label htmlFor="pkg3d-rig-toggle" className="text-xs">
                Show rig
              </Label>
              <Switch
                id="pkg3d-rig-toggle"
                checked={rigChosen}
                onCheckedChange={(v) => setRigChosen(Boolean(v))}
                data-testid="switch-pkg3d-rig"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRigChosen(false);
                  setPendingRigValue(null);
                }}
                data-testid="button-pkg3d-clear-rig"
              >
                Clear rig
              </Button>
            </div>
          ) : null}
        </div>
        {!rigChosen ? (
          <div
            className="flex flex-col items-start gap-3 rounded border border-dashed border-border/60 p-4"
            data-testid="empty-state-pkg3d-rig"
          >
            <div className="text-sm">
              <strong>No avatar rig selected for this package.</strong>
              <div className="text-xs text-muted-foreground mt-1" data-testid="text-pkg3d-rig-catalog-info">
                Pick an <code>approved_internal</code> rig from the 3D asset
                library (filtered to <code>assetKind=rig</code>). Saving writes
                the picked rig's real asset id onto the media package row.
              </div>
            </div>
            {rigsError && (
              <div
                className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground"
                data-testid="pkg3d-rigs-error"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{rigsError}</span>
              </div>
            )}
            {rigsLoading ? (
              <div className="text-xs text-muted-foreground" data-testid="text-pkg3d-rigs-loading">
                Loading approved-internal rigs…
              </div>
            ) : rigAssets.length === 0 ? (
              <div className="text-xs text-muted-foreground" data-testid="text-pkg3d-rigs-empty">
                No approved-internal rigs in the catalog yet. Upload a GLB/GLTF
                in <Link href="/admin/3d-assets/upload"><span className="underline">3D asset upload</span></Link>{" "}
                with <code>assetKind=rig</code>, then advance it through safety
                review and approval.
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="pkg3d-rig-picker" className="text-xs">
                  Rig
                </Label>
                <Select value={pickerRigId} onValueChange={setPickerRigId}>
                  <SelectTrigger
                    id="pkg3d-rig-picker"
                    className="w-[260px]"
                    data-testid="select-pkg3d-rig-picker"
                  >
                    <SelectValue placeholder="Pick an approved rig" />
                  </SelectTrigger>
                  <SelectContent>
                    {rigAssets.map((a) => (
                      <SelectItem
                        key={a.id}
                        value={a.id}
                        data-testid={`option-pkg3d-rig-picker-${a.id}`}
                      >
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={previewPickerRig}
                  disabled={!pickerRigId || previewSigning}
                  data-testid="button-pkg3d-preview-rig"
                >
                  {previewSigning ? "Loading preview…" : "Preview"}
                </Button>
                <Button
                  size="sm"
                  onClick={loadPickerRig}
                  disabled={!pickerRigId || rigSigning}
                  data-testid="button-pkg3d-choose-rig"
                >
                  {rigSigning ? "Loading rig…" : "Load rig"}
                </Button>
                <Link href="/admin/avatar-rig-preview">
                  <Button variant="outline" size="sm" data-testid="link-pkg3d-open-rig-picker">
                    Open rig picker
                  </Button>
                </Link>
              </div>
            )}
            <InlineRigPreview
              previewRigId={previewRigId}
              previewSignedUrl={previewSignedUrl}
              previewExpiresAt={previewExpiresAt}
              previewError={previewError}
              previewRigInfo={previewRigInfo}
              setPreviewRigInfo={setPreviewRigInfo}
              setPreviewError={setPreviewError}
              clearInlinePreview={clearInlinePreview}
              rigAssets={rigAssets}
              testIdSuffix="empty"
            />
          </div>
        ) : (
          <>
            <div
              className="flex flex-wrap items-center gap-3 rounded border border-border bg-muted/20 px-3 py-2 text-[11px]"
              data-testid="pkg3d-rig-controls"
            >
              <Label htmlFor="pkg3d-rig-picker-active" className="text-xs">
                Rig
              </Label>
              <Select
                value={pickerRigId}
                onValueChange={setPickerRigId}
                disabled={rigAssets.length === 0 || isDemoStandIn}
              >
                <SelectTrigger
                  id="pkg3d-rig-picker-active"
                  className="w-[260px]"
                  data-testid="select-pkg3d-rig-picker-active"
                >
                  <SelectValue
                    placeholder={
                      rigAssets.length === 0
                        ? "No approved rigs"
                        : "Pick an approved rig"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {rigAssets.map((a) => (
                    <SelectItem
                      key={a.id}
                      value={a.id}
                      data-testid={`option-pkg3d-rig-picker-active-${a.id}`}
                    >
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={previewPickerRig}
                disabled={!pickerRigId || previewSigning || isDemoStandIn}
                data-testid="button-pkg3d-preview-rig-active"
              >
                {previewSigning ? "Loading preview…" : "Preview"}
              </Button>
              <Button
                size="sm"
                onClick={loadPickerRig}
                disabled={!pickerRigId || rigSigning || isDemoStandIn}
                data-testid="button-pkg3d-load-rig-active"
              >
                {rigSigning ? "Loading…" : "Load selected rig"}
              </Button>
              <span className="text-muted-foreground" data-testid="text-pkg3d-rig-active-meta">
                {isDemoStandIn
                  ? "Active: R7 demo stand-in"
                  : activeRigMeta
                    ? `Active: ${activeRigMeta.name} (id ${activeRigMeta.id})`
                    : pendingRigValue
                      ? `Active id: ${pendingRigValue} (not in current catalog)`
                      : "Active: none"}
              </span>
              {rigSignedExpiresAt && !isDemoStandIn && (
                <span className="text-muted-foreground" data-testid="text-pkg3d-rig-signed-expires">
                  Signed URL expires {new Date(rigSignedExpiresAt).toLocaleTimeString()}
                </span>
              )}
            </div>
            <InlineRigPreview
              previewRigId={previewRigId}
              previewSignedUrl={previewSignedUrl}
              previewExpiresAt={previewExpiresAt}
              previewError={previewError}
              previewRigInfo={previewRigInfo}
              setPreviewRigInfo={setPreviewRigInfo}
              setPreviewError={setPreviewError}
              clearInlinePreview={clearInlinePreview}
              rigAssets={rigAssets}
              testIdSuffix="active"
            />
            {isDemoStandIn && (
              <div
                className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200"
                data-testid="pkg3d-rig-standin-notice"
              >
                <strong>Visual stand-in (legacy):</strong> the R7 demo rig
                placeholder (<code>{R7_DEMO_RIG_REF}</code>) is selected on this
                row. Pick a real approved-internal rig above and Save selection
                to replace it.
              </div>
            )}
            {rigsError && (
              <div
                className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground"
                data-testid="pkg3d-rigs-error-active"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{rigsError}</span>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 rounded border border-border bg-muted/20 px-3 py-2 text-xs sm:grid-cols-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Rig name
                </Label>
                <div className="mt-1 font-medium" data-testid="text-pkg3d-rig-name">
                  {rigInfo?.rigName ?? "—"}
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Joint count
                </Label>
                <div className="mt-1 font-medium" data-testid="text-pkg3d-rig-joints">
                  {rigInfo ? `${rigInfo.jointCount} joints` : "—"}
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Root joint
                </Label>
                <div className="mt-1 font-medium" data-testid="text-pkg3d-rig-root">
                  {rigInfo?.rootJointName ?? "—"}
                </div>
              </div>
            </div>

            {rigError && (
              <div
                className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground"
                data-testid="pkg3d-rig-error"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>Avatar rig failed to load:</strong> {rigError}
                </span>
              </div>
            )}

            <Suspense
              fallback={
                <div
                  className="flex h-[400px] w-full items-center justify-center rounded border border-border bg-muted/30 text-sm text-muted-foreground"
                  data-testid="pkg3d-rig-suspense"
                >
                  Loading rig canvas…
                </div>
              }
            >
              <AvatarRigCanvas
                pose="t_pose"
                url={isDemoStandIn ? undefined : rigSignedUrl ?? undefined}
                onRigInfo={(info) => {
                  setRigInfo(info);
                  setRigError(null);
                }}
                onRigError={(msg) => setRigError(msg)}
              />
            </Suspense>
          </>
        )}
      </div>

      <div
        className="rounded border border-border bg-muted/10 p-3 space-y-2"
        data-testid="pkg3d-save-selection"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">Save selection to package row</div>
          <div className="flex flex-wrap items-center gap-2">
            {mediaPackageRows.length > 1 ? (
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="pkg3d-target-package"
                  className="text-[11px] text-muted-foreground"
                >
                  Target package
                </Label>
                <Select
                  value={targetPackageId ?? ""}
                  onValueChange={(v) => setTargetPackageId(v || null)}
                >
                  <SelectTrigger
                    id="pkg3d-target-package"
                    className="w-[280px]"
                    data-testid="select-pkg3d-target-package"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {mediaPackageRows.map((m) => (
                      <SelectItem
                        key={m.packageId}
                        value={m.packageId}
                        data-testid={`option-pkg3d-target-package-${m.packageId}`}
                      >
                        {m.packageType ? `${m.packageType} · ` : ""}
                        {m.packageId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <span
                className="text-[11px] text-muted-foreground"
                data-testid="text-pkg3d-target-package-id"
              >
                {targetPackageId
                  ? `Target package: ${targetPackageId}`
                  : "No media package row on this production (nothing to save)."}
              </span>
            )}
            <Button
              size="sm"
              onClick={handleSaveSelection}
              disabled={!targetPackageId || saving || !dirty}
              data-testid="button-pkg3d-save-selection"
            >
              {saving ? "Saving…" : "Save selection"}
            </Button>
          </div>
        </div>
        {mediaPackageRows.length > 1 && targetPackageId && (
          <div
            className="text-[11px] text-muted-foreground"
            data-testid="text-pkg3d-target-package-id-multi"
          >
            Target package: {targetPackageId}
          </div>
        )}
        <div className="text-[11px] text-muted-foreground">
          Saves <code>setManifestId</code> ={" "}
          <code data-testid="text-pkg3d-pending-set">
            {pendingSetValue ?? "null"}
          </code>{" "}
          and <code>rigAssetId</code> ={" "}
          <code data-testid="text-pkg3d-pending-rig">
            {pendingRigValue ?? "null"}
          </code>{" "}
          on the package row. Still admin-only / internal, no public URLs.
        </div>
        {saveError && (
          <div
            className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground"
            data-testid="pkg3d-save-error"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}
        {saveOk && (
          <div
            className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-200"
            data-testid="pkg3d-save-ok"
          >
            {saveOk}
          </div>
        )}
      </div>

      <div className="text-[11px] text-muted-foreground">
        R9 integration. Signed asset URLs are held in component state only
        (TTL ≤ 15 min) and dropped on unmount or when the set changes. The
        Save selection action writes only <code>setManifestId</code> and{" "}
        <code>rigAssetId</code> on the media package row; no other fields and
        no rendering, publishing, or provider calls.
      </div>
    </div>
  );
}

interface InlineRigPreviewProps {
  previewRigId: string | null;
  previewSignedUrl: string | null;
  previewExpiresAt: string | null;
  previewError: string | null;
  previewRigInfo: RigInfo | null;
  setPreviewRigInfo: (info: RigInfo) => void;
  setPreviewError: (msg: string) => void;
  clearInlinePreview: () => void;
  rigAssets: ApprovedAsset[];
  testIdSuffix: string;
}

function InlineRigPreview({
  previewRigId,
  previewSignedUrl,
  previewExpiresAt,
  previewError,
  previewRigInfo,
  setPreviewRigInfo,
  setPreviewError,
  clearInlinePreview,
  rigAssets,
  testIdSuffix,
}: InlineRigPreviewProps) {
  if (!previewSignedUrl && !previewError) return null;
  const meta = previewRigId
    ? rigAssets.find((a) => a.id === previewRigId) ?? null
    : null;
  return (
    <div
      className="rounded border border-fuchsia-500/40 bg-fuchsia-500/5 p-3 space-y-2"
      data-testid={`pkg3d-rig-inline-preview-${testIdSuffix}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-medium text-fuchsia-300">
          Inline preview (not saved)
          {meta ? (
            <>
              {" · "}
              <code data-testid={`text-pkg3d-rig-inline-preview-name-${testIdSuffix}`}>
                {meta.name}
              </code>
            </>
          ) : previewRigId ? (
            <>
              {" · "}
              <code>{previewRigId}</code>
            </>
          ) : null}
          {previewExpiresAt && (
            <span className="ml-2 text-muted-foreground">
              Signed URL expires {new Date(previewExpiresAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearInlinePreview}
          data-testid={`button-pkg3d-clear-rig-inline-preview-${testIdSuffix}`}
        >
          Clear preview
        </Button>
      </div>
      {previewError && (
        <div
          className="flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground"
          data-testid={`pkg3d-rig-inline-preview-error-${testIdSuffix}`}
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{previewError}</span>
        </div>
      )}
      {previewSignedUrl && (
        <>
          <Suspense
            fallback={
              <div
                className="flex h-[200px] w-full items-center justify-center rounded border border-border bg-muted/30 text-xs text-muted-foreground"
                data-testid={`pkg3d-rig-inline-preview-suspense-${testIdSuffix}`}
              >
                Loading preview canvas…
              </div>
            }
          >
            <AvatarRigCanvas
              pose="t_pose"
              url={previewSignedUrl}
              heightClass="h-[220px]"
              testIdSuffix={`pkg3d-inline-${testIdSuffix}`}
              onRigInfo={(info) => {
                setPreviewRigInfo(info);
                setPreviewError("");
              }}
              onRigError={(msg) => setPreviewError(msg)}
            />
          </Suspense>
          <div
            className="text-[10px] text-muted-foreground"
            data-testid={`text-pkg3d-rig-inline-preview-meta-${testIdSuffix}`}
          >
            {previewRigInfo
              ? `${previewRigInfo.rigName} · ${previewRigInfo.jointCount} joints · root ${previewRigInfo.rootJointName ?? "—"}`
              : "Resolving rig structure…"}
            {" · Selecting Save selection still only persists the explicitly chosen rig."}
          </div>
        </>
      )}
    </div>
  );
}
