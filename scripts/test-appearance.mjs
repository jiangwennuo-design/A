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
  safeScopedAppearanceCss,
} from "../src/lib/appearance.ts";
import { readCharacterChatPreferences } from "../src/lib/character-chat.ts";
import { readDesktopAppearance, useDesktopAppearance } from "../src/lib/desktop-appearance.ts";

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
