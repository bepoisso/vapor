import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { errorMessage } from "@/lib/errors";
import { useGameStore } from "../store/gameStore";
import page from "../GamePage.module.css";
import styles from "./NotesTab.module.css";

/** Save this long after the last keystroke (and on blur). */
const SAVE_DELAY_MS = 800;

interface NotesTabProps {
  appId: number;
  /** Saved notes; `null` while the page's details load. */
  notes: string | null;
}

type Status = "idle" | "saving" | "saved" | { error: string };

/** Free text, saved on this computer only, never synced. */
export function NotesTab({ appId, notes }: NotesTabProps) {
  const { t } = useTranslation();
  const saveNotes = useGameStore((state) => state.saveNotes);
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest unsaved text, for the save on leaving the tab.
  const unsaved = useRef<string | null>(null);
  const value = draft ?? notes ?? "";

  const save = (text: string) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    unsaved.current = null;
    if (text === notes) return;
    setStatus("saving");
    saveNotes(appId, text).then(
      () => setStatus("saved"),
      (error: unknown) => setStatus({ error: errorMessage(error) }),
    );
  };

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      if (unsaved.current !== null) void saveNotes(appId, unsaved.current).catch(() => undefined);
    },
    [appId, saveNotes],
  );

  return (
    <div className={`${page.panel} ${page.stack}`}>
      <label className="sr-only" htmlFor="game-notes">
        {t("game.notes.label")}
      </label>
      <textarea
        id="game-notes"
        className={styles.notes}
        value={value}
        disabled={notes === null}
        placeholder={t("game.notes.placeholder")}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          unsaved.current = text;
          if (timer.current !== null) clearTimeout(timer.current);
          timer.current = setTimeout(() => save(text), SAVE_DELAY_MS);
        }}
        onBlur={() => {
          if (unsaved.current !== null) save(unsaved.current);
        }}
      />
      <span className={page.label} aria-live="polite">
        {status === "saving"
          ? t("game.notes.saving")
          : status === "saved"
            ? t("game.notes.saved")
            : typeof status === "object"
              ? t("game.notes.error", { message: status.error })
              : ""}
      </span>
    </div>
  );
}
