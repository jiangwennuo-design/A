// Real browser codecs/IndexedDB; controlled HTTP upload/RPC latency, no production data.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import ts from "typescript";
import vm from "node:vm";

const runtime = process.env.KDEJI_QA_MODULES;
if (!runtime) throw new Error("Set KDEJI_QA_MODULES to the existing Playwright package directory.");
const { chromium } = createRequire(`${runtime}/package.json`)("playwright");
const files = [
  "chat-media",
  "media-cache",
  "wallpaper-media",
  "chat-wallpaper-state",
  "character-wallpaper",
];
const code = Object.fromEntries(
  await Promise.all(
    files.map(async (name) => [
      name,
      ts.transpileModule(
        await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"),
        { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
      ).outputText,
    ]),
  ),
);
for (const [name, moduleCode] of Object.entries(code))
  new vm.Script(moduleCode, { filename: name });
const images = new Map(),
  records = new Map();
let downloads = 0,
  uploads = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const parts = [];
  for await (const chunk of req) parts.push(chunk);
  const body = Buffer.concat(parts);
  res.setHeader("content-type", "application/json");
  if (url.pathname === "/upload") {
    uploads++;
    images.set(url.searchParams.get("path"), { body, type: req.headers["content-type"] });
    await sleep(80 + body.length / 400); // 400 KB/s, 80 ms latency.
    res.end(JSON.stringify({ error: null }));
  } else if (url.pathname === "/rpc") {
    await sleep(80);
    const { p_character_id: id, p_wallpaper: wallpaper } = JSON.parse(body);
    const saved = {
      id,
      user_id: "owner",
      chat_wallpaper: { ...wallpaper, updatedAt: new Date().toISOString() },
    };
    records.set(id, saved);
    res.end(JSON.stringify({ data: saved, error: null }));
  } else if (url.pathname === "/old-read" || url.pathname === "/old-save") {
    await sleep(80);
    res.end("{}");
  } else if (url.pathname === "/image") {
    downloads++;
    const image = images.get(url.searchParams.get("path"));
    res.setHeader("content-type", image.type);
    res.end(image.body);
  } else {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<html><body><img id="preview" style="max-width:100%;height:300px;object-fit:cover"><script>
      const sources = ${JSON.stringify(code)}, modules = {};
      const supabase = {
        rpc: async (name,args) => (await fetch('/rpc',{method:'POST',body:JSON.stringify(args)})).json(),
        storage: { from: () => ({ upload: async (path,blob) => (await fetch('/upload?path='+encodeURIComponent(path),{method:'POST',headers:{'content-type':blob.type},body:blob})).json(), remove: async () => ({error:null}) }) }
      };
      function require(name) {
        if(name==='@/integrations/supabase/client') return {supabase};
        if(name==='react') return {useEffect(){},useSyncExternalStore(){}};
        if(name==='./stickers/resolve-resource') return {assertSafeRemoteUrl: (value) => new URL(value)};
        if(name==='./signed-media') return {resolveSignedMediaUrl: async (bucket,path) => location.origin+'/image?path='+encodeURIComponent(path)};
        const id = name.replace('./',''); if(modules[id]) return modules[id];
        const exports = {}; modules[id] = exports; try { new Function('exports','require',sources[id])(exports,require); } catch(error) { throw new Error(id+': '+error.message); } return exports;
      }
      window.qa = { media:require('./chat-media'), api:require('./character-wallpaper'), state:require('./chat-wallpaper-state'), cache:require('./wallpaper-media') };
    </script></body></html>`);
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
  executablePath: process.env.KDEJI_QA_BROWSER,
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message + "\n" + error.stack));
  const url = `http://127.0.0.1:${server.address().port}`;
  const response = await page.goto(url);
  new vm.Script((await response.text()).split("<script>")[1].split("</script>")[0]);
  new vm.Script(await page.locator("script").textContent());
  assert.equal(errors.length, 0, errors.join("\n"));
  const result = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1500;
    canvas.height = 1000;
    const context = canvas.getContext("2d");
    let seed = 31;
    for (let y = 0; y < 1000; y += 8)
      for (let x = 0; x < 1500; x += 8) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        context.fillStyle =
          "rgb(" + [seed & 255, (seed >>> 8) & 255, (seed >>> 16) & 255].join(",") + ")";
        context.fillRect(x, y, 8, 8);
      }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const file = new File([blob], "synthetic.png", { type: "image/png" });
    const beforeStart = performance.now();
    const prepared = await qa.media.prepareChatImage(file, 1920, 5 * 1024 * 1024);
    const beforeProcess = performance.now() - beforeStart;
    const uploadStart = performance.now();
    await fetch("/upload?path=baseline", {
      method: "POST",
      headers: { "content-type": prepared.blob.type },
      body: prepared.blob,
    });
    const beforeUpload = performance.now() - uploadStart;
    const saveStart = performance.now();
    await fetch("/old-read");
    await fetch("/old-save");
    const beforeSave = performance.now() - saveStart;
    const preview = document.getElementById("preview");
    preview.src = prepared.previewUrl;
    await preview.decode();
    const beforeDisplay = performance.now() - beforeStart;
    URL.revokeObjectURL(prepared.previewUrl);
    const ids = Array.from({ length: 10 }, () => crypto.randomUUID());
    const start = performance.now();
    const job = qa.api.changeCharacterWallpaper("owner", ids[0], file);
    preview.src = qa.state.getCharacterWallpaperSnapshot("owner", ids[0]).displayUrl;
    await preview.decode();
    await new Promise(requestAnimationFrame);
    const afterDisplay = performance.now() - start;
    await job;
    const after = qa.api.characterWallpaperTimings("owner", ids[0]);
    await Promise.all(ids.slice(1).map((id) => qa.api.changeCharacterWallpaper("owner", id, file)));
    const saved = ids.map((id) => ({ id, ...qa.state.getCharacterWallpaperSnapshot("owner", id) }));
    for (let pass = 0; pass < 3; pass++)
      for (const entry of saved) {
        const resource = await qa.cache.cachedWallpaperUrl(entry.wallpaperPath, true);
        const image = new Image();
        image.src = resource;
        await image.decode();
      }
    // Wait for the existing best-effort IndexedDB queue, then reload the module/page.
    await new Promise((resolve) => setTimeout(resolve, 250));
    return {
      ids,
      saved,
      before: {
        inputBytes: file.size,
        uploadBytes: prepared.blob.size,
        processingMs: beforeProcess,
        uploadMs: beforeUpload,
        saveMs: beforeSave,
        displayMs: beforeDisplay,
      },
      after: { ...after, displayMs: afterDisplay },
    };
  });
  await page.reload();
  const restored = await page.evaluate(async (entries) => {
    return Promise.all(
      entries.map(async (entry) => {
        const state = qa.state.getCharacterWallpaperSnapshot("owner", entry.id);
        const cached = await qa.cache.cachedWallpaperUrl(state.wallpaperPath, true);
        const image = new Image();
        image.src = cached;
        await image.decode();
        return { id: entry.id, path: state.wallpaperPath, blob: cached.startsWith("blob:") };
      }),
    );
  }, result.saved);
  assert.equal(records.size, 10);
  assert.equal(uploads, 11); // One baseline plus ten new uploads.
  assert.equal(downloads, 0); // Uploaded bytes/IndexedDB eliminate remote downloads after reload.
  assert.equal(new Set(restored.map((r) => r.path)).size, 10);
  restored.forEach((entry, i) => {
    assert.equal(entry.path, result.saved[i].wallpaperPath);
    assert.equal(entry.blob, true);
  });
  assert.equal(errors.length, 0);
  console.log(
    JSON.stringify(
      {
        browser: "Chromium, 390x844; controlled HTTP latency",
        ...result,
        restored,
        uploads,
        downloads,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
