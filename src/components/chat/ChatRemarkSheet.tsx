import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SystemSheet } from "@/components/system-ui";
import { ErrorBanner } from "@/components/ui-kit";
import { characterChatSchema, readCharacterChatPreferences } from "@/lib/character-chat";
import type { AiPersona } from "@/lib/types";

// The generated client types predate character chat preferences.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function ChatRemarkSheet({
  character,
  userId,
  onClose,
  onSaved,
}: {
  character: AiPersona;
  userId: string;
  onClose: () => void;
  onSaved: (character: AiPersona) => void;
}) {
  const [remark, setRemark] = useState(
    () => readCharacterChatPreferences(character.chat_preferences).remark,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      const value = characterChatSchema.shape.remark.parse(remark);
      // Read current preferences so a remark save never resets wallpaper, CSS or memory settings.
      const { data: latest, error: readError } = await db
        .from("ai_personas")
        .select("chat_preferences")
        .eq("id", character.id)
        .eq("user_id", userId)
        .single();
      if (readError || !latest) throw new Error("读取备注失败，请稍后重试。");
      const { data, error: saveError } = await db
        .from("ai_personas")
        .update({ chat_preferences: { ...latest.chat_preferences, remark: value } })
        .eq("id", character.id)
        .eq("user_id", userId)
        .select("*")
        .single();
      if (saveError || !data) throw new Error("保存备注失败，请稍后重试。");
      onSaved(data as AiPersona);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存备注失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="chat-settings-scope">
      <SystemSheet open title="聊天备注" onClose={() => !saving && onClose()}>
        <form onSubmit={save} className="chat-remark-form">
          {error && <ErrorBanner message={error} />}
          <label htmlFor="chat-remark">备注名称</label>
          <input
            id="chat-remark"
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
            placeholder={character.name}
            maxLength={80}
            disabled={saving}
          />
          <p>仅在聊天中显示，不改变角色本名和人设。留空恢复本名。</p>
          <button type="submit" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </form>
      </SystemSheet>
    </div>
  );
}
