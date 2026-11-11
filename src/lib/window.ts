import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Upper bound on how long the font may delay the first reveal. It is bundled, so this is rare. */
const FONT_WAIT_MS = 200;

function waitForAppFont(): Promise<unknown> {
  const font = document.fonts.load('1em "Geist Variable"').catch(() => undefined);
  const timeout = new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS));
  return Promise.race([font, timeout]);
}

/**
 * The native window is created hidden with the app background color, so there is no white flash.
 * Reveal it once the app font is ready and the first frame has actually been painted.
 */
export function showWindowAfterFirstPaint(): void {
  if (!isTauri()) return; // Plain browser: `pnpm dev` or tests.
  void waitForAppFont().then(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void getCurrentWindow().show();
      });
    });
  });
}
