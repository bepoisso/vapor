import { useNavigate } from "@tanstack/react-router";
import { Settings, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import menu from "@/components/Menu/Menu.module.css";
import { useMenu } from "@/components/Menu/useMenu";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import styles from "./TopBar.module.css";

/** Persona name and Steam avatar; opens the account menu (Profile, Settings). */
export function ProfileButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useLibraryStore((state) => state.profile);
  const name = profile?.personaName ?? null;
  const { open, setOpen, close, rootRef, buttonRef } = useMenu();

  const go = (to: "/profile" | "/settings") => {
    close();
    void navigate({ to });
  };

  return (
    <div ref={rootRef} className={styles.profileWrap}>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.profile} ${name ? styles.profileNamed : ""}`}
        aria-label={name ? undefined : t("profile.label")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {name}
        {profile?.avatar ? (
          <img className={styles.avatar} src={profile.avatar} alt="" />
        ) : (
          <span className={styles.avatar} aria-hidden="true" />
        )}
      </button>
      {open && (
        <ul className={menu.menu} role="menu">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className={menu.item}
              onClick={() => go("/profile")}
            >
              {t("profile.menu.profile")}
              <User size={14} aria-hidden="true" />
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className={menu.item}
              onClick={() => go("/settings")}
            >
              {t("profile.menu.settings")}
              <Settings size={14} aria-hidden="true" />
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
