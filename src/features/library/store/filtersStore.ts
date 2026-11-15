import { create } from "zustand";
import { EMPTY_SELECTION, type FacetKey, type FacetSelection } from "../logic/facets";
import type { SortKey } from "../logic/sorting";
import { DEFAULT_MOOD_ID } from "../moods";

interface FiltersState {
  selection: FacetSelection;
  sort: SortKey;
  /** A default mood id, or `shelf:<id>` for a shelf shown as a mood. */
  moodId: string;
  toggleFacetValue: (key: FacetKey, value: string) => void;
  clearSelection: () => void;
  setSort: (sort: SortKey) => void;
  setMood: (moodId: string) => void;
}

export const useFiltersStore = create<FiltersState>()((set) => ({
  selection: EMPTY_SELECTION,
  sort: "name",
  moodId: DEFAULT_MOOD_ID,
  toggleFacetValue: (key, value) =>
    set(({ selection }) => {
      const current = selection[key];
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value];
      return { selection: { ...selection, [key]: next } };
    }),
  clearSelection: () => set({ selection: EMPTY_SELECTION }),
  setSort: (sort) => set({ sort }),
  setMood: (moodId) => set({ moodId }),
}));
