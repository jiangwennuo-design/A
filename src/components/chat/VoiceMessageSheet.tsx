import { useState, type FormEvent } from "react";
import { AudioLines } from "lucide-react";
import { SystemSheet } from "@/components/system-ui";
import { voiceDuration } from "@/lib/chat-message";

export function VoiceMessageSheet({
  open,
  disabled,
  onClose,
  onSend,
}: {
  open: boolean;
  disabled: boolean;
  onClose: () => void;
  onSend: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || busy || disabled) return;
    setBusy(true);
    setError("");
    try {
      if (await onSend(text.trim())) {
        setText("");
        onClose();
      } else setError("发送未成功，文字已保留；请重试或在聊天中重试原消息。");
    } catch {
      setError("发送失败，文字已保留。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SystemSheet
      open={open}
      title="发送语音"
      onClose={() => {
        if (!busy) onClose();
      }}
      scrollable
    >
      <form className="chat-voice-form" data-ui="voice-form" onSubmit={submit}>
        <label>
          <span>语音文字</span>
          <textarea
            aria-label="语音文字"
            value={text}
            maxLength={8000}
            rows={5}
            placeholder="输入想说的话…"
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <small>
          {Array.from(text).length} 字 · 约 {voiceDuration(text)} 秒
        </small>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy || disabled || !text.trim()}>
          <AudioLines size={18} />
          {busy ? "发送中…" : "发送语音"}
        </button>
      </form>
    </SystemSheet>
  );
}
