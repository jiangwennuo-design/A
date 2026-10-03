import { goalSummary, type Goal } from "@/lib/goals";
import { GoalProgress } from "./GoalProgress";
import "@/styles/goal-widget.css";

export function GoalWidget({
  goal,
  today,
  onOpen,
}: {
  goal: Goal;
  today: string;
  onOpen: () => void;
}) {
  const progress = goalSummary(goal, today);
  return (
    <button
      type="button"
      className="goal-widget"
      data-ui="goal-widget"
      data-goal-type={goal.type}
      onClick={onOpen}
      aria-label={`打开规划：${goal.title}`}
    >
      <span className="goal-widget__title" data-ui="goal-widget-title">
        {goal.title}
      </span>
      <span className="goal-widget__main" data-ui="goal-widget-main">
        {goal.type === "date" && !goal.completed && <small>还剩 </small>}
        {progress.main}
      </span>
      <GoalProgress percent={progress.percent} />
      <span className="goal-widget__detail" data-ui="goal-widget-detail">
        {progress.detail}
      </span>
      {goal.targetDate && (
        <span className="goal-widget__date" data-ui="goal-widget-date">
          {goal.targetDate}
        </span>
      )}
    </button>
  );
}
