import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import buttons from "@/components/Button/buttons.module.css";
import dialog from "@/features/library/components/TagEditor.module.css";
import type { Shelf } from "@/lib/bindings";
import { errorMessage } from "@/lib/errors";
import styles from "../ManageShelvesPage.module.css";

interface ShelfDialogProps {
  shelf: Shelf;
  mode: "rename" | "delete";
  /** Applies the change; throws to show an error. */
  onConfirm: (name: string) => Promise<void>;
  onClose: () => void;
}

/** Rename a shelf, or confirm deleting it. */
export function ShelfDialog({ shelf, mode, onConfirm, onClose }: ShelfDialogProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(shelf.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = ref.current;
    // `showModal` traps focus and makes Escape close the dialog (missing in jsdom).
    if (element && !element.open) element.showModal?.();
  }, []);

  const confirm = async () => {
    if (mode === "rename" && !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(name.trim());
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref}
      className={dialog.dialog}
      aria-labelledby="shelf-dialog-title"
      onClose={onClose}
    >
      <form
        className={dialog.form}
        onSubmit={(event) => {
          event.preventDefault();
          void confirm();
        }}
      >
        <h2 className={dialog.title} id="shelf-dialog-title">
          {mode === "rename"
            ? t("manage.renameTitle")
            : t("manage.deleteTitle", { name: shelf.name })}
        </h2>
        {mode === "rename" ? (
          <>
            <label className="sr-only" htmlFor="shelf-dialog-name">
              {t("builder.name")}
            </label>
            <input
              id="shelf-dialog-name"
              className={`${dialog.input} ${styles.dialogInput}`}
              value={name}
              required
              onChange={(event) => setName(event.target.value)}
            />
          </>
        ) : (
          <p className={dialog.text}>
            {shelf.kind === "steam" ? t("manage.deleteSteam") : t("manage.deleteBody")}
          </p>
        )}
        {error && (
          <p className={dialog.error} role="alert">
            {error}
          </p>
        )}
        <div className={dialog.actions}>
          <button type="button" className={`${buttons.base} ${buttons.small}`} onClick={onClose}>
            {t("manage.cancel")}
          </button>
          <button
            type="submit"
            className={`${buttons.base} ${buttons.smallAccent}`}
            disabled={busy || (mode === "rename" && !name.trim())}
          >
            {mode === "rename" ? t("manage.rename") : t("manage.delete")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
