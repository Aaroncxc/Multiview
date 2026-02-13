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
  MeshEditMode,
} from "../core/document/types";
import {
  createEmptyDocument,
  addNode,
  removeNode,
  reparentNode,
  renameNode,
  setNodeTransform,
  setNodeVisibility,
  collectSubtreeIds,
  flattenTree,
} from "../core/document/sceneDocument";
import { commandStack } from "../core/commands/commandStack";
import type { GizmoMode } from "../core/engine/threeBackend";
import {
  DEFAULT_VIEWER_EXPORT_OPTIONS,
  type ViewerExportOptions,
} from "../core/io/viewerExportOptions";

// ── Editor State Types ──

export type ToolMode = "select" | "translate" | "rotate" | "scale";
export type UiTheme = "light" | "dark";

export interface MeshEditSelection {
  mode: Exclude<MeshEditMode, "object">;
  faceIndex: number | null;
  vertexIndex: number | null;
  edge: [number, number] | null;
}

const UI_THEME_STORAGE_KEY = "multiview-editor.ui-theme";

function readInitialUiTheme(): UiTheme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(UI_THEME_STORAGE_KEY);
  return stored === "dark" ? "dark" : "light";
}

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
  uiTheme: UiTheme;
  meshEditMode: MeshEditMode;
  meshEditSelection: MeshEditSelection | null;

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
  reparentSceneNode: (nodeId: NodeId, parentId: NodeId | null) => void;
  groupSelectedNode: () => NodeId | null;
  ungroupNode: (nodeId: NodeId) => boolean;

  // Selection
  selectNode: (id: NodeId | null) => void;

  // Tools
  setToolMode: (mode: ToolMode) => void;
  setMeshEditMode: (mode: MeshEditMode) => void;
  setMeshEditSelection: (selection: MeshEditSelection | null) => void;
  clearMeshEditSelection: () => void;

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
  setUiTheme: (theme: UiTheme) => void;
  toggleUiTheme: () => void;

  // Helpers
  getSelectedNode: () => SceneNode | null;
  getFlatNodes: () => SceneNode[];
  getNodeByRuntimeUuid: (uuid: string) => SceneNode | null;

  // Persistence
  triggerAutoSave: () => void;

  // Viewer Export options (for portfolio publish)
  viewerExportOptions: ViewerExportOptions;
  setViewerExportOptions: (opts: Partial<ViewerExportOptions>) => void;
}

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
  uiTheme: readInitialUiTheme(),
  meshEditMode: "object",
  meshEditSelection: null,
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  viewerExportOptions: { ...DEFAULT_VIEWER_EXPORT_OPTIONS },
  setViewerExportOptions: (opts) =>
    set((s) => ({
      viewerExportOptions: { ...s.viewerExportOptions, ...opts },
    })),

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
    const subtreeIds = collectSubtreeIds(doc, id);
    removeNode(doc, id);
    const shouldClearSelection =
      state.selectedNodeId !== null &&
      subtreeIds.includes(state.selectedNodeId);
    set({
      document: doc,
      selectedNodeId: shouldClearSelection ? null : state.selectedNodeId,
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
      const nextVisible = !node.visible;
      const subtreeIds = collectSubtreeIds(doc, id);
      for (const subtreeId of subtreeIds) {
        setNodeVisibility(doc, subtreeId, nextVisible);
      }
    }
    set({ document: doc });
    get().triggerAutoSave();
  },

  reparentSceneNode: (nodeId, parentId) => {
    const state = get();
    const doc = structuredClone(state.document);
    const node = doc.nodes[nodeId];
    if (!node || node.type === "scene") return;

    if (parentId) {
      const parent = doc.nodes[parentId];
      if (!parent || parent.type !== "group") return;
    }

    reparentNode(doc, nodeId, parentId);
    set({ document: doc });
    get().triggerAutoSave();
  },

  groupSelectedNode: () => {
    const state = get();
    const selectedId = state.selectedNodeId;
    if (!selectedId) return null;

    const doc = structuredClone(state.document);
    const selectedNode = doc.nodes[selectedId];
    if (!selectedNode || selectedNode.type === "scene") return null;

    const parentId = selectedNode.parentId;
    const siblingList = parentId ? doc.nodes[parentId]?.children : doc.rootIds;
    if (!siblingList) return null;
    const selectedIndex = siblingList.indexOf(selectedId);
    if (selectedIndex < 0) return null;

    const groupCount =
      Object.values(doc.nodes).filter((n) => n.type === "group").length + 1;
    const groupId = addNode(doc, {
      name: `Group_${groupCount}`,
      type: "group",
      parentId,
      transform: structuredClone(selectedNode.transform),
    });

    const createdIndex = siblingList.indexOf(groupId);
    if (createdIndex >= 0) {
      siblingList.splice(createdIndex, 1);
    }
    siblingList.splice(selectedIndex, 0, groupId);

    reparentNode(doc, selectedId, groupId);

    set({ document: doc, selectedNodeId: groupId });
    get().triggerAutoSave();
    return groupId;
  },

  ungroupNode: (nodeId) => {
    const state = get();
    const doc = structuredClone(state.document);
    const group = doc.nodes[nodeId];
    if (!group || group.type !== "group") return false;

    const parentId = group.parentId;
    const siblingList = parentId ? doc.nodes[parentId]?.children : doc.rootIds;
    if (!siblingList) return false;
    const groupIndex = siblingList.indexOf(nodeId);
    if (groupIndex < 0) return false;

    const children = [...group.children];
    siblingList.splice(groupIndex, 1);
    siblingList.splice(groupIndex, 0, ...children);

    for (const childId of children) {
      const child = doc.nodes[childId];
      if (child) {
        child.parentId = parentId ?? null;
      }
    }

    delete doc.nodes[nodeId];

    const nextSelected =
      state.selectedNodeId === nodeId ? children[0] ?? null : state.selectedNodeId;
    set({ document: doc, selectedNodeId: nextSelected });
    get().triggerAutoSave();
    return true;
  },

  // ── Selection ──

  selectNode: (id) => {
    const state = get();
    const gizmoMode =
      state.toolMode === "select" ? state.gizmoMode : (state.toolMode as GizmoMode);
    set({ selectedNodeId: id, gizmoMode, meshEditSelection: null });
  },

  // ── Tool Mode ──

  setToolMode: (mode) => {
    const gizmoMode: GizmoMode =
      mode === "select" ? "translate" : (mode as GizmoMode);
    set({ toolMode: mode, gizmoMode });
  },
  setMeshEditMode: (mode) => set({ meshEditMode: mode, meshEditSelection: null }),
  setMeshEditSelection: (selection) => set({ meshEditSelection: selection }),
  clearMeshEditSelection: () => set({ meshEditSelection: null }),

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
  setUiTheme: (theme) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(UI_THEME_STORAGE_KEY, theme);
    }
    set({ uiTheme: theme });
  },
  toggleUiTheme: () => {
    const next = get().uiTheme === "dark" ? "light" : "dark";
    get().setUiTheme(next);
  },

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

  triggerAutoSave: () => {},
}));
