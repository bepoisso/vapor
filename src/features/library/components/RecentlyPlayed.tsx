import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { Game } from "@/lib/bindings";
import { CoverRow } from "./CoverRow";
import section from "./Section.module.css";

interface RecentlyPlayedProps {
  /** Already sorted, most recent first. */
  games: readonly Game[];
}

export function RecentlyPlayed({ games }: RecentlyPlayedProps) {
  const { t } = useTranslation();
  if (games.length === 0) return null;

  return (
    <section className={`${section.section} ${section.first}`} aria-labelledby="recent-title">
      <div className={section.head}>
        <h2 className={section.h2} id="recent-title">
          {t("recent.title")}
        </h2>
        <Link to="/history" className={section.linkMuted}>
          {t("recent.history")}
        </Link>
      </div>
      <CoverRow games={games} />
    </section>
  );
}
