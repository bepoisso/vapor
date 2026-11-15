import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "@/i18n";
import { commands, type Game, type GameDetail } from "@/lib/bindings";
import { achievementCounts } from "../logic/achievements";
import { type GameTab, readTab, writeTab } from "../logic/tabs";
import type { GameEntry } from "../store/gameStore";
import { AchievementsTab } from "./AchievementsTab";
import { CommunityTab } from "./CommunityTab";
import { NewsTab } from "./NewsTab";
import { NotesTab } from "./NotesTab";
import { OverviewTab } from "./OverviewTab";
import styles from "./GameTabs.module.css";

interface GameTabsProps {
  game: Game;
  detail: GameDetail | null;
  entry: GameEntry;
  /** The news post open in the reader, if any. */
  newsGid: string | null;
  onOpenNews: (gid: string | null) => void;
}

/** Tabs (`role="tab"`, arrow keys move between them) and the selected panel. */
export function GameTabs({ game, detail, entry, newsGid, onOpenNews }: GameTabsProps) {
  const { t } = useTranslation();
  const [stored, setStored] = useState<GameTab>(() => readTab(game.appId));
  const counts = achievementCounts(game, entry.achievements);

  const tabs: GameTab[] = [
    "overview",
    ...(counts ? (["achievements"] as const) : []),
    "news",
    "guides",
    "discussions",
    "notes",
  ];
  // A remembered tab that has nothing to show this time falls back to the overview.
  const selected = tabs.includes(stored) ? stored : "overview";

  const select = (tab: GameTab) => {
    setStored(tab);
    writeTab(game.appId, tab);
  };
  const openNews = (gid: string | null) => {
    onOpenNews(gid);
    select("news");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = tabs[(tabs.indexOf(selected) + step + tabs.length) % tabs.length] ?? "overview";
    select(next);
    document.getElementById(`game-tab-${next}`)?.focus();
  };

  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label={t("game.tabs.label")}>
        {tabs.map((tab) => (
          <button
            key={tab}
            id={`game-tab-${tab}`}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={tab === selected}
            aria-controls={`game-panel-${tab}`}
            tabIndex={tab === selected ? 0 : -1}
            onClick={() => select(tab)}
            onKeyDown={onKeyDown}
          >
            {t(`game.tabs.${tab}`)}
            {tab === "achievements" && counts && (
              <span className={styles.count}>{counts.total}</span>
            )}
          </button>
        ))}
        <button
          type="button"
          className={styles.external}
          onClick={() => void commands.openSteamPage(game.appId, "store").catch(() => undefined)}
        >
          {t("game.tabs.store")}
        </button>
      </div>

      <div id={`game-panel-${selected}`} role="tabpanel" aria-labelledby={`game-tab-${selected}`}>
        {selected === "overview" && (
          <OverviewTab
            game={game}
            entry={entry}
            onSeeAchievements={() => select("achievements")}
            onOpenNews={openNews}
          />
        )}
        {selected === "achievements" && <AchievementsTab achievements={entry.achievements} />}
        {selected === "news" && (
          <NewsTab game={game} news={entry.news} openGid={newsGid} onOpen={onOpenNews} />
        )}
        {(selected === "guides" || selected === "discussions") && (
          <CommunityTab appId={game.appId} kind={selected} />
        )}
        {selected === "notes" && <NotesTab appId={game.appId} notes={detail?.notes ?? null} />}
      </div>
    </>
  );
}
