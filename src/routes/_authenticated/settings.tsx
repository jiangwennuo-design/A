import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useAuth } from "@/context/AuthContext";
import { Header } from "@/components/ui-kit";
import {
  User,
  Mail,
  KeyRound,
  Bot,
  Cpu,
  Shield,
  LogOut,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "设置 · 此心一笺" },
      { name: "description", content: "查看账户信息、管理 AI 笔友人设和日记隐私设置。" },
      { property: "og:title", content: "设置 · 此心一笺" },
      { property: "og:description", content: "查看账户信息、管理 AI 笔友人设和日记隐私设置。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const { profile, user, signOut } = useAuth();

  const provider = user?.app_metadata?.provider || "email";

  return (
    <div className="page-container">
      <div className="fade-in">
        <Header title="设置" onBack={() => router.history.back()} />

        <div className="card mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white text-xl font-medium">
              {(profile?.display_name || user?.email || "?").charAt(0).toUpperCase()}
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
          <SettingRow icon={User} label="昵称" value={profile?.display_name || "未设置"} />
          <SettingRow icon={Mail} label="邮箱" value={user?.email || ""} />
          <SettingRow
            icon={KeyRound}
            label="登录方式"
            value={provider === "discord" ? "Discord" : "邮箱密码"}
          />
        </div>

        <SectionTitle>AI 笔友</SectionTitle>
        <div className="card divide-y divide-[var(--color-border)] mb-6">
          <SettingRowLink icon={Bot} label="人设板" onClick={() => navigate({ to: "/persona" })} />
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
