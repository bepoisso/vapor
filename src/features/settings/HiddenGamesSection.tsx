import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n";
import buttons from "@/components/Button/buttons.module.css";
import { commands, events, type HiddenGame } from "@/lib/bindings";
import styles from "./SettingsPage.module.css";

/** Games hidden from the library (from their game page), with a way back. */
export function HiddenGamesSection() {
  const { t } = useTranslation();
  const [games, setGames] = useState<HiddenGame[] | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    const refresh = () => {
      void commands
        .listHiddenGames()
        .then((next) => active && setGames(next))
        .catch(() => undefined);
    };
    refresh();
    const unlisten = events.libraryUpdated.listen(refresh);
    return () => {
      active = false;
      void unlisten.then((stop) => stop());
    };
  }, []);

  if (games === null) return null;
  return (
    <section className={styles.panel} aria-labelledby="settings-hidden">
      <h2 className={styles.panelTitle} id="settings-hidden">
        {t("settings.hidden.title")}
      </h2>
      <p className={styles.text}>{t("settings.hidden.description")}</p>
      {games.length === 0 ? (
        <p className={styles.status}>{t("settings.hidden.empty")}</p>
      ) : (
        <ul className={styles.hiddenList}>
          {games.map((game) => (
            <li key={game.appId} className={styles.hiddenRow}>
              <span>{game.name}</span>
              <button
                type="button"
                className={`${buttons.base} ${buttons.small}`}
                onClick={() => void commands.setHidden(game.appId, false).catch(() => undefined)}
              >
                {t("settings.hidden.show")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
