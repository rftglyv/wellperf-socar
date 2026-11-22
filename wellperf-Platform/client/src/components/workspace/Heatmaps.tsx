"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { engineGet, fmtDate } from "./api";
import { usePrefs } from "./prefs";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/* Single-hue sequential ramp: muted (low) -> primary (high). Interpolated in sRGB on the
   canvas so it matches the CSS legend gradient below in both themes. */
const RAMP_LO_CSS = "color-mix(in srgb, var(--primary) 8%, var(--muted))";
const RAMP_CSS = `linear-gradient(to right, ${RAMP_LO_CSS}, var(--primary))`;

type RGB = [number, number, number];

/** Resolve any CSS colour (incl. color-mix / var) to sRGB bytes via a probe element + 1px canvas. */
function resolveRGB(host: HTMLElement, css: string): RGB {
  const probe = document.createElement("span");
  probe.style.color = css;
  probe.style.display = "none";
  host.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  host.removeChild(probe);
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = computed;
  g.fillRect(0, 0, 1, 1);
  const d = g.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

type L3 = { az: string; en: string; ru: string };
interface Metric {
  key: string;
  label: L3;
  unit: string;
  scale?: number;
  fixed?: [number, number];
}

const RATE_METRICS: Metric[] = [
  { key: "oil_rate_stbd", label: { az: "Neft", en: "Oil", ru: "Нефть" }, unit: "STB/d" },
  { key: "water_rate_stbd", label: { az: "Su", en: "Water", ru: "Вода" }, unit: "STB/d" },
  { key: "gas_rate_mscfd", label: { az: "Qaz", en: "Gas", ru: "Газ" }, unit: "Mscf/d" },
  { key: "water_cut_frac", label: { az: "Su payı", en: "Water cut", ru: "Обводн." }, unit: "%", scale: 100, fixed: [0, 100] },
];
const SENSOR_METRICS: Metric[] = [
  { key: "dh_pressure_psia", label: { az: "Quyudibi təzyiq", en: "Downhole P", ru: "Забойное P" }, unit: "psia" },
  { key: "whp_psia", label: { az: "Quyuağzı təzyiq", en: "Wellhead P", ru: "Устьевое P" }, unit: "psia" },
  { key: "dh_temperature_degf", label: { az: "Temperatur", en: "Temperature", ru: "Темп." }, unit: "°F" },
  { key: "gas_lift_rate_mscfd", label: { az: "Qaz-lift", en: "Gas lift", ru: "Газлифт" }, unit: "Mscf/d" },
];

const cache = new Map<string, Promise<any>>();
const get = (url: string, ver: string) => {
  const k = `${url}|${ver}`;
  if (!cache.has(k)) cache.set(k, engineGet(url).catch((e) => (cache.delete(k), Promise.reject(e))));
  return cache.get(k)!;
};

interface Grid {
  wells: string[];
  dates: string[];
  values: Record<string, (number | null)[][]>; // metric → [well][day]
}

function useGrid(kind: "rates" | "sensors", wells: string[], ver: string, enabled: boolean) {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!enabled || !wells.length) return;
    let live = true;
    setGrid(null);
    setErr(false);
    const metrics = kind === "rates" ? RATE_METRICS : SENSOR_METRICS;
    Promise.allSettled(wells.map((w) => get(kind === "rates" ? `/api/wells/${w}/rates` : `/api/wells/${w}/sensors?resolution=1D`, ver)))
      .then((res) => {
        if (!live) return;
        const per = res.map((r) => {
          if (r.status !== "fulfilled") return new Map<string, any>();
          const d = r.value;
          const m = new Map<string, any>();
          if (kind === "rates") d.rows.forEach((row: any) => m.set(String(row.date).slice(0, 10), row));
          else d.series.t.forEach((t: string, i: number) => m.set(String(t).slice(0, 10), Object.fromEntries(metrics.map((x) => [x.key, d.series[x.key]?.[i]]))));
          return m;
        });
        const dates = Array.from(new Set(per.flatMap((m) => Array.from(m.keys())))).sort();
        if (!dates.length) return setErr(true);
        const values: Grid["values"] = {};
        metrics.forEach((x) => {
          values[x.key] = per.map((m) =>
            dates.map((d) => {
              const v = m.get(d)?.[x.key];
              return typeof v === "number" && Number.isFinite(v) ? v * (x.scale ?? 1) : null;
            })
          );
        });
        setGrid({ wells, dates, values });
      })
      .catch(() => live && setErr(true));
    return () => {
      live = false;
    };
  }, [kind, wells.join(","), ver, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return { grid, err };
}


function range(rows: (number | null)[][], fixed?: [number, number]): [number, number] {
  if (fixed) return fixed;
  const v = rows.flat().filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (!v.length) return [0, 1];
  const q = (p: number) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  const lo = q(0.02);
  const hi = q(0.98);
  return hi > lo ? [lo, hi] : [lo, lo + 1];
}

const LABEL_W = 54;
const RANGE_W = 92;
const ROW_H = 22;

const TXT = {
  rates: { az: "Hasilat istilik xəritəsi", en: "Production heatmap", ru: "Тепловая карта добычи" },
  ratesSub: { az: "Quyu × gün · VFM proqnozu", en: "Well × day · VFM estimate", ru: "Скважина × день · оценка VFM" },
  sensors: { az: "Təzyiq istilik xəritəsi", en: "Pressure heatmap", ru: "Тепловая карта давления" },
  sensorsSub: { az: "Quyu × gün · təmizlənmiş sensorların gündəlik ortası", en: "Well × day · daily mean of cleaned sensors", ru: "Скважина × день · среднесуточно, очищенные датчики" },
  perWell: {
    az: "Hər quyu öz miqyasında (P2–P98): rəng quyular arası deyil, quyu daxilində müqayisə üçündür",
    en: "Each well on its own scale (P2–P98): colour compares days within a well, not wells with each other",
    ru: "У каждой скважины своя шкала (P2–P98): цвет сравнивает дни внутри скважины, а не скважины между собой",
  },
  perWellFixed: { az: "Bütün quyular üçün sabit miqyas", en: "Fixed scale for all wells", ru: "Единая шкала для всех скважин" },
  low: { az: "aşağı", en: "low", ru: "мин." },
  high: { az: "yüksək", en: "high", ru: "макс." },
  noData: { az: "data yoxdur", en: "no data", ru: "нет данных" },
  range: { az: "diapazon", en: "range", ru: "диапазон" },
};

const fmtV = (v: number, unit: string) => v.toLocaleString("en-US", { maximumFractionDigits: unit === "%" ? 1 : 0 });

function HeatCanvas({ grid, metric, selected, onSelect }: { grid: Grid; metric: Metric; selected?: string; onSelect?: (w: string) => void }) {
  const { lang, theme } = usePrefs();
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(600);
  const [tip, setTip] = useState<{ x: number; y: number; r: number; well: string; date: string; v: number | null } | null>(null);
  const rows = grid.values[metric.key];
  // Per-well colour scaling: each row gets its own [lo, hi] (fixed metrics share one).
  const ranges = useMemo(() => rows.map((row) => range([row], metric.fixed)), [rows, metric.fixed]);
  const hasData = useMemo(() => rows.map((row) => row.some((v) => v !== null)), [rows]);
  const H = grid.wells.length * ROW_H;
  const plotW = Math.max(40, w - LABEL_W - RANGE_W);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = w * dpr;
    c.height = H * dpr;
    c.style.width = `${w}px`;
    c.style.height = `${H}px`;
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, H);

    const lo3 = resolveRGB(c, RAMP_LO_CSS);
    const hi3 = resolveRGB(c, "var(--primary)");
    const none3 = resolveRGB(c, "var(--background)");
    const ramp = (x: number): RGB => {
      x = Math.min(1, Math.max(0, x));
      return [0, 1, 2].map((i) => Math.round(lo3[i] + (hi3[i] - lo3[i]) * x)) as RGB;
    };

    // 1 px per cell -> stretched horizontally with smoothing (continuous in time, discrete across wells)
    const nC = grid.dates.length;
    const nR = grid.wells.length;
    const src = document.createElement("canvas");
    src.width = nC;
    src.height = nR;
    const sg = src.getContext("2d")!;
    const img = sg.createImageData(nC, nR);
    for (let r = 0; r < nR; r++) {
      const [lo, hi] = ranges[r];
      for (let k = 0; k < nC; k++) {
        const v = rows[r][k];
        const o = (r * nC + k) * 4;
        const [R, G, B] = v === null ? none3 : ramp((v - lo) / (hi - lo));
        img.data.set([R, G, B, 255], o);
      }
    }
    sg.putImageData(img, 0, 0);
    const mid = document.createElement("canvas");
    mid.width = Math.max(1, Math.round(plotW * dpr));
    mid.height = nR;
    const mg = mid.getContext("2d")!;
    mg.imageSmoothingEnabled = true;
    mg.imageSmoothingQuality = "high";
    mg.drawImage(src, 0, 0, mid.width, nR);
    g.imageSmoothingEnabled = false;
    for (let r = 0; r < nR; r++) g.drawImage(mid, 0, r, mid.width, 1, LABEL_W, r * ROW_H + 1, plotW, ROW_H - 2);

    // well labels + per-well range column
    const css = getComputedStyle(c);
    const fg = css.getPropertyValue("--foreground").trim();
    const muted = css.getPropertyValue("--muted-foreground").trim();
    g.font = '500 10.5px "JetBrains Mono", ui-monospace, monospace';
    g.textBaseline = "middle";
    grid.wells.forEach((name, r) => {
      const on = name === selected;
      const y = r * ROW_H + ROW_H / 2;
      g.fillStyle = on ? fg : muted;
      g.textAlign = "left";
      g.fillText(name, 0, y);
      g.textAlign = "right";
      g.fillStyle = muted;
      const [lo, hi] = ranges[r];
      g.fillText(hasData[r] ? `${fmtV(lo, metric.unit)}–${fmtV(hi, metric.unit)}` : "—", w, y);
      if (on) {
        g.strokeStyle = fg;
        g.lineWidth = 1.5;
        g.strokeRect(LABEL_W + 0.75, r * ROW_H + 0.75, plotW - 1.5, ROW_H - 1.5);
      }
    });
  }, [grid, rows, ranges, hasData, w, H, plotW, selected, metric.unit, theme]);

  const hit = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const r = Math.floor(y / ROW_H);
    const k = Math.floor(((x - LABEL_W) / plotW) * grid.dates.length);
    if (x < LABEL_W || x > LABEL_W + plotW || r < 0 || r >= grid.wells.length || k < 0 || k >= grid.dates.length) return null;
    return { x, y, r, k };
  };

  const ticks = useMemo(() => {
    const n = grid.dates.length;
    // ~44px per "MM-DD" label so ticks never overlap on narrow (mobile) plots
    const maxTicks = Math.max(2, Math.min(6, Math.floor(plotW / 44)));
    const step = Math.max(1, Math.ceil(n / maxTicks));
    return grid.dates.map((d, i) => ({ d, i })).filter(({ i }) => i % step === 0);
  }, [grid.dates, plotW]);

  const tipRange = tip ? ranges[tip.r] : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground" style={{ paddingLeft: LABEL_W }}>
        <span />
        <span>
          {TXT.range[lang]}, {metric.unit}
        </span>
      </div>
      <div
        ref={wrap}
        className={onSelect ? "relative cursor-pointer" : "relative cursor-crosshair"}
        onMouseMove={(e) => {
          const h = hit(e);
          setTip(h ? { x: h.x, y: h.y, r: h.r, well: grid.wells[h.r], date: grid.dates[h.k], v: rows[h.r][h.k] } : null);
        }}
        onMouseLeave={() => setTip(null)}
        onClick={(e) => {
          const h = hit(e);
          if (h && onSelect) onSelect(grid.wells[h.r]);
        }}
      >
        <canvas ref={cv} className="block" />
        {tip && (
          <div
            className="pointer-events-none absolute z-10 flex min-w-[170px] flex-col gap-1 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm"
            style={{ left: Math.min(tip.x + 14, w - 190), top: tip.y + 14 }}
          >
            <div className="text-muted-foreground">{fmtDate(tip.date)}</div>
            <div className="flex justify-between gap-3">
              <span className="font-medium">{tip.well}</span>
              <span className="font-mono tabular-nums">
                {tip.v === null ? "—" : fmtV(tip.v, metric.unit)} {metric.unit}
              </span>
            </div>
            {tipRange && (
              <div className="flex justify-between gap-3 text-muted-foreground">
                <span>{TXT.range[lang]}</span>
                <span className="font-mono tabular-nums">
                  {fmtV(tipRange[0], metric.unit)}–{fmtV(tipRange[1], metric.unit)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="relative h-4" style={{ marginLeft: LABEL_W, width: plotW }}>
        {ticks.map(({ d, i }) => (
          <span
            key={d}
            className="absolute font-mono text-[10px] whitespace-nowrap text-muted-foreground tabular-nums"
            style={{ left: `${(i / grid.dates.length) * 100}%` }}
          >
            {d.slice(5)}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground" style={{ marginLeft: LABEL_W }}>
        <span className="flex items-center gap-2">
          <span>{metric.fixed ? `${fmtV(metric.fixed[0], metric.unit)} ${metric.unit}` : TXT.low[lang]}</span>
          <span className="h-2 w-28 rounded-sm border" style={{ background: RAMP_CSS }} />
          <span>{metric.fixed ? `${fmtV(metric.fixed[1], metric.unit)} ${metric.unit}` : TXT.high[lang]}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border bg-background" />
          {TXT.noData[lang]}
        </span>
        <span>{metric.fixed ? TXT.perWellFixed[lang] : TXT.perWell[lang]}</span>
      </div>
    </div>
  );
}

function HeatPanel({
  title,
  sub,
  metrics,
  grid,
  err,
  selected,
  onSelect,
}: {
  title: string;
  sub: string;
  metrics: Metric[];
  grid: Grid | null;
  err: boolean;
  selected?: string;
  onSelect?: (w: string) => void;
}) {
  const { lang } = usePrefs();
  const [m, setM] = useState(metrics[0].key);
  const metric = metrics.find((x) => x.key === m)!;
  return (
    <Card className="min-w-0 gap-4">
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription className="text-xs">{sub}</CardDescription>
        </div>
        <CardAction className="col-start-auto row-span-1 row-start-auto max-w-full overflow-x-auto">
          <ToggleGroup type="single" variant="outline" size="sm" value={m} onValueChange={(v) => v && setM(v)}>
            {metrics.map((x) => (
              <ToggleGroupItem key={x.key} value={x.key} className="px-2.5 text-xs">
                {x.label[lang]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent>
        {err ? (
          <Empty className="border border-dashed p-6">
            <EmptyHeader>
              <EmptyDescription>—</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : !grid ? (
          <Skeleton className="w-full" style={{ height: 10 * ROW_H + 70 }} />
        ) : (
          <HeatCanvas grid={grid} metric={metric} selected={selected} onSelect={onSelect} />
        )}
      </CardContent>
    </Card>
  );
}

/** Well × day heatmaps for production (needs VFM) and/or sensors (needs cleaning). */
export function FieldHeatmaps({
  wells,
  show,
  ratesVer,
  sensorsVer,
  ratesReady,
  sensorsReady,
  selected,
  onSelect,
}: {
  wells: string[];
  show: ("rates" | "sensors")[];
  ratesVer: string;
  sensorsVer: string;
  ratesReady: boolean;
  sensorsReady: boolean;
  selected?: string;
  onSelect?: (w: string) => void;
}) {
  const { lang } = usePrefs();
  const r = useGrid("rates", wells, ratesVer, ratesReady && show.includes("rates"));
  const s = useGrid("sensors", wells, sensorsVer, sensorsReady && show.includes("sensors"));
  const panels = [
    show.includes("rates") && ratesReady && (
      <HeatPanel key="r" title={TXT.rates[lang]} sub={TXT.ratesSub[lang]} metrics={RATE_METRICS} grid={r.grid} err={r.err} selected={selected} onSelect={onSelect} />
    ),
    show.includes("sensors") && sensorsReady && (
      <HeatPanel key="s" title={TXT.sensors[lang]} sub={TXT.sensorsSub[lang]} metrics={SENSOR_METRICS} grid={s.grid} err={s.err} selected={selected} onSelect={onSelect} />
    ),
  ].filter(Boolean);
  if (!panels.length) return null;
  return <div className={panels.length === 2 ? "mt-8 grid gap-4 xl:grid-cols-2" : "mt-8 grid gap-4"}>{panels}</div>;
}
