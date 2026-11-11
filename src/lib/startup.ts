import { isTauri } from "@tauri-apps/api/core";
import { commands } from "./bindings";

/**
 * Startup sequence. The native window opens right away with the app background color; the page
 * content stays transparent until the library has rendered with data and the font is ready,
 * then fades in (`html[data-ready]` in global.css). Timings go to the backend, which logs them
 * when `VAPOR_TRACE_STARTUP` is set.
 *
 * Import this module first in `main.tsx` so `scriptStart` is as early as possible.
 */

const scriptStart = performance.now();
let libraryLoaded: number | null = null;
let dataReady: number | null = null;
let fontReady: number | null = null;
let revealed = false;

/** Upper bound on how long the font may delay the reveal. It is preloaded, so this is rare. */
const FONT_WAIT_MS = 200;
/** Reveal anyway if the page never reports data (e.g. another route, or a stuck load). */
const REVEAL_FALLBACK_MS = 1500;

export function markLibraryLoaded(): void {
  libraryLoaded ??= performance.now();
}

export function markDataReady(): void {
  dataReady ??= performance.now();
}

function waitForAppFont(): Promise<unknown> {
  // `document.fonts` is missing in some environments (jsdom in tests).
  if (!("fonts" in document)) return Promise.resolve();
  const font = document.fonts.load('1em "Geist Variable"').catch(() => undefined);
  const timeout = new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS));
  return Promise.race([font, timeout]);
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export async function revealContent(): Promise<void> {
  if (revealed) return;
  revealed = true;
  await waitForAppFont();
  fontReady = performance.now();
  document.documentElement.dataset.ready = "";
  await nextPaint();
  const contentShown = performance.now();
  if (!isTauri()) return; // Plain browser: `pnpm dev` or tests.
  commands
    .reportStartup({
      navigationStart: performance.timeOrigin,
      scriptStart,
      libraryLoaded: libraryLoaded ?? contentShown,
      dataReady: dataReady ?? contentShown,
      fontReady,
      contentShown,
    })
    .catch(() => undefined);
}

export function scheduleRevealFallback(): void {
  setTimeout(() => void revealContent(), REVEAL_FALLBACK_MS);
}
