import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Scissors, Loader2, ShieldCheck, Trash2, CheckCircle2, Image as ImageIcon, Sparkles, Upload } from "lucide-react";

type Status = "draft" | "approved" | "discarded";

interface SocialDraft {
  id: string;
  broadcastId: string;
  platform: string;
  aspectRatio: string;
  durationSec: number;
  clipPath: string;
  caption: string;
  thumbnailPath: string | null;
  hashtags: string[];
  suggestedPostAt: string | null;
  lastCropRect: {
    nx: number;
    ny: number;
    nw: number;
    nh: number;
    sourceWidth: number;
    sourceHeight: number;
  } | null;
  status: Status;
  approved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

interface BroadcastRow {
  id: string;
  packageId: string;
  createdAt: string;
  dryRun: boolean;
  status: string;
}

function platformLabel(p: string): string {
  if (p === "youtube_shorts") return "YouTube Shorts";
  if (p === "instagram_reels") return "Instagram Reels";
  if (p === "tiktok") return "TikTok";
  return p;
}

function aspectFrameStyle(aspect: string): React.CSSProperties {
  if (aspect === "9:16") return { aspectRatio: "9 / 16", maxHeight: 360 };
  if (aspect === "4:5") return { aspectRatio: "4 / 5", maxHeight: 360 };
  return { aspectRatio: "1 / 1", maxHeight: 320 };
}

function aspectRatioNumber(aspect: string): number {
  if (aspect === "9:16") return 9 / 16;
  if (aspect === "4:5") return 4 / 5;
  return 1;
}

interface CropCandidate {
  shortId: string;
  token: string;
  sourceWidth: number;
  sourceHeight: number;
  aspectRatio: string;
  origin: "frame" | "ai";
}

interface RememberedCrop {
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  sourceWidth: number;
  sourceHeight: number;
}

interface ThumbnailCropDialogProps {
  candidate: CropCandidate | null;
  remembered: RememberedCrop | null;
  onSaved: (shortId: string, crop: RememberedCrop) => void;
  onClose: () => void;
}

function ThumbnailCropDialog({ candidate, remembered, onSaved, onClose }: ThumbnailCropDialogProps) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  useEffect(() => {
    if (!candidate) return;
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w <= 0 || h <= 0) return;
      const ms = Math.max(w / candidate.sourceWidth, h / candidate.sourceHeight);
      setFrameSize({ w, h });
      setMinScale(ms);
      let s = ms;
      let ox = (w - candidate.sourceWidth * ms) / 2;
      let oy = (h - candidate.sourceHeight * ms) / 2;
      if (
        remembered &&
        remembered.nw > 0 &&
        remembered.nh > 0 &&
        Number.isFinite(remembered.nx) &&
        Number.isFinite(remembered.ny)
      ) {
        const cropWSrc = remembered.nw * candidate.sourceWidth;
        const cropHSrc = remembered.nh * candidate.sourceHeight;
        if (cropWSrc > 0 && cropHSrc > 0) {
          const sRestored = Math.max(w / cropWSrc, h / cropHSrc, ms);
          s = Math.min(ms * 4, sRestored);
          const cropXSrc = remembered.nx * candidate.sourceWidth;
          const cropYSrc = remembered.ny * candidate.sourceHeight;
          ox = -cropXSrc * s;
          oy = -cropYSrc * s;
          const displayedW = candidate.sourceWidth * s;
          const displayedH = candidate.sourceHeight * s;
          ox = Math.min(0, Math.max(w - displayedW, ox));
          oy = Math.min(0, Math.max(h - displayedH, oy));
        }
      }
      setScale(s);
      setOffset({ x: ox, y: oy });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [candidate, remembered]);

  function clampOffset(x: number, y: number, s: number) {
    if (!candidate) return { x, y };
    const displayedW = candidate.sourceWidth * s;
    const displayedH = candidate.sourceHeight * s;
    const minX = frameSize.w - displayedW;
    const minY = frameSize.h - displayedH;
    return {
      x: Math.min(0, Math.max(minX, x)),
      y: Math.min(0, Math.max(minY, y)),
    };
  }

  function handleScaleChange(next: number) {
    if (!candidate) return;
    const s = Math.max(minScale, Math.min(minScale * 4, next));
    const centerSrcX = (frameSize.w / 2 - offset.x) / scale;
    const centerSrcY = (frameSize.h / 2 - offset.y) / scale;
    const nextX = frameSize.w / 2 - centerSrcX * s;
    const nextY = frameSize.h / 2 - centerSrcY * s;
    setScale(s);
    setOffset(clampOffset(nextX, nextY, s));
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    const nx = d.baseX + (e.clientX - d.startX);
    const ny = d.baseY + (e.clientY - d.startY);
    setOffset(clampOffset(nx, ny, scale));
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    try { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    dragRef.current = null;
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!candidate) throw new Error("No candidate");
      const cropX = (-offset.x) / scale;
      const cropY = (-offset.y) / scale;
      const cropWidth = frameSize.w / scale;
      const cropHeight = frameSize.h / scale;
      const r = await fetch(
        `/api/admin/shorts/${candidate.shortId}/thumbnail/candidate/${candidate.token}/save`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cropX,
            cropY,
            cropWidth,
            cropHeight,
            lastCropRect: {
              nx: candidate.sourceWidth > 0 ? cropX / candidate.sourceWidth : 0,
              ny: candidate.sourceHeight > 0 ? cropY / candidate.sourceHeight : 0,
              nw: candidate.sourceWidth > 0 ? cropWidth / candidate.sourceWidth : 0,
              nh: candidate.sourceHeight > 0 ? cropHeight / candidate.sourceHeight : 0,
              sourceWidth: candidate.sourceWidth,
              sourceHeight: candidate.sourceHeight,
            },
          }),
        },
      );
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.message || json.error || "Save failed");
      return json;
    },
    onSuccess: () => {
      if (!candidate) return;
      const cropX = (-offset.x) / scale;
      const cropY = (-offset.y) / scale;
      const cropWidth = frameSize.w / scale;
      const cropHeight = frameSize.h / scale;
      const remembered: RememberedCrop = {
        nx: candidate.sourceWidth > 0 ? cropX / candidate.sourceWidth : 0,
        ny: candidate.sourceHeight > 0 ? cropY / candidate.sourceHeight : 0,
        nw: candidate.sourceWidth > 0 ? cropWidth / candidate.sourceWidth : 0,
        nh: candidate.sourceHeight > 0 ? cropHeight / candidate.sourceHeight : 0,
        sourceWidth: candidate.sourceWidth,
        sourceHeight: candidate.sourceHeight,
      };
      toast({ title: "Thumbnail saved", description: "Cropped image stored privately." });
      onSaved(candidate.shortId, remembered);
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  async function handleCancel() {
    if (candidate) {
      try {
        await fetch(
          `/api/admin/shorts/${candidate.shortId}/thumbnail/candidate/${candidate.token}`,
          { method: "DELETE", credentials: "include" },
        );
      } catch {
        /* best-effort cleanup */
      }
    }
    onClose();
  }

  const open = candidate !== null;
  const aspectStyle: React.CSSProperties = candidate
    ? { aspectRatio: `${aspectRatioNumber(candidate.aspectRatio)}`, maxHeight: 420 }
    : {};

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) void handleCancel(); }}>
      <DialogContent className="max-w-2xl" data-testid="dialog-thumbnail-crop">
        <DialogHeader>
          <DialogTitle>Crop thumbnail</DialogTitle>
          <DialogDescription>
            Drag to reposition, then zoom to fine-tune. The crop matches the draft's {candidate?.aspectRatio} aspect ratio.
          </DialogDescription>
        </DialogHeader>
        {candidate && (
          <div className="space-y-4">
            <div className="mx-auto bg-black overflow-hidden rounded select-none touch-none cursor-grab active:cursor-grabbing"
              style={{ ...aspectStyle, width: "100%", maxWidth: 360, position: "relative" }}
              ref={containerRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              data-testid={`crop-frame-${candidate.shortId}`}
            >
              <img
                src={`/api/admin/shorts/${candidate.shortId}/thumbnail/candidate/${candidate.token}`}
                alt="Thumbnail candidate"
                draggable={false}
                style={{
                  position: "absolute",
                  left: offset.x,
                  top: offset.y,
                  width: candidate.sourceWidth * scale,
                  height: candidate.sourceHeight * scale,
                  maxWidth: "none",
                  userSelect: "none",
                  pointerEvents: "none",
                }}
                data-testid={`img-candidate-${candidate.shortId}`}
              />
              <div className="pointer-events-none absolute inset-0 border-2 border-white/70 rounded" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Zoom</Label>
              <Slider
                min={1}
                max={4}
                step={0.01}
                value={[minScale > 0 ? scale / minScale : 1]}
                onValueChange={(v) => handleScaleChange(minScale * (v[0] ?? 1))}
                data-testid={`slider-zoom-${candidate.shortId}`}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Source: {candidate.sourceWidth}×{candidate.sourceHeight} ·
              Crop: {Math.round(frameSize.w / scale)}×{Math.round(frameSize.h / scale)} px ·
              {candidate.origin === "ai" ? " AI-generated" : " Snapshot"}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={saveMut.isPending} data-testid="button-crop-cancel">
            Cancel
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || frameSize.w === 0} data-testid="button-crop-save">
            {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ShortsReview() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<Status | "all">("draft");
  const [selectedBroadcastId, setSelectedBroadcastId] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editHashtags, setEditHashtags] = useState("");
  const [frameAtById, setFrameAtById] = useState<Record<string, string>>({});
  const [thumbBustById, setThumbBustById] = useState<Record<string, number>>({});
  const uploadInputsRef = useRef<Record<string, HTMLInputElement | null>>({});
  const [cropCandidate, setCropCandidate] = useState<CropCandidate | null>(null);
  const [lastCropById, setLastCropById] = useState<Record<string, RememberedCrop>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem("mougle-shorts-last-crop");
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, RememberedCrop>) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("mougle-shorts-last-crop", JSON.stringify(lastCropById));
    } catch {
      /* ignore quota errors */
    }
  }, [lastCropById]);

  const broadcastsQ = useQuery<{ ok: true; broadcasts: BroadcastRow[] }>({
    queryKey: ["/api/admin/broadcasts"],
    queryFn: async () => {
      const r = await fetch("/api/admin/broadcasts", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load broadcasts");
      return r.json();
    },
  });

  const listQ = useQuery<{ ok: true; shorts: SocialDraft[] }>({
    queryKey: ["/api/admin/shorts", statusFilter],
    queryFn: async () => {
      const u = new URL("/api/admin/shorts", window.location.origin);
      if (statusFilter !== "all") u.searchParams.set("status", statusFilter);
      const r = await fetch(u.toString().replace(window.location.origin, ""), { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load drafts");
      return r.json();
    },
  });

  const cutMut = useMutation({
    mutationFn: async (broadcastId: string) => {
      const r = await fetch(`/api/admin/shorts/cut/${broadcastId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.message || json.error || "Cut failed");
      return json;
    },
    onSuccess: () => {
      toast({ title: "Shorts cut", description: "Variants added to draft queue (nothing posted)." });
      qc.invalidateQueries({ queryKey: ["/api/admin/shorts"] });
    },
    onError: (err: Error) => {
      toast({ title: "Cut failed", description: err.message, variant: "destructive" });
    },
  });

  const patchMut = useMutation({
    mutationFn: async (args: { id: string; body: Record<string, unknown> }) => {
      const r = await fetch(`/api/admin/shorts/${args.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args.body),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.message || json.error || "Save failed");
      return json.short as SocialDraft;
    },
    onSuccess: () => {
      toast({ title: "Saved" });
      qc.invalidateQueries({ queryKey: ["/api/admin/shorts"] });
      setEditingId(null);
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const approveMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/admin/shorts/${id}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.message || json.error || "Approve failed");
      return json;
    },
    onSuccess: () => {
      toast({ title: "Approved", description: "Flag flipped only. No external posting occurs." });
      qc.invalidateQueries({ queryKey: ["/api/admin/shorts"] });
    },
    onError: (err: Error) => toast({ title: "Approve failed", description: err.message, variant: "destructive" }),
  });

  const frameThumbMut = useMutation({
    mutationFn: async (args: { id: string; atSec: number; aspectRatio: string }) => {
      const r = await fetch(`/api/admin/shorts/${args.id}/thumbnail/frame`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atSec: args.atSec }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.message || json.error || "Frame snapshot failed");
      return {
        id: args.id,
        aspectRatio: args.aspectRatio,
        candidate: json.candidate as { token: string; width: number; height: number },
      };
    },
    onSuccess: ({ id, aspectRatio, candidate }) => {
      setCropCandidate({
        shortId: id,
        token: candidate.token,
        sourceWidth: candidate.width,
        sourceHeight: candidate.height,
        aspectRatio,
        origin: "frame",
      });
    },
    onError: (err: Error) =>
      toast({ title: "Frame snapshot failed", description: err.message, variant: "destructive" }),
  });

  const aiThumbMut = useMutation({
    mutationFn: async (args: { id: string; aspectRatio: string }) => {
      const r = await fetch(`/api/admin/shorts/${args.id}/thumbnail/ai`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.message || json.error || "AI thumbnail failed");
      return {
        id: args.id,
        aspectRatio: args.aspectRatio,
        candidate: json.candidate as { token: string; width: number; height: number },
      };
    },
    onSuccess: ({ id, aspectRatio, candidate }) => {
      setCropCandidate({
        shortId: id,
        token: candidate.token,
        sourceWidth: candidate.width,
        sourceHeight: candidate.height,
        aspectRatio,
        origin: "ai",
      });
    },
    onError: (err: Error) =>
      toast({ title: "AI thumbnail failed", description: err.message, variant: "destructive" }),
  });

  const uploadThumbMut = useMutation({
    mutationFn: async (args: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", args.file);
      const r = await fetch(`/api/admin/shorts/${args.id}/thumbnail/upload`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.message || json.error || "Upload failed");
      return { id: args.id, short: json.short as SocialDraft };
    },
    onSuccess: ({ id }) => {
      toast({ title: "Thumbnail uploaded", description: "Saved to the private shorts folder. Nothing posted externally." });
      setThumbBustById((m) => ({ ...m, [id]: Date.now() }));
      qc.invalidateQueries({ queryKey: ["/api/admin/shorts"] });
    },
    onError: (err: Error) =>
      toast({ title: "Upload failed", description: err.message, variant: "destructive" }),
  });

  const discardMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/admin/shorts/${id}`, { method: "DELETE", credentials: "include" });
      const json = await r.json();
      if (!r.ok || !json.ok) throw new Error(json.message || json.error || "Discard failed");
      return json;
    },
    onSuccess: () => {
      toast({ title: "Discarded" });
      qc.invalidateQueries({ queryKey: ["/api/admin/shorts"] });
    },
    onError: (err: Error) => toast({ title: "Discard failed", description: err.message, variant: "destructive" }),
  });

  const shorts = listQ.data?.shorts ?? [];
  const broadcasts = broadcastsQ.data?.broadcasts ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, SocialDraft[]>();
    for (const s of shorts) {
      const list = map.get(s.broadcastId) ?? [];
      list.push(s);
      map.set(s.broadcastId, list);
    }
    return map;
  }, [shorts]);

  function startEdit(s: SocialDraft) {
    setEditingId(s.id);
    setEditCaption(s.caption);
    setEditHashtags(s.hashtags.join(" "));
  }

  function saveEdit(s: SocialDraft) {
    const hashtags = editHashtags.split(/[\s,]+/).filter(Boolean);
    patchMut.mutate({ id: s.id, body: { caption: editCaption, hashtags } });
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Scissors className="h-7 w-7" /> Shorts Cutter — Approval Queue
          </h1>
          <p className="text-muted-foreground">Cut, review, and approve short clips from approved broadcasts. Nothing is auto-posted.</p>
        </div>
        <Badge variant="outline" className="gap-1" data-testid="badge-safety">
          <ShieldCheck className="h-3.5 w-3.5" /> Approval flips a flag only · No external posting
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cut shorts from an approved broadcast</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label>Broadcast</Label>
              <Select value={selectedBroadcastId} onValueChange={setSelectedBroadcastId}>
                <SelectTrigger data-testid="select-broadcast">
                  <SelectValue placeholder="Choose a broadcast..." />
                </SelectTrigger>
                <SelectContent>
                  {broadcasts.map((b) => (
                    <SelectItem key={b.id} value={b.id} data-testid={`option-broadcast-${b.id}`}>
                      {b.packageId} · {new Date(b.createdAt).toLocaleString()} {b.dryRun ? "(dry run)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => selectedBroadcastId && cutMut.mutate(selectedBroadcastId)}
                disabled={!selectedBroadcastId || cutMut.isPending}
                className="w-full"
                data-testid="button-cut-shorts"
              >
                {cutMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Scissors className="h-4 w-4 mr-2" />}
                Cut Default Variants
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Default variants: YouTube Shorts 9:16 30s · Instagram Reels 9:16 60s · TikTok 1:1 30s.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Label>Status filter</Label>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status | "all")}>
          <SelectTrigger className="w-48" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="discarded">Discarded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {listQ.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading drafts...
        </div>
      ) : shorts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground" data-testid="text-empty-drafts">
            No drafts match this filter.
          </CardContent>
        </Card>
      ) : (
        Array.from(grouped.entries()).map(([broadcastId, items]) => (
          <Card key={broadcastId} data-testid={`card-broadcast-group-${broadcastId}`}>
            <CardHeader>
              <CardTitle className="text-base">Broadcast {broadcastId.slice(0, 8)} · {items.length} draft{items.length === 1 ? "" : "s"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {items.map((s) => (
                  <div
                    key={s.id}
                    className="border rounded-lg p-3 space-y-3 bg-card"
                    data-testid={`card-draft-${s.id}`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <Badge variant="secondary" data-testid={`badge-platform-${s.id}`}>
                        {platformLabel(s.platform)} · {s.aspectRatio} · {s.durationSec}s
                      </Badge>
                      <Badge
                        variant={s.status === "approved" ? "default" : s.status === "discarded" ? "outline" : "secondary"}
                        data-testid={`badge-status-${s.id}`}
                      >
                        {s.status}
                      </Badge>
                    </div>

                    <div
                      className="bg-black rounded overflow-hidden flex items-center justify-center mx-auto"
                      style={aspectFrameStyle(s.aspectRatio)}
                      data-testid={`preview-${s.id}`}
                    >
                      <video
                        src={`/api/admin/shorts/${s.id}/clip`}
                        poster={
                          s.thumbnailPath
                            ? `/api/admin/shorts/${s.id}/thumbnail?v=${thumbBustById[s.id] ?? 0}`
                            : undefined
                        }
                        controls
                        muted
                        className="w-full h-full object-contain"
                        data-testid={`video-${s.id}`}
                      />
                    </div>

                    {s.status === "draft" && (
                      <div className="space-y-2 rounded border bg-muted/40 p-2">
                        <Label className="text-xs flex items-center gap-1">
                          <ImageIcon className="h-3.5 w-3.5" /> Thumbnail
                        </Label>
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            type="number"
                            min={0}
                            max={s.durationSec}
                            step={0.1}
                            placeholder={`Pick frame at... (0–${s.durationSec}s)`}
                            value={frameAtById[s.id] ?? ""}
                            onChange={(e) =>
                              setFrameAtById((m) => ({ ...m, [s.id]: e.target.value }))
                            }
                            className="w-44"
                            data-testid={`input-frame-at-${s.id}`}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={frameThumbMut.isPending}
                            onClick={() => {
                              const raw = frameAtById[s.id];
                              const atSec = raw === undefined || raw === "" ? NaN : Number(raw);
                              if (!Number.isFinite(atSec) || atSec < 0 || atSec > s.durationSec) {
                                toast({
                                  title: "Invalid time",
                                  description: `Enter a number between 0 and ${s.durationSec}.`,
                                  variant: "destructive",
                                });
                                return;
                              }
                              frameThumbMut.mutate({ id: s.id, atSec, aspectRatio: s.aspectRatio });
                            }}
                            data-testid={`button-frame-thumb-${s.id}`}
                          >
                            {frameThumbMut.isPending && frameThumbMut.variables?.id === s.id ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <ImageIcon className="h-4 w-4 mr-1" />
                            )}
                            Snapshot frame
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={aiThumbMut.isPending}
                            onClick={() => aiThumbMut.mutate({ id: s.id, aspectRatio: s.aspectRatio })}
                            data-testid={`button-ai-thumb-${s.id}`}
                          >
                            {aiThumbMut.isPending && aiThumbMut.variables?.id === s.id ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4 mr-1" />
                            )}
                            Generate AI thumbnail
                          </Button>
                          <input
                            ref={(el) => {
                              uploadInputsRef.current[s.id] = el;
                            }}
                            type="file"
                            accept="image/png,image/jpeg"
                            className="hidden"
                            data-testid={`input-upload-thumb-${s.id}`}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const mime = (file.type || "").toLowerCase();
                              if (mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/jpg") {
                                toast({
                                  title: "Unsupported file",
                                  description: "Please choose a PNG or JPEG image.",
                                  variant: "destructive",
                                });
                                e.target.value = "";
                                return;
                              }
                              if (file.size > 5 * 1024 * 1024) {
                                toast({
                                  title: "File too large",
                                  description: "Thumbnail must be 5MB or smaller.",
                                  variant: "destructive",
                                });
                                e.target.value = "";
                                return;
                              }
                              uploadThumbMut.mutate({ id: s.id, file });
                              e.target.value = "";
                            }}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={uploadThumbMut.isPending}
                            onClick={() => uploadInputsRef.current[s.id]?.click()}
                            data-testid={`button-upload-thumb-${s.id}`}
                          >
                            {uploadThumbMut.isPending && uploadThumbMut.variables?.id === s.id ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4 mr-1" />
                            )}
                            Upload image
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          PNG or JPEG, ≤5MB. Stored privately — never posted externally.
                        </p>
                      </div>
                    )}

                    {editingId === s.id ? (
                      <div className="space-y-2">
                        <Label className="text-xs">Caption</Label>
                        <Textarea
                          value={editCaption}
                          onChange={(e) => setEditCaption(e.target.value)}
                          rows={3}
                          maxLength={220}
                          data-testid={`textarea-caption-${s.id}`}
                        />
                        <Label className="text-xs">Hashtags (space-separated)</Label>
                        <Input
                          value={editHashtags}
                          onChange={(e) => setEditHashtags(e.target.value)}
                          data-testid={`input-hashtags-${s.id}`}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveEdit(s)} disabled={patchMut.isPending} data-testid={`button-save-${s.id}`}>
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)} data-testid={`button-cancel-edit-${s.id}`}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm" data-testid={`text-caption-${s.id}`}>{s.caption}</p>
                        <div className="flex flex-wrap gap-1">
                          {s.hashtags.map((h) => (
                            <Badge key={h} variant="outline" className="text-xs" data-testid={`badge-tag-${s.id}-${h}`}>
                              {h}
                            </Badge>
                          ))}
                        </div>
                        {s.suggestedPostAt && (
                          <p className="text-xs text-muted-foreground" data-testid={`text-suggested-${s.id}`}>
                            Suggested post: {new Date(s.suggestedPostAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                      {s.status === "draft" && editingId !== s.id && (
                        <Button size="sm" variant="outline" onClick={() => startEdit(s)} data-testid={`button-edit-${s.id}`}>
                          Edit
                        </Button>
                      )}
                      {s.status !== "approved" && s.status !== "discarded" && (
                        <Button
                          size="sm"
                          onClick={() => approveMut.mutate(s.id)}
                          disabled={approveMut.isPending}
                          data-testid={`button-approve-${s.id}`}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                        </Button>
                      )}
                      {s.status !== "discarded" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => discardMut.mutate(s.id)}
                          disabled={discardMut.isPending}
                          data-testid={`button-discard-${s.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-1" /> Discard
                        </Button>
                      )}
                    </div>
                    {s.approved && s.approvedBy && (
                      <p className="text-xs text-muted-foreground" data-testid={`text-approved-by-${s.id}`}>
                        Approved by {s.approvedBy} {s.approvedAt ? `· ${new Date(s.approvedAt).toLocaleString()}` : ""} · Not posted to any platform
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <ThumbnailCropDialog
        candidate={cropCandidate}
        remembered={
          cropCandidate
            ? (() => {
                const own = shorts.find((s) => s.id === cropCandidate.shortId);
                if (own?.lastCropRect) return own.lastCropRect;
                const cached = lastCropById[cropCandidate.shortId];
                if (cached) return cached;
                if (!own) return null;
                const siblings = shorts.filter(
                  (s) =>
                    s.broadcastId === own.broadcastId &&
                    s.id !== own.id &&
                    s.lastCropRect,
                );
                if (siblings.length === 0) return null;
                const targetAR = aspectRatioNumber(cropCandidate.aspectRatio);
                const exact = siblings.find((s) => s.aspectRatio === cropCandidate.aspectRatio);
                if (exact?.lastCropRect) return exact.lastCropRect;
                const sorted = [...siblings].sort(
                  (a, b) =>
                    Math.abs(aspectRatioNumber(a.aspectRatio) - targetAR) -
                    Math.abs(aspectRatioNumber(b.aspectRatio) - targetAR),
                );
                return sorted[0]?.lastCropRect ?? null;
              })()
            : null
        }
        onSaved={(id, crop) => {
          setLastCropById((m) => ({ ...m, [id]: crop }));
          setCropCandidate(null);
          setThumbBustById((m) => ({ ...m, [id]: Date.now() }));
          qc.invalidateQueries({ queryKey: ["/api/admin/shorts"] });
        }}
        onClose={() => setCropCandidate(null)}
      />
    </div>
  );
}
