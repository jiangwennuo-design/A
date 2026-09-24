/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Pause, Play, RotateCcw, Sparkles, TimerReset } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { closeSystemApp } from "@/lib/app-transition";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatarUrl } from "@/lib/avatar";
import { generateFocusCompanionMessage } from "@/lib/companion.functions";
import { randomFocusQuote } from "@/data/focusQuotes";
import { FocusTimer } from "@/components/focus/FocusTimer";
import { FocusHistory } from "@/components/focus/FocusHistory";
import type { AiPersona, FocusSession } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/focus")({
  head: () => ({ meta: [{ title: "番茄钟 · K得机" }] }),
  component: FocusPage,
});
type Mode = "focus" | "short_break" | "long_break";
type TimerState = "idle" | "running" | "paused";
const labels: Record<Mode, string> = { focus: "专注", short_break: "短休息", long_break: "长休息" };
const defaults: Record<Mode, number> = { focus: 25, short_break: 5, long_break: 15 };

function FocusPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const companion = useServerFn(generateFocusCompanionMessage);
  const [mode, setMode] = useState<Mode>("focus");
  const [durations, setDurations] = useState<Record<Mode, number>>(() => {
    if (typeof window === "undefined") return defaults;
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem("cxyj-focus-durations") || "{}") };
    } catch {
      return defaults;
    }
  });
  const [title, setTitle] = useState("");
  const [quote, setQuote] = useState(randomFocusQuote());
  const [state, setState] = useState<TimerState>("idle");
  const [endAt, setEndAt] = useState(0);
  const [pausedSeconds, setPausedSeconds] = useState(defaults.focus * 60);
  const [sessionId, setSessionId] = useState("");
  const [personas, setPersonas] = useState<AiPersona[]>([]);
  const [charId, setCharId] = useState("");
  const [avatar, setAvatar] = useState("");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<FocusSession[]>([]);
  const [error, setError] = useState("");
  const completing = useRef(false);
  const selectedChar = personas.find((char) => char.id === charId);
  const totalSeconds = durations[mode] * 60;

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: chars }, { data: sessions }] = await Promise.all([
      supabase.from("ai_personas").select("*").eq("user_id", user.id).order("name"),
      (supabase as any)
        .from("focus_sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    setPersonas((chars || []) as AiPersona[]);
    setHistory(
      ((sessions || []) as FocusSession[]).map((item) => ({
        ...item,
        title: item.title || "",
        quote: item.quote || "",
        target_end_at: item.target_end_at || null,
      })),
    );
    setCharId((current) => current || chars?.[0]?.id || "");
  }, [user]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let alive = true;
    void resolveAvatarUrl(selectedChar?.avatar_url).then((url) => {
      if (alive) setAvatar(url);
    });
    return () => {
      alive = false;
    };
  }, [selectedChar?.avatar_url]);
  useEffect(() => {
    if (state === "idle") setPausedSeconds(totalSeconds);
  }, [state, totalSeconds]);

  const finish = useCallback(async () => {
    if (!user || completing.current || state !== "running") return;
    completing.current = true;
    setState("idle");
    if (sessionId)
      await (supabase as any)
        .from("focus_sessions")
        .update({
          status: "completed",
          elapsed_seconds: totalSeconds,
          completed_at: new Date().toISOString(),
        })
        .eq("id", sessionId)
        .eq("user_id", user.id);
    if ("Notification" in window && Notification.permission === "granted")
      new Notification(`${labels[mode]}结束`, { body: title.trim() || "这一轮已完成。" });
    try {
      void new Audio(
        "data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAAAA////AAAA////AAAA////",
      )
        .play()
        .catch(() => undefined);
    } catch {
      /* notification remains */
    }
    if (charId) {
      try {
        const result = await companion({
          data: { char_id: charId, mode, event: "finish", minutes: durations[mode] },
        });
        setMessage(result.message);
        if (sessionId)
          await (supabase as any)
            .from("focus_sessions")
            .update({ end_message: result.message })
            .eq("id", sessionId);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "角色暂时没有回应。");
      }
    }
    await load();
    setSessionId("");
    completing.current = false;
  }, [charId, companion, durations, load, mode, sessionId, state, title, totalSeconds, user]);

  async function start() {
    if (!user) return;
    setError("");
    setMessage("");
    const seconds = durations[mode] * 60;
    const nextQuote = randomFocusQuote(quote);
    const nextTitle = title.trim() || labels[mode];
    const target = new Date(Date.now() + seconds * 1_000).toISOString();
    const { data, error: insertError } = await (supabase as any)
      .from("focus_sessions")
      .insert({
        user_id: user.id,
        char_id: charId || null,
        mode,
        title: nextTitle,
        quote: nextQuote,
        planned_seconds: seconds,
        status: "running",
        target_end_at: target,
      })
      .select("*")
      .single();
    if (insertError || !data) return setError("无法开始计时，请确认数据库已更新。");
    setSessionId(data.id);
    setQuote(nextQuote);
    setPausedSeconds(seconds);
    setEndAt(new Date(target).getTime());
    setState("running");
    if ("Notification" in window && Notification.permission === "default")
      void Notification.requestPermission();
    if (charId) {
      try {
        const result = await companion({
          data: { char_id: charId, mode, event: "start", minutes: durations[mode] },
        });
        setMessage(result.message);
        await (supabase as any)
          .from("focus_sessions")
          .update({ start_message: result.message })
          .eq("id", data.id);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "计时已开始，但角色暂时没有回应。");
      }
    }
  }
  async function pause() {
    const next = Math.max(0, Math.ceil((endAt - Date.now()) / 1_000));
    setPausedSeconds(next);
    setState("paused");
    if (sessionId)
      await (supabase as any)
        .from("focus_sessions")
        .update({ elapsed_seconds: totalSeconds - next, target_end_at: null })
        .eq("id", sessionId);
  }
  function resume() {
    const target = Date.now() + pausedSeconds * 1_000;
    setEndAt(target);
    setState("running");
    if (sessionId)
      void (supabase as any)
        .from("focus_sessions")
        .update({ target_end_at: new Date(target).toISOString() })
        .eq("id", sessionId);
  }
  async function reset() {
    const remaining =
      state === "running" ? Math.max(0, Math.ceil((endAt - Date.now()) / 1_000)) : pausedSeconds;
    if (sessionId && user)
      await (supabase as any)
        .from("focus_sessions")
        .update({
          status: "reset",
          elapsed_seconds: totalSeconds - remaining,
          completed_at: new Date().toISOString(),
          target_end_at: null,
        })
        .eq("id", sessionId)
        .eq("user_id", user.id);
    setState("idle");
    setSessionId("");
    setMessage("");
    setPausedSeconds(totalSeconds);
    await load();
  }
  function updateDuration(nextMode: Mode, value: number) {
    const next = { ...durations, [nextMode]: Math.min(240, Math.max(1, value || 1)) };
    setDurations(next);
    localStorage.setItem("cxyj-focus-durations", JSON.stringify(next));
  }
  async function deleteHistory(id: string) {
    if (!confirm("删除这条专注记录？")) return;
    const { error: deleteError } = await (supabase as any)
      .from("focus_sessions")
      .delete()
      .eq("id", id)
      .eq("user_id", user?.id);
    if (deleteError) return setError("删除失败。");
    setHistory((current) => current.filter((item) => item.id !== id));
  }
  async function clearHistory() {
    if (!user) return;
    if (state !== "idle") return setError("请先结束当前计时，再清除历史记录。");
    if (!confirm("清除所有专注记录？\n\n此操作无法撤销。")) return;
    const { error: clearError } = await (supabase as any)
      .from("focus_sessions")
      .delete()
      .eq("user_id", user.id);
    if (clearError) return setError("清除失败。");
    setHistory([]);
  }

  const companionView = useMemo(
    () => (
      <section className="focus-companion">
        <div className="focus-companion__person">
          <span className="focus-companion__avatar">
            {avatar ? (
              <img src={avatar} alt={selectedChar?.name || "陪伴角色"} />
            ) : (
              (selectedChar?.name || "伴").charAt(0)
            )}
          </span>
          <div>
            <small>陪伴角色</small>
            <select
              value={charId}
              disabled={state !== "idle"}
              onChange={(event) => setCharId(event.target.value)}
            >
              <option value="">独自专注</option>
              {personas.map((char) => (
                <option key={char.id} value={char.id}>
                  {char.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {message && (
          <p>
            <Sparkles size={14} /> {message}
          </p>
        )}
      </section>
    ),
    [avatar, charId, message, personas, selectedChar?.name, state],
  );
  return (
    <main className="focus-page focus-app fade-in">
      <header className="focus-header">
        <button
          type="button"
          onClick={() => void closeSystemApp("focus", () => navigate({ to: "/" }))}
        >
          <ArrowLeft size={21} />
        </button>
        <h1>番茄钟</h1>
        <TimerReset size={21} />
      </header>
      <div className="focus-modes">
        {(Object.keys(labels) as Mode[]).map((item) => (
          <button
            key={item}
            type="button"
            className={mode === item ? "is-active" : ""}
            disabled={state !== "idle"}
            onClick={() => setMode(item)}
          >
            {labels[item]}
          </button>
        ))}
      </div>
      <section className="focus-task">
        <label>
          本次专注
          <input
            value={title}
            disabled={state !== "idle"}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="准备做什么？"
          />
        </label>
      </section>
      <div className="focus-immersive">
        <p className="focus-landscape-title">{title.trim() || labels[mode]}</p>
        <FocusTimer
          state={state}
          endAt={endAt}
          totalSeconds={totalSeconds}
          pausedSeconds={pausedSeconds}
          onComplete={() => void finish()}
        />
        <blockquote>{quote}</blockquote>
        {selectedChar && (
          <span className="focus-landscape-char">
            {avatar ? <img src={avatar} alt="" /> : selectedChar.name.charAt(0)}
            <small>{selectedChar.name} 在这里</small>
          </span>
        )}
      </div>
      <div className="focus-controls">
        {state === "idle" && (
          <button type="button" className="primary" onClick={() => void start()}>
            <Play size={20} fill="currentColor" />
            开始
          </button>
        )}
        {state === "running" && (
          <button type="button" className="primary" onClick={() => void pause()}>
            <Pause size={20} fill="currentColor" />
            暂停
          </button>
        )}
        {state === "paused" && (
          <button type="button" className="primary" onClick={resume}>
            <Play size={20} fill="currentColor" />
            继续
          </button>
        )}
        <button type="button" onClick={() => void reset()} disabled={state === "idle"}>
          <RotateCcw size={19} />
          结束
        </button>
      </div>
      {error && <p className="focus-error">{error}</p>}
      <div className="focus-portrait-only">
        {companionView}
        <section className="focus-settings">
          <h2>计时设置</h2>
          {(Object.keys(labels) as Mode[]).map((item) => (
            <label key={item}>
              <span>{labels[item]}</span>
              <input
                type="number"
                min={1}
                max={240}
                value={durations[item]}
                disabled={state !== "idle"}
                onChange={(event) => updateDuration(item, Number(event.target.value))}
              />
              <small>min</small>
            </label>
          ))}
        </section>
        <FocusHistory
          sessions={history}
          onDelete={(id) => void deleteHistory(id)}
          onClear={() => void clearHistory()}
        />
      </div>
    </main>
  );
}
