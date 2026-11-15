import { Settings } from "lucide-react";
import { useTranslation } from "@/i18n";
import menu from "@/components/Menu/Menu.module.css";
import { useMenu } from "@/components/Menu/useMenu";
import { commands, type Game, type GameAction, type GameDetail } from "@/lib/bindings";
import { errorMessage } from "@/lib/errors";
import { useGameStore } from "../store/gameStore";
import styles from "./GameHero.module.css";

interface GameSettingsMenuProps {
  game: Game;
  detail: GameDetail | null;
  onError: (message: string | null) => void;
}

/** Gear menu. Everything but "Hide" is done by Steam (`steam://` URLs) or the file explorer. */
export function GameSettingsMenu({ game, detail, onError }: GameSettingsMenuProps) {
  const { t } = useTranslation();
  const setHidden = useGameStore((state) => state.setHidden);
  const { open, setOpen, close, rootRef, buttonRef } = useMenu();
  const installed = game.installed !== false;
  const hidden = detail?.hidden ?? false;

  const run = (work: () => Promise<unknown>) => {
    close();
    onError(null);
    work().catch((error: unknown) => onError(errorMessage(error)));
  };
  const steam = (action: GameAction) => run(() => commands.gameAction(game.appId, action));

  const items: { key: string; label: string; enabled: boolean; onSelect: () => void }[] = [
    {
      key: "properties",
      label: t("game.settings.properties"),
      enabled: installed,
      onSelect: () => steam("properties"),
    },
    {
      key: "browse",
      label: t("game.settings.browse"),
      enabled: detail?.hasInstallDir ?? false,
      onSelect: () => run(() => commands.browseGameFiles(game.appId)),
    },
    {
      key: "validate",
      label: t("game.settings.validate"),
      enabled: installed,
      onSelect: () => steam("validate"),
    },
    {
      key: "uninstall",
      label: t("game.settings.uninstall"),
      enabled: installed,
      onSelect: () => steam("uninstall"),
    },
    {
      key: "hide",
      label: hidden ? t("game.settings.show") : t("game.settings.hide"),
      enabled: detail !== null,
      onSelect: () => run(() => setHidden(game.appId, !hidden)),
    },
  ];

  return (
    <div ref={rootRef} className={styles.menuWrap}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.iconButton}
        aria-label={t("game.settings.label")}
        title={t("game.settings.label")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Settings size={20} aria-hidden="true" />
      </button>
      {open && (
        <ul className={`${menu.menu} ${styles.menu}`} role="menu">
          {items
            .filter((item) => item.enabled)
            .map((item) => (
              <li key={item.key} role="none">
                <button type="button" role="menuitem" className={menu.item} onClick={item.onSelect}>
                  {item.label}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
