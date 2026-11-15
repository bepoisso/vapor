import type { MoodOption } from "../moods";
import styles from "./MoodModule.module.css";

interface MoodPillProps {
  mood: MoodOption;
  active: boolean;
  onSelect: (id: string) => void;
}

export function MoodPill({ mood, active, onSelect }: MoodPillProps) {
  const Icon = mood.icon;
  return (
    <button
      type="button"
      className={styles.pill}
      aria-pressed={active}
      onClick={() => onSelect(mood.id)}
    >
      <Icon size={15} strokeWidth={2} aria-hidden="true" />
      {mood.label}
    </button>
  );
}
