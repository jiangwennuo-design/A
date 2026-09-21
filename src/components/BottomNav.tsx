import { useNavigate, useRouterState } from "@tanstack/react-router";
import { BookOpen, MessageCircle, Settings } from "lucide-react";

const items = [
  {
    label: "日记",
    to: "/" as const,
    icon: BookOpen,
    active: (path: string) => path === "/" || path.startsWith("/diary"),
  },
  {
    label: "聊天",
    to: "/chat" as const,
    icon: MessageCircle,
    active: (path: string) => path.startsWith("/chat"),
  },
  {
    label: "设置",
    to: "/settings" as const,
    icon: Settings,
    active: (path: string) =>
      ["/settings", "/profile", "/persona", "/ai-settings"].some((prefix) =>
        path.startsWith(prefix),
      ),
  },
];

export function BottomNav() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav
      aria-label="主导航"
      className="fixed z-50 bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] border-t border-[var(--color-border)] bg-white/95 backdrop-blur"
    >
      <div
        className="grid grid-cols-3 h-[64px]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {items.map(({ label, to, icon: Icon, active }) => {
          const selected = active(pathname);
          return (
            <button
              key={label}
              type="button"
              aria-current={selected ? "page" : undefined}
              onClick={() =>
                to === "/chat" ? navigate({ to: "/chat", search: {} }) : navigate({ to })
              }
              className={`flex flex-col items-center justify-center gap-1 text-xs transition-colors ${selected ? "text-[var(--color-primary)] font-medium" : "text-[var(--color-text-secondary)]"}`}
            >
              <Icon size={20} strokeWidth={selected ? 2.4 : 2} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
