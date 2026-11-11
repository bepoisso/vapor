import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { commands } from "./bindings";

/**
 * Startup sequence. The native window is created hidden with the app background color; it is
 * revealed once the library has rendered with data, the font is ready and a frame was painted.
 * Timings go to the backend, which logs them when `VAPOR_TRACE_STARTUP` is set.
 *
 * Import this module first in `main.tsx` so `scriptStart` is as early as possible.
 */

const scriptStart = performance.now();
let libraryLoaded: number | null = null;
let dataReady: number | null = null;
let fontReady: number | null = null;
let revealed = false;

/** Upper bound on how long the font may delay the reveal. It is bundled, so this is rare. */
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
  const font = document.fonts.load('1em "Geist Variable"').catch(() => undefined);
  const timeout = new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS));
  return Promise.race([font, timeout]);
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export async function revealWindow(): Promise<void> {
  if (revealed || !isTauri()) return; // Plain browser: `pnpm dev` or tests.
  revealed = true;
  await waitForAppFont();
  fontReady = performance.now();
  await nextPaint();
  await getCurrentWindow().show();
  const windowShown = performance.now();
  commands
    .reportStartup({
      navigationStart: performance.timeOrigin,
      scriptStart,
      libraryLoaded: libraryLoaded ?? windowShown,
      dataReady: dataReady ?? windowShown,
      fontReady: fontReady ?? windowShown,
      windowShown,
    })
    .catch(() => undefined);
}

export function scheduleRevealFallback(): void {
  setTimeout(() => void revealWindow(), REVEAL_FALLBACK_MS);
}
