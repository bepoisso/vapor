/**
 * Fails when the frontend bundle outgrows its budget: startup JavaScript is parsed and evaluated
 * before the library can render (see the performance budgets in CLAUDE.md). Run after
 * `pnpm build`.
 *
 *   pnpm check:bundle
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/** Budgets with headroom over the Phase 6 size (346 KB raw, 111 KB gzip). */
const MAX_RAW_KB = 380;
const MAX_GZIP_KB = 125;

const dir = "dist/assets";
const scripts = readdirSync(dir).filter((file) => file.endsWith(".js"));
if (scripts.length === 0) throw new Error(`No JavaScript in ${dir}: run pnpm build first`);

let failed = false;
for (const file of scripts) {
  const bytes = readFileSync(join(dir, file));
  const raw = bytes.length / 1024;
  const gzip = gzipSync(bytes, { level: 9 }).length / 1024;
  const over = raw > MAX_RAW_KB || gzip > MAX_GZIP_KB;
  failed ||= over;
  console.log(
    `${over ? "OVER " : "ok   "} ${file}: ${raw.toFixed(1)} KB (budget ${MAX_RAW_KB}), ${gzip.toFixed(1)} KB gzip (budget ${MAX_GZIP_KB})`,
  );
}
if (failed) process.exit(1);
