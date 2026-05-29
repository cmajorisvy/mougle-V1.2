import React from "react";
import { BROADCAST_COLORS, BROADCAST_FONTS, BROADCAST_SIZES } from "../broadcast-style";

export interface BreakingBarLayerProps {
  visible: boolean;
  label: string;
  headline: string;
}

export function BreakingBarLayer({ visible, label, headline }: BreakingBarLayerProps): React.ReactElement | null {
  if (!visible) return null;
  return (
    <div
      data-layer="breaking-bar"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        height: BROADCAST_SIZES.breakingBarHeight,
        background: BROADCAST_COLORS.breakingRed,
        color: BROADCAST_COLORS.textPrimary,
        fontFamily: BROADCAST_FONTS.headline,
        display: "flex",
        alignItems: "center",
        padding: `0 ${BROADCAST_SIZES.paddingLg}px`,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          fontSize: BROADCAST_SIZES.breakingFontSize,
          fontWeight: 900,
          letterSpacing: 6,
          textTransform: "uppercase",
          paddingRight: BROADCAST_SIZES.paddingLg,
          borderRight: `2px solid ${BROADCAST_COLORS.textPrimary}`,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: BROADCAST_SIZES.breakingFontSize - 6,
          fontWeight: 700,
          paddingLeft: BROADCAST_SIZES.paddingLg,
          flex: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {headline}
      </div>
    </div>
  );
}
