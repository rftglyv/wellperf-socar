"use client";

import React, { useRef } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton as UISkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

/** Kept for API compatibility. Entrance motion was removed: data screens should not animate in. */
export function useReveal<T extends HTMLElement>(_deps: unknown[] = []) {
  return useRef<T>(null);
}

const fmt = (v: number, decimals: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Formatted number (no count-up animation: engineers read the final value, not a tween). */
export function CountUp({ value, decimals = 0 }: { value: number | null | undefined; decimals?: number; duration?: number }) {
  if (value === null || value === undefined || Number.isNaN(value)) return <span>—</span>;
  return <span>{fmt(value, decimals)}</span>;
}

export function Skeleton({ h = 16, w = "100%", r, style }: { h?: number | string; w?: number | string; r?: number; style?: React.CSSProperties }) {
  return <UISkeleton style={{ height: h, width: w, ...(r !== undefined ? { borderRadius: Math.min(r, 8) } : {}), ...style }} />;
}

export function KpiSkeletons({ n = 4 }: { n?: number }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", n >= 3 && "lg:grid-cols-3", n >= 4 && "xl:grid-cols-4")}>
      {Array.from({ length: n }).map((_, i) => (
        <Card key={i} className="gap-3 py-5">
          <CardContent className="flex flex-col gap-3 px-5">
            <UISkeleton className="h-3 w-24" />
            <UISkeleton className="h-8 w-2/3" />
            <UISkeleton className="h-3 w-1/2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ChartSkeleton({ h = 320 }: { h?: number }) {
  return (
    <Card>
      <CardHeader>
        <UISkeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent>
        <UISkeleton style={{ height: h - 80 }} className="w-full" />
      </CardContent>
    </Card>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <UISkeleton key={i} className="h-4" style={{ width: `${90 - (i % 3) * 12}%` }} />
        ))}
      </CardContent>
    </Card>
  );
}

export function Kpi({
  label,
  value,
  unit,
  decimals = 0,
  foot,
  color,
}: {
  label: string;
  value: number | null | undefined;
  unit?: string;
  decimals?: number;
  foot?: React.ReactNode;
  color?: string;
}) {
  return (
    <Card className="gap-0 py-5">
      <CardContent className="flex flex-col gap-1.5 px-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {color && <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />}
          <span className="truncate">{label}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold tracking-tight tabular-nums">
            <CountUp value={value} decimals={decimals} />
          </span>
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        </div>
        {foot && <div className="text-xs text-muted-foreground tabular-nums">{foot}</div>}
      </CardContent>
    </Card>
  );
}

export function SectionHead({
  index,
  title,
  ghost,
  lead,
  actions,
}: {
  index: string;
  title: string;
  ghost?: string;
  lead?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  // Plain page title from the step name ("05 — Pressure transient analysis"); marketing title/ghost not rendered.
  void title;
  void ghost;
  const m = index.match(/^(\d+)\s*—\s*(.+)$/);
  const name = m ? m[2] : index;
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex max-w-3xl flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
        {lead && <p className="text-sm text-muted-foreground text-pretty">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StageBar({ running, label }: { running: boolean; label: string }) {
  if (!running) return null;
  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
      <Spinner className="text-primary" />
      <span>{label}</span>
    </div>
  );
}

export function ChartTip({ active, payload, label, labelFmt, units }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="grid min-w-36 gap-1.5 rounded-lg border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
      <div className="font-medium">{labelFmt ? labelFmt(label) : label}</div>
      {payload
        .filter((p: any) => p.value !== null && p.value !== undefined && p.name)
        // Area + Line pairs share a name; show each series once.
        .filter((p: any, i: number, arr: any[]) => arr.findIndex((q: any) => q.name === p.name) === i)
        .map((p: any) => (
          <div key={p.dataKey + p.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ background: p.stroke && p.stroke !== "none" ? p.stroke : p.color || p.fill }}
              />
              {p.name}
            </span>
            <span className="font-mono font-medium tabular-nums">
              {typeof p.value === "number" ? p.value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(p.value)}
              {units?.[p.dataKey] ? ` ${units[p.dataKey]}` : ""}
            </span>
          </div>
        ))}
    </div>
  );
}
