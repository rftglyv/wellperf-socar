"use client";

import React from "react";
import { ArrowDownToLine, FileCode2, FileSpreadsheet, FileText, Package } from "lucide-react";
import { EngineStatus, exportUrl, fmt, fmtDate } from "./api";
import { SectionHead, useReveal } from "./ui";
import { usePrefs } from "./prefs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";

const FILES: { name: string; key: string; needs: "vfm" | "pta"; icon: any; phase: string }[] = [
  { name: "vfm_predictions.xlsx", key: "f_vfm_xlsx", needs: "vfm", icon: FileSpreadsheet, phase: "phase1" },
  { name: "vfm_portal.csv", key: "f_vfm_csv", needs: "vfm", icon: FileText, phase: "phase1" },
  { name: "vfm_report.html", key: "f_vfm_html", needs: "vfm", icon: FileCode2, phase: "phase1" },
  { name: "pta_results.xlsx", key: "f_pta_xlsx", needs: "pta", icon: FileSpreadsheet, phase: "phase2" },
  { name: "pta_portal.csv", key: "f_pta_csv", needs: "pta", icon: FileText, phase: "phase2" },
  { name: "pta_report.html", key: "f_pta_html", needs: "pta", icon: FileCode2, phase: "phase2" },
];

export function StepExport({ status, onDownload }: { status: EngineStatus; onDownload: (name: string) => void }) {
  const { t } = usePrefs();
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
              <a href={exportUrl("wellperf_deliverables.zip")} onClick={() => onDownload("wellperf_deliverables.zip")}>
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
    </div>
  );
}
