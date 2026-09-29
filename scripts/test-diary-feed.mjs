import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

async function feed(content, listPage) {
  let expanded = [],
    navigations = 0;
  const dependencies = {
    "react/jsx-runtime": jsx,
    react: {
      useState: () => [
        expanded,
        (update) => {
          expanded = update(expanded);
        },
      ],
    },
    "@tanstack/react-router": {
      useNavigate: () => () => {
        navigations++;
      },
    },
    "lucide-react": { LockKeyhole: () => null },
    "@/components/DiaryAvatar": { DiaryAvatar: () => null },
    "@/context/DiaryProfileContext": {
      useDiaryProfile: () => ({
        diaryProfile: { displayName: "测试", username: "test" },
        avatarUrl: "",
      }),
    },
    "@/lib/app-transition": { pushSystemPage: (action) => action() },
  };
  const context = vm.createContext({ console });
  const source = ts.transpileModule(
    await readFile(new URL("../src/components/DiaryFeed.tsx", import.meta.url), "utf8"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  ).outputText;
  const mod = new vm.SourceTextModule(source, { context });
  await mod.link(
    (name) =>
      new vm.SyntheticModule(
        Object.keys(dependencies[name]),
        function () {
          for (const [key, value] of Object.entries(dependencies[name])) this.setExport(key, value);
        },
        { context },
      ),
  );
  await mod.evaluate();
  const render = () =>
    mod.namespace.DiaryFeed({
      diaries: [{ id: "test", title: "标题不计入正文", content, diary_date: "2026-09-29" }],
      listPage,
    });
  const tree = () => walk(render());
  return { render, tree, navigations: () => navigations };
}
function walk(node) {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (!node || typeof node !== "object" || !node.props) return [];
  return [node, ...walk(node.props.children)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "object") return text(node.props?.children);
  return String(node);
}
const paragraph = (nodes) => nodes.find((node) => node.type === "p");
const expand = (nodes) => nodes.find((node) => node.props.className === "diary-card__expand");

test("list: 299/300 characters remain complete, without expansion button", async () => {
  for (const size of [0, 299, 300]) {
    const value = "日".repeat(size);
    const view = await feed(value, true);
    assert.equal(text(paragraph(view.tree())), value || "（空白）");
    assert.equal(expand(view.tree()), undefined);
  }
});
test("list: 301 characters, Unicode, punctuation and newlines; expand/collapse stays in card", async () => {
  const prefix = "日\nA，🙂".repeat(60); // 300 code points, not UTF-16 units.
  const content = prefix + "末尾";
  const view = await feed(content, true);
  let nodes = view.tree();
  assert.equal(text(paragraph(nodes)), prefix + "…");
  assert.equal(paragraph(nodes).props.className, undefined);
  assert.equal(text(expand(nodes)), "点击展开（302字）");
  let stopped = 0;
  expand(nodes).props.onClick({ stopPropagation: () => stopped++ });
  nodes = view.tree();
  assert.equal(text(paragraph(nodes)), content);
  assert.equal(text(expand(nodes)), "收起");
  assert.equal(expand(nodes).props["aria-expanded"], true);
  expand(nodes).props.onClick({ stopPropagation: () => stopped++ });
  assert.equal(text(paragraph(view.tree())), prefix + "…");
  assert.equal(view.navigations(), 0);
  assert.equal(stopped, 2);
});
test("profile feed retains its existing 260-character/line-clamp presentation", async () => {
  const content = "日".repeat(270);
  const view = await feed(content, undefined);
  assert.equal(view.render().props.className, "diary-list");
  assert.equal(text(paragraph(view.tree())), content);
  assert.equal(paragraph(view.tree()).props.className, "diary-card__excerpt");
  assert.equal(text(expand(view.tree())), "点击展开（270字）");
});
test("new visual rules target only the homepage feed, never diary detail/profile", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(
    css,
    /\.diary-list--home \.diary-card__author\s*\{[^}]*margin-inline: -20px;[^}]*border-bottom: 1px solid #eceff3;[^}]*background: #f6f7f9;/,
  );
  assert.match(css, /\.diary-list--home \.diary-card__count\s*\{[^}]*color: #adb1b8;/);
});
