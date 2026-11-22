"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { engineGet, fmt } from "./api";
import { ChartSkeleton, Kpi, KpiSkeletons, SectionHead, TableSkeleton, useReveal } from "./ui";
import { usePrefs } from "./prefs";

const PHASES = [
  ["oil_rate_stbd", "oil"],
  ["water_rate_stbd", "water"],
  ["gas_rate_mscfd", "gas"],
] as const;

const AXIS = { fill: "var(--muted-foreground)", fontSize: 11 };
const color = (p: string) => (p === "oil_rate_stbd" ? "var(--chart-1)" : p === "water_rate_stbd" ? "var(--chart-2)" : "var(--chart-3)");
const tipCls = "rounded-md border bg-popover px-3 py-2 font-mono text-xs text-popover-foreground tabular-nums shadow-sm";

export function StepModel({ goNext, canNext }: { goNext: () => void; canNext: boolean }) {
  const { t } = usePrefs();
  const [m, setM] = useState<any | null>(null);
  const [phase, setPhase] = useState<string>("oil_rate_stbd");
  const ref = useReveal<HTMLDivElement>([!!m]);

  useEffect(() => {
    engineGet("/api/model").then(setM).catch(() => setM(null));
  }, []);

  const metric = (rows: any[], target: string, vfmOnly: boolean) =>
    rows?.find((r) => r.target === target && (vfmOnly ? r.method === "VFM model" : r.method !== "VFM model"));

  const parity = useMemo(
    () => (m?.parity || []).map((r: any) => ({ x: r[`${phase}_actual`], y: r[`${phase}_vfm`], well: r.well_name })),
    [m, phase]
  );
  const range = useMemo(() => {
    const v = parity.flatMap((p: any) => [p.x, p.y]).filter((x: any) => typeof x === "number");
    if (!v.length) return [0, 1];
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    const pad = (hi - lo) * 0.05;
    return [Math.max(0, lo - pad), hi + pad];
  }, [parity]);

  const sens = useMemo(
    () => (m?.sensitivities || []).map((r: any) => ({ well: r.well_name, v: r.liquid_pct_per_10psi_pwf })),
    [m]
  );
  const q = m?.error_quantiles?.oil_rate_stbd;

  return (
    <div ref={ref}>
      <SectionHead
        index={t("s_model")}
        title={t("m_title")}
        ghost={t("m_ghost")}
        lead={t("m_lead")}
        actions={
          <Button onClick={goNext} disabled={!canNext}>
            {t("m_next")} <ArrowRight />
          </Button>
        }
      />

      {!m ? (
        <div className="flex flex-col gap-7">
          <KpiSkeletons />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartSkeleton h={360} />
            <ChartSkeleton h={360} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[...PHASES, ["liquid_rate_stbd", "liquid"] as const].map(([k, l]) => {
              const held = metric(m.cv_metrics, k, true);
              const base = metric(m.cv_metrics, k, false);
              const fwd = metric(m.forward_metrics, k, true);
              const gain = held && base ? (1 - held.MAPE_pct / base.MAPE_pct) * 100 : null;
              return (
                <Kpi
                  key={k}
                  label={`${t(l)} · ${t("held_out")} MAPE`}
                  value={held?.MAPE_pct}
                  unit="%"
                  decimals={2}
                  color={k === "liquid_rate_stbd" ? "var(--primary)" : color(k)}
                  foot={`${t("forward")} ${fmt(fwd?.MAPE_pct, 2)}% · ${gain !== null ? `−${fmt(gain, 0)}% ${t("m_gain")}` : ""}`}
                />
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card data-reveal>
              <CardHeader>
                <CardTitle>{t("m_parity")}</CardTitle>
                <CardDescription className="tabular-nums">{t("m_parity_sub", { n: m.parity.length })}</CardDescription>
                <CardAction>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={phase}
                    onValueChange={(v) => v && setPhase(v)}
                    aria-label={t("m_parity")}
                  >
                    {PHASES.map(([k, l]) => (
                      <ToggleGroupItem key={k} value={k} className="px-3">
                        {t(l)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="h-[330px]">
                  <ResponsiveContainer>
                    <ScatterChart margin={{ top: 8, right: 28, left: 4, bottom: 16 }}>
                      <CartesianGrid stroke="var(--border)" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        domain={range}
                        tickFormatter={(v) => fmt(v)}
                        name={t("m_measured")}
                        tick={AXIS}
                        stroke="var(--border)"
                        label={{ value: t("m_measured"), position: "insideBottom", offset: -8, fill: "var(--muted-foreground)", fontSize: 11 }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        domain={range}
                        tickFormatter={(v) => fmt(v)}
                        width={56}
                        name={t("m_predicted")}
                        tick={AXIS}
                        stroke="var(--border)"
                        label={{ value: t("m_predicted"), angle: -90, position: "insideLeft", fill: "var(--muted-foreground)", fontSize: 11 }}
                      />
                      <Tooltip
                        content={({ active, payload }: any) =>
                          active && payload?.length ? (
                            <div className={tipCls}>
                              <div className="mb-1 font-sans font-medium">{payload[0].payload.well}</div>
                              <div>
                                {t("m_measured")}: {fmt(payload[0].payload.x, 1)}
                              </div>
                              <div>
                                {t("m_predicted")}: {fmt(payload[0].payload.y, 1)}
                              </div>
                            </div>
                          ) : null
                        }
                      />
                      <Scatter
                        data={[{ x: range[0], y: range[0] }, { x: range[1], y: range[1] }]}
                        line={{ stroke: "var(--muted-foreground)", strokeDasharray: "4 4" }}
                        shape={() => <g />}
                        isAnimationActive={false}
                      />
                      <Scatter data={parity} fill={color(phase)} fillOpacity={0.85} isAnimationActive={false} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card data-reveal>
              <CardHeader>
                <CardTitle>{t("m_sens")}</CardTitle>
                <CardDescription>{t("m_sens_sub")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[330px]">
                  <ResponsiveContainer>
                    <BarChart data={sens} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
                      <CartesianGrid horizontal={false} stroke="var(--border)" />
                      <XAxis type="number" tickFormatter={(v) => `${fmt(v, 1)}%`} tick={AXIS} stroke="var(--border)" />
                      <YAxis type="category" dataKey="well" width={52} tickLine={false} axisLine={false} tick={AXIS} />
                      <Tooltip
                        cursor={{ fill: "var(--muted)" }}
                        content={({ active, payload }: any) =>
                          active && payload?.length ? (
                            <div className={tipCls}>
                              {payload[0].payload.well}: {fmt(payload[0].value, 2)}%
                            </div>
                          ) : null
                        }
                      />
                      <Bar dataKey="v" fill="var(--primary)" fillOpacity={0.85} radius={4} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card data-reveal>
              <CardHeader>
                <CardTitle>{t("m_val")}</CardTitle>
                <CardDescription>{t("m_val_sub")}</CardDescription>
              </CardHeader>
              <CardContent>
                {!m.cv_metrics ? (
                  <TableSkeleton />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("m_method")}</TableHead>
                        {PHASES.map(([k, l]) => (
                          <TableHead key={k} className="text-right">
                            {t(l)}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        [`VFM · ${t("held_out")}`, m.cv_metrics, true],
                        [`${t("m_baseline")} · ${t("held_out")}`, m.cv_metrics, false],
                        [`VFM · ${t("forward")}`, m.forward_metrics, true],
                        [`${t("m_baseline")} · ${t("forward")}`, m.forward_metrics, false],
                      ].map(([label, rows, vf]: any) => (
                        <TableRow key={label} data-state={vf ? "selected" : undefined} className={vf ? "font-medium" : "text-muted-foreground"}>
                          <TableCell>{label}</TableCell>
                          {PHASES.map(([k]) => (
                            <TableCell key={k} className="text-right font-mono tabular-nums">
                              {fmt(metric(rows, k, vf)?.MAPE_pct, 2)}%
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card data-reveal>
              <CardHeader>
                <CardTitle>{t("m_why")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <li className="rounded-md bg-muted px-3 py-2">{t("m_why1")}</li>
                  <li className="rounded-md bg-muted px-3 py-2 tabular-nums">{t("m_why2", { n: m.label_corrections })}</li>
                  <li className="rounded-md bg-muted px-3 py-2">{t("m_why4")}</li>
                  {q && (
                    <li className="rounded-md bg-muted px-3 py-2 tabular-nums">
                      {t("m_why3", { lo: fmt(q[0] * 100, 1), hi: fmt(q[1] * 100, 1) })}
                    </li>
                  )}
                </ul>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("m_shared")}</TableHead>
                      <TableHead className="text-right">{t("m_coef")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(m.shared_coefficients || {}).map(([k, v]: any) => (
                      <TableRow key={k}>
                        <TableCell className="font-mono text-xs">{k}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{Number(v).toExponential(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
