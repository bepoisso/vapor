import { Link } from "@/components/Link";
import { Bookmark } from "lucide-react";
import { useTranslation } from "@/i18n";
import buttons from "@/components/Button/buttons.module.css";
import type { Game, SmartShelf, SteamCollection } from "@/lib/bindings";
import { useNow } from "../hooks/useNow";
import { matchesRule } from "../logic/rules";
import { ruleSummary } from "../logic/ruleSummary";
import { sortGames } from "../logic/sorting";
import { useShelfEditorStore } from "../store/shelfEditorStore";
import { CoverRow } from "./CoverRow";
import { RuleBadge } from "./RuleBadge";
import section from "./Section.module.css";
import { ShelfMenu } from "./ShelfMenu";
import styles from "./SmartShelves.module.css";

interface SmartShelvesProps {
  shelves: readonly SmartShelf[];
  collections: readonly SteamCollection[];
  games: readonly Game[];
}

/**
 * Rows that fill themselves from rules, then the user's Steam collections (read-only). Default
 * shelves with no match are hidden; the user's own shelves always show, so they can be edited.
 */
export function SmartShelves({ shelves, collections, games }: SmartShelvesProps) {
  const { t } = useTranslation();
  const now = useNow().getTime();
  const openNew = useShelfEditorStore((state) => state.openNew);

  const filled = shelves
    .map((shelf) => ({ shelf, games: games.filter((game) => matchesRule(game, shelf.rule, now)) }))
    .filter((entry) => entry.games.length > 0 || !(entry.shelf.seeded ?? false));
  const byId = new Map(games.map((game) => [game.appId, game]));
  const steamRows = collections
    .map((collection) => ({
      collection,
      games: sortGames(
        collection.appIds.flatMap((appId) => byId.get(appId) ?? []),
        "lastPlayed",
      ),
    }))
    .filter((entry) => entry.games.length > 0);

  return (
    <>
      {(filled.length > 0 || steamRows.length > 0) && (
        <section className={section.section} aria-label={t("shelves.label")}>
          {filled.map(({ shelf, games: matching }, index) => (
            <div key={shelf.id} className={styles.shelf}>
              <div className={section.head}>
                <h2 className={section.h3}>{shelf.title}</h2>
                <RuleBadge summary={ruleSummary(shelf.rule, t)} />
                <ShelfMenu
                  shelf={shelf}
                  previousId={filled[index - 1]?.shelf.id}
                  nextId={filled[index + 1]?.shelf.id}
                />
                {matching.length > 0 && (
                  <Link to={`/shelf/${shelf.id}`} className={section.linkMuted}>
                    {t("shelves.seeAll", { count: matching.length })}
                  </Link>
                )}
              </div>
              {matching.length > 0 ? (
                <CoverRow games={matching} />
              ) : (
                <p className={styles.empty}>{t("shelves.empty")}</p>
              )}
            </div>
          ))}
          {steamRows.map(({ collection, games: members }) => (
            <div key={collection.id} className={styles.shelf}>
              <div className={section.head}>
                <h2 className={section.h3}>{collection.name}</h2>
                <span className={styles.rule}>
                  <Bookmark
                    size={12}
                    strokeWidth={2.4}
                    className={styles.ruleIcon}
                    aria-hidden="true"
                  />
                  {t("shelves.collection")}
                </span>
              </div>
              <CoverRow games={members} />
            </div>
          ))}
        </section>
      )}
      <div className={`${section.section} ${styles.createRow}`}>
        <button
          type="button"
          className={`${buttons.base} ${buttons.dashed} ${styles.create}`}
          onClick={() => openNew()}
        >
          {t("shelves.create")}
        </button>
      </div>
    </>
  );
}
