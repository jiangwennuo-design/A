import { lazy, Suspense, useState } from "react";
import { ChevronRight, Globe } from "lucide-react";
import { deviceTimeZone } from "@/lib/chat-timezone";
import type { CharacterChatPreferences } from "@/lib/character-chat";
import { timeZoneLabel } from "@/lib/timezone-options";
import { LoadingSpinner } from "@/components/ui-kit";

const TimeZonePicker = lazy(() => import("./TimeZonePicker"));

export function CharacterTimeZones({
  value,
  onChange,
}: {
  value: CharacterChatPreferences["longDistance"];
  onChange: (value: CharacterChatPreferences["longDistance"]) => void;
}) {
  const [editing, setEditing] = useState<"user" | "char" | null>(null);
  const label = (role: "user" | "char") => {
    const zone = value[`${role}FollowDevice`]
      ? (deviceTimeZone() ?? value[`${role}TimeZone`])
      : value[`${role}TimeZone`];
    return value[`${role}DisplayLocation`] || timeZoneLabel(zone);
  };
  return (
    <details className="character-extras__section">
      <summary>
        <Globe size={20} />
        <span>
          <strong>异地恋 / 时区</strong>
          <small>
            {value.enabled ? `${label("user")} · ${label("char")}` : "关闭 · 使用原有时间设置"}
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
              ["user", "User"],
              ["char", "Char"],
            ] as const
          ).map(([role, name]) => (
            <div key={role}>
              <h4>{name} 的地点与时区</h4>
              <label className="character-extras__field">
                地点名称
                <input
                  aria-label={`${name} 地点名称`}
                  placeholder="可填写真实或虚构城市"
                  value={value[`${role}DisplayLocation`] ?? ""}
                  maxLength={80}
                  disabled={!value.enabled}
                  onChange={(event) =>
                    onChange({ ...value, [`${role}DisplayLocation`]: event.target.value })
                  }
                />
              </label>
              <div className="character-extras__field">
                参考时区
                <button
                  type="button"
                  className="character-timezone-choice"
                  aria-label={`${name} 参考时区`}
                  disabled={!value.enabled}
                  onClick={() => setEditing(role)}
                >
                  <span>
                    {value[`${role}FollowDevice`]
                      ? `跟随设备时区 · ${timeZoneLabel(deviceTimeZone() ?? value[`${role}TimeZone`])}`
                      : timeZoneLabel(value[`${role}TimeZone`])}
                  </span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ))}
          <p className="character-extras__hint">
            地点名称可以自定义，实际时间按照参考城市的时区计算。仅对此角色生效，点击顶部“完成”保存；关闭不改变原有真实时间开关。
          </p>
        </section>
      </div>
      {editing && (
        <Suspense fallback={<LoadingSpinner />}>
          <TimeZonePicker
            value={value[`${editing}TimeZone`]}
            followDevice={value[`${editing}FollowDevice`] ?? false}
            onClose={() => setEditing(null)}
            onSelect={(timezone, followDevice) => {
              onChange({
                ...value,
                [`${editing}TimeZone`]: timezone,
                [`${editing}FollowDevice`]: followDevice,
              });
              setEditing(null);
            }}
          />
        </Suspense>
      )}
    </details>
  );
}
