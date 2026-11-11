// Must stay the first import: it records when the script started.
import { scheduleRevealFallback } from "./lib/startup";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "./styles/tokens.css";
import "./styles/global.css";
import "./i18n";
import { App } from "./app/App";
import { useLibraryStore } from "./features/library/store/libraryStore";
import geistLatin from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";

// Start fetching the UI font now instead of at the first layout (it gates the window reveal).
const preload = Object.assign(document.createElement("link"), {
  rel: "preload",
  as: "font",
  type: "font/woff2",
  href: geistLatin,
  crossOrigin: "anonymous",
});
document.head.append(preload);

// Ask the backend for the library before React even renders.
void useLibraryStore.getState().load();

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

scheduleRevealFallback();
