import { useState } from "react";
import { useTranslation } from "@/i18n";
import type { AchievementList } from "@/lib/bindings";
import { type AchievementFilter, type AchievementSort, filterAndSort } from "../logic/achievements";
import { formatFullDate, formatPercent, percent } from "../logic/format";
import type { Load } from "../store/gameStore";
import page from "../GamePage.module.css";
import chips from "./TagsCard.module.css";
import styles from "./AchievementsTab.module.css";

const FILTERS: readonly AchievementFilter[] = ["all", "unlocked", "locked"];
const SORTS: readonly AchievementSort[] = ["unlockDate", "rarity"];

interface AchievementsTabProps {
  achievements: Load<AchievementList | null>;
}

/** Every achievement: icon, name, description, unlock date and rarity. */
export function AchievementsTab({ achievements }: AchievementsTabProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<AchievementFilter>("all");
  const [sort, setSort] = useState<AchievementSort>("unlockDate");

  if (achievements.status === "loading") {
    return (
      <div className={page.panel}>
        <div className={`${page.skeleton} ${styles.skeleton}`} aria-hidden="true" />
      </div>
    );
  }
  if (achievements.status === "error") {
    return (
      <div className={page.panel}>
        <p className={page.muted} role="alert">
          {t("game.achievements.error")}
        </p>
      </div>
    );
  }
  const list = achievements.data;
  if (!list || list.items.length === 0) {
    return (
      <div className={page.panel}>
        <p className={page.muted}>{t("game.achievements.unavailable")}</p>
      </div>
    );
  }

  const items = filterAndSort(list.items, filter, sort);
  return (
    <div className={`${page.panel} ${page.stackLoose}`}>
      <div className={styles.toolbar}>
        <span className={styles.summary}>
          {t("game.achievements.summary", {
            unlocked: list.unlocked,
            total: list.total,
            percent: percent(list.unlocked, list.total),
          })}
        </span>
        <div className={chips.chips} role="group" aria-label={t("game.achievements.filter.label")}>
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className={chips.chip}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {t(`game.achievements.filter.${value}`)}
            </button>
          ))}
        </div>
        <div className={chips.chips} role="group" aria-label={t("game.achievements.sort.label")}>
          {SORTS.map((value) => (
            <button
              key={value}
              type="button"
              className={chips.chip}
              aria-pressed={sort === value}
              onClick={() => setSort(value)}
            >
              {t(`game.achievements.sort.${value}`)}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <p className={page.muted}>{t("game.achievements.none")}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => {
            // Spoiler-free: locked hidden achievements keep their secret.
            const secret = item.hidden && !item.unlocked;
            const icon = secret ? null : item.unlocked ? item.icon : (item.iconGray ?? item.icon);
            return (
              <li key={item.apiName} className={styles.row} data-unlocked={item.unlocked}>
                {icon ? (
                  <img className={styles.icon} src={icon} alt="" loading="lazy" />
                ) : (
                  <span className={styles.icon} aria-hidden="true">
                    ?
                  </span>
                )}
                <span className={styles.text}>
                  <span className={styles.name}>
                    {secret ? t("game.achievements.hidden") : item.name}
                  </span>
                  {(secret || item.description) && (
                    <span className={page.label}>
                      {secret ? t("game.achievements.hiddenHint") : item.description}
                    </span>
                  )}
                </span>
                <span className={styles.meta}>
                  <span>
                    {item.unlocked && item.unlockedAt
                      ? t("game.achievements.unlockedOn", {
                          date: formatFullDate(item.unlockedAt),
                        })
                      : t("game.achievements.locked")}
                  </span>
                  {item.globalPercent !== null && (
                    <span className={page.label}>
                      {t("game.achievements.global", {
                        percent: formatPercent(item.globalPercent),
                      })}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
