import type { Game, NewsItem } from "@/lib/bindings";
import { formatFullDate } from "../logic/format";
import page from "../GamePage.module.css";
import styles from "./Overview.module.css";

/** A post as a card: picture (or the game's cover), date, title, two lines of text. */
export function NewsCard({
  game,
  item,
  onOpen,
}: {
  game: Game;
  item: NewsItem;
  onOpen: (gid: string) => void;
}) {
  // No picture in the post: the game's cover stands in.
  const image = item.image ?? game.images.cover;
  return (
    <button
      type="button"
      className={`${page.card} ${styles.news}`}
      onClick={() => onOpen(item.gid)}
    >
      {image ? (
        <img className={styles.newsImage} src={image} alt="" loading="lazy" />
      ) : (
        <span className={styles.newsImage} aria-hidden="true" />
      )}
      <span className={styles.newsText}>
        <span className={page.label}>{formatFullDate(item.date)}</span>
        <span className={styles.newsTitle}>{item.title}</span>
        <span className={`${page.label} ${styles.clamp}`}>{item.excerpt}</span>
      </span>
    </button>
  );
}
