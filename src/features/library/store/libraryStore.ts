import { isTauri } from "@tauri-apps/api/core";
import { create } from "zustand";
import {
  commands,
  type ErrorKind,
  events,
  type Game,
  type Profile,
  type SmartShelf,
  type SteamCollection,
} from "@/lib/bindings";
import { errorKind, errorMessage } from "@/lib/errors";
import { markLibraryLoaded } from "@/lib/startup";
import { withSyntheticGames } from "./synthetic";

type Status = "idle" | "loading" | "ready" | "error";

interface LibraryState {
  status: Status;
  games: readonly Game[];
  shelves: readonly SmartShelf[];
  /** The account's Steam collections (read-only). */
  collections: readonly SteamCollection[];
  profile: Profile | null;
  error: string | null;
  errorKind: ErrorKind | null;
  /** First load (shows the loading/error states). */
  load: () => Promise<void>;
  /** Background reload after the backend reported a change; keeps the current data on failure. */
  reload: () => Promise<void>;
  /** Creates (empty `id`) or updates a shelf. Throws on failure (the editor shows it). */
  saveShelf: (shelf: SmartShelf) => Promise<void>;
  deleteShelf: (id: string) => Promise<void>;
  /** Swaps two shelves (moving one past its visible neighbor). */
  swapShelves: (id: string, otherId: string) => Promise<void>;
}

const byOrder = (shelves: readonly SmartShelf[]) => [...shelves].sort((a, b) => a.order - b.order);

async function fetchLibrary() {
  const [games, shelves, collections, profile] = await Promise.all([
    commands.getLibrary(),
    commands.listShelves(),
    commands.listCollections(),
    commands.getProfile(),
  ]);
  return {
    games: withSyntheticGames(games),
    shelves: byOrder(shelves),
    collections,
    profile,
  };
}

/** Library data from the Rust backend. Started from `main.tsx`, before React renders. */
export const useLibraryStore = create<LibraryState>()((set, get) => ({
  status: "idle",
  games: [],
  shelves: [],
  collections: [],
  profile: null,
  error: null,
  errorKind: null,
  load: async () => {
    if (get().status === "loading") return;
    set({ status: "loading", error: null, errorKind: null });
    try {
      const data = await fetchLibrary();
      markLibraryLoaded();
      set({ status: "ready", ...data });
    } catch (error) {
      set({ status: "error", error: errorMessage(error), errorKind: errorKind(error) });
    }
  },
  reload: async () => {
    try {
      set({ status: "ready", error: null, errorKind: null, ...(await fetchLibrary()) });
    } catch {
      // Keep showing what we have; the next change event retries.
    }
  },
  saveShelf: async (shelf) => {
    set({ shelves: byOrder(await commands.saveShelf(shelf)) });
  },
  deleteShelf: async (id) => {
    set({ shelves: byOrder(await commands.deleteShelf(id)) });
  },
  swapShelves: async (id, otherId) => {
    const ids = get().shelves.map((shelf) => shelf.id);
    const from = ids.indexOf(id);
    const to = ids.indexOf(otherId);
    if (from < 0 || to < 0) return;
    ids[from] = otherId;
    ids[to] = id;
    set({ shelves: byOrder(await commands.reorderShelves(ids)) });
  },
}));

/** Reload whenever the backend's background scan or file watcher finds a change. */
export function listenForLibraryUpdates(): void {
  if (!isTauri()) return;
  void events.libraryUpdated.listen(() => {
    void useLibraryStore.getState().reload();
  });
}
