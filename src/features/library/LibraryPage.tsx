import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import buttons from "@/components/Button/buttons.module.css";
import { markDataReady, revealContent } from "@/lib/startup";
import { Hero } from "./components/Hero";
import { LibrarySection } from "./components/LibrarySection";
import { MoodModule } from "./components/MoodModule";
import { RecentlyPlayed } from "./components/RecentlyPlayed";
import { SmartShelves } from "./components/SmartShelves";
import { recentlyPlayed } from "./logic/sorting";
import { useLibraryStore } from "./store/libraryStore";
import styles from "./LibraryPage.module.css";

/** Library home: Continue hero, recently played, moods, smart shelves, full library. */
export function LibraryPage() {
  const { t } = useTranslation();
  const status = useLibraryStore((state) => state.status);
  const games = useLibraryStore((state) => state.games);
  const shelves = useLibraryStore((state) => state.shelves);
  const error = useLibraryStore((state) => state.error);
  const load = useLibraryStore((state) => state.load);

  // The content fades in once rendered with data (no half-filled page flashing in).
  const settled = status === "ready" || status === "error";
  useEffect(() => {
    if (!settled) return;
    markDataReady();
    void revealContent();
  }, [settled]);

  if (status === "error") {
    return (
      <main className={styles.page}>
        <div className={styles.error} role="alert">
          <p>{t("status.error")}</p>
          {error && <p className={styles.errorDetail}>{error}</p>}
          <button
            type="button"
            className={`${buttons.base} ${buttons.small}`}
            onClick={() => void load()}
          >
            {t("status.retry")}
          </button>
        </div>
      </main>
    );
  }

  const recent = recentlyPlayed(games);
  const heroGame = recent[0];

  return (
    <main className={styles.page} aria-busy={!settled}>
      <h1 className="sr-only">{t("nav.library")}</h1>
      {status === "ready" && (
        <>
          {heroGame ? <Hero game={heroGame} /> : <div className={styles.heroSpacer} />}
          <RecentlyPlayed games={recent} />
          <MoodModule games={games} />
          <SmartShelves shelves={shelves} games={games} />
          <LibrarySection games={games} />
        </>
      )}
    </main>
  );
}
