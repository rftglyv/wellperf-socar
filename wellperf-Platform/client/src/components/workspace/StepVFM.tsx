"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Play, RotateCw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { EngineStatus, engineGet, enginePost, fmt, fmtDate, tickDate } from "./api";
import { ChartSkeleton, ChartTip, Kpi, KpiSkeletons, SectionHead, StageBar, TableSkeleton, useReveal } from "./ui";
import { usePrefs } from "./prefs";

interface Props {
  status: EngineStatus;
  run: () => Promise<void>;
  running: boolean;
  goNext: () => void;
  well: string;
  setWell: (w: string) => void;
}

const AXIS = { fill: "var(--muted-foreground)", fontSize: 11 };
const colorOf = (k: string) => (k === "oil_rate_stbd" ? "var(--chart-1)" : k === "water_rate_stbd" ? "var(--chart-2)" : "var(--chart-3)");

function Swatch({ color, round, faint }: { color: string; round?: boolean; faint?: boolean }) {
  return <i className={cn("inline-block size-2.5 shrink-0", round ? "rounded-full" : "rounded-sm", faint && "opacity-25")} style={{ background: color }} />;
}

function PhaseStat({ color, label, value, sub }: { color: string; label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Swatch color={color} round />
        {label}
      </span>
      <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
      {sub && <span className="font-mono text-xs text-muted-foreground tabular-nums">{sub}</span>}
    </div>
  );
}

const PHASES = [
  ["oil_rate_stbd", "oil", "STB/d"],
  ["water_rate_stbd", "water", "STB/d"],
  ["gas_rate_mscfd", "gas", "Mscf/d"],
] as const;

export function StepVFM({ status, run, running, goNext, well, setWell }: Props) {
  const { t } = usePrefs();
  const st = status.stages.vfm;
  const meta = status.meta.vfm;
  const done = st === "done";
  const wells: string[] = status.meta.clean?.wells || [];
  const [field, setField] = useState<any[] | null>(null);
  const [wellData, setWellData] = useState<any | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [phase, setPhase] = useState<string>("oil_rate_stbd");
  const ref = useReveal<HTMLDivElement>([done, meta?.rows]);
  const vref = status.reference?.vfm;

  useEffect(() => {
    if (!done) return;
    setField(null);
    setPreview(null);
    engineGet("/api/field/rates").then((d) => setField(d.rows)).catch(() => setField([]));
    engineGet("/api/preview/vfm?limit=60").then(setPreview).catch(() => setPreview(null));
  }, [done, meta?.rows, meta?.cum_oil]);

  useEffect(() => {
    if (!done || !well) return;
    setWellData(null);
    engineGet(`/api/wells/${well}/rates`).then(setWellData).catch(() => setWellData({ rows: [], tests: [] }));
  }, [done, well, meta?.cum_oil]);

  const wellRows = useMemo(() => {
    if (!wellData) return [];
    const tests = new Map<string, any>();
    (wellData.tests || []).forEach((x: any) => tests.set(String(x.test_start).slice(0, 10), x));
    return wellData.rows.map((r: any) => {
      const x = tests.get(String(r.date).slice(0, 10));
      return { ...r, band: r[`${phase}_p10`] != null ? [r[`${phase}_p10`], r[`${phase}_p90`]] : null, test: x ? x[phase] : null };
    });
  }, [wellData, phase]);

  const ph = PHASES.find((p) => p[0] === phase)!;
  const acc = meta?.accuracy_vs_uploaded_tests;
  const c = colorOf(phase);

  const recalOn = !!(status as any).recalibrate;

  return (
    <div ref={ref}>
      <SectionHead
        index={t("s_vfm")}
        title={t("v_title")}
        ghost={t("v_ghost")}
        lead={t("v_lead")}
        actions={
          <>
            <Button variant={done ? "outline" : "default"} onClick={run} disabled={running || status.stages.clean !== "done"}>
              {done ? <RotateCw /> : <Play />} {done ? t("rerun") : t("v_run")}
            </Button>
            <Button variant={done ? "default" : "outline"} onClick={goNext} disabled={!done}>
              {t("v_next")} <ArrowRight />
            </Button>
          </>
        }
      />

      <StageBar running={running} label={t("v_bar")} />
      {st === "stale" && (
        <Alert className="mb-6">
          <AlertDescription>{t("v_stale")}</AlertDescription>
        </Alert>
      )}

      {running && !meta ? (
        <div className="flex flex-col gap-7">
          <KpiSkeletons />
          <ChartSkeleton h={360} />
        </div>
      ) : !meta ? (
        <Empty className="border" data-reveal>
          <EmptyDescription>{status.stages.clean === "done" ? t("v_ready") : t("v_need")}</EmptyDescription>
        </Empty>
      ) : (
        <div className="flex flex-col gap-7">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label={t("v_field_oil")} value={meta.field_oil} unit="STB/d" color="var(--chart-1)" foot={t("v_predicted_days", { n: fmt(meta.rows) })} />
            <Kpi label={t("v_field_water")} value={meta.field_water} unit="STB/d" color="var(--chart-2)" />
            <Kpi label={t("v_field_gas")} value={meta.field_gas} unit="Mscf/d" color="var(--chart-3)" />
            <Kpi
              label={acc ? t("v_err_tests") : t("v_cum")}
              value={acc ? acc.oil_rate_stbd : meta.cum_oil}
              unit={acc ? "% MAPE" : "STB"}
              decimals={acc ? 2 : 0}
              color="var(--primary)"
              foot={acc ? `${acc.n_tests} · ${t("water")} ${fmt(acc.water_rate_stbd, 1)}% · ${t("gas")} ${fmt(acc.gas_rate_mscfd, 1)}%` : t("v_cum_foot")}
            />
          </div>

          {(meta.recalibration || status.parts.some((p) => p.kind === "tests")) && (
            <Card data-reveal>
              <CardContent className="flex flex-wrap items-center justify-between gap-6">
                <div className="flex max-w-[640px] flex-col gap-1.5">
                  <CardTitle>{t("v_recal")}</CardTitle>
                  <CardDescription className="leading-relaxed tabular-nums">
                    {meta.recalibration
                      ? t("v_recal_on", { n: meta.recalibration.tests_added, total: meta.recalibration.tests_total })
                      : recalOn
                      ? t("v_recal_none")
                      : t("v_recal_off")}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-7">
                  {meta.recalibration?.loo_mape &&
                    PHASES.map(([k, l]) => (
                      <PhaseStat key={k} color={colorOf(k)} label={`${t(l)} · LOTO`} value={`${fmt(meta.recalibration.loo_mape[k], 2)}%`} />
                    ))}
                  <Switch
                    checked={recalOn}
                    aria-label={t("v_recal")}
                    disabled={running}
                    onCheckedChange={async () => {
                      await enginePost("/api/settings", { recalibrate: !recalOn });
                      await run();
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {vref && (
            <Card data-reveal>
              <CardContent className="flex flex-wrap items-center justify-between gap-6">
                <div className="flex flex-col gap-1.5">
                  <CardTitle>{t("v_ref")}</CardTitle>
                  <CardDescription className="font-mono text-xs tabular-nums">{t("v_ref_sub", { file: vref.file, n: vref.rows_matched })}</CardDescription>
                </div>
                <div className="flex flex-wrap items-start gap-7">
                  {PHASES.map(([k, l]) => (
                    <PhaseStat
                      key={k}
                      color={colorOf(k)}
                      label={`${t(l)} · ${t("v_mape")}`}
                      value={`${fmt(vref.phases?.[k]?.mape, 2)}%`}
                      sub={`${t("v_bias")} ${fmt(vref.phases?.[k]?.bias_pct, 2)}%`}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card data-reveal>
            <CardHeader>
              <CardTitle>{t("v_field")}</CardTitle>
              <CardAction className="flex items-center gap-4 text-xs text-muted-foreground">
                {PHASES.map(([k, l]) => (
                  <span key={k} className="flex items-center gap-1.5">
                    <Swatch color={colorOf(k)} />
                    {t(l)}
                  </span>
                ))}
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="h-[280px]">
                {!field ? (
                  <ChartSkeleton h={260} />
                ) : (
                  <ResponsiveContainer>
                    <AreaChart data={field} margin={{ top: 8, right: 18, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="date" tickFormatter={tickDate} minTickGap={40} tickLine={false} axisLine={false} tick={AXIS} />
                      <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v) => fmt(v)} tick={AXIS} />
                      <Tooltip content={<ChartTip labelFmt={(x: string) => fmtDate(x)} />} />
                      {PHASES.map(([k, l]) => (
                        <Area key={k} type="monotone" dataKey={k} name={t(l)} stroke={colorOf(k)} strokeWidth={1.5} fill={colorOf(k)} fillOpacity={0.1} isAnimationActive={false} />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3" data-reveal>
              <ToggleGroup type="single" variant="outline" size="sm" value={phase} onValueChange={(v) => v && setPhase(v)} aria-label={t("v_daily")}>
                {PHASES.map(([k, l]) => (
                  <ToggleGroupItem key={k} value={k} className="px-3">
                    {t(l)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {wells.length > 0 && (
                <Select value={well} onValueChange={setWell}>
                  <SelectTrigger size="sm" className="min-w-32 font-mono" aria-label={t("well")}>
                    <SelectValue placeholder={t("well")} />
                  </SelectTrigger>
                  <SelectContent>
                    {wells.map((w) => (
                      <SelectItem key={w} value={w} className="font-mono">
                        {w}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <Card data-reveal>
                <CardHeader>
                  <CardTitle>
                    {well} · {t(ph[1])}
                  </CardTitle>
                  <CardAction className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Swatch color={c} />
                      {t("v_daily")}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Swatch color={c} faint />
                      {t("v_band")}
                    </span>
                    {wellData?.tests?.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        <Swatch color="var(--foreground)" round />
                        {t("v_test")}
                      </span>
                    )}
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    {!wellData ? (
                      <ChartSkeleton h={280} />
                    ) : (
                      <ResponsiveContainer>
                        <ComposedChart data={wellRows} margin={{ top: 8, right: 18, left: 0, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke="var(--border)" />
                          <XAxis dataKey="date" tickFormatter={tickDate} minTickGap={40} tickLine={false} axisLine={false} tick={AXIS} />
                          <YAxis tickLine={false} axisLine={false} width={56} domain={["auto", "auto"]} tickFormatter={(v) => fmt(v)} tick={AXIS} />
                          <Tooltip content={<ChartTip labelFmt={(x: string) => fmtDate(x)} />} />
                          <Area dataKey="band" name={t("v_band")} stroke="none" fill={c} fillOpacity={0.14} isAnimationActive={false} />
                          <Line dataKey={phase} name={`VFM ${t(ph[1])}`} stroke={c} strokeWidth={2} dot={false} isAnimationActive={false} />
                          <Scatter dataKey="test" name={t("v_test")} fill="var(--foreground)" isAnimationActive={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card data-reveal>
                <CardHeader>
                  <CardTitle>{t("v_avg")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("well")}</TableHead>
                        <TableHead className="text-right">{t("oil")}</TableHead>
                        <TableHead className="text-right">{t("water")}</TableHead>
                        <TableHead className="text-right">{t("gas")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(meta.per_well || []).map((r: any) => (
                        <TableRow
                          key={r.well_name}
                          data-state={r.well_name === well ? "selected" : undefined}
                          onClick={() => setWell(r.well_name)}
                          className="cursor-pointer"
                        >
                          <TableCell className="font-mono">{r.well_name}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{fmt(r.oil)}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{fmt(r.water)}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{fmt(r.gas)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card data-reveal>
            <CardHeader>
              <CardTitle>{t("v_preview")}</CardTitle>
              <CardDescription className="font-mono text-xs tabular-nums">
                date · well_name · oil_rate_stbd · water_rate_stbd · gas_rate_mscfd — {fmt(preview?.total)} {t("rows")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {!preview ? (
                <TableSkeleton rows={5} />
              ) : (
                <div className="max-h-80 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow>
                        <TableHead>date</TableHead>
                        <TableHead>well_name</TableHead>
                        <TableHead className="text-right">oil_rate_stbd</TableHead>
                        <TableHead className="text-right">water_rate_stbd</TableHead>
                        <TableHead className="text-right">gas_rate_mscfd</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.map((r: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono tabular-nums">{r.date}</TableCell>
                          <TableCell className="font-mono">{r.well_name}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{fmt(r.oil_rate_stbd, 1)}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{fmt(r.water_rate_stbd, 1)}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{fmt(r.gas_rate_mscfd, 1)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {meta.status_counts && (
                <div className="flex flex-wrap items-center gap-2">
                  {Object.entries(meta.status_counts).map(([k, v]: any) => (
                    <Badge
                      key={k}
                      variant="outline"
                      className={cn(
                        "h-auto max-w-full shrink whitespace-normal font-mono tabular-nums",
                        k === "sensor-based" ? "border-success/40 text-success" : k.includes("interpolated") ? "border-warning/40 text-warning" : "text-muted-foreground"
                      )}
                    >
                      {t(`ds:${k}`) === `ds:${k}` ? k : t(`ds:${k}`)} · {v}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
