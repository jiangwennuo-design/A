import { useState, type FormEvent } from "react";
import { SystemSheet } from "@/components/system-ui";

export function TransferSheet({
  open,
  onClose,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (amount: number, note: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const numeric = Number(amount);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    onSend(numeric, note.trim());
    setAmount("");
    setNote("");
  }
  return (
    <SystemSheet open={open} title="转账" onClose={onClose}>
      <form onSubmit={submit} className="transfer-form">
        <label>
          <span>转账金额</span>
          <div>
            <b>¥</b>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
            />
          </div>
        </label>
        <label>
          <span>备注</span>
          <input
            value={note}
            maxLength={100}
            onChange={(event) => setNote(event.target.value)}
            placeholder="说点什么"
          />
        </label>
        <button className="btn-primary w-full" disabled={!Number.isFinite(numeric) || numeric <= 0}>
          确认转账
        </button>
      </form>
    </SystemSheet>
  );
}
