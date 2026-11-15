import { ChevronLeft } from "lucide-react";
import { cameFromLibrary } from "@/app/navigation";
import { Link } from "@/components/Link";
import { useTranslation } from "@/i18n";
import styles from "./TopBar.module.css";

/** "← Library": a history step back when the page was opened from the library. */
export function BackButton() {
  const { t } = useTranslation();
  return (
    <Link
      to="/"
      className={styles.back}
      aria-label={t("nav.backLabel")}
      onClick={(event) => {
        if (!cameFromLibrary()) return;
        event.preventDefault();
        window.history.back();
      }}
    >
      <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
      {t("nav.back")}
    </Link>
  );
}
