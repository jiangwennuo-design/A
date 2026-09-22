/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, History, Pause, Play, RotateCcw, Sparkles, TimerReset } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { resolveAvatarUrl } from "@/lib/avatar";
import { generateFocusCompanionMessage } from "@/lib/companion.functions";
import type { AiPersona, FocusSession } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/focus")({
  head: () => ({ meta: [{ title: "番茄钟 · 此心一笺" }] }),
  component: FocusPage,
});

type Mode = "focus" | "short_break" | "long_break";
const modeLabels: Record<Mode, string> = {
  focus: "专注",
  short_break: "短休息",
  long_break: "长休息",
};
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
  const [remaining, setRemaining] = useState(defaults.focus * 60);
  const [state, setState] = useState<"idle" | "running" | "paused">("idle");
  const [endAt, setEndAt] = useState(0);
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
  const progress = totalSeconds ? Math.min(1, Math.max(0, 1 - remaining / totalSeconds)) : 0;

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: chars }, { data: sessions }] = await Promise.all([
      supabase.from("ai_personas").select("*").eq("user_id", user.id).order("name"),
      (supabase as any)
        .from("focus_sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setPersonas((chars || []) as AiPersona[]);
    setHistory((sessions || []) as FocusSession[]);
    if (!charId && chars?.[0]) setCharId(chars[0].id);
  }, [user, charId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void resolveAvatarUrl(selectedChar?.avatar_url).then(setAvatar);
  }, [selectedChar?.avatar_url]);
  useEffect(() => {
    if (state === "idle") setRemaining(durations[mode] * 60);
  }, [mode, durations, state]);

  useEffect(() => {
    if (state !== "running") return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [state, endAt]);

  const finish = useCallback(async () => {
    if (!user || completing.current || state !== "running" || remaining > 0) return;
    completing.current = true;
    setState("idle");
    if (sessionId) {
      await (supabase as any)
        .from("focus_sessions")
        .update({
          status: "completed",
          elapsed_seconds: totalSeconds,
          completed_at: new Date().toISOString(),
        })
        .eq("id", sessionId)
        .eq("user_id", user.id);
    }
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(`${modeLabels[mode]}结束`, { body: "辛苦了，回来看看陪伴角色吧。" });
    }
    try {
      const audio = new Audio(
        "data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAAAA////AAAA////AAAA////",
      );
      void audio.play().catch(() => undefined);
    } catch {
      /* notification remains available */
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
    completing.current = false;
  }, [charId, companion, durations, load, mode, remaining, sessionId, state, totalSeconds, user]);

  useEffect(() => {
    void finish();
  }, [finish]);

  async function start() {
    if (!user) return;
    setError("");
    setMessage("");
    const seconds = durations[mode] * 60;
    const { data, error: insertError } = await (supabase as any)
      .from("focus_sessions")
      .insert({
        user_id: user.id,
        char_id: charId || null,
        mode,
        planned_seconds: seconds,
        status: "running",
      })
      .select("*")
      .single();
    if (insertError) {
      setError("无法开始计时，请确认数据库已更新。");
      return;
    }
    setSessionId(data.id);
    setRemaining(seconds);
    setEndAt(Date.now() + seconds * 1000);
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
    setRemaining(Math.max(0, Math.ceil((endAt - Date.now()) / 1000)));
    setState("paused");
    if (sessionId)
      await (supabase as any)
        .from("focus_sessions")
        .update({ elapsed_seconds: totalSeconds - remaining })
        .eq("id", sessionId);
  }

  function resume() {
    setEndAt(Date.now() + remaining * 1000);
    setState("running");
  }

  async function reset() {
    if (sessionId && user)
      await (supabase as any)
        .from("focus_sessions")
        .update({ status: "reset", elapsed_seconds: totalSeconds - remaining })
        .eq("id", sessionId)
        .eq("user_id", user.id);
    setState("idle");
    setSessionId("");
    setMessage("");
    setRemaining(totalSeconds);
    await load();
  }

  function updateDuration(value: number) {
    const next = { ...durations, [mode]: Math.min(240, Math.max(1, value || 1)) };
    setDurations(next);
    localStorage.setItem("cxyj-focus-durations", JSON.stringify(next));
  }

  const timeText = useMemo(
    () =>
      `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`,
    [remaining],
  );

  return (
    <main className="focus-page fade-in">
      <header className="focus-header">
        <button type="button" onClick={() => navigate({ to: "/" })}>
          <ArrowLeft size={21} />
        </button>
        <h1>番茄钟</h1>
        <TimerReset size={21} />
      </header>
      <div className="focus-modes">
        {(Object.keys(modeLabels) as Mode[]).map((item) => (
          <button
            key={item}
            type="button"
            className={mode === item ? "is-active" : ""}
            disabled={state !== "idle"}
            onClick={() => setMode(item)}
          >
            {modeLabels[item]}
          </button>
        ))}
      </div>

      <section
        className="focus-clock"
        style={{ "--progress": `${progress * 360}deg` } as CSSProperties}
      >
        <div>
          <strong>{timeText}</strong>
          <span>
            {state === "running"
              ? "专心做眼前的一件事"
              : state === "paused"
                ? "已暂停"
                : "准备好就开始"}
          </span>
        </div>
      </section>

      <div className="focus-duration">
        <label>
          本轮分钟{" "}
          <input
            type="number"
            min={1}
            max={240}
            value={durations[mode]}
            disabled={state !== "idle"}
            onChange={(event) => updateDuration(Number(event.target.value))}
          />
        </label>
      </div>

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
        <button
          type="button"
          onClick={() => void reset()}
          disabled={state === "idle" && remaining === totalSeconds}
        >
          <RotateCcw size={19} />
          重置
        </button>
      </div>
      {error && <p className="focus-error">{error}</p>}

      <section className="focus-history">
        <h2>
          <History size={18} />
          专注记录
        </h2>
        {history.length === 0 ? (
          <p className="focus-history__empty">完成一轮后，记录会出现在这里。</p>
        ) : (
          history.map((item) => (
            <div key={item.id} className="focus-history__row">
              <div>
                <strong>{modeLabels[item.mode]}</strong>
                <span>
                  {new Date(item.created_at).toLocaleString("zh-CN", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <b>
                {Math.round(item.elapsed_seconds / 60)} / {Math.round(item.planned_seconds / 60)}{" "}
                分钟
              </b>
              <em className={`status-${item.status}`}>
                {item.status === "completed"
                  ? "完成"
                  : item.status === "reset"
                    ? "已重置"
                    : "未结束"}
              </em>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
