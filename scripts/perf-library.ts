/**
 * Performance check of the Library page against the budgets in CLAUDE.md, with a synthetic
 * library (default 3,000 games): scroll smoothness over the virtualized grid and the latency of
 * facet clicks and search. Windows only.
 *
 *   pnpm perf:library [games] [--release]   (--release: measure target/release/vapor.exe)
 */
import type { Page } from "playwright-core";
import { withApp } from "./lib/app.ts";

const args = process.argv.slice(2);
const RELEASE = args.includes("--release");
const GAMES = Number(args.find((arg) => /^d+$/.test(arg)) ?? 3000);
const SCROLL_MS = 4000;

interface FrameStats {
  frames: number;
  fps: number;
  p95: number;
  worst: number;
  over20ms: number;
}

/** Scrolls the page at a steady speed for `SCROLL_MS` and records frame intervals. */
function measureScroll(page: Page): Promise<FrameStats> {
  return page.evaluate(async (duration) => {
    const library = document.getElementById("library");
    if (!library) throw new Error("#library missing");
    window.scrollTo(0, library.offsetTop);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const start = window.scrollY;
    const distance = document.body.scrollHeight - innerHeight - start;
    const intervals: number[] = [];
    await new Promise<void>((resolve) => {
      const t0 = performance.now();
      let last = t0;
      const step = (now: number) => {
        intervals.push(now - last);
        last = now;
        const progress = Math.min(1, (now - t0) / duration);
        window.scrollTo(0, start + distance * progress);
        if (progress < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    intervals.shift();
    const sorted = [...intervals].sort((a, b) => a - b);
    const total = intervals.reduce((sum, value) => sum + value, 0);
    return {
      frames: intervals.length,
      fps: Math.round((intervals.length / total) * 1000),
      p95: Number((sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(1)),
      worst: Number((sorted.at(-1) ?? 0).toFixed(1)),
      over20ms: intervals.filter((value) => value > 20).length,
    };
  }, SCROLL_MS);
}

interface InteractionTiming {
  /** Event handler + React render and commit (synchronous for discrete events). */
  js: number;
  /** Style recalculation + layout forced right after. */
  layout: number;
  /** Until the next frame was painted. */
  total: number;
}

/** Time from a user action to the next painted frame, split into JS, layout and the rest. */
function measureInteraction(
  page: Page,
  action: "chip" | "search",
  arg: string,
): Promise<InteractionTiming> {
  return page.evaluate(
    async ([kind, value]) => {
      const nextPaint = () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(() => resolve(), 0)));
      await nextPaint();
      const t0 = performance.now();
      if (kind === "chip") {
        const chip = [...document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
          (button) => button.textContent?.startsWith(value),
        );
        if (!chip) throw new Error(`chip ${value} not found`);
        chip.click();
      } else {
        const input = document.querySelector<HTMLInputElement>("input[type=search]");
        if (!input) throw new Error("search missing");
        // React tracks the value; the native setter makes the change visible to it.
        // eslint-disable-next-line @typescript-eslint/unbound-method -- called with `input` below
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const t1 = performance.now();
      void document.body.offsetHeight;
      const t2 = performance.now();
      await nextPaint();
      const round = (value: number) => Number(value.toFixed(1));
      return { js: round(t1 - t0), layout: round(t2 - t1), total: round(performance.now() - t0) };
    },
    [action, arg] as const,
  );
}

await withApp(
  async (page) => {
    await page.evaluate(
      (count) => localStorage.setItem("vapor.syntheticGames", String(count)),
      GAMES,
    );
    await page.reload();
    await page.waitForSelector("#library");
    const count = await page.locator("#library h2 + span").textContent();
    console.log(`${RELEASE ? "release" : "dev"} build, library: ${count}`);

    const scroll = await measureScroll(page);
    console.log(
      `scroll: ${scroll.fps} fps over ${scroll.frames} frames, p95 ${scroll.p95} ms, worst ${scroll.worst} ms, ${scroll.over20ms} frames > 20 ms`,
    );

    await page.evaluate(() =>
      window.scrollTo(0, document.getElementById("library")?.offsetTop ?? 0),
    );
    const timings = {
      "chip on": await measureInteraction(page, "chip", "Indie"),
      "chip off": await measureInteraction(page, "chip", "Indie"),
      search: await measureInteraction(page, "search", "hollow"),
      clear: await measureInteraction(page, "search", ""),
    };
    for (const [name, timing] of Object.entries(timings)) {
      console.log(
        `${name.padEnd(9)} js ${timing.js} ms, layout ${timing.layout} ms, to next paint ${timing.total} ms`,
      );
    }

    const memory = await page.evaluate(() => {
      const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      return heap ? Math.round(heap.usedJSHeapSize / 1024 / 1024) : null;
    });
    console.log(`JS heap: ${memory ?? "n/a"} MB`);

    await page.evaluate(() => localStorage.removeItem("vapor.syntheticGames"));
  },
  { release: RELEASE },
);
