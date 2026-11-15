import { useTranslation } from "@/i18n";
import type { AchievementList, Game } from "@/lib/bindings";
import { achievementCounts } from "../logic/achievements";
import type { Load } from "../store/gameStore";
import page from "../GamePage.module.css";
import styles from "./Overview.module.css";

/** Above this many achievements, a progress bar replaces the cells. */
const MAX_CELLS = 64;

interface AchievementsCardProps {
  game: Game;
  achievements: Load<AchievementList | null>;
  onSeeAll: () => void;
}

/** "Next up", one cell per achievement, and a link to the full list. */
export function AchievementsCard({ game, achievements, onSeeAll }: AchievementsCardProps) {
  const { t } = useTranslation();
  const counts = achievementCounts(game, achievements);
  if (!counts) return null;
  const { unlocked, total } = counts;
  const list = achievements.status === "ready" ? achievements.data : null;
  const next = list?.next ?? null;
  // Spoiler-free: a hidden next achievement keeps its secret.
  const nextHidden = next?.hidden === true;

  return (
    <>
      <h2 className={page.h2}>{t("game.achievements.title")}</h2>
      <div className={`${page.card} ${page.stackLoose}`}>
        {achievements.status === "loading" ? (
          <div className={`${page.skeleton} ${styles.skeletonNext}`} aria-hidden="true" />
        ) : next ? (
          <div className={styles.next}>
            {!nextHidden && (next.iconGray ?? next.icon) ? (
              <img className={styles.nextIcon} src={next.iconGray ?? next.icon ?? ""} alt="" />
            ) : (
              <span className={styles.nextIcon} aria-hidden="true">
                {nextHidden ? "?" : ""}
              </span>
            )}
            <span className={styles.nextText}>
              <span className={page.eyebrow}>{t("game.achievements.nextUp")}</span>
              <span className={styles.nextName}>
                {nextHidden ? t("game.achievements.hidden") : next.name}
              </span>
              {(nextHidden || next.description) && (
                <span className={page.label}>
                  {nextHidden ? t("game.achievements.hiddenHint") : next.description}
                </span>
              )}
            </span>
          </div>
        ) : unlocked === total ? (
          <span className={page.label}>{t("game.achievements.allDone")}</span>
        ) : null}

        {total <= MAX_CELLS ? (
          <div
            className={styles.grid}
            role="img"
            aria-label={t("game.achievements.gridLabel", { unlocked, total })}
          >
            {Array.from({ length: total }, (_, index) => (
              <span
                key={index}
                className={`${styles.cell} ${index < unlocked ? styles.cellOn : ""}`}
              />
            ))}
          </div>
        ) : (
          <div
            className={page.bar}
            role="img"
            aria-label={t("game.achievements.gridLabel", { unlocked, total })}
          >
            <span className={page.barFill} style={{ transform: `scaleX(${unlocked / total})` }} />
          </div>
        )}

        <button type="button" className={page.link} onClick={onSeeAll}>
          {t("game.achievements.seeAll", { count: total })}
        </button>
      </div>
    </>
  );
}
