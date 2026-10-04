import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

const file = "src/components/DiaryEditPage.tsx";
const source = await readFile(file, "utf8");
const nodes = (node) =>
  !node || typeof node !== "object"
    ? []
    : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];

test("diary redesign leaves the existing save handler unchanged", () => {
  const original = execFileSync("git", ["show", `c020be7:${file}`], { encoding: "utf8" });
  const handler = (text) =>
    text.match(/  async function handleSave[\s\S]*?(?=\n  if \(loading\))/)[0].replace(/\r/g, "");
  assert.equal(handler(source), handler(original));
});

for (const editing of [false, true]) {
  test(`diary ${editing ? "edit" : "create"}: both publish buttons submit existing fields`, async () => {
    const values = [],
      effects = [],
      writes = [],
      navigations = [];
    let cursor = 0;
    const react = {
      useState(initial) {
        const index = cursor++;
        if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
        return [
          values[index],
          (value) => {
            values[index] = value;
          },
        ];
      },
      useRef: () => ({ current: null }),
      useEffect: (effect) => effects.push(effect),
    };
    const result = { error: null };
    const supabase = {
      from(table) {
        assert.equal(table, "diaries");
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { title: "旧标题", content: "旧正文", diary_date: "2026-09-20" },
              }),
            }),
          }),
          insert: async (payload) => {
            writes.push({ payload });
            return result;
          },
          update: (payload) => ({
            eq: async (key, id) => {
              writes.push({ payload, key, id });
              return result;
            },
          }),
        };
      },
    };
    const deps = {
      react,
      "react/jsx-runtime": jsx,
      "lucide-react": { X: () => null, CalendarDays: () => null },
      "@tanstack/react-router": {
        useNavigate: () => (value) => navigations.push(value),
        useRouter: () => ({ history: { back() {} } }),
      },
      "@/integrations/supabase/client": { supabase },
      "@/components/ui-kit": { LoadingSpinner: () => null, ErrorBanner: () => null },
      "@/lib/app-transition": { popSystemPage: (callback) => callback() },
      "@/hooks/useKeyboardViewport": { useKeyboardViewport() {} },
      "@/styles/diary-editor.css": {},
    };
    const exports = {};
    vm.runInNewContext(
      ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      }).outputText,
      {
        exports,
        require: (name) => {
          assert.ok(name in deps, name);
          return deps[name];
        },
      },
    );
    const render = () => {
      cursor = 0;
      effects.length = 0;
      return nodes(exports.DiaryEditPage({ id: editing ? "diary-id" : undefined }));
    };
    render();
    if (editing) {
      await effects[0]();
      await new Promise((resolve) => setImmediate(resolve));
    }
    let tree = render();
    for (const [label, value] of [
      ["标题（可选）", "新标题"],
      ["日记正文", "第一行\n第二行 😊"],
      ["日记日期", "2026-10-05"],
    ]) {
      tree.find((node) => node.props["aria-label"] === label).props.onChange({ target: { value } });
    }
    tree = render();
    assert.equal(
      tree.filter((node) => node.type === "button" && node.props.type === "submit").length,
      2,
    );
    await tree.find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    assert.equal(writes.length, 1);
    assert.equal(
      JSON.stringify(writes[0].payload),
      JSON.stringify({ title: "新标题", content: "第一行\n第二行 😊", diary_date: "2026-10-05" }),
    );
    if (editing) {
      assert.equal(writes[0].id, "diary-id");
      assert.equal(writes[0].key, "id");
    }
    assert.equal(navigations[0].to, "/diary");
    assert.ok(
      render()
        .filter((node) => node.props.type === "submit")
        .every((node) => node.props.disabled),
    );
  });
}
