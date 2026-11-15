import { isTauri } from "@tauri-apps/api/core";
import { create } from "zustand";
import {
  type AchievementList,
  commands,
  events,
  type GameDetail,
  type GameSocial,
  type NewsItem,
} from "@/lib/bindings";
import { errorMessage } from "@/lib/errors";

type AppId = number;

/** One lazily loaded block of the page. Every block has a loading and an unavailable state. */
export type Load<T> =
  { status: "loading" } | { status: "ready"; data: T } | { status: "error"; message: string };

export interface GameEntry {
  detail: Load<GameDetail | null>;
  achievements: Load<AchievementList | null>;
  news: Load<NewsItem[]>;
  social: Load<GameSocial | null>;
}

const LOADING = { status: "loading" } as const;

interface GameState {
  entries: Readonly<Record<AppId, GameEntry>>;
  /** The game whose page is open (background updates refresh it). */
  openAppId: AppId | null;
  open: (appId: AppId) => void;
  close: (appId: AppId) => void;
  refreshDetail: (appId: AppId) => Promise<void>;
  refreshSocial: (appId: AppId) => Promise<void>;
  setFavorite: (appId: AppId, favorite: boolean) => Promise<void>;
  setHidden: (appId: AppId, hidden: boolean) => Promise<void>;
  /** Saves notes; throws on failure (the notes tab shows it). */
  saveNotes: (appId: AppId, notes: string) => Promise<void>;
}

async function settle<T>(work: Promise<T>): Promise<Load<T>> {
  try {
    return { status: "ready", data: await work };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}

/** Game page data from the backend, per game. Kept while the app runs (Back is instant). */
export const useGameStore = create<GameState>()((set, get) => {
  const patch = (appId: AppId, change: Partial<GameEntry>) =>
    set(({ entries }) => {
      const current = entries[appId];
      return current ? { entries: { ...entries, [appId]: { ...current, ...change } } } : {};
    });

  const patchDetail = (appId: AppId, change: Partial<GameDetail>) => {
    const detail = get().entries[appId]?.detail;
    if (detail?.status === "ready" && detail.data) {
      patch(appId, { detail: { status: "ready", data: { ...detail.data, ...change } } });
    }
  };

  return {
    entries: {},
    openAppId: null,
    open: (appId) => {
      set(({ entries }) => ({
        openAppId: appId,
        entries: entries[appId]
          ? entries
          : {
              ...entries,
              [appId]: { detail: LOADING, achievements: LOADING, news: LOADING, social: LOADING },
            },
      }));
      // Every block loads on its own: the hero never waits for the network.
      void get().refreshDetail(appId);
      void settle(commands.getGameAchievements(appId)).then((achievements) =>
        patch(appId, { achievements }),
      );
      void settle(commands.getGameNews(appId)).then((news) => patch(appId, { news }));
      void get().refreshSocial(appId);
    },
    close: (appId) => {
      if (get().openAppId === appId) set({ openAppId: null });
    },
    refreshDetail: async (appId) => {
      patch(appId, { detail: await settle(commands.getGame(appId)) });
    },
    refreshSocial: async (appId) => {
      const social = await settle(commands.getGameSocial(appId));
      // A failed refresh keeps what is shown.
      if (social.status === "error" && get().entries[appId]?.social.status === "ready") return;
      patch(appId, { social });
    },
    setFavorite: async (appId, favorite) => {
      patchDetail(appId, { favorite });
      try {
        await commands.setFavorite(appId, favorite);
      } catch {
        patchDetail(appId, { favorite: !favorite });
      }
    },
    setHidden: async (appId, hidden) => {
      patchDetail(appId, { hidden });
      try {
        await commands.setHidden(appId, hidden);
      } catch {
        patchDetail(appId, { hidden: !hidden });
      }
    },
    saveNotes: async (appId, notes) => {
      await commands.setNotes(appId, notes);
      patchDetail(appId, { notes });
    },
  };
});

/** Background changes: library rescans (tags, install state) and friends' data. */
export function listenForGameUpdates(): void {
  if (!isTauri()) return;
  void events.libraryUpdated.listen(() => {
    const { openAppId, refreshDetail } = useGameStore.getState();
    if (openAppId !== null) void refreshDetail(openAppId);
  });
  void events.socialUpdated.listen(() => {
    const { openAppId, refreshSocial } = useGameStore.getState();
    if (openAppId !== null) void refreshSocial(openAppId);
  });
}
