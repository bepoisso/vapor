import styles from "./TopBar.module.css";

/** Vapor logo: two waves, the top one in accent. */
export function BrandMark() {
  return (
    <span className={styles.brand}>
      <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path className={styles.waveAccent} d="M5 20c4 0 4-4 8-4s4 4 8 4 4-4 6-4" />
        <path className={styles.waveMuted} d="M5 12c4 0 4-4 8-4s4 4 8 4 4-4 6-4" />
      </svg>
      vapor
    </span>
  );
}
