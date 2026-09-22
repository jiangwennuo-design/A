import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { resolveAvatarUrl } from "@/lib/avatar";

/** Wallpaper belongs to the launcher only, never to the authenticated app shell. */
export function DesktopWallpaper({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [image, setImage] = useState({ path: "", url: "" });
  const path = profile?.wallpaper_url || "";
  useEffect(() => {
    let active = true;
    void resolveAvatarUrl(path).then((url) => {
      if (active) setImage({ path, url });
    });
    return () => {
      active = false;
    };
  }, [path]);
  const url = image.path === path ? image.url : "";
  const blur = Math.min(24, Math.max(0, Number(profile?.wallpaper_blur ?? 0)));
  return (
    <div className={`desktop-wallpaper wallpaper-preset--${profile?.wallpaper_preset || "linen"}`}>
      {url && (
        <div
          aria-hidden="true"
          className="desktop-wallpaper__image"
          style={{
            backgroundImage: `url(${url})`,
            filter: blur ? `blur(${blur}px)` : undefined,
            transform: blur ? "scale(1.06)" : undefined,
          }}
        />
      )}
      {url && (
        <div
          aria-hidden="true"
          className="desktop-wallpaper__veil"
          style={{
            opacity: Math.min(0.75, Math.max(0, Number(profile?.wallpaper_opacity ?? 0.18))),
          }}
        />
      )}
      {children}
    </div>
  );
}
