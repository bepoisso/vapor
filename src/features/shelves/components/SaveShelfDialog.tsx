import { Sparkle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { navigate } from "@/app/navigation";
import { useToastStore } from "@/components/Toast/toastStore";
import { useTranslation } from "@/i18n";
import buttons from "@/components/Button/buttons.module.css";
import { errorMessage } from "@/lib/errors";
import { useNow } from "@/features/library/hooks/useNow";
import { type FacetSelection, FACET_KEYS, facetsToRule } from "@/features/library/logic/facets";
import { matchesRule } from "@/features/library/logic/rules";
import { autoName } from "@/features/library/logic/shelves";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { newShelf } from "../logic/shelfDraft";
import { useBuilderDraftStore } from "../store/builderDraftStore";
import { useSaveShelfDialogStore } from "../store/saveShelfDialogStore";
import { ConditionChip, Joiner } from "./ConditionChip";
import styles from "./SaveShelfDialog.module.css";

const PREVIEW_COVERS = 5;
type Place = "library" | "mood" | "pinned";
const PLACES: readonly Place[] = ["library", "mood", "pinned"];

/** Mounted once; "Save as shelf" from the library filters (S4). */
export function SaveShelfDialog() {
  const selection = useSaveShelfDialogStore((state) => state.selection);
  const key = useSaveShelfDialogStore((state) => state.key);
  return selection ? <Dialog key={key} selection={selection} /> : null;
}

function Dialog({ selection }: { selection: FacetSelection }) {
  const { t } = useTranslation();
  const close = useSaveShelfDialogStore((state) => state.close);
  const games = useLibraryStore((state) => state.games);
  const saveShelf = useLibraryStore((state) => state.saveShelf);
  const setDraft = useBuilderDraftStore((state) => state.set);
  const showToast = useToastStore((state) => state.show);
  const now = useNow().getTime();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const auto = autoName(FACET_KEYS.flatMap((facet) => selection[facet]));
  const [name, setName] = useState(auto);
  const [places, setPlaces] = useState<Record<Place, boolean>>({
    library: true,
    mood: false,
    pinned: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rule = facetsToRule(selection);
  const matching = games.filter((game) => matchesRule(game, rule, now));
  const suggestions = [...new Set([auto, t("saveShelf.ideas.weekend"), t("saveShelf.ideas.next")])];

  useEffect(() => {
    const dialog = dialogRef.current;
    // `showModal` traps focus and makes Escape close the dialog (missing in jsdom).
    if (dialog && !dialog.open) dialog.showModal?.();
    nameRef.current?.select();
  }, []);

  const shelf = () =>
    newShelf({
      name: name.trim(),
      rule,
      visible: places.library,
      showAsMood: places.mood,
      pinned: places.pinned,
    });

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveShelf(shelf());
      close();
      if (saved) {
        showToast(t("saveShelf.created"), {
          label: t("saveShelf.view"),
          onClick: () => navigate(`/shelf/${saved.id}`),
        });
      }
    } catch (failure) {
      setError(errorMessage(failure));
      setSaving(false);
    }
  };

  return (
    // The keyboard closes it with Escape (native dialog); the click is for the veil only.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="save-shelf-title"
      onClose={close}
      // A click on the backdrop lands on the dialog element itself.
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <div className={styles.head}>
          <span className={styles.icon} aria-hidden="true">
            <Sparkle size={18} strokeWidth={2.2} />
          </span>
          <h2 className={styles.title} id="save-shelf-title">
            {t("saveShelf.title")}
          </h2>
          <button
            type="button"
            className={styles.close}
            aria-label={t("saveShelf.close")}
            onClick={close}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <label className={styles.field}>
          <span className={styles.eyebrow}>{t("saveShelf.name")}</span>
          <input
            ref={nameRef}
            className={styles.name}
            value={name}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className={styles.suggestions}>
          <span className={styles.muted}>{t("saveShelf.suggestions")}</span>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className={styles.chip}
              onClick={() => {
                setName(suggestion);
                nameRef.current?.focus();
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div className={styles.field}>
          <span className={styles.eyebrow}>{t("saveShelf.rule")}</span>
          <div className={styles.rule}>
            {(rule.conditions ?? []).map((condition, index) => (
              <span key={condition.field} className={styles.ruleItem}>
                {index > 0 && <Joiner any={false} />}
                <ConditionChip condition={condition} />
              </span>
            ))}
            <button
              type="button"
              className={styles.detail}
              onClick={() => {
                setDraft(shelf());
                close();
                navigate("/shelves/new");
              }}
            >
              {t("saveShelf.editInDetail")}
            </button>
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.eyebrow}>
            {t("saveShelf.preview", { count: matching.length })}
          </span>
          <div className={styles.previews}>
            {matching
              .slice(0, PREVIEW_COVERS)
              .map((game) =>
                game.images.cover ? (
                  <img
                    key={game.appId}
                    className={styles.preview}
                    src={game.images.coverSmall ?? game.images.cover}
                    alt={game.name}
                  />
                ) : (
                  <span
                    key={game.appId}
                    className={styles.preview}
                    role="img"
                    aria-label={game.name}
                  />
                ),
              )}
            <span className={styles.ghost}>{t("saveShelf.auto")}</span>
          </div>
        </div>

        <div className={styles.field}>
          <span className={styles.eyebrow}>{t("saveShelf.where")}</span>
          <div className={styles.places}>
            {PLACES.map((place) => (
              <button
                key={place}
                type="button"
                className={styles.place}
                aria-pressed={places[place]}
                onClick={() => setPlaces((current) => ({ ...current, [place]: !current[place] }))}
              >
                {t(`saveShelf.places.${place}`)}
                <span className={styles.placeHint}>{t(`saveShelf.places.${place}Hint`)}</span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <button type="button" className={`${buttons.base} ${buttons.medium}`} onClick={close}>
            {t("saveShelf.cancel")}
          </button>
          <button
            type="submit"
            className={`${buttons.base} ${buttons.mediumAccent}`}
            disabled={saving || !name.trim()}
          >
            {t("saveShelf.create")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
