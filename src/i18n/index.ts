import en from "./locales/en.json";

/**
 * UI strings. The UI is English only, so this is a small typed table instead of an i18n
 * framework (i18next cost ~100 KB of startup JavaScript). Strings stay centralized in
 * `locales/en.json`; keys are checked at compile time; `{{name}}` placeholders are filled from
 * `params`; a `count` param picks `<key>_one` / `<key>_other` (Intl.PluralRules).
 */

type Messages = typeof en;

/** Dotted paths to every string leaf, e.g. "library.sort.button". */
type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Plural variants are addressed by their base key: "library.count" for "library.count_one". */
type BaseKey<K extends string> = K extends `${infer Base}_one` | `${infer Base}_other` ? Base : K;

export type MessageKey = BaseKey<Leaves<Messages>>;
export type MessageParams = Record<string, string | number>;

const pluralRules = new Intl.PluralRules("en");

function lookup(key: string): string | undefined {
  let node: unknown = en;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function t(key: MessageKey, params?: MessageParams): string {
  const count = params?.count;
  const template =
    (typeof count === "number"
      ? (lookup(`${key}_${pluralRules.select(count)}`) ?? lookup(`${key}_other`))
      : undefined) ?? lookup(key);
  if (template === undefined) return key;
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name] ?? ""));
}

export type Translate = typeof t;

/** Same shape as react-i18next's hook, so components read `const { t } = useTranslation()`. */
export function useTranslation(): { t: Translate } {
  return { t };
}
