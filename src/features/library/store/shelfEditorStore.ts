import { create } from "zustand";
import type { Rule, SmartShelf } from "@/lib/bindings";

export interface ShelfEditorTarget {
  /** The shelf being edited; `null` for a new one. */
  shelf: SmartShelf | null;
  title: string;
  rule: Rule;
  /** Distinguishes successive openings (the dialog restarts from this target). */
  key: number;
}

interface ShelfEditorState {
  target: ShelfEditorTarget | null;
  /** New shelf, optionally prefilled (e.g. from the library filters). */
  openNew: (rule?: Rule) => void;
  openEdit: (shelf: SmartShelf) => void;
  close: () => void;
}

let openings = 0;

export const useShelfEditorStore = create<ShelfEditorState>()((set) => ({
  target: null,
  openNew: (rule = { all: [] }) =>
    set({ target: { shelf: null, title: "", rule, key: ++openings } }),
  openEdit: (shelf) =>
    set({ target: { shelf, title: shelf.title, rule: shelf.rule, key: ++openings } }),
  close: () => set({ target: null }),
}));
