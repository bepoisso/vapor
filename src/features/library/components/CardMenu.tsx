import { Ellipsis, Tags } from "lucide-react";
import { useTranslation } from "react-i18next";
import menu from "@/components/Menu/Menu.module.css";
import { useMenu } from "@/components/Menu/useMenu";
import type { Game } from "@/lib/bindings";
import { useTagEditorStore } from "../store/tagEditorStore";
import styles from "./CoverCard.module.css";

interface CardMenuProps {
  game: Game;
}

/** The "⋯" actions of a cover card. */
export function CardMenu({ game }: CardMenuProps) {
  const { t } = useTranslation();
  const openTagEditor = useTagEditorStore((state) => state.open);
  const { open, setOpen, close, rootRef, buttonRef } = useMenu();

  return (
    <div ref={rootRef} className={styles.menu} data-open={open}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.menuButton}
        aria-label={t("card.more", { name: game.name })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      {open && (
        <ul className={menu.menu} role="menu">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className={menu.item}
              onClick={() => {
                close();
                openTagEditor(game);
              }}
            >
              {t("card.editTags")}
              <Tags size={14} aria-hidden="true" />
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
