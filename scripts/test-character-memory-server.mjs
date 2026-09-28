// Executes the actual server handlers; only transport/auth boundary and model are mocked.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import * as zod from "zod";

test("real handlers: memory CRUD, owner/character isolation, summary, 20-row model payload", async () => {
  const owner = "10000000-0000-4000-8000-000000000001";
  const a = "20000000-0000-4000-8000-000000000001";
  const b = "20000000-0000-4000-8000-000000000002";
  const sa = "30000000-0000-4000-8000-000000000001";
  const sb = "30000000-0000-4000-8000-000000000002";
  const records = {
    ai_personas: [
      {
        id: a,
        user_id: owner,
        name: "A",
        minimum_messages: 1,
        maximum_messages: 3,
        chat_thinking_mode: "off",
        chat_preferences: { longTermMemory: true },
      },
      {
        id: b,
        user_id: owner,
        name: "B",
        minimum_messages: 1,
        maximum_messages: 3,
        chat_thinking_mode: "off",
        chat_preferences: { contextDepth: 2 },
      },
    ],
    profiles: [{ id: owner, display_name: "用户", time_awareness_enabled: false }],
    chat_sessions: [
      { id: sa, user_id: owner, char_id: a },
      { id: sb, user_id: owner, char_id: b },
    ],
    chat_stickers: [],
    character_memories: [],
    chat_messages: Array.from({ length: 31 }, (_, i) => ({
      id: crypto.randomUUID(),
      user_id: owner,
      session_id: sa,
      content: `消息${i}`,
      role: i % 2 ? "assistant" : "user",
      created_at: new Date(2026, 8, 28, 0, i).toISOString(),
      message_order: 0,
      message_type: "text",
      delivery_status: "sent",
      payload: {},
    })).concat([
      {
        id: crypto.randomUUID(),
        user_id: owner,
        session_id: sb,
        role: "user",
        content: "B的消息",
        message_type: "text",
        payload: {},
        created_at: new Date().toISOString(),
      },
    ]),
  };
  const db = {
    from(table) {
      let filters = [],
        orders = [],
        limit = Infinity,
        op = "read",
        values;
      const q = {
        select: () => q,
        eq: (k, v) => {
          filters.push((r) => r[k] === v);
          return q;
        },
        in: (k, v) => {
          filters.push((r) => v.includes(r[k]));
          return q;
        },
        order: (k, o = { ascending: true }) => {
          orders.push([k, o.ascending]);
          return q;
        },
        limit: (n) => {
          limit = n;
          return q;
        },
        insert: (v) => {
          op = "insert";
          values = v;
          return q;
        },
        update: (v) => {
          op = "update";
          values = v;
          return q;
        },
        delete: () => {
          op = "delete";
          return q;
        },
        maybeSingle: () => run(true),
        single: () => run(true),
        then: (ok, fail) => run(false).then(ok, fail),
      };
      async function run(single) {
        let rows = records[table].filter((r) => filters.every((f) => f(r)));
        if (op === "insert") {
          rows = (Array.isArray(values) ? values : [values]).map((r) => ({
            id: crypto.randomUUID(),
            updated_at: new Date().toISOString(),
            ...r,
          }));
          records[table].push(...rows);
        }
        if (op === "update") rows.forEach((r) => Object.assign(r, values));
        if (op === "delete") records[table] = records[table].filter((r) => !rows.includes(r));
        rows = [...rows]
          .sort((x, y) => {
            for (const [k, asc] of orders) {
              if (x[k] !== y[k]) return (x[k] > y[k] ? 1 : -1) * (asc ? 1 : -1);
            }
            return 0;
          })
          .slice(0, limit);
        return { data: structuredClone(single ? (rows[0] ?? null) : rows), error: null };
      }
      return q;
    },
  };
  let output = JSON.stringify({ messages: [{ type: "text", content: "收到" }] }),
    calls = [];
  const context = vm.createContext({ console, crypto, URL, Date, TextEncoder, fetch });
  const cache = new Map();
  const synthetic = (key, exports) => {
    if (!cache.has(key))
      cache.set(
        key,
        new vm.SyntheticModule(
          Object.keys(exports),
          function () {
            for (const [k, v] of Object.entries(exports)) this.setExport(k, v);
          },
          { context, identifier: key },
        ),
      );
    return cache.get(key);
  };
  async function load(specifier, parent) {
    if (specifier === "zod") return synthetic("zod", zod);
    if (specifier === "@tanstack/react-start")
      return synthetic("transport", {
        createServerFn: () => {
          let validate = (x) => x;
          const chain = {
            middleware: () => chain,
            validator: (f) => {
              validate = f;
              return chain;
            },
            handler: (f) => (args) => f({ ...args, data: validate(args.data) }),
          };
          return chain;
        },
      });
    if (specifier.includes("auth-middleware"))
      return synthetic("auth", { requireSupabaseAuth: {} });
    if (specifier.endsWith("ai/service.server"))
      return synthetic("model", {
        generate: async (request) => {
          calls.push(request);
          return { text: output };
        },
      });
    const file = resolve(dirname(parent), specifier) + (specifier.endsWith(".ts") ? "" : ".ts");
    if (cache.has(file)) return cache.get(file);
    const source = ts.transpileModule(await readFile(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const mod = new vm.SourceTextModule(source, {
      context,
      identifier: file,
      importModuleDynamically: async (spec, ref) => {
        const dep = await load(spec, ref.identifier);
        if (dep.status === "unlinked") await dep.link((s, r) => load(s, r.identifier));
        if (dep.status === "linked") await dep.evaluate();
        return dep;
      },
    });
    cache.set(file, mod);
    return mod;
  }
  const root = fileURLToPath(new URL("../src/lib/", import.meta.url));
  const memory = await load("./character-memory.functions", resolve(root, "entry.ts"));
  await memory.link((s, r) => load(s, r.identifier));
  await memory.evaluate();
  const invoke = (name, data) =>
    memory.namespace[name]({ data, context: { supabase: db, userId: owner } });
  const saved = await invoke("saveCharacterMemory", {
    char_id: a,
    id: null,
    content: "用户喜欢茶",
  });
  const other = await invoke("saveCharacterMemory", { char_id: b, id: null, content: "B独有记忆" });
  await invoke("saveCharacterMemory", { char_id: a, id: saved.id, content: "用户喜欢红茶" });
  assert.equal((await invoke("listCharacterMemories", { char_id: a }))[0].content, "用户喜欢红茶");
  await assert.rejects(() =>
    invoke("saveCharacterMemory", { char_id: a, id: other.id, content: "越权编辑" }),
  );
  await invoke("deleteCharacterMemory", { char_id: a, id: other.id });
  assert.equal((await invoke("listCharacterMemories", { char_id: b })).length, 1);
  const chat = await load("./penpal.functions", resolve(root, "entry.ts"));
  if (chat.status === "unlinked") await chat.link((s, r) => load(s, r.identifier));
  await chat.evaluate();
  const reply = (char_id, session_id) =>
    chat.namespace.requestPenpalReply({
      data: { char_id, session_id, diary_context_mode: "none" },
      context: { supabase: db, userId: owner },
    });
  await reply(a, sa);
  assert.equal(calls.at(-1).messages.length, 20);
  assert.equal(calls.at(-1).messages[0].content, "消息11");
  assert.match(calls.at(-1).systemPrompt, /用户喜欢红茶/);
  assert.doesNotMatch(calls.at(-1).systemPrompt, /B独有记忆/);
  assert.equal(calls.at(-1).charId, a);
  await reply(b, sb);
  assert.doesNotMatch(calls.at(-1).systemPrompt, /LONG TERM MEMORY|用户喜欢红茶|B独有记忆/);
  output = JSON.stringify({ memories: ["用户喜欢红茶", "用户养猫"] });
  const summary = await invoke("summarizeCharacterMemory", { char_id: a });
  assert.equal(summary.added, 1);
  assert.equal(calls.at(-1).scene, "private_chat");
  assert.equal(calls.at(-1).charId, a);
  assert.equal(summary.memories.length, 2);
  await invoke("deleteCharacterMemory", { char_id: a, id: saved.id });
  assert.equal((await invoke("listCharacterMemories", { char_id: a })).length, 1);
  assert.equal((await invoke("listCharacterMemories", { char_id: b }))[0].content, "B独有记忆");
});
