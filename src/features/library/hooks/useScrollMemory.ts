import { useLayoutEffect } from "react";

/** Library scroll offset, kept while the app runs (the game page's Back restores it). */
let saved = 0;

/**
 * Restores the page's last scroll offset once its content is `ready`, then tracks it (at most
 * once per frame). Window scroll restoration is manual (`main.tsx`): the browser would restore
 * the offset before the library has rendered and clamp it.
 */
export function useScrollMemory(ready: boolean): void {
  useLayoutEffect(() => {
    if (!ready) return;
    if (saved > 0) window.scrollTo(0, saved);
    let frame = 0;
    const onScroll = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        saved = window.scrollY;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [ready]);
}
