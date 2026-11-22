"use client";

import React from "react";
import { Archive, ArrowDownToLine, FileCode2, FileSpreadsheet, FileText, Package, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ENGINE_URL, EngineStatus, engineDelete, engineGet, enginePost, exportUrl, fmt, fmtDate } from "./api";
import { SectionHead, useReveal } from "./ui";
import { usePrefs } from "./prefs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";

const FILES: { name: string; key: string; needs: "vfm" | "pta"; icon: any; phase: string }[] = [
  { name: "vfm_predictions.xlsx", key: "f_vfm_xlsx", needs: "vfm", icon: FileSpreadsheet, phase: "phase1" },
  { name: "vfm_portal.csv", key: "f_vfm_csv", needs: "vfm", icon: FileText, phase: "phase1" },
  { name: "vfm_report.html", key: "f_vfm_html", needs: "vfm", icon: FileCode2, phase: "phase1" },
  { name: "pta_results.xlsx", key: "f_pta_xlsx", needs: "pta", icon: FileSpreadsheet, phase: "phase2" },
  { name: "pta_portal.csv", key: "f_pta_csv", needs: "pta", icon: FileText, phase: "phase2" },
  { name: "pta_report.html", key: "f_pta_html", needs: "pta", icon: FileCode2, phase: "phase2" },
];

type ArchiveItem = {
  id: string;
  created: string;
  source: "download" | "manual";
  period_start?: string;
  period_end?: string;
  wells: number;
  field_oil?: number;
  shut_ins: number;
  files: string[];
  size: number;
};

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function ExportHistory({ canSave, refreshKey }: { canSave: boolean; refreshKey: number }) {
  const { t } = usePrefs();
  const [items, setItems] = React.useState<ArchiveItem[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(() => {
    engineGet<{ items: ArchiveItem[] }>("/api/archive")
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, []);
  React.useEffect(load, [load, refreshKey]);
  const save = async () => {
    setBusy(true);
    try {
      await enginePost("/api/archive");
      toast.success(t("ar_saved"));
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    try {
      await engineDelete(`/api/archive/${id}`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  return (
    <Card className="mt-4 gap-2" data-reveal>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>{t("ar_title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("ar_sub")}</p>
        </div>
        <Button size="sm" variant="outline" onClick={save} disabled={!canSave || busy}>
          <Archive /> {t("ar_save")}
        </Button>
      </CardHeader>
      <CardContent>
        {items && items.length === 0 ? (
          <Empty className="border border-dashed py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Archive />
              </EmptyMedia>
              <EmptyTitle>{t("ar_empty")}</EmptyTitle>
              <EmptyDescription>{t("ar_empty_d")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("ar_when")}</TableHead>
                <TableHead>{t("ar_period")}</TableHead>
                <TableHead className="text-right">{t("ar_wells")}</TableHead>
                <TableHead className="text-right">{t("ar_oil")}</TableHead>
                <TableHead className="text-right">{t("ar_shutins")}</TableHead>
                <TableHead className="text-right">{t("ar_files")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(items || []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">
                    {a.created.replace("T", " ").slice(0, 16)}
                    <Badge variant="outline" className="ml-2 font-normal text-muted-foreground">
                      {t(a.source === "manual" ? "ar_manual" : "ar_download")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {a.period_start ? `${fmtDate(a.period_start)} → ${fmtDate(a.period_end)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{a.wells}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.field_oil != null ? fmt(a.field_oil) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.shut_ins}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {a.files.length} · {kb(a.size)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button asChild size="sm" variant="ghost">
                        <a href={`${ENGINE_URL}/api/archive/${a.id}/download`}>
                          <ArrowDownToLine /> ZIP
                        </a>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon-sm" variant="ghost" aria-label={t("ar_delete")}>
                            <Trash2 />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("ar_delete_q")}</AlertDialogTitle>
                            <AlertDialogDescription>{a.created.replace("T", " ").slice(0, 16)}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("ar_cancel")}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(a.id)}>{t("ar_delete")}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function StepExport({ status, onDownload }: { status: EngineStatus; onDownload: (name: string) => void }) {
  const { t } = usePrefs();
  const [histKey, setHistKey] = React.useState(0);
  const ref = useReveal<HTMLDivElement>([status.stages.vfm, status.stages.pta]);
  const ready = (n: "vfm" | "pta") => status.stages[n] === "done" && (n === "vfm" || (status.meta.pta?.results?.length || 0) > 0);
  const clean = status.meta.clean;
  const groups: { phase: string; files: typeof FILES }[] = ["phase1", "phase2"].map((phase) => ({ phase, files: FILES.filter((f) => f.phase === phase) }));
  return (
    <div ref={ref}>
      <SectionHead
        index={t("s_export")}
        title={t("e_title")}
        ghost={t("e_ghost")}
        lead={
          clean
            ? t("e_lead", {
                a: fmtDate(clean.period_start),
                b: fmtDate(clean.period_end),
                w: clean.wells?.length ?? 0,
                d: fmt(status.meta.vfm?.rows),
                s: status.meta.pta?.results?.length ?? 0,
              })
            : t("e_lead_empty")
        }
        actions={
          ready("vfm") ? (
            <Button asChild>
              <a
                href={exportUrl("wellperf_deliverables.zip")}
                onClick={() => {
                  onDownload("wellperf_deliverables.zip");
                  window.setTimeout(() => setHistKey((k) => k + 1), 2500);
                }}
              >
                <Package /> {t("e_all")}
              </a>
            </Button>
          ) : (
            <Button disabled aria-disabled>
              <Package /> {t("e_all")}
            </Button>
          )
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.phase} className="gap-2" data-reveal>
            <CardHeader>
              <CardTitle>{t(g.phase)}</CardTitle>
            </CardHeader>
            <CardContent className="px-3">
              <ItemGroup>
                {g.files.map((f, i) => {
                  const ok = ready(f.needs);
                  const Icon = f.icon;
                  return (
                    <React.Fragment key={f.name}>
                      {i > 0 && <ItemSeparator />}
                      <Item size="sm" className={ok ? undefined : "opacity-60"}>
                        <ItemMedia variant="icon">
                          <Icon />
                        </ItemMedia>
                        <ItemContent>
                          <ItemTitle>
                            {t(f.key)}
                            <Badge variant="outline" className="font-mono font-normal text-muted-foreground">
                              {f.name}
                            </Badge>
                          </ItemTitle>
                          <ItemDescription>{t(`${f.key}_d`)}</ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          {ok ? (
                            <Button asChild size="sm" variant="outline">
                              <a href={exportUrl(f.name)} onClick={() => onDownload(f.name)}>
                                <ArrowDownToLine /> {t("download")}
                              </a>
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" disabled>
                              <ArrowDownToLine /> {t("e_first", { x: f.needs.toUpperCase() })}
                            </Button>
                          )}
                        </ItemActions>
                      </Item>
                    </React.Fragment>
                  );
                })}
              </ItemGroup>
            </CardContent>
          </Card>
        ))}
      </div>
      <ExportHistory canSave={ready("vfm")} refreshKey={histKey} />
    </div>
  );
}
