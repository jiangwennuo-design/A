import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import * as goals from "../src/lib/goals.ts";
import { paginateDesktop } from "../src/lib/desktop-pages.ts";
const require = createRequire(import.meta.url);
const source = await readFile(new URL("../src/lib/happened.ts", import.meta.url), "utf8");
const exports = {};
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  {
    exports,
    require(name) {
      return name === "./goals" ? goals : require(name);
    },
    crypto,
    Date,
    URL,
  },
);
const {
  monthRange,
  shiftMonth,
  newHappenedEntry,
  systemHappenedEvent,
  safeHappenedUrl,
  happenedEntrySchema,
  defaultHappenedSettings,
} = exports;

test("happened uses the actual desktop icon component and its existing per-App visuals", async () => {
  const text = await readFile(
    new URL("../src/routes/_authenticated/index.tsx", import.meta.url),
    "utf8",
  );
  const ast = ts.createSourceFile(
    "index.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declaration = ast.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === "AppIcon",
  );
  assert.ok(declaration);
  const visual = {
    iconUrl: "/icons/kdeji-192.png",
    size: 64,
    x: 4,
    y: -3,
    scale: 1.1,
    rotate: 5,
    opacity: 0.8,
    radius: 15,
    labelSize: 13,
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(declaration.getText(ast) + "\nexports.AppIcon = AppIcon;", {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports,
      require,
      useAuth: () => ({ user: { id: "qa" } }),
      useDesktopAppearance: () => ({ config: { iconSize: 58, apps: { happened: visual } } }),
    },
  );
  const html = renderToString(
    createElement(exports.AppIcon, {
      label: "发生过",
      subtitle: "生活的痕迹",
      tone: "happened",
      icon: () => null,
      onClick: () => {},
    }),
  );
  for (const expected of [
    'data-app-id="happened"',
    'data-ui="app-icon"',
    "width:64px",
    "translate(4px, -3px)",
    "scale(1.1)",
    "rotate(5deg)",
    "opacity:0.8",
    "border-radius:15px",
    "font-size:13px",
    "/icons/kdeji-192.png",
  ])
    assert.ok(html.includes(expected), expected);
  visual.labelVisible = false;
  assert.ok(
    !renderToString(
      createElement(exports.AppIcon, {
        label: "发生过",
        subtitle: "生活的痕迹",
        tone: "happened",
        icon: () => null,
        onClick: () => {},
      }),
    ).includes('data-ui="app-label"'),
  );
});
test("calendar months and real memory dates clamp leap/month boundaries", () => {
  assert.equal(monthRange("2024-02").to, "2024-02-29");
  assert.equal(monthRange("2025-02").to, "2025-02-28");
  assert.equal(shiftMonth("2024-02-29", -12), "2023-02-28");
  assert.equal(shiftMonth("2026-03-31", -1), "2026-02-28");
  assert.equal(shiftMonth("2026-10-05", -3), "2026-07-05");
  assert.throws(() => monthRange("2026-13"));
});
test("records preserve Unicode/newlines, ownership and lightweight media references", () => {
  const a = newHappenedEntry("user-a", {
    content: "中文\nEnglish ★",
    images: ["user-a/messages/a.webp"],
    tags: ["default-0"],
  });
  assert.equal(a.userId, "user-a");
  assert.equal(a.content, "中文\nEnglish ★");
  assert.equal(a.showInMemories, true);
  assert.equal(a.sourceType, "manual");
  assert.notEqual(a.id, newHappenedEntry("user-a").id);
  assert.equal(
    happenedEntrySchema.safeParse({ ...a, images: ["data:image/png;base64,abc"] }).success,
    false,
  );
  assert.equal(happenedEntrySchema.safeParse({ ...a, images: ["blob:abc"] }).success, false);
  assert.equal(happenedEntrySchema.safeParse({ ...a, date: "2026-02-30" }).success, false);
});
test("system events deduplicate by source ID, distinguish apps and preserve source info", () => {
  const at = "2026-10-05T00:00:00.000Z";
  const a = systemHappenedEvent("a", "knowledge", "source", at, "标题", "x".repeat(2000));
  assert.equal(a.id, systemHappenedEvent("a", "knowledge", "source", at, "新标题", "").id);
  assert.notEqual(a.id, systemHappenedEvent("a", "diary", "source", at, "标题", "").id);
  assert.equal(a.isSystemEvent, true);
  assert.equal(a.sourceId, "source");
  assert.equal(a.content.length, 600);
  assert.equal(
    systemHappenedEvent("a", "diary", "d", at, "标题", "", { date: "2026-10-04" }).date,
    "2026-10-04",
  );
});
test("system events accept database timestamp offsets without changing their instant", () => {
  for (const timestamp of [
    "2026-10-05T00:00:00+00:00",
    "2026-10-05T08:00:00+08:00",
    "2026-10-05T00:00:00.123456+00:00",
  ]) {
    const entry = systemHappenedEvent("a", "diary", "d", timestamp, "日记", "正文", {
      date: "2026-10-04",
    });
    const expected = new Date(timestamp).toISOString();
    assert.equal(entry.timestamp, expected);
    assert.equal(entry.createdAt, expected);
    assert.equal(entry.updatedAt, expected);
    assert.equal(entry.date, "2026-10-04");
    assert.equal(happenedEntrySchema.safeParse(entry).success, true);
  }
});
test("safe links reject script schemes; tags only have the five gentle palette choices", () => {
  assert.equal(safeHappenedUrl("javascript:alert(1)"), "");
  assert.equal(safeHappenedUrl("file:///etc/passwd"), "");
  assert.equal(safeHappenedUrl("https://example.com/music"), "https://example.com/music");
  assert.equal(defaultHappenedSettings().tags.length, 15);
  assert.ok(
    defaultHappenedSettings().tags.every((tag) =>
      ["blue", "pink", "purple", "yellow", "mint"].includes(tag.color),
    ),
  );
});
test("existing desktop pagination includes happened without assigned pages for 3/4/5 columns", () => {
  for (const columns of [3, 4, 5])
    for (const widget of [true, false]) {
      const items = Array.from({ length: 45 }, (_, i) => (i === 44 ? "happened" : "app-" + i));
      const result = paginateDesktop(items, columns, 540, 88, 18, widget ? 160 : 0);
      assert.deepEqual(result.flat(), items);
      assert.ok(result.length > 1);
    }
});
