import { lazy, type ReactNode, Suspense } from "react";
import { LibraryPage } from "@/features/library/LibraryPage";
import { PlaceholderPage } from "@/features/placeholder/PlaceholderPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { usePath } from "./navigation";

/**
 * Pages loaded on first use: the library's startup bundle stays small (CI budget,
 * `pnpm check:bundle`). The chunks are local files: opening them is instant.
 */
const GamePage = lazy(() =>
  import("@/features/game/GamePage").then((module) => ({ default: module.GamePage })),
);
const ShelfPage = lazy(() =>
  import("@/features/shelves/ShelfPage").then((module) => ({ default: module.ShelfPage })),
);
const ShelfBuilderPage = lazy(() =>
  import("@/features/shelves/ShelfBuilderPage").then((module) => ({
    default: module.ShelfBuilderPage,
  })),
);
const ManageShelvesPage = lazy(() =>
  import("@/features/shelves/ManageShelvesPage").then((module) => ({
    default: module.ManageShelvesPage,
  })),
);

interface Route {
  pattern: RegExp;
  render: (match: RegExpExecArray) => ReactNode;
}

/** Path segments arrive URI-decoded (see `navigation.ts`). */
const ROUTES: readonly Route[] = [
  { pattern: /^\/$/, render: () => <LibraryPage /> },
  { pattern: /^\/settings$/, render: () => <SettingsPage /> },
  { pattern: /^\/store$/, render: () => <PlaceholderPage titleKey="placeholder.store" /> },
  { pattern: /^\/community$/, render: () => <PlaceholderPage titleKey="placeholder.community" /> },
  { pattern: /^\/profile$/, render: () => <PlaceholderPage titleKey="placeholder.profile" /> },
  { pattern: /^\/history$/, render: () => <PlaceholderPage titleKey="placeholder.history" /> },
  // Pages are keyed by what they show: switching game or shelf starts a fresh page state.
  {
    pattern: /^\/game\/(\d+)$/,
    render: ([, appId]) => <GamePage key={appId} appId={Number(appId)} />,
  },
  { pattern: /^\/shelf\/([^/]+)$/, render: ([, id]) => <ShelfPage key={id} id={id ?? ""} /> },
  { pattern: /^\/shelves$/, render: () => <ManageShelvesPage /> },
  { pattern: /^\/shelves\/new$/, render: () => <ShelfBuilderPage key="new" /> },
  {
    pattern: /^\/shelves\/([^/]+)\/edit$/,
    render: ([, id]) => <ShelfBuilderPage key={id} id={id} />,
  },
];

/** The page for the current hash path; unknown paths show the Library. */
export function Router() {
  const path = usePath();
  for (const route of ROUTES) {
    const match = route.pattern.exec(path);
    if (match) return <Suspense fallback={null}>{route.render(match)}</Suspense>;
  }
  return <LibraryPage />;
}
