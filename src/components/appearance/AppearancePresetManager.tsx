import { useRef, useState } from "react";
import { Download, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import {
  applyAppearancePreset,
  deleteAppearancePreset,
  exportAppearancePreset,
  importAppearancePreset,
  renameAppearancePreset,
  saveAppearancePreset,
  scopeAppearanceCss,
  updateAppearancePreset,
  type AppearanceModule,
  type AppearanceThemeType,
} from "@/lib/appearance";

export function AppearancePresetManager<C extends object>({
  type,
  value,
  onChange,
  onPersist,
  onReset,
  disabled = false,
}: {
  type: AppearanceThemeType;
  value: AppearanceModule<C>;
  onChange: (value: AppearanceModule<C>) => void;
  onPersist?: (value: AppearanceModule<C>, mode: "apply" | "library") => void | Promise<void>;
  onReset: () => void;
  disabled?: boolean;
}) {
  const [selectedId, setSelectedId] = useState(value.currentPresetId ?? "");
  const [appliedId, setAppliedId] = useState(value.currentPresetId ?? "");
  const [newName, setNewName] = useState("");
  const [rename, setRename] = useState("");
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const selected = value.presets.find((preset) => preset.id === selectedId);
  const commit = (
    next: AppearanceModule<C>,
    message: string,
    mode: "apply" | "library" = "apply",
  ) => {
    try {
      const pending = onPersist?.(next, mode);
      onChange(next);
      if (pending) {
        setNotice("正在保存预设…");
        void pending
          .then(() => setNotice(message))
          .catch((reason) =>
            setNotice(reason instanceof Error ? reason.message : "预设保存失败。"),
          );
      } else setNotice(message);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "预设保存失败。");
    }
  };
  const guarded = (action: () => void) => {
    try {
      action();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "预设操作失败。");
    }
  };
  const download = () => {
    if (!selected) return;
    const blob = new Blob([exportAppearancePreset(value, type, selected.id)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selected.name}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <section
      className="appearance-presets"
      data-system-appearance-editor
      inert={disabled}
      aria-busy={disabled}
    >
      <h3>我的预设</h3>
      <div className="appearance-presets__list" role="list">
        {value.presets.length === 0 && <p className="appearance-presets__empty">还没有保存预设</p>}
        {value.presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="listitem"
            className={
              selectedId === preset.id
                ? "appearance-presets__item is-selected"
                : "appearance-presets__item"
            }
            onClick={() => {
              setSelectedId(preset.id);
              setRename(preset.name);
              onChange(applyAppearancePreset(value, preset.id));
              setNotice("已加载预设内容；点击应用或页面完成以保存。");
            }}
          >
            <span>{preset.name}</span>
            {appliedId === preset.id && <small>当前使用</small>}
          </button>
        ))}
      </div>
      <div className="appearance-presets__new">
        <input
          aria-label="新预设名称"
          placeholder="新预设名称"
          maxLength={80}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <button
          type="button"
          onClick={() =>
            guarded(() => {
              scopeAppearanceCss(value.customCss, type);
              const next = saveAppearancePreset(value, type, newName);
              setSelectedId(next.currentPresetId ?? "");
              setAppliedId(next.currentPresetId ?? "");
              setRename(next.name);
              setNewName("");
              commit(next, "已新增独立预设。");
            })
          }
        >
          ＋ 保存当前为新预设
        </button>
      </div>
      {selected && (
        <div className="appearance-presets__selected">
          <div className="appearance-presets__rename">
            <input
              aria-label="重命名选中预设"
              value={rename}
              maxLength={80}
              onChange={(event) => setRename(event.target.value)}
            />
            <button
              type="button"
              onClick={() =>
                guarded(() =>
                  commit(
                    renameAppearancePreset(value, selected.id, rename),
                    "已重命名。",
                    "library",
                  ),
                )
              }
            >
              重命名
            </button>
          </div>
          <div className="appearance-presets__actions">
            <button
              type="button"
              onClick={() => {
                commit(applyAppearancePreset(value, selected.id), "已应用预设。");
                setAppliedId(selected.id);
              }}
            >
              应用
            </button>
            <button
              type="button"
              onClick={() =>
                guarded(() => {
                  scopeAppearanceCss(value.customCss, type);
                  commit(updateAppearancePreset(value, selected.id), "已保存此预设的修改。");
                })
              }
            >
              <Save size={15} /> 保存修改
            </button>
            <button type="button" onClick={download}>
              <Download size={15} /> 导出
            </button>
            <button
              type="button"
              className="is-danger"
              onClick={() => {
                commit(
                  deleteAppearancePreset(value, selected.id),
                  "已删除所选预设，其他预设未变。",
                  "library",
                );
                setSelectedId("");
                if (appliedId === selected.id) setAppliedId("");
                setRename("");
              }}
            >
              <Trash2 size={15} /> 删除
            </button>
          </div>
        </div>
      )}
      <div className="appearance-presets__utility">
        <button
          type="button"
          onClick={() => {
            onReset();
            setSelectedId("");
            setAppliedId("");
            setNotice("仅恢复当前编辑内容；预设库未清空。");
          }}
        >
          <RotateCcw size={15} /> 恢复默认
        </button>
        <button type="button" onClick={() => input.current?.click()}>
          <Upload size={15} /> 导入
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
            commit(
              { ...value, presets: [...value.presets, preset] },
              "已导入新预设；点击后可应用。",
              "library",
            );
          } catch (reason) {
            setNotice(reason instanceof Error ? reason.message : "预设文件无效。");
          }
        }}
      />
      {notice && (
        <p className="appearance-presets__notice" role="status">
          {notice}
        </p>
      )}
      {type !== "desktop" && !onPersist && (
        <p className="appearance-presets__hint">聊天预设请点击页面右上角“完成”后保存。</p>
      )}
    </section>
  );
}
