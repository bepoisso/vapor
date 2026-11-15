import { Heart } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useGameStore } from "../store/gameStore";
import styles from "./GameHero.module.css";

interface FavoriteButtonProps {
  appId: number;
  favorite: boolean;
}

/** Heart toggle; favorites also show as a row in the library. */
export function FavoriteButton({ appId, favorite }: FavoriteButtonProps) {
  const { t } = useTranslation();
  const setFavorite = useGameStore((state) => state.setFavorite);
  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-pressed={favorite}
      aria-label={t("game.favorite")}
      title={t("game.favorite")}
      onClick={() => void setFavorite(appId, !favorite)}
    >
      <Heart size={20} fill="currentColor" strokeWidth={0} aria-hidden="true" />
    </button>
  );
}
