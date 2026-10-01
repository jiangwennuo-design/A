import type { CSSProperties } from "react";
import { z } from "zod";
import { FULL_CHAT_CSS_LIMIT, scopeFullChatCss } from "./full-chat-css";

export const APPEARANCE_SCHEMA_VERSION = 1 as const;
export const appearanceThemeTypeSchema = z.enum([
  "desktop",
  "chatChrome",
  "chatBubble",
  "chatFull",
]);
export type AppearanceThemeType = z.infer<typeof appearanceThemeTypeSchema>;

const appVisualSchema = z.object({
  iconUrl: z.string().max(800_000).default(""),
  size: z.number().min(36).max(96).default(58),
  x: z.number().min(-80).max(80).default(0),
  y: z.number().min(-80).max(80).default(0),
  scale: z.number().min(0.5).max(1.8).default(1),
  rotate: z.number().min(-180).max(180).default(0),
  opacity: z.number().min(0.1).max(1).default(1),
  radius: z.number().min(0).max(50).default(17),
  labelVisible: z.boolean().default(true),
  labelSize: z.number().min(9).max(20).default(12),
});

export const desktopAppearanceConfigSchema = z.object({
  iconSize: z.number().min(36).max(96).default(58),
  gridGap: z.number().min(6).max(48).default(18),
  gridColumns: z.number().int().min(3).max(5).default(4),
  dockSize: z.number().min(46).max(92).default(62),
  dockX: z.number().min(-80).max(80).default(0),
  dockY: z.number().min(-80).max(80).default(0),
  dockOpacity: z.number().min(0.15).max(1).default(0.84),
  showTime: z.boolean().default(true),
  showDate: z.boolean().default(true),
  showGreeting: z.boolean().default(true),
  showQuote: z.boolean().default(true),
  apps: z.record(z.string(), appVisualSchema.partial()).default({}),
});
export type DesktopAppearanceConfig = z.infer<typeof desktopAppearanceConfigSchema>;

export const chatChromeConfigSchema = z.object({
  headerHeight: z.number().min(54).max(120).default(76),
  headerBackground: z.string().max(80).default(""),
  headerOpacity: z.number().min(0.2).max(1).default(1),
  headerBlur: z.number().min(0).max(32).default(0),
  headerShadow: z.string().max(180).default(""),
  avatarSize: z.number().min(28).max(64).default(38),
  footerHeight: z.number().min(58).max(140).default(76),
  footerBackground: z.string().max(80).default(""),
  footerOpacity: z.number().min(0.2).max(1).default(1),
  footerBlur: z.number().min(0).max(32).default(18),
  inputRadius: z.number().min(0).max(40).default(22),
  inputBackground: z.string().max(80).default(""),
  inputColor: z.string().max(80).default(""),
  elements: z
    .record(
      z.string(),
      z
        .object({
          visible: z.boolean().default(true),
          x: z.number().min(-80).max(80).default(0),
          y: z.number().min(-80).max(80).default(0),
        })
        .partial(),
    )
    .default({}),
});
export type ChatChromeConfig = z.infer<typeof chatChromeConfigSchema>;

export const chatBubbleConfigSchema = z.object({
  userCss: z.string().max(12000).default(""),
  charCss: z.string().max(12000).default(""),
});
export type ChatBubbleConfig = z.infer<typeof chatBubbleConfigSchema>;
export const fullChatConfigSchema = z.object({});
export type FullChatConfig = z.infer<typeof fullChatConfigSchema>;

export interface AppearancePreset<C extends object> {
  id: string;
  schemaVersion: typeof APPEARANCE_SCHEMA_VERSION;
  themeType: AppearanceThemeType;
  name: string;
  config: C;
  customCss: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppearanceModule<C extends object> {
  currentPresetId: string | null;
  name: string;
  config: C;
  customCss: string;
  presets: AppearancePreset<C>[];
}

function id() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `theme-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function moduleSchema<C extends z.ZodTypeAny>(type: AppearanceThemeType, config: C) {
  const cssLimit = type === "chatFull" ? FULL_CHAT_CSS_LIMIT : 40_000;
  const preset = z.object({
    id: z.string().min(1),
    schemaVersion: z.literal(APPEARANCE_SCHEMA_VERSION),
    themeType: z.literal(type),
    name: z.string().trim().min(1).max(80),
    config,
    customCss: z.string().max(cssLimit).default(""),
    createdAt: z.string(),
    updatedAt: z.string(),
  });
  return z.object({
    currentPresetId: z.string().nullable().default(null),
    name: z.string().trim().max(80).default("当前配置"),
    config: config.default(() => config.parse({})),
    customCss: z.string().max(cssLimit).default(""),
    presets: z.array(preset).default([]),
  });
}

const desktopModuleSchema = moduleSchema("desktop", desktopAppearanceConfigSchema);
const chromeModuleSchema = moduleSchema("chatChrome", chatChromeConfigSchema);
const bubbleModuleSchema = moduleSchema("chatBubble", chatBubbleConfigSchema);
const fullModuleSchema = moduleSchema("chatFull", fullChatConfigSchema);

export function defaultAppearanceModule(type: "desktop"): AppearanceModule<DesktopAppearanceConfig>;
export function defaultAppearanceModule(type: "chatChrome"): AppearanceModule<ChatChromeConfig>;
export function defaultAppearanceModule(type: "chatBubble"): AppearanceModule<ChatBubbleConfig>;
export function defaultAppearanceModule(type: "chatFull"): AppearanceModule<FullChatConfig>;
export function defaultAppearanceModule(type: AppearanceThemeType): AppearanceModule<object> {
  if (type === "desktop") return readAppearanceModule("desktop", {});
  if (type === "chatChrome") return readAppearanceModule("chatChrome", {});
  if (type === "chatFull") return readAppearanceModule("chatFull", {});
  return readAppearanceModule("chatBubble", {});
}

export function readAppearanceModule(
  type: "desktop",
  value: unknown,
): AppearanceModule<DesktopAppearanceConfig>;
export function readAppearanceModule(
  type: "chatChrome",
  value: unknown,
): AppearanceModule<ChatChromeConfig>;
export function readAppearanceModule(
  type: "chatBubble",
  value: unknown,
): AppearanceModule<ChatBubbleConfig>;
export function readAppearanceModule(
  type: "chatFull",
  value: unknown,
): AppearanceModule<FullChatConfig>;
export function readAppearanceModule(
  type: AppearanceThemeType,
  value: unknown,
): AppearanceModule<Record<string, unknown>> {
  const schema =
    type === "desktop"
      ? desktopModuleSchema
      : type === "chatChrome"
        ? chromeModuleSchema
        : type === "chatFull"
          ? fullModuleSchema
          : bubbleModuleSchema;
  const result = schema.safeParse(value ?? {});
  return result.success ? result.data : schema.parse({});
}

function configSchema(type: AppearanceThemeType) {
  return type === "desktop"
    ? desktopAppearanceConfigSchema
    : type === "chatChrome"
      ? chatChromeConfigSchema
      : type === "chatFull"
        ? fullChatConfigSchema
        : chatBubbleConfigSchema;
}

export function saveAppearancePreset<C extends object>(
  state: AppearanceModule<C>,
  type: AppearanceThemeType,
  name: string,
): AppearanceModule<C> {
  const now = new Date().toISOString();
  const preset: AppearancePreset<C> = {
    id: id(),
    schemaVersion: APPEARANCE_SCHEMA_VERSION,
    themeType: type,
    name: name.trim() || "未命名预设",
    config: structuredClone(state.config),
    customCss: state.customCss,
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...state,
    currentPresetId: preset.id,
    name: preset.name,
    presets: [...state.presets, preset],
  };
}

export function applyAppearancePreset<C extends object>(
  state: AppearanceModule<C>,
  presetId: string,
) {
  const preset = state.presets.find((entry) => entry.id === presetId);
  return preset
    ? {
        ...state,
        currentPresetId: preset.id,
        name: preset.name,
        config: structuredClone(preset.config),
        customCss: preset.customCss,
      }
    : state;
}

export function renameAppearancePreset<C extends object>(
  state: AppearanceModule<C>,
  presetId: string,
  name: string,
) {
  const value = name.trim();
  if (!value) return state;
  return {
    ...state,
    name: state.currentPresetId === presetId ? value : state.name,
    presets: state.presets.map((preset) =>
      preset.id === presetId
        ? { ...preset, name: value, updatedAt: new Date().toISOString() }
        : preset,
    ),
  };
}

export function updateAppearancePreset<C extends object>(
  state: AppearanceModule<C>,
  presetId: string,
) {
  if (!state.presets.some((preset) => preset.id === presetId)) return state;
  return {
    ...state,
    currentPresetId: presetId,
    presets: state.presets.map((preset) =>
      preset.id === presetId
        ? {
            ...preset,
            config: structuredClone(state.config),
            customCss: state.customCss,
            updatedAt: new Date().toISOString(),
          }
        : preset,
    ),
  };
}

export function deleteAppearancePreset<C extends object>(
  state: AppearanceModule<C>,
  presetId: string,
) {
  return {
    ...state,
    currentPresetId: state.currentPresetId === presetId ? null : state.currentPresetId,
    presets: state.presets.filter((preset) => preset.id !== presetId),
  };
}

/** Persist library edits without applying an uncommitted visual draft. */
export function withAppearancePresetLibrary<C extends object>(
  current: AppearanceModule<C>,
  edited: AppearanceModule<C>,
): AppearanceModule<C> {
  const active = edited.presets.find((preset) => preset.id === current.currentPresetId);
  return {
    ...current,
    presets: edited.presets,
    currentPresetId: active ? current.currentPresetId : null,
    name: active?.name ?? current.name,
  };
}

export function exportAppearancePreset<C extends object>(
  state: AppearanceModule<C>,
  type: AppearanceThemeType,
  presetId?: string,
) {
  const preset = state.presets.find((entry) => entry.id === presetId);
  const now = new Date().toISOString();
  return JSON.stringify(
    {
      schemaVersion: APPEARANCE_SCHEMA_VERSION,
      themeType: type,
      name: preset?.name ?? (state.name || "当前配置"),
      config: preset?.config ?? state.config,
      customCss: preset?.customCss ?? state.customCss,
      createdAt: preset?.createdAt ?? now,
      updatedAt: preset?.updatedAt ?? now,
    },
    null,
    2,
  );
}

/** Import is deliberately non-destructive: it only returns a validated new preset. */
export function importAppearancePreset<C extends object>(
  text: string,
  expectedType: AppearanceThemeType,
): AppearancePreset<C> {
  const source = JSON.parse(text) as Record<string, unknown>;
  if (source["schemaVersion"] !== APPEARANCE_SCHEMA_VERSION) throw new Error("预设版本不兼容。");
  if (source["themeType"] !== expectedType) throw new Error("预设类型不匹配。");
  const config = configSchema(expectedType).parse(source["config"] ?? {}) as C;
  const customCss = z
    .string()
    .max(expectedType === "chatFull" ? FULL_CHAT_CSS_LIMIT : 40_000)
    .parse(source["customCss"] ?? source["css"] ?? "");
  validateAppearanceCss(customCss, expectedType);
  const now = new Date().toISOString();
  return {
    id: id(),
    schemaVersion: APPEARANCE_SCHEMA_VERSION,
    themeType: expectedType,
    name: z.string().trim().min(1).max(80).parse(source["name"]),
    config,
    customCss,
    createdAt: now,
    updatedAt: now,
  };
}

const DANGEROUS_CSS =
  /(?:@import|@namespace|javascript\s*:|expression\s*\(|behavior\s*:|-moz-binding|<\/?script|url\s*\()/i;
const HIDE_RECOVERY_UI =
  /(?:display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none)/i;

export function validateAppearanceCss(css: string, type: AppearanceThemeType) {
  if (type === "chatFull") {
    scopeFullChatCss(css, "validation");
    return;
  }
  if (!css.trim()) return;
  if (DANGEROUS_CSS.test(css)) throw new Error("CSS 包含不安全的脚本、外部资源或导入规则。");
  if (HIDE_RECOVERY_UI.test(css) && type !== "chatBubble")
    throw new Error("为避免无法恢复主题，高级 CSS 不允许隐藏系统入口。");
  if (
    /[{}][^{}]*[{}]/s.test(css.replace(/\/\*[\s\S]*?\*\//g, "")) &&
    /@(?:media|supports|keyframes)/i.test(css)
  )
    throw new Error("暂不支持嵌套或动画规则。");
}

/** Prefix every ordinary rule. The editor itself lives outside these roots. */
export function scopeAppearanceCss(css: string, type: AppearanceThemeType) {
  if (type === "chatFull") return scopeFullChatCss(css, "validation");
  validateAppearanceCss(css, type);
  if (!css.trim()) return "";
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const root =
    type === "desktop"
      ? '[data-ui="desktop"]'
      : type === "chatChrome"
        ? '[data-ui="chat-page"]'
        : '[data-ui="chat-messages"]';
  const rules: string[] = [];
  let consumed = "";
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of source.matchAll(pattern)) {
    consumed += match[0];
    const selectors = (match[1] ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (
      !selectors.length ||
      selectors.some((selector) => /(?:^|\s)(?:html|body|:root)(?:\s|$|[.#:[>+~])/i.test(selector))
    )
      throw new Error("CSS 选择器不能指向页面根节点。");
    if (
      type === "chatChrome" &&
      selectors.some((selector) => /message|bubble|chat-messages/i.test(selector))
    )
      throw new Error("聊天界面 CSS 不能修改消息或气泡。");
    if (
      type === "chatBubble" &&
      selectors.some((selector) =>
        /chat-(?:header|footer|input|send|add|settings|call)/i.test(selector),
      )
    )
      throw new Error("气泡 CSS 不能修改聊天顶栏或底栏。");
    const scoped = selectors
      .map((selector) => (selector.startsWith(root) ? selector : `${root} ${selector}`))
      .join(", ");
    rules.push(`${scoped}{${match[2]}}`);
  }
  if (source.replace(/\s/g, "") !== consumed.replace(/\s/g, ""))
    throw new Error("CSS 语法不完整。");
  return rules.join("\n");
}

export function safeScopedAppearanceCss(css: string, type: AppearanceThemeType) {
  try {
    return scopeAppearanceCss(css, type);
  } catch {
    return "";
  }
}

export function chatChromeVariables(config: ChatChromeConfig) {
  return {
    "--custom-chat-header-height": `${config.headerHeight}px`,
    "--custom-chat-header-bg": config.headerBackground || "",
    "--custom-chat-header-opacity": String(config.headerOpacity),
    "--custom-chat-header-blur": `${config.headerBlur}px`,
    "--custom-chat-header-shadow": config.headerShadow || "",
    "--custom-chat-avatar-size": `${config.avatarSize}px`,
    "--custom-chat-footer-height": `${config.footerHeight}px`,
    "--custom-chat-footer-bg": config.footerBackground || "",
    "--custom-chat-footer-opacity": String(config.footerOpacity),
    "--custom-chat-footer-blur": `${config.footerBlur}px`,
    "--custom-chat-input-radius": `${config.inputRadius}px`,
    "--custom-chat-input-bg": config.inputBackground || "",
    "--custom-chat-input-color": config.inputColor || "",
  } as CSSProperties;
}

const CHAT_CHROME_ELEMENT_SELECTORS: Record<string, string> = {
  back: "chat-back",
  avatar: "chat-header-avatar",
  title: "chat-title",
  call: "chat-call",
  settings: "chat-settings",
  add: "chat-add",
  input: "chat-input",
  reply: "chat-reply",
  send: "chat-send",
};

export function chatChromeElementCss(config: ChatChromeConfig) {
  return Object.entries(CHAT_CHROME_ELEMENT_SELECTORS)
    .map(([key, selector]) => {
      const visual = config.elements[key] ?? {};
      // The settings button is the recovery path and can never be hidden by structured settings.
      const display = key === "settings" || visual.visible !== false ? "" : "display:none;";
      const x = visual.x ?? 0;
      const y = visual.y ?? 0;
      return `[data-ui="chat-page"] [data-ui="${selector}"]{${display}translate:${x}px ${y}px;}`;
    })
    .join("\n");
}
