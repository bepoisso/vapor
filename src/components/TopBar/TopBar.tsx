import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BrandMark } from "./BrandMark";
import { SearchField } from "./SearchField";
import styles from "./TopBar.module.css";

export function TopBar() {
  const { t } = useTranslation();

  return (
    <header className={styles.topbar}>
      <BrandMark />

      <nav className={styles.nav} aria-label={t("nav.label")}>
        <Link to="/store" className={styles.navItem}>
          {t("nav.store")}
        </Link>
        <Link to="/" className={styles.navItem} activeOptions={{ exact: true }}>
          {t("nav.library")}
        </Link>
        <Link to="/community" className={styles.navItem}>
          {t("nav.community")}
        </Link>
      </nav>

      <SearchField />

      {/* Persona name and avatar come from Steam in Phase 2; never show a made-up name. */}
      <Link to="/profile" className={styles.profile} aria-label={t("profile.label")}>
        <span className={styles.avatar} aria-hidden="true" />
      </Link>
    </header>
  );
}
