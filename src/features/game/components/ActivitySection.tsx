import { useState } from "react";
import { useTranslation } from "@/i18n";
import type { ActivityItem, GameSocial } from "@/lib/bindings";
import { formatShortDate } from "@/features/library/logic/format";
import type { Load } from "../store/gameStore";
import page from "../GamePage.module.css";
import { Avatar } from "./Avatar";
import styles from "./Overview.module.css";

/** Items shown before "See more". */
const VISIBLE = 3;

interface ActivitySectionProps {
  social: Load<GameSocial | null>;
}

/**
 * Friends' recent achievements in this game. Hidden without friends data (no API key, private
 * friends list) or when nothing happened.
 */
export function ActivitySection({ social }: ActivitySectionProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const loading =
    social.status === "loading" ||
    (social.status === "ready" && social.data !== null && social.data.loading);
  const items = social.status === "ready" ? (social.data?.activity ?? []) : [];

  if (items.length === 0) {
    if (!loading) return null;
    return (
      <>
        <h2 className={page.h2}>{t("game.activity.title")}</h2>
        <div className={`${page.skeleton} ${styles.skeletonActivity}`} aria-hidden="true" />
      </>
    );
  }

  const shown = expanded ? items : items.slice(0, VISIBLE);
  return (
    <>
      <h2 className={page.h2}>{t("game.activity.title")}</h2>
      {shown.map((item) => (
        <ActivityCard key={`${item.friend}-${item.date}`} item={item} />
      ))}
      {items.length > VISIBLE && (
        <button
          type="button"
          className={page.link}
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? t("game.activity.seeLess") : t("game.activity.seeMore")}
        </button>
      )}
    </>
  );
}

function ActivityCard({ item }: { item: ActivityItem }) {
  const { t } = useTranslation();
  const date = formatShortDate(item.date) ?? "";
  return (
    <div className={`${page.card} ${page.stack}`}>
      <span className={styles.person}>
        <Avatar src={item.friendAvatar} name={item.friend} size={32} />
        <span>
          <span className={styles.personName}>{item.friend}</span>{" "}
          <span className={page.label}>
            {t("game.activity.earned", { count: item.count, date })}
          </span>
        </span>
      </span>
      {item.items.length > 0 && (
        <div className={styles.tiles}>
          {item.items.map((achievement, index) => (
            <div key={index} className={styles.tile}>
              {achievement.icon ? (
                <img className={styles.icon} src={achievement.icon} alt="" loading="lazy" />
              ) : (
                <span className={styles.icon} aria-hidden="true">
                  ?
                </span>
              )}
              <span className={styles.tileText}>
                <span className={styles.tileName}>
                  {achievement.hidden
                    ? t("game.activity.hidden")
                    : (achievement.name ?? t("game.activity.unknown"))}
                </span>
                {achievement.hidden && (
                  <span className={page.label}>{t("game.activity.hiddenHint")}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
