import { useState } from "react";
import { useTranslation } from "react-i18next";
import buttons from "@/components/Button/buttons.module.css";
import { commands, type SettingsView } from "@/lib/bindings";
import type { useSettings } from "./useSettings";
import styles from "./SettingsPage.module.css";

interface SteamFolderSectionProps {
  view: SettingsView;
  settings: ReturnType<typeof useSettings>;
}

/** Steam install folder: detected automatically, or chosen by the user. */
export function SteamFolderSection({ view, settings }: SteamFolderSectionProps) {
  const { t } = useTranslation();
  const [path, setPath] = useState(view.steamPath ?? "");
  const busy = settings.pending === "steamFolder";
  const error = settings.errorFor("steamFolder");

  return (
    <section className={styles.panel} aria-labelledby="settings-steam-folder">
      <h2 className={styles.panelTitle} id="settings-steam-folder">
        {t("settings.steamFolder.title")}
      </h2>
      <p className={styles.text}>
        {view.detectedSteamPath
          ? t("settings.steamFolder.detected", { path: view.detectedSteamPath })
          : t("settings.steamFolder.notDetected")}
      </p>
      <form
        className={styles.row}
        onSubmit={(event) => {
          event.preventDefault();
          void settings.run("steamFolder", () => commands.setSteamPath(path));
        }}
      >
        <label className="sr-only" htmlFor="settings-steam-folder-input">
          {t("settings.steamFolder.label")}
        </label>
        <input
          id="settings-steam-folder-input"
          className={styles.input}
          value={path}
          onChange={(event) => setPath(event.target.value)}
          placeholder={view.detectedSteamPath ?? t("settings.steamFolder.placeholder")}
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="submit"
          className={`${buttons.base} ${buttons.smallAccent}`}
          disabled={busy || path.trim() === (view.steamPath ?? "")}
        >
          {t("settings.steamFolder.save")}
        </button>
        {view.steamPath && (
          <button
            type="button"
            className={`${buttons.base} ${buttons.small}`}
            disabled={busy}
            onClick={() => {
              setPath("");
              void settings.run("steamFolder", () => commands.setSteamPath(null));
            }}
          >
            {t("settings.steamFolder.reset")}
          </button>
        )}
      </form>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
