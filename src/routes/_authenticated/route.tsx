import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

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
  const { profile } = useAuth();
  const [wallpaper, setWallpaper] = useState("");
  useEffect(() => {
    if (!profile?.wallpaper_url) {
      setWallpaper("");
      return;
    }
    void supabase.storage
      .from("wallpapers")
      .createSignedUrl(profile.wallpaper_url, 3600)
      .then(({ data }) => setWallpaper(data?.signedUrl ?? ""));
  }, [profile?.wallpaper_url]);
  const opacity = Math.min(0.75, Math.max(0, Number(profile?.wallpaper_opacity ?? 0.18)));
  const blur = Math.min(24, Math.max(0, Number(profile?.wallpaper_blur ?? 0)));
  return (
    <div className="phone-stage">
      <div className="phone-shell">
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={
            wallpaper
              ? {
                  backgroundImage: `url(${wallpaper})`,
                  filter: `blur(${blur}px)`,
                  transform: blur ? "scale(1.04)" : undefined,
                }
              : undefined
          }
        />
        {wallpaper && <div aria-hidden className="absolute inset-0 bg-white" style={{ opacity }} />}
        <div className="relative min-h-[100dvh]">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
