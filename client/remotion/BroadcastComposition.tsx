/**
 * Remotion broadcast composition.
 *
 * This is the typed, layered source-of-truth for the CNN/BBC-inspired
 * broadcast frame. It is consumed by:
 *   1. The Remotion renderer (when @remotion/* is installed) — each
 *      sub-layer reads only from typed props so it can be unit-tested
 *      in isolation, no global state.
 *   2. The server-side compositor (`broadcast-compositor-service.ts`)
 *      as the canonical style/layout reference — the FFmpeg fallback
 *      keeps identical positions and colors.
 *
 * No I/O, no network, no DOM side-effects.
 */

import React from "react";
import { BROADCAST_CANVAS, BROADCAST_COLORS } from "./broadcast-style";
import { BackgroundLayer, type BackgroundLayerProps } from "./layers/Background";
import { AnchorFrameLayer, type AnchorFrameLayerProps } from "./layers/AnchorFrame";
import { LowerThirdLayer, type LowerThirdLayerProps } from "./layers/LowerThird";
import { TickerLayer, type TickerLayerProps } from "./layers/Ticker";
import { BreakingBarLayer, type BreakingBarLayerProps } from "./layers/BreakingBar";
import { SourcePanelLayer, type SourcePanelLayerProps } from "./layers/SourcePanel";
import { ChannelBugLayer, type ChannelBugLayerProps } from "./layers/ChannelBug";

export interface BroadcastCompositionProps {
  background: BackgroundLayerProps;
  anchor: AnchorFrameLayerProps;
  lowerThird: LowerThirdLayerProps;
  ticker: TickerLayerProps;
  breaking: BreakingBarLayerProps;
  sourcePanel: SourcePanelLayerProps;
  channelBug: ChannelBugLayerProps;
  watermark: { enabled: boolean; label: string };
}

export const BROADCAST_LAYER_ORDER = [
  "background",
  "anchor",
  "source-panel",
  "channel-bug",
  "lower-third",
  "ticker",
  "breaking-bar",
  "watermark",
] as const;

export function BroadcastComposition(props: BroadcastCompositionProps): React.ReactElement {
  return (
    <div
      data-composition="broadcast"
      style={{
        position: "relative",
        width: BROADCAST_CANVAS.width,
        height: BROADCAST_CANVAS.height,
        overflow: "hidden",
        background: "#000",
        color: BROADCAST_COLORS.textPrimary,
      }}
    >
      <BackgroundLayer {...props.background} />
      <AnchorFrameLayer {...props.anchor} />
      <SourcePanelLayer {...props.sourcePanel} />
      <ChannelBugLayer {...props.channelBug} />
      <LowerThirdLayer {...props.lowerThird} />
      <TickerLayer {...props.ticker} />
      <BreakingBarLayer {...props.breaking} />
      {props.watermark.enabled && (
        <div
          data-layer="watermark"
          style={{
            position: "absolute",
            right: 16,
            bottom: 80,
            padding: "4px 10px",
            background: "rgba(0,0,0,0.55)",
            color: "#facc15",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 2,
            borderRadius: 4,
          }}
        >
          {props.watermark.label}
        </div>
      )}
    </div>
  );
}

export default BroadcastComposition;
