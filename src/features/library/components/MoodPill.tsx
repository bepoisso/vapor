import { useTranslation } from "@/i18n";
import type { Mood, MoodId } from "../moods";
import styles from "./MoodModule.module.css";

interface MoodPillProps {
  mood: Mood;
  active: boolean;
  onSelect: (id: MoodId) => void;
}

export function MoodPill({ mood, active, onSelect }: MoodPillProps) {
  const { t } = useTranslation();
  const Icon = mood.icon;
  return (
    <button
      type="button"
      className={styles.pill}
      aria-pressed={active}
      onClick={() => onSelect(mood.id)}
    >
      <Icon size={15} strokeWidth={2} aria-hidden="true" />
      {t(`mood.moods.${mood.id}`)}
    </button>
  );
}
