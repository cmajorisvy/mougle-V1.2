/**
 * T9 — Shorts composition.
 *
 * Vertical (9:16) / square (1:1) / portrait (4:5) crop of the broadcast
 * frame. Re-uses the same typed layer props as `BroadcastComposition` so
 * the server-side Remotion/FFmpeg crop stays in sync with the broadcast
 * canvas (1920x1080).
 *
 * No I/O, no network, no DOM side-effects. Pure presentation.
 */

import React from "react";
import { BROADCAST_CANVAS } from "./broadcast-style";
import BroadcastComposition, { type BroadcastCompositionProps } from "./BroadcastComposition";

export type ShortAspectRatio = "9:16" | "1:1" | "4:5";

export const SHORT_DIMENSIONS: Record<ShortAspectRatio, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export interface ShortCompositionProps extends BroadcastCompositionProps {
  aspectRatio: ShortAspectRatio;
}

/**
 * Crop strategy: keep the lower-third + ticker (which carry the headline,
 * source attribution, kicker) visible. We center horizontally on the
 * source-panel + anchor frame area and scale the broadcast canvas to fit
 * the target vertical frame.
 */
export function computeCropRect(aspect: ShortAspectRatio): {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
} {
  const { width: outW, height: outH } = SHORT_DIMENSIONS[aspect];
  const srcW = BROADCAST_CANVAS.width;
  const srcH = BROADCAST_CANVAS.height;
  const scale = Math.max(outW / srcW, outH / srcH);
  const scaledW = srcW * scale;
  const scaledH = srcH * scale;
  const offsetX = (outW - scaledW) / 2;
  const offsetY = (outH - scaledH) / 2;
  return { scale, offsetX, offsetY, width: outW, height: outH };
}

export function ShortComposition(props: ShortCompositionProps): React.ReactElement {
  const { aspectRatio, ...broadcastProps } = props;
  const { scale, offsetX, offsetY, width, height } = computeCropRect(aspectRatio);
  return (
    <div
      data-composition="short"
      data-aspect-ratio={aspectRatio}
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        background: "#000",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: offsetX,
          top: offsetY,
          width: BROADCAST_CANVAS.width,
          height: BROADCAST_CANVAS.height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <BroadcastComposition {...broadcastProps} />
      </div>
    </div>
  );
}

export default ShortComposition;
