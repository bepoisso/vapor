import { isTauri } from "@tauri-apps/api/core";
import { create } from "zustand";
import { useToastStore } from "@/components/Toast/toastStore";
import { t } from "@/i18n";
import { commands, type UpdateInfo } from "@/lib/bindings";
import { errorMessage } from "@/lib/errors";

type Status = "idle" | "checking" | "upToDate" | "available" | "installing" | "error";

interface UpdateState {
  status: Status;
  update: UpdateInfo | null;
  error: string | null;
  check: () => Promise<void>;
  /** Downloads and installs, then Vapor restarts. */
  install: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>()((set) => ({
  status: "idle",
  update: null,
  error: null,
  check: async () => {
    set({ status: "checking", error: null });
    try {
      const update = await commands.checkForUpdate();
      set({ status: update ? "available" : "upToDate", update });
    } catch (error) {
      set({ status: "error", error: errorMessage(error) });
    }
  },
  install: async () => {
    set({ status: "installing", error: null });
    try {
      await commands.installUpdate();
    } catch (error) {
      set({ status: "error", error: errorMessage(error) });
    }
  },
}));

/** Wait this long after startup: the check never competes with the library's first paint. */
const STARTUP_DELAY_MS = 8000;

/** Release builds look for a newer version once, quietly, and offer it in a toast. */
export function checkForUpdateLater(): void {
  if (!isTauri() || !import.meta.env.PROD) return;
  setTimeout(() => {
    const { check } = useUpdateStore.getState();
    void check().then(() => {
      const { status, update, install } = useUpdateStore.getState();
      if (status !== "available" || !update) return;
      useToastStore.getState().show(t("updates.toast", { version: update.version }), {
        label: t("updates.install"),
        onClick: () => void install(),
      });
    });
  }, STARTUP_DELAY_MS);
}
