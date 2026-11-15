/**
 * Visual check of the Library, Game and smart shelves screens against the reference mockups.
 * The shelf page compares pixel by pixel; the builder, "My shelves" and the save dialog start
 * from different states than their mockups, so their side-by-side images are for review.
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
const mockup = (file: string) => `${DEV_URL}mockups/${file}`;
const OUT_DIR = "artifacts/compare";

async function screenshot(page: Page, file: string, fullPage = true): Promise<PNG> {
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
  const buffer = await page.screenshot({ fullPage, animations: "disabled" });
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
  fullPage = true,
): Promise<void> {
  const prefix = name === "library" ? "" : `${name}-`;
  const appShot = await screenshot(page, `${prefix}app.png`, fullPage);
  const appUrl = page.url();

  await page.goto(mockupUrl);
  await page.waitForSelector(mockupReady);
  const mockShot = await screenshot(page, `${prefix}mockup.png`, fullPage);
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

    const open = async (hash: string, ready: string) => {
      await page.evaluate((target) => {
        window.location.hash = target;
      }, hash);
      await page.waitForSelector(ready);
    };
    // The mockup's shelf is the default "Demanding indies" (Indie + Hard).
    await open("#/shelf/demanding-indies", "text=Play a random one");
    await compare(page, "shelf", mockup("shelf.html"), "#grid .cover");
    await open("#/shelves", "text=My shelves");
    await compare(page, "shelves-manage", mockup("shelves-manage.html"), "#list .row");
    await open("#/shelves/new", "text=Live preview");
    await compare(page, "shelf-builder", mockup("shelf-builder.html"), "#grid .cover");

    // Save dialog: the mockup's filters are Mode = Coop and Vibe = Indie.
    await open("#/", "#library");
    await page.getByRole("button", { name: /^Coop, / }).click();
    await page.getByRole("button", { name: /^Indie, / }).click();
    await page.getByRole("button", { name: "Save as shelf" }).click();
    await page.waitForSelector("dialog[open]");
    await compare(page, "shelf-save", mockup("shelf-save-dialog.html"), "#dialog", false);
    console.log(`images in ${OUT_DIR}/`);
  },
  { sample: true },
);
