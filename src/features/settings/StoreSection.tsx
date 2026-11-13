import { useTranslation } from "@/i18n";
import { commands, type SettingsView } from "@/lib/bindings";
import type { useSettings } from "./useSettings";
import styles from "./SettingsPage.module.css";

interface StoreSectionProps {
  view: SettingsView;
  settings: ReturnType<typeof useSettings>;
}

/** Opt-in for genres and modes from the Steam Store's unofficial endpoint. */
export function StoreSection({ view, settings }: StoreSectionProps) {
  const { t } = useTranslation();
  const enabled = view.storeEnrichment;
  const error = settings.errorFor("store");

  return (
    <section className={styles.panel} aria-labelledby="settings-store">
      <div className={styles.headerRow}>
        <h2 className={styles.panelTitle} id="settings-store">
          {t("settings.store.title")}
        </h2>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="settings-store"
          className={styles.switch}
          disabled={settings.pending === "store"}
          onClick={() => void settings.run("store", () => commands.setStoreEnrichment(!enabled))}
        >
          <span className={styles.switchThumb} />
        </button>
      </div>
      <p className={styles.text}>{t("settings.store.description")}</p>
      {enabled && view.storeGames !== null && (
        <p className={styles.status} aria-live="polite">
          {t("settings.store.status", { count: view.storeGames })}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
