import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useTranslation } from "@/i18n";
import buttons from "@/components/Button/buttons.module.css";
import { commands } from "@/lib/bindings";
import { useUpdateStore } from "./updateStore";
import styles from "./SettingsPage.module.css";

/** The running version, and updates from GitHub Releases. */
export function UpdatesSection() {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string | null>(null);
  const status = useUpdateStore((state) => state.status);
  const update = useUpdateStore((state) => state.update);
  const error = useUpdateStore((state) => state.error);
  const check = useUpdateStore((state) => state.check);
  const install = useUpdateStore((state) => state.install);

  useEffect(() => {
    if (!isTauri()) return;
    void commands
      .appInfo()
      .then((info) => setVersion(info.version))
      .catch(() => undefined);
  }, []);

  return (
    <section className={styles.panel} aria-labelledby="settings-updates">
      <h2 className={styles.panelTitle} id="settings-updates">
        {t("updates.title")}
      </h2>
      <p className={styles.text}>
        {version ? t("updates.version", { version }) : t("updates.description")}
      </p>
      <p className={styles.status} aria-live="polite">
        {status === "checking" && t("updates.checking")}
        {status === "upToDate" && t("updates.upToDate")}
        {status === "available" && update && t("updates.available", { version: update.version })}
        {status === "installing" && t("updates.installing")}
      </p>
      {status === "available" && update?.notes && <p className={styles.notes}>{update.notes}</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.row}>
        {status === "available" || status === "installing" ? (
          <button
            type="button"
            className={`${buttons.base} ${buttons.smallAccent}`}
            disabled={status === "installing"}
            onClick={() => void install()}
          >
            {t("updates.install")}
          </button>
        ) : (
          <button
            type="button"
            className={`${buttons.base} ${buttons.small}`}
            disabled={status === "checking"}
            onClick={() => void check()}
          >
            {t("updates.check")}
          </button>
        )}
      </div>
    </section>
  );
}
