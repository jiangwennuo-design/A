import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  preloadWallpaperUrl,
  resolveWallpaperUrl,
  syncWallpaperFromProfile,
  useWallpaperSnapshot,
} from "@/lib/wallpaper";

/** Wallpaper belongs to the launcher only, never to the authenticated app shell. */
export const DesktopWallpaper = memo(function DesktopWallpaper({
  children,
}: {
  children: ReactNode;
}) {
  const { profile } = useAuth();
  const wallpaper = useWallpaperSnapshot();
  const [displayedUrl, setDisplayedUrl] = useState(wallpaper.url);
  const [previousUrl, setPreviousUrl] = useState("");
  const displayedRef = useRef(displayedUrl);

  useEffect(() => {
    syncWallpaperFromProfile(profile);
  }, [profile]);

  useEffect(() => {
    let active = true;
    if (!wallpaper.path) {
      setPreviousUrl(displayedRef.current);
      displayedRef.current = "";
      setDisplayedUrl("");
      return;
    }
    const readyUrl = wallpaper.url
      ? preloadWallpaperUrl(wallpaper.url)
      : resolveWallpaperUrl(wallpaper.path);
    void readyUrl.then((url) => {
      if (!active || !url || url === displayedRef.current) return;
      setPreviousUrl(displayedRef.current);
      displayedRef.current = url;
      setDisplayedUrl(url);
    });
    return () => {
      active = false;
    };
  }, [wallpaper.path, wallpaper.url]);

  useEffect(() => {
    if (!previousUrl) return;
    const timer = window.setTimeout(() => setPreviousUrl(""), 180);
    return () => window.clearTimeout(timer);
  }, [displayedUrl, previousUrl]);

  const blur = wallpaper.blur;
  return (
    <div className={`desktop-wallpaper wallpaper-preset--${wallpaper.preset}`}>
      {previousUrl && (
        <div
          aria-hidden="true"
          className="desktop-wallpaper__image is-previous"
          style={{
            backgroundImage: `url(${previousUrl})`,
            filter: blur ? `blur(${blur}px)` : undefined,
            transform: blur ? "scale(1.06)" : undefined,
          }}
        />
      )}
      {displayedUrl && (
        <div
          aria-hidden="true"
          className="desktop-wallpaper__image is-current"
          style={{
            backgroundImage: `url(${displayedUrl})`,
            filter: blur ? `blur(${blur}px)` : undefined,
            transform: blur ? "scale(1.06)" : undefined,
          }}
        />
      )}
      {displayedUrl && (
        <div
          aria-hidden="true"
          className="desktop-wallpaper__veil"
          style={{ opacity: wallpaper.opacity }}
        />
      )}
      {children}
    </div>
  );
});
