import type { Rule, Shelf } from "@/lib/bindings";

export const EMPTY_RULE: Rule = { match: "all", conditions: [] };

/** A smart shelf not saved yet (empty `id`: the backend gives it one). */
export function newShelf(partial: Partial<Shelf> = {}): Shelf {
  return {
    id: "",
    name: "",
    kind: "smart",
    rule: EMPTY_RULE,
    visible: true,
    pinned: false,
    order: 0,
    showAsMood: false,
    hideNotInstalled: false,
    ...partial,
  };
}

/** Names compared the way people read them: trimmed, case-insensitive. */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("en") === b.trim().toLocaleLowerCase("en");
}

/** "Demanding indies copy", then "… copy 2", "… copy 3": a name no other shelf has. */
export function copyName(name: string, shelves: readonly Shelf[], copy: string): string {
  const base = `${name} ${copy}`;
  let candidate = base;
  for (let index = 2; shelves.some((shelf) => sameName(shelf.name, candidate)); index++) {
    candidate = `${base} ${index}`;
  }
  return candidate;
}
