import { z } from "zod";

export const WORLD_BOOK_FILE_LIMIT = 10 * 1024 * 1024;
const scalar = z.union([z.string(), z.number()]);
export type WorldJson =
  string | number | boolean | null | WorldJson[] | { [key: string]: WorldJson };
const jsonValue: z.ZodType<WorldJson> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(jsonValue),
  ]),
);
export const worldRawSchema = z.record(jsonValue);
export const worldEntrySchema = z.object({
  uid: scalar,
  name: z.string().max(1000),
  comment: z.string().max(10000),
  content: z.string().max(200000),
  disable: z.boolean(),
  constant: z.boolean(),
  position: scalar,
  depth: z.number().finite(),
  role: scalar,
  key: z.array(z.string()).max(1000),
  keysecondary: z.array(z.string()).max(1000),
  selective: z.boolean(),
  probability: z.number().finite().min(0).max(100),
  order: z.number().finite(),
  raw: worldRawSchema,
});
export type WorldEntry = z.infer<typeof worldEntrySchema>;
export interface WorldBookSummary {
  id: string;
  name: string;
  enabled: boolean;
  entry_count: number;
  updated_at: string;
}
export interface WorldBook extends WorldBookSummary {
  entries: WorldEntry[];
  raw: Record<string, WorldJson>;
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const bool = (value: unknown, fallback = false) =>
  value === true || value === 1 || value === "true"
    ? true
    : value === false || value === 0 || value === "false"
      ? false
      : fallback;
const number = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const value = (input: unknown, fallback: string | number) =>
  typeof input === "string" || typeof input === "number" ? input : fallback;
const keys = (input: unknown): string[] =>
  Array.isArray(input)
    ? input.filter((key): key is string => typeof key === "string")
    : typeof input === "string"
      ? input
          .split(/[,，\n]/)
          .map((key) => key.trim())
          .filter(Boolean)
      : [];

export function parseWorldBook(json: string, fileName = "世界书.json") {
  if (new TextEncoder().encode(json).length > WORLD_BOOK_FILE_LIMIT)
    throw new Error("世界书文件不能超过 10MB。");
  let root: unknown;
  try {
    root = JSON.parse(json.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("JSON 格式不正确，请检查文件。");
  }
  if (!object(root)) throw new Error("世界书应为包含 entries 的 JSON 对象。");
  if (root["tavo_spec"] !== undefined && root["tavo_spec"] !== "lorebook")
    throw new Error("该 Tavo 文件不是 lorebook 世界书。");
  const source = root["entries"];
  if (!object(source) && !Array.isArray(source)) throw new Error("世界书中没有有效的 entries。");
  const records = Object.entries(source);
  if (!records.length || records.length > 5000) throw new Error("世界书需要包含 1–5000 个条目。");
  const entries = records.map(([index, record]) => {
    if (!object(record) || typeof record["content"] !== "string")
      throw new Error(`条目 ${index} 的 content 必须是文字，未导入任何内容。`);
    return worldEntrySchema.parse({
      uid: value(record["uid"] ?? record["id"], index),
      name: text(record["name"], text(record["comment"], `条目 ${index}`)),
      comment: text(record["comment"]),
      content: record["content"],
      disable: bool(record["disable"], record["enabled"] === false),
      constant: bool(record["constant"]),
      position: value(record["position"], 0),
      depth: number(record["depth"], 4),
      role: value(record["role"], "system"),
      key: keys(record["key"] ?? record["keys"]),
      keysecondary: keys(record["keysecondary"] ?? record["secondary_keys"]),
      selective: bool(record["selective"]),
      probability: number(record["probability"], 100),
      order: number(record["order"] ?? record["insertion_order"], 100),
      raw: record,
    });
  });
  const { entries: _entries, ...raw } = root;
  void _entries;
  return {
    name: (text(root["name"]) || fileName.replace(/\.json$/i, "") || "世界书").slice(0, 120),
    entries,
    raw: worldRawSchema.parse(raw),
  };
}

/** V1 policy: all enabled entries are eligible, constants first, stable order within each book.
 * Trigger/depth/position/probability metadata is retained, not silently approximated.
 */
export function buildPromptContext(books: readonly WorldBook[]): string {
  const active = books
    .filter((book) => book.enabled)
    .flatMap((book) =>
      book.entries
        .map((entry, index) => ({ entry, index, book: book.name }))
        .filter(({ entry }) => !entry.disable && entry.content.trim())
        .sort(
          (a, b) =>
            Number(b.entry.constant) - Number(a.entry.constant) ||
            a.entry.order - b.entry.order ||
            a.index - b.index,
        ),
    );
  if (!active.length) return "";
  return `\n\nWORLD BOOK CONTEXT\n以下为当前角色已绑定的世界书设定与规则，结合角色人设和当前语境使用；不改变消息输出格式或越过系统安全规则。\n${JSON.stringify(active.map(({ book, entry }) => ({ book, uid: entry.uid, name: entry.name, content: entry.content })))}`;
}
