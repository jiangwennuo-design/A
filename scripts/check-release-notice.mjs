import assert from "node:assert/strict";
import { createRequire } from "node:module";

const runtime = process.env.KDEJI_QA_MODULES;
if (!runtime) throw new Error("Set KDEJI_QA_MODULES to the existing Playwright package directory.");
const { chromium } = createRequire(`${runtime}/package.json`)("playwright");
const browser = await chromium.launch({
  executablePath: process.env.KDEJI_QA_BROWSER,
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://127.0.0.1:3187/notice-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/styles.css?direct"></head><body style="margin:0;background:#f4f7fb"><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;const react=await import("/node_modules/.vite/deps/react.js");const React=react.default||react;const dom=await import("/node_modules/.vite/deps/react-dom_client.js");const {createRoot}=dom.default||dom;const {ReleaseNotice}=await import("/src/components/ReleaseNotice.tsx");createRoot(document.getElementById("root")).render(React.createElement(ReleaseNotice));</script></body></html>',
    }),
  );
  await page.goto("http://127.0.0.1:3187/notice-test");
  const dialog = page.getByRole("dialog");
  try {
    await dialog.waitFor({ state: "visible", timeout: 10_000 });
  } catch (error) {
    throw new Error(errors.join("\n") || error.message);
  }
  const shown = Date.now();
  const button = page.locator(".release-notice__confirm");
  assert.equal(await button.isEnabled(), false);
  await page.keyboard.press("Escape");
  await page.mouse.click(3, 3);
  assert.equal(await dialog.isVisible(), true);
  await page.waitForFunction(() => !document.querySelector(".release-notice__confirm").disabled);
  assert.ok(
    Date.now() - shown >= 2700,
    "requires three seconds from mount, not from locator arrival",
  );
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [430, 932],
  ]) {
    await page.setViewportSize({ width, height });
    const layout = await dialog.boundingBox();
    assert.ok(layout.x >= 0 && layout.y >= 0 && layout.x + layout.width <= width + 1);
    assert.ok(layout.y + layout.height <= height + 1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.KDEJI_QA_SCREENSHOT)
    await page.screenshot({ path: process.env.KDEJI_QA_SCREENSHOT });
  await button.click();
  assert.equal(await dialog.count(), 0);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("kdeji:last-read-update")),
    "2026-10-01-imports",
  );
  await page.reload();
  await page.waitForLoadState("networkidle");
  assert.equal(await dialog.count(), 0, "acknowledged releases do not show after refresh");
  await page.evaluate(() => localStorage.setItem("kdeji:last-read-update", "older-release"));
  await page.reload();
  await dialog.waitFor({ state: "visible" });
  assert.equal(await button.isEnabled(), false, "new release gets its own countdown");
  assert.deepEqual(errors, []);
  console.log(
    "Release notice: three-second lock, Escape/backdrop blocked, refresh persistence, new release, 320/390/430px layouts passed.",
  );
} finally {
  await browser.close();
}
