import assert from "node:assert/strict";
import { createRequire } from "node:module";
const runtime = process.env.KDEJI_QA_MODULES;
if (!runtime) throw new Error("Set KDEJI_QA_MODULES to the existing Playwright runtime.");
const { chromium } = createRequire(`${runtime}/package.json`)("playwright");
const origin = process.env.KDEJI_QA_ORIGIN || "http://127.0.0.1:3198";
// Real app/desktop/appearance components and route IDs. Only auth is bypassed in this isolated fixture.
const html = String.raw`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/src/styles.css?direct"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
const source = await (await fetch('/src/components/goals/GoalApp.tsx')).text();
const reactUrl = source.match(/from "([^"]*\/react[.]js[^"]*)"/)[1]; const version = reactUrl.slice(reactUrl.indexOf('?'));
const reactModule = await import(reactUrl); const React=reactModule.default||reactModule;
const dom = await import('/node_modules/.vite/deps/react-dom_client.js'+version); const {createRoot}=dom.default||dom;
const routeSource=await (await fetch('/src/routes/_authenticated/goal.tsx')).text();
const routerUrl=routeSource.match(/from "([^"]*react-router[^"]*)"/)[1];
const {createRootRoute,createRoute,createRouter,RouterProvider,Outlet}=await import(routerUrl);
const root=createRootRoute({component:Outlet}); const auth=createRoute({id:'_authenticated',getParentRoute:()=>root,component:()=>React.createElement('div',{className:'phone-stage'},React.createElement('div',{className:'phone-shell'},React.createElement(Outlet)))});
const {Route:home}=await import('/src/routes/_authenticated/index.tsx'); const {Route:goal}=await import('/src/routes/_authenticated/goal.tsx'); const {Route:appearance}=await import('/src/routes/_authenticated/appearance.tsx');
home.update({getParentRoute:()=>auth,id:'/',path:'/'});goal.update({getParentRoute:()=>auth,id:'/goal',path:'/goal'});appearance.update({getParentRoute:()=>auth,id:'/appearance',path:'/appearance'});
const router=createRouter({routeTree:root.addChildren([auth.addChildren([home,goal,appearance])]),context:{}});
window.qa={router,goals:await import('/src/lib/goals.ts'),appearance:await import('/src/lib/desktop-appearance.ts'),appearanceApi:await import('/src/lib/appearance.ts')};
createRoot(document.getElementById('root')).render(React.createElement(RouterProvider,{router}));window.qaReady=true;
</script></body></html>`;

const browser = await chromium.launch({
  executablePath: process.env.KDEJI_QA_BROWSER,
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const errors = [];
context.on("page", (page) =>
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error(error.message);
  }),
);
await context.route(/\/(?:__goal_qa|goal|appearance)?(?:\?.*)?$/, (route) =>
  route.fulfill({ contentType: "text/html", body: html }),
);
const page = await context.newPage();
const nav = async (to, search = {}) => {
  await page.evaluate(({ to, search }) => window.qa.router.navigate({ to, search }), {
    to,
    search,
  });
};
const ready = async () => {
  await page.waitForFunction(() => window.qaReady);
};
const storage = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
const screenshot = async (name) => {
  if (process.env.KDEJI_GOAL_QA_SCREENSHOTS) {
    await page.locator("body").evaluate(async (root) => {
      await Promise.all(
        root
          .getAnimations({ subtree: true })
          .filter((animation) => Number.isFinite(animation.effect.getComputedTiming().endTime))
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    await page.screenshot({ path: `${process.env.KDEJI_GOAL_QA_SCREENSHOTS}-${name}.png` });
  }
};
try {
  await page.goto(`${origin}/`);
  await ready();
  await page.locator('[data-app-id="goal"]').waitFor();
  assert.equal(await page.locator('[data-ui="goal-widget"]').count(), 0);
  const dockBefore = await page.locator('[data-ui="dock"]').innerHTML();
  await page.evaluate(() => localStorage.setItem("qa-unrelated", "KEEP"));
  await page.locator('[data-app-id="goal"]').click();
  await page.getByRole("heading", { name: "规划", exact: true }).waitFor();
  await page.getByRole("button", { name: "新建规划", exact: true }).click();
  await page.getByLabel("标题", { exact: true }).fill("高考");
  await page.getByLabel("开始日期（可选）").fill("2026-01-01");
  await page.getByLabel("目标日期", { exact: true }).fill("2026-12-31");
  await page.getByLabel("简短备注（可选）").fill("每天一点点");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByRole("heading", { name: "高考", exact: true }).waitFor();
  const dateId = await page.evaluate(() => window.qa.goals.readGoals("guest").goals[0].id);
  assert.ok(new URL(page.url()).searchParams.get("id") === dateId);
  await page.getByRole("button", { name: "设置为桌面 Widget" }).click();
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.getByRole("button", { name: "新建规划", exact: true }).click();
  await page.getByLabel("规划类型").selectOption("number");
  await page.getByLabel("标题", { exact: true }).fill("背完单词");
  await page.getByLabel("当前数值").fill("700");
  await page.getByLabel("目标数值", { exact: true }).fill("3500");
  await page.getByLabel("单位", { exact: true }).fill("个");
  await page.getByRole("button", { name: "保存规划" }).click();
  await page.getByRole("heading", { name: "背完单词", exact: true }).waitFor();
  assert.equal(await page.getByRole("progressbar").getAttribute("aria-valuenow"), "20");
  const numberId = await page.evaluate(() => window.qa.goals.readGoals("guest").goals[0].id);
  await page.getByLabel("更新当前进度（个）").fill("1750");
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('[role="progressbar"]').getAttribute("aria-valuenow") === "50",
  );
  await page.getByRole("button", { name: "标记完成", exact: true }).click();
  assert.equal(await page.getByRole("progressbar").getAttribute("aria-valuenow"), "100");
  await page.getByRole("button", { name: "取消完成", exact: true }).click();
  await page.getByRole("button", { name: "编辑规划", exact: true }).click();
  await page.getByLabel("标题", { exact: true }).fill("背单词进度");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByRole("heading", { name: "背单词进度", exact: true }).waitFor();
  await page.reload();
  await ready();
  await page.getByRole("heading", { name: "背单词进度", exact: true }).waitFor();
  assert.equal(await page.getByRole("progressbar").getAttribute("aria-valuenow"), "50");
  await screenshot("detail");
  await page.getByRole("button", { name: "设置为桌面 Widget" }).click();
  await nav("/");
  await page.locator('[data-ui="goal-widget"]').waitFor();
  assert.equal(await page.locator('[data-ui="desktop"] [data-ui="goal-widget"]').count(), 1);
  assert.equal(
    await page.locator('[data-ui="goal-widget"]').getAttribute("data-goal-type"),
    "number",
  );
  assert.match(await page.locator('[data-ui="goal-widget-main"]').innerText(), /1,750个/);
  assert.equal(await page.locator('[data-ui="dock"]').innerHTML(), dockBefore);
  await screenshot("desktop");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 568 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(
      await page.evaluate(() => {
        const root = document.querySelector('[data-ui="desktop"]');
        const dock = root.querySelector('[data-ui="dock"]');
        return dock.offsetTop + dock.offsetHeight <= root.scrollHeight;
      }),
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const current = window.qa.appearance.readDesktopAppearance("guest");
    window.qa.appearance.saveDesktopAppearance("guest", {
      ...current,
      customCss:
        '[data-ui="goal-widget"]{background:rgb(220,230,250);border-radius:9px}[data-ui="goal-widget-main"]{font-size:19px}',
      config: {
        ...current.config,
        apps: {
          ...current.config.apps,
          goal: {
            size: 72,
            x: 8,
            y: 3,
            rotate: 8,
            scale: 1.1,
            opacity: 0.7,
            radius: 12,
            labelSize: 14,
            iconUrl:
              "data:image/svg+xml," +
              encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="blue"/></svg>',
              ),
          },
        },
      },
    });
  });
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('[data-ui="goal-widget"]')).borderRadius === "9px",
  );
  assert.equal(
    await page
      .locator('[data-ui="goal-widget"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(220, 230, 250)",
  );
  assert.equal(
    await page
      .locator('[data-ui="goal-widget-main"]')
      .evaluate((el) => getComputedStyle(el).fontSize),
    "19px",
  );
  assert.equal(
    await page
      .locator('[data-app-id="goal"] [data-ui="app-icon"]')
      .evaluate((el) => getComputedStyle(el).width),
    "72px",
  );
  assert.equal(await page.locator('[data-app-id="goal"] [data-ui="app-icon"] img').count(), 1);
  assert.equal(
    await page.locator('[data-app-id="goal"]').evaluate((el) => getComputedStyle(el).opacity),
    "0.7",
  );
  await page.locator('[data-app-id="goal"]').click();
  await page.getByRole("button", { name: "查看规划：背单词进度" }).waitFor();
  await nav("/");
  await page.locator('[data-ui="goal-widget"]').click();
  await page.getByRole("heading", { name: "背单词进度", exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("id"), numberId);
  await page.getByRole("button", { name: "取消桌面 Widget" }).click();
  await nav("/");
  assert.equal(await page.locator('[data-ui="goal-widget"]').count(), 0);
  await nav("/appearance");
  await page.getByText("逐个 App 调整", { exact: true }).click();
  await page
    .locator(".appearance-app summary")
    .filter({ hasText: /^规划$/ })
    .click();
  assert.equal(
    await page
      .locator(".appearance-app")
      .filter({ has: page.locator("summary", { hasText: /^规划$/ }) })
      .getByText("X 位移", { exact: false })
      .count(),
    1,
  );
  await nav("/goal", { id: dateId });
  await page.getByRole("button", { name: "设置为桌面 Widget" }).click();
  await nav("/");
  assert.equal(
    await page.locator('[data-ui="goal-widget"]').getAttribute("data-goal-type"),
    "date",
  );
  await page.reload();
  await ready();
  await page.locator('[data-ui="goal-widget"]').waitFor();
  for (const ui of [
    "goal-widget-title",
    "goal-widget-main",
    "goal-widget-progress",
    "goal-widget-progress-fill",
    "goal-widget-detail",
    "goal-widget-date",
  ])
    assert.equal(await page.locator(`[data-ui="desktop"] [data-ui="${ui}"]`).count(), 1);
  assert.equal(await page.evaluate(() => window.qa.goals.readGoals("guest").desktopGoalId), dateId);
  await page.locator('[data-ui="goal-widget"]').click();
  await page.getByRole("button", { name: "删除规划", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "删除规划", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "删除", exact: true }).click();
  await page.getByRole("button", { name: "查看规划：背单词进度" }).waitFor();
  assert.equal(await page.evaluate(() => window.qa.goals.readGoals("guest").desktopGoalId), null);
  await page.reload();
  await ready();
  await page.getByRole("button", { name: "查看规划：背单词进度" }).waitFor();
  assert.equal(await page.evaluate(() => window.qa.goals.readGoals("guest").goals.length), 1);
  assert.equal((await storage())["qa-unrelated"], "KEEP");
  await screenshot("list");
  await page.getByRole("button", { name: "查看规划：背单词进度" }).click();
  await page.getByRole("button", { name: "编辑规划", exact: true }).click();
  await page.getByLabel("简短备注（可选）").fill("长文本\n".repeat(350));
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 330 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const rect = await page.getByRole("button", { name: "完成", exact: true }).boundingBox();
    assert.ok(
      rect.y >= 0 && rect.y + rect.height <= 330,
      "save remains accessible in a short/keyboard-sized viewport",
    );
  }
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const snapshot = await context.storageState();
  const cold = await browser.newContext({
    storageState: snapshot,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await cold.route(/\/(?:__goal_qa|goal|appearance)?(?:\?.*)?$/, (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  const coldPage = await cold.newPage();
  await coldPage.goto(`${origin}/goal?id=${numberId}`);
  await coldPage.getByRole("heading", { name: "背单词进度", exact: true }).waitFor();
  assert.equal(await coldPage.getByRole("progressbar").getAttribute("aria-valuenow"), "50");
  await cold.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real desktop/App routes, date/number creation, quick update/edit/complete/delete, refresh/cold browser, widget selectors/routing/unset, icon customization, scoped CSS computed styles, 320/390/430 layouts, unchanged Dock and unrelated data. Auth/network are mocked; real iOS/PWA device not tested.",
  );
} catch (error) {
  console.error(
    "Fixture URL:",
    page.url(),
    "Rendered text:",
    (await page.locator("body").innerText()).slice(0, 2000),
  );
  throw error;
} finally {
  await browser.close();
}
