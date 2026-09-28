import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(file, dependencies = {}, globals = {}) {
  const source = await readFile(new URL(`../src/${file}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(
    code,
    {
      exports,
      require: (name) => {
        if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
        return dependencies[name];
      },
      setTimeout,
      clearTimeout,
      queueMicrotask,
      Blob,
      File,
      URL,
      AbortController,
      Response,
      crypto,
      ...globals,
    },
    { filename: file },
  );
  return exports;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("sticker upload primes its ready preview without another compression or remote download", async () => {
  const cached = [];
  const media = await load("lib/chat-media.ts", {
    "@/integrations/supabase/client": {
      supabase: { storage: { from: () => ({ upload: async () => ({ error: null }) }) } },
    },
    "./media-cache": { cacheMediaBlob: (...args) => cached.push(args) },
  });
  const blob = new Blob(["ready"], { type: "image/webp" });
  const path = await media.uploadChatMedia("owner", { blob, extension: "webp" }, "stickers");
  assert.equal(cached[0][1], `preview/${path}`);
  assert.equal(cached[0][2], blob);
});

test("wallpaper cache keeps visible object URLs alive and releases idle previews", async () => {
  const tasks = [],
    revoked = [];
  let serial = 0;
  const media = await load(
    "lib/wallpaper-media.ts",
    {
      "./media-cache": { cacheMediaBlob() {}, readMediaBlob: async () => null },
      "./signed-media": {
        resolveSignedMediaUrl: async (_, path) => `https://example.invalid/${path}`,
      },
    },
    {
      URL: {
        createObjectURL: () => `blob:${++serial}`,
        revokeObjectURL: (url) => revoked.push(url),
      },
      setTimeout: (callback) => tasks.push(callback),
    },
  );
  const blob = new Blob(["preview"], { type: "image/png" });
  const first = media.rememberWallpaper("owner/first", blob);
  const release = media.retainWallpaperUrl(first);
  for (let i = 0; i < 10; i++) media.rememberWallpaper(`owner/${i}`, blob);
  tasks.splice(0).forEach((task) => task());
  assert.ok(!revoked.includes(first));
  assert.equal(await media.cachedWallpaperUrl("owner/first"), first);
  release();
  media.rememberWallpaper("owner/next", blob);
  tasks.splice(0).forEach((task) => task());
  assert.ok(revoked.includes(first));
  assert.equal(
    await media.cachedWallpaperUrl("https://example.invalid/old.jpg"),
    "https://example.invalid/old.jpg",
  );
});

test("private signing batches 250 paths, reuses cached URLs, isolates bucket/owner, retries failed lookups", async () => {
  const calls = [];
  let fail = false;
  const media = await load("lib/signed-media.ts", {
    "@/integrations/supabase/client": {
      supabase: {
        storage: {
          from: (bucket) => ({
            createSignedUrls: async (paths) => {
              calls.push({ bucket, paths });
              return {
                data: fail
                  ? null
                  : paths.map((path) => ({
                      path,
                      signedUrl: `https://example.invalid/${bucket}/${path}`,
                    })),
              };
            },
          }),
        },
      },
    },
  });
  const paths = Array.from({ length: 250 }, (_, i) => `owner-a/${i}.png`);
  const urls = await Promise.all(
    paths.map((path) => media.resolveSignedMediaUrl("chat-media", path)),
  );
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => call.paths.length <= 100));
  assert.ok(urls.every(Boolean));
  await Promise.all(paths.map((path) => media.resolveSignedMediaUrl("chat-media", path)));
  assert.equal(calls.length, 3);
  await media.resolveSignedMediaUrl("wallpapers", paths[0]);
  await media.resolveSignedMediaUrl("chat-media", "owner-b/0.png");
  assert.equal(calls.length, 5);
  fail = true;
  assert.equal(await media.resolveSignedMediaUrl("chat-media", "owner-a/bad.png"), "");
  fail = false;
  assert.ok(await media.resolveSignedMediaUrl("chat-media", "owner-a/bad.png"));
  assert.equal(calls.length, 7);
});

test("image processing downsizes avatars, preserves GIF bytes/dimensions, enforces bucket limits and closes decoders", async () => {
  let closes = 0;
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage() {} }),
    toBlob: (done, type) => done(new Blob(["compressed"], { type })),
  };
  const revoked = [];
  const media = await load(
    "lib/chat-media.ts",
    {
      "@/integrations/supabase/client": { supabase: {} },
      "./media-cache": { cacheMediaBlob() {} },
    },
    {
      createImageBitmap: async () => ({ width: 4000, height: 3000, close: () => closes++ }),
      document: { createElement: () => canvas },
      URL: { createObjectURL: () => "blob:test", revokeObjectURL: (url) => revoked.push(url) },
    },
  );
  const avatar = await media.prepareChatImage(
    new File(["png"], "avatar.png", { type: "image/png" }),
    384,
    5 * 1024 * 1024,
  );
  assert.equal(avatar.width, 384);
  assert.equal(avatar.height, 288);
  assert.equal(avatar.blob.type, "image/webp");
  assert.equal(canvas.width, 0);
  const gif = new File(["animated"], "animation.gif", { type: "image/gif" });
  const preparedGif = await media.prepareChatImage(gif, 640);
  assert.equal(preparedGif.blob, gif);
  assert.equal(preparedGif.width, 4000);
  await assert.rejects(
    media.prepareChatImage(
      new File([new Uint8Array(9 * 1024 * 1024)], "big.gif", { type: "image/gif" }),
    ),
    /GIF/,
  );
  assert.equal(closes, 2);
});

test("Safari decoder fallback works when createImageBitmap rejects and releases object URLs", async () => {
  const revoked = [];
  class ImageMock {
    naturalWidth = 32;
    naturalHeight = 24;
    set src(value) {
      if (value) queueMicrotask(() => this.onload?.());
    }
  }
  const media = await load(
    "lib/chat-media.ts",
    {
      "@/integrations/supabase/client": { supabase: {} },
      "./media-cache": { cacheMediaBlob() {} },
    },
    {
      createImageBitmap: async () => {
        throw new Error("decoder unavailable");
      },
      Image: ImageMock,
      URL: { createObjectURL: () => "blob:test", revokeObjectURL: (url) => revoked.push(url) },
    },
  );
  const image = await media.prepareChatImage(new File(["photo"], "a.jpg", { type: "image/jpeg" }));
  assert.equal(image.width, 32);
  assert.equal(image.height, 24);
  assert.equal(revoked.length, 1);
});

test("sticker previews limit downloads to four, deduplicate, preserve GIF, and use cached previews on reopen", async () => {
  let active = 0,
    peak = 0,
    fetches = 0,
    processed = 0;
  const blobs = new Map();
  const importer = await load(
    "lib/stickers/image-cache.ts",
    {
      "../media-cache": {
        readMediaBlob: async (bucket, path) => blobs.get(`${bucket}:${path}`) || null,
        cacheMediaBlob: async (bucket, path, blob) => {
          blobs.set(`${bucket}:${path}`, blob);
        },
      },
      "../signed-media": {
        resolveSignedMediaUrl: async (_, path) => `https://example.invalid/${path}`,
      },
      "../chat-media": {
        prepareChatImage: async (file) => {
          processed++;
          return { blob: file, previewUrl: "blob:test" };
        },
      },
    },
    {
      fetch: async (url) => {
        fetches++;
        active++;
        peak = Math.max(peak, active);
        await sleep(5);
        active--;
        if (url.includes("bad")) return new Response("not found", { status: 404 });
        return new Response("image", {
          headers: { "content-type": url.endsWith("gif") ? "image/gif" : "image/png" },
        });
      },
      URL: { revokeObjectURL() {} },
    },
  );
  const names = Array.from({ length: 10 }, (_, i) => `owner/${i}.png`);
  await Promise.all([...names, names[0]].map(importer.loadStickerPreview));
  assert.equal(fetches, 10);
  assert.equal(peak, 4);
  await Promise.all(names.map(importer.loadStickerPreview));
  assert.equal(fetches, 10);
  const gif = await importer.loadStickerPreview("owner/a.gif");
  assert.equal(gif.type, "image/gif");
  assert.equal(processed, 10);
  await assert.rejects(importer.loadStickerPreview("owner/bad.png"));
  await assert.rejects(importer.loadStickerPreview("owner/bad.png"));
  assert.equal(fetches, 13);
});

test("IndexedDB cache persists per-owner/per-bucket, caps bytes, and gracefully falls back without browser storage", async () => {
  const stores = new Map();
  const db = {
    createObjectStore: (name) => stores.set(name, new Map()),
    transaction(names) {
      const transaction = {
        objectStore: (name) => {
          const store = stores.get(name);
          const request = (value) => {
            const result = { result: value };
            queueMicrotask(() => result.onsuccess?.());
            return result;
          };
          return {
            get: (key) => request(store.get(key)),
            getAll: () => request([...store.values()]),
            put: (row) => store.set(row.key, row),
            delete: (key) => store.delete(key),
          };
        },
      };
      if (Array.isArray(names)) setTimeout(() => transaction.oncomplete?.(), 1);
      return transaction;
    },
  };
  const indexedDB = {
    open: () => {
      const request = { result: db };
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
  const cache = await load("lib/media-cache.ts", {}, { indexedDB });
  const blob = new Blob(["bytes"], { type: "image/png" });
  await cache.cacheMediaBlob("chat-media", "owner-a/test", blob);
  assert.equal(await cache.readMediaBlob("chat-media", "owner-a/test"), blob);
  assert.equal(await cache.readMediaBlob("chat-media", "owner-b/test"), null);
  assert.equal(await cache.readMediaBlob("wallpapers", "owner-a/test"), null);
  for (let i = 0; i < 12; i++)
    await cache.cacheMediaBlob("chat-media", `owner/${i}`, {
      type: "image/png",
      size: 8 * 1024 * 1024,
    });
  assert.ok(
    [...stores.get("metadata").values()].reduce((sum, row) => sum + row.size, 0) <=
      64 * 1024 * 1024,
  );
  const unavailable = await load("lib/media-cache.ts");
  await unavailable.cacheMediaBlob("chat-media", "owner/test", blob);
  assert.equal(await unavailable.readMediaBlob("chat-media", "owner/test"), null);
});
