import { isTauri } from "@tauri-apps/api/core";
import { create } from "zustand";
import {
  commands,
  type ErrorKind,
  events,
  type Game,
  type Profile,
  type Shelf,
} from "@/lib/bindings";
import { errorKind, errorMessage } from "@/lib/errors";
import { markLibraryLoaded } from "@/lib/startup";
import { withSyntheticGames } from "./synthetic";

type Status = "idle" | "loading" | "ready" | "error";

interface LibraryState {
  status: Status;
  games: readonly Game[];
  /** Every shelf in saved order (smart, Favorites, imported Steam collections). */
  shelves: readonly Shelf[];
  profile: Profile | null;
  error: string | null;
  errorKind: ErrorKind | null;
  /** First load (shows the loading/error states). */
  load: () => Promise<void>;
  /** Background reload after the backend reported a change; keeps the current data on failure. */
  reload: () => Promise<void>;
  /**
   * Creates (empty `id`) or updates a shelf; returns the saved shelf. Throws on failure (the
   * editor shows it).
   */
  saveShelf: (shelf: Shelf) => Promise<Shelf | undefined>;
  deleteShelf: (id: string) => Promise<void>;
  /** Swaps two shelves (moving one past its visible neighbor). */
  swapShelves: (id: string, otherId: string) => Promise<void>;
  /** Puts the shelves in the order of `ids`. */
  reorderShelves: (ids: string[]) => Promise<void>;
  /** Adds the Steam collections as read-only shelves (hidden). */
  importSteamCollections: () => Promise<void>;
  /**
   * Saves a game's genre, modes and tags. Applied to the library at once, so shelves, moods
   * and facets follow while the user edits; reverted (and thrown) if saving fails.
   */
  setClassification: (
    appId: number,
    classification: Pick<Game, "genre" | "modes" | "tags">,
  ) => Promise<void>;
}

let savingClassification: Promise<unknown> = Promise.resolve();

const byOrder = (shelves: readonly Shelf[]) => [...shelves].sort((a, b) => a.order - b.order);

async function fetchLibrary() {
  const [games, shelves, profile] = await Promise.all([
    commands.getLibrary(),
    commands.listShelves(),
    commands.getProfile(),
  ]);
  return {
    games: withSyntheticGames(games),
    shelves: byOrder(shelves),
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
    const before = new Set(get().shelves.map((existing) => existing.id));
    const shelves = byOrder(await commands.saveShelf(shelf));
    set({ shelves });
    return shelf.id
      ? shelves.find((saved) => saved.id === shelf.id)
      : shelves.find((saved) => !before.has(saved.id));
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
  reorderShelves: async (ids) => {
    // Shown at once; the backend confirms (or the next reload corrects it).
    const position = (id: string) => ids.indexOf(id);
    set(({ shelves }) => ({
      shelves: [...shelves]
        .sort((a, b) => position(a.id) - position(b.id))
        .map((shelf, order) => ({ ...shelf, order })),
    }));
    set({ shelves: byOrder(await commands.reorderShelves(ids)) });
  },
  importSteamCollections: async () => {
    set({ shelves: byOrder(await commands.importSteamCollections()) });
  },
  setClassification: async (appId, classification) => {
    const previous = get().games.find((game) => game.appId === appId);
    const replace = (next: Game) =>
      set(({ games }) => ({ games: games.map((game) => (game.appId === appId ? next : game)) }));
    // A game hidden from the library is saved without the optimistic update.
    if (previous) replace({ ...previous, ...classification });
    const { genre, modes, tags } = classification;
    // Saves run one after another, so quick successive toggles land in order.
    const save = savingClassification.then(() =>
      commands.setGameClassification(appId, genre, modes, tags),
    );
    savingClassification = save.catch(() => undefined);
    try {
      await save;
    } catch (error) {
      if (previous) replace(previous);
      throw error;
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
