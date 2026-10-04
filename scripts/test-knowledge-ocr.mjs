// Exercise the actual OCR handler; mock only authenticated Storage and the existing AI service.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as zod from "zod";

test("knowledge OCR reuses multimodal generate, enforces ownership/size, and propagates failures", async () => {
  const calls = [];
  const downloads = [];
  let output = "第一行\n第二行",
    failure = false;
  let blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
  const context = vm.createContext({ Uint8Array, btoa, Error });
  const synthetic = (exports) =>
    new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      },
      { context },
    );
  const model = synthetic({
    generate: async (request) => {
      calls.push(request);
      if (failure) throw new Error("HTTP 413");
      return { text: output };
    },
  });
  await model.link(() => {});
  await model.evaluate();
  const source = ts.transpileModule(
    await readFile(new URL("../src/lib/knowledge.functions.ts", import.meta.url), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  const handler = new vm.SourceTextModule(source, {
    context,
    importModuleDynamically: async () => model,
  });
  await handler.link(async (specifier) => {
    if (specifier === "zod") return synthetic(zod);
    if (specifier.includes("auth-middleware")) return synthetic({ requireSupabaseAuth: {} });
    if (specifier === "@tanstack/react-start")
      return synthetic({
        createServerFn: () => {
          let validate = (value) => value;
          const chain = {
            middleware: () => chain,
            validator: (fn) => {
              validate = fn;
              return chain;
            },
            handler: (fn) => (args) => fn({ ...args, data: validate(args.data) }),
          };
          return chain;
        },
      });
    throw new Error(`Unexpected dependency ${specifier}`);
  });
  await handler.evaluate();
  const invoke = (imagePath) =>
    handler.namespace.recognizeKnowledgeImage({
      data: { imagePath },
      context: {
        userId: "owner",
        supabase: {
          storage: {
            from: (bucket) => {
              assert.equal(bucket, "chat-media");
              return {
                download: async (path) => {
                  downloads.push(path);
                  return { data: blob, error: null };
                },
              };
            },
          },
        },
      },
    });
  assert.equal((await invoke("owner/messages/card.png")).text, output);
  assert.equal(calls[0].scene, "knowledge_ocr");
  assert.equal(calls[0].messages.length, 1);
  assert.equal(calls[0].messages[0].content[1].type, "image");
  assert.equal(calls[0].messages[0].content[1].url, "data:image/png;base64,AQID");
  await assert.rejects(() => invoke("other/messages/card.png"), /当前账号/);
  await assert.rejects(() => invoke("owner/messages/../card.png"), /当前账号/);
  assert.equal(downloads.length, 1);
  blob = new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: "image/png" });
  await assert.rejects(() => invoke("owner/messages/large.png"), /2 MB/);
  blob = new Blob(["x"], { type: "text/html" });
  await assert.rejects(() => invoke("owner/messages/invalid.html"), /PNG/);
  blob = new Blob(["x"], { type: "image/jpeg" });
  output = "[IMAGE_UNAVAILABLE]";
  await assert.rejects(() => invoke("owner/messages/photo.jpg"), /无法识别/);
  failure = true;
  await assert.rejects(() => invoke("owner/messages/photo.jpg"), /HTTP 413/);
});
