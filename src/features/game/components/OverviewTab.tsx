import type { Game } from "@/lib/bindings";
import type { GameEntry } from "../store/gameStore";
import page from "../GamePage.module.css";
import { AchievementsCard } from "./AchievementsCard";
import { ActivitySection } from "./ActivitySection";
import { MoreLikeThis } from "./MoreLikeThis";
import { NewsSection } from "./NewsSection";
import { TagsCard } from "./TagsCard";

interface OverviewTabProps {
  game: Game;
  entry: GameEntry;
  onSeeAchievements: () => void;
  onOpenNews: (gid: string) => void;
}

/** Activity and news on the left; achievements and tags on the right; then "More like this". */
export function OverviewTab({ game, entry, onSeeAchievements, onOpenNews }: OverviewTabProps) {
  return (
    <>
      <section className={page.cols}>
        <div className={page.col}>
          <ActivitySection social={entry.social} />
          <NewsSection game={game} news={entry.news} onOpen={onOpenNews} />
        </div>
        <div className={page.col}>
          <AchievementsCard
            game={game}
            achievements={entry.achievements}
            onSeeAll={onSeeAchievements}
          />
          <TagsCard game={game} />
        </div>
      </section>
      <MoreLikeThis game={game} />
    </>
  );
}
