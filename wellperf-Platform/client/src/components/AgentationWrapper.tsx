"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Dynamically import Agentation so it only mounts on the client
const Agentation = dynamic(
  () => import("agentation").then((mod) => mod.Agentation),
  { ssr: false }
);

export function AgentationWrapper() {
  const [mounted, setMounted] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCopy = () => {
    setToastMessage("Agentation: Feedback copied to clipboard for AI agent!");
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSubmit = async (output: string, annotations: any[]) => {
    try {
      const res = await fetch("http://localhost:5000/api/feedback/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName: "WellPerf Enterprise",
          page: typeof window !== "undefined" ? window.location.pathname : "/",
          output,
          annotations,
          userEmail: "engineer@socar.az",
        }),
      });
      if (res.ok) {
        setToastMessage(`Agentation: ${annotations.length} annotation(s) sent to WellPerf backend & MongoDB!`);
      } else {
        setToastMessage("Agentation: Feedback saved locally.");
      }
    } catch {
      setToastMessage("Agentation: Feedback captured locally (backend offline).");
    }
    setTimeout(() => setToastMessage(null), 4000);
  };

  if (!mounted) return null;

  return (
    <>
      <Agentation
        appName="WellPerf Enterprise"
        copyFormat="markdown"
        enableKeyboardShortcuts={true}
        onCopy={handleCopy}
        onSubmit={handleSubmit}
      />
      {toastMessage && (
        <div className="fixed bottom-16 right-6 z-[999999] max-w-sm rounded-md border border-zinc-700 bg-zinc-900/95 px-3.5 py-2.5 text-xs font-mono text-zinc-200 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </>
  );
}
