/** Reject transport errors before TanStack attempts to deserialize a success. */
export const chatReplyFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(
      response.status === 413
        ? "聊天请求过大（413），本轮未生成回复。"
        : `聊天请求失败（HTTP ${response.status}），请重试。`,
    );
  }
  return response;
};

/** Missing/malformed success data must never reach message or transfer parsing. */
export function validateChatReplyResult<T>(result: T): T {
  if (!result || typeof result !== "object") throw new Error("没有收到聊天回复，请重试。");
  const data = result as {
    messages?: unknown;
    transfer_updates?: unknown;
    transfer_errors?: unknown;
  };
  if (
    !Array.isArray(data.messages) ||
    !data.messages.length ||
    (data.transfer_updates !== undefined && !Array.isArray(data.transfer_updates)) ||
    (data.transfer_errors !== undefined && !Array.isArray(data.transfer_errors))
  )
    throw new Error("聊天回复格式不正确，请重试。");
  return result;
}
