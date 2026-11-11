import { isTauri } from "@tauri-apps/api/core";
import { create } from "zustand";
import { commands, events, type Game } from "@/lib/bindings";
import { errorMessage } from "@/lib/errors";

type AppId = Game["appId"];

/** Give up on "Launching…" if Steam never reports the game running (crash, EULA, cancel). */
const LAUNCH_TIMEOUT_MS = 60_000;

interface SessionState {
  /** The game Steam reports as running. */
  runningAppId: AppId | null;
  /** A launch was requested and the game is not running yet. */
  launchingAppId: AppId | null;
  error: { appId: AppId; message: string } | null;
  play: (appId: AppId) => Promise<void>;
  install: (appId: AppId) => Promise<void>;
  setRunning: (appId: AppId | null) => void;
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  runningAppId: null,
  launchingAppId: null,
  error: null,
  play: async (appId) => {
    set({ launchingAppId: appId, error: null });
    try {
      await commands.launchGame(appId);
    } catch (error) {
      set({ launchingAppId: null, error: { appId, message: errorMessage(error) } });
      return;
    }
    setTimeout(() => {
      if (get().launchingAppId === appId) set({ launchingAppId: null });
    }, LAUNCH_TIMEOUT_MS);
  },
  install: async (appId) => {
    set({ error: null });
    try {
      await commands.installGame(appId);
    } catch (error) {
      set({ error: { appId, message: errorMessage(error) } });
    }
  },
  setRunning: (appId) =>
    set(({ launchingAppId }) => ({
      runningAppId: appId,
      launchingAppId: appId !== null && appId === launchingAppId ? null : launchingAppId,
    })),
}));

export type PlayState = "idle" | "launching" | "running";

export function usePlayState(appId: AppId): PlayState {
  return useSessionStore((state) =>
    state.runningAppId === appId
      ? "running"
      : state.launchingAppId === appId
        ? "launching"
        : "idle",
  );
}

/** Initial running game, then every change Steam reports. */
export function listenForRunningGame(): void {
  if (!isTauri()) return;
  const { setRunning } = useSessionStore.getState();
  void commands
    .getRunningGame()
    .then(setRunning)
    .catch(() => undefined);
  void events.runningGameChanged.listen((event) => setRunning(event.payload.appId));
}
