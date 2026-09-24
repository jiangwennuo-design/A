import { useState } from "react";
import { Check, History, Trash2 } from "lucide-react";
import type { FocusSession } from "@/lib/types";

const labels = { focus: "专注", short_break: "短休息", long_break: "长休息" } as const;

export function FocusHistory({
  sessions,
  onDelete,
  onClear,
}: {
  sessions: FocusSession[];
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const [managing, setManaging] = useState(false);
  return (
    <section className="focus-history">
      <header>
        <h2>
          <History size={18} /> 历史记录
        </h2>
        {sessions.length > 0 && (
          <button type="button" onClick={() => setManaging((value) => !value)}>
            {managing ? "完成" : "管理"}
          </button>
        )}
      </header>
      {sessions.length === 0 ? (
        <p className="focus-history__empty">完成一轮后，记录会出现在这里。</p>
      ) : (
        sessions.map((item) => (
          <div key={item.id} className="focus-history__row">
            <div>
              <strong>{item.title || labels[item.mode]}</strong>
              <span>
                {Math.round(item.elapsed_seconds / 60)} min · {formatDate(item.created_at)}
              </span>
            </div>
            <em className={`status-${item.status}`}>
              {item.status === "completed" ? (
                <>
                  <Check size={12} /> 完成
                </>
              ) : item.status === "reset" ? (
                "已结束"
              ) : (
                "未结束"
              )}
            </em>
            {managing && (
              <button
                type="button"
                aria-label="删除记录"
                onClick={() => onDelete(item.id)}
                className="focus-history__delete"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))
      )}
      {managing && sessions.length > 0 && (
        <button type="button" className="focus-history__clear" onClick={onClear}>
          清除全部记录
        </button>
      )}
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const prefix =
    date.toDateString() === today.toDateString()
      ? "今天"
      : `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${prefix} ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}
