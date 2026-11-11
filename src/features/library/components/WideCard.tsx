import { Link } from "@tanstack/react-router";
import type { Game } from "@/lib/bindings";
import { PlayButton } from "./PlayButton";
import styles from "./WideCard.module.css";

interface WideCardProps {
  game: Game;
}

/** Banner card (mood suggestions). Click = game page; round button = Play. */
export function WideCard({ game }: WideCardProps) {
  const subtitle = [game.genre, ...game.modes].filter(Boolean).join(" · ");

  return (
    <article className={styles.wide}>
      {game.images.heroSmall && (
        <img className={styles.image} src={game.images.heroSmall} alt="" decoding="async" />
      )}
      <span className={styles.scrim} />
      <Link to="/game/$appId" params={{ appId: String(game.appId) }} className={styles.link}>
        <span className={styles.text}>
          <span className={styles.title}>{game.name}</span>
          {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
        </span>
      </Link>
      <PlayButton game={game} variant="round" />
    </article>
  );
}
