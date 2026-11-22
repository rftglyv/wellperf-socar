"use client";

import React, { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import gsap from "gsap";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as SliderPrimitive from "@radix-ui/react-slider";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Database,
  Download,
  FileSpreadsheet,
  Flame,
  Gauge,
  Home,
  Compass,
  KeyRound,
  LogOut,
  Play,
  ShieldCheck,
  Sliders,
  Box,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  Input,
  Label,
  Separator,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/primitives";
import { apiFetch, API_URL } from "@/lib/utils";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { AzersilahLanding } from "@/components/AzersilahLanding";
import { ClaudeWorkspace } from "@/components/ClaudeWorkspace";
import { OnboardingTour } from "@/components/OnboardingTour";
import { RawDataUploader } from "@/components/RawDataUploader";
import {
  AppLang,
  TRANSLATIONS,
  ExportLogItem,
  getExportLogs,
  recordExportLog,
  triggerClientDownload,
} from "@/lib/i18n";

const CaspianField3D = dynamic(() => import("@/components/CaspianField3D"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[460px] rounded-md border border-zinc-800 bg-[rgb(var(--wp-canvas))] flex items-center justify-center text-xs font-mono text-zinc-500">
      Initializing 3D Subsurface Viewport…
    </div>
  ),
});

type NavTab =
  | "command"
  | "ai"
  | "data"
  | "vfm"
  | "pta"
  | "gaslift"
  | "export"
  | "logs"
  | "rbac";

const ROLE_BADGE_MAP: Record<string, "amber" | "emerald" | "cyan" | "purple" | "slate"> = {
  ADMIN: "amber",
  RESERVOIR_ENGINEER: "emerald",
  PRODUCTION_ENGINEER: "cyan",
  DATA_SCIENTIST: "purple",
  FIELD_OPERATOR: "slate",
};

function ShadcnSlider({
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
  disabled?: boolean;
}) {
  return (
    <SliderPrimitive.Root
      className="relative flex w-full touch-none select-none items-center py-1.5"
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={(vals) => onChange(vals[0])}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-zinc-800">
        <SliderPrimitive.Range className="absolute h-full bg-[#023F46] dark:bg-teal-400" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-3.5 w-3.5 rounded-full border border-[#023F46] dark:border-teal-300 bg-white shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-400 disabled:pointer-events-none disabled:opacity-50" />
    </SliderPrimitive.Root>
  );
}

export default function WellPerfEnterpriseApp() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<any[]>([]);
  const [loginEmail, setLoginEmail] = useState("admin@socar.az");
  const [loginPassword, setLoginPassword] = useState("Password123!");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>("command");
  const [selectedWell, setSelectedWell] = useState<string>("GL-01");
  const [wellLoading, setWellLoading] = useState<boolean>(false);
  const [lang, setLang] = useState<AppLang>("AZ");
  const [exportLogs, setExportLogs] = useState<ExportLogItem[]>([]);
  const [showLanding, setShowLanding] = useState<boolean>(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [wellsMenuOpen, setWellsMenuOpen] = useState<boolean>(false);
  const [userMenuOpen, setUserMenuOpen] = useState<boolean>(false);
  const [bootstrap, setBootstrap] = useState<any | null>(null);
  const t = TRANSLATIONS[lang];
  const [wellSeries, setWellSeries] = useState<any | null>(null);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // VFM Simulator
  const [simPwf, setSimPwf] = useState<number>(3220);
  const [simTemp, setSimTemp] = useState<number>(203.0);
  const [simAnnulus, setSimAnnulus] = useState<number>(1150);
  const [simLiftGas, setSimLiftGas] = useState<number>(820);
  const [simChoke64, setSimChoke64] = useState<number>(48);
  const [simResult, setSimResult] = useState<any | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [retrainResult, setRetrainResult] = useState<any | null>(null);
  const [retrainLoading, setRetrainLoading] = useState(false);

  // PTA
  const [selectedEventId, setSelectedEventId] = useState<string>("GL-06_20250722_0311");
  const [ptaDetail, setPtaDetail] = useState<any | null>(null);
  const [ptaPlotMode, setPtaPlotMode] = useState<string>("loglog");
  const [overrideQ, setOverrideQ] = useState<string>("");
  const [overrideStartH, setOverrideStartH] = useState<string>("");
  const [overrideEndH, setOverrideEndH] = useState<string>("");
  const [ptaOverrideLoading, setPtaOverrideLoading] = useState(false);

  // Lift-Gas Optimiser
  const [donorWell, setDonorWell] = useState("GL-04");
  const [receiverWell, setReceiverWell] = useState("GL-01");
  const [shiftMscfd, setShiftMscfd] = useState<number>(100);
  const [oilPrice, setOilPrice] = useState<number>(70);
  const [glSimResult, setGlSimResult] = useState<any | null>(null);

  // RBAC
  const [rbacOverview, setRbacOverview] = useState<any | null>(null);

  // Guided Onboarding Tour
  const [isTourOpen, setIsTourOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !showLanding && token) {
      const tourDone = localStorage.getItem("wellperf_tour_completed");
      if (!tourDone) {
        setIsTourOpen(true);
      }
    }
  }, [showLanding, token]);

  const showNotice = (text: string, type: "success" | "error" | "info" = "info") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4500);
  };

  useEffect(() => {
    apiFetch("/auth/demo-accounts")
      .then((res) => setDemoAccounts(res.accounts || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    apiFetch("/field/bootstrap", {}, token)
      .then((data) => {
        setBootstrap(data);
        if (data.ptaEvents?.length && !selectedEventId) {
          setSelectedEventId(data.ptaEvents[0].event_id);
        }
      })
      .catch((err) => showNotice(err.message, "error"));
  }, [token]);

  useEffect(() => {
    setExportLogs(getExportLogs());
    const onLogged = () => setExportLogs(getExportLogs());
    window.addEventListener("wp-export-logged", onLogged);
    return () => window.removeEventListener("wp-export-logged", onLogged);
  }, []);

  useEffect(() => {
    if (!token || !selectedWell) return;
    setWellLoading(true);
    const startTs = Date.now();
    apiFetch(`/wells/${selectedWell}/timeseries`, {}, token)
      .then((data) => {
        const elapsed = Date.now() - startTs;
        const remain = Math.max(0, 320 - elapsed);
        setTimeout(() => {
          setWellSeries(data);
          const lastSensor = data.sensors?.[data.sensors.length - 1];
          if (lastSensor) {
            setSimPwf(Math.round(lastSensor.dh_pressure_psia_mean || 2800));
            setSimTemp(Number((lastSensor.dh_temperature_degf_mean || 185).toFixed(1)));
            setSimAnnulus(Math.round(lastSensor.annulus_pressure_psia_mean || 1100));
            setSimLiftGas(Math.round(lastSensor.gas_lift_rate_mscfd_mean || 850));
          }
          setWellLoading(false);
        }, remain);
      })
      .catch((err) => {
        setWellLoading(false);
        showNotice(err.message, "error");
      });
  }, [token, selectedWell]);

  useEffect(() => {
    if (!token || !selectedEventId) return;
    apiFetch(`/pta/events/${selectedEventId}`, {}, token)
      .then((ev) => {
        setPtaDetail(ev);
        setOverrideQ(String(ev.properties?.q_oil_before_shut_in_stbd?.toFixed(1) || ""));
        setOverrideStartH(String(ev.properties?.iarf_start_hours?.toFixed(2) || ""));
        setOverrideEndH(String(ev.properties?.iarf_end_hours?.toFixed(2) || ""));
      })
      .catch((err) => showNotice(err.message, "error"));
  }, [token, selectedEventId]);

  useEffect(() => {
    if (!token || (activeTab !== "rbac" && activeTab !== "logs")) return;
    apiFetch("/rbac/overview", {}, token)
      .then(setRbacOverview)
      .catch((err) => showNotice(err.message, "error"));
  }, [token, activeTab, user]);

  // GSAP Staggered Entrance Animation on Tab / View Change
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".gsap-stagger",
        { opacity: 0, y: 12 },
        {
          opacity: 1,
          y: 0,
          duration: 0.42,
          stagger: 0.05,
          ease: "power3.out",
          clearProps: "transform",
        }
      );
    });
    return () => ctx.revert();
  }, [activeTab, token]);

  const handleLogin = async (emailToUse?: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: emailToUse || loginEmail,
          password: loginPassword,
        }),
      });
      setToken(res.token);
      setUser(res.user);
      showNotice(`Session active: ${res.user.name} [${res.user.role}]`, "success");
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleQuickRoleSwitch = async (targetEmail: string) => {
    if (!token) return;
    try {
      const res = await apiFetch(
        "/auth/switch-role",
        {
          method: "POST",
          body: JSON.stringify({ targetEmail }),
        },
        token
      );
      setToken(res.token);
      setUser(res.user);
      showNotice(`Role switched: ${res.user.role} (${res.user.name})`, "info");
    } catch (err: any) {
      showNotice(err.message, "error");
    }
  };

  const hasPerm = (perm: string) => {
    if (!user) return false;
    return user.role === "ADMIN" || (user.permissions || []).includes(perm);
  };

  const runVFMSimulation = async () => {
    if (!token) return;
    setSimLoading(true);
    try {
      const res = await apiFetch(
        "/vfm/simulate",
        {
          method: "POST",
          body: JSON.stringify({
            well_name: selectedWell,
            dh_pressure_psia: simPwf,
            dh_temperature_degf: simTemp,
            annulus_pressure_psia: simAnnulus,
            gas_lift_rate_mscfd: simLiftGas,
            choke_size_64ths: simChoke64,
            date_str: "2025-09-15",
            uptime_frac: 1.0,
          }),
        },
        token
      );
      setSimResult(res);
      showNotice(
        `${selectedWell} VFM: Qo = ${res.oil_rate_stbd} STB/d, Qw = ${res.water_rate_stbd} STB/d`,
        "success"
      );
    } catch (err: any) {
      showNotice(err.message, "error");
    } finally {
      setSimLoading(false);
    }
  };

  const runPythonRetrain = async () => {
    if (!token) return;
    setRetrainLoading(true);
    try {
      const res = await apiFetch("/vfm/retrain", { method: "POST" }, token);
      setRetrainResult(res);
      showNotice(
        `Python VFM verified (${res.elapsed_sec}s): Forward MAPE ${res.oil_forward_mape_pct}%`,
        "success"
      );
    } catch (err: any) {
      showNotice(err.message, "error");
    } finally {
      setRetrainLoading(false);
    }
  };

  const handlePTAOverride = async (reset = false) => {
    if (!token || !selectedEventId) return;
    setPtaOverrideLoading(true);
    try {
      const res = await apiFetch(
        `/pta/events/${selectedEventId}/override`,
        {
          method: "POST",
          body: JSON.stringify(
            reset
              ? { reset: true }
              : {
                  q_oil_stbd: Number(overrideQ),
                  window_start_hours: Number(overrideStartH),
                  window_end_hours: Number(overrideEndH),
                }
          ),
        },
        token
      );
      setPtaDetail(res);
      setOverrideQ(String(res.properties?.q_oil_before_shut_in_stbd?.toFixed(1) || ""));
      setOverrideStartH(String(res.properties?.iarf_start_hours?.toFixed(2) || ""));
      setOverrideEndH(String(res.properties?.iarf_end_hours?.toFixed(2) || ""));
      const b = await apiFetch("/field/bootstrap", {}, token);
      setBootstrap(b);
      showNotice(
        reset
          ? `${selectedEventId} reset to automatic IARF window`
          : `${selectedEventId} updated: k = ${res.properties.permeability_md.toFixed(1)} md, s = ${res.properties.skin.toFixed(2)}`,
        "success"
      );
    } catch (err: any) {
      showNotice(err.message, "error");
    } finally {
      setPtaOverrideLoading(false);
    }
  };

  const runGasLiftAllocation = async () => {
    if (!token) return;
    try {
      const res = await apiFetch(
        "/gaslift/allocate",
        {
          method: "POST",
          body: JSON.stringify({
            donorWell,
            receiverWell,
            shiftMscfd,
            oilPriceUsd: oilPrice,
          }),
        },
        token
      );
      setGlSimResult(res);
      showNotice(
        `Reallocation (${donorWell} → ${receiverWell}): +${res.netOilGainStbd} STB/d (+$${res.annualRevenueUsd.toLocaleString()}/yr)`,
        "success"
      );
    } catch (err: any) {
      showNotice(err.message, "error");
    }
  };

  const fieldTotals = useMemo(() => {
    if (!bootstrap?.wellAverages) {
      return { oil: 14250, water: 7170, gas: 3660, liftGas: 9100 };
    }
    const oil = bootstrap.wellAverages.reduce((acc: number, w: any) => acc + (w.avg_oil || 0), 0);
    const water = bootstrap.wellAverages.reduce((acc: number, w: any) => acc + (w.avg_water || 0), 0);
    const gas = bootstrap.wellAverages.reduce((acc: number, w: any) => acc + (w.avg_gas || 0), 0);
    return {
      oil: Math.round(oil),
      water: Math.round(water),
      gas: Math.round(gas),
      liftGas: 9100,
    };
  }, [bootstrap]);

  // ==========================================================
  // AZERSILAH.COM ARCHITECTURAL LANDING PAGE
  // ==========================================================
  if (showLanding) {
    return (
      <AzersilahLanding
        lang={lang}
        onChangeLang={setLang}
        onLaunchDashboard={(targetTab) => {
          if (targetTab) setActiveTab(targetTab);
          setShowLanding(false);
          if (!token) {
            handleLogin("admin@socar.az");
          }
          if (typeof window !== "undefined") {
            const tourDone = localStorage.getItem("wellperf_tour_completed");
            if (!tourDone) {
              setIsTourOpen(true);
            }
          }
        }}
      />
    );
  }

  // ==========================================================
  // AUTH SCREEN
  // ==========================================================
  if (!token || !user) {
    return (
      <div className="min-h-screen bg-[rgb(var(--wp-canvas))] text-zinc-100 flex flex-col justify-between relative overflow-hidden">
        {/* Realistic Animated Caspian Rig Backdrop */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <img
            src="/caspian-rig.gif"
            alt="Caspian Offshore Rig"
            className="w-full h-full object-cover opacity-25 filter blur-[0.5px]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[rgb(var(--wp-canvas))] via-[rgb(var(--wp-canvas))]/85 to-[rgb(var(--wp-canvas))]/70" />
        </div>
        <header className="w-full border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-cyan-500 text-zinc-950 flex items-center justify-center font-mono font-bold text-xs shadow-sm">
              WP
            </div>
            <span className="font-semibold text-sm tracking-tight text-zinc-100">WellPerf</span>
            <Badge variant="cyan" className="font-mono text-[10px]">Enterprise</Badge>
          </div>
          <AppearanceSettings />
        </header>

        <main className="max-w-4xl w-full mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left Column: Quick Workspace Profiles */}
          <div className="lg:col-span-7 space-y-4 gsap-stagger">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
                Autonomous Well Surveillance & 3D Twin
              </h1>
              <p className="text-xs text-zinc-400 mt-1">
                Real-time Virtual Flow Metering, Pressure Transient Diagnostics & Lift-Gas Optimization.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/90">
                <div className="text-[10px] text-zinc-400">VFM Accuracy</div>
                <div className="text-base font-mono font-bold text-emerald-400 mt-0.5">96.3%</div>
              </div>
              <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/90">
                <div className="text-[10px] text-zinc-400">Field Production</div>
                <div className="text-base font-mono font-bold text-zinc-100 mt-0.5">14.2k bbl/d</div>
              </div>
              <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/90">
                <div className="text-[10px] text-zinc-400">Workover Target</div>
                <div className="text-base font-mono font-bold text-amber-400 mt-0.5">GL-06</div>
              </div>
              <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/90">
                <div className="text-[10px] text-zinc-400">Gas-Lift Yield</div>
                <div className="text-base font-mono font-bold text-cyan-400 mt-0.5">+$485k/yr</div>
              </div>
            </div>

            <Card>
              <CardHeader className="py-2.5 px-4 border-b border-zinc-800">
                <CardTitle className="text-xs font-semibold text-zinc-200">
                  Instant Workspace Access
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {demoAccounts.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => {
                      setLoginEmail(acc.email);
                      handleLogin(acc.email);
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-zinc-800/80 bg-zinc-900/50 hover:border-cyan-500/50 hover:bg-zinc-900 text-left transition"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-semibold text-zinc-100 truncate">{acc.name}</div>
                      <div className="text-[10px] text-zinc-400 truncate">{acc.title}</div>
                    </div>
                    <Badge variant={ROLE_BADGE_MAP[acc.role] || "slate"} className="shrink-0 text-[9px]">
                      {acc.role.split("_")[0]}
                    </Badge>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Sign-In Card */}
          <div className="lg:col-span-5 gsap-stagger">
            <Card>
              <CardHeader className="space-y-1 border-b border-zinc-800 pb-3">
                <CardTitle className="text-sm font-semibold">Sign In</CardTitle>
                <CardDescription>Enter workspace credentials</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-3.5">
                <div className="space-y-1">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="admin@socar.az"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                  />
                </div>
                {authError && (
                  <div className="p-2 rounded border border-red-900 bg-red-950/50 text-xs text-red-300">
                    {authError}
                  </div>
                )}
                <Button
                  variant="default"
                  className="w-full"
                  onClick={() => handleLogin()}
                  disabled={authLoading}
                >
                  {authLoading ? "Signing in…" : "Launch Platform"}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>

        <footer className="w-full border-t border-zinc-800/80 px-6 py-2.5 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <span>WellPerf Intelligence Suite</span>
          <span>v2.6 Enterprise</span>
        </footer>
      </div>
    );
  }

  // ==========================================================
  // AUTHENTICATED WORKBENCH — Clean Sidebar + shadcn Layout
  // ==========================================================
  const currentWellProfile = bootstrap?.wells?.find((w: any) => w.well_name === selectedWell);
  const meta = bootstrap?.metadata;

  const navItems: { id: NavTab; label: string; badge?: number | null; isAi?: boolean; icon: any }[] = [
    { id: "command", label: t.nav_command, icon: Box },
    { id: "ai", label: t.nav_ai, isAi: true, icon: Cpu },
    { id: "data", label: t.nav_data, icon: Database },
    { id: "vfm", label: t.nav_vfm, icon: Gauge },
    { id: "pta", label: t.nav_pta, icon: Activity },
    { id: "gaslift", label: t.nav_gaslift, icon: Flame },
    { id: "export", label: t.nav_export, icon: FileSpreadsheet },
    { id: "logs", label: t.nav_logs, badge: exportLogs.length, icon: ShieldCheck },
  ];

  return (
    <div className="flex w-full min-h-screen overflow-x-hidden bg-[rgb(var(--wp-canvas))] text-zinc-100 transition-colors duration-200">
      {/* ================================================================= */}
      {/* EXACT 13.140.158.231.nip.io COLLAPSIBLE SIDEBAR (Layout-1HBEUZVB) */}
      {/* ================================================================= */}
      <aside
        className={`fixed top-0 left-0 z-40 hidden md:flex h-screen flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-100 transition-all duration-300 select-none ${
          isSidebarCollapsed ? "w-[4.5rem]" : "w-[15.875rem]"
        }`}
      >
        {/* Sidebar Top Header */}
        <div
          className={`flex h-14 items-center border-b border-zinc-800 px-4 ${
            isSidebarCollapsed ? "justify-center" : "justify-between"
          }`}
        >
          {!isSidebarCollapsed && (
            <button
              type="button"
              onClick={() => setShowLanding(true)}
              className="flex items-center gap-2.5 overflow-hidden text-left"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#155EEF] text-white font-bold text-xs shadow-xs">
                WP
              </div>
              <div className="truncate">
                <div className="text-sm font-bold tracking-tight text-zinc-100 leading-none">
                  WellPerf
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">Enterprise Suite</div>
              </div>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed((c) => !c)}
            title={isSidebarCollapsed ? "Menyunu aç" : "Menyunu yığ"}
            className="flex size-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 shrink-0 transition-colors"
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </button>
        </div>

        {/* Sidebar Scrollable Nav Items */}
        <div
          className={`flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-1 ${
            isSidebarCollapsed ? "px-2" : "px-3"
          }`}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                title={isSidebarCollapsed ? item.label : undefined}
                className={`group flex w-full items-center rounded-xl py-2.5 text-sm font-medium transition-all cursor-pointer ${
                  isSidebarCollapsed ? "justify-center px-0 gap-0" : "justify-start px-3 gap-3"
                } ${
                  active
                    ? "bg-[#155EEF] text-white shadow-xs font-semibold"
                    : "text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
                }`}
              >
                {item.isAi ? (
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg overflow-hidden border border-[#3B82F6]/50 bg-zinc-900">
                    <img
                      src="/ai-avatar.png"
                      alt="AI"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                      className="w-full h-full object-cover"
                    />
                  </span>
                ) : (
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      active
                        ? "bg-white/15 text-white"
                        : "bg-zinc-900 text-zinc-300 group-hover:bg-[#155EEF]/15 group-hover:text-[#3B82F6]"
                    }`}
                  >
                    <Icon className="size-4" />
                  </span>
                )}
                {!isSidebarCollapsed && (
                  <>
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {item.badge !== undefined && item.badge !== null && (
                      <span
                        className={`ml-auto inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${
                          active
                            ? "bg-white/20 text-white"
                            : "bg-[#155EEF]/15 text-[#3B82F6]"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}

          {/* Expandable Wells Tree Item (Exact nip.io submenu pattern) */}
          <div className="space-y-1 pt-1">
            <button
              type="button"
              onClick={() => {
                if (isSidebarCollapsed) setIsSidebarCollapsed(false);
                setWellsMenuOpen((o) => !o);
              }}
              title={isSidebarCollapsed ? "Quyular (10)" : undefined}
              className={`group flex w-full items-center rounded-xl py-2.5 text-sm font-medium transition-all cursor-pointer text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 ${
                isSidebarCollapsed ? "justify-center px-0 gap-0" : "justify-start px-3 gap-3"
              }`}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-zinc-300 group-hover:bg-[#155EEF]/15 group-hover:text-[#3B82F6] transition-colors">
                <Sliders className="size-4" />
              </span>
              {!isSidebarCollapsed && (
                <>
                  <span className="flex-1 text-left truncate">Quyular ({selectedWell})</span>
                  <ChevronDown
                    className={`size-4 shrink-0 text-zinc-400 transition-transform duration-200 ${
                      wellsMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </>
              )}
            </button>

            {!isSidebarCollapsed && wellsMenuOpen && (
              <div className="ml-4 pl-3 border-l border-zinc-800 grid grid-cols-2 gap-1 py-1">
                {(bootstrap?.wells || []).map((w: any) => {
                  const isSel = selectedWell === w.well_name;
                  return (
                    <button
                      key={w.well_name}
                      type="button"
                      onClick={() => setSelectedWell(w.well_name)}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        isSel
                          ? "bg-[#155EEF]/15 text-[#3B82F6] font-semibold"
                          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full shrink-0 ${
                          isSel ? "bg-[#3B82F6]" : "bg-zinc-600"
                        }`}
                      />
                      <span className="truncate font-mono">{w.well_name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Bottom Logout Button (Exact nip.io destructive style) */}
        <div className={`border-t border-zinc-800 py-3 ${isSidebarCollapsed ? "px-2" : "px-3"}`}>
          <button
            type="button"
            onClick={() => {
              setToken(null);
              setUser(null);
            }}
            title={isSidebarCollapsed ? "Çıxış" : undefined}
            className={`group flex w-full items-center rounded-xl py-2.5 text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer ${
              isSidebarCollapsed ? "justify-center px-0 gap-0" : "justify-start text-left px-3 gap-3"
            }`}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-500 group-hover:bg-red-500 group-hover:text-white transition-colors">
              <LogOut className="size-4" />
            </span>
            {!isSidebarCollapsed && <span className="flex-1 text-left truncate">Çıxış</span>}
          </button>
        </div>
      </aside>

      {/* ================================================================= */}
      {/* MAIN CONTENT WRAPPER (Dynamic margin matching nip.io layout)      */}
      {/* ================================================================= */}
      <div
        className={`flex flex-col flex-1 min-w-0 transition-all duration-300 ${
          isSidebarCollapsed ? "md:ml-[4.5rem]" : "md:ml-[15.875rem]"
        }`}
      >
        {/* Top Sticky Header (Exact nip.io dt header) */}
        <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-6 backdrop-blur-xs transition-colors duration-200">
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-4 text-xs font-mono">
              <div>
                <span className="text-zinc-500">Qo: </span>
                <span className="text-zinc-100 font-semibold">{fieldTotals.oil.toLocaleString()} bbl/d</span>
              </div>
              <div>
                <span className="text-zinc-500">Qw: </span>
                <span className="text-zinc-300">{fieldTotals.water.toLocaleString()} bbl/d</span>
              </div>
              <div>
                <span className="text-zinc-500">VFM MAPE: </span>
                <span className="text-emerald-400 font-semibold">3.72%</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Multi-Language Switcher (AZ / EN / RU) */}
            <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
              {(["AZ", "EN", "RU"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={`px-2 py-1 rounded-md text-[11px] font-mono font-semibold transition ${
                    lang === l
                      ? "bg-[#155EEF] text-white shadow-2xs"
                      : "text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <AppearanceSettings />

            <button
              type="button"
              onClick={() => setIsTourOpen(true)}
              className="inline-flex items-center h-8 gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/30 hover:bg-cyan-950/60 px-3 text-xs font-semibold text-cyan-300 shadow-xs transition"
              title={lang === "AZ" ? "Sistem Bələdçisi" : lang === "RU" ? "Гид по Системе" : "System Tour"}
            >
              <Compass className="size-3.5 text-cyan-400" />
              <span className="hidden md:inline">{lang === "AZ" ? "Bələdçi" : lang === "RU" ? "Гид" : "Tour"}</span>
            </button>

            <Link
              href="/presentation"
              className="inline-flex items-center h-8 gap-1.5 rounded-lg border border-purple-500/30 bg-purple-950/30 hover:bg-purple-950/60 px-3 text-xs font-semibold text-purple-300 shadow-xs transition"
              title={lang === "AZ" ? "10 Slaydlıq Təqdimat" : "Pitch Deck"}
            >
              <FileSpreadsheet className="size-3.5 text-purple-400" />
              <span className="hidden md:inline">{lang === "AZ" ? "Təqdimat" : "Deck"}</span>
            </Link>

            <button
              type="button"
              onClick={() => setShowLanding(true)}
              className="inline-flex items-center h-8 gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-900 transition"
            >
              <Home className="size-3.5 text-[#3B82F6]" />
              <span className="hidden md:inline">{t.landing_btn}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("ai")}
              className="inline-flex items-center h-8 gap-1.5 rounded-lg bg-[#155EEF] hover:bg-[#155EEF]/90 px-3 text-xs font-semibold text-white shadow-xs transition"
            >
              <img
                src="/ai-avatar.png"
                alt="AI"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
                className="size-4 rounded-full object-cover"
              />
              <span className="hidden md:inline">Claude AI</span>
            </button>

            {/* User Avatar Dropdown (Exact nip.io Header Profile Button) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2.5 rounded-xl p-1.5 pr-2.5 h-auto text-left hover:bg-zinc-900 transition cursor-pointer"
              >
                <div
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-zinc-700 font-bold text-xs uppercase text-white"
                  style={{ backgroundColor: "#155EEF" }}
                >
                  {user.name
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div className="hidden sm:flex flex-col max-w-[10rem]">
                  <span className="truncate text-xs font-semibold text-zinc-100 leading-tight">
                    {user.name}
                  </span>
                  <span className="truncate text-xs text-zinc-400 leading-tight mt-0.5">
                    @{user.role.toLowerCase()}
                  </span>
                </div>
                <ChevronDown className="size-4 text-zinc-400" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-56 rounded-xl border border-zinc-800 bg-zinc-950 p-1.5 shadow-xl z-50">
                  <div className="px-2.5 py-2 border-b border-zinc-800">
                    <p className="text-sm font-semibold text-zinc-100">{user.name}</p>
                    <p className="text-xs text-zinc-400 font-mono">{user.email}</p>
                  </div>
                  <div className="py-1">
                    <div className="px-2.5 py-1 text-[10px] font-semibold uppercase text-zinc-500">
                      Rol Dəyişdir
                    </div>
                    {demoAccounts.map((acc) => (
                      <button
                        key={acc.email}
                        type="button"
                        onClick={() => {
                          handleQuickRoleSwitch(acc.email);
                          setUserMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
                      >
                        <span className="truncate">{acc.name}</span>
                        <span className="text-[10px] font-mono text-[#3B82F6]">
                          {acc.role.split("_")[0]}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-zinc-800 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setToken(null);
                        setUser(null);
                      }}
                      className="w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10"
                    >
                      <LogOut className="size-3.5" />
                      <span>Çıxış</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Sub-Header Breadcrumb Bar + Well Pills (Exact nip.io mt Breadcrumb) */}
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950/60 px-6 py-2.5 text-xs text-zinc-400 backdrop-blur-xs"
        >
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowLanding(true)}
              className="inline-flex items-center gap-1.5 font-medium text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <Home className="h-3.5 w-3.5" />
              <span>Ana səhifə</span>
            </button>
            <ChevronRight className="size-3.5 text-zinc-600 shrink-0" />
            <span className="font-semibold text-zinc-100 bg-zinc-900 px-2 py-0.5 rounded-md">
              {navItems.find((n) => n.id === activeTab)?.label}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {wellLoading && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#155EEF]/15 text-[#3B82F6] text-[11px] font-mono border border-[#3B82F6]/30">
                <span className="size-2 rounded-full bg-[#3B82F6] animate-ping" />
                <span>{t.loading_well}</span>
              </span>
            )}
            {(bootstrap?.wells || []).map((w: any) => (
              <button
                key={w.well_name}
                type="button"
                disabled={wellLoading}
                onClick={() => setSelectedWell(w.well_name)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition ${
                  selectedWell === w.well_name
                    ? "bg-[#155EEF] text-white font-semibold shadow-2xs"
                    : "bg-zinc-900 text-zinc-400 hover:text-zinc-100 border border-zinc-800"
                } ${wellLoading ? "opacity-60 cursor-wait" : ""}`}
              >
                {w.well_name}
              </button>
            ))}
          </div>
        </nav>

        {/* Top Progress Shimmer Line during Well Telemetry Fetch */}
        {wellLoading && (
          <div className="h-0.5 w-full bg-zinc-900 overflow-hidden">
            <div className="h-full w-1/2 bg-[#3B82F6] animate-pulse" />
          </div>
        )}

        {/* Toast Banner */}
        {toast && (
          <div
            className={`fixed bottom-4 right-4 z-50 px-3.5 py-2.5 rounded-md border text-xs font-mono shadow-lg ${
              toast.type === "error"
                ? "bg-red-950 border-red-800 text-red-200"
                : toast.type === "success"
                ? "bg-zinc-900 border-emerald-800 text-emerald-300"
                : "bg-zinc-900 border-zinc-700 text-zinc-200"
            }`}
          >
            {toast.text}
          </div>
        )}

        {/* Mobile Navigation Strip */}
        <div className="flex md:hidden items-center gap-1.5 overflow-x-auto px-4 py-2 border-b border-zinc-800 bg-zinc-950">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`shrink-0 px-2.5 py-1.5 rounded-md text-xs font-medium transition ${
                  active
                    ? "bg-[#023F46] text-white border border-teal-400/40"
                    : "bg-zinc-900 text-zinc-400"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Centralized Workspace Content */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
          <div className="max-w-[1540px] mx-auto w-full space-y-5">
            {/* Compact Awwwards Bento KPI Strip */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 gsap-stagger">
              <div className="relative overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950/90 p-3.5 shadow-md">
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-cyan-500 to-transparent" />
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Oil Production</span>
                  <span className="font-mono text-cyan-400">10 Wells</span>
                </div>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-xl font-bold font-mono text-zinc-100">
                    {fieldTotals.oil.toLocaleString()}
                  </span>
                  <span className="text-[11px] font-mono text-zinc-500">bbl/d</span>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950/90 p-3.5 shadow-md">
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-emerald-500 to-transparent" />
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>VFM Accuracy</span>
                  <span className="font-mono text-emerald-400">▲ 38%</span>
                </div>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-xl font-bold font-mono text-emerald-400">3.72%</span>
                  <span className="text-[11px] font-mono text-zinc-500">MAPE</span>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950/90 p-3.5 shadow-md">
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-amber-500 to-transparent" />
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Workover Target</span>
                  <span className="font-mono text-amber-400">292 md</span>
                </div>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-xl font-bold font-mono text-amber-400">GL-06</span>
                  <span className="text-[11px] font-mono text-zinc-500">Skin +1.74</span>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-xl border border-zinc-800/90 bg-zinc-950/90 p-3.5 shadow-md">
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-cyan-400 to-emerald-400" />
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Gas-Lift Yield</span>
                  <span className="font-mono text-cyan-400">GL-04→01</span>
                </div>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-xl font-bold font-mono text-emerald-400">+$485k</span>
                  <span className="text-[11px] font-mono text-zinc-500">/yr (+19 bbl/d)</span>
                </div>
              </div>
            </div>

          {/* ==================================================== */}
          {/* MODULE AI: CLAUDE INTERFACE WORKSPACE                */}
          {/* ==================================================== */}
          {activeTab === "ai" && (
            <div className="gsap-stagger">
              <ClaudeWorkspace
                lang={lang}
                userEmail={user.email}
                wells={bootstrap?.wells || []}
                latestPredictions={bootstrap?.latestPredictions || []}
                ptaEvents={bootstrap?.ptaEvents || []}
                liftGasRanking={meta?.lift_gas_ranking || []}
              />
            </div>
          )}

          {/* ==================================================== */}
          {/* MODULE 00: 3D SUBSURFACE & OVERVIEW                  */}
          {/* ==================================================== */}
          {activeTab === "command" && (
            <div className={`space-y-6 transition-opacity duration-300 ${wellLoading ? "opacity-55 pointer-events-none" : "opacity-100"}`}>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8">
                  <CaspianField3D
                    wells={bootstrap?.wells || []}
                    latestPredictions={bootstrap?.latestPredictions || []}
                    ptaEvents={bootstrap?.ptaEvents || []}
                    selectedWell={selectedWell}
                    onSelectWell={(w) => setSelectedWell(w)}
                  />
                </div>

                <Card className="lg:col-span-4 flex flex-col justify-between">
                  <CardHeader className="pb-3 border-b border-zinc-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm font-mono">
                          {selectedWell} — Completion & PVT Properties
                        </CardTitle>
                        <CardDescription>
                          Manifold {currentWellProfile?.completion?.production_manifold || "A"} · Completed{" "}
                          {currentWellProfile?.completion?.first_production_date}
                        </CardDescription>
                      </div>
                      <Badge variant="default" className="font-mono">Active</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-3 flex-1 flex flex-col justify-between space-y-4">
                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableCell className="text-zinc-400 py-2">Gauge / Datum TVD</TableCell>
                          <TableCell className="text-right font-mono py-2">
                            {currentWellProfile?.completion?.gauge_tvd_ft} / {currentWellProfile?.pvt?.datum_tvd_ft} ft
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-zinc-400 py-2">Gas-Lift Valve TVD</TableCell>
                          <TableCell className="text-right font-mono py-2">
                            {currentWellProfile?.completion?.gl_valve_tvd_ft} ft ({currentWellProfile?.completion?.gl_valve_port_64ths}/64&quot;)
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-zinc-400 py-2">Net Pay & Porosity</TableCell>
                          <TableCell className="text-right font-mono py-2">
                            {currentWellProfile?.pvt?.net_pay_thickness_ft} ft ·{" "}
                            {((currentWellProfile?.pvt?.porosity_frac || 0) * 100).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-zinc-400 py-2">Oil Viscosity & FVF</TableCell>
                          <TableCell className="text-right font-mono py-2">
                            {currentWellProfile?.pvt?.oil_viscosity_cp} cp · {currentWellProfile?.pvt?.oil_fvf_rb_stb} rb/stb
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-zinc-400 py-2">Cum. Oil (1 Jan 2025)</TableCell>
                          <TableCell className="text-right font-mono py-2">
                            {((currentWellProfile?.completion?.cum_oil_at_2025_01_01_stb || 0) / 1e6).toFixed(3)} MMstb
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-zinc-400 py-2">Pwf Sensitivity (+10 psi)</TableCell>
                          <TableCell className="text-right font-mono py-2">
                            {currentWellProfile?.sensitivity?.liquid_pct_per_10psi_pwf?.toFixed(2)}%
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-zinc-400 py-2">Marginal Lift-Gas Value</TableCell>
                          <TableCell className="text-right font-mono text-emerald-400 py-2">
                            +{currentWellProfile?.lift_gas_rank?.oil_gain_stbd_per_100_mscfd?.toFixed(1)} STB/d per 100 Mscf
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>

                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setActiveTab("vfm")}>
                        VFM Inflow Model
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setActiveTab("data")}>
                        Sensor QC & Events
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <Card className="lg:col-span-7">
                  <CardHeader className="pb-2 border-b border-zinc-800 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">
                        {selectedWell} — Daily Production Rates (VFM Predictions)
                      </CardTitle>
                      <CardDescription>
                        273 calendar days (Jan–Sep 2025) · Oil & Water (STB/d, left) · Gas (Mscf/d, right)
                      </CardDescription>
                    </div>
                    <Badge variant="default" className="font-mono">P10–P90 Calibrated</Badge>
                  </CardHeader>
                  <CardContent className="h-[300px] pt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={wellSeries?.predictions || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="date" stroke="#71717a" tick={{ fontSize: 11 }} minTickGap={28} />
                        <YAxis yAxisId="left" stroke="#a1a1aa" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" stroke="#71717a" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="oil_rate_stbd"
                          name="Oil Rate (STB/d)"
                          stroke="#10b981"
                          strokeWidth={1.75}
                          dot={false}
                        />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="water_rate_stbd"
                          name="Water Rate (STB/d)"
                          stroke="#38bdf8"
                          strokeWidth={1.5}
                          dot={false}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="gas_rate_mscfd"
                          name="Gas Rate (Mscf/d)"
                          stroke="#f59e0b"
                          strokeWidth={1.5}
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-5">
                  <CardHeader className="pb-2 border-b border-zinc-800 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">PTA Shut-In Build-Up Summary (6 Events)</CardTitle>
                      <CardDescription>Click any row to open diagnostic plots & Horner analysis</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab("pta")}>
                      Open PTA →
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Well</TableHead>
                          <TableHead>IARF Quality</TableHead>
                          <TableHead className="text-right">ko (md)</TableHead>
                          <TableHead className="text-right">Skin s</TableHead>
                          <TableHead className="text-right">ΔPskin</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(bootstrap?.ptaEvents || []).map((ev: any) => {
                          const p = ev.properties;
                          const isGood = p.iarf_quality === "good";
                          return (
                            <TableRow
                              key={ev.event_id}
                              className="cursor-pointer"
                              onClick={() => {
                                setSelectedEventId(ev.event_id);
                                setActiveTab("pta");
                              }}
                            >
                              <TableCell className="font-mono font-medium text-zinc-100">{ev.well_name}</TableCell>
                              <TableCell>
                                <Badge variant={isGood ? "emerald" : "rose"}>
                                  {isGood ? "good" : "no_radial_flow"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {p.permeability_md?.toFixed(1)}
                              </TableCell>
                              <TableCell
                                className={`text-right font-mono font-medium ${
                                  p.skin > 1 ? "text-amber-400" : "text-zinc-200"
                                }`}
                              >
                                {p.skin > 0 ? `+${p.skin.toFixed(2)}` : p.skin.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right font-mono text-zinc-400">
                                {p.delta_p_skin_psi?.toFixed(1)} psi
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* MODULE 01: FIELD DATA, SENSOR ENVELOPES & QC         */}
          {/* ==================================================== */}
          {activeTab === "data" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1 bg-gradient-to-b from-sky-400 to-indigo-500 rounded-full" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold tracking-wider uppercase text-zinc-100">
                        FIELD SENSOR TELEMETRY & DATA QC
                      </h2>
                      <Badge variant="outline" className="border-sky-500/30 text-sky-400 bg-sky-950/20 text-[10px] font-mono">
                        3.93M Records
                      </Badge>
                      <Badge variant="outline" className="border-zinc-700 text-zinc-300 bg-zinc-900/40 text-[10px] font-mono">
                        QC Cleaned
                      </Badge>
                    </div>
                    <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                      11-MIN ROLLING MEDIAN FILTER · FROZEN RUN DETECTOR · SENTINEL SUPPRESSION
                    </p>
                  </div>
                </div>
              </div>

              {/* Raw Well Data Ingestion & Automated QC Dropzone (Application Requirement) */}
              <RawDataUploader
                selectedWell={selectedWell}
                onNavigateToVFM={() => setActiveTab("vfm")}
                onNavigateToPTA={() => setActiveTab("pta")}
              />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-2 border-b border-zinc-800">
                    <CardTitle className="text-sm">
                      {selectedWell} — Downhole Flowing Pressure (dh_pressure_psia) Envelope
                    </CardTitle>
                    <CardDescription>Daily min / mean / max envelope preserves spikes and build-up peaks</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[270px] pt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={wellSeries?.sensors || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="date" stroke="#71717a" tick={{ fontSize: 11 }} minTickGap={25} />
                        <YAxis stroke="#a1a1aa" domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="dh_pressure_psia_max" name="Max Pwf (psia)" stroke="#f43f5e" strokeWidth={1} dot={false} />
                        <Line type="monotone" dataKey="dh_pressure_psia_mean" name="Mean Pwf (psia)" stroke="#e4e4e7" strokeWidth={1.75} dot={false} />
                        <Line type="monotone" dataKey="dh_pressure_psia_min" name="Min Pwf (psia)" stroke="#52525b" strokeWidth={1} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2 border-b border-zinc-800">
                    <CardTitle className="text-sm">
                      {selectedWell} — Gas-Lift Injection Rate & Annulus Pressure
                    </CardTitle>
                    <CardDescription>14 June 2025 field-wide gas-lift upset visible across all 10 wells</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[270px] pt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={wellSeries?.sensors || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="date" stroke="#71717a" tick={{ fontSize: 11 }} minTickGap={25} />
                        <YAxis yAxisId="left" stroke="#a1a1aa" domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" stroke="#71717a" domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line yAxisId="left" type="monotone" dataKey="gas_lift_rate_mscfd_mean" name="Mean Gas Lift (Mscf/d)" stroke="#10b981" strokeWidth={1.75} dot={false} />
                        <Line yAxisId="left" type="monotone" dataKey="gas_lift_rate_mscfd_min" name="Min Gas Lift (Mscf/d)" stroke="#f59e0b" strokeWidth={1} dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="annulus_pressure_psia_mean" name="Annulus P (psia)" stroke="#38bdf8" strokeWidth={1.5} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <Card className="lg:col-span-7">
                  <CardHeader className="pb-2 border-b border-zinc-800">
                    <CardTitle className="text-sm">Per-Well Sensor Data Quality Control (QC) Table</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Well</TableHead>
                          <TableHead className="text-right">Raw Rows</TableHead>
                          <TableHead className="text-right">Duplicates</TableHead>
                          <TableHead className="text-right">Disordered</TableHead>
                          <TableHead className="text-right">Gaps</TableHead>
                          <TableHead className="text-right">Max Gap</TableHead>
                          <TableHead className="text-right">Missing Min</TableHead>
                          <TableHead className="text-right">% Flagged</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(meta?.sensor_data_quality || []).map((q: any) => (
                          <TableRow key={q.well_name}>
                            <TableCell className="font-mono font-medium text-zinc-100">{q.well_name}</TableCell>
                            <TableCell className="text-right font-mono">{q.rows_raw?.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono">{q.duplicates_removed}</TableCell>
                            <TableCell className="text-right font-mono">{q.out_of_order_rows}</TableCell>
                            <TableCell className="text-right font-mono">{q.gap_count}</TableCell>
                            <TableCell className="text-right font-mono">{q.longest_gap_hours} h</TableCell>
                            <TableCell className="text-right font-mono">{q.missing_minutes}</TableCell>
                            <TableCell className="text-right font-mono text-emerald-400">{q.pct_values_flagged}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-5">
                  <CardHeader className="pb-2 border-b border-zinc-800">
                    <CardTitle className="text-sm">Shut-Ins (6) vs Gas-Lift Upsets (10)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <TabsPrimitive.Root defaultValue="shutins">
                      <TabsPrimitive.List className="flex border-b border-zinc-800 bg-zinc-900/40 px-3 pt-2 gap-2">
                        <TabsPrimitive.Trigger
                          value="shutins"
                          className="px-3 py-1.5 text-xs font-medium border-b-2 border-transparent data-[state=active]:border-zinc-100 data-[state=active]:text-zinc-100 text-zinc-400"
                        >
                          Shut-In Events (6)
                        </TabsPrimitive.Trigger>
                        <TabsPrimitive.Trigger
                          value="upsets"
                          className="px-3 py-1.5 text-xs font-medium border-b-2 border-transparent data-[state=active]:border-zinc-100 data-[state=active]:text-zinc-100 text-zinc-400"
                        >
                          Gas-Lift Upsets (10)
                        </TabsPrimitive.Trigger>
                      </TabsPrimitive.List>
                      <TabsPrimitive.Content value="shutins">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Event ID</TableHead>
                              <TableHead>Start</TableHead>
                              <TableHead className="text-right">Duration</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(meta?.shut_in_events || []).map((e: any) => (
                              <TableRow key={e.event_id}>
                                <TableCell className="font-mono text-zinc-100">{e.event_id}</TableCell>
                                <TableCell className="font-mono text-zinc-400">{String(e.shut_in_start).slice(0, 16)}</TableCell>
                                <TableCell className="text-right font-mono">{Number(e.duration_hours).toFixed(1)} h</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TabsPrimitive.Content>
                      <TabsPrimitive.Content value="upsets">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Well</TableHead>
                              <TableHead>14 Jun Window</TableHead>
                              <TableHead className="text-right">Min Ratio</TableHead>
                              <TableHead className="text-right">Scope</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(meta?.gas_lift_upsets || []).map((u: any, idx: number) => (
                              <TableRow key={idx}>
                                <TableCell className="font-mono text-zinc-100">{u.well_name}</TableCell>
                                <TableCell className="font-mono text-zinc-400">
                                  {String(u.start).slice(11, 16)}–{String(u.end).slice(11, 16)}
                                </TableCell>
                                <TableCell className="text-right font-mono text-amber-400">
                                  {(u.min_ratio_to_baseline * 100).toFixed(0)}%
                                </TableCell>
                                <TableCell className="text-right">
                                  <Badge variant="amber">{u.scope}</Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TabsPrimitive.Content>
                    </TabsPrimitive.Root>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* MODULE 02: VIRTUAL FLOW METERING (VFM)               */}
          {/* ==================================================== */}
          {activeTab === "vfm" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1 bg-gradient-to-b from-cyan-400 to-emerald-500 rounded-full" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold tracking-wider uppercase text-zinc-100">
                        VIRTUAL FLOW METERING
                      </h2>
                      <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 bg-cyan-950/20 text-[10px] font-mono">
                        BoundedRidge
                      </Badge>
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-950/20 text-[10px] font-mono">
                        Forward MAPE 3.72%
                      </Badge>
                      <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-950/20 text-[10px] font-mono">
                        Routing Bias +0.7%
                      </Badge>
                    </div>
                    <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                      PHYSICS CONSTRAINTS: dQ/dPwf ≤ −0.0002 · WHP EXCLUDED
                    </p>
                  </div>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={runPythonRetrain}
                  disabled={retrainLoading || !hasPerm("vfm:retrain")}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  {retrainLoading
                    ? "Executing Python Engine…"
                    : hasPerm("vfm:retrain")
                    ? "Run Python VFM Verification"
                    : "Retrain Locked (Requires Data Scientist / Admin)"}
                </Button>
              </div>

              {retrainResult && (
                <Card className="p-3.5 border-zinc-700 bg-zinc-900/50">
                  <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Python Subprocess Verified ({retrainResult.elapsed_sec}s)
                    </span>
                    <span>Tests: {retrainResult.tests_used}</span>
                    <span>Repairs: {retrainResult.corrections_applied}</span>
                    <span>Ridge α: {retrainResult.alpha}</span>
                    <span>Held-Out Oil MAPE: {retrainResult.oil_held_out_mape_pct}%</span>
                    <span>Forward Oil MAPE: {retrainResult.oil_forward_mape_pct}%</span>
                    <span>Routing Bias: +{retrainResult.test_day_bias_pct}%</span>
                  </div>
                </Card>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left 5 Cols: Interactive VFM Simulator */}
                <Card className="lg:col-span-5">
                  <CardHeader className="pb-3 border-b border-zinc-800">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">
                        VFM Parameter Simulator ({selectedWell})
                      </CardTitle>
                      <Badge variant={hasPerm("vfm:simulate") ? "emerald" : "slate"}>
                        {hasPerm("vfm:simulate") ? "vfm:simulate" : "Read-Only"}
                      </Badge>
                    </div>
                    <CardDescription>
                      Evaluate BoundedRidge design matrix on custom sensor inputs
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4 text-xs">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <Label>Downhole Flowing Pressure (Pwf)</Label>
                          <span className="font-mono text-zinc-200">{simPwf} psia</span>
                        </div>
                        <ShadcnSlider
                          value={simPwf}
                          min={1900}
                          max={3800}
                          step={5}
                          onChange={setSimPwf}
                          disabled={!hasPerm("vfm:simulate")}
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <Label>Gas-Lift Injection Rate</Label>
                          <span className="font-mono text-zinc-200">{simLiftGas} Mscf/d</span>
                        </div>
                        <ShadcnSlider
                          value={simLiftGas}
                          min={200}
                          max={1800}
                          step={10}
                          onChange={setSimLiftGas}
                          disabled={!hasPerm("vfm:simulate")}
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <Label>Choke Size (64ths inch)</Label>
                          <span className="font-mono text-zinc-200">{simChoke64} / 64&quot;</span>
                        </div>
                        <ShadcnSlider
                          value={simChoke64}
                          min={16}
                          max={96}
                          step={2}
                          onChange={setSimChoke64}
                          disabled={!hasPerm("vfm:simulate")}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="space-y-1">
                          <Label>Downhole Temp (°F)</Label>
                          <Input
                            type="number"
                            step="0.5"
                            value={simTemp}
                            onChange={(e) => setSimTemp(Number(e.target.value))}
                            disabled={!hasPerm("vfm:simulate")}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Annulus Pressure (psia)</Label>
                          <Input
                            type="number"
                            step="10"
                            value={simAnnulus}
                            onChange={(e) => setSimAnnulus(Number(e.target.value))}
                            disabled={!hasPerm("vfm:simulate")}
                          />
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="default"
                      className="w-full"
                      onClick={runVFMSimulation}
                      disabled={simLoading || !hasPerm("vfm:simulate")}
                    >
                      <Play className="w-3.5 h-3.5" />
                      {hasPerm("vfm:simulate")
                        ? `Compute VFM Rates for ${selectedWell}`
                        : "Requires 'vfm:simulate' Permission"}
                    </Button>

                    {simResult && (
                      <div className="grid grid-cols-3 border border-zinc-800 rounded-md divide-x divide-zinc-800 bg-zinc-900/40">
                        <div className="p-2.5 text-center">
                          <div className="text-[10px] text-zinc-400">Oil Rate</div>
                          <div className="text-sm font-mono font-semibold text-emerald-400 mt-0.5">
                            {simResult.oil_rate_stbd}
                          </div>
                          <div className="text-[10px] text-zinc-500">STB/d</div>
                        </div>
                        <div className="p-2.5 text-center">
                          <div className="text-[10px] text-zinc-400">Water Rate</div>
                          <div className="text-sm font-mono font-semibold text-zinc-100 mt-0.5">
                            {simResult.water_rate_stbd}
                          </div>
                          <div className="text-[10px] text-zinc-500">STB/d ({simResult.water_cut_pct}%)</div>
                        </div>
                        <div className="p-2.5 text-center">
                          <div className="text-[10px] text-zinc-400">Gas Rate</div>
                          <div className="text-sm font-mono font-semibold text-amber-400 mt-0.5">
                            {simResult.gas_rate_mscfd}
                          </div>
                          <div className="text-[10px] text-zinc-500">Mscf/d</div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Right 7 Cols: Validation & Label Repairs Tabs */}
                <Card className="lg:col-span-7">
                  <TabsPrimitive.Root defaultValue="cv">
                    <CardHeader className="pb-0 border-b border-zinc-800">
                      <div className="flex items-center justify-between pb-2">
                        <CardTitle className="text-sm">Model Validation & Well-Test Hygiene</CardTitle>
                        <TabsPrimitive.List className="flex bg-zinc-900 p-0.5 rounded border border-zinc-800">
                          <TabsPrimitive.Trigger
                            value="cv"
                            className="px-2.5 py-1 text-xs rounded-sm data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950 text-zinc-400"
                          >
                            Validation Metrics
                          </TabsPrimitive.Trigger>
                          <TabsPrimitive.Trigger
                            value="sens"
                            className="px-2.5 py-1 text-xs rounded-sm data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950 text-zinc-400"
                          >
                            Sensitivities
                          </TabsPrimitive.Trigger>
                          <TabsPrimitive.Trigger
                            value="repairs"
                            className="px-2.5 py-1 text-xs rounded-sm data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950 text-zinc-400"
                          >
                            23 Test Repairs
                          </TabsPrimitive.Trigger>
                        </TabsPrimitive.List>
                      </div>
                    </CardHeader>

                    <CardContent className="p-0">
                      <TabsPrimitive.Content value="cv" className="p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="border border-zinc-800 rounded-md overflow-hidden">
                            <div className="bg-zinc-900/60 px-3 py-2 text-xs font-medium border-b border-zinc-800">
                              Held-Out LOTO Validation (85 Tests)
                            </div>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Phase</TableHead>
                                  <TableHead>Method</TableHead>
                                  <TableHead className="text-right">MAPE</TableHead>
                                  <TableHead className="text-right">R²</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(meta?.validation_metrics || []).map((m: any, i: number) => (
                                  <TableRow key={i}>
                                    <TableCell className="font-mono">{m.target.split("_")[0]}</TableCell>
                                    <TableCell className={m.method === "VFM model" ? "font-semibold text-zinc-100" : "text-zinc-500"}>
                                      {m.method === "VFM model" ? "VFM Model" : "Interp. Baseline"}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-emerald-400">
                                      {m.MAPE_pct?.toFixed(2)}%
                                    </TableCell>
                                    <TableCell className="text-right font-mono">{m.R2?.toFixed(3)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>

                          <div className="border border-zinc-800 rounded-md overflow-hidden">
                            <div className="bg-zinc-900/60 px-3 py-2 text-xs font-medium border-b border-zinc-800">
                              Forward Validation — Earlier Tests Only (55 Tests)
                            </div>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Phase</TableHead>
                                  <TableHead>Method</TableHead>
                                  <TableHead className="text-right">MAPE</TableHead>
                                  <TableHead className="text-right">R²</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(meta?.forward_validation_metrics || []).map((m: any, i: number) => (
                                  <TableRow key={i}>
                                    <TableCell className="font-mono">{m.target.split("_")[0]}</TableCell>
                                    <TableCell className={m.method === "VFM model" ? "font-semibold text-zinc-100" : "text-zinc-500"}>
                                      {m.method === "VFM model" ? "VFM Model" : "Carry-Forward"}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-emerald-400">
                                      {m.MAPE_pct?.toFixed(2)}%
                                    </TableCell>
                                    <TableCell className="text-right font-mono">{m.R2?.toFixed(3)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </TabsPrimitive.Content>

                      <TabsPrimitive.Content value="sens">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Well</TableHead>
                              <TableHead className="text-right">Liquid % per +10 psi Pwf</TableHead>
                              <TableHead className="text-right">Liquid % per +10% Lift Gas</TableHead>
                              <TableHead className="text-right">Liquid % per +10% Choke</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(meta?.sensitivities || []).map((s: any) => (
                              <TableRow key={s.well_name}>
                                <TableCell className="font-mono font-medium text-zinc-100">{s.well_name}</TableCell>
                                <TableCell className="text-right font-mono text-emerald-400">
                                  {s.liquid_pct_per_10psi_pwf?.toFixed(3)}%
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  +{s.liquid_pct_per_10pct_lift_gas?.toFixed(3)}%
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  +{s.liquid_pct_per_10pct_choke?.toFixed(3)}%
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TabsPrimitive.Content>

                      <TabsPrimitive.Content value="repairs" className="max-h-[320px] overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Well</TableHead>
                              <TableHead>Test Start</TableHead>
                              <TableHead>Column</TableHead>
                              <TableHead>Issue Repaired</TableHead>
                              <TableHead className="text-right">Original</TableHead>
                              <TableHead className="text-right">Corrected</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(meta?.well_test_corrections || []).map((c: any, idx: number) => (
                              <TableRow key={idx}>
                                <TableCell className="font-mono font-medium">{c.well_name}</TableCell>
                                <TableCell className="font-mono text-zinc-400">{String(c.test_start).slice(0, 16)}</TableCell>
                                <TableCell className="font-mono">{c.column}</TableCell>
                                <TableCell className="text-zinc-400">{c.issue}</TableCell>
                                <TableCell className="text-right font-mono text-red-400">{c.original_value}</TableCell>
                                <TableCell className="text-right font-mono text-emerald-400">
                                  {Number(c.corrected_value).toFixed(1)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TabsPrimitive.Content>
                    </CardContent>
                  </TabsPrimitive.Root>
                </Card>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* MODULE 03: PRESSURE TRANSIENT ANALYSIS (AUTO PTA)    */}
          {/* ==================================================== */}
          {activeTab === "pta" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1 bg-gradient-to-b from-emerald-400 to-cyan-500 rounded-full" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold tracking-wider uppercase text-zinc-100">
                        PRESSURE TRANSIENT ANALYSIS
                      </h2>
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-950/20 text-[10px] font-mono">
                        Bourdet Derivative
                      </Badge>
                      <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 bg-cyan-950/20 text-[10px] font-mono">
                        Horner Semilog
                      </Badge>
                    </div>
                    <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                      DYNAMIC Qo(VFM) · EXACT Np INTEGRATION · IARF STABILITY SCAN
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(bootstrap?.ptaEvents || []).map((ev: any) => {
                    const isGood = ev.properties?.iarf_quality === "good";
                    return (
                      <button
                        key={ev.event_id}
                        onClick={() => setSelectedEventId(ev.event_id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-mono border transition ${
                          selectedEventId === ev.event_id
                            ? "bg-zinc-100 text-zinc-950 border-zinc-100 font-semibold"
                            : "bg-zinc-950 text-zinc-300 border-zinc-800 hover:bg-zinc-900"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${isGood ? "bg-emerald-500" : "bg-red-500"}`} />
                        <span>{ev.well_name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {ptaDetail && (
                <>
                  {/* 6 PTA Parameter Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border border-zinc-800 rounded-md divide-y sm:divide-y-0 sm:divide-x divide-zinc-800 bg-zinc-950">
                    <div className="p-3">
                      <div className="text-[11px] text-zinc-400">Radial Flow Quality</div>
                      <div className="mt-1">
                        <Badge variant={ptaDetail.properties.iarf_quality === "good" ? "emerald" : "rose"}>
                          {ptaDetail.properties.iarf_quality}
                        </Badge>
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500 mt-1">
                        d log(Δp&apos;)/d log(t) = {ptaDetail.properties.derivative_log_slope?.toFixed(3)}
                      </div>
                    </div>

                    <div className="p-3">
                      <div className="text-[11px] text-zinc-400">Horner Slope m</div>
                      <div className="text-base font-mono font-semibold text-zinc-100 mt-1">
                        {ptaDetail.properties.horner_slope_psi_per_cycle?.toFixed(2)} psi/cyc
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                        R² = {ptaDetail.properties.horner_fit_r2?.toFixed(4)}
                      </div>
                    </div>

                    <div className="p-3">
                      <div className="text-[11px] text-zinc-400">Effective Oil Perm. ko</div>
                      <div className="text-base font-mono font-semibold text-emerald-400 mt-1">
                        {ptaDetail.properties.permeability_md?.toFixed(1)} md
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                        Range: {ptaDetail.properties.k_min_md?.toFixed(0)}–{ptaDetail.properties.k_max_md?.toFixed(0)} md
                      </div>
                    </div>

                    <div className="p-3">
                      <div className="text-[11px] text-zinc-400">Skin s & ΔPskin</div>
                      <div className="text-base font-mono font-semibold text-zinc-100 mt-1">
                        {ptaDetail.properties.skin > 0
                          ? `+${ptaDetail.properties.skin.toFixed(2)}`
                          : ptaDetail.properties.skin?.toFixed(2)}{" "}
                        <span className="text-xs font-normal text-zinc-400">
                          ({ptaDetail.properties.delta_p_skin_psi?.toFixed(0)} psi)
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                        Range: {ptaDetail.properties.skin_min?.toFixed(2)}..{ptaDetail.properties.skin_max?.toFixed(2)}
                      </div>
                    </div>

                    <div className="p-3">
                      <div className="text-[11px] text-zinc-400">p* / Last Measured pws</div>
                      <div className="text-base font-mono font-semibold text-zinc-100 mt-1">
                        {ptaDetail.properties.p_star_semilog_extrapolation_psia?.toFixed(0)} /{" "}
                        {ptaDetail.properties.last_measured_pws_psia?.toFixed(0)}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                        Basis: {ptaDetail.properties.pressure_basis}
                      </div>
                    </div>

                    <div className="p-3">
                      <div className="text-[11px] text-zinc-400">Productivity Index & Ri</div>
                      <div className="text-base font-mono font-semibold text-zinc-100 mt-1">
                        {ptaDetail.properties.productivity_index_stbd_psi?.toFixed(2)} STB/d/psi
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                        FE: {((ptaDetail.properties.flow_efficiency || 0) * 100).toFixed(0)}% · Ri:{" "}
                        {ptaDetail.properties.radius_of_investigation_ft?.toFixed(0)} ft
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <Card className="lg:col-span-8">
                      <TabsPrimitive.Root value={ptaPlotMode} onValueChange={setPtaPlotMode}>
                        <CardHeader className="pb-2 border-b border-zinc-800 flex flex-row flex-wrap items-center justify-between gap-2">
                          <div>
                            <CardTitle className="text-sm font-mono">
                              {ptaDetail.event_id} — Window {ptaDetail.properties.iarf_start_hours?.toFixed(2)}–
                              {ptaDetail.properties.iarf_end_hours?.toFixed(2)} h ({ptaDetail.properties.window_source})
                            </CardTitle>
                            <CardDescription>
                              Qo = {ptaDetail.properties.q_oil_before_shut_in_stbd?.toFixed(1)} STB/d ({ptaDetail.properties.q_source})
                            </CardDescription>
                          </div>
                          <TabsPrimitive.List className="flex bg-zinc-900 p-0.5 rounded border border-zinc-800">
                            <TabsPrimitive.Trigger
                              value="loglog"
                              className="px-2.5 py-1 text-xs rounded-sm data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950 text-zinc-400"
                            >
                              Log-Log
                            </TabsPrimitive.Trigger>
                            <TabsPrimitive.Trigger
                              value="horner"
                              className="px-2.5 py-1 text-xs rounded-sm data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950 text-zinc-400"
                            >
                              Horner
                            </TabsPrimitive.Trigger>
                            <TabsPrimitive.Trigger
                              value="mdh"
                              className="px-2.5 py-1 text-xs rounded-sm data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950 text-zinc-400"
                            >
                              MDH
                            </TabsPrimitive.Trigger>
                            <TabsPrimitive.Trigger
                              value="history"
                              className="px-2.5 py-1 text-xs rounded-sm data-[state=active]:bg-zinc-100 data-[state=active]:text-zinc-950 text-zinc-400"
                            >
                              History
                            </TabsPrimitive.Trigger>
                          </TabsPrimitive.List>
                        </CardHeader>

                        <CardContent className="h-[340px] pt-4">
                          {ptaPlotMode === "loglog" && (
                            <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart data={ptaDetail.curves?.points || []}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                <XAxis
                                  dataKey="dte_hours"
                                  scale="log"
                                  domain={["auto", "auto"]}
                                  type="number"
                                  stroke="#71717a"
                                  tick={{ fontSize: 11 }}
                                  tickFormatter={(v) => Number(v).toFixed(2)}
                                />
                                <YAxis
                                  scale="log"
                                  domain={["auto", "auto"]}
                                  type="number"
                                  stroke="#71717a"
                                  tick={{ fontSize: 11 }}
                                />
                                <Tooltip contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", fontSize: 12 }} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Line type="monotone" dataKey="dp_psi" name="Δp (psi)" stroke="#e4e4e7" strokeWidth={1.75} dot={{ r: 2 }} />
                                <Line type="monotone" dataKey="derivative_psi" name="Bourdet Derivative Δp' (psi)" stroke="#f43f5e" strokeWidth={1.75} dot={{ r: 2 }} />
                              </ComposedChart>
                            </ResponsiveContainer>
                          )}

                          {ptaPlotMode === "horner" && (
                            <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart data={ptaDetail.curves?.points || []}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                <XAxis
                                  dataKey="log10_horner"
                                  type="number"
                                  reversed
                                  domain={["auto", "auto"]}
                                  stroke="#71717a"
                                  tick={{ fontSize: 11 }}
                                  tickFormatter={(v) => `10^${Number(v).toFixed(1)}`}
                                />
                                <YAxis domain={["auto", "auto"]} stroke="#71717a" tick={{ fontSize: 11 }} />
                                <Tooltip contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", fontSize: 12 }} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <ReferenceLine
                                  y={ptaDetail.properties.last_measured_pws_psia}
                                  stroke="#10b981"
                                  strokeDasharray="4 4"
                                />
                                <Line type="monotone" dataKey="pws_psia" name="Shut-in Pressure pws (psia)" stroke="#e4e4e7" strokeWidth={2} dot={{ r: 2.5 }} />
                              </ComposedChart>
                            </ResponsiveContainer>
                          )}

                          {ptaPlotMode === "mdh" && (
                            <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart data={ptaDetail.curves?.points || []}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                <XAxis
                                  dataKey="dt_hours"
                                  scale="log"
                                  domain={["auto", "auto"]}
                                  type="number"
                                  stroke="#71717a"
                                  tick={{ fontSize: 11 }}
                                  tickFormatter={(v) => Number(v).toFixed(2)}
                                />
                                <YAxis domain={["auto", "auto"]} stroke="#71717a" tick={{ fontSize: 11 }} />
                                <Tooltip contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", fontSize: 12 }} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Line type="monotone" dataKey="pws_psia" name="MDH Semilog pws (psia)" stroke="#10b981" strokeWidth={1.75} dot={{ r: 2 }} />
                              </ComposedChart>
                            </ResponsiveContainer>
                          )}

                          {ptaPlotMode === "history" && (
                            <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart data={ptaDetail.curves?.history || []}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                <XAxis
                                  dataKey="timestamp"
                                  stroke="#71717a"
                                  tick={{ fontSize: 10 }}
                                  tickFormatter={(v) => String(v).slice(5, 16)}
                                  minTickGap={30}
                                />
                                <YAxis yAxisId="left" domain={["auto", "auto"]} stroke="#a1a1aa" tick={{ fontSize: 11 }} />
                                <YAxis yAxisId="right" orientation="right" stroke="#71717a" tick={{ fontSize: 11 }} />
                                <Tooltip contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", fontSize: 12 }} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Line yAxisId="left" type="monotone" dataKey="dh_pressure_psia" name="Downhole P (psia)" stroke="#e4e4e7" strokeWidth={1.75} dot={false} />
                                <Line yAxisId="right" type="stepAfter" dataKey="gas_lift_rate_mscfd" name="Gas Lift (Mscf/d)" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                              </ComposedChart>
                            </ResponsiveContainer>
                          )}
                        </CardContent>
                      </TabsPrimitive.Root>
                    </Card>

                    <div className="lg:col-span-4 space-y-4">
                      <Card>
                        <CardHeader className="pb-3 border-b border-zinc-800">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm">Manual Parameter Override</CardTitle>
                            <Badge variant={hasPerm("pta:override") ? "emerald" : "slate"}>
                              {hasPerm("pta:override") ? "pta:override" : "Locked"}
                            </Badge>
                          </div>
                          <CardDescription>
                            Override Qo or radial-flow window [start, end]
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-3 text-xs">
                          <div className="space-y-1">
                            <Label>Pre-Shut-In Oil Rate Qo (STB/d)</Label>
                            <Input
                              type="number"
                              step="10"
                              value={overrideQ}
                              onChange={(e) => setOverrideQ(e.target.value)}
                              disabled={!hasPerm("pta:override")}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="space-y-1">
                              <Label>IARF Start (h)</Label>
                              <Input
                                type="number"
                                step="0.2"
                                value={overrideStartH}
                                onChange={(e) => setOverrideStartH(e.target.value)}
                                disabled={!hasPerm("pta:override")}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>IARF End (h)</Label>
                              <Input
                                type="number"
                                step="0.5"
                                value={overrideEndH}
                                onChange={(e) => setOverrideEndH(e.target.value)}
                                disabled={!hasPerm("pta:override")}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handlePTAOverride(false)}
                              disabled={ptaOverrideLoading || !hasPerm("pta:override")}
                            >
                              Apply Override
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePTAOverride(true)}
                              disabled={ptaOverrideLoading || !hasPerm("pta:override")}
                            >
                              Reset Auto
                            </Button>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2 border-b border-zinc-800">
                          <CardTitle className="text-sm">Engineering Interpretation</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-3 text-xs text-zinc-300 space-y-2 leading-relaxed">
                          <p>{ptaDetail.interpretation}</p>
                          <div className="p-2.5 rounded border border-zinc-800 bg-zinc-900/40 font-mono text-[11px] text-zinc-400 space-y-0.5">
                            <div>Late-time: {ptaDetail.properties.late_time_behaviour}</div>
                            <div>Storage C: {ptaDetail.properties.wellbore_storage_bbl_psi?.toFixed(4)} bbl/psi</div>
                            <div>Horner tp: {ptaDetail.properties.horner_producing_time_hours?.toFixed(0)} h</div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ==================================================== */}
          {/* MODULE 04: LIFT-GAS ALLOCATION OPTIMISER             */}
          {/* ==================================================== */}
          {activeTab === "gaslift" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1 bg-gradient-to-b from-amber-400 to-emerald-500 rounded-full" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold tracking-wider uppercase text-zinc-100">
                        LIFT-GAS ALLOCATION OPTIMISER
                      </h2>
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-950/20 text-[10px] font-mono">
                        +$485,000 / YR
                      </Badge>
                      <Badge variant="outline" className="border-zinc-700 text-zinc-300 bg-zinc-900/40 text-[10px] font-mono">
                        $0 CAPEX
                      </Badge>
                    </div>
                    <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                      14 JUNE FIELD TEST GRADIENTS · ΔPwf × OIL PI SENSITIVITIES
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <Card className="lg:col-span-7">
                  <CardHeader className="pb-2 border-b border-zinc-800">
                    <CardTitle className="text-sm">
                      Marginal Oil Gain (STB/d per +100 Mscf/d Lift Gas)
                    </CardTitle>
                    <CardDescription>
                      Green = Measured PI from build-up test · Grey = Estimated PI (field median, requires build-up test)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="h-[230px] p-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={meta?.lift_gas_ranking || []} layout="vertical" margin={{ left: 10, right: 30 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis type="number" stroke="#71717a" tick={{ fontSize: 11 }} />
                          <YAxis dataKey="well_name" type="category" stroke="#e4e4e7" tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={{ backgroundColor: "#09090b", borderColor: "#27272a", fontSize: 12 }} />
                          <Bar dataKey="oil_gain_stbd_per_100_mscfd" name="Extra Oil (STB/d per +100 Mscf/d)" radius={[0, 3, 3, 0]}>
                            {(meta?.lift_gas_ranking || []).map((entry: any, index: number) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={entry.confidence.includes("measured") ? "#10b981" : "#52525b"}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Well</TableHead>
                          <TableHead className="text-right">Gas Cut (14 Jun)</TableHead>
                          <TableHead className="text-right">Pwf Rise</TableHead>
                          <TableHead className="text-right">psi / 100 Mscf</TableHead>
                          <TableHead className="text-right">Oil PI</TableHead>
                          <TableHead className="text-right">Gain / +100 Mscf</TableHead>
                          <TableHead>PI Basis</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(meta?.lift_gas_ranking || []).map((r: any) => (
                          <TableRow key={r.well_name}>
                            <TableCell className="font-mono font-medium text-zinc-100">{r.well_name}</TableCell>
                            <TableCell className="text-right font-mono">{r.lift_gas_cut_mscfd}</TableCell>
                            <TableCell className="text-right font-mono">+{r.pwf_rise_psi} psi</TableCell>
                            <TableCell className="text-right font-mono">{r.pwf_rise_psi_per_100_mscfd}</TableCell>
                            <TableCell className="text-right font-mono">{r.oil_pi_stbd_psi}</TableCell>
                            <TableCell className="text-right font-mono font-semibold text-emerald-400">
                              +{r.oil_gain_stbd_per_100_mscfd} STB/d
                            </TableCell>
                            <TableCell>
                              <Badge variant={r.confidence.includes("measured") ? "emerald" : "slate"}>
                                {r.confidence}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-5">
                  <CardHeader className="pb-3 border-b border-zinc-800">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Reallocation Trial Calculator</CardTitle>
                      <Badge variant={hasPerm("gaslift:allocate") ? "emerald" : "slate"}>
                        {hasPerm("gaslift:allocate") ? "gaslift:allocate" : "Locked"}
                      </Badge>
                    </div>
                    <CardDescription>
                      Simulate zero-CAPEX lift-gas transfer between wells
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Donor Well (Reduce Gas)</Label>
                        <select
                          value={donorWell}
                          onChange={(e) => setDonorWell(e.target.value)}
                          className="w-full h-9 rounded-md bg-zinc-950 border border-zinc-800 px-2.5 text-xs text-zinc-100"
                        >
                          {(meta?.lift_gas_ranking || []).map((r: any) => (
                            <option key={r.well_name} value={r.well_name}>
                              {r.well_name} (+{r.oil_gain_stbd_per_100_mscfd} STB/d)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label>Receiver Well (Add Gas)</Label>
                        <select
                          value={receiverWell}
                          onChange={(e) => setReceiverWell(e.target.value)}
                          className="w-full h-9 rounded-md bg-zinc-950 border border-zinc-800 px-2.5 text-xs text-zinc-100"
                        >
                          {(meta?.lift_gas_ranking || []).map((r: any) => (
                            <option key={r.well_name} value={r.well_name}>
                              {r.well_name} (+{r.oil_gain_stbd_per_100_mscfd} STB/d)
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <Label>Gas Shift Rate (Mscf/d)</Label>
                        <span className="font-mono text-zinc-200">{shiftMscfd} Mscf/d</span>
                      </div>
                      <ShadcnSlider
                        value={shiftMscfd}
                        min={25}
                        max={300}
                        step={25}
                        onChange={setShiftMscfd}
                        disabled={!hasPerm("gaslift:allocate")}
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <Label>Oil Price Assumption ($/bbl)</Label>
                        <span className="font-mono text-zinc-200">${oilPrice}/bbl</span>
                      </div>
                      <ShadcnSlider
                        value={oilPrice}
                        min={50}
                        max={100}
                        step={5}
                        onChange={setOilPrice}
                        disabled={!hasPerm("gaslift:allocate")}
                      />
                    </div>

                    <Button
                      variant="default"
                      className="w-full"
                      onClick={runGasLiftAllocation}
                      disabled={!hasPerm("gaslift:allocate")}
                    >
                      {hasPerm("gaslift:allocate")
                        ? `Simulate Transfer (${donorWell} → ${receiverWell})`
                        : "Requires 'gaslift:allocate' Permission"}
                    </Button>

                    {glSimResult && (
                      <div className="p-3.5 rounded-md border border-zinc-800 bg-zinc-900/50 space-y-2">
                        <div className="text-xs font-mono text-zinc-300">
                          {glSimResult.donorWell} → {glSimResult.receiverWell} ({glSimResult.shiftMscfd} Mscf/d)
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>
                            <div className="text-[11px] text-zinc-400">Net Oil Gain</div>
                            <div className="text-lg font-mono font-semibold text-emerald-400">
                              +{glSimResult.netOilGainStbd} STB/d
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] text-zinc-400">Annualized Cashflow</div>
                            <div className="text-lg font-mono font-semibold text-zinc-100">
                              +${glSimResult.annualRevenueUsd?.toLocaleString()}/yr
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* MODULE 05: DELIVERABLES & OFFLINE REPORTS            */}
          {/* ==================================================== */}
          {activeTab === "export" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1 bg-gradient-to-b from-purple-400 to-emerald-500 rounded-full" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold tracking-wider uppercase text-zinc-100">
                        OFFICIAL DELIVERABLES & AUDIT REPORTS
                      </h2>
                      <Badge variant="outline" className="border-purple-500/30 text-purple-400 bg-purple-950/20 text-[10px] font-mono">
                        task.pdf Compliant
                      </Badge>
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-950/20 text-[10px] font-mono">
                        4 Verified Files
                      </Badge>
                    </div>
                    <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                      STANDALONE PLOTLY HTML · CSV PORTAL SUBMISSIONS · EXCEL AUDIT WORKBOOKS
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="border-b border-zinc-800">
                    <Badge variant="default" className="w-fit mb-1 font-mono">Phase 1 · 50 Points</Badge>
                    <CardTitle className="text-sm">Virtual Flow Metering Deliverables</CardTitle>
                    <CardDescription>
                      Sheet `predictions` contains date, well_name, oil_rate_stbd, water_rate_stbd, gas_rate_mscfd (2,730 rows) + 10 audit sheets.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-2.5">
                    <a
                      href={`${API_URL}/exports/download/vfm_daily_predictions.csv`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        recordExportLog({
                          filename: "vfm_daily_predictions.csv",
                          format: "CSV",
                          module: "DELIVERABLES",
                          sizeKb: "126.8 KB",
                          user: user.email,
                          downloadUrl: `${API_URL}/exports/download/vfm_daily_predictions.csv`,
                        })
                      }
                      className="flex items-center justify-between p-3 rounded-lg bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-500 transition shadow-sm"
                    >
                      <span className="flex items-center gap-2 font-mono">
                        <FileSpreadsheet className="w-4 h-4" />
                        vfm_daily_predictions.csv (Portal Official CSV)
                      </span>
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={`${API_URL}/exports/download/vfm_daily_predictions.xlsx`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        recordExportLog({
                          filename: "vfm_daily_predictions.xlsx",
                          format: "XLSX",
                          module: "DELIVERABLES",
                          sizeKb: "412.4 KB",
                          user: user.email,
                          downloadUrl: `${API_URL}/exports/download/vfm_daily_predictions.xlsx`,
                        })
                      }
                      className="flex items-center justify-between p-3 rounded-lg bg-[#155EEF] text-white font-medium text-xs hover:bg-[#155EEF]/90 transition"
                    >
                      <span className="flex items-center gap-2 font-mono">
                        <FileSpreadsheet className="w-4 h-4" />
                        vfm_daily_predictions.xlsx
                      </span>
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={`${API_URL}/exports/download/vfm_report.html`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        recordExportLog({
                          filename: "vfm_report.html",
                          format: "HTML",
                          module: "DELIVERABLES",
                          sizeKb: "1,840.0 KB",
                          user: user.email,
                          downloadUrl: `${API_URL}/exports/download/vfm_report.html`,
                        })
                      }
                      className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200 font-medium text-xs hover:bg-zinc-800 transition"
                    >
                      <span className="font-mono">vfm_report.html (Offline Plotly Bundle)</span>
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="border-b border-zinc-800">
                    <Badge variant="default" className="w-fit mb-1 font-mono">Phase 2 · PTA</Badge>
                    <CardTitle className="text-sm">Automated PTA Deliverables</CardTitle>
                    <CardDescription>
                      Portal exact 6 columns: Well, shut_in_time, Horner slope, Permeability (k), Skin and ΔP Skin for all 6 shut-ins.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-2.5">
                    <a
                      href={`${API_URL}/exports/download/pta_submission.xlsx`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        recordExportLog({
                          filename: "pta_submission.xlsx",
                          format: "XLSX",
                          module: "DELIVERABLES",
                          sizeKb: "14.2 KB",
                          user: user.email,
                          downloadUrl: `${API_URL}/exports/download/pta_submission.xlsx`,
                        })
                      }
                      className="flex items-center justify-between p-3 rounded-lg bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-500 transition shadow-sm"
                    >
                      <span className="flex items-center gap-2 font-mono">
                        <FileSpreadsheet className="w-4 h-4" />
                        pta_submission.xlsx (Portal Exact 6-Col Excel)
                      </span>
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={`${API_URL}/exports/download/pta_submission.csv`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        recordExportLog({
                          filename: "pta_submission.csv",
                          format: "CSV",
                          module: "DELIVERABLES",
                          sizeKb: "1.4 KB",
                          user: user.email,
                          downloadUrl: `${API_URL}/exports/download/pta_submission.csv`,
                        })
                      }
                      className="flex items-center justify-between p-3 rounded-lg bg-teal-600 text-white font-semibold text-xs hover:bg-teal-500 transition shadow-sm"
                    >
                      <span className="flex items-center gap-2 font-mono">
                        <FileSpreadsheet className="w-4 h-4" />
                        pta_submission.csv (Portal Exact 6-Col CSV)
                      </span>
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={`${API_URL}/exports/download/pta_reservoir_properties.xlsx`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        recordExportLog({
                          filename: "pta_reservoir_properties.xlsx",
                          format: "XLSX",
                          module: "DELIVERABLES",
                          sizeKb: "128.7 KB",
                          user: user.email,
                          downloadUrl: `${API_URL}/exports/download/pta_reservoir_properties.xlsx`,
                        })
                      }
                      className="flex items-center justify-between p-3 rounded-lg bg-[#155EEF] text-white font-medium text-xs hover:bg-[#155EEF]/90 transition"
                    >
                      <span className="flex items-center gap-2 font-mono">
                        <FileSpreadsheet className="w-4 h-4" />
                        pta_reservoir_properties.xlsx (Full 34-Col Audit)
                      </span>
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <a
                      href={`${API_URL}/exports/download/pta_report.html`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        recordExportLog({
                          filename: "pta_report.html",
                          format: "HTML",
                          module: "DELIVERABLES",
                          sizeKb: "1,520.0 KB",
                          user: user.email,
                          downloadUrl: `${API_URL}/exports/download/pta_report.html`,
                        })
                      }
                      className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200 font-medium text-xs hover:bg-zinc-800 transition"
                    >
                      <span className="font-mono">pta_report.html (Offline Plotly Bundle)</span>
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* MODULE 06: UNIFIED EXPORT LOGS & SYSTEM AUDIT TRAIL  */}
          {/* ==================================================== */}
          {(activeTab === "logs" || activeTab === "rbac") && (
            <div className="space-y-6 gsap-stagger">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-zinc-100">{t.logs_title}</h2>
                  <p className="text-xs text-zinc-400">
                    Unified log repository tracking all exported deliverables, Claude AI artifacts, 3D telemetry exports & RBAC system operations.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    triggerClientDownload(
                      `wellperf_audit_export_logs_${Date.now()}.json`,
                      JSON.stringify({ exportLogs, auditLogs: rbacOverview?.auditLogs || [] }, null, 2),
                      "application/json",
                      "JSON",
                      "DELIVERABLES",
                      user.email
                    );
                  }}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export All Logs (.JSON)</span>
                </Button>
              </div>

              {/* 1. Exported Files History Log Table */}
              <Card>
                <CardHeader className="pb-2.5 border-b border-zinc-800 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">{t.logs_exports_tab}</CardTitle>
                    <CardDescription>
                      Every file exported from Deliverables, Claude AI Chat, or 3D Digital Twin
                    </CardDescription>
                  </div>
                  <Badge variant="cyan" className="font-mono">
                    {exportLogs.length} Files Logged
                  </Badge>
                </CardHeader>
                <CardContent className="p-0 max-h-[340px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>File Name</TableHead>
                        <TableHead>Format</TableHead>
                        <TableHead>Source Module</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exportLogs.map((exp) => (
                        <TableRow key={exp.id}>
                          <TableCell className="font-mono text-[11px] text-zinc-400">
                            {exp.timestamp}
                          </TableCell>
                          <TableCell className="font-mono font-semibold text-zinc-100">
                            {exp.filename}
                          </TableCell>
                          <TableCell>
                            <Badge variant="emerald" className="font-mono">
                              {exp.format}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="cyan" className="font-mono">
                              {exp.module}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-zinc-300">
                            {exp.sizeKb}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-zinc-400">
                            {exp.user}
                          </TableCell>
                          <TableCell className="text-right">
                            {exp.downloadUrl ? (
                              <a
                                href={
                                  exp.downloadUrl.startsWith("http")
                                    ? exp.downloadUrl
                                    : `${API_URL}${exp.downloadUrl.replace("/api", "")}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                              >
                                <Download className="w-3 h-3" />
                                <span>Download</span>
                              </a>
                            ) : exp.content ? (
                              <button
                                type="button"
                                onClick={() =>
                                  triggerClientDownload(
                                    exp.filename,
                                    exp.content!,
                                    "text/plain;charset=utf-8;",
                                    exp.format,
                                    exp.module,
                                    user.email
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                              >
                                <Download className="w-3 h-3" />
                                <span>Re-Export</span>
                              </button>
                            ) : (
                              <span className="text-xs text-zinc-500">Logged</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* 2. System & RBAC Audit Trail + Role Switcher */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <Card className="lg:col-span-5">
                  <CardHeader className="pb-2 border-b border-zinc-800">
                    <CardTitle className="text-sm">RBAC Profiles & Permissions</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead className="text-right">Switch</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(rbacOverview?.users || demoAccounts).map((u: any) => (
                          <TableRow key={u.email}>
                            <TableCell>
                              <div className="font-medium text-zinc-100">{u.name}</div>
                              <div className="text-[11px] font-mono text-zinc-500">{u.email}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={ROLE_BADGE_MAP[u.role] || "slate"}>{u.role}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleQuickRoleSwitch(u.email)}
                              >
                                Activate
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-7">
                  <CardHeader className="pb-2 border-b border-zinc-800">
                    <CardTitle className="text-sm">{t.logs_audit_tab}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 max-h-[420px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Module / Action</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(rbacOverview?.auditLogs || []).map((log: any) => (
                          <TableRow key={log._id}>
                            <TableCell className="font-mono text-[11px] text-zinc-500">
                              {String(log.createdAt).slice(11, 19)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={log.status === "FORBIDDEN" ? "rose" : "default"} className="font-mono">
                                {log.module}:{log.action}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-zinc-300">{log.userName}</TableCell>
                            <TableCell className="font-mono text-[11px] text-zinc-400 max-w-[240px] truncate">
                              {JSON.stringify(log.details)}
                            </TableCell>
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
        </main>

        {/* Guided Introduction / Onboarding Tour */}
        <OnboardingTour
          isOpen={isTourOpen}
          onClose={() => setIsTourOpen(false)}
          lang={lang}
          onSelectTab={(tab) => setActiveTab(tab as any)}
        />
      </div>
    </div>
  );
}
