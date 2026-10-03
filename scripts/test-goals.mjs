import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  calendarDay,
  goalProgress,
  goalSchema,
  localDate,
  readGoals,
  saveGoal,
  patchGoal,
  deleteGoal,
  setDesktopGoal,
  goalStorageKey,
  useGoals,
} from "../src/lib/goals.ts";
import { defaultAppearanceModule, safeScopedAppearanceCss } from "../src/lib/appearance.ts";
import { readDesktopAppearance, saveDesktopAppearance } from "../src/lib/desktop-appearance.ts";

const goal = (patch = {}) => ({
  id: "date-one",
  type: "date",
  title: "考试",
  note: "",
  startDate: "2026-01-01",
  targetDate: "2026-01-11",
  currentValue: 0,
  targetValue: 0,
  unit: "",
  completed: false,
  createdAt: "2026-01-01T04:00:00.000Z",
  updatedAt: "2026-01-01T04:00:00.000Z",
  ...patch,
});

test("date targets use calendar days, including leap years, DST, deadlines and future starts", () => {
  assert.equal(calendarDay("2024-02-29") + 1, calendarDay("2024-03-01"));
  assert.equal(calendarDay("2026-02-29"), null);
  assert.equal(calendarDay("2026-13-01"), null);
  assert.equal(calendarDay("03/01/2026"), null);
  assert.equal(calendarDay("2026-03-09") - calendarDay("2026-03-08"), 1);
  assert.equal(localDate(new Date(2026, 9, 3, 23, 59)), "2026-10-03");
  assert.deepEqual(goalProgress(goal(), "2026-01-06"), { remaining: 5, elapsed: 5, percent: 50 });
  assert.equal(goalProgress(goal(), "2025-12-30").percent, 0);
  assert.equal(goalProgress(goal(), "2026-01-11").remaining, 0);
  assert.equal(goalProgress(goal(), "2026-01-12").percent, 100);
  assert.equal(goalProgress(goal({ startDate: "2026-01-11" }), "2026-01-11").percent, 100);
  assert.equal(
    goalProgress(goal({ startDate: "", targetDate: "2025-01-01" }), "2026-01-01").percent,
    100,
  );
  assert.equal(goalProgress(goal({ completed: true }), "2026-01-01").percent, 100);
});

test("number targets calculate decimal progress, clamp percentages and reject invalid form data", () => {
  const number = goal({ type: "number", targetValue: 3500, currentValue: 700 });
  assert.equal(goalProgress(number).percent, 20);
  assert.equal(goalProgress({ ...number, currentValue: 7000 }).percent, 100);
  assert.equal(goalProgress({ ...number, currentValue: 0 }).percent, 0);
  assert.equal(goalProgress({ ...number, targetValue: 2.5, currentValue: 1.25 }).percent, 50);
  for (const patch of [
    { title: " " },
    { type: "number", targetValue: 0 },
    { currentValue: -1 },
    { currentValue: Infinity },
    { currentValue: NaN },
    { targetDate: "" },
    { startDate: "2026-01-12" },
  ])
    assert.equal(goalSchema.safeParse(goal(patch)).success, false);
});

test("goal storage: independent accounts, CRUD, desktop selection, cold reads, quota failures, no theme/wallpaper writes", async () => {
  const storage = new Map([
    ["existing-chat", "KEEP"],
    ["kdeji-wallpaper-v1", "KEEP-WALLPAPER"],
  ]);
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  try {
    const originalCount = storage.size;
    assert.equal(readGoals("goal-owner").goals.length, 0);
    assert.equal(storage.size, originalCount, "reading never writes defaults");
    for (let i = 0; i < 10; i++)
      saveGoal("goal-owner", goal({ id: `goal-${i}`, title: `目标 ${i}` }));
    saveGoal("other-owner", goal({ id: "other" }));
    assert.equal(readGoals("goal-owner").goals.length, 10);
    assert.equal(readGoals("other-owner").goals.length, 1);
    setDesktopGoal("goal-owner", "goal-1");
    patchGoal("goal-owner", "goal-1", { completed: true });
    assert.equal(
      readGoals("goal-owner").goals.find((item) => item.id === "goal-1").completed,
      true,
    );
    patchGoal("goal-owner", "goal-1", { completed: false });
    saveGoal("goal-owner", { ...readGoals("goal-owner").goals[0], title: "修改标题" });
    assert.equal(readGoals("goal-owner").goals.length, 10);
    for (let i = 0; i < 10; i++) {
      const fresh = await import(`../src/lib/goals.ts?cold=${i}`);
      assert.equal(fresh.readGoals("goal-owner").goals.length, 10);
      assert.equal(fresh.readGoals("goal-owner").desktopGoalId, "goal-1");
    }
    const appearance = defaultAppearanceModule("desktop");
    saveDesktopAppearance("goal-owner", {
      ...appearance,
      config: {
        ...appearance.config,
        apps: { goal: { size: 72, x: 10, iconUrl: "data:image/png;base64,AA" } },
      },
    });
    assert.equal(readDesktopAppearance("goal-owner").config.apps.goal.size, 72);
    const beforeAppearance = storage.get("kdeji.desktopAppearance.v1:goal-owner");
    deleteGoal("goal-owner", "goal-1");
    assert.equal(readGoals("goal-owner").desktopGoalId, null);
    assert.equal(readGoals("goal-owner").goals.length, 9);
    setDesktopGoal("goal-owner", "goal-2");
    setDesktopGoal("goal-owner", null);
    assert.equal(readGoals("goal-owner").desktopGoalId, null);
    assert.equal(storage.get("kdeji.desktopAppearance.v1:goal-owner"), beforeAppearance);
    assert.equal(storage.get("kdeji-wallpaper-v1"), "KEEP-WALLPAPER");
    assert.equal(storage.get("existing-chat"), "KEEP");
    const before = readGoals("goal-owner");
    globalThis.localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    assert.throws(() => patchGoal("goal-owner", "goal-2", { completed: true }), /保存失败/);
    assert.strictEqual(
      readGoals("goal-owner"),
      before,
      "failed writes cannot update the visible cache",
    );
    globalThis.localStorage.setItem = (key, value) => storage.set(key, value);
    storage.set(goalStorageKey("unreadable"), "bad json");
    assert.equal(readGoals("unreadable").goals.length, 0);
    assert.throws(() => saveGoal("unreadable", goal()), /保存失败/);
    assert.equal(storage.get(goalStorageKey("unreadable")), "bad json");
    // A write uses fresh disk state even if another tab made changes after a read.
    const disk = JSON.parse(storage.get(goalStorageKey("goal-owner")));
    disk.goals.push(goal({ id: "another-tab" }));
    storage.set(goalStorageKey("goal-owner"), JSON.stringify(disk));
    patchGoal("goal-owner", "goal-2", { completed: true });
    assert.ok(readGoals("goal-owner").goals.some((item) => item.id === "another-tab"));
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
});

test("SSR stays deterministic; desktop CSS can scope to goal widgets without changing the appearance schema", () => {
  function Probe() {
    return createElement("span", null, useGoals("ssr-owner").goals.length);
  }
  assert.equal(renderToString(createElement(Probe)), "<span>0</span>");
  const css = safeScopedAppearanceCss(
    '[data-ui="goal-widget"]{background:#fff;border-radius:9px}[data-app-id="goal"] [data-ui="app-icon"]{border:2px solid blue}',
    "desktop",
  );
  assert.ok(css.includes('[data-ui="desktop"] [data-ui="goal-widget"]'));
  assert.ok(css.includes('[data-app-id="goal"]'));
  assert.equal(defaultAppearanceModule("desktop").config.apps.goal, undefined);
});
