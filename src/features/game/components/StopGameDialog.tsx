import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import buttons from "@/components/Button/buttons.module.css";
import dialog from "@/features/library/components/TagEditor.module.css";
import { commands, type Game } from "@/lib/bindings";
import { errorMessage } from "@/lib/errors";

interface StopGameDialogProps {
  game: Game;
  onClose: () => void;
}

/** Confirms before Vapor ends a running game's processes (Steam has no "close game" URL). */
export function StopGameDialog({ game, onClose }: StopGameDialogProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = ref.current;
    // `showModal` traps focus and makes Escape close the dialog (missing in jsdom).
    if (element && !element.open) element.showModal?.();
  }, []);

  const stop = async () => {
    setStopping(true);
    setError(null);
    try {
      await commands.stopGame(game.appId);
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
      setStopping(false);
    }
  };

  return (
    <dialog ref={ref} className={dialog.dialog} aria-labelledby="stop-game-title" onClose={onClose}>
      <form
        className={dialog.form}
        onSubmit={(event) => {
          event.preventDefault();
          void stop();
        }}
      >
        <h2 className={dialog.title} id="stop-game-title">
          {t("game.stop.title", { name: game.name })}
        </h2>
        <p className={dialog.text}>{t("game.stop.body")}</p>
        {error && (
          <p className={dialog.error} role="alert">
            {t("game.stop.error", { message: error })}
          </p>
        )}
        <div className={dialog.actions}>
          <button type="button" className={`${buttons.base} ${buttons.small}`} onClick={onClose}>
            {t("game.stop.cancel")}
          </button>
          <button
            type="submit"
            className={`${buttons.base} ${buttons.smallAccent}`}
            disabled={stopping}
          >
            {t("game.stop.confirm")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
