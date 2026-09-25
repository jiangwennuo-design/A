/** Provider-neutral chat content. Each message owns its own ordered parts. */
export type AiContentPart =
  { type: "text"; text: string } | { type: "image"; url: string; detail?: "auto" | "low" | "high" };

export type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string | AiContentPart[];
};

export const IMAGE_UNAVAILABLE =
  "这条消息包含一张图片，但当前模型无法读取该图片。请坦诚告知用户无法看见图片，不要猜测图片内容。";

export function hasImages(messages: AiMessage[]) {
  return messages.some(
    (message) =>
      Array.isArray(message.content) && message.content.some((part) => part.type === "image"),
  );
}

/** Preserve message boundaries and part order when vision is explicitly unsupported. */
export function withoutImages(messages: AiMessage[]): AiMessage[] {
  return messages.map((message) => ({
    ...message,
    content: Array.isArray(message.content)
      ? message.content.map((part) =>
          part.type === "image" ? { type: "text" as const, text: IMAGE_UNAVAILABLE } : part,
        )
      : message.content,
  }));
}

/** Existing provider configuration uses OpenAI-compatible chat completions. */
export function toOpenAiCompatibleMessages(messages: AiMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: Array.isArray(message.content)
      ? message.content.map((part) =>
          part.type === "image"
            ? {
                type: "image_url" as const,
                image_url: { url: part.url, detail: part.detail ?? "auto" },
              }
            : { type: "text" as const, text: part.text },
        )
      : message.content,
  }));
}

/** Only an explicit provider rejection of image/vision input permits text-only downgrade. */
export function explicitlyRejectsImages(status: number, body: string) {
  if (status !== 400 && status !== 415 && status !== 422) return false;
  const detail = body.toLowerCase();
  return (
    /image|vision|multimodal|image_url|图片|视觉|多模态/.test(detail) &&
    /not supported|unsupported|does not support|cannot accept|only text|text.only|not available|不支持|仅支持文本|无法处理/.test(
      detail,
    )
  );
}
