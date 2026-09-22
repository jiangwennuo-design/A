import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { discordLoginEnabled } from "@/lib/app-config";
import { ErrorBanner } from "@/components/ui-kit";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "登录 · 此心一笺" },
      {
        name: "description",
        content: "登录你的私人小手机，记录生活，并和专属 AI 角色聊聊。",
      },
      { property: "og:title", content: "登录 · 此心一笺" },
      {
        property: "og:description",
        content: "登录你的私人小手机，记录生活，并和专属 AI 角色聊聊。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

type Mode = "login" | "register" | "reset";

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (!authLoading && session) void navigate({ to: "/" });
  }, [authLoading, navigate, session]);

  async function handleEmailAuth(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.session) throw new Error("登录成功，但没有收到有效会话，请重试");
        setInfo("登录成功，正在进入日记本…");
        void navigate({ to: "/" });
      } else if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;
        if (data.session) {
          setInfo("注册成功，正在进入日记本…");
          void navigate({ to: "/" });
        } else {
          setInfo("注册成功！请先前往邮箱完成验证，再回来登录。");
          setMode("login");
        }
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setInfo("密码重置链接已发送到你的邮箱，请查收。");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "操作失败，请重试";
      setError(translateError(msg));
    } finally {
      setLoading(false);
    }
  }

  async function handleDiscordLogin() {
    setError("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "discord",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discord 登录失败");
      setLoading(false);
    }
  }

  const submitText = mode === "login" ? "登录" : mode === "register" ? "注册" : "发送重置链接";

  return (
    <div className="auth-screen">
      <div className="auth-panel fade-in">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--color-primary)] mb-4">
            <span className="text-3xl">✒️</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">此心一笺</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            记录生活，和你的角色一起度过日常
          </p>
        </div>

        {error && <ErrorBanner message={error} />}
        {info && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4">
            <p className="text-sm text-[var(--color-success)]">{info}</p>
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-3">
          <input
            type="email"
            placeholder="邮箱地址"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input-field"
            autoComplete="email"
          />

          {mode !== "reset" && (
            <input
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="input-field"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          )}

          <button type="submit" disabled={loading} className="btn-primary auth-submit">
            {loading && <span className="auth-submit__spinner" aria-hidden />}
            <span>{loading ? "处理中…" : submitText}</span>
          </button>
        </form>

        {discordLoginEnabled && (
          <>
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-[var(--color-border)]" />
              <span className="text-xs text-[var(--color-text-secondary)]">或</span>
              <div className="flex-1 h-px bg-[var(--color-border)]" />
            </div>

            <button
              type="button"
              onClick={handleDiscordLogin}
              disabled={loading}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#5865F2">
                <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .373-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              <span>使用 Discord 登录</span>
            </button>
          </>
        )}

        <div className="flex items-center justify-center gap-4 mt-6 text-sm">
          {mode !== "login" && (
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
                setInfo("");
              }}
              className="text-[var(--color-primary)]"
            >
              登录
            </button>
          )}
          {mode !== "register" && (
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError("");
                setInfo("");
              }}
              className="text-[var(--color-primary)]"
            >
              注册
            </button>
          )}
          {mode !== "reset" && (
            <button
              type="button"
              onClick={() => {
                setMode("reset");
                setError("");
                setInfo("");
              }}
              className="text-[var(--color-text-secondary)]"
            >
              找回密码
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function translateError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "邮箱或密码不正确";
  if (msg.includes("User already registered")) return "该邮箱已注册，请直接登录";
  if (msg.includes("Email not confirmed")) return "邮箱未验证，请检查邮箱";
  if (msg.includes("Password should be at least")) return "密码至少需要 6 个字符";
  return msg;
}
