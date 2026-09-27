import { useState } from "react";

export function DiaryAvatar({ name, url }: { name: string; url: string | null | undefined }) {
  const [failedUrl, setFailedUrl] = useState("");
  return url && url !== failedUrl ? (
    <img className="diary-avatar" src={url} alt="" onError={() => setFailedUrl(url)} />
  ) : (
    <span className="diary-avatar diary-avatar--fallback" aria-hidden="true">
      {Array.from(name)[0] || "我"}
    </span>
  );
}
