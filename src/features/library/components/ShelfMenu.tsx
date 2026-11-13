import { ArrowDown, ArrowUp, Ellipsis, Pencil } from "lucide-react";
import { useTranslation } from "@/i18n";
import menu from "@/components/Menu/Menu.module.css";
import { useMenu } from "@/components/Menu/useMenu";
import type { SmartShelf } from "@/lib/bindings";
import { useLibraryStore } from "../store/libraryStore";
import { useShelfEditorStore } from "../store/shelfEditorStore";
import styles from "./SmartShelves.module.css";

interface ShelfMenuProps {
  shelf: SmartShelf;
  /** The visible shelves above and below, to move past. */
  previousId?: string;
  nextId?: string;
}

/** "⋯" next to a shelf title: edit (rename, rule, delete) and reorder. */
export function ShelfMenu({ shelf, previousId, nextId }: ShelfMenuProps) {
  const { t } = useTranslation();
  const openEdit = useShelfEditorStore((state) => state.openEdit);
  const swapShelves = useLibraryStore((state) => state.swapShelves);
  const { open, setOpen, close, rootRef, buttonRef } = useMenu();

  const act = (action: () => void) => {
    close();
    action();
  };

  return (
    <div ref={rootRef} className={styles.menu}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.menuButton}
        aria-label={t("shelves.menu.more", { title: shelf.title })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      {open && (
        <ul className={`${menu.menu} ${styles.menuList}`} role="menu">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className={menu.item}
              onClick={() => act(() => openEdit(shelf))}
            >
              {t("shelves.menu.edit")}
              <Pencil size={14} aria-hidden="true" />
            </button>
          </li>
          {previousId && (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className={menu.item}
                onClick={() => act(() => void swapShelves(shelf.id, previousId))}
              >
                {t("shelves.menu.moveUp")}
                <ArrowUp size={14} aria-hidden="true" />
              </button>
            </li>
          )}
          {nextId && (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className={menu.item}
                onClick={() => act(() => void swapShelves(shelf.id, nextId))}
              >
                {t("shelves.menu.moveDown")}
                <ArrowDown size={14} aria-hidden="true" />
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
