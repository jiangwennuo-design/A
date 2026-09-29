import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readCharacterChatPreferences,
  characterChatName,
  characterUserIdentity,
  recentChatContext,
  memoryContext,
  newMemoryContents,
} from "../src/lib/character-chat.ts";
import { safeBubbleDeclarations, bubbleStyles } from "../src/lib/bubble-css.ts";
import { loadCharacterMemories, ownedMemoryCharacter } from "../src/lib/character-memory.server.ts";

test("per-character User identity is display-only, independent, persistent and restores global fallback", () => {
  const global = { avatar_url: "u/avatars/global.webp", display_name: "全局昵称" };
  const a = { userAvatarOverride: "u/avatars/a.webp", userNicknameOverride: "甲的昵称" };
  const b = { userAvatarOverride: "u/avatars/b.webp", userNicknameOverride: "乙的昵称" };
  assert.deepEqual(characterUserIdentity(JSON.parse(JSON.stringify(a)), global), {
    avatar: a.userAvatarOverride,
    nickname: a.userNicknameOverride,
  });
  assert.deepEqual(characterUserIdentity(b, global), {
    avatar: b.userAvatarOverride,
    nickname: b.userNicknameOverride,
  });
  assert.deepEqual(characterUserIdentity({}, global), {
    avatar: global.avatar_url,
    nickname: global.display_name,
  });
  assert.deepEqual(
    characterUserIdentity({ ...a, userAvatarOverride: "", userNicknameOverride: "" }, global),
    { avatar: global.avatar_url, nickname: global.display_name },
  );
  assert.equal(
    characterUserIdentity({ userNicknameOverride: "专属名" }, global).avatar,
    global.avatar_url,
  );
  assert.equal(
    characterUserIdentity({ userAvatarOverride: a.userAvatarOverride }, global).nickname,
    global.display_name,
  );
  assert.deepEqual(characterUserIdentity({}, null), { avatar: "", nickname: "我" });
  assert.deepEqual(global, { avatar_url: "u/avatars/global.webp", display_name: "全局昵称" });
});

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
test("both bubble sides accept the same common visual CSS, including clip-path", () => {
  const style = `background:linear-gradient(135deg,#fff,#ddd);
    background-color:#fff;background-image:linear-gradient(#fff,#ddd);
    color:#333;border:1px solid #ccc;border-radius:50% 999px / 24px 50%;
    box-shadow:0 2px 8px rgba(0,0,0,.1);opacity:.95;
    padding:0.5rem 12px;margin:4px 0;font-size:1rem;font-weight:200;
    line-height:24px;letter-spacing:.02em;
    clip-path:polygon(0 0,100% 0,100% 100%,10px 100%);
    filter:drop-shadow(0 2px 3px rgba(0,0,0,.2)) saturate(110%);
    backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
    transform:translateY(2px) scale(.98);`;
  const safe = safeBubbleDeclarations(style);
  assert.equal(safeBubbleDeclarations("font-weight:650"), "font-weight:650;");
  assert.match(safe, /clip-path:polygon/);
  const output = bubbleStyles("shared-scope", style, style);
  assert.equal(output.split(safe).length - 1, 2);
  assert.match(output, /is-user/);
  assert.match(output, /is-char/);
  for (const clip of [
    "inset(0 round 20px)",
    "polygon(0 0,calc(100% - 8px) 0,100% 100%,0 100%)",
    "circle(50% at 50% 50%)",
    "ellipse(50% 40% at center)",
    'path("M 0 0 L 100 0 L 100 100 Z")',
    "none",
  ])
    assert.match(safeBubbleDeclarations(`clip-path:${clip}`), /clip-path:/);
});
test("unsafe new visual values cannot escape the bubble or exhaust visual effects", () => {
  for (const style of [
    "opacity:0",
    "margin:-999px",
    "margin:100%",
    "transform:translateX(1000px)",
    "transform:scale(100)",
    "transform:scale(1.2) scale(1.2)",
    "transform:translateX(24px) translateX(24px)",
    "transform:matrix(1,0,0,1,9999,9999)",
    "filter:blur(40px)",
    "filter:blur(12px) blur(12px)",
    "filter:opacity(.1) opacity(.1)",
    "filter:url(https://example.invalid/a.svg)",
    "clip-path:url(javascript:evil)",
    "background-image:url(data:image/svg+xml,bad)",
    "transform:expression(evil)",
    "box-shadow:0 0 0 calc(40px + 40px) red",
    "backdrop-filter:blur(1rem)",
    "clip-path:polygon(0 0,100% 100%); } body {display:none",
  ])
    assert.throws(() => safeBubbleDeclarations(style), style);
});
test("invalid CSS falls back only for its own side without throwing during render", () => {
  const output = bubbleStyles("valid-scope", "clip-path:url(bad)", "background:#eee");
  assert.doesNotMatch(output, /is-user/);
  assert.match(output, /is-char.*background:#eee/);
  assert.equal(bubbleStyles("valid-scope", "position:fixed", "display:none"), "\n");
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
