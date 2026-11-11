import { Sparkle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Game } from "@/lib/bindings";
import { useNow } from "../hooks/useNow";
import { matchesRule } from "../logic/rules";
import { pickSuggestions } from "../logic/suggestions";
import { MOODS } from "../moods";
import { useFiltersStore } from "../store/filtersStore";
import { MoodPill } from "./MoodPill";
import styles from "./MoodModule.module.css";
import section from "./Section.module.css";
import { WideCard } from "./WideCard";

const SUGGESTIONS = 4;

interface MoodModuleProps {
  games: readonly Game[];
}

/** "No idea? In the mood for…": one active mood, four suggestions. */
export function MoodModule({ games }: MoodModuleProps) {
  const { t } = useTranslation();
  const moodId = useFiltersStore((state) => state.moodId);
  const setMood = useFiltersStore((state) => state.setMood);
  const now = useNow();
  const mood = MOODS.find((candidate) => candidate.id === moodId) ?? MOODS[0];
  const suggestions = mood ? pickSuggestions(games, mood.rule, now, SUGGESTIONS) : [];
  // Moods rely on tags and modes; hide the module until some game has them (Phase 4).
  const anyMoodMatches = MOODS.some((candidate) =>
    games.some((game) => matchesRule(game, candidate.rule, now.getTime())),
  );
  if (!anyMoodMatches) return null;

  return (
    <section className={styles.mood} aria-labelledby="mood-title">
      <div className={section.head}>
        <Sparkle size={20} className={styles.icon} aria-hidden="true" />
        <h2 className={section.h3} id="mood-title">
          {t("mood.title")}
        </h2>
        <div className={styles.pills} role="group" aria-label={t("mood.groupLabel")}>
          {MOODS.map((candidate) => (
            <MoodPill
              key={candidate.id}
              mood={candidate}
              active={candidate.id === mood?.id}
              onSelect={setMood}
            />
          ))}
        </div>
      </div>
      {suggestions.length > 0 ? (
        <div className={styles.grid}>
          {suggestions.map((game) => (
            <WideCard key={game.appId} game={game} />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>{t("mood.empty")}</p>
      )}
    </section>
  );
}
