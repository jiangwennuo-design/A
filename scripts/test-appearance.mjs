import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  defaultAppearanceModule,
  readAppearanceModule,
  saveAppearancePreset,
  importAppearancePreset,
  exportAppearancePreset,
  applyAppearancePreset,
  updateAppearancePreset,
  renameAppearancePreset,
  deleteAppearancePreset,
  withAppearancePresetLibrary,
  safeScopedAppearanceCss,
} from "../src/lib/appearance.ts";
import { readCharacterChatPreferences } from "../src/lib/character-chat.ts";
import {
  readDesktopAppearance,
  saveDesktopAppearance,
  useDesktopAppearance,
} from "../src/lib/desktop-appearance.ts";
import {
  readChatAppearanceLibrary,
  saveChatAppearanceLibrary,
  migrateChatAppearanceLibraries,
  hydrateChatAppearanceLibraries,
  chatAppearanceLibraryPayload,
} from "../src/lib/chat-appearance-presets.ts";

test("full CSS is a separate account library; characters store only IDs; remote/cold hydration preserves all three libraries", async () => {
  const storage = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  try {
    let full = defaultAppearanceModule("chatFull");
    for (const name of ["A", "B", "C"])
      full = saveAppearancePreset(
        {
          ...full,
          customCss: `[data-ui="message-bubble"]{border:${name === "A" ? 1 : 2}px solid red}`,
        },
        "chatFull",
        name,
      );
    const chrome = saveAppearancePreset(
      defaultAppearanceModule("chatChrome"),
      "chatChrome",
      "旧顶栏",
    );
    const bubble = saveAppearancePreset(
      defaultAppearanceModule("chatBubble"),
      "chatBubble",
      "旧气泡",
    );
    saveChatAppearanceLibrary("full-css-owner", "chatFull", full.presets);
    saveChatAppearanceLibrary("full-css-owner", "chatChrome", chrome.presets);
    saveChatAppearanceLibrary("full-css-owner", "chatBubble", bubble.presets);
    const a = readCharacterChatPreferences({
      fullChatCss: { selectedPresetId: full.presets[0].id, enabled: true },
      wallpaperPath: "u/chat-wallpapers/a.webp",
    });
    const b = readCharacterChatPreferences({
      fullChatCss: { selectedPresetId: full.presets[1].id, enabled: true },
    });
    assert.notEqual(a.fullChatCss.selectedPresetId, b.fullChatCss.selectedPresetId);
    assert.deepEqual(Object.keys(a.fullChatCss).sort(), ["enabled", "selectedPresetId"]);
    assert.equal(a.wallpaperPath, "u/chat-wallpapers/a.webp");
    const remote = {
      chatChrome: chatAppearanceLibraryPayload("full-css-owner", "chatFull"),
      chatBubble: chatAppearanceLibraryPayload("full-css-owner", "chatBubble"),
    };
    assert.equal(remote.chatChrome.presets[0].name, "旧顶栏");
    assert.equal(remote.chatChrome.fullChatLibrary.presets.length, 3);
    hydrateChatAppearanceLibraries("new-full-device", JSON.parse(JSON.stringify(remote)));
    for (const [type, count] of [
      ["chatFull", 3],
      ["chatChrome", 1],
      ["chatBubble", 1],
    ])
      assert.equal(readChatAppearanceLibrary("new-full-device", type).presets.length, count);
    const fresh = await import(`../src/lib/chat-appearance-presets.ts?fullCold=${Date.now()}`);
    assert.equal(fresh.readChatAppearanceLibrary("new-full-device", "chatFull").presets.length, 3);
    assert.equal(
      fresh.readChatAppearanceLibrary("another-full-user", "chatFull").presets.length,
      0,
    );
    const bad = readCharacterChatPreferences({
      fullChatCss: { enabled: "bad" },
      contextDepth: 39,
      wallpaperPath: "u/chat-wallpapers/saved.webp",
    });
    assert.equal(bad.contextDepth, 39);
    assert.equal(bad.wallpaperPath, "u/chat-wallpapers/saved.webp");
    assert.equal(bad.fullChatCss.enabled, false);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});

test("all appearance modules accept missing, legacy and malformed config without throwing", () => {
  for (const type of ["desktop", "chatChrome", "chatBubble"]) {
    const defaults = defaultAppearanceModule(type);
    assert.ok(defaults.config);
    for (const value of [undefined, null, {}, { name: "旧配置" }, { config: null }, "bad"]) {
      assert.ok(readAppearanceModule(type, value).config);
    }
    assert.deepEqual(readAppearanceModule(type, JSON.parse(JSON.stringify(defaults))), defaults);
  }
});

test("old character data preserves existing settings and bubble CSS", () => {
  const old = {
    remark: "备注",
    contextDepth: 7,
    avatarDisplayMode: "qq",
    wallpaperPath: "u/chat/image.webp",
    userBubbleCss: "color:red;",
    charBubbleCss: "color:blue;",
  };
  for (const appearance of [undefined, {}, { chatChrome: {}, chatBubble: {} }]) {
    const result = readCharacterChatPreferences({ ...old, appearance });
    for (const [key, value] of Object.entries(old)) assert.equal(result[key], value);
    assert.equal(result.appearance.chatBubble.config.userCss, old.userBubbleCss);
    assert.equal(result.appearance.chatBubble.config.charCss, old.charBubbleCss);
    assert.deepEqual(readCharacterChatPreferences(JSON.parse(JSON.stringify(result))), result);
  }
});

test("SSR desktop snapshot remains stable across reads", () => {
  assert.strictEqual(readDesktopAppearance("legacy"), readDesktopAppearance("legacy"));
  assert.strictEqual(readDesktopAppearance("a"), readDesktopAppearance("b"));
  function Desktop() {
    const state = useDesktopAppearance("old-user");
    return createElement("div", null, state.config.iconSize);
  }
  assert.equal(renderToString(createElement(Desktop)), "<div>58</div>");
});

test("presets roundtrip and invalid CSS/import do not damage current state", () => {
  for (const type of ["desktop", "chatChrome", "chatBubble"]) {
    const original = defaultAppearanceModule(type);
    const saved = saveAppearancePreset(original, type, "测试预设");
    const imported = importAppearancePreset(exportAppearancePreset(saved, type), type);
    assert.deepEqual(imported.config, original.config);
    assert.equal(
      applyAppearancePreset(saved, saved.presets[0].id).currentPresetId,
      saved.presets[0].id,
    );
    assert.throws(() => importAppearancePreset("{broken", type));
    assert.equal(safeScopedAppearanceCss("body { display:none }", type), "");
    assert.equal(original.presets.length, 0);
  }
});

test("three independent theme libraries keep A/B/C, active IDs and legacy CSS across reload", () => {
  const libraries = {};
  for (const type of ["desktop", "chatChrome", "chatBubble"]) {
    let state = defaultAppearanceModule(type);
    if (type === "chatBubble") state.config.userCss = "color: purple;";
    for (const [index, name] of ["A", "B", "C"].entries()) {
      state = { ...state, customCss: `[data-ui="test"] { opacity: ${(index + 1) / 4}; }` };
      state = saveAppearancePreset(state, type, name);
    }
    assert.equal(state.presets.length, 3);
    assert.equal(new Set(state.presets.map((preset) => preset.id)).size, 3);
    const [a, b, c] = state.presets;
    assert.equal(state.currentPresetId, c.id);
    const bCss = b.customCss;
    state = applyAppearancePreset(state, a.id);
    assert.equal(state.customCss, a.customCss);
    state = { ...state, customCss: '[data-ui="test"] { opacity: .95; }' };
    state = updateAppearancePreset(state, a.id);
    assert.equal(state.presets.find((preset) => preset.id === b.id).customCss, bCss);
    state = renameAppearancePreset(state, a.id, "A 新名");
    assert.equal(state.presets.find((preset) => preset.id === a.id).name, "A 新名");
    const exportedB = exportAppearancePreset(state, type, b.id);
    assert.equal(JSON.parse(exportedB).customCss, bCss);
    const imported = importAppearancePreset(exportedB, type);
    state = { ...state, presets: [...state.presets, imported] };
    assert.equal(state.presets.length, 4);
    assert.equal(state.currentPresetId, a.id);
    state = deleteAppearancePreset(state, a.id);
    assert.equal(state.presets.length, 3);
    assert.equal(state.presets.find((preset) => preset.id === b.id).customCss, bCss);
    const reloaded = readAppearanceModule(type, JSON.parse(JSON.stringify(state)));
    assert.deepEqual(reloaded, state);
    assert.equal(reloaded.currentPresetId, null);
    if (type === "chatBubble") assert.equal(reloaded.config.userCss, "color: purple;");
    libraries[type] = reloaded;
  }
  assert.equal(
    libraries.desktop.presets.every((preset) => preset.themeType === "desktop"),
    true,
  );
  assert.equal(
    libraries.chatChrome.presets.every((preset) => preset.themeType === "chatChrome"),
    true,
  );
  assert.equal(
    libraries.chatBubble.presets.every((preset) => preset.themeType === "chatBubble"),
    true,
  );
  assert.throws(() =>
    importAppearancePreset(exportAppearancePreset(libraries.desktop, "desktop"), "chatBubble"),
  );
});

test("library-only import preserves applied desktop visual; saved library is user-scoped", () => {
  const saved = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
  };
  try {
    const current = saveAppearancePreset(defaultAppearanceModule("desktop"), "desktop", "已应用");
    saveDesktopAppearance("account-a", current);
    const draft = { ...current, customCss: '[data-ui="desktop"] { opacity: .8; }' };
    const imported = importAppearancePreset(exportAppearancePreset(current, "desktop"), "desktop");
    const libraryOnly = withAppearancePresetLibrary(current, {
      ...draft,
      presets: [...draft.presets, imported],
    });
    saveDesktopAppearance("account-a", libraryOnly);
    const diskA = JSON.parse(saved.get("kdeji.desktopAppearance.v1:account-a"));
    assert.equal(diskA.presets.length, 2);
    assert.equal(diskA.customCss, current.customCss);
    assert.equal(diskA.currentPresetId, current.currentPresetId);
    assert.deepEqual(readAppearanceModule("desktop", diskA), libraryOnly);
    saveDesktopAppearance("account-b", defaultAppearanceModule("desktop"));
    const diskB = JSON.parse(saved.get("kdeji.desktopAppearance.v1:account-b"));
    assert.equal(diskB.presets.length, 0);
    assert.equal(readDesktopAppearance("account-a").presets.length, 2);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});

test("preset list accepts more than the old 80-item limit", () => {
  let state = defaultAppearanceModule("desktop");
  for (let index = 0; index < 85; index++) {
    state = saveAppearancePreset(state, "desktop", `预设 ${index}`);
  }
  assert.equal(
    readAppearanceModule("desktop", JSON.parse(JSON.stringify(state))).presets.length,
    85,
  );
});

test("account-wide chat libraries migrate A/B without changing character selections, CSS or wallpaper", async () => {
  const storage = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  try {
    const aBubble = saveAppearancePreset(
      { ...defaultAppearanceModule("chatBubble"), config: { userCss: "color:red;", charCss: "" } },
      "chatBubble",
      "A",
    );
    const bBubble = saveAppearancePreset(
      { ...defaultAppearanceModule("chatBubble"), config: { userCss: "color:blue;", charCss: "" } },
      "chatBubble",
      "B",
    );
    const chrome = saveAppearancePreset(
      defaultAppearanceModule("chatChrome"),
      "chatChrome",
      "顶栏",
    );
    const characters = [
      {
        id: "a",
        chat_preferences: {
          wallpaperPath: "owner/chat-wallpapers/a/a.png",
          userBubbleCss: "color:red;",
          appearance: { chatBubble: aBubble, chatChrome: chrome },
        },
      },
      { id: "b", chat_preferences: { appearance: { chatBubble: bBubble } } },
    ];
    const before = JSON.stringify(characters);
    migrateChatAppearanceLibraries("shared-owner", characters);
    const shared = readChatAppearanceLibrary("shared-owner", "chatBubble");
    assert.equal(shared.presets.length, 2);
    assert.equal(readChatAppearanceLibrary("shared-owner", "chatChrome").presets.length, 1);
    const aApplied = applyAppearancePreset(
      { ...aBubble, presets: shared.presets },
      aBubble.currentPresetId,
    );
    const bApplied = applyAppearancePreset(
      { ...bBubble, presets: shared.presets },
      bBubble.currentPresetId,
    );
    assert.equal(aApplied.config.userCss, "color:red;");
    assert.equal(bApplied.config.userCss, "color:blue;");
    assert.equal(JSON.stringify(characters), before);
    saveChatAppearanceLibrary("shared-owner", "chatBubble", shared.presets.slice(1));
    migrateChatAppearanceLibraries("shared-owner", characters);
    assert.equal(
      readChatAppearanceLibrary("shared-owner", "chatBubble").presets.length,
      1,
      "deleted legacy preset is not resurrected",
    );
    const reloaded = await import(`../src/lib/chat-appearance-presets.ts?reload=${Date.now()}`);
    assert.equal(
      reloaded.readChatAppearanceLibrary("shared-owner", "chatBubble").presets[0].name,
      "B",
    );
    assert.equal(reloaded.readChatAppearanceLibrary("other-owner", "chatBubble").presets.length, 0);
    assert.equal(readChatAppearanceLibrary("shared-owner", "chatChrome").presets[0].name, "顶栏");
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});

test("invalid/newer appearance data never resets a persisted character wallpaper", () => {
  const prefs = readCharacterChatPreferences({
    contextDepth: 37,
    wallpaperPath: "u/chat-wallpapers/a/a.webp",
    wallpaperUrl: null,
    userBubbleCss: "color:red;",
    appearance: { chatBubble: { config: null }, chatChrome: { presets: [{ bad: true }] } },
  });
  assert.equal(prefs.wallpaperPath, "u/chat-wallpapers/a/a.webp");
  assert.equal(prefs.contextDepth, 37);
  assert.equal(prefs.userBubbleCss, "color:red;");
  const longCss = "/*" + "x".repeat(4500) + "*/color:red;";
  const longPrefs = readCharacterChatPreferences({
    wallpaperPath: "u/chat-wallpapers/a/a.webp",
    userBubbleCss: longCss,
  });
  assert.equal(longPrefs.wallpaperPath, "u/chat-wallpapers/a/a.webp");
  assert.equal(longPrefs.userBubbleCss, longCss);
});

test("account hydration restores both libraries on another device without changing the other account", () => {
  const storage = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  try {
    const bubble = saveAppearancePreset(
      defaultAppearanceModule("chatBubble"),
      "chatBubble",
      "账号气泡",
    );
    const chrome = saveAppearancePreset(
      defaultAppearanceModule("chatChrome"),
      "chatChrome",
      "账号顶栏",
    );
    hydrateChatAppearanceLibraries("remote-owner", {
      chatBubble: {
        presets: bubble.presets,
        migratedCharacterIds: ["a"],
        updatedAt: "2026-09-30T00:00:00Z",
      },
      chatChrome: {
        presets: chrome.presets,
        migratedCharacterIds: ["a"],
        updatedAt: "2026-09-30T00:00:00Z",
      },
    });
    assert.equal(
      readChatAppearanceLibrary("remote-owner", "chatBubble").presets[0].name,
      "账号气泡",
    );
    assert.equal(
      readChatAppearanceLibrary("remote-owner", "chatChrome").presets[0].name,
      "账号顶栏",
    );
    assert.equal(readChatAppearanceLibrary("isolated-owner", "chatBubble").presets.length, 0);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});

test("incompatible local, remote or legacy presets are not silently replaced with an empty library", () => {
  const storage = new Map();
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  try {
    const bad = { presets: [{ schemaVersion: 99, customCss: "user CSS" }] };
    const key = "kdeji.chatAppearancePresets.v1:bad-owner:chatBubble";
    storage.set(key, JSON.stringify(bad));
    assert.throws(() => migrateChatAppearanceLibraries("bad-owner", [{ id: "a" }]));
    assert.equal(storage.get(key), JSON.stringify(bad));
    assert.throws(() => hydrateChatAppearanceLibraries("bad-remote", { chatBubble: bad }));
    assert.equal(storage.has("kdeji.chatAppearancePresets.v1:bad-remote:chatBubble"), false);
    assert.throws(() =>
      migrateChatAppearanceLibraries("bad-legacy", [
        {
          id: "a",
          chat_preferences: { appearance: { chatBubble: bad } },
        },
      ]),
    );
    assert.equal(storage.has("kdeji.chatAppearancePresets.v1:bad-legacy:chatBubble"), false);
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});
