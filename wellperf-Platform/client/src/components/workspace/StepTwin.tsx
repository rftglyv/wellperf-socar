"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, Layers, Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { EngineStatus, fmt } from "./api";
import { SectionHead, useReveal } from "./ui";
import { usePrefs } from "./prefs";
import type { TwinWell } from "./FieldTwin";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Radial-flow quality: good / indicative / no radial flow. */
const qualityClass = (q: string) =>
  q === "good" ? "border-success/30 bg-success/10 text-success" : q === "indicative" ? "border-warning/30 bg-warning/10 text-warning" : "border-destructive/30 bg-destructive/10 text-destructive";

class TwinBoundary extends React.Component<{ children: React.ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() {
    return { err: true };
  }
  render() {
    return this.state.err ? <div className="absolute inset-0 grid place-items-center text-sm text-white/70">3D view unavailable</div> : this.props.children;
  }
}

const FieldTwin = dynamic(() => import("./FieldTwin"), {
  ssr: false,
  loading: () => <Skeleton className="absolute inset-0 rounded-none bg-white/5" />,
});

interface Props {
  status: EngineStatus;
  well: string;
  setWell: (w: string) => void;
  goVFM: () => void;
  goPTA: () => void;
}

export function StepTwin({ status, well, setWell, goVFM, goPTA }: Props) {
  const { t } = usePrefs();
  const [geo, setGeo] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const [zoomKey, setZoomKey] = useState({ n: 0, f: 1 });
  const ref = useReveal<HTMLDivElement>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else stageRef.current?.requestFullscreen?.().catch(() => {});
  };

  const rows = useMemo(() => {
    const vfm = new Map<string, any>((status.meta.vfm?.per_well || []).map((r: any) => [r.well_name, r]));
    const pta = new Map<string, any[]>();
    (status.meta.pta?.results || []).forEach((r: any) => pta.set(r.well_name, [...(pta.get(r.well_name) || []), r]));
    const names: string[] = status.model?.wells || [];
    return names.map((n) => {
      const v = vfm.get(n);
      const events = pta.get(n) || [];
      const last = events[events.length - 1];
      return {
        name: n,
        oil: v?.oil ?? null,
        water: v?.water ?? null,
        gas: v?.gas ?? null,
        skin: last?.skin ?? null,
        k: last?.permeability_md ?? null,
        quality: last?.iarf_quality ?? null,
        events: events.length,
      };
    });
  }, [status.meta.vfm, status.meta.pta, status.model]);

  const twinWells: TwinWell[] = useMemo(() => rows.map((r) => ({ name: r.name, oil: r.oil, skin: r.skin, quality: r.quality })), [rows]);
  const maxOil = Math.max(1, ...rows.map((r) => r.oil || 0));
  const sel = rows.find((r) => r.name === well);

  return (
    <div ref={ref}>
      <SectionHead
        index={t("s_twin")}
        title={t("tw_title")}
        ghost={t("tw_ghost")}
        lead={t("tw_lead")}
        actions={
          <>
            <Toggle variant="outline" size="sm" pressed={geo} onPressedChange={setGeo} className="px-2.5">
              <Layers /> {t("twin_geo")}
            </Toggle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-sm" variant="outline" aria-label="Zoom in" onClick={() => setZoomKey((z) => ({ n: z.n + 1, f: 0.82 }))}>
                    <ZoomIn />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom in</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-sm" variant="outline" aria-label="Zoom out" onClick={() => setZoomKey((z) => ({ n: z.n + 1, f: 1.22 }))}>
                    <ZoomOut />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom out</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button size="sm" variant="outline" onClick={() => setResetKey((k) => k + 1)}>
              <RotateCcw /> {t("twin_reset")}
            </Button>
            <Button size="sm" onClick={toggleFull}>
              {full ? <Minimize2 /> : <Maximize2 />} {t(full ? "tw_exit_full" : "tw_full")}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <div
          ref={stageRef}
          data-reveal
          className="relative h-[min(80vh,900px)] min-h-[520px] overflow-hidden rounded-xl border [&:fullscreen]:h-screen [&:fullscreen]:w-screen [&:fullscreen]:rounded-none [&:fullscreen]:border-0"
          style={{ background: "#0a1724" }}
        >
          <TwinBoundary>
            <FieldTwin
              wells={twinWells}
              background="#0a1724"
              autoRotate={false}
              showGeology={geo}
              resetKey={resetKey}
              zoomKey={zoomKey}
              selected={well}
              onSelect={setWell}
              wheelZoom={full}
              labels={{ oil: t("twin_oil"), skin: t("twin_skin"), none: t("twin_none") }}
            />
          </TwinBoundary>
          {/* Stage background is always dark navy, so overlay colours are fixed light-on-dark. */}
          <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-white/15 bg-black/55 px-3 py-2 text-xs text-white/85">
            {[
              ["#c8372d", t("twin_l_jacket")],
              ["#4a2709", t("twin_l_res")],
              ["#5eead4", t("twin_l_flow")],
            ].map(([c, l]) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <i className="inline-block size-2 rounded-sm" style={{ background: c }} />
                {l}
              </span>
            ))}
            <span className="text-white/55">{t(full ? "tw_hint_full" : "tw_hint")}</span>
          </div>
          {full && (
            <Button
              size="sm"
              variant="outline"
              className="absolute top-4 right-4 z-10 border-white/30 bg-black/60 text-white hover:bg-black/75 hover:text-white dark:border-white/30 dark:bg-black/60"
              onClick={toggleFull}
            >
              <Minimize2 /> {t("tw_exit_full")}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Card className="gap-4" data-reveal>
            <CardHeader>
              <CardTitle className="font-mono">{sel?.name || t("tw_wells")}</CardTitle>
              {!sel && <CardDescription>{t("tw_select")}</CardDescription>}
            </CardHeader>
            {sel && (
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-1.5 text-4xl font-semibold tracking-tight tabular-nums">
                    {sel.oil != null ? fmt(sel.oil) : "—"}
                    <span className="text-sm font-normal text-muted-foreground">STB/d</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{t("twin_oil")}</div>
                </div>
                <Table>
                  <TableBody>
                    {[
                      [t("tw_water"), sel.water != null ? `${fmt(sel.water)} STB/d` : "—"],
                      [t("tw_gas"), sel.gas != null ? `${fmt(sel.gas)} Mscf/d` : "—"],
                      [t("tw_k"), sel.k != null ? `${fmt(sel.k, 1)} md` : "—"],
                      [t("twin_skin"), sel.skin != null ? fmt(sel.skin, 2) : "—"],
                    ].map(([l, v]) => (
                      <TableRow key={l} className="hover:bg-transparent">
                        <TableCell className="pl-0 text-muted-foreground">{l}</TableCell>
                        <TableCell className="pr-0 text-right font-mono tabular-nums">{v}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="hover:bg-transparent">
                      <TableCell className="pl-0 text-muted-foreground">{t("tw_quality")}</TableCell>
                      <TableCell className="pr-0 text-right">
                        {sel.quality ? (
                          <Badge variant="outline" className={qualityClass(sel.quality)}>
                            {t(`q_${sel.quality}`)}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                {sel.oil == null && <p className="text-xs text-muted-foreground">{t("twin_none")}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={goVFM} disabled={status.stages.vfm !== "done"}>
                    {t("tw_open_vfm")} <ArrowRight />
                  </Button>
                  <Button size="sm" variant="outline" onClick={goPTA} disabled={status.stages.pta !== "done" || !sel.events}>
                    {t("tw_open_pta")} <ArrowRight />
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          <Card className="gap-0 overflow-hidden py-0" data-reveal>
            <div className="grid grid-cols-1 sm:grid-cols-2">
              {rows.map((r) => {
                const on = r.name === well;
                return (
                  <button
                    key={r.name}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setWell(r.name)}
                    className={cn(
                      "grid grid-cols-[60px_1fr_auto] items-center gap-2.5 border-b px-3.5 py-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:odd:border-r",
                      on && "bg-primary/10 hover:bg-primary/15",
                    )}
                  >
                    <span className={cn("font-mono text-xs", on && "font-semibold text-primary")}>{r.name}</span>
                    <span className="h-1 overflow-hidden rounded-full bg-muted">
                      <span className={cn("block h-full", on ? "bg-primary" : "bg-chart-1")} style={{ width: `${r.oil ? (r.oil / maxOil) * 100 : 0}%` }} />
                    </span>
                    <span className="min-w-16 text-right font-mono text-[11.5px] text-muted-foreground tabular-nums">
                      {r.oil != null ? fmt(r.oil) : "—"}
                      {r.skin != null ? ` · s ${fmt(r.skin, 1)}` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
