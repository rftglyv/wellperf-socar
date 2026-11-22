"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Copy, CornerDownLeft, KeyRound, MessageSquareText, Plus, Sparkles, Square } from "lucide-react";
import { ENGINE_URL, engineGet } from "./api";
import { usePrefs } from "./prefs";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupTextarea } from "@/components/ui/input-group";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";

/** Open the assistant from anywhere (header button, tour). */
export const openAiChat = () => window.dispatchEvent(new Event("wp-chat-open"));

type Msg = { role: "user" | "assistant"; content: string; error?: boolean };
const STORE = "wp_chat_v1";

/** Minimal, safe markdown: headings, bullets, numbered lists, **bold**, `code`. */
function Md({ text }: { text: string }) {
  const inline = (s: string, k: string) =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? (
        <strong key={k + i}>{p.slice(2, -2)}</strong>
      ) : p.startsWith("`") && p.endsWith("`") ? (
        <code key={k + i}>{p.slice(1, -1)}</code>
      ) : (
        <React.Fragment key={k + i}>{p}</React.Fragment>
      )
    );
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list.ordered ? "ol" : "ul";
    blocks.push(
      <L key={"l" + blocks.length}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it, `li${blocks.length}-${i}`)}</li>
        ))}
      </L>
    );
    list = null;
  };
  text.split("\n").forEach((raw, i) => {
    const line = raw.trimEnd();
    const b = line.match(/^\s*[*-]\s+(.*)$/);
    const n = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (b || n) {
      const ordered = !!n;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((b || n)![1]);
      return;
    }
    flush();
    if (!line.trim()) return;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) blocks.push(<h4 key={i}>{inline(h[1], "h" + i)}</h4>);
    else blocks.push(<p key={i}>{inline(line, "p" + i)}</p>);
  });
  flush();
  return <>{blocks}</>;
}

export function AiChat() {
  const { t, lang } = usePrefs();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE) || "[]");
      if (Array.isArray(saved)) setMsgs(saved);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-40)));
    } catch {}
  }, [msgs]);
  useEffect(() => {
    if (open && configured === null)
      engineGet("/api/chat/status")
        .then((s) => setConfigured(!!s.configured))
        .catch(() => setConfigured(false));
  }, [open, configured]);

  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: "end" });
  }, [msgs, busy, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("wp-chat-open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wp-chat-open", onOpen);
    };
  }, []);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    const history: Msg[] = [...msgs.filter((m) => !m.error), { role: "user", content: q }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    let acc = "";
    const put = (content: string, error = false) =>
      setMsgs((cur) => {
        const next = [...cur];
        next[next.length - 1] = { role: "assistant", content, error };
        return next;
      });
    try {
      const res = await fetch(`${ENGINE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, messages: history.map(({ role, content }) => ({ role, content })) }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() || "";
        for (const ev of events) {
          const line = ev.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const d = JSON.parse(line.slice(5));
          if (d.model) setModel(d.model);
          if (d.text) {
            acc += d.text;
            put(acc);
          }
          if (d.error) throw new Error(d.error);
        }
      }
      if (!acc) put(t("chat_empty"), true);
    } catch (e: any) {
      if (e.name === "AbortError") put(acc || t("chat_stopped"), !acc);
      else put(acc ? `${acc}\n\n— ${e.message}` : `${t("chat_error")} ${e.message}`, !acc);
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const suggestions = [t("chat_s1"), t("chat_s2"), t("chat_s3")];

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            document.getElementById("wp-chat-input")?.focus();
          }}
        >
          <SheetHeader className="flex-row items-center gap-2 border-b pr-12">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <SheetTitle>{t("chat_title")}</SheetTitle>
                {configured !== null && (
                  <Badge variant={configured ? "success" : "warning"} className="font-normal">
                    <span className="size-1.5 rounded-full bg-current" />
                    {configured ? (model ?? "Gemini") : lang === "az" ? "qoşulmayıb" : lang === "ru" ? "не подключён" : "not connected"}
                  </Badge>
                )}
              </div>
              <SheetDescription className="truncate text-xs">{t("chat_sub")}</SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => !busy && setMsgs([])}
              title={t("chat_new")}
              aria-label={t("chat_new")}
              disabled={busy || !msgs.length}
            >
              <Plus />
            </Button>
          </SheetHeader>

          <ScrollArea className="min-h-0 flex-1">
            {msgs.length === 0 ? (
              <Empty className="h-full border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MessageSquareText />
                  </EmptyMedia>
                  <EmptyTitle>{t("chat_hello")}</EmptyTitle>
                  <EmptyDescription>{t("chat_intro")}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent className="max-w-sm">
                  {configured === false && (
                    <Alert className="text-left">
                      <KeyRound />
                      <AlertTitle>{lang === "az" ? "Assistent qoşulmayıb" : lang === "ru" ? "Ассистент не подключён" : "Assistant not connected"}</AlertTitle>
                      <AlertDescription>
                        <span>
                          {lang === "az" ? "Açarı əlavə edin və engine-i yenidən başladın:" : lang === "ru" ? "Добавьте ключ и перезапустите движок:" : "Add the key and restart the engine:"}
                        </span>
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">engine/.env → GEMINI_API_KEY</code>
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="flex w-full flex-col gap-1.5">
                    {suggestions.map((s) => (
                      <Button
                        key={s}
                        variant="ghost"
                        className="h-auto justify-start gap-2.5 rounded-lg border px-3 py-2.5 text-left font-normal whitespace-normal"
                        onClick={() => send(s)}
                        disabled={configured === false}
                      >
                        <Sparkles className="text-muted-foreground" />
                        {s}
                      </Button>
                    ))}
                  </div>
                </EmptyContent>
              </Empty>
            ) : (
              <div className="flex flex-col gap-4 p-4">
                {msgs.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-sm whitespace-pre-wrap">
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <div
                      key={i}
                      className={cn(
                        "group flex flex-col gap-2 text-sm leading-relaxed",
                        m.error && "text-destructive",
                        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs",
                        "[&_h4]:font-semibold [&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-1 [&_ol]:pl-5",
                        "[&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1 [&_ul]:pl-5"
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <span className="flex size-5 items-center justify-center rounded-md bg-primary text-primary-foreground">
                          <Sparkles className="size-3" />
                        </span>
                        WellPerf AI
                      </span>
                      {m.content ? (
                        <Md text={m.content} />
                      ) : (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Spinner />
                        </span>
                      )}
                      {m.content && !m.error && !(busy && i === msgs.length - 1) && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="self-start text-muted-foreground"
                          aria-label="Copy"
                          onClick={() => {
                            navigator.clipboard?.writeText(m.content);
                            setCopied(i);
                            setTimeout(() => setCopied(null), 1400);
                          }}
                        >
                          {copied === i ? <Check /> : <Copy />}
                        </Button>
                      )}
                    </div>
                  )
                )}
                <div ref={end} />
              </div>
            )}
          </ScrollArea>

          <form
            className="flex flex-col gap-2 border-t p-4"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <InputGroup>
              <InputGroupTextarea
                id="wp-chat-input"
                rows={1}
                className="max-h-40 min-h-16"
                value={input}
                placeholder={t("chat_placeholder")}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <InputGroupAddon align="block-end">
                <InputGroupText className="gap-1 text-xs">
                  <Kbd>
                    <CornerDownLeft />
                  </Kbd>
                  {t("chat_send")}
                </InputGroupText>
                {busy && (
                  <InputGroupText>
                    <Spinner />
                  </InputGroupText>
                )}
                {busy ? (
                  <InputGroupButton
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    className="ml-auto"
                    onClick={() => abort.current?.abort()}
                    aria-label={t("chat_stop")}
                  >
                    <Square fill="currentColor" />
                  </InputGroupButton>
                ) : (
                  <InputGroupButton
                    type="submit"
                    variant="default"
                    size="icon-xs"
                    className="ml-auto"
                    disabled={!input.trim() || configured === false}
                    aria-label={t("chat_send")}
                  >
                    <ArrowUp />
                  </InputGroupButton>
                )}
              </InputGroupAddon>
            </InputGroup>
            <p className="text-center text-xs text-muted-foreground">{t("chat_foot")}</p>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
