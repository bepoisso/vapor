import { ChevronDown, ChevronUp, Ellipsis, GripVertical, Pencil, Sparkle } from "lucide-react";
import type { DragEvent, KeyboardEvent } from "react";
import { Link } from "@/components/Link";
import { useTranslation } from "@/i18n";
import menu from "@/components/Menu/Menu.module.css";
import { useMenu } from "@/components/Menu/useMenu";
import type { Game, Shelf } from "@/lib/bindings";
import { ruleLabel } from "@/features/library/logic/rules";
import styles from "../ManageShelvesPage.module.css";

export type RowAction = "rename" | "duplicate" | "pin" | "mood" | "delete";

interface ShelfRowProps {
  shelf: Shelf;
  /** The shelf's games; `null` when unknown (a Steam collection not found). */
  games: readonly Game[] | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (step: -1 | 1) => void;
  onToggleVisible: () => void;
  onAction: (action: RowAction) => void;
  /** Drag and drop (the handle starts it). */
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}

/** One shelf of "My shelves": order, covers, kind, visibility, edit, more actions. */
export function ShelfRow({
  shelf,
  games,
  canMoveUp,
  canMoveDown,
  onMove,
  onToggleVisible,
  onAction,
  dragging,
  onDragStart,
  onDragEnd,
  onDrop,
}: ShelfRowProps) {
  const { t } = useTranslation();
  const { open, setOpen, close, rootRef, buttonRef } = useMenu();
  const covers = (games ?? []).slice(0, 3);
  const count = games === null ? "—" : String(games.length);
  const isFavorites = shelf.kind === "manual";

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    if (event.key === "ArrowUp" && canMoveUp) onMove(-1);
    if (event.key === "ArrowDown" && canMoveDown) onMove(1);
  };
  const act = (action: RowAction) => {
    close();
    onAction(action);
  };

  const items: { action: RowAction; label: string }[] = [
    { action: "rename", label: t("manage.menu.rename") },
    ...(shelf.kind === "smart"
      ? [{ action: "duplicate" as const, label: t("manage.menu.duplicate") }]
      : []),
    { action: "pin", label: shelf.pinned ? t("manage.menu.unpin") : t("manage.menu.pin") },
    ...(shelf.kind === "smart"
      ? [
          {
            action: "mood" as const,
            label: shelf.showAsMood ? t("manage.menu.moodOff") : t("manage.menu.moodOn"),
          },
        ]
      : []),
    ...(isFavorites ? [] : [{ action: "delete" as const, label: t("manage.menu.delete") }]),
  ];

  return (
    // Alt+↑/↓ from any control of the row moves it (the arrows and the handle do too).
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={styles.row}
      data-off={!shelf.visible}
      data-dragging={dragging}
      onKeyDown={onKeyDown}
      onDragOver={(event: DragEvent) => event.preventDefault()}
      onDrop={(event: DragEvent) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <span
        className={styles.handle}
        draggable
        role="img"
        aria-label={t("manage.drag", { name: shelf.name })}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", shelf.id);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
      >
        <GripVertical size={16} aria-hidden="true" />
      </span>
      <span className={styles.order}>
        <button
          type="button"
          aria-label={t("manage.moveUp", { name: shelf.name })}
          disabled={!canMoveUp}
          onClick={() => onMove(-1)}
        >
          <ChevronUp size={12} strokeWidth={2.6} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t("manage.moveDown", { name: shelf.name })}
          disabled={!canMoveDown}
          onClick={() => onMove(1)}
        >
          <ChevronDown size={12} strokeWidth={2.6} aria-hidden="true" />
        </button>
      </span>

      <span className={styles.stack} aria-hidden="true">
        {[1, 2, 0].map((index) => {
          const game = covers[index] ?? covers[0];
          const cover = game ? (game.images.coverSmall ?? game.images.cover) : null;
          const className = `${styles.stackCover} ${styles[`c${index + 1}`]}`;
          return cover ? (
            <img key={index} className={className} src={cover} alt="" loading="lazy" />
          ) : (
            <span key={index} className={className} />
          );
        })}
      </span>

      <span className={styles.info}>
        <span className={styles.nameRow}>
          <Link to={`/shelf/${shelf.id}`} className={styles.name}>
            {shelf.name}
          </Link>
          <span className={`${styles.kind} ${styles[`kind_${shelf.kind}`]}`}>
            {t(`manage.kinds.${shelf.kind}`)}
          </span>
          {shelf.pinned && <span className={styles.flag}>{t("manage.pinned")}</span>}
          {shelf.showAsMood && <span className={styles.flag}>{t("manage.mood")}</span>}
        </span>
        <span className={styles.sub}>
          {shelf.kind === "smart" && shelf.rule ? (
            <>
              <Sparkle size={12} strokeWidth={2.4} className={styles.sparkle} aria-hidden="true" />
              {t("manage.subSmart", { rule: ruleLabel(shelf.rule, t), count })}
            </>
          ) : shelf.kind === "manual" ? (
            t("manage.subManual", { count })
          ) : (
            t("manage.subSteam", { count })
          )}
        </span>
      </span>

      <button
        type="button"
        role="switch"
        className={styles.switch}
        aria-checked={shelf.visible}
        aria-label={t("manage.show", { name: shelf.name })}
        onClick={onToggleVisible}
      />
      {shelf.kind === "smart" ? (
        <Link
          to={`/shelves/${shelf.id}/edit`}
          className={styles.iconButton}
          aria-label={t("manage.edit", { name: shelf.name })}
        >
          <Pencil size={16} aria-hidden="true" />
        </Link>
      ) : (
        <button
          type="button"
          className={styles.iconButton}
          aria-label={t("manage.edit", { name: shelf.name })}
          disabled={shelf.kind === "steam"}
          title={shelf.kind === "steam" ? t("manage.readOnly") : undefined}
          onClick={() => onAction("rename")}
        >
          <Pencil size={16} aria-hidden="true" />
        </button>
      )}
      <div ref={rootRef} className={styles.menuWrap}>
        <button
          ref={buttonRef}
          type="button"
          className={styles.iconButton}
          aria-label={t("manage.more", { name: shelf.name })}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <Ellipsis size={16} aria-hidden="true" />
        </button>
        {open && (
          <ul className={menu.menu} role="menu">
            {items.map((item) => (
              <li key={item.action} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={menu.item}
                  onClick={() => act(item.action)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
