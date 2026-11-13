import { Search } from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, useEffect, useRef } from "react";
import { navigate, usePath } from "@/app/navigation";
import { useTranslation } from "@/i18n";
import { LIBRARY_SECTION_ID } from "@/features/library/components/LibrarySection";
import { useFiltersStore } from "@/features/library/store/filtersStore";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import styles from "./TopBar.module.css";

function scrollToLibrary() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  requestAnimationFrame(() => {
    document
      .getElementById(LIBRARY_SECTION_ID)
      ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  });
}

/**
 * Library search: filters the Library grid by name, on top of the facets. Typing jumps to the
 * Library section (navigating home first if needed). `Ctrl K` focuses it, `Esc` clears it.
 */
export function SearchField() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const query = useFiltersStore((state) => state.query);
  const setQuery = useFiltersStore((state) => state.setQuery);
  const gameCount = useLibraryStore((state) =>
    state.status === "ready" ? state.games.length : null,
  );
  const pathname = usePath();

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

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    const startedTyping = query.trim() === "" && value.trim() !== "";
    setQuery(value);
    if (pathname !== "/") {
      navigate("/");
      // The Library renders on the next frame; scroll once it is there.
      requestAnimationFrame(scrollToLibrary);
    } else if (startedTyping) {
      scrollToLibrary();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setQuery("");
      event.currentTarget.blur();
    }
  }

  return (
    <label className={styles.search}>
      <Search size={16} strokeWidth={2} className={styles.searchIcon} aria-hidden="true" />
      <span className="sr-only">{t("search.label")}</span>
      <input
        ref={inputRef}
        type="search"
        className={styles.searchInput}
        value={query}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={
          gameCount === null
            ? t("search.placeholder")
            : t("search.placeholderCount", { count: gameCount })
        }
        spellCheck={false}
        autoComplete="off"
        aria-keyshortcuts="Control+K"
      />
      <kbd className={styles.kbd} aria-hidden="true">
        {t("search.shortcut")}
      </kbd>
    </label>
  );
}
