import { X } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { Condition } from "@/lib/bindings";
import { conditionText } from "@/features/library/logic/rules";
import styles from "./ConditionChip.module.css";

interface ConditionChipProps {
  condition: Condition;
  /** Removable chip (shelf page rule bar); read-only without it (save dialog). */
  onRemove?: () => void;
}

/** "Vibe Indie ×": a rule condition as a chip. */
export function ConditionChip({ condition, onRemove }: ConditionChipProps) {
  const { t } = useTranslation();
  const field = t(`rules.fields.${condition.field}`);
  const value = conditionText(condition, t);
  const content = (
    <>
      <span className={styles.field}>{field}</span>
      {value}
    </>
  );
  if (!onRemove) return <span className={`${styles.chip} ${styles.static}`}>{content}</span>;
  return (
    <button
      type="button"
      className={styles.chip}
      aria-label={t("shelf.removeCondition", { condition: `${field} ${value}` })}
      onClick={onRemove}
    >
      {content}
      <span className={styles.x} aria-hidden="true">
        <X size={12} strokeWidth={2.4} />
      </span>
    </button>
  );
}

/** "AND" / "OR" between conditions. */
export function Joiner({ any }: { any: boolean }) {
  const { t } = useTranslation();
  return <span className={styles.joiner}>{any ? t("shelf.or") : t("shelf.and")}</span>;
}
