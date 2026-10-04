import { useEffect, useRef } from "react";
import { AudioLines, ImagePlus, RotateCcw, Smile, WalletCards } from "lucide-react";

export function AttachmentSheet({
  open,
  canReroll,
  onClose,
  onImage,
  onStickers,
  onTransfer,
  onReroll,
  onVoice,
}: {
  open: boolean;
  canReroll: boolean;
  onClose: () => void;
  onImage: (file: File) => void;
  onStickers: () => void;
  onTransfer: () => void;
  onReroll: () => void;
  onVoice: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose]);
  function choose(action: () => void) {
    onClose();
    action();
  }
  return (
    <>
      <input
        ref={input}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImage(file);
          event.currentTarget.value = "";
        }}
      />
      {open && (
        <>
          <div
            className="chat-attachment-popover"
            data-ui="attachment-menu"
            role="dialog"
            aria-label="聊天工具"
          >
            <button
              type="button"
              data-ui="attachment-image"
              onClick={() => choose(() => input.current?.click())}
            >
              <ImagePlus size={22} />
              <span>图片</span>
            </button>
            <button type="button" data-ui="attachment-sticker" onClick={() => choose(onStickers)}>
              <Smile size={22} />
              <span>表情包</span>
            </button>
            <button type="button" data-ui="attachment-transfer" onClick={() => choose(onTransfer)}>
              <WalletCards size={22} />
              <span>转账</span>
            </button>
            <button type="button" data-ui="attachment-voice" onClick={() => choose(onVoice)}>
              <AudioLines size={22} />
              <span>发送语音</span>
            </button>
            <button
              type="button"
              data-ui="attachment-reroll"
              disabled={!canReroll}
              onClick={() => choose(onReroll)}
            >
              <RotateCcw size={22} />
              <span>重新生成</span>
            </button>
          </div>
        </>
      )}
    </>
  );
}
