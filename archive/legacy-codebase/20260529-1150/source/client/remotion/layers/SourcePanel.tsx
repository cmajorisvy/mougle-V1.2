import React from "react";
import {
  BROADCAST_COLORS,
  BROADCAST_FONTS,
  BROADCAST_SIZES,
  confidenceColor,
  type BroadcastConfidence,
} from "../broadcast-style";

export interface SourceItem {
  name: string;
  url: string | null;
  license: string;
}

export interface SourcePanelLayerProps {
  visible: boolean;
  confidence: BroadcastConfidence;
  confidenceScore: number;
  sources: SourceItem[];
}

export function SourcePanelLayer({
  visible,
  confidence,
  confidenceScore,
  sources,
}: SourcePanelLayerProps): React.ReactElement | null {
  if (!visible) return null;
  const visibleSources = sources.slice(0, 4);
  return (
    <div
      data-layer="source-panel"
      style={{
        position: "absolute",
        right: BROADCAST_SIZES.paddingLg,
        top: BROADCAST_SIZES.breakingBarHeight + BROADCAST_SIZES.paddingMd,
        width: BROADCAST_SIZES.sourcePanelWidth,
        minHeight: BROADCAST_SIZES.sourcePanelMinHeight,
        background: BROADCAST_COLORS.panelFill,
        border: `1px solid ${BROADCAST_COLORS.panelStroke}`,
        borderRadius: 8,
        padding: BROADCAST_SIZES.paddingMd,
        color: BROADCAST_COLORS.textPrimary,
        fontFamily: BROADCAST_FONTS.monoMeta,
        fontSize: BROADCAST_SIZES.sourcePanelFontSize,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 8,
          borderBottom: `1px solid ${BROADCAST_COLORS.panelStroke}`,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            textTransform: "uppercase",
            letterSpacing: 2,
            color: BROADCAST_COLORS.textSecondary,
          }}
        >
          Verified Sources
        </span>
        <span
          style={{
            background: confidenceColor(confidence),
            color: "#03101f",
            fontWeight: 800,
            padding: "2px 10px",
            borderRadius: 4,
            letterSpacing: 1,
            fontSize: 18,
          }}
        >
          {confidence.toUpperCase()} · {Math.round(confidenceScore * 100)}%
        </span>
      </div>
      <ol
        style={{
          margin: 0,
          paddingLeft: 24,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {visibleSources.map((s, i) => (
          <li key={`${s.name}-${i}`} style={{ lineHeight: 1.3 }}>
            <span style={{ fontWeight: 700 }}>{s.name}</span>
            <span style={{ color: BROADCAST_COLORS.textMuted }}> · {s.license}</span>
          </li>
        ))}
        {visibleSources.length === 0 && (
          <li style={{ color: BROADCAST_COLORS.textMuted }}>No sources cited.</li>
        )}
      </ol>
    </div>
  );
}
