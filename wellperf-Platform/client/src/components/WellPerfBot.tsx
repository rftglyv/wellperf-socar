"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, X, RotateCcw } from "lucide-react";
import { API_URL } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

const SUGGESTIONS = [
  "GL-06 quyusunda nə problem var?",
  "GL-04 → GL-01 qaz bölgüsü nə qədər qazanc verir?",
  "VFM dəqiqliyi nə qədərdir?",
  "Hansı quyularda təkrar test lazımdır?",
];

function formatMessage(md: string) {
  return md.split("\n").map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} className="h-1" />;
    return (
      <div
        key={i}
        className="text-xs leading-relaxed"
        dangerouslySetInnerHTML={{
          __html: trimmed
            .replace(/\*\*(.*?)\*\*/g, "<strong class='font-semibold text-zinc-100'>$1</strong>")
            .replace(
              /`(.*?)`/g,
              "<code class='px-1 py-0.5 rounded bg-zinc-800/80 font-mono text-[11px] text-cyan-400'>$1</code>"
            ),
        }}
      />
    );
  });
}

export function WellPerfBot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Salam! Mən **WellPerf AI** köməkçisiyəm. Quyular, hasilat, PTA və qaz-lift barədə istədiyini soruşa bilərsən.",
      timestamp: "Canlı",
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const sendQuestion = async (qText?: string) => {
    const query = (qText ?? input).trim();
    if (!query || loading) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    if (!qText) setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/bot/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: query,
          history: updatedHistory.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          content: data.answer || "Cavab alına bilmədi.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "assistant",
          content: "Bağlantı xətası baş verdi.",
          timestamp: "İndi",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Sleek Circular Avatar Button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open WellPerf AI Assistant"
          className="fixed bottom-5 left-5 z-50 group h-12 w-12 rounded-full bg-zinc-950 border border-cyan-500/40 shadow-[0_0_24px_rgba(6,182,212,0.28)] flex items-center justify-center transition-all duration-300 hover:scale-105 hover:border-cyan-400"
        >
          {/* Custom Futuristic AI Core Avatar SVG */}
          <div className="relative h-9 w-9 rounded-full bg-gradient-to-tr from-cyan-600 via-teal-500 to-emerald-400 p-[1.5px] flex items-center justify-center">
            <div className="h-full w-full rounded-full bg-zinc-950 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="4" className="fill-cyan-400/20" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M19.07 4.93l-2.12 2.12M7.05 16.95l-2.12 2.12" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <span className="absolute top-0 right-0 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-zinc-950" />
        </button>
      )}

      {/* Compact Conversational Chat Window */}
      {open && (
        <div className="fixed bottom-5 left-5 z-50 w-[340px] sm:w-[375px] flex flex-col rounded-2xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-xl text-zinc-100 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/50">
            <div className="flex items-center gap-2.5">
              <div className="relative h-8 w-8 rounded-full bg-gradient-to-tr from-cyan-500 to-emerald-400 p-[1.5px]">
                <div className="h-full w-full rounded-full bg-zinc-950 flex items-center justify-center">
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 animate-pulse" />
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-100 leading-none">WellPerf AI</div>
                <div className="text-[10px] text-emerald-400 mt-0.5">Online · Field Intelligence</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMessages((prev) => [prev[0]])}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition"
                title="Sıfırla"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition"
                title="Bağla"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-3.5 space-y-2.5 max-h-[340px] min-h-[240px]"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2 ${
                    m.role === "user"
                      ? "bg-cyan-600 text-white rounded-br-sm"
                      : "bg-zinc-900 text-zinc-200 border border-zinc-800 rounded-bl-sm"
                  }`}
                >
                  {m.role === "user" ? (
                    <div className="text-xs">{m.content}</div>
                  ) : (
                    <div className="space-y-1">{formatMessage(m.content)}</div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-1.5 text-[11px] text-cyan-400 px-2">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
                <span>Cavab yazılır...</span>
              </div>
            )}
          </div>

          {/* Quick Chips */}
          <div className="px-3 py-1.5 border-t border-zinc-800/60 flex gap-1.5 overflow-x-auto">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => sendQuestion(s)}
                className="shrink-0 rounded-full border border-zinc-800 bg-zinc-900/70 hover:border-cyan-500/50 hover:text-cyan-300 px-2.5 py-1 text-[10px] text-zinc-400 transition"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendQuestion();
            }}
            className="p-2.5 border-t border-zinc-800 bg-zinc-900/40 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Mesaj yazın..."
              className="flex-1 h-8 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-8 w-8 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white flex items-center justify-center transition"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
