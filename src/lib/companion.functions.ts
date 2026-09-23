/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
type Db = any;

function personaPrompt(profile: any, character: any) {
  return [
    "你必须始终遵守以下人物设定，用自然中文交流，不要自称 AI。",
    `用户：${profile?.display_name || "朋友"}`,
    profile?.persona_text ? `用户资料：${profile.persona_text}` : "",
    `角色名字：${character.name}`,
    character.description ? `角色描述：${character.description}` : "",
    character.personality ? `性格：${character.personality}` : "",
    character.speaking_style ? `说话方式：${character.speaking_style}` : "",
    character.relationship ? `与用户的关系：${character.relationship}` : "",
    character.background ? `背景：${character.background}` : "",
    character.additional_prompt || "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function ownedPersona(db: Db, userId: string, charId: string) {
  const [{ data: character }, { data: profile }] = await Promise.all([
    db.from("ai_personas").select("*").eq("id", charId).eq("user_id", userId).maybeSingle(),
    db.from("profiles").select("display_name, persona_text").eq("id", userId).maybeSingle(),
  ]);
  if (!character) throw new Error("没有找到这位角色。");
  return { character, profile };
}

const momentInput = z.object({
  post_id: uuid,
  char_id: uuid,
  parent_comment_id: uuid.nullable().optional(),
});

export const generateMomentInteraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => momentInput.parse(data))
  .handler(async ({ data, context }) => {
    const db = context.supabase as Db;
    const userId = context.userId;
    const [{ character, profile }, { data: post }, { data: comments }] = await Promise.all([
      ownedPersona(db, userId, data.char_id),
      db
        .from("moment_posts")
        .select("*")
        .eq("id", data.post_id)
        .eq("user_id", userId)
        .maybeSingle(),
      db
        .from("moment_comments")
        .select("id, actor_kind, char_id, parent_id, content, created_at")
        .eq("post_id", data.post_id)
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(30),
    ]);
    if (!post) throw new Error("这条动态不存在。");

    if (!data.parent_comment_id) {
      const alreadyCommented = (comments || []).some(
        (item: any) =>
          item.actor_kind === "char" && item.char_id === data.char_id && !item.parent_id,
      );
      if (alreadyCommented) throw new Error(`${character.name} 已经评论过这条动态了。`);
    } else if (!(comments || []).some((item: any) => item.id === data.parent_comment_id)) {
      throw new Error("要回复的评论不存在。");
    }

    const { data: existingLike } = await db
      .from("moment_likes")
      .select("id")
      .eq("post_id", data.post_id)
      .eq("user_id", userId)
      .eq("actor_kind", "char")
      .eq("char_id", data.char_id)
      .maybeSingle();
    if (!existingLike) {
      await db.from("moment_likes").insert({
        post_id: data.post_id,
        user_id: userId,
        actor_kind: "char",
        char_id: data.char_id,
      });
    }

    const discussion = (comments || [])
      .map((item: any) => {
        const speaker =
          item.actor_kind === "user"
            ? profile?.display_name || "用户"
            : item.char_id === data.char_id
              ? character.name
              : "另一位朋友";
        return `${speaker}：${item.content}`;
      })
      .join("\n");
    const { generate } = await import("./ai/service.server");
    const result = await generate({
      scene: "moment_comment",
      userId,
      supabase: db,
      charId: character.id,
      systemPrompt: `${personaPrompt(profile, character)}\n\n你正在朋友圈评论。只输出一条简短、自然、符合人设的评论，不要套话，不要加姓名或引号，不要说自己看见了不存在的图片细节。`,
      messages: [
        {
          role: "user",
          content: `动态正文：${post.content || "（仅图片）"}\n已有讨论：\n${discussion || "暂无"}\n${data.parent_comment_id ? "请结合刚才的讨论继续回复，但不要制造无限对话。" : "请发表一次自然评论。"}`,
        },
      ],
      maxTokens: 180,
    });
    const content = result.text.trim().replace(/^(["“]|评论[:：]\s*)|["”]$/g, "");
    if (!content) throw new Error("角色暂时没有想好怎么评论。");
    const { data: inserted, error } = await db
      .from("moment_comments")
      .insert({
        post_id: data.post_id,
        user_id: userId,
        actor_kind: "char",
        char_id: data.char_id,
        parent_id: data.parent_comment_id || null,
        content: content.slice(0, 2000),
      })
      .select("*")
      .single();
    if (error) throw new Error("保存角色评论失败。");
    return { comment: inserted };
  });

const focusInput = z.object({
  char_id: uuid,
  mode: z.enum(["focus", "short_break", "long_break"]),
  event: z.enum(["start", "finish"]),
  minutes: z.number().int().min(1).max(240),
});

export const generateFocusCompanionMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => focusInput.parse(data))
  .handler(async ({ data, context }) => {
    const db = context.supabase as Db;
    const { character, profile } = await ownedPersona(db, context.userId, data.char_id);
    const labels = { focus: "专注", short_break: "短休息", long_break: "长休息" };
    const { generate } = await import("./ai/service.server");
    const result = await generate({
      scene: "focus_companion",
      userId: context.userId,
      supabase: db,
      charId: character.id,
      systemPrompt: `${personaPrompt(profile, character)}\n\n你正在安静陪伴用户使用番茄钟。只输出一句简短、贴合人设的话；不要连续发消息，不要假装发生过线下互动。`,
      messages: [
        {
          role: "user",
          content: `${labels[data.mode]}计时 ${data.minutes} 分钟，事件：${data.event === "start" ? "刚刚开始" : "刚刚结束"}。`,
        },
      ],
      maxTokens: 100,
    });
    return { message: result.text.trim().slice(0, 500) };
  });

const foodInput = z.object({
  char_id: uuid,
  food: z.string().trim().min(1).max(80),
});

export const generateFoodCompanionMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => foodInput.parse(data))
  .handler(async ({ data, context }) => {
    const db = context.supabase as Db;
    const { character, profile } = await ownedPersona(db, context.userId, data.char_id);
    const { generate } = await import("./ai/service.server");
    const result = await generate({
      scene: "food_companion",
      userId: context.userId,
      supabase: db,
      charId: character.id,
      systemPrompt: `${personaPrompt(profile, character)}\n\n当前功能是“吃什么”：用户已经通过完整食物转盘随机得到结果。请针对这个既定结果，用符合人设的方式回应 1～3 句。不要重新随机，不要擅自换成另一种食物，不要输出大段营养分析，不要添加姓名、标题或引号。`,
      messages: [
        {
          role: "user",
          content: `转盘最终结果：${data.food}。请自然地说一句你的意见。`,
        },
      ],
      maxTokens: 160,
    });
    const message = result.text
      .trim()
      .replace(/^[“"']|[”"']$/g, "")
      .slice(0, 500);
    if (!message) throw new Error("角色暂时没有想好怎么评价。");
    return { message };
  });

const musicInput = z.object({
  track_id: uuid,
  char_id: uuid,
  message: z.string().trim().max(2000).optional(),
});

export const generateMusicCompanionMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => musicInput.parse(data))
  .handler(async ({ data, context }) => {
    const db = context.supabase as Db;
    const userId = context.userId;
    const [{ character, profile }, { data: track }, { data: history }] = await Promise.all([
      ownedPersona(db, userId, data.char_id),
      db
        .from("music_tracks")
        .select("*")
        .eq("id", data.track_id)
        .eq("user_id", userId)
        .maybeSingle(),
      db
        .from("music_messages")
        .select("role, content")
        .eq("track_id", data.track_id)
        .eq("char_id", data.char_id)
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(20),
    ]);
    if (!track) throw new Error("歌曲不存在或无法读取。");
    if (data.message) {
      const { error } = await db.from("music_messages").insert({
        user_id: userId,
        track_id: data.track_id,
        char_id: data.char_id,
        role: "user",
        content: data.message,
      });
      if (error) throw new Error("保存消息失败。");
    }
    const { generate } = await import("./ai/service.server");
    const result = await generate({
      scene: "music_companion",
      userId,
      supabase: db,
      charId: character.id,
      systemPrompt: `${personaPrompt(profile, character)}\n\n你正在和用户一起听歌。根据已知歌曲名称和歌手自然交流，只输出一条简短回复；不要编造具体歌词、曲风或音乐细节。`,
      messages: [
        ...(history || []).map((item: any) => ({ role: item.role, content: item.content })),
        {
          role: "user" as const,
          content:
            data.message ||
            `现在播放《${track.title}》${track.artist ? `，歌手 ${track.artist}` : ""}。说一句符合人设的听歌感受。`,
        },
      ],
      maxTokens: 180,
    });
    const content = result.text.trim().slice(0, 4000);
    const { data: inserted, error } = await db
      .from("music_messages")
      .insert({
        user_id: userId,
        track_id: data.track_id,
        char_id: data.char_id,
        role: "assistant",
        content,
      })
      .select("*")
      .single();
    if (error) throw new Error("保存角色回复失败。");
    return { message: inserted };
  });
