import { create } from "zustand";
import type { Game } from "@/lib/bindings";

interface TagEditorState {
  /** The game whose tags are being edited; `null` when the editor is closed. */
  game: Game | null;
  open: (game: Game) => void;
  close: () => void;
}

export const useTagEditorStore = create<TagEditorState>()((set) => ({
  game: null,
  open: (game) => set({ game }),
  close: () => set({ game: null }),
}));
