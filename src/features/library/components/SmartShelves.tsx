import { Bookmark } from "lucide-react";
import { Link } from "@/components/Link";
import { useTranslation } from "@/i18n";
import buttons from "@/components/Button/buttons.module.css";
import type { Game, Shelf } from "@/lib/bindings";
import { useNow } from "../hooks/useNow";
import { ruleLabel } from "../logic/rules";
import { libraryShelves } from "../logic/shelves";
import { CoverRow } from "./CoverRow";
import { RuleBadge } from "./RuleBadge";
import section from "./Section.module.css";
import { ShelfMenu } from "./ShelfMenu";
import styles from "./SmartShelves.module.css";

interface SmartShelvesProps {
  shelves: readonly Shelf[];
  games: readonly Game[];
}

/**
 * The visible shelves, pinned first: smart rows that fill themselves, Favorites, and imported
 * Steam collections. Default shelves with no match are hidden; the user's own shelves always
 * show, so they can be fixed.
 */
export function SmartShelves({ shelves, games }: SmartShelvesProps) {
  const { t } = useTranslation();
  const now = useNow().getTime();
  const rows = libraryShelves(shelves, games, now);

  // Moves stay inside the pinned (or unpinned) group: pinned shelves always come first.
  const neighbor = (index: number, step: number) => {
    const row = rows[index];
    const other = rows[index + step];
    return row && other && other.shelf.pinned === row.shelf.pinned ? other.shelf.id : undefined;
  };

  return (
    <>
      {rows.length > 0 && (
        <section className={section.section} aria-label={t("shelves.label")}>
          {rows.map(({ shelf, games: members }, index) => (
            <div key={shelf.id} className={styles.shelf}>
              <div className={section.head}>
                <h2 className={section.h3}>{shelf.name}</h2>
                {shelf.kind === "smart" && shelf.rule && (
                  <RuleBadge summary={ruleLabel(shelf.rule, t)} />
                )}
                {shelf.kind === "steam" && (
                  <span className={styles.rule}>
                    <Bookmark
                      size={12}
                      strokeWidth={2.4}
                      className={styles.ruleIcon}
                      aria-hidden="true"
                    />
                    {t("shelves.collection")}
                  </span>
                )}
                <ShelfMenu
                  shelf={shelf}
                  previousId={neighbor(index, -1)}
                  nextId={neighbor(index, 1)}
                />
                {members.length > 0 && (
                  <Link to={`/shelf/${shelf.id}`} className={section.linkMuted}>
                    {t("shelves.seeAll", { count: members.length })}
                  </Link>
                )}
              </div>
              {members.length > 0 ? (
                <CoverRow games={members} />
              ) : (
                <p className={styles.empty}>{t("shelves.empty")}</p>
              )}
            </div>
          ))}
        </section>
      )}
      <div className={`${section.section} ${styles.createRow}`}>
        <Link to="/shelves/new" className={`${buttons.base} ${buttons.dashed} ${styles.create}`}>
          {t("shelves.create")}
        </Link>
        <Link to="/shelves" className={styles.manage}>
          {t("shelves.manage")}
        </Link>
      </div>
    </>
  );
}
