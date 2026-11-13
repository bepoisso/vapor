import { useTranslation } from "@/i18n";
import type { Facet, FacetCounts, FacetKey, FacetSelection } from "../logic/facets";
import { FacetChip } from "./FacetChip";
import styles from "./LibrarySection.module.css";

interface FacetBoxProps {
  facets: readonly Facet[];
  counts: FacetCounts;
  selection: FacetSelection;
  onToggle: (key: FacetKey, value: string) => void;
}

/** Genre / Mode / Vibe chips that filter the grid live. */
export function FacetBox({ facets, counts, selection, onToggle }: FacetBoxProps) {
  const { t } = useTranslation();
  // Genres, modes and tags are unknown until the Store API fills them (Phase 4).
  const shown = facets.filter((facet) => facet.values.length > 0);
  if (shown.length === 0) return null;
  return (
    <div className={styles.facets} role="group" aria-label={t("library.facets.label")}>
      {shown.map((facet) => (
        <div
          key={facet.key}
          className={styles.facet}
          role="group"
          aria-labelledby={`facet-${facet.key}`}
        >
          <span className={styles.facetLabel} id={`facet-${facet.key}`}>
            {t(`library.facets.${facet.key}`)}
          </span>
          {facet.values.map((value) => (
            <FacetChip
              key={value}
              label={value}
              count={counts[facet.key].get(value) ?? 0}
              selected={selection[facet.key].includes(value)}
              onToggle={() => onToggle(facet.key, value)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
