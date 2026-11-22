"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CircleAlert, Play, RotateCw } from "lucide-react";
import { Area, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { EngineStatus, engineGet, fmt, fmtDate, tickDate } from "./api";
import { ChartSkeleton, ChartTip, Kpi, KpiSkeletons, SectionHead, StageBar } from "./ui";
import { usePrefs } from "./prefs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface Props {
  status: EngineStatus;
  run: () => Promise<void>;
  running: boolean;
  goNext: () => void;
  well: string;
  setWell: (w: string) => void;
}

const SENSORS: [string, string][] = [
  ["dh_pressure_psia", "psia"],
  ["dh_temperature_degf", "°F"],
  ["whp_psia", "psia"],
  ["annulus_pressure_psia", "psia"],
  ["gas_lift_rate_mscfd", "Mscf/d"],
  ["choke_opening_pct", "%"],
];

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 11 };

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-7 w-full" />
      ))}
    </div>
  );
}

export function StepClean({ status, run, running, goNext, well, setWell }: Props) {
  const { t } = usePrefs();
  const st = status.stages.clean;
  const meta = status.meta.clean;
  const done = st === "done";
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const wells: string[] = meta?.wells || [];

  useEffect(() => {
    if (!done || !well) return;
    setLoading(true);
    setErr(null);
    engineGet(`/api/wells/${well}/sensors?resolution=1h`)
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [done, well, meta?.period_start, meta?.rows_uploaded]);

  const rows = useMemo(() => {
    if (!data) return [];
    const s = data.series;
    return s.t.map((x: string, i: number) => {
      const r: any = { t: x };
      SENSORS.forEach(([k]) => (r[k] = s[k]?.[i] ?? null));
      return r;
    });
  }, [data]);

  const qc = data?.qc?.[0];
  const totalFlags = meta ? Object.entries(meta.flags || {}).reduce((a: number, [k, v]: any) => (k === "gaps" ? a : a + v), 0) : 0;

  return (
    <div>
      <SectionHead
        index={t("s_clean")}
        title={t("c_title")}
        ghost={t("c_ghost")}
        lead={t("c_lead")}
        actions={
          <>
            <Button variant={done ? "outline" : "default"} onClick={run} disabled={running}>
              {done ? <RotateCw /> : <Play />} {done ? t("rerun") : t("c_run")}
            </Button>
            <Button variant={done ? "default" : "outline"} onClick={goNext} disabled={!done}>
              {t("c_next")} <ArrowRight />
            </Button>
          </>
        }
      />

      <StageBar running={running} label={t("c_bar")} />
      {st === "stale" && (
        <Alert className="mb-6 border-warning/40">
          <AlertTriangle className="text-warning" />
          <AlertDescription>{t("c_stale")}</AlertDescription>
        </Alert>
      )}

      {running && !meta ? (
        <div className="flex flex-col gap-8">
          <KpiSkeletons />
          <ChartSkeleton h={380} />
        </div>
      ) : !meta ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyDescription>{t("c_notrun", { n: status.parts.filter((p) => p.kind === "high_freq").length })}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label={t("c_rows")} value={meta.rows_uploaded} foot={t("c_rows_foot", { n: fmt(meta.context_rows) })} />
            <Kpi label={t("c_period")} value={meta.days} unit={t("days")} foot={`${fmtDate(meta.period_start)} → ${fmtDate(meta.period_end)}`} />
            <Kpi
              label={t("c_flagged")}
              value={totalFlags}
              foot={t("c_flagged_foot", { s: fmt(meta.flags.sentinel), p: fmt(meta.flags.spike), f: fmt(meta.flags.frozen) })}
            />
            <Kpi label={t("c_shutins")} value={meta.shut_ins} color="var(--primary)" foot={t("c_shutins_foot", { u: meta.upsets, c: t(`cs:${meta.choke_source}`) === `cs:${meta.choke_source}` ? meta.choke_source : t(`cs:${meta.choke_source}`) })} />
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{t("c_field")}</h2>
              {wells.length > 1 && wells.length <= 7 ? (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={well}
                  onValueChange={(v) => v && setWell(v)}
                >
                  {wells.map((w) => (
                    <ToggleGroupItem key={w} value={w} className="px-3 font-mono text-xs">
                      {w}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              ) : (
                <Select value={well} onValueChange={setWell}>
                  <SelectTrigger size="sm" className="w-32 font-mono text-xs" aria-label={t("c_field")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {wells.map((w) => (
                      <SelectItem key={w} value={w} className="font-mono text-xs">
                        {w}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {loading || !data ? (
              err ? (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertDescription>{err}</AlertDescription>
                </Alert>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {SENSORS.map(([k]) => (
                    <ChartSkeleton key={k} h={210} />
                  ))}
                </div>
              )
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <i className="size-2.5 rounded-sm bg-destructive/25" />
                    {t("c_shutin")} <span className="font-mono tabular-nums">({data.shut_ins.length})</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="size-2.5 rounded-sm bg-warning/30" />
                    {t("c_upset")} <span className="font-mono tabular-nums">({data.upsets.length})</span>
                  </span>
                  <span>{t("c_hourly")}</span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {SENSORS.map(([k, unit], idx) => {
                    const color = idx === 0 ? "var(--primary)" : "var(--foreground)";
                    return (
                      <Card key={k} className="gap-2 pt-4 pb-2">
                        <CardHeader className="px-4">
                          <CardTitle className="text-sm font-medium">{t(`sn_${k}`)}</CardTitle>
                          <CardAction>
                            <span className="font-mono text-xs text-muted-foreground">{unit}</span>
                          </CardAction>
                        </CardHeader>
                        <CardContent className="h-[170px] px-2">
                          <ResponsiveContainer>
                            <ComposedChart data={rows} syncId="sensors" margin={{ top: 6, right: 18, left: 0, bottom: 0 }}>
                              <CartesianGrid vertical={false} stroke="var(--border)" />
                              <XAxis dataKey="t" tickFormatter={tickDate} minTickGap={50} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                              <YAxis
                                domain={["auto", "auto"]}
                                width={58}
                                tickLine={false}
                                axisLine={false}
                                tick={AXIS_TICK}
                                tickFormatter={(v) => (Math.abs(v) < 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : fmt(v))}
                              />
                              <Tooltip content={<ChartTip labelFmt={(x: string) => fmtDate(x, true)} />} />
                              {data.shut_ins.map((e: any) => (
                                <ReferenceArea
                                  key={e.event_id}
                                  x1={nearest(rows, e.shut_in_start)}
                                  x2={nearest(rows, e.shut_in_end)}
                                  fill="var(--destructive)"
                                  fillOpacity={0.14}
                                  strokeOpacity={0}
                                />
                              ))}
                              {data.upsets.map((u: any, i: number) => (
                                <ReferenceArea key={i} x1={nearest(rows, u.start)} x2={nearest(rows, u.end)} fill="var(--warning)" fillOpacity={0.16} strokeOpacity={0} />
                              ))}
                              <Area type="monotone" dataKey={k} name={t(`sn_${k}`)} stroke="none" fill={color} fillOpacity={0.06} isAnimationActive={false} connectNulls={false} />
                              <Line type="monotone" dataKey={k} name={t(`sn_${k}`)} stroke={color} strokeWidth={1.3} dot={false} isAnimationActive={false} connectNulls={false} />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="gap-3">
              <CardHeader>
                <CardTitle>{t("c_events")}</CardTitle>
                <CardAction>
                  <Badge variant="outline" className="font-mono">
                    {well}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                {!data ? (
                  <TableSkeleton rows={3} />
                ) : data.shut_ins.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">{t("c_no_events", { w: well })}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("start")}</TableHead>
                        <TableHead>{t("end")}</TableHead>
                        <TableHead className="text-right">{t("hours")}</TableHead>
                        <TableHead>{t("source")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.shut_ins.map((e: any) => (
                        <TableRow key={e.event_id}>
                          <TableCell className="font-mono tabular-nums">{fmtDate(e.shut_in_start, true)}</TableCell>
                          <TableCell className="font-mono tabular-nums">{fmtDate(e.shut_in_end, true)}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{fmt(e.duration_hours, 1)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-normal">
                              {e.source}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <Card className="gap-3">
              <CardHeader>
                <CardTitle>{t("c_quality")}</CardTitle>
                <CardAction>
                  <Badge variant="outline" className="font-mono">
                    {well}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                {!qc ? (
                  <TableSkeleton rows={4} />
                ) : (
                  <Table>
                    <TableBody>
                      {[
                        [t("q_raw"), qc.rows_raw],
                        [t("q_dup"), qc.duplicates_removed],
                        [t("q_order"), qc.out_of_order_rows],
                        [t("q_gaps"), `${fmt(qc.gap_count)} (${t("q_longest")} ${fmt(qc.longest_gap_hours, 1)} h)`],
                        [t("q_sent"), sensSum(qc, "sentinel")],
                        [t("q_spike"), sensSum(qc, "spike")],
                        [t("q_frozen"), sensSum(qc, "frozen")],
                        [t("q_flag"), `${fmt(qc.pct_values_flagged, 2)} %`],
                      ].map(([l, v]) => (
                        <TableRow key={String(l)}>
                          <TableCell className="text-muted-foreground">{l}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{typeof v === "number" ? fmt(v) : v}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function sensSum(qc: any, kind: string) {
  return Object.entries(qc)
    .filter(([k]) => k.endsWith(`__${kind}`))
    .reduce((a, [, v]) => a + (Number(v) || 0), 0);
}

/** ReferenceArea needs x values that exist on the categorical axis. */
function nearest(rows: any[], iso: string | null) {
  if (!rows.length) return undefined;
  if (!iso) return rows[rows.length - 1].t;
  const target = new Date(iso).getTime();
  let lo = 0;
  let hi = rows.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (new Date(rows[mid].t).getTime() < target) lo = mid + 1;
    else hi = mid;
  }
  return rows[lo].t;
}
