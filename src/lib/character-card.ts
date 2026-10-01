import type { AiPersona } from "./types";

const FILE_LIMIT = 10 * 1024 * 1024;
const METADATA_LIMIT = 3 * 1024 * 1024;
export const characterCardAccept = ".json,.png,application/json,image/png";
type CardFields = Partial<
  Pick<
    AiPersona,
    | "name"
    | "description"
    | "personality"
    | "speaking_style"
    | "background"
    | "interests"
    | "dislikes"
    | "relationship"
    | "additional_prompt"
  >
> & { name: string };

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseCharacterCard(json: string): CardFields {
  if (new TextEncoder().encode(json).length > METADATA_LIMIT)
    throw new Error("角色卡文字数据不能超过 3 MB。");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("角色卡 JSON 格式无效。");
  }
  const root = object(parsed);
  if (!root) throw new Error("未检测到角色卡数据。");
  if (root["spec"] && root["spec"] !== "chara_card_v2" && root["spec"] !== "chara_card_v3")
    throw new Error("暂不支持该角色卡 spec 格式。");
  const data = object(root["data"]) ?? root;
  const text = (...keys: string[]) => {
    for (const key of keys) if (typeof data[key] === "string") return data[key] as string;
    return "";
  };
  const name = text("name", "char_name").trim();
  if (!name) throw new Error("角色卡缺少角色名称。");
  if (
    ![
      "description",
      "char_persona",
      "personality",
      "scenario",
      "first_mes",
      "char_greeting",
      "mes_example",
      "example_dialogue",
      "background",
      "world_scenario",
      "greeting",
      "additional_prompt",
    ].some((key) => typeof data[key] === "string")
  )
    throw new Error("未检测到角色卡人设字段。");
  const additional = [
    text("additional_prompt"),
    ["开场白", text("first_mes", "char_greeting", "greeting")],
    ["示例对话", text("mes_example", "example_dialogue")],
    ["角色补充规则", text("system_prompt")],
    ["对话补充规则", text("post_history_instructions")],
    [
      "备选开场白",
      Array.isArray(data["alternate_greetings"])
        ? data["alternate_greetings"]
            .filter((value): value is string => typeof value === "string")
            .join("\n\n")
        : "",
    ],
  ]
    .map((section) =>
      typeof section === "string" ? section : section[1] ? `【${section[0]}】\n${section[1]}` : "",
    )
    .filter(Boolean)
    .join("\n\n");
  return {
    name,
    description: text("description", "char_persona"),
    personality: text("personality"),
    background: text("background", "scenario", "world_scenario"),
    speaking_style: text("speaking_style"),
    interests: text("interests"),
    dislikes: text("dislikes"),
    relationship: text("relationship"),
    additional_prompt: additional,
  };
}

export async function importCharacterCard(file: File): Promise<CardFields> {
  if (!file.size) throw new Error("角色卡文件为空。");
  if (file.size > FILE_LIMIT) throw new Error("角色卡文件不能超过 10 MB。");
  const name = file.name.toLowerCase();
  if (name.endsWith(".json")) return parseCharacterCard(await file.text());
  if (!name.endsWith(".png")) throw new Error("请选择 JSON 或 PNG 角色卡。");
  return parseCharacterCard(await readPngCard(new Uint8Array(await file.arrayBuffer())));
}

async function readPngCard(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value))
    throw new Error("文件不是有效的 PNG 图片。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const candidates = new Map<string, string>();
  let ended = false;
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) throw new Error("PNG 文件不完整。");
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) throw new Error("PNG 文件块已损坏。");
    const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    if (["tEXt", "iTXt", "zTXt"].includes(type)) {
      const chunk = bytes.subarray(offset + 8, offset + 8 + length);
      const separator = chunk.indexOf(0);
      const key = separator >= 0 ? new TextDecoder().decode(chunk.subarray(0, separator)) : "";
      if (["chara", "ccv3", "character"].includes(key)) {
        if (length > METADATA_LIMIT * 2) throw new Error("PNG 角色卡 metadata 过大。");
        let body = chunk.subarray(separator + 1);
        let compressed = false;
        if (type === "zTXt") {
          if (body[0] !== 0) throw new Error("PNG metadata 压缩格式不支持。");
          compressed = true;
          body = body.subarray(1);
        } else if (type === "iTXt") {
          if (body.length < 4 || body[0]! > 1 || body[1] !== 0)
            throw new Error("PNG metadata 格式损坏。");
          compressed = body[0] === 1;
          body = body.subarray(2);
          for (let index = 0; index < 2; index++) {
            const end = body.indexOf(0);
            if (end < 0) throw new Error("PNG metadata 格式损坏。");
            body = body.subarray(end + 1);
          }
        }
        const payload = compressed ? await inflateMetadata(body) : new TextDecoder().decode(body);
        candidates.set(key, decodeCardPayload(payload));
      }
    }
    offset += length + 12;
    if (type === "IEND") {
      ended = true;
      break;
    }
  }
  if (!ended) throw new Error("PNG 文件不完整。");
  const selected = candidates.get("ccv3") ?? candidates.get("chara") ?? candidates.get("character");
  if (!selected) throw new Error("未检测到角色卡数据。");
  return selected;
}

function decodeCardPayload(text: string) {
  const clean = text.trim();
  if (clean.startsWith("{")) return clean;
  try {
    const binary = atob(clean);
    if (binary.length > METADATA_LIMIT) throw new Error("too large");
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(binary, (value) => value.charCodeAt(0)),
    );
  } catch {
    throw new Error("PNG 角色卡 metadata 无法解码。");
  }
}

async function inflateMetadata(bytes: Uint8Array) {
  const reader = new Blob([new Uint8Array(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"))
    .getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > METADATA_LIMIT * 2) throw new Error("PNG 解压 metadata 过大。");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(result);
}
