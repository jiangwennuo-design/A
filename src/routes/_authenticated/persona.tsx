/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner, LoadingSpinner } from "@/components/ui-kit";
import { closeSystemApp, pushSystemPage } from "@/lib/app-transition";
import { resolveAvatarUrl } from "@/lib/avatar";
import { ContactList } from "@/components/contacts/ContactList";
import {
  ContactProfile,
  contactSections,
  type ContactSection,
} from "@/components/contacts/ContactProfile";
import { PersonaEditor, type PersonaDraft } from "@/components/contacts/PersonaEditor";
import { CharacterUserIdentity } from "@/components/contacts/CharacterUserIdentity";
import { CharacterWorldBooks } from "@/components/chat/CharacterWorldBooks";
import { readCharacterChatPreferences } from "@/lib/character-chat";
import "@/styles/rosters.css";
import type { AiPersona } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/_authenticated/persona")({ component: PersonaPage });
const blank: PersonaDraft = {
  name: "新角色",
  description: "",
  personality: "",
  speaking_style: "",
  letterWritingStyle: "",
  interests: "",
  dislikes: "",
  relationship: "",
  background: "",
  additional_prompt: "",
  avatar_url: "",
  gender: "",
  minimum_messages: 1,
  maximum_messages: 1,
};
type View = "list" | "profile" | "edit" | "details" | "identity";

function PersonaPage() {
  const db = supabase as any;
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const [items, setItems] = useState<AiPersona[]>([]);
  const [active, setActive] = useState<AiPersona | null>(null);
  const [form, setForm] = useState<PersonaDraft>(blank);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [view, setView] = useState<View>("list");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [section, setSection] = useState<ContactSection>("basic");
  const [preferences, setPreferences] = useState(() => readCharacterChatPreferences({}));
  const [avatarBusy, setAvatarBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void db
      .from("ai_personas")
      .select("*")
      .order("name")
      .then(async ({ data, error: loadError }: any) => {
        if (!alive) return;
        if (loadError) setError("加载名册失败。");
        const list = (data ?? []) as AiPersona[];
        setItems(list);
        if (
          list.length &&
          !list.some((item) => item.id === localStorage.getItem("current-char-id"))
        )
          localStorage.setItem("current-char-id", list[0]!.id);
        const pairs = await Promise.all(
          list.map(async (item) => [item.id, await resolveAvatarUrl(item.avatar_url)] as const),
        );
        if (alive) setAvatars(Object.fromEntries(pairs));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [db]);

  function select(persona: AiPersona) {
    setActive(persona);
    setForm({
      ...blank,
      ...persona,
      avatar_url: persona.avatar_url ?? "",
      gender: persona.gender ?? "",
      letterWritingStyle: readCharacterChatPreferences(persona.chat_preferences).letterWritingStyle,
    });
    localStorage.setItem("current-char-id", persona.id);
    setPreferences(readCharacterChatPreferences(persona.chat_preferences));
    setView("profile");
  }
  function create() {
    setActive(null);
    setForm(blank);
    setPreferences(readCharacterChatPreferences({}));
    setView("edit");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || avatarBusy) return;
    if (!form.name.trim()) return setError("请填写名字。");
    const min = Number(form.minimum_messages);
    const max = Number(form.maximum_messages);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min)
      return setError("请检查回复气泡数量。");
    setSaving(true);
    setError("");
    try {
      let chatPreferences = { ...preferences };
      if (active) {
        const { data: latest, error: loadError } = await db
          .from("ai_personas")
          .select("chat_preferences")
          .eq("id", active.id)
          .eq("user_id", user?.id)
          .single();
        if (loadError || !latest) throw new Error("读取角色资料失败。");
        chatPreferences = { ...latest.chat_preferences, worldBookIds: preferences.worldBookIds };
      }
      chatPreferences = { ...chatPreferences, letterWritingStyle: form.letterWritingStyle ?? "" };
      const values = {
        name: form.name.trim(),
        description: form.description,
        personality: form.personality,
        speaking_style: form.speaking_style,
        interests: form.interests,
        dislikes: form.dislikes,
        relationship: form.relationship,
        background: form.background,
        additional_prompt: form.additional_prompt,
        avatar_url: form.avatar_url || null,
        gender: form.gender || null,
        minimum_messages: min,
        maximum_messages: max,
        chat_preferences: chatPreferences,
      };
      const result = active
        ? await db
            .from("ai_personas")
            .update(values)
            .eq("id", active.id)
            .eq("user_id", user?.id)
            .select("*")
            .single()
        : await db
            .from("ai_personas")
            .insert({ ...values, user_id: user?.id })
            .select("*")
            .single();
      if (result.error || !result.data) return setError("保存失败，请稍后重试。");
      const saved = result.data as AiPersona;
      setItems((current) =>
        active
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
      );
      const resolved = await resolveAvatarUrl(saved.avatar_url);
      setAvatars((current) => ({ ...current, [saved.id]: resolved }));
      select(saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!active || !confirm(`确定删除角色“${active.name}”吗？相关会话将不再可用。`)) return;
    const { error: removeError } = await db.from("ai_personas").delete().eq("id", active.id);
    if (removeError) return setError("删除失败，请确认没有受保护的关联数据。");
    const next = items.filter((item) => item.id !== active.id);
    setItems(next);
    if (localStorage.getItem("current-char-id") === active.id) {
      if (next[0]) localStorage.setItem("current-char-id", next[0].id);
      else localStorage.removeItem("current-char-id");
    }
    setActive(null);
    setForm(blank);
    setView("list");
  }
  function goBack() {
    if (saving) return;
    if (view === "details" || view === "identity") return setView("profile");
    if (view === "edit") {
      setAvatarBusy(false);
      return setView(active ? "profile" : "list");
    }
    if (view !== "list") return setView("list");
    void closeSystemApp("persona", () => router.history.back());
  }

  if (loading)
    return (
      <div className="page-container">
        <LoadingSpinner />
      </div>
    );
  return (
    <main className="contacts-page roster-scope">
      <header className="contacts-header">
        <button type="button" aria-label="返回" onClick={goBack}>
          <ArrowLeft size={21} />
        </button>
        <span>
          {view === "edit"
            ? active
              ? "编辑资料"
              : "新建角色"
            : view === "details"
              ? contactSections[section]
              : view === "identity"
                ? "我的专属资料"
                : view === "profile"
                  ? "角色资料"
                  : "名册"}
        </span>
        {view === "edit" && (
          <button
            type="submit"
            form="roster-character-form"
            className="user-profile-edit"
            disabled={saving || avatarBusy}
          >
            {saving ? "保存中…" : "完成"}
          </button>
        )}
      </header>
      {error && <ErrorBanner message={error} />}
      {view === "list" && (
        <ContactList
          contacts={items}
          avatars={avatars}
          query={query}
          onQueryChange={setQuery}
          onSelect={select}
          onCreate={create}
        />
      )}
      {(view === "profile" || view === "details") && active && (
        <ContactProfile
          contact={active}
          avatar={avatars[active.id] ?? ""}
          onEdit={() => setView("edit")}
          section={view === "details" ? section : undefined}
          onSection={(value) => {
            setSection(value);
            setView("details");
          }}
          onIdentity={() => setView("identity")}
          onMessage={() =>
            void pushSystemPage(() => navigate({ to: "/chat", search: { char: active.id } }))
          }
        />
      )}
      {view === "identity" && active && user && (
        <CharacterUserIdentity
          key={active.id}
          character={active}
          profile={profile}
          userId={user.id}
          onSaved={(saved) => {
            setItems((current) => current.map((item) => (item.id === saved.id ? saved : item)));
            select(saved);
          }}
        />
      )}
      {view === "edit" && user && (
        <PersonaEditor
          formId="roster-character-form"
          form={form}
          userId={user.id}
          existing={Boolean(active)}
          saving={saving}
          onChange={setForm}
          onSubmit={save}
          onDelete={() => void remove()}
          onError={setError}
          onAvatarBusy={setAvatarBusy}
          extraSettings={<CharacterWorldBooks value={preferences} onChange={setPreferences} />}
        />
      )}
    </main>
  );
}
