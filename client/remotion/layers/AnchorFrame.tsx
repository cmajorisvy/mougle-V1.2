import React from "react";
import { BROADCAST_COLORS, BROADCAST_FONTS, BROADCAST_SIZES } from "../broadcast-style";

export interface AnchorFrameLayerProps {
  anchorVideoUrl: string | null;
  anchorLabel: string;
  placeholder: boolean;
}

export function AnchorFrameLayer({
  anchorVideoUrl,
  anchorLabel,
  placeholder,
}: AnchorFrameLayerProps): React.ReactElement {
  return (
    <div
      data-layer="anchor"
      style={{
        position: "absolute",
        left: BROADCAST_SIZES.paddingLg,
        bottom:
          BROADCAST_SIZES.tickerHeight +
          BROADCAST_SIZES.lowerThirdHeight +
          BROADCAST_SIZES.paddingMd,
        width: 480,
        height: 360,
        background: "#03101f",
        border: `2px solid ${BROADCAST_COLORS.panelStroke}`,
        borderRadius: 6,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: BROADCAST_COLORS.textMuted,
        fontFamily: BROADCAST_FONTS.headline,
        fontSize: 22,
      }}
    >
      {anchorVideoUrl && !placeholder ? (
        <video
          src={anchorVideoUrl}
          autoPlay
          muted
          loop
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 700, color: BROADCAST_COLORS.textPrimary }}>
            {anchorLabel}
          </div>
          <div style={{ fontSize: 14, marginTop: 8 }}>
            anchor video pending (T7)
          </div>
        </div>
      )}
    </div>
  );
}
