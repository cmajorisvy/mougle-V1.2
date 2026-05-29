export type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  unit: "percent";
  purpose: string;
};

export type MonitorRect = LayoutRect & { panelKey: string };

export type RenderSafeZones = {
  anchorSafeZone: LayoutRect;
  lowerThirdZone: LayoutRect;
  tickerZone: LayoutRect;
  captionZone: LayoutRect;
  monitorPanelZones: MonitorRect[];
};

export type RenderTextSafety = {
  headlineMaxChars: number;
  lowerThirdMaxChars: number;
  tickerItemMaxChars: number;
  captionMaxCharsPerLine: number;
  captionMaxLines: number;
  overlapPrevention: string[];
};

export type ComplianceFinding = { code: string; message: string };

export type RenderComplianceFindings = {
  warnings: ComplianceFinding[];
  errors: ComplianceFinding[];
};

export function clampToMax(text: string, max: number): string {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (max <= 0) return "";
  if (normalized.length <= max) return normalized;
  if (max <= 3) return normalized.slice(0, max);
  return `${normalized.slice(0, max - 3)}...`;
}

export function wrapLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (!normalized || maxCharsPerLine <= 0 || maxLines <= 0) return [];
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (lines.length >= maxLines) break;
    current = word.length <= maxCharsPerLine ? word : word.slice(0, maxCharsPerLine);
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.slice(0, maxLines);
}

function rectsOverlap(a: LayoutRect, b: LayoutRect): boolean {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  return a.x < bx2 && ax2 > b.x && a.y < by2 && ay2 > b.y;
}

const CANVAS_MIN = 0;
const CANVAS_MAX = 100;
const PANEL_EDGE_MIN_MARGIN = 2;

export function analyzeRenderBaselineLayout(safeZones: RenderSafeZones): RenderComplianceFindings {
  const warnings: ComplianceFinding[] = [];
  const errors: ComplianceFinding[] = [];

  const pairs: Array<{ code: string; a: LayoutRect; b: LayoutRect; aName: string; bName: string }> = [
    {
      code: "captions_overlap_lower_third",
      a: safeZones.captionZone,
      b: safeZones.lowerThirdZone,
      aName: "caption zone",
      bName: "lower-third zone",
    },
    {
      code: "captions_overlap_ticker",
      a: safeZones.captionZone,
      b: safeZones.tickerZone,
      aName: "caption zone",
      bName: "ticker zone",
    },
    {
      code: "lower_third_overlap_ticker",
      a: safeZones.lowerThirdZone,
      b: safeZones.tickerZone,
      aName: "lower-third zone",
      bName: "ticker zone",
    },
    {
      code: "anchor_overlap_lower_third",
      a: safeZones.anchorSafeZone,
      b: safeZones.lowerThirdZone,
      aName: "anchor safe zone",
      bName: "lower-third zone",
    },
  ];

  for (const pair of pairs) {
    if (rectsOverlap(pair.a, pair.b)) {
      errors.push({
        code: pair.code,
        message: `${pair.aName} overlaps ${pair.bName}; safe-zone geometry must be adjusted before rendering.`,
      });
    }
  }

  for (const panel of safeZones.monitorPanelZones) {
    const px2 = panel.x + panel.width;
    const py2 = panel.y + panel.height;
    if (
      panel.x < CANVAS_MIN + PANEL_EDGE_MIN_MARGIN ||
      panel.y < CANVAS_MIN + PANEL_EDGE_MIN_MARGIN ||
      px2 > CANVAS_MAX - PANEL_EDGE_MIN_MARGIN ||
      py2 > CANVAS_MAX - PANEL_EDGE_MIN_MARGIN
    ) {
      warnings.push({
        code: "panel_margin_too_tight",
        message: `Monitor panel ${panel.panelKey} is within ${PANEL_EDGE_MIN_MARGIN}% of the canvas edge.`,
      });
    }
    if (rectsOverlap(panel, safeZones.anchorSafeZone)) {
      errors.push({
        code: "panel_overlap_anchor",
        message: `Monitor panel ${panel.panelKey} overlaps the anchor safe zone.`,
      });
    }
    if (rectsOverlap(panel, safeZones.lowerThirdZone)) {
      warnings.push({
        code: "panel_overlap_lower_third",
        message: `Monitor panel ${panel.panelKey} intersects the lower-third zone.`,
      });
    }
  }

  return { warnings, errors };
}

export type TextAnalysisInputs = {
  headlineText: string | null | undefined;
  lowerThirdText: string | null | undefined;
  tickerItems: string[];
  captionSegments: Array<{ segmentIndex: number; text: string }>;
};

export function analyzeRenderBaselineText(
  textSafety: RenderTextSafety,
  inputs: TextAnalysisInputs,
): RenderComplianceFindings {
  const warnings: ComplianceFinding[] = [];
  const errors: ComplianceFinding[] = [];

  const headline = (inputs.headlineText || "").trim();
  if (headline.length > textSafety.headlineMaxChars) {
    warnings.push({
      code: "headline_over_budget",
      message: `Headline is ${headline.length} chars (max ${textSafety.headlineMaxChars}); it will be clamped at render time.`,
    });
  }

  const lowerThird = (inputs.lowerThirdText || "").trim();
  if (lowerThird.length > textSafety.lowerThirdMaxChars) {
    warnings.push({
      code: "lower_third_over_budget",
      message: `Lower-third text is ${lowerThird.length} chars (max ${textSafety.lowerThirdMaxChars}).`,
    });
  }

  inputs.tickerItems.forEach((item, idx) => {
    const length = (item || "").trim().length;
    if (length > textSafety.tickerItemMaxChars) {
      warnings.push({
        code: "ticker_item_over_budget",
        message: `Ticker item #${idx + 1} is ${length} chars (max ${textSafety.tickerItemMaxChars}).`,
      });
    }
  });

  const maxBudgetPerCue = textSafety.captionMaxCharsPerLine * textSafety.captionMaxLines;
  inputs.captionSegments.forEach((segment) => {
    const wrapped = wrapLines(segment.text, textSafety.captionMaxCharsPerLine, textSafety.captionMaxLines);
    const renderedChars = wrapped.join(" ").length;
    const originalChars = (segment.text || "").trim().length;
    if (originalChars > maxBudgetPerCue) {
      warnings.push({
        code: "caption_segment_over_budget",
        message: `Caption segment #${segment.segmentIndex} has ${originalChars} chars; only ${renderedChars} will fit in ${textSafety.captionMaxLines} lines of ${textSafety.captionMaxCharsPerLine}.`,
      });
    }
  });

  return { warnings, errors };
}

export function mergeFindings(...sets: RenderComplianceFindings[]): RenderComplianceFindings {
  const warnings: ComplianceFinding[] = [];
  const errors: ComplianceFinding[] = [];
  for (const set of sets) {
    warnings.push(...set.warnings);
    errors.push(...set.errors);
  }
  return { warnings, errors };
}
