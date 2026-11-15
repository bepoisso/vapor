import { useEffect, useLayoutEffect, useState } from "react";
import { goBackToLibrary } from "@/app/navigation";
import { Link } from "@/components/Link";
import { useTranslation } from "@/i18n";
import buttons from "@/components/Button/buttons.module.css";
import type { Game, GameDetail } from "@/lib/bindings";
import { markDataReady, revealContent } from "@/lib/startup";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { GameHero } from "./components/GameHero";
import { GameTabs } from "./components/GameTabs";
import { StatCards } from "./components/StatCards";
import { type GameEntry, useGameStore } from "./store/gameStore";
import styles from "./GamePage.module.css";

interface GamePageProps {
  appId: number;
}

/** True when Escape should go back: not while typing, nor while a menu or dialog is open. */
function escapeGoesBack(event: KeyboardEvent): boolean {
  if (event.key !== "Escape" || event.defaultPrevented) return false;
  const target = event.target;
  if (target instanceof HTMLElement && target.closest("input, textarea, select")) return false;
  return document.querySelector('[role="menu"], dialog[open]') === null;
}

/**
 * Game page (`docs/GAME_PAGE_SPEC.md`). The hero and stats render at once from the library's
 * cached `Game`; achievements, news and friends fill in as they arrive.
 */
export function GamePage({ appId }: GamePageProps) {
  const { t } = useTranslation();
  const libraryGame = useLibraryStore((state) => state.games.find((game) => game.appId === appId));
  const libraryStatus = useLibraryStore((state) => state.status);
  const entry = useGameStore((state) => state.entries[appId]);
  const open = useGameStore((state) => state.open);
  const close = useGameStore((state) => state.close);

  useEffect(() => {
    open(appId);
    return () => close(appId);
  }, [appId, open, close]);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [appId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (escapeGoesBack(event)) goBackToLibrary();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const detail: GameDetail | null = entry?.detail.status === "ready" ? entry.detail.data : null;
  // The library's copy is live (tag edits apply to it at once); hidden games only have the
  // detail.
  const game: Game | null = libraryGame ?? detail;
  const detailSettled = entry !== undefined && entry.detail.status !== "loading";
  const settled = game !== null || (detailSettled && libraryStatus !== "loading");

  useEffect(() => {
    if (!settled) return;
    markDataReady();
    void revealContent();
  }, [settled]);

  if (!game) {
    if (!settled) return <main className={styles.page} aria-busy="true" />;
    return (
      <main className={styles.page}>
        <div className={styles.notice}>
          <h1 className={styles.noticeTitle}>{t("game.notFound.title")}</h1>
          <p className={styles.muted}>{t("game.notFound.body")}</p>
          <Link to="/" className={`${buttons.base} ${buttons.small}`}>
            {t("game.notFound.back")}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <GameHero game={game} detail={detail} />
      {entry && <GameBody game={game} detail={detail} entry={entry} />}
    </main>
  );
}

function GameBody({
  game,
  detail,
  entry,
}: {
  game: Game;
  detail: GameDetail | null;
  entry: GameEntry;
}) {
  const [newsGid, setNewsGid] = useState<string | null>(null);
  return (
    <>
      <StatCards game={game} achievements={entry.achievements} social={entry.social} />
      <GameTabs
        game={game}
        detail={detail}
        entry={entry}
        newsGid={newsGid}
        onOpenNews={setNewsGid}
      />
    </>
  );
}
