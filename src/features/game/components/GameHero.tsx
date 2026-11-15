import { useState } from "react";
import { useTranslation } from "@/i18n";
import type { Game, GameDetail } from "@/lib/bindings";
import { useSessionStore } from "@/features/library/store/sessionStore";
import { formatSize } from "../logic/format";
import { useGameStore } from "../store/gameStore";
import { FavoriteButton } from "./FavoriteButton";
import { GamePlayButton } from "./GamePlayButton";
import { GameSettingsMenu } from "./GameSettingsMenu";
import styles from "./GameHero.module.css";

interface GameHeroProps {
  game: Game;
  /** Local facts (developer, size, favorite…); `null` while loading. */
  detail: GameDetail | null;
}

/** Banner with logo, Play, favorite and settings; install and cloud badges. */
export function GameHero({ game, detail }: GameHeroProps) {
  const { t } = useTranslation();
  const [actionError, setActionError] = useState<string | null>(null);
  const steamError = useSessionStore((state) =>
    state.error?.appId === game.appId ? state.error.message : null,
  );
  const setHidden = useGameStore((state) => state.setHidden);
  const error = actionError ?? steamError;

  // Unknown parts are skipped, never guessed.
  const kicker = [detail?.developer, game.genre, ...game.modes].filter(Boolean).join(" · ");
  const size = detail?.sizeOnDiskBytes ?? null;

  return (
    <header className={styles.hero}>
      <div className={styles.backdrop}>
        {game.images.hero && (
          <img className={styles.image} src={game.images.hero} alt="" fetchPriority="high" />
        )}
        <div className={styles.scrimV} />
        <div className={styles.scrimH} />
      </div>

      <div className={styles.bottom}>
        <div className={styles.left}>
          {kicker && <span className={styles.kicker}>{kicker}</span>}
          <h1 className={styles.title}>
            {game.images.logo ? (
              <img className={styles.logo} src={game.images.logo} alt={game.name} />
            ) : (
              <span className={styles.titleText}>{game.name}</span>
            )}
          </h1>
          <div className={styles.actions}>
            <GamePlayButton game={game} canStop={detail?.hasInstallDir ?? false} />
            <FavoriteButton appId={game.appId} favorite={detail?.favorite ?? false} />
            <GameSettingsMenu game={game} detail={detail} onError={setActionError} />
          </div>
          {error && (
            <p className={styles.message} role="alert">
              {t("game.steamError", { message: error })}
            </p>
          )}
          {detail?.hidden && (
            <p className={styles.message}>
              {t("game.hiddenNotice")}
              <button
                type="button"
                className={styles.badge}
                onClick={() => void setHidden(game.appId, false)}
              >
                {t("game.settings.show")}
              </button>
            </p>
          )}
        </div>

        <div className={styles.badges}>
          {game.installed === true && (
            <span className={styles.badge}>
              <span className={styles.dot} aria-hidden="true" />
              {size !== null
                ? t("game.badges.installedSize", { size: formatSize(size) })
                : t("game.badges.installed")}
            </span>
          )}
          {game.installed === false && (
            <span className={styles.badge}>{t("game.badges.notInstalled")}</span>
          )}
          {game.cloud && game.cloud !== "unknown" && (
            <span className={styles.badge}>{t(`hero.cloud.${game.cloud}`)}</span>
          )}
        </div>
      </div>
    </header>
  );
}
