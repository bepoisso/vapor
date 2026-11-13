import { useTranslation } from "@/i18n";
import { commands, type SettingsView } from "@/lib/bindings";
import type { useSettings } from "./useSettings";
import styles from "./SettingsPage.module.css";

interface AccountSectionProps {
  view: SettingsView;
  settings: ReturnType<typeof useSettings>;
}

const AUTOMATIC = "";

/** Which Steam account's library to show, among those that logged in on this machine. */
export function AccountSection({ view, settings }: AccountSectionProps) {
  const { t } = useTranslation();
  const active = view.accounts.find((account) => account.steamId === view.activeAccount);
  const error = settings.errorFor("account");

  return (
    <section className={styles.panel} aria-labelledby="settings-account">
      <h2 className={styles.panelTitle} id="settings-account">
        {t("settings.account.title")}
      </h2>
      <p className={styles.text}>{t("settings.account.description")}</p>
      <label className="sr-only" htmlFor="settings-account-select">
        {t("settings.account.title")}
      </label>
      <select
        id="settings-account-select"
        className={styles.select}
        value={view.account ?? AUTOMATIC}
        disabled={settings.pending === "account" || view.accounts.length === 0}
        onChange={(event) => {
          const value = event.target.value;
          void settings.run("account", () =>
            commands.setAccount(value === AUTOMATIC ? null : value),
          );
        }}
      >
        <option value={AUTOMATIC}>
          {active && view.account === null
            ? t("settings.account.automaticWith", { name: active.personaName })
            : t("settings.account.automatic")}
        </option>
        {view.accounts.map((account) => (
          <option key={account.steamId} value={account.steamId}>
            {account.personaName || account.steamId}
          </option>
        ))}
      </select>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
