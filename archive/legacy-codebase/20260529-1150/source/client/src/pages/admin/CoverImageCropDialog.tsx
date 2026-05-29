import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Loader2 } from "lucide-react";

interface CoverImageCropDialogProps {
  file: File | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCropped: (file: File) => void;
  aspect?: number;
  maxOutputWidth?: number;
}

const PREVIEW_W = 480;
const PREVIEW_H = 270;

export function CoverImageCropDialog({
  file,
  open,
  onOpenChange,
  onCropped,
  aspect = 16 / 9,
  maxOutputWidth = 1280,
}: CoverImageCropDialogProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const previewH = useMemo(() => Math.round(PREVIEW_W / aspect), [aspect]);

  useEffect(() => {
    setImg(null);
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    setError(null);
    if (!file) return;
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => {
      setImg(i);
      URL.revokeObjectURL(url);
    };
    i.onerror = () => {
      setError("Could not read this image file.");
      URL.revokeObjectURL(url);
    };
    i.src = url;
  }, [file]);

  function drawTo(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number) {
    if (!img) return;
    const canvasAspect = canvasW / canvasH;
    const imgAspect = img.width / img.height;
    let baseW: number;
    let baseH: number;
    if (imgAspect > canvasAspect) {
      baseH = canvasH;
      baseW = canvasH * imgAspect;
    } else {
      baseW = canvasW;
      baseH = canvasW / imgAspect;
    }
    const drawW = baseW * zoom;
    const drawH = baseH * zoom;
    const maxOffX = Math.max(0, (drawW - canvasW) / 2);
    const maxOffY = Math.max(0, (drawH - canvasH) / 2);
    const dx = (canvasW - drawW) / 2 + (offsetX / 100) * maxOffX;
    const dy = (canvasH - drawH) / 2 + (offsetY / 100) * maxOffY;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.drawImage(img, dx, dy, drawW, drawH);
  }

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawTo(ctx, PREVIEW_W, previewH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, zoom, offsetX, offsetY, previewH]);

  async function handleSave() {
    if (!img || !file) return;
    setBusy(true);
    setError(null);
    try {
      const outW = Math.min(maxOutputWidth, Math.max(640, Math.round(img.width)));
      const outH = Math.round(outW / aspect);
      const out = document.createElement("canvas");
      out.width = outW;
      out.height = outH;
      const octx = out.getContext("2d");
      if (!octx) throw new Error("Canvas not supported");
      drawTo(octx, outW, outH);
      const mime = file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
      const blob: Blob | null = await new Promise((resolve) =>
        out.toBlob((b) => resolve(b), mime, 0.9),
      );
      if (!blob) throw new Error("Failed to encode image");
      const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
      const baseName = file.name.replace(/\.[^.]+$/, "") || "cover";
      const cropped = new File([blob], `${baseName}-cropped.${ext}`, { type: mime });
      onCropped(cropped);
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message || "Failed to crop image");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="dialog-cover-crop">
        <DialogHeader>
          <DialogTitle>Crop & resize cover image</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div
            className="mx-auto rounded border border-border overflow-hidden bg-black"
            style={{ width: PREVIEW_W, height: previewH }}
          >
            <canvas
              ref={previewCanvasRef}
              width={PREVIEW_W}
              height={previewH}
              className="block"
              data-testid="canvas-cover-crop-preview"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Zoom ({zoom.toFixed(2)}x)</Label>
            <Slider
              min={1}
              max={4}
              step={0.01}
              value={[zoom]}
              onValueChange={(v) => setZoom(v[0] ?? 1)}
              data-testid="slider-cover-zoom"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Horizontal</Label>
              <Slider
                min={-100}
                max={100}
                step={1}
                value={[offsetX]}
                onValueChange={(v) => setOffsetX(v[0] ?? 0)}
                data-testid="slider-cover-offset-x"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vertical</Label>
              <Slider
                min={-100}
                max={100}
                step={1}
                value={[offsetY]}
                onValueChange={(v) => setOffsetY(v[0] ?? 0)}
                data-testid="slider-cover-offset-y"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Locked to a {aspect.toFixed(2)}:1 aspect ratio. Output downscaled to a maximum width of{" "}
            {maxOutputWidth}px before upload.
          </p>
          {error && (
            <p className="text-xs text-destructive" data-testid="text-cover-crop-error">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            data-testid="button-cover-crop-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={busy || !img}
            data-testid="button-cover-crop-save"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
            Save crop & upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
