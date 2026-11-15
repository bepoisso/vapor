import { useTranslation } from "@/i18n";
import type { Game } from "@/lib/bindings";
import styles from "./TopBar.module.css";

interface SearchResultsProps {
  id: string;
  query: string;
  results: readonly Game[];
  highlighted: number;
  onHighlight: (index: number) => void;
  onPick: (appId: number) => void;
}

/** The search box's results, over the page. Focus stays in the field (combobox pattern). */
export function SearchResults({
  id,
  query,
  results,
  highlighted,
  onHighlight,
  onPick,
}: SearchResultsProps) {
  const { t } = useTranslation();

  if (results.length === 0) {
    return (
      <div className={styles.results} id={id} role="status">
        <p className={styles.noResults}>{t("search.noResults", { query: query.trim() })}</p>
      </div>
    );
  }

  return (
    <ul className={styles.results} id={id} role="listbox" aria-label={t("search.results")}>
      {results.map((game, index) => {
        const meta = [game.genre, game.installed === false ? t("search.notInstalled") : null]
          .filter(Boolean)
          .join(" · ");
        const cover = game.images.coverSmall ?? game.images.cover;
        return (
          // Combobox pattern: the keyboard stays in the field (arrows, Enter); options take clicks.
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
          <li
            key={game.appId}
            id={`${id}-${game.appId}`}
            role="option"
            aria-selected={index === highlighted}
            className={styles.result}
            // Keep focus in the field: blurring it would close the box before the click.
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => onHighlight(index)}
            onClick={() => onPick(game.appId)}
          >
            {cover ? (
              <img className={styles.resultCover} src={cover} alt="" loading="lazy" />
            ) : (
              <span className={styles.resultCover} aria-hidden="true" />
            )}
            <span className={styles.resultText}>
              <span className={styles.resultName}>{game.name}</span>
              {meta && <span className={styles.resultMeta}>{meta}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
