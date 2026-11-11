import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import styles from "./TopBar.module.css";

/** Persona name and Steam avatar. Nothing is shown for values Steam didn't give us. */
export function ProfileButton() {
  const { t } = useTranslation();
  const profile = useLibraryStore((state) => state.profile);
  const name = profile?.personaName ?? null;

  return (
    <Link
      to="/profile"
      className={`${styles.profile} ${name ? styles.profileNamed : ""}`}
      aria-label={name ? undefined : t("profile.label")}
    >
      {name}
      {profile?.avatar ? (
        <img className={styles.avatar} src={profile.avatar} alt="" />
      ) : (
        <span className={styles.avatar} aria-hidden="true" />
      )}
    </Link>
  );
}
