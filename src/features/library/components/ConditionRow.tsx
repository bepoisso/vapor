import { X } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { Field, Op } from "@/lib/bindings";
import { DRAFT_FIELDS, defaultRow, type DraftRow, LIST_FIELDS } from "../logic/ruleDraft";
import styles from "./ShelfEditor.module.css";

interface ConditionRowProps {
  row: DraftRow;
  index: number;
  /** Values found in the library, for genre / mode / vibe rows. */
  options: readonly string[];
  onChange: (row: DraftRow) => void;
  onRemove: () => void;
}

const MINUTES_PER_HOUR = 60;

export function ConditionRow({ row, index, options, onChange, onRemove }: ConditionRowProps) {
  const { t } = useTranslation();
  const id = `condition-${index}`;
  const number = typeof row.values[0] === "number" ? row.values[0] : 0;
  const setNumber = (value: number) =>
    onChange({ ...row, values: [Number.isFinite(value) ? Math.max(0, value) : 0] });

  const opSelect = (
    <select
      className={styles.select}
      aria-label={t("shelfEditor.operator")}
      value={row.op}
      onChange={(event) => onChange({ ...row, op: event.target.value as Op })}
    >
      <option value="gt">{t("shelfEditor.ops.gt")}</option>
      <option value="lt">{t("shelfEditor.ops.lt")}</option>
    </select>
  );

  const editor = (() => {
    if (LIST_FIELDS.includes(row.field)) {
      const choices = [
        ...options,
        ...row.values.map(String).filter((value) => !options.includes(value)),
      ];
      if (choices.length === 0)
        return <span className={styles.hint}>{t("shelfEditor.noValues")}</span>;
      return (
        <div
          className={styles.chips}
          role="group"
          aria-label={t(`shelfEditor.fields.${row.field}`)}
        >
          {choices.map((value) => {
            const selected = row.values.includes(value);
            return (
              <button
                key={value}
                type="button"
                className={styles.chip}
                aria-pressed={selected}
                onClick={() =>
                  onChange({
                    ...row,
                    values: selected
                      ? row.values.filter((item) => item !== value)
                      : [...row.values, value],
                  })
                }
              >
                {value}
              </button>
            );
          })}
        </div>
      );
    }
    switch (row.field) {
      case "installed":
        return (
          <select
            className={styles.select}
            aria-label={t("shelfEditor.fields.installed")}
            value={row.values[0] === false ? "no" : "yes"}
            onChange={(event) => onChange({ ...row, values: [event.target.value === "yes"] })}
          >
            <option value="yes">{t("shelfEditor.installed.yes")}</option>
            <option value="no">{t("shelfEditor.installed.no")}</option>
          </select>
        );
      case "playtimeMinutes":
        return (
          <span className={styles.inline}>
            {opSelect}
            <input
              className={styles.number}
              type="number"
              min={0}
              aria-label={t("shelfEditor.units.hours")}
              value={Math.round(number / MINUTES_PER_HOUR)}
              onChange={(event) => setNumber(Number(event.target.value) * MINUTES_PER_HOUR)}
            />
            {t("shelfEditor.units.hours")}
          </span>
        );
      case "lastPlayed":
        return (
          <span className={styles.inline}>
            <input
              className={styles.number}
              type="number"
              min={0}
              aria-label={t("shelfEditor.units.days")}
              value={number}
              onChange={(event) => setNumber(Number(event.target.value))}
            />
            {t("shelfEditor.units.days")}
          </span>
        );
      case "achievementsPct":
        return (
          <span className={styles.inline}>
            {opSelect}
            <input
              className={styles.number}
              type="number"
              min={0}
              max={100}
              aria-label={t("shelfEditor.units.percent")}
              value={number}
              onChange={(event) => setNumber(Math.min(100, Number(event.target.value)))}
            />
            {t("shelfEditor.units.percent")}
          </span>
        );
      default:
        return null;
    }
  })();

  return (
    <li className={styles.condition}>
      <label className="sr-only" htmlFor={id}>
        {t("shelfEditor.field")}
      </label>
      <select
        id={id}
        className={styles.select}
        value={row.field}
        onChange={(event) => onChange(defaultRow(event.target.value as Field))}
      >
        {DRAFT_FIELDS.map((field) => (
          <option key={field} value={field}>
            {t(`shelfEditor.fields.${field}`)}
          </option>
        ))}
      </select>
      <div className={styles.conditionEditor}>{editor}</div>
      <button
        type="button"
        className={styles.remove}
        aria-label={t("shelfEditor.removeCondition")}
        onClick={onRemove}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </li>
  );
}
