import type { CSSProperties } from "react";

export function GoalProgress({ percent }: { percent: number }) {
  const value = Math.min(100, Math.max(0, percent));
  return (
    <div
      className="goal-progress"
      data-ui="goal-widget-progress"
      role="progressbar"
      aria-label="规划进度"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
    >
      <span
        className="goal-progress__fill"
        data-ui="goal-widget-progress-fill"
        style={{ "--goal-progress": `${value}%` } as CSSProperties}
      />
    </div>
  );
}
