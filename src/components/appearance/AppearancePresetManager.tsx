import { useRef, useState } from "react";
import { Download, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import {
  applyAppearancePreset,
  deleteAppearancePreset,
  exportAppearancePreset,
  importAppearancePreset,
  renameAppearancePreset,
  saveAppearancePreset,
  type AppearanceModule,
  type AppearanceThemeType,
} from "@/lib/appearance";

export function AppearancePresetManager<C extends object>({
  type,
  value,
  onChange,
  onReset,
}: {
  type: AppearanceThemeType;
  value: AppearanceModule<C>;
  onChange: (value: AppearanceModule<C>) => void;
  onReset: () => void;
}) {
  const [name, setName] = useState(value.name || "当前配置");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const selected = value.currentPresetId ?? "";
  const download = () => {
    const blob = new Blob([exportAppearancePreset(value, type)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${value.name || type}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return (
    <section className="appearance-presets" data-system-appearance-editor>
      <div className="appearance-presets__name">
        <label>
          预设名称
          <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </label>
        <button
          type="button"
          onClick={() => {
            const next = selected
              ? renameAppearancePreset(value, selected, name)
              : saveAppearancePreset(value, type, name);
            onChange(next);
          }}
        >
          <Save size={16} /> {selected ? "重命名" : "保存为预设"}
        </button>
      </div>
      {value.presets.length > 0 && (
        <div className="appearance-presets__select">
          <select
            aria-label="选择预设"
            value={selected}
            onChange={(event) => onChange(applyAppearancePreset(value, event.target.value))}
          >
            <option value="">当前未保存配置</option>
            {value.presets.map((preset) => (
              <option value={preset.id} key={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selected}
            className="is-danger"
            onClick={() => selected && onChange(deleteAppearancePreset(value, selected))}
          >
            <Trash2 size={16} /> 删除
          </button>
        </div>
      )}
      <div className="appearance-presets__actions">
        <button type="button" onClick={onReset}>
          <RotateCcw size={16} />
          恢复默认
        </button>
        <button type="button" onClick={() => input.current?.click()}>
          <Upload size={16} />
          导入
        </button>
        <button type="button" onClick={download}>
          <Download size={16} />
          导出
        </button>
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept="application/json,.json"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          try {
            const preset = importAppearancePreset<C>(await file.text(), type);
            onChange({ ...value, presets: [...value.presets, preset] });
            setName(preset.name);
            setError("已导入预设；选择后才会应用。");
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "预设文件无效。");
          }
        }}
      />
      {error && (
        <p className="appearance-presets__notice" role="status">
          {error}
        </p>
      )}
    </section>
  );
}
