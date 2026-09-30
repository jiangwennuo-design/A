import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const source = async (file) =>
  ts.transpileModule(await readFile(new URL(`../src/lib/${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
async function load(file, dependencies, globals = {}) {
  const exports = {};
  vm.runInNewContext(await source(file), {
    exports,
    require: (name) => {
      assert.ok(name in dependencies, name);
      return dependencies[name];
    },
    URL,
    Blob,
    File,
    performance,
    crypto,
    AbortController,
    Response,
    setTimeout,
    clearTimeout,
    ...globals,
  });
  return exports;
}
function storage() {
  const entries = new Map();
  return {
    entries,
    getItem: (key) => entries.get(key),
    setItem: (key, value) => entries.set(key, value),
  };
}
async function store(localStorage = storage(), cache = {}) {
  return load(
    "chat-wallpaper-state.ts",
    {
      react: { useEffect() {}, useSyncExternalStore() {} },
      "./wallpaper-media": cache,
      "./stickers/resolve-resource": { assertSafeRemoteUrl: (url) => new URL(url) },
    },
    { localStorage },
  );
}
test("10 characterIds survive reload/account changes; theme corruption, stale hydration and reset never overwrite wallpapers", async () => {
  const local = storage();
  const state = await store(local);
  const ids = Array.from({ length: 10 }, () => crypto.randomUUID());
  for (const [i, id] of ids.entries()) {
    const legacy = {
      chat_preferences: {
        wallpaperPath: `owner/chat-wallpapers/${id}/${i}.webp`,
        contextDepth: "invalid",
        appearance: { broken: true },
      },
    };
    const wallpaper = state.readCharacterWallpaper(legacy);
    assert.ok(wallpaper.wallpaperPath.endsWith(`${i}.webp`));
    state.syncCharacterWallpaper("owner", id, wallpaper);
    const op = state.beginCharacterWallpaper("owner", id, `blob:preview-${i}`);
    const next = {
      wallpaperPath: `owner/chat-wallpapers/${id}/new-${i}.webp`,
      wallpaperUrl: null,
      updatedAt: "2026-09-30T10:00:01Z",
    };
    state.commitCharacterWallpaper("owner", id, op.revision, next, `blob:compressed-${i}`);
    state.syncCharacterWallpaper("owner", id, wallpaper); // Delayed old role fetch.
    assert.equal(
      state.getCharacterWallpaperSnapshot("owner", id).wallpaperPath,
      next.wallpaperPath,
    );
  }
  const reloaded = await store(local);
  for (let round = 0; round < 20; round++)
    for (const [i, id] of ids.entries()) {
      assert.ok(
        reloaded.getCharacterWallpaperSnapshot("owner", id).wallpaperPath.endsWith(`new-${i}.webp`),
      );
      assert.equal(reloaded.getCharacterWallpaperSnapshot("other-owner", id).wallpaperPath, null);
    }
  assert.equal(local.entries.size, 10);
  assert.ok(![...local.entries.values()].some((entry) => /blob:|data:/.test(entry)));
  const id = ids[0];
  const op = reloaded.beginCharacterWallpaper("owner", id, "");
  reloaded.commitCharacterWallpaper(
    "owner",
    id,
    op.revision,
    { wallpaperPath: null, wallpaperUrl: null, updatedAt: "2026-09-30T10:00:02Z" },
    "",
  );
  assert.equal(
    reloaded.readCharacterWallpaper({
      chat_wallpaper: { wallpaperPath: null, wallpaperUrl: null },
      chat_preferences: { wallpaperPath: "old" },
    }).wallpaperPath,
    null,
  );
  assert.equal((await store(local)).getCharacterWallpaperSnapshot("owner", id).wallpaperPath, null);
});

test("concurrent uploads across 10 characters auto-save after editor close; duplicate selection uploads once; newest same-role selection wins", async () => {
  const state = await store();
  const records = new Map(),
    blobs = new Map(),
    requests = [],
    removed = [];
  const db = {
    rpc: async (_fn, { p_character_id: id, p_wallpaper: patch }) => {
      await delay(8);
      const row = records.get(id);
      row.chat_wallpaper = { ...patch, updatedAt: new Date().toISOString() };
      row.chat_preferences = { ...row.chat_preferences, ...patch };
      return { data: structuredClone(row), error: null };
    },
    storage: {
      from: () => ({
        upload: async (path, blob) => {
          requests.push(path);
          await delay(12);
          blobs.set(path, blob);
          return { error: null };
        },
        remove: async (paths) => removed.push(...paths),
      }),
    },
  };
  const api = await load("character-wallpaper.ts", {
    "@/integrations/supabase/client": { supabase: db },
    "./chat-media": {
      prepareChatImage: async (file, maxSide, maxBytes, options) => {
        assert.equal(maxSide, 1600);
        assert.equal(maxBytes, 900000);
        assert.equal(options.alwaysEncode, true);
        await delay(file.name.startsWith("slow") ? 70 : 5);
        return { blob: file, extension: "webp", previewUrl: URL.createObjectURL(file) };
      },
    },
    "./wallpaper-media": {
      rememberWallpaper: (path) => `blob:${path}`,
      cachedWallpaperUrl: async (path) => `blob:${path}`,
    },
    "./stickers/resolve-resource": { assertSafeRemoteUrl: (url) => new URL(url) },
    "./chat-wallpaper-state": state,
  });
  const ids = Array.from({ length: 10 }, () => crypto.randomUUID());
  const jobs = ids.map((id, i) => {
    records.set(id, {
      id,
      user_id: "owner",
      chat_preferences: {
        wallpaperPath: null,
        contextDepth: 20,
        appearance: { customCss: `${i}` },
      },
    });
    const file = new File([`${i}`], `${i}.png`, { type: "image/png" });
    const job = api.changeCharacterWallpaper("owner", id, file);
    assert.equal(api.changeCharacterWallpaper("owner", id, file), job);
    assert.ok(state.getCharacterWallpaperSnapshot("owner", id).displayUrl.startsWith("blob:"));
    return job;
  });
  await Promise.all(jobs);
  assert.equal(requests.length, 10);
  for (const [i, id] of ids.entries()) {
    const saved = records.get(id);
    saved.chat_preferences = { wallpaperPath: null, appearance: { selectedPresetId: "changed" } }; // Stale unrelated editor write.
    assert.ok(state.readCharacterWallpaper(saved).wallpaperPath.includes(id));
    assert.equal(await blobs.get(saved.chat_wallpaper.wallpaperPath).text(), `${i}`);
    assert.equal(state.getCharacterWallpaperSnapshot("owner", id).busy, false);
    const stages = api.characterWallpaperTimings("owner", id);
    assert.ok(
      stages.previewMs < 100 && stages.processingMs > 0 && stages.uploadMs > 0 && stages.saveMs > 0,
    );
  }
  const id = ids[0];
  const slow = api.changeCharacterWallpaper(
    "owner",
    id,
    new File(["old"], "slow.png", { type: "image/png" }),
  );
  const fast = api.changeCharacterWallpaper(
    "owner",
    id,
    new File(["new"], "fast.png", { type: "image/png" }),
  );
  const [obsolete, newest] = await Promise.all([slow, fast]);
  assert.equal(obsolete, null);
  assert.ok(newest);
  assert.equal(await blobs.get(records.get(id).chat_wallpaper.wallpaperPath).text(), "new");
  assert.ok(removed.length <= 1); // Obsolete work is skipped or its uncommitted file is removed.
  const reset = await api.changeCharacterWallpaperReference("owner", id, {
    wallpaperPath: null,
    wallpaperUrl: null,
  });
  assert.equal(reset.chat_wallpaper.wallpaperPath, null);
  console.log(
    "10-role pipeline timings (controlled upload/RPC latency):",
    JSON.stringify(ids.map((id) => api.characterWallpaperTimings("owner", id))),
  );
});

test("older failed operations cannot roll back a newer wallpaper", async () => {
  const state = await store();
  const old = state.beginCharacterWallpaper("u", "id", "blob:old");
  const next = state.beginCharacterWallpaper("u", "id", "blob:new");
  state.commitCharacterWallpaper(
    "u",
    "id",
    next.revision,
    { wallpaperPath: "new", wallpaperUrl: null },
    "blob:final",
  );
  state.failCharacterWallpaper("u", "id", old, "failure");
  assert.equal(state.getCharacterWallpaperSnapshot("u", "id").displayUrl, "blob:final");
  assert.equal(
    state.commitCharacterWallpaper(
      "u",
      "id",
      old.revision,
      { wallpaperPath: "old", wallpaperUrl: null },
      "blob:old",
    ),
    false,
  );
});
