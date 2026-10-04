import { useEffect, useState, type ChangeEvent, type CSSProperties } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, ImagePlus } from "lucide-react";
import { Header } from "@/components/ui-kit";
import { AppearancePresetManager } from "@/components/appearance/AppearancePresetManager";
import { useAuth } from "@/context/AuthContext";
import {
  defaultAppearanceModule,
  safeScopedAppearanceCss,
  scopeAppearanceCss,
  withAppearancePresetLibrary,
  type AppearanceModule,
  type DesktopAppearanceConfig,
} from "@/lib/appearance";
import { saveDesktopAppearance, useDesktopAppearance } from "@/lib/desktop-appearance";

const apps = [
  ["diary", "此心一笺"],
  ["focus", "番茄钟"],
  ["listen", "一起听"],
  ["chat", "聊天"],
  ["food", "吃什么"],
  ["world", "世界书"],
  ["appearance", "美化"],
  ["goal", "规划"],
  ["knowledge", "知识库"],
  ["roster", "名册"],
  ["wallpaper", "壁纸"],
  ["settings", "设置"],
] as const;

export const Route = createFileRoute("/_authenticated/appearance")({
  head: () => ({ meta: [{ title: "桌面美化 · K得机" }] }),
  component: DesktopAppearancePage,
});

function DesktopAppearancePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const stored = useDesktopAppearance(user?.id ?? "guest");
  const [draft, setDraft] = useState(stored);
  const [error, setError] = useState("");
  useEffect(() => setDraft(stored), [stored]);
  const updateConfig = (patch: Partial<DesktopAppearanceConfig>) =>
    setDraft((current) => ({
      ...current,
      currentPresetId: null,
      config: { ...current.config, ...patch },
    }));
  const updateApp = (appId: string, patch: Record<string, unknown>) =>
    updateConfig({
      apps: { ...draft.config.apps, [appId]: { ...draft.config.apps[appId], ...patch } },
    });
  const apply = () => {
    try {
      scopeAppearanceCss(draft.customCss, "desktop");
      saveDesktopAppearance(user?.id ?? "guest", draft);
      setError("已应用并保存。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "主题无法应用。");
    }
  };
  return (
    <main className="appearance-page app-page" data-system-appearance-editor>
      <Header
        title="美化"
        onBack={() => navigate({ to: "/" })}
        rightAction={
          <button className="appearance-page__apply" onClick={apply}>
            应用
          </button>
        }
      />
      <div className="appearance-page__scroll">
        {error && (
          <p className="appearance-page__notice" role="status">
            {error}
          </p>
        )}
        <section className="appearance-card">
          <h2>
            <Eye size={18} />
            实时预览
          </h2>
          <DesktopPreview value={draft} />
        </section>
        <details className="appearance-card" open>
          <summary>桌面布局</summary>
          <Range
            label="图标大小"
            value={draft.config.iconSize}
            min={36}
            max={96}
            onChange={(iconSize) => updateConfig({ iconSize })}
          />
          <Range
            label="网格间距"
            value={draft.config.gridGap}
            min={6}
            max={48}
            onChange={(gridGap) => updateConfig({ gridGap })}
          />
          <label>
            每行图标数
            <select
              value={draft.config.gridColumns}
              onChange={(event) => updateConfig({ gridColumns: Number(event.target.value) })}
            >
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
            </select>
          </label>
          <Range
            label="Dock 大小"
            value={draft.config.dockSize}
            min={46}
            max={92}
            onChange={(dockSize) => updateConfig({ dockSize })}
          />
          <Range
            label="Dock 透明度"
            value={draft.config.dockOpacity}
            min={0.15}
            max={1}
            step={0.05}
            onChange={(dockOpacity) => updateConfig({ dockOpacity })}
          />
          <Range
            label="Dock X 位移"
            value={draft.config.dockX}
            min={-80}
            max={80}
            onChange={(dockX) => updateConfig({ dockX })}
          />
          <Range
            label="Dock Y 位移"
            value={draft.config.dockY}
            min={-80}
            max={80}
            onChange={(dockY) => updateConfig({ dockY })}
          />
          <div className="appearance-toggles">
            {(
              [
                ["showTime", "时间"],
                ["showDate", "日期"],
                ["showGreeting", "问候"],
                ["showQuote", "寄语"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="checkbox"
                  checked={draft.config[key]}
                  onChange={(event) => updateConfig({ [key]: event.target.checked })}
                />
              </label>
            ))}
          </div>
        </details>
        <details className="appearance-card">
          <summary>逐个 App 调整</summary>
          <div className="appearance-apps">
            {apps.map(([appId, label]) => {
              const item = draft.config.apps[appId] ?? {};
              return (
                <details className="appearance-app" key={appId}>
                  <summary>{label}</summary>
                  <label className="appearance-icon-upload">
                    <ImagePlus size={17} />
                    更换图标
                    <input
                      hidden
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        void readIcon(event, (iconUrl) => updateApp(appId, { iconUrl }), setError)
                      }
                    />
                  </label>
                  {item.iconUrl && (
                    <button type="button" onClick={() => updateApp(appId, { iconUrl: "" })}>
                      恢复默认图标
                    </button>
                  )}
                  <Range
                    label="大小"
                    value={item.size ?? draft.config.iconSize}
                    min={36}
                    max={96}
                    onChange={(size) => updateApp(appId, { size })}
                  />
                  <Range
                    label="X 位移"
                    value={item.x ?? 0}
                    min={-80}
                    max={80}
                    onChange={(x) => updateApp(appId, { x })}
                  />
                  <Range
                    label="Y 位移"
                    value={item.y ?? 0}
                    min={-80}
                    max={80}
                    onChange={(y) => updateApp(appId, { y })}
                  />
                  <Range
                    label="缩放"
                    value={item.scale ?? 1}
                    min={0.5}
                    max={1.8}
                    step={0.05}
                    onChange={(scale) => updateApp(appId, { scale })}
                  />
                  <Range
                    label="旋转"
                    value={item.rotate ?? 0}
                    min={-180}
                    max={180}
                    onChange={(rotate) => updateApp(appId, { rotate })}
                  />
                  <Range
                    label="透明度"
                    value={item.opacity ?? 1}
                    min={0.1}
                    max={1}
                    step={0.05}
                    onChange={(opacity) => updateApp(appId, { opacity })}
                  />
                  <Range
                    label="圆角"
                    value={item.radius ?? 17}
                    min={0}
                    max={50}
                    onChange={(radius) => updateApp(appId, { radius })}
                  />
                  <label>
                    显示名称
                    <input
                      type="checkbox"
                      checked={item.labelVisible ?? true}
                      onChange={(event) => updateApp(appId, { labelVisible: event.target.checked })}
                    />
                  </label>
                  <Range
                    label="名称字号"
                    value={item.labelSize ?? 12}
                    min={9}
                    max={20}
                    onChange={(labelSize) => updateApp(appId, { labelSize })}
                  />
                </details>
              );
            })}
          </div>
        </details>
        <details className="appearance-card">
          <summary>高级桌面 CSS</summary>
          <p>仅作用于带 data-ui="desktop" 的桌面。可使用稳定的 data-ui / data-app-id 选择器。</p>
          <textarea
            rows={12}
            spellCheck={false}
            value={draft.customCss}
            onChange={(event) =>
              setDraft({ ...draft, currentPresetId: null, customCss: event.target.value })
            }
            placeholder={
              '[data-app-id="chat"] [data-ui="app-icon"] {\n  box-shadow: 0 8px 20px #0002;\n}'
            }
          />
        </details>
        <AppearancePresetManager
          type="desktop"
          value={draft}
          onChange={setDraft}
          onPersist={(next, mode) =>
            saveDesktopAppearance(
              user?.id ?? "guest",
              mode === "library" ? withAppearancePresetLibrary(stored, next) : next,
            )
          }
          onReset={() =>
            setDraft({
              ...defaultAppearanceModule("desktop"),
              presets: draft.presets,
            })
          }
        />
      </div>
    </main>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="appearance-range">
      <span>
        {label}
        <output>{value}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function DesktopPreview({ value }: { value: AppearanceModule<DesktopAppearanceConfig> }) {
  const config = value.config;
  return (
    <div
      className="appearance-preview"
      data-ui="desktop"
      style={{ "--preview-dock-opacity": config.dockOpacity } as CSSProperties}
    >
      <style>{safeScopedAppearanceCss(value.customCss, "desktop")}</style>
      {config.showTime && <div data-ui="desktop-time">13:01</div>}
      {config.showDate && <div data-ui="desktop-date">9月29日 · 星期二</div>}
      {config.showGreeting && <div data-ui="desktop-greeting">晚上好，K</div>}
      <div
        data-ui="app-grid"
        style={{
          gridTemplateColumns: `repeat(${config.gridColumns}, 1fr)`,
          gap: config.gridGap,
        }}
      >
        {apps
          .filter(([id], index) => index < 4 || id === "goal" || id === "knowledge")
          .map(([id, label]) => {
            const visual = config.apps[id] ?? {};
            const size = Math.round((visual.size ?? config.iconSize) * 0.56);
            return (
              <span
                data-ui="app"
                data-app-id={id}
                key={id}
                style={{
                  transform: `translate(${(visual.x ?? 0) * 0.35}px, ${(visual.y ?? 0) * 0.35}px) scale(${visual.scale ?? 1}) rotate(${visual.rotate ?? 0}deg)`,
                  opacity: visual.opacity ?? 1,
                }}
              >
                <i
                  data-ui="app-icon"
                  style={{
                    width: size,
                    height: size,
                    borderRadius: `${Math.round((visual.radius ?? 17) * 0.6)}px`,
                    backgroundImage: visual.iconUrl
                      ? `url(${JSON.stringify(visual.iconUrl)})`
                      : undefined,
                    backgroundSize: "cover",
                  }}
                />
                {(visual.labelVisible ?? true) && (
                  <small
                    data-ui="app-label"
                    style={{ fontSize: `${Math.max(7, (visual.labelSize ?? 12) * 0.65)}px` }}
                  >
                    {label}
                  </small>
                )}
              </span>
            );
          })}
      </div>
      {config.showQuote && <div data-ui="desktop-quote">“把想说的话，慢慢写进今天。”</div>}
      <div
        data-ui="dock"
        style={{
          height: Math.round(config.dockSize * 0.5),
          opacity: config.dockOpacity,
          transform: `translate(${config.dockX * 0.3}px, ${config.dockY * 0.3}px)`,
        }}
      />
    </div>
  );
}

async function readIcon(
  event: ChangeEvent<HTMLInputElement>,
  done: (url: string) => void,
  error: (message: string) => void,
) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024)
    return error("图标需为 JPG、PNG 或 WebP，且不超过 8MB。");
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return error("无法读取图标。");
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, 256, 256);
  bitmap.close();
  done(canvas.toDataURL("image/webp", 0.82));
  canvas.width = canvas.height = 0;
}
