"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { engineGet, fmt } from "./api";
import { PrefsControls, usePrefs } from "./prefs";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);
const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Number that counts up with GSAP the first time it scrolls into view. */
function ScrollCount({ value, decimals = 0, suffix = "" }: { value: number | null | undefined; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || value == null) return;
    const obj = { v: 0 };
    const render = () => (el.textContent = obj.v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix);
    render();
    const tween = gsap.to(obj, {
      v: value,
      duration: 2.2,
      ease: "power3.out",
      onUpdate: render,
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [value, decimals, suffix]);
  return <span ref={ref}>{value == null ? "—" : `0${suffix}`}</span>;
}

/** Splits a heading into words so each one can rise in. */
function Words({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <React.Fragment key={i}>
          <span className="lx-word">
            <span>{w}</span>
          </span>{" "}
        </React.Fragment>
      ))}
    </>
  );
}

function VisualVFM() {
  return (
    <svg viewBox="0 0 420 170" className="lx-svg" aria-hidden>
      {[42, 85, 128].map((y) => (
        <line key={y} x1="0" y1={y} x2="420" y2={y} className="lx-svg-grid" />
      ))}
      <path className="lx-draw lx-svg-dash" d="M 10 112 L 92 112 L 92 74 L 186 74 L 186 102 L 284 102 L 284 60 L 410 60" />
      <path className="lx-draw lx-svg-main" d="M 10 108 C 50 104, 70 80, 92 76 S 150 96, 186 100 S 250 66, 284 62 S 370 56, 410 54" />
      {[
        [92, 76],
        [186, 100],
        [284, 62],
        [388, 55],
      ].map(([x, y], i) => (
        <g key={i} className="lx-pop">
          <circle cx={x} cy={y} r="8" className="lx-svg-halo" />
          <circle cx={x} cy={y} r="3.5" className="lx-svg-dot" />
        </g>
      ))}
    </svg>
  );
}

function VisualPTA() {
  return (
    <svg viewBox="0 0 420 170" className="lx-svg" aria-hidden>
      <rect x="190" y="14" width="170" height="142" className="lx-svg-band" />
      <path className="lx-draw lx-svg-main" d="M 20 150 C 70 110, 120 70, 190 54 S 330 36, 400 30" />
      <path className="lx-draw lx-svg-accent" d="M 20 154 C 70 90, 140 54, 190 86 L 360 86 L 400 92" />
      <line x1="190" y1="86" x2="360" y2="86" className="lx-draw lx-svg-dash" />
      <path className="lx-draw lx-svg-grid" d="M 20 150 L 70 100" />
    </svg>
  );
}

function VisualTwin() {
  return (
    <svg viewBox="0 0 420 170" className="lx-svg" aria-hidden>
      <line x1="0" y1="44" x2="420" y2="44" className="lx-svg-dash" />
      <path d="M 196 44 L 200 14 L 220 14 L 224 44 Z" className="lx-svg-solid" />
      <rect x="186" y="10" width="48" height="8" className="lx-svg-solid" />
      <ellipse cx="210" cy="146" rx="170" ry="16" className="lx-svg-band" />
      {[-150, -105, -62, -24, 14, 52, 92, 132].map((dx, i) => (
        <path key={i} className="lx-draw lx-svg-main" d={`M 210 44 C 210 80, ${210 + dx * 0.4} 110, ${210 + dx} 142`} />
      ))}
    </svg>
  );
}

export function Landing({ onEnter }: { onEnter: () => void }) {
  const { t, theme, cssVars } = usePrefs();
  const root = useRef<HTMLDivElement>(null);
  const [model, setModel] = useState<any | null>(null);

  useEffect(() => {
    let stop = false;
    const load = () =>
      engineGet("/api/status")
        .then((s) => !stop && setModel(s.model))
        .catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  useIso(() => {
    if (!root.current) return;
    const ctx = gsap.context(() => {
      // hero entrance
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.fromTo(".lx-hero-media img", { scale: 1.16 }, { scale: 1, duration: 2.8, ease: "power2.out" }, 0)
        .fromTo(".lx-grid", { opacity: 0 }, { opacity: 1, duration: 1.4 }, 0.2)
        .fromTo(".lx-reticle", { scale: 0, rotate: -90 }, { scale: 1, rotate: 0, duration: 1.3 }, 0.5)
        .fromTo(".lx-top > *, .lx-menu > *", { y: -16, opacity: 0 }, { y: 0, opacity: 1, duration: 1, stagger: 0.05 }, 0.3)
        .fromTo(".lx-title .lx-mask > span", { yPercent: 115 }, { yPercent: 0, duration: 1.5, stagger: 0.12 }, 0.45)
        .fromTo(".lx-slogan, .lx-scrollcue", { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, stagger: 0.1 }, 0.9);

      // hero scroll: parallax image, title drifts and fades
      gsap.to(".lx-hero-media", { yPercent: 16, ease: "none", scrollTrigger: { trigger: ".lx-hero", start: "top top", end: "bottom top", scrub: true } });
      gsap.to(".lx-title, .lx-slogan", { yPercent: -40, opacity: 0.2, ease: "none", scrollTrigger: { trigger: ".lx-hero", start: "top top", end: "bottom top", scrub: true } });

      // headings: word-by-word rise
      gsap.utils.toArray<HTMLElement>(".lx-h2").forEach((h) =>
        gsap.fromTo(h.querySelectorAll(".lx-word > span"), { yPercent: 110 }, { yPercent: 0, duration: 1.1, stagger: 0.05, ease: "expo.out", scrollTrigger: { trigger: h, start: "top 88%" } })
      );
      gsap.utils.toArray<HTMLElement>(".lx-rise").forEach((el) =>
        gsap.fromTo(el, { y: 46, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 90%" } })
      );
      // stat cells and cards: staggered lift + hairline border draw
      gsap.utils.toArray<HTMLElement>(".lx-stat, .lx-card").forEach((el, i) =>
        gsap.fromTo(el, { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2, delay: (i % 3) * 0.09, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 92%" } })
      );
      // SVG blueprints draw themselves on scroll
      gsap.utils.toArray<SVGPathElement>(".lx-draw").forEach((p) => {
        const len = (p as any).getTotalLength?.() || 600;
        gsap.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 1.8, ease: "power2.inOut", scrollTrigger: { trigger: p.closest(".lx-card") || p, start: "top 85%" } });
      });
      gsap.utils.toArray<SVGGElement>(".lx-pop").forEach((g, i) =>
        gsap.fromTo(g, { scale: 0, transformOrigin: "center" }, { scale: 1, duration: 0.6, delay: 0.9 + i * 0.15, ease: "back.out(2)", scrollTrigger: { trigger: g.closest(".lx-card") || g, start: "top 85%" } })
      );

      // pinned horizontal workflow strip
      const track = document.querySelector<HTMLElement>(".lx-hscroll-track");
      const wrap = document.querySelector<HTMLElement>(".lx-hscroll");
      if (track && wrap && window.innerWidth > 900) {
        const distance = () => Math.max(0, track.scrollWidth - window.innerWidth + 80);
        gsap.to(track, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: { trigger: wrap, start: "top top", end: () => `+=${distance()}`, scrub: 0.6, pin: true, invalidateOnRefresh: true, anticipatePin: 1 },
        });
        gsap.fromTo(".lx-hscroll-bar > div", { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: { trigger: wrap, start: "top top", end: () => `+=${distance()}`, scrub: true } });
      }

      // marquee
      gsap.to(".lx-marquee-track", { xPercent: -50, duration: 40, ease: "none", repeat: -1 });
      // band background shift
      gsap.fromTo(".lx-band", { clipPath: "inset(8% 4% 8% 4%)" }, { clipPath: "inset(0% 0% 0% 0%)", ease: "none", scrollTrigger: { trigger: ".lx-band", start: "top 95%", end: "top 35%", scrub: true } });
    }, root);
    return () => ctx.revert();
    // re-run when language changes so split words / rotating items are rebuilt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const oil = model?.held_out_mape?.oil_rate_stbd;
  const fwd = model?.forward_mape?.oil_rate_stbd;
  const cards = [
    { n: 1, title: t("lx_c2"), items: ["a", "b", "c"].map((k) => t(`lx_c2${k}`)), caption: t("lx_v1"), Visual: VisualVFM },
    { n: 2, title: t("lx_c3"), items: ["a", "b"].map((k) => t(`lx_c3${k}`)), caption: t("lx_v2"), Visual: VisualPTA },
    { n: 3, title: t("lx_c4"), items: [t("lx_c1a"), t("lx_c3c")], caption: t("lx_v3"), Visual: VisualTwin },
  ];
  const steps: [string, string][] = [
    ["s_data", "l_f1"],
    ["s_clean", "l_f2"],
    ["s_model", "l_f3"],
    ["s_vfm", "l_f4"],
    ["s_pta", "l_f5"],
    ["s_twin", "l_f7"],
    ["s_export", "l_f6"],
  ];
  const marquee = ["Virtual flow metering", "Bourdet derivative", "Horner", "Skin", "Permeability", "MAPE", "P10 · P90", "Shut-in detection"];

  return (
    <div className="wf lx" data-theme={theme} style={cssVars} ref={root}>
      <header className="lx-hero">
        <div className="lx-hero-media" aria-hidden>
          <img src="/caspian-rig.gif" alt="" />
        </div>
        <div className="lx-grid" aria-hidden />
        <div className="lx-reticle" aria-hidden />

        <div className="lx-top">
          <button className="lx-mark" onClick={onEnter}>
            WellPerf
          </button>
          <nav className="lx-menu">
            <a href="#platform">{t("lx_nav1")}</a>
            <a href="#workflow">{t("lx_nav2")}</a>
            <a href="#approach">{t("lx_nav3")}</a>
            <a href="/presentation">{t("lx_nav4")}</a>
            <button onClick={onEnter}>{t("lx_nav5")}</button>
          </nav>
          <div className="lx-right">
            <PrefsControls compact />
            <button className="wf-btn sm primary" onClick={onEnter}>
              {t("l_enter")} <ArrowUpRight size={13} />
            </button>
          </div>
        </div>

        <h1 className="lx-title">
          <span className="lx-mask">
            <span>{t("lx_h1a")}</span>
          </span>
          <span className="lx-mask">
            <span className="l2">{t("lx_h1b")}</span>
          </span>
        </h1>
        <div className="lx-slogan">
          {t("lx_slogan1")}
          <br />
          {t("lx_slogan2")}
        </div>
        <a className="lx-scrollcue" href="#platform" aria-label={t("lx_scroll")}>
          <ArrowDown size={14} /> {t("lx_scroll")}
        </a>
      </header>

      <section id="platform" className="lx-section">
        <div className="lx-two">
          <div>
            <h2 className="lx-h2">
              <Words text={t("lx_about_t1")} />
              <br />
              <em>
                <Words text={t("lx_about_t2")} />
              </em>
            </h2>
          </div>
          <p className="lx-p lx-rise" style={{ paddingTop: 44 }}>
            {t("lx_about_p")}
          </p>
        </div>
        <div className="lx-stats">
          {[
            [oil, "%", 2, t("lx_s1")],
            [fwd, "%", 2, t("l_stat2")],
            [model?.wells?.length, "", 0, t("lx_s2")],
          ].map(([v, u, d, l]: any) => (
            <div className="lx-stat" key={l}>
              <div className="lx-stat-v">
                <ScrollCount value={v} decimals={d} suffix={u} />
              </div>
              <div className="lx-stat-l">{l}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="workflow" className="lx-section" style={{ paddingTop: 40 }}>
        <div>
          <h2 className="lx-h2">
            <Words text={t("lx_flow_t1")} />
            <br />
            <em>
              <Words text={t("lx_flow_t2")} />
            </em>
          </h2>
        </div>
        <div className="lx-cards">
          {cards.map(({ n, title, items, caption, Visual }) => (
            <button key={n} className="lx-card" onClick={onEnter}>
              <span className="lx-card-n">0{n}</span>
              <ArrowUpRight size={18} className="lx-card-arrow" />
              <div className="lx-card-visual">
                <Visual />
                <span className="lx-card-cap">{caption}</span>
              </div>
              <ul className="lx-card-list">
                {items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
              <span className="lx-card-title">{title}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="lx-hscroll">
        <div className="lx-hscroll-head">
          <div className="lx-hscroll-sub">{t("lx_steps_t")}</div>
          <div className="lx-hscroll-bar">
            <div />
          </div>
        </div>
        <div className="lx-hscroll-track">
          {steps.map(([k, d], i) => (
            <button key={k} className="lx-hstep" onClick={onEnter}>
              <span className="lx-hstep-n">{String(i + 1).padStart(2, "0")}</span>
              <span className="lx-hstep-t">{t(k)}</span>
              <span className="lx-hstep-d">{t(d)}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="lx-marquee" aria-hidden>
        <div className="lx-marquee-track">
          {[...marquee, ...marquee].map((w, i) => (
            <span key={i}>
              {w} <i>+</i>
            </span>
          ))}
        </div>
      </div>

      <div className="lx-band">
        <section id="approach" className="lx-section">
          <div className="lx-two">
            <div>
                <h2 className="lx-h2">
                <Words text={t("lx_adv_t1")} />
                <br />
                <em>
                  <Words text={t("lx_adv_t2")} />
                </em>
              </h2>
            </div>
            <div className="lx-rise" style={{ paddingTop: 44 }}>
              <p className="lx-p">{t("l_lead")}</p>
              <button className="wf-btn primary" style={{ marginTop: 28 }} onClick={onEnter}>
                {t("lx_cta")} <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
          <div className="lx-pillars">
            {[1, 2, 3].map((n) => (
              <div className="lx-pillar lx-rise" key={n}>
                <span className="lx-pillar-n">0{n}</span>
                <h3>{t(`lx_p${n}`)}</h3>
                <p>{t(`lx_p${n}d`)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="lx-foot">
        <span>WellPerf · SOCAR Hackathon 2026</span>
        <span>{model?.wells?.length ? `${fmt(model.wells.length)} ${t("wells")} · VFM + PTA` : "VFM + PTA"}</span>
      </footer>
    </div>
  );
}
