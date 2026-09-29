import assert from "node:assert/strict";
import { test } from "node:test";
import { quoteMessage, readQuotedMessage, quotedContextForAi } from "../src/lib/chat-quote.ts";

test("quote snapshots preserve both senders, newlines and text independently of originals", () => {
  for (const role of ["user", "assistant"]) {
    const original = {
      id: crypto.randomUUID(),
      role,
      content: "第一句\n第二句",
      message_type: "text",
    };
    const payload = quoteMessage(original, role === "user" ? "我的昵称" : "角色备注");
    const persisted = JSON.parse(JSON.stringify(payload));
    original.content = "已编辑";
    assert.equal(readQuotedMessage(persisted).content, "第一句\n第二句");
    assert.equal(readQuotedMessage(persisted).role, role);
    assert.match(quotedContextForAi(persisted), /第一句\\n第二句/);
    assert.match(quotedContextForAi(persisted), /当前消息针对消息/);
  }
});

test("quotes safely describe media without replacing their original payload", () => {
  for (const [type, details, pattern] of [
    ["image", { image_path: "owner/messages/photo.webp", caption: "风景" }, /图片.*风景/],
    ["sticker", { sticker_name: "开心" }, /表情.*开心/],
    ["transfer", { amount: 20, remark: "奶茶" }, /20\.00.*奶茶/],
    ["call", { duration: 10 }, /语音通话/],
  ]) {
    const metadata = quoteMessage(
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        message_type: type,
        payload: details,
      },
      "甲",
    );
    assert.match(readQuotedMessage(metadata).content, pattern);
    assert.deepEqual({ ...details, ...metadata }["image_path"], details["image_path"]);
  }
});

test("legacy and malformed payloads never produce a quote or change model context", () => {
  for (const payload of [
    null,
    {},
    [],
    { quotedMessage: "bad" },
    { replyToMessageId: "a", quotedMessage: { messageId: "b" } },
  ]) {
    assert.equal(readQuotedMessage(payload), null);
    assert.equal(quotedContextForAi(payload), "");
  }
});
