import { type RefObject, useLayoutEffect, useState } from "react";

interface ColumnsOptions {
  /** Minimum card width in px (design system: ≈150 for shelves, ≈110 for the dense grid). */
  minWidth: number;
  gap: number;
  /** Upper bound on the column count (7 for shelves). */
  max?: number;
}

export interface Columns {
  count: number;
  /** Width of one column in px. */
  width: number;
}

export function computeColumns(containerWidth: number, { minWidth, gap, max }: ColumnsOptions) {
  const fit = Math.max(1, Math.floor((containerWidth + gap) / (minWidth + gap)));
  const count = max ? Math.min(max, fit) : fit;
  return { count, width: (containerWidth - gap * (count - 1)) / count };
}

/** Auto-fill column count for a container, kept in sync with its width. */
export function useColumns(ref: RefObject<HTMLElement | null>, options: ColumnsOptions): Columns {
  const { minWidth, gap, max } = options;
  const [columns, setColumns] = useState<Columns>({ count: max ?? 1, width: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = (width: number) => {
      const next = computeColumns(width, { minWidth, gap, max });
      setColumns((prev) =>
        prev.count === next.count && Math.abs(prev.width - next.width) < 0.5 ? prev : next,
      );
    };
    update(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) update(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, minWidth, gap, max]);

  return columns;
}
