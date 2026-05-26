import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { gluonValueBaselines, gluonValueIndexSnapshots, type GluonValueBaseline } from "@shared/schema";

export const gviComponentKeys = ["USD", "EUR", "GBP", "CNY", "gold", "crude_oil"] as const;
export type GviComponentKey = typeof gviComponentKeys[number];

type GviInputValues = Partial<Record<GviComponentKey, number>>;

type ComponentDefinition = {
  key: GviComponentKey;
  label: string;
  weight: number;
  fallbackBaseline: number;
  fallbackCurrent: number;
  unit: string;
};

export type GviComponentResult = {
  key: GviComponentKey;
  label: string;
  weight: number;
  unit: string;
  baselineValue: number;
  currentValue: number;
  componentIndex: number;
  weightedContribution: number;
  source: string;
  timestamp: string;
  stale: boolean;
  fallback: boolean;
};

export type GviResult = {
  generatedAt: string;
  gviScore: number;
  formula: string;
  componentFormula: string;
  components: GviComponentResult[];
  weights: Record<GviComponentKey, number>;
  componentValues: Record<GviComponentKey, number>;
  componentIndexes: Record<GviComponentKey, number>;
  sourceMetadata: Record<GviComponentKey, {
    source: string;
    timestamp: string;
    stale: boolean;
    fallback: boolean;
  }>;
  fallbackUsed: boolean;
  stale: boolean;
  latestSnapshotId: string | null;
  latestSnapshotAt: string | null;
  safety: {
    gluonInternalContributionCreditOnly: true;
    gviInformationalIndexOnly: true;
    cashoutRedemptionDisabled: true;
    walletCreditPayoutPaymentAffected: false;
    publicApi: false;
    externalFetch: false;
    automaticWorker: false;
  };
  warnings: string[];
};

const COMPONENTS: ComponentDefinition[] = [
  { key: "USD", label: "USD", weight: 0.20, fallbackBaseline: 1, fallbackCurrent: 1, unit: "index" },
  { key: "EUR", label: "EUR", weight: 0.15, fallbackBaseline: 1.08, fallbackCurrent: 1.08, unit: "USD reference" },
  { key: "GBP", label: "GBP", weight: 0.10, fallbackBaseline: 1.26, fallbackCurrent: 1.26, unit: "USD reference" },
  { key: "CNY", label: "CNY", weight: 0.10, fallbackBaseline: 0.14, fallbackCurrent: 0.14, unit: "USD reference" },
  { key: "gold", label: "Gold", weight: 0.30, fallbackBaseline: 2300, fallbackCurrent: 2300, unit: "manual reference" },
  { key: "crude_oil", label: "Crude oil", weight: 0.15, fallbackBaseline: 80, fallbackCurrent: 80, unit: "manual reference" },
];

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function round(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10000) / 10000;
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function valueRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function baselineMap(rows: GluonValueBaseline[]) {
  const byKey = new Map<GviComponentKey, GluonValueBaseline>();
  for (const row of rows) {
    if ((gviComponentKeys as readonly string[]).includes(row.componentKey) && row.active) {
      byKey.set(row.componentKey as GviComponentKey, row);
    }
  }
  return byKey;
}

function normalizeInputValues(values?: GviInputValues | Record<string, unknown>) {
  const normalized: GviInputValues = {};
  for (const component of COMPONENTS) {
    const parsed = positiveNumber(values?.[component.key]);
    if (parsed != null) normalized[component.key] = parsed;
  }
  return normalized;
}

function weightsRecord() {
  return Object.fromEntries(COMPONENTS.map((component) => [component.key, component.weight])) as Record<GviComponentKey, number>;
}

class GluonValueIndexService {
  async getCurrent() {
    const [baselines, latestSnapshots] = await Promise.all([
      db.select().from(gluonValueBaselines)
        .where(eq(gluonValueBaselines.active, true))
        .orderBy(desc(gluonValueBaselines.effectiveDate)),
      db.select().from(gluonValueIndexSnapshots)
        .orderBy(desc(gluonValueIndexSnapshots.createdAt))
        .limit(1),
    ]);
    const latest = latestSnapshots[0] || null;
    const latestValues = latest ? valueRecord(latest.componentValues) : {};
    return this.calculate({
      componentValues: latestValues,
      baselineRows: baselines,
      source: latest ? "saved_manual_snapshot" : "manual_static_fallback",
      timestamp: latest?.createdAt || new Date(),
      latestSnapshotId: latest?.id || null,
      latestSnapshotAt: latest?.createdAt?.toISOString?.() || null,
      forceFallbackForMissing: true,
      staleOverride: latest ? Date.now() - new Date(latest.createdAt || new Date()).getTime() > STALE_AFTER_MS : true,
    });
  }

  async preview(componentValues?: GviInputValues | Record<string, unknown>) {
    const baselines = await db.select().from(gluonValueBaselines)
      .where(eq(gluonValueBaselines.active, true))
      .orderBy(desc(gluonValueBaselines.effectiveDate));
    return this.calculate({
      componentValues: normalizeInputValues(componentValues),
      baselineRows: baselines,
      source: "root_admin_manual_preview",
      timestamp: new Date(),
      latestSnapshotId: null,
      latestSnapshotAt: null,
      forceFallbackForMissing: true,
      staleOverride: false,
    });
  }

  async createSnapshot(componentValues: GviInputValues | Record<string, unknown> | undefined, createdBy: string) {
    const result = await this.preview(componentValues);
    const [snapshot] = await db.insert(gluonValueIndexSnapshots).values({
      componentValues: result.componentValues,
      componentIndexes: result.componentIndexes,
      weights: result.weights,
      gviScore: result.gviScore,
      sourceMetadata: result.sourceMetadata,
      fallbackUsed: result.fallbackUsed,
      stale: result.stale,
      createdBy,
    }).returning();

    return {
      snapshot,
      result: {
        ...result,
        latestSnapshotId: snapshot.id,
        latestSnapshotAt: snapshot.createdAt?.toISOString?.() || null,
      },
    };
  }

  private calculate(params: {
    componentValues: Record<string, unknown>;
    baselineRows: GluonValueBaseline[];
    source: string;
    timestamp: Date;
    latestSnapshotId: string | null;
    latestSnapshotAt: string | null;
    forceFallbackForMissing: boolean;
    staleOverride: boolean;
  }): GviResult {
    const baselines = baselineMap(params.baselineRows);
    const timestamp = params.timestamp.toISOString();
    let fallbackUsed = false;

    const components = COMPONENTS.map((component) => {
      const baselineRow = baselines.get(component.key);
      const baselineValue = positiveNumber(baselineRow?.baselineValue) || component.fallbackBaseline;
      const suppliedValue = positiveNumber(params.componentValues[component.key]);
      const fallback = suppliedValue == null;
      if (fallback) fallbackUsed = true;
      const currentValue = suppliedValue || component.fallbackCurrent;
      const componentIndex = baselineValue > 0 ? currentValue / baselineValue : 0;
      const stale = params.staleOverride || (fallback && params.forceFallbackForMissing);

      return {
        key: component.key,
        label: component.label,
        weight: component.weight,
        unit: component.unit,
        baselineValue: round(baselineValue),
        currentValue: round(currentValue),
        componentIndex: round(componentIndex),
        weightedContribution: round(component.weight * componentIndex),
        source: fallback ? "manual_static_fallback" : params.source,
        timestamp,
        stale,
        fallback,
      };
    });

    const gviScore = round(components.reduce((sum, component) => sum + component.weightedContribution, 0));
    const componentValues = Object.fromEntries(components.map((component) => [component.key, component.currentValue])) as Record<GviComponentKey, number>;
    const componentIndexes = Object.fromEntries(components.map((component) => [component.key, component.componentIndex])) as Record<GviComponentKey, number>;
    const sourceMetadata = Object.fromEntries(components.map((component) => [component.key, {
      source: component.source,
      timestamp: component.timestamp,
      stale: component.stale,
      fallback: component.fallback,
    }])) as GviResult["sourceMetadata"];

    return {
      generatedAt: new Date().toISOString(),
      gviScore,
      formula: "GVI = 0.20*USD_Index + 0.15*EUR_Index + 0.10*GBP_Index + 0.10*CNY_Index + 0.30*Gold_Index + 0.15*CrudeOil_Index",
      componentFormula: "ComponentIndex = CurrentValue / BaselineValue",
      components,
      weights: weightsRecord(),
      componentValues,
      componentIndexes,
      sourceMetadata,
      fallbackUsed,
      stale: components.some((component) => component.stale),
      latestSnapshotId: params.latestSnapshotId,
      latestSnapshotAt: params.latestSnapshotAt,
      safety: {
        gluonInternalContributionCreditOnly: true,
        gviInformationalIndexOnly: true,
        cashoutRedemptionDisabled: true,
        walletCreditPayoutPaymentAffected: false,
        publicApi: false,
        externalFetch: false,
        automaticWorker: false,
      },
      warnings: [
        "Gluon is an internal contribution credit, not withdrawable cash.",
        "GVI is an informational index, not a trading price.",
        "Cashout/redemption is disabled until compliance approval.",
        "No wallet, credit, payout, or payment balance is affected.",
      ],
    };
  }
}

export const gluonValueIndexService = new GluonValueIndexService();
