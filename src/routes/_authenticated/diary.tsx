import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { BookOpen, PenLine } from "lucide-react";
import { DiaryAvatar } from "@/components/DiaryAvatar";
import { DiaryProfileProvider, useDiaryProfile } from "@/context/DiaryProfileContext";
import { pushSystemPage } from "@/lib/app-transition";

export const Route = createFileRoute("/_authenticated/diary")({
  component: DiaryLayout,
});

function DiaryLayout() {
  return (
    <DiaryProfileProvider>
      <Outlet />
      <DiaryBottomNav />
    </DiaryProfileProvider>
  );
}

function DiaryBottomNav() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { diaryProfile, avatarUrl } = useDiaryProfile();
  if (pathname === "/diary/new" || /^\/diary\/[^/]+\/edit$/.test(pathname)) return null;
  const active =
    pathname.startsWith("/diary/me") || pathname === "/diary/profile-edit"
      ? "me"
      : pathname === "/diary/new"
        ? "write"
        : "diary";

  return (
    <nav className="diary-bottom-nav" aria-label="此心一笺导航">
      <button
        type="button"
        aria-label="日记"
        aria-current={active === "diary" ? "page" : undefined}
        onClick={() => void navigate({ to: "/diary" })}
      >
        <BookOpen size={26} strokeWidth={1.7} />
        {active === "diary" && <span className="diary-bottom-nav__dot" />}
      </button>
      <button
        type="button"
        className="diary-bottom-nav__write"
        aria-label="写日记"
        aria-current={active === "write" ? "page" : undefined}
        onClick={() => void pushSystemPage(() => navigate({ to: "/diary/new" }))}
      >
        <span>
          <PenLine size={27} strokeWidth={1.8} />
        </span>
        {active === "write" && <span className="diary-bottom-nav__dot" />}
      </button>
      <button
        type="button"
        aria-label="我的"
        aria-current={active === "me" ? "page" : undefined}
        onClick={() => void navigate({ to: "/diary/me" })}
      >
        <DiaryAvatar name={diaryProfile?.displayName || "我"} url={avatarUrl} />
        {active === "me" && <span className="diary-bottom-nav__dot" />}
      </button>
    </nav>
  );
}
