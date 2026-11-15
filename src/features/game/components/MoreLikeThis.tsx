import { useRef } from "react";
import { useTranslation } from "@/i18n";
import type { Game } from "@/lib/bindings";
import { CoverCard } from "@/features/library/components/CoverCard";
import { useColumns } from "@/features/library/hooks/useColumns";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { moreLikeThis, type SimilarGame } from "../logic/similar";
import page from "../GamePage.module.css";
import styles from "./MoreLikeThis.module.css";

const MAX_COVERS = 7;
const MIN_WIDTH = 150;
const GAP = 18;
/** Fewer matches than this: the section is hidden. */
const MIN_RESULTS = 2;

interface MoreLikeThisProps {
  game: Game;
}

/** Games of the user's own library sharing the most tags with this one. */
export function MoreLikeThis({ game }: MoreLikeThisProps) {
  const { t } = useTranslation();
  const games = useLibraryStore((state) => state.games);
  const similar = moreLikeThis(game, games, MAX_COVERS);
  if (similar.length < MIN_RESULTS) return null;

  return (
    <section className={styles.section} aria-labelledby="more-like-this">
      <div className={styles.head}>
        <h2 id="more-like-this" className={`${page.h2} ${styles.title}`}>
          {t("game.similar.title")}
        </h2>
        <span className={styles.subtitle}>{t("game.similar.subtitle")}</span>
      </div>
      <SimilarRow similar={similar} />
    </section>
  );
}

/** As many covers as fit the width (never wraps), each with its top 3 shared tags. */
function SimilarRow({ similar }: { similar: readonly SimilarGame[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const columns = useColumns(ref, { minWidth: MIN_WIDTH, gap: GAP, max: MAX_COVERS });
  return (
    <div
      ref={ref}
      className={styles.row}
      style={{ gridTemplateColumns: `repeat(${columns.count}, minmax(0, 1fr))` }}
    >
      {similar.slice(0, columns.count).map(({ game, shared }) => (
        <CoverCard key={game.appId} game={game} subtitle={shared.slice(0, 3).join(" · ")} />
      ))}
    </div>
  );
}
