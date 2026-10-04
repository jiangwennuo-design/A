// Actual server handlers and JSON payload; transport/database/model are test doubles.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import * as zod from "zod";

test("bidirectional transfers and voice: real handlers, ownership, persistence, model content and reroll", async () => {
  const userId = crypto.randomUUID(),
    charId = crypto.randomUUID(),
    sessionId = crypto.randomUUID();
  const records = {
    profiles: [
      {
        id: userId,
        display_name: "User",
        inner_life_enabled: false,
        time_awareness_enabled: false,
      },
    ],
    ai_personas: [
      {
        id: charId,
        user_id: userId,
        name: "Char",
        minimum_messages: 1,
        maximum_messages: 3,
        chat_thinking_mode: "off",
      },
    ],
    chat_sessions: [{ id: sessionId, user_id: userId, char_id: charId }],
    chat_messages: [],
    chat_stickers: [],
    diaries: [],
  };
  let clock = 0,
    output = {},
    failure = false;
  const requests = [];
  const db = {
    from(table) {
      let filters = [],
        orders = [],
        limit = Infinity,
        op = "read",
        values;
      const q = {
        select: () => q,
        eq(k, v) {
          filters.push((r) => (k === "payload" ? JSON.stringify(r[k]) === v : r[k] === v));
          return q;
        },
        order(k, options = {}) {
          orders.push([k, options.ascending !== false]);
          return q;
        },
        limit(n) {
          limit = n;
          return q;
        },
        insert(v) {
          values = v;
          op = "insert";
          return q;
        },
        update(v) {
          values = v;
          op = "update";
          return q;
        },
        maybeSingle: () => run(true),
        single: () => run(true),
        then: (ok, bad) => run(false).then(ok, bad),
      };
      async function run(single) {
        if (failure && table === "chat_messages" && op === "update")
          return { data: null, error: new Error("offline") };
        let rows = (records[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (op === "insert") {
          rows = (Array.isArray(values) ? values : [values]).map((r) => ({
            id: crypto.randomUUID(),
            created_at: new Date(1760000000000 + ++clock * 1000).toISOString(),
            updated_at: "now",
            ...r,
          }));
          records[table].push(...rows);
        }
        if (op === "update") rows.forEach((r) => Object.assign(r, structuredClone(values)));
        rows = [...rows]
          .sort((a, b) => {
            for (const [k, asc] of orders)
              if (a[k] !== b[k]) return (a[k] > b[k] ? 1 : -1) * (asc ? 1 : -1);
            return 0;
          })
          .slice(0, limit);
        return { data: structuredClone(single ? (rows[0] ?? null) : rows), error: null };
      }
      return q;
    },
  };
  const context = vm.createContext({ console, crypto, URL, Date, fetch, TextEncoder });
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
    if (specifier.includes("auth-middleware"))
      return synthetic("auth", { requireSupabaseAuth: {} });
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
    if (specifier.endsWith("ai/service.server"))
      return synthetic("model", {
        generate: async (request) => {
          requests.push(request);
          return { text: JSON.stringify(output) };
        },
      });
    if (specifier.endsWith("world-books.server"))
      return synthetic("books", { loadBoundWorldBooks: async () => [] });
    const file = resolve(dirname(parent), specifier) + (specifier.endsWith(".ts") ? "" : ".ts");
    if (cache.has(file)) return cache.get(file);
    const source = ts.transpileModule(await readFile(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = new vm.SourceTextModule(source, {
      context,
      identifier: file,
      importModuleDynamically: async (s, ref) => {
        const dep = await load(s, ref.identifier);
        if (dep.status === "unlinked") await dep.link((s, r) => load(s, r.identifier));
        if (dep.status === "linked") await dep.evaluate();
        return dep;
      },
    });
    cache.set(file, module);
    return module;
  }
  const root = resolve("src/lib/entry.ts");
  const mod = await load("./penpal.functions", root);
  await mod.link((s, r) => load(s, r.identifier));
  await mod.evaluate();
  const invoke = (name, data, owner = userId) =>
    mod.namespace[name]({ data, context: { supabase: db, userId: owner } });
  const queue = (message_type, payload = {}, message = "你好") =>
    invoke("queuePenpalMessage", {
      session_id: sessionId,
      char_id: charId,
      message_type,
      payload,
      message,
    });
  const reply = (actions) => {
    output = {
      messages: [{ type: "text", content: "好呀" }],
      ...(actions ? { transferActions: actions } : {}),
    };
    return invoke("requestPenpalReply", {
      session_id: sessionId,
      char_id: charId,
      diary_context_mode: "none",
    });
  };
  const settle = (row, status, owner) =>
    invoke(
      "settlePenpalTransfer",
      { session_id: sessionId, char_id: charId, message_id: row.id, status },
      owner,
    );
  const outgoing = (
    await queue("transfer", { amount: 20, note: "奶茶", status: "received", sender: "forged" }, "")
  ).message;
  assert.equal(outgoing.payload.status, "pending");
  assert.equal(outgoing.payload.sender, userId);
  assert.equal(outgoing.payload.receiver, charId);
  assert.equal(outgoing.payload.remark, "奶茶");
  assert.ok(outgoing.payload.transferId);
  assert.ok(outgoing.payload.createdAt);
  await reply();
  assert.equal(
    records.chat_messages.find((r) => r.id === outgoing.id).payload.status,
    "pending",
    "no automatic receipt",
  );
  await assert.rejects(() => settle(outgoing, "received"), /只有收款方/);
  await queue("text");
  const accepted = await reply([{ type: "received", transferId: outgoing.payload.transferId }]);
  assert.equal(accepted.transfer_updates[0].payload.status, "received");
  assert.match(requests.at(-1).systemPrompt, /不要固定自动收款/);
  const second = (await queue("transfer", { amount: 12.34, remark: "午饭" }, "")).message;
  const rejected = await reply([
    { type: "refunded", transferId: second.payload.transferId },
    { type: "send", amount: 88.88, remark: "给你的" },
  ]);
  assert.equal(rejected.transfer_updates[0].payload.status, "refunded");
  const incoming = rejected.messages.find((r) => r.message_type === "transfer");
  assert.equal(incoming.payload.sender, charId);
  assert.equal(incoming.payload.receiver, userId);
  const received = (await settle(incoming, "received")).message;
  assert.equal(received.payload.status, "received");
  assert.equal(
    (await settle(incoming, "refunded")).message.payload.status,
    "received",
    "cannot reverse settled state",
  );
  await assert.rejects(() => settle(incoming, "received", crypto.randomUUID()), /无权访问/);
  await queue("text");
  await assert.rejects(
    () => reply([{ type: "received", transferId: incoming.payload.transferId }]),
    /无效或重复/,
  );
  const sent = await reply([{ type: "send", amount: 5, remark: "退给我试试" }]);
  const toRefund = sent.messages.find((r) => r.message_type === "transfer");
  assert.equal((await settle(toRefund, "refunded")).message.payload.status, "refunded");
  await queue("text");
  const another = (await reply([{ type: "send", amount: 1 }])).messages.find(
    (r) => r.message_type === "transfer",
  );
  failure = true;
  await assert.rejects(() => settle(another, "received"), /保存失败/);
  assert.equal(records.chat_messages.find((r) => r.id === another.id).payload.status, "pending");
  failure = false;
  const race = await Promise.all([settle(another, "received"), settle(another, "refunded")]);
  assert.equal(
    race[0].message.payload.status,
    race[1].message.payload.status,
    "atomic first winner",
  );
  assert.equal(
    records.chat_messages.find((r) => r.id === another.id).payload.status,
    race[0].message.payload.status,
  );
  const legacy = {
    id: crypto.randomUUID(),
    user_id: userId,
    session_id: sessionId,
    role: "assistant",
    message_type: "transfer",
    created_at: new Date().toISOString(),
    payload: { amount: 2, note: "旧备注", thinking: "保留" },
  };
  records.chat_messages.push(legacy);
  const migrated = (await settle(legacy, "received")).message;
  assert.equal(migrated.payload.remark, "旧备注");
  assert.equal(migrated.payload.transferId, legacy.id);
  assert.equal(migrated.payload.thinking, "保留");
  const reloaded = JSON.parse(JSON.stringify(records));
  assert.equal(reloaded.chat_messages.find((r) => r.id === incoming.id).payload.status, "received");
  assert.equal(reloaded.chat_messages.find((r) => r.id === toRefund.id).payload.status, "refunded");
  const helper = await load("./chat-transfer", root);
  assert.equal(helper.namespace.transferStatus("accepted"), "received");
  assert.equal(helper.namespace.transferStatus("returned"), "refunded");
  await assert.rejects(() => queue("transfer", { amount: 0.001 }, ""), /有效/);
  await assert.rejects(() => queue("transfer", { amount: 1000000 }, ""), /有效/);
  await assert.rejects(
    () =>
      invoke("rerollPenpalTurn", {
        session_id: sessionId,
        char_id: charId,
        turn_id: sent.turn_id,
        diary_context_mode: "none",
      }),
    /本轮包含转账/,
  );
  // Legacy fixture above uses the real clock; subsequent inserts must remain chronological.
  clock = Math.ceil((Date.now() - 1760000000000) / 1000) + 1;
  const voice = (
    await queue(
      "voice",
      { duration: 99999, text: "forged", status: "completed" },
      "今天终于忙完了\n想听听你的声音",
    )
  ).message;
  assert.equal(voice.message_type, "text");
  assert.equal(voice.payload.display_type, "voice");
  assert.equal(voice.role, "user");
  assert.equal(voice.content, "今天终于忙完了\n想听听你的声音");
  assert.ok(voice.payload.duration > 0 && voice.payload.duration < 60);
  assert.equal(voice.payload.status, undefined);
  assert.equal(voice.payload.text, undefined);
  await assert.rejects(() => queue("voice", {}, "  "), /不能为空/);
  output = {
    messages: [
      { type: "voice", content: "我也刚忙完\n现在可以陪你一会儿" },
      { type: "text", content: "今天怎么样" },
    ],
  };
  const voiceReply = await invoke("requestPenpalReply", {
    session_id: sessionId,
    char_id: charId,
    diary_context_mode: "none",
  });
  assert.equal(voiceReply.messages[0].message_type, "text");
  assert.equal(voiceReply.messages[0].payload.display_type, "voice");
  assert.equal(voiceReply.messages[1].message_type, "text");
  assert.ok(voiceReply.messages[0].payload.duration > 0);
  assert.match(requests.at(-1).systemPrompt, /type.*voice/);
  assert.ok(
    requests
      .at(-1)
      .messages.some(
        (row) => typeof row.content === "string" && row.content.includes(voice.content),
      ),
  );
  const quotedVoice = (await queue("text", { replyToMessageId: voiceReply.messages[0].id }, "好呀"))
    .message;
  assert.equal(quotedVoice.payload.quotedMessage.messageType, "voice");
  assert.equal(quotedVoice.payload.quotedMessage.content, voiceReply.messages[0].content);
  const voiceSnapshot = JSON.parse(JSON.stringify(records.chat_messages));
  const modelHistory = await mod.namespace.chatRowsForAi(db, userId, voiceSnapshot);
  assert.ok(modelHistory.some((row) => row.content.includes(voiceReply.messages[0].content)));
  assert.ok(
    modelHistory.some(
      (row) => row.content.includes("被引用原文") && row.content.includes("我也刚忙完"),
    ),
  );
  // Every stored row and RPC input must work with the unchanged production CHECK/RPC.
  assert.ok(records.chat_messages.every((row) => row.message_type !== "voice"));
  db.rpc = async (name, args) => {
    assert.equal(name, "replace_chat_turn");
    assert.equal(args.p_char_id, charId);
    assert.equal(args.p_messages[0].message_type, "text");
    assert.equal(args.p_messages[0].payload.display_type, "voice");
    const saved = args.p_messages.map((row, index) => ({
      ...row,
      id: crypto.randomUUID(),
      user_id: userId,
      session_id: sessionId,
      role: "assistant",
      turn_id: args.p_turn_id,
      message_order: index + 1,
    }));
    records.chat_messages = records.chat_messages.filter(
      (row) => row.turn_id !== args.p_turn_id || row.role !== "assistant",
    );
    records.chat_messages.push(...saved);
    return { data: saved, error: null };
  };
  const rerolled = await invoke("rerollPenpalTurn", {
    session_id: sessionId,
    char_id: charId,
    turn_id: voiceReply.turn_id,
    diary_context_mode: "none",
  });
  assert.equal(rerolled.messages[0].message_type, "text");
  assert.equal(rerolled.messages[0].payload.display_type, "voice");
  assert.equal(rerolled.messages[0].content, voiceReply.messages[0].content);
});
