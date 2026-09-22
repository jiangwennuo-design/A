import { useEffect, type RefObject } from "react";

/** iOS resizes the visual viewport for its keyboard, not always the layout viewport. */
export function useKeyboardViewport(ref: RefObject<HTMLElement | null>, ready = true) {
  useEffect(() => {
    const viewport = window.visualViewport;
    const element = ref.current;
    if (!ready || !viewport || !element) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (viewport.scale !== 1) return; // Don't interfere with pinch zoom.
        element.style.setProperty("--keyboard-height", `${viewport.height}px`);
        element.style.setProperty("--keyboard-top", `${viewport.offsetTop}px`);
      });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      element.style.removeProperty("--keyboard-height");
      element.style.removeProperty("--keyboard-top");
    };
  }, [ref, ready]);
}
