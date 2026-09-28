// Declaration-only allowlist: no selectors, URLs, imports, pseudo-elements,
// positioning, visibility, animations, custom properties, or interaction rules.
const properties = new Set([
  "color",
  "background",
  "background-color",
  "border",
  "border-color",
  "border-width",
  "border-style",
  "border-radius",
  "box-shadow",
  "text-shadow",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "text-align",
]);

export function safeBubbleDeclarations(input: string): string {
  if (input.length > 4000) throw new Error("气泡 CSS 不能超过 4000 字。");
  let source = input.replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (!source) return "";
  const wrapped = source.match(/^(?:&|:scope|\.message-bubble|\.user|\.char)\s*\{([^{}]*)\}$/);
  if (wrapped) source = wrapped[1]!;
  if (/[{}@\\<>]/.test(source)) throw new Error("只允许气泡样式属性，不能写全局选择器或 @ 规则。");
  return source
    .split(";")
    .filter((part) => part.trim())
    .map((part) => {
      const index = part.indexOf(":");
      const property = part.slice(0, index).trim().toLowerCase();
      const value = part.slice(index + 1).trim();
      if (index < 0 || !properties.has(property))
        throw new Error(`不支持气泡属性：${property || part}。`);
      if (
        !value ||
        !/^[a-z\d#(),.%+\-\s/]+$/i.test(value) ||
        /url|var\(|env\(|expression|image-set|element\(/i.test(value)
      )
        throw new Error(`${property} 含有不安全或不支持的值。`);
      if (/\d(?:em|rem|vh|vw|vmin|vmax|dvh|svh|lvh|cm|mm|in|pt|pc|ch|ex)/i.test(value))
        throw new Error("尺寸仅支持受限的 px 数值。");
      if (/shadow$/.test(property) && /\d%/.test(value)) throw new Error("阴影不支持百分比尺寸。");
      if (property === "font-weight" && !/^(?:normal|bold|[3-8]00)$/.test(value))
        throw new Error("字重仅支持 300–800、normal 或 bold。");
      if (property === "color" && /transparent|rgba\([^)]*,\s*0\s*\)|\/\s*0\s*\)/i.test(value))
        throw new Error("正文颜色不能完全透明。");
      if (
        property === "font-size" &&
        (!/^\d+(?:\.\d+)?px$/.test(value) || parseFloat(value) < 12 || parseFloat(value) > 28)
      )
        throw new Error("字体大小需在 12–28px 之间。");
      if (
        property === "line-height" &&
        (!/^\d+(?:\.\d+)?$/.test(value) || +value < 1.2 || +value > 2.4)
      )
        throw new Error("行距需在 1.2–2.4 之间。");
      if (
        /^(padding|border-radius)/.test(property) &&
        (!/^\d+(?:\.\d+)?(?:px)?(?:\s+\d+(?:\.\d+)?(?:px)?){0,3}$/.test(value) ||
          value
            .split(/\s+/)
            .some((item) => parseFloat(item) > (property === "border-radius" ? 40 : 24)))
      )
        throw new Error("内边距最大 24px，圆角最大 40px；仅支持 px 数值。");
      if ((value.match(/-?\d+(?:\.\d+)?px/g) ?? []).some((item) => Math.abs(parseFloat(item)) > 40))
        throw new Error("边框、阴影或间距的尺寸不能超过 40px。");
      if (
        property === "letter-spacing" &&
        (!/^-?\d+(?:\.\d+)?px$/.test(value) || Math.abs(parseFloat(value)) > 3)
      )
        throw new Error("字间距需在 -3–3px 之间。");
      return `${property}:${value};`;
    })
    .join("");
}

export function bubbleStyles(scope: string, userCss: string, charCss: string): string {
  if (!/^[a-z\d-]{1,80}$/i.test(scope)) return "";
  return (
    [
      ["user", userCss],
      ["char", charCss],
    ] as const
  )
    .map(([side, css]) => {
      let declarations: string;
      try {
        declarations = safeBubbleDeclarations(css);
      } catch {
        return "";
      }
      if (!declarations) return "";
      const selector = `[data-chat-scope="${scope}"] .chat-message-row.is-${side} .message-content-wrapper>.message-bubble`;
      const fontSize = declarations.match(/(?:^|;)font-size:([^;]+);/)?.[1];
      return `${selector}{${declarations}}${fontSize ? `${selector}>p{font-size:${fontSize};}` : ""}`;
    })
    .join("\n");
}
