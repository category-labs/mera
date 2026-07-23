import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { reportHeightWhenEmbedded } from "./embed";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

// Flip to the compact embedded layout before render to avoid a layout flash.
reportHeightWhenEmbedded();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
