/**
 * Startup time of the release build: launches `target/release/vapor.exe` several times with
 * `VAPOR_TRACE_STARTUP` and prints the median of each stage (see `src-tauri/src/startup.rs`).
 * The dark window itself is on screen much earlier (~50 ms on the owner's machine).
 * Build first: `pnpm tauri build --no-bundle`. Windows only.
 *
 *   pnpm perf:startup [runs]
 */
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const RUNS = Number(process.argv[2] ?? 7);
const EXE = "src-tauri/target/release/vapor.exe";
const TRACE = resolve("artifacts/startup-trace.jsonl");

interface Trace {
  processToNavigation: number;
  navigationToScript: number;
  scriptToLibrary: number;
  libraryToRender: number;
  renderToFont: number;
  fontToContent: number;
  total: number;
}

function readTraces(): Trace[] {
  if (!existsSync(TRACE)) return [];
  return readFileSync(TRACE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Trace);
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

mkdirSync("artifacts", { recursive: true });
rmSync(TRACE, { force: true });

for (let run = 0; run < RUNS; run++) {
  const app = spawn(EXE, { env: { ...process.env, VAPOR_TRACE_STARTUP: TRACE }, stdio: "ignore" });
  const deadline = Date.now() + 10_000;
  while (readTraces().length <= run && Date.now() < deadline) await sleep(50);
  await sleep(500);
  if (app.pid) execSync(`taskkill /pid ${app.pid} /T /F`, { stdio: "ignore" });
  await sleep(1000);
}

const traces = readTraces();
if (traces.length === 0) throw new Error("No startup trace recorded");
const stages: (keyof Trace)[] = [
  "processToNavigation",
  "navigationToScript",
  "scriptToLibrary",
  "libraryToRender",
  "renderToFont",
  "fontToContent",
  "total",
];
console.log(`release build, ${traces.length} runs (first run includes cold caches)`);
for (const stage of stages) {
  const values = traces.map((trace) => trace[stage]);
  console.log(
    `${stage.padEnd(20)} median ${median(values).toFixed(0).padStart(4)} ms   runs: ${values.map((v) => v.toFixed(0)).join(", ")}`,
  );
}
