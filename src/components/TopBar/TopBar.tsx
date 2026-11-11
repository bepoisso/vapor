import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BrandMark } from "./BrandMark";
import { SearchField } from "./SearchField";
import styles from "./TopBar.module.css";
import { useScrolled } from "./useScrolled";

/** Past this scroll offset the bar gets a solid background so it stays readable. */
const SCROLLED_THRESHOLD = 8;

export function TopBar() {
  const { t } = useTranslation();
  const scrolled = useScrolled(SCROLLED_THRESHOLD);

  // Fixed (not in the mockup, where it scrolls away) so search stays visible while it filters
  // the Library grid further down. Transparent over the hero, solid once scrolled.
  return (
    <header className={styles.topbar} data-scrolled={scrolled}>
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
