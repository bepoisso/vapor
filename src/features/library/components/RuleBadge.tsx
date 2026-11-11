import { Sparkle } from "lucide-react";
import styles from "./SmartShelves.module.css";

interface RuleBadgeProps {
  summary: string;
}

/** Sparkle + human-readable rule, next to a shelf title. */
export function RuleBadge({ summary }: RuleBadgeProps) {
  return (
    <span className={styles.rule}>
      <Sparkle size={12} strokeWidth={2.4} className={styles.ruleIcon} aria-hidden="true" />
      {summary}
    </span>
  );
}
