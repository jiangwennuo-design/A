import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  message: z.string().min(1),
  session_id: z.string().uuid(),
  diary_context_mode: z.enum(["none", "current", "recent", "all"]),
  context_diary_id: z.string().uuid().nullable().optional(),
});

export const sendPenpalMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const userId = context.userId;
    const { message, session_id, diary_context_mode, context_diary_id } = data;

    // 1. 读取用户设定的笔友人设
    const { data: persona } = await supabase
      .from("ai_personas")
      .select("*")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    // 2. 按授权范围读取日记
    let diaryContext = "";
    if (diary_context_mode === "current" && context_diary_id) {
      const { data: diary } = await supabase
        .from("diaries")
        .select("title, content, diary_date")
        .eq("id", context_diary_id)
        .eq("user_id", userId)
        .maybeSingle();

      if (diary) {
        diaryContext = `以下是用户授权你阅读的当前日记：\n标题：${diary.title}\n日期：${diary.diary_date}\n内容：${diary.content}`;
      }
    } else if (diary_context_mode === "recent") {
      const { data: recentDiaries } = await supabase
        .from("diaries")
        .select("title, content, diary_date")
        .eq("user_id", userId)
        .order("diary_date", { ascending: false })
        .limit(5);

      if (recentDiaries && recentDiaries.length > 0) {
        const formatted = recentDiaries
          .map((d) => `【${d.diary_date}】${d.title}\n${d.content}`)
          .join("\n\n---\n\n");
        diaryContext = `以下是用户授权你阅读的最近日记（共${recentDiaries.length}篇）：\n\n${formatted}`;
      }
    } else if (diary_context_mode === "all") {
      const { data: allDiaries } = await supabase
        .from("diaries")
        .select("title, content, diary_date")
        .eq("user_id", userId)
        .order("diary_date", { ascending: false })
        .limit(50);

      if (allDiaries && allDiaries.length > 0) {
        const formatted = allDiaries
          .map((d) => `【${d.diary_date}】${d.title}\n${d.content}`)
          .join("\n\n---\n\n");
        diaryContext = `以下是用户授权你阅读的全部日记（共${allDiaries.length}篇）：\n\n${formatted}`;
      }
    }

    // 3. 读取本次会话的近期对话
    const { data: chatHistory } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", session_id)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(20);

    // 4. 根据人设拼装系统提示
    let systemPrompt = "";
    if (persona) {
      const parts: string[] = [];
      parts.push(`你是用户设定的笔友${persona.name}。`);

      if (persona.description) parts.push(`关于你：${persona.description}`);
      if (persona.personality) parts.push(`你的性格：${persona.personality}`);
      if (persona.speaking_style) parts.push(`你的说话方式：${persona.speaking_style}`);
      if (persona.interests) parts.push(`你喜欢：${persona.interests}`);
      if (persona.dislikes) parts.push(`你不喜欢：${persona.dislikes}`);
      if (persona.relationship) parts.push(`你与用户的关系：${persona.relationship}`);
      if (persona.background) parts.push(`你的背景故事：${persona.background}`);
      if (persona.additional_prompt) parts.push(persona.additional_prompt);

      systemPrompt = parts.join("\n");
    } else {
      systemPrompt =
        "你是一个温暖、善解人意的笔友。你会认真阅读用户的日记，并以朋友的身份与用户交流。";
    }

    systemPrompt += "\n\n你是一个长期通信的笔友，不是客服。请用自然、温暖的语气与用户交流。";
    systemPrompt +=
      "你可以引用用户日记中提到的事情，可以表达自己的情感，可以提出问题，也可以关心用户。";
    systemPrompt += "不要每次都总结日记，不要使用模板化的句式，要像一个真实的朋友在写信。";
    systemPrompt += "请用中文回复。";

    if (diaryContext) {
      systemPrompt += `\n\n${diaryContext}`;
    }

    // 5. 组装请求消息
    const apiMessages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    if (chatHistory && chatHistory.length > 0) {
      for (const msg of chatHistory) {
        apiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    apiMessages.push({ role: "user", content: message });

    // 6. 保存用户这条消息
    await supabase.from("chat_messages").insert({
      session_id,
      user_id: userId,
      role: "user",
      content: message,
    });

    async function saveReply(reply: string) {
      await supabase.from("chat_messages").insert({
        session_id,
        user_id: userId,
        role: "assistant",
        content: reply,
      });
    }

    // 7. 通过统一 AI Service 调用（优先用户自己的 AI 配置，否则回退内置 AI）
    const { generate } = await import("./ai/service.server");

    let reply: string;
    try {
      const result = await generate({
        scene: "private_chat",
        userId,
        supabase,
        systemPrompt,
        messages: apiMessages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        outputFormat: "text",
      });
      reply = result.text;
    } catch (error) {
      reply =
        error instanceof Error && error.message
          ? `抱歉，我现在没法回复你。${error.message}`
          : "抱歉，我现在没法回复你。请稍后再试。";
    }

    // 8. 保存笔友回复
    await saveReply(reply);

    await supabase
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", session_id);

    return { reply };
  });
