import { useState } from "react";

/**
 * A reference "now" captured once per mount, so rules and suggestions stay stable across
 * re-renders (render functions must be pure).
 */
export function useNow(): Date {
  const [now] = useState(() => new Date());
  return now;
}
