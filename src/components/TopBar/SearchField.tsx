import { Search } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { navigate } from "@/app/navigation";
import { useTranslation } from "@/i18n";
import { searchGames } from "@/features/library/logic/search";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { SearchResults } from "./SearchResults";
import styles from "./TopBar.module.css";

const LISTBOX_ID = "search-results";

/**
 * Library search: matching games show in a box under the field, over the page; picking one opens
 * its game page. `Ctrl K` focuses the field, arrows move through the results, `Enter` opens the
 * highlighted game, `Esc` clears, then leaves.
 */
export function SearchField() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const games = useLibraryStore((state) => state.games);
  const gameCount = useLibraryStore((state) =>
    state.status === "ready" ? state.games.length : null,
  );

  const results = searchGames(games, query);
  const open = focused && query.trim() !== "";
  const highlighted = Math.min(active, results.length - 1);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function openGame(appId: number) {
    setQuery("");
    inputRef.current?.blur();
    navigate(`/game/${appId}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (results.length === 0) return;
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((highlighted + step + results.length) % results.length);
        break;
      }
      case "Enter": {
        const game = results[highlighted];
        if (open && game) {
          event.preventDefault();
          openGame(game.appId);
        }
        break;
      }
      case "Escape":
        // Handled here: the game page's Escape (back to the library) must not fire too.
        event.preventDefault();
        if (query) setQuery("");
        else event.currentTarget.blur();
        break;
    }
  }

  return (
    <div className={styles.searchWrap}>
      <label className={styles.search}>
        <Search size={16} strokeWidth={2} className={styles.searchIcon} aria-hidden="true" />
        <span className="sr-only">{t("search.label")}</span>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          className={styles.searchInput}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={
            gameCount === null
              ? t("search.placeholder")
              : t("search.placeholderCount", { count: gameCount })
          }
          spellCheck={false}
          autoComplete="off"
          aria-keyshortcuts="Control+K"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={LISTBOX_ID}
          aria-activedescendant={
            open && results[highlighted] ? `${LISTBOX_ID}-${results[highlighted].appId}` : undefined
          }
        />
        <kbd className={styles.kbd} aria-hidden="true">
          {t("search.shortcut")}
        </kbd>
      </label>
      {open && (
        <SearchResults
          id={LISTBOX_ID}
          query={query}
          results={results}
          highlighted={highlighted}
          onHighlight={setActive}
          onPick={openGame}
        />
      )}
    </div>
  );
}
