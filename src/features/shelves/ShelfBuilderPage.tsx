import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { navigate, previousRoute } from "@/app/navigation";
import { useTranslation } from "@/i18n";
import buttons from "@/components/Button/buttons.module.css";
import type { Condition, Field, Match, Shelf } from "@/lib/bindings";
import { errorMessage } from "@/lib/errors";
import { markDataReady, revealContent } from "@/lib/startup";
import { useNow } from "@/features/library/hooks/useNow";
import { buildFacets, VIBE_TAGS } from "@/features/library/logic/facets";
import {
  FIELDS,
  matchesRule,
  newCondition,
  ruleSentence,
  whyMatched,
} from "@/features/library/logic/rules";
import { useLibraryStore } from "@/features/library/store/libraryStore";
import { ConditionBlock } from "./components/ConditionBlock";
import { EMPTY_RULE, newShelf, sameName } from "./logic/shelfDraft";
import { useBuilderDraftStore } from "./store/builderDraftStore";
import styles from "./ShelfBuilderPage.module.css";

const MODES = ["Solo", "Coop", "PvP"];
const PREVIEW_MAX = 60;

interface ShelfBuilderPageProps {
  /** The shelf to edit; `undefined` for a new one. */
  id?: string;
}

/** S2 · full-page rule builder (`/shelves/new`, `/shelves/<id>/edit`). */
export function ShelfBuilderPage({ id }: ShelfBuilderPageProps) {
  const { t } = useTranslation();
  const status = useLibraryStore((state) => state.status);
  const existing = useLibraryStore((state) =>
    id === undefined ? undefined : state.shelves.find((shelf) => shelf.id === id),
  );
  const takeDraft = useBuilderDraftStore((state) => state.take);
  // The starting point, fixed for the page's lifetime (the router keys the page by route).
  const [initial] = useState<Shelf | null>(() =>
    id === undefined ? (takeDraft() ?? newShelf()) : null,
  );
  const ready = status === "ready" || status === "error";

  useEffect(() => {
    if (!ready) return;
    markDataReady();
    void revealContent();
  }, [ready]);

  if (initial) return <Builder initial={initial} />;
  if (existing && existing.kind === "smart") return <Builder initial={existing} />;
  if (!ready) return <main className={styles.page} aria-busy="true" />;
  return (
    <main className={styles.page}>
      <p className={styles.notFound}>{t("builder.notFound")}</p>
    </main>
  );
}

function goBack(saved?: Shelf) {
  const previous = previousRoute();
  if (previous && previous !== "/shelves/new" && !previous.endsWith("/edit")) {
    window.history.back();
  } else {
    navigate(saved ? `/shelf/${saved.id}` : "/shelves");
  }
}

function Builder({ initial }: { initial: Shelf }) {
  const { t } = useTranslation();
  const games = useLibraryStore((state) => state.games);
  const shelves = useLibraryStore((state) => state.shelves);
  const saveShelf = useLibraryStore((state) => state.saveShelf);
  const now = useNow().getTime();
  const nameRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Shelf>(initial);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNew = initial.id === "";
  const rule = draft.rule ?? EMPTY_RULE;
  const conditions = rule.conditions ?? [];
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const duplicate = shelves.some(
    (shelf) =>
      shelf.id !== draft.id && draft.name.trim() !== "" && sameName(shelf.name, draft.name),
  );
  const canSave = draft.name.trim() !== "" && !saving;
  const matching = games.filter((game) => matchesRule(game, rule, now));

  const facets = buildFacets(games);
  const options = (field: Field): readonly string[] => {
    if (field === "modes") return MODES;
    if (field === "tags") {
      const tags = facets.find((facet) => facet.key === "tags")?.values ?? [];
      return [...VIBE_TAGS, ...tags.filter((tag) => !VIBE_TAGS.includes(tag))];
    }
    return facets.find((facet) => facet.key === field)?.values ?? [];
  };
  const unused = FIELDS.filter(
    (field) => !conditions.some((condition) => condition.field === field),
  );

  const setRule = (change: { match?: Match; conditions?: Condition[] }) =>
    setDraft((current) => ({ ...current, rule: { ...rule, ...change } }));
  const setCondition = (index: number, condition: Condition) =>
    setRule({ conditions: conditions.map((item, other) => (other === index ? condition : item)) });

  const save = async (asMood = false) => {
    if (!canSave) {
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveShelf({
        ...draft,
        name: draft.name.trim(),
        showAsMood: asMood || (draft.showAsMood ?? false),
      });
      goBack(saved);
    } catch (failure) {
      setError(errorMessage(failure));
      setSaving(false);
    }
  };
  const cancel = () => {
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    goBack();
  };

  // Ctrl+Enter saves, Escape cancels (asking first when there are changes).
  const keys = useRef({ save, cancel });
  useEffect(() => {
    keys.current = { save, cancel };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void keys.current.save();
      } else if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        keys.current.cancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const display: { key: "visible" | "pinned" | "hideNotInstalled"; label: string }[] = [
    { key: "visible", label: t("builder.display.visible") },
    { key: "pinned", label: t("builder.display.pinned") },
    { key: "hideNotInstalled", label: t("builder.display.hideNotInstalled") },
  ];

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <button
          type="button"
          className={styles.cancel}
          data-confirm={confirmDiscard}
          onClick={cancel}
        >
          <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
          {confirmDiscard ? t("builder.discard") : t("builder.cancel")}
        </button>
        <h1 className={styles.headTitle}>
          {isNew ? t("builder.newTitle") : t("builder.editTitle")}
        </h1>
        <span className={styles.headActions}>
          <button
            type="button"
            className={`${buttons.base} ${buttons.medium}`}
            disabled={!canSave}
            onClick={() => void save(true)}
          >
            {t("builder.saveAsMood")}
          </button>
          <button
            type="button"
            className={`${buttons.base} ${buttons.mediumAccent}`}
            disabled={!canSave}
            onClick={() => void save()}
          >
            {isNew ? t("builder.create") : t("builder.save")}
          </button>
        </span>
      </header>

      <div className={styles.layout}>
        <aside className={styles.side}>
          <label className={styles.field}>
            <span className={styles.eyebrow}>{t("builder.name")}</span>
            <input
              ref={nameRef}
              className={styles.name}
              value={draft.name}
              required
              // The first thing to type on a new shelf.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={isNew}
              placeholder={t("builder.namePlaceholder")}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
            {duplicate && <span className={styles.warning}>{t("builder.duplicate")}</span>}
          </label>

          <div className={styles.field}>
            <span className={styles.eyebrow}>{t("builder.match")}</span>
            <div className={styles.segmented} role="group" aria-label={t("builder.match")}>
              {(["all", "any"] as const).map((match) => (
                <button
                  key={match}
                  type="button"
                  aria-pressed={rule.match === match}
                  onClick={() => setRule({ match })}
                >
                  {t(`builder.matchModes.${match}`)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.eyebrow}>{t("builder.conditions")}</span>
            <div className={styles.blocks}>
              {conditions.map((condition, index) => (
                <div key={condition.field} className={styles.blockWrap}>
                  {index > 0 && (
                    <span className={styles.joiner}>
                      {rule.match === "all" ? t("shelf.and") : t("shelf.or")}
                    </span>
                  )}
                  <ConditionBlock
                    condition={condition}
                    options={options(condition.field)}
                    onChange={(next) => setCondition(index, next)}
                    onRemove={() =>
                      setRule({ conditions: conditions.filter((_, other) => other !== index) })
                    }
                  />
                </div>
              ))}
            </div>
            {unused.length > 0 && (
              <div className={styles.addRow}>
                {unused.map((field) => (
                  <button
                    key={field}
                    type="button"
                    className={styles.add}
                    onClick={() => setRule({ conditions: [...conditions, newCondition(field)] })}
                  >
                    + {t(`rules.fields.${field}`)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.field}>
            <span className={styles.eyebrow}>{t("builder.display.label")}</span>
            {display.map(({ key, label }) => (
              <label key={key} className={styles.check}>
                <input
                  type="checkbox"
                  checked={draft[key] ?? false}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [key]: event.target.checked }))
                  }
                />
                {label}
              </label>
            ))}
          </div>

          {error && (
            <p className={styles.warning} role="alert">
              {error}
            </p>
          )}
        </aside>

        <section className={styles.main} aria-labelledby="preview-title">
          <div className={styles.previewHead}>
            <h2 id="preview-title" className={styles.previewTitle}>
              {t("builder.preview")}
            </h2>
            <span className={styles.count}>{matching.length}</span>
            <span className={styles.mutedText}>
              {t("builder.matchCount", { count: matching.length })}
            </span>
          </div>
          <p className={styles.sentence}>{ruleSentence(rule, t)}</p>
          {matching.length === 0 ? (
            <div className={styles.empty}>{t("builder.empty")}</div>
          ) : (
            <div className={styles.grid}>
              {matching.slice(0, PREVIEW_MAX).map((game) => (
                <div key={game.appId} className={styles.cover}>
                  {game.images.cover ? (
                    <img
                      className={styles.art}
                      src={game.images.coverSmall ?? game.images.cover}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <span className={styles.art} aria-hidden="true" />
                  )}
                  <span className={styles.coverTitle}>{game.name}</span>
                  <span className={styles.why}>{whyMatched(game, rule)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
