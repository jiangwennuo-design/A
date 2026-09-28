import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWorldBook, buildPromptContext } from "../src/lib/world-books.ts";
import { readCharacterChatPreferences } from "../src/lib/character-chat.ts";
import { loadBoundWorldBooks } from "../src/lib/world-books.server.ts";

test("Tavo v2/object entries: preserve normalized fields and unknown raw metadata", () => {
  const original = {
    uid: 12,
    name: "测试规则",
    comment: "备注",
    content: "规则正文",
    disable: true,
    constant: true,
    position: 3,
    depth: 8,
    role: 1,
    key: ["天气"],
    keysecondary: ["雨"],
    selective: true,
    probability: 45,
    order: 2,
    future: { custom: "保留" },
  };
  const book = parseWorldBook(
    "\uFEFF" +
      JSON.stringify({
        tavo_spec: "lorebook",
        tavo_spec_version: 2,
        extension: { x: 1 },
        entries: { 0: original },
      }),
    "测试.json",
  );
  assert.equal(book.name, "测试");
  for (const [key, value] of Object.entries(original)) {
    if (key !== "future") assert.deepEqual(book.entries[0][key], value);
  }
  assert.deepEqual(book.entries[0].raw, original);
  assert.deepEqual(book.raw.extension, { x: 1 });
  assert.equal(book.raw.tavo_spec_version, 2);
  assert.equal(book.raw.entries, undefined);
});
test("array format, aliases and explicit disable=false", () => {
  const book = parseWorldBook(
    JSON.stringify({
      entries: [
        {
          id: "x",
          comment: "标题",
          content: "正文",
          disable: false,
          enabled: false,
          keys: "甲,乙\n丙",
          secondary_keys: ["丁"],
          insertion_order: 9,
        },
      ],
    }),
  );
  assert.equal(book.entries[0].disable, false);
  assert.equal(book.entries[0].name, "标题");
  assert.deepEqual(book.entries[0].key, ["甲", "乙", "丙"]);
  assert.deepEqual(book.entries[0].keysecondary, ["丁"]);
  assert.equal(book.entries[0].order, 9);
});
test("invalid files fail atomically", () => {
  for (const data of [
    "bad",
    "[]",
    '{"entries":{}}',
    '{"tavo_spec":"character","entries":{"0":{"content":"x"}}}',
    '{"entries":{"0":{"content":"valid"},"1":{"content":7}}}',
  ])
    assert.throws(() => parseWorldBook(data));
});
test("prompt excludes disabled books/entries, prioritizes constants with stable order", () => {
  const parsed = parseWorldBook(
    JSON.stringify({
      entries: [
        { content: "普通后", order: 8 },
        { content: "关闭条目", disable: true },
        { content: "常驻", constant: true, order: 99 },
        { content: "普通前", order: 1 },
      ],
    }),
  );
  const book = {
    ...parsed,
    id: crypto.randomUUID(),
    entry_count: 4,
    enabled: true,
    updated_at: "now",
  };
  const prompt = buildPromptContext([book, { ...book, name: "停用本", enabled: false }]);
  assert.doesNotMatch(prompt, /关闭条目|停用本/);
  assert.ok(prompt.indexOf("常驻") < prompt.indexOf("普通前"));
  assert.ok(prompt.indexOf("普通前") < prompt.indexOf("普通后"));
  assert.equal(buildPromptContext([{ ...book, enabled: false }]), "");
});
test("bindings are character-local and backward-compatible", () => {
  const id = crypto.randomUUID();
  const a = readCharacterChatPreferences({ worldBookIds: [id], contextDepth: 30 });
  const b = readCharacterChatPreferences({ contextDepth: 20 });
  assert.deepEqual(a.worldBookIds, [id]);
  assert.deepEqual(b.worldBookIds, []);
  assert.deepEqual(readCharacterChatPreferences(JSON.parse(JSON.stringify(a))), a);
});
test("unbound characters skip DB; loader owner/enable filters and binding order", async () => {
  const a = crypto.randomUUID(),
    b = crypto.randomUUID();
  const filters = [];
  const q = {
    select: () => q,
    eq: (key, value) => {
      filters.push([key, value]);
      return q;
    },
    in: (key, ids) => {
      filters.push([key, ids]);
      return Promise.resolve({ data: [{ id: b }, { id: a }], error: null });
    },
  };
  const db = {
    from: (table) => {
      assert.equal(table, "world_books");
      return q;
    },
  };
  assert.deepEqual(
    await loadBoundWorldBooks({ from: () => assert.fail("unexpected DB query") }, "owner", []),
    [],
  );
  assert.deepEqual(
    (await loadBoundWorldBooks(db, "owner", [a, b, a])).map((row) => row.id),
    [a, b],
  );
  assert.deepEqual(filters.slice(0, 2), [
    ["user_id", "owner"],
    ["enabled", true],
  ]);
});
