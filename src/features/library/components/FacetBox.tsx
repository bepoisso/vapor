import { useTranslation } from "react-i18next";
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
  return (
    <div className={styles.facets} role="group" aria-label={t("library.facets.label")}>
      {facets.map((facet) => (
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
