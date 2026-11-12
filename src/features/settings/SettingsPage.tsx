import { useTranslation } from "react-i18next";
import { AccountSection } from "./AccountSection";
import { ApiKeySection } from "./ApiKeySection";
import { SteamFolderSection } from "./SteamFolderSection";
import { useSettings } from "./useSettings";
import styles from "./SettingsPage.module.css";

export function SettingsPage() {
  const { t } = useTranslation();
  const settings = useSettings();
  const { view } = settings;

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{t("settings.title")}</h1>
      {view && (
        <>
          <ApiKeySection view={view} settings={settings} />
          <AccountSection view={view} settings={settings} />
          <SteamFolderSection view={view} settings={settings} />
        </>
      )}
    </main>
  );
}
