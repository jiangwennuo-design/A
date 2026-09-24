import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { RotateCcw, Sparkles, UtensilsCrossed } from "lucide-react";
import { Header } from "@/components/ui-kit";
import { useAuth } from "@/context/AuthContext";
import { foodOptions } from "@/data/foodOptions";
import { resolveAvatarUrl } from "@/lib/avatar";
import { closeSystemApp } from "@/lib/app-transition";
import { generateFoodCompanionMessage } from "@/lib/companion.functions";
import { buildFoodWheelGradient, pickFoodIndex, rotationForFoodIndex } from "@/lib/food-wheel";
import type { AiPersona } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";

const CHAR_STORAGE_KEY = "kdeji-food-companion";
const DEFAULT_DURATION = 3_200;
const REDUCED_DURATION = 620;

export const Route = createFileRoute("/_authenticated/food")({
  head: () => ({ meta: [{ title: "吃什么 · K得机" }] }),
  component: FoodWheelPage,
});

interface PendingSpin {
  id: number;
  index: number;
  food: string;
  charId: string;
}

function FoodWheelPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const companion = useServerFn(generateFoodCompanionMessage);
  const [personas, setPersonas] = useState<AiPersona[]>([]);
  const [charId, setCharId] = useState(() =>
    typeof window === "undefined" ? "" : localStorage.getItem(CHAR_STORAGE_KEY) || "",
  );
  const [avatar, setAvatar] = useState("");
  const [rotation, setRotation] = useState(0);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState("");
  const [resultCharId, setResultCharId] = useState("");
  const [resultAvatar, setResultAvatar] = useState("");
  const [message, setMessage] = useState("");
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState("");
  const [replyError, setReplyError] = useState("");
  const lastIndex = useRef<number | null>(null);
  const spinSequence = useRef(0);
  const settledSequence = useRef(0);
  const pendingSpin = useRef<PendingSpin | null>(null);
  const settleTimer = useRef<number | null>(null);

  const selectedChar = personas.find((persona) => persona.id === charId);
  const resultChar = personas.find((persona) => persona.id === resultCharId);
  const wheelGradient = useMemo(() => buildFoodWheelGradient(foodOptions.length), []);
  const segmentAngle = foodOptions.length ? 360 / foodOptions.length : 0;

  useEffect(() => {
    if (!user) return;
    let active = true;
    void supabase
      .from("ai_personas")
      .select("*")
      .eq("user_id", user.id)
      .order("name")
      .then(({ data }) => {
        if (!active) return;
        const loaded = (data || []) as AiPersona[];
        setPersonas(loaded);
        setCharId((current) => {
          const next = loaded.some((persona) => persona.id === current)
            ? current
            : loaded[0]?.id || "";
          if (next) localStorage.setItem(CHAR_STORAGE_KEY, next);
          return next;
        });
      });
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    let active = true;
    void resolveAvatarUrl(selectedChar?.avatar_url).then((url) => {
      if (active) setAvatar(url);
    });
    return () => {
      active = false;
    };
  }, [selectedChar?.avatar_url]);

  useEffect(
    () => () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    },
    [],
  );

  const settle = useCallback(
    async (spin: PendingSpin) => {
      if (spin.id !== spinSequence.current || settledSequence.current === spin.id) return;
      settledSequence.current = spin.id;
      pendingSpin.current = null;
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
      setSpinning(false);
      setResult(spin.food);
      setResultCharId(spin.charId);
      if (!spin.charId) return;
      setReplying(true);
      try {
        const response = await companion({ data: { char_id: spin.charId, food: spin.food } });
        if (spin.id === spinSequence.current) setMessage(response.message);
      } catch (caught) {
        if (spin.id === spinSequence.current)
          setReplyError(caught instanceof Error ? caught.message : "角色暂时没有回应。");
      } finally {
        if (spin.id === spinSequence.current) setReplying(false);
      }
    },
    [companion],
  );

  function startSpin() {
    if (spinning) return;
    if (!foodOptions.length) {
      setError("暂时没有可以选择的食物。");
      return;
    }
    const index = pickFoodIndex(foodOptions.length, lastIndex.current);
    if (index < 0) {
      setError("暂时没有可以选择的食物。");
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nextDuration = reducedMotion ? REDUCED_DURATION : DEFAULT_DURATION;
    const extraTurns = reducedMotion ? 1 : 5 + Math.floor(Math.random() * 4);
    const spin: PendingSpin = {
      id: ++spinSequence.current,
      index,
      food: foodOptions[index]!,
      charId,
    };
    lastIndex.current = index;
    settledSequence.current = 0;
    pendingSpin.current = spin;
    setError("");
    setReplyError("");
    setMessage("");
    setResult("");
    setResultCharId(charId);
    setResultAvatar(avatar);
    setReplying(false);
    setDuration(nextDuration);
    setSpinning(true);
    setRotation((current) => rotationForFoodIndex(current, index, foodOptions.length, extraTurns));
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => void settle(spin), nextDuration + 160);
  }

  const wheelStyle = {
    "--food-wheel-gradient": wheelGradient,
    "--food-segment-angle": `${segmentAngle}deg`,
    "--food-wheel-rotation": `${rotation}deg`,
    "--food-wheel-duration": `${duration}ms`,
  } as CSSProperties;

  return (
    <main className="food-page fade-in">
      <Header
        title="吃什么"
        onBack={() => void closeSystemApp("food", () => navigate({ to: "/" }))}
        rightAction={<UtensilsCrossed size={20} aria-hidden />}
      />
      <p className="food-page__intro">让 TA 帮你决定今天吃啥。</p>

      <section className="food-companion-card" aria-labelledby="food-char-label">
        <span className="food-companion-card__avatar">
          {avatar ? (
            <img src={avatar} alt={selectedChar?.name || "角色"} />
          ) : (
            (selectedChar?.name || "伴").charAt(0)
          )}
        </span>
        <label id="food-char-label">
          <small>今天让谁帮你选？</small>
          <select
            value={charId}
            disabled={spinning}
            onChange={(event) => {
              setCharId(event.target.value);
              if (event.target.value) localStorage.setItem(CHAR_STORAGE_KEY, event.target.value);
              else localStorage.removeItem(CHAR_STORAGE_KEY);
            }}
          >
            <option value="">先自己转转</option>
            {personas.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="food-wheel-stage" aria-label={`包含 ${foodOptions.length} 种食物的转盘`}>
        <span className="food-wheel-pointer" aria-hidden />
        <div
          className={`food-wheel${spinning ? " is-spinning" : ""}`}
          style={wheelStyle}
          onTransitionEnd={(event) => {
            if (event.propertyName === "transform" && pendingSpin.current)
              void settle(pendingSpin.current);
          }}
        >
          <span className="food-wheel__ticks" aria-hidden />
          <span className="food-wheel__hub" aria-hidden>
            <UtensilsCrossed size={26} />
          </span>
        </div>
      </section>

      <button type="button" className="food-spin-button" disabled={spinning} onClick={startSpin}>
        {spinning ? "正在决定…" : result ? "再转一次" : "开始转"}
        {!spinning && result && <RotateCcw size={17} />}
      </button>
      {error && <p className="food-error">{error}</p>}

      <section className={`food-result${result ? " is-visible" : ""}`} aria-live="polite">
        {result ? (
          <>
            <small>今天吃</small>
            <h2>「{result}」</h2>
            {resultChar && (
              <div className="food-result__reply">
                <span className="food-result__avatar">
                  {resultAvatar ? (
                    <img src={resultAvatar} alt={resultChar.name} />
                  ) : (
                    resultChar.name.charAt(0)
                  )}
                </span>
                <div>
                  <b>{resultChar.name}</b>
                  {replying ? (
                    <p className="food-result__thinking">
                      <Sparkles size={13} /> 正在想怎么说…
                    </p>
                  ) : message ? (
                    <p>{message}</p>
                  ) : replyError ? (
                    <p className="food-result__error">{replyError}</p>
                  ) : null}
                </div>
              </div>
            )}
          </>
        ) : (
          <p>
            {spinning
              ? "答案正在靠近指针。"
              : `每次都从完整的 ${foodOptions.length} 种食物中决定。`}
          </p>
        )}
      </section>
    </main>
  );
}
