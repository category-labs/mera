import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@category-labs/mera-demo-shared/base.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
