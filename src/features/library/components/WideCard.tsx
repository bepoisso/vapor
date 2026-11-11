import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Game } from "@/lib/bindings";
import { playGame } from "../actions";
import styles from "./WideCard.module.css";

interface WideCardProps {
  game: Game;
}

/** Banner card (mood suggestions). Click = game page; round button = Play. */
export function WideCard({ game }: WideCardProps) {
  const { t } = useTranslation();
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
      <button
        type="button"
        className={styles.play}
        aria-label={t("card.play", { name: game.name })}
        onClick={() => playGame(game.appId)}
      >
        <Play size={13} fill="currentColor" strokeWidth={0} aria-hidden="true" />
      </button>
    </article>
  );
}
