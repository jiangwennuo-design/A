import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const chatInput = z.object({
  message: z.string().trim().min(1).max(8000), session_id: uuid, char_id: uuid,
  diary_context_mode: z.enum(["none", "current", "recent", "all"]), context_diary_id: uuid.nullable().optional(),
});

type Db = any;
type ChatRow = { id: string; role: "user" | "assistant"; content: string; turn_id: string | null; created_at: string };
const newTurnId = () => crypto.randomUUID();
const cleanText = (value: unknown) => typeof value === "string" ? value.trim() : "";

function parseBubbles(raw: string, min: number, max: number): string[] {
  const candidate = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed: unknown;
  try { parsed = JSON.parse(candidate); } catch { throw new Error("AI 返回格式不正确，请重试。"); }
  const messages = (parsed as { messages?: unknown })?.messages;
  if (!Array.isArray(messages) || messages.length < min || messages.length > max) throw new Error(`AI 回复数量应在 ${min} 到 ${max} 条之间。`);
  const cleaned = messages.map(cleanText);
  if (cleaned.some((message) => !message)) throw new Error("AI 返回了空消息，请重试。");
  return cleaned;
}

async function loadOwnedContext(db: Db, userId: string, sessionId: string, charId: string) {
  const [{ data: session, error: sessionError }, { data: character, error: charError }, { data: profile }] = await Promise.all([
    db.from("chat_sessions").select("id, user_id, char_id").eq("id", sessionId).eq("user_id", userId).maybeSingle(),
    db.from("ai_personas").select("*").eq("id", charId).eq("user_id", userId).maybeSingle(),
    db.from("profiles").select("display_name, gender, persona_text, signature").eq("id", userId).maybeSingle(),
  ]);
  if (sessionError || !session) throw new Error("聊天会话不存在或无权访问。");
  if (charError || !character) throw new Error("笔友不存在或无权访问。");
  if (session.char_id && session.char_id !== charId) throw new Error("该会话不属于当前笔友。");
  if (!session.char_id) {
    const { error } = await db.from("chat_sessions").update({ char_id: charId }).eq("id", sessionId).eq("user_id", userId);
    if (error) throw new Error("无法绑定当前笔友。");
  }
  return { character, profile };
}

function profilePrompt(profile: any, character: any) {
  const user = [`昵称：${profile?.display_name || "未设置"}`, profile?.gender ? `性别：${profile.gender}` : "", profile?.persona_text ? `自我人设：${profile.persona_text}` : "", profile?.signature ? `个性签名：${profile.signature}` : ""].filter(Boolean);
  const char = [`名字：${character.name}`, character.gender ? `性别：${character.gender}` : "", character.description ? `描述：${character.description}` : "", character.personality ? `性格：${character.personality}` : "", character.speaking_style ? `说话方式：${character.speaking_style}` : "", character.interests ? `喜欢：${character.interests}` : "", character.dislikes ? `不喜欢：${character.dislikes}` : "", character.relationship ? `关系：${character.relationship}` : "", character.background ? `背景：${character.background}` : "", character.additional_prompt || ""].filter(Boolean);
  return `USER PROFILE\n${user.join("\n") || "未填写"}\n\nCHAR PROFILE\n${char.join("\n")}`;
}

async function diaryContext(db: Db, userId: string, mode: "none" | "current" | "recent" | "all", diaryId?: string | null) {
  if (mode === "none") return "";
  let query = db.from("diaries").select("id, title, content, diary_date").eq("user_id", userId).order("diary_date", { ascending: false });
  if (mode === "current" && diaryId) query = query.eq("id", diaryId).limit(1);
  if (mode === "recent") query = query.limit(5);
  if (mode === "all") query = query.limit(50);
  const { data } = await query;
  if (!data?.length) return "";
  return `\n\n用户已授权的日记内容：\n${data.map((item: any) => `【${item.diary_date}】${item.title}\n${item.content}`).join("\n---\n")}`;
}

async function generatePrivateReply(args: { db: Db; userId: string; character: any; profile: any; history: ChatRow[]; message: string; mode: "none" | "current" | "recent" | "all"; diaryId?: string | null; }) {
  const min = Math.max(1, Number(args.character.minimum_messages ?? 1));
  const max = Math.max(min, Number(args.character.maximum_messages ?? min));
  const systemPrompt = `${profilePrompt(args.profile, args.character)}\n\n你在进行即时私聊，不是客服，不要每次总结。请自然地用中文回复，可短可长。不要机械拆句或凑数量。必须只返回 JSON：{\"messages\":[\"...\"]}；数组中必须有 ${min} 到 ${max} 条独立的、完整但自然的聊天气泡。${await diaryContext(args.db, args.userId, args.mode, args.diaryId)}`;
  const { generate } = await import("./ai/service.server");
  const result = await generate({ scene: "private_chat", userId: args.userId, supabase: args.db, charId: args.character.id, systemPrompt, messages: [...args.history.map((row) => ({ role: row.role, content: row.content })), { role: "user", content: args.message }], outputFormat: "json" });
  return parseBubbles(result.text, min, max);
}

export const sendPenpalMessage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data: unknown) => chatInput.parse(data)).handler(async ({ data, context }) => {
  const db = context.supabase as Db;
  const { character, profile } = await loadOwnedContext(db, context.userId, data.session_id, data.char_id);
  const { data: history } = await db.from("chat_messages").select("id, role, content, turn_id, created_at").eq("session_id", data.session_id).eq("user_id", context.userId).order("created_at", { ascending: true }).limit(40);
  const bubbles = await generatePrivateReply({ db, userId: context.userId, character, profile, history: (history ?? []) as ChatRow[], message: data.message, mode: data.diary_context_mode, diaryId: data.context_diary_id });
  const turnId = newTurnId();
  const { data: inserted, error } = await db.from("chat_messages").insert([{ session_id: data.session_id, user_id: context.userId, role: "user", content: data.message, message_order: 0 }, ...bubbles.map((content, index) => ({ session_id: data.session_id, user_id: context.userId, role: "assistant", content, turn_id: turnId, message_order: index + 1 }))]).select("*");
  if (error) throw new Error("保存聊天消息失败。");
  await db.from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", data.session_id).eq("user_id", context.userId);
  return { messages: inserted ?? [], turn_id: turnId };
});

export const rerollPenpalTurn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data: unknown) => z.object({ session_id: uuid, char_id: uuid, turn_id: uuid, diary_context_mode: z.enum(["none", "current", "recent", "all"]), context_diary_id: uuid.nullable().optional() }).parse(data)).handler(async ({ data, context }) => {
  const db = context.supabase as Db;
  const { character, profile } = await loadOwnedContext(db, context.userId, data.session_id, data.char_id);
  const { data: allMessages } = await db.from("chat_messages").select("id, role, content, turn_id, created_at").eq("session_id", data.session_id).eq("user_id", context.userId).order("created_at", { ascending: true });
  const rows = (allMessages ?? []) as ChatRow[];
  const firstCurrent = rows.findIndex((row) => row.role === "assistant" && row.turn_id === data.turn_id);
  if (firstCurrent < 0) throw new Error("找不到需要重新生成的回复。");
  const userIndex = [...rows.slice(0, firstCurrent)].map((row) => row.role).lastIndexOf("user");
  const userMessage = userIndex >= 0 ? rows[userIndex].content : undefined;
  if (!userMessage) throw new Error("该轮对话缺少用户消息。");
  const bubbles = await generatePrivateReply({ db, userId: context.userId, character, profile, history: rows.slice(0, userIndex), message: userMessage, mode: data.diary_context_mode, diaryId: data.context_diary_id });
  const { data: replaced, error } = await db.rpc("replace_chat_turn", { p_session_id: data.session_id, p_char_id: data.char_id, p_turn_id: data.turn_id, p_messages: bubbles });
  if (error) throw new Error("替换本轮回复失败，原回复已保留。");
  return { messages: replaced ?? [], turn_id: data.turn_id };
});

export const clearCurrentChat = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data: unknown) => z.object({ session_id: uuid, char_id: uuid }).parse(data)).handler(async ({ data, context }) => {
  const db = context.supabase as Db;
  const { error } = await db.rpc("clear_current_chat", { p_session_id: data.session_id, p_char_id: data.char_id });
  if (error) throw new Error("清空失败，聊天记录没有被修改。");
  return { ok: true };
});

export const createDiaryReply = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data: unknown) => z.object({ diary_id: uuid, char_id: uuid }).parse(data)).handler(async ({ data, context }) => {
  const db = context.supabase as Db;
  const [{ data: character }, { data: profile }, { data: diary }] = await Promise.all([db.from("ai_personas").select("*").eq("id", data.char_id).eq("user_id", context.userId).maybeSingle(), db.from("profiles").select("display_name, gender, persona_text, signature").eq("id", context.userId).maybeSingle(), db.from("diaries").select("id, title, content, diary_date").eq("id", data.diary_id).eq("user_id", context.userId).maybeSingle()]);
  if (!character || !diary) throw new Error("日记或笔友不存在或无权访问。");
  const { generate } = await import("./ai/service.server");
  const result = await generate({ scene: "diary_reply", userId: context.userId, supabase: db, charId: data.char_id, systemPrompt: `${profilePrompt(profile, character)}\n\n请以笔友身份写一封完整、连贯、有回应感的中文回信。不要输出 JSON，不要使用即时私聊的多气泡格式。`, messages: [{ role: "user", content: `这是我在 ${diary.diary_date} 写的日记《${diary.title}》：\n${diary.content}` }], outputFormat: "text" });
  const { data: reply, error } = await db.from("diary_replies").insert({ user_id: context.userId, diary_id: data.diary_id, char_id: data.char_id, content: result.text }).select("*").single();
  if (error) throw new Error("保存回信失败。");
  return { reply };
});
