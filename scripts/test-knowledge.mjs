import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import {
  newKnowledgeCard,
  cardFromDiary,
  resolveKnowledgeLinks,
  knowledgeRelations,
  knowledgeGraph,
  parseKnowledgeImport,
  searchKnowledge,
  unlinkKnowledgeCard,
  knowledgeDate,
  knowledgeCardSchema,
} from "../src/lib/knowledge.ts";
import { paginateDesktop } from "../src/lib/desktop-pages.ts";

test("knowledge links/backlinks are ID based, removable, bounded and tolerate deleted sources", () => {
  const a = newKnowledgeCard({ title: "阅读" });
  let b = newKnowledgeCard({ title: "笔记", content: "第一段\n[[阅读]]", links: [a.id, a.id] });
  b.links = resolveKnowledgeLinks(b, [a, b]);
  assert.deepEqual(b.links, [a.id]);
  const relations = knowledgeRelations([a, b]);
  assert.deepEqual(relations.incoming.get(a.id), [b.id]);
  assert.equal(relations.adjacent.get(a.id).size, 1);
  assert.deepEqual(resolveKnowledgeLinks(b, [{ ...a, title: "改名" }, b]), [a.id]);
  const unlinked = unlinkKnowledgeCard(b, a, a.id);
  assert.deepEqual(resolveKnowledgeLinks(unlinked, [a, unlinked]), []);
  assert.equal(unlinked.content, "第一段\n阅读");
  assert.equal(knowledgeRelations([b]).adjacent.get(b.id).size, 0);
  const c = newKnowledgeCard({ links: [b.id] });
  assert.equal(knowledgeGraph([a, b, c], a.id, 1).nodes.length, 2);
  assert.equal(knowledgeGraph([a, b, c], a.id, 2).nodes.length, 3);
  const large = [a, ...Array.from({ length: 2000 }, () => newKnowledgeCard({ links: [a.id] }))];
  const graph = knowledgeGraph(large, a.id, 3);
  assert.equal(graph.nodes.length, 40);
  assert.equal(graph.truncated, true);
  assert.equal(knowledgeGraph(large, a.id, 0).nodes.length, 40);
  assert.equal(knowledgeGraph(large, "missing", 3).nodes.length, 0);
});

test("diary conversion preserves source, original date and line breaks without changing diary", () => {
  const diary = Object.freeze({
    id: "diary-id",
    title: "随记",
    content: "中文\n\nEnglish ★",
    diary_date: "2026-10-04",
  });
  const card = cardFromDiary(diary);
  assert.equal(card.title, diary.title);
  assert.equal(card.content, diary.content);
  assert.equal(card.originalCreatedAt, diary.diary_date);
  assert.equal(card.sourceId, diary.id);
  assert.equal(card.sourceLabel, "此心一笺");
  assert.equal(card.sourceType, "diary");
  assert.equal(knowledgeDate(diary.diary_date), "2026/10/04");
});

test("imports create independent IDs, remap relationships, validate images/version and preserve metadata", () => {
  const a = newKnowledgeCard({ title: "A", tags: ["中文"], images: ["owner/messages/a.png"] });
  const b = newKnowledgeCard({
    title: "B",
    links: [a.id],
    sourceType: "chat",
    sourceId: "message",
    sourceContextId: "char",
  });
  const text = JSON.stringify({ schemaVersion: 1, cards: [a, b] });
  const one = parseKnowledgeImport(text, "export.json");
  const two = parseKnowledgeImport(text, "export.json");
  assert.notEqual(one[0].id, a.id);
  assert.notEqual(one[0].id, two[0].id);
  assert.deepEqual(one[1].links, [one[0].id]);
  assert.equal(one[1].sourceId, "message");
  assert.equal(one[1].sourceContextId, "char");
  assert.deepEqual(one[0].images, a.images);
  assert.throws(() => parseKnowledgeImport('{"schemaVersion":2,"cards":[]}', "bad.json"));
  assert.throws(() => parseKnowledgeImport(JSON.stringify([a, a]), "bad.json"));
  assert.throws(() => parseKnowledgeImport("not JSON", "bad.json"));
  assert.throws(() => parseKnowledgeImport("", "empty.txt"));
  assert.throws(() => parseKnowledgeImport("content", "unsupported.pdf"));
  assert.equal(parseKnowledgeImport("标题\n\n内容", "note.md")[0].content, "标题\n\n内容");
  assert.equal(parseKnowledgeImport("<p>text</p>", "clip.html", "text")[0].content, "text");
  for (const path of ["data:image/png;base64,abc", "blob:temporary", "javascript:alert(1)"])
    assert.equal(knowledgeCardSchema.safeParse({ ...a, images: [path] }).success, false);
});

test("knowledge search indexes titles, text, tags and source independently", () => {
  const cards = [
    newKnowledgeCard({
      title: "标题",
      content: "内容 English",
      tags: ["标签"],
      sourceLabel: "此心一笺",
      sourceUrl: "https://example.invalid/article",
    }),
  ];
  for (const term of ["标题", "内容", "english", "标签", "此心一笺", "article"])
    assert.equal(searchKnowledge(cards, term).length, 1);
  assert.equal(searchKnowledge(cards, "标签", "内容").length, 0);
  assert.equal(searchKnowledge(cards, "标签", "标签").length, 1);
  assert.equal(searchKnowledge(cards, "English", "卡片").length, 1);
});

test("actual export handler creates a complete JSON backup and releases its download URL", async () => {
  const source = await readFile(
    new URL("../src/components/knowledge/KnowledgeApp.tsx", import.meta.url),
    "utf8",
  );
  const ast = ts.createSourceFile(
    "KnowledgeApp.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declaration = ast.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === "exportKnowledge",
  );
  const code = ts.transpileModule(declaration.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const cards = [
    newKnowledgeCard({
      title: "备份",
      content: "正文\n第二行",
      sourceType: "diary",
      sourceId: "source",
      sourceLabel: "此心一笺",
      images: ["owner/messages/photo.png"],
    }),
  ];
  let blob,
    clicked = false,
    cleanup,
    revoked;
  const anchor = {
    click: () => {
      clicked = true;
    },
  };
  vm.runInNewContext(`${code}\nexportKnowledge(cards);`, {
    Blob,
    cards,
    URL: {
      createObjectURL: (value) => {
        blob = value;
        return "blob:backup";
      },
      revokeObjectURL: (value) => {
        revoked = value;
      },
    },
    document: { createElement: () => anchor },
    window: {
      setTimeout: (fn) => {
        cleanup = fn;
      },
    },
  });
  assert.equal(clicked, true);
  assert.equal(anchor.download, "知识库.json");
  assert.deepEqual(JSON.parse(await blob.text()), { schemaVersion: 1, cards });
  cleanup();
  assert.equal(revoked, "blob:backup");
});

test("desktop pagination supports 3/4/5 columns, widget occupancy, unlimited pages and stable order", () => {
  const apps = Array.from({ length: 117 }, (_, index) => `app-${index}`);
  for (const columns of [3, 4, 5]) {
    const normal = paginateDesktop(apps, columns, 420, 90, 18);
    const widget = paginateDesktop(apps, columns, 420, 90, 18, 170);
    assert.ok(normal.length > 4);
    assert.equal(normal[0].length, columns * 4);
    assert.equal(widget[0].length, columns * 2);
    assert.deepEqual(normal.flat(), apps);
    assert.deepEqual(widget.flat(), apps);
    assert.deepEqual(paginateDesktop(apps, columns, 420, 90, 18), normal);
    assert.equal(paginateDesktop(apps, columns, 120, 90, 18, 170)[0].length, 0);
    assert.deepEqual(paginateDesktop(apps, columns, 40, 90, 18).flat(), apps);
  }
  assert.deepEqual(paginateDesktop([], 4, 420, 90, 18), [[]]);
});
