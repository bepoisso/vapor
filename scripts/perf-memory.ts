/**
 * Memory of the release build with the local library, as a user opens it: Vapor's own process
 * plus every WebView2 process it owns, a few seconds after launch (no debugging port attached).
 * WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS can be set to try Chromium flags; note that it replaces
 * the flags Tauri passes by default. Build first: `pnpm tauri build --no-bundle`. Windows only.
 *
 *   pnpm perf:memory [runs]
 */
import { execFileSync, execSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const RUNS = Number(process.argv[2] ?? 3);
const EXE = resolve("src-tauri/target/release/vapor.exe");
const IDENTIFIER = "io.github.bepoisso.vapor";
const SETTLE_MS = 6000;

interface ProcessMemory {
  type: string;
  privateMb: number;
  workingSetMb: number;
}

/** Vapor and its WebView2 processes (WebView2 command lines carry the app's data folder). */
function sample(): ProcessMemory[] {
  const script = `
    $rows = Get-CimInstance Win32_Process | Where-Object {
      $_.Name -eq 'vapor.exe' -or ($_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -like '*${IDENTIFIER}*')
    } | ForEach-Object {
      $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
      if ($p) {
        $type = if ($_.Name -eq 'vapor.exe') { 'vapor' } elseif ($_.CommandLine -match '--type=([a-z-]+)') { $Matches[1] } else { 'browser' }
        [pscustomobject]@{ type = $type; privateMb = [math]::Round($p.PrivateMemorySize64 / 1MB); workingSetMb = [math]::Round($p.WorkingSet64 / 1MB) }
      }
    }
    ConvertTo-Json -InputObject @($rows) -Compress`;
  const out = execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" });
  return JSON.parse(out) as ProcessMemory[];
}

const totals: number[] = [];
let last: ProcessMemory[] = [];
for (let run = 0; run < RUNS; run++) {
  const app = spawn(EXE, { stdio: "ignore" });
  await sleep(SETTLE_MS);
  last = sample();
  totals.push(last.reduce((sum, row) => sum + row.privateMb, 0));
  if (app.pid) execSync(`taskkill /pid ${app.pid} /T /F`, { stdio: "ignore" });
  await sleep(2000);
}

console.log(`flags: ${process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS ?? "(Tauri defaults)"}`);
for (const row of [...last].sort((a, b) => b.privateMb - a.privateMb)) {
  console.log(
    `${row.type.padEnd(18)} private ${String(row.privateMb).padStart(4)} MB   working set ${String(row.workingSetMb).padStart(4)} MB`,
  );
}
console.log(`total private per run: ${totals.join(", ")} MB`);
