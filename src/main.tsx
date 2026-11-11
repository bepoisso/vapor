import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "./styles/tokens.css";
import "./styles/global.css";
import "./i18n";
import { App } from "./app/App";
import { showWindowAfterFirstPaint } from "./lib/window";

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

showWindowAfterFirstPaint();
