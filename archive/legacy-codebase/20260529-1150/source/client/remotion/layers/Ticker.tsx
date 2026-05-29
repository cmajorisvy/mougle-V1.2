import React from "react";
import { BROADCAST_COLORS, BROADCAST_FONTS, BROADCAST_SIZES } from "../broadcast-style";

export interface TickerLayerProps {
  visible: boolean;
  items: string[];
  brandLabel: string;
}

export function TickerLayer({ visible, items, brandLabel }: TickerLayerProps): React.ReactElement | null {
  if (!visible) return null;
  const joined = items.length ? items.join("   •   ") : "";
  return (
    <div
      data-layer="ticker"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: BROADCAST_SIZES.tickerHeight,
        background: BROADCAST_COLORS.tickerFill,
        color: BROADCAST_COLORS.tickerText,
        fontFamily: BROADCAST_FONTS.ticker,
        fontSize: BROADCAST_SIZES.tickerFontSize,
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: BROADCAST_COLORS.channelBrand,
          color: BROADCAST_COLORS.textPrimary,
          padding: `0 ${BROADCAST_SIZES.paddingMd}px`,
          height: "100%",
          display: "flex",
          alignItems: "center",
          fontWeight: 800,
          letterSpacing: 2,
          textTransform: "uppercase",
          flex: "0 0 auto",
        }}
      >
        {brandLabel}
      </div>
      <div
        style={{
          whiteSpace: "nowrap",
          paddingLeft: BROADCAST_SIZES.paddingLg,
          paddingRight: BROADCAST_SIZES.paddingLg,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {joined}
      </div>
    </div>
  );
}
