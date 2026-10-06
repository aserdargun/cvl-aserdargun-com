import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./testSurface";

const container = document.getElementById("root");
if (!container) throw new Error("CVL needs a #root element to mount.");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);