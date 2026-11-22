"use client";

import React, { useEffect, useState } from "react";
import "./workspace.css";
import Workspace from "@/components/workspace/Workspace";
import { Landing } from "@/components/workspace/Landing";
import { PrefsProvider } from "@/components/workspace/prefs";
import { AiChat } from "@/components/workspace/AiChat";

export default function Home() {
  const [view, setView] = useState<"landing" | "app" | null>(null);

  useEffect(() => {
    // Skip the landing on reload once the user has entered the workspace this session.
    let entered = false;
    try {
      entered = sessionStorage.getItem("wp_entered") === "1" || window.location.hash === "#app";
    } catch {}
    setView(entered ? "app" : "landing");
  }, []);

  const go = (v: "landing" | "app") => {
    try {
      if (v === "app") sessionStorage.setItem("wp_entered", "1");
      else sessionStorage.removeItem("wp_entered");
    } catch {}
    setView(v);
    window.scrollTo({ top: 0 });
  };

  return (
    <PrefsProvider>
      {view === null ? (
        <div style={{ minHeight: "100vh", background: "#0b0c0e" }} />
      ) : view === "landing" ? (
        <Landing onEnter={() => go("app")} />
      ) : (
        <Workspace onHome={() => go("landing")} />
      )}
      {view === "app" && <AiChat />}
    </PrefsProvider>
  );
}
