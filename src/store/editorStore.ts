// ============================================================
// Editor Store — Zustand (single source of truth for UI state)
// Phase 1: + Undo/Redo, Duplicate, Snap, Autosave
// ============================================================

import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type {
  SceneDocument,
  NodeId,
  SceneNode,
  Transform,
  PBRMaterial,
} from "../core/document/types";
import {
  createEmptyDocument,
  addNode,
  removeNode,
  renameNode,
  setNodeTransform,
  setNodeVisibility,
  flattenTree,
} from "../core/document/sceneDocument";
import { commandStack } from "../core/commands/commandStack";
import { autoSave } from "../core/io/projectStorage";
import type { GizmoMode } from "../core/engine/threeBackend";

// ── Editor State Types ──

export type ToolMode = "select" | "translate" | "rotate" | "scale";

export interface EditorState {
  // Document
  document: SceneDocument;

  // Selection
  selectedNodeId: NodeId | null;

  // Tools
  toolMode: ToolMode;
  gizmoMode: GizmoMode;

  // Snapping
  snapEnabled: boolean;
  snapValue: number;

  // UI
  isOutlinerOpen: boolean;
  isInspectorOpen: boolean;
  isTimelineOpen: boolean;
  showGrid: boolean;
  showStats: boolean;

  // Undo/Redo state (reactive)
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;

  // ── Actions ──

  // Document
  setDocument: (doc: SceneDocument) => void;
  /** Update document without clearing selection (for in-place edits) */
  updateDocument: (doc: SceneDocument) => void;
  setProjectName: (name: string) => void;

  // Nodes (with undo support)
  addSceneNode: (opts: {
    name: string;
    type: SceneNode["type"];
    parentId?: NodeId | null;
    transform?: Transform;
    runtimeObjectUuid?: string;
    mesh?: SceneNode["mesh"];
    light?: SceneNode["light"];
    clonerConfig?: SceneNode["clonerConfig"];
    particleEmitter?: SceneNode["particleEmitter"];
    cameraData?: SceneNode["cameraData"];
  }) => NodeId;
  removeSceneNode: (id: NodeId) => void;
  renameSceneNode: (id: NodeId, name: string) => void;
  updateNodeTransform: (id: NodeId, transform: Partial<Transform>) => void;
  setNodeRuntimeUuid: (id: NodeId, uuid: string) => void;
  toggleNodeVisibility: (id: NodeId) => void;

  // Selection
  selectNode: (id: NodeId | null) => void;

  // Tools
  setToolMode: (mode: ToolMode) => void;

  // Snapping
  toggleSnap: () => void;
  setSnapValue: (val: number) => void;

  // Undo/Redo
  undo: () => string | null;
  redo: () => string | null;
  refreshUndoState: () => void;

  // UI Toggles
  toggleOutliner: () => void;
  toggleInspector: () => void;
  toggleTimeline: () => void;
  toggleGrid: () => void;
  toggleStats: () => void;

  // Helpers
  getSelectedNode: () => SceneNode | null;
  getFlatNodes: () => SceneNode[];
  getNodeByRuntimeUuid: (uuid: string) => SceneNode | null;

  // Persistence
  triggerAutoSave: () => void;
}

// Autosave debounce
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

export const useEditorStore = create<EditorState>((set, get) => ({
  // ── Initial State ──
  document: createEmptyDocument("My Scene"),
  selectedNodeId: null,
  toolMode: "translate",
  gizmoMode: "translate",
  snapEnabled: false,
  snapValue: 0.5,
  isOutlinerOpen: true,
  isInspectorOpen: true,
  isTimelineOpen: false,
  showGrid: true,
  showStats: false,
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,

  // ── Document Actions ──

  setDocument: (doc) => set({ document: doc, selectedNodeId: null }),

  updateDocument: (doc) => set({ document: doc }),

  setProjectName: (name) => {
    set((state) => ({
      document: { ...state.document, projectName: name },
    }));
    get().triggerAutoSave();
  },

  // ── Node Actions ──

  addSceneNode: (opts) => {
    const state = get();
    const doc = structuredClone(state.document);

    const nodeId = addNode(doc, {
      name: opts.name,
      type: opts.type,
      parentId: opts.parentId,
      transform: opts.transform,
    });

    const node = doc.nodes[nodeId]!;
    if (opts.runtimeObjectUuid) node.runtimeObjectUuid = opts.runtimeObjectUuid;
    if (opts.mesh) node.mesh = opts.mesh;
    if (opts.light) node.light = opts.light;
    if (opts.clonerConfig) node.clonerConfig = opts.clonerConfig;
    if (opts.particleEmitter) node.particleEmitter = opts.particleEmitter;
    if (opts.cameraData) node.cameraData = opts.cameraData;

    set({ document: doc });
    get().triggerAutoSave();
    return nodeId;
  },

  removeSceneNode: (id) => {
    const state = get();
    const doc = structuredClone(state.document);
    removeNode(doc, id);
    set({
      document: doc,
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    });
    get().triggerAutoSave();
  },

  renameSceneNode: (id, name) => {
    const state = get();
    const doc = structuredClone(state.document);
    renameNode(doc, id, name);
    set({ document: doc });
    get().triggerAutoSave();
  },

  updateNodeTransform: (id, transform) => {
    const state = get();
    const doc = structuredClone(state.document);
    setNodeTransform(doc, id, transform);
    set({ document: doc });
    // Don't autosave on every transform update (too frequent during gizmo drag)
  },

  setNodeRuntimeUuid: (id, runtimeUuid) => {
    const state = get();
    const doc = structuredClone(state.document);
    const node = doc.nodes[id];
    if (node) node.runtimeObjectUuid = runtimeUuid;
    set({ document: doc });
  },

  toggleNodeVisibility: (id) => {
    const state = get();
    const doc = structuredClone(state.document);
    const node = doc.nodes[id];
    if (node) {
      setNodeVisibility(doc, id, !node.visible);
    }
    set({ document: doc });
    get().triggerAutoSave();
  },

  // ── Selection ──

  selectNode: (id) => {
    const state = get();
    const gizmoMode =
      state.toolMode === "select" ? state.gizmoMode : (state.toolMode as GizmoMode);
    set({ selectedNodeId: id, gizmoMode });
  },

  // ── Tool Mode ──

  setToolMode: (mode) => {
    const gizmoMode: GizmoMode =
      mode === "select" ? "translate" : (mode as GizmoMode);
    set({ toolMode: mode, gizmoMode });
  },

  // ── Snapping ──

  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  setSnapValue: (val) => set({ snapValue: val }),

  // ── Undo/Redo ──

  undo: () => {
    const label = commandStack.undo();
    get().refreshUndoState();
    return label;
  },

  redo: () => {
    const label = commandStack.redo();
    get().refreshUndoState();
    return label;
  },

  refreshUndoState: () => {
    set({
      canUndo: commandStack.canUndo,
      canRedo: commandStack.canRedo,
      undoLabel: commandStack.undoLabel,
      redoLabel: commandStack.redoLabel,
    });
  },

  // ── UI Toggles ──

  toggleOutliner: () => set((s) => ({ isOutlinerOpen: !s.isOutlinerOpen })),
  toggleInspector: () => set((s) => ({ isInspectorOpen: !s.isInspectorOpen })),
  toggleTimeline: () => set((s) => ({ isTimelineOpen: !s.isTimelineOpen })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleStats: () => set((s) => ({ showStats: !s.showStats })),

  // ── Helpers ──

  getSelectedNode: () => {
    const state = get();
    if (!state.selectedNodeId) return null;
    return state.document.nodes[state.selectedNodeId] ?? null;
  },

  getFlatNodes: () => {
    return flattenTree(get().document);
  },

  getNodeByRuntimeUuid: (runtimeUuid) => {
    const nodes = Object.values(get().document.nodes);
    return nodes.find((n) => n.runtimeObjectUuid === runtimeUuid) ?? null;
  },

  // ── Persistence ──

  triggerAutoSave: () => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      const state = get();
      autoSave(state.document).catch(console.error);
    }, 2000);
  },
}));
