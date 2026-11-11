import { useTranslation } from "react-i18next";
import styles from "./LibrarySection.module.css";

interface FacetChipProps {
  label: string;
  count: number;
  selected: boolean;
  onToggle: () => void;
}

/** Toggle chip with the number of games it would yield. Disabled at 0 unless selected. */
export function FacetChip({ label, count, selected, onToggle }: FacetChipProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={styles.chip}
      aria-label={t("library.chip", { value: label, count })}
      aria-pressed={selected}
      disabled={count === 0 && !selected}
      onClick={onToggle}
    >
      {label}
      <span className={styles.chipCount} aria-hidden="true">
        {count}
      </span>
    </button>
  );
}
