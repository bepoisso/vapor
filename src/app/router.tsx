import type { ReactNode } from "react";
import { LibraryPage } from "@/features/library/LibraryPage";
import { PlaceholderPage } from "@/features/placeholder/PlaceholderPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { usePath } from "./navigation";

interface Route {
  pattern: RegExp;
  render: () => ReactNode;
}

const ROUTES: readonly Route[] = [
  { pattern: /^\/$/, render: () => <LibraryPage /> },
  { pattern: /^\/settings$/, render: () => <SettingsPage /> },
  { pattern: /^\/store$/, render: () => <PlaceholderPage titleKey="placeholder.store" /> },
  { pattern: /^\/community$/, render: () => <PlaceholderPage titleKey="placeholder.community" /> },
  { pattern: /^\/profile$/, render: () => <PlaceholderPage titleKey="placeholder.profile" /> },
  { pattern: /^\/history$/, render: () => <PlaceholderPage titleKey="placeholder.history" /> },
  // Game page: not designed yet (next design iteration). Placeholder route only.
  { pattern: /^\/game\/\d+$/, render: () => <PlaceholderPage titleKey="placeholder.game" /> },
  // "See all" for a smart shelf. Placeholder until the shelf page is designed.
  { pattern: /^\/shelf\/[^/]+$/, render: () => <PlaceholderPage titleKey="placeholder.shelf" /> },
];

/** The page for the current hash path; unknown paths show the Library. */
export function Router() {
  const path = usePath();
  const route = ROUTES.find((candidate) => candidate.pattern.test(path));
  return route ? route.render() : <LibraryPage />;
}
