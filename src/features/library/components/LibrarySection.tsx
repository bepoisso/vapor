import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import buttons from "@/components/Button/buttons.module.css";
import type { Game } from "@/lib/bindings";
import { buildFacets, facetCounts, hasSelection, passesFacets } from "../logic/facets";
import { filterByName } from "../logic/search";
import { sortGames } from "../logic/sorting";
import { useFiltersStore } from "../store/filtersStore";
import { FacetBox } from "./FacetBox";
import { LibraryGrid } from "./LibraryGrid";
import styles from "./LibrarySection.module.css";
import section from "./Section.module.css";
import { SortMenu } from "./SortMenu";

/** Anchor used by the top bar search to scroll here. */
export const LIBRARY_SECTION_ID = "library";

interface LibrarySectionProps {
  games: readonly Game[];
}

/** Full library: facets (OR within, AND across) + name search + sort, over a virtualized grid. */
export function LibrarySection({ games }: LibrarySectionProps) {
  const { t } = useTranslation();
  const query = useFiltersStore((state) => state.query);
  const selection = useFiltersStore((state) => state.selection);
  const sort = useFiltersStore((state) => state.sort);
  const toggleFacetValue = useFiltersStore((state) => state.toggleFacetValue);
  const clearSelection = useFiltersStore((state) => state.clearSelection);
  const setSort = useFiltersStore((state) => state.setSort);

  // Explicit memos: the React Compiler would merge these steps into one scope (filterByName may
  // return its input), re-sorting 1,000+ games on every keystroke. Sorting once and filtering
  // the sorted list keeps it sorted, so facet clicks and typing never re-sort.
  const facets = useMemo(() => buildFacets(games), [games]);
  const sorted = useMemo(() => sortGames(games, sort), [games, sort]);
  const searched = useMemo(() => filterByName(sorted, query), [sorted, query]);
  const counts = useMemo(() => facetCounts(searched, selection), [searched, selection]);
  const visible = useMemo(
    () => searched.filter((game) => passesFacets(game, selection)),
    [searched, selection],
  );
  const filtering = hasSelection(selection);

  return (
    <section
      id={LIBRARY_SECTION_ID}
      className={`${section.section} ${styles.library}`}
      aria-labelledby="library-title"
    >
      <div className={section.head}>
        <h2 className={section.h2} id="library-title">
          {t("library.title")}
        </h2>
        <span className={styles.count} aria-live="polite">
          {t("library.count", { count: visible.length })}
        </span>
        {filtering && (
          <>
            <button
              type="button"
              className={`${buttons.base} ${buttons.small}`}
              onClick={clearSelection}
            >
              {t("library.clear")}
            </button>
            {/* Phase 5: converts the selection with selectionToRule() and opens the naming dialog. */}
            <button type="button" className={`${buttons.base} ${buttons.smallAccent}`}>
              {t("library.saveShelf")}
            </button>
          </>
        )}
        <SortMenu value={sort} onChange={setSort} />
      </div>

      <FacetBox facets={facets} counts={counts} selection={selection} onToggle={toggleFacetValue} />

      {visible.length === 0 ? (
        <div className={styles.empty}>
          {query && !filtering ? t("library.emptyQuery", { query }) : t("library.empty")}
        </div>
      ) : (
        <LibraryGrid games={visible} />
      )}
    </section>
  );
}
