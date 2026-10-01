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
async function store(
  localStorage = storage(),
  cache = {},
  react = { useEffect() {}, useSyncExternalStore() {} },
  globals = {},
) {
  return load(
    "chat-wallpaper-state.ts",
    {
      react,
      "./wallpaper-media": cache,
      "./stickers/resolve-resource": { assertSafeRemoteUrl: (url) => new URL(url) },
    },
    { localStorage, ...globals },
  );
}

test("diagnosis: a failed URL lookup must not erase a saved wallpaper display", async () => {
  const local = storage(),
    effects = [],
    trace = [];
  const id = crypto.randomUUID();
  let state;
  let lookups = 0;
  const react = {
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    useEffect: (effect) => effects.push(effect),
  };
  state = await store(
    local,
    {
      cachedWallpaperUrl: async (path) => {
        trace.push({ phase: "read-start", charId: id, path });
        // Controlled transport failure: the actual signer returns an empty string on failure.
        const url = ++lookups === 1 ? "" : "https://example.invalid/recovered.webp";
        trace.push({ phase: "read-complete", charId: id, url });
        return url;
      },
      retainWallpaperUrl: () => () => {},
    },
    react,
    {
      console: { debug: (phase, data) => trace.push({ phase, ...data }) },
    },
  );
  const operation = state.beginCharacterWallpaper("owner", id, "blob:preview");
  state.commitCharacterWallpaper(
    "owner",
    id,
    operation.revision,
    {
      wallpaperPath: `owner/chat-wallpapers/${id}/saved.webp`,
      wallpaperUrl: null,
      updatedAt: "2026-10-01T13:00:00Z",
    },
    "https://example.invalid/saved.webp",
  );
  const persisted = local.getItem(`kdeji-chat-wallpaper-v2:owner:${id}`);
  state.useCharacterWallpaper("owner", id);
  const cleanups = effects.map((effect) => effect());
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(
    local.getItem(`kdeji-chat-wallpaper-v2:owner:${id}`),
    persisted,
    "metadata was never deleted",
  );
  assert.ok(
    state.getCharacterWallpaperSnapshot("owner", id).displayUrl,
    "failed lookup must not overwrite valid display with empty URL",
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(lookups, 2, "one bounded retry restores the failed read");
  assert.equal(
    state.getCharacterWallpaperSnapshot("owner", id).displayUrl,
    "https://example.invalid/recovered.webp",
  );
  cleanups.forEach((cleanup) => cleanup?.());
});
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

test("five A/B update-switch cycles and ten actual module cold starts recover signed-URL failures without writes or role mixing", async () => {
  const local = storage(),
    records = new Map(),
    images = new Map();
  const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  let generation = 0,
    writes = 0,
    failPath = () => false;
  for (const id of ids) records.set(id, { id, user_id: "owner", chat_preferences: {} });
  const db = {
    rpc: async (_name, { p_character_id, p_wallpaper }) => {
      writes++;
      await Promise.resolve();
      const row = records.get(p_character_id);
      row.chat_wallpaper = {
        ...p_wallpaper,
        updatedAt: new Date(Date.UTC(2026, 9, 1) + ++generation).toISOString(),
      };
      return { data: structuredClone(row), error: null };
    },
    storage: {
      from: () => ({
        upload: async (path, blob) => {
          images.set(path, blob);
          return { error: null };
        },
        remove: async (paths) => {
          paths.forEach((path) => images.delete(path));
        },
        createSignedUrls: async (paths) => ({
          data: paths
            .filter((path) => !failPath(path))
            .map((path) => ({ path, signedUrl: `https://example.invalid/${path}` })),
        }),
      }),
    },
  };
  async function lifecycle() {
    const effects = [],
      cleanups = [];
    const observers = new Set();
    const window = new EventTarget(),
      document = new EventTarget();
    document.visibilityState = "visible";
    const signed = await load(
      "signed-media.ts",
      { "@/integrations/supabase/client": { supabase: db } },
      { queueMicrotask },
    );
    const media = await load(
      "wallpaper-media.ts",
      {
        "./signed-media": signed,
        // Exercise remote recovery when Safari's best-effort image cache is empty/evicted.
        "./media-cache": { readMediaBlob: async () => null, cacheMediaBlob: async () => {} },
      },
      {
        fetch: async (url) =>
          new Response(images.get(new URL(url).pathname.slice(1)), {
            headers: { "Content-Type": "image/png" },
          }),
      },
    );
    const state = await store(
      local,
      media,
      {
        useEffect: (effect) => effects.push(effect),
        useSyncExternalStore: (subscribe, snapshot) => {
          cleanups.push(subscribe(() => observers.forEach((notify) => notify())));
          return snapshot();
        },
      },
      { window, document },
    );
    const api = await load("character-wallpaper.ts", {
      "@/integrations/supabase/client": { supabase: db },
      "./chat-media": {
        prepareChatImage: async (file) => ({
          blob: file,
          extension: "png",
          previewUrl: URL.createObjectURL(file),
        }),
      },
      "./wallpaper-media": media,
      "./chat-wallpaper-state": state,
      "./stickers/resolve-resource": { assertSafeRemoteUrl: (url) => new URL(url) },
    });
    const unmount = () => {
      cleanups.splice(0).forEach((cleanup) => cleanup?.());
    };
    const mount = (id, character = records.get(id)) => {
      unmount();
      effects.length = 0;
      state.useCharacterWallpaper("owner", id, character);
      cleanups.push(...effects.map((effect) => effect()));
    };
    const waitForDisplay = (id) =>
      new Promise((resolve) => {
        const notify = () => {
          if (state.getCharacterWallpaperSnapshot("owner", id).displayUrl.startsWith("blob:")) {
            observers.delete(notify);
            resolve();
          }
        };
        observers.add(notify);
        notify();
      });
    return { state, api, mount, unmount, window, document, waitForDisplay };
  }
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const warm = await lifecycle();
  async function choose(id, content) {
    const file = new File([content], "wallpaper.png", { type: "image/png" });
    const stale = structuredClone(records.get(id));
    const request = warm.api.changeCharacterWallpaper("owner", id, file);
    assert.ok(warm.state.getCharacterWallpaperSnapshot("owner", id).busy);
    warm.state.syncCharacterWallpaper("owner", id, warm.state.readCharacterWallpaper(stale));
    await request;
    warm.state.syncCharacterWallpaper("owner", id, warm.state.readCharacterWallpaper(stale));
    assert.equal(
      warm.state.getCharacterWallpaperSnapshot("owner", id).wallpaperPath,
      records.get(id).chat_wallpaper.wallpaperPath,
    );
  }
  for (let round = 0; round < 5; round++) {
    await choose(ids[0], `A-${round}`);
    await choose(ids[1], `B-${round}`);
    for (const id of [ids[0], ids[1], ids[0], ids[1]]) {
      warm.mount(id);
      await settle();
      const snapshot = warm.state.getCharacterWallpaperSnapshot("owner", id);
      assert.ok(
        snapshot.displayUrl.startsWith("blob:"),
        `warm round ${round}: ${snapshot.displayUrl}`,
      );
      assert.equal(snapshot.wallpaperPath, records.get(id).chat_wallpaper.wallpaperPath);
      assert.equal(
        await (await fetch(snapshot.displayUrl)).text(),
        `${id === ids[0] ? "A" : "B"}-${round}`,
      );
    }
  }
  const bBefore = structuredClone(records.get(ids[1]));
  await choose(ids[0], "A-modified");
  assert.deepEqual(records.get(ids[1]), bBefore);
  await choose(ids[2], "C-new");
  warm.unmount();
  const durable = JSON.stringify([...local.entries]);
  const totalWrites = writes;
  for (let round = 0; round < 10; round++) {
    const failedOnce = new Set();
    failPath = (path) => {
      if (failedOnce.has(path)) return false;
      failedOnce.add(path);
      return true;
    };
    // A new instance of state/signing/cache modules, not repeated reads from one loaded map.
    const cold = await lifecycle();
    for (const [index, id] of ids.entries()) {
      cold.mount(id, null); // Metadata first, character DB hydration can arrive later.
      await settle();
      cold.mount(id);
      await settle();
      const snapshot = cold.state.getCharacterWallpaperSnapshot("owner", id);
      assert.ok(
        snapshot.displayUrl.startsWith("blob:"),
        `cold round ${round}, role ${index}: ${snapshot.displayUrl}`,
      );
      assert.equal(snapshot.wallpaperPath, records.get(id).chat_wallpaper.wallpaperPath);
      assert.equal(
        await (await fetch(snapshot.displayUrl)).text(),
        ["A-modified", "B-4", "C-new"][index],
      );
      assert.equal(
        JSON.stringify([...local.entries]),
        durable,
        "cold reads cannot persist defaults",
      );
      assert.equal(writes, totalWrites, "no mount/cleanup database writes");
    }
    // An old A URL completing after A is changed cannot overwrite the new revision.
    const current = cold.state.getCharacterWallpaperSnapshot("owner", ids[0]);
    cold.state.setCharacterWallpaperDisplay(
      "owner",
      ids[0],
      current.revision - 1,
      "https://example.invalid/stale.png",
    );
    assert.equal(
      cold.state.getCharacterWallpaperSnapshot("owner", ids[0]).displayUrl,
      current.displayUrl,
    );
    cold.unmount();
  }
  // Two failed attempts preserve the last valid display; online/page resume recovers without refresh.
  const recovery = await lifecycle();
  const a = ids[0],
    saved = recovery.state.readCharacterWallpaper(records.get(a));
  recovery.state.syncCharacterWallpaper("owner", a, saved);
  recovery.state.setCharacterWallpaperDisplay(
    "owner",
    a,
    recovery.state.getCharacterWallpaperSnapshot("owner", a).revision,
    "https://example.invalid/previous.png",
  );
  failPath = () => true;
  recovery.mount(a);
  await settle();
  assert.equal(
    recovery.state.getCharacterWallpaperSnapshot("owner", a).displayUrl,
    "https://example.invalid/previous.png",
  );
  failPath = () => false;
  recovery.window.dispatchEvent(new Event("online"));
  await recovery.waitForDisplay(a);
  assert.ok(
    recovery.state.getCharacterWallpaperSnapshot("owner", a).displayUrl.startsWith("blob:"),
    "online recovery did not finish",
  );
  assert.equal(
    await (await fetch(recovery.state.getCharacterWallpaperSnapshot("owner", a).displayUrl)).text(),
    "A-modified",
  );
  recovery.unmount();
  recovery.window.dispatchEvent(new Event("pageshow"));
  assert.equal(writes, totalWrites);
  assert.equal(JSON.stringify([...local.entries]), durable);
  console.log(
    "Wallpaper lifecycle: 5 A/B cycles + A-only edit + new C; 10 fresh cold starts; transient signer failures recovered; no hydration writes.",
  );
});
