import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import type { Game } from "@/lib/bindings";
import { useColumns } from "../hooks/useColumns";
import { CoverCard } from "./CoverCard";
import styles from "./CoverRow.module.css";

const MAX_COVERS = 7;
const MIN_WIDTH = 150;
const GAP = 18;

interface CoverRowProps {
  games: readonly Game[];
}

/**
 * One row of up to 7 covers; shows as many as fit the width (never wraps). When there are more
 * games, arrows on the sides scroll through them one game at a time.
 */
export function CoverRow({ games }: CoverRowProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const columns = useColumns(ref, { minWidth: MIN_WIDTH, gap: GAP, max: MAX_COVERS });
  const [requestedStart, setStart] = useState(0);
  // Kept in range when the row narrows or the list shrinks.
  const lastStart = Math.max(0, games.length - columns.count);
  const start = Math.min(requestedStart, lastStart);
  // Arrows sit on the covers' vertical middle (2:3 art).
  const arrowTop = columns.width > 0 ? (columns.width * 1.5) / 2 : undefined;

  return (
    <div className={styles.wrap}>
      <div
        ref={ref}
        className={styles.row}
        style={{ gridTemplateColumns: `repeat(${columns.count}, minmax(0, 1fr))` }}
      >
        {games.slice(start, start + columns.count).map((game) => (
          <CoverCard key={game.appId} game={game} />
        ))}
      </div>
      {start > 0 && (
        <button
          type="button"
          className={`${styles.arrow} ${styles.previous}`}
          style={{ top: arrowTop }}
          aria-label={t("row.previous")}
          title={t("row.previous")}
          onClick={() => setStart(Math.max(0, start - 1))}
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
      )}
      {start < lastStart && (
        <button
          type="button"
          className={`${styles.arrow} ${styles.next}`}
          style={{ top: arrowTop }}
          aria-label={t("row.next")}
          title={t("row.next")}
          onClick={() => setStart(Math.min(lastStart, start + 1))}
        >
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
