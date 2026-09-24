import { useEffect, useState } from "react";
import { Mic, PhoneOff, Volume2 } from "lucide-react";
import { formatCallDuration } from "@/lib/chat-message";

export type CallState = "idle" | "calling" | "connected" | "ended";

export function VoiceCallScreen({
  name,
  avatar,
  state,
  startedAt,
  muted,
  speaker,
  onConnect,
  onToggleMute,
  onToggleSpeaker,
  onHangup,
}: {
  name: string;
  avatar: string;
  state: CallState;
  startedAt: number;
  muted: boolean;
  speaker: boolean;
  onConnect: () => void;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
  onHangup: () => void;
}) {
  return (
    <div className="voice-call-screen">
      <header>
        <span aria-hidden="true" />
        <span>模拟语音通话</span>
      </header>
      <main>
        <div className="voice-call-avatar">
          {avatar ? <img src={avatar} alt={name} /> : <span>{name.charAt(0)}</span>}
        </div>
        <h1>{name}</h1>
        <CallStatus state={state} startedAt={startedAt} />
        <small>当前未接入实时 AI 语音</small>
        {state === "calling" && (
          <button type="button" className="voice-call-connect" onClick={onConnect}>
            进入模拟通话
          </button>
        )}
      </main>
      <footer>
        <button type="button" className={muted ? "is-active" : ""} onClick={onToggleMute}>
          <Mic size={22} />
          <span>静音</span>
        </button>
        <button type="button" className={speaker ? "is-active" : ""} onClick={onToggleSpeaker}>
          <Volume2 size={22} />
          <span>扬声器</span>
        </button>
        <button type="button" className="voice-call-end" onClick={onHangup}>
          <PhoneOff size={24} />
          <span>挂断</span>
        </button>
      </footer>
    </div>
  );
}

function CallStatus({ state, startedAt }: { state: CallState; startedAt: number }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (state !== "connected") {
      setSeconds(0);
      return;
    }
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [startedAt, state]);
  return (
    <p>
      {state === "calling"
        ? "正在呼叫…"
        : state === "connected"
          ? formatCallDuration(seconds)
          : "通话已结束"}
    </p>
  );
}
