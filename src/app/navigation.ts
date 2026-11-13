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

export function href(to: Path): string {
  return `#${encodeURI(to)}`;
}
