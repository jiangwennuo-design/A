import { createTransfer, readTransfer, type TransferStatus } from "./chat-transfer";

// Use the existing message JSONB and owner RLS; no extra table or migration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
export interface TransferAction {
  type: "send" | "received" | "refunded";
  transferId?: string;
  amount?: number;
  remark?: string;
}

export async function settleChatTransfer(
  db: Db,
  userId: string,
  sessionId: string,
  charId: string,
  messageId: string,
  actor: "user" | "char",
  status: Exclude<TransferStatus, "pending">,
) {
  if (status !== "received" && status !== "refunded") throw new Error("转账操作无效。");
  const { data: row, error } = await db
    .from("chat_messages")
    .select("*")
    .eq("id", messageId)
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !row || row.message_type !== "transfer") throw new Error("转账不存在或无权访问。");
  if (row.role !== (actor === "user" ? "assistant" : "user"))
    throw new Error("只有收款方可以处理转账。");
  const transfer = readTransfer(row, userId, charId);
  if (transfer.status !== "pending") return row;
  // Compare the complete JSON snapshot: concurrent receipt/refund cannot both win,
  // including old cards with a missing status. Preserve unknown payload fields.
  const { data: updated, error: updateError } = await db
    .from("chat_messages")
    .update({
      payload: { ...row.payload, ...transfer, status },
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .eq("payload", JSON.stringify(row.payload ?? {}))
    .select("*")
    .maybeSingle();
  if (updateError) throw new Error("转账保存失败，请重试。");
  if (updated) return updated;
  const { data: latest, error: latestError } = await db
    .from("chat_messages")
    .select("*")
    .eq("id", row.id)
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (latestError || !latest || readTransfer(latest).status === "pending")
    throw new Error("转账已变更，请重新打开聊天后重试。");
  return latest;
}

export async function applyCharacterTransfers(
  db: Db,
  userId: string,
  sessionId: string,
  charId: string,
  turnId: string,
  messageOrder: number,
  actions: TransferAction[],
) {
  const messages = [];
  const updates = [];
  const errors: string[] = [];
  for (const action of actions) {
    try {
      if (action.type === "send") {
        const payload = createTransfer(charId, userId, action.amount, action.remark);
        const { data: row, error } = await db
          .from("chat_messages")
          .insert({
            session_id: sessionId,
            user_id: userId,
            role: "assistant",
            content: "",
            message_type: "transfer",
            payload,
            delivery_status: "sent",
            turn_id: turnId,
            message_order: ++messageOrder,
          })
          .select("*")
          .single();
        if (error || !row) throw new Error("转账发送失败。");
        messages.push(row);
      } else {
        // IDs already resolved against this turn's owned context, not arbitrary model input.
        updates.push(
          await settleChatTransfer(
            db,
            userId,
            sessionId,
            charId,
            action.transferId!,
            "char",
            action.type,
          ),
        );
      }
    } catch (reason) {
      errors.push(reason instanceof Error ? reason.message : "转账处理失败。");
    }
  }
  return { messages, updates, errors };
}
