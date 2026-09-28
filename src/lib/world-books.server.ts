/* eslint-disable @typescript-eslint/no-explicit-any */
import type { WorldBook } from "./world-books";

export async function loadBoundWorldBooks(
  db: any,
  userId: string,
  ids: readonly string[],
): Promise<WorldBook[]> {
  if (!ids.length) return [];
  const { data, error } = await db
    .from("world_books")
    .select("*")
    .eq("user_id", userId)
    .eq("enabled", true)
    .in("id", [...new Set(ids)]);
  if (error) throw new Error("读取世界书失败，请稍后重试。");
  // Ownership and enabled filtering are enforced both in the query and by RLS.
  const books = (data ?? []) as WorldBook[];
  return [...new Set(ids)].flatMap((id) => books.filter((book) => book.id === id));
}
