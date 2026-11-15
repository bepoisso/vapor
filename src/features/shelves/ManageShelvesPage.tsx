import { useEffect, useState } from "react";
import { Link } from "@/components/Link";
import { useTranslation } from "@/i18n";
import buttons from "@/components/Button/buttons.module.css";
import type { Shelf, ShelfKind } from "@/lib/bindings";
import { errorMessage } from "@/lib/errors";
import { markDataReady, revealContent } from "@/lib/startup";
import { useNow } from "@/features/library/hooks/useNow";
import { displayOrder, shelfGames } from "@/features/library/logic/shelves";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { type RowAction, ShelfRow } from "./components/ShelfRow";
import { ShelfDialog } from "./components/ShelfDialog";
import { copyName } from "./logic/shelfDraft";
import styles from "./ManageShelvesPage.module.css";

type Filter = "all" | ShelfKind;
const FILTERS: readonly Filter[] = ["all", "smart", "manual", "steam"];

/** S3 · "My shelves": what the library shows, in which order. */
export function ManageShelvesPage() {
  const { t } = useTranslation();
  const status = useLibraryStore((state) => state.status);
  const games = useLibraryStore((state) => state.games);
  const shelves = useLibraryStore((state) => state.shelves);
  const saveShelf = useLibraryStore((state) => state.saveShelf);
  const deleteShelf = useLibraryStore((state) => state.deleteShelf);
  const reorderShelves = useLibraryStore((state) => state.reorderShelves);
  const importSteamCollections = useLibraryStore((state) => state.importSteamCollections);
  const now = useNow().getTime();
  const [filter, setFilter] = useState<Filter>("all");
  const [dialog, setDialog] = useState<{ shelf: Shelf; mode: "rename" | "delete" } | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settled = status === "ready" || status === "error";
  useEffect(() => {
    if (!settled) return;
    markDataReady();
    void revealContent();
  }, [settled]);

  const ordered = displayOrder(shelves);
  const shown = ordered.filter((shelf) => filter === "all" || shelf.kind === filter);

  const run = (work: Promise<unknown>) => {
    setError(null);
    work.catch((failure: unknown) => setError(errorMessage(failure)));
  };
  // Moves stay inside the pinned (or unpinned) group: pinned shelves always come first.
  const neighbor = (shelf: Shelf, step: -1 | 1) => {
    const other = shown[shown.indexOf(shelf) + step];
    return other && other.pinned === shelf.pinned ? other : undefined;
  };
  const moveTo = (shelf: Shelf, target: Shelf) => {
    const ids = ordered.map((item) => item.id).filter((id) => id !== shelf.id);
    const at = ids.indexOf(target.id);
    const after = ordered.indexOf(shelf) < ordered.indexOf(target);
    ids.splice(after ? at + 1 : at, 0, shelf.id);
    run(reorderShelves(ids));
  };
  const onAction = (shelf: Shelf, action: RowAction) => {
    switch (action) {
      case "rename":
      case "delete":
        setDialog({ shelf, mode: action });
        break;
      case "duplicate":
        run(
          saveShelf({
            ...shelf,
            id: "",
            name: copyName(shelf.name, shelves, t("manage.copy")),
            seeded: false,
          }),
        );
        break;
      case "pin":
        run(saveShelf({ ...shelf, pinned: !shelf.pinned }));
        break;
      case "mood":
        run(saveShelf({ ...shelf, showAsMood: !shelf.showAsMood }));
        break;
    }
  };

  // The library from top to bottom: fixed blocks, then the visible shelves.
  const outline = ordered.filter((shelf) => shelf.visible);

  return (
    <main className={styles.page}>
      <section className={styles.intro}>
        <div className={styles.titles}>
          <h1 className={styles.title}>{t("manage.title")}</h1>
          <span className={styles.subtitle}>{t("manage.subtitle")}</span>
        </div>
        <span className={styles.introActions}>
          <button
            type="button"
            className={`${buttons.base} ${buttons.medium}`}
            onClick={() => run(importSteamCollections())}
          >
            {t("manage.import")}
          </button>
          <Link to="/shelves/new" className={`${buttons.base} ${buttons.mediumAccent}`}>
            {t("manage.new")}
          </Link>
        </span>
      </section>

      <div className={styles.tabs} role="tablist" aria-label={t("manage.filter")}>
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={filter === value}
            onClick={() => setFilter(value)}
          >
            {t(`manage.filters.${value}`)}
          </button>
        ))}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.layout}>
        <div className={styles.list}>
          {shown.length === 0 && <p className={styles.empty}>{t("manage.empty")}</p>}
          {shown.map((shelf) => {
            const up = neighbor(shelf, -1);
            const down = neighbor(shelf, 1);
            return (
              <ShelfRow
                key={shelf.id}
                shelf={shelf}
                games={shelfGames(shelf, games, now)}
                canMoveUp={up !== undefined}
                canMoveDown={down !== undefined}
                onMove={(step) => {
                  const target = step < 0 ? up : down;
                  if (target) moveTo(shelf, target);
                }}
                onToggleVisible={() => run(saveShelf({ ...shelf, visible: !shelf.visible }))}
                onAction={(action) => onAction(shelf, action)}
                dragging={dragged === shelf.id}
                onDragStart={() => setDragged(shelf.id)}
                onDragEnd={() => setDragged(null)}
                onDrop={() => {
                  const source = shelves.find((item) => item.id === dragged);
                  if (source && source.id !== shelf.id && source.pinned === shelf.pinned) {
                    moveTo(source, shelf);
                  }
                  setDragged(null);
                }}
              />
            );
          })}
        </div>

        <aside className={styles.outline} aria-label={t("manage.outline")}>
          <span className={styles.eyebrow}>{t("manage.outline")}</span>
          <div className={`${styles.block} ${styles.blockHero}`}>{t("manage.blocks.hero")}</div>
          <div className={styles.block}>{t("manage.blocks.recent")}</div>
          <div className={styles.block}>{t("manage.blocks.mood")}</div>
          {outline.map((shelf, index) => (
            <div key={shelf.id} className={`${styles.block} ${styles.blockShelf}`}>
              <span className={styles.blockIndex}>{index + 1}</span>
              {shelf.name}
            </div>
          ))}
          <div className={styles.block}>{t("manage.blocks.library")}</div>
        </aside>
      </div>

      {dialog && (
        <ShelfDialog
          key={`${dialog.shelf.id}-${dialog.mode}`}
          shelf={dialog.shelf}
          mode={dialog.mode}
          onClose={() => setDialog(null)}
          onConfirm={async (name) => {
            if (dialog.mode === "rename") await saveShelf({ ...dialog.shelf, name });
            else await deleteShelf(dialog.shelf.id);
          }}
        />
      )}
    </main>
  );
}
