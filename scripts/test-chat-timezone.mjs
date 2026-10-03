import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import * as preferences from "../src/lib/character-chat.ts";
import {
  chatTimeZoneContext,
  isValidTimeZone,
  availableTimeZones,
  PHONE_CHAT_CONTEXT,
} from "../src/lib/chat-timezone.ts";
import { characterChatSchema, readCharacterChatPreferences } from "../src/lib/character-chat.ts";

test("actual chat character editor saves timezone to owned DB row and restores it on remount", async () => {
  const records = [
    {
      id: "a",
      user_id: "owner",
      name: "A",
      minimum_messages: 1,
      maximum_messages: 3,
      chat_preferences: { wallpaperPath: "owner/a.webp", contextDepth: 9 },
    },
    { id: "b", user_id: "owner", name: "B", chat_preferences: {} },
  ];
  let cursor = 0,
    states = [],
    closed = 0;
  const PersonaEditor = () => null,
    Extras = () => null;
  const deps = {
    "react/jsx-runtime": jsx,
    react: {
      useEffect() {},
      useRef: () => ({ current: null }),
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [
          states[index],
          (next) => {
            states[index] = typeof next === "function" ? next(states[index]) : next;
          },
        ];
      },
    },
    "lucide-react": { ChevronLeft: () => null },
    "@/components/ui-kit": { ErrorBanner: () => null },
    "@/hooks/useKeyboardViewport": { useKeyboardViewport() {} },
    "@/components/contacts/PersonaEditor": { PersonaEditor },
    "./CharacterChatExtras": { CharacterChatExtras: Extras },
    "@/lib/character-chat": preferences,
    "@/lib/bubble-css": { safeBubbleDeclarations() {} },
    "@/lib/appearance": { scopeAppearanceCss() {} },
    "@/lib/character-wallpaper": {},
    "@/lib/chat-wallpaper-state": {
      useCharacterWallpaper() {},
      readCharacterWallpaper: () => ({ wallpaperPath: "owner/a.webp", wallpaperUrl: null }),
    },
    "@/integrations/supabase/client": {
      supabase: {
        from: () => {
          let patch,
            filters = {};
          const query = {
            update: (value) => {
              patch = value;
              return query;
            },
            eq: (key, value) => {
              filters[key] = value;
              return query;
            },
            select: () => query,
            single: async () => {
              const row = records.find((r) => r.id === filters.id && r.user_id === filters.user_id);
              assert.ok(row);
              Object.assign(row, structuredClone(patch));
              return { data: structuredClone(row), error: null };
            },
          };
          return query;
        },
      },
    },
  };
  const code = ts.transpileModule(
    await readFile(
      new URL("../src/components/chat/ChatCharacterEditor.tsx", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (key) => {
      assert.ok(key in deps, key);
      return deps[key];
    },
  });
  function walk(node) {
    return !node || typeof node !== "object"
      ? []
      : [node, ...[node.props?.children, node.props?.extraSettings].flat(Infinity).flatMap(walk)];
  }
  const render = () => {
    cursor = 0;
    return exports.ChatCharacterEditor({
      character: records[0],
      userId: "owner",
      open: true,
      defaultMode: "off",
      onClose: () => closed++,
      onSaved: () => {},
      onDeleted: () => {},
    });
  };
  let tree = render();
  walk(tree)
    .find((n) => n.type === Extras)
    .props.onChange((current) => ({
      ...current,
      longDistance: {
        enabled: true,
        userTimeZone: "Asia/Shanghai",
        charTimeZone: "America/Los_Angeles",
      },
    }));
  tree = render();
  await walk(tree)
    .find((n) => n.type === PersonaEditor)
    .props.onSubmit({ preventDefault() {} });
  assert.equal(closed, 1);
  assert.equal(records[0].chat_preferences.longDistance.charTimeZone, "America/Los_Angeles");
  assert.equal(records[0].chat_preferences.contextDepth, 9);
  assert.equal(records[0].chat_preferences.wallpaperPath, "owner/a.webp");
  assert.deepEqual(records[1].chat_preferences, {});
  records[0] = JSON.parse(JSON.stringify(records[0]));
  states = [];
  assert.equal(
    walk(render()).find((n) => n.type === Extras).props.value.longDistance.enabled,
    true,
  );
});

test("timezone feature defaults off; per-character roundtrip preserves every existing preference", () => {
  const old = {
    remark: "A",
    contextDepth: 7,
    longTermMemory: true,
    wallpaperPath: "owner/a.webp",
    userBubbleCss: "color:red;",
  };
  const a = readCharacterChatPreferences({
    ...old,
    longDistance: {
      enabled: true,
      userTimeZone: "Asia/Shanghai",
      charTimeZone: "America/Los_Angeles",
    },
  });
  const b = readCharacterChatPreferences({
    longDistance: { enabled: true, userTimeZone: "Europe/London", charTimeZone: "Asia/Tokyo" },
  });
  const saved = JSON.parse(JSON.stringify({ a, b }));
  assert.deepEqual(readCharacterChatPreferences(saved.a), a);
  assert.deepEqual(readCharacterChatPreferences(saved.b), b);
  assert.equal(readCharacterChatPreferences({}).longDistance.enabled, false);
  assert.equal(chatTimeZoneContext(readCharacterChatPreferences({}).longDistance), "");
  const damaged = readCharacterChatPreferences({
    ...a,
    longDistance: { enabled: true, charTimeZone: "bad zone" },
  });
  for (const [key, value] of Object.entries(old)) assert.equal(damaged[key], value);
  assert.equal(damaged.longDistance.enabled, false);
  assert.equal(
    characterChatSchema.safeParse({
      ...a,
      longDistance: { ...a.longDistance, charTimeZone: "bad zone" },
    }).success,
    false,
  );
});

test("same instant produces User 22:00 and Char 07:00 with cross-day dates", () => {
  const context = chatTimeZoneContext(
    { enabled: true, userTimeZone: "Asia/Shanghai", charTimeZone: "America/Los_Angeles" },
    new Date("2026-10-04T14:00:00Z"),
  );
  assert.match(context, /User local time: 2026-10-04 22:00:00/);
  assert.match(context, /Char local time: 2026-10-04 07:00:00/);
  assert.match(context, /Char minus User = -900 minutes \(-15 hours\)/);
  const nextDay = chatTimeZoneContext(
    { enabled: true, userTimeZone: "Asia/Tokyo", charTimeZone: "America/Los_Angeles" },
    new Date("2026-10-04T23:30:00Z"),
  );
  assert.match(nextDay, /User local time: 2026-10-05 08:30:00/);
  assert.match(nextDay, /Char local time: 2026-10-04 16:30:00/);
  assert.match(nextDay, /Local calendar dates differ: true/);
});

test("timezone offsets follow DST and half/quarter hours, including midnight", () => {
  const settings = { enabled: true, userTimeZone: "UTC", charTimeZone: "America/New_York" };
  assert.match(
    chatTimeZoneContext(settings, new Date("2026-01-01T00:00:00Z")),
    /-300 minutes \(-5 hours\)/,
  );
  assert.match(
    chatTimeZoneContext(settings, new Date("2026-07-01T00:00:00Z")),
    /-240 minutes \(-4 hours\)/,
  );
  assert.match(
    chatTimeZoneContext(
      { ...settings, charTimeZone: "Asia/Kathmandu" },
      new Date("2026-01-01T00:00:00Z"),
    ),
    /\+345 minutes \(5.75 hours\)/,
  );
  assert.match(
    chatTimeZoneContext(
      { ...settings, charTimeZone: "Australia/Adelaide" },
      new Date("2026-07-01T00:00:00Z"),
    ),
    /\+570 minutes \(9.5 hours\)/,
  );
  assert.match(
    chatTimeZoneContext({ ...settings, charTimeZone: "UTC" }, new Date("2026-01-01T00:00:00Z")),
    /00:00:00.*UTC\+00:00/,
  );
  assert.equal(isValidTimeZone("bad zone"), false);
  assert.equal(isValidTimeZone("+08:00"), false);
  assert.ok(availableTimeZones().includes("UTC"));
  assert.match(PHONE_CHAT_CONTEXT, /当前交互媒介是手机聊天/);
  assert.match(PHONE_CHAT_CONTEXT, /想做与已经做/);
});
