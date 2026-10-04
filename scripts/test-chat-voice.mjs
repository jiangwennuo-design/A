import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import * as messageHelpers from "../src/lib/chat-message.ts";
import * as quotes from "../src/lib/chat-quote.ts";

function hooks() {
  const values = [],
    effects = [];
  let cursor = 0;
  return {
    react: {
      memo: (component) => component,
      useState(initial) {
        const index = cursor++;
        if (!(index in values)) values[index] = initial;
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
    },
    render(component) {
      cursor = 0;
      effects.length = 0;
      return component();
    },
    effects,
  };
}
const icon = () => null;
function nodes(node) {
  if (!node || typeof node !== "object") return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}
async function load(file, deps, globals = {}) {
  const code = ts.transpileModule(await readFile(`src/components/chat/${file}.tsx`, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      assert.ok(name in deps, name);
      return deps[name];
    },
    ...globals,
  });
  return exports;
}

test("voice bars toggle both roles, preserve text on reload and never use a text bubble", async () => {
  for (const role of ["user", "assistant"]) {
    const hook = hooks();
    const { MessageContent } = await load("MessageContent", {
      react: hook.react,
      "react/jsx-runtime": jsx,
      "lucide-react": { ArrowDownLeft: icon, AudioLines: icon, ImageOff: icon, Phone: icon },
      "@/lib/signed-media": {},
      "@/lib/chat-message": messageHelpers,
      "@/lib/chat-transfer": {},
      "@/lib/chat-quote": quotes,
      "./MessageQuote": {},
    });
    const message = {
      id: "voice-one",
      message_type: "text",
      role,
      content: "一句语音\n下一句 😊",
      payload: { display_type: "voice", duration: 5 },
    };
    const render = () => hook.render(() => MessageContent({ message, onOpenImage() {} }));
    let tree = nodes(render());
    assert.ok(!tree.some((node) => node.props.className === "message-bubble"));
    assert.ok(tree.some((node) => node.props["data-ui"] === "voice-icon"));
    assert.ok(tree.some((node) => node.props["data-ui"] === "voice-duration"));
    assert.ok(!tree.some((node) => node.props["data-ui"] === "voice-transcript"));
    tree.find((node) => node.props["data-ui"] === "voice-toggle").props.onClick();
    tree = nodes(render());
    assert.equal(
      tree.find((node) => node.props["data-ui"] === "voice-transcript").props.children,
      message.content,
    );
    assert.equal(
      tree.find((node) => node.props["data-ui"] === "voice-toggle").props["aria-expanded"],
      true,
    );
    tree.find((node) => node.props["data-ui"] === "voice-toggle").props.onClick();
    assert.ok(!nodes(render()).some((node) => node.props["data-ui"] === "voice-transcript"));
    const restored = messageHelpers.normalizeChatMessage(
      JSON.parse(
        JSON.stringify({
          ...message,
          user_id: "u",
          session_id: "s",
          created_at: "2026-10-04T00:00:00Z",
        }),
      ),
    );
    assert.equal(restored.message_type, "voice");
    assert.equal(restored.content, message.content);
    assert.equal(restored.payload.duration, 5);
    assert.equal(
      quotes.readQuotedMessage(quotes.quoteMessage(restored, role)).content,
      message.content,
    );
    assert.equal(messageHelpers.messagePreview(restored), "[语音]");
  }
  assert.equal(messageHelpers.voiceDuration(""), 1);
  assert.equal(messageHelpers.voiceDuration("😊😊😊😊"), 1);
  assert.equal(messageHelpers.voiceDuration("长".repeat(8000)), 600);
});

test("vertical attachment menu keeps all old actions, closes on selection/Escape and preserves image chooser", async () => {
  const hook = hooks(),
    actions = [];
  let keydown,
    removed = false;
  const { AttachmentSheet } = await load(
    "AttachmentSheet",
    {
      react: hook.react,
      "react/jsx-runtime": jsx,
      "lucide-react": {
        AudioLines: icon,
        ImagePlus: icon,
        RotateCcw: icon,
        Smile: icon,
        WalletCards: icon,
      },
    },
    {
      window: {
        addEventListener: (_, fn) => {
          keydown = fn;
        },
        removeEventListener: () => {
          removed = true;
        },
      },
    },
  );
  const props = {
    open: true,
    canReroll: true,
    onClose: () => actions.push("close"),
    onImage: (file) => actions.push(file),
    onStickers: () => actions.push("sticker"),
    onTransfer: () => actions.push("transfer"),
    onReroll: () => actions.push("reroll"),
    onVoice: () => actions.push("voice"),
  };
  let tree = nodes(hook.render(() => AttachmentSheet(props)));
  const buttons = tree.filter((node) => node.type === "button");
  assert.deepEqual(
    buttons.map((node) => node.props["data-ui"]),
    [
      "attachment-image",
      "attachment-sticker",
      "attachment-transfer",
      "attachment-voice",
      "attachment-reroll",
    ],
  );
  tree.find((node) => node.type === "input").props.ref.current = {
    click: () => actions.push("image-chooser"),
  };
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(actions, [
    "close",
    "image-chooser",
    "close",
    "sticker",
    "close",
    "transfer",
    "close",
    "voice",
    "close",
    "reroll",
  ]);
  const cleanup = hook.effects[0]();
  keydown({ key: "Escape" });
  assert.equal(actions.at(-1), "close");
  cleanup();
  assert.equal(removed, true);
  tree = nodes(hook.render(() => AttachmentSheet({ ...props, open: false })));
  assert.ok(!tree.some((node) => node.props["data-ui"] === "attachment-menu"));
  const file = { name: "test.png" },
    event = { target: { files: [file] }, currentTarget: { value: "test" } };
  tree.find((node) => node.type === "input").props.onChange(event);
  assert.equal(actions.at(-1), file);
  assert.equal(event.currentTarget.value, "");
  const css = await readFile("src/styles/chat-voice.css", "utf8");
  assert.match(css, /max-height: 45dvh/);
  assert.match(css, /overflow-y: auto/);
});

test("voice composer waits for durable save; failed sends retain the full draft", async () => {
  for (const success of [false, true]) {
    const hook = hooks(),
      sent = [];
    let closed = false;
    const { VoiceMessageSheet } = await load("VoiceMessageSheet", {
      react: hook.react,
      "react/jsx-runtime": jsx,
      "lucide-react": { AudioLines: icon },
      "@/lib/chat-message": messageHelpers,
      "@/components/system-ui": { SystemSheet: icon },
    });
    const props = {
      open: true,
      disabled: false,
      onClose: () => {
        closed = true;
      },
      onSend: async (text) => {
        sent.push(text);
        return success;
      },
    };
    const render = () => nodes(hook.render(() => VoiceMessageSheet(props)));
    render()
      .find((node) => node.type === "textarea")
      .props.onChange({ target: { value: "语音正文\n第二行" } });
    await render()
      .find((node) => node.type === "form")
      .props.onSubmit({ preventDefault() {} });
    assert.deepEqual(sent, ["语音正文\n第二行"]);
    assert.equal(closed, success);
    assert.equal(
      render().find((node) => node.type === "textarea").props.value,
      success ? "" : sent[0],
    );
  }
});
