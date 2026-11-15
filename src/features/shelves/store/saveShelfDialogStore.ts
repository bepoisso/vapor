import { create } from "zustand";
import type { FacetSelection } from "@/features/library/logic/facets";

interface SaveShelfDialogState {
  /** The library filters being saved; `null` when the dialog is closed. */
  selection: FacetSelection | null;
  /** Distinguishes successive openings (the dialog restarts from the selection). */
  key: number;
  open: (selection: FacetSelection) => void;
  close: () => void;
}

/** "Save as shelf" from the library filters (S4). */
export const useSaveShelfDialogStore = create<SaveShelfDialogState>()((set) => ({
  selection: null,
  key: 0,
  open: (selection) => set(({ key }) => ({ selection, key: key + 1 })),
  close: () => set({ selection: null }),
}));
