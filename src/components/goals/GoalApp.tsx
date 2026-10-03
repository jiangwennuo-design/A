import { useRef, useState, type FormEvent } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  Pencil,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { SystemModal } from "@/components/system-ui";
import { useKeyboardViewport } from "@/hooks/useKeyboardViewport";
import {
  deleteGoal,
  goalSummary,
  localDate,
  patchGoal,
  saveGoal,
  setDesktopGoal,
  useGoals,
  useGoalToday,
  type Goal,
} from "@/lib/goals";
import { GoalProgress } from "./GoalProgress";
import "@/styles/goal-widget.css";
import "@/styles/goals.css";

function newGoal(): Goal {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    type: "date",
    title: "",
    note: "",
    startDate: "",
    targetDate: "",
    currentValue: 0,
    targetValue: 1,
    unit: "",
    completed: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function GoalApp({
  userId,
  selectedId,
  onOpen,
  onHome,
}: {
  userId: string;
  selectedId?: string | undefined;
  onOpen: (id?: string) => void;
  onHome: () => void;
}) {
  const state = useGoals(userId);
  const today = useGoalToday();
  const goal = state.goals.find((item) => item.id === selectedId);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const page = useRef<HTMLElement>(null);
  useKeyboardViewport(page);
  const run = (action: () => void) => {
    try {
      action();
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法保存规划，请重试。");
    }
  };
  const back = () => {
    setError("");
    if (editing) setEditing(null);
    else if (selectedId) onOpen();
    else onHome();
  };
  return (
    <main className="goal-app" ref={page}>
      <header className="goal-app__header">
        <button type="button" aria-label="返回" onClick={back}>
          <ChevronLeft size={23} />
        </button>
        <h1>
          {editing
            ? state.goals.some((item) => item.id === editing.id)
              ? "编辑规划"
              : "新建规划"
            : goal
              ? "规划详情"
              : "规划"}
        </h1>
        {editing ? (
          <button key="save" type="submit" form="goal-editor" className="goal-app__save">
            完成
          </button>
        ) : goal ? (
          <button key="edit" type="button" aria-label="编辑规划" onClick={() => setEditing(goal)}>
            <Pencil size={19} />
          </button>
        ) : (
          <button
            key="new"
            type="button"
            aria-label="新建规划"
            onClick={() => setEditing(newGoal())}
          >
            <Plus size={23} />
          </button>
        )}
      </header>
      <div className="goal-app__scroll">
        {error && (
          <p className="goal-app__error" role="alert">
            {error}
          </p>
        )}
        {editing ? (
          <GoalEditor
            key={editing.id}
            initial={editing}
            onSave={(value) =>
              run(() => {
                saveGoal(userId, value);
                setEditing(null);
                onOpen(value.id);
              })
            }
          />
        ) : goal ? (
          <>
            <GoalCard goal={goal} today={today} />
            {goal.note && (
              <section className="goal-app__card goal-app__note">
                <h2>备注</h2>
                <p>{goal.note}</p>
              </section>
            )}
            {goal.type === "number" && (
              <ProgressEditor
                key={`${goal.id}:${goal.currentValue}`}
                goal={goal}
                onSave={(currentValue) => run(() => patchGoal(userId, goal.id, { currentValue }))}
              />
            )}
            <section className="goal-app__card goal-app__actions">
              <button
                type="button"
                onClick={() =>
                  run(() => patchGoal(userId, goal.id, { completed: !goal.completed }))
                }
              >
                <CheckCircle2 size={19} />
                {goal.completed ? "取消完成" : "标记完成"}
              </button>
              <button
                type="button"
                onClick={() =>
                  run(() =>
                    setDesktopGoal(userId, state.desktopGoalId === goal.id ? null : goal.id),
                  )
                }
              >
                <Target size={19} />
                {state.desktopGoalId === goal.id ? "取消桌面 Widget" : "设置为桌面 Widget"}
              </button>
              <button type="button" className="is-danger" onClick={() => setDeleting(true)}>
                <Trash2 size={19} />
                删除规划
              </button>
            </section>
            <p className="goal-app__hint">创建于 {localDate(new Date(goal.createdAt))}</p>
          </>
        ) : state.goals.length ? (
          <div className="goal-app__list">
            {state.goals.map((item) => (
              <button
                type="button"
                className="goal-app__card-link"
                key={item.id}
                onClick={() => onOpen(item.id)}
                aria-label={`查看规划：${item.title}`}
              >
                <GoalCard goal={item} today={today} desktop={state.desktopGoalId === item.id} />
              </button>
            ))}
          </div>
        ) : (
          <div className="goal-app__empty">
            <Target size={38} strokeWidth={1.4} />
            <h2>把想做的事，慢慢完成</h2>
            <p>点击右上角 +，创建第一个规划。</p>
          </div>
        )}
      </div>
      <SystemModal
        open={deleting && !!goal}
        title="删除规划？"
        description="此操作无法撤销。若已设为桌面 Widget，也会一并移除。"
        onClose={() => setDeleting(false)}
      >
        <div className="goal-app__dialog-actions">
          <button type="button" onClick={() => setDeleting(false)}>
            取消
          </button>
          <button
            type="button"
            className="is-danger"
            onClick={() =>
              goal &&
              run(() => {
                deleteGoal(userId, goal.id);
                setDeleting(false);
                onOpen();
              })
            }
          >
            删除
          </button>
        </div>
      </SystemModal>
    </main>
  );
}

function GoalCard({
  goal,
  today,
  desktop = false,
}: {
  goal: Goal;
  today: string;
  desktop?: boolean;
}) {
  const progress = goalSummary(goal, today);
  return (
    <article className="goal-app__card goal-card" data-goal-type={goal.type}>
      <div className="goal-card__heading">
        <span>
          {goal.type === "date" ? <CalendarDays size={16} /> : <Target size={16} />}
          {goal.type === "date" ? "日期目标" : "数值目标"}
          {desktop && " · 桌面"}
        </span>
        {goal.completed && (
          <span>
            <Check size={15} />
            已完成
          </span>
        )}
      </div>
      <h2>{goal.title}</h2>
      <p className="goal-card__main">
        {goal.type === "date" && !goal.completed && <small>还剩 </small>}
        {progress.main}
      </p>
      <p className="goal-card__target">
        {goal.type === "date"
          ? `目标日期 ${goal.targetDate}`
          : `目标 ${goal.targetValue.toLocaleString("zh-CN")}${goal.unit}`}
      </p>
      <GoalProgress percent={progress.percent} />
      <div className="goal-card__footer">
        <span>{progress.detail}</span>
        {goal.type === "number" && goal.targetDate && (
          <time dateTime={goal.targetDate}>截止 {goal.targetDate}</time>
        )}
      </div>
      {goal.type === "date" && goal.startDate && (
        <p className="goal-app__hint">开始于 {goal.startDate}</p>
      )}
    </article>
  );
}

function ProgressEditor({ goal, onSave }: { goal: Goal; onSave: (value: number) => void }) {
  const [value, setValue] = useState(String(goal.currentValue));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim() && Number.isFinite(Number(value)) && Number(value) >= 0) onSave(Number(value));
  };
  return (
    <form className="goal-app__card goal-app__quick" onSubmit={submit}>
      <label htmlFor="goal-current">更新当前进度{goal.unit && `（${goal.unit}）`}</label>
      <div>
        <input
          id="goal-current"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          required
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="submit">更新</button>
      </div>
    </form>
  );
}

function GoalEditor({ initial, onSave }: { initial: Goal; onSave: (value: Goal) => void }) {
  const [draft, setDraft] = useState(initial);
  const [current, setCurrent] = useState(String(initial.currentValue));
  const [target, setTarget] = useState(String(initial.targetValue));
  const update = (patch: Partial<Goal>) => setDraft((value) => ({ ...value, ...patch }));
  return (
    <form
      id="goal-editor"
      className="goal-app__editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          ...draft,
          currentValue: Number(current),
          targetValue: Number(target),
          updatedAt: new Date().toISOString(),
        });
      }}
    >
      <section className="goal-app__card">
        <label>
          规划类型
          <select
            value={draft.type}
            onChange={(event) => update({ type: event.target.value as Goal["type"] })}
          >
            <option value="date">日期目标</option>
            <option value="number">数值目标</option>
          </select>
        </label>
        <label>
          标题
          <input
            required
            maxLength={120}
            placeholder="想完成什么？"
            value={draft.title}
            onChange={(event) => update({ title: event.target.value })}
          />
        </label>
      </section>
      <section className="goal-app__card">
        {draft.type === "date" ? (
          <>
            <label>
              开始日期（可选）
              <input
                type="date"
                max={draft.targetDate || undefined}
                value={draft.startDate}
                onChange={(event) => update({ startDate: event.target.value })}
              />
            </label>
            <label>
              目标日期
              <input
                type="date"
                required
                min={draft.startDate || undefined}
                value={draft.targetDate}
                onChange={(event) => update({ targetDate: event.target.value })}
              />
            </label>
            <p className="goal-app__hint">未填写开始日期时，从创建当天计算时间进度。</p>
          </>
        ) : (
          <>
            <label>
              当前数值
              <input
                type="number"
                inputMode="decimal"
                required
                min="0"
                step="any"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
              />
            </label>
            <label>
              目标数值
              <input
                type="number"
                inputMode="decimal"
                required
                min="0"
                step="any"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              />
            </label>
            <label>
              单位
              <input
                maxLength={30}
                placeholder="个单词 / 本书"
                value={draft.unit}
                onChange={(event) => update({ unit: event.target.value })}
              />
            </label>
            <label>
              截止日期（可选）
              <input
                type="date"
                value={draft.targetDate}
                onChange={(event) => update({ targetDate: event.target.value })}
              />
            </label>
          </>
        )}
      </section>
      <section className="goal-app__card">
        <label>
          简短备注（可选）
          <textarea
            rows={3}
            maxLength={2000}
            value={draft.note}
            onChange={(event) => update({ note: event.target.value })}
            placeholder="留一句话给自己"
          />
        </label>
      </section>
      <button type="submit" className="goal-app__primary">
        保存规划
      </button>
      <p className="goal-app__hint">规划按账号保存在当前浏览器中。</p>
    </form>
  );
}
