import { Pin, Play, Sparkle } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { Link } from "@/components/Link";
import { useToastStore } from "@/components/Toast/toastStore";
import { useTranslation } from "@/i18n";
import buttons from "@/components/Button/buttons.module.css";
import type { Condition, Game, Shelf } from "@/lib/bindings";
import { errorMessage } from "@/lib/errors";
import { markDataReady, revealContent } from "@/lib/startup";
import { CoverCard } from "@/features/library/components/CoverCard";
import { SortMenu } from "@/features/library/components/SortMenu";
import { useNow } from "@/features/library/hooks/useNow";
import { buildFacets } from "@/features/library/logic/facets";
import { formatPlaytime, formatShortDate } from "@/features/library/logic/format";
import { almostMatches, conditionText } from "@/features/library/logic/rules";
import { shelfGames } from "@/features/library/logic/shelves";
import { type SortKey, sortGames } from "@/features/library/logic/sorting";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { useSessionStore } from "@/features/library/store/sessionStore";
import { ConditionChip, Joiner } from "./components/ConditionChip";
import { EMPTY_RULE } from "./logic/shelfDraft";
import styles from "./ShelfPage.module.css";

const BANNER_IMAGES = 4;
const ALMOST_MAX = 8;

interface ShelfPageProps {
  id: string;
}

function pickRandom<T>(items: readonly T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

/** "Playtime · last played" when known, else the genre. */
function meta(game: Game): string | undefined {
  const known = [
    game.playtimeMinutes !== null ? formatPlaytime(game.playtimeMinutes) : null,
    formatShortDate(game.lastPlayed),
  ].filter(Boolean);
  return known.length > 0 ? known.join(" · ") : (game.genre ?? undefined);
}

/** S1 · a shelf on its own page: banner, live rule bar, all its games, "Almost in". */
export function ShelfPage({ id }: ShelfPageProps) {
  const { t } = useTranslation();
  const status = useLibraryStore((state) => state.status);
  const shelf = useLibraryStore((state) => state.shelves.find((candidate) => candidate.id === id));

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);
  const settled = status === "ready" || status === "error";
  useEffect(() => {
    if (!settled) return;
    markDataReady();
    void revealContent();
  }, [settled]);

  if (!shelf) {
    if (!settled) return <main className={styles.page} aria-busy="true" />;
    return (
      <main className={styles.page}>
        <div className={styles.notFound}>
          <h1 className={styles.notFoundTitle}>{t("shelf.notFound")}</h1>
          <Link to="/" className={`${buttons.base} ${buttons.small}`}>
            {t("game.notFound.back")}
          </Link>
        </div>
      </main>
    );
  }
  return <ShelfView shelf={shelf} />;
}

function ShelfView({ shelf }: { shelf: Shelf }) {
  const { t } = useTranslation();
  const games = useLibraryStore((state) => state.games);
  const saveShelf = useLibraryStore((state) => state.saveShelf);
  const play = useSessionStore((state) => state.play);
  const showToast = useToastStore((state) => state.show);
  const now = useNow().getTime();
  const [sort, setSort] = useState<SortKey>("lastPlayed");
  const [error, setError] = useState<string | null>(null);

  const smart = shelf.kind === "smart";
  const rule = shelf.rule ?? EMPTY_RULE;
  const conditions = rule.conditions ?? [];
  const members = shelfGames(shelf, games, now);
  const list = members ? sortGames(members, sort) : [];
  const playable = list.filter((game) => game.installed !== false);
  const almost = smart ? almostMatches(games, rule, now).slice(0, ALMOST_MAX) : [];
  const banner = (list.length > 0 ? list : games).slice(0, BANNER_IMAGES);

  const save = async (next: Shelf, toast?: string) => {
    setError(null);
    const previous = shelf;
    try {
      await saveShelf(next);
      if (toast) {
        showToast(toast, {
          label: t("shelf.undo"),
          onClick: () => void saveShelf(previous).catch(() => undefined),
        });
      }
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };
  const setConditions = (next: Condition[]) =>
    void save({ ...shelf, rule: { ...rule, conditions: next } }, t("shelf.saved"));

  // "+ Add:" offers the library's vibe and mode values the rule doesn't use yet.
  const facets = buildFacets(games);
  const used = new Set(conditions.flatMap((condition) => condition.values ?? []));
  const quickAdds = (["tags", "modes"] as const).flatMap((field) =>
    (facets.find((facet) => facet.key === field)?.values ?? [])
      .filter((value) => !used.has(value))
      .map((value) => ({ field, value })),
  );

  return (
    <main className={styles.page}>
      <header className={styles.banner}>
        <div className={styles.strip} aria-hidden="true">
          {banner.map((game) =>
            game.images.heroSmall || game.images.hero ? (
              <img
                key={game.appId}
                className={styles.stripImage}
                src={game.images.heroSmall ?? game.images.hero ?? ""}
                alt=""
              />
            ) : (
              <span key={game.appId} className={styles.stripImage} />
            ),
          )}
        </div>
        <div className={styles.dim} />
        <div className={styles.scrim} />
        <div className={styles.bannerBottom}>
          <div className={styles.titles}>
            <span className={styles.kicker}>
              {smart && <Sparkle size={14} strokeWidth={2.4} aria-hidden="true" />}
              {smart ? t("shelf.kickerSmart") : t("shelf.kicker")}
            </span>
            <h1 className={styles.title}>{shelf.name}</h1>
            <span className={styles.sub}>
              {members === null
                ? "—"
                : smart
                  ? t("shelf.countSmart", { count: list.length })
                  : t("shelf.count", { count: list.length })}
            </span>
          </div>
          <span className={styles.actions}>
            <button
              type="button"
              className={`${buttons.base} ${buttons.mediumGhost}`}
              aria-pressed={shelf.pinned}
              onClick={() => void save({ ...shelf, pinned: !shelf.pinned })}
            >
              <Pin size={16} aria-hidden="true" />
              {t("shelf.pinned")}
            </button>
            <button
              type="button"
              className={`${buttons.base} ${buttons.mediumAccent}`}
              disabled={playable.length === 0}
              onClick={() => {
                const pick = pickRandom(playable);
                if (pick) void play(pick.appId);
              }}
            >
              <Play size={14} fill="currentColor" strokeWidth={0} aria-hidden="true" />
              {t("shelf.playRandom")}
            </button>
          </span>
        </div>
      </header>

      {smart && (
        <section className={styles.ruleBar} aria-label={t("shelf.rule")}>
          <div className={styles.row}>
            <span className={styles.eyebrow}>{t("shelf.rule")}</span>
            {conditions.map((condition, index) => (
              <span key={index} className={styles.row}>
                {index > 0 && <Joiner any={rule.match === "any"} />}
                <ConditionChip
                  condition={condition}
                  onRemove={() => setConditions(conditions.filter((_, other) => other !== index))}
                />
              </span>
            ))}
            {conditions.length === 0 && (
              <span className={styles.muted}>{t("rules.everything")}</span>
            )}
            <span className={styles.tools}>
              <Link to={`/shelves/${shelf.id}/edit`} className={styles.editLink}>
                {t("shelf.editRule")}
              </Link>
              <SortMenu value={sort} onChange={setSort} />
            </span>
          </div>
          {quickAdds.length > 0 && (
            <div className={styles.row}>
              <span className={styles.muted}>{t("shelf.add")}</span>
              {quickAdds.map(({ field, value }) => (
                <button
                  key={`${field}:${value}`}
                  type="button"
                  className={styles.quickAdd}
                  onClick={() => setConditions([...conditions, { field, values: [value] }])}
                >
                  {value}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {!smart && (
        <div className={styles.manualTools}>
          <SortMenu value={sort} onChange={setSort} />
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {list.length === 0 ? (
        <div className={styles.empty}>{smart ? t("shelf.empty") : t("shelf.emptyManual")}</div>
      ) : (
        <section className={styles.grid} aria-label={t("shelf.gamesLabel")}>
          {list.map((game) => (
            <CoverCard key={game.appId} game={game} subtitle={meta(game)} />
          ))}
        </section>
      )}

      {almost.length > 0 && (
        <section className={styles.almost} aria-labelledby="almost-title">
          <div className={styles.almostHead}>
            <h2 id="almost-title" className={styles.almostTitle}>
              {t("shelf.almost")}
            </h2>
            <span className={styles.muted}>{t("shelf.almostHint")}</span>
          </div>
          <div className={styles.almostGrid}>
            {almost.map(({ game, missing }) => (
              <Link key={game.appId} to={`/game/${game.appId}`} className={styles.almostCard}>
                {game.images.cover ? (
                  <img
                    className={styles.almostArt}
                    src={game.images.coverSmall ?? game.images.cover}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span className={styles.almostArt} aria-hidden="true" />
                )}
                <span className={styles.almostName}>{game.name}</span>
                <span className={styles.missing}>
                  {t("shelf.missing", {
                    value: missing.values?.length
                      ? missing.values.join(" / ")
                      : conditionText(missing, t),
                  })}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
