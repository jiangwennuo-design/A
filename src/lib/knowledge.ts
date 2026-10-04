import { z } from "zod";

export const knowledgeCardSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().max(500).default(""),
  content: z.string().max(500_000).default(""),
  tags: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  links: z.array(z.string().min(1).max(200)).max(1000).default([]),
  sourceType: z.enum(["manual", "diary", "chat", "clip", "image", "import"]).default("manual"),
  sourceId: z.string().max(200).default(""),
  sourceLabel: z.string().max(500).default(""),
  sourceUrl: z.string().max(2000).default(""),
  sourceContextId: z.string().max(200).default(""),
  images: z
    .array(
      z
        .string()
        .max(2000)
        .refine(
          (value) => !/^(data:|blob:|javascript:)/i.test(value),
          "请使用已上传图片或 HTTP 图片地址。",
        ),
    )
    .max(30)
    .default([]),
  originalCreatedAt: z.string().max(80).default(""),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archived: z.boolean().default(false),
});
export type KnowledgeCard = z.infer<typeof knowledgeCardSchema>;

export function newKnowledgeCard(patch: Partial<KnowledgeCard> = {}): KnowledgeCard {
  const now = new Date().toISOString();
  return knowledgeCardSchema.parse({
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    ...patch,
  });
}
export const cardTitle = (card: KnowledgeCard) =>
  card.title.trim() || card.content.trim().split("\n")[0]?.slice(0, 40) || "无题";
export const cardSummary = (card: KnowledgeCard, limit = 110) =>
  card.content.replace(/\[\[([^\]]+)\]\]/g, "$1").slice(0, limit);
export function knowledgeDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replace(/-/g, "/");
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}
export function unlinkKnowledgeCard(
  card: KnowledgeCard,
  target: KnowledgeCard | undefined,
  id: string,
) {
  return {
    ...card,
    links: card.links.filter((link) => link !== id),
    content: target
      ? card.content.split(`[[${cardTitle(target)}]]`).join(cardTitle(target))
      : card.content,
  };
}

/** Explicit IDs remain stable when titles change; wiki text can add new references. */
export function resolveKnowledgeLinks(card: KnowledgeCard, cards: KnowledgeCard[]) {
  const byTitle = new Map(cards.map((item) => [cardTitle(item).toLocaleLowerCase(), item.id]));
  const links = new Set(card.links);
  for (const match of card.content.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    const id = byTitle.get(match[1]!.trim().toLocaleLowerCase());
    if (id && id !== card.id) links.add(id);
  }
  return [...links].filter((id) => id !== card.id);
}

export function knowledgeRelations(cards: KnowledgeCard[]) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const incoming = new Map<string, string[]>();
  const adjacent = new Map<string, Set<string>>();
  cards.forEach((card) => adjacent.set(card.id, new Set()));
  for (const card of cards)
    for (const id of new Set(card.links)) {
      if (!byId.has(id) || id === card.id) continue;
      incoming.set(id, [...(incoming.get(id) ?? []), card.id]);
      adjacent.get(card.id)!.add(id);
      adjacent.get(id)!.add(card.id);
    }
  return { byId, incoming, adjacent };
}

export function knowledgeGraph(cards: KnowledgeCard[], center: string, depth: number, limit = 40) {
  const { byId, adjacent } = knowledgeRelations(cards);
  if (!byId.has(center))
    return { nodes: [] as KnowledgeCard[], edges: [] as [string, string][], truncated: false };
  const seen = new Set([center]);
  let frontier = [center];
  let truncated = false;
  const layers = depth === 0 ? limit : Math.min(3, Math.max(1, depth));
  for (let layer = 0; layer < layers && frontier.length; layer++) {
    const next: string[] = [];
    for (const id of frontier)
      for (const neighbor of adjacent.get(id) ?? []) {
        if (seen.has(neighbor)) continue;
        if (seen.size >= limit) {
          truncated = true;
          continue;
        }
        seen.add(neighbor);
        next.push(neighbor);
      }
    frontier = next;
  }
  const edges: [string, string][] = [];
  for (const id of seen)
    for (const target of byId.get(id)!.links)
      if (seen.has(target) && target !== id) edges.push([id, target]);
  return { nodes: [...seen].map((id) => byId.get(id)!), edges, truncated };
}

export function searchKnowledge(cards: KnowledgeCard[], query: string, kind = "全部") {
  const search = query.trim().toLocaleLowerCase();
  return cards.filter((card) => {
    const fields =
      kind === "标签"
        ? card.tags
        : kind === "内容"
          ? [card.content]
          : kind === "卡片"
            ? [card.title, card.content]
            : [card.title, card.content, ...card.tags, card.sourceLabel, card.sourceUrl];
    return fields.some((value) => value.toLocaleLowerCase().includes(search));
  });
}

export function cardFromDiary(diary: {
  id: string;
  title: string;
  content: string;
  diary_date: string;
}) {
  return newKnowledgeCard({
    title: diary.title,
    content: diary.content,
    sourceType: "diary",
    sourceId: diary.id,
    sourceLabel: "此心一笺",
    originalCreatedAt: diary.diary_date,
  });
}

/** Own export format plus simple JSON arrays, TXT/Markdown and readable HTML clippings. */
export function parseKnowledgeImport(
  text: string,
  name: string,
  htmlText?: string,
): KnowledgeCard[] {
  if (!text.trim()) throw new Error("文件没有可导入的内容。");
  if (/\.json$/i.test(name)) {
    const parsed: unknown = JSON.parse(text);
    if (
      parsed &&
      typeof parsed === "object" &&
      "schemaVersion" in parsed &&
      parsed.schemaVersion !== 1
    )
      throw new Error("此备份版本暂不支持，未导入任何内容。");
    const raw = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && "cards" in parsed
        ? parsed.cards
        : [parsed];
    if (!Array.isArray(raw) || raw.length > 2000)
      throw new Error("JSON 应为卡片数组，单次最多 2000 张。");
    const now = new Date().toISOString();
    const ids = new Map<string, string>();
    const cards = raw.map((row) => {
      if (!row || typeof row !== "object") throw new Error("JSON 卡片格式无效。");
      const oldId = typeof row.id === "string" ? row.id : "";
      const id = crypto.randomUUID();
      if (oldId) {
        if (ids.has(oldId)) throw new Error("导入文件包含重复卡片 ID。");
        ids.set(oldId, id);
      }
      return knowledgeCardSchema.parse({
        ...row,
        id,
        createdAt: row.createdAt || now,
        updatedAt: now,
        sourceType: row.sourceType || "import",
        sourceLabel: row.sourceLabel || name,
      });
    });
    return cards.map((card) => ({
      ...card,
      links: card.links.map((id) => ids.get(id)).filter((id): id is string => Boolean(id)),
    }));
  }
  if (!/\.(txt|md|markdown|html|htm)$/i.test(name))
    throw new Error("支持 JSON、TXT、Markdown 和 HTML 剪藏文件。");
  return [
    newKnowledgeCard({
      title: name.replace(/\.[^.]+$/, ""),
      content: htmlText ?? text,
      sourceType: "clip",
      sourceLabel: name,
    }),
  ];
}
