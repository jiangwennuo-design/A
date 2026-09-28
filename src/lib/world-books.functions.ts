/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  WORLD_BOOK_FILE_LIMIT,
  worldEntrySchema,
  worldRawSchema,
  type WorldBook,
  type WorldBookSummary,
} from "./world-books";

const idInput = z.object({ id: z.string().uuid() });
const nameSchema = z.string().trim().min(1).max(120);
async function ownedBook(db: any, userId: string, id: string): Promise<WorldBook> {
  const { data, error } = await db
    .from("world_books")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("世界书不存在或无权访问。");
  return data;
}
const metadata = "id, name, enabled, entry_count, updated_at";

export const listWorldBooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("world_books")
      .select(metadata)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("世界书列表读取失败。");
    return (data ?? []) as WorldBookSummary[];
  });

export const getWorldBook = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => idInput.parse(input))
  .handler(({ data, context }) => ownedBook(context.supabase, context.userId, data.id));

export const importWorldBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        name: nameSchema,
        entries: z.array(worldEntrySchema).min(1).max(5000),
        raw: worldRawSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (
      new TextEncoder().encode(JSON.stringify(data)).length >
      WORLD_BOOK_FILE_LIMIT * 2 + 1024 * 1024
    )
      throw new Error("世界书内容过大，未导入。");
    const { data: saved, error } = await (context.supabase as any)
      .from("world_books")
      .insert({ ...data, user_id: context.userId })
      .select(metadata)
      .single();
    if (error || !saved) throw new Error("世界书导入保存失败。");
    return saved as WorldBookSummary;
  });

export const updateWorldBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    idInput.extend({ name: nameSchema.optional(), enabled: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ownedBook(context.supabase, context.userId, data.id);
    const { id, ...patch } = data;
    const { data: saved, error } = await (context.supabase as any)
      .from("world_books")
      .update(patch)
      .eq("id", id)
      .eq("user_id", context.userId)
      .select(metadata)
      .single();
    if (error || !saved) throw new Error("世界书保存失败。");
    return saved as WorldBookSummary;
  });

export const saveWorldEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    idInput
      .extend({ index: z.number().int().min(0), updated_at: z.string(), entry: worldEntrySchema })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const book = await ownedBook(context.supabase, context.userId, data.id);
    if (book.updated_at !== data.updated_at)
      throw new Error("世界书已在其他页面更新，请重新打开后编辑。");
    if (!book.entries[data.index]) throw new Error("条目不存在。");
    const entries = [...book.entries];
    const entry = data.entry;
    entries[data.index] = {
      ...entry,
      raw: {
        ...book.entries[data.index]!.raw,
        ...entry.raw,
        uid: entry.uid,
        name: entry.name,
        comment: entry.comment,
        content: entry.content,
        disable: entry.disable,
        constant: entry.constant,
        position: entry.position,
        depth: entry.depth,
        role: entry.role,
        key: entry.key,
        keysecondary: entry.keysecondary,
        selective: entry.selective,
        probability: entry.probability,
        order: entry.order,
      },
    };
    const { data: saved, error } = await (context.supabase as any)
      .from("world_books")
      .update({ entries })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("updated_at", data.updated_at)
      .select("*")
      .single();
    if (error || !saved) throw new Error("保存失败或世界书已被更新，请重新打开后编辑。");
    return saved as WorldBook;
  });

export const worldBookBindings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    await ownedBook(context.supabase, context.userId, data.id);
    const { data: characters, error } = await (context.supabase as any)
      .from("ai_personas")
      .select("id, name")
      .eq("user_id", context.userId)
      .contains("chat_preferences", { worldBookIds: [data.id] });
    if (error) throw new Error("读取角色绑定失败。");
    return (characters ?? []) as { id: string; name: string }[];
  });

export const deleteWorldBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    idInput.extend({ confirmedBindings: z.boolean().default(false) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await ownedBook(context.supabase, context.userId, data.id);
    const db = context.supabase as any;
    const { data: bindings, error: bindingError } = await db
      .from("ai_personas")
      .select("id")
      .eq("user_id", context.userId)
      .contains("chat_preferences", { worldBookIds: [data.id] });
    if (bindingError) throw new Error("检查角色绑定失败。");
    if (bindings?.length && !data.confirmedBindings)
      throw new Error("该世界书已有角色绑定，请确认后删除。");
    const { data: removed, error } = await db
      .from("world_books")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("id")
      .single();
    if (error || !removed) throw new Error("世界书删除失败。");
    return { ok: true };
  });
