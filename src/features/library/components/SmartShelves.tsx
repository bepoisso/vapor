import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import buttons from "@/components/Button/buttons.module.css";
import type { Game, SmartShelf } from "@/lib/bindings";
import { useNow } from "../hooks/useNow";
import { matchesRule } from "../logic/rules";
import { ruleSummary } from "../logic/ruleSummary";
import { CoverRow } from "./CoverRow";
import { RuleBadge } from "./RuleBadge";
import section from "./Section.module.css";
import styles from "./SmartShelves.module.css";

interface SmartShelvesProps {
  shelves: readonly SmartShelf[];
  games: readonly Game[];
}

/** Rows that fill themselves from rules. Shelves with no match are hidden. */
export function SmartShelves({ shelves, games }: SmartShelvesProps) {
  const { t } = useTranslation();
  const now = useNow().getTime();
  const filled = shelves
    .map((shelf) => ({ shelf, games: games.filter((game) => matchesRule(game, shelf.rule, now)) }))
    .filter((entry) => entry.games.length > 0);

  return (
    <>
      {filled.length > 0 && (
        <section className={section.section} aria-label={t("shelves.label")}>
          {filled.map(({ shelf, games: matching }) => (
            <div key={shelf.id} className={styles.shelf}>
              <div className={section.head}>
                <h2 className={section.h3}>{shelf.title}</h2>
                <RuleBadge summary={ruleSummary(shelf.rule, t)} />
                <Link
                  to="/shelf/$shelfId"
                  params={{ shelfId: shelf.id }}
                  className={section.linkMuted}
                >
                  {t("shelves.seeAll", { count: matching.length })}
                </Link>
              </div>
              <CoverRow games={matching} />
            </div>
          ))}
        </section>
      )}
      <div className={`${section.section} ${styles.createRow}`}>
        {/* Phase 5: opens the rule builder. */}
        <button type="button" className={`${buttons.base} ${buttons.dashed} ${styles.create}`}>
          {t("shelves.create")}
        </button>
      </div>
    </>
  );
}
