// ============================================================
// Editor Shell - Main layout orchestrator
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import { Toolbar } from "./Toolbar";
import { Outliner } from "./Outliner";
import { Inspector } from "./Inspector";
import { Viewport } from "./Viewport";
import { TimelinePanel } from "./TimelinePanel";
import leftIconUrl from "../../../Assets/SVG/Left.svg";
import rightIconUrl from "../../../Assets/SVG/Right.svg";
import "./EditorShell.css";

const OUTLINER_WIDTH_KEY = "multiview-editor.panel-width.outliner";
const INSPECTOR_WIDTH_KEY = "multiview-editor.panel-width.inspector";

const OUTLINER_MIN_WIDTH = 220;
const OUTLINER_MAX_WIDTH = 520;
const OUTLINER_DEFAULT_WIDTH = 300;

const INSPECTOR_MIN_WIDTH = 280;
const INSPECTOR_MAX_WIDTH = 640;
const INSPECTOR_DEFAULT_WIDTH = 360;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readPanelWidth(storageKey: string, fallback: number, min: number, max: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(storageKey);
  const parsed = Number.parseFloat(raw ?? "");
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, min, max);
}

function writePanelWidth(storageKey: string, width: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, String(Math.round(width)));
}

function iconMaskStyle(iconUrl: string): React.CSSProperties {
  return {
    ["--icon-url" as string]: `url("${iconUrl}")`,
  };
}

export const EditorShell: React.FC = () => {
  const isOutlinerOpen = useEditorStore((s) => s.isOutlinerOpen);
  const isInspectorOpen = useEditorStore((s) => s.isInspectorOpen);
  const isTimelineOpen = useEditorStore((s) => s.isTimelineOpen);
  const toggleOutliner = useEditorStore((s) => s.toggleOutliner);
  const toggleInspector = useEditorStore((s) => s.toggleInspector);
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 1100;
  });
  const [outlinerWidth, setOutlinerWidth] = useState<number>(() =>
    readPanelWidth(
      OUTLINER_WIDTH_KEY,
      OUTLINER_DEFAULT_WIDTH,
      OUTLINER_MIN_WIDTH,
      OUTLINER_MAX_WIDTH
    )
  );
  const [inspectorWidth, setInspectorWidth] = useState<number>(() =>
    readPanelWidth(
      INSPECTOR_WIDTH_KEY,
      INSPECTOR_DEFAULT_WIDTH,
      INSPECTOR_MIN_WIDTH,
      INSPECTOR_MAX_WIDTH
    )
  );
  const outlinerWidthRef = useRef(outlinerWidth);
  const inspectorWidthRef = useRef(inspectorWidth);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    outlinerWidthRef.current = outlinerWidth;
  }, [outlinerWidth]);

  useEffect(() => {
    inspectorWidthRef.current = inspectorWidth;
  }, [inspectorWidth]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(min-width: 1100px)");
    const syncDesktop = () => setIsDesktop(mediaQuery.matches);
    syncDesktop();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncDesktop);
      return () => mediaQuery.removeEventListener("change", syncDesktop);
    }

    mediaQuery.addListener(syncDesktop);
    return () => mediaQuery.removeListener(syncDesktop);
  }, []);

  const stopResize = useCallback(() => {
    if (resizeCleanupRef.current) {
      resizeCleanupRef.current();
      resizeCleanupRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopResize();
    };
  }, [stopResize]);

  const startResize = useCallback(
    (panel: "outliner" | "inspector", event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDesktop || event.button !== 0) return;
      event.preventDefault();
      stopResize();

      const startX = event.clientX;
      const min = panel === "outliner" ? OUTLINER_MIN_WIDTH : INSPECTOR_MIN_WIDTH;
      const max = panel === "outliner" ? OUTLINER_MAX_WIDTH : INSPECTOR_MAX_WIDTH;
      const startWidth =
        panel === "outliner" ? outlinerWidthRef.current : inspectorWidthRef.current;
      let latestWidth = startWidth;

      const onMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const rawWidth =
          panel === "outliner" ? startWidth + deltaX : startWidth - deltaX;
        latestWidth = clamp(rawWidth, min, max);

        if (panel === "outliner") {
          setOutlinerWidth(latestWidth);
        } else {
          setInspectorWidth(latestWidth);
        }
      };

      const onEnd = () => {
        if (panel === "outliner") {
          outlinerWidthRef.current = latestWidth;
          writePanelWidth(OUTLINER_WIDTH_KEY, latestWidth);
        } else {
          inspectorWidthRef.current = latestWidth;
          writePanelWidth(INSPECTOR_WIDTH_KEY, latestWidth);
        }
        stopResize();
      };

      resizeCleanupRef.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
        document.body.classList.remove("editor-panels-resizing");
      };

      document.body.classList.add("editor-panels-resizing");
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
    },
    [isDesktop, stopResize]
  );

  return (
    <div className="editor-shell">
      <div className="editor-body">
        <main className="editor-viewport">
          <Viewport />

          <div className="editor-overlay editor-overlay-toolbar">
            <Toolbar compact />
          </div>

          {isOutlinerOpen ? (
            <aside
              className="editor-overlay-panel editor-overlay-outliner"
              style={isDesktop ? { width: `${outlinerWidth}px` } : undefined}
            >
              <button
                className="editor-panel-toggle editor-panel-toggle-left"
                onClick={toggleOutliner}
                title="Collapse Scene panel"
                aria-label="Collapse Scene panel"
              >
                <span
                  className="editor-panel-toggle-icon"
                  style={iconMaskStyle(leftIconUrl)}
                  aria-hidden
                />
              </button>
              {isDesktop && (
                <div
                  className="editor-panel-resizer editor-panel-resizer-right"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Scene panel"
                  onPointerDown={(event) => startResize("outliner", event)}
                />
              )}
              <Outliner />
            </aside>
          ) : (
            <button
              className="editor-side-toggle editor-side-toggle-left"
              onClick={toggleOutliner}
              title="Open Scene panel"
              aria-label="Open Scene panel"
            >
              <span
                className="editor-panel-toggle-icon"
                style={iconMaskStyle(rightIconUrl)}
                aria-hidden
              />
            </button>
          )}

          {isInspectorOpen ? (
            <aside
              className="editor-overlay-panel editor-overlay-inspector"
              style={isDesktop ? { width: `${inspectorWidth}px` } : undefined}
            >
              <button
                className="editor-panel-toggle editor-panel-toggle-right"
                onClick={toggleInspector}
                title="Collapse Scene settings"
                aria-label="Collapse Scene settings"
              >
                <span
                  className="editor-panel-toggle-icon"
                  style={iconMaskStyle(rightIconUrl)}
                  aria-hidden
                />
              </button>
              {isDesktop && (
                <div
                  className="editor-panel-resizer editor-panel-resizer-left"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Scene settings panel"
                  onPointerDown={(event) => startResize("inspector", event)}
                />
              )}
              <Inspector />
            </aside>
          ) : (
            <button
              className="editor-side-toggle editor-side-toggle-right"
              onClick={toggleInspector}
              title="Open Scene settings"
              aria-label="Open Scene settings"
            >
              <span
                className="editor-panel-toggle-icon"
                style={iconMaskStyle(leftIconUrl)}
                aria-hidden
              />
            </button>
          )}
        </main>

        {isTimelineOpen && (
          <div className="editor-timeline">
            <TimelinePanel />
          </div>
        )}
      </div>
    </div>
  );
};
