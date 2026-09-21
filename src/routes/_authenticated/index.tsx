import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BookHeart,
  ContactRound,
  Image,
  MessageCircle,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

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

  return (
    <main className="phone-home fade-in">
      <section className="phone-home__hero">
        <p className="phone-home__time">{time}</p>
        <p className="phone-home__date">{date}</p>
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
          onClick={() => navigate({ to: "/diary" })}
        />
        <AppIcon
          label="聊天"
          subtitle="笔友"
          icon={MessageCircle}
          tone="chat"
          onClick={() => navigate({ to: "/chat", search: {} })}
        />
        <AppIcon
          label="名册"
          subtitle="笔友人设"
          icon={ContactRound}
          tone="roster"
          onClick={() => navigate({ to: "/persona" })}
        />
        <AppIcon
          label="壁纸"
          subtitle="桌面外观"
          icon={Image}
          tone="wallpaper"
          onClick={() => navigate({ to: "/wallpaper" })}
        />
        <AppIcon
          label="设置"
          subtitle="账户与 AI"
          icon={Settings}
          tone="settings"
          onClick={() => navigate({ to: "/settings" })}
        />
      </section>

      <div className="phone-home__quote">
        <span aria-hidden>“</span>
        <p>把想说的话，慢慢写进今天。</p>
      </div>
      <span className="phone-home__indicator" aria-hidden />
    </main>
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
  onClick: () => void;
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

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}
