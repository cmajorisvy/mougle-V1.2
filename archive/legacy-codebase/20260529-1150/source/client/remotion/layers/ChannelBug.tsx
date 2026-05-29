import React from "react";
import { BROADCAST_COLORS, BROADCAST_FONTS, BROADCAST_SIZES } from "../broadcast-style";

export interface ChannelBugLayerProps {
  brandLabel: string;
  showLive: boolean;
}

export function ChannelBugLayer({ brandLabel, showLive }: ChannelBugLayerProps): React.ReactElement {
  return (
    <div
      data-layer="channel-bug"
      style={{
        position: "absolute",
        left: BROADCAST_SIZES.paddingLg,
        top: BROADCAST_SIZES.breakingBarHeight + BROADCAST_SIZES.paddingMd,
        width: BROADCAST_SIZES.channelBugSize,
        height: BROADCAST_SIZES.channelBugSize,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: BROADCAST_COLORS.channelBrand,
        color: BROADCAST_COLORS.textPrimary,
        fontFamily: BROADCAST_FONTS.headline,
        fontWeight: 900,
        fontSize: BROADCAST_SIZES.channelBugFontSize,
        letterSpacing: 2,
        borderRadius: 4,
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      }}
    >
      <span>{brandLabel}</span>
      {showLive && (
        <span
          style={{
            marginTop: 4,
            fontSize: 14,
            background: "#03101f",
            padding: "1px 6px",
            borderRadius: 2,
            letterSpacing: 2,
          }}
        >
          ● LIVE
        </span>
      )}
    </div>
  );
}
