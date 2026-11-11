import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import buttons from "@/components/Button/buttons.module.css";
import { SORT_KEYS, type SortKey } from "../logic/sorting";
import styles from "./LibrarySection.module.css";

interface SortMenuProps {
  value: SortKey;
  onChange: (sort: SortKey) => void;
}

export function SortMenu({ value, onChange }: SortMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

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
        <ul className={styles.sortMenu} role="menu">
          {SORT_KEYS.map((key) => (
            <li key={key} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={key === value}
                className={styles.sortItem}
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                  buttonRef.current?.focus();
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
