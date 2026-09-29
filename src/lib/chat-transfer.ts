export type TransferStatus = "pending" | "received" | "refunded";
export interface TransferData {
  transferId: string;
  sender: string;
  receiver: string;
  amount: number;
  remark: string;
  status: TransferStatus;
  createdAt: string;
}

export function transferStatus(value: unknown): TransferStatus {
  if (value === "received" || value === "accepted") return "received";
  if (value === "refunded" || value === "returned") return "refunded";
  return "pending";
}

export function transferStatusLabel(status: TransferStatus) {
  return status === "received" ? "已收款" : status === "refunded" ? "已退还" : "待收款";
}

export function transferAmount(value: unknown) {
  const amount = Number(value);
  const rounded = Math.round(amount * 100) / 100;
  if (!Number.isFinite(amount) || rounded <= 0 || amount > 999999.99)
    throw new Error("请输入有效的转账金额。");
  return rounded;
}

export function createTransfer(
  sender: string,
  receiver: string,
  amount: unknown,
  remark: unknown,
): TransferData {
  return {
    transferId: crypto.randomUUID(),
    sender,
    receiver,
    amount: transferAmount(amount),
    remark: typeof remark === "string" ? remark.trim().slice(0, 100) : "",
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

// Historical cards used note/accepted/returned and had no transfer identifiers.
export function readTransfer(
  message: {
    id: string;
    role: "user" | "assistant";
    created_at: string;
    payload?: unknown;
  },
  userId = "user",
  charId = "char",
): TransferData {
  const p = (message.payload ?? {}) as Record<string, unknown>;
  return {
    transferId: typeof p["transferId"] === "string" ? p["transferId"] : message.id,
    sender: message.role === "user" ? userId : charId,
    receiver: message.role === "user" ? charId : userId,
    amount: Number(p["amount"] ?? 0),
    remark: String(p["remark"] ?? p["note"] ?? ""),
    status: transferStatus(p["status"]),
    createdAt: typeof p["createdAt"] === "string" ? p["createdAt"] : message.created_at,
  };
}
