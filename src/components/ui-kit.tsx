import type { ReactNode } from "react";

interface HeaderProps {
  title: string;
  onBack?: () => void;
  rightAction?: ReactNode;
}

export function Header({ title, onBack, rightAction }: HeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6 px-1">
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="text-[var(--color-text-secondary)] text-sm">
            ←
          </button>
        )}
        <h1 className="text-xl font-semibold text-[var(--color-text)]">{title}</h1>
      </div>
      {rightAction}
    </div>
  );
}

export function LoadingSpinner({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="w-6 h-6 border-2 border-[var(--color-border)] border-t-[var(--color-primary)] rounded-full animate-spin" />
      {text && <p className="text-sm text-[var(--color-text-secondary)]">{text}</p>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="text-4xl mb-4 opacity-40">{icon}</div>
      <p className="text-[var(--color-text)] font-medium mb-1">{title}</p>
      {subtitle && <p className="text-sm text-[var(--color-text-secondary)]">{subtitle}</p>}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
      <p className="text-sm text-[var(--color-error)]">{message}</p>
    </div>
  );
}
