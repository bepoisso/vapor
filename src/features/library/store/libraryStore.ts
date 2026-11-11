import { isTauri } from "@tauri-apps/api/core";
import { create } from "zustand";
import { commands, events, type Game, type Profile, type SmartShelf } from "@/lib/bindings";
import { markLibraryLoaded } from "@/lib/startup";
import { withSyntheticGames } from "./synthetic";

type Status = "idle" | "loading" | "ready" | "error";

interface LibraryState {
  status: Status;
  games: readonly Game[];
  shelves: readonly SmartShelf[];
  profile: Profile | null;
  error: string | null;
  /** First load (shows the loading/error states). */
  load: () => Promise<void>;
  /** Background reload after the backend reported a change; keeps the current data on failure. */
  reload: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "Unknown error";
}

async function fetchLibrary() {
  const [games, shelves, profile] = await Promise.all([
    commands.getLibrary(),
    commands.listShelves(),
    commands.getProfile(),
  ]);
  return {
    games: withSyntheticGames(games),
    shelves: [...shelves].sort((a, b) => a.order - b.order),
    profile,
  };
}

/** Library data from the Rust backend. Started from `main.tsx`, before React renders. */
export const useLibraryStore = create<LibraryState>()((set, get) => ({
  status: "idle",
  games: [],
  shelves: [],
  profile: null,
  error: null,
  load: async () => {
    if (get().status === "loading") return;
    set({ status: "loading", error: null });
    try {
      const data = await fetchLibrary();
      markLibraryLoaded();
      set({ status: "ready", ...data });
    } catch (error) {
      set({ status: "error", error: errorMessage(error) });
    }
  },
  reload: async () => {
    try {
      set({ status: "ready", error: null, ...(await fetchLibrary()) });
    } catch {
      // Keep showing what we have; the next change event retries.
    }
  },
}));

/** Reload whenever the backend's background scan or file watcher finds a change. */
export function listenForLibraryUpdates(): void {
  if (!isTauri()) return;
  void events.libraryUpdated.listen(() => {
    void useLibraryStore.getState().reload();
  });
}
