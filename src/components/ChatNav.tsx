import { useNavigate, useRouterState } from "@tanstack/react-router";
import { MessageCircle, UserRound, UsersRound } from "lucide-react";

const items = [
  { label: "消息", path: "/chat", icon: MessageCircle },
  { label: "朋友圈", path: "/moments", icon: UsersRound },
  { label: "我的资料", path: "/profile", icon: UserRound },
] as const;

export function ChatNav() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav className="chat-nav" aria-label="聊天功能导航">
      {items.map(({ label, path, icon: Icon }) => {
        const selected = pathname === path || (path === "/chat" && pathname.startsWith("/chat"));
        return (
          <button
            key={path}
            type="button"
            aria-current={selected ? "page" : undefined}
            onClick={() =>
              path === "/chat" ? navigate({ to: "/chat", search: {} }) : navigate({ to: path })
            }
            className={selected ? "chat-nav__item is-active" : "chat-nav__item"}
          >
            <Icon size={20} strokeWidth={selected ? 2.4 : 2} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
