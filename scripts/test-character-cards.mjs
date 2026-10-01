import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";
import { importCharacterCard, parseCharacterCard } from "../src/lib/character-card.ts";
import { worldBookFromText, importWorldBookFile } from "../src/lib/world-book-file.ts";
import { parseWorldBook, buildPromptContext } from "../src/lib/world-books.ts";

const card = {
  name: "测试角色🌤",
  description: "中文 / English & 符号",
  personality: "安静",
  scenario: "场景\n第二行",
  first_mes: "你好",
  mes_example: "{{user}}: hi\n{{char}}: hello",
};
const v2 = { spec: "chara_card_v2", spec_version: "2.0", data: card };
const v3 = { spec: "chara_card_v3", spec_version: "3.0", data: { ...card, name: "V3角色" } };
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4),
    crc = Buffer.alloc(4),
    body = Buffer.concat([Buffer.from(type), data]);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function png(...metadata) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return new File(
    [
      signature,
      chunk("IHDR", ihdr),
      ...metadata,
      chunk("IDAT", deflateSync(Buffer.from([0, 255, 255, 255, 255]))),
      chunk("IEND", Buffer.alloc(0)),
    ],
    "card.png",
    { type: "image/png" },
  );
}
function payload(data) {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64");
}

test("JSON V1/V2/V3 map persona, scene, greeting and examples to existing fields", async () => {
  for (const data of [card, v2, { ...v3, data: card }]) {
    const fields = await importCharacterCard(new File([JSON.stringify(data)], "角色.json"));
    assert.equal(fields.name, card.name);
    assert.equal(fields.description, card.description);
    assert.equal(fields.background, card.scenario);
    assert.equal(fields.personality, card.personality);
    assert.match(fields.additional_prompt, /【开场白】\n你好/);
    assert.ok(fields.additional_prompt.includes(card.mes_example));
    assert.equal(fields.id, undefined);
    assert.equal(fields.user_id, undefined);
  }
});
test("legacy aliases, extra rules and optional fields remain editable in the existing draft", () => {
  const fields = parseCharacterCard(
    JSON.stringify({
      char_name: "旧格式",
      char_persona: "人物",
      char_greeting: "开场",
      example_dialogue: "例子",
      world_scenario: "背景",
      speaking_style: "简短",
      additional_prompt: "已有补充",
      system_prompt: "补充规则",
      post_history_instructions: "其他规则",
      alternate_greetings: ["备选1", "备选2", null],
    }),
  );
  assert.equal(fields.description, "人物");
  assert.equal(fields.background, "背景");
  assert.equal(fields.speaking_style, "简短");
  for (const value of ["开场", "例子", "已有补充", "补充规则", "其他规则", "备选1", "备选2"])
    assert.ok(fields.additional_prompt.includes(value));
});
test("PNG chara Base64 UTF-8 / direct JSON, with V3 preferred over V2", async () => {
  for (const data of [payload(v2), JSON.stringify(v2)]) {
    const fields = await importCharacterCard(png(chunk("tEXt", Buffer.from(`chara\0${data}`))));
    assert.equal(fields.name, card.name);
  }
  const fields = await importCharacterCard(
    png(
      chunk("tEXt", Buffer.from(`chara\0${payload(v2)}`)),
      chunk("tEXt", Buffer.from(`ccv3\0${payload(v3)}`)),
    ),
  );
  assert.equal(fields.name, "V3角色");
});
test("PNG zTXt and compressed/uncompressed iTXt metadata", async () => {
  const raw = Buffer.from(JSON.stringify(v2));
  const formats = [
    chunk("zTXt", Buffer.concat([Buffer.from("chara\0\0"), deflateSync(Buffer.from(payload(v2)))])),
    chunk("iTXt", Buffer.concat([Buffer.from("chara\0\0\0\0\0"), raw])),
    chunk("iTXt", Buffer.concat([Buffer.from("chara\0\x01\0en\0title\0"), deflateSync(raw)])),
  ];
  for (const metadata of formats)
    assert.equal((await importCharacterCard(png(metadata))).name, card.name);
});
test("ordinary PNG / malformed files fail clearly without constructing a draft", async () => {
  await assert.rejects(importCharacterCard(png()), /未检测到角色卡数据/);
  await assert.rejects(importCharacterCard(new File(["fake"], "bad.png")), /不是有效/);
  await assert.rejects(
    importCharacterCard(
      new File([signature, Buffer.from([255, 255, 255, 255, 0, 0, 0, 0])], "broken.png"),
    ),
    /不完整|损坏/,
  );
  await assert.rejects(
    importCharacterCard(png(chunk("tEXt", Buffer.from("chara\0not base64!")))),
    /无法解码/,
  );
  assert.throws(() => parseCharacterCard("[]"), /未检测到/);
  assert.throws(() => parseCharacterCard("bad"), /JSON/);
  assert.throws(() => parseCharacterCard('{"name":"not a card"}'), /人设字段/);
});
test("DOCX text becomes enabled existing world entries: complete order and long text", () => {
  const text = "章节一\n中文 English & 😀\n\n" + "长文 & <符号>\n".repeat(30_000) + "结尾";
  const book = worldBookFromText(text, "测试.DOCX");
  assert.equal(book.name, "测试");
  assert.ok(book.entries.length > 1);
  assert.equal(book.entries.map((entry) => entry.content).join(""), text);
  for (const [index, entry] of book.entries.entries()) {
    assert.ok(entry.content.length <= 200_000);
    assert.equal(entry.disable, false);
    assert.equal(entry.constant, true);
    assert.equal(entry.order, index);
  }
  assert.match(buildPromptContext([{ ...book, enabled: true }]), /章节一/);
});
test("existing JSON world-book parsing is unchanged, including Tavo/raw/disable", async () => {
  const text = JSON.stringify({
    tavo_spec: "lorebook",
    tavo_spec_version: 2,
    entries: { 0: { content: "已有内容", disable: true, future: { key: 3 } } },
  });
  assert.deepEqual(
    await importWorldBookFile(new File([text], "原书.json")),
    parseWorldBook(text, "原书.json"),
  );
});
