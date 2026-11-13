import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import buttons from "@/components/Button/buttons.module.css";
import { commands, type Game } from "@/lib/bindings";
import { errorMessage } from "@/lib/errors";
import { VIBE_TAGS } from "../logic/facets";
import { useTagEditorStore } from "../store/tagEditorStore";
import styles from "./TagEditor.module.css";

/** Mounted once; shows the tag editor for the game picked from a card's menu. */
export function TagEditor() {
  const game = useTagEditorStore((state) => state.game);
  // A fresh dialog per game, so its draft state starts from that game's tags.
  return game ? <TagEditorDialog key={game.appId} game={game} /> : null;
}

function TagEditorDialog({ game }: { game: Game }) {
  const { t } = useTranslation();
  const close = useTagEditorStore((state) => state.close);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tags, setTags] = useState<string[]>(game.tags);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    // `showModal` traps focus and makes Escape close the dialog (missing in jsdom).
    if (dialog && !dialog.open) dialog.showModal?.();
  }, []);

  const options = [...VIBE_TAGS, ...tags.filter((tag) => !VIBE_TAGS.includes(tag))];
  const toggle = (tag: string) =>
    setTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    );
  const addDraft = () => {
    const tag = draft.trim();
    if (tag && !tags.includes(tag)) setTags((current) => [...current, tag]);
    setDraft("");
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await commands.setGameTags(game.appId, tags);
      close();
    } catch (failure) {
      setError(errorMessage(failure));
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="tag-editor-title"
      onClose={close}
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h2 className={styles.title} id="tag-editor-title">
          {t("tags.title", { name: game.name })}
        </h2>
        <p className={styles.text}>{t("tags.description")}</p>

        <div className={styles.chips} role="group" aria-label={t("tags.label")}>
          {options.map((tag) => (
            <button
              key={tag}
              type="button"
              className={styles.chip}
              aria-pressed={tags.includes(tag)}
              onClick={() => toggle(tag)}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className={styles.row}>
          <label className="sr-only" htmlFor="tag-editor-input">
            {t("tags.add")}
          </label>
          <input
            id="tag-editor-input"
            className={styles.input}
            value={draft}
            placeholder={t("tags.addPlaceholder")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addDraft();
              }
            }}
          />
          <button
            type="button"
            className={`${buttons.base} ${buttons.small}`}
            disabled={draft.trim() === ""}
            onClick={addDraft}
          >
            {t("tags.add")}
          </button>
        </div>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <button type="button" className={`${buttons.base} ${buttons.small}`} onClick={close}>
            {t("tags.cancel")}
          </button>
          <button
            type="submit"
            className={`${buttons.base} ${buttons.smallAccent}`}
            disabled={saving}
          >
            {t("tags.save")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
