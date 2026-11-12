import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { Game } from "@/lib/bindings";
import { useTagEditorStore } from "../store/tagEditorStore";
import { CardMenu } from "./CardMenu";
import styles from "./CoverCard.module.css";

interface CoverCardProps {
  game: Game;
  /** `dense` = full library grid (smaller title and radius). */
  variant?: "shelf" | "dense";
  subtitle?: string;
}

/** 2:3 cover, title below. The card links to the game page; "⋯" (or right-click) edits tags. */
export function CoverCard({ game, variant = "shelf", subtitle }: CoverCardProps) {
  const [broken, setBroken] = useState(false);
  const openTagEditor = useTagEditorStore((state) => state.open);
  const cover = broken ? null : game.images.cover;

  return (
    <div className={styles.card}>
      <Link
        to="/game/$appId"
        params={{ appId: String(game.appId) }}
        className={`${styles.cover} ${variant === "dense" ? styles.dense : ""}`}
        data-installed={game.installed !== false}
        title={game.name}
        onContextMenu={(event) => {
          event.preventDefault();
          openTagEditor(game);
        }}
      >
        {cover ? (
          <img
            className={styles.art}
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
          />
        ) : (
          <span className={`${styles.art} ${styles.placeholder}`} aria-hidden="true">
            {game.name}
          </span>
        )}
        <span className={styles.title}>{game.name}</span>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </Link>
      <CardMenu game={game} />
    </div>
  );
}
