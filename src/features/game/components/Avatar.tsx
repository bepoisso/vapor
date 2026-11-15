import { useState } from "react";
import styles from "./Avatar.module.css";

interface AvatarProps {
  src: string | null;
  name: string;
  size: number;
}

/** A friend's round avatar; their initial on a neutral disc when there is no picture. */
export function Avatar({ src, name, size }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (src && !broken) {
    return (
      <img
        className={styles.avatar}
        style={style}
        src={src}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className={`${styles.avatar} ${styles.initial}`} style={style} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
