import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import * as zod from "zod";
import * as appearance from "../src/lib/appearance.ts";
import * as preferences from "../src/lib/character-chat.ts";
import * as quote from "../src/lib/chat-quote.ts";
import * as multimodal from "../src/lib/ai/multimodal.ts";
import * as message from "../src/lib/chat-message.ts";

async function load(file, dependencies, globals = {}, extra = "") {
  const source = await readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source + extra, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      assert.ok(name in dependencies, `Unexpected import ${name}`);
      return dependencies[name];
    },
    console,
    crypto,
    URL,
    File,
    Blob,
    Response,
    TextEncoder,
    Uint8Array,
    btoa,
    fetch,
    AbortController,
    setTimeout,
    clearTimeout,
    ...globals,
  });
  return exports;
}
const component = () => null;
function nodes(root) {
  if (!root || typeof root !== "object") return [];
  return [root, ...[root.props?.children].flat(Infinity).flatMap(nodes)];
}
function hooks() {
  const values = [];
  let cursor = 0;
  const effects = [];
  return {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
        return [
          values[index],
          (next) => {
            values[index] = typeof next === "function" ? next(values[index]) : next;
          },
        ];
      },
      useRef(initial) {
        const index = cursor++;
        return (values[index] ??= { current: initial });
      },
      useEffect(effect) {
        effects.push(effect);
      },
      useMemo(compute) {
        return compute();
      },
    },
    render(render) {
      cursor = 0;
      effects.length = 0;
      return render();
    },
    effects,
  };
}
async function settle() {
  for (let i = 0; i < 12; i++) await new Promise(setImmediate);
}
function database(records) {
  const deletes = [],
    writes = [];
  return {
    deletes,
    writes,
    from(table) {
      let filters = [],
        op = "read",
        payload;
      const q = {
        select: () => q,
        order: () => q,
        limit: () => q,
        eq(k, v) {
          filters.push((r) => r[k] === v);
          return q;
        },
        in(k, ids) {
          filters.push((r) => ids.includes(r[k]));
          return q;
        },
        update(value) {
          op = "update";
          payload = value;
          return q;
        },
        delete() {
          op = "delete";
          return q;
        },
        single: () => run(true),
        maybeSingle: () => run(true),
        then: (ok, fail) => run(false).then(ok, fail),
      };
      async function run(single) {
        const rows = (records[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (op === "update") {
          writes.push({ table, payload });
          rows.forEach((r) => Object.assign(r, structuredClone(payload)));
        }
        if (op === "delete") {
          deletes.push(rows.map((r) => r.id));
          records[table] = records[table].filter((r) => !rows.includes(r));
        }
        return { data: structuredClone(single ? rows[0] : rows), error: null };
      }
      return q;
    },
  };
}

test("actual multimodal HTTP payload keeps new/refreshed images and text in order, including 4 MB uploads", async () => {
  const captured = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    captured.push(JSON.parse(body));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: "已收到请求" } }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const chain = {
      middleware: () => chain,
      validator: () => chain,
      handler: (handler) => handler,
    };
    const penpal = await load("lib/penpal.functions.ts", {
      "@tanstack/react-start": { createServerFn: () => chain },
      zod,
      "@/integrations/supabase/auth-middleware": { requireSupabaseAuth: {} },
      "./ai/multimodal": multimodal,
      "./chat-quote": quote,
      "./character-chat": preferences,
      "./world-books": {},
      "./chat-transfer": {},
      "./chat-transfer.server": {},
    });
    // Synthetic valid images only; padding exercises the former 3 MB fallback.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOZkAAAAASUVORK5CYII=",
      "base64",
    );
    const blobs = [
      new Blob([png, new Uint8Array(4 * 1024 * 1024 - png.length)], { type: "image/png" }),
      new Blob(
        [Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")],
        { type: "image/gif" },
      ),
    ];
    const db = database({
      ai_configs: [
        {
          id: "config",
          user_id: "owner",
          enabled: true,
          encrypted_api_key: "test",
          model_name: "configured-model",
          base_url: `http://127.0.0.1:${server.address().port}`,
          custom_headers: {},
        },
      ],
    });
    db.storage = {
      from: () => ({
        createSignedUrl: async () => ({
          data: { signedUrl: "https://example.invalid/private.png" },
          error: null,
        }),
        download: async (path) => ({ data: blobs[path.endsWith("gif") ? 1 : 0], error: null }),
      }),
    };
    const saved = JSON.parse(
      JSON.stringify([
        {
          id: "one",
          role: "user",
          message_type: "image",
          payload: { image_path: "owner/messages/a.png" },
        },
        { id: "two", role: "user", message_type: "text", content: "第一张是什么？" },
        {
          id: "three",
          role: "user",
          message_type: "image",
          payload: { image_path: "owner/messages/b.gif" },
        },
      ]),
    );
    const messages = await penpal.chatRowsForAi(db, "owner", saved);
    const service = await load(
      "lib/ai/service.server.ts",
      {
        "./crypto.server": { decryptApiKey: async () => "test-key" },
        "./multimodal": multimodal,
      },
      { process: { env: {} } },
    );
    await service.generate({ scene: "private_chat", userId: "owner", supabase: db, messages });
    assert.equal(captured.length, 1);
    const payload = captured[0];
    assert.equal(payload.model, "configured-model");
    assert.equal(payload.messages[0].content[0].type, "image_url");
    assert.match(payload.messages[0].content[0].image_url.url, /^data:image\/png;base64,/);
    assert.equal(
      Buffer.from(payload.messages[0].content[0].image_url.url.split(",")[1], "base64").length,
      blobs[0].size,
    );
    assert.equal(payload.messages[1].content, "第一张是什么？");
    assert.match(payload.messages[2].content[0].image_url.url, /^data:image\/gif;base64,/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("chat wallpaper auto-save preserves other preferences and character isolation; deletion stays durable", async () => {
  const records = {
    ai_personas: [
      {
        id: "a",
        user_id: "owner",
        chat_preferences: {
          wallpaperPath: "owner/chat-wallpapers/a/old.png",
          contextDepth: 9,
          userBubbleCss: "color:red;",
          remark: "A",
        },
      },
      {
        id: "b",
        user_id: "owner",
        chat_preferences: { wallpaperUrl: "https://example.invalid/b.png" },
      },
    ],
  };
  const db = database(records),
    removed = [];
  db.storage = { from: () => ({ remove: async (paths) => removed.push(...paths) }) };
  db.rpc = async (_name, { p_character_id, p_wallpaper }) => {
    const row = records.ai_personas.find((row) => row.id === p_character_id);
    if (!row) return { error: new Error("missing") };
    row.chat_wallpaper = { ...p_wallpaper, updatedAt: new Date().toISOString() };
    Object.assign(row.chat_preferences, p_wallpaper);
    return { data: structuredClone(row), error: null };
  };
  const wallpaper = await load("lib/character-wallpaper.ts", {
    "@/integrations/supabase/client": { supabase: db },
    "./chat-media": {},
    "./wallpaper-media": {},
    "./stickers/resolve-resource": {},
    "./chat-wallpaper-state": {},
  });
  await wallpaper.saveCharacterWallpaper("owner", "a", {
    wallpaperPath: "owner/chat-wallpapers/a/new.png",
    wallpaperUrl: null,
  });
  const restored = JSON.parse(JSON.stringify(records.ai_personas));
  assert.equal(restored[0].chat_preferences.wallpaperPath, "owner/chat-wallpapers/a/new.png");
  assert.equal(restored[0].chat_preferences.contextDepth, 9);
  assert.equal(restored[0].chat_preferences.userBubbleCss, "color:red;");
  assert.equal(restored[1].chat_preferences.wallpaperUrl, "https://example.invalid/b.png");
  assert.deepEqual(removed, []); // Keep older assets usable by open tabs/other devices.
  await wallpaper.saveCharacterWallpaper("owner", "a", { wallpaperPath: null, wallpaperUrl: null });
  assert.equal(records.ai_personas[0].chat_preferences.wallpaperPath, null);
  await assert.rejects(() =>
    wallpaper.saveCharacterWallpaper("other-owner", "a", {
      wallpaperPath: null,
      wallpaperUrl: null,
    }),
  );
});

test("long-press deletion enters multi-select; cancel, one/multiple delete and quote snapshots remain correct", async () => {
  const original = {
    id: "one",
    role: "assistant",
    content: "原消息",
    message_type: "text",
    session_id: "s",
    user_id: "owner",
    payload: {},
    created_at: "2026-09-30T00:00:00Z",
    delivery_status: "sent",
  };
  const quoted = {
    ...original,
    id: "two",
    role: "user",
    content: "引用回复",
    payload: quote.quoteMessage(original, "角色"),
  };
  const records = {
    ai_personas: [{ id: "a", name: "角色", user_id: "owner" }],
    chat_sessions: [{ id: "s", char_id: "a" }],
    chat_messages: [original, quoted, { ...original, id: "three" }, { ...original, id: "four" }],
  };
  const db = database(records),
    hook = hooks();
  let confirmation = true;
  const ChatMessages = () => null;
  const source = await load(
    "routes/_authenticated/chat.tsx",
    {
      react: hook.react,
      "react/jsx-runtime": jsx,
      zod,
      "@tanstack/react-router": {
        createFileRoute: () => (options) => options,
        useNavigate: () => component,
      },
      "@tanstack/react-start": { useServerFn: (fn) => fn },
      "lucide-react": new Proxy({}, { get: () => component }),
      "@/integrations/supabase/client": { supabase: db },
      "@/context/AuthContext": {
        useAuth: () => ({ user: { id: "owner" }, profile: { id: "owner" } }),
      },
      "@/lib/penpal.functions": {},
      "@/lib/avatar": { resolveAvatarUrl: async () => "" },
      "@/components/ui-kit": { EmptyState: component, LoadingSpinner: component },
      "@/components/ChatNav": { ChatNav: component },
      "@/components/ChatMessages": { ChatMessages },
      ...Object.fromEntries(
        [
          "ChatComposer",
          "AttachmentSheet",
          "TransferSheet",
          "TransferDetailSheet",
          "StickerPicker",
          "ImageViewer",
          "VoiceCallScreen",
          "ChatCharacterEditor",
          "ChatRemarkSheet",
        ].map((name) => [`@/components/chat/${name}`, { [name]: component }]),
      ),
      "@/components/system-ui": { SystemSheet: component },
      "@/hooks/useKeyboardViewport": { useKeyboardViewport() {} },
      "@/lib/chat-read-state": { lastReadAt() {}, markChatRead() {} },
      "@/lib/app-transition": {},
      "@/lib/chat-message": message,
      "@/lib/chat-quote": quote,
      "@/lib/chat-media": {},
      "@/lib/character-chat": preferences,
      "@/lib/bubble-css": { bubbleStyles: () => "" },
      "@/lib/chat-wallpaper-state": { useCharacterWallpaper: () => ({ displayUrl: "" }) },
      "@/lib/appearance": appearance,
    },
    {
      localStorage: { setItem() {} },
      document: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} },
      window: { innerWidth: 390, innerHeight: 844, confirm: () => confirmation },
    },
    "\nexport { ConversationPage };",
  );
  const render = () => hook.render(() => source.ConversationPage({ charId: "a" }));
  render();
  hook.effects.forEach((fn) => fn());
  await settle();
  const props = () => nodes(render()).find((node) => node.type === ChatMessages).props;
  const begin = (id) => {
    props().onOpenMessageMenu(id, { left: 80, top: 100, width: 100, bottom: 130 });
    nodes(render())
      .find((node) => node.props.role === "menuitem" && node.props.className === "is-danger")
      .props.onClick();
  };
  begin("one");
  assert.deepEqual([...props().selectedMessageIds], ["one"]);
  const toolbar = () => nodes(render()).find((node) => node.props.role === "toolbar");
  nodes(toolbar())
    .find((node) => node.type === "button" && node.props.children === "取消")
    .props.onClick();
  assert.equal(props().selectedMessageIds, null);
  begin("three");
  await nodes(toolbar())
    .find((node) => node.type === "button" && node.props.className === "is-danger")
    .props.onClick();
  await settle();
  assert.equal(records.chat_messages.length, 3);
  begin("one");
  props().onToggleMessageSelection("two");
  assert.equal(props().selectedMessageIds.size, 2);
  confirmation = false;
  await nodes(toolbar())
    .find((node) => node.type === "button" && node.props.className === "is-danger")
    .props.onClick();
  await settle();
  assert.equal(records.chat_messages.length, 3);
  confirmation = true;
  props().onToggleMessageSelection("two");
  await nodes(toolbar())
    .find((node) => node.type === "button" && node.props.className === "is-danger")
    .props.onClick();
  await settle();
  assert.equal(records.chat_messages.length, 2);
  assert.equal(quote.readQuotedMessage(records.chat_messages[0].payload).content, "原消息");
  assert.match(quote.quotedContextForAi(records.chat_messages[0].payload), /原消息/);
  // The actual editor supports selecting both roles; verify one atomic delete query.
  begin("two");
  // Selection of a message still in the rendered list covers both user/assistant roles.
  props().onToggleMessageSelection("four");
  await nodes(toolbar())
    .find((node) => node.type === "button" && node.props.className === "is-danger")
    .props.onClick();
  await settle();
  assert.equal(db.deletes.length, 3);
  assert.equal(records.chat_messages.length, 0);
  assert.deepEqual(db.deletes.at(-1), ["two", "four"]);
  assert.equal(props().selectedMessageIds, null);
});

test("desktop upload automatically persists and applies before leaving; remount uses saved wallpaper without an apply button", async () => {
  const record = {
    id: "owner",
    wallpaper_url: "owner/old.png",
    wallpaper_preset: "linen",
    wallpaper_blur: 2,
    wallpaper_opacity: 0.2,
  };
  const db = database({ profiles: [record] });
  db.storage = {
    from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }),
  };
  let snapshot = {
    path: record.wallpaper_url,
    url: "blob:old",
    preset: "linen",
    blur: 2,
    opacity: 0.2,
  };
  let profile = { ...record };
  const wallpaper = {
    retainWallpaperUrl: () => () => {},
    rememberWallpaper: () => "blob:new",
    getWallpaperSnapshot: () => snapshot,
    syncWallpaperFromProfile: () => {},
    applyWallpaperOptimistically: (next) => {
      snapshot = { ...next };
    },
    commitWallpaper: (next) => {
      snapshot = { ...next };
    },
    rollbackWallpaper: (previous) => {
      snapshot = previous;
    },
    optimizeWallpaperUpload: async (file) => file,
    resolveWallpaperUrl: async () => "blob:stored",
  };
  async function page() {
    const hook = hooks();
    const module = await load("routes/_authenticated/wallpaper.tsx", {
      react: hook.react,
      "react/jsx-runtime": jsx,
      "@tanstack/react-router": {
        createFileRoute: () => (options) => options,
        useNavigate: () => component,
      },
      "lucide-react": { ImagePlus: component, Trash2: component },
      "@/integrations/supabase/client": { supabase: db },
      "@/context/AuthContext": {
        useAuth: () => ({
          user: { id: "owner" },
          profile,
          refreshProfile: async () => {
            profile = { ...record };
          },
        }),
      },
      "@/components/ui-kit": {
        ErrorBanner: component,
        Header: component,
        LoadingSpinner: component,
      },
      "@/lib/app-transition": {},
      "@/lib/wallpaper": wallpaper,
      "@/lib/wallpaper-media": wallpaper,
    });
    const render = () => hook.render(module.Route.component);
    render();
    hook.effects.forEach((fn) => fn());
    await settle();
    return { render };
  }
  const original = await page();
  assert.ok(
    !nodes(original.render()).some(
      (node) => node.type === "button" && node.props.children === "应用壁纸",
    ),
  );
  nodes(original.render())
    .find((node) => node.type === "input" && node.props.type === "file")
    .props.onChange({
      target: { files: [new File(["image"], "photo.png", { type: "image/png" })] },
    });
  await settle();
  assert.match(record.wallpaper_url, /^owner\/wallpaper-.*\.png$/);
  assert.equal(snapshot.path, record.wallpaper_url);
  const reopened = await page();
  assert.ok(
    nodes(reopened.render()).some(
      (node) => node.props.style?.backgroundImage === "url(blob:stored)",
    ),
  );
  assert.equal(db.writes.length, 1);
  assert.equal(record.wallpaper_blur, 2);
});
