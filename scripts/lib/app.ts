import { execSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { type Browser, chromium, type Page } from "playwright-core";

const CDP_PORT = 9222;
/** Dev server (`pnpm tauri dev`). */
export const DEV_URL = "http://localhost:1420/";
/** Bundled frontend in a release build (WebView2 serves custom schemes over http). */
const RELEASE_URL = "http://tauri.localhost/";
const RELEASE_EXE = "src-tauri/target/release/vapor.exe";
const BOOT_TIMEOUT_MS = 10 * 60_000; // The first run compiles the Rust side.

async function waitForCdp(): Promise<void> {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await sleep(1000);
  }
  throw new Error("WebView2 never exposed its debugging port");
}

async function findAppPage(browser: Browser): Promise<Page> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const page = browser
      .contexts()[0]
      ?.pages()
      .find((candidate) => [DEV_URL, RELEASE_URL].some((url) => candidate.url().startsWith(url)));
    if (page) return page;
    await sleep(250);
  }
  throw new Error("App page not found");
}

export interface AppOptions {
  /** Run `target/release/vapor.exe` (build it first) instead of `pnpm tauri dev`. */
  release?: boolean;
  /** Serve the mockup's sample library instead of the local Steam install (reproducible). */
  sample?: boolean;
}

/**
 * Starts the app with WebView2 remote debugging, hands its page to `run`, then stops it.
 * Windows only (WebView2).
 */
export async function withApp(
  run: (page: Page) => Promise<void>,
  { release = false, sample = false }: AppOptions = {},
): Promise<void> {
  const app = spawn(release ? resolve(RELEASE_EXE) : "pnpm tauri dev", {
    shell: !release,
    stdio: "ignore",
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}`,
      ...(sample ? { VAPOR_LIBRARY: "sample" } : {}),
    },
  });
  let browser: Browser | undefined;
  try {
    await waitForCdp();
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    const page = await findAppPage(browser);
    await page.waitForSelector("#library", { timeout: 30_000 });
    await run(page);
  } finally {
    await browser?.close().catch(() => undefined);
    if (app.pid) execSync(`taskkill /pid ${app.pid} /T /F`, { stdio: "ignore" });
  }
}
