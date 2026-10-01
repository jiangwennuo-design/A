import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Upload } from "lucide-react";
import { AppearancePresetManager } from "@/components/appearance/AppearancePresetManager";
import {
  defaultAppearanceModule,
  type AppearanceModule,
  type FullChatConfig,
} from "@/lib/appearance";
import { useChatAppearanceLibrary } from "@/lib/chat-appearance-presets";
import {
  FULL_CHAT_CSS_LIMIT,
  fullChatCssAccept,
  importFullChatCss,
  scopeFullChatCss,
} from "@/lib/full-chat-css";
import type { CharacterChatPreferences } from "@/lib/character-chat";
import { FullChatCssPreview } from "./FullChatCssPreview";

export function FullChatCssEditor({
  userId,
  charId,
  selection,
  disabled,
  persistLibrary,
  onSelection,
}: {
  userId: string;
  charId: string;
  selection: CharacterChatPreferences["fullChatCss"];
  disabled: boolean;
  persistLibrary: (next: AppearanceModule<FullChatConfig>) => Promise<void>;
  onSelection: (value: CharacterChatPreferences["fullChatCss"]) => Promise<void>;
}) {
  const library = useChatAppearanceLibrary(userId, "chatFull");
  const initial = library.presets.find((preset) => preset.id === selection.selectedPresetId);
  const [draft, setDraft] = useState<AppearanceModule<FullChatConfig>>(() => ({
    ...defaultAppearanceModule("chatFull"),
    ...(initial
      ? { currentPresetId: initial.id, name: initial.name, customCss: initial.customCss }
      : {}),
  }));
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const initialized = useRef(Boolean(initial));
  useEffect(() => {
    if (!initial || initialized.current) return;
    initialized.current = true;
    setDraft((current) => ({
      ...current,
      currentPresetId: initial.id,
      name: initial.name,
      customCss: initial.customCss,
    }));
  }, [initial]);
  const fileInput = useRef<HTMLInputElement>(null);
  const value = { ...draft, presets: library.presets };
  const deferredCss = useDeferredValue(draft.customCss);
  const scope = `preview-full-${charId}`;
  const compiled = useMemo(() => {
    if (!editorOpen) return { css: "", error: "" };
    try {
      return { css: scopeFullChatCss(deferredCss, scope), error: "" };
    } catch (error) {
      return { css: "", error: error instanceof Error ? error.message : "CSS 无法解析。" };
    }
  }, [deferredCss, scope, editorOpen]);
  async function select(next: CharacterChatPreferences["fullChatCss"]) {
    setBusy(true);
    try {
      await onSelection(next);
      setNotice(
        next.enabled && next.selectedPresetId
          ? "已应用完整 CSS。"
          : "已停用，原气泡、界面美化和壁纸恢复。",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="appearance-subsection"
      data-system-appearance-editor
      onToggle={(event) => {
        if (event.target === event.currentTarget) setEditorOpen(event.currentTarget.open);
      }}
    >
      <summary>
        <span>
          <strong>完整聊天页 CSS</strong>
          <small>
            {selection.enabled && selection.selectedPresetId
              ? "已启用 · 全局预设"
              : "未启用 · 独立预设库"}
          </small>
        </span>
        <ChevronRight size={16} />
      </summary>
      <div className="appearance-subsection__body">
        <p className="character-extras__hint">
          优先级高于气泡和顶栏/底栏美化；只改变视觉，不修改壁纸。预设账号共享，每位角色单独选择。
        </p>
        <label className="character-extras__field">
          完整聊天页 CSS
          <textarea
            aria-label="完整聊天页 CSS"
            className="character-extras__css"
            rows={14}
            maxLength={FULL_CHAT_CSS_LIMIT}
            spellCheck={false}
            value={draft.customCss}
            onChange={(event) => {
              initialized.current = true;
              setDraft((current) => ({ ...current, customCss: event.target.value }));
            }}
            placeholder={
              '[data-role="user"] [data-ui="message-bubble"] {\n  border: 1px solid #7ab4eb;\n  font-family: serif;\n}'
            }
          />
        </label>
        <div className="character-extras__row">
          <button type="button" onClick={() => fileInput.current?.click()}>
            <Upload size={15} /> 导入 CSS / DOCX
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void select({ ...selection, enabled: false })}
          >
            停用完整 CSS
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft({ ...defaultAppearanceModule("chatFull"), presets: library.presets });
              void select({ selectedPresetId: null, enabled: false });
            }}
          >
            恢复默认
          </button>
        </div>
        <input
          ref={fileInput}
          hidden
          type="file"
          accept={fullChatCssAccept}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            try {
              const css = await importFullChatCss(file);
              initialized.current = true;
              setDraft({
                ...defaultAppearanceModule("chatFull"),
                name: file.name.replace(/\.(?:css|docx)$/i, ""),
                customCss: css,
              });
              setNotice("已读取到编辑器；保存为新预设后应用，不覆盖已有预设。");
            } catch (error) {
              setNotice(error instanceof Error ? error.message : "文件导入失败。");
            }
          }}
        />
        {compiled.error && (
          <p className="character-extras__error" role="alert">
            {compiled.error}
          </p>
        )}
        <details
          className="appearance-subsection"
          onToggle={(event) => {
            if (event.target === event.currentTarget) setPreviewOpen(event.currentTarget.open);
          }}
        >
          <summary>预览与 CSS 选择器</summary>
          <p className="character-extras__hint">
            data-ui：chat-screen / chat-background / chat-header / chat-title / chat-status /
            chat-messages / message-wrapper / message-bubble / message-content / avatar / timestamp
            / quoted-message / chat-image / sticker / voice-message / transfer-card / system-message
            / chat-input-area / chat-input / send-button / action-menu /
            action-button。另有思考、工具、通话、转账详情等入口；data-role 区分 user /
            char，data-message-type 区分消息类型。
          </p>
          {editorOpen && previewOpen && <FullChatCssPreview scope={scope} css={compiled.css} />}
        </details>
        <AppearancePresetManager
          type="chatFull"
          value={value}
          onChange={(next) => {
            initialized.current = true;
            setDraft(next);
          }}
          disabled={disabled || busy}
          activePresetId={selection.enabled ? selection.selectedPresetId : null}
          onPersist={async (next, mode) => {
            setBusy(true);
            try {
              scopeFullChatCss(next.customCss, scope);
              await persistLibrary(next);
              if (mode === "apply")
                await onSelection({ selectedPresetId: next.currentPresetId, enabled: true });
              else if (
                selection.selectedPresetId &&
                !next.presets.some((preset) => preset.id === selection.selectedPresetId)
              )
                await onSelection({ selectedPresetId: null, enabled: false });
            } finally {
              setBusy(false);
            }
          }}
          onReset={() => {
            setDraft({ ...defaultAppearanceModule("chatFull"), presets: library.presets });
            void select({ selectedPresetId: null, enabled: false });
          }}
        />
        {notice && (
          <p role="status" className="appearance-presets__notice">
            {notice}
          </p>
        )}
      </div>
    </details>
  );
}
