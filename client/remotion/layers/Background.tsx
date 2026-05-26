import React from "react";
import { BROADCAST_COLORS } from "../broadcast-style";

export interface BackgroundLayerProps {
  imageUrl: string | null;
  fallbackLabel: string;
  attribution: string | null;
}

export function BackgroundLayer({ imageUrl, fallbackLabel, attribution }: BackgroundLayerProps): React.ReactElement {
  return (
    <div
      data-layer="background"
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "#03101f",
        backgroundImage: imageUrl ? `url("${imageUrl}")` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {!imageUrl && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: BROADCAST_COLORS.textMuted,
            fontSize: 28,
            textTransform: "uppercase",
            letterSpacing: 4,
          }}
        >
          {fallbackLabel}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.0) 0%, ${BROADCAST_COLORS.shadowOverlay} 100%)`,
        }}
      />
      {attribution && (
        <div
          style={{
            position: "absolute",
            right: 12,
            top: 12,
            color: BROADCAST_COLORS.textMuted,
            fontSize: 14,
            background: "rgba(0,0,0,0.4)",
            padding: "4px 8px",
            borderRadius: 4,
          }}
        >
          {attribution}
        </div>
      )}
    </div>
  );
}
