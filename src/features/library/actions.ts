import type { Game } from "@/lib/bindings";

type AppId = Game["appId"];

/** Launch a game through Steam. Wired to the backend in Phase 3 (`steam://rungameid`). */
export function playGame(appId: AppId): void {
  console.info(`[vapor] play ${appId}: launching arrives in Phase 3`);
}

/** Ask Steam to install a game. Wired to the backend in Phase 3 (`steam://install`). */
export function installGame(appId: AppId): void {
  console.info(`[vapor] install ${appId}: installing arrives in Phase 3`);
}
