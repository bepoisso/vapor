import { useRef } from "react";
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

/** One row of up to 7 covers; shows as many as fit the width (never wraps). */
export function CoverRow({ games }: CoverRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const columns = useColumns(ref, { minWidth: MIN_WIDTH, gap: GAP, max: MAX_COVERS });

  return (
    <div
      ref={ref}
      className={styles.row}
      style={{ gridTemplateColumns: `repeat(${columns.count}, minmax(0, 1fr))` }}
    >
      {games.slice(0, columns.count).map((game) => (
        <CoverCard key={game.appId} game={game} />
      ))}
    </div>
  );
}
