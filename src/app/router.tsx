import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { LibraryPage } from "@/features/library/LibraryPage";
import { PlaceholderPage } from "@/features/placeholder/PlaceholderPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { AppShell } from "./AppShell";

const rootRoute = createRootRoute({ component: AppShell });

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LibraryPage,
});

const storeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/store",
  component: () => <PlaceholderPage titleKey="placeholder.store" />,
});

const communityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/community",
  component: () => <PlaceholderPage titleKey="placeholder.community" />,
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile",
  component: () => <PlaceholderPage titleKey="placeholder.profile" />,
});

/** Game page: not designed yet (next design iteration). Placeholder route only. */
const gameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/game/$appId",
  component: () => <PlaceholderPage titleKey="placeholder.game" />,
});

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: () => <PlaceholderPage titleKey="placeholder.history" />,
});

/** "See all" for a smart shelf. Placeholder until the shelf page is designed. */
const shelfRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shelf/$shelfId",
  component: () => <PlaceholderPage titleKey="placeholder.shelf" />,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  settingsRoute,
  libraryRoute,
  storeRoute,
  communityRoute,
  profileRoute,
  gameRoute,
  historyRoute,
  shelfRoute,
]);

/** Hash history: a desktop webview has no server to rewrite deep links to index.html. */
export function createAppRouter(history: RouterHistory = createHashHistory()) {
  return createRouter({ routeTree, history });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
