import { Download, Play, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/i18n";
import type { Game } from "@/lib/bindings";
import { usePlayState, useSessionStore } from "@/features/library/store/sessionStore";
import styles from "./GameHero.module.css";
import { StopGameDialog } from "./StopGameDialog";

interface GamePlayButtonProps {
  game: Game;
  /** Whether Vapor knows the game's folder, so "Stop" can end its processes. */
  canStop: boolean;
}

/**
 * Play, with the spec's states: Install (not installed), Update (Steam updates before
 * launching), Launching…, and "Running · Stop" (asks before ending the game).
 */
export function GamePlayButton({ game, canStop }: GamePlayButtonProps) {
  const { t } = useTranslation();
  const state = usePlayState(game.appId);
  const play = useSessionStore((store) => store.play);
  const install = useSessionStore((store) => store.install);
  const [confirmStop, setConfirmStop] = useState(false);

  if (state === "running") {
    return (
      <>
        <button
          type="button"
          className={styles.play}
          data-state="running"
          disabled={!canStop}
          onClick={() => setConfirmStop(true)}
        >
          <span className={styles.pulse} aria-hidden="true" />
          {canStop ? t("game.play.running") : t("game.play.runningNoStop")}
        </button>
        {confirmStop && <StopGameDialog game={game} onClose={() => setConfirmStop(false)} />}
      </>
    );
  }

  if (state === "launching") {
    return (
      <button type="button" className={styles.play} disabled aria-busy="true">
        <span className={styles.spinner} aria-hidden="true" />
        {t("game.play.launching")}
      </button>
    );
  }

  if (game.installed === false) {
    return (
      <button type="button" className={styles.play} onClick={() => void install(game.appId)}>
        <Download size={18} aria-hidden="true" />
        {t("game.play.install")}
      </button>
    );
  }

  const update = game.updatePending === true;
  return (
    <button type="button" className={styles.play} onClick={() => void play(game.appId)}>
      {update ? (
        <RefreshCw size={18} aria-hidden="true" />
      ) : (
        <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden="true" />
      )}
      {update ? t("game.play.update") : t("game.play.play")}
    </button>
  );
}
