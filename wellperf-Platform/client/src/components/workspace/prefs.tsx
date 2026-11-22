"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DICT, Lang } from "./i18n";
import { setDateLocale } from "./api";
import { Languages, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type Theme = "dark" | "light";
export type AccentKey = "navy" | "lime" | "cyan" | "amber" | "violet" | "coral";

export const ACCENTS: Record<AccentKey, { dark: string; light: string; ink: string; name: string }> = {
  navy: { dark: "#dfe7ef", light: "#0f2a44", ink: "#0a1724", name: "Navy" },
  lime: { dark: "#d8ff3e", light: "#5b7a00", ink: "#0b0c0e", name: "Lime" },
  cyan: { dark: "#3ee0ff", light: "#0077a8", ink: "#05141a", name: "Cyan" },
  amber: { dark: "#ffb23e", light: "#b35a00", ink: "#1a1003", name: "Amber" },
  violet: { dark: "#b69bff", light: "#5b3fd6", ink: "#120a26", name: "Violet" },
  coral: { dark: "#ff7a5c", light: "#c2401f", ink: "#1f0904", name: "Coral" },
};

export interface Palette {
  bg: string;
  panel: string;
  ink: string;
  ink2: string;
  ink3: string;
  grid: string;
  accent: string;
  accentInk: string;
  accentSoft: string;
  oil: string;
  water: string;
  gas: string;
  press: string;
  deriv: string;
  danger: string;
  dangerSoft: string;
  warn: string;
  warnSoft: string;
}

function palette(theme: Theme, accent: AccentKey): Palette {
  void accent; // single product accent (petrol); the accent picker was removed
  const acc = theme === "dark" ? "#45b4c3" : "#0a616d";
  const soft = (hex: string, alpha: number) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  };
  if (theme === "light")
    return {
      bg: "#ffffff", panel: "#ffffff", ink: "#09090b", ink2: "#52525b", ink3: "#a1a1aa", grid: "rgba(9,9,11,.06)",
      accent: acc, accentInk: "#ffffff", accentSoft: soft(acc, 0.1),
      oil: "#15803d", water: "#2563eb", gas: "#ea580c", press: "#3f3f46", deriv: "#db2777",
      danger: "#dc2626", dangerSoft: "rgba(220,38,38,.12)", warn: "#d97706", warnSoft: "rgba(217,119,6,.14)",
    };
  return {
    bg: "#09090b", panel: "#09090b", ink: "#fafafa", ink2: "#a1a1aa", ink3: "#71717a", grid: "rgba(250,250,250,.06)",
    accent: acc, accentInk: "#09090b", accentSoft: soft(acc, 0.12),
    oil: "#2dd4a7", water: "#4f9dff", gas: "#ff9a3c", press: "#dbe2ea", deriv: "#a78bfa",
    danger: "#ff6b5b", dangerSoft: "rgba(255,107,91,.22)", warn: "#fbbf24", warnSoft: "rgba(251,191,36,.2)",
  };
}

interface Prefs {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  accent: AccentKey;
  setAccent: (a: AccentKey) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  pal: Palette;
  cssVars: React.CSSProperties;
}

const Ctx = createContext<Prefs | null>(null);

function load<T extends string>(key: string, fallback: T, allowed: readonly string[]): T {
  try {
    const v = localStorage.getItem(key);
    if (v && allowed.includes(v)) return v as T;
  } catch {}
  return fallback;
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangS] = useState<Lang>("az");
  const [theme, setThemeS] = useState<Theme>("dark");
  const [accent, setAccentS] = useState<AccentKey>("amber");

  useEffect(() => {
    setLangS(load("wp_lang", "az", ["az", "en", "ru"]));
    // v3 keys: the workspace moved to a dark control-room default; older saved choices are not carried over.
    setThemeS(load("wp_theme3", "dark", ["dark", "light"]));
    setAccentS(load("wp_accent3", "amber", Object.keys(ACCENTS)));
  }, []);

  const persist = (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  };

  const value = useMemo<Prefs>(() => {
    const pal = palette(theme, accent);
    setDateLocale(lang);
    const dict = DICT[lang];
    const t = (key: string, vars?: Record<string, string | number>) => {
      let s = dict[key] ?? DICT.en[key] ?? key;
      if (vars) Object.entries(vars).forEach(([k, v]) => (s = s.split(`{${k}}`).join(String(v))));
      return s;
    };
    const cssVars = {} as React.CSSProperties;
    return {
      lang,
      setLang: (l) => (setLangS(l), persist("wp_lang", l)),
      theme,
      setTheme: (x) => (setThemeS(x), persist("wp_theme3", x)),
      accent,
      setAccent: (a) => (setAccentS(a), persist("wp_accent3", a)),
      t,
      pal,
      cssVars,
    };
  }, [lang, theme, accent]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("dark", theme === "dark");
    el.classList.toggle("light", theme === "light");
  }, [theme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePrefs outside PrefsProvider");
  return c;
}

/** Language and theme controls — used in the landing nav and the workspace header. */
export function PrefsControls({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, theme, setTheme, t } = usePrefs();
  void compact;
  return (
    <div className="flex items-center gap-1" data-tour="prefs">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 font-mono text-xs" aria-label={t("pref_language")}>
            <Languages />
            {lang.toUpperCase()}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t("pref_language")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={lang} onValueChange={(v) => setLang(v as Lang)}>
            <DropdownMenuRadioItem value="az">Azərbaycan</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="ru">Русский</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        aria-label={t("pref_theme")}
        title={t(`theme_${theme === "dark" ? "light" : "dark"}`)}
      >
        {theme === "dark" ? <Sun /> : <Moon />}
      </Button>
    </div>
  );
}
