import assert from "node:assert/strict";
import { createRequire } from "node:module";
const runtime = process.env.KDEJI_QA_MODULES;
if (!runtime) throw new Error("Set KDEJI_QA_MODULES to the existing Playwright runtime.");
const { chromium } = createRequire(`${runtime}/package.json`)("playwright");
const origin = process.env.KDEJI_QA_ORIGIN || "http://127.0.0.1:3198";
const css = `
@font-face { font-family: QAFont; src: local("Arial"); font-weight: 400; }
:root { --bubble-ink: rgb(31, 52, 73); }
[data-role="user"] [data-ui="message-bubble"] {
  color: var(--bubble-ink); border: 3px solid rgb(50, 100, 150);
  background: linear-gradient(45deg, rgb(230, 240, 250), rgb(200, 220, 240));
  border-radius: 25px; box-shadow: 1px 2px 3px rgb(10, 20, 30);
  padding: 11px; margin: 2px; transform: translateX(2px);
  font-family: qafont, monospace;
}
[data-role="char"] [data-ui="message-bubble"] { border: 2px dashed rgb(160, 170, 180); background: rgb(245, 246, 247); }
[data-ui="message-content"]::before { content: "前"; color: rgb(100, 110, 120); }
[data-ui="message-content"]::after { content: "后"; }
[data-ui="avatar"] { border-radius: 7px; width: 35px; }
[data-ui="timestamp"] { color: rgb(120, 130, 140) !important; }
[data-ui="timestamp"] { color: rgb(1, 1, 1); }
[data-ui="chat-header"] { border-bottom: 2px solid rgb(1, 2, 3); }
[data-ui="chat-input-area"] { background: rgb(221, 231, 241); }
[data-ui="chat-input"] { font-family: monospace; border: 2px solid rgb(20, 30, 40); border-radius: 9px; }
[data-ui="send-button"] { background: rgb(51, 61, 71); }
[data-ui="transfer-card"] { background: rgb(240, 180, 100); }
[data-ui="quoted-message"] { border-left: 2px solid rgb(121, 131, 141); }
[data-ui="chat-image"] { border-radius: 13px; }
[data-ui="sticker"] { transform: scale(.9); }
[data-ui="voice-message"] { color: rgb(81, 91, 101); }
[data-ui="action-menu"] { border-radius: 17px; }
[data-ui="action-button"] { color: rgb(71, 81, 91); }
@media (max-width: 500px) { [data-ui="chat-header"] { padding-top: 19px; } }
@supports (filter: blur(1px)) { [data-ui="message-bubble"]:has([data-ui="message-content"]) { filter: saturate(.8); } }
@keyframes pulseQA { from { opacity: .2; } to { opacity: .8; } }
[data-ui="chat-title"] { opacity: 1; animation: pulseQA 1s linear infinite; }
`;

// Minimal generated DOCX (stored ZIP); no third-party document or theme fixtures.
function docx(text) {
  const escape = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const name = Buffer.from("word/document.xml");
  const data = Buffer.from(
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text
      .split("\n")
      .map((line) => `<w:p><w:r><w:t xml:space="preserve">${escape(line)}</w:t></w:r></w:p>`)
      .join("")}</w:body></w:document>`,
  );
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}

const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css?direct"><link rel="stylesheet" href="/src/styles/full-chat-css.css?direct"></head><body style="margin:0"><div id="root"></div><div id="outside" data-ui="message-bubble" style="border:1px solid red;font-family:serif">其他 App</div><script type="module">
import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
const source=await (await fetch('/src/components/chat/FullChatCssEditor.tsx')).text();const reactUrl=source.match(new RegExp('from "([^"]*/react[.]js[^"]*)"'))[1];const version=reactUrl.slice(reactUrl.indexOf('?'));
const reactModule = await import(reactUrl); const React = reactModule.default || reactModule; const dom = await import('/node_modules/.vite/deps/react-dom_client.js'+version); const {createRoot} = dom.default || dom;
const moduleUrl=name=>source.match(new RegExp('from "([^"]*lib/'+name+'[.]ts[^"]*)"'))[1];
const api = await import(moduleUrl('appearance')); const libs = await import(moduleUrl('chat-appearance-presets')); const css = await import(moduleUrl('full-chat-css'));
const {FullChatCssPreview} = await import('/src/components/chat/FullChatCssPreview.tsx'); const {FullChatCssEditor} = await import('/src/components/chat/FullChatCssEditor.tsx'); const {FullChatCssLayer} = await import('/src/components/chat/FullChatCssLayer.tsx');
const h=React.createElement;let setChar;let setSelection;
const selections=JSON.parse(localStorage.getItem('qa-character-selections')||'{}');
function App(){const [char,changeChar]=React.useState('A');const [selection,changeSelection]=React.useState(selections.A||{selectedPresetId:null,enabled:true});setChar=id=>{changeChar(id);changeSelection(selections[id]||{selectedPresetId:null,enabled:true})};
setSelection=async next=>{selections[char]=next;localStorage.setItem('qa-character-selections',JSON.stringify(selections));changeSelection(next)};
return h(React.Fragment,null,h(FullChatCssPreview,{scope:char,css:''}),h(FullChatCssLayer,{userId:'qa-account',scope:char,selection,onDisable:reset=>setSelection({...selection,enabled:false,...(reset?{selectedPresetId:null}:{})})}),h('div',{'data-ui':'action-menu','data-full-chat-root':char},h('button',{'data-ui':'action-button'},'操作')),
h(FullChatCssEditor,{key:char,userId:'qa-account',charId:char,selection,disabled:false,persistLibrary:async next=>libs.saveChatAppearanceLibrary('qa-account','chatFull',next.presets),onSelection:setSelection}));}
window.qa={api,libs,css,select:id=>setChar(id),selection:()=>selections,apply:id=>setSelection({selectedPresetId:id,enabled:true})};createRoot(document.getElementById('root')).render(h(App));window.qaReady=true;
</script></body></html>`;

const browser = await chromium.launch({
  executablePath: process.env.KDEJI_QA_BROWSER,
  headless: true,
  args: ["--disable-features=LocalNetworkAccessChecks"],
});
const errors = [];
async function prepare(context) {
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route(`${origin}/full-css-test`, (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.route(`${origin}/src/integrations/supabase/client.ts`, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "export const supabase={from:()=>({select:()=>({eq:()=>({single:()=>Promise.resolve({data:{chat_appearance_libraries:{}},error:null})})})})};",
    }),
  );
  await page.route("https://example.invalid/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#dceafa"/></svg>',
    }),
  );
  // No calls to the real account/database during the compatibility harness.
  await page.route("**/rest/v1/profiles*", (route) =>
    route.fulfill({ contentType: "application/json", body: '{"chat_appearance_libraries":{}}' }),
  );
  await page.goto(`${origin}/full-css-test`);
  try {
    await page.waitForFunction(() => window.qaReady, null, { timeout: 10000 });
  } catch (error) {
    throw new Error(errors.join("\n") || error.message);
  }
  try {
    await page
      .locator(".appearance-subsection")
      .first()
      .waitFor({ state: "attached", timeout: 5000 });
  } catch (error) {
    throw new Error(errors.join("\n") || (await page.locator("body").innerText()) || error.message);
  }
  return page;
}
try {
  let context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let page = await prepare(context);
  const ids = await page.evaluate((css) => {
    const { api, libs } = window.qa;
    let full = api.defaultAppearanceModule("chatFull");
    for (const [name, text] of [
      ["A", css],
      ["B", '[data-ui="message-bubble"] {border: 4px solid rgb(1, 2, 3);font-family:monospace;}'],
      ["C", '[data-ui="message-bubble"] {border-radius:7px;}'],
    ])
      full = api.saveAppearancePreset({ ...full, customCss: text }, "chatFull", name);
    libs.saveChatAppearanceLibrary("qa-account", "chatFull", full.presets);
    let bubble = api.saveAppearancePreset(
      {
        ...api.defaultAppearanceModule("chatBubble"),
        customCss: '[data-ui="message-bubble"] {opacity:.9}',
      },
      "chatBubble",
      "旧气泡",
    );
    let chrome = api.saveAppearancePreset(
      {
        ...api.defaultAppearanceModule("chatChrome"),
        customCss: '[data-ui="chat-header"] {color:gray}',
      },
      "chatChrome",
      "旧顶栏",
    );
    libs.saveChatAppearanceLibrary("qa-account", "chatBubble", bubble.presets);
    libs.saveChatAppearanceLibrary("qa-account", "chatChrome", chrome.presets);
    return full.presets.map((p) => p.id);
  }, css);
  // Deliberately challenge legacy !important declarations and dynamic inline background.
  await page.addStyleTag({
    content:
      ".chat-conversation .chat-message-row.is-user .message-content-wrapper > .message-bubble { border:0!important; font-family:system-ui!important; }",
  });
  await page.evaluate((id) => window.qa.apply(id), ids[0]);
  const preview = '[data-full-chat-root="A"]';
  const user = `${preview} [data-role="user"] [data-ui="message-bubble"]`;
  try {
    await page.waitForFunction(
      (selector) => getComputedStyle(document.querySelector(selector)).borderTopWidth === "3px",
      user,
      { timeout: 5000 },
    );
  } catch (error) {
    console.log(
      await page.evaluate(
        (selector) => ({
          border: getComputedStyle(document.querySelector(selector)).borderTopWidth,
          css: document.querySelector("[data-full-chat-styles]")?.textContent?.slice(0, 2000),
          compile: (() => {
            try {
              return window.qa.css
                .scopeFullChatCss(
                  window.qa.libs.readChatAppearanceLibrary("qa-account", "chatFull").presets[0]
                    .customCss,
                  "A",
                )
                .slice(0, 2000);
            } catch (e) {
              return e.message;
            }
          })(),
        }),
        user,
      ),
    );
    throw error;
  }
  const result = await page.evaluate(
    ({ preview, user }) => {
      const get = (selector, property, pseudo) =>
        getComputedStyle(document.querySelector(selector), pseudo).getPropertyValue(property);
      return {
        userBorder: get(user, "border-top-width"),
        charBorder: get(
          preview + ' [data-role="char"] [data-ui="message-bubble"]',
          "border-top-style",
        ),
        font: get(user + " p", "font-family"),
        gradient: get(user, "background-image"),
        radius: get(user, "border-top-left-radius"),
        shadow: get(user, "box-shadow"),
        padding: get(user, "padding-top"),
        margin: get(user, "margin-top"),
        transform: get(user, "transform"),
        ink: get(user, "color"),
        before: get(user + " p", "content", "::before"),
        after: get(user + " p", "content", "::after"),
        avatar: get(preview + ' [data-ui="message-avatar"]', "width"),
        time: get(preview + ' [data-ui="timestamp"]', "color"),
        header: get(preview + ' [data-ui="chat-header"]', "padding-top"),
        footer: get(preview + ' [data-ui="chat-footer"]', "background-color"),
        input: get(preview + ' [data-ui="chat-input"]', "border-top-width"),
        send: get(preview + ' [data-ui="chat-send"]', "background-color"),
        transfer: get(preview + ' [data-ui="transfer-card"]', "background-color"),
        quote: get(preview + ' [data-ui="message-quote"]', "border-left-width"),
        image: get(preview + ' [data-ui="chat-image"]', "border-top-left-radius"),
        sticker: get(preview + ' [data-ui="sticker"]', "transform"),
        voice: get(preview + ' [data-ui="voice-message"]', "color"),
        filter: get(user, "filter"),
        animation: get(preview + ' [data-ui="chat-title"]', "animation-name"),
        menu: get('[data-ui="action-menu"]', "border-top-left-radius"),
        action: get('[data-ui="action-button"]', "color"),
        outside: get("#outside", "border-top-width"),
        outsideFont: get("#outside", "font-family"),
      };
    },
    { preview, user },
  );
  assert.equal(result.userBorder, "3px");
  assert.equal(result.charBorder, "dashed");
  assert.match(result.font, /kdeji-A-QAFont/);
  assert.match(result.gradient, /linear-gradient/);
  for (const [key, value] of Object.entries({
    radius: "25px",
    padding: "11px",
    margin: "2px",
    ink: "rgb(31, 52, 73)",
    before: '"前"',
    after: '"后"',
    avatar: "35px",
    time: "rgb(120, 130, 140)",
    header: "19px",
    footer: "rgb(221, 231, 241)",
    input: "2px",
    send: "rgb(51, 61, 71)",
    transfer: "rgb(240, 180, 100)",
    quote: "2px",
    image: "13px",
    voice: "rgb(81, 91, 101)",
    filter: "saturate(0.8)",
    animation: "kdeji-A-pulseQA",
    menu: "17px",
    action: "rgb(71, 81, 91)",
    outside: "1px",
    outsideFont: "serif",
  }))
    assert.equal(result[key], value, key);
  assert.match(result.shadow, /rgb\(10, 20, 30\)/);
  assert.match(result.transform, /matrix/);
  assert.match(result.sticker, /0.9/);
  const animationValues = await page.locator(preview + ' [data-ui="chat-title"]').evaluate((el) => {
    const animation = el.getAnimations()[0];
    animation.pause();
    animation.currentTime = 0;
    const start = getComputedStyle(el).opacity;
    animation.currentTime = 500;
    const middle = getComputedStyle(el).opacity;
    return [start, middle];
  });
  assert.equal(animationValues[0], "0.2");
  assert.equal(animationValues[1], "0.5", "keyframes actually change computed opacity");
  const loadedFonts = await page.evaluate(async () =>
    (await document.fonts.load('14px "kdeji-A-QAFont"')).map((font) => font.status),
  );
  assert.ok(
    loadedFonts.length > 0 && loadedFonts.every((status) => status === "loaded"),
    "@font-face actually loads",
  );
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [430, 932],
  ]) {
    await page.setViewportSize({ width, height });
    assert.equal(
      await page
        .locator(`${preview} [data-ui="chat-header"]`)
        .evaluate((el) => getComputedStyle(el).paddingTop),
      "19px",
    );
  }
  console.log(
    "Computed style: User/Char, font-face/font, border/important, gradients, padding/margin/transform, shadow/radius, avatar/timestamp/header/footer/input/send, transfer/quote/image/sticker/voice/menu, pseudo-elements, variables, :has, media/supports, animation passed.",
  );

  await page.evaluate(() => window.qa.select("B"));
  await page.evaluate((id) => window.qa.apply(id), ids[1]);
  await page.waitForFunction(
    () =>
      getComputedStyle(
        document.querySelector('[data-full-chat-root="B"] [data-ui="message-bubble"]'),
      ).borderTopWidth === "4px",
  );
  await page.evaluate(() => window.qa.select("A"));
  await page.waitForFunction(
    () =>
      getComputedStyle(
        document.querySelector('[data-full-chat-root="A"] [data-ui="message-bubble"]'),
      ).borderTopWidth === "2px",
  ); // first Char bubble
  assert.equal(await page.evaluate(() => window.qa.selection().A.selectedPresetId), ids[0]);
  assert.equal(await page.evaluate(() => window.qa.selection().B.selectedPresetId), ids[1]);
  await page.reload();
  await page.waitForFunction(() => window.qaReady);
  await page.waitForFunction(
    () =>
      getComputedStyle(
        document.querySelector(
          '[data-full-chat-root="A"] [data-role="user"] [data-ui="message-bubble"]',
        ),
      ).borderTopWidth === "3px",
  );
  const snapshot = await context.storageState();
  await context.close();
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: snapshot,
  });
  page = await prepare(context);
  await page.waitForFunction(
    () =>
      getComputedStyle(
        document.querySelector(
          '[data-full-chat-root="A"] [data-role="user"] [data-ui="message-bubble"]',
        ),
      ).borderTopWidth === "3px",
  );
  assert.equal(
    await page.evaluate(
      () => window.qa.libs.readChatAppearanceLibrary("qa-account", "chatFull").presets.length,
    ),
    3,
  );
  for (const type of ["chatBubble", "chatChrome"])
    assert.equal(
      await page.evaluate(
        (type) => window.qa.libs.readChatAppearanceLibrary("qa-account", type).presets.length,
        type,
      ),
      1,
    );
  console.log(
    "A/B independent selection + 3 full presets + refresh + new browser context/PWA-like cold start + old bubble/chrome isolation passed.",
  );

  await page.getByText("完整聊天页 CSS", { exact: true }).first().click();
  const input = page.locator('input[type=file][accept*=".css"]');
  const text =
    '/* 自建测试 */\n[data-ui="message-bubble"] { font-family: serif; border: 5px solid #123456; }';
  for (const [name, mimeType, buffer] of [
    ["qa.css", "text/css", Buffer.from(text)],
    [
      "qa.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      docx(text),
    ],
  ]) {
    await input.setInputFiles({ name, mimeType, buffer });
    await page.waitForFunction(
      (text) => document.querySelector('textarea[aria-label="完整聊天页 CSS"]').value === text,
      text,
    );
  }
  assert.equal(
    await page.evaluate(
      () => window.qa.libs.readChatAppearanceLibrary("qa-account", "chatFull").presets.length,
    ),
    3,
  );
  console.log(
    "CSS/DOCX import into real editor preserves CSS text/Chinese; import does not overwrite existing presets.",
  );

  // Library operations and remote envelope compatibility; only the selected preset is exported.
  await page.evaluate(() => {
    const { api, libs } = window.qa;
    let full = {
      ...api.defaultAppearanceModule("chatFull"),
      presets: libs.readChatAppearanceLibrary("qa-account", "chatFull").presets,
    };
    const first = full.presets[0],
      second = full.presets[1];
    full = api.renameAppearancePreset(full, first.id, "改名");
    full = api.applyAppearancePreset(full, first.id);
    full = api.updateAppearancePreset(
      { ...full, customCss: '[data-ui="chat-title"]{color:#123456}' },
      first.id,
    );
    if (full.presets[1].customCss !== second.customCss) throw Error("A overwrote B");
    const exported = api.exportAppearancePreset(full, "chatFull", first.id);
    const imported = api.importAppearancePreset(exported, "chatFull");
    full = { ...full, presets: [...full.presets, imported] };
    full = api.deleteAppearancePreset(full, first.id);
    libs.saveChatAppearanceLibrary("qa-account", "chatFull", full.presets);
    const envelope = libs.chatAppearanceLibraryPayload("qa-account", "chatChrome");
    if (
      envelope.presets[0].themeType !== "chatChrome" ||
      envelope.fullChatLibrary.presets.length !== 3
    )
      throw Error("library scope polluted");
    let rejected = false;
    try {
      api.importAppearancePreset(exported, "chatChrome");
    } catch {
      rejected = true;
    }
    if (!rejected) throw Error("wrong type accepted");
  });
  const security = await page.evaluate(() => {
    const rejects = [
      "body{background:url(javascript:alert(1))}",
      '@import "https://example.invalid/evil.css";',
      ".x{behavior:url(test.htc)}",
      ".x{background:url(\\6a avascript:bad)}",
    ];
    return rejects.every((css) => {
      try {
        window.qa.css.scopeFullChatCss(css, "A");
        return false;
      } catch {
        return true;
      }
    });
  });
  assert.equal(security, true);
  // CSS may cover a wallpaper visually, but removing it must expose the original inline URL.
  await page.evaluate(() => {
    document.querySelector(
      '[data-full-chat-root="A"] [data-ui="chat-messages"]',
    ).style.backgroundImage = 'url("https://example.invalid/original-wallpaper.png")';
    let module = window.qa.api.defaultAppearanceModule("chatFull");
    module = window.qa.api.saveAppearancePreset(
      { ...module, customCss: '[data-ui="chat-background"] { background: #fff !important; }' },
      "chatFull",
      "壁纸视觉覆盖",
    );
    window.qa.libs.saveChatAppearanceLibrary("qa-account", "chatFull", [
      ...window.qa.libs.readChatAppearanceLibrary("qa-account", "chatFull").presets,
      ...module.presets,
    ]);
    window.qa.apply(module.currentPresetId);
  });
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('[data-ui="chat-messages"]')).backgroundImage ===
      "none",
  );
  await page.getByRole("button", { name: "完整 CSS 安全恢复" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "停用完整 CSS", exact: true }).click();
  await page.waitForFunction(() =>
    getComputedStyle(document.querySelector('[data-ui="chat-messages"]')).backgroundImage.includes(
      "original-wallpaper",
    ),
  );
  // Even hiding the entire chat and drawing a fixed overlay cannot hide top-layer recovery.
  await page.evaluate(() => {
    let m = window.qa.api.saveAppearancePreset(
      {
        ...window.qa.api.defaultAppearanceModule("chatFull"),
        customCss:
          '[data-ui="chat-screen"]{display:none} *{pointer-events:none} .message-bubble::before{position:fixed;inset:0;z-index:2147483647;content:""}',
      },
      "chatFull",
      "安全恢复",
    );
    window.qa.libs.saveChatAppearanceLibrary("qa-account", "chatFull", [
      ...window.qa.libs.readChatAppearanceLibrary("qa-account", "chatFull").presets,
      ...m.presets,
    ]);
    window.qa.apply(m.currentPresetId);
  });
  await page.getByRole("button", { name: "完整 CSS 安全恢复" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "恢复默认", exact: true }).click();
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector('[data-ui="chat-page"]')).display !== "none",
  );
  console.log(
    "Rename/update/delete/import/export, safe URL/script filtering, wallpaper visual override/restoration, outside-chat isolation and top-layer emergency recovery passed.",
  );
  assert.deepEqual(errors, []);
  await context.close();
  console.log("No browser runtime errors.");
} finally {
  await browser.close();
}
