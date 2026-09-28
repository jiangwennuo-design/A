/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CharacterMemory } from "./character-chat";

export async function ownedMemoryCharacter(db: any, userId: string, charId: string) {
  const { data, error } = await db
    .from("ai_personas")
    .select("*")
    .eq("id", charId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("角色不存在或无权访问。");
  return data;
}

export async function loadCharacterMemories(
  db: any,
  userId: string,
  charId: string,
): Promise<CharacterMemory[]> {
  const { data, error } = await db
    .from("character_memories")
    .select("id, char_id, content, updated_at")
    .eq("user_id", userId)
    .eq("char_id", charId)
    .order("updated_at", { ascending: false })
    .order("id")
    .limit(100);
  if (error) throw new Error("读取记忆库失败，请确认记忆数据库迁移已完成。");
  return data ?? [];
}
