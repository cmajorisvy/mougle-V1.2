/**
 * Broadcast style guide — CNN/BBC-inspired.
 *
 * Single source of truth for colors, fonts, sizes, and animation curves
 * used by every layer of `BroadcastComposition.tsx`. This file is pure
 * data so it can be imported by both the Remotion composition and the
 * server-side FFmpeg compositor without pulling React/DOM.
 */

export const BROADCAST_CANVAS = {
  width: 1920,
  height: 1080,
  fps: 30,
} as const;

export const BROADCAST_COLORS = {
  channelBrand: "#c8102e",
  channelBrandDark: "#8a0a1e",
  breakingRed: "#d10b1f",
  breakingFlash: "#ff2a3c",
  lowerThirdFill: "#0a1e3d",
  lowerThirdAccent: "#ffcc00",
  tickerFill: "#0a1e3d",
  tickerText: "#ffffff",
  panelFill: "rgba(10,30,61,0.85)",
  panelStroke: "#1f3a64",
  textPrimary: "#ffffff",
  textSecondary: "#cdd6e4",
  textMuted: "#9aa6bd",
  shadowOverlay: "rgba(0,0,0,0.55)",
  confidenceHigh: "#22c55e",
  confidenceMedium: "#eab308",
  confidenceLow: "#ef4444",
} as const;

export const BROADCAST_FONTS = {
  headline:
    "'Helvetica Neue', 'Inter', 'Arial', sans-serif",
  ticker:
    "'Helvetica Neue', 'Inter', 'Arial', sans-serif",
  monoMeta:
    "'IBM Plex Mono', 'Menlo', 'Consolas', monospace",
} as const;

export const BROADCAST_SIZES = {
  lowerThirdHeight: 168,
  lowerThirdHeadlineFontSize: 56,
  lowerThirdKickerFontSize: 26,
  tickerHeight: 56,
  tickerFontSize: 26,
  breakingBarHeight: 88,
  breakingFontSize: 38,
  channelBugSize: 96,
  channelBugFontSize: 28,
  sourcePanelWidth: 540,
  sourcePanelMinHeight: 200,
  sourcePanelFontSize: 22,
  paddingLg: 32,
  paddingMd: 20,
  paddingSm: 12,
} as const;

export const BROADCAST_ANIMATION = {
  lowerThirdInMs: 600,
  lowerThirdOutMs: 400,
  tickerPxPerSec: 220,
  breakingPulseMs: 1200,
  panelFadeMs: 350,
  easing: "cubic-bezier(0.22,1,0.36,1)",
} as const;

export type BroadcastConfidence = "high" | "medium" | "low";

export function confidenceColor(level: BroadcastConfidence): string {
  if (level === "high") return BROADCAST_COLORS.confidenceHigh;
  if (level === "medium") return BROADCAST_COLORS.confidenceMedium;
  return BROADCAST_COLORS.confidenceLow;
}
