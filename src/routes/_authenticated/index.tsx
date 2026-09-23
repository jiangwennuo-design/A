import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BookHeart,
  ContactRound,
  Image,
  Headphones,
  MessageCircle,
  Settings,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { DesktopWallpaper } from "@/components/DesktopWallpaper";
import { SystemModal } from "@/components/system-ui";
import { openSystemApp } from "@/lib/app-transition";

const QUOTE_STORAGE_KEY = "cxyj-daily-quote";
const DEFAULT_QUOTE = "把想说的话，慢慢写进今天。";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [{ title: "此心一笺" }, { name: "description", content: "你的日记、聊天和个人空间。" }],
  }),
  component: PhoneHomePage,
});

function PhoneHomePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
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
      <main className="phone-home fade-in">
        <div className="phone-home__status" aria-hidden="true">
          <span>{time}</span>
          <span>此心系统</span>
        </div>

        <section className="phone-home__hero" aria-label="日期与问候">
          <p className="phone-home__time">{time}</p>
          <p className="phone-home__date">{date.replace("星期", " · 星期")}</p>
          <p className="phone-home__hello">
            {greeting()}，{profile?.display_name || "朋友"}
          </p>
        </section>

        <section className="phone-app-grid" aria-label="应用列表">
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
        </section>

        <button
          type="button"
          className="phone-home__quote"
          onClick={() => {
            setQuoteDraft(quote);
            setQuoteEditorOpen(true);
          }}
          aria-label="编辑桌面寄语"
        >
          <span aria-hidden>“</span>
          <p>{quote}</p>
        </button>

        <nav className="phone-dock" aria-label="系统应用">
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
  return (
    <button
      type="button"
      onClick={onClick}
      className="phone-app"
      aria-label={`${label}，${subtitle}`}
    >
      <span className={`phone-app__icon phone-app__icon--${tone}`}>
        <Icon size={31} strokeWidth={1.8} />
      </span>
      <span className="phone-app__label">{label}</span>
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
  return (
    <button type="button" className="phone-dock__app" onClick={onClick} aria-label={label}>
      <span className={`phone-app__icon phone-app__icon--${tone}`}>
        <Icon size={27} strokeWidth={1.8} />
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
