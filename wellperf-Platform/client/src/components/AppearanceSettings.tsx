"use client";

import React, { useEffect, useState, useRef } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

export type ThemeMode = "light" | "dark" | "system";
export type FontScaleKey = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_CONFIG: Record<
  FontScaleKey,
  { shortLabel: string; label: string; fontSize: string; px: number; scale: number }
> = {
  xs: { shortLabel: "XS", label: "Extra Small", fontSize: "13.5px", px: 13.5, scale: 0.85 },
  sm: { shortLabel: "S", label: "Small", fontSize: "14.75px", px: 14.75, scale: 0.925 },
  md: { shortLabel: "M", label: "Middle", fontSize: "16px", px: 16, scale: 1 },
  lg: { shortLabel: "L", label: "Large", fontSize: "17.5px", px: 17.5, scale: 1.1 },
  xl: { shortLabel: "XL", label: "Extra Large", fontSize: "19px", px: 19, scale: 1.2 },
};

const ORDER: FontScaleKey[] = ["xs", "sm", "md", "lg", "xl"];

export function AppearanceSettings({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");
  const [uiSize, setUiSize] = useState<FontScaleKey>("md");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const savedTheme = (localStorage.getItem("wp_theme") || localStorage.getItem("theme")) as ThemeMode | null;
      const savedSize = (localStorage.getItem("wp_font_scale") || localStorage.getItem("ui_size"))?.toLowerCase() as FontScaleKey | null;
      if (savedTheme && ["light", "dark", "system"].includes(savedTheme)) setTheme(savedTheme);
      if (savedSize && SIZE_CONFIG[savedSize]) setUiSize(savedSize);
    } catch {}
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const isDark = theme === "dark" || (theme === "system" && mediaQuery.matches);
      setResolvedTheme(isDark ? "dark" : "light");
      root.classList.toggle("dark", isDark);
      root.classList.toggle("light", !isDark);
    };

    applyTheme();
    try {
      localStorage.setItem("wp_theme", theme);
      localStorage.setItem("theme", theme);
    } catch {}

    const listener = () => {
      if (theme === "system") applyTheme();
    };
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, [theme]);

  useEffect(() => {
    const cfg = SIZE_CONFIG[uiSize] || SIZE_CONFIG.md;
    document.documentElement.style.fontSize = cfg.fontSize;
    document.documentElement.setAttribute("data-ui-size", uiSize);
    try {
      localStorage.setItem("wp_font_scale", uiSize);
      localStorage.setItem("ui_size", uiSize);
    } catch {}
  }, [uiSize]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.altKey) return;
      const idx = ORDER.indexOf(uiSize);
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        if (idx < ORDER.length - 1) setUiSize(ORDER[idx + 1]);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        if (idx > 0) setUiSize(ORDER[idx - 1]);
      } else if (e.key === "0") {
        e.preventDefault();
        setUiSize("md");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [uiSize]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const currentCfg = SIZE_CONFIG[uiSize] || SIZE_CONFIG.md;

  return (
    <div ref={containerRef} className={`relative inline-block text-left z-50 ${className}`}>
      {/* Trigger Button — Exact match to 13.140.158.231.nip.io DisplaySettings */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Görünüş və miqyas tənzimləmələri"
        aria-label="Görünüş və miqyas tənzimləmələri"
        className="inline-flex items-center h-8 gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 text-zinc-100 shadow-2xs hover:bg-zinc-900 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold leading-none tracking-tight">Aa</span>
          <span className="flex h-4 min-w-[1.25rem] items-center justify-center rounded-sm bg-[#155EEF]/15 px-1 text-[0.625rem] font-bold text-[#3B82F6]">
            {currentCfg.shortLabel}
          </span>
        </div>
        <div className="h-3.5 w-px bg-zinc-800" />
        <div className="flex items-center">
          {theme === "system" ? (
            <Monitor className="size-3.5 text-zinc-400" />
          ) : resolvedTheme === "dark" ? (
            <Moon className="size-3.5 text-[#3B82F6]" />
          ) : (
            <Sun className="size-3.5 text-amber-500" />
          )}
        </div>
      </button>

      {/* Dropdown Content — Exact w-80 p-3 shadow-lg from DisplaySettings-C45Pkrh7.js */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-zinc-800 bg-zinc-950 p-3 shadow-lg text-zinc-100">
          <div className="space-y-4">
            <div className="border-b border-zinc-800 pb-2">
              <h4 className="text-sm font-semibold text-zinc-100">Görünüş Tənzimləmələri</h4>
              <p className="text-xs text-zinc-400">Mövzu və şrift miqyasını fərdiləşdirin</p>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-zinc-400 block">Mövzu</span>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-900 p-1">
                {(
                  [
                    { key: "light", label: "İşıqlı", icon: Sun },
                    { key: "dark", label: "Qaranlıq", icon: Moon },
                    { key: "system", label: "Sistem", icon: Monitor },
                  ] as const
                ).map((r) => {
                  const Icon = r.icon;
                  const active = theme === r.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setTheme(r.key)}
                      className={`inline-flex items-center justify-center h-8 gap-1.5 rounded-md px-2 text-xs font-medium transition-all ${
                        active
                          ? "bg-zinc-950 text-zinc-100 shadow-xs font-semibold"
                          : "text-zinc-400 hover:text-zinc-100"
                      }`}
                    >
                      <Icon className="size-3.5 shrink-0" />
                      <span>{r.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-400 block">Yazı və element ölçüsü</span>
                <span className="text-[0.6875rem] font-semibold text-[#3B82F6]">
                  {currentCfg.label} ({currentCfg.fontSize})
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1 rounded-lg bg-zinc-900 p-1">
                {ORDER.map((r) => {
                  const s = SIZE_CONFIG[r];
                  const active = uiSize === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setUiSize(r)}
                      className={`inline-flex items-center justify-center h-12 flex-col rounded-md p-1 transition-all ${
                        active
                          ? "bg-[#155EEF] text-white shadow-xs font-bold"
                          : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-950/50"
                      }`}
                    >
                      <span
                        style={{ fontSize: `${s.scale * 0.9}rem` }}
                        className="font-bold leading-none mb-1"
                      >
                        Aa
                      </span>
                      <span className="text-[0.625rem] leading-none uppercase">{s.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg bg-zinc-900/60 p-2 text-[0.6875rem] text-zinc-400 space-y-1">
              <div className="font-semibold text-zinc-200">Qısayollar:</div>
              <div className="flex items-center justify-between">
                <span>Böyüt / Kiçilt</span>
                <div className="flex items-center gap-1 font-mono">
                  <kbd className="rounded bg-zinc-950 px-1 py-0.5 border border-zinc-800">Ctrl</kbd>
                  <span>+</span>
                  <kbd className="rounded bg-zinc-950 px-1 py-0.5 border border-zinc-800">Alt</kbd>
                  <span>+</span>
                  <kbd className="rounded bg-zinc-950 px-1 py-0.5 border border-zinc-800">+/-</kbd>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span>Sıfırla (M)</span>
                <div className="flex items-center gap-1 font-mono">
                  <kbd className="rounded bg-zinc-950 px-1 py-0.5 border border-zinc-800">Ctrl</kbd>
                  <span>+</span>
                  <kbd className="rounded bg-zinc-950 px-1 py-0.5 border border-zinc-800">Alt</kbd>
                  <span>+</span>
                  <kbd className="rounded bg-zinc-950 px-1 py-0.5 border border-zinc-800">0</kbd>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
