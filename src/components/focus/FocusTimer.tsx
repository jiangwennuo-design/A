import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

export const FocusTimer = memo(function FocusTimer({
  state,
  endAt,
  totalSeconds,
  pausedSeconds,
  onComplete,
}: {
  state: "idle" | "running" | "paused";
  endAt: number;
  totalSeconds: number;
  pausedSeconds: number;
  onComplete: () => void;
}) {
  const [display, setDisplay] = useState(state === "paused" ? pausedSeconds : totalSeconds);
  const completedFor = useRef(0);
  useEffect(() => {
    if (state !== "running") {
      setDisplay(state === "paused" ? pausedSeconds : totalSeconds);
      return;
    }
    const tick = () => {
      const next = Math.max(0, Math.ceil((endAt - Date.now()) / 1_000));
      setDisplay(next);
      if (next === 0 && completedFor.current !== endAt) {
        completedFor.current = endAt;
        onComplete();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [endAt, onComplete, pausedSeconds, state, totalSeconds]);
  const progress = totalSeconds ? Math.min(1, Math.max(0, 1 - display / totalSeconds)) : 0;
  const text = useMemo(
    () =>
      `${String(Math.floor(display / 60)).padStart(2, "0")}:${String(display % 60).padStart(2, "0")}`,
    [display],
  );
  return (
    <section
      className="focus-clock"
      style={{ "--progress": `${progress * 360}deg` } as CSSProperties}
    >
      <div>
        <strong>{text}</strong>
        <span>
          {state === "running"
            ? "专心做眼前的一件事"
            : state === "paused"
              ? "已暂停"
              : "准备好就开始"}
        </span>
      </div>
    </section>
  );
});
