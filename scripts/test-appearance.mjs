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
