import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts";

export function RestoreLogDailyActivityChart({
  activity,
  threshold,
}: {
  activity: { dayStartIso: string; count: number }[] | undefined;
  threshold: number;
}) {
  if (!activity || activity.length === 0) {
    return (
      <span
        className="text-[10px] text-muted-foreground"
        data-testid="chart-restore-log-daily-activity-empty"
        title="Not enough restore activity yet to chart"
      >
        (no history yet)
      </span>
    );
  }
  const counts = activity.map((a) => a.count);
  const max = Math.max(...counts, threshold > 0 ? threshold : 0, 1);
  // Task #578 — widen the chart proportionally for longer windows so 30 bars
  // remain readable without changing the chart's vertical footprint.
  const n = activity.length;
  const h = 22;
  const barGap = n > 14 ? 1 : 2;
  const w = n <= 7 ? 84 : n <= 14 ? 140 : 220;
  const barW = Math.max(1.5, (w - barGap * (n - 1)) / n);
  const thresholdY =
    threshold > 0 ? h - (threshold / max) * (h - 2) - 1 : null;
  const todayIdx = activity.length - 1;
  const todayCount = counts[todayIdx] ?? 0;
  const prevDays = counts.slice(0, todayIdx);
  const prevMax = prevDays.length > 0 ? Math.max(...prevDays) : 0;
  const isSpike = todayCount > 0 && todayCount > prevMax;
  const summary = (() => {
    if (prevDays.length === 0) return "Only today on record so far";
    if (todayCount === 0) return "No restores yet today";
    if (isSpike) {
      return `Today (${todayCount.toLocaleString()}) is higher than any of the previous ${prevDays.length} day(s) (peak ${prevMax.toLocaleString()})`;
    }
    return `Today (${todayCount.toLocaleString()}) is within the recent ${prevDays.length}-day range (peak ${prevMax.toLocaleString()})`;
  })();
  return (
    <span
      className="inline-flex items-center gap-1 align-middle"
      data-testid="chart-restore-log-daily-activity"
      title={`Last ${activity.length} days of audience_restore_log inserts. ${summary}.`}
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        aria-hidden="true"
        className="overflow-visible"
      >
        {activity.map((a, i) => {
          const barH = max > 0 ? (a.count / max) * (h - 2) : 0;
          const x = i * (barW + barGap);
          const y = h - barH;
          const isToday = i === todayIdx;
          const overThreshold = threshold > 0 && a.count >= threshold;
          const fill = isToday
            ? overThreshold
              ? "hsl(var(--destructive))"
              : "hsl(var(--primary))"
            : overThreshold
              ? "hsl(var(--destructive) / 0.55)"
              : "currentColor";
          return (
            <rect
              key={a.dayStartIso}
              x={x}
              y={y}
              width={barW}
              height={Math.max(barH, a.count > 0 ? 1 : 0)}
              fill={fill}
              opacity={isToday ? 1 : 0.55}
              data-testid={`chart-restore-log-day-${i}`}
              data-count={a.count}
              data-day={a.dayStartIso}
            >
              <title>
                {new Date(a.dayStartIso).toISOString().slice(0, 10)}:{" "}
                {a.count.toLocaleString()} restore{a.count === 1 ? "" : "s"}
                {isToday ? " (today)" : ""}
              </title>
            </rect>
          );
        })}
        {thresholdY !== null && (
          <line
            x1={0}
            x2={w}
            y1={thresholdY}
            y2={thresholdY}
            stroke="hsl(var(--destructive))"
            strokeWidth={0.75}
            strokeDasharray="2 2"
            data-testid="chart-restore-log-threshold-line"
          >
            <title>Alert threshold: {threshold.toLocaleString()}/day</title>
          </line>
        )}
      </svg>
      <span
        className="text-[10px] text-muted-foreground"
        data-testid="chart-restore-log-daily-activity-label"
      >
        {activity.length}d
      </span>
    </span>
  );
}

export function RestoreLogActivityTrendPill({
  activity,
  threshold,
}: {
  activity: { dayStartIso: string; count: number }[] | undefined;
  threshold: number;
}) {
  const counts = (activity ?? []).map((a) => a.count);
  const half = Math.floor(counts.length / 2);
  if (half < 1) {
    return (
      <span
        className="inline-flex items-center rounded border border-border bg-muted/40 px-1 py-0.5 text-[10px] leading-none text-muted-foreground"
        data-testid="trend-restore-log-activity-empty"
        title="Need at least 2 days of activity to compare halves"
      >
        —
      </span>
    );
  }
  const recent = counts.slice(counts.length - half);
  const previous = counts.slice(counts.length - 2 * half, counts.length - half);
  const recentSum = recent.reduce((s, n) => s + n, 0);
  const prevSum = previous.reduce((s, n) => s + n, 0);
  const recentAvg = recentSum / half;
  let direction: "up" | "down" | "flat";
  let pct: number;
  if (prevSum === 0 && recentSum === 0) {
    direction = "flat";
    pct = 0;
  } else if (prevSum === 0) {
    direction = "up";
    pct = Infinity;
  } else {
    const delta = ((recentSum - prevSum) / prevSum) * 100;
    pct = Math.abs(delta);
    direction = delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat";
  }
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "—";
  const pctLabel = !isFinite(pct)
    ? "∞%"
    : direction === "flat"
      ? "0%"
      : `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
  // Red when the trend is up AND the recent-half daily average crosses the
  // configured restore-log rate threshold (the same threshold the founder
  // alert email uses). Threshold of 0 disables the alert color entirely.
  const aboveRateThreshold = threshold > 0 && recentAvg >= threshold;
  const isAlert = direction === "up" && aboveRateThreshold;
  const colorClass = isAlert
    ? "border-destructive/40 bg-destructive/10 text-destructive"
    : direction === "up"
      ? "border-border bg-muted/40 text-foreground"
      : direction === "down"
        ? "border-border bg-muted/40 text-emerald-600 dark:text-emerald-400"
        : "border-border bg-muted/40 text-muted-foreground";
  const title = `Last ${half} day${half === 1 ? "" : "s"} (${recentSum.toLocaleString()}, avg ${recentAvg.toFixed(1)}/day) vs previous ${half} day${half === 1 ? "" : "s"} (${prevSum.toLocaleString()}): ${
    direction === "up"
      ? `up ${pctLabel}`
      : direction === "down"
        ? `down ${pctLabel}`
        : "flat"
  }${
    threshold > 0
      ? aboveRateThreshold
        ? ` — recent avg is at/above rate threshold ${threshold.toLocaleString()}/day`
        : ` — rate threshold ${threshold.toLocaleString()}/day`
      : ""
  }`;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded border px-1 py-0.5 text-[10px] leading-none ${colorClass}`}
      data-testid="trend-restore-log-activity"
      data-direction={direction}
      data-pct={isFinite(pct) ? pct.toFixed(2) : "inf"}
      data-alert={isAlert ? "true" : "false"}
      data-recent-avg={recentAvg.toFixed(2)}
      data-threshold={threshold}
      title={title}
    >
      <span aria-hidden="true">{arrow}</span>
      <span>{pctLabel}</span>
    </span>
  );
}
