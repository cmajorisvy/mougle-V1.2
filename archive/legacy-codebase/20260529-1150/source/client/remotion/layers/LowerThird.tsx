import React from "react";
import { BROADCAST_COLORS, BROADCAST_FONTS, BROADCAST_SIZES } from "../broadcast-style";

export interface LowerThirdLayerProps {
  visible: boolean;
  kicker: string;
  headline: string;
  speakerName: string | null;
  speakerRole: string | null;
}

export function LowerThirdLayer({
  visible,
  kicker,
  headline,
  speakerName,
  speakerRole,
}: LowerThirdLayerProps): React.ReactElement | null {
  if (!visible) return null;
  return (
    <div
      data-layer="lower-third"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: BROADCAST_SIZES.tickerHeight,
        height: BROADCAST_SIZES.lowerThirdHeight,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: `${BROADCAST_SIZES.paddingMd}px ${BROADCAST_SIZES.paddingLg}px`,
        background: `linear-gradient(90deg, ${BROADCAST_COLORS.lowerThirdFill} 0%, ${BROADCAST_COLORS.lowerThirdFill} 70%, rgba(10,30,61,0.2) 100%)`,
        borderTop: `4px solid ${BROADCAST_COLORS.lowerThirdAccent}`,
        fontFamily: BROADCAST_FONTS.headline,
        color: BROADCAST_COLORS.textPrimary,
      }}
    >
      <div
        style={{
          fontSize: BROADCAST_SIZES.lowerThirdKickerFontSize,
          color: BROADCAST_COLORS.lowerThirdAccent,
          letterSpacing: 4,
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        {kicker}
      </div>
      <div
        style={{
          fontSize: BROADCAST_SIZES.lowerThirdHeadlineFontSize,
          fontWeight: 800,
          lineHeight: 1.05,
          marginTop: 6,
        }}
      >
        {headline}
      </div>
      {(speakerName || speakerRole) && (
        <div
          style={{
            fontSize: 20,
            color: BROADCAST_COLORS.textSecondary,
            marginTop: 6,
          }}
        >
          {speakerName ?? ""}
          {speakerName && speakerRole ? " · " : ""}
          {speakerRole ?? ""}
        </div>
      )}
    </div>
  );
}
