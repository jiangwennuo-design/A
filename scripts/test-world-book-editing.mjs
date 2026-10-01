import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as zod from "zod";
import * as jsx from "react/jsx-runtime";
import * as world from "../src/lib/world-books.ts";

async function handlers() {
  const records = [];
  const owner = crypto.randomUUID();
  let failWrite = false;
  let revision = 0;
  const db = {
    from(table) {
      assert.equal(table, "world_books");
      const filters = [];
      let operation = "read",
        values;
      const query = {
        select: () => query,
        eq: (key, value) => {
          filters.push((row) => row[key] === value);
          return query;
        },
        order: () => query,
        insert: (data) => {
          operation = "insert";
          values = data;
          return query;
        },
        update: (data) => {
          operation = "update";
          values = data;
          return query;
        },
        single: () => execute(true),
        maybeSingle: () => execute(true),
        then: (resolve, reject) => execute(false).then(resolve, reject),
      };
      async function execute(single) {
        if (failWrite && operation !== "read") return { data: null, error: new Error("offline") };
        let rows = records.filter((row) => filters.every((match) => match(row)));
        if (operation === "insert") {
          rows = [{ id: crypto.randomUUID(), enabled: true, ...structuredClone(values) }];
          records.push(...rows);
        }
        if (operation === "update")
          rows.forEach((row) => Object.assign(row, structuredClone(values)));
        if (operation !== "read")
          rows.forEach((row) => {
            row.updated_at = `revision-${++revision}`;
            row.entry_count = row.entries.length;
          });
        return { data: structuredClone(single ? (rows[0] ?? null) : rows), error: null };
      }
      return query;
    },
  };
  const dependencies = {
    zod,
    "./world-books": world,
    "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: {} },
    "@tanstack/react-start": {
      createServerFn: () => {
        let validate = (input) => input;
        const chain = {
          middleware: () => chain,
          validator: (fn) => {
            validate = fn;
            return chain;
          },
          handler:
            (fn) =>
            ({ data, context }) =>
              fn({ data: validate(data), context }),
        };
        return chain;
      },
    },
  };
  const source = await readFile(
    new URL("../src/lib/world-books.functions.ts", import.meta.url),
    "utf8",
  );
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      TextEncoder,
      require: (name) => {
        assert.ok(name in dependencies, name);
        return dependencies[name];
      },
    },
  );
  return {
    records,
    owner,
    fail: (value) => {
      failWrite = value;
    },
    call: (name, data, userId = owner) =>
      exports[name]({ data, context: { supabase: db, userId } }),
  };
}

test("create empty owned book, append entries, edit and reload through actual server handlers", async () => {
  const api = await handlers();
  let book = await api.call("createWorldBook", { name: " 自建世界书 " });
  assert.equal(book.name, "自建世界书");
  assert.equal(book.user_id, api.owner);
  assert.equal(book.enabled, true);
  assert.equal(book.entry_count, 0);
  assert.deepEqual(book.entries, []);
  assert.equal((await api.call("listWorldBooks")).length, 1);
  const first = {
    ...world.createWorldEntryDraft(),
    name: "规则",
    content: "第一行\n第二行",
    constant: true,
  };
  world.worldEntrySchema.parse(first);
  book = await api.call("saveWorldEntry", {
    id: book.id,
    index: 0,
    updated_at: book.updated_at,
    append: true,
    entry: first,
  });
  assert.equal(book.entry_count, 1);
  assert.equal(book.entries[0].raw.content, first.content);
  const second = {
    ...world.createWorldEntryDraft(book.entries),
    name: "背景",
    content: "自己新增的背景",
    raw: { futureField: "保留" },
  };
  assert.notEqual(first.uid, second.uid);
  assert.ok(second.order > first.order);
  book = await api.call("saveWorldEntry", {
    id: book.id,
    index: 1,
    updated_at: book.updated_at,
    append: true,
    entry: second,
  });
  assert.equal(book.entry_count, 2);
  const oldFirst = structuredClone(book.entries[0]);
  // Old callers do not send append; editing still preserves unknown imported metadata.
  book = await api.call("saveWorldEntry", {
    id: book.id,
    index: 1,
    updated_at: book.updated_at,
    entry: { ...book.entries[1], raw: {}, content: "已修改", disable: true },
  });
  assert.deepEqual(book.entries[0], oldFirst);
  assert.equal(book.entries[1].raw.futureField, "保留");
  const restored = await api.call("getWorldBook", { id: book.id });
  assert.deepEqual(restored, book);
  assert.match(world.buildPromptContext([restored]), /第一行/);
  assert.doesNotMatch(world.buildPromptContext([restored]), /已修改/);
  assert.deepEqual(await api.call("listWorldBooks", undefined, crypto.randomUUID()), []);
  await assert.rejects(
    () => api.call("getWorldBook", { id: book.id }, crypto.randomUUID()),
    /无权访问/,
  );
});

test("append rejects stale, foreign, duplicate and invalid writes without changing existing data", async () => {
  const api = await handlers();
  const book = await api.call("createWorldBook", { name: "测试" });
  const data = {
    id: book.id,
    index: 0,
    updated_at: book.updated_at,
    append: true,
    entry: world.createWorldEntryDraft(),
  };
  await assert.rejects(() => api.call("saveWorldEntry", data, crypto.randomUUID()), /无权访问/);
  await assert.rejects(
    () => api.call("saveWorldEntry", { ...data, updated_at: "stale" }),
    /其他页面更新/,
  );
  await assert.rejects(() => api.call("saveWorldEntry", { ...data, index: 2 }), /世界书已更新/);
  await assert.rejects(() => api.call("saveWorldEntry", { ...data, append: false }), /条目不存在/);
  api.fail(true);
  await assert.rejects(() => api.call("saveWorldEntry", data), /保存失败/);
  assert.equal(api.records[0].entries.length, 0);
  api.fail(false);
  const saved = await api.call("saveWorldEntry", data);
  await assert.rejects(() => api.call("saveWorldEntry", data), /其他页面更新/);
  await assert.rejects(
    () => api.call("saveWorldEntry", { ...data, index: 1, updated_at: saved.updated_at }),
    /编号重复/,
  );
  assert.equal(api.records[0].entries.length, 1);
  assert.throws(() => api.call("createWorldBook", { name: "   " }));
  assert.throws(() =>
    api.call("saveWorldEntry", { ...data, entry: { ...data.entry, probability: 999 } }),
  );
});

test("actual UI exposes create/add, saves both, and cancellation preserves persisted entries", async () => {
  const api = await handlers();
  let cursor = 0;
  const states = [];
  const effects = [];
  const dependencies = {
    "react/jsx-runtime": jsx,
    react: {
      useState: (initial) => {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [
          states[index],
          (value) => {
            states[index] = typeof value === "function" ? value(states[index]) : value;
          },
        ];
      },
      useRef: (value) => ({ current: value }),
      useEffect: (effect) => effects.push(effect),
    },
    "@tanstack/react-router": { useNavigate: () => () => {} },
    "@tanstack/react-start": { useServerFn: (fn) => fn },
    "lucide-react": Object.fromEntries(
      [
        "BookOpen",
        "CheckCircle2",
        "ChevronLeft",
        "ChevronRight",
        "Circle",
        "Pencil",
        "Plus",
        "Search",
        "Trash2",
        "Upload",
      ].map((name) => [name, () => null]),
    ),
    "@/components/system-ui": { SystemModal: () => null },
    "@/hooks/useKeyboardViewport": { useKeyboardViewport: () => {} },
    "@/lib/app-transition": Object.fromEntries(
      ["closeSystemApp", "popSystemPage", "pushSystemPage"].map((name) => [
        name,
        (callback) => callback(),
      ]),
    ),
    "@/lib/world-books": world,
    "@/lib/world-book-file": {
      worldBookFileAccept: ".json,.docx",
      importWorldBookFile: async () => {},
    },
    "@/lib/world-books.functions": Object.fromEntries(
      [
        "createWorldBook",
        "deleteWorldBook",
        "getWorldBook",
        "importWorldBook",
        "listWorldBooks",
        "saveWorldEntry",
        "updateWorldBook",
        "worldBookBindings",
      ].map((name) => [name, (args = {}) => api.call(name, args.data)]),
    ),
    "@/styles/world-books.css": {},
  };
  const source = await readFile(
    new URL("../src/components/world-books/WorldBooksApp.tsx", import.meta.url),
    "utf8",
  );
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      structuredClone,
      require: (name) => {
        assert.ok(name in dependencies, name);
        return dependencies[name];
      },
    },
  );
  function render() {
    cursor = 0;
    effects.length = 0;
    const tree = exports.WorldBooksApp();
    const nodes = [];
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (node.type === dependencies["@/components/system-ui"].SystemModal && !node.props.open)
        return;
      nodes.push(node);
      [node.props?.children].flat(Infinity).forEach(walk);
    };
    walk(tree);
    return nodes;
  }
  const text = (node) =>
    typeof node === "string" || typeof node === "number"
      ? String(node)
      : node?.props
        ? [node.props.children].flat(Infinity).map(text).join("")
        : "";
  const button = (nodes, title) =>
    nodes.find((node) => node.type === "button" && text(node).trim() === title);
  const field = (nodes, title) =>
    nodes
      .find((node) => node.type === "label" && node.props.children[0] === title)
      .props.children.find(
        (node) => typeof node === "object" && ["input", "textarea"].includes(node.type),
      );
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  render();
  effects[0]();
  await settle();
  let nodes = render();
  assert.ok(nodes.some((node) => node.props?.["aria-label"] === "导入 JSON / DOCX"));
  button(nodes, "新建世界书").props.onClick();
  nodes = render();
  assert.equal(button(nodes, "新建").props.disabled, true);
  field(nodes, "世界书名称").props.onChange({ target: { value: "我的世界" } });
  button(render(), "新建").props.onClick();
  await settle();
  nodes = render();
  assert.equal(api.records.length, 1);
  assert.equal(api.records[0].entries.length, 0);
  button(nodes, "新增条目").props.onClick();
  nodes = render();
  assert.equal(text(nodes.find((node) => node.type === "h1")), "新增条目");
  field(nodes, "条目名称").props.onChange({ target: { value: "手写条目" } });
  field(render(), "内容").props.onChange({ target: { value: "换行一\n换行二" } });
  button(render(), "完成").props.onClick();
  await settle();
  nodes = render();
  assert.equal(api.records[0].entries.length, 1);
  assert.equal(api.records[0].entries[0].content, "换行一\n换行二");
  assert.ok(nodes.some((node) => node.type === "strong" && text(node) === "手写条目"));
  button(nodes, "新增条目").props.onClick();
  render()
    .find((node) => node.props?.["aria-label"] === "返回")
    .props.onClick();
  assert.ok(button(render(), "新增条目"));
  assert.equal(api.records[0].entries.length, 1);
  // Rejected saves leave the editor and its unsaved draft intact for retry.
  button(render(), "新增条目").props.onClick();
  field(render(), "内容").props.onChange({ target: { value: "不能丢的草稿" } });
  api.fail(true);
  button(render(), "完成").props.onClick();
  await settle();
  nodes = render();
  assert.equal(field(nodes, "内容").props.value, "不能丢的草稿");
  assert.ok(nodes.some((node) => node.props?.role === "alert"));
  assert.equal(api.records[0].entries.length, 1);
});
