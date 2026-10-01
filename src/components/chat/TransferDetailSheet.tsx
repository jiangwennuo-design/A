import { ArrowDownLeft, Check, Undo2 } from "lucide-react";
import { SystemSheet } from "@/components/system-ui";
import { readTransfer, transferStatusLabel, type TransferStatus } from "@/lib/chat-transfer";
import type { ChatMessage } from "@/lib/types";

export function TransferDetailSheet({
  message,
  userName,
  charName,
  saving,
  error,
  onClose,
  onSettle,
}: {
  message: ChatMessage | null;
  userName: string;
  charName: string;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSettle: (status: Exclude<TransferStatus, "pending">) => void;
}) {
  if (!message) return null;
  const transfer = readTransfer(message);
  const receivedByUser = message.role === "assistant";
  const canSettle =
    receivedByUser && transfer.status === "pending" && message.delivery_status === "sent";
  return (
    <SystemSheet open title="转账详情" onClose={onClose} scrollable>
      <div className={`transfer-detail is-${transfer.status}`} data-ui="transfer-detail">
        <span className="transfer-detail__icon">
          <ArrowDownLeft size={30} />
        </span>
        <strong>¥ {transfer.amount.toFixed(2)}</strong>
        <p>{transfer.remark || "转账"}</p>
        <span className="transfer-detail__status">{transferStatusLabel(transfer.status)}</span>
        <dl>
          <div>
            <dt>转账方</dt>
            <dd>{receivedByUser ? charName : userName}</dd>
          </div>
          <div>
            <dt>收款方</dt>
            <dd>{receivedByUser ? userName : charName}</dd>
          </div>
          <div>
            <dt>转账时间</dt>
            <dd>{new Date(transfer.createdAt).toLocaleString("zh-CN")}</dd>
          </div>
        </dl>
        {canSettle && (
          <div className="transfer-detail__actions">
            <button
              type="button"
              data-ui="transfer-receive"
              disabled={saving}
              onClick={() => onSettle("received")}
            >
              <Check size={18} />
              {saving ? "处理中…" : "确认收款"}
            </button>
            <button
              type="button"
              data-ui="transfer-refund"
              disabled={saving}
              onClick={() => onSettle("refunded")}
            >
              <Undo2 size={18} />
              退还
            </button>
          </div>
        )}
        {!receivedByUser && transfer.status === "pending" && (
          <p className="transfer-detail__hint">等待对方处理</p>
        )}
        {error && (
          <p role="alert" className="transfer-detail__error">
            {error}
          </p>
        )}
      </div>
    </SystemSheet>
  );
}
