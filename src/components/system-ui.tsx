import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function SystemModal({
  open,
  title,
  description,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="system-overlay" role="presentation" onPointerDown={onClose}>
      <section
        className="system-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-modal-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="system-modal__header">
          <div>
            <h2 id="system-modal-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="system-icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function SystemSheet({
  open,
  title,
  description,
  children,
  onClose,
  scrollable = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  scrollable?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="system-sheet-overlay" role="presentation" onPointerDown={onClose}>
      <section
        className="system-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-sheet-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="system-sheet__handle" aria-hidden />
        <header className="system-sheet__header">
          <div>
            <h2 id="system-sheet-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="system-icon-button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        <div className={scrollable ? "system-sheet__body is-scrollable" : "system-sheet__body"}>
          {children}
        </div>
      </section>
    </div>
  );
}
