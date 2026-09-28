import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

const draft = {
  display_name: " 新昵称 ",
  avatar_url: "profile/owner/avatar.webp",
  signature: "新的个性签名",
  gender: "non_binary",
  persona_text: "新的 User Persona",
};

async function editor({ resultError = null, throws = false, avatarBusy = false } = {}) {
  let cursor = 0;
  let refreshes = 0;
  let writes = 0;
  let record = { id: "owner", email: "unchanged@example.invalid", ...draft };
  let profile = { ...record };
  const states = [{ ...draft }, "", true, "", false, avatarBusy];
  const effects = [];
  const dependencies = {
    "react/jsx-runtime": jsx,
    react: {
      useState: (initial) => {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [
          states[index],
          (next) => {
            states[index] = typeof next === "function" ? next(states[index]) : next;
          },
        ];
      },
      useRef: () => ({ current: null }),
      useEffect: (effect) => effects.push(effect),
    },
    "@tanstack/react-router": {
      createFileRoute: () => (options) => options,
      useNavigate: () => () => {},
    },
    "lucide-react": { ArrowLeft: () => null, Pencil: () => null, Upload: () => null },
    "@/context/AuthContext": {
      useAuth: () => ({
        user: { id: "owner" },
        profile,
        refreshProfile: async () => {
          refreshes++;
          profile = { ...record };
        },
      }),
    },
    "@/integrations/supabase/client": {
      supabase: {
        from: (table) => {
          assert.equal(table, "profiles");
          return {
            update: (payload) => ({
              eq: (key, id) => {
                assert.equal(key, "id");
                assert.equal(id, "owner");
                return {
                  select: (columns) => {
                    assert.equal(columns, "id");
                    return {
                      single: async () => {
                        writes++;
                        if (throws) throw new Error("network");
                        if (resultError) return { error: resultError };
                        record = { ...record, ...payload };
                        return { data: { id }, error: null };
                      },
                    };
                  },
                };
              },
            }),
          };
        },
      },
    },
    "@/components/ui-kit": { ErrorBanner: () => null, LoadingSpinner: () => null },
    "@/components/AvatarPicker": { AvatarPicker: () => null },
    "@/lib/persona-file": { importPersonaFile: async () => "imported" },
    "@/components/ChatNav": { ChatNav: () => null },
    "@/lib/app-transition": { popSystemPage: (callback) => callback() },
    "@/lib/avatar": { resolveAvatarUrl: async (value) => value },
  };
  const source = await readFile(
    new URL("../src/routes/_authenticated/profile.tsx", import.meta.url),
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
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  const render = () => {
    cursor = 0;
    effects.length = 0;
    return exports.Route.component();
  };
  const tree = render();
  const nodes = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    nodes.push(node);
    const children = node.props?.children;
    (Array.isArray(children) ? children : [children]).flat(Infinity).forEach(walk);
  };
  walk(tree);
  const form = nodes.find((node) => node.type === "form");
  const done = nodes.find((node) => node.type === "button" && node.props.form === form.props.id);
  assert.equal(done.props.type, "submit");
  assert.equal(done.key, "save-profile");
  assert.equal(done.props.children, "完成");
  assert.equal(done.props.disabled, avatarBusy);
  assert.ok(
    nodes.some(
      (node) =>
        node.type === "button" &&
        node.props.children === "保存资料" &&
        node.props.type === "submit",
    ),
  );
  return {
    states,
    render,
    effects,
    save: () => form.props.onSubmit({ preventDefault() {} }),
    record: () => record,
    profile: () => profile,
    refreshes: () => refreshes,
    writes: () => writes,
  };
}

test("both save entries use the existing profile form; all five fields persist and survive remount", async () => {
  const page = await editor();
  await page.save();
  for (const [key, value] of Object.entries(draft)) {
    assert.equal(page.record()[key], key === "display_name" ? value.trim() : value);
    assert.equal(page.profile()[key], page.record()[key]);
  }
  assert.equal(page.record().email, "unchanged@example.invalid");
  assert.equal(page.refreshes(), 1);
  assert.equal(page.states[2], false);
  assert.equal(page.states[4], false);
  assert.equal(page.render().props.children[0].props.children[2].key, "edit-profile");
  page.states[0] = null;
  page.render();
  page.effects[0]();
  for (const key of Object.keys(draft)) assert.equal(page.states[0][key], page.record()[key]);
});

test("server rejection or thrown network failure preserves the draft and permits retry", async () => {
  for (const options of [{ resultError: { message: "no matching row" } }, { throws: true }]) {
    const page = await editor(options);
    await page.save();
    assert.equal(page.states[2], true);
    assert.equal(page.states[4], false);
    assert.match(page.states[3], /保存失败/);
    assert.equal(page.refreshes(), 0);
    assert.equal(page.states[0].persona_text, draft.persona_text);
  }
});

test("avatar upload blocks saving until a durable avatar path is available", async () => {
  const page = await editor({ avatarBusy: true });
  await page.save();
  assert.equal(page.writes(), 0);
  assert.equal(page.states[2], true);
});
