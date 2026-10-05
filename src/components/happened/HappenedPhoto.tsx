import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { resolveSignedMediaUrl } from "@/lib/signed-media";
import { readMediaBlob } from "@/lib/media-cache";

export function HappenedPhoto({ path, onOpen }: { path: string; onOpen?: (url: string) => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    let started = false;
    setUrl("");
    setFailed(false);
    const load = async () => {
      if (started) return;
      started = true;
      try {
        const blob = await readMediaBlob("chat-media", path);
        if (!active) return;
        const resolved = blob
          ? (objectUrl = URL.createObjectURL(blob))
          : await resolveSignedMediaUrl("chat-media", path);
        if (active) {
          setUrl(resolved);
          setFailed(!resolved);
        }
      } catch {
        if (active) setFailed(true);
      }
    };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                observer?.disconnect();
                void load();
              }
            },
            { rootMargin: "100px" },
          );
    if (observer && ref.current) observer.observe(ref.current);
    else void load();
    return () => {
      active = false;
      observer?.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return (
    <span ref={ref} className="happened-photo">
      {failed ? (
        <ImageOff size={16} aria-label="图片暂不可用" />
      ) : url ? (
        <img
          src={url}
          alt="记录照片"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-label="图片加载中" />
      )}
      {onOpen && url && !failed && (
        <button
          type="button"
          aria-label="查看照片"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(url);
          }}
        />
      )}
    </span>
  );
}
