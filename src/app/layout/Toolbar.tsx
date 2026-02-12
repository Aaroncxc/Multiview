// ============================================================
// Toolbar — Top bar with tools, actions, and mode switches
// Phase 1: + Undo/Redo, Primitives dropdown, Save/Export, Snap
// Apple HIG: Clear icons, action verbs, consistent spacing
// ============================================================

import React, { useRef, useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import type { ToolMode } from "../../store/editorStore";
import { exportAsJSON } from "../../core/io/projectStorage";
import { showToast } from "../../ui/Toast";
import { saveProject } from "../../core/io/projectStorage";
import "./Toolbar.css";

// ── Primitives config ──

const PRIMITIVES = [
  { type: "box", icon: "▣", label: "Box" },
  { type: "sphere", icon: "●", label: "Sphere" },
  { type: "cylinder", icon: "⬡", label: "Cylinder" },
  { type: "cone", icon: "△", label: "Cone" },
  { type: "torus", icon: "◎", label: "Torus" },
  { type: "capsule", icon: "⬬", label: "Capsule" },
  { type: "plane", icon: "▭", label: "Plane" },
  { type: "circle", icon: "○", label: "Circle" },
  { type: "dodecahedron", icon: "⬠", label: "Dodeca" },
  { type: "icosahedron", icon: "⬡", label: "Icosa" },
  { type: "---", icon: "", label: "---" },
  { type: "star", icon: "★", label: "Star" },
  { type: "heart", icon: "♥", label: "Heart" },
  { type: "arrow", icon: "↑", label: "Arrow" },
  { type: "---2", icon: "", label: "---" },
  { type: "text3d", icon: "T", label: "3D Text" },
] as const;

export const Toolbar: React.FC = () => {
  const toolMode = useEditorStore((s) => s.toolMode);
  const setToolMode = useEditorStore((s) => s.setToolMode);
  const showStats = useEditorStore((s) => s.showStats);
  const toggleStats = useEditorStore((s) => s.toggleStats);
  const toggleOutliner = useEditorStore((s) => s.toggleOutliner);
  const toggleInspector = useEditorStore((s) => s.toggleInspector);
  const isTimelineOpen = useEditorStore((s) => s.isTimelineOpen);
  const toggleTimeline = useEditorStore((s) => s.toggleTimeline);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const toggleSnap = useEditorStore((s) => s.toggleSnap);
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const undoLabel = useEditorStore((s) => s.undoLabel);
  const redoLabel = useEditorStore((s) => s.redoLabel);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const projectName = useEditorStore((s) => s.document.projectName);
  const setProjectName = useEditorStore((s) => s.setProjectName);
  const document = useEditorStore((s) => s.document);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPrimitives, setShowPrimitives] = useState(false);

  const tools: { mode: ToolMode; label: string; shortcut: string; icon: string }[] = [
    { mode: "select", label: "Select", shortcut: "V", icon: "↖" },
    { mode: "translate", label: "Move", shortcut: "W", icon: "✥" },
    { mode: "rotate", label: "Rotate", shortcut: "E", icon: "⟳" },
    { mode: "scale", label: "Scale", shortcut: "R", icon: "⤢" },
  ];

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      window.dispatchEvent(
        new CustomEvent("editor:import-file", { detail: { file } })
      );
    }
    e.target.value = "";
  };

  const handleAddPrimitive = (type: string) => {
    const shapetypes = ["star", "heart", "arrow"];
    if (shapetypes.includes(type)) {
      window.dispatchEvent(
        new CustomEvent("editor:add-shape", { detail: { shapeType: type } })
      );
    } else {
      window.dispatchEvent(
        new CustomEvent("editor:add-primitive", { detail: { type } })
      );
    }
    setShowPrimitives(false);
  };

  const handleSave = async () => {
    try {
      await saveProject(document);
      showToast("Project saved", "success");
    } catch (err) {
      showToast("Failed to save project", "error");
    }
  };

  const handleExport = () => {
    exportAsJSON(document);
    showToast("Exported as JSON", "success");
  };

  const handleExportViewer = () => {
    // Dispatch to viewport to get the backend reference, then export
    window.dispatchEvent(new CustomEvent("editor:export-viewer"));
  };

  const handlePreviewViewer = () => {
    window.dispatchEvent(new CustomEvent("editor:preview-viewer"));
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
    <header className="toolbar" role="toolbar" aria-label="Editor toolbar">
      {/* Left: Project name + Undo/Redo */}
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
          className="toolbar-btn"
          onClick={handleUndo}
          disabled={!canUndo}
          title={undoLabel ? `Undo ${undoLabel} (Ctrl+Z)` : "Nothing to undo"}
        >
          <span className="toolbar-btn-icon">↩</span>
        </button>
        <button
          className="toolbar-btn"
          onClick={handleRedo}
          disabled={!canRedo}
          title={redoLabel ? `Redo ${redoLabel} (Ctrl+Shift+Z)` : "Nothing to redo"}
        >
          <span className="toolbar-btn-icon">↪</span>
        </button>
      </div>

      {/* Center: Tool modes + Primitives */}
      <div className="toolbar-section toolbar-center">
        {tools.map((t) => (
          <button
            key={t.mode}
            className={`toolbar-btn ${toolMode === t.mode ? "active" : ""}`}
            onClick={() => setToolMode(t.mode)}
            title={`${t.label} (${t.shortcut})`}
            aria-pressed={toolMode === t.mode}
          >
            <span className="toolbar-btn-icon">{t.icon}</span>
            <span className="toolbar-btn-label">{t.label}</span>
          </button>
        ))}

        <div className="toolbar-divider" />

        {/* Snap toggle */}
        <button
          className={`toolbar-btn ${snapEnabled ? "active" : ""}`}
          onClick={toggleSnap}
          title={`Snapping ${snapEnabled ? "On" : "Off"}`}
        >
          <span className="toolbar-btn-icon">⊞</span>
          <span className="toolbar-btn-label">Snap</span>
        </button>

        <div className="toolbar-divider" />

        {/* Primitives dropdown */}
        <div className="toolbar-dropdown-wrapper">
          <button
            className={`toolbar-btn ${showPrimitives ? "active" : ""}`}
            onClick={() => setShowPrimitives(!showPrimitives)}
            title="Add primitive object"
          >
            <span className="toolbar-btn-icon">✚</span>
            <span className="toolbar-btn-label">Add</span>
          </button>

          {showPrimitives && (
            <>
              <div
                className="toolbar-dropdown-backdrop"
                onClick={() => setShowPrimitives(false)}
              />
              <div className="toolbar-dropdown">
                {PRIMITIVES.map((p) => {
                  if (p.type.startsWith("---")) {
                    return <div key={p.type} className="toolbar-dropdown-divider" />;
                  }
                  if (p.type === "text3d") {
                    return (
                      <button
                        key={p.type}
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
                        <span className="toolbar-dropdown-icon">{p.icon}</span>
                        <span>{p.label}</span>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={p.type}
                      className="toolbar-dropdown-item"
                      onClick={() => handleAddPrimitive(p.type)}
                    >
                      <span className="toolbar-dropdown-icon">{p.icon}</span>
                      <span>{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right: Import / Save / Export / Panels */}
      <div className="toolbar-section toolbar-right">
        <button
          className="toolbar-btn toolbar-btn-accent"
          onClick={handleImportClick}
          title="Import 3D model (glTF, FBX, OBJ)"
        >
          <span className="toolbar-btn-icon">📥</span>
          <span className="toolbar-btn-label">Import</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".gltf,.glb,.fbx,.obj,.multiview.json"
          className="toolbar-file-input"
          onChange={handleFileChange}
        />

        <button
          className="toolbar-btn"
          onClick={handleSave}
          title="Save project (Ctrl+S)"
        >
          <span className="toolbar-btn-icon">💾</span>
        </button>

        <button
          className="toolbar-btn"
          onClick={handleExport}
          title="Export as JSON"
        >
          <span className="toolbar-btn-icon">📤</span>
        </button>

        <button
          className="toolbar-btn"
          onClick={handlePreviewViewer}
          title="Preview exported viewer inside the app"
        >
          <span className="toolbar-btn-label">Preview</span>
        </button>

        <button
          className="toolbar-btn toolbar-btn-accent"
          onClick={handleExportViewer}
          title="Export as standalone viewer HTML"
        >
          <span className="toolbar-btn-icon">🌐</span>
          <span className="toolbar-btn-label">Viewer</span>
        </button>

        <button
          className="toolbar-btn"
          onClick={() => window.dispatchEvent(new CustomEvent("editor:export-glb"))}
          title="Export scene as GLB file"
        >
          <span className="toolbar-btn-icon">📦</span>
          <span className="toolbar-btn-label">GLB</span>
        </button>

        <button
          className="toolbar-btn"
          onClick={() => window.dispatchEvent(new CustomEvent("editor:export-screenshot"))}
          title="Capture screenshot (PNG)"
        >
          <span className="toolbar-btn-icon">📷</span>
          <span className="toolbar-btn-label">Screenshot</span>
        </button>

        <div className="toolbar-divider" />

        <button className="toolbar-btn" onClick={toggleOutliner} title="Toggle Outliner">
          ☰
        </button>
        <button className="toolbar-btn" onClick={toggleInspector} title="Toggle Inspector">
          ⚙
        </button>
        <button
          className={`toolbar-btn ${isTimelineOpen ? "active" : ""}`}
          onClick={toggleTimeline}
          title="Toggle Timeline"
        >
          🎬
        </button>
        <button
          className={`toolbar-btn ${showStats ? "active" : ""}`}
          onClick={toggleStats}
          title="Toggle Performance Stats"
        >
          📊
        </button>
      </div>
    </header>
  );
};
