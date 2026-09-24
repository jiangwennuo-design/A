/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const queuedMessageInput = z.object({
  message: z.string().max(8000).default(""),
  session_id: uuid,
  char_id: uuid,
  message_type: z.enum(["text", "image", "sticker", "transfer", "call"]).default("text"),
  payload: z.record(z.unknown()).default({}),
});
const replyInput = z.object({
  session_id: uuid,
  char_id: uuid,
  diary_context_mode: z.enum(["none", "current", "recent", "all"]),
  context_diary_id: uuid.nullable().optional(),
});

type Db = any;
type ChatRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  turn_id: string | null;
  message_order: number;
  created_at: string;
  message_type?: "text" | "image" | "sticker" | "transfer" | "call";
  payload?: Record<string, unknown>;
};
type StickerRow = {
  id: string;
  file_path: string;
  width: number | null;
  height: number | null;
};
type GeneratedBubble = {
  content: string;
  message_type: "text" | "sticker";
  payload: Record<string, unknown>;
};
const newTurnId = () => crypto.randomUUID();
const cleanText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function parseBubbles(raw: string, min: number, max: number): string[] {
  const candidate = raw
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new Error("AI 返回格式不正确，请重试。");
  }
  const messages = (parsed as { messages?: unknown })?.messages;
  if (!Array.isArray(messages) || messages.length < min || messages.length > max)
    throw new Error(`AI 回复数量应在 ${min} 到 ${max} 条之间。`);
  const cleaned = messages.map(cleanText);
  if (cleaned.some((message) => !message)) throw new Error("AI 返回了空消息，请重试。");
  return cleaned;
}

async function loadOwnedContext(db: Db, userId: string, sessionId: string, charId: string) {
  const [
    { data: session, error: sessionError },
    { data: character, error: charError },
    { data: profile },
  ] = await Promise.all([
    db
      .from("chat_sessions")
      .select("id, user_id, char_id")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle(),
    db.from("ai_personas").select("*").eq("id", charId).eq("user_id", userId).maybeSingle(),
    db
      .from("profiles")
      .select(
        "display_name, gender, persona_text, signature, time_awareness_enabled, inner_life_enabled, timezone",
      )
      .eq("id", userId)
      .maybeSingle(),
  ]);
  if (sessionError || !session) throw new Error("聊天会话不存在或无权访问。");
  if (charError || !character) throw new Error("角色不存在或无权访问。");
  if (session.char_id && session.char_id !== charId) throw new Error("该会话不属于当前角色。");
  if (!session.char_id) {
    const { error } = await db
      .from("chat_sessions")
      .update({ char_id: charId })
      .eq("id", sessionId)
      .eq("user_id", userId);
    if (error) throw new Error("无法绑定当前角色。");
  }
  return { character, profile };
}

function profilePrompt(profile: any, character: any) {
  const user = [
    `昵称：${profile?.display_name || "未设置"}`,
    profile?.gender ? `性别：${profile.gender}` : "",
    profile?.persona_text ? `自我人设：${profile.persona_text}` : "",
    profile?.signature ? `个性签名：${profile.signature}` : "",
  ].filter(Boolean);
  const char = [
    `名字：${character.name}`,
    character.gender ? `性别：${character.gender}` : "",
    character.description ? `描述：${character.description}` : "",
    character.personality ? `性格：${character.personality}` : "",
    character.speaking_style ? `说话方式：${character.speaking_style}` : "",
    character.interests ? `喜欢：${character.interests}` : "",
    character.dislikes ? `不喜欢：${character.dislikes}` : "",
    character.relationship ? `关系：${character.relationship}` : "",
    character.background ? `背景：${character.background}` : "",
    character.additional_prompt || "",
  ].filter(Boolean);
  return `USER PROFILE\n${user.join("\n") || "未填写"}\n\nCHAR PROFILE\n${char.join("\n")}`;
}

function timeContext(profile: any, history: ChatRow[]) {
  if (profile?.time_awareness_enabled === false) return "";
  let timezone = typeof profile?.timezone === "string" ? profile.timezone : "Asia/Shanghai";
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone: timezone }).format(new Date());
  } catch {
    timezone = "UTC";
  }
  const now = new Date();
  const previousValue = history.at(-1)?.created_at;
  const previous = previousValue ? new Date(previousValue) : null;
  const validPrevious = previous && !Number.isNaN(previous.getTime()) ? previous : null;
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const context = {
    current_datetime: formatter.format(now),
    timezone,
    previous_interaction_datetime: validPrevious ? formatter.format(validPrevious) : null,
    elapsed_since_previous_interaction_seconds: validPrevious
      ? Math.max(0, Math.round((now.getTime() - validPrevious.getTime()) / 1000))
      : null,
    crossed_calendar_day: validPrevious
      ? dateFormatter.format(now) !== dateFormatter.format(validPrevious)
      : false,
  };
  return `\n\nREAL TIME CONTEXT\n${JSON.stringify(context)}\n只在当前语境确实需要时自然感知时间与间隔，不要每条消息机械报时，也不要虚构双方在线下共同经历过的活动。`;
}

async function diaryContext(
  db: Db,
  userId: string,
  mode: "none" | "current" | "recent" | "all",
  diaryId?: string | null,
) {
  if (mode === "none") return "";
  let query = db
    .from("diaries")
    .select("id, title, content, diary_date")
    .eq("user_id", userId)
    .order("diary_date", { ascending: false });
  if (mode === "current" && diaryId) query = query.eq("id", diaryId).limit(1);
  if (mode === "recent") query = query.limit(5);
  if (mode === "all") query = query.limit(50);
  const { data } = await query;
  if (!data?.length) return "";
  return `\n\n用户已授权的日记内容：\n${data.map((item: any) => `【${item.diary_date}】${item.title}\n${item.content}`).join("\n---\n")}`;
}

async function generatePrivateReply(args: {
  db: Db;
  userId: string;
  character: any;
  profile: any;
  history: ChatRow[];
  pending: ChatRow[];
  mode: "none" | "current" | "recent" | "all";
  diaryId?: string | null | undefined;
}) {
  const min = Math.max(1, Number(args.character.minimum_messages ?? 1));
  const max = Math.max(min, Number(args.character.maximum_messages ?? min));
  const { data: stickerData } = await args.db
    .from("chat_stickers")
    .select("id, file_path, width, height")
    .eq("user_id", args.userId)
    .order("created_at", { ascending: false })
    .limit(20);
  const stickers = (stickerData ?? []) as StickerRow[];
  const { privateChatInnerLifePrompt, stripPrivateThinking } =
    await import("./ai/inner-life.server");
  const innerLifePrompt = privateChatInnerLifePrompt(args.profile?.inner_life_enabled !== false);
  const responseShape = innerLifePrompt
    ? '{"thinking":"<thinking>...</thinking>","messages":["..."]}'
    : '{"messages":["..."]}';
  const stickerInstruction = stickers.length
    ? "你可以在确实自然时把其中一条消息精确写成 __STICKER__，系统会发送一个已有表情；不要解释这个标记，也不要频繁使用。"
    : "";
  const systemPrompt = `${profilePrompt(args.profile, args.character)}${timeContext(args.profile, args.history)}\n\n你在进行即时私聊，不是客服，不要每次总结。请自然地用中文回复，可短可长。不要机械拆句或凑数量。必须只返回 JSON：${responseShape}；messages 数组中必须有 ${min} 到 ${max} 条独立的、完整但自然的聊天气泡。${stickerInstruction}${innerLifePrompt ? `\n\n${innerLifePrompt}` : ""}${await diaryContext(args.db, args.userId, args.mode, args.diaryId)}`;
  const { generate, AiServiceError } = await import("./ai/service.server");
  const historyMessages = args.history.map((row) => ({
    role: row.role,
    content: messageTextForAi(row),
  }));
  const pendingContent = await pendingContentForAi(args.db, args.pending);
  const request = (content: typeof pendingContent | string) =>
    generate({
      scene: "private_chat",
      userId: args.userId,
      supabase: args.db,
      charId: args.character.id,
      systemPrompt,
      messages: [...historyMessages, { role: "user", content }],
      outputFormat: "json",
    });
  let result;
  try {
    result = await request(pendingContent);
  } catch (error) {
    const hasImage = args.pending.some((row) => row.message_type === "image");
    if (
      !hasImage ||
      !(error instanceof AiServiceError) ||
      !["client_error", "bad_response"].includes(error.kind)
    )
      throw error;
    result = await request(args.pending.map(messageTextForAi).join("\n"));
  }
  const bubbles = parseBubbles(stripPrivateThinking(result.text), min, max);
  return bubbles.map((content, index): GeneratedBubble => {
    if (content === "__STICKER__" && stickers.length) {
      const sticker = stickers[(args.history.length + index) % stickers.length]!;
      return {
        content: "",
        message_type: "sticker",
        payload: {
          sticker_path: sticker.file_path,
          sticker_id: sticker.id,
          width: sticker.width ?? 1,
          height: sticker.height ?? 1,
        },
      };
    }
    return { content, message_type: "text", payload: {} };
  });
}

function messageTextForAi(row: ChatRow) {
  if (!row.message_type || row.message_type === "text") return row.content;
  if (row.message_type === "image")
    return row.content || "用户发送了一张图片；若当前模型无法读取图片，不要猜测具体内容。";
  if (row.message_type === "sticker")
    return row.role === "assistant" ? "角色发送了一个表情包。" : "用户发送了一个表情包。";
  if (row.message_type === "transfer")
    return `用户发送了一笔转账：¥${Number(row.payload?.["amount"] ?? 0).toFixed(2)}${row.payload?.["note"] ? `，备注：${String(row.payload["note"])}` : ""}。`;
  const duration = Number(row.payload?.["duration"] ?? 0);
  return `语音通话记录：${String(row.payload?.["status"] ?? "cancelled")}${duration ? `，${duration} 秒` : ""}。`;
}

async function pendingContentForAi(db: Db, rows: ChatRow[]) {
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "auto" } }
  > = [];
  for (const row of rows) {
    if (row.message_type === "image" && typeof row.payload?.["image_path"] === "string") {
      const { data } = await db.storage
        .from("chat-media")
        .createSignedUrl(row.payload["image_path"], 600);
      if (data?.signedUrl)
        parts.push({ type: "image_url", image_url: { url: data.signedUrl, detail: "auto" } });
      else parts.push({ type: "text", text: messageTextForAi(row) });
    } else {
      parts.push({ type: "text", text: messageTextForAi(row) });
    }
  }
  return parts;
}

function validateMessagePayload(type: string, raw: Record<string, unknown>, userId: string) {
  if (type === "text") return {};
  if (type === "image") {
    const imagePath = cleanText(raw["image_path"]);
    if (!imagePath.startsWith(`${userId}/messages/`)) throw new Error("图片路径无效。");
    return {
      image_path: imagePath,
      width: Math.max(1, Number(raw["width"]) || 1),
      height: Math.max(1, Number(raw["height"]) || 1),
      caption: cleanText(raw["caption"]).slice(0, 500),
    };
  }
  if (type === "sticker") {
    const stickerPath = cleanText(raw["sticker_path"]);
    if (!stickerPath.startsWith(`${userId}/stickers/`)) throw new Error("表情包路径无效。");
    return {
      sticker_path: stickerPath,
      sticker_id: cleanText(raw["sticker_id"]) || undefined,
      width: Math.max(1, Number(raw["width"]) || 1),
      height: Math.max(1, Number(raw["height"]) || 1),
    };
  }
  if (type === "transfer") {
    const amount = Number(raw["amount"]);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999.99)
      throw new Error("请输入有效的转账金额。");
    return {
      amount: Math.round(amount * 100) / 100,
      note: cleanText(raw["note"]).slice(0, 100),
      status: "pending",
    };
  }
  const status = ["missed", "cancelled", "completed"].includes(String(raw["status"]))
    ? String(raw["status"])
    : "cancelled";
  return {
    call_type: "voice",
    duration: Math.max(0, Math.floor(Number(raw["duration"]) || 0)),
    status,
  };
}

export const queuePenpalMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => queuedMessageInput.parse(data))
  .handler(async ({ data, context }) => {
    const db = context.supabase as Db;
    await loadOwnedContext(db, context.userId, data.session_id, data.char_id);
    const content = data.message.trim();
    const payload = validateMessagePayload(data.message_type, data.payload, context.userId);
    if (data.message_type === "text" && !content) throw new Error("消息内容不能为空。");
    const { data: inserted, error } = await db
      .from("chat_messages")
      .insert({
        session_id: data.session_id,
        user_id: context.userId,
        role: "user",
        content,
        message_type: data.message_type,
        payload,
        delivery_status: "sent",
        message_order: 0,
      })
      .select("*")
      .single();
    if (error || !inserted) throw new Error("保存聊天消息失败。");
    await db
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.session_id)
      .eq("user_id", context.userId);
    return { message: inserted };
  });

export const requestPenpalReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => replyInput.parse(data))
  .handler(async ({ data, context }) => {
    const db = context.supabase as Db;
    const { character, profile } = await loadOwnedContext(
      db,
      context.userId,
      data.session_id,
      data.char_id,
    );
    const { data: history } = await db
      .from("chat_messages")
      .select("id, role, content, turn_id, message_order, created_at, message_type, payload")
      .eq("session_id", data.session_id)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .order("message_order", { ascending: false })
      .limit(80);
    const rows = ((history ?? []) as ChatRow[]).reverse();
    const lastAssistantIndex = rows.map((row) => row.role).lastIndexOf("assistant");
    const pending = rows.slice(lastAssistantIndex + 1).filter((row) => row.role === "user");
    if (!pending.length) throw new Error("请先发送一条消息，再让角色回复。");
    const bubbles = await generatePrivateReply({
      db,
      userId: context.userId,
      character,
      profile,
      history: rows.slice(0, lastAssistantIndex + 1),
      pending,
      mode: data.diary_context_mode,
      diaryId: data.context_diary_id,
    });
    const turnId = newTurnId();
    const { data: inserted, error } = await db
      .from("chat_messages")
      .insert(
        bubbles.map((bubble, index) => ({
          session_id: data.session_id,
          user_id: context.userId,
          role: "assistant",
          content: bubble.content,
          message_type: bubble.message_type,
          payload: bubble.payload,
          delivery_status: "sent",
          turn_id: turnId,
          message_order: index + 1,
        })),
      )
      .select("*");
    if (error) throw new Error("保存聊天消息失败。");
    await db
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.session_id)
      .eq("user_id", context.userId);
    return { messages: inserted ?? [], turn_id: turnId };
  });

export const rerollPenpalTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        session_id: uuid,
        char_id: uuid,
        turn_id: uuid,
        diary_context_mode: z.enum(["none", "current", "recent", "all"]),
        context_diary_id: uuid.nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as Db;
    const { character, profile } = await loadOwnedContext(
      db,
      context.userId,
      data.session_id,
      data.char_id,
    );
    const { data: allMessages } = await db
      .from("chat_messages")
      .select("id, role, content, turn_id, message_order, created_at, message_type, payload")
      .eq("session_id", data.session_id)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true })
      .order("message_order", { ascending: true });
    const rows = (allMessages ?? []) as ChatRow[];
    const firstCurrent = rows.findIndex(
      (row) => row.role === "assistant" && row.turn_id === data.turn_id,
    );
    if (firstCurrent < 0) throw new Error("找不到需要重新生成的回复。");
    const previousAssistantIndex = [...rows.slice(0, firstCurrent)]
      .map((row) => row.role)
      .lastIndexOf("assistant");
    const userMessages = rows
      .slice(previousAssistantIndex + 1, firstCurrent)
      .filter((row) => row.role === "user");
    if (!userMessages.length) throw new Error("该轮对话缺少用户消息。");
    const bubbles = await generatePrivateReply({
      db,
      userId: context.userId,
      character,
      profile,
      history: rows.slice(0, previousAssistantIndex + 1),
      pending: userMessages,
      mode: data.diary_context_mode,
      diaryId: data.context_diary_id,
    });
    const { data: replaced, error } = await db.rpc("replace_chat_turn", {
      p_session_id: data.session_id,
      p_char_id: data.char_id,
      p_turn_id: data.turn_id,
      p_messages: bubbles,
    });
    if (error) throw new Error("替换本轮回复失败，原回复已保留。");
    return { messages: replaced ?? [], turn_id: data.turn_id };
  });

export const clearCurrentChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ session_id: uuid, char_id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const db = context.supabase as Db;
    const { error } = await db.rpc("clear_current_chat", {
      p_session_id: data.session_id,
      p_char_id: data.char_id,
    });
    if (error) throw new Error("清空失败，聊天记录没有被修改。");
    return { ok: true };
  });

export const createDiaryReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ diary_id: uuid, char_id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const db = context.supabase as Db;
    const [{ data: character }, { data: profile }, { data: diary }] = await Promise.all([
      db
        .from("ai_personas")
        .select("*")
        .eq("id", data.char_id)
        .eq("user_id", context.userId)
        .maybeSingle(),
      db
        .from("profiles")
        .select("display_name, gender, persona_text, signature, inner_life_enabled")
        .eq("id", context.userId)
        .maybeSingle(),
      db
        .from("diaries")
        .select("id, title, content, diary_date")
        .eq("id", data.diary_id)
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    if (!character || !diary) throw new Error("日记或笔友不存在或无权访问。");
    const { letterMindsetPrompt, stripPrivateThinking } = await import("./ai/inner-life.server");
    const mindsetPrompt = letterMindsetPrompt(profile?.inner_life_enabled !== false);
    const { generate } = await import("./ai/service.server");
    const result = await generate({
      scene: "diary_reply",
      userId: context.userId,
      supabase: db,
      charId: data.char_id,
      systemPrompt: `${profilePrompt(profile, character)}\n\n请以笔友身份写一封完整、连贯、有回应感的中文回信。不要输出 JSON，不要使用即时私聊的多气泡格式。${mindsetPrompt ? `\n\n${mindsetPrompt}` : ""}`,
      messages: [
        {
          role: "user",
          content: `这是我在 ${diary.diary_date} 写的日记《${diary.title}》：\n${diary.content}`,
        },
      ],
      outputFormat: "text",
    });
    const { data: reply, error } = await db
      .from("diary_replies")
      .insert({
        user_id: context.userId,
        diary_id: data.diary_id,
        char_id: data.char_id,
        content: stripPrivateThinking(result.text),
      })
      .select("*")
      .single();
    if (error) throw new Error("保存回信失败。");
    return { reply };
  });
