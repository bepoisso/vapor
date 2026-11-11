import { create } from "zustand";
import { commands, type Game, type SmartShelf } from "@/lib/bindings";
import { markLibraryLoaded } from "@/lib/startup";
import { withSyntheticGames } from "./synthetic";

type Status = "idle" | "loading" | "ready" | "error";

interface LibraryState {
  status: Status;
  games: readonly Game[];
  shelves: readonly SmartShelf[];
  error: string | null;
  load: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "Unknown error";
}

/** Library data from the Rust backend. Started from `main.tsx`, before React renders. */
export const useLibraryStore = create<LibraryState>()((set, get) => ({
  status: "idle",
  games: [],
  shelves: [],
  error: null,
  load: async () => {
    if (get().status === "loading") return;
    set({ status: "loading", error: null });
    try {
      const [games, shelves] = await Promise.all([commands.getLibrary(), commands.listShelves()]);
      markLibraryLoaded();
      set({
        status: "ready",
        games: withSyntheticGames(games),
        shelves: [...shelves].sort((a, b) => a.order - b.order),
      });
    } catch (error) {
      set({ status: "error", error: errorMessage(error) });
    }
  },
}));
