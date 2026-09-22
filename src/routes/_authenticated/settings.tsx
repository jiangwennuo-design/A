import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/context/AuthContext";
import { Header } from "@/components/ui-kit";
import {
  Mail,
  KeyRound,
  Cpu,
  Shield,
  LogOut,
  ChevronRight,
  Clock3,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { resolveAvatarUrl } from "@/lib/avatar";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "设置 · 此心一笺" },
      { name: "description", content: "查看账户信息、管理 AI 服务和日记隐私设置。" },
      { property: "og:title", content: "设置 · 此心一笺" },
      { property: "og:description", content: "查看账户信息、管理 AI 服务和日记隐私设置。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { profile, user, signOut, refreshProfile } = useAuth();
  const [avatar, setAvatar] = useState("");
  const [savingTime, setSavingTime] = useState(false);

  useEffect(() => {
    let active = true;
    void resolveAvatarUrl(profile?.avatar_url).then((url) => {
      if (active) setAvatar(url);
    });
    return () => {
      active = false;
    };
  }, [profile?.avatar_url]);

  const provider = user?.app_metadata?.provider || "email";

  return (
    <div className="page-container">
      <div className="fade-in">
        <Header title="设置" onBack={() => navigate({ to: "/" })} />

        <div className="card mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full overflow-hidden bg-[var(--color-primary)] flex items-center justify-center text-white text-xl font-medium">
              {avatar ? (
                <img src={avatar} alt="我的头像" className="w-full h-full object-cover" />
              ) : (
                (profile?.display_name || user?.email || "?").charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <p className="font-medium text-[var(--color-text)]">
                {profile?.display_name || "未设置昵称"}
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">{user?.email}</p>
            </div>
          </div>
        </div>

        <SectionTitle>账户</SectionTitle>
        <div className="card divide-y divide-[var(--color-border)] mb-6">
          <SettingRow icon={Mail} label="邮箱" value={user?.email || ""} />
          <SettingRow
            icon={KeyRound}
            label="登录方式"
            value={provider === "discord" ? "Discord" : "邮箱密码"}
          />
        </div>

        <SectionTitle>AI 服务</SectionTitle>
        <div className="card divide-y divide-[var(--color-border)] mb-6">
          <SettingRowLink
            icon={Cpu}
            label="AI 配置"
            onClick={() => navigate({ to: "/ai-settings" })}
          />
        </div>

        <SectionTitle>隐私</SectionTitle>
        <div className="card divide-y divide-[var(--color-border)] mb-6">
          <SettingRow icon={Shield} label="日记隐私" value="仅你自己可见" />
          <SettingRow icon={Shield} label="AI 读取" value="需你主动授权" />
        </div>

        <SectionTitle>聊天体验</SectionTitle>
        <div className="card mb-6">
          <div className="flex items-center justify-between gap-4 py-1">
            <div className="flex items-start gap-3">
              <Clock3 size={18} className="mt-0.5 shrink-0 text-[var(--color-text-secondary)]" />
              <div>
                <p className="text-sm text-[var(--color-text)]">真实时间感知</p>
                <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                  让角色理解当前时间和距离上次聊天的间隔
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={profile?.time_awareness_enabled !== false}
              aria-label="真实时间感知"
              disabled={savingTime}
              className={`settings-switch ${profile?.time_awareness_enabled !== false ? "is-on" : ""}`}
              onClick={async () => {
                if (!user) return;
                setSavingTime(true);
                const timezone =
                  Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
                // Added by the companion-app database migration.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error } = await (supabase as any)
                  .from("profiles")
                  .update({
                    time_awareness_enabled: profile?.time_awareness_enabled === false,
                    timezone,
                  })
                  .eq("id", user.id);
                if (!error) await refreshProfile();
                setSavingTime(false);
              }}
            >
              <span />
            </button>
          </div>
        </div>

        <button
          onClick={async () => {
            await signOut();
            void navigate({ to: "/auth" });
          }}
          className="w-full p-4 rounded-2xl bg-white border border-[var(--color-border)] flex items-center justify-center gap-2 text-[var(--color-error)] font-medium"
        >
          <LogOut size={18} />
          <span>退出登录</span>
        </button>

        <p className="text-center text-xs text-[var(--color-text-secondary)] mt-8">此心一笺 v1.0</p>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm font-medium text-[var(--color-text-secondary)] mb-2 px-1">{children}</p>
  );
}

function SettingRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <div className="flex items-center gap-3">
        <Icon size={18} className="text-[var(--color-text-secondary)]" />
        <span className="text-sm text-[var(--color-text)]">{label}</span>
      </div>
      <span className="text-sm text-[var(--color-text-secondary)]">{value}</span>
    </div>
  );
}

function SettingRowLink({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex items-center justify-between w-full py-3.5">
      <div className="flex items-center gap-3">
        <Icon size={18} className="text-[var(--color-text-secondary)]" />
        <span className="text-sm text-[var(--color-text)]">{label}</span>
      </div>
      <ChevronRight size={18} className="text-[var(--color-text-secondary)]" />
    </button>
  );
}
