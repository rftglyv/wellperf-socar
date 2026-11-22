"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Plus,
  Send,
  Download,
  Trash2,
  MessageSquare,
  FileSpreadsheet,
  FileJson,
  FileText,
  Sparkles,
  CheckCircle2,
  Copy,
} from "lucide-react";
import { API_URL } from "@/lib/utils";
import { AppLang, TRANSLATIONS, triggerClientDownload } from "@/lib/i18n";

export interface ClaudeMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  model?: string;
}

export interface ClaudeSession {
  id: string;
  title: string;
  updatedAt: string;
  messages: ClaudeMessage[];
}

interface ClaudeWorkspaceProps {
  lang: AppLang;
  userEmail: string;
  wells: any[];
  latestPredictions: any[];
  ptaEvents: any[];
  liftGasRanking: any[];
}

const SESSIONS_STORAGE_KEY = "wp_claude_sessions_v1";

const DEFAULT_SESSIONS: ClaudeSession[] = [
  {
    id: "sess_gl06",
    title: "GL-06 Skin (+1.74) & Acidizing ROI",
    updatedAt: "16:40",
    messages: [
      {
        id: "m_1",
        role: "user",
        content: "GL-06 quyusunda PTA və VFM nəticələri nə göstərir?",
        timestamp: "16:40",
      },
      {
        id: "m_2",
        role: "assistant",
        content:
          "**GL-06 Quyusu üzrə Kompleks Mühəndis Diaqnostikası:**\n- **PTA Keyfiyyəti:** `🟢 GOOD` (Təsdiqlənmiş IARF radial axın rejimi)\n- **Lay Keçiriciliyi ($k$):** `291.7 md` (Yataqda ən yüksək keçiricilik!)\n- **Skin Faktoru ($S$):** `+1.74` ($\\Delta P_{skin} = 148.9\\text{ psi}$ quyudibi təzyiq itkisi)\n- **Marjinal Qaz-Lift Cavabı:** +100 Mscf/d əlavə lift-qazına `+23.1 bbl/d` neft artımı verir.\n- **Qərar:** Quyu yüksək keçiriciliyə malik olsa da quyudibi zədələnmə var. **Turşu stimulyasiyası (acidizing)** üçün 1 nömrəli namizəddir.",
        timestamp: "16:40",
        model: "gemini-2.5-flash",
      },
    ],
  },
  {
    id: "sess_gaslift",
    title: "GL-04 → GL-01 Lift-Gas Allocation ($485k/yr)",
    updatedAt: "16:35",
    messages: [
      {
        id: "m_3",
        role: "user",
        content: "GL-04-dən GL-01-ə 100 Mscf/d qaz keçirsək iqtisadi effekti nə qədərdir?",
        timestamp: "16:35",
      },
      {
        id: "m_4",
        role: "assistant",
        content:
          "**Zero-CAPEX Qaz-Lift Yenidən Bölgüsü (GL-04 → GL-01):**\n- **Donor (GL-04):** Yataqda ən çox qaz sərf edən quyudur (`~1,570 Mscf/d`), lakin +100 Mscf/d üçün cəmi `+7.5 bbl/d` marjinal effekt verir.\n- **Qəbuledici (GL-01):** +100 Mscf/d əlavə qaza `+26.2 bbl/d` neft artımı verir.\n- **Xalis Hasilat Qazancı:** `+26.2 - 7.5 = +18.7 ≈ +19.0 bbl/d` əlavə neft.\n- **İllik Gəlir ($70/bbl):** `~$1,300/gün ≈ $485,000/il` ($0 əlavə avadanlıq və ya kompressor xərci ilə).",
        timestamp: "16:35",
        model: "gemini-2.5-flash",
      },
    ],
  },
];

const QUICK_PROMPTS: Record<AppLang, string[]> = {
  AZ: [
    "Bütün 10 quyunun cari neft, su və qaz hasilat cədvəlini çıxar",
    "GL-06 quyusunda niyə stimulyasiya aparılmalıdır?",
    "VFM modelində test separatoru tələsi (-9% -> +0.7%) necə həll edildi?",
    "14 İyun təbii qaz-lift eksperimentinin nəticəsini izah et",
  ],
  EN: [
    "Summarize daily oil, water and gas rates across all 10 wells",
    "Why is GL-06 the #1 stimulation candidate based on PTA?",
    "How did VFM solve the test-separator pressure routing trap?",
    "Explain the June 14 field-wide lift-gas natural experiment",
  ],
  RU: [
    "Покажи таблицу текущей добычи нефти, воды и газа по 10 скважинам",
    "Почему скважина GL-06 — кандидат №1 на стимуляцию (ОПЗ)?",
    "Как модель VFM решила ловушку тестового сепаратора (+0.7%)?",
    "Объясни природный эксперимент по газлифту 14 июня",
  ],
};

function renderClaudeMarkdown(md: string) {
  return md.split("\n").map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} className="h-2" />;
    return (
      <div
        key={i}
        className="text-sm leading-relaxed text-zinc-200"
        dangerouslySetInnerHTML={{
          __html: trimmed
            .replace(/\*\*(.*?)\*\*/g, "<strong class='font-semibold text-zinc-100'>$1</strong>")
            .replace(
              /`(.*?)`/g,
              "<code class='px-1.5 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 font-mono text-xs text-[#3B82F6]'>$1</code>"
            ),
        }}
      />
    );
  });
}

export function ClaudeWorkspace({
  lang,
  userEmail,
  latestPredictions,
  ptaEvents,
  liftGasRanking,
}: ClaudeWorkspaceProps) {
  const t = TRANSLATIONS[lang];
  const [sessions, setSessions] = useState<ClaudeSession[]>(DEFAULT_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState<string>(DEFAULT_SESSIONS[0].id);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [typedText, setTypedText] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load saved sessions
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed);
          setActiveSessionId(parsed[0].id);
        }
      }
    } catch {}
  }, []);

  const saveSessions = (next: ClaudeSession[]) => {
    setSessions(next);
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0] || DEFAULT_SESSIONS[0];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeSession?.messages, typedText, loading]);

  // Create a new Claude chat session
  const handleNewSession = () => {
    const newId = `sess_${Date.now()}`;
    const greeting =
      lang === "RU"
        ? "Здравствуйте! Я **WellPerf AI**. Спрашивайте о дебитах 10 скважин, результатах КВД (PTA), оптимизации газлифта или экспортируйте данные прямо из чата."
        : lang === "EN"
        ? "Hello! I am **WellPerf AI**. Ask me anything about the 10 gas-lifted wells, VFM accuracy (3.72%), PTA skin diagnostics, lift-gas optimization, or export datasets directly."
        : "Salam! Mən **WellPerf AI** mühəndis assistentiyəm. 10 qaz-lift quyusu, VFM dəqiqliyi (3.72%), PTA skin nəticələri və qaz-lift optimallaşdırması barədə soruşa və ya dataları birbaşa buradan ixrac (export) edə bilərsiniz.";

    const newSess: ClaudeSession = {
      id: newId,
      title: `${t.ai_new_chat} #${sessions.length + 1}`,
      updatedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      messages: [
        {
          id: `welcome_${newId}`,
          role: "assistant",
          content: greeting,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          model: "gemini-2.5-flash",
        },
      ],
    };
    const next = [newSess, ...sessions];
    saveSessions(next);
    setActiveSessionId(newId);
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = sessions.filter((s) => s.id !== id);
    if (filtered.length === 0) {
      saveSessions(DEFAULT_SESSIONS);
      setActiveSessionId(DEFAULT_SESSIONS[0].id);
    } else {
      saveSessions(filtered);
      if (activeSessionId === id) setActiveSessionId(filtered[0].id);
    }
  };

  // Typewriter streaming animation effect like Claude
  const animateAssistantTyping = (msgId: string, fullText: string) => {
    setTypingMessageId(msgId);
    setTypedText("");
    let idx = 0;
    const step = Math.max(3, Math.ceil(fullText.length / 45));
    const interval = setInterval(() => {
      idx += step;
      if (idx >= fullText.length) {
        setTypedText(fullText);
        setTypingMessageId(null);
        clearInterval(interval);
      } else {
        setTypedText(fullText.slice(0, idx));
      }
    }, 18);
  };

  const handleSend = async (promptText?: string) => {
    const query = (promptText ?? input).trim();
    if (!query || loading) return;

    const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMsg: ClaudeMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      content: query,
      timestamp: nowStr,
    };

    const updatedMsgs = [...activeSession.messages, userMsg];
    const updatedTitle =
      activeSession.messages.length <= 1 ? query.slice(0, 38) : activeSession.title;

    const interimSessions = sessions.map((s) =>
      s.id === activeSession.id
        ? { ...s, title: updatedTitle, updatedAt: nowStr, messages: updatedMsgs }
        : s
    );
    saveSessions(interimSessions);
    if (!promptText) setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/bot/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: query,
          history: updatedMsgs.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const replyText = data.answer || "Cavab alına bilmədi.";
      const botMsgId = `a_${Date.now()}`;
      const botMsg: ClaudeMessage = {
        id: botMsgId,
        role: "assistant",
        content: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        model: data.engine || "gemini-2.5-flash",
      };

      const finalSessions = interimSessions.map((s) =>
        s.id === activeSession.id
          ? { ...s, messages: [...updatedMsgs, botMsg] }
          : s
      );
      saveSessions(finalSessions);
      animateAssistantTyping(botMsgId, replyText);
    } catch {
      const errMsg: ClaudeMessage = {
        id: `err_${Date.now()}`,
        role: "assistant",
        content: "Serverlə əlaqə xətası baş verdi.",
        timestamp: nowStr,
      };
      saveSessions(
        interimSessions.map((s) =>
          s.id === activeSession.id ? { ...s, messages: [...updatedMsgs, errMsg] } : s
        )
      );
    } finally {
      setLoading(false);
    }
  };

  // Direct Data Exports from Claude Interface (automatically logged to Export History!)
  const exportVfmCsvFromChat = () => {
    const headers = "well_name,date,oil_rate_stbd,water_rate_stbd,gas_rate_mscfd,water_cut_frac,gor_scf_stb\n";
    const rows = (latestPredictions || [])
      .map(
        (p: any) =>
          `${p.well_name},${p.date || "2025-09-30"},${Number(p.oil_rate_stbd || 0).toFixed(1)},${Number(
            p.water_rate_stbd || 0
          ).toFixed(1)},${Number(p.gas_rate_mscfd || 0).toFixed(1)},${Number(
            p.water_cut_frac || 0
          ).toFixed(3)},${Number(p.gor_scf_stb || 0).toFixed(1)}`
      )
      .join("\n");
    triggerClientDownload(
      `wellperf_vfm_10wells_${Date.now()}.csv`,
      headers + rows,
      "text/csv;charset=utf-8;",
      "CSV",
      "AI_CHAT",
      userEmail
    );
  };

  const exportPtaCsvFromChat = () => {
    const headers = "event_id,well_name,quality,permeability_md,skin,delta_p_skin_psi\n";
    const rows = (ptaEvents || [])
      .map((e: any) => {
        const p = e.properties || {};
        return `${e.event_id},${e.well_name},${p.interpretation_quality || p.iarf_quality},${Number(
          p.permeability_md || 0
        ).toFixed(2)},${Number(p.skin || 0).toFixed(2)},${Number(p.delta_p_skin_psi || 0).toFixed(1)}`;
      })
      .join("\n");
    triggerClientDownload(
      `wellperf_pta_diagnostics_${Date.now()}.csv`,
      headers + rows,
      "text/csv;charset=utf-8;",
      "CSV",
      "AI_CHAT",
      userEmail
    );
  };

  const exportSessionMarkdown = () => {
    const md = [
      `# WellPerf AI Engineering Session: ${activeSession.title}`,
      `Exported: ${new Date().toISOString()}`,
      ``,
      ...activeSession.messages.map(
        (m) => `### ${m.role === "user" ? "Engineer" : "WellPerf AI"} (${m.timestamp})\n${m.content}\n`
      ),
    ].join("\n");
    triggerClientDownload(
      `wellperf_ai_session_${activeSession.id}.md`,
      md,
      "text/markdown;charset=utf-8;",
      "MD",
      "AI_CHAT",
      userEmail
    );
  };

  const exportFullJsonFromChat = () => {
    const payload = JSON.stringify(
      {
        session: activeSession,
        fieldSnapshot: {
          wellsCount: 10,
          latestPredictions,
          ptaEvents: ptaEvents.map((e: any) => ({ event_id: e.event_id, well_name: e.well_name, properties: e.properties })),
          liftGasRanking,
        },
      },
      null,
      2
    );
    triggerClientDownload(
      `wellperf_intelligence_bundle_${Date.now()}.json`,
      payload,
      "application/json",
      "JSON",
      "AI_CHAT",
      userEmail
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-xl min-h-[640px]">
      {/* ================================================================= */}
      {/* LEFT SIDEBAR: CLAUDE SESSION HISTORY & DATA EXPORT ARTIFACTS      */}
      {/* ================================================================= */}
      <div className="lg:col-span-3 border-b lg:border-b-0 lg:border-r border-zinc-800 bg-zinc-900/40 flex flex-col justify-between p-3.5">
        <div className="space-y-3">
          {/* New Chat Button */}
          <button
            type="button"
            onClick={handleNewSession}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#155EEF] hover:bg-[#155EEF]/90 text-white py-2.5 px-3 text-xs font-semibold shadow-xs transition"
          >
            <Plus className="size-4" />
            <span>{t.ai_new_chat}</span>
          </button>

          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-1 pt-1">
            {t.ai_sessions} ({sessions.length})
          </div>

          {/* Sessions List */}
          <div className="space-y-1 max-h-[340px] overflow-y-auto pr-1">
            {sessions.map((sess) => {
              const active = sess.id === activeSession.id;
              return (
                <div
                  key={sess.id}
                  onClick={() => setActiveSessionId(sess.id)}
                  className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-xs cursor-pointer transition ${
                    active
                      ? "bg-zinc-950 text-zinc-100 border border-zinc-700 font-semibold shadow-2xs"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <MessageSquare className={`size-3.5 shrink-0 ${active ? "text-[#3B82F6]" : "text-zinc-500"}`} />
                    <div className="truncate">
                      <div className="truncate">{sess.title}</div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        {sess.messages.length} msg · {sess.updatedAt}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSession(sess.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/15 hover:text-red-400 transition"
                    title="Sil"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Claude Data Export Panel */}
        <div className="pt-3 border-t border-zinc-800 space-y-1.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-1">
            Claude Artifact & Data Export
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={exportVfmCsvFromChat}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 hover:border-[#3B82F6] px-2.5 py-1.5 text-[11px] font-medium text-zinc-200 transition"
            >
              <FileSpreadsheet className="size-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">{t.ai_export_csv}</span>
            </button>
            <button
              type="button"
              onClick={exportPtaCsvFromChat}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 hover:border-[#3B82F6] px-2.5 py-1.5 text-[11px] font-medium text-zinc-200 transition"
            >
              <FileSpreadsheet className="size-3.5 text-amber-400 shrink-0" />
              <span className="truncate">{t.ai_export_pta}</span>
            </button>
            <button
              type="button"
              onClick={exportSessionMarkdown}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 hover:border-[#3B82F6] px-2.5 py-1.5 text-[11px] font-medium text-zinc-200 transition"
            >
              <FileText className="size-3.5 text-[#3B82F6] shrink-0" />
              <span className="truncate">{t.ai_export_md}</span>
            </button>
            <button
              type="button"
              onClick={exportFullJsonFromChat}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 hover:border-[#3B82F6] px-2.5 py-1.5 text-[11px] font-medium text-zinc-200 transition"
            >
              <FileJson className="size-3.5 text-cyan-400 shrink-0" />
              <span className="truncate">{t.ai_export_json}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* RIGHT MAIN STAGE: CLAUDE INTERFACE WITH TYPING & ARTIFACT EXPORTS */}
      {/* ================================================================= */}
      <div className="lg:col-span-9 flex flex-col justify-between bg-zinc-950">
        {/* Top Claude Session Bar */}
        <div className="px-6 py-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/90">
          <div className="flex items-center gap-3">
            <img
              src="/ai-avatar.png"
              alt="WellPerf AI"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              className="size-8 rounded-full border border-[#3B82F6]/50 object-cover shadow-sm"
            />
            <div>
              <div className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <span>{activeSession.title}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-mono text-emerald-400 border border-emerald-500/30">
                  Gemini 2.5 Flash · Live
                </span>
              </div>
              <div className="text-xs text-zinc-400">
                10 Gas-Lift Wells · VFM (3.72% MAPE) · PTA (6 Events) · Export-Ready
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={exportSessionMarkdown}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 transition"
          >
            <Download className="size-3.5 text-[#3B82F6]" />
            <span>{t.ai_export_md}</span>
          </button>
        </div>

        {/* Message Stream */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-5 max-h-[460px]"
        >
          {activeSession.messages.map((m) => {
            const isTypingThis = typingMessageId === m.id;
            const displayedContent = isTypingThis ? typedText : m.content;

            return (
              <div
                key={m.id}
                className={`flex gap-3.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div className="size-8 rounded-full bg-[#155EEF]/20 border border-[#3B82F6]/40 shrink-0 flex items-center justify-center overflow-hidden mt-0.5">
                    <img
                      src="/ai-avatar.png"
                      alt="AI"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-3 ${
                    m.role === "user"
                      ? "bg-[#155EEF] text-white"
                      : "bg-zinc-900/80 border border-zinc-800 text-zinc-100"
                  }`}
                >
                  {m.role === "user" ? (
                    <div className="text-sm">{m.content}</div>
                  ) : (
                    <div className="space-y-1.5">
                      {renderClaudeMarkdown(displayedContent)}
                      {isTypingThis && (
                        <span className="inline-block w-2 h-4 bg-[#3B82F6] animate-pulse ml-1 align-middle" />
                      )}
                    </div>
                  )}

                  {/* Per-Message Action Bar (Copy & Instant Data Export) */}
                  {m.role === "assistant" && !isTypingThis && (
                    <div className="mt-3 pt-2 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
                      <span className="font-mono text-[10px]">
                        {m.timestamp} · {m.model || "wellperf-ai"}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(m.content);
                            setCopiedId(m.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          className="inline-flex items-center gap-1 hover:text-zinc-100 transition"
                        >
                          {copiedId === m.id ? (
                            <CheckCircle2 className="size-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                          <span>{copiedId === m.id ? "Copied" : "Copy"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={exportVfmCsvFromChat}
                          className="inline-flex items-center gap-1 text-[#3B82F6] hover:underline"
                        >
                          <Download className="size-3" />
                          <span>CSV</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex items-center gap-3 text-xs font-mono text-[#3B82F6] pl-2">
              <span className="size-2 rounded-full bg-[#3B82F6] animate-ping" />
              <span>WellPerf AI telemetriya və quyu modellərini analiz edir...</span>
            </div>
          )}
        </div>

        {/* Bottom Prompt Composer & Suggested Prompts */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/30 space-y-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <Sparkles className="size-3.5 text-[#3B82F6] shrink-0" />
            {(QUICK_PROMPTS[lang] || QUICK_PROMPTS.AZ).map((qp, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(qp)}
                className="shrink-0 rounded-full border border-zinc-800 bg-zinc-950 hover:border-[#3B82F6] px-3 py-1 text-xs text-zinc-300 hover:text-zinc-100 transition"
              >
                {qp}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2.5"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.ai_placeholder}
              className="flex-1 h-11 rounded-xl border border-zinc-800 bg-zinc-950 px-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-[#3B82F6] focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-11 px-5 rounded-xl bg-[#155EEF] hover:bg-[#155EEF]/90 disabled:opacity-40 text-white text-sm font-semibold flex items-center gap-2 shadow-xs transition"
            >
              <Send className="size-4" />
              <span>{t.ai_send}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
