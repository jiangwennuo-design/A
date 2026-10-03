import { useMemo, useState } from "react";
import { Check, Smartphone } from "lucide-react";
import { SystemSheet } from "@/components/system-ui";
import { deviceTimeZone } from "@/lib/chat-timezone";
import { searchTimeZones, timeZoneLabel } from "@/lib/timezone-options";
import "@/styles/timezone-picker.css";

export default function TimeZonePicker({
  value,
  followDevice,
  onSelect,
  onClose,
}: {
  value: string;
  followDevice: boolean;
  onSelect: (timezone: string, followDevice: boolean) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const zones = useMemo(() => searchTimeZones(query), [query]);
  const deviceZone = useMemo(deviceTimeZone, []);
  return (
    <SystemSheet open title="选择参考时区" onClose={onClose} scrollable>
      <div className="timezone-picker">
        <input
          type="search"
          aria-label="搜索国家、城市或时区"
          placeholder="搜索国家、城市或 IANA 时区"
          value={query}
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className="timezone-picker__option"
          disabled={!deviceZone}
          onClick={() => deviceZone && onSelect(deviceZone, true)}
          aria-pressed={followDevice}
        >
          <Smartphone size={18} />
          <span>
            跟随设备时区<small>{deviceZone ? timeZoneLabel(deviceZone) : "设备时区暂不可用"}</small>
          </span>
          {followDevice && <Check size={18} />}
        </button>
        <div className="timezone-picker__results">
          {zones.map((zone) => (
            <button
              type="button"
              className="timezone-picker__option"
              key={zone.timezone}
              onClick={() => onSelect(zone.timezone, false)}
              aria-pressed={!followDevice && value === zone.timezone}
            >
              <span>
                {zone.label}
                <small>{zone.timezone}</small>
              </span>
              {!followDevice && value === zone.timezone && <Check size={18} />}
            </button>
          ))}
          {!zones.length && <p>没有找到对应时区，请尝试参考城市或标准 IANA 名称。</p>}
        </div>
      </div>
    </SystemSheet>
  );
}
