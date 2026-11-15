/**
 * Visual check of the Library and Game pages against the reference mockups.
 *
 * Screenshots the real app, then the mockup in the same engine and viewport, and writes
 * side-by-side and diff images to `artifacts/compare/` (git-ignored). Windows only (WebView2).
 *
 *   pnpm compare:mockup
 */
import { mkdirSync, writeFileSync } from "node:fs";
import pixelmatch from "pixelmatch";
import type { Page } from "playwright-core";
import { PNG } from "pngjs";
import { DEV_URL, withApp } from "./lib/app.ts";

const MOCKUP_URL = `${DEV_URL}mockups/library.html`;
const GAME_MOCKUP_URL = `${DEV_URL}mockups/game.html`;
const OUT_DIR = "artifacts/compare";

async function screenshot(page: Page, file: string): Promise<PNG> {
  await page.evaluate(() => document.fonts.ready);
  // Scroll through once so lazy images load.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(400);
  const buffer = await page.screenshot({ fullPage: true, animations: "disabled" });
  writeFileSync(`${OUT_DIR}/${file}`, buffer);
  return PNG.sync.read(buffer);
}

function crop(png: PNG, width: number, height: number): PNG {
  const out = new PNG({ width, height });
  PNG.bitblt(png, out, 0, 0, width, height, 0, 0);
  return out;
}

function sideBySide(left: PNG, right: PNG): PNG {
  const gap = 24;
  const out = new PNG({
    width: left.width + gap + right.width,
    height: Math.max(left.height, right.height),
  });
  out.data.fill(0xff);
  PNG.bitblt(left, out, 0, 0, left.width, left.height, 0, 0);
  PNG.bitblt(right, out, 0, 0, right.width, right.height, left.width + gap, 0);
  return out;
}

/** Screenshots the app page and the mockup, then writes diff and side-by-side images. */
async function compare(
  page: Page,
  name: string,
  mockupUrl: string,
  mockupReady: string,
): Promise<void> {
  const prefix = name === "library" ? "" : `${name}-`;
  const appShot = await screenshot(page, `${prefix}app.png`);
  const appUrl = page.url();

  await page.goto(mockupUrl);
  await page.waitForSelector(mockupReady);
  const mockShot = await screenshot(page, `${prefix}mockup.png`);
  await page.goto(appUrl);

  const width = Math.min(appShot.width, mockShot.width);
  const height = Math.min(appShot.height, mockShot.height);
  const diff = new PNG({ width, height });
  const changed = pixelmatch(
    crop(appShot, width, height).data,
    crop(mockShot, width, height).data,
    diff.data,
    width,
    height,
    { threshold: 0.15 },
  );
  writeFileSync(`${OUT_DIR}/${prefix}diff.png`, PNG.sync.write(diff));
  writeFileSync(
    `${OUT_DIR}/${prefix}side-by-side.png`,
    PNG.sync.write(sideBySide(appShot, mockShot)),
  );
  console.log(
    `${name}: app ${appShot.width}x${appShot.height}, mockup ${mockShot.width}x${mockShot.height}, ` +
      `pixels differing: ${((changed / (width * height)) * 100).toFixed(2)}%`,
  );
}

await withApp(
  async (page) => {
    mkdirSync(OUT_DIR, { recursive: true });
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    console.log(`viewport ${viewport.width}x${viewport.height}`);

    await compare(page, "library", MOCKUP_URL, "#library .cover");

    // The game page of the mockup is Celeste.
    await page.evaluate(() => {
      window.location.hash = "#/game/504230";
    });
    await page.waitForSelector("text=More like this");
    await compare(page, "game", GAME_MOCKUP_URL, "#similar .cover");
    console.log(`images in ${OUT_DIR}/`);
  },
  { sample: true },
);
