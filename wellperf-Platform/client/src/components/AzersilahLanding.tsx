"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ArrowUpRight, Play, ShieldCheck } from "lucide-react";
import { AppLang, TRANSLATIONS } from "@/lib/i18n";

interface AzersilahLandingProps {
  lang: AppLang;
  onChangeLang: (lang: AppLang) => void;
  onLaunchDashboard: (targetTab?: "command" | "ai" | "data" | "vfm" | "pta" | "gaslift" | "export" | "logs" | "rbac") => void;
}

const ROTATING_WORDS = ["METER", "OPTIMIZE", "PREDICT", "CONTROL"];

function CountUpStat({
  target,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 2400,
}: {
  target: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
}) {
  const [current, setCurrent] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    let startTime: number | null = null;
    let rafId: number;

    const update = (now: number) => {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic: starts quickly and smoothly settles
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(eased * target);

      if (progress < 1) {
        rafId = requestAnimationFrame(update);
      } else {
        setCurrent(target);
      }
    };

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [started, target, duration]);

  return (
    <div ref={containerRef} className="text-6xl sm:text-7xl xl:text-8xl font-normal tracking-[-0.05em] leading-none tabular-nums">
      {prefix}
      {current.toFixed(decimals)}
      {suffix}
    </div>
  );
}

export function AzersilahLanding({ lang, onChangeLang, onLaunchDashboard }: AzersilahLandingProps) {
  const [wordIndex, setWordIndex] = useState(0);
  const t = TRANSLATIONS[lang];
  const landingRootRef = useRef<HTMLDivElement>(null);

  // Vertical word carousel (like Azersilah heroSwiper: DEFEND / WIN / CONTROL)
  useEffect(() => {
    const timer = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
    }, 2200);
    return () => clearInterval(timer);
  }, []);

  // GSAP Entrance Animations
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".az-hero-reveal",
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.8, stagger: 0.12, ease: "power3.out" }
      );
    }, landingRootRef);
    return () => ctx.revert();
  }, []);

  const MODULE_CARDS = [
    {
      id: "vfm" as const,
      num: "01",
      title: lang === "AZ" ? "VİRTUAL AXIN ÖLÇMƏ" : "VIRTUAL FLOW METERING",
      subtitle: "VFM MODEL",
      metric: "3.72% FORWARD MAPE",
      tags: ["3.72% MAPE", "BoundedRidge", "Bias +0.7%", "Daily Rates"],
      accent: "#10b981",
      svgType: "vfm",
    },
    {
      id: "pta" as const,
      num: "02",
      title: lang === "AZ" ? "TƏZYİQ BƏRPASI ANALİZİ" : "PRESSURE TRANSIENT ANALYSIS",
      subtitle: "HORNER & BOURDET",
      metric: "GL-06 SKIN +1.74",
      tags: ["Bourdet Log-Log", "Horner R² > 0.999", "k = 292 md", "Stimulation Target"],
      accent: "#f59e0b",
      svgType: "pta",
    },
    {
      id: "gaslift" as const,
      num: "03",
      title: lang === "AZ" ? "QAZ-LİFT OPTİMALLAŞDIRICISI" : "LIFT-GAS ALLOCATION OPTIMISER",
      subtitle: "ZERO-CAPEX VALUE",
      metric: "+19 BBL/D · +$485K/YR",
      tags: ["$0 CAPEX", "+19 bbl/d Uplift", "+$485k/yr Revenue", "GL-04 → GL-01"],
      accent: "#06b6d4",
      svgType: "gaslift",
    },
    {
      id: "data" as const,
      num: "04",
      title: lang === "AZ" ? "3D TWIN & TELEMETRİYA" : "3D DIGITAL TWIN & SENSORS",
      subtitle: "CASPIAN FIELD",
      metric: "10 WELLS · 3.93M ROWS",
      tags: ["3.93M Rows", "10 Wells", "3D WebGL Twin", "Cleaned Sensors"],
      accent: "#3b82f6",
      svgType: "twin",
    },
  ];

  return (
    <div ref={landingRootRef} className="w-full min-h-screen bg-white text-[#05293C] font-sans selection:bg-[#05293C] selection:text-white">
      {/* ===================================================================== */}
      {/* STICKY 100dvh HERO — EXACT AZERSILAH.COM 2×2 GRID & CENTER '+' RETICLE */}
      {/* ===================================================================== */}
      <header className="sticky inset-0 z-10 w-full isolate h-dvh overflow-hidden bg-[#021824] text-white">
        {/* Ultra-Realistic Photorealistic Animated Caspian Offshore Rig Backdrop (Pure GIF, Zero Synthetic Wave Lines) */}
        <img
          src="/caspian-rig.gif"
          alt="Caspian Offshore Rig"
          className="absolute inset-0 w-full h-full object-cover opacity-90 z-0 pointer-events-none"
        />
        {/* Subtle cinematic gradient vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#021824]/90 via-[#021824]/20 to-[#021824]/40 z-0 pointer-events-none" />

        {/* Exact Azersilah Top Bar: Brand Logo Left | Horizontal Side-by-Side Links Middle | AZ/EN/RU & Enter Dashboard Right */}
        <div className="absolute top-0 inset-x-0 z-30 flex justify-between items-center px-6 md:px-10 pt-5 md:pt-7">
          {/* Brand Logo */}
          <button
            type="button"
            onClick={() => onLaunchDashboard("command")}
            className="flex items-center gap-3 text-left group"
          >
            <div className="h-9 w-9 bg-white text-[#021824] flex items-center justify-center font-mono font-black text-sm tracking-tighter">
              WP
            </div>
            <div>
              <div className="text-lg md:text-xl font-bold tracking-[-0.04em] leading-none">
                WELLPERF
              </div>
              <div className="text-[10px] font-mono tracking-[0.2em] text-white/60 uppercase mt-0.5">
                CASPIAN INTELLIGENCE
              </div>
            </div>
          </button>

          {/* Horizontal Side-by-Side Links (Agentation Feedback: "düzəlt bunu yanaşı dursun") */}
          <ul className="hidden lg:flex flex-row items-center gap-6 xl:gap-8 text-xs xl:text-sm font-medium tracking-[-0.02em]">
            {[
              { label: t.land_about, href: "#about" },
              { label: t.land_modules, href: "#products" },
              { label: t.land_edge, href: "#our-edge" },
              { label: t.land_validation, href: "#supply" },
              { label: "WELLPERF AI", action: () => onLaunchDashboard("ai") },
              { label: "TƏQDİMAT (DECK)", href: "/presentation" },
            ].map((item, idx) => (
              <li key={idx} className="group overflow-hidden">
                {item.action ? (
                  <button
                    type="button"
                    onClick={item.action}
                    className="flex items-center gap-1.5 relative py-1 text-cyan-300"
                  >
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-mono">[</span>
                    <div className="relative overflow-hidden">
                      <span className="invisible block uppercase">{item.label}</span>
                      <span className="block absolute top-0 left-0 transition-transform duration-300 group-hover:-translate-y-full uppercase">
                        {item.label}
                      </span>
                      <span className="block absolute top-full left-0 transition-transform duration-300 group-hover:translate-y-[-100%] uppercase text-white">
                        {item.label}
                      </span>
                    </div>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-mono">]</span>
                  </button>
                ) : (
                  <a href={item.href} className="flex items-center gap-1.5 relative py-1">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-mono text-cyan-400">[</span>
                    <div className="relative overflow-hidden">
                      <span className="invisible block uppercase">{item.label}</span>
                      <span className="block absolute top-0 left-0 transition-transform duration-300 group-hover:-translate-y-full uppercase">
                        {item.label}
                      </span>
                      <span className="block absolute top-full left-0 transition-transform duration-300 group-hover:translate-y-[-100%] uppercase text-cyan-300">
                        {item.label}
                      </span>
                    </div>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-mono text-cyan-400">]</span>
                  </a>
                )}
              </li>
            ))}
          </ul>

          {/* Right Controls: AZ / EN / RU Multi-Language Switcher + Direct Dashboard Launch Button */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center border border-white/25 bg-black/30 backdrop-blur-sm">
              {(["AZ", "EN", "RU"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => onChangeLang(l)}
                  className={`px-2 py-1.5 text-xs font-mono uppercase transition ${
                    lang === l ? "bg-white text-[#021824] font-bold" : "text-white/70 hover:text-white"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onLaunchDashboard("command")}
              className="bg-white text-[#021824] hover:bg-cyan-400 hover:text-[#021824] px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg"
            >
              <span>{t.land_dashboard}</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center Crosshair '+' Icon (Exact Azersilah plus-icon.svg placement) */}
        <div className="pointer-events-none absolute inset-0 m-auto flex justify-center items-center z-20">
          <svg className="w-9 h-9 md:w-11 md:h-11 text-white/60" viewBox="0 0 40 40" fill="none">
            <line x1="20" y1="2" x2="20" y2="38" stroke="currentColor" strokeWidth="1.5" />
            <line x1="2" y1="20" x2="38" y2="20" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>

        {/* 2×2 Architectural Grid Overlay */}
        <div className="relative z-10 w-full h-full grid grid-cols-2 grid-rows-2 border border-white/15">
          {/* Top-Left Quadrant */}
          <div className="p-6 md:px-10 md:pb-6 flex items-end justify-start border-b border-white/15">
            <p className="az-hero-reveal text-xs sm:text-sm md:text-lg xl:text-xl font-medium leading-[130%] tracking-[-0.03em] flex gap-2 uppercase">
              <span className="animate-pulse text-cyan-400 font-bold">/</span>
              <span>
                {lang === "AZ" ? (
                  <>
                    10 QAZ-LİFT NEFT QUYUSU ÜÇÜN YARADILIB —
                    <br />
                    3.93M SENSOR SƏTRİNDƏN DƏQİQ QƏRARLARA.
                  </>
                ) : (
                  <>
                    ENGINEERED FOR 10 GAS-LIFTED OIL WELLS —
                    <br />
                    SHAPING AUTONOMOUS UPSTREAM SURVEILLANCE.
                  </>
                )}
              </span>
            </p>
          </div>

          {/* Top-Right Quadrant */}
          <div className="p-6 md:px-10 md:pb-6 flex flex-col items-end justify-end border-b border-l border-white/15 text-right">
            <div className="az-hero-reveal font-mono text-[11px] md:text-xs text-white/70 space-y-1">
              <div className="text-cyan-300 font-semibold">FIELD TELEMETRY: JAN–SEP 2025 (273 DAYS)</div>
              <div>14,250 BBL/D OIL · 7,170 BBL/D WATER · 9,100 MSCF/D LIFT GAS</div>
            </div>
          </div>

          {/* Bottom-Left Quadrant: Giant Swiss Headline + Vertical Sliding Word */}
          <div className="p-6 md:p-10 flex items-end justify-start">
            <h1 className="az-hero-reveal text-[9.5vw] md:text-[6.6vw] font-medium leading-[95%] tracking-[-0.05em] uppercase select-none">
              <div>ENGINEERED</div>
              <div className="flex items-center gap-3 md:gap-5 mt-1">
                <span>TO</span>
                <span className="inline-block h-[10vw] md:h-[7vw] overflow-hidden text-cyan-400">
                  <div
                    className="transition-transform duration-500 ease-out"
                    style={{ transform: `translateY(-${wordIndex * 25}%)` }}
                  >
                    {ROTATING_WORDS.map((w) => (
                      <div key={w} className="h-[10vw] md:h-[7vw] flex items-center">
                        {w}
                      </div>
                    ))}
                  </div>
                </span>
              </div>
            </h1>
          </div>

          {/* Bottom-Right Quadrant */}
          <div className="p-6 md:p-10 flex flex-col items-end justify-end border-l border-white/15 text-right gap-4">
            <div className="az-hero-reveal text-sm sm:text-lg md:text-2xl xl:text-3xl font-medium leading-[115%] tracking-[-0.04em] uppercase">
              {lang === "AZ" ? (
                <>
                  FİZİKİ MƏHDUDİYYƏTLİ VFM & PTA.
                  <br />
                  AVADANLIQ XƏRCİ OLMADAN MAKSİMUM HASİLAT.
                </>
              ) : (
                <>
                  PHYSICS-CONSTRAINED VFM & PTA.
                  <br />
                  PRODUCTION WITHOUT COMPROMISE.
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => onLaunchDashboard("command")}
              className="az-hero-reveal group inline-flex items-center gap-3 bg-cyan-400 hover:bg-white text-[#021824] px-6 py-3.5 text-xs md:text-sm font-bold uppercase tracking-wider transition-all"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{lang === "AZ" ? "CANLI PLATFORMANI AÇ (3D + VFM + PTA)" : "ENTER LIVE WORKBENCH"}</span>
              <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ===================================================================== */}
      {/* SCROLLING FOREGROUND CONTENT (z-20 bg-white OVER STICKY HERO)         */}
      {/* ===================================================================== */}
      <main id="other-section" className="relative z-20 bg-white text-[#05293C]">
        {/* 1. [ ABOUT US / THE PROBLEM & SOLUTION ] */}
        <section
          id="about"
          className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 px-6 md:px-10 pt-20 md:pt-28 pb-12 md:pb-16"
        >
          <div className="col-span-1">
            <span className="font-mono font-medium text-xs md:text-sm text-[#05293C]/60 tracking-wider flex items-center gap-2 uppercase">
              <span>[</span> {lang === "AZ" ? "PROBLEM VƏ HƏLL" : "THE PROBLEM & SOLUTION"} <span>]</span>
            </span>
          </div>

          <div className="col-span-1 md:col-span-2 md:w-5/6">
            <h2 className="font-medium text-[#05293C] text-3xl sm:text-5xl xl:text-6xl tracking-[-0.04em] uppercase leading-[100%]">
              {lang === "AZ"
                ? "TEST GÜNLƏRİ ARASINDA KOR İDARƏETMƏYƏ SON"
                : "BRIDGING THE 30-DAY BLIND WELL TESTING GAP"}
            </h2>
            <p className="text-[#4C5B63] text-base md:text-lg leading-relaxed tracking-[-0.01em] pt-4 max-w-2xl">
              {lang === "AZ"
                ? "10 qaz-lift quyusu · 14,250 bbl/d hasilat. Aylıq 1 test separatoru məhdudiyyətini 3.93M sensor telemetriyası, fiziki VFM və 3D rəqəmsal əkizlə real-vaxt idarəetməyə çeviririk."
                : "10 gas-lift wells · 14,250 bbl/d production. Eliminating monthly separator limitations with 3.93M sensor rows, physics-constrained VFM, and a 3D subsurface digital twin."}
            </p>
            <div className="flex flex-wrap gap-2 pt-5">
              <span className="px-2.5 py-1 rounded bg-[#05293C]/5 border border-[#05293C]/15 text-xs font-mono font-medium text-[#05293C]">
                10 WELLS · CASPIAN FIELD
              </span>
              <span className="px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono font-medium text-emerald-700">
                3.72% FORWARD OIL MAPE
              </span>
              <span className="px-2.5 py-1 rounded bg-cyan-500/10 border border-cyan-500/20 text-xs font-mono font-medium text-cyan-800">
                +$485K/YR LIFT-GAS ROI
              </span>
            </div>
          </div>
        </section>

        {/* 2. [ STATISTICS ] — Exact Azersilah Bracketed Counter Grid */}
        <section
          id="statistics"
          className="grid grid-cols-1 md:grid-cols-3 px-6 md:px-10 gap-5 pb-20 md:pb-28"
        >
          {[
            {
              target: 3.72,
              decimals: 2,
              suffix: "%",
              prefix: "",
              label:
                lang === "AZ"
                  ? "FORWARD NEFT XƏTASI · 38% DAHA DƏQİQ"
                  : "FORWARD OIL ERROR · 38% ACCURACY GAIN",
            },
            {
              target: 485,
              decimals: 0,
              suffix: "K",
              prefix: "+$",
              label:
                lang === "AZ"
                  ? "İLLİK ƏLAVƏ QAZANC · $0 CAPEX QAZ-LİFT"
                  : "ANNUAL VALUE · $0 CAPEX GAS-LIFT",
            },
            {
              target: 1.74,
              decimals: 2,
              suffix: "",
              prefix: "+",
              label:
                lang === "AZ"
                  ? "GL-06 SKİN FAKTORU · #1 STİMULYASİYA HƏDƏFİ"
                  : "GL-06 SKIN · #1 WORKOVER TARGET",
            },
          ].map((st, idx) => (
            <div key={idx} className="flex flex-col justify-between gap-8 text-[#05293C] p-2">
              {/* Top U-Bracket */}
              <div className="w-full h-5 border-t border-x border-[#D5DFE5]" />
              <div className="px-3">
                <CountUpStat
                  target={st.target}
                  decimals={st.decimals}
                  suffix={st.suffix}
                  prefix={st.prefix}
                  duration={2400}
                />
                <p className="font-mono text-xs sm:text-sm uppercase tracking-wider pt-3 text-[#05293C]/75 font-semibold">
                  {st.label}
                </p>
              </div>
              {/* Bottom U-Bracket */}
              <div className="w-full h-5 border-b border-x border-[#D5DFE5]" />
            </div>
          ))}
        </section>

        {/* 3. [ PRODUCT PORTFOLIO / 4 STEPS & OPTIMISER ] */}
        <section
          id="products"
          className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 px-6 md:px-10 pb-10"
        >
          <div className="col-span-1">
            <span className="font-mono font-medium text-sm md:text-base text-[#05293C]/60 tracking-[-0.03em] flex items-center gap-2 uppercase">
              <span>[</span> {lang === "AZ" ? "PLATFORMANIN 4 ADDIMI" : "SYSTEM ARCHITECTURE"} <span>]</span>
            </span>
          </div>
          <div className="col-span-1 md:col-span-2">
            <h2 className="font-medium text-[#05293C] text-3xl sm:text-5xl xl:text-6xl tracking-[-0.04em] uppercase leading-[100%]">
              {lang === "AZ" ? (
                <>
                  DƏQİQLİK. FİZİKA.
                  <br />
                  SIFIR KOMPROMİS.
                </>
              ) : (
                <>
                  PHYSICS. PRECISION.
                  <br />
                  ZERO COMPROMISE.
                </>
              )}
            </h2>
          </div>
        </section>

        {/* 2×2 Product Portfolio Grid — Awwwards Luxury Dark Glassmorphism */}
        <section className="px-6 md:px-10 pb-20 md:pb-28">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {MODULE_CARDS.map((card) => (
              <div
                key={card.id}
                onClick={() => onLaunchDashboard(card.id)}
                className="group relative overflow-hidden bg-[#031826] hover:bg-[#052233] p-6 md:p-8 min-h-[360px] md:min-h-[400px] flex flex-col justify-between transition-all duration-500 cursor-pointer border border-white/10 hover:border-cyan-400/40 rounded-xl shadow-2xl text-white"
              >
                {/* Top Tags & Metric Pill */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-xs font-bold text-white/50 tracking-wider">
                      STEP {card.num} · {card.subtitle}
                    </span>
                    <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-cyan-400/15 text-cyan-300 border border-cyan-400/30">
                      {card.metric}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {card.tags.map((t, i) => (
                      <span
                        key={i}
                        className="rounded border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] font-mono text-white/80 group-hover:border-cyan-400/40 transition-colors"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Center Animated Technical Blueprint Visual (AI/SVG Telemetry Render) */}
                <div className="my-6 flex-1 flex items-center justify-center">
                  {card.svgType === "vfm" && (
                    <svg viewBox="0 0 420 150" className="w-full max-w-[380px] h-32 overflow-visible">
                      <rect x="0" y="0" width="420" height="150" fill="#05293C" rx="6" />
                      <g stroke="rgba(255,255,255,0.08)" strokeWidth="1">
                        <line x1="0" y1="37" x2="420" y2="37" />
                        <line x1="0" y1="75" x2="420" y2="75" />
                        <line x1="0" y1="112" x2="420" y2="112" />
                      </g>
                      {/* Carry-forward baseline step line */}
                      <path
                        d="M 15 95 L 95 95 L 95 62 L 185 62 L 185 88 L 285 88 L 285 52 L 405 52"
                        fill="none"
                        stroke="#94a3b8"
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                      />
                      {/* VFM Calibrated Rate Curve */}
                      <path
                        d="M 15 92 Q 55 86, 95 64 T 185 84 T 285 54 T 405 48"
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="3"
                      />
                      {/* Measured Well Test Points */}
                      {[
                        [95, 64],
                        [185, 84],
                        [285, 54],
                        [385, 49],
                      ].map(([cx, cy], i) => (
                        <g key={i}>
                          <circle cx={cx} cy={cy} r="6" fill="#10b981" opacity="0.25" />
                          <circle cx={cx} cy={cy} r="3.5" fill="#ffffff" stroke="#10b981" strokeWidth="2" />
                        </g>
                      ))}
                      <text x="16" y="22" fill="#34d399" fontSize="10" fontFamily="monospace">
                        OIL RATE VFM (3.72% MAPE) vs CARRY-FORWARD (6.00%)
                      </text>
                    </svg>
                  )}

                  {card.svgType === "pta" && (
                    <svg viewBox="0 0 420 150" className="w-full max-w-[380px] h-32">
                      <rect x="0" y="0" width="420" height="150" fill="#05293C" rx="6" />
                      {/* IARF Radial Stabilization Window */}
                      <rect x="175" y="18" width="175" height="114" fill="rgba(245, 158, 11, 0.14)" stroke="#f59e0b" strokeDasharray="3 3" />
                      {/* Delta P Curve */}
                      <path
                        d="M 25 128 Q 95 68, 175 48 T 385 32"
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2.5"
                      />
                      {/* Bourdet Derivative dP/dln(t) Curve stabilizing flat in IARF */}
                      <path
                        d="M 25 132 Q 105 55, 175 78 L 355 78 L 395 82"
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2.8"
                      />
                      <line x1="175" y1="78" x2="355" y2="78" stroke="#10b981" strokeWidth="1.5" strokeDasharray="5 3" />
                      <text x="182" y="34" fill="#fbbf24" fontSize="10" fontFamily="monospace">
                        IARF RADIAL FLOW: k=292 md, Skin=+1.74
                      </text>
                    </svg>
                  )}

                  {card.svgType === "gaslift" && (
                    <svg viewBox="0 0 420 150" className="w-full max-w-[380px] h-32">
                      <rect x="0" y="0" width="420" height="150" fill="#05293C" rx="6" />
                      {[
                        { w: "GL-01", val: 26, wBar: 250, col: "#10b981" },
                        { w: "GL-06", val: 23, wBar: 220, col: "#14b8a6" },
                        { w: "GL-08", val: 21, wBar: 200, col: "#06b6d4" },
                        { w: "GL-04", val: 7.5, wBar: 75, col: "#f43f5e" },
                      ].map((b, idx) => (
                        <g key={b.w} transform={`translate(20, ${22 + idx * 30})`}>
                          <text x="0" y="13" fill="#e2e8f0" fontSize="11" fontFamily="monospace">
                            {b.w}
                          </text>
                          <rect x="52" y="2" width={b.wBar} height="14" fill={b.col} rx="2" />
                          <text x={60 + b.wBar} y="13" fill={b.col} fontSize="11" fontFamily="monospace" fontWeight="bold">
                            +{b.val} bbl/d
                          </text>
                        </g>
                      ))}
                    </svg>
                  )}

                  {card.svgType === "twin" && (
                    <svg viewBox="0 0 420 150" className="w-full max-w-[380px] h-32">
                      <rect x="0" y="0" width="420" height="150" fill="#05293C" rx="6" />
                      <line x1="0" y1="36" x2="420" y2="36" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="4 2" />
                      <rect x="190" y="14" width="40" height="22" fill="#f59e0b" rx="2" />
                      {[-140, -90, -45, 0, 45, 90, 140].map((dx, i) => (
                        <path
                          key={i}
                          d={`M 210 36 Q ${210 + dx * 0.35} 85, ${210 + dx} 132`}
                          fill="none"
                          stroke={i === 1 ? "#f59e0b" : "#2dd4bf"}
                          strokeWidth="2"
                        />
                      ))}
                      <text x="16" y="24" fill="#38bdf8" fontSize="10" fontFamily="monospace">
                        CASPIAN 3D TWIN · 10 WELLS · 3.93M ROWS
                      </text>
                    </svg>
                  )}
                </div>

                {/* Bottom Title & Arrow */}
                <div className="flex items-end justify-between">
                  <h3 className="font-medium text-2xl md:text-3xl text-white uppercase tracking-tight leading-none group-hover:text-cyan-300 transition-colors">
                    {card.title}
                  </h3>
                  <div className="h-10 w-10 rounded-full border border-white/20 group-hover:bg-cyan-400 group-hover:text-zinc-950 flex items-center justify-center transition-all">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4. [ OUR EDGE & VALIDATION ] */}
        <section
          id="our-edge"
          className="bg-[#021824] text-white grid grid-cols-1 md:grid-cols-3 gap-6 px-6 md:px-10 pt-20 md:pt-28 pb-10"
        >
          <div className="col-span-1">
            <span className="font-mono font-medium text-xs md:text-sm text-cyan-400 tracking-wider flex items-center gap-2 uppercase">
              <span>[</span> {lang === "AZ" ? "MÜHƏNDİSLİK SÜBUTU" : "ENGINEERING PROOF"} <span>]</span>
            </span>
          </div>
          <div className="col-span-1 md:col-span-2">
            <h2 className="font-medium text-white text-3xl sm:text-5xl xl:text-6xl tracking-[-0.04em] uppercase leading-[100%]">
              {lang === "AZ"
                ? "DATA TƏLƏSİNİN HƏLLİ VƏ SAHƏ SÜBUTU"
                : "SOLVING THE SEPARATOR TRAP WITH FIELD PROOF"}
            </h2>
          </div>
        </section>

        <section id="supply" className="bg-[#021824] text-white pb-20 md:pb-28 px-6 md:px-10">
          <div className="grid grid-cols-1 md:grid-cols-3 border border-white/15 rounded-xl overflow-hidden">
            {[
              {
                num: "01",
                title: lang === "AZ" ? "SEPARATOR TƏLƏSİ (+0.7% BİAS)" : "SEPARATOR ROUTING TRAP ELIMINATED",
                desc:
                  lang === "AZ"
                    ? "Test xəttindəki WHP düşüşü izolyasiya edildi. Test-günü meylliliyi (bias) −9.0%-dən +0.7%-ə endirildi."
                    : "WHP separator drop isolated. Test-day routing bias reduced from −9.0% to +0.7%.",
              },
              {
                num: "02",
                title: lang === "AZ" ? "14 İYUN TƏBİİ EKSPERİMENTİ" : "JUNE 14 NATURAL EXPERIMENT",
                desc:
                  lang === "AZ"
                    ? "Sahə üzrə 50% qaz kəsintisi hər quyunun real Məhsuldarlıq İndeksini (J) və qaz cavabını sübut etdi."
                    : "50% field gas cut proved individual well PI and incremental lift response.",
              },
              {
                num: "03",
                title: lang === "AZ" ? "FİZİKİ MƏHDUDİYYƏTLƏR" : "STRICT PHYSICS CONSTRAINTS",
                desc:
                  lang === "AZ"
                    ? "dQ/dPwf <= 0 təzyiq qanunu və Bourdet radial axın sabitliyi hər quyuda məcburi qorunur."
                    : "Monotonic dQ/dPwf <= 0 pressure response and Bourdet radial flow QC strictly enforced.",
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="min-h-[260px] flex flex-col justify-between p-7 border-b md:border-b-0 md:border-r last:border-r-0 border-white/15 hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-2xl text-cyan-400 font-bold">/{item.num}</span>
                  <ShieldCheck className="w-5 h-5 text-cyan-400/60" />
                </div>
                <div className="space-y-2.5 mt-8">
                  <h3 className="text-lg md:text-xl font-medium uppercase tracking-tight text-white">
                    {item.title}
                  </h3>
                  <p className="text-xs md:text-sm text-zinc-400 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. FOOTER — Exact Azersilah #021824 Footer with Giant Call-to-Action */}
        <footer className="bg-[#021824] border-t border-white/15 px-6 md:px-10 py-16 text-white">
          <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-8">
            <div>
              <div className="text-xs font-mono text-cyan-400 uppercase tracking-widest mb-2">
                [ READY FOR FIELD DEPLOYMENT ]
              </div>
              <h2 className="text-4xl sm:text-6xl font-medium tracking-[-0.05em] uppercase leading-none">
                WELLPERF ENTERPRISE
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onLaunchDashboard("command")}
              className="bg-white text-[#021824] hover:bg-cyan-400 px-8 py-4 text-sm font-bold uppercase tracking-wider flex items-center gap-3 transition-all"
            >
              <span>{lang === "AZ" ? "İDARƏETMƏ PANELİNƏ DAXİL OL" : "OPEN ENGINEERING DASHBOARD"}</span>
              <ArrowUpRight className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-12 pt-6 border-t border-white/10 flex flex-wrap items-center justify-between text-xs font-mono text-white/50 gap-4">
            <span>© 2026 WELLPERF · 10 GAS-LIFT WELLS · VFM + PTA + 3D TWIN</span>
            <span>NEXT.JS 14 · THREE.JS · EXPRESS.JS · MONGODB ATLAS · PYTHON 3.11</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
