export function DiaryAvatar({ name, url }: { name: string; url: string | null | undefined }) {
  return url ? (
    <img className="diary-avatar" src={url} alt="" />
  ) : (
    <span className="diary-avatar diary-avatar--fallback" aria-hidden="true">
      {Array.from(name)[0] || "我"}
    </span>
  );
}
