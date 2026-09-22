import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Plug,
  Star,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Check,
  X,
} from "lucide-react";
import { Header, EmptyState, ErrorBanner, LoadingSpinner } from "@/components/ui-kit";
import {
  listAiConfigs,
  saveAiConfig,
  deleteAiConfig,
  setAiConfigEnabled,
  setDefaultAiConfig,
  testAiConnection,
  listAiModels,
} from "@/lib/ai-config.functions";

export const Route = createFileRoute("/_authenticated/ai-settings")({
  head: () => ({
    meta: [
      { title: "AI 配置 · 此心一笺" },
      {
        name: "description",
        content: "管理你自己的 AI 渠道：Base URL、API Key、模型、温度与连接测试。",
      },
      { property: "og:title", content: "AI 配置 · 此心一笺" },
      {
        property: "og:description",
        content: "管理你自己的 AI 渠道：Base URL、API Key、模型、温度与连接测试。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AiSettingsPage,
});

type ConfigRow = {
  id: string;
  name: string;
  base_url: string;
  model_name: string;
  temperature: number;
  max_tokens: number | null;
  custom_headers: Record<string, string>;
  enabled: boolean;
  is_default: boolean;
  last_test_status: string;
  last_test_message: string | null;
  last_test_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  untested: "未测试",
  success: "连接成功",
  auth: "认证失败",
  forbidden: "权限不足",
  network: "网络错误",
  timeout: "超时",
  rate_limit: "频率受限",
  model_not_found: "模型不存在",
  invalid_base_url: "地址错误",
  client_error: "请求被拒绝",
  server_error: "服务商异常",
  bad_response: "返回格式异常",
  unknown: "未知错误",
};

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function AiSettingsPage() {
  const router = useRouter();
  const fetchConfigs = useServerFn(listAiConfigs);
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ConfigRow | "new" | null>(null);

  const reload = useCallback(async () => {
    try {
      const rows = await fetchConfigs();
      setConfigs(rows as ConfigRow[]);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [fetchConfigs]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (editing) {
    return (
      <ConfigForm
        initial={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await reload();
        }}
      />
    );
  }

  return (
    <div className="page-container">
      <div className="fade-in">
        <Header title="AI 配置" onBack={() => router.history.back()} />

        {error && <ErrorBanner message={error} />}

        <button
          onClick={() => setEditing("new")}
          className="btn-primary w-full flex items-center justify-center gap-2 mb-6"
        >
          <Plus size={18} />
          <span>新增 AI 配置</span>
        </button>

        {loading ? (
          <LoadingSpinner />
        ) : configs.length === 0 ? (
          <EmptyState
            icon="🤖"
            title="还没有 AI 配置"
            subtitle="添加你自己的 API 渠道后，角色会使用你的配置回复。未配置时会继续使用内置 AI。"
          />
        ) : (
          <div className="space-y-3">
            {configs.map((config) => (
              <ConfigCard
                key={config.id}
                config={config}
                onChanged={reload}
                onEdit={() => setEditing(config)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConfigCard({
  config,
  onChanged,
  onEdit,
}: {
  config: ConfigRow;
  onChanged: () => Promise<void>;
  onEdit: () => void;
}) {
  const test = useServerFn(testAiConnection);
  const toggle = useServerFn(setAiConfigEnabled);
  const makeDefault = useServerFn(setDefaultAiConfig);
  const remove = useServerFn(deleteAiConfig);
  const [busy, setBusy] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await action();
      await onChanged();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-[var(--color-text)] truncate">{config.name}</p>
            {config.is_default && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-primary)] text-white">
                默认
              </span>
            )}
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                config.enabled
                  ? "bg-[var(--color-bg)] text-[var(--color-text-secondary)]"
                  : "bg-[var(--color-bg)] text-[var(--color-text-secondary)] line-through"
              }`}
            >
              {config.enabled ? "已启用" : "已停用"}
            </span>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1 truncate">
            {config.model_name} · {hostOf(config.base_url)}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
            连接状态：{STATUS_LABEL[config.last_test_status] ?? config.last_test_status}
            {config.last_test_message ? ` · ${config.last_test_message}` : ""}
          </p>
          {testMessage && <p className="text-xs text-[var(--color-text)] mt-1">{testMessage}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <button
          className="btn-secondary flex items-center gap-1 text-sm px-3 py-2"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("test");
            try {
              const result = await test({
                data: {
                  config_id: config.id,
                  base_url: config.base_url,
                  api_key: "",
                  model_name: config.model_name,
                  custom_headers: {},
                },
              });
              setTestMessage(result.message);
              await onChanged();
            } finally {
              setBusy(null);
            }
          }}
        >
          <Plug size={15} />
          {busy === "test" ? "测试中…" : "测试"}
        </button>
        <button
          className="btn-secondary flex items-center gap-1 text-sm px-3 py-2"
          disabled={busy !== null}
          onClick={onEdit}
        >
          <Pencil size={15} />
          编辑
        </button>
        {!config.is_default && (
          <button
            className="btn-secondary flex items-center gap-1 text-sm px-3 py-2"
            disabled={busy !== null}
            onClick={() => run("default", () => makeDefault({ data: { id: config.id } }))}
          >
            <Star size={15} />
            设为默认
          </button>
        )}
        <button
          className="btn-secondary flex items-center gap-1 text-sm px-3 py-2"
          disabled={busy !== null}
          onClick={() =>
            run("toggle", () => toggle({ data: { id: config.id, enabled: !config.enabled } }))
          }
        >
          {config.enabled ? <X size={15} /> : <Check size={15} />}
          {config.enabled ? "停用" : "启用"}
        </button>
        <button
          className="btn-ghost flex items-center gap-1 text-sm px-3 py-2 text-[var(--color-error)]"
          disabled={busy !== null}
          onClick={() => {
            if (!window.confirm(`删除配置「${config.name}」？`)) return;
            void run("delete", () => remove({ data: { id: config.id } }));
          }}
        >
          <Trash2 size={15} />
          删除
        </button>
      </div>
    </div>
  );
}

function ConfigForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: ConfigRow | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const test = useServerFn(testAiConnection);
  const fetchModels = useServerFn(listAiModels);
  const save = useServerFn(saveAiConfig);

  const [name, setName] = useState(initial?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.base_url ?? "https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [modelName, setModelName] = useState(initial?.model_name ?? "");
  const [temperature, setTemperature] = useState(initial?.temperature ?? 0.8);
  const [maxTokens, setMaxTokens] = useState(
    initial?.max_tokens === null || initial?.max_tokens === undefined
      ? ""
      : String(initial.max_tokens),
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false);

  const [headerRows, setHeaderRows] = useState<Array<{ key: string; value: string }>>(
    Object.entries(initial?.custom_headers ?? {}).map(([key, value]) => ({ key, value })),
  );
  const [headersOpen, setHeadersOpen] = useState(false);

  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelsMessage, setModelsMessage] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [manualModel, setManualModel] = useState(true);
  const [modelSearch, setModelSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const customHeaders = useMemo(() => {
    const out: Record<string, string> = {};
    for (const row of headerRows) {
      if (row.key.trim()) out[row.key.trim()] = row.value;
    }
    return out;
  }, [headerRows]);

  const credentials = () => ({
    config_id: initial?.id ?? null,
    base_url: baseUrl,
    api_key: apiKey,
    model_name: modelName,
    custom_headers: customHeaders,
  });

  const loadModels = async () => {
    setModelsLoading(true);
    try {
      const result = await fetchModels({ data: credentials() });
      setModels(result.models);
      setModelsMessage(result.message);
      setManualModel(!result.ok || result.models.length === 0);
    } catch (e) {
      setModels([]);
      setManualModel(true);
      setModelsMessage(
        e instanceof Error ? e.message : "无法自动获取模型列表，请手动填写模型名称。",
      );
    } finally {
      setModelsLoading(false);
    }
  };

  const runTest = async () => {
    setTestStatus("testing");
    setTestMessage("");
    try {
      const result = await test({ data: credentials() });
      setTestStatus(result.ok ? "ok" : "fail");
      setTestMessage(
        result.ok ? result.message : `${STATUS_LABEL[result.kind] ?? "失败"}：${result.message}`,
      );
      if (result.ok) await loadModels();
    } catch (e) {
      setTestStatus("fail");
      setTestMessage(e instanceof Error ? e.message : "连接测试失败");
    }
  };

  const submit = async () => {
    setError("");
    if (!name.trim()) return setError("请填写配置名称");
    if (!baseUrl.trim()) return setError("请填写 API Base URL");
    if (!initial && !apiKey.trim()) return setError("请填写 API Key");
    if (!modelName.trim()) return setError("请选择或填写模型名称");
    const parsedMax = maxTokens.trim() === "" ? null : Number(maxTokens);
    if (parsedMax !== null && (!Number.isInteger(parsedMax) || parsedMax <= 0)) {
      return setError("Max Tokens 需要是正整数，或留空");
    }
    if (Number.isNaN(temperature)) return setError("Temperature 需要是数字");

    setSaving(true);
    try {
      await save({
        data: {
          id: initial?.id ?? null,
          name: name.trim(),
          base_url: baseUrl.trim(),
          api_key: apiKey,
          model_name: modelName.trim(),
          temperature: Number(temperature),
          max_tokens: parsedMax,
          custom_headers: customHeaders,
          enabled,
          is_default: isDefault,
        },
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const filteredModels = models.filter((m) =>
    m.toLowerCase().includes(modelSearch.trim().toLowerCase()),
  );

  return (
    <div className="page-container">
      <div className="fade-in">
        <Header title={initial ? "编辑 AI 配置" : "新增 AI 配置"} onBack={onCancel} />

        {error && <ErrorBanner message={error} />}

        <div className="card space-y-4">
          <Field label="配置名称">
            <input
              className="input-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：我的 OpenAI"
            />
          </Field>

          <Field label="API Base URL">
            <input
              className="input-field"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </Field>

          <Field label="API Key">
            <div className="flex gap-2">
              <input
                className="input-field flex-1"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={initial ? "已配置（留空表示不修改）" : "sk-..."}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn-secondary px-3"
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? "隐藏" : "显示"}
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              API Key 只保存在服务端并加密存储，保存后无法再次读取明文。
            </p>
          </Field>

          <div>
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)]"
              onClick={() => setHeadersOpen((v) => !v)}
            >
              自定义 Header（可选）
              {headersOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {headersOpen && (
              <div className="mt-3 space-y-2">
                {headerRows.map((row, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      className="input-field flex-1"
                      placeholder="Header 名"
                      value={row.key}
                      onChange={(e) =>
                        setHeaderRows((rows) =>
                          rows.map((r, i) => (i === index ? { ...r, key: e.target.value } : r)),
                        )
                      }
                    />
                    <input
                      className="input-field flex-1"
                      placeholder="值"
                      value={row.value}
                      onChange={(e) =>
                        setHeaderRows((rows) =>
                          rows.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="btn-ghost px-2 text-[var(--color-error)]"
                      onClick={() => setHeaderRows((rows) => rows.filter((_, i) => i !== index))}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-secondary text-sm px-3 py-2"
                  onClick={() => setHeaderRows((rows) => [...rows, { key: "", value: "" }])}
                >
                  添加 Header
                </button>
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              className="btn-secondary w-full flex items-center justify-center gap-2"
              disabled={testStatus === "testing"}
              onClick={() => void runTest()}
            >
              <Plug size={16} />
              {testStatus === "testing" ? "测试中…" : "测试连接"}
            </button>
            <p
              className={`text-sm mt-2 ${
                testStatus === "ok"
                  ? "text-[var(--color-primary)]"
                  : testStatus === "fail"
                    ? "text-[var(--color-error)]"
                    : "text-[var(--color-text-secondary)]"
              }`}
            >
              {testStatus === "idle" && "连接状态：未测试"}
              {testStatus === "testing" && "连接状态：测试中"}
              {testStatus !== "idle" && testStatus !== "testing" && testMessage}
            </p>
          </div>

          <Field label="模型">
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                className="btn-secondary text-sm px-3 py-2 flex items-center gap-1"
                disabled={modelsLoading}
                onClick={() => void loadModels()}
              >
                <RefreshCw size={15} className={modelsLoading ? "animate-spin" : ""} />
                {modelsLoading ? "获取中…" : models.length > 0 ? "刷新模型列表" : "获取模型"}
              </button>
              {models.length > 0 && (
                <button
                  type="button"
                  className="btn-ghost text-sm px-3 py-2"
                  onClick={() => setManualModel((v) => !v)}
                >
                  {manualModel ? "从列表选择" : "手动填写"}
                </button>
              )}
            </div>

            {modelsMessage && (
              <p className="text-xs text-[var(--color-text-secondary)] mb-2">{modelsMessage}</p>
            )}

            {manualModel || models.length === 0 ? (
              <input
                className="input-field"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="例如：gpt-4o-mini"
                autoCapitalize="none"
                autoCorrect="off"
              />
            ) : (
              <div>
                <input
                  className="input-field mb-2"
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder="搜索模型…"
                />
                <div className="max-h-56 overflow-y-auto rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                  {filteredModels.length === 0 ? (
                    <p className="p-3 text-sm text-[var(--color-text-secondary)]">没有匹配的模型</p>
                  ) : (
                    filteredModels.map((model) => (
                      <button
                        key={model}
                        type="button"
                        onClick={() => setModelName(model)}
                        className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between ${
                          modelName === model
                            ? "text-[var(--color-primary)] font-medium"
                            : "text-[var(--color-text)]"
                        }`}
                      >
                        <span className="truncate">{model}</span>
                        {modelName === model && <Check size={16} />}
                      </button>
                    ))
                  )}
                </div>
                <p className="text-xs text-[var(--color-text-secondary)] mt-2">
                  当前模型：{modelName || "未选择"}
                </p>
              </div>
            )}
          </Field>

          <Field label={`Temperature：${temperature}`}>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full"
            />
          </Field>

          <Field label="Max Tokens（可留空，由服务商决定）">
            <input
              className="input-field"
              inputMode="numeric"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              placeholder="例如：800"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            启用此配置
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            设为当前默认配置
          </label>
        </div>

        <div className="flex gap-2 mt-6">
          <button className="btn-secondary flex-1" onClick={onCancel} disabled={saving}>
            取消
          </button>
          <button className="btn-primary flex-1" onClick={() => void submit()} disabled={saving}>
            {saving ? "保存中…" : "保存设置"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">{label}</label>
      {children}
    </div>
  );
}
