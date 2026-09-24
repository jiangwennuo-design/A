import { useRef } from "react";
import { ImagePlus, RotateCcw, WalletCards } from "lucide-react";
import { SystemSheet } from "@/components/system-ui";

export function AttachmentSheet({
  open,
  canReroll,
  onClose,
  onImage,
  onTransfer,
  onReroll,
}: {
  open: boolean;
  canReroll: boolean;
  onClose: () => void;
  onImage: (file: File) => void;
  onTransfer: () => void;
  onReroll: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <SystemSheet open={open} title="聊天工具" description="发送图片或虚拟转账" onClose={onClose}>
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
      <div className="attachment-grid">
        <button type="button" onClick={() => input.current?.click()}>
          <ImagePlus size={22} />
          <span>图片</span>
        </button>
        <button type="button" onClick={onTransfer}>
          <WalletCards size={22} />
          <span>模拟转账</span>
        </button>
        <button type="button" disabled={!canReroll} onClick={onReroll}>
          <RotateCcw size={22} />
          <span>重新生成</span>
        </button>
      </div>
    </SystemSheet>
  );
}
