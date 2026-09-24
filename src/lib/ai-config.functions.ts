import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server functions for managing a user's own AI channel configurations.
 * Encryption/decryption and every third-party request happen in the
 * server-only modules imported lazily inside the handlers, so nothing
 * sensitive can reach the client bundle.
 */

export const MASK_PLACEHOLDER = "••••••••";

const headersSchema = z.record(z.string(), z.string()).default({});

const credentialsSchema = z.object({
  base_url: z.string().min(1),
  api_key: z.string().default(""),
  model_name: z.string().default(""),
  custom_headers: headersSchema,
  config_id: z.string().uuid().nullable().default(null),
});

const saveSchema = z.object({
  id: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(1, "请填写配置名称"),
  base_url: z.string().trim().min(1, "请填写 API Base URL"),
  api_key: z.string().default(""),
  model_name: z.string().trim().min(1, "请填写模型名称"),
  temperature: z.number().min(0).max(2),
  max_tokens: z.number().int().positive().nullable().default(null),
  custom_headers: headersSchema,
  enabled: z.boolean().default(true),
  is_default: z.boolean().default(false),
});

function isMasked(value: string) {
  return !value.trim() || value.trim().startsWith("•") || /^sk-\*+/.test(value.trim());
}

export const listAiConfigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_configs")
      .select(
        "id, name, base_url, model_name, temperature, max_tokens, custom_headers, enabled, is_default, last_test_status, last_test_message, last_test_at, created_at, updated_at",
      )
      .eq("user_id", context.userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
      ...row,
      temperature: Number(row.temperature),
      custom_headers: (row.custom_headers ?? {}) as Record<string, string>,
      api_key_masked: MASK_PLACEHOLDER,
    }));
  });

export const saveAiConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { encryptApiKey } = await import("./ai/crypto.server");
    const { normalizeBaseUrl } = await import("./ai/service.server");
    const supabase = context.supabase;

    const baseUrl = normalizeBaseUrl(data.base_url);
    const providedKey = isMasked(data.api_key) ? null : data.api_key.trim();

    const shared = {
      name: data.name,
      base_url: baseUrl,
      model_name: data.model_name,
      temperature: data.temperature,
      max_tokens: data.max_tokens,
      custom_headers: data.custom_headers,
      enabled: data.enabled,
    };

    let configId = data.id;

    if (configId) {
      // Only replace the stored key when the user actually typed a new one.
      const update = providedKey
        ? { ...shared, encrypted_api_key: await encryptApiKey(providedKey) }
        : { ...shared };
      const { error } = await supabase
        .from("ai_configs")
        .update(update)
        .eq("id", configId)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
    } else {
      if (!providedKey) throw new Error("请填写 API Key");
      const { data: inserted, error } = await supabase
        .from("ai_configs")
        .insert({
          ...shared,
          user_id: context.userId,
          encrypted_api_key: await encryptApiKey(providedKey),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      configId = inserted.id;
    }

    if (data.is_default && configId) {
      await supabase
        .from("ai_configs")
        .update({ is_default: false })
        .eq("user_id", context.userId)
        .neq("id", configId);
      const { error } = await supabase
        .from("ai_configs")
        .update({ is_default: true })
        .eq("id", configId)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
    }

    return { id: configId };
  });

export const deleteAiConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_configs")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAiConfigEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_configs")
      .update({ enabled: data.enabled })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDefaultAiConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    await supabase
      .from("ai_configs")
      .update({ is_default: false })
      .eq("user_id", context.userId)
      .neq("id", data.id);
    const { error } = await supabase
      .from("ai_configs")
      .update({ is_default: true, enabled: true })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Resolve credentials either from the unsaved form input or from a stored config. */
async function resolveCredentials(
  supabase: import("@supabase/supabase-js").SupabaseClient<
    import("@/integrations/supabase/types").Database
  >,
  userId: string,
  input: z.infer<typeof credentialsSchema>,
) {
  const { decryptApiKey } = await import("./ai/crypto.server");

  let apiKey = isMasked(input.api_key) ? "" : input.api_key.trim();
  let baseUrl = input.base_url;
  let customHeaders = input.custom_headers;

  if (!apiKey && input.config_id) {
    const { data: row, error } = await supabase
      .from("ai_configs")
      .select("base_url, encrypted_api_key, custom_headers")
      .eq("id", input.config_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("找不到该 AI 配置");
    apiKey = await decryptApiKey(row.encrypted_api_key);
    if (!input.base_url.trim()) baseUrl = row.base_url;
    if (Object.keys(customHeaders).length === 0) {
      customHeaders = (row.custom_headers ?? {}) as Record<string, string>;
    }
  }

  return { baseUrl, apiKey, model: input.model_name, customHeaders };
}

export const testAiConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => credentialsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { testConnection } = await import("./ai/service.server");
    let result: { ok: boolean; kind: string; message: string };
    try {
      const creds = await resolveCredentials(context.supabase, context.userId, data);
      result = await testConnection(creds);
    } catch (error) {
      result = {
        ok: false,
        kind: "unknown",
        message: error instanceof Error ? error.message : "连接测试失败",
      };
    }

    if (data.config_id) {
      await context.supabase
        .from("ai_configs")
        .update({
          last_test_status: result.ok ? "success" : result.kind,
          last_test_message: result.message,
          last_test_at: new Date().toISOString(),
        })
        .eq("id", data.config_id)
        .eq("user_id", context.userId);
    }

    return result;
  });

export const listAiModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => credentialsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { listModels } = await import("./ai/service.server");
    try {
      const creds = await resolveCredentials(context.supabase, context.userId, data);
      return await listModels(creds);
    } catch (error) {
      return {
        ok: false,
        models: [] as string[],
        message: error instanceof Error ? error.message : "无法自动获取模型列表，请手动填写模型名称。",
      };
    }
  });
