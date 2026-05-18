import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n/config";
import "./styles/globals.css";
import App from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("No #root element found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
