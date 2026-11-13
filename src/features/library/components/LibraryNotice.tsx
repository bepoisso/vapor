import buttons from "@/components/Button/buttons.module.css";
import { Link } from "@/components/Link";
import { useTranslation } from "@/i18n";
import type { ErrorKind } from "@/lib/bindings";
import styles from "../LibraryPage.module.css";

interface LibraryNoticeProps {
  /** `empty`: loaded, no game. Otherwise the kind of load failure. */
  reason: "empty" | ErrorKind;
  detail?: string | null;
  onRetry?: () => void;
}

/** Full-page message when there is no library to show, with the way out. */
export function LibraryNotice({ reason, detail, onRetry }: LibraryNoticeProps) {
  const { t } = useTranslation();
  const copy =
    reason === "empty"
      ? { title: t("status.empty.title"), body: t("status.empty.body") }
      : reason === "steamNotFound"
        ? { title: t("status.steamNotFound.title"), body: t("status.steamNotFound.body") }
        : { title: t("status.error"), body: detail ?? null };
  const pointsToSettings = reason === "empty" || reason === "steamNotFound";

  return (
    <div className={styles.notice} role={reason === "empty" ? undefined : "alert"}>
      <h2 className={styles.noticeTitle}>{copy.title}</h2>
      {copy.body && <p className={styles.noticeBody}>{copy.body}</p>}
      <div className={styles.noticeActions}>
        {pointsToSettings && (
          <Link to="/settings" className={`${buttons.base} ${buttons.smallAccent}`}>
            {t("status.openSettings")}
          </Link>
        )}
        {onRetry && (
          <button type="button" className={`${buttons.base} ${buttons.small}`} onClick={onRetry}>
            {t("status.retry")}
          </button>
        )}
      </div>
    </div>
  );
}
