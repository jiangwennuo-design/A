/**
 * Server-only unified AI service.
 *
 * Every AI feature (private chat, diary replies, re-roll, ...) must go through
 * testConnection / listModels / generate here instead of calling third-party
 * APIs directly. Base-URL normalization, API-key decryption, header building,
 * timeouts, error classification and safe logging all live in this one file.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { decryptApiKey } from "./crypto.server";

export type AiErrorKind =
  | "invalid_base_url"
  | "network"
  | "timeout"
  | "auth"
  | "forbidden"
  | "model_not_found"
  | "rate_limit"
  | "client_error"
  | "server_error"
  | "bad_response"
  | "not_configured"
  | "unknown";

export interface AiFailure {
  ok: false;
  kind: AiErrorKind;
  message: string;
}

export interface AiResolvedConfig {
  source: "user" | "builtin";
  configId: string | null;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number | null;
  maxTokens: number | null;
  customHeaders: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 45_000;
const TEST_TIMEOUT_MS = 20_000;

/** Normalize a user-entered base URL into a clean `https://host/path` prefix. */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) throw new AiServiceError("invalid_base_url", "请填写 API Base URL。");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new AiServiceError("invalid_base_url", "API Base URL 格式不正确，例如：https://api.openai.com/v1");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AiServiceError("invalid_base_url", "API Base URL 必须以 http:// 或 https:// 开头。");
  }
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}`;
}

/** Join the normalized base URL with an endpoint path, never producing `//` or `/v1/v1`. */
export function buildEndpoint(baseUrl: string, endpoint: "chat/completions" | "models"): string {
  const base = normalizeBaseUrl(baseUrl);
  if (base.endsWith(`/${endpoint}`)) return base;
  return `${base}/${endpoint}`;
}

export class AiServiceError extends Error {
  kind: AiErrorKind;
  constructor(kind: AiErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

function sanitizeCustomHeaders(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim();
    if (!name) continue;
    // Never let a stored header override auth or hijack the request body type.
    if (/^(authorization|host|content-length)$/i.test(name)) continue;
    if (typeof value === "string" || typeof value === "number") out[name] = String(value);
  }
  return out;
}

function buildHeaders(config: { apiKey: string; customHeaders: Record<string, string> }): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...sanitizeCustomHeaders(config.customHeaders),
    Authorization: `Bearer ${config.apiKey}`,
  };
}

/** Log without ever printing keys, tokens or auth headers. */
function safeLog(scope: string, detail: string) {
  console.error(`[ai-service] ${scope}: ${detail}`);
}

function classifyHttpStatus(status: number, bodySnippet: string): AiServiceError {
  const lowered = bodySnippet.toLowerCase();
  if (status === 401) return new AiServiceError("auth", "API Key 无效或已过期（401）。");
  if (status === 403) return new AiServiceError("forbidden", "权限不足，该 Key 无法访问此接口（403）。");
  if (status === 404) {
    if (lowered.includes("model")) return new AiServiceError("model_not_found", "模型不存在或该 Key 无权使用（404）。");
    return new AiServiceError("client_error", "接口地址不存在（404），请检查 Base URL。");
  }
  if (status === 429) return new AiServiceError("rate_limit", "请求过于频繁或额度已用尽（429），请稍后再试。");
  if (status >= 500) return new AiServiceError("server_error", `服务商暂时不可用（${status}），请稍后再试。`);
  if (status === 400 && (lowered.includes("temperature") || lowered.includes("max_tokens"))) {
    return new AiServiceError("client_error", "服务商拒绝了 Temperature 或 Max Tokens 参数，请调整后重试（400）。");
  }
  if (status >= 400) return new AiServiceError("client_error", `请求被服务商拒绝（${status}）。`);
  return new AiServiceError("unknown", `未知错误（${status}）。`);
}

async function aiFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiServiceError("timeout", "请求超时，服务商没有在规定时间内响应。");
    }
    safeLog("fetch", error instanceof Error ? error.name : "unknown error");
    throw new AiServiceError("network", "无法连接到该地址，请检查 Base URL 或网络是否可达。");
  } finally {
    clearTimeout(timer);
  }
}

async function readSnippet(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return "";
  }
}

export interface AiCredentials {
  baseUrl: string;
  apiKey: string;
  model?: string | null;
  customHeaders?: Record<string, string>;
  temperature?: number | null;
  maxTokens?: number | null;
}

export interface TestConnectionResult {
  ok: boolean;
  kind: AiErrorKind | "ok";
  message: string;
}

/** Probe a channel with a minimal chat completion (falls back to /models). */
export async function testConnection(creds: AiCredentials): Promise<TestConnectionResult> {
  try {
    if (!creds.apiKey) throw new AiServiceError("auth", "请填写 API Key。");
    const model = (creds.model ?? "").trim();

    if (model) {
      const response = await aiFetch(
        buildEndpoint(creds.baseUrl, "chat/completions"),
        {
          method: "POST",
          headers: buildHeaders({ apiKey: creds.apiKey, customHeaders: creds.customHeaders ?? {} }),
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 8,
          }),
        },
        TEST_TIMEOUT_MS,
      );
      if (!response.ok) throw classifyHttpStatus(response.status, await readSnippet(response));
      const data = (await response.json().catch(() => null)) as { choices?: unknown } | null;
      if (!data || !Array.isArray(data.choices)) {
        throw new AiServiceError("bad_response", "服务商返回的数据格式无法识别。");
      }
      return { ok: true, kind: "ok", message: "连接成功" };
    }

    // No model yet — verify credentials against the models endpoint.
    const response = await aiFetch(
      buildEndpoint(creds.baseUrl, "models"),
      {
        method: "GET",
        headers: buildHeaders({ apiKey: creds.apiKey, customHeaders: creds.customHeaders ?? {} }),
      },
      TEST_TIMEOUT_MS,
    );
    if (!response.ok) throw classifyHttpStatus(response.status, await readSnippet(response));
    return { ok: true, kind: "ok", message: "连接成功" };
  } catch (error) {
    if (error instanceof AiServiceError) return { ok: false, kind: error.kind, message: error.message };
    safeLog("testConnection", error instanceof Error ? error.name : "unknown error");
    return { ok: false, kind: "unknown", message: "连接测试失败，请稍后再试。" };
  }
}

export interface ListModelsResult {
  ok: boolean;
  models: string[];
  message: string;
}

/** Fetch and normalize the channel's model list; failure never invalidates a config. */
export async function listModels(creds: AiCredentials): Promise<ListModelsResult> {
  try {
    if (!creds.apiKey) throw new AiServiceError("auth", "请填写 API Key。");
    const response = await aiFetch(
      buildEndpoint(creds.baseUrl, "models"),
      {
        method: "GET",
        headers: buildHeaders({ apiKey: creds.apiKey, customHeaders: creds.customHeaders ?? {} }),
      },
      TEST_TIMEOUT_MS,
    );
    if (!response.ok) throw classifyHttpStatus(response.status, await readSnippet(response));

    const payload = (await response.json().catch(() => null)) as
      | { data?: unknown; models?: unknown }
      | unknown[]
      | null;
    const rawList = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { data?: unknown })?.data)
        ? ((payload as { data: unknown[] }).data)
        : Array.isArray((payload as { models?: unknown })?.models)
          ? ((payload as { models: unknown[] }).models)
          : null;

    if (!rawList) {
      return { ok: false, models: [], message: "无法自动获取模型列表，请手动填写模型名称。" };
    }

    const ids = Array.from(
      new Set(
        rawList
          .map((item) =>
            typeof item === "string"
              ? item
              : typeof (item as { id?: unknown })?.id === "string"
                ? ((item as { id: string }).id)
                : typeof (item as { name?: unknown })?.name === "string"
                  ? ((item as { name: string }).name)
                  : "",
          )
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));

    if (ids.length === 0) {
      return { ok: false, models: [], message: "该渠道未返回任何模型，请手动填写模型名称。" };
    }
    return { ok: true, models: ids, message: `已获取 ${ids.length} 个模型` };
  } catch (error) {
    const message =
      error instanceof AiServiceError
        ? `${error.message}（可手动填写模型名称）`
        : "无法自动获取模型列表，请手动填写模型名称。";
    if (!(error instanceof AiServiceError)) {
      safeLog("listModels", error instanceof Error ? error.name : "unknown error");
    }
    return { ok: false, models: [], message };
  }
}

/**
 * Resolve which channel to use for a user: their enabled default config first,
 * then any other enabled config, and finally the built-in Lovable AI gateway
 * (or AI_API_KEY) so existing chat keeps working without user configuration.
 */
export async function resolveConfigForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AiResolvedConfig> {
  const { data: rows } = await supabase
    .from("ai_configs")
    .select("id, name, base_url, encrypted_api_key, model_name, temperature, max_tokens, custom_headers, is_default")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1);

  const row = rows?.[0];
  if (row && row.encrypted_api_key && row.model_name) {
    return {
      source: "user",
      configId: row.id,
      name: row.name,
      baseUrl: normalizeBaseUrl(row.base_url),
      apiKey: await decryptApiKey(row.encrypted_api_key),
      model: row.model_name,
      temperature: row.temperature === null ? null : Number(row.temperature),
      maxTokens: row.max_tokens ?? null,
      customHeaders: sanitizeCustomHeaders(row.custom_headers),
    };
  }

  // Legacy / fallback behaviour: bring-your-own AI_API_KEY, else Lovable AI.
  const ownKey = process.env["AI_API_KEY"];
  const apiKey = ownKey ?? process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new AiServiceError(
      "not_configured",
      "还没有可用的 AI 配置。请在「AI 配置」里添加你自己的 API 配置。",
    );
  }
  return {
    source: "builtin",
    configId: null,
    name: ownKey ? "自备 API" : "内置 AI",
    baseUrl: normalizeBaseUrl(
      ownKey
        ? (process.env["AI_API_BASE_URL"] ?? "https://api.openai.com/v1")
        : "https://ai.gateway.lovable.dev/v1",
    ),
    apiKey,
    model: ownKey
      ? (process.env["AI_MODEL"] ?? "gpt-4o-mini")
      : (process.env["AI_MODEL"] ?? "google/gemini-3.8-flash"),
    temperature: 0.8,
    maxTokens: 800,
    customHeaders: {},
  };
}

export type AiScene = "private_chat" | "diary_reply" | "reroll";

export interface GenerateOptions {
  scene: AiScene;
  userId: string;
  supabase: SupabaseClient<Database>;
  charId?: string | null;
  systemPrompt?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  outputFormat?: "text" | "json";
  temperature?: number | null;
  maxTokens?: number | null;
}

export interface GenerateResult {
  text: string;
  model: string;
  configSource: "user" | "builtin";
  configId: string | null;
}

/** The single entry point every AI feature uses to produce text. */
export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const config = await resolveConfigForUser(options.supabase, options.userId);

  const messages = [
    ...(options.systemPrompt ? [{ role: "system" as const, content: options.systemPrompt }] : []),
    ...options.messages,
  ];

  const temperature = options.temperature ?? config.temperature;
  const maxTokens = options.maxTokens ?? config.maxTokens;

  const body: Record<string, unknown> = { model: config.model, messages };
  if (typeof temperature === "number" && !Number.isNaN(temperature)) body["temperature"] = temperature;
  if (typeof maxTokens === "number" && maxTokens > 0) body["max_tokens"] = maxTokens;
  if (options.outputFormat === "json") body["response_format"] = { type: "json_object" };

  const response = await aiFetch(
    buildEndpoint(config.baseUrl, "chat/completions"),
    {
      method: "POST",
      headers: buildHeaders(config),
      body: JSON.stringify(body),
    },
    DEFAULT_TIMEOUT_MS,
  );

  if (!response.ok) {
    const error = classifyHttpStatus(response.status, await readSnippet(response));
    safeLog(`generate:${options.scene}`, `${config.source} config failed with ${response.status}`);
    throw error;
  }

  const data = (await response.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }> }
    | null;
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new AiServiceError("bad_response", "AI 没有返回内容，请稍后再试。");

  return { text, model: config.model, configSource: config.source, configId: config.configId };
}
