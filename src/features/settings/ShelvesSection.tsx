import { Link } from "@/components/Link";
import { useTranslation } from "@/i18n";
import buttons from "@/components/Button/buttons.module.css";
import styles from "./SettingsPage.module.css";

/** A way to "My shelves" from Settings (spec S3). */
export function ShelvesSection() {
  const { t } = useTranslation();
  return (
    <section className={styles.panel} aria-labelledby="settings-shelves">
      <h2 className={styles.panelTitle} id="settings-shelves">
        {t("settings.shelves.title")}
      </h2>
      <p className={styles.text}>{t("settings.shelves.description")}</p>
      <div className={styles.row}>
        <Link to="/shelves" className={`${buttons.base} ${buttons.small}`}>
          {t("settings.shelves.open")}
        </Link>
      </div>
    </section>
  );
}
