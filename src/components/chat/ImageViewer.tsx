import { X } from "lucide-react";

export function ImageViewer({
  url,
  alt,
  onClose,
}: {
  url: string;
  alt: string;
  onClose: () => void;
}) {
  if (!url) return null;
  return (
    <div
      className="image-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      onClick={onClose}
    >
      <button type="button" aria-label="关闭图片" onClick={onClose}>
        <X size={24} />
      </button>
      <img src={url} alt={alt} onClick={(event) => event.stopPropagation()} />
    </div>
  );
}
