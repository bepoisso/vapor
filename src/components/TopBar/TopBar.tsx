import { usePath } from "@/app/navigation";
import { NavLink } from "@/components/Link";
import { useTranslation } from "@/i18n";
import { BackButton } from "./BackButton";
import { BrandMark } from "./BrandMark";
import { ProfileButton } from "./ProfileButton";
import { SearchField } from "./SearchField";
import styles from "./TopBar.module.css";
import { useScrolled } from "./useScrolled";

/** Past this scroll offset the bar gets a solid background so it stays readable. */
const SCROLLED_THRESHOLD = 8;

type Variant = "library" | "game" | "page" | "none";

/**
 * Library and other areas: brand, nav, search, profile. Game page: "← Library", nav, profile
 * (no search, spec §1). Shelf and "My shelves" pages: "← Library" and profile (mockups). The
 * shelf builder has its own header.
 */
function variantOf(path: string): Variant {
  if (path.startsWith("/game/")) return "game";
  if (path === "/shelves/new" || /^\/shelves\/[^/]+\/edit$/.test(path)) return "none";
  if (path.startsWith("/shelf/") || path === "/shelves") return "page";
  return "library";
}

export function TopBar() {
  const { t } = useTranslation();
  const scrolled = useScrolled(SCROLLED_THRESHOLD);
  const variant = variantOf(usePath());
  if (variant === "none") return null;
  const back = variant !== "library";

  // Fixed (not in the mockup, where it scrolls away) so search stays visible while it filters
  // the Library grid further down. Transparent over the hero, solid once scrolled.
  return (
    <header className={styles.topbar} data-scrolled={scrolled}>
      {back ? <BackButton /> : <BrandMark />}

      {variant !== "page" && (
        <nav className={styles.nav} data-after-back={back} aria-label={t("nav.label")}>
          <NavLink to="/store" className={styles.navItem}>
            {t("nav.store")}
          </NavLink>
          <NavLink to="/" section="/game/" className={styles.navItem}>
            {t("nav.library")}
          </NavLink>
          <NavLink to="/community" className={styles.navItem}>
            {t("nav.community")}
          </NavLink>
        </nav>
      )}

      {back ? <span className={styles.spacer} /> : <SearchField />}

      <ProfileButton />
    </header>
  );
}
