import { useState } from "react";
import { useTranslation } from "@/i18n";
import buttons from "@/components/Button/buttons.module.css";
import { commands, type SettingsView } from "@/lib/bindings";
import { formatRelative } from "@/lib/time";
import type { useSettings } from "./useSettings";
import styles from "./SettingsPage.module.css";

interface ApiKeySectionProps {
  view: SettingsView;
  settings: ReturnType<typeof useSettings>;
}

/** Steam Web API key: owned games (installed or not) and achievements. */
export function ApiKeySection({ view, settings }: ApiKeySectionProps) {
  const { t } = useTranslation();
  const [key, setKey] = useState("");
  const busy = settings.pending === "apiKey";
  const error = settings.errorFor("apiKey") ?? view.syncError;

  const status = !view.hasApiKey
    ? t("settings.apiKey.statusNone")
    : view.ownedGames !== null && view.ownedSyncedAt
      ? t("settings.apiKey.statusSynced", {
          count: view.ownedGames,
          when: formatRelative(view.ownedSyncedAt),
        })
      : t("settings.apiKey.statusSaved");

  return (
    <section className={styles.panel} aria-labelledby="settings-api-key">
      <h2 className={styles.panelTitle} id="settings-api-key">
        {t("settings.apiKey.title")}
      </h2>
      <p className={styles.text}>{t("settings.apiKey.description")}</p>
      <p className={styles.status} aria-live="polite">
        {status}
      </p>

      {view.hasApiKey ? (
        <div className={styles.row}>
          <button
            type="button"
            className={`${buttons.base} ${buttons.small}`}
            disabled={busy}
            onClick={() => void settings.run("apiKey", commands.removeApiKey)}
          >
            {t("settings.apiKey.remove")}
          </button>
        </div>
      ) : (
        <form
          className={styles.row}
          onSubmit={(event) => {
            event.preventDefault();
            void settings
              .run("apiKey", () => commands.saveApiKey(key))
              .then((saved) => saved && setKey(""));
          }}
        >
          <label className="sr-only" htmlFor="settings-api-key-input">
            {t("settings.apiKey.label")}
          </label>
          <input
            id="settings-api-key-input"
            className={styles.input}
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder={t("settings.apiKey.placeholder")}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className={`${buttons.base} ${buttons.smallAccent}`}
            disabled={busy || key.trim() === ""}
          >
            {busy ? t("settings.apiKey.checking") : t("settings.apiKey.save")}
          </button>
          <button
            type="button"
            className={`${buttons.base} ${buttons.small}`}
            onClick={() => void commands.openApiKeyPage()}
          >
            {t("settings.apiKey.getKey")}
          </button>
        </form>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
