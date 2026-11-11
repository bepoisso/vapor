"use no memo"; // TanStack Virtual mutates its instance; opt out of the React Compiler here.

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useRef, useState } from "react";
import type { Game } from "@/lib/bindings";
import { useColumns } from "../hooks/useColumns";
import { CoverCard } from "./CoverCard";
import styles from "./LibraryGrid.module.css";

const MIN_WIDTH = 110;
const COLUMN_GAP = 14;
const ROW_GAP = 16;
/** Title line under each cover: 8px gap + 12px font × 1.4 line height. */
const TITLE_HEIGHT = 8 + 12 * 1.4;

interface LibraryGridProps {
  games: readonly Game[];
}

/** Full library grid. Only the rows near the viewport are rendered (1,000+ games stay fast). */
export function LibraryGrid({ games }: LibraryGridProps) {
  const ref = useRef<HTMLDivElement>(null);
  const columns = useColumns(ref, { minWidth: MIN_WIDTH, gap: COLUMN_GAP });
  const rowCount = Math.ceil(games.length / columns.count);
  const rowHeight = columns.width * 1.5 + TITLE_HEIGHT + ROW_GAP;

  // Distance from the top of the document to the grid, for window scrolling.
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setScrollMargin(element.getBoundingClientRect().top + window.scrollY);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => rowHeight,
    overscan: 3,
    scrollMargin,
  });

  // Row height depends on the column width: re-measure when it changes.
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [virtualizer, rowHeight]);

  return (
    // Each row includes the gap below it; the last one does not need it.
    <div
      ref={ref}
      className={styles.grid}
      style={{ height: Math.max(0, virtualizer.getTotalSize() - ROW_GAP) }}
    >
      {columns.width > 0 &&
        virtualizer.getVirtualItems().map((row) => (
          <div
            key={row.key}
            className={styles.row}
            style={{
              gridTemplateColumns: `repeat(${columns.count}, minmax(0, 1fr))`,
              transform: `translateY(${row.start - scrollMargin}px)`,
            }}
          >
            {games.slice(row.index * columns.count, (row.index + 1) * columns.count).map((game) => (
              <CoverCard key={game.appId} game={game} variant="dense" />
            ))}
          </div>
        ))}
    </div>
  );
}
