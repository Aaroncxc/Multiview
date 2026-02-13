// ============================================================
// App — Root component
// Phase 1: + Toast container for feedback
// ============================================================

import React from "react";
import { EditorShell } from "./layout/EditorShell";
import { ToastContainer } from "../ui/Toast";
import { useEditorStore } from "../store/editorStore";

export const App: React.FC = () => {
  const uiTheme = useEditorStore((s) => s.uiTheme);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", uiTheme);
    document.documentElement.style.colorScheme = uiTheme;
  }, [uiTheme]);

  return (
    <>
      <EditorShell />
      <ToastContainer />
    </>
  );
};
