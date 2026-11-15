import { useTranslation } from "@/i18n";
import type { AchievementList, Game, GameSocial } from "@/lib/bindings";
import { useNow } from "@/features/library/hooks/useNow";
import { achievementCounts } from "../logic/achievements";
import { formatHours, lastSession, percent } from "../logic/format";
import type { Load } from "../store/gameStore";
import page from "../GamePage.module.css";
import { Avatar } from "./Avatar";
import styles from "./StatCards.module.css";

interface StatCardsProps {
  game: Game;
  achievements: Load<AchievementList | null>;
  social: Load<GameSocial | null>;
}

/** Playtime, last session, achievements and friends. Cards without data are left out. */
export function StatCards({ game, achievements, social }: StatCardsProps) {
  const { t } = useTranslation();
  const now = useNow();
  const counts = achievementCounts(game, achievements);
  const friends = social.status === "ready" ? (social.data?.friends ?? []) : [];
  const session = lastSession(game.lastPlayed, now);
  const cards = 2 + (counts ? 1 : 0) + (friends.length > 0 ? 1 : 0);

  return (
    <section
      className={styles.stats}
      aria-label={t("game.stats.label")}
      style={{ gridTemplateColumns: `repeat(${Math.max(cards, 3)}, minmax(0, 1fr))` }}
    >
      <div className={page.card}>
        <div className={page.label}>{t("game.stats.playtime")}</div>
        <div className={styles.big}>
          {game.playtimeMinutes !== null ? formatHours(game.playtimeMinutes) : "—"}
        </div>
      </div>

      <div className={page.card}>
        <div className={page.label}>{t("game.stats.lastSession")}</div>
        <div className={styles.big}>
          {session.kind === "date" ? session.label : t(`game.stats.${session.kind}`)}
        </div>
      </div>

      {counts && (
        <div className={page.card}>
          <div className={`${page.label} ${styles.labelRow}`}>
            <span>{t("game.stats.achievements")}</span>
            <span>{percent(counts.unlocked, counts.total)}%</span>
          </div>
          <div className={styles.big} aria-label={t("game.stats.achievementsLabel", { ...counts })}>
            {t("game.stats.achievementsValue", { ...counts })}
          </div>
          <div className={`${page.bar} ${styles.bar}`}>
            <span
              className={page.barFill}
              style={{ transform: `scaleX(${counts.unlocked / counts.total})` }}
            />
          </div>
        </div>
      )}

      {friends[0] && (
        <div className={page.card}>
          <div className={page.label}>{t("game.stats.friends")}</div>
          <div className={styles.person}>
            <Avatar src={friends[0].avatar} name={friends[0].personaName} size={34} />
            <span className={styles.personText}>
              <span className={styles.name}>{friends[0].personaName}</span>
              <span className={page.label}>
                {friends[0].status === "in_game"
                  ? t("game.stats.inGame")
                  : friends[0].status === "played_recently" &&
                      friends[0].recentPlaytimeMinutes !== null
                    ? t("game.stats.recently", {
                        hours: formatHours(friends[0].recentPlaytimeMinutes),
                      })
                    : t("game.stats.owns")}
              </span>
            </span>
            {friends.length > 1 && (
              <span
                className={styles.more}
                role="img"
                aria-label={t("game.stats.moreLabel", { count: friends.length - 1 })}
              >
                {t("game.stats.more", { count: friends.length - 1 })}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
