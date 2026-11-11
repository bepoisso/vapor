import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@/i18n";

// jsdom gaps used by the router, the search field and the layout hooks.
const stub = (target: object, name: string, value: unknown) =>
  Object.defineProperty(target, name, { value, writable: true, configurable: true });

stub(window, "scrollTo", () => undefined);
stub(Element.prototype, "scrollIntoView", () => undefined);
stub(window, "matchMedia", (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
}));
stub(
  globalThis,
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

afterEach(() => {
  cleanup();
});
