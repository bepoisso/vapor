import { Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import buttons from "@/components/Button/buttons.module.css";
import type { Game } from "@/lib/bindings";
import { usePlayState, useSessionStore } from "../store/sessionStore";
import styles from "./PlayButton.module.css";

interface PlayButtonProps {
  game: Game;
  /** `hero`: large labelled button. `round`: 36px icon button on wide cards. */
  variant: "hero" | "round";
}

/** Launches the game through Steam; shows "Launching…" then "Playing" while it runs. */
export function PlayButton({ game, variant }: PlayButtonProps) {
  const { t } = useTranslation();
  const state = usePlayState(game.appId);
  const play = useSessionStore((store) => store.play);
  const busy = state !== "idle";

  const icon =
    state === "running" ? (
      <span className={styles.dot} aria-hidden="true" />
    ) : state === "launching" ? (
      <span className={styles.spinner} aria-hidden="true" />
    ) : (
      <Play
        size={variant === "hero" ? 16 : 13}
        fill="currentColor"
        strokeWidth={0}
        aria-hidden="true"
      />
    );

  if (variant === "round") {
    const label =
      state === "running"
        ? t("card.playing", { name: game.name })
        : state === "launching"
          ? t("card.launching", { name: game.name })
          : t("card.play", { name: game.name });
    return (
      <button
        type="button"
        className={styles.round}
        aria-label={label}
        title={label}
        aria-busy={state === "launching"}
        disabled={busy}
        data-state={state}
        onClick={() => void play(game.appId)}
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`${buttons.base} ${buttons.primary} ${styles.hero}`}
      aria-busy={state === "launching"}
      disabled={busy}
      data-state={state}
      onClick={() => void play(game.appId)}
    >
      {icon}
      {state === "running"
        ? t("hero.playing")
        : state === "launching"
          ? t("hero.launching")
          : t("hero.play")}
    </button>
  );
}
