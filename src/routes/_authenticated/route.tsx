import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Restore the persisted local session first. Server functions still validate
    // the access token, while a slow mobile network no longer causes a false logout.
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    const theme =
      pathname === "/" ? "#f2eee7" : pathname.startsWith("/chat") ? "#f7f7f8" : "#faf8f5";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme);
  }, [pathname]);

  return (
    <div className="phone-stage">
      <div className="phone-shell">
        <Outlet />
      </div>
    </div>
  );
}
