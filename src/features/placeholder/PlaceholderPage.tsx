import { useTranslation } from "@/i18n";
import styles from "./PlaceholderPage.module.css";

type PlaceholderKey =
  | "placeholder.store"
  | "placeholder.community"
  | "placeholder.profile"
  | "placeholder.game"
  | "placeholder.history"
  | "placeholder.shelf";

interface PlaceholderPageProps {
  titleKey: PlaceholderKey;
}

/** Route placeholder for areas that are not designed or built yet. */
export function PlaceholderPage({ titleKey }: PlaceholderPageProps) {
  const { t } = useTranslation();
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{t(titleKey)}</h1>
      <p className={styles.text}>{t("placeholder.comingSoon")}</p>
    </main>
  );
}
