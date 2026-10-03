import { useMemo } from "react";
import { ChevronRight, Globe } from "lucide-react";
import { availableTimeZones, isValidTimeZone } from "@/lib/chat-timezone";
import type { ChatTimeZoneSettings } from "@/lib/chat-timezone";

export function CharacterTimeZones({
  value,
  onChange,
}: {
  value: ChatTimeZoneSettings;
  onChange: (value: ChatTimeZoneSettings) => void;
}) {
  const zones = useMemo(availableTimeZones, []);
  return (
    <details className="character-extras__section">
      <summary>
        <Globe size={20} />
        <span>
          <strong>异地恋 / 时区</strong>
          <small>
            {value.enabled
              ? `${value.userTimeZone} · ${value.charTimeZone}`
              : "关闭 · 使用原有时间设置"}
          </small>
        </span>
        <ChevronRight size={17} />
      </summary>
      <div className="character-extras__body">
        <section className="character-extras__card">
          <label className="character-extras__row">
            启用异地恋
            <input
              type="checkbox"
              role="switch"
              checked={value.enabled}
              onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
            />
          </label>
          {(
            [
              ["userTimeZone", "User 时区"],
              ["charTimeZone", "Char 时区"],
            ] as const
          ).map(([key, label]) => (
            <label className="character-extras__field" key={key}>
              {label}
              <input
                list="chat-timezone-options"
                value={value[key]}
                disabled={!value.enabled}
                maxLength={100}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => onChange({ ...value, [key]: event.target.value })}
                aria-invalid={!isValidTimeZone(value[key])}
              />
              {!isValidTimeZone(value[key]) && (
                <small className="character-extras__error">
                  请选择列表中的标准时区，或输入有效的 IANA 时区。
                </small>
              )}
            </label>
          ))}
          <datalist id="chat-timezone-options">
            {zones.map((zone) => (
              <option value={zone} key={zone} />
            ))}
          </datalist>
          <p className="character-extras__hint">
            仅对此角色生效，点击顶部“完成”保存。开启后分别使用双方当地时间；关闭不改变原有真实时间开关。
          </p>
        </section>
      </div>
    </details>
  );
}
