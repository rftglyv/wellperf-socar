"use client";

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertCircle,
  Box,
  BrainCircuit,
  CheckCircle2,
  ChevronsUpDown,
  CircleHelp,
  Database,
  Download,
  Filter,
  Gauge,
  Home,
  Loader2,
  RotateCcw,
  ScrollText,
  Settings2,
  type LucideIcon,
  MessageSquareText,
} from "lucide-react";
import { openAiChat } from "./AiChat";
import { Kbd } from "@/components/ui/kbd";
import { EngineStatus, StageName, engineGet, enginePost, fmtDate } from "./api";
import { StepData } from "./StepData";
import { StepClean } from "./StepClean";
import { StepModel } from "./StepModel";
import { StepVFM } from "./StepVFM";
import { StepPTA } from "./StepPTA";
import { StepExport } from "./StepExport";
import { StepTwin } from "./StepTwin";
import { FieldHeatmaps } from "./Heatmaps";
import { PrefsControls, usePrefs } from "./prefs";
import { OnboardingTour } from "@/components/OnboardingTour";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

type StepId = "data" | "clean" | "model" | "vfm" | "pta" | "twin" | "export";
const STEPS: StepId[] = ["data", "clean", "model", "vfm", "pta", "twin", "export"];
const STEP_ICON: Record<StepId, LucideIcon> = {
  data: Database,
  clean: Filter,
  model: BrainCircuit,
  vfm: Gauge,
  pta: Activity,
  twin: Box,
  export: Download,
};

// On mobile the sidebar is a Sheet: close it once a step is picked so the content is visible.
function CloseMobileSidebarOnStep({ step }: { step: string }) {
  const { isMobile, setOpenMobile } = useSidebar();
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [step, isMobile, setOpenMobile]);
  return null;
}

export default function Workspace({ onHome }: { onHome?: () => void }) {
  const { t, theme, cssVars, lang } = usePrefs();
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [offline, setOffline] = useState(false);
  const [step, setStep] = useState<StepId>("data");
  const [running, setRunning] = useState<StageName | null>(null);
  const [well, setWell] = useState("GL-01");
  const [showLog, setShowLog] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    try {
      const tourSeen = localStorage.getItem("wellperf_tour_completed");
      if (!tourSeen) {
        setShowTour(true);
      }
    } catch {}
  }, []);

  const notify = useCallback((text: string, type: "ok" | "error" = "ok") => {
    if (type === "error") toast.error(text, { duration: 6000 });
    else toast.success(text);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await engineGet<EngineStatus>("/api/status");
      setStatus(s);
      setOffline(false);
      if (s.meta?.clean?.wells?.length) setWell((w) => (s.meta.clean.wells.includes(w) ? w : s.meta.clean.wells[0]));
    } catch {
      setOffline(true);
    }
  }, []);

  // Poll fast while the engine warms up / is unreachable, slowly otherwise (keeps several tabs in sync).
  const warm = !!status?.ready && !offline;
  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (!running) refresh();
    }, warm ? 6000 : 2000);
    return () => clearInterval(id);
  }, [refresh, warm, running]);

  const runStage = useCallback(
    async (stage: StageName) => {
      setRunning(stage);
      try {
        await enginePost(`/api/run/${stage}`);
        await refresh();
      } catch (e: any) {
        notify(e.message, "error");
        await refresh();
        throw e;
      } finally {
        setRunning(null);
      }
    },
    [notify, refresh]
  );

  const runAll = useCallback(async () => {
    try {
      for (const s of ["clean", "vfm", "pta"] as StageName[]) {
        setStep(s);
        await runStage(s);
      }
      notify(t("workflow_complete"));
    } catch {
      /* already notified */
    }
  }, [runStage, notify, t]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const hasData = !!status?.parts.some((p) => p.kind === "high_freq");
  const isDone = (id: StepId) => {
    if (!status) return false;
    if (id === "data") return hasData;
    if (id === "model") return status.ready;
    if (id === "export") return status.stages.vfm === "done";
    if (id === "twin") return status.stages.pta === "done";
    return status.stages[id] === "done";
  };
  const isStale = (id: StepId) => !!status && (id === "clean" || id === "vfm" || id === "pta") && status.stages[id] === "stale";
  const enabled = (id: StepId) => {
    if (!status) return id === "data" || id === "model";
    if (id === "data" || id === "model" || id === "twin") return true;
    if (id === "clean") return hasData;
    if (id === "vfm") return status.stages.clean !== "idle";
    return status.stages.vfm !== "idle";
  };

  const reset = async () => {
    setConfirmReset(false);
    await enginePost("/api/reset");
    setStep("data");
    await refresh();
  };

  const engineState = offline ? "offline" : !status ? "connecting" : status.error ? "error" : status.ready ? "ready" : "loading";
  const next = (id: StepId) => () => setStep(id);
  const stageMark = (s: StepId) => {
    if (running === s) return <Loader2 className="size-3.5 animate-spin text-primary" />;
    if (isDone(s)) return <CheckCircle2 className="size-3.5 text-success" />;
    if (isStale(s)) return <AlertCircle className="size-3.5 text-warning" />;
    return null;
  };
  const doneCount = STEPS.filter(isDone).length;
  const tourLabel = lang === "az" ? "Bələdçi" : lang === "ru" ? "Гид" : "Guided tour";
  const engineVariant = engineState === "ready" ? "bg-success" : engineState === "loading" || engineState === "connecting" ? "bg-warning" : "bg-destructive";

  return (
    <SidebarProvider>
      <CloseMobileSidebarOnStep step={step} />
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:px-0! group-data-[collapsible=icon]:py-0!"
                  >
                    <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary font-mono text-sm font-semibold text-sidebar-primary-foreground">
                      W
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">WellPerf</span>
                      <span className="truncate font-mono text-xs tabular-nums text-muted-foreground">
                        {status?.period ? `${fmtDate(status.period[0])} → ${fmtDate(status.period[1])}` : "VFM · PTA"}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg" align="start" side="bottom" sideOffset={4}>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">{t("uploaded_period")}</DropdownMenuLabel>
                  <div className="px-2 pb-2 font-mono text-xs tabular-nums">
                    {status?.period ? `${fmtDate(status.period[0])} → ${fmtDate(status.period[1])}` : t("nothing_yet")}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => setStep("data")}>
                      <Database />
                      {t("s_data")}
                    </DropdownMenuItem>
                    {onHome && (
                      <DropdownMenuItem onClick={onHome}>
                        <Home />
                        {t("back_home")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>
              {t("workflow")}
              <span className="ml-auto font-mono tabular-nums">{doneCount}/{STEPS.length}</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {STEPS.map((s, i) => {
                  const Icon = STEP_ICON[s];
                  const mark = stageMark(s);
                  return (
                    <SidebarMenuItem key={s}>
                      <SidebarMenuButton
                        isActive={step === s}
                        disabled={!enabled(s)}
                        onClick={() => setStep(s)}
                        tooltip={`${i + 1}. ${t(`s_${s}`)}`}
                        data-step={s}
                      >
                        <Icon />
                        <span className="truncate">{t(`s_${s}`)}</span>
                      </SidebarMenuButton>
                      {mark && <SidebarMenuBadge>{mark}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:px-0! group-data-[collapsible=icon]:py-0!"
                  >
                    <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg border bg-background">
                      <span className={cn("size-2 rounded-full", engineVariant)} />
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{t("engine")}</span>
                      <span className="truncate text-xs text-muted-foreground">{t(`engine_${engineState}`)}</span>
                    </div>
                    <Settings2 className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg" side="top" align="end" sideOffset={4}>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">localhost:8000</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => setShowLog(true)}>
                      <ScrollText />
                      {t("activity_log")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowTour(true)}>
                      <CircleHelp />
                      {tourLabel}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setConfirmReset(true)}>
                    <RotateCcw />
                    {t("reset")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <SidebarTrigger className="-ml-1" aria-label={t("sidebar_toggle")} title={t("sidebar_toggle")} />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden font-mono text-xs tabular-nums md:block">
                {STEPS.indexOf(step) + 1} / {STEPS.length}
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{t(`s_${step}`)}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-2">
            {running && (
              <Badge variant="secondary" className="gap-1.5 font-normal">
                <Loader2 className="size-3 animate-spin" />
                {t(`s_${running}`)}
              </Badge>
            )}
            <Button variant="outline" size="sm" data-tour="ask" onClick={openAiChat} title="Ctrl+K">
              <MessageSquareText />
              <span className="hidden sm:inline">{lang === "az" ? "Soruş" : lang === "ru" ? "Спросить" : "Ask AI"}</span>
              <Kbd className="hidden md:inline-flex">⌘K</Kbd>
            </Button>
            <PrefsControls />
          </div>
        </header>

        <div className="wf" data-theme={theme} style={cssVars}>
          <div key={step} className="wf-content mx-auto w-full max-w-[1400px] animate-in fade-in-0 duration-300">
            {offline && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle />
                <AlertTitle>{t("engine_unreachable")}</AlertTitle>
                <AlertDescription className="font-mono text-xs">
                  cd engine &amp;&amp; python -m uvicorn api_server:app --port 8000
                </AlertDescription>
              </Alert>
            )}
            {status?.error && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle />
                <AlertDescription>{status.error}</AlertDescription>
              </Alert>
            )}

            {!status ? (
              <div className="flex flex-col gap-4">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-96" />
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
                  <Skeleton className="h-80" />
                  <Skeleton className="h-80" />
                </div>
              </div>
            ) : step === "data" ? (
              <StepData status={status} refresh={refresh} notify={notify} runAll={runAll} busy={!!running} goNext={next("clean")} />
            ) : step === "clean" ? (
              <StepClean status={status} run={() => runStage("clean").catch(() => {})} running={running === "clean"} goNext={next("model")} well={well} setWell={setWell} />
            ) : step === "model" ? (
              <StepModel goNext={next("vfm")} canNext={status.stages.clean !== "idle"} />
            ) : step === "vfm" ? (
              <StepVFM status={status} run={() => runStage("vfm").catch(() => {})} running={running === "vfm"} goNext={next("pta")} well={well} setWell={setWell} />
            ) : step === "pta" ? (
              <StepPTA status={status} run={() => runStage("pta").catch(() => {})} running={running === "pta"} goNext={next("twin")} notify={notify} refresh={refresh} />
            ) : step === "twin" ? (
              <StepTwin status={status} well={well} setWell={setWell} goVFM={next("vfm")} goPTA={next("pta")} />
            ) : (
              <StepExport status={status} onDownload={(n) => notify(t("e_downloading", { n }))} />
            )}

            {status && (step === "clean" || step === "vfm" || step === "twin") && (
              <FieldHeatmaps
                wells={Array.from(new Set([...(status.model?.wells || []), ...(status.meta.clean?.wells || [])])).sort()}
                show={step === "clean" ? ["sensors"] : step === "vfm" ? ["rates"] : ["rates", "sensors"]}
                ratesReady={status.stages.vfm === "done"}
                sensorsReady={status.stages.clean === "done"}
                ratesVer={`${status.meta.vfm?.rows}|${status.meta.vfm?.cum_oil}`}
                sensorsVer={`${status.period?.join("|")}|${status.meta.clean?.rows ?? ""}`}
                selected={well}
                onSelect={setWell}
              />
            )}
          </div>
        </div>
      </SidebarInset>

      <Sheet open={showLog} onOpenChange={setShowLog}>
        <SheetContent className="flex w-full flex-col sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t("activity_log")}</SheetTitle>
            <SheetDescription>Engine events, newest first.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
            {!status || status.log.length === 0 ? (
              <div className="text-muted-foreground">{t("nothing_yet")}</div>
            ) : (
              [...status.log].reverse().map((l, i) => (
                <div key={i} className={cn(l.level === "error" && "text-destructive", l.level === "warn" && "text-warning")}>
                  <span className="text-muted-foreground">{l.t.slice(11)}</span> {l.msg}
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("reset")}</AlertDialogTitle>
            <AlertDialogDescription>{t("reset_confirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("close")}</AlertDialogCancel>
            <AlertDialogAction onClick={reset}>{t("reset")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Toaster theme={theme} position="bottom-right" />

      <OnboardingTour
        isOpen={showTour}
        onClose={() => setShowTour(false)}
        lang={lang.toUpperCase() as "AZ" | "EN" | "RU"}
        onSelectTab={(tabKey) => {
          if (tabKey === "data") setStep("data");
          else if (tabKey === "command") setStep("clean");
          else if (tabKey === "vfm") setStep("vfm");
          else if (tabKey === "pta") setStep("pta");
          else if (tabKey === "export") setStep("export");
        }}
      />
    </SidebarProvider>
  );
}
