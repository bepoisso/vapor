import { useToastStore } from "./toastStore";
import styles from "./Toast.module.css";

/** Mounted once: the current toast, bottom center. */
export function Toast() {
  const toast = useToastStore((state) => state.toast);
  const dismiss = useToastStore((state) => state.dismiss);
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {toast && (
        <div key={toast.id} className={styles.toast}>
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                toast.action?.onClick();
                dismiss();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
