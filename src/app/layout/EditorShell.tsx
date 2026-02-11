// ============================================================
// Editor Shell — Main layout orchestrator
// Apple HIG: Split-view with persistent sidebar + viewport + inspector
// ============================================================

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import { Toolbar } from "./Toolbar";
import { Outliner } from "./Outliner";
import { Inspector } from "./Inspector";
import { Viewport } from "./Viewport";
import { TimelinePanel } from "./TimelinePanel";
import "./EditorShell.css";

export const EditorShell: React.FC = () => {
  const isOutlinerOpen = useEditorStore((s) => s.isOutlinerOpen);
  const isInspectorOpen = useEditorStore((s) => s.isInspectorOpen);
  const isTimelineOpen = useEditorStore((s) => s.isTimelineOpen);

  return (
    <div className="editor-shell">
      <Toolbar />
      <div className="editor-body">
        {isOutlinerOpen && (
          <aside className="editor-outliner">
            <Outliner />
          </aside>
        )}
        <div className="editor-center">
          <main className="editor-viewport">
            <Viewport />
          </main>
          {isTimelineOpen && (
            <div className="editor-timeline">
              <TimelinePanel />
            </div>
          )}
        </div>
        {isInspectorOpen && (
          <aside className="editor-inspector">
            <Inspector />
          </aside>
        )}
      </div>
    </div>
  );
};
