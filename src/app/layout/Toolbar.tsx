// ============================================================
// Toolbar - Top bar with tools, actions, and mode switches
// ============================================================

import React, { useEffect, useRef, useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import type { ToolMode } from "../../store/editorStore";
import { exportAsJSON } from "../../core/io/projectStorage";
import { showToast } from "../../ui/Toast";
import "./Toolbar.css";

const PRIMITIVES = [
  { type: "box", icon: "[]", label: "Box" },
  { type: "sphere", icon: "O", label: "Sphere" },
  { type: "cylinder", icon: "CY", label: "Cylinder" },
  { type: "cone", icon: "/\\", label: "Cone" },
  { type: "torus", icon: "TR", label: "Torus" },
  { type: "capsule", icon: "CP", label: "Capsule" },
  { type: "plane", icon: "PL", label: "Plane" },
  { type: "circle", icon: "C", label: "Circle" },
  { type: "dodecahedron", icon: "D", label: "Dodeca" },
  { type: "icosahedron", icon: "I", label: "Icosa" },
  { type: "---", icon: "", label: "---" },
  { type: "star", icon: "*", label: "Star" },
  { type: "heart", icon: "H", label: "Heart" },
  { type: "arrow", icon: ">", label: "Arrow" },
  { type: "---2", icon: "", label: "---" },
  { type: "text3d", icon: "T", label: "3D Text" },
] as const;

const TOOLS: { mode: ToolMode; label: string; shortcut: string; icon: string }[] = [
  { mode: "select", label: "Select", shortcut: "V", icon: "S" },
  { mode: "translate", label: "Move", shortcut: "W", icon: "M" },
  { mode: "rotate", label: "Rotate", shortcut: "E", icon: "R" },
  { mode: "scale", label: "Scale", shortcut: "R", icon: "X" },
];

interface ToolbarProps {
  compact?: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({ compact = false }) => {
  const toolMode = useEditorStore((s) => s.toolMode);
  const setToolMode = useEditorStore((s) => s.setToolMode);
  const showStats = useEditorStore((s) => s.showStats);
  const toggleStats = useEditorStore((s) => s.toggleStats);
  const isOutlinerOpen = useEditorStore((s) => s.isOutlinerOpen);
  const toggleOutliner = useEditorStore((s) => s.toggleOutliner);
  const isInspectorOpen = useEditorStore((s) => s.isInspectorOpen);
  const toggleInspector = useEditorStore((s) => s.toggleInspector);
  const isTimelineOpen = useEditorStore((s) => s.isTimelineOpen);
  const toggleTimeline = useEditorStore((s) => s.toggleTimeline);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const toggleSnap = useEditorStore((s) => s.toggleSnap);
  const uiTheme = useEditorStore((s) => s.uiTheme);
  const toggleUiTheme = useEditorStore((s) => s.toggleUiTheme);
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const undoLabel = useEditorStore((s) => s.undoLabel);
  const redoLabel = useEditorStore((s) => s.redoLabel);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const projectName = useEditorStore((s) => s.document.projectName);
  const setProjectName = useEditorStore((s) => s.setProjectName);
  const document = useEditorStore((s) => s.document);

  const modelFileInputRef = useRef<HTMLInputElement>(null);
  const toolbarRootRef = useRef<HTMLElement>(null);
  const [showPrimitives, setShowPrimitives] = useState(false);
  const [showCompactActions, setShowCompactActions] = useState(false);

  useEffect(() => {
    if (!showPrimitives && !showCompactActions) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (!toolbarRootRef.current?.contains(target)) {
        setShowPrimitives(false);
        setShowCompactActions(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [showCompactActions, showPrimitives]);

  const handleImportModelClick = () => {
    modelFileInputRef.current?.click();
  };

  const handleOpenProjectLoader = () => {
    window.dispatchEvent(new CustomEvent("editor:open-project-loader"));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      window.dispatchEvent(new CustomEvent("editor:import-file", { detail: { file } }));
    }
    e.target.value = "";
  };

  const handleAddPrimitive = (type: string) => {
    const shapeTypes = ["star", "heart", "arrow"];
    if (shapeTypes.includes(type)) {
      window.dispatchEvent(new CustomEvent("editor:add-shape", { detail: { shapeType: type } }));
    } else {
      window.dispatchEvent(new CustomEvent("editor:add-primitive", { detail: { type } }));
    }
    setShowPrimitives(false);
  };

  const handleSave = () => {
    window.dispatchEvent(new CustomEvent("editor:save-project"));
  };

  const handleExport = () => {
    exportAsJSON(document);
    showToast("Exported as JSON", "success");
  };

  const handleUndo = () => {
    const label = undo();
    if (label) showToast(`Undo ${label}`, "info");
  };

  const handleRedo = () => {
    const label = redo();
    if (label) showToast(`Redo ${label}`, "info");
  };

  return (
    <header
      ref={toolbarRootRef}
      className={`toolbar${compact ? " toolbar-compact" : ""}`}
      role="toolbar"
      aria-label="Editor toolbar"
    >
      <div className="toolbar-section toolbar-left">
        <input
          className="toolbar-project-input"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          spellCheck={false}
          title="Project name"
        />

        <div className="toolbar-divider" />

        <button
          className="toolbar-btn toolbar-btn-compact"
          onClick={handleUndo}
          disabled={!canUndo}
          title={undoLabel ? `Undo ${undoLabel} (Ctrl+Z)` : "Nothing to undo"}
        >
          <span className="toolbar-btn-label">Undo</span>
        </button>
        <button
          className="toolbar-btn toolbar-btn-compact"
          onClick={handleRedo}
          disabled={!canRedo}
          title={redoLabel ? `Redo ${redoLabel} (Ctrl+Shift+Z)` : "Nothing to redo"}
        >
          <span className="toolbar-btn-label">Redo</span>
        </button>
      </div>

      <div className="toolbar-section toolbar-center">
        {TOOLS.map((tool) => (
          <button
            key={tool.mode}
            className={`toolbar-btn ${toolMode === tool.mode ? "active" : ""}`}
            onClick={() => setToolMode(tool.mode)}
            title={`${tool.label} (${tool.shortcut})`}
            aria-pressed={toolMode === tool.mode}
          >
            <span className="toolbar-btn-icon">{tool.icon}</span>
            <span className="toolbar-btn-label">{tool.label}</span>
          </button>
        ))}

        <div className="toolbar-divider" />

        <button
          className={`toolbar-btn ${snapEnabled ? "active" : ""}`}
          onClick={toggleSnap}
          title={`Snapping ${snapEnabled ? "On" : "Off"}`}
        >
          <span className="toolbar-btn-icon">#</span>
          <span className="toolbar-btn-label">Snap</span>
        </button>

        <div className="toolbar-divider" />

        <div className="toolbar-dropdown-wrapper">
          <button
            className={`toolbar-btn ${showPrimitives ? "active" : ""}`}
            onClick={() => setShowPrimitives(!showPrimitives)}
            title="Add primitive object"
          >
            <span className="toolbar-btn-icon">+</span>
            <span className="toolbar-btn-label">Add</span>
          </button>

          {showPrimitives && (
            <>
              <div className="toolbar-dropdown">
                {PRIMITIVES.map((primitive) => {
                  if (primitive.type.startsWith("---")) {
                    return <div key={primitive.type} className="toolbar-dropdown-divider" />;
                  }
                  if (primitive.type === "text3d") {
                    return (
                      <button
                        key={primitive.type}
                        className="toolbar-dropdown-item"
                        onClick={() => {
                          const text = window.prompt("Enter 3D text:", "Hello");
                          if (text) {
                            window.dispatchEvent(
                              new CustomEvent("editor:add-text3d", { detail: { text } })
                            );
                          }
                          setShowPrimitives(false);
                        }}
                      >
                        <span className="toolbar-dropdown-icon">{primitive.icon}</span>
                        <span>{primitive.label}</span>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={primitive.type}
                      className="toolbar-dropdown-item"
                      onClick={() => handleAddPrimitive(primitive.type)}
                    >
                      <span className="toolbar-dropdown-icon">{primitive.icon}</span>
                      <span>{primitive.label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {compact && (
          <>
            <div className="toolbar-divider" />

            <button
              className={`toolbar-btn ${isTimelineOpen ? "active" : ""}`}
              onClick={toggleTimeline}
              title="Toggle Timeline"
            >
              <span className="toolbar-btn-label">Timeline</span>
            </button>

            <button
              className={`toolbar-btn toolbar-btn-theme ${uiTheme === "dark" ? "active" : ""}`}
              onClick={toggleUiTheme}
              aria-label={`Switch to ${uiTheme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${uiTheme === "dark" ? "light" : "dark"} mode`}
            >
              <span className="toolbar-btn-icon">{uiTheme === "dark" ? "D" : "L"}</span>
            </button>

            <div className="toolbar-dropdown-wrapper">
              <button
                className={`toolbar-btn ${showCompactActions ? "active" : ""}`}
                onClick={() => setShowCompactActions(!showCompactActions)}
                title="Project actions"
              >
                <span className="toolbar-btn-label">File</span>
              </button>

              {showCompactActions && (
                <>
                  <div className="toolbar-dropdown toolbar-dropdown-compact-actions">
                    <button
                      className="toolbar-dropdown-item"
                      onClick={() => {
                        setShowCompactActions(false);
                        handleOpenProjectLoader();
                      }}
                    >
                      <span className="toolbar-dropdown-icon">LD</span>
                      <span>Load Project</span>
                    </button>
                    <button
                      className="toolbar-dropdown-item"
                      onClick={() => {
                        setShowCompactActions(false);
                        handleImportModelClick();
                      }}
                    >
                      <span className="toolbar-dropdown-icon">IM</span>
                      <span>Import Model</span>
                    </button>
                    <button
                      className="toolbar-dropdown-item"
                      onClick={() => {
                        setShowCompactActions(false);
                        handleSave();
                      }}
                    >
                      <span className="toolbar-dropdown-icon">SV</span>
                      <span>Save</span>
                    </button>
                    <button
                      className="toolbar-dropdown-item"
                      onClick={() => {
                        setShowCompactActions(false);
                        handleExport();
                      }}
                    >
                      <span className="toolbar-dropdown-icon">JS</span>
                      <span>JSON</span>
                    </button>
                    <button
                      className="toolbar-dropdown-item"
                      onClick={() => {
                        setShowCompactActions(false);
                        window.dispatchEvent(new CustomEvent("editor:preview-viewer"));
                      }}
                    >
                      <span className="toolbar-dropdown-icon">PV</span>
                      <span>Preview</span>
                    </button>
                    <button
                      className="toolbar-dropdown-item"
                      onClick={() => {
                        setShowCompactActions(false);
                        window.dispatchEvent(new CustomEvent("editor:export-viewer"));
                      }}
                    >
                      <span className="toolbar-dropdown-icon">VW</span>
                      <span>Viewer</span>
                    </button>
                    <button
                      className="toolbar-dropdown-item"
                      onClick={() => {
                        setShowCompactActions(false);
                        window.dispatchEvent(new CustomEvent("editor:export-glb"));
                      }}
                    >
                      <span className="toolbar-dropdown-icon">GL</span>
                      <span>GLB</span>
                    </button>
                    <button
                      className="toolbar-dropdown-item"
                      onClick={() => {
                        setShowCompactActions(false);
                        window.dispatchEvent(new CustomEvent("editor:export-screenshot"));
                      }}
                    >
                      <span className="toolbar-dropdown-icon">SC</span>
                      <span>Screenshot</span>
                    </button>
                    <button
                      className={`toolbar-dropdown-item${showStats ? " active" : ""}`}
                      onClick={() => {
                        setShowCompactActions(false);
                        toggleStats();
                      }}
                    >
                      <span className="toolbar-dropdown-icon">ST</span>
                      <span>Stats</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div className="toolbar-section toolbar-right">
        <button
          className="toolbar-btn"
          onClick={handleOpenProjectLoader}
          title="Load project"
        >
          <span className="toolbar-btn-label">Load</span>
        </button>

        <button
          className="toolbar-btn toolbar-btn-accent"
          onClick={handleImportModelClick}
          title="Import 3D model (glTF, FBX, OBJ)"
        >
          <span className="toolbar-btn-label">Import</span>
        </button>

        <input
          ref={modelFileInputRef}
          type="file"
          accept=".gltf,.glb,.fbx,.obj"
          className="toolbar-file-input"
          onChange={handleFileChange}
        />

        <button className="toolbar-btn" onClick={handleSave} title="Save project (Ctrl+S)">
          <span className="toolbar-btn-label">Save</span>
        </button>

        <button className="toolbar-btn" onClick={handleExport} title="Export as JSON">
          <span className="toolbar-btn-label">JSON</span>
        </button>

        <button
          className="toolbar-btn"
          onClick={() => window.dispatchEvent(new CustomEvent("editor:preview-viewer"))}
          title="Preview exported viewer inside the app"
        >
          <span className="toolbar-btn-label">Preview</span>
        </button>

        <button
          className="toolbar-btn toolbar-btn-accent"
          onClick={() => window.dispatchEvent(new CustomEvent("editor:export-viewer"))}
          title="Export as standalone viewer HTML"
        >
          <span className="toolbar-btn-label">Viewer</span>
        </button>

        <button
          className="toolbar-btn"
          onClick={() => window.dispatchEvent(new CustomEvent("editor:export-glb"))}
          title="Export scene as GLB file"
        >
          <span className="toolbar-btn-label">GLB</span>
        </button>

        <button
          className="toolbar-btn"
          onClick={() => window.dispatchEvent(new CustomEvent("editor:export-screenshot"))}
          title="Capture screenshot (PNG)"
        >
          <span className="toolbar-btn-label">Shot</span>
        </button>

        <div className="toolbar-divider" />

        {!compact && (
          <button
            className={`toolbar-btn toolbar-btn-theme ${uiTheme === "dark" ? "active" : ""}`}
            onClick={toggleUiTheme}
            aria-label={`Switch to ${uiTheme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${uiTheme === "dark" ? "light" : "dark"} mode`}
          >
            <span className="toolbar-btn-icon">{uiTheme === "dark" ? "D" : "L"}</span>
          </button>
        )}

        <button
          className={`toolbar-btn ${isOutlinerOpen ? "active" : ""}`}
          onClick={toggleOutliner}
          title="Toggle Outliner"
        >
          <span className="toolbar-btn-label">Tree</span>
        </button>

        <button
          className={`toolbar-btn ${isInspectorOpen ? "active" : ""}`}
          onClick={toggleInspector}
          title="Toggle Inspector"
        >
          <span className="toolbar-btn-label">Panel</span>
        </button>

        <button
          className={`toolbar-btn ${isTimelineOpen ? "active" : ""}`}
          onClick={toggleTimeline}
          title="Toggle Timeline"
        >
          <span className="toolbar-btn-label">Timeline</span>
        </button>

        <button
          className={`toolbar-btn ${showStats ? "active" : ""}`}
          onClick={toggleStats}
          title="Toggle Performance Stats"
        >
          <span className="toolbar-btn-label">Stats</span>
        </button>
      </div>
    </header>
  );
};
