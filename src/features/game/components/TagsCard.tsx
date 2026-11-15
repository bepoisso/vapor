import { useState } from "react";
import { useTranslation } from "@/i18n";
import type { Game, Mode } from "@/lib/bindings";
import { errorMessage } from "@/lib/errors";
import { useNow } from "@/features/library/hooks/useNow";
import { buildFacets, VIBE_TAGS } from "@/features/library/logic/facets";
import { moodOptions } from "@/features/library/moods";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { appearsIn } from "../logic/appearsIn";
import { classificationValues } from "../logic/similar";
import page from "../GamePage.module.css";
import styles from "./TagsCard.module.css";

const MODES: readonly Mode[] = ["Solo", "Coop", "PvP"];

interface TagsCardProps {
  game: Game;
}

/**
 * Genre, modes and vibe tags, with an inline editor. Edits apply to the library at once (shelves,
 * moods, facets, "Appears in", "More like this") and are saved as the user's own edits.
 */
export function TagsCard({ game }: TagsCardProps) {
  const { t } = useTranslation();
  const games = useLibraryStore((state) => state.games);
  const shelves = useLibraryStore((state) => state.shelves);
  const setClassification = useLibraryStore((state) => state.setClassification);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useNow().getTime();

  // Shelves shown as moods are already listed as shelves.
  const moods = moodOptions([], t).map((mood) => ({ name: mood.label, rule: mood.rule }));
  const places = appearsIn(game, shelves, moods, now);

  const save = (change: Partial<Pick<Game, "genre" | "modes" | "tags">>) => {
    setError(null);
    setClassification(game.appId, {
      genre: game.genre,
      modes: game.modes,
      tags: game.tags,
      ...change,
    }).catch((failure: unknown) => setError(errorMessage(failure)));
  };
  const toggle = <T,>(values: readonly T[], value: T): T[] =>
    values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

  const libraryGenres = buildFacets(games).find((facet) => facet.key === "genre")?.values ?? [];
  const genres = [
    ...libraryGenres,
    ...(game.genre && !libraryGenres.includes(game.genre) ? [game.genre] : []),
  ];
  const vibes = [...VIBE_TAGS, ...game.tags.filter((tag) => !VIBE_TAGS.includes(tag))];

  const rows = [
    {
      key: "genre" as const,
      options: genres,
      selected: (value: string) => game.genre === value,
      // One genre: picking another replaces it, picking the current one clears it.
      onToggle: (value: string) => save({ genre: game.genre === value ? null : value }),
    },
    {
      key: "modes" as const,
      options: MODES as readonly string[],
      selected: (value: string) => game.modes.includes(value as Mode),
      onToggle: (value: string) =>
        save({
          modes: MODES.filter((mode) => toggle(game.modes, value as Mode).includes(mode)),
        }),
    },
    {
      key: "tags" as const,
      options: vibes,
      selected: (value: string) => game.tags.includes(value),
      onToggle: (value: string) => save({ tags: toggle(game.tags, value) }),
    },
  ];

  return (
    <>
      <h2 className={`${page.h2} ${page.h2Spaced}`}>{t("game.tags.title")}</h2>
      <div className={`${page.card} ${page.stack}`}>
        <div className={styles.chips}>
          {classificationValues(game).map((value) => (
            <span key={value} className={styles.chip}>
              {value}
            </span>
          ))}
          <button
            type="button"
            className={`${styles.chip} ${styles.add}`}
            aria-expanded={editing}
            aria-controls="game-tag-editor"
            onClick={() => setEditing((current) => !current)}
          >
            {editing ? t("game.tags.done") : t("game.tags.edit")}
          </button>
        </div>

        <p className={styles.appears} aria-live="polite">
          <svg
            className={styles.sparkle}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            aria-hidden="true"
          >
            <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
          </svg>
          <span>
            {places.length > 0
              ? t("game.tags.appearsIn", {
                  places: places
                    .map((place) => t(`game.tags.${place.kind}`, { name: place.name }))
                    .join(" · "),
                })
              : t("game.tags.nowhere")}
          </span>
        </p>

        {editing && (
          <div id="game-tag-editor" className={styles.editor}>
            {rows.map((row) => (
              <div
                key={row.key}
                className={styles.row}
                role="group"
                aria-label={t(`game.tags.rows.${row.key}`)}
              >
                <span className={styles.rowLabel} aria-hidden="true">
                  {t(`game.tags.rows.${row.key}`)}
                </span>
                {row.options.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={styles.chip}
                    aria-pressed={row.selected(value)}
                    onClick={() => row.onToggle(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            ))}
            <span className={page.label}>{t("game.tags.hint")}</span>
          </div>
        )}

        {error && (
          <p className={page.label} role="alert">
            {t("game.tags.error", { message: error })}
          </p>
        )}
      </div>
    </>
  );
}
