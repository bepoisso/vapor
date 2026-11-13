import { Link } from "@/components/Link";
import { useTranslation } from "@/i18n";
import buttons from "@/components/Button/buttons.module.css";
import type { Game } from "@/lib/bindings";
import { formatPlaytime, formatShortDate } from "../logic/format";
import { useSessionStore } from "../store/sessionStore";
import styles from "./Hero.module.css";
import { PlayButton } from "./PlayButton";

interface HeroProps {
  game: Game;
}

/** "Continue" banner: the most recently played game. */
export function Hero({ game }: HeroProps) {
  const { t } = useTranslation();
  const lastPlayed = formatShortDate(game.lastPlayed);
  const error = useSessionStore((state) =>
    state.error?.appId === game.appId ? state.error.message : null,
  );

  // Only values that are known; never a made-up stat.
  const stats = [
    game.playtimeMinutes !== null ? formatPlaytime(game.playtimeMinutes) : null,
    game.achievements ? t("hero.achievements", game.achievements) : null,
    game.cloud && game.cloud !== "unknown" ? t(`hero.cloud.${game.cloud}`) : null,
  ].filter((stat) => stat !== null);

  return (
    <header className={styles.hero}>
      {game.images.hero && (
        <img className={styles.image} src={game.images.hero} alt="" fetchPriority="high" />
      )}
      <div className={styles.scrimV} />
      <div className={styles.scrimH} />

      <div className={styles.content}>
        <span className={styles.kicker}>
          {lastPlayed ? t("hero.kicker", { date: lastPlayed }) : t("hero.kickerNoDate")}
        </span>
        <div className={styles.title}>
          {game.images.logo ? (
            <img className={styles.logo} src={game.images.logo} alt={game.name} />
          ) : (
            <span className={styles.titleText}>{game.name}</span>
          )}
        </div>
        <div className={styles.row}>
          <PlayButton game={game} variant="hero" />
          <Link to={`/game/${game.appId}`} className={`${buttons.base} ${buttons.ghost}`}>
            {t("hero.gamePage")}
          </Link>
          {stats.length > 0 && <span className={styles.meta}>{stats.join(" · ")}</span>}
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {t("hero.steamError", { message: error })}
          </p>
        )}
      </div>
    </header>
  );
}
