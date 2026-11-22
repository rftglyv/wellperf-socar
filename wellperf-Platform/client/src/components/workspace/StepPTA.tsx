"use client";

import React, { useEffect, useState } from "react";
import { ArrowRight, Play, RotateCcw, RotateCw, TriangleAlert } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { EngineStatus, engineGet, enginePost, fmt, fmtDate } from "./api";
import { ChartSkeleton, ChartTip, CountUp, SectionHead, Skeleton, StageBar, useReveal } from "./ui";
import { usePrefs } from "./prefs";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface Props {
  status: EngineStatus;
  run: () => Promise<void>;
  running: boolean;
  goNext: () => void;
  notify: (t: string, type?: "ok" | "error") => void;
  refresh: () => Promise<void>;
}

type PlotMode = "loglog" | "horner" | "mdh" | "history";
const PLOTS: [PlotMode, string][] = [
  ["loglog", "p_loglog"],
  ["horner", "p_horner"],
  ["mdh", "p_mdh"],
  ["history", "p_hist"],
];

/** Chart colours follow the theme tokens (chart-4 = pressure, chart-5 = derivative). */
const C = {
  press: "var(--chart-4)",
  deriv: "var(--chart-5)",
  oil: "var(--chart-1)",
  iarf: "var(--primary)",
  axis: "var(--muted-foreground)",
  grid: "var(--border)",
  danger: "var(--destructive)",
};
const tick = { fill: C.axis, fontSize: 11 };

/** Radial-flow quality: good / indicative / no radial flow. */
const qualityClass = (q: string) =>
  q === "good"
    ? "border-success/30 bg-success/10 text-success"
    : q === "indicative"
      ? "border-warning/30 bg-warning/10 text-warning"
      : "border-destructive/30 bg-destructive/10 text-destructive";

function QualityBadge({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <Badge variant="outline" className={qualityClass(q)}>
      {children}
    </Badge>
  );
}

const sci = (v: number) => (v >= 100 ? fmt(v) : v >= 1 ? fmt(v, 1) : fmt(v, 2));

function LogTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="grid gap-0.5 rounded-md border bg-popover px-2.5 py-1.5 font-mono text-xs text-popover-foreground tabular-nums shadow-md">
      {Object.entries(p || {})
        .filter(([, v]) => typeof v === "number")
        .map(([k, v]: any) => (
          <div key={k}>
            {k}: {v.toLocaleString("en-US", { maximumFractionDigits: 3 })}
          </div>
        ))}
    </div>
  );
}

function Plot({ d, mode, t }: { d: any; mode: PlotMode; t: (k: string) => string }) {
  const H = 380;
  const axisLabel = { fill: C.axis, fontSize: 11 };
  const axis = { tick, stroke: C.grid };
  if (mode === "loglog") {
    const dp = d.loglog.dte.map((x: number, i: number) => ({ t: x, v: d.loglog.dp[i] })).filter((p: any) => p.t > 0 && p.v > 0);
    const dv = d.loglog.dte.map((x: number, i: number) => ({ t: x, v: d.loglog.deriv[i] })).filter((p: any) => p.t > 0 && p.v > 0);
    const [a, b] = d.loglog.iarf;
    const lvl = [
      { t: a, v: d.loglog.level },
      { t: b, v: d.loglog.level },
    ];
    const t0 = dp[0];
    const unit = t0 ? [{ t: t0.t, v: t0.v }, { t: t0.t * 10, v: t0.v * 10 }] : [];
    return (
      <ResponsiveContainer height={H}>
        <ScatterChart margin={{ top: 10, right: 16, left: 4, bottom: 18 }}>
          <CartesianGrid stroke={C.grid} />
          <XAxis dataKey="t" type="number" scale="log" domain={["auto", "auto"]} allowDataOverflow tickFormatter={sci} {...axis} label={{ value: "Δte (h)", position: "insideBottom", offset: -10, ...axisLabel }} />
          <YAxis dataKey="v" type="number" scale="log" domain={["auto", "auto"]} allowDataOverflow tickFormatter={sci} width={56} {...axis} label={{ value: "Δp, Δp' (psi)", angle: -90, position: "insideLeft", ...axisLabel }} />
          <Tooltip content={<LogTip />} />
          <ReferenceArea x1={a} x2={b} fill={C.iarf} fillOpacity={0.1} strokeOpacity={0} />
          <Scatter name={t("p_dp")} data={dp} fill={C.press} isAnimationActive={false} />
          <Scatter name={t("p_deriv")} data={dv} fill={C.deriv} isAnimationActive={false} />
          <Scatter name={t("p_iarf")} data={lvl} line={{ stroke: C.iarf, strokeWidth: 3 }} shape={() => <g />} isAnimationActive={false} />
          <Scatter name={t("p_unit")} data={unit} line={{ stroke: C.axis, strokeDasharray: "4 4" }} shape={() => <g />} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }
  if (mode === "horner" || mode === "mdh") {
    const src = mode === "horner" ? d.horner : d.mdh;
    const xs: number[] = mode === "horner" ? src.ht : src.dt;
    const pts = xs.map((x: number, i: number) => ({ x, p: src.pws[i] })).filter((p: any) => p.x > 0 && p.p != null);
    const [lo, hi] = src.iarf_idx;
    const iarf = xs.slice(lo, hi + 1).map((x: number, i: number) => ({ x, p: src.pws[lo + i] }));
    const line = mode === "horner" ? d.horner.line.x.map((x: number, i: number) => ({ x, p: d.horner.line.y[i] })) : [];
    return (
      <ResponsiveContainer height={H}>
        <ScatterChart margin={{ top: 10, right: 16, left: 4, bottom: 18 }}>
          <CartesianGrid stroke={C.grid} />
          <XAxis
            dataKey="x"
            type="number"
            scale="log"
            domain={["auto", "auto"]}
            reversed={mode === "horner"}
            allowDataOverflow
            tickFormatter={sci}
            {...axis}
            label={{ value: mode === "horner" ? "(tp + Δt)/Δt" : "Δt (h)", position: "insideBottom", offset: -10, ...axisLabel }}
          />
          <YAxis dataKey="p" type="number" domain={["auto", "auto"]} width={60} tickFormatter={(v) => fmt(v)} {...axis} label={{ value: "pws (psia)", angle: -90, position: "insideLeft", ...axisLabel }} />
          <Tooltip content={<LogTip />} />
          <Scatter name={t("p_pws")} data={pts} fill={C.press} isAnimationActive={false} />
          <Scatter name={t("p_iarf_pts")} data={iarf} fill={C.iarf} isAnimationActive={false} />
          {line.length > 0 && <Scatter name={t("p_line")} data={line} line={{ stroke: C.deriv, strokeDasharray: "6 4", strokeWidth: 1.5 }} shape={() => <g />} isAnimationActive={false} />}
        </ScatterChart>
      </ResponsiveContainer>
    );
  }
  const h = d.history;
  const byDay = new Map<string, number>();
  h.days.forEach((day: string, i: number) => byDay.set(day.slice(0, 10), h.oil[i]));
  const rows = h.t.map((x: string, i: number) => ({ t: x, p: h.p[i], oil: byDay.get(x.slice(0, 10)) ?? null }));
  const startIdx = rows.findIndex((r: any) => r.t >= d.shut_in_start);
  const endIdx = rows.findIndex((r: any) => r.t >= d.shut_in_end);
  return (
    <ResponsiveContainer height={H}>
      <ComposedChart data={rows} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="t" tickFormatter={(x) => fmtDate(x)} minTickGap={70} tickLine={false} axisLine={false} tick={tick} />
        <YAxis yAxisId="p" domain={["auto", "auto"]} width={58} tickFormatter={(v) => fmt(v)} tickLine={false} axisLine={false} tick={tick} />
        <YAxis yAxisId="q" orientation="right" width={52} tickFormatter={(v) => fmt(v)} tickLine={false} axisLine={false} tick={tick} />
        <Tooltip content={<ChartTip labelFmt={(x: string) => fmtDate(x, true)} />} />
        {startIdx >= 0 && <ReferenceArea yAxisId="p" x1={rows[startIdx].t} x2={rows[endIdx >= 0 ? endIdx : rows.length - 1].t} fill={C.danger} fillOpacity={0.12} strokeOpacity={0} />}
        <Area yAxisId="q" type="stepAfter" dataKey="oil" name={t("p_oil_daily")} stroke={C.oil} strokeWidth={1.2} fill={C.oil} fillOpacity={0.12} isAnimationActive={false} />
        <Line yAxisId="p" dataKey="p" name={t("p_dhp")} stroke={C.press} strokeWidth={1.3} dot={false} isAnimationActive={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={cn("inline-block h-0.5 w-3", dashed ? "border-t border-dashed" : "rounded-full")} style={dashed ? { borderColor: color } : { background: color, height: 8, width: 8 }} />
      {label}
    </span>
  );
}

export function StepPTA({ status, run, running, goNext, notify, refresh }: Props) {
  const { t } = usePrefs();
  const st = status.stages.pta;
  const meta = status.meta.pta;
  const done = st === "done";
  const results: any[] = meta?.results || [];
  const pref = status.reference?.pta;
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [mode, setMode] = useState<PlotMode>("loglog");
  const [q, setQ] = useState("");
  const [ws, setWs] = useState("");
  const [we, setWe] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useReveal<HTMLDivElement>([done, results.length]);

  useEffect(() => {
    if (!done) return;
    if (!sel || !results.find((r) => r.event_id === sel)) setSel(results[0]?.event_id || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, results.length]);

  useEffect(() => {
    if (!sel || !done) return;
    setDetail(null);
    engineGet(`/api/pta/${sel}`)
      .then((d) => {
        setDetail(d);
        setQ("");
        setWs("");
        setWe("");
      })
      .catch((e) => notify(e.message, "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, done]);

  const override = async (reset = false) => {
    if (!sel) return;
    setBusy(true);
    try {
      const d = await enginePost(`/api/pta/${sel}/override`, reset ? { reset: true } : { q_oil_stbd: q || null, window_start_hours: ws || null, window_end_hours: we || null });
      setDetail(d);
      await refresh();
      notify(reset ? t("p_restored") : t("p_reanalysed"));
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const r = detail?.result;
  const qLabel = (x: string) => t(`q_${x}`);

  return (
    <div ref={ref}>
      <SectionHead
        index={t("s_pta")}
        title={t("p_title")}
        ghost={t("p_ghost")}
        lead={t("p_lead")}
        actions={
          <>
            <Button variant={done ? "outline" : "default"} onClick={run} disabled={running || status.stages.vfm !== "done"}>
              {done ? <RotateCw /> : <Play />} {done ? t("rerun") : t("p_run")}
            </Button>
            <Button variant={done ? "default" : "outline"} onClick={goNext} disabled={!done}>
              {t("p_next")} <ArrowRight />
            </Button>
          </>
        }
      />
      <StageBar running={running} label={t("p_bar")} />
      {st === "stale" && (
        <Alert className="mb-6 border-warning/40">
          <TriangleAlert className="text-warning" />
          <AlertDescription>{t("p_stale")}</AlertDescription>
        </Alert>
      )}

      {running && !meta ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <ChartSkeleton h={440} />
          <Card className="gap-3 px-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} h={44} />
            ))}
          </Card>
        </div>
      ) : !meta ? (
        <Empty className="border" data-reveal>
          <EmptyHeader>
            <EmptyDescription>{status.stages.vfm === "done" ? t("p_ready") : t("v_need")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : results.length === 0 ? (
        <Empty className="border" data-reveal>
          <EmptyHeader className="max-w-2xl">
            <EmptyTitle>{t("p_none")}</EmptyTitle>
            <EmptyDescription>
              {t("p_none_why", {
                a: fmtDate(status.meta.clean?.period_start),
                b: fmtDate(status.meta.clean?.period_end),
                d: status.meta.clean?.days ?? "—",
                w: (status.meta.clean?.wells || []).join(", ") || "—",
              })}
            </EmptyDescription>
          </EmptyHeader>
          {meta.failed?.length > 0 && (
            <div className="flex flex-col gap-1 font-mono text-xs text-muted-foreground">
              {meta.failed.map((f: any) => (
                <div key={f.event_id}>
                  {f.event_id}: {f.error}
                </div>
              ))}
            </div>
          )}
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={2}
            value={sel ?? ""}
            onValueChange={(v) => v && setSel(v)}
            className="w-full flex-wrap"
            data-reveal
          >
            {results.map((x) => (
              <ToggleGroupItem key={x.event_id} value={x.event_id} className="font-mono text-xs tabular-nums data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-foreground">
                {x.well_name} · {fmtDate(x.shut_in_start)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["p_perm", r?.permeability_md, "md", 1],
              ["p_skin", r?.skin, "", 2],
              ["p_slope", r?.horner_slope_psi_cycle, "psi/cycle", 2],
              ["p_dpskin", r?.delta_p_skin_psi, "psi", 1],
            ].map(([l, v, u, dec]: any) => (
              <Card key={l} className="gap-2 px-6 py-5" data-reveal>
                <div className="text-sm text-muted-foreground">{t(l)}</div>
                <div className="flex items-baseline gap-1.5 text-3xl font-semibold tracking-tight tabular-nums">
                  {r ? <CountUp value={v} decimals={dec} duration={0.8} /> : <Skeleton h={36} w="60%" />}
                  {u && <span className="text-sm font-normal text-muted-foreground">{u}</span>}
                </div>
                {l === "p_perm" && r && (
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {t("p_wrange")} {fmt(r.k_min_md, 0)}–{fmt(r.k_max_md, 0)} md
                  </div>
                )}
                {l === "p_skin" && r && (
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {t("p_range")} {fmt(r.skin_min, 1)} … {fmt(r.skin_max, 1)}
                  </div>
                )}
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card className="min-w-0 gap-4" data-reveal>
              <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                <Tabs value={mode} onValueChange={(v) => setMode(v as PlotMode)} className="max-w-full overflow-x-auto">
                  <TabsList>
                    {PLOTS.map(([k, l]) => (
                      <TabsTrigger key={k} value={k}>
                        {t(l)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                {r && (
                  <QualityBadge q={r.iarf_quality}>
                    {t("p_radial")} · {qLabel(r.iarf_quality)}
                  </QualityBadge>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {detail ? <Plot d={detail} mode={mode} t={t} /> : <ChartSkeleton h={380} />}
                {mode === "loglog" && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <LegendItem color={C.press} label={t("p_dp")} />
                    <LegendItem color={C.deriv} label={t("p_deriv")} />
                    <LegendItem color={C.iarf} label={t("p_iarf")} />
                    <LegendItem color={C.axis} label={t("p_unit")} dashed />
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-4">
              <Card className="gap-4" data-reveal>
                <CardHeader>
                  <CardTitle>{t("p_interp")}</CardTitle>
                </CardHeader>
                <CardContent>
                  {!detail ? (
                    <div className="flex flex-col gap-2.5">
                      <Skeleton h={12} />
                      <Skeleton h={12} w="85%" />
                      <Skeleton h={12} w="70%" />
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-2.5 text-sm leading-relaxed text-muted-foreground">
                      {detail.interpretation.map((n: string, i: number) => (
                        <li key={i} className="rounded-md bg-muted/50 px-3 py-2">
                          {n}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className="gap-2" data-reveal>
                <CardHeader>
                  <CardTitle>{t("p_inputs")}</CardTitle>
                </CardHeader>
                <CardContent>
                  {!detail ? (
                    <Skeleton h={160} />
                  ) : (
                    <Table>
                      <TableBody>
                        {[
                          [t("p_q"), `${fmt(r.q_oil_stbd, 1)} STB/d`, detail.q_source === "override" ? "override" : "VFM"],
                          [t("p_tp"), `${fmt(r.tp_hours)} h`],
                          [t("p_pwf"), `${fmt(r.pwf_psia, 1)} psia`],
                          [t("p_pstar"), `${fmt(r.p_star_psia, 1)} psia`],
                          ["p1hr", `${fmt(r.p1hr_psia, 1)} psia`],
                          [t("p_window"), `${fmt(r.iarf_start_hours, 2)}–${fmt(r.iarf_end_hours, 2)} h`, r.window_source],
                          [t("p_r2"), fmt(r.horner_fit_r2, 4)],
                          [t("p_pi"), `${fmt(r.productivity_index_stbd_psi, 2)} STB/d/psi`],
                          [t("p_fe"), `${fmt((r.flow_efficiency || 0) * 100, 0)} %`],
                          [t("p_ri"), `${fmt(r.radius_of_investigation_ft)} ft`],
                          ["B · μ · h", `${detail.inputs.oil_fvf_rb_stb} · ${detail.inputs.oil_viscosity_cp} cp · ${detail.inputs.net_pay_ft} ft`],
                        ].map(([l, v, tag]) => (
                          <TableRow key={String(l)} className="hover:bg-transparent">
                            <TableCell className="pl-0 whitespace-normal text-muted-foreground">{l}</TableCell>
                            <TableCell className="pr-0 text-right font-mono tabular-nums whitespace-normal">
                              <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                {v}
                                {tag && (
                                  <Badge variant="secondary" className="font-sans">
                                    {tag}
                                  </Badge>
                                )}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card className="gap-4" data-reveal>
                <CardHeader>
                  <CardTitle>{t("p_override")}</CardTitle>
                  <CardDescription>{t("p_override_sub")}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      ["pta-q", "q (STB/d)", q, setQ, r ? fmt(r.q_oil_stbd, 0) : ""],
                      ["pta-ws", `${t("start")} (h)`, ws, setWs, r ? fmt(r.iarf_start_hours, 2) : ""],
                      ["pta-we", `${t("end")} (h)`, we, setWe, r ? fmt(r.iarf_end_hours, 2) : ""],
                    ].map(([id, l, v, set, ph]: any) => (
                      <div key={id} className="flex flex-col gap-1.5">
                        <Label htmlFor={id} className="text-xs text-muted-foreground">
                          {l}
                        </Label>
                        <Input id={id} className="font-mono tabular-nums" inputMode="decimal" placeholder={ph} value={v} onChange={(e) => set(e.target.value)} />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={busy || (!q && !(ws && we))} onClick={() => override(false)}>
                      {t("apply")}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy || (detail?.result?.window_source !== "manual" && detail?.q_source !== "override")} onClick={() => override(true)}>
                      <RotateCcw /> {t("auto")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="gap-4" data-reveal>
            <CardHeader>
              <CardTitle>{t("p_all")}</CardTitle>
              <CardAction className="text-sm text-muted-foreground tabular-nums">{t("p_events", { n: results.length } as any)}</CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("well")}</TableHead>
                    <TableHead>{t("p_shutin")}</TableHead>
                    <TableHead className="text-right">{t("p_slope")}</TableHead>
                    <TableHead className="text-right">k (md)</TableHead>
                    <TableHead className="text-right">{t("p_skin")}</TableHead>
                    <TableHead className="text-right">{t("p_dpskin")} (psi)</TableHead>
                    <TableHead>{t("p_radial")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((x) => (
                    <TableRow key={x.event_id} data-state={x.event_id === sel ? "selected" : undefined} onClick={() => setSel(x.event_id)} className="cursor-pointer">
                      <TableCell className="font-mono">{x.well_name}</TableCell>
                      <TableCell className="font-mono tabular-nums">{fmtDate(x.shut_in_start, true)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{fmt(x.horner_slope_psi_per_cycle, 3)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{fmt(x.permeability_md, 2)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{fmt(x.skin, 3)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{fmt(x.delta_p_skin_psi, 2)}</TableCell>
                      <TableCell>
                        <QualityBadge q={x.iarf_quality}>{qLabel(x.iarf_quality)}</QualityBadge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {meta.failed?.length > 0 && (
                <p className="font-mono text-xs text-muted-foreground">
                  {t("p_notanal")}: {meta.failed.map((f: any) => `${f.event_id} (${f.error})`).join(" · ")}
                </p>
              )}
            </CardContent>
          </Card>

          {pref && pref.rows?.length > 0 && (
            <Card className="gap-4" data-reveal>
              <CardHeader>
                <CardTitle>{t("p_ref")}</CardTitle>
                <CardDescription className="font-mono text-xs">{t("p_ref_sub", { file: pref.file, n: pref.rows.length })}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("well")}</TableHead>
                      {[
                        ["permeability_md", "k (md)"],
                        ["skin", t("p_skin")],
                        ["delta_p_skin_psi", t("p_dpskin")],
                        ["horner_slope", t("p_slope")],
                      ].map(([k, l]) => (
                        <TableHead key={k} className="text-right" colSpan={3}>
                          {l}
                        </TableHead>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableHead />
                      {Array.from({ length: 4 }).flatMap((_, i) => [
                        <TableHead key={`o${i}`} className="text-right text-xs font-normal text-muted-foreground">
                          {t("p_ours")}
                        </TableHead>,
                        <TableHead key={`r${i}`} className="text-right text-xs font-normal text-muted-foreground">
                          {t("p_refv")}
                        </TableHead>,
                        <TableHead key={`d${i}`} className="text-right text-xs font-normal text-muted-foreground">
                          {t("p_diff")}
                        </TableHead>,
                      ])}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pref.rows.map((x: any) => (
                      <TableRow key={x.event_id} onClick={() => setSel(x.event_id)} className="cursor-pointer">
                        <TableCell className="font-mono">{x.well_name}</TableCell>
                        {["permeability_md", "skin", "delta_p_skin_psi", "horner_slope"].flatMap((k) => {
                          const diff = x[`${k}_diff_pct`];
                          const tone = diff == null ? "" : Math.abs(diff) < 5 ? "text-success" : Math.abs(diff) < 20 ? "text-warning" : "text-destructive";
                          return [
                            <TableCell key={`${k}o`} className="text-right font-mono tabular-nums">
                              {fmt(x[`${k}_ours`], 2)}
                            </TableCell>,
                            <TableCell key={`${k}r`} className="text-right font-mono tabular-nums text-muted-foreground">
                              {fmt(x[`${k}_ref`], 2)}
                            </TableCell>,
                            <TableCell key={`${k}d`} className={cn("text-right font-mono tabular-nums", tone)}>
                              {diff == null ? "—" : `${diff > 0 ? "+" : ""}${fmt(diff, 1)}`}
                            </TableCell>,
                          ];
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
