import { useEffect, useRef, useState } from "react";
import { loadStickerPreview } from "@/lib/stickers/image-cache";

export function StickerImage({ path, name }: { path: string; name: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    let started = false;
    setUrl("");
    setFailed(false);
    const load = () => {
      if (started) return;
      started = true;
      void loadStickerPreview(path)
        .then((blob) => {
          if (!alive) return;
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        })
        .catch(() => {
          if (alive) setFailed(true);
        });
    };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                observer?.disconnect();
                load();
              }
            },
            { root: ref.current?.closest(".system-sheet__body") ?? null, rootMargin: "160px" },
          );
    if (observer && ref.current) observer.observe(ref.current);
    else load();
    return () => {
      alive = false;
      observer?.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, attempt]);
  return (
    <img
      ref={ref}
      src={url || undefined}
      alt={failed ? `${name}（轻点重试图片）` : name}
      width={66}
      height={66}
      decoding="async"
      onError={() => setFailed(true)}
      onClick={
        failed
          ? (event) => {
              event.stopPropagation();
              setAttempt((value) => value + 1);
            }
          : undefined
      }
    />
  );
}
