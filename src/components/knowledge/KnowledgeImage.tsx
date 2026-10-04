import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { resolveSignedMediaUrl } from "@/lib/signed-media";

export function KnowledgeImage({ path }: { path: string }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setFailed(false);
    setUrl("");
    if (/^https?:\/\//i.test(path)) {
      setUrl(path);
      return;
    }
    void resolveSignedMediaUrl("chat-media", path).then((value) => {
      if (active) {
        setUrl(value);
        setFailed(!value);
      }
    });
    return () => {
      active = false;
    };
  }, [path]);
  return failed ? (
    <span className="knowledge-image-error" role="img" aria-label="图片暂时无法读取">
      <ImageOff size={20} />
    </span>
  ) : url ? (
    <img
      src={url}
      alt="知识卡片附件"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="knowledge-image-placeholder" aria-label="图片加载中" />
  );
}
