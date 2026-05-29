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
import { StalePendingHistoryEntry } from "./_shared";

export function StalePendingTrend({
  history,
  field,
  current,
  testid,
}: {
  history: StalePendingHistoryEntry[] | undefined;
  field: "messages" | "decisions" | "commands";
  current: number;
  testid: string;
}) {
  const series = (history ?? []).map((h) => h[field]);
  if (series.length < 2) {
    return (
      <span
        className="ml-1 text-[10px] text-muted-foreground"
        data-testid={`${testid}-empty`}
        title="Not enough sweep samples yet to show a trend"
      >
        (no trend yet)
      </span>
    );
  }
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const first = series[0];
  const delta = last - prev;
  const overall = last - first;
  const max = Math.max(...series, current, 1);
  const min = Math.min(...series, 0);
  const range = Math.max(1, max - min);
  const w = 64;
  const h = 18;
  const stepX = series.length > 1 ? w / (series.length - 1) : w;
  const points = series
    .map((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / range) * (h - 2) - 1;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "▬";
  const arrowClass =
    delta > 0
      ? "text-destructive"
      : delta < 0
        ? "text-emerald-500"
        : "text-muted-foreground";
  const stroke =
    overall > 0 ? "currentColor" : overall < 0 ? "currentColor" : "currentColor";
  const trendLabel =
    delta > 0
      ? `growing (+${delta.toLocaleString()} since previous sweep)`
      : delta < 0
        ? `shrinking (${delta.toLocaleString()} since previous sweep)`
        : "unchanged since previous sweep";
  return (
    <span
      className="ml-1 inline-flex items-center gap-1 align-middle"
      data-testid={testid}
      title={`Last ${series.length} sweeps for ${field}: ${trendLabel}`}
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className={arrowClass}
        aria-hidden="true"
      >
        <polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className={`text-[10px] font-semibold ${arrowClass}`}
        data-testid={`${testid}-arrow`}
      >
        {arrow}
        {delta !== 0 ? ` ${delta > 0 ? "+" : ""}${delta.toLocaleString()}` : ""}
      </span>
    </span>
  );
}
