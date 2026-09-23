import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LockKeyhole, Mail, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { discordLoginEnabled } from "@/lib/app-config";
import { ErrorBanner } from "@/components/ui-kit";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "登录 · K得机" },
      {
        name: "description",
        content: "登录你的私人小手机，记录生活，并和专属 AI 角色聊聊。",
      },
      { property: "og:title", content: "登录 · K得机" },
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
  const [leaving, setLeaving] = useState(false);
  const enterTimerRef = useRef<number | null>(null);

  const enterDesktop = useCallback(() => {
    if (enterTimerRef.current !== null) return;
    setLeaving(true);
    enterTimerRef.current = window.setTimeout(() => {
      void navigate({ to: "/" });
    }, 180);
  }, [navigate]);

  useEffect(() => {
    if (!authLoading && session) enterDesktop();
    return () => {
      if (enterTimerRef.current !== null) {
        window.clearTimeout(enterTimerRef.current);
        enterTimerRef.current = null;
      }
    };
  }, [authLoading, enterDesktop, session]);

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
        setInfo("登录成功，正在进入 K得机…");
        enterDesktop();
      } else if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;
        if (data.session) {
          setInfo("注册成功，正在进入 K得机…");
          enterDesktop();
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
  const modeTitle =
    mode === "login" ? "欢迎回来" : mode === "register" ? "创建你的空间" : "找回密码";
  const modeSubtitle =
    mode === "login"
      ? "继续回到属于你的小世界。"
      : mode === "register"
        ? "只需要邮箱和密码，就可以开始。"
        : "我们会把重置链接发送到你的邮箱。";

  return (
    <main className={`auth-screen ${leaving ? "is-leaving" : ""}`}>
      <div className="auth-orb auth-orb--blue" aria-hidden />
      <div className="auth-orb auth-orb--rose" aria-hidden />
      <section className="auth-panel">
        <header className="auth-brand">
          <div className="auth-brand__mark" aria-hidden>
            <Smartphone size={21} strokeWidth={1.7} />
          </div>
          <h1>K得机</h1>
          <p>把今天装进口袋。</p>
        </header>

        <div className="auth-card">
          <div className="auth-mode-switch" role="tablist" aria-label="登录或注册">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "is-active" : ""}
              onClick={() => {
                setMode("login");
                setError("");
                setInfo("");
              }}
            >
              登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={mode === "register" ? "is-active" : ""}
              onClick={() => {
                setMode("register");
                setError("");
                setInfo("");
              }}
            >
              注册
            </button>
          </div>

          <div className="auth-copy">
            <h2>{modeTitle}</h2>
            <p>{modeSubtitle}</p>
          </div>

          {error && <ErrorBanner message={error} />}
          {info && <div className="auth-info">{info}</div>}

          <form onSubmit={handleEmailAuth} className="auth-form">
            <label>
              <span>邮箱</span>
              <div className="auth-field">
                <Mail size={17} aria-hidden />
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                  inputMode="email"
                />
              </div>
            </label>

            {mode !== "reset" && (
              <label>
                <span>密码</span>
                <div className="auth-field">
                  <LockKeyhole size={17} aria-hidden />
                  <input
                    type="password"
                    placeholder={mode === "register" ? "至少 6 个字符" : "输入密码"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={6}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                  />
                </div>
              </label>
            )}

            {mode !== "reset" && (
              <div className="auth-forgot-row">
                {mode === "login" && (
                  <button
                    type="button"
                    className="auth-forgot"
                    onClick={() => {
                      setMode("reset");
                      setError("");
                      setInfo("");
                    }}
                  >
                    忘记密码？
                  </button>
                )}
              </div>
            )}

            <button type="submit" disabled={loading} className="auth-primary">
              {loading && <span className="auth-submit__spinner" aria-hidden />}
              <span>{loading ? "处理中…" : submitText}</span>
            </button>
          </form>

          {discordLoginEnabled && mode !== "reset" && (
            <>
              <div className="auth-divider">
                <span>或</span>
              </div>

              <button
                type="button"
                onClick={handleDiscordLogin}
                disabled={loading}
                className="auth-discord"
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="#5865F2" aria-hidden>
                  <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .373-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                <span>使用 Discord 登录</span>
              </button>
            </>
          )}

          <div className="auth-secondary-action">
            {mode === "reset" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError("");
                  setInfo("");
                }}
              >
                返回登录
              </button>
            ) : (
              <p>
                {mode === "login" ? "还没有账号？" : "已经有账号？"}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "login" ? "register" : "login");
                    setError("");
                    setInfo("");
                  }}
                >
                  {mode === "login" ? "注册" : "登录"}
                </button>
              </p>
            )}
          </div>
        </div>

        <p className="auth-footnote">一个安静、私人的日常空间</p>
      </section>
    </main>
  );
}

function translateError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "邮箱或密码不正确";
  if (msg.includes("User already registered")) return "该邮箱已注册，请直接登录";
  if (msg.includes("Email not confirmed")) return "邮箱未验证，请检查邮箱";
  if (msg.includes("Password should be at least")) return "密码至少需要 6 个字符";
  return msg;
}
