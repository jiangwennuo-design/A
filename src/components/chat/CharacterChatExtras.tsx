import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Brain, ChevronRight, ImagePlus, Palette, Pencil, Plus, Trash2 } from "lucide-react";
import { AppearancePresetManager } from "@/components/appearance/AppearancePresetManager";
import { SystemSheet } from "@/components/system-ui";
import { MessageAvatar } from "@/components/ChatMessages";
import { CharacterWorldBooks } from "./CharacterWorldBooks";
import { FullChatCssEditor } from "./FullChatCssEditor";
import { bubbleStyles, safeBubbleDeclarations } from "@/lib/bubble-css";
import type { CharacterChatPreferences, CharacterMemory } from "@/lib/character-chat";
import {
  listCharacterMemories,
  saveCharacterMemory,
  deleteCharacterMemory,
  summarizeCharacterMemory,
} from "@/lib/character-memory.functions";
import { changeCharacterWallpaper } from "@/lib/character-wallpaper";
import { useCharacterWallpaper } from "@/lib/chat-wallpaper-state";
import type { AiPersona } from "@/lib/types";
import { assertSafeRemoteUrl } from "@/lib/stickers/resolve-resource";
import { supabase } from "@/integrations/supabase/client";
import {
  chatChromeVariables,
  chatChromeElementCss,
  defaultAppearanceModule,
  readAppearanceModule,
  safeScopedAppearanceCss,
  type AppearanceModule,
  type ChatBubbleConfig,
  type ChatChromeConfig,
  type FullChatConfig,
} from "@/lib/appearance";
import "@/styles/character-chat.css";
import {
  hydrateChatAppearanceLibraries,
  migrateChatAppearanceLibraries,
  saveChatAppearanceLibrary,
  useChatAppearanceLibrary,
  chatAppearanceLibraryPayload,
} from "@/lib/chat-appearance-presets";

export function CharacterChatExtras({
  charId,
  userId,
  value,
  onChange,
  onWallpaperChange,
  onWallpaperSaved,
  onUploadBusy,
  onAppearanceSaved,
}: {
  charId: string;
  userId: string;
  value: CharacterChatPreferences;
  onChange: Dispatch<SetStateAction<CharacterChatPreferences>>;
  onWallpaperChange: (
    patch: Pick<CharacterChatPreferences, "wallpaperPath" | "wallpaperUrl">,
  ) => Promise<void>;
  onUploadBusy: (busy: boolean) => void;
  onWallpaperSaved: (character: AiPersona) => void;
  onAppearanceSaved: (character: AiPersona) => void;
}) {
  const wallpaperState = useCharacterWallpaper(userId, charId);
  const wallpaper = wallpaperState.displayUrl;
  const [link, setLink] = useState(value.wallpaperUrl ?? "");
  const [linkLoading, setLinkLoading] = useState(false);
  const uploading = wallpaperState.busy || linkLoading;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [memories, setMemories] = useState<CharacterMemory[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ id: string | null; content: string } | null>(null);
  const alive = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const cancelLink = useRef<(() => void) | null>(null);
  const legacyPreferences = useRef(value);
  const [librariesReady, setLibrariesReady] = useState(false);
  const librarySaveQueue = useRef(Promise.resolve());
  const list = useServerFn(listCharacterMemories);
  const saveMemory = useServerFn(saveCharacterMemory);
  const deleteMemory = useServerFn(deleteCharacterMemory);
  const summarize = useServerFn(summarizeCharacterMemory);
  const update = (patch: Partial<CharacterChatPreferences>) =>
    onChange((current) => ({ ...current, ...patch }));
  const bubbleLibrary = useChatAppearanceLibrary(userId, "chatBubble");
  const chromeLibrary = useChatAppearanceLibrary(userId, "chatChrome");
  const bubbleAppearance = {
    ...readAppearanceModule("chatBubble", value.appearance.chatBubble),
    presets: bubbleLibrary.presets as AppearanceModule<ChatBubbleConfig>["presets"],
  };
  const chromeAppearance = {
    ...readAppearanceModule("chatChrome", value.appearance.chatChrome),
    presets: chromeLibrary.presets as AppearanceModule<ChatChromeConfig>["presets"],
  };
  useEffect(() => {
    let active = true;
    void (async () => {
      // The generated client predates chat_preferences.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [account, characters] = await Promise.all([
        db.from("profiles").select("chat_appearance_libraries").eq("id", userId).single(),
        db.from("ai_personas").select("id, chat_preferences").eq("user_id", userId),
      ]);
      if (!active) return;
      if (account.error || characters.error)
        throw new Error("预设库读取失败，请检查全局预设数据库迁移。");
      hydrateChatAppearanceLibraries(userId, account.data?.chat_appearance_libraries);
      migrateChatAppearanceLibraries(userId, [
        ...(characters.data ?? []),
        { id: charId, chat_preferences: legacyPreferences.current },
      ]);
      for (const type of ["chatBubble", "chatChrome"] as const) {
        const { error: saveError } = await db.rpc("save_chat_appearance_library", {
          p_theme: type,
          p_library: chatAppearanceLibraryPayload(userId, type),
        });
        if (saveError) throw new Error("全局预设同步失败，请检查数据库迁移。");
      }
      if (active) setLibrariesReady(true);
    })().catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "旧预设读取失败。");
    });
    return () => {
      active = false;
    };
  }, [userId, charId]);
  function persistLibrary(
    type: "chatBubble" | "chatChrome" | "chatFull",
    next: AppearanceModule<ChatBubbleConfig | ChatChromeConfig | FullChatConfig>,
  ) {
    saveChatAppearanceLibrary(userId, type, next.presets);
    const request = librarySaveQueue.current
      .catch(() => {})
      .then(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: saveError } = await (supabase as any).rpc("save_chat_appearance_library", {
          p_theme: type === "chatFull" ? "chatChrome" : type,
          p_library: chatAppearanceLibraryPayload(userId, type),
        });
        if (saveError) throw new Error("已保留本机预设，账号同步失败，请重试。");
      });
    librarySaveQueue.current = request;
    return request;
  }
  const setBubbleAppearance = (next: AppearanceModule<ChatBubbleConfig>) =>
    update({
      userBubbleCss: next.config.userCss,
      charBubbleCss: next.config.charCss,
      appearance: {
        ...value.appearance,
        chatBubble: {
          ...next,
          presets: librariesReady ? [] : value.appearance.chatBubble.presets,
        } as unknown as CharacterChatPreferences["appearance"]["chatBubble"],
      },
    });
  const setChromeAppearance = (next: AppearanceModule<ChatChromeConfig>) =>
    update({
      appearance: {
        ...value.appearance,
        chatChrome: {
          ...next,
          presets: librariesReady ? [] : value.appearance.chatChrome.presets,
        } as unknown as CharacterChatPreferences["appearance"]["chatChrome"],
      },
    });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelLink.current?.();
    };
  }, []);
  useEffect(() => onUploadBusy(uploading), [uploading, onUploadBusy]);

  const cssErrors = [value.userBubbleCss, value.charBubbleCss].map((css) => {
    try {
      safeBubbleDeclarations(css);
      return "";
    } catch (reason) {
      return reason instanceof Error ? reason.message : "CSS 格式不正确。";
    }
  });
  const scope = `preview-${charId}`;

  async function upload(file?: File) {
    if (!file || uploading) return;
    setError("");
    try {
      const saved = await changeCharacterWallpaper(userId, charId, file);
      if (alive.current && saved) {
        onWallpaperSaved(saved);
        setLink("");
      }
    } catch (reason) {
      if (alive.current) {
        setError(reason instanceof Error ? reason.message : "上传失败。");
      }
    }
  }
  async function applyWallpaperLink() {
    setError("");
    try {
      const url = assertSafeRemoteUrl(link.trim()).toString();
      setLinkLoading(true);
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        const cleanup = () => {
          window.clearTimeout(timer);
          image.onload = image.onerror = null;
          cancelLink.current = null;
        };
        const timer = window.setTimeout(() => {
          cleanup();
          image.src = "";
          reject(new Error("壁纸加载超时。"));
        }, 12_000);
        cancelLink.current = () => {
          cleanup();
          image.src = "";
          reject(new Error("已取消壁纸加载。"));
        };
        image.onload = () => {
          cleanup();
          resolve();
        };
        image.onerror = () => {
          cleanup();
          reject(new Error("图片链接无法读取。"));
        };
        image.src = url;
      });
      if (alive.current) {
        await onWallpaperChange({ wallpaperUrl: url, wallpaperPath: null });
        update({ wallpaperUrl: url, wallpaperPath: null });
      }
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : "图片链接无效。");
    } finally {
      if (alive.current) setLinkLoading(false);
    }
  }
  async function resetWallpaper() {
    setLinkLoading(true);
    setError("");
    try {
      await onWallpaperChange({ wallpaperPath: null, wallpaperUrl: null });
      update({ wallpaperPath: null, wallpaperUrl: null });
      setLink("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "壁纸保存失败。");
    } finally {
      if (alive.current) setLinkLoading(false);
    }
  }
  async function action(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : "操作失败。");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const openLibrary = () => {
    setLibraryOpen(true);
    setDraft(null);
    void action(async () => {
      const rows = await list({ data: { char_id: charId } });
      if (alive.current) setMemories(rows);
    });
  };

  return (
    <div className="character-extras">
      <details className="character-extras__section">
        <summary>
          <Palette size={20} />
          <span>
            <strong>自定义美化</strong>
            <small>
              {value.userBubbleCss ||
              value.charBubbleCss ||
              value.avatarDisplayMode === "qq" ||
              value.wallpaperPath ||
              value.wallpaperUrl
                ? "已自定义"
                : "默认外观"}
            </small>
          </span>
          <ChevronRight size={17} />
        </summary>
        <div className="character-extras__body">
          <p className="character-extras__hint">
            仅作用于当前角色。壁纸自动保存；其他修改点击顶部“完成”保存。
          </p>
          <section className="character-extras__card">
            <label className="contact-editor__field">
              <span>头像显示模式</span>
              <select
                aria-label="头像显示模式"
                value={value.avatarDisplayMode}
                onChange={(event) =>
                  update({ avatarDisplayMode: event.target.value === "qq" ? "qq" : "simple" })
                }
              >
                <option value="simple">简洁模式（默认）</option>
                <option value="qq">QQ模式</option>
              </select>
            </label>
            <p className="character-extras__hint">
              {value.avatarDisplayMode === "qq"
                ? "每条消息旁均显示头像，仅对此角色生效。"
                : "连续消息只显示一个头像，保持现有显示方式。"}
            </p>
          </section>
          <details className="appearance-subsection">
            <summary>
              <span>
                <strong>聊天气泡</strong>
                <small>User / Char CSS 与预设</small>
              </span>
              <ChevronRight size={16} />
            </summary>
            <div className="appearance-subsection__body">
              {(["userBubbleCss", "charBubbleCss"] as const).map((key, index) => (
                <section className="character-extras__card" key={key}>
                  <div className="character-extras__row">
                    <h3>{index === 0 ? "User 气泡 CSS" : "Char 气泡 CSS"}</h3>
                    <button
                      type="button"
                      onClick={() =>
                        setBubbleAppearance({
                          ...bubbleAppearance,
                          currentPresetId: null,
                          config: {
                            ...bubbleAppearance.config,
                            [index === 0 ? "userCss" : "charCss"]: "",
                          },
                        })
                      }
                    >
                      恢复默认
                    </button>
                  </div>
                  <textarea
                    aria-label={index === 0 ? "User 气泡 CSS" : "Char 气泡 CSS"}
                    className="character-extras__css"
                    rows={4}
                    maxLength={4000}
                    placeholder="background-color: #1886f7;\ncolor: #fff;\nborder-radius: 18px;"
                    value={value[key]}
                    onChange={(event) => {
                      const css = event.target.value;
                      setBubbleAppearance({
                        ...bubbleAppearance,
                        currentPresetId: null,
                        config: {
                          ...bubbleAppearance.config,
                          [index === 0 ? "userCss" : "charCss"]: css,
                        },
                      });
                    }}
                  />
                  {cssErrors[index] && (
                    <p className="character-extras__error">{cssErrors[index]}</p>
                  )}
                </section>
              ))}
              <div
                className="character-extras__preview"
                data-ui="chat-messages"
                data-chat-scope={scope}
                style={
                  wallpaper ? { backgroundImage: `url(${JSON.stringify(wallpaper)})` } : undefined
                }
              >
                <style>{bubbleStyles(scope, value.userBubbleCss, value.charBubbleCss, true)}</style>
                <style>{safeScopedAppearanceCss(bubbleAppearance.customCss, "chatBubble")}</style>
                <small>实时预览</small>
                {[
                  { side: "char", name: "角色", text: "今天过得怎么样？", grouped: false },
                  { side: "char", name: "角色", text: "慢慢说，我在听。", grouped: true },
                  { side: "user", name: "我", text: "想和你分享今天的小事。", grouped: false },
                  { side: "user", name: "我", text: "还有一件开心的事。", grouped: true },
                ].map((message, index) => (
                  <div
                    key={index}
                    data-ui="message"
                    data-role={message.side}
                    className={`chat-message-row is-${message.side} ${message.grouped ? "is-grouped" : ""}`}
                  >
                    <MessageAvatar
                      url=""
                      name={message.name}
                      alwaysVisible={value.avatarDisplayMode === "qq"}
                    />
                    <div className="message-content-wrapper">
                      <div className="message-bubble" data-ui="message-bubble">
                        <p>{message.text}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <label className="character-extras__field">
                高级气泡 CSS
                <textarea
                  rows={8}
                  maxLength={40000}
                  spellCheck={false}
                  value={bubbleAppearance.customCss}
                  onChange={(event) =>
                    setBubbleAppearance({
                      ...bubbleAppearance,
                      currentPresetId: null,
                      customCss: event.target.value,
                    })
                  }
                  placeholder={
                    '[data-role="user"] [data-ui="message-bubble"] {\n  filter: saturate(.9);\n}'
                  }
                />
              </label>
              <AppearancePresetManager
                type="chatBubble"
                value={bubbleAppearance}
                onChange={setBubbleAppearance}
                disabled={!librariesReady}
                onPersist={(next) => persistLibrary("chatBubble", next)}
                onReset={() =>
                  setBubbleAppearance({
                    ...defaultAppearanceModule("chatBubble"),
                    presets: bubbleAppearance.presets,
                  })
                }
              />
            </div>
          </details>
          <FullChatCssEditor
            userId={userId}
            charId={charId}
            selection={value.fullChatCss}
            disabled={!librariesReady}
            persistLibrary={(next) => persistLibrary("chatFull", next)}
            onSelection={async (selection) => {
              update({ fullChatCss: selection });
              // Preserve all existing saved fields, including independent wallpaper metadata.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const db = supabase as any;
              const { data, error: readError } = await db
                .from("ai_personas")
                .select("chat_preferences")
                .eq("id", charId)
                .eq("user_id", userId)
                .single();
              if (readError) throw new Error("读取角色美化选择失败。");
              const { data: saved, error: saveError } = await db
                .from("ai_personas")
                .update({ chat_preferences: { ...data.chat_preferences, fullChatCss: selection } })
                .eq("id", charId)
                .eq("user_id", userId)
                .select("*")
                .single();
              if (saveError) throw new Error("保存完整 CSS 选择失败。");
              onAppearanceSaved(saved as AiPersona);
            }}
          />
          <section className="character-extras__card">
            <h3>聊天壁纸</h3>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()}>
              <ImagePlus size={17} />
              {uploading ? "正在处理…" : wallpaper ? "从相册更换" : "从相册上传"}
            </button>
            <label className="character-extras__field">
              图片链接
              <input
                type="url"
                value={link}
                placeholder="https://…"
                onChange={(event) => setLink(event.target.value)}
              />
            </label>
            <div className="character-extras__row">
              <button
                type="button"
                disabled={uploading || !link.trim()}
                onClick={() => void applyWallpaperLink()}
              >
                使用图片链接
              </button>
              <button
                type="button"
                className="is-danger"
                disabled={uploading}
                onClick={() => void resetWallpaper()}
              >
                删除壁纸
              </button>
              <button type="button" disabled={uploading} onClick={() => void resetWallpaper()}>
                恢复默认
              </button>
            </div>
          </section>
          <details className="appearance-subsection">
            <summary>
              <span>
                <strong>聊天界面</strong>
                <small>顶栏、底栏与高级 CSS</small>
              </span>
              <ChevronRight size={16} />
            </summary>
            <div className="appearance-subsection__body">
              <div
                className="chat-chrome-preview"
                data-ui="chat-page"
                style={chatChromeVariables(chromeAppearance.config)}
              >
                <style>{safeScopedAppearanceCss(chromeAppearance.customCss, "chatChrome")}</style>
                <style>{chatChromeElementCss(chromeAppearance.config)}</style>
                <header data-ui="chat-header">
                  <button data-ui="chat-back">‹</button>
                  <span data-ui="chat-header-avatar" />
                  <strong data-ui="chat-title">角色</strong>
                  <button data-ui="chat-call">○</button>
                  <button data-ui="chat-settings">⚙</button>
                </header>
                <footer data-ui="chat-footer">
                  <button data-ui="chat-add">+</button>
                  <span data-ui="chat-input">说点什么…</span>
                  <button data-ui="chat-send">↑</button>
                </footer>
              </div>
              <section className="character-extras__card">
                <h3>顶栏</h3>
                <label className="character-extras__field">
                  背景
                  <input
                    value={chromeAppearance.config.headerBackground}
                    placeholder="#ffffff 或 rgba(… )"
                    onChange={(e) =>
                      setChromeAppearance({
                        ...chromeAppearance,
                        currentPresetId: null,
                        config: { ...chromeAppearance.config, headerBackground: e.target.value },
                      })
                    }
                  />
                </label>
                <label className="character-extras__field">
                  高度
                  <input
                    type="range"
                    min="54"
                    max="120"
                    value={chromeAppearance.config.headerHeight}
                    onChange={(e) =>
                      setChromeAppearance({
                        ...chromeAppearance,
                        currentPresetId: null,
                        config: {
                          ...chromeAppearance.config,
                          headerHeight: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label className="character-extras__field">
                  模糊
                  <input
                    type="range"
                    min="0"
                    max="32"
                    value={chromeAppearance.config.headerBlur}
                    onChange={(e) =>
                      setChromeAppearance({
                        ...chromeAppearance,
                        currentPresetId: null,
                        config: { ...chromeAppearance.config, headerBlur: Number(e.target.value) },
                      })
                    }
                  />
                </label>
                <label className="character-extras__field">
                  头像大小
                  <input
                    type="range"
                    min="28"
                    max="64"
                    value={chromeAppearance.config.avatarSize}
                    onChange={(e) =>
                      setChromeAppearance({
                        ...chromeAppearance,
                        currentPresetId: null,
                        config: { ...chromeAppearance.config, avatarSize: Number(e.target.value) },
                      })
                    }
                  />
                </label>
              </section>
              <section className="character-extras__card">
                <h3>底栏</h3>
                <label className="character-extras__field">
                  背景
                  <input
                    value={chromeAppearance.config.footerBackground}
                    placeholder="#ffffff 或 rgba(… )"
                    onChange={(e) =>
                      setChromeAppearance({
                        ...chromeAppearance,
                        currentPresetId: null,
                        config: { ...chromeAppearance.config, footerBackground: e.target.value },
                      })
                    }
                  />
                </label>
                <label className="character-extras__field">
                  高度
                  <input
                    type="range"
                    min="58"
                    max="140"
                    value={chromeAppearance.config.footerHeight}
                    onChange={(e) =>
                      setChromeAppearance({
                        ...chromeAppearance,
                        currentPresetId: null,
                        config: {
                          ...chromeAppearance.config,
                          footerHeight: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label className="character-extras__field">
                  输入框圆角
                  <input
                    type="range"
                    min="0"
                    max="40"
                    value={chromeAppearance.config.inputRadius}
                    onChange={(e) =>
                      setChromeAppearance({
                        ...chromeAppearance,
                        currentPresetId: null,
                        config: { ...chromeAppearance.config, inputRadius: Number(e.target.value) },
                      })
                    }
                  />
                </label>
                <label className="character-extras__field">
                  输入框背景
                  <input
                    value={chromeAppearance.config.inputBackground}
                    onChange={(e) =>
                      setChromeAppearance({
                        ...chromeAppearance,
                        currentPresetId: null,
                        config: { ...chromeAppearance.config, inputBackground: e.target.value },
                      })
                    }
                  />
                </label>
              </section>
              <section className="character-extras__card">
                <h3>元素位置与显示</h3>
                {(
                  [
                    ["back", "返回按钮"],
                    ["avatar", "角色头像"],
                    ["title", "角色名称"],
                    ["call", "电话按钮"],
                    ["settings", "设置按钮（恢复入口）"],
                    ["add", "+ 按钮"],
                    ["input", "输入框"],
                    ["reply", "回复按钮"],
                    ["send", "发送按钮"],
                  ] as const
                ).map(([key, label]) => {
                  const visual = chromeAppearance.config.elements[key] ?? {};
                  const patchElement = (patch: Record<string, number | boolean>) =>
                    setChromeAppearance({
                      ...chromeAppearance,
                      currentPresetId: null,
                      config: {
                        ...chromeAppearance.config,
                        elements: {
                          ...chromeAppearance.config.elements,
                          [key]: { ...visual, ...patch },
                        },
                      },
                    });
                  return (
                    <div className="chat-chrome-element" key={key}>
                      <label>
                        {label}
                        <input
                          type="checkbox"
                          checked={key === "settings" || visual.visible !== false}
                          disabled={key === "settings"}
                          onChange={(event) => patchElement({ visible: event.target.checked })}
                        />
                      </label>
                      <label>
                        X
                        <input
                          type="number"
                          min={-80}
                          max={80}
                          value={visual.x ?? 0}
                          onChange={(event) => patchElement({ x: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        Y
                        <input
                          type="number"
                          min={-80}
                          max={80}
                          value={visual.y ?? 0}
                          onChange={(event) => patchElement({ y: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                  );
                })}
              </section>
              <label className="character-extras__field">
                聊天界面 CSS
                <textarea
                  rows={10}
                  maxLength={40000}
                  spellCheck={false}
                  value={chromeAppearance.customCss}
                  onChange={(event) =>
                    setChromeAppearance({
                      ...chromeAppearance,
                      currentPresetId: null,
                      customCss: event.target.value,
                    })
                  }
                  placeholder={'[data-ui="chat-header"] {\n  border-bottom: 1px solid #eee;\n}'}
                />
              </label>
              <AppearancePresetManager
                type="chatChrome"
                value={chromeAppearance}
                onChange={setChromeAppearance}
                disabled={!librariesReady}
                onPersist={(next) => persistLibrary("chatChrome", next)}
                onReset={() =>
                  setChromeAppearance({
                    ...defaultAppearanceModule("chatChrome"),
                    presets: chromeAppearance.presets,
                  })
                }
              />
            </div>
          </details>
        </div>
      </details>
      <details className="character-extras__section">
        <summary>
          <Brain size={20} />
          <span>
            <strong>AI记忆</strong>
            <small>
              最近 {value.contextDepth} 条 · 长期记忆{value.longTermMemory ? "开启" : "关闭"}
            </small>
          </span>
          <ChevronRight size={17} />
        </summary>
        <div className="character-extras__body">
          <section className="character-extras__card">
            <h3>短期记忆</h3>
            <label className="character-extras__field">
              上下文深度
              <input
                type="number"
                min={1}
                max={200}
                step={1}
                value={value.contextDepth}
                onChange={(event) => update({ contextDepth: Number(event.target.value) })}
              />
            </label>
            <p className="character-extras__hint">
              默认 20 条；读取最近的消息（包含图片），保存后用于后续回复。
            </p>
          </section>
          <section className="character-extras__card">
            <h3>长期记忆</h3>
            <label className="character-extras__row">
              启用长期记忆
              <input
                type="checkbox"
                role="switch"
                checked={value.longTermMemory}
                onChange={(event) => update({ longTermMemory: event.target.checked })}
              />
            </label>
            <div className="character-extras__row">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const result = await summarize({ data: { char_id: charId } });
                    if (alive.current) {
                      setMemories(result.memories);
                      setNotice(`已新增 ${result.added} 条记忆。`);
                    }
                  })
                }
              >
                {busy ? "处理中…" : "立即总结"}
              </button>
              <button type="button" disabled={busy} onClick={openLibrary}>
                记忆库 <ChevronRight size={15} />
              </button>
            </div>
            <p className="character-extras__hint">
              总结最近 300 条聊天，使用当前已配置的模型。关闭后保留记忆，但不传给模型。
            </p>
          </section>
        </div>
      </details>
      <CharacterWorldBooks value={value} onChange={onChange} />
      {(error || wallpaperState.error) && (
        <p className="character-extras__error" role="alert">
          {error || wallpaperState.error}
        </p>
      )}
      {notice && (
        <p className="character-extras__notice" role="status">
          {notice}
        </p>
      )}
      <div data-memory-library={libraryOpen ? "open" : undefined}>
        <SystemSheet
          open={libraryOpen}
          title="记忆库"
          onClose={() => setLibraryOpen(false)}
          scrollable
        >
          <div className="character-memory-library">
            <div className="character-extras__row">
              <span>{memories.length} 条记忆</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDraft({ id: null, content: "" })}
              >
                <Plus size={16} />
                手动新增
              </button>
            </div>
            {error && (
              <p className="character-extras__error" role="alert">
                {error}
              </p>
            )}
            {busy && <p role="status">正在处理…</p>}
            {draft && (
              <section className="character-extras__card">
                <label className="character-extras__field">
                  {draft.id ? "编辑记忆" : "新增记忆"}
                  <textarea
                    rows={4}
                    maxLength={1000}
                    value={draft.content}
                    onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                  />
                </label>
                <div className="character-extras__row">
                  <button
                    type="button"
                    disabled={busy || !draft.content.trim()}
                    onClick={() =>
                      void action(async () => {
                        const saved = await saveMemory({
                          data: { char_id: charId, id: draft.id, content: draft.content },
                        });
                        if (alive.current) {
                          setMemories((rows) => [
                            saved,
                            ...rows.filter((row) => row.id !== saved.id),
                          ]);
                          setDraft(null);
                        }
                      })
                    }
                  >
                    保存
                  </button>
                  <button type="button" onClick={() => setDraft(null)}>
                    取消
                  </button>
                </div>
              </section>
            )}
            {!busy && memories.length === 0 && (
              <p className="character-extras__hint">还没有记忆，可以手动新增或立即总结。</p>
            )}
            {memories.map((entry) => (
              <article className="character-extras__card" key={entry.id}>
                <p className="character-memory-library__content">{entry.content}</p>
                <time dateTime={entry.updated_at}>
                  {new Date(entry.updated_at).toLocaleString()}
                </time>
                <div className="character-extras__row">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDraft({ id: entry.id, content: entry.content })}
                  >
                    <Pencil size={15} />
                    编辑
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    disabled={busy}
                    onClick={() => {
                      if (confirm("删除这条记忆？"))
                        void action(async () => {
                          await deleteMemory({ data: { char_id: charId, id: entry.id } });
                          if (alive.current) {
                            setMemories((rows) => rows.filter((row) => row.id !== entry.id));
                            if (draft?.id === entry.id) setDraft(null);
                          }
                        });
                    }}
                  >
                    <Trash2 size={15} />
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        </SystemSheet>
      </div>
    </div>
  );
}
