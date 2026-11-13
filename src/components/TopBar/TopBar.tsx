import { NavLink } from "@/components/Link";
import { useTranslation } from "@/i18n";
import { BrandMark } from "./BrandMark";
import { ProfileButton } from "./ProfileButton";
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
        <NavLink to="/store" className={styles.navItem}>
          {t("nav.store")}
        </NavLink>
        <NavLink to="/" className={styles.navItem}>
          {t("nav.library")}
        </NavLink>
        <NavLink to="/community" className={styles.navItem}>
          {t("nav.community")}
        </NavLink>
      </nav>

      <SearchField />

      <ProfileButton />
    </header>
  );
}
