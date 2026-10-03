export interface ChatTimeZoneSettings {
  enabled: boolean;
  userTimeZone: string;
  charTimeZone: string;
}

export function isValidTimeZone(value: string): boolean {
  // Accept named IANA timezones, not raw UTC offsets or arbitrary prompt text.
  if (!/^[A-Za-z0-9_+/-]{1,100}$/.test(value) || /^[+-]/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function availableTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  return ["UTC", ...(intl.supportedValuesOf?.("timeZone") ?? [])];
}

function localClock(timeZone: string, now: Date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((p) => [p.type, p.value]));
  const wallTime = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    Number(parts["hour"]),
    Number(parts["minute"]),
    Number(parts["second"]),
  );
  const offsetMinutes = Math.round((wallTime - Math.floor(now.getTime() / 1000) * 1000) / 60000);
  const date = `${parts["year"]}-${parts["month"]}-${parts["day"]}`;
  return {
    date,
    time: `${date} ${parts["hour"]}:${parts["minute"]}:${parts["second"]}`,
    offsetMinutes,
  };
}

function utcOffset(minutes: number) {
  const absolute = Math.abs(minutes);
  return `UTC${minutes < 0 ? "-" : "+"}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

export function chatTimeZoneContext(settings: ChatTimeZoneSettings, now = new Date()): string {
  if (
    !settings.enabled ||
    !isValidTimeZone(settings.userTimeZone) ||
    !isValidTimeZone(settings.charTimeZone)
  )
    return "";
  const user = localClock(settings.userTimeZone, now);
  const char = localClock(settings.charTimeZone, now);
  const difference = char.offsetMinutes - user.offsetMinutes;
  return `\n\nLONG DISTANCE TIME CONTEXT
User local time: ${user.time} (${settings.userTimeZone}, ${utcOffset(user.offsetMinutes)})
Char local time: ${char.time} (${settings.charTimeZone}, ${utcOffset(char.offsetMinutes)})
Time difference: Char minus User = ${difference >= 0 ? "+" : ""}${difference} minutes (${difference / 60} hours)
Local calendar dates differ: ${user.date !== char.date}
异地恋设置开启：默认双方当前处于不同地点，只有上下文明确已经线下见面才可视为同处一地。以上为同一时刻的两地当地时间，已考虑夏令时；据 Char 当地日期和时间理解白天、夜晚、跨天与可能的作息，不擅自断言正在睡觉。这里的时间优先于通用时间上下文中的当地时间，原有互动间隔仍有效。仅作为本轮理解依据，不把这些字段输出为聊天正文，不每轮刻意强调异地。`;
}

export const PHONE_CHAT_CONTEXT = `\n\nPHONE CHAT SCENE
当前交互媒介是手机聊天。除非聊天上下文明确定义双方已经或即将线下见面，默认双方不在同一物理空间。
不得直接进行或叙述已经发生的触碰、拥抱、亲吻、递东西、走到 User 身边等线下动作；不得擅自假设住在一起、正在同一房间、马上见面或无依据说“我去找你”“过来让我抱一下”。
可以自然表达“想抱你”“见面再抱”等愿望，必须区分想做与已经做。明确约定见面时只依据上下文事实，不把即将见面当成已经同处一室。
保持自然活人私聊感，不要每条消息强调隔着手机或异地；该约束用于理解场景，不作为正文提示。`;
