import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import * as preferences from "../src/lib/character-chat.ts";

function walk(node, result = []) {
  if (!node || typeof node !== "object") return result;
  result.push(node);
  [node.props?.children].flat(Infinity).forEach((child) => walk(child, result));
  return result;
}

async function identityEditor(fail = false) {
  const profile = Object.freeze({ avatar_url: "u/avatars/global.webp", display_name: "全局名" });
  let record = {
    id: "char-a",
    user_id: "u",
    name: "甲",
    chat_preferences: {
      remark: "聊天备注",
      contextDepth: 9,
      userAvatarOverride: "u/avatars/a.webp",
      userNicknameOverride: "甲的 User",
      worldBookIds: [],
      wallpaperPath: "u/chat-wallpapers/a.webp",
      customFutureField: "must survive",
    },
  };
  const other = { id: "char-b", chat_preferences: {} };
  let cursor = 0;
  const states = [];
  let saved;
  const db = {
    from: (table) => {
      assert.equal(table, "ai_personas");
      let patch;
      const filters = {};
      const query = {
        select: () => query,
        update: (value) => {
          patch = value;
          return query;
        },
        eq: (key, value) => {
          filters[key] = value;
          return query;
        },
        single: async () => {
          assert.equal(filters.id, "char-a");
          assert.equal(filters.user_id, "u");
          if (patch && fail) return { error: new Error("network"), data: null };
          if (patch) record = { ...record, ...patch };
          return { data: structuredClone(record), error: null };
        },
      };
      return query;
    },
  };
  const deps = {
    "react/jsx-runtime": jsx,
    react: {
      useEffect: () => {},
      useState: (initial) => {
        const index = cursor++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [
          states[index],
          (value) => {
            states[index] = typeof value === "function" ? value(states[index]) : value;
          },
        ];
      },
    },
    "@/components/AvatarPicker": { AvatarPicker: () => null },
    "@/components/ui-kit": { ErrorBanner: () => null },
    "./ContactList": { ContactAvatar: () => null },
    "@/integrations/supabase/client": { supabase: db },
    "@/lib/avatar": { resolveAvatarUrl: async (value) => value },
    "@/lib/character-chat": preferences,
  };
  const source = await readFile(
    new URL("../src/components/contacts/CharacterUserIdentity.tsx", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (name) => {
      assert.ok(name in deps, name);
      return deps[name];
    },
  });
  const render = () => {
    cursor = 0;
    return exports.CharacterUserIdentity({
      character: record,
      profile,
      userId: "u",
      onSaved: (value) => {
        saved = value;
      },
    });
  };
  return { render, states, profile, other, record: () => record, saved: () => saved };
}

test("dedicated identity save writes only owned character, preserving all other preferences", async () => {
  const page = await identityEditor();
  page.render();
  page.states[0] = "u/avatars/new.webp";
  page.states[1] = "  专属昵称  ";
  await page.render().props.onSubmit({ preventDefault() {} });
  assert.equal(page.record().chat_preferences.userNicknameOverride, "专属昵称");
  assert.equal(page.record().chat_preferences.userAvatarOverride, "u/avatars/new.webp");
  assert.equal(page.record().chat_preferences.customFutureField, "must survive");
  assert.equal(page.record().chat_preferences.contextDepth, 9);
  assert.equal(page.record().chat_preferences.wallpaperPath, "u/chat-wallpapers/a.webp");
  assert.deepEqual(page.record().chat_preferences.worldBookIds, []);
  assert.equal(page.saved().id, "char-a");
  assert.equal(page.other.chat_preferences.userAvatarOverride, undefined);
  assert.equal(page.profile.avatar_url, "u/avatars/global.webp");
  assert.equal(
    preferences.characterUserIdentity(
      JSON.parse(JSON.stringify(page.record().chat_preferences)),
      page.profile,
    ).nickname,
    "专属昵称",
  );
});

test("reset clears both overrides through the same durable save and restores global identity", async () => {
  const page = await identityEditor();
  const tree = page.render();
  walk(tree)
    .find((node) => node.type === "button" && node.props.children === "恢复使用全局资料")
    .props.onClick();
  await page.render().props.onSubmit({ preventDefault() {} });
  assert.deepEqual(
    preferences.characterUserIdentity(page.record().chat_preferences, page.profile),
    { avatar: "u/avatars/global.webp", nickname: "全局名" },
  );
  assert.equal(page.record().chat_preferences.remark, "聊天备注");
});

test("failed save retains draft and does not close; upload in flight prevents any write", async () => {
  const page = await identityEditor(true);
  page.render();
  page.states[1] = "未保存昵称";
  await page.render().props.onSubmit({ preventDefault() {} });
  assert.equal(page.saved(), undefined);
  assert.equal(page.states[1], "未保存昵称");
  assert.match(page.states[5], /保存失败/);
  assert.equal(page.states[4], false);
  page.states[3] = true;
  await page.render().props.onSubmit({ preventDefault() {} });
  assert.equal(page.record().chat_preferences.userNicknameOverride, "甲的 User");
});
