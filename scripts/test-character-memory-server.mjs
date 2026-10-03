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
    world_books: [],
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
  let replyWriteFailure = false;
  const db = {
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: { signedUrl: "https://example.invalid/photo.png" },
          error: null,
        }),
        download: async () => ({ data: null, error: new Error("use signed image") }),
      }),
    },
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
        contains: (k, v) => {
          filters.push((r) =>
            Object.entries(v).every(([key, ids]) => ids.every((id) => r[k]?.[key]?.includes(id))),
          );
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
        if (replyWriteFailure && table === "diary_replies" && op !== "read")
          return { data: null, error: new Error("save failed") };
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
  let modelFailure = false;
  let output = JSON.stringify({ messages: [{ type: "text", content: "收到" }] }),
    calls = [];
  let preparedThinking = "嗯，先缓一下。\n他说的是“今天”，不是要我填表。";
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
          if (modelFailure) throw new Error("model unavailable");
          if (request.systemPrompt.includes("本次请求仅执行本轮内心阶段"))
            return {
              text: JSON.stringify({ thinking: `<thinking>${preparedThinking}</thinking>` }),
            };
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
  assert.match(calls.at(-1).systemPrompt, /当前交互媒介是手机聊天/);
  assert.doesNotMatch(calls.at(-1).systemPrompt, /User local time:|REAL TIME CONTEXT/);
  records.ai_personas[0].chat_preferences.longDistance = {
    enabled: true,
    userTimeZone: "Asia/Shanghai",
    charTimeZone: "America/Los_Angeles",
  };
  // Settings reload through the actual owned character DB read, not browser state.
  records.ai_personas[0].chat_preferences = JSON.parse(
    JSON.stringify(records.ai_personas[0].chat_preferences),
  );
  await reply(a, sa);
  assert.match(calls.at(-1).systemPrompt, /User local time:.*Asia\/Shanghai/);
  assert.match(calls.at(-1).systemPrompt, /Char local time:.*America\/Los_Angeles/);
  assert.match(calls.at(-1).systemPrompt, /Time difference: Char minus User/);
  assert.doesNotMatch(calls.at(-1).systemPrompt, /REAL TIME CONTEXT/);
  records.ai_personas[0].chat_preferences.longDistance.userFollowDevice = true;
  records.ai_personas[0].chat_preferences.longDistance.userDisplayLocation = "怀城";
  records.ai_personas[0].chat_preferences.longDistance.charDisplayLocation = "赛博城";
  await chat.namespace.requestPenpalReply({
    data: {
      char_id: a,
      session_id: sa,
      diary_context_mode: "none",
      device_timezone: "Europe/London",
    },
    context: { supabase: db, userId: owner },
  });
  assert.match(calls.at(-1).systemPrompt, /User local time:.*Europe\/London/);
  assert.match(calls.at(-1).systemPrompt, /Char local time:.*America\/Los_Angeles/);
  assert.match(calls.at(-1).systemPrompt, /User location label: "怀城"/);
  assert.match(calls.at(-1).systemPrompt, /Char location label: "赛博城"/);
  await reply(b, sb);
  assert.doesNotMatch(calls.at(-1).systemPrompt, /User local time:|America\/Los_Angeles/);
  assert.match(calls.at(-1).systemPrompt, /PHONE CHAT SCENE/);
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
  // Exercise the actual reply handler with both prompts and display disabled.
  const world = await load("./world-books.functions", resolve(root, "entry.ts"));
  if (world.status === "unlinked") await world.link((s, r) => load(s, r.identifier));
  await world.evaluate();
  const worldData = await load("./world-books", resolve(root, "entry.ts"));
  const worldInvoke = (name, data, userId = owner) =>
    world.namespace[name]({ data, context: { supabase: db, userId } });
  const draft = worldData.namespace.parseWorldBook(
    JSON.stringify({
      tavo_spec: "lorebook",
      tavo_spec_version: 2,
      entries: {
        0: { uid: 0, content: "当前角色常驻规则", constant: true, future: { preserve: 1 } },
        1: { uid: 1, content: "禁止注入的关闭规则", disable: true },
      },
    }),
  );
  const imported = await worldInvoke("importWorldBook", draft);
  // Mock DB defaults normally supplied by PostgreSQL.
  const storedBook = records.world_books.find((row) => row.id === imported.id);
  storedBook.enabled = true;
  storedBook.entry_count = storedBook.entries.length;
  assert.equal((await worldInvoke("listWorldBooks"))[0].id, imported.id);
  await assert.rejects(() => worldInvoke("getWorldBook", { id: imported.id }, b));
  await worldInvoke("updateWorldBook", { id: imported.id, name: "已改名世界书" });
  const beforeEdit = await worldInvoke("getWorldBook", { id: imported.id });
  await worldInvoke("saveWorldEntry", {
    id: imported.id,
    index: 0,
    updated_at: beforeEdit.updated_at,
    entry: { ...beforeEdit.entries[0], name: "规则", content: "当前角色常驻规则已编辑" },
  });
  assert.equal(storedBook.entries[0].raw.future.preserve, 1);
  assert.equal(storedBook.entries[0].raw.content, "当前角色常驻规则已编辑");
  await assert.rejects(() =>
    worldInvoke("saveWorldEntry", {
      id: imported.id,
      index: 0,
      updated_at: "stale",
      entry: beforeEdit.entries[0],
    }),
  );
  records.ai_personas[0].chat_preferences.worldBookIds = [imported.id];
  assert.equal((await worldInvoke("worldBookBindings", { id: imported.id }))[0].id, a);
  await assert.rejects(() => worldInvoke("deleteWorldBook", { id: imported.id }));
  calls.length = 0;
  output = JSON.stringify({ messages: [{ type: "text", content: "收到" }] });
  await reply(b, sb);
  assert.doesNotMatch(calls.at(-1).systemPrompt, /当前角色常驻规则/);
  records.profiles[0].persona_text = "User Persona 必须保留";
  records.ai_personas[0].minimum_messages = 2;
  output = JSON.stringify({
    messages: [
      { type: "text", content: "<thinking>不能泄露</thinking>正文一" },
      { type: "text", content: "正文二" },
    ],
  });
  for (const mode of ["native", "nuojiji", "off"]) {
    records.ai_personas[0].chat_thinking_mode = mode;
    records.ai_personas[0].show_chat_thinking = false;
    records.chat_messages = [
      {
        id: crypto.randomUUID(),
        user_id: owner,
        session_id: sa,
        role: "user",
        content: "看这张图片",
        created_at: "2026-09-28T08:00:00Z",
        message_type: "image",
        payload: { image_path: `${owner}/messages/photo.png`, caption: "今天" },
      },
      {
        id: crypto.randomUUID(),
        user_id: owner,
        session_id: sa,
        role: "user",
        content: "你觉得呢？",
        created_at: "2026-09-28T08:01:00Z",
        message_type: "text",
        payload: {},
      },
    ];
    calls.length = 0;
    const result = await reply(a, sa);
    assert.equal(calls.length, mode === "off" ? 1 : 2);
    const final = calls.at(-1);
    for (const call of calls) {
      assert.match(call.systemPrompt, /PHONE CHAT SCENE/);
      assert.match(call.systemPrompt, /User local time:.*Asia\/Shanghai/);
      assert.match(call.systemPrompt, /Char local time:.*America\/Los_Angeles/);
      assert.match(call.systemPrompt, /当前角色常驻规则已编辑/);
      assert.doesNotMatch(call.systemPrompt, /禁止注入的关闭规则/);
    }
    assert.equal(final.messages[0].content[1].type, "image");
    assert.equal(final.messages[1].content, "你觉得呢？");
    assert.match(final.systemPrompt, /User Persona 必须保留/);
    assert.match(final.systemPrompt, /2 到 3 条/);
    assert.equal(result.messages[0].content, "正文一");
    assert.equal(result.messages[1].content, "正文二");
    assert.equal(result.messages[1].payload.thinking, undefined);
    if (mode !== "off") {
      assert.equal(JSON.stringify(final.messages.slice(0, 2)), JSON.stringify(calls[0].messages));
      assert.equal(final.messages[2].content, `<thinking>\n${preparedThinking}\n</thinking>`);
      assert.equal(result.messages[0].payload.thinking, preparedThinking);
      assert.equal(result.messages[0].payload.thinking_source, mode);
      assert.match(
        calls[0].systemPrompt,
        mode === "native" ? /PRIVATE CHAT — INNER LIFE/ : /\[THINK\]/,
      );
      assert.doesNotMatch(
        calls[0].systemPrompt,
        mode === "native" ? /\[THINK\]/ : /PRIVATE CHAT — INNER LIFE/,
      );
      assert.doesNotMatch(final.systemPrompt, /PRIVATE CHAT — INNER LIFE|\[THINK\]/);
    } else {
      assert.equal(final.messages.length, 2);
      assert.equal(result.messages[0].payload.thinking, undefined);
      assert.doesNotMatch(final.systemPrompt, /PRIVATE CHAT — INNER LIFE|\[THINK\]/);
    }
  }
  await worldInvoke("updateWorldBook", { id: imported.id, enabled: false });
  calls.length = 0;
  await reply(a, sa);
  assert.doesNotMatch(calls.at(-1).systemPrompt, /当前角色常驻规则/);
  await worldInvoke("deleteWorldBook", { id: imported.id, confirmedBindings: true });
  assert.equal(records.world_books.length, 0);
  // Invoke the real private-chat and diary-reply handlers with distinct expression styles.
  const diaryId = crypto.randomUUID();
  records.diaries = [
    { id: diaryId, user_id: owner, title: "今天", content: "想说的话", diary_date: "2026-09-29" },
  ];
  records.diary_replies = [];
  const character = records.ai_personas[0];
  character.minimum_messages = 1;
  character.chat_thinking_mode = "off";
  character.speaking_style = "CHAT_STYLE_ONLY_1";
  character.chat_preferences = {
    letterWritingStyle: "LETTER_STYLE_ONLY_1\n称呼和行文保持独立",
    contextDepth: 20,
  };
  character.personality = "COMMON_PERSONALITY";
  character.background = "COMMON_BACKGROUND";
  async function checkPrivate() {
    records.chat_messages = [
      {
        id: crypto.randomUUID(),
        user_id: owner,
        session_id: sa,
        role: "user",
        content: "你好",
        message_type: "text",
        payload: {},
        created_at: new Date().toISOString(),
        message_order: 0,
      },
    ];
    output = JSON.stringify({ messages: [{ type: "text", content: "你好" }] });
    await reply(a, sa);
    return calls.at(-1).systemPrompt;
  }
  async function checkLetter() {
    output = "一封完整的回信";
    await chat.namespace.createDiaryReply({
      data: { diary_id: diaryId, char_id: a },
      context: { userId: owner, supabase: db },
    });
    return calls.at(-1).systemPrompt;
  }
  const chatBefore = await checkPrivate();
  const letterBefore = await checkLetter();
  assert.match(chatBefore, /CHAT_STYLE_ONLY_1/);
  assert.doesNotMatch(chatBefore, /LETTER_STYLE_ONLY|写信方式/);
  assert.match(letterBefore, /LETTER_STYLE_ONLY_1/);
  assert.doesNotMatch(letterBefore, /CHAT_STYLE_ONLY|说话方式/);
  for (const prompt of [chatBefore, letterBefore]) {
    assert.match(prompt, /COMMON_PERSONALITY/);
    assert.match(prompt, /COMMON_BACKGROUND/);
    assert.match(prompt, /User Persona 必须保留/);
  }
  character.speaking_style = "CHAT_STYLE_ONLY_2";
  assert.equal(await checkLetter(), letterBefore, "chat style edit does not change letter prompt");
  const chatAfter = await checkPrivate();
  assert.match(chatAfter, /CHAT_STYLE_ONLY_2/);
  character.chat_preferences = JSON.parse(
    JSON.stringify({ ...character.chat_preferences, letterWritingStyle: "LETTER_STYLE_ONLY_2" }),
  );
  assert.equal(await checkPrivate(), chatAfter, "letter edit does not change chat prompt");
  assert.match(await checkLetter(), /LETTER_STYLE_ONLY_2/);
  delete character.chat_preferences.letterWritingStyle;
  const legacyLetter = await checkLetter();
  assert.doesNotMatch(legacyLetter, /CHAT_STYLE_ONLY|LETTER_STYLE_ONLY|说话方式|写信方式/);
  assert.match(legacyLetter, /COMMON_PERSONALITY/);

  const target = structuredClone(records.diary_replies[0]);
  const untouched = structuredClone(records.diary_replies[1]);
  const originalCount = records.diary_replies.length;
  const rerollData = { diary_id: diaryId, char_id: a, reply_id: target.id };
  const diaryCall = (name, data, userId = owner) =>
    chat.namespace[name]({ data, context: { userId, supabase: db } });
  output = "<thinking>不进入回信正文</thinking>新的回信内容";
  const replacement = await diaryCall("createDiaryReply", rerollData);
  assert.equal(replacement.reply.id, target.id);
  assert.equal(replacement.reply.content, "新的回信内容");
  assert.equal(
    records.diary_replies.length,
    originalCount,
    "reroll replaces instead of adding a letter",
  );
  assert.deepEqual(records.diary_replies[1], untouched);
  const persisted = JSON.parse(JSON.stringify(records.diary_replies));
  assert.equal(persisted.find((row) => row.id === target.id).content, "新的回信内容");
  assert.doesNotMatch(calls.at(-1).systemPrompt, /说话方式|CHAT_STYLE_ONLY/);
  await assert.rejects(
    () => diaryCall("createDiaryReply", { ...rerollData, char_id: b }),
    /不存在或无权访问/,
  );
  await assert.rejects(
    () => diaryCall("createDiaryReply", rerollData, crypto.randomUUID()),
    /不存在或无权访问/,
  );
  modelFailure = true;
  await assert.rejects(() => diaryCall("createDiaryReply", rerollData), /model unavailable/);
  modelFailure = false;
  assert.equal(records.diary_replies[0].content, "新的回信内容");
  replyWriteFailure = true;
  output = "这封保存失败";
  await assert.rejects(() => diaryCall("createDiaryReply", rerollData), /替换回信失败/);
  await assert.rejects(
    () => diaryCall("deleteDiaryReply", { diary_id: diaryId, reply_id: target.id }),
    /删除回信失败/,
  );
  replyWriteFailure = false;
  assert.equal(records.diary_replies[0].content, "新的回信内容");
  output = "<thinking>只有思考没有回信</thinking>";
  await assert.rejects(() => diaryCall("createDiaryReply", rerollData), /空回信|没有返回可显示/);
  assert.equal(records.diary_replies[0].content, "新的回信内容");
  await diaryCall(
    "deleteDiaryReply",
    { diary_id: diaryId, reply_id: target.id },
    crypto.randomUUID(),
  );
  assert.equal(
    records.diary_replies.length,
    originalCount,
    "foreign delete cannot affect a letter",
  );
  await diaryCall("deleteDiaryReply", { diary_id: crypto.randomUUID(), reply_id: target.id });
  assert.equal(records.diary_replies.length, originalCount, "wrong diary cannot delete a letter");
  await diaryCall("deleteDiaryReply", { diary_id: diaryId, reply_id: target.id });
  assert.equal(records.diary_replies.length, originalCount - 1);
  assert.ok(!JSON.parse(JSON.stringify(records.diary_replies)).some((row) => row.id === target.id));
  assert.deepEqual(
    records.diary_replies.find((row) => row.id === untouched.id),
    untouched,
  );
  assert.equal(records.diaries.length, 1, "single letter deletion preserves diary");

  // Real queue handler canonicalizes snapshots and restricts references to the same owned session.
  const original = {
    id: crypto.randomUUID(),
    session_id: sa,
    user_id: owner,
    role: "assistant",
    content: "你想周六还是周日出发？",
    message_type: "text",
    payload: {},
    delivery_status: "sent",
    created_at: new Date().toISOString(),
    message_order: 0,
  };
  records.chat_messages.push(original);
  const quoteData = {
    session_id: sa,
    char_id: a,
    message: "周日",
    message_type: "text",
    payload: { replyToMessageId: original.id, quotedMessage: { content: "伪造快照" } },
  };
  const queued = await chat.namespace.queuePenpalMessage({
    data: quoteData,
    context: { userId: owner, supabase: db },
  });
  assert.equal(queued.message.payload.replyToMessageId, original.id);
  assert.equal(queued.message.payload.quotedMessage.content, original.content);
  assert.equal(queued.message.payload.quotedMessage.role, "assistant");
  await assert.rejects(
    () =>
      chat.namespace.queuePenpalMessage({
        data: { ...quoteData, session_id: sb, char_id: b },
        context: { userId: owner, supabase: db },
      }),
    /被引用消息不存在/,
  );
  const otherOriginal = { ...original, id: crypto.randomUUID(), user_id: crypto.randomUUID() };
  records.chat_messages.push(otherOriginal);
  await assert.rejects(
    () =>
      chat.namespace.queuePenpalMessage({
        data: { ...quoteData, payload: { replyToMessageId: otherOriginal.id } },
        context: { userId: owner, supabase: db },
      }),
    /被引用消息不存在/,
  );
  // The saved snapshot survives deleting its target and still enters model context.
  records.chat_messages = records.chat_messages.filter((row) => row.id !== original.id);
  const restoredQuote = JSON.parse(JSON.stringify(queued.message));
  const contextRows = await chat.namespace.chatRowsForAi(db, owner, [
    restoredQuote,
    {
      ...restoredQuote,
      id: crypto.randomUUID(),
      message_type: "image",
      payload: {
        ...restoredQuote.payload,
        image_path: `${owner}/messages/photo.png`,
        caption: "看看这里",
      },
    },
  ]);
  assert.match(contextRows[0].content, /你想周六还是周日出发/);
  assert.match(contextRows[0].content, /当前消息：\n周日/);
  assert.equal(contextRows[1].content[1].type, "image");
  assert.match(contextRows[1].content[0].text, /引用回复.*\n.*你想周六还是周日出发/);
  character.chat_thinking_mode = "off";
  records.chat_messages = [restoredQuote];
  output = JSON.stringify({ messages: [{ type: "text", content: "好，那就周日。" }] });
  await reply(a, sa);
  assert.ok(
    calls
      .at(-1)
      .messages.some(
        (row) => typeof row.content === "string" && row.content.includes("你想周六还是周日出发"),
      ),
  );
});
