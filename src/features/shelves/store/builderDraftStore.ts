import { create } from "zustand";
import type { Shelf } from "@/lib/bindings";

interface BuilderDraftState {
  /** A new shelf to start the builder from ("Edit in detail →" in the save dialog). */
  draft: Shelf | null;
  set: (draft: Shelf) => void;
  /** Returns the draft once and forgets it. */
  take: () => Shelf | null;
}

export const useBuilderDraftStore = create<BuilderDraftState>()((set, get) => ({
  draft: null,
  set: (draft) => set({ draft }),
  take: () => {
    const { draft } = get();
    set({ draft: null });
    return draft;
  },
}));
