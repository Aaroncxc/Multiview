// ============================================================
// App — Root component
// Phase 1: + Toast container for feedback
// ============================================================

import React from "react";
import { EditorShell } from "./layout/EditorShell";
import { ToastContainer } from "../ui/Toast";

export const App: React.FC = () => {
  return (
    <>
      <EditorShell />
      <ToastContainer />
    </>
  );
};
