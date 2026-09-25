/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ErrorBanner } from "@/components/ui-kit";
import { SystemSheet } from "@/components/system-ui";
import { PersonaEditor, type PersonaDraft } from "@/components/contacts/PersonaEditor";
import type { AiPersona } from "@/lib/types";
import type { ChatThinkingMode } from "@/lib/ai/inner-life.server";

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return setError("请填写名字。");
    const min = Number(form.minimum_messages);
    const max = Number(form.maximum_messages);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min)
      return setError("请检查回复气泡数量。");
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
      })
      .eq("id", character.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    setSaving(false);
    if (saveError || !data) return setError("保存失败，请确认数据库迁移已完成。");
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

  return (
    <SystemSheet
      open={open}
      title="编辑当前角色"
      description={character.name}
      onClose={onClose}
      scrollable
    >
      {error && <ErrorBanner message={error} />}
      <PersonaEditor
        form={form}
        userId={userId}
        existing
        saving={saving}
        onChange={setForm}
        onSubmit={save}
        onDelete={() => void remove()}
        onError={setError}
        extraSettings={
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
        }
      />
    </SystemSheet>
  );
}
