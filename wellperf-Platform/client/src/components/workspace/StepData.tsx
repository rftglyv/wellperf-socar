"use client";

import React, { useRef, useState } from "react";
import { ArrowRight, Database, FileText, FileUp, Play, Trash2, UploadCloud } from "lucide-react";
import { EngineStatus, PART_KINDS, Part, engineDelete, enginePost, engineUpload, fmt, fmtDate } from "./api";
import { SectionHead } from "./ui";
import { usePrefs } from "./prefs";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  status: EngineStatus | null;
  refresh: () => Promise<void>;
  notify: (text: string, type?: "ok" | "error") => void;
  runAll: () => Promise<void>;
  busy: boolean;
  goNext: () => void;
}

const DEMO_MONTHS = ["2025-07", "2025-08", "2025-09"];

function Timeline({ status }: { status: EngineStatus }) {
  const { t } = usePrefs();
  const sensorParts = status.parts.filter((p) => p.kind === "high_freq" && p.start && p.end);
  const hist = status.history;
  const showHist = !!hist && status.use_history;
  const times = [
    ...sensorParts.flatMap((p) => [new Date(p.start!).getTime(), new Date(p.end!).getTime()]),
    ...(showHist ? [new Date(hist!.start).getTime(), new Date(hist!.end).getTime()] : []),
  ];
  if (!times.length) return null;
  const lo = Math.min(...times);
  const hi = Math.max(...times);
  const pos = (x: number) => ((x - lo) / Math.max(hi - lo, 1)) * 100;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium">{t("d_timeline")}</span>
        <span className="flex items-center gap-4 text-xs text-muted-foreground">
          {showHist && (
            <span className="flex items-center gap-1.5">
              <i className="size-2.5 rounded-sm bg-muted-foreground/40" />
              {t("d_hist_ctx")}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <i className="size-2.5 rounded-sm bg-primary" />
            {t("d_uploaded")}
          </span>
        </span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-sm bg-muted">
        {showHist && (
          <div
            className="absolute inset-y-0 bg-muted-foreground/30"
            style={{ left: `${pos(new Date(hist!.start).getTime())}%`, width: `${pos(new Date(hist!.end).getTime()) - pos(new Date(hist!.start).getTime())}%` }}
          />
        )}
        {sensorParts.map((p) => (
          <div
            key={p.id}
            className="absolute inset-y-0 bg-primary"
            title={`${p.filename}: ${fmtDate(p.start)} → ${fmtDate(p.end)}`}
            style={{
              left: `${pos(new Date(p.start!).getTime())}%`,
              width: `max(4px, ${pos(new Date(p.end!).getTime()) - pos(new Date(p.start!).getTime())}%)`,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between font-mono text-[11px] text-muted-foreground tabular-nums">
        <span>{fmtDate(new Date(lo).toISOString())}</span>
        <span>{fmtDate(new Date(hi).toISOString())}</span>
      </div>
    </div>
  );
}

export function StepData({ status, refresh, notify, runAll, busy, goNext }: Props) {
  const { t } = usePrefs();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);

  const send = async (files: File[]) => {
    if (!files.length) return;
    setProgress(0);
    try {
      const res = await engineUpload(files, (p) => {
        setProgress(p);
        if (p >= 100) setProcessing(true);
      });
      if (res.errors?.length) notify(res.errors.map((e: any) => `${e.file}: ${e.error}`).join(" · "), "error");
      if (res.added?.length)
        notify(t("d_added", { n: res.added.length, kinds: res.added.map((a: Part) => t(`k_${a.kind}`)).join(", ") }));
      await refresh();
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setProgress(null);
      setProcessing(false);
    }
  };

  const loadSampleFile = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setProcessing(true);
      const res = await fetch("/sample_raw_well_telemetry.csv");
      const blob = await res.blob();
      const file = new File([blob], "sample_raw_well_telemetry.csv", { type: "text/csv" });
      await send([file]);
      notify("Sample telemetry uploaded & processed successfully!");
    } catch (err: any) {
      notify(err.message, "error");
    } finally {
      setProcessing(false);
    }
  };

  const demo = async (month: string) => {
    try {
      setProcessing(true);
      await enginePost(`/api/demo/${month}`);
      notify(t("d_loaded_demo", { m: fmtDate(`${month}-01`).replace(/^\S+\s/, "") }));
      await refresh();
    } catch (e: any) {
      notify(e.message, "error");
    } finally {
      setProcessing(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await engineDelete(`/api/parts/${id}`);
      await refresh();
    } catch (e: any) {
      notify(e.message, "error");
    }
  };

  const toggleHistory = async () => {
    if (!status) return;
    await enginePost("/api/settings", { use_history: !status.use_history });
    await refresh();
  };

  const parts = status?.parts || [];
  const hasSensors = parts.some((p) => p.kind === "high_freq");
  const model = status?.model;

  return (
    <div>
      <SectionHead
        index={t("s_data")}
        title={t("d_title")}
        ghost={t("d_ghost")}
        lead={t("d_lead")}
        actions={
          <>
            <Button variant="outline" onClick={goNext} disabled={!hasSensors}>
              {t("step_by_step")} <ArrowRight />
            </Button>
            <Button onClick={runAll} disabled={!hasSensors || busy} data-tour="run">
              <Play /> {t("run_full")}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div
            role="button"
            tabIndex={0}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed bg-card px-6 py-10 text-center transition-colors hover:border-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              over && "border-primary bg-primary/5"
            )}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            data-tour="upload"
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              send(Array.from(e.dataTransfer.files));
            }}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              accept=".csv,.xlsx,.xls,.parquet,.zip"
              onChange={(e) => {
                send(Array.from(e.target.files || []));
                e.target.value = "";
              }}
            />
            <div className="mb-2 flex size-11 items-center justify-center rounded-lg bg-muted text-foreground">
              <UploadCloud className="size-5" />
            </div>
            <div className="text-lg font-medium">{t("d_drop")}</div>
            <div className="text-sm text-muted-foreground">{t("d_drop_sub")}</div>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {PART_KINDS.map((k) => (
                <Badge key={k} variant="outline" className={cn("font-normal", k.endsWith("_ref") && "border-dashed")}>
                  {t(`k_${k}`)}
                </Badge>
              ))}
            </div>
            <p className="mt-2 max-w-[520px] text-xs leading-relaxed text-muted-foreground">{t("d_ref_hint")}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href="/sample_raw_well_telemetry.csv" download="sample_raw_well_telemetry.csv" onClick={(e) => e.stopPropagation()}>
                  <FileText />
                  {t("d_sample_csv")}
                </a>
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={loadSampleFile} disabled={processing} className="text-primary">
                <Play />
                {t("d_sample_load")}
              </Button>
            </div>
            {(progress !== null || processing) && (
              <div className="mt-5 flex w-full max-w-[360px] flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{processing ? t("d_parsing") : t("d_uploading")}</span>
                  <span className="font-mono tabular-nums">{processing ? "" : `${progress}%`}</span>
                </div>
                {processing ? (
                  <Skeleton className="h-2 w-full rounded-full bg-primary/30" />
                ) : (
                  <Progress value={progress ?? 0} className="h-2" />
                )}
              </div>
            )}
          </div>

          <Card className="gap-4">
            <CardHeader>
              <CardTitle>{t("d_parts")}</CardTitle>
              <CardAction>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {parts.length} {t("files")}
                </span>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {!status ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : parts.length === 0 ? (
                <Empty className="border border-dashed p-6 md:p-8">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <FileUp />
                    </EmptyMedia>
                    <EmptyDescription>{t("d_empty")}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <>
                  <Timeline status={status} />
                  <ul className="flex flex-col divide-y">
                    {parts.map((p, i) => (
                      <li key={p.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 py-2.5">
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{p.filename}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                            {fmt(p.rows)} {t("rows")} · {p.wells.length} {t("wells")}
                            {p.start ? ` · ${fmtDate(p.start)} → ${fmtDate(p.end)}` : ""}
                          </div>
                        </div>
                        <Badge
                          variant={p.kind === "high_freq" ? "secondary" : "outline"}
                          className={cn("font-normal", p.kind === "high_freq" && "text-primary", p.kind.endsWith("_ref") && "border-dashed")}
                        >
                          {t(`k_${p.kind}`)}
                        </Badge>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon-sm" onClick={() => remove(p.id)} aria-label={t("remove_part")}>
                              <Trash2 />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t("remove_part")}</TooltipContent>
                        </Tooltip>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="gap-4" data-tour="model">
            <CardHeader>
              <CardDescription>{t("d_model")}</CardDescription>
              {model?.held_out_mape && <CardTitle className="leading-snug">{t("d_model_name")}</CardTitle>}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {!model?.held_out_mape ? (
                <div className="flex flex-col gap-2.5">
                  <Skeleton className="h-7 w-3/5" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t("d_model_sub", { w: model.wells?.length ?? 0, n: model.n_tests ?? 0 })}
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>MAPE</TableHead>
                        <TableHead className="text-right">{t("held_out")}</TableHead>
                        <TableHead className="text-right">{t("forward")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        ["oil_rate_stbd", "oil", "var(--chart-1)"],
                        ["water_rate_stbd", "water", "var(--chart-2)"],
                        ["gas_rate_mscfd", "gas", "var(--chart-3)"],
                      ].map(([k, l, c]) => (
                        <TableRow key={k}>
                          <TableCell>
                            <span className="flex items-center gap-2">
                              <i className="size-2 rounded-full" style={{ background: c }} />
                              {t(l)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{fmt(model.held_out_mape?.[k], 1)}%</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{fmt(model.forward_mape?.[k], 1)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="gap-3">
            <CardHeader>
              <CardTitle>
                <label htmlFor="wf-use-history">{t("d_history")}</label>
              </CardTitle>
              <CardDescription className="leading-relaxed">{t("d_history_sub")}</CardDescription>
              <CardAction>
                <Switch id="wf-use-history" checked={!!status?.use_history} onCheckedChange={toggleHistory} aria-label={t("d_history")} />
              </CardAction>
            </CardHeader>
            {status?.history && (
              <CardContent>
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
                  <Database className="size-3" />
                  {fmt(status.history.rows)} {t("rows")} · {fmtDate(status.history.start)} → {fmtDate(status.history.end)}
                </div>
              </CardContent>
            )}
          </Card>

          <Card className="gap-4" data-tour="rehearse">
            <CardHeader>
              <CardTitle>{t("d_rehearse")}</CardTitle>
              <CardDescription className="leading-relaxed">{t("d_rehearse_sub")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {DEMO_MONTHS.map((m) => (
                <Button key={m} variant="outline" size="sm" onClick={() => demo(m)} disabled={!status?.ready || processing}>
                  + {fmtDate(`${m}-01`).replace(/^\S+\s/, "")}
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
