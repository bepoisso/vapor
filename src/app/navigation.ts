import { useSyncExternalStore } from "react";

/**
 * Minimal hash router. A desktop webview has no server to rewrite deep links and the app has a
 * handful of flat routes, so links are plain `<a href="#/…">` (cheap to render by the hundred in
 * grids) and the current path comes from `location.hash`. Replaces TanStack Router, which cost
 * ~80 KB of startup JavaScript plus a heavy component per link.
 */

export type Path =
  | "/"
  | "/store"
  | "/community"
  | "/profile"
  | "/settings"
  | "/history"
  | "/shelves"
  | "/shelves/new"
  | `/shelves/${string}/edit`
  | `/game/${number}`
  | `/shelf/${string}`;

function currentPath(): string {
  const hash = window.location.hash.replace(/^#/, "");
  return hash.startsWith("/") ? decodeURI(hash) : "/";
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** The current route path, e.g. "/settings". */
export function usePath(): string {
  return useSyncExternalStore(subscribe, currentPath, () => "/");
}

export function navigate(to: Path): void {
  window.location.hash = to;
}

/** The route shown before the current one (for "Back to the library"). */
let previousPath: string | null = null;
let lastPath = currentPath();
window.addEventListener("hashchange", () => {
  previousPath = lastPath;
  lastPath = currentPath();
});

/** The route shown before the current one, if any. */
export function previousRoute(): string | null {
  return previousPath;
}

/** True when the previous history entry is the library, so Back can return to it. */
export function cameFromLibrary(): boolean {
  return previousPath === "/";
}

/** Back to the library: a real history step when we came from it, else a new entry. */
export function goBackToLibrary(): void {
  if (cameFromLibrary()) window.history.back();
  else navigate("/");
}

export function href(to: Path): string {
  return `#${encodeURI(to)}`;
}
