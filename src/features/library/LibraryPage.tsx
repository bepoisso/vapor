import { useTranslation } from "react-i18next";
import styles from "./LibraryPage.module.css";

/** Library home. Phase 0: empty shell; the sections arrive in Phase 1. */
export function LibraryPage() {
  const { t } = useTranslation();
  return (
    <main className={styles.page}>
      <h1 className="sr-only">{t("nav.library")}</h1>
    </main>
  );
}
