import { Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import styles from "./TopBar.module.css";

/** Library search. `Ctrl K` focuses it from anywhere. Filtering is wired in Phase 1. */
export function SearchField() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <label className={styles.search}>
      <Search size={16} strokeWidth={2} className={styles.searchIcon} aria-hidden="true" />
      <span className="sr-only">{t("search.label")}</span>
      <input
        ref={inputRef}
        type="search"
        className={styles.searchInput}
        placeholder={t("search.placeholder")}
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
