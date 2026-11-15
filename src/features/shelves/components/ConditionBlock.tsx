import { X } from "lucide-react";
import { useTranslation } from "@/i18n";
import type { Condition, Op } from "@/lib/bindings";
import { isSetField } from "@/features/library/logic/rules";
import styles from "../ShelfBuilderPage.module.css";

interface ConditionBlockProps {
  condition: Condition;
  /** Values found in the library, for genre / mode / vibe. */
  options: readonly string[];
  onChange: (condition: Condition) => void;
  onRemove: () => void;
}

/** One condition of the builder: "<Field> is any of" + toggle chips, or a comparison. */
export function ConditionBlock({ condition, options, onChange, onRemove }: ConditionBlockProps) {
  const { t } = useTranslation();
  const field = t(`rules.fields.${condition.field}`);
  const number = typeof condition.value === "number" ? condition.value : 0;
  const setNumber = (value: number, max?: number) => {
    const clean = Number.isFinite(value) ? Math.max(0, value) : 0;
    onChange({ ...condition, value: max === undefined ? clean : Math.min(max, clean) });
  };

  const opSelect = (
    <select
      className={styles.select}
      aria-label={t("builder.comparison", { field })}
      value={condition.op ?? "gt"}
      onChange={(event) => onChange({ ...condition, op: event.target.value as Op })}
    >
      <option value="gt">{t("builder.ops.gt")}</option>
      <option value="lt">{t("builder.ops.lt")}</option>
    </select>
  );
  const numberInput = (unit: string, max?: number) => (
    <>
      <input
        className={styles.number}
        type="number"
        min={0}
        max={max}
        aria-label={`${field} (${unit})`}
        value={number}
        onChange={(event) => setNumber(Number(event.target.value), max)}
      />
      <span className={styles.unit}>{unit}</span>
    </>
  );

  let body;
  if (isSetField(condition.field)) {
    const selected = condition.values ?? [];
    const choices = [...options, ...selected.filter((value) => !options.includes(value))];
    body =
      choices.length === 0 ? (
        <span className={styles.hint}>{t("builder.noValues")}</span>
      ) : (
        <div className={styles.chips} role="group" aria-label={field}>
          {choices.map((value) => {
            const on = selected.includes(value);
            return (
              <button
                key={value}
                type="button"
                className={styles.chip}
                aria-pressed={on}
                onClick={() =>
                  onChange({
                    ...condition,
                    values: on ? selected.filter((item) => item !== value) : [...selected, value],
                  })
                }
              >
                {value}
              </button>
            );
          })}
        </div>
      );
  } else if (condition.field === "installed") {
    body = (
      <div className={styles.segmented} role="group" aria-label={field}>
        {[true, false].map((value) => (
          <button
            key={String(value)}
            type="button"
            aria-pressed={condition.value === value}
            onClick={() => onChange({ ...condition, op: "is", value })}
          >
            {value ? t("rules.installed") : t("rules.notInstalled")}
          </button>
        ))}
      </div>
    );
  } else if (condition.field === "lastPlayed") {
    body = (
      <div className={styles.inline}>
        <span className={styles.unit}>{t("builder.olderThan")}</span>
        {numberInput(t("builder.units.daysAgo"))}
      </div>
    );
  } else {
    body = (
      <div className={styles.inline}>
        {opSelect}
        {condition.field === "playtime"
          ? numberInput(t("builder.units.hours"))
          : numberInput(t("builder.units.percent"), 100)}
      </div>
    );
  }

  return (
    <div className={styles.block}>
      <div className={styles.blockHead}>
        <span className={styles.blockField}>{field}</span>
        {isSetField(condition.field) && (
          <span className={styles.blockHint}>{t("builder.isAnyOf")}</span>
        )}
        <button
          type="button"
          className={styles.remove}
          aria-label={t("builder.removeCondition", { field })}
          onClick={onRemove}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      {body}
    </div>
  );
}
