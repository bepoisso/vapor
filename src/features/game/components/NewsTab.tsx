import { useTranslation } from "@/i18n";
import buttons from "@/components/Button/buttons.module.css";
import { commands, type Game, type NewsItem } from "@/lib/bindings";
import { formatFullDate } from "../logic/format";
import type { Load } from "../store/gameStore";
import page from "../GamePage.module.css";
import { NewsBody } from "./NewsBody";
import { NewsCard } from "./NewsCard";
import styles from "./NewsTab.module.css";

interface NewsTabProps {
  game: Game;
  news: Load<NewsItem[]>;
  /** The post open in the reader; `null` shows the list. */
  openGid: string | null;
  onOpen: (gid: string | null) => void;
}

/** The developer's announcements, newest first, read inside Vapor. */
export function NewsTab({ game, news, openGid, onOpen }: NewsTabProps) {
  const { t } = useTranslation();

  if (news.status === "loading") {
    return (
      <div className={`${page.panel} ${page.stackLoose}`}>
        {[0, 1, 2].map((index) => (
          <div key={index} className={`${page.skeleton} ${styles.skeleton}`} aria-hidden="true" />
        ))}
      </div>
    );
  }
  if (news.status === "error") {
    return (
      <div className={page.panel}>
        <p className={page.muted} role="alert">
          {t("game.news.error")}
        </p>
      </div>
    );
  }
  if (news.data.length === 0) {
    return (
      <div className={page.panel}>
        <p className={page.muted}>{t("game.news.empty")}</p>
      </div>
    );
  }

  const open = openGid ? news.data.find((item) => item.gid === openGid) : undefined;
  if (open) {
    return (
      <article className={`${page.panel} ${styles.reader}`} aria-labelledby="news-title">
        <div className={styles.readerBar}>
          <button
            type="button"
            className={`${buttons.base} ${buttons.small}`}
            onClick={() => onOpen(null)}
          >
            {t("game.news.back")}
          </button>
          {open.hasUrl && (
            <button
              type="button"
              className={`${buttons.base} ${buttons.smallQuiet}`}
              onClick={() => void commands.openNews(game.appId, open.gid).catch(() => undefined)}
            >
              {t("game.news.openOnSteam")}
            </button>
          )}
        </div>
        <span className={page.label}>{formatFullDate(open.date)}</span>
        <h2 id="news-title" className={styles.title}>
          {open.title}
        </h2>
        <NewsBody blocks={open.body} />
      </article>
    );
  }

  return (
    <div className={`${page.panel} ${page.stackLoose}`}>
      {news.data.map((item) => (
        <NewsCard key={item.gid} game={game} item={item} onOpen={onOpen} />
      ))}
    </div>
  );
}
