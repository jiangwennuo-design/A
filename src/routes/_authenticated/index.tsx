import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BookHeart,
  BookOpen,
  Library,
  ContactRound,
  Image,
  Headphones,
  MessageCircle,
  Settings,
  SwatchBook,
  Target,
  Timer,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { DesktopWallpaper } from "@/components/DesktopWallpaper";
import { SystemModal } from "@/components/system-ui";
import { openSystemApp } from "@/lib/app-transition";
import { safeScopedAppearanceCss } from "@/lib/appearance";
import { useDesktopAppearance } from "@/lib/desktop-appearance";
import { localDate, useGoals } from "@/lib/goals";
import { GoalWidget } from "@/components/goals/GoalWidget";
import { DesktopPages } from "@/components/DesktopPages";

const QUOTE_STORAGE_KEY = "cxyj-daily-quote";
const DEFAULT_QUOTE = "把想说的话，慢慢写进今天。";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [{ title: "K得机" }, { name: "description", content: "你的日记、聊天和个人空间。" }],
  }),
  component: PhoneHomePage,
});

function PhoneHomePage() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const appearance = useDesktopAppearance(user?.id ?? "guest");
  const desktop = appearance.config;
  const goals = useGoals(user?.id ?? "guest");
  const desktopGoal = goals.goals.find((goal) => goal.id === goals.desktopGoalId);
  const [now, setNow] = useState(() => new Date());
  const [quote, setQuote] = useState(
    () => localStorage.getItem(QUOTE_STORAGE_KEY) || DEFAULT_QUOTE,
  );
  const [quoteDraft, setQuoteDraft] = useState(quote);
  const [quoteEditorOpen, setQuoteEditorOpen] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const date = now.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const time = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

  const openApp = (
    appId: string,
    event: React.MouseEvent<HTMLButtonElement>,
    destination: () => void | Promise<void>,
  ) => {
    void openSystemApp(appId, event.currentTarget, destination);
  };

  const saveQuote = () => {
    const nextQuote = quoteDraft.trim() || DEFAULT_QUOTE;
    localStorage.setItem(QUOTE_STORAGE_KEY, nextQuote);
    setQuote(nextQuote);
    setQuoteDraft(nextQuote);
    setQuoteEditorOpen(false);
  };

  return (
    <DesktopWallpaper>
      <main
        className={`phone-home fade-in${desktopGoal ? " phone-home--goal-widget" : ""}`}
        data-ui="desktop"
        style={
          {
            "--desktop-grid-gap": `${desktop.gridGap}px`,
            "--desktop-grid-columns": String(desktop.gridColumns),
            "--desktop-dock-size": `${desktop.dockSize}px`,
            "--desktop-dock-x": `${desktop.dockX}px`,
            "--desktop-dock-y": `${desktop.dockY}px`,
            "--desktop-dock-opacity": String(desktop.dockOpacity),
          } as React.CSSProperties
        }
      >
        <style>{safeScopedAppearanceCss(appearance.customCss, "desktop")}</style>
        <section className="phone-home__hero" data-ui="desktop-widgets" aria-label="日期与问候">
          {desktop.showTime && (
            <p className="phone-home__time" data-ui="desktop-time">
              {time}
            </p>
          )}
          {desktop.showDate && (
            <p className="phone-home__date" data-ui="desktop-date">
              {date.replace("星期", " · 星期")}
            </p>
          )}
          {desktop.showGreeting && (
            <p className="phone-home__hello" data-ui="desktop-greeting">
              {greeting()}，{profile?.display_name || "朋友"}
            </p>
          )}
        </section>

        <DesktopPages
          config={desktop}
          widget={
            desktopGoal ? (
              <GoalWidget
                goal={desktopGoal}
                today={localDate(now)}
                onOpen={() => {
                  void openSystemApp("goal", null, () =>
                    navigate({ to: "/goal", search: { id: desktopGoal.id } }),
                  );
                }}
              />
            ) : null
          }
        >
          <AppIcon
            label="此心一笺"
            subtitle="日记"
            icon={BookHeart}
            tone="paper"
            onClick={(event) => openApp("diary", event, () => navigate({ to: "/diary" }))}
          />
          <AppIcon
            label="番茄钟"
            subtitle="专注陪伴"
            icon={Timer}
            tone="focus"
            onClick={(event) => openApp("focus", event, () => navigate({ to: "/focus" }))}
          />
          <AppIcon
            label="一起听"
            subtitle="音乐陪伴"
            icon={Headphones}
            tone="listen"
            onClick={(event) => openApp("listen", event, () => navigate({ to: "/listen" }))}
          />
          <AppIcon
            label="聊天"
            subtitle="角色"
            icon={MessageCircle}
            tone="chat"
            onClick={(event) => openApp("chat", event, () => navigate({ to: "/chat", search: {} }))}
          />
          <AppIcon
            label="吃什么"
            subtitle="今天吃啥"
            icon={UtensilsCrossed}
            tone="food"
            onClick={(event) => openApp("food", event, () => navigate({ to: "/food" }))}
          />
          <AppIcon
            label="世界书"
            subtitle="设定与规则"
            icon={BookOpen}
            tone="world"
            onClick={(event) =>
              openApp("world-books", event, () => navigate({ to: "/world-books" }))
            }
          />
          <AppIcon
            label="美化"
            subtitle="桌面主题"
            icon={SwatchBook}
            tone="appearance"
            onClick={(event) => openApp("appearance", event, () => navigate({ to: "/appearance" }))}
          />
          <AppIcon
            label="规划"
            subtitle="目标与进度"
            icon={Target}
            tone="goal"
            onClick={(event) => openApp("goal", event, () => navigate({ to: "/goal", search: {} }))}
          />
          <AppIcon
            label="知识库"
            subtitle="想法与连接"
            icon={Library}
            tone="knowledge"
            onClick={(event) =>
              openApp("knowledge", event, () => navigate({ to: "/knowledge", search: {} }))
            }
          />
        </DesktopPages>

        {desktop.showQuote && (
          <button
            type="button"
            className="phone-home__quote"
            data-ui="desktop-quote"
            onClick={() => {
              setQuoteDraft(quote);
              setQuoteEditorOpen(true);
            }}
            aria-label="编辑桌面寄语"
          >
            <span aria-hidden>“</span>
            <p>{quote}</p>
          </button>
        )}

        <nav className="phone-dock" data-ui="dock" aria-label="系统应用">
          <DockIcon
            label="名册"
            icon={ContactRound}
            tone="roster"
            onClick={(event) => openApp("persona", event, () => navigate({ to: "/persona" }))}
          />
          <DockIcon
            label="壁纸"
            icon={Image}
            tone="wallpaper"
            onClick={(event) => openApp("wallpaper", event, () => navigate({ to: "/wallpaper" }))}
          />
          <DockIcon
            label="设置"
            icon={Settings}
            tone="settings"
            onClick={(event) => openApp("settings", event, () => navigate({ to: "/settings" }))}
          />
        </nav>
        <span className="phone-home__indicator" aria-hidden />

        <SystemModal
          open={quoteEditorOpen}
          title="桌面寄语"
          description="写一句此刻想留给自己的话。"
          onClose={() => setQuoteEditorOpen(false)}
        >
          <form
            className="quote-editor"
            onSubmit={(event) => {
              event.preventDefault();
              saveQuote();
            }}
          >
            <label htmlFor="desktop-quote">寄语内容</label>
            <textarea
              id="desktop-quote"
              value={quoteDraft}
              onChange={(event) => setQuoteDraft(event.target.value.slice(0, 60))}
              maxLength={60}
              rows={3}
              autoFocus
            />
            <div className="quote-editor__footer">
              <span>{quoteDraft.length}/60</span>
              <button type="submit">保存</button>
            </div>
          </form>
        </SystemModal>
      </main>
    </DesktopWallpaper>
  );
}

function AppIcon({
  label,
  subtitle,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  subtitle: string;
  icon: LucideIcon;
  tone: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const { user } = useAuth();
  const appearance = useDesktopAppearance(user?.id ?? "guest");
  const appId = tone === "paper" ? "diary" : tone;
  const visual = appearance.config.apps[appId] ?? {};
  const size = visual.size ?? appearance.config.iconSize;
  return (
    <button
      type="button"
      onClick={onClick}
      className="phone-app"
      data-ui="app"
      data-app-id={appId}
      aria-label={`${label}，${subtitle}`}
      style={{
        transform: `translate(${visual.x ?? 0}px, ${visual.y ?? 0}px) scale(${visual.scale ?? 1}) rotate(${visual.rotate ?? 0}deg)`,
        opacity: visual.opacity ?? 1,
      }}
    >
      <span
        className={`phone-app__icon phone-app__icon--${tone}`}
        data-ui="app-icon"
        style={{ width: size, height: size, borderRadius: `${visual.radius ?? 17}px` }}
      >
        {visual.iconUrl ? (
          <img src={visual.iconUrl} alt="" />
        ) : (
          <Icon size={Math.round(size * 0.54)} strokeWidth={1.8} />
        )}
      </span>
      {(visual.labelVisible ?? true) && (
        <span
          className="phone-app__label"
          data-ui="app-label"
          style={{ fontSize: `${visual.labelSize ?? 12}px` }}
        >
          {label}
        </span>
      )}
      <span className="phone-app__subtitle">{subtitle}</span>
    </button>
  );
}

function DockIcon({
  label,
  icon: Icon,
  tone,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  tone: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const { user } = useAuth();
  const appearance = useDesktopAppearance(user?.id ?? "guest");
  const visual = appearance.config.apps[tone] ?? {};
  return (
    <button
      type="button"
      className="phone-dock__app"
      data-ui="dock-app"
      data-app-id={tone}
      onClick={onClick}
      aria-label={label}
    >
      <span
        className={`phone-app__icon phone-app__icon--${tone}`}
        data-ui="app-icon"
        style={{ borderRadius: `${visual.radius ?? 17}px`, opacity: visual.opacity ?? 1 }}
      >
        {visual.iconUrl ? (
          <img src={visual.iconUrl} alt="" />
        ) : (
          <Icon size={27} strokeWidth={1.8} />
        )}
      </span>
    </button>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}
