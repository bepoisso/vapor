import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { LibraryPage } from "@/features/library/LibraryPage";
import { PlaceholderPage } from "@/features/placeholder/PlaceholderPage";
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

const routeTree = rootRoute.addChildren([
  libraryRoute,
  storeRoute,
  communityRoute,
  profileRoute,
  gameRoute,
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
