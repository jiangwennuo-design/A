/** Browser CSSOM keeps CSS as CSS, rather than reducing it to theme properties. */
export const FULL_CHAT_CSS_LIMIT = 256_000;
export const fullChatCssAccept =
  ".css,.docx,text/css,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function decodedCss(css: string) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\\([\da-f]{1,6})\s?|\\([^\n\r\f])/gi, (_, hex: string, char: string) =>
      hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)) : char,
    );
}

function validate(css: string) {
  if (css.length > FULL_CHAT_CSS_LIMIT) throw new Error("完整 CSS 不能超过 256,000 字符。");
  const decoded = decodedCss(css);
  if (
    /(?:<\/?(?:script|style)|javascript\s*:|vbscript\s*:|expression\s*\(|(?:^|[;{])\s*(?:behavior|-moz-binding)\s*:|@(?:import|namespace|document|page|property)\b)/i.test(
      decoded,
    )
  )
    throw new Error("不支持脚本、外部 CSS 导入或全局文档规则。");
  for (const match of decoded.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
    const url = (match[2] ?? "").trim();
    if (
      /^data:/i.test(url) &&
      !/^data:(?:image\/|font\/|application\/(?:font-|x-font-|vnd\.ms-fontobject|octet-stream))/i.test(
        url,
      )
    )
      throw new Error("CSS Data URL 仅允许图片或字体。");
    if (/^[a-z][\w+.-]*:/i.test(url) && !/^(?:https?:|data:|blob:)/i.test(url))
      throw new Error("CSS 资源地址仅允许 HTTP(S)、图片或字体数据及 Blob。");
  }
}

/** Split only top-level selector commas, keeping :has(), :is() and quoted attributes intact. */
function selectors(text: string) {
  let quote = "",
    level = 0,
    start = 0;
  const result: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "\\") {
      i++;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "(" || char === "[") level++;
    else if (char === ")" || char === "]") level--;
    else if (char === "," && level === 0) {
      result.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  result.push(text.slice(start).trim());
  return result.filter(Boolean);
}

export function scopeFullChatCss(css: string, scope: string): string {
  validate(css);
  if (!css.trim()) return "";
  if (!/^[\w-]{1,100}$/.test(scope)) throw new Error("聊天 CSS 作用域无效。");
  // SSR never evaluates user CSS; the same stylesheet is compiled after hydration.
  if (typeof document === "undefined") return "";
  // Declare our layers before the system's layers. Important layer order is reversed;
  // explicit user !important remains stronger than the promoted normal override layer.
  if (!document.head.querySelector("[data-full-chat-cascade]")) {
    const cascade = document.createElement("style");
    cascade.dataset["fullChatCascade"] = "";
    cascade.textContent = "@layer kdeji-full-important, kdeji-full-normal;";
    document.head.prepend(cascade);
  }
  const root = `[data-full-chat-root="${scope}"]`;
  const priority = root.repeat(8);
  const style = document.createElement("style");
  style.media = "not all";
  document.head.append(style);
  try {
    style.textContent = css;
    const rules = Array.from(style.sheet?.cssRules ?? []);
    if (!rules.length) throw new Error("没有可识别的 CSS 规则，请检查语法。");
    const names = new Map<string, string>();
    const fonts = new Map<string, string>();
    const animatedProperties = new Set<string>();
    const collect = (rules: CSSRule[]) => {
      for (const rule of rules) {
        if (rule.type === CSSRule.KEYFRAMES_RULE) {
          const name = (rule as CSSKeyframesRule).name;
          names.set(name, `kdeji-${scope}-${name}`);
          for (const frame of Array.from((rule as CSSKeyframesRule).cssRules))
            for (const property of Array.from((frame as CSSKeyframeRule).style))
              animatedProperties.add(property);
        } else if (rule.type === CSSRule.FONT_FACE_RULE) {
          const name = (rule as CSSFontFaceRule).style
            .getPropertyValue("font-family")
            .replace(/^["']|["']$/g, "");
          fonts.set(name, `kdeji-${scope}-${name}`);
        } else if ("cssRules" in rule) collect(Array.from((rule as CSSGroupingRule).cssRules));
      }
    };
    collect(rules);
    const replaceNames = (value: string, map: Map<string, string>) => {
      for (const [from, to] of map) {
        const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        value = value.replace(
          new RegExp(
            `(^|[^\\p{L}\\p{N}_-])${escaped}(?=$|[^\\p{L}\\p{N}_-])`,
            map === fonts ? "giu" : "gu",
          ),
          (_, prefix) => `${prefix}${to}`,
        );
      }
      return value;
    };
    const declarations = (
      style: CSSStyleDeclaration,
      important = true,
      fontFace = false,
      partition?: boolean,
      animated?: boolean,
    ) =>
      Array.from(style)
        .filter(
          (property) =>
            (partition === undefined ||
              Boolean(style.getPropertyPriority(property)) === partition) &&
            (animated === undefined || animatedProperties.has(property) === animated),
        )
        .map((property) => {
          let value = style.getPropertyValue(property);
          if (/^(?:animation|animation-name)$/.test(property) || property.startsWith("--"))
            value = replaceNames(value, names);
          if (fontFace && property === "font-family")
            value = `"${fonts.get(value.replace(/^["']|["']$/g, "")) ?? value}"`;
          else if (/^(?:font|font-family)$/.test(property) || property.startsWith("--"))
            value = replaceNames(value, fonts);
          return `${property}:${value}${important || style.getPropertyPriority(property) ? "!important" : ""};`;
        })
        .join("");
    const normalize = (selector: string) =>
      selector
        // These are K得机's own API aliases, not a third-party selector translation table.
        .replace(
          /\[data-ui\s*=\s*(["'])([\w-]+)\1\]/g,
          (_, quote, name) =>
            `:is([data-ui=${quote}${name}${quote}],[data-css-ui~=${quote}${name}${quote}])`,
        )
        .replace(/(^|[\s>+~,(])(?:html|body|:root)(?=$|[\s>+~.#[:),])/g, `$1${root}`)
        .replace(
          new RegExp(
            `${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+${root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
            "g",
          ),
          root,
        );
    const emit = (rules: CSSRule[], parent?: string): string =>
      rules
        .map((rule) => {
          // Modern nesting represents declarations inside @media/@supports as a
          // CSSNestedDeclarations rule. Reuse the parent's selector, not a global rule.
          if (
            parent &&
            "style" in rule &&
            !("selectorText" in rule) &&
            rule.type !== CSSRule.FONT_FACE_RULE
          ) {
            return emit(
              [
                {
                  type: CSSRule.STYLE_RULE,
                  selectorText: "&",
                  style: rule.style,
                  cssRules: [],
                } as unknown as CSSRule,
              ],
              parent,
            );
          }
          if (rule.type === CSSRule.STYLE_RULE) {
            const current = rule as CSSStyleRule;
            const selection = selectors(current.selectorText)
              .map((selector) => {
                const nested = parent
                  ? selector.includes("&")
                    ? selector.replaceAll("&", `:is(${parent})`)
                    : `:is(${parent}) ${selector}`
                  : selector;
                return normalize(nested);
              })
              .join(",");
            // Subject stays inside this chat even for sibling/ancestor combinators.
            const scoped = selectors(selection)
              .map((selector) => {
                // Pseudo-elements are not permitted *inside* :is(); keep them on its subject.
                const pseudo =
                  selector.match(
                    /(::[\w-]+(?:\([^)]*\))?|:(?:before|after|first-letter|first-line))$/,
                  )?.[0] ?? "";
                const subject = pseudo ? selector.slice(0, -pseudo.length) : selector;
                return `${priority}:is(${subject})${pseudo},${priority} :is(${subject})${pseudo}`;
              })
              .join(",");
            // CSS animations cannot override important declarations. Keep properties
            // driven by this sheet's keyframes in a high-specificity normal rule;
            // explicit user !important still retains its standard locking behavior.
            const normal = declarations(current.style, true, false, false, false);
            const animated = declarations(current.style, false, false, false, true);
            const important = declarations(current.style, true, false, true);
            return `${normal ? `@layer kdeji-full-normal{${scoped}{${normal}}}` : ""}${animated ? `${scoped}{${animated}}` : ""}${important ? `@layer kdeji-full-important{${scoped}{${important}}}` : ""}${current.cssRules?.length ? emit(Array.from(current.cssRules), selection) : ""}`;
          }
          if (rule.type === CSSRule.KEYFRAMES_RULE) {
            const animation = rule as CSSKeyframesRule;
            return `@keyframes ${names.get(animation.name)}{${Array.from(animation.cssRules)
              .map((rule) => {
                const frame = rule as CSSKeyframeRule;
                return `${frame.keyText}{${declarations(frame.style, false)}}`;
              })
              .join("")}}`;
          }
          if (rule.type === CSSRule.FONT_FACE_RULE)
            return `@font-face{${declarations((rule as CSSFontFaceRule).style, false, true)}}`;
          if ("cssRules" in rule) {
            const header = rule.cssText.slice(0, rule.cssText.indexOf("{"));
            if (!/^@(?:media|supports|container|layer)\b/i.test(header))
              throw new Error("该全局 CSS 规则无法安全隔离。");
            // Anonymous layers cannot collide with other apps' layer names.
            const safeHeader = /^@layer\b/i.test(header) ? "@layer" : header;
            return `${safeHeader}{${emit(Array.from((rule as CSSGroupingRule).cssRules), parent)}}`;
          }
          throw new Error("该 CSS 规则无法安全隔离。");
        })
        .join("\n");
    // Remove the default fixed flex basis only while full CSS is active, so custom
    // avatar width works without changing the default 30px layout or old themes.
    return `${root} [data-ui="message-avatar"]{flex-basis:auto;}\n${emit(rules)}`;
  } finally {
    style.remove();
  }
}

export function safeFullChatCss(css: string, scope: string) {
  try {
    return scopeFullChatCss(css, scope);
  } catch {
    return "";
  }
}

export async function importFullChatCss(file: File) {
  if (!file.size || file.size > 10 * 1024 * 1024)
    throw new Error("请选择非空且不超过 10 MB 的 CSS / DOCX 文件。");
  let text: string;
  if (/\.css$/i.test(file.name)) text = await file.text();
  else if (/\.docx$/i.test(file.name)) {
    const { extractDocxText } = await import("./stickers/extract-text");
    text = await extractDocxText(file, true);
  } else throw new Error("请选择 .css 或 .docx 文件。");
  text = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  scopeFullChatCss(text, "import-validation");
  return text;
}
