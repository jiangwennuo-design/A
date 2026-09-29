/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner } from "@/components/ui-kit";
import { useKeyboardViewport } from "@/hooks/useKeyboardViewport";
import { PersonaEditor, type PersonaDraft } from "@/components/contacts/PersonaEditor";
import type { AiPersona } from "@/lib/types";
import type { ChatThinkingMode } from "@/lib/ai/inner-life.server";
import { CharacterChatExtras } from "./CharacterChatExtras";
import { characterChatSchema, readCharacterChatPreferences } from "@/lib/character-chat";
import { safeBubbleDeclarations } from "@/lib/bubble-css";
import { scopeAppearanceCss } from "@/lib/appearance";

const db = supabase as any;

export function ChatCharacterEditor({
  character,
  userId,
  open,
  defaultMode,
  onClose,
  onSaved,
  onDeleted,
}: {
  character: AiPersona;
  userId: string;
  open: boolean;
  defaultMode: ChatThinkingMode;
  onClose: () => void;
  onSaved: (character: AiPersona) => void;
  onDeleted: () => void;
}) {
  const [form, setForm] = useState<PersonaDraft>(() => ({
    ...character,
    avatar_url: character.avatar_url ?? "",
    gender: character.gender ?? "",
  }));
  const [thinkingMode, setThinkingMode] = useState<ChatThinkingMode>(
    character.chat_thinking_mode ?? defaultMode,
  );
  const [showThinking, setShowThinking] = useState(character.show_chat_thinking ?? false);
  const [preferences, setPreferences] = useState(() =>
    readCharacterChatPreferences(character.chat_preferences),
  );
  const uploadedPaths = useRef<string[]>([]);
  const committedWallpaper = useRef(preferences.wallpaperPath);
  const [saving, setSaving] = useState(false);
  const [wallpaperBusy, setWallpaperBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState("");
  const pageRef = useRef<HTMLElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  useKeyboardViewport(pageRef, open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector('[data-memory-library="open"]'))
        onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    backRef.current?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, [open]);

  useEffect(
    () => () => {
      const unused = uploadedPaths.current.filter((path) => path !== committedWallpaper.current);
      if (unused.length) void supabase.storage.from("wallpapers").remove(unused);
    },
    [],
  );

  async function save(event: FormEvent) {
    event.preventDefault();
    if (wallpaperBusy || avatarBusy || saving) return;
    if (!form.name.trim()) return setError("请填写名字。");
    const min = Number(form.minimum_messages);
    const max = Number(form.maximum_messages);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min)
      return setError("请检查回复气泡数量。");
    try {
      characterChatSchema.parse(preferences);
      safeBubbleDeclarations(preferences.userBubbleCss);
      safeBubbleDeclarations(preferences.charBubbleCss);
      scopeAppearanceCss(preferences.appearance.chatBubble.customCss, "chatBubble");
      scopeAppearanceCss(preferences.appearance.chatChrome.customCss, "chatChrome");
    } catch (reason) {
      return setError(reason instanceof Error ? reason.message : "请检查美化和记忆配置。");
    }
    setSaving(true);
    setError("");
    const { data, error: saveError } = await db
      .from("ai_personas")
      .update({
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
        chat_thinking_mode: thinkingMode,
        show_chat_thinking: showThinking,
        chat_preferences: preferences,
      })
      .eq("id", character.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    setSaving(false);
    if (saveError || !data) return setError("保存失败，请确认数据库迁移已完成。");
    const previousWallpaper = readCharacterChatPreferences(
      character.chat_preferences,
    ).wallpaperPath;
    committedWallpaper.current = preferences.wallpaperPath;
    if (
      previousWallpaper &&
      previousWallpaper !== preferences.wallpaperPath &&
      previousWallpaper.startsWith(`${userId}/chat-wallpapers/${character.id}/`)
    )
      void supabase.storage.from("wallpapers").remove([previousWallpaper]);
    onSaved(data as AiPersona);
    onClose();
  }

  async function remove() {
    if (!confirm(`确定删除角色“${character.name}”吗？相关会话将不再可用。`)) return;
    const { error: removeError } = await db
      .from("ai_personas")
      .delete()
      .eq("id", character.id)
      .eq("user_id", userId);
    if (removeError) return setError("删除失败，请确认没有受保护的关联数据。");
    onDeleted();
  }

  if (!open) return null;

  return (
    <section
      ref={pageRef}
      className="chat-character-page"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chat-character-title"
    >
      <header className="chat-character-page__header">
        <button ref={backRef} type="button" onClick={onClose} aria-label="返回">
          <ChevronLeft size={25} />
        </button>
        <h1 id="chat-character-title">编辑当前角色</h1>
        <button
          type="submit"
          form="chat-character-form"
          disabled={saving || wallpaperBusy || avatarBusy}
        >
          {saving ? "保存中…" : "完成"}
        </button>
      </header>
      <div className="chat-character-page__scroll">
        {error && <ErrorBanner message={error} />}
        <PersonaEditor
          presentation="chat"
          formId="chat-character-form"
          form={form}
          userId={userId}
          existing
          saving={saving}
          onAvatarBusy={setAvatarBusy}
          onChange={setForm}
          onSubmit={save}
          onDelete={() => void remove()}
          onError={setError}
          extraSettings={
            <>
              <section className="contact-editor__group">
                <h2>聊天思维链</h2>
                <label className="contact-editor__field">
                  <span>每位角色独立选择</span>
                  <select
                    value={thinkingMode}
                    onChange={(event) => setThinkingMode(event.target.value as ChatThinkingMode)}
                  >
                    <option value="off">关闭</option>
                    <option value="native">① K得机原生思维链</option>
                    <option value="nuojiji">② 糯叽机思维链</option>
                  </select>
                </label>
                <label className="contact-editor__field chat-thinking-toggle">
                  <span>显示思维链</span>
                  <input
                    type="checkbox"
                    checked={showThinking}
                    onChange={(event) => setShowThinking(event.target.checked)}
                  />
                </label>
                <p>仅控制聊天界面显示；关闭显示仍会正常生成思维链。</p>
              </section>
              <CharacterChatExtras
                charId={character.id}
                userId={userId}
                value={preferences}
                onChange={setPreferences}
                onUploadedPath={(path) => uploadedPaths.current.push(path)}
                onUploadBusy={setWallpaperBusy}
              />
            </>
          }
        />
      </div>
    </section>
  );
}
