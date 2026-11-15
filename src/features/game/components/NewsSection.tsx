import { useTranslation } from "@/i18n";
import type { Game, NewsItem } from "@/lib/bindings";
import type { Load } from "../store/gameStore";
import page from "../GamePage.module.css";
import { NewsCard } from "./NewsCard";
import styles from "./Overview.module.css";

interface NewsSectionProps {
  game: Game;
  news: Load<NewsItem[]>;
  onOpen: (gid: string) => void;
}

/** The latest post as a card; it opens in the News tab's reader. */
export function NewsSection({ game, news, onOpen }: NewsSectionProps) {
  const { t } = useTranslation();
  if (news.status === "loading") {
    return (
      <>
        <h2 className={`${page.h2} ${page.h2Spaced}`}>{t("game.news.title")}</h2>
        <div className={`${page.skeleton} ${styles.skeletonNews}`} aria-hidden="true" />
      </>
    );
  }
  const latest = news.status === "ready" ? news.data[0] : undefined;
  if (!latest) return null;
  return (
    <>
      <h2 className={`${page.h2} ${page.h2Spaced}`}>{t("game.news.title")}</h2>
      <NewsCard game={game} item={latest} onOpen={onOpen} />
    </>
  );
}
