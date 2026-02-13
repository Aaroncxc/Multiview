// ============================================================
// Entry Point — MultiView 3D Editor
// ============================================================

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import "./styles/tokens.css";
import "./styles/reset.css";

const storedTheme = window.localStorage.getItem("multiview-editor.ui-theme");
const initialTheme = storedTheme === "dark" ? "dark" : "light";
document.documentElement.setAttribute("data-theme", initialTheme);
document.documentElement.style.colorScheme = initialTheme;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
