// Declaration-only allowlist: no selectors, URLs, imports, pseudo-elements,
// positioning, visibility, animations, custom properties, or interaction rules.
const properties = new Set([
  "color",
  "background",
  "background-color",
  "background-image",
  "background-size",
  "background-position",
  "background-repeat",
  "background-origin",
  "background-clip",
  "background-blend-mode",
  "border",
  "border-color",
  "border-width",
  "border-style",
  "border-radius",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "box-shadow",
  "text-shadow",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "padding-inline",
  "padding-block",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "margin-inline",
  "margin-block",
  "text-align",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-style",
  "text-decoration-thickness",
  "opacity",
  "clip-path",
  "-webkit-clip-path",
  "filter",
  "backdrop-filter",
  "-webkit-backdrop-filter",
  "transform",
]);

// Only visual transforms/filters, with bounded cost and displacement. Never allow
// arbitrary positioning, matrix/perspective tricks, or URL-backed SVG filters.
function visualFunctions(value: string): [string, string][] {
  const functions: [string, string][] = [];
  let source = value.trim();
  while (source) {
    const match = source.match(/^([a-z-]+)\(/i);
    if (!match) throw new Error("请使用支持的视觉函数。");
    let depth = 1,
      end = match[0].length;
    for (; end < source.length && depth; end++) {
      if (source[end] === "(") depth++;
      else if (source[end] === ")") depth--;
    }
    if (depth) throw new Error("CSS 函数括号不完整。");
    functions.push([match[1]!.toLowerCase(), source.slice(match[0].length, end - 1).trim()]);
    if (functions.length > 6) throw new Error("视觉函数最多组合 6 个，避免手机卡顿。");
    source = source.slice(end).trim();
  }
  return functions;
}

function lengthInPx(value: string): number {
  const match = value.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|em)?$/i);
  if (!match || (!match[2] && +match[1]! !== 0)) return NaN;
  return +match[1]! * (/^(?:rem|em)$/i.test(match[2] ?? "") ? 16 : 1);
}

function validateVisualFunction(property: string, value: string) {
  if (/^(?:none|initial|inherit|unset|revert)$/i.test(value)) return;
  let translation = 0,
    angle = 0,
    scaleX = 1,
    scaleY = 1,
    blur = 0,
    opacity = 1;
  for (const [name, args] of visualFunctions(value)) {
    let safe = false;
    if (property === "transform") {
      const parts = args.split(/[,\s]+/);
      if (/^translate(?:x|y)?$/.test(name)) {
        safe =
          parts.length <= (name === "translate" ? 2 : 1) &&
          parts.every((part) => Math.abs(lengthInPx(part)) <= 24);
        translation += parts.reduce((sum, part) => sum + Math.abs(lengthInPx(part)), 0);
      } else if (/^scale(?:x|y)?$/.test(name)) {
        safe =
          parts.length <= (name === "scale" ? 2 : 1) &&
          parts.every(
            (part) => /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(part) && +part >= 0.5 && +part <= 1.2,
          );
        if (name !== "scaley") scaleX *= Number(parts[0]);
        if (name !== "scalex") scaleY *= Number(parts[1] ?? parts[0]);
      } else if (/^(?:rotate|skewx|skewy)$/.test(name)) {
        safe = /^-?(?:\d+(?:\.\d+)?|\.\d+)deg$/.test(args) && Math.abs(parseFloat(args)) <= 15;
        angle += Math.abs(parseFloat(args));
      }
    } else if (name === "blur") {
      safe = lengthInPx(args) >= 0 && lengthInPx(args) <= 12;
      blur += lengthInPx(args);
    } else if (name === "drop-shadow") {
      const lengths = args.match(/-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)/gi) ?? [];
      safe = lengths.length <= 3 && lengths.every((part) => Math.abs(lengthInPx(part)) <= 24);
    } else if (name === "hue-rotate")
      safe = /^-?(?:\d+(?:\.\d+)?|\.\d+)deg$/.test(args) && Math.abs(parseFloat(args)) <= 360;
    else if (/^(?:brightness|contrast|saturate|grayscale|invert|sepia|opacity)$/.test(name)) {
      const amount = parseFloat(args) / (args.endsWith("%") ? 100 : 1);
      safe =
        /^(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(args) &&
        amount >= (name === "opacity" ? 0.1 : 0) &&
        amount <= (/^(?:brightness|contrast|saturate)$/.test(name) ? 3 : 1);
      if (name === "opacity") opacity *= amount;
    }
    if (!safe) throw new Error(`${property} 的 ${name} 值超出安全范围或不受支持。`);
  }
  if (
    translation > 32 ||
    angle > 15 ||
    scaleX < 0.5 ||
    scaleY < 0.5 ||
    scaleX > 1.2 ||
    scaleY > 1.2 ||
    blur > 12 ||
    opacity < 0.1
  )
    throw new Error("组合后的位移、缩放、模糊或透明度超出气泡安全范围。");
}

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
        !/^[a-z\d#(),.%+\-\s/'"]+$/i.test(value) ||
        /url|var\(|env\(|expression|image-set|element\(/i.test(value) ||
        (!/clip-path$|^background/.test(property) && /(?:calc|min|max|clamp)\(/i.test(value))
      )
        throw new Error(`${property} 含有不安全或不支持的值。`);
      if (/\d(?:vh|vw|vmin|vmax|dvh|svh|lvh|cm|mm|in|pt|pc|ch|ex)/i.test(value))
        throw new Error("不支持视口或物理尺寸单位，请使用 px、em、rem 或百分比。");
      if (/shadow$/.test(property) && /\d%/.test(value)) throw new Error("阴影不支持百分比尺寸。");
      if (property === "font-weight" && !/^(?:normal|bold|bolder|lighter|[1-9]00)$/i.test(value))
        throw new Error("字重支持 100–900、normal、bold、bolder 或 lighter。");
      if (property === "color" && /transparent|rgba\([^)]*,\s*0\s*\)|\/\s*0\s*\)/i.test(value))
        throw new Error("正文颜色不能完全透明。");
      if (
        property === "font-size" &&
        (lengthInPx(value) < 12 || lengthInPx(value) > 40 || !Number.isFinite(lengthInPx(value)))
      )
        throw new Error("字体大小需在 12–40px 之间，支持 px、em 或 rem。");
      if (
        property === "line-height" &&
        !(
          value === "normal" ||
          (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) && +value >= 1 && +value <= 3) ||
          (lengthInPx(value) >= 12 && lengthInPx(value) <= 80) ||
          (/^\d+(?:\.\d+)?%$/.test(value) && parseFloat(value) >= 100 && parseFloat(value) <= 300)
        )
      )
        throw new Error("行距支持 normal、1–3 倍或受限的长度/百分比。");
      if (
        /^(padding|margin)/.test(property) &&
        (value.split(/\s+/).length > 4 ||
          value
            .split(/\s+/)
            .some(
              (item) =>
                item !== "auto" &&
                (!Number.isFinite(lengthInPx(item)) ||
                  lengthInPx(item) > 40 ||
                  lengthInPx(item) < (property.startsWith("margin") ? -12 : 0)),
            ) ||
          (property.startsWith("padding") && value.includes("auto")))
      )
        throw new Error("内边距支持 0–40px，外边距支持 -12–40px 或 auto，支持 px/em/rem。");
      if (
        property.endsWith("radius") &&
        (value.split(/[\s/]+/).filter(Boolean).length > 8 ||
          value
            .split(/[\s/]+/)
            .filter(Boolean)
            .some((part) =>
              /^\d+(?:\.\d+)?%$/.test(part)
                ? parseFloat(part) > 100
                : !Number.isFinite(lengthInPx(part)) ||
                  lengthInPx(part) < 0 ||
                  lengthInPx(part) > 10000,
            ))
      )
        throw new Error("圆角支持非负长度、百分比和椭圆圆角。");
      if (
        !/radius$|clip-path$|^line-height$|^background/.test(property) &&
        (value.match(/-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em)/gi) ?? []).some(
          (item) => Math.abs(lengthInPx(item)) > 40,
        )
      )
        throw new Error("边框、阴影或间距的尺寸不能超过 40px。");
      if (
        property === "letter-spacing" &&
        !(
          value === "normal" ||
          (Number.isFinite(lengthInPx(value)) && Math.abs(lengthInPx(value)) <= 3)
        )
      )
        throw new Error("字间距需在 -3–3px 之间。");
      if (
        property === "opacity" &&
        (!/^(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(value) ||
          parseFloat(value) / (value.endsWith("%") ? 100 : 1) < 0.1 ||
          parseFloat(value) / (value.endsWith("%") ? 100 : 1) > 1)
      )
        throw new Error("气泡透明度需在 0.1–1（10%–100%）之间。");
      if (
        property.endsWith("clip-path") &&
        !/^(?:none|(?:polygon|inset|circle|ellipse|rect|xywh|path)\([\s\S]+\)(?:\s+(?:border|padding|content|margin)-box)?)$/i.test(
          value,
        )
      )
        throw new Error("clip-path 支持基本形状或 path，不支持外部资源。");
      if (property === "transform" || property.endsWith("filter"))
        validateVisualFunction(property, value);
      return `${property}:${value};`;
    })
    .join("");
}

export function bubbleStyles(
  scope: string,
  userCss: string,
  charCss: string,
  preview = false,
): string {
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
      // Saved styles must never reach the editor's nested live preview.
      const container = preview ? "" : ">.chat-message-list ";
      const selector = `[data-chat-scope="${scope}"] ${container}.chat-message-row.is-${side} .message-content-wrapper>.message-bubble`;
      const fontSize = declarations.match(/(?:^|;)font-size:([^;]+);/)?.[1];
      return `${selector}{${declarations}}${fontSize ? `${selector}>p{font-size:${fontSize};}` : ""}`;
    })
    .join("\n");
}
