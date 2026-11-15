import { create } from "zustand";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
}

interface ToastState {
  toast: Toast | null;
  show: (message: string, action?: ToastAction) => void;
  dismiss: () => void;
}

/** How long a toast stays on screen. */
const DURATION_MS = 5000;

let next = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

/** One short message at a time ("Saved · Undo", "Shelf created · View"). */
export const useToastStore = create<ToastState>()((set) => ({
  toast: null,
  show: (message, action) => {
    clearTimeout(timer);
    const id = ++next;
    set({ toast: { id, message, action } });
    timer = setTimeout(() => {
      set((state) => (state.toast?.id === id ? { toast: null } : {}));
    }, DURATION_MS);
  },
  dismiss: () => {
    clearTimeout(timer);
    set({ toast: null });
  },
}));
