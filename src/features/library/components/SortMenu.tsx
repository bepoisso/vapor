import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "@/i18n";
import buttons from "@/components/Button/buttons.module.css";
import menu from "@/components/Menu/Menu.module.css";
import { useMenu } from "@/components/Menu/useMenu";
import { SORT_KEYS, type SortKey } from "../logic/sorting";
import styles from "./LibrarySection.module.css";

interface SortMenuProps {
  value: SortKey;
  onChange: (sort: SortKey) => void;
}

export function SortMenu({ value, onChange }: SortMenuProps) {
  const { t } = useTranslation();
  const { open, setOpen, close, rootRef, buttonRef } = useMenu();

  return (
    <div ref={rootRef} className={styles.sort}>
      <button
        ref={buttonRef}
        type="button"
        className={`${buttons.base} ${buttons.smallQuiet}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {t("library.sort.button", { sort: t(`library.sort.${value}`) })}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <ul className={menu.menu} role="menu">
          {SORT_KEYS.map((key) => (
            <li key={key} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={key === value}
                className={menu.item}
                onClick={() => {
                  onChange(key);
                  close();
                }}
              >
                {t(`library.sort.${key}`)}
                {key === value && <Check size={14} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
