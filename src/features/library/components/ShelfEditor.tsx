import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import buttons from "@/components/Button/buttons.module.css";
import type { Field } from "@/lib/bindings";
import { errorMessage } from "@/lib/errors";
import { useNow } from "../hooks/useNow";
import { buildFacets, VIBE_TAGS } from "../logic/facets";
import {
  defaultRow,
  draftToRule,
  hasConditions,
  type RuleDraft,
  ruleToDraft,
} from "../logic/ruleDraft";
import { matchesRule } from "../logic/rules";
import { ruleSummary } from "../logic/ruleSummary";
import { useLibraryStore } from "../store/libraryStore";
import { type ShelfEditorTarget, useShelfEditorStore } from "../store/shelfEditorStore";
import { ConditionRow } from "./ConditionRow";
import styles from "./ShelfEditor.module.css";

/** Mounted once; shows the rule builder for a new or existing smart shelf. */
export function ShelfEditor() {
  const target = useShelfEditorStore((state) => state.target);
  // A fresh dialog per opening, so its draft starts from that target.
  return target ? <ShelfEditorDialog key={target.key} target={target} /> : null;
}

function ShelfEditorDialog({ target }: { target: ShelfEditorTarget }) {
  const { t } = useTranslation();
  const close = useShelfEditorStore((state) => state.close);
  const games = useLibraryStore((state) => state.games);
  const saveShelf = useLibraryStore((state) => state.saveShelf);
  const deleteShelf = useLibraryStore((state) => state.deleteShelf);
  const now = useNow();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const initialDraft = ruleToDraft(target.rule);
  const editable = initialDraft !== null;
  const [title, setTitle] = useState(target.title);
  const [draft, setDraft] = useState<RuleDraft>(initialDraft ?? { match: "all", rows: [] });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal?.();
  }, []);

  const rule = editable ? draftToRule(draft) : target.rule;
  const summary = ruleSummary(rule, t);
  const matching = games.filter((game) => matchesRule(game, rule, now.getTime())).length;
  const canSave = !editable || hasConditions(draft);

  const facets = buildFacets(games);
  const options = (field: Field): readonly string[] => {
    if (field === "tags") {
      const tags = facets.find((facet) => facet.key === "tags")?.values ?? [];
      return [...VIBE_TAGS, ...tags.filter((tag) => !VIBE_TAGS.includes(tag))];
    }
    return facets.find((facet) => facet.key === field)?.values ?? [];
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      close();
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  const save = () =>
    run(() =>
      saveShelf({
        id: target.shelf?.id ?? "",
        title: title.trim() || summary,
        rule,
        order: target.shelf?.order ?? 0,
        pinned: target.shelf?.pinned ?? false,
        seeded: false,
      }),
    );

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="shelf-editor-title"
      onClose={close}
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) void save();
        }}
      >
        <h2 className={styles.title} id="shelf-editor-title">
          {target.shelf ? t("shelfEditor.editTitle") : t("shelfEditor.newTitle")}
        </h2>

        <label className={styles.label} htmlFor="shelf-editor-name">
          {t("shelfEditor.name")}
        </label>
        <input
          id="shelf-editor-name"
          className={styles.input}
          value={title}
          placeholder={summary || t("shelfEditor.namePlaceholder")}
          onChange={(event) => setTitle(event.target.value)}
        />

        {editable ? (
          <>
            <div className={styles.matchRow}>
              <span className={styles.label} id="shelf-editor-match">
                {t("shelfEditor.match.label")}
              </span>
              <div className={styles.segmented} role="group" aria-labelledby="shelf-editor-match">
                {(["all", "any"] as const).map((match) => (
                  <button
                    key={match}
                    type="button"
                    className={styles.segment}
                    aria-pressed={draft.match === match}
                    onClick={() => setDraft({ ...draft, match })}
                  >
                    {t(`shelfEditor.match.${match}`)}
                  </button>
                ))}
              </div>
            </div>

            <ol className={styles.conditions}>
              {draft.rows.map((row, index) => (
                <ConditionRow
                  // Rows have no identity of their own; the position is stable while editing.
                  key={index}
                  row={row}
                  index={index}
                  options={options(row.field)}
                  onChange={(next) =>
                    setDraft({
                      ...draft,
                      rows: draft.rows.map((item, at) => (at === index ? next : item)),
                    })
                  }
                  onRemove={() =>
                    setDraft({ ...draft, rows: draft.rows.filter((_, at) => at !== index) })
                  }
                />
              ))}
            </ol>
            <button
              type="button"
              className={`${buttons.base} ${buttons.dashed} ${styles.addCondition}`}
              onClick={() => setDraft({ ...draft, rows: [...draft.rows, defaultRow("tags")] })}
            >
              {t("shelfEditor.addCondition")}
            </button>
          </>
        ) : (
          <p className={styles.hint}>{t("shelfEditor.unsupported", { rule: summary })}</p>
        )}

        <p className={styles.preview} aria-live="polite">
          {canSave
            ? t("shelfEditor.preview", { count: matching })
            : t("shelfEditor.needsCondition")}
        </p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          {target.shelf && (
            <button
              type="button"
              className={`${buttons.base} ${buttons.small} ${styles.delete}`}
              disabled={busy}
              onClick={() => {
                const shelf = target.shelf;
                if (!shelf) return;
                if (confirmingDelete) void run(() => deleteShelf(shelf.id));
                else setConfirmingDelete(true);
              }}
            >
              {confirmingDelete ? t("shelfEditor.confirmDelete") : t("shelfEditor.delete")}
            </button>
          )}
          <button type="button" className={`${buttons.base} ${buttons.small}`} onClick={close}>
            {t("shelfEditor.cancel")}
          </button>
          <button
            type="submit"
            className={`${buttons.base} ${buttons.smallAccent}`}
            disabled={busy || !canSave}
          >
            {t("shelfEditor.save")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
