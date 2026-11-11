import { create } from "zustand";
import { EMPTY_SELECTION, type FacetKey, type FacetSelection } from "../logic/facets";
import type { SortKey } from "../logic/sorting";
import { DEFAULT_MOOD_ID, type MoodId } from "../moods";

interface FiltersState {
  /** Name filter from the top bar search, applied on top of the facets. */
  query: string;
  selection: FacetSelection;
  sort: SortKey;
  moodId: MoodId;
  setQuery: (query: string) => void;
  toggleFacetValue: (key: FacetKey, value: string) => void;
  clearSelection: () => void;
  setSort: (sort: SortKey) => void;
  setMood: (moodId: MoodId) => void;
}

export const useFiltersStore = create<FiltersState>()((set) => ({
  query: "",
  selection: EMPTY_SELECTION,
  sort: "name",
  moodId: DEFAULT_MOOD_ID,
  setQuery: (query) => set({ query }),
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
