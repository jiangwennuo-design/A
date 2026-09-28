import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readCharacterChatPreferences,
  characterChatName,
  recentChatContext,
  memoryContext,
  newMemoryContents,
} from "../src/lib/character-chat.ts";
import { safeBubbleDeclarations, bubbleStyles } from "../src/lib/bubble-css.ts";
import { loadCharacterMemories, ownedMemoryCharacter } from "../src/lib/character-memory.server.ts";

test("private chat remarks survive reload, stay character-specific and preserve original names", () => {
  const a = { name: "角色甲", chat_preferences: { remark: "  小太阳  ", contextDepth: 7 } };
  const b = { name: "角色乙", chat_preferences: { remark: "" } };
  assert.equal(characterChatName(a), "小太阳");
  assert.equal(characterChatName(JSON.parse(JSON.stringify(a))), "小太阳");
  assert.equal(characterChatName(b), "角色乙");
  assert.equal(characterChatName({ name: "旧角色" }), "旧角色");
  assert.equal(characterChatName({ name: "角色甲", chat_preferences: { remark: "  " } }), "角色甲");
  assert.equal(a.name, "角色甲");
  assert.equal(readCharacterChatPreferences(a.chat_preferences).contextDepth, 7);
});

test("old characters default to 20; independent serialized preferences survive reload", () => {
  assert.equal(readCharacterChatPreferences(undefined).contextDepth, 20);
  const a = readCharacterChatPreferences({
    contextDepth: 7,
    longTermMemory: true,
    wallpaperPath: "u/chat-wallpapers/a/image.png",
  });
  const b = readCharacterChatPreferences({});
  assert.deepEqual(readCharacterChatPreferences(JSON.parse(JSON.stringify(a))), a);
  assert.equal(b.wallpaperPath, null);
  assert.equal(b.longTermMemory, false);
});
test("20 messages, preserving order and exact media-to-message attachment", () => {
  const rows = Array.from({ length: 35 }, (_, id) => ({
    id,
    message_type: id % 3 ? "text" : "image",
    payload: { file_path: `image-${id}.png` },
  }));
  assert.deepEqual(
    recentChatContext(rows).map((r) => r.id),
    rows.slice(15).map((r) => r.id),
  );
  assert.equal(recentChatContext(rows, 3)[0], rows[32]);
  assert.equal(recentChatContext(rows, 3)[1].payload.file_path, "image-33.png");
  assert.equal(rows.length, 35);
});
test("safe declarations are scoped to current role and text renderer on both sides", () => {
  const css = bubbleStyles(
    "char-a",
    "background: #007aff;color:#fff;",
    ".char {background-color: #eee; font-size: 18px;}",
  );
  assert.match(css, /data-chat-scope="char-a"/);
  assert.match(css, /is-user/);
  assert.match(css, /is-char/);
  assert.match(css, /message-content-wrapper>\.message-bubble/);
  assert.match(css, />\.chat-message-list /);
  assert.doesNotMatch(bubbleStyles("preview-a", "color:red", "", true), /chat-message-list/);
  assert.match(css, />p\{font-size:18px/);
  assert.doesNotMatch(css, /char-b|image-content|sticker|button|body/);
  assert.equal(bubbleStyles('a"] body', "color:red", ""), "");
  assert.equal(safeBubbleDeclarations(""), "");
});
test("reject global CSS, hidden controls, external URLs and viewport-sized shadows", () => {
  for (const css of [
    "body{display:none}",
    "position:fixed",
    "display:none",
    "opacity:0",
    "@import 'bad';",
    "background:url(https://example.invalid/x)",
    "color:var(--x)",
    "box-shadow:0 0 0 999999rem red",
    "font-size:0px",
    "padding:999px",
    "line-height:0",
    "transform:scale(0)",
    "color:red!important",
  ])
    assert.throws(() => safeBubbleDeclarations(css), css);
});
test("memory injection switch and character isolation", () => {
  const a = [{ id: "a", char_id: "a", content: "用户喜欢茶", updated_at: "2026-09-28T00:00:00Z" }];
  const b = [
    { id: "b", char_id: "b", content: "用户喜欢咖啡", updated_at: "2026-09-28T00:00:00Z" },
  ];
  assert.equal(memoryContext(false, a), "");
  assert.equal(memoryContext(true, []), "");
  assert.match(memoryContext(true, a), /用户喜欢茶/);
  assert.doesNotMatch(memoryContext(true, a), /咖啡/);
  assert.match(memoryContext(true, b), /咖啡/);
  assert.match(memoryContext(true, a), /updated_at/);
});
test("summary deduplicates without modifying saved records and limits capacity", () => {
  const rows = [{ id: "1", char_id: "a", content: "喜欢 茶", updated_at: "now" }];
  assert.deepEqual(newMemoryContents(["喜欢茶", "新的事实", "新的事实"], rows), ["新的事实"]);
  assert.equal(rows.length, 1);
  assert.deepEqual(
    newMemoryContents(
      ["新事实"],
      Array.from({ length: 40 }, (_, id) => ({
        id: String(id),
        char_id: "a",
        content: String(id),
        updated_at: "now",
      })),
    ),
    [],
  );
});
test("server reads require both owner and current character; role ownership checked", async () => {
  const calls = [];
  const query = {
    select: () => query,
    eq: (key, value) => {
      calls.push([key, value]);
      return query;
    },
    order: () => query,
    limit: () => Promise.resolve({ data: [], error: null }),
    maybeSingle: () => Promise.resolve({ data: { id: "char-a" }, error: null }),
  };
  const db = { from: () => query };
  await loadCharacterMemories(db, "owner", "char-a");
  assert.deepEqual(calls, [
    ["user_id", "owner"],
    ["char_id", "char-a"],
  ]);
  calls.length = 0;
  await ownedMemoryCharacter(db, "owner", "char-a");
  assert.deepEqual(calls, [
    ["id", "char-a"],
    ["user_id", "owner"],
  ]);
});
