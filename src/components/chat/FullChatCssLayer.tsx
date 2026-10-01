import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  hydrateChatAppearanceLibraries,
  useChatAppearanceLibrary,
} from "@/lib/chat-appearance-presets";
import { scopeFullChatCss } from "@/lib/full-chat-css";
import { supabase } from "@/integrations/supabase/client";
import type { CharacterChatPreferences } from "@/lib/character-chat";
import "@/styles/full-chat-css.css";

export function FullChatCssLayer({
  userId,
  scope,
  selection,
  onDisable,
}: {
  userId: string;
  scope: string;
  selection: CharacterChatPreferences["fullChatCss"];
  onDisable: (reset: boolean) => Promise<void>;
}) {
  const library = useChatAppearanceLibrary(userId, "chatFull");
  const [suspended, setSuspended] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const hasSelection = Boolean(selection.selectedPresetId);
  useEffect(() => {
    let active = true;
    if (userId && hasSelection) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (supabase as any)
        .from("profiles")
        .select("chat_appearance_libraries")
        .eq("id", userId)
        .single()
        .then(
          ({
            data,
            error,
          }: {
            data: { chat_appearance_libraries: unknown } | null;
            error: unknown;
          }) => {
            if (active && !error)
              hydrateChatAppearanceLibraries(userId, data?.chat_appearance_libraries);
          },
        )
        .catch(() => {
          /* Local library remains usable offline. */
        });
    }
    return () => {
      active = false;
    };
  }, [userId, hasSelection]);
  useEffect(() => setSuspended(false), [selection.enabled, selection.selectedPresetId]);
  const preset = library.presets.find((preset) => preset.id === selection.selectedPresetId);
  const sourceCss = preset?.customCss ?? "";
  const hasPreset = Boolean(preset);
  const compiled = useMemo(() => {
    if (suspended || !selection.enabled || !selection.selectedPresetId)
      return { css: "", error: "" };
    if (!sourceCss) return { css: "", error: hasPreset ? "" : "所选预设尚未读取，请联网后重试。" };
    try {
      return { css: scopeFullChatCss(sourceCss, scope), error: "" };
    } catch (reason) {
      return { css: "", error: reason instanceof Error ? reason.message : "CSS 解析失败。" };
    }
  }, [suspended, selection.enabled, selection.selectedPresetId, sourceCss, scope, hasPreset]);
  const visible = Boolean(selection.enabled && selection.selectedPresetId);
  return (
    <>
      <style id="k-chat-full-css" data-full-chat-styles>
        {compiled.css}
      </style>
      {visible &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <dialog
              ref={dialog}
              className="full-chat-css-recovery-dialog"
              data-system-appearance-editor
            >
              <h2>完整聊天 CSS</h2>
              <p>此入口不受用户 CSS 控制。</p>
              {compiled.error && <p role="alert">CSS 未应用：{compiled.error}</p>}
              {[false, true].map((reset) => (
                <button
                  key={String(reset)}
                  type="button"
                  onClick={async () => {
                    setSuspended(true); // Immediate safe recovery, even if the account is offline.
                    try {
                      await onDisable(reset);
                      dialog.current?.close();
                    } catch {
                      setError("本次已临时停用；持久化失败，请联网后重试。");
                    }
                  }}
                >
                  {reset ? "恢复默认" : "停用完整 CSS"}
                </button>
              ))}
              <button type="button" onClick={() => dialog.current?.close()}>
                关闭
              </button>
              {error && <p role="alert">{error}</p>}
            </dialog>
          </>,
          document.body,
        )}
    </>
  );
}
