// ============================================================
// Viewport — 3D Canvas with Three.js integration
// Phase 1: + Undo/Redo/Duplicate shortcuts, Snap sync, Autosave
// Apple HIG: Direct manipulation, immediate feedback
// ============================================================

import React, { useRef, useEffect, useCallback, useState } from "react";
import { ThreeBackend } from "../../core/engine/threeBackend";
import { InteractionRuntime } from "../../core/interactions/interactionRuntime";
import { TimelineRuntime } from "../../core/timeline/timelineRuntime";
import { useEditorStore } from "../../store/editorStore";
import { commandStack } from "../../core/commands/commandStack";
import { showToast } from "../../ui/Toast";
import {
  importFromJSON,
  isFileSystemAccessSupported,
  listKnownProjectFiles,
  listProjects,
  loadKnownProjectFile,
  loadProject,
  rememberKnownProjectFile,
  saveProject,
  updateKnownProjectFileMeta,
  type KnownProjectFileListItem,
  type ProjectListItem,
} from "../../core/io/projectStorage";
import { rebuildSceneFromDocument } from "../../core/io/sceneRebuilder";
import type {
  SceneDocument,
  Transform,
  SceneNode,
  NodeId,
} from "../../core/document/types";
import { collectSubtreeIds } from "../../core/document/sceneDocument";
import { mergeViewerExportOptions } from "../../core/io/viewerExportOptions";
import { exportViewerHTML } from "../../core/io/viewerExport";
import "./Viewport.css";

// Singleton backend instance
let backend: ThreeBackend | null = null;
let interactionRuntime: InteractionRuntime | null = null;
let timelineRuntime: TimelineRuntime | null = null;

export function getBackend(): ThreeBackend | null {
  return backend;
}

export function getInteractionRuntime(): InteractionRuntime | null {
  return interactionRuntime;
}

const INTRO_RELEASE_NOTES: Array<{ title: string; detail: string }> = [
  {
    title: "TE-inspired UI refresh",
    detail: "Light and dark variants now share a gray/orange design language.",
  },
  {
    title: "Viewport-embedded floating panels",
    detail: "Scene and Scene Settings can stay inside the viewport layout.",
  },
  {
    title: "Viewer export upgrades",
    detail:
      "Loading screen, custom CSS/theme, responsive ratio, title/description, and preview image are ready.",
  },
  {
    title: "Copy/Paste in progress",
    detail: "Ctrl+C / Ctrl+V now works as the next roadmap milestone.",
  },
];

const INTRO_COMING_NEXT: Array<{
  title: string;
  detail: string;
  stage: string;
}> = [
  {
    title: "Copy/Paste completion",
    detail: "Finalize behavior across object types and polish interaction details.",
    stage: "In progress",
  },
  {
    title: "Group and hierarchy tools",
    detail: "Create groups, reorganize nodes faster, and improve scene structure workflows.",
    stage: "Next",
  },
  {
    title: "Pivot point editing",
    detail: "Adjust local pivot placement for more precise transforms and animation setup.",
    stage: "Planned",
  },
  {
    title: "Multi-selection workflow",
    detail: "Select and transform multiple nodes together for layout and batch edits.",
    stage: "Planned",
  },
];

type LoadedProjectSource = "internal" | "known-file" | "file";

interface LoadedProjectMeta {
  source: LoadedProjectSource;
  key?: string | null;
}

type OpenFilePickerFn = (options?: {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<FileSystemFileHandle[]>;

interface WindowWithFilePicker extends Window {
  showOpenFilePicker?: OpenFilePickerFn;
}

interface CopiedSubtreePayload {
  rootId: NodeId;
  rootParentId: NodeId | null;
  nodes: Record<NodeId, SceneNode>;
}

export const Viewport: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);

  const selectNode = useEditorStore((s) => s.selectNode);
  const addSceneNode = useEditorStore((s) => s.addSceneNode);
  const removeSceneNode = useEditorStore((s) => s.removeSceneNode);
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const gizmoMode = useEditorStore((s) => s.gizmoMode);
  const showStats = useEditorStore((s) => s.showStats);
  const showGrid = useEditorStore((s) => s.showGrid);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const snapValue = useEditorStore((s) => s.snapValue);
  const meshEditMode = useEditorStore((s) => s.meshEditMode);
  const meshEditSelection = useEditorStore((s) => s.meshEditSelection);
  const setMeshEditMode = useEditorStore((s) => s.setMeshEditMode);
  const setMeshEditSelection = useEditorStore((s) => s.setMeshEditSelection);
  const clearMeshEditSelection = useEditorStore((s) => s.clearMeshEditSelection);
  const document = useEditorStore((s) => s.document);
  const isTransparentViewport =
    document.sceneSettings.backgroundType === "transparent";
  const [viewerPreviewUrl, setViewerPreviewUrl] = useState<string | null>(null);
  const [isStartupIntroOpen, setIsStartupIntroOpen] = useState(true);
  const [isProjectLoaderOpen, setIsProjectLoaderOpen] = useState(false);
  const [isProjectLoaderBusy, setIsProjectLoaderBusy] = useState(false);
  const [projectLoaderError, setProjectLoaderError] = useState<string | null>(null);
  const [savedProjects, setSavedProjects] = useState<ProjectListItem[]>([]);
  const [knownProjectFiles, setKnownProjectFiles] = useState<
    KnownProjectFileListItem[]
  >([]);
  const supportsFileSystemAccess = isFileSystemAccessSupported();
  const viewerPreviewUrlRef = useRef<string | null>(null);
  const activeProjectKeyRef = useRef<string | null>(null);
  const lastSavedFingerprintRef = useRef<string>(JSON.stringify(document));
  const visibilitySyncRef = useRef<Map<NodeId, { visible: boolean; runtimeObjectUuid?: string }>>(
    new Map()
  );
  const appVersion = __APP_VERSION__;

  const dismissStartupIntro = useCallback(() => {
    setIsStartupIntroOpen(false);
  }, []);

  const getDocumentFingerprint = useCallback((doc: SceneDocument) => {
    return JSON.stringify(doc);
  }, []);

  const isCurrentDocumentDirty = useCallback(() => {
    const currentDoc = useEditorStore.getState().document;
    return getDocumentFingerprint(currentDoc) !== lastSavedFingerprintRef.current;
  }, [getDocumentFingerprint]);

  const confirmDiscardUnsavedChanges = useCallback(() => {
    if (!isCurrentDocumentDirty()) return true;
    return window.confirm("Ungespeicherte Änderungen verwerfen?");
  }, [isCurrentDocumentDirty]);

  const captureProjectPreview = useCallback((): string | null => {
    if (!backend) return null;
    try {
      return backend.captureScreenshot("image/jpeg", 0.8);
    } catch (err) {
      console.warn("Project preview capture failed:", err);
      return null;
    }
  }, []);

  const refreshProjectLoaderData = useCallback(async () => {
    setIsProjectLoaderBusy(true);
    setProjectLoaderError(null);
    try {
      const [projects, knownFiles] = await Promise.all([
        listProjects(),
        supportsFileSystemAccess ? listKnownProjectFiles() : Promise.resolve([]),
      ]);
      setSavedProjects(projects);
      setKnownProjectFiles(knownFiles);
    } catch (err) {
      console.error("Failed to load project lists:", err);
      setProjectLoaderError("Failed to load saved projects.");
    } finally {
      setIsProjectLoaderBusy(false);
    }
  }, [supportsFileSystemAccess]);

  const closeProjectLoader = useCallback(() => {
    setIsProjectLoaderOpen(false);
    setProjectLoaderError(null);
  }, []);

  const openProjectLoader = useCallback(() => {
    setIsProjectLoaderOpen(true);
    void refreshProjectLoaderData();
  }, [refreshProjectLoaderData]);

  const applyLoadedProjectDocument = useCallback(
    async (doc: SceneDocument, meta: LoadedProjectMeta) => {
      if (!backend) {
        throw new Error("Editor backend is not ready yet.");
      }

      const state = useEditorStore.getState();
      const docForRebuild = structuredClone(doc);
      for (const node of Object.values(docForRebuild.nodes)) {
        delete node.runtimeObjectUuid;
      }

      state.setDocument(docForRebuild);
      const updatedDoc = await rebuildSceneFromDocument(backend, docForRebuild);
      state.updateDocument(updatedDoc);
      backend.applySceneSettings(updatedDoc.sceneSettings);
      state.selectNode(null);
      commandStack.clear();
      state.refreshUndoState();

      activeProjectKeyRef.current =
        meta.source === "internal" ? meta.key ?? null : null;
      lastSavedFingerprintRef.current = getDocumentFingerprint(updatedDoc);

      return updatedDoc;
    },
    [getDocumentFingerprint]
  );

  const saveCurrentProject = useCallback(async () => {
    try {
      const state = useEditorStore.getState();
      const savedKey = await saveProject(state.document, {
        key: activeProjectKeyRef.current ?? undefined,
        previewDataUrl: captureProjectPreview(),
      });
      activeProjectKeyRef.current = savedKey;
      lastSavedFingerprintRef.current = getDocumentFingerprint(state.document);
      showToast("Project saved", "success");
      if (isProjectLoaderOpen) {
        void refreshProjectLoaderData();
      }
      return savedKey;
    } catch (err) {
      console.error("Project save failed:", err);
      showToast("Failed to save project", "error");
      return null;
    }
  }, [
    captureProjectPreview,
    getDocumentFingerprint,
    isProjectLoaderOpen,
    refreshProjectLoaderData,
  ]);

  const formatDateTime = useCallback((iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString();
  }, []);

  const loadProjectFromDocument = useCallback(
    async (doc: SceneDocument, meta: LoadedProjectMeta) => {
      await applyLoadedProjectDocument(doc, meta);
      closeProjectLoader();
      void refreshProjectLoaderData();
      showToast(`Loaded project: ${doc.projectName}`, "success");
    },
    [applyLoadedProjectDocument, closeProjectLoader, refreshProjectLoaderData]
  );

  const handleLoadSavedProject = useCallback(
    async (project: ProjectListItem) => {
      if (!confirmDiscardUnsavedChanges()) return;
      try {
        const doc = await loadProject(project.key);
        if (!doc) {
          showToast("Saved project could not be loaded", "error");
          return;
        }
        await loadProjectFromDocument(doc, {
          source: "internal",
          key: project.key,
        });
      } catch (err) {
        console.error("Failed to load internal project:", err);
        showToast("Failed to load project", "error");
      }
    },
    [confirmDiscardUnsavedChanges, loadProjectFromDocument]
  );

  const loadProjectFromFile = useCallback(
    async (file: File, knownFileId?: string): Promise<boolean> => {
      if (!confirmDiscardUnsavedChanges()) return false;

      try {
        const doc = await importFromJSON(file);
        await loadProjectFromDocument(doc, {
          source: knownFileId ? "known-file" : "file",
        });
        if (knownFileId) {
          await updateKnownProjectFileMeta(knownFileId, {
            name: file.name,
            lastOpenedAt: new Date().toISOString(),
            previewDataUrl: captureProjectPreview(),
          });
          void refreshProjectLoaderData();
        }
        return true;
      } catch (err) {
        console.error("Failed to load project file:", err);
        showToast(`Failed to load ${file.name}`, "error");
        return false;
      }
    },
    [
      captureProjectPreview,
      confirmDiscardUnsavedChanges,
      loadProjectFromDocument,
      refreshProjectLoaderData,
    ]
  );

  const handleLoadKnownProjectFile = useCallback(
    async (item: KnownProjectFileListItem) => {
      if (!confirmDiscardUnsavedChanges()) return;

      try {
        const { file } = await loadKnownProjectFile(item.id);
        const doc = await importFromJSON(file);
        await applyLoadedProjectDocument(doc, { source: "known-file" });
        await updateKnownProjectFileMeta(item.id, {
          name: file.name,
          lastOpenedAt: new Date().toISOString(),
          previewDataUrl: captureProjectPreview(),
        });
        closeProjectLoader();
        void refreshProjectLoaderData();
        showToast(`Loaded project: ${doc.projectName}`, "success");
      } catch (err) {
        console.error("Failed to load known project file:", err);
        showToast("Failed to load known file", "error");
      }
    },
    [
      applyLoadedProjectDocument,
      captureProjectPreview,
      closeProjectLoader,
      confirmDiscardUnsavedChanges,
      refreshProjectLoaderData,
    ]
  );

  const handleLoadProjectFromComputer = useCallback(async () => {
    if (supportsFileSystemAccess) {
      const pickerWindow = window as WindowWithFilePicker;
      if (pickerWindow.showOpenFilePicker) {
        try {
          const [handle] = await pickerWindow.showOpenFilePicker({
            multiple: false,
            excludeAcceptAllOption: true,
            types: [
              {
                description: "MultiView Project",
                accept: {
                  "application/json": [".json", ".multiview.json"],
                },
              },
            ],
          });
          if (!handle) return;
          const file = await handle.getFile();
          const loaded = await loadProjectFromFile(file);
          if (!loaded) return;

          const previewDataUrl = captureProjectPreview();
          try {
            const knownFileId = await rememberKnownProjectFile(handle, {
              name: file.name,
              lastOpenedAt: new Date().toISOString(),
              previewDataUrl,
            });
            await updateKnownProjectFileMeta(knownFileId, {
              name: file.name,
              lastOpenedAt: new Date().toISOString(),
              previewDataUrl,
            });
            void refreshProjectLoaderData();
          } catch (rememberErr) {
            console.warn("Could not remember selected file handle:", rememberErr);
          }
          return;
        } catch (err) {
          if ((err as DOMException).name === "AbortError") return;
          console.error("Native file picker failed:", err);
        }
      }
    }

    projectFileInputRef.current?.click();
  }, [
    captureProjectPreview,
    loadProjectFromFile,
    refreshProjectLoaderData,
    supportsFileSystemAccess,
  ]);

  const handleProjectFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        await loadProjectFromFile(file);
      }
      e.target.value = "";
    },
    [loadProjectFromFile]
  );

  const triggerBlobDownload = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const revokeViewerPreviewUrl = useCallback(() => {
    if (!viewerPreviewUrlRef.current) return;
    URL.revokeObjectURL(viewerPreviewUrlRef.current);
    viewerPreviewUrlRef.current = null;
  }, []);

  const buildViewerExportPayload = useCallback(() => {
    if (!backend) {
      showToast("Viewer backend is not ready yet", "warning");
      return null;
    }

    try {
      const state = useEditorStore.getState();
      const doc = state.document;
      const opts = mergeViewerExportOptions(state.viewerExportOptions);

      // Embed a poster frame for the exported loading screen (optional)
      delete opts.previewImageDataUrl;
      if (opts.includePreviewImage !== false) {
        try {
          opts.previewImageDataUrl = backend.captureScreenshot("image/jpeg", 0.82);
        } catch (err) {
          console.warn("Failed to capture preview screenshot:", err);
          showToast("Preview image could not be embedded", "warning");
        }
      }

      return {
        html: exportViewerHTML(doc, backend, opts),
        filename: `${doc.projectName.replace(/\s+/g, "_")}_viewer.html`,
      };
    } catch (err) {
      console.error("Viewer export failed:", err);
      showToast("Viewer export failed", "error");
      return null;
    }
  }, []);

  const openViewerPreview = useCallback(() => {
    const payload = buildViewerExportPayload();
    if (!payload) return;

    const blob = new Blob([payload.html], { type: "text/html" });
    const nextUrl = URL.createObjectURL(blob);
    const previousUrl = viewerPreviewUrlRef.current;

    viewerPreviewUrlRef.current = nextUrl;
    setViewerPreviewUrl(nextUrl);

    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
  }, [buildViewerExportPayload]);

  const closeViewerPreview = useCallback(() => {
    setViewerPreviewUrl(null);
    revokeViewerPreviewUrl();
  }, [revokeViewerPreviewUrl]);

  // ── Initialize Three.js ──
  useEffect(() => {
    if (!canvasRef.current) return;
    if (initializedRef.current && backend) return;
    initializedRef.current = true;

    backend = new ThreeBackend();
    backend.init(canvasRef.current);

    // Listen for gizmo transform changes → update store
    backend.onGizmoTransformChange((uuid, transform) => {
      const state = useEditorStore.getState();
      const node = state.getNodeByRuntimeUuid(uuid);
      if (node) {
        state.updateNodeTransform(node.id, transform);
      }
    });

    // Apply initial scene settings
    const initialSettings = useEditorStore.getState().document.sceneSettings;
    if (initialSettings) {
      backend.applySceneSettings(initialSettings);
    }

    // Initialize Interaction Runtime
    interactionRuntime = new InteractionRuntime(
      backend.getObjectRegistry(),
      () => useEditorStore.getState().document
    );
    interactionRuntime.start();

    // Initialize Timeline Runtime
    timelineRuntime = new TimelineRuntime(
      backend.getObjectRegistry(),
      (nodeId: string) => useEditorStore.getState().document.nodes[nodeId]?.runtimeObjectUuid
    );
    // Broadcast tick events for the Timeline UI
    timelineRuntime.subscribe(() => {
      window.dispatchEvent(
        new CustomEvent("timeline:tick", {
          detail: {
            state: timelineRuntime!.state,
            time: timelineRuntime!.currentTime,
          },
        })
      );
    });

    return () => {
      timelineRuntime?.dispose();
      timelineRuntime = null;
      interactionRuntime?.stop();
      interactionRuntime = null;
      backend?.dispose();
      backend = null;
      initializedRef.current = false;
    };
  }, []);

  // ── Sync gizmo mode ──
  useEffect(() => {
    backend?.setGizmoMode(gizmoMode);
  }, [gizmoMode]);

  // ── Sync selection → gizmo attachment ──
  useEffect(() => {
    if (!backend) return;
    const state = useEditorStore.getState();
    const node = selectedNodeId ? state.document.nodes[selectedNodeId] : null;
    const uuid = node?.runtimeObjectUuid ?? null;
    backend.attachGizmo(meshEditMode === "object" ? uuid : null);
    backend.highlightSelected(uuid);
  }, [meshEditMode, selectedNodeId]);

  // ── Sync grid visibility ──
  useEffect(() => {
    backend?.setGridVisible(showGrid);
  }, [showGrid]);

  // ── Sync snapping ──
  useEffect(() => {
    backend?.setTransformSnap(snapEnabled ? snapValue : null);
  }, [snapEnabled, snapValue]);

  // ── Track hovered node for interaction events ──
  const hoveredNodeRef = useRef<string | null>(null);
  const clipboardSubtreeRef = useRef<CopiedSubtreePayload | null>(null);

  // ── Handle canvas click → pick & select + fire interaction ──
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!backend) return;

      const state = useEditorStore.getState();
      const selectedNode = state.selectedNodeId
        ? state.document.nodes[state.selectedNodeId]
        : null;
      const selectedMeshUuid =
        selectedNode && selectedNode.type === "mesh"
          ? selectedNode.runtimeObjectUuid
          : null;

      if (meshEditMode !== "object" && selectedMeshUuid) {
        backend.ensureMeshEditable(selectedMeshUuid);
        const component = backend.pickMeshComponent(
          selectedMeshUuid,
          e.clientX,
          e.clientY,
          meshEditMode
        );
        if (component) {
          const selection = {
            mode: component.mode,
            faceIndex: component.faceIndex,
            vertexIndex: component.vertexIndex,
            edge: component.edge,
          };
          setMeshEditSelection(selection);
          backend.highlightMeshComponent(selectedMeshUuid, selection);
          return;
        }
      }

      if (meshEditMode !== "object") {
        clearMeshEditSelection();
        backend.clearMeshEditHighlight();
      }

      const result = backend.pick(e.clientX, e.clientY);
      if (result) {
        const node = state.getNodeByRuntimeUuid(result.objectUuid);
        if (node) {
          selectNode(node.id);
          // Fire interaction events
          interactionRuntime?.fireEvent(node.id, "click");
          interactionRuntime?.fireEvent(node.id, "mouseDown");
        }
      } else {
        selectNode(null);
      }
    },
    [clearMeshEditSelection, meshEditMode, selectNode, setMeshEditSelection]
  );

  // ── Double click ──
  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!backend) return;
      const result = backend.pick(e.clientX, e.clientY);
      if (result) {
        const state = useEditorStore.getState();
        const node = state.getNodeByRuntimeUuid(result.objectUuid);
        if (node) {
          interactionRuntime?.fireEvent(node.id, "doubleClick");
        }
      }
    },
    []
  );

  // ── Handle hover → mouseEnter / mouseLeave ──
  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      backend?.updateHover(e.clientX, e.clientY);

      // Interaction hover events
      if (!backend) return;
      const result = backend.pick(e.clientX, e.clientY);
      const state = useEditorStore.getState();

      const newHoveredNodeId = result
        ? state.getNodeByRuntimeUuid(result.objectUuid)?.id ?? null
        : null;

      if (newHoveredNodeId !== hoveredNodeRef.current) {
        // Mouse leave old
        if (hoveredNodeRef.current) {
          interactionRuntime?.fireEvent(hoveredNodeRef.current, "mouseLeave");
        }
        // Mouse enter new
        if (newHoveredNodeId) {
          interactionRuntime?.fireEvent(newHoveredNodeId, "mouseEnter");
        }
        hoveredNodeRef.current = newHoveredNodeId;
      }
    },
    []
  );

  useEffect(() => {
    if (!backend) return;

    const state = useEditorStore.getState();
    const selected = selectedNodeId ? state.document.nodes[selectedNodeId] : null;
    const selectedMeshUuid =
      selected && selected.type === "mesh" ? selected.runtimeObjectUuid : null;

    if (meshEditMode === "object" || !selectedMeshUuid) {
      clearMeshEditSelection();
      backend.clearMeshEditHighlight();
      return;
    }

    backend.ensureMeshEditable(selectedMeshUuid);

    if (meshEditSelection) {
      backend.highlightMeshComponent(selectedMeshUuid, meshEditSelection);
    } else {
      backend.clearMeshEditHighlight();
    }
  }, [
    clearMeshEditSelection,
    meshEditMode,
    meshEditSelection,
    selectedNodeId,
    document.nodes,
  ]);

  // ── Handle keyboard shortcuts ──
  useEffect(() => {
    const offsetTransform = (transform: Transform, enabled: boolean): Transform => {
      const next = structuredClone(transform);
      if (enabled) {
        next.position[0] += 0.5;
        next.position[2] += 0.5;
      }
      return next;
    };

    const collectCopiedSubtree = (
      doc: SceneDocument,
      rootId: NodeId
    ): CopiedSubtreePayload | null => {
      const root = doc.nodes[rootId];
      if (!root || root.type === "scene") return null;

      const subtreeIds = collectSubtreeIds(doc, rootId);
      const nodes: Record<NodeId, SceneNode> = {};
      for (const nodeId of subtreeIds) {
        const source = doc.nodes[nodeId];
        if (source) {
          nodes[nodeId] = structuredClone(source);
        }
      }
      return {
        rootId,
        rootParentId: root.parentId,
        nodes,
      };
    };

    const duplicateRuntimeForNode = (
      sourceNode: SceneNode,
      nextName: string,
      nextTransform: Transform
    ): string | undefined => {
      if (!backend) return undefined;

      if (sourceNode.type === "light" && sourceNode.light) {
        const lightCopy = structuredClone(sourceNode.light);
        const result = backend.addLight(lightCopy.kind, nextName, lightCopy);
        backend.setObjectTransform(result.uuid, nextTransform);
        return result.uuid;
      }

      if (sourceNode.type === "particleEmitter" && sourceNode.particleEmitter) {
        const emitterCopy = structuredClone(sourceNode.particleEmitter);
        const result = backend.addParticleEmitter(emitterCopy, nextName);
        backend.setObjectTransform(result.uuid, nextTransform);
        return result.uuid;
      }

      if (sourceNode.runtimeObjectUuid) {
        const result = backend.duplicateObject(sourceNode.runtimeObjectUuid);
        if (!result) return undefined;
        backend.setObjectTransform(result.uuid, nextTransform);
        return result.uuid;
      }

      return undefined;
    };

    const removeSubtree = (rootId: NodeId) => {
      const state = useEditorStore.getState();
      const doc = state.document;
      if (!doc.nodes[rootId]) return;

      const subtreeIds = collectSubtreeIds(doc, rootId);
      const runtimeUuids = Array.from(
        new Set(
          subtreeIds
            .map((nodeId) => doc.nodes[nodeId]?.runtimeObjectUuid ?? null)
            .filter((uuid): uuid is string => Boolean(uuid))
        )
      );

      for (const runtimeUuid of runtimeUuids) {
        backend?.removeObject(runtimeUuid);
      }

      state.removeSceneNode(rootId);
    };

    const insertSubtree = (
      payload: CopiedSubtreePayload,
      options?: {
        renameRootAsCopy?: boolean;
        offset?: boolean;
        preserveIds?: boolean;
        rootParentId?: NodeId | null;
        selectInserted?: boolean;
      }
    ): NodeId | null => {
      const sourceRoot = payload.nodes[payload.rootId];
      if (!sourceRoot) return null;

      const state = useEditorStore.getState();
      const nextDoc = structuredClone(state.document);
      const rootParentCandidate =
        options?.rootParentId === undefined
          ? payload.rootParentId
          : options.rootParentId;
      const resolvedRootParentId =
        rootParentCandidate && nextDoc.nodes[rootParentCandidate]
          ? rootParentCandidate
          : null;
      const rootParentNode = resolvedRootParentId
        ? nextDoc.nodes[resolvedRootParentId]
        : null;
      const normalizedRootParentId =
        rootParentNode && rootParentNode.type === "group"
          ? resolvedRootParentId
          : null;

      const orderedSourceIds: NodeId[] = [];
      const walk = (nodeId: NodeId) => {
        const node = payload.nodes[nodeId];
        if (!node) return;
        orderedSourceIds.push(nodeId);
        for (const childId of node.children) {
          walk(childId);
        }
      };
      walk(payload.rootId);

      const idMap = new Map<NodeId, NodeId>();
      let failedRuntimeCount = 0;

      for (const sourceId of orderedSourceIds) {
        const sourceNode = payload.nodes[sourceId];
        if (!sourceNode) continue;

        const isRoot = sourceId === payload.rootId;
        const mappedParentId = isRoot
          ? normalizedRootParentId
          : sourceNode.parentId
            ? idMap.get(sourceNode.parentId) ?? null
            : null;

        const tentativeId = options?.preserveIds ? sourceId : crypto.randomUUID();
        const nextId = nextDoc.nodes[tentativeId] ? crypto.randomUUID() : tentativeId;
        idMap.set(sourceId, nextId);

        const nextName =
          isRoot && options?.renameRootAsCopy !== false
            ? `${sourceNode.name}_copy`
            : sourceNode.name;
        const nextTransform = offsetTransform(
          sourceNode.transform,
          options?.offset !== false
        );

        const nextNode: SceneNode = {
          ...structuredClone(sourceNode),
          id: nextId,
          name: nextName,
          parentId: mappedParentId,
          children: [],
          transform: nextTransform,
        };

        const duplicatedRuntimeUuid = duplicateRuntimeForNode(
          sourceNode,
          nextName,
          nextTransform
        );
        if (duplicatedRuntimeUuid) {
          nextNode.runtimeObjectUuid = duplicatedRuntimeUuid;
        } else {
          delete nextNode.runtimeObjectUuid;
          if (sourceNode.runtimeObjectUuid) {
            failedRuntimeCount += 1;
          }
        }

        nextDoc.nodes[nextId] = nextNode;
        if (mappedParentId && nextDoc.nodes[mappedParentId]) {
          nextDoc.nodes[mappedParentId]!.children.push(nextId);
        } else {
          nextDoc.rootIds.push(nextId);
        }
      }

      for (const sourceId of orderedSourceIds) {
        const nextId = idMap.get(sourceId);
        const sourceNode = payload.nodes[sourceId];
        if (!nextId || !sourceNode) continue;
        const mappedChildren = sourceNode.children
          .map((childId) => idMap.get(childId))
          .filter((nodeId): nodeId is NodeId => Boolean(nodeId));
        const nextNode = nextDoc.nodes[nextId]!;
        nextNode.children = mappedChildren;

        if (
          nextNode.clonerConfig &&
          idMap.has(nextNode.clonerConfig.sourceNodeId)
        ) {
          nextNode.clonerConfig = {
            ...nextNode.clonerConfig,
            sourceNodeId: idMap.get(nextNode.clonerConfig.sourceNodeId)!,
          };
        }

        if (nextNode.interactions) {
          nextNode.interactions = {
            ...nextNode.interactions,
            actions: nextNode.interactions.actions.map((action) =>
              action.targetNodeId && idMap.has(action.targetNodeId)
                ? { ...action, targetNodeId: idMap.get(action.targetNodeId)! }
                : action
            ),
          };
        }
      }

      const insertedRootId = idMap.get(payload.rootId) ?? null;
      state.updateDocument(nextDoc);
      if (insertedRootId && options?.selectInserted !== false) {
        state.selectNode(insertedRootId);
      }
      if (failedRuntimeCount > 0) {
        showToast(
          `${failedRuntimeCount} copied node(s) were restored without runtime object`,
          "warning"
        );
      }
      return insertedRootId;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      )
        return;

      const state = useEditorStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl shortcuts
      if (ctrl) {
        switch (e.key.toLowerCase()) {
          case "z": {
            e.preventDefault();
            if (e.shiftKey) {
              const label = state.redo();
              if (label) showToast(`Redo ${label}`, "info");
            } else {
              const label = state.undo();
              if (label) showToast(`Undo ${label}`, "info");
            }
            return;
          }
          case "y": {
            e.preventDefault();
            const label = state.redo();
            if (label) showToast(`Redo ${label}`, "info");
            return;
          }
          case "d": {
            e.preventDefault();
            if (!state.selectedNodeId) return;
            const payload = collectCopiedSubtree(state.document, state.selectedNodeId);
            if (!payload) {
              showToast("This node cannot be duplicated", "warning");
              return;
            }
            clipboardSubtreeRef.current = payload;

            let insertedRootId: NodeId | null = null;
            commandStack.execute({
              label: `Duplicate ${payload.nodes[payload.rootId]?.name ?? "Node"}`,
              execute: () => {
                insertedRootId = insertSubtree(payload, {
                  renameRootAsCopy: true,
                  offset: true,
                  rootParentId: payload.rootParentId,
                  selectInserted: true,
                });
              },
              undo: () => {
                if (insertedRootId) {
                  removeSubtree(insertedRootId);
                }
              },
            });
            state.refreshUndoState();
            showToast(`Duplicated ${payload.nodes[payload.rootId]?.name ?? "node"}`, "success");
            return;
          }
          case "c": {
            e.preventDefault();
            if (!state.selectedNodeId) {
              showToast("Nothing selected to copy", "info");
              return;
            }
            const payload = collectCopiedSubtree(state.document, state.selectedNodeId);
            if (!payload) {
              showToast("This node cannot be copied", "warning");
              return;
            }
            clipboardSubtreeRef.current = payload;
            showToast(`Copied ${payload.nodes[payload.rootId]?.name ?? "node"}`, "info");
            return;
          }
          case "v": {
            e.preventDefault();
            const payload = clipboardSubtreeRef.current;
            if (!payload) {
              showToast("Clipboard is empty", "info");
              return;
            }
            let insertedRootId: NodeId | null = null;
            commandStack.execute({
              label: `Paste ${payload.nodes[payload.rootId]?.name ?? "Node"}`,
              execute: () => {
                insertedRootId = insertSubtree(payload, {
                  renameRootAsCopy: true,
                  offset: true,
                  rootParentId: payload.rootParentId,
                  selectInserted: true,
                });
              },
              undo: () => {
                if (insertedRootId) {
                  removeSubtree(insertedRootId);
                }
              },
            });
            state.refreshUndoState();
            showToast(`Pasted ${payload.nodes[payload.rootId]?.name ?? "node"}`, "success");
            return;
          }
          case "g": {
            e.preventDefault();
            if (e.shiftKey) {
              if (!state.selectedNodeId) return;
              const selectedNode = state.document.nodes[state.selectedNodeId];
              if (!selectedNode || selectedNode.type !== "group") {
                showToast("Select a group to ungroup", "info");
                return;
              }
              const ok = state.ungroupNode(selectedNode.id);
              if (ok) {
                showToast(`Ungrouped ${selectedNode.name}`, "success");
              }
              return;
            }

            const groupId = state.groupSelectedNode();
            if (!groupId) {
              showToast("Select a node to group", "info");
              return;
            }
            const groupNode = useEditorStore.getState().document.nodes[groupId];
            showToast(`Created ${groupNode?.name ?? "group"}`, "success");
            return;
          }
          case "s": {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("editor:save-project"));
            return;
          }
        }
        return;
      }

      // Non-ctrl shortcuts
      switch (e.key.toLowerCase()) {
        case "1":
          state.setMeshEditMode("object");
          showToast("Object mode", "info");
          break;
        case "2":
          state.setMeshEditMode("vertex");
          showToast("Vertex mode", "info");
          break;
        case "3":
          state.setMeshEditMode("edge");
          showToast("Edge mode", "info");
          break;
        case "4":
          state.setMeshEditMode("face");
          showToast("Face mode", "info");
          break;
        case "v":
          state.setToolMode("select");
          break;
        case "w":
          state.setToolMode("translate");
          break;
        case "e":
          state.setToolMode("rotate");
          break;
        case "r":
          state.setToolMode("scale");
          break;
        case "g":
          state.toggleGrid();
          break;
        case "f":
          if (state.selectedNodeId) {
            const node = state.document.nodes[state.selectedNodeId];
            backend?.frameBounds(node?.runtimeObjectUuid);
          } else {
            backend?.frameBounds();
          }
          break;
        case "delete":
        case "backspace":
          if (state.selectedNodeId) {
            const node = state.document.nodes[state.selectedNodeId];
            if (!node) return;
            const deletedPayload = collectCopiedSubtree(state.document, node.id);
            if (!deletedPayload) return;
            let activeDeletedRootId: NodeId = node.id;

            commandStack.execute({
              label: `Delete ${node.name}`,
              execute: () => {
                removeSubtree(activeDeletedRootId);
              },
              undo: () => {
                const restoredRootId = insertSubtree(deletedPayload, {
                  renameRootAsCopy: false,
                  offset: false,
                  preserveIds: true,
                  rootParentId: deletedPayload.rootParentId,
                  selectInserted: true,
                });
                if (restoredRootId) {
                  activeDeletedRootId = restoredRootId;
                  showToast(
                    `Restored ${deletedPayload.nodes[deletedPayload.rootId]?.name ?? "node"}`,
                    "info"
                  );
                }
              },
            });
            state.refreshUndoState();
          }
          break;
        case "escape":
          state.selectNode(null);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isStartupIntroOpen) return;

    const handleEscapeIntro = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismissStartupIntro();
      }
    };

    window.addEventListener("keydown", handleEscapeIntro);
    return () => window.removeEventListener("keydown", handleEscapeIntro);
  }, [dismissStartupIntro, isStartupIntroOpen]);

  useEffect(() => {
    const handleSaveProject = () => {
      void saveCurrentProject();
    };

    const handleOpenProjectLoader = () => {
      openProjectLoader();
    };

    window.addEventListener("editor:save-project", handleSaveProject);
    window.addEventListener("editor:open-project-loader", handleOpenProjectLoader);

    return () => {
      window.removeEventListener("editor:save-project", handleSaveProject);
      window.removeEventListener(
        "editor:open-project-loader",
        handleOpenProjectLoader
      );
    };
  }, [openProjectLoader, saveCurrentProject]);

  useEffect(() => {
    if (!isProjectLoaderOpen) return;

    const handleEscapeLoader = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeProjectLoader();
      }
    };

    window.addEventListener("keydown", handleEscapeLoader);
    return () => window.removeEventListener("keydown", handleEscapeLoader);
  }, [closeProjectLoader, isProjectLoaderOpen]);

  // Handle file import event
  useEffect(() => {
    const handleImport = async (e: Event) => {
      const file = (e as CustomEvent).detail?.file as File | undefined;
      if (!file || !backend) return;

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const isProjectJson =
        ext === "json" || file.name.toLowerCase().endsWith(".multiview.json");

      try {
        if (isProjectJson) {
          await loadProjectFromFile(file);
          return;
        }

        const url = URL.createObjectURL(file);
        try {
          let result;
          if (ext === "fbx") {
            result = await backend.loadFBX(url);
          } else if (ext === "obj") {
            result = await backend.loadOBJ(url);
          } else {
            result = await backend.loadGLTF(url);
          }

          result.nodeMap.forEach((info) => {
            addSceneNode({
              name: info.name,
              type:
                info.type === "Mesh" || info.type === "SkinnedMesh"
                  ? "mesh"
                  : "group",
              runtimeObjectUuid: info.uuid,
              mesh:
                info.type === "Mesh" || info.type === "SkinnedMesh"
                  ? { geometryType: "imported" }
                  : undefined,
            });
          });

          backend.frameBounds(result.rootObjectUuid);
          showToast(`Imported ${file.name}`, "success");
        } finally {
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        console.error(`Failed to import ${ext}:`, err);
        showToast(`Failed to import ${file.name}`, "error");
      }
    };

    window.addEventListener("editor:import-file", handleImport);
    return () => window.removeEventListener("editor:import-file", handleImport);
  }, [addSceneNode, loadProjectFromFile]);

  // ── Handle add primitive event ──
  useEffect(() => {
    const handleAddPrimitive = (e: Event) => {
      const type = (e as CustomEvent).detail?.type as string;
      if (!type || !backend) return;

      const state = useEditorStore.getState();
      const count = Object.keys(state.document.nodes).length;
      const name = `${type.charAt(0).toUpperCase() + type.slice(1)}_${count + 1}`;

      const result = backend.addPrimitive(type, name);
      const transform = backend.getObjectTransform(result.uuid);

      const nodeId = addSceneNode({
        name,
        type: "mesh",
        runtimeObjectUuid: result.uuid,
        transform: transform ?? undefined,
        mesh: { geometryType: type as any },
      });

      selectNode(nodeId);
      showToast(`Added ${name}`, "info");
    };

    window.addEventListener("editor:add-primitive", handleAddPrimitive);

    // ── Add Shape (Star/Heart/Arrow) ──
    const handleAddShape = (e: Event) => {
      const { shapeType } = (e as CustomEvent).detail;
      if (!backend) return;

      const state = useEditorStore.getState();
      const count = Object.keys(state.document.nodes).length;
      const name = `${shapeType.charAt(0).toUpperCase() + shapeType.slice(1)}_${count + 1}`;

      const result = backend.addExtrudedShape(shapeType, name);
      const transform = backend.getObjectTransform(result.uuid);

      const nodeId = addSceneNode({
        name,
        type: "mesh",
        runtimeObjectUuid: result.uuid,
        transform: transform ?? undefined,
        mesh: { geometryType: shapeType as any },
      });

      selectNode(nodeId);
      showToast(`Added ${name}`, "info");
    };
    window.addEventListener("editor:add-shape", handleAddShape);

    // ── Add 3D Text ──
    const handleAddText3D = async (e: Event) => {
      const { text } = (e as CustomEvent).detail;
      if (!backend || !text) return;

      const state = useEditorStore.getState();
      const count = Object.keys(state.document.nodes).length;
      const name = `Text3D_${count + 1}`;

      try {
        const result = await backend.addText3D(text, name);
        const transform = backend.getObjectTransform(result.uuid);

        const nodeId = addSceneNode({
          name,
          type: "mesh",
          runtimeObjectUuid: result.uuid,
          transform: transform ?? undefined,
          mesh: { geometryType: "text3d" as any, text3dContent: text, text3dSize: 0.5, text3dDepth: 0.2, text3dBevel: true },
        });

        selectNode(nodeId);
        showToast(`Added 3D Text: "${text}"`, "info");
      } catch (err) {
        showToast("Failed to create 3D text", "error");
      }
    };
    window.addEventListener("editor:add-text3d", handleAddText3D);

    // ── Boolean Operation ──
    const handleBooleanOp = (e: Event) => {
      const { objectAUuid, objectBUuid, operation, nodeAId, nodeBId } = (e as CustomEvent).detail;
      if (!backend) return;

      const state = useEditorStore.getState();
      const count = Object.keys(state.document.nodes).length;
      const resultName = `Boolean_${operation}_${count + 1}`;

      const result = backend.booleanOp(objectAUuid, objectBUuid, operation, resultName);
      if (!result) {
        showToast("Boolean operation failed", "error");
        return;
      }

      const transform = backend.getObjectTransform(result.uuid);

      // Remove source nodes from document
      const doc = structuredClone(state.document);
      delete doc.nodes[nodeAId];
      delete doc.nodes[nodeBId];
      useEditorStore.getState().updateDocument(doc);

      const nodeId = addSceneNode({
        name: resultName,
        type: "mesh",
        runtimeObjectUuid: result.uuid,
        transform: transform ?? undefined,
        mesh: { geometryType: "box" as any },
      });

      selectNode(nodeId);
      showToast(`Boolean ${operation} completed`, "info");
    };
    window.addEventListener("editor:boolean-op", handleBooleanOp);

    // ── Cloner ──
    const handleCloner = (e: Event) => {
      const { sourceUuid, sourceNodeId, mode, opts } = (e as CustomEvent).detail;
      if (!backend) return;

      const state = useEditorStore.getState();
      const count = Object.keys(state.document.nodes).length;
      const name = `Cloner_${mode}_${count + 1}`;

      const result = backend.addCloner(sourceUuid, mode, name, opts);
      if (!result) {
        showToast("Cloner failed — select a mesh first", "error");
        return;
      }

      const transform = backend.getObjectTransform(result.uuid);

      const nodeId = addSceneNode({
        name,
        type: "mesh",
        runtimeObjectUuid: result.uuid,
        transform: transform ?? undefined,
        mesh: { geometryType: "cloner" as any },
        clonerConfig: { sourceNodeId, mode, opts },
      });

      selectNode(nodeId);
      showToast(`Created ${mode} cloner`, "info");
    };
    window.addEventListener("editor:cloner", handleCloner);

    // ── Update Cloner (regenerate with new params) ──
    const handleUpdateCloner = (e: Event) => {
      const { nodeId, opts } = (e as CustomEvent).detail;
      if (!backend || !nodeId) return;

      const state = useEditorStore.getState();
      const node = state.document.nodes[nodeId];
      const config = node?.clonerConfig;
      if (!node || !config) return;

      const sourceNode = state.document.nodes[config.sourceNodeId];
      const sourceUuid = sourceNode?.runtimeObjectUuid;
      if (!sourceUuid) {
        showToast("Source mesh was deleted — cannot update cloner", "error");
        return;
      }

      const currentUuid = node.runtimeObjectUuid;
      if (!currentUuid) return;

      const currentTransform = node.transform;
      backend.removeObject(currentUuid);

      const result = backend.addCloner(sourceUuid, config.mode, node.name, opts);
      if (!result) return;

      backend.setObjectTransform(result.uuid, currentTransform);

      const doc = structuredClone(state.document);
      doc.nodes[nodeId] = {
        ...doc.nodes[nodeId]!,
        runtimeObjectUuid: result.uuid,
        clonerConfig: { ...config, opts },
      };
      useEditorStore.getState().updateDocument(doc);
      selectNode(nodeId);
      showToast("Cloner updated", "info");
    };
    window.addEventListener("editor:update-cloner", handleUpdateCloner);

    return () => {
      window.removeEventListener("editor:add-primitive", handleAddPrimitive);
      window.removeEventListener("editor:add-shape", handleAddShape);
      window.removeEventListener("editor:add-text3d", handleAddText3D);
      window.removeEventListener("editor:boolean-op", handleBooleanOp);
      window.removeEventListener("editor:cloner", handleCloner);
      window.removeEventListener("editor:update-cloner", handleUpdateCloner);
    };
  }, [addSceneNode, selectNode]);

  // ── Poly Edit Mode + Operations (Extrude / Bevel) ──
  useEffect(() => {
    const persistEditedGeometry = (nodeId: NodeId, runtimeUuid: string): boolean => {
      if (!backend) return false;
      const geometryData = backend.getMeshGeometryData(runtimeUuid);
      if (!geometryData) return false;

      const state = useEditorStore.getState();
      const currentNode = state.document.nodes[nodeId];
      if (!currentNode || currentNode.type !== "mesh" || !currentNode.mesh) {
        return false;
      }
      if (currentNode.runtimeObjectUuid !== runtimeUuid) {
        return false;
      }

      const nextDoc = structuredClone(state.document);
      const nextNode = nextDoc.nodes[nodeId];
      if (!nextNode || nextNode.type !== "mesh" || !nextNode.mesh) return false;
      nextNode.mesh = {
        ...nextNode.mesh,
        customGeometry: geometryData,
      };
      state.updateDocument(nextDoc);
      return true;
    };

    const getActiveEditableNode = () => {
      const state = useEditorStore.getState();
      const nodeId = state.selectedNodeId;
      if (!nodeId) return null;
      const node = state.document.nodes[nodeId];
      if (!node || node.type !== "mesh" || !node.mesh || !node.runtimeObjectUuid) {
        return null;
      }
      return {
        nodeId,
        runtimeUuid: node.runtimeObjectUuid,
        selection: state.meshEditSelection,
      };
    };

    const applyMeshCommand = (
      label: string,
      mutate: (runtimeUuid: string, faceIndex: number, amount: number) => boolean,
      amount: number
    ) => {
      if (!backend) return;
      const active = getActiveEditableNode();
      if (!active) {
        showToast("Select a mesh first", "warning");
        return;
      }
      if (useEditorStore.getState().meshEditMode === "object") {
        showToast("Enable Vertex/Edge/Face mode first", "info");
        return;
      }
      const faceIndex = active.selection?.faceIndex;
      if (faceIndex === null || faceIndex === undefined || faceIndex < 0) {
        showToast("Pick a mesh component first", "info");
        return;
      }

      backend.ensureMeshEditable(active.runtimeUuid);

      const before = backend.getMeshGeometryData(active.runtimeUuid);
      if (!before) {
        showToast("Mesh geometry is not editable", "error");
        return;
      }

      const ok = mutate(active.runtimeUuid, faceIndex, amount);
      if (!ok) {
        showToast("Operation failed on selected component", "error");
        return;
      }

      const after = backend.getMeshGeometryData(active.runtimeUuid);
      if (!after) {
        backend.setMeshGeometryData(active.runtimeUuid, before);
        showToast("Could not capture mesh edit result", "error");
        return;
      }

      persistEditedGeometry(active.nodeId, active.runtimeUuid);
      if (active.selection) {
        backend.highlightMeshComponent(active.runtimeUuid, active.selection);
      }

      let skipInitialExecute = true;
      commandStack.execute({
        label,
        execute: () => {
          if (skipInitialExecute) {
            skipInitialExecute = false;
            return;
          }
          if (!backend) return;
          backend.setMeshGeometryData(active.runtimeUuid, after);
          persistEditedGeometry(active.nodeId, active.runtimeUuid);
          const nextSelection = useEditorStore.getState().meshEditSelection;
          if (nextSelection) {
            backend.highlightMeshComponent(active.runtimeUuid, nextSelection);
          }
        },
        undo: () => {
          if (!backend) return;
          backend.setMeshGeometryData(active.runtimeUuid, before);
          persistEditedGeometry(active.nodeId, active.runtimeUuid);
          const nextSelection = useEditorStore.getState().meshEditSelection;
          if (nextSelection) {
            backend.highlightMeshComponent(active.runtimeUuid, nextSelection);
          }
        },
      });
      useEditorStore.getState().refreshUndoState();
    };

    const handleSetMeshEditMode = (e: Event) => {
      const mode = (e as CustomEvent).detail?.mode as
        | "object"
        | "vertex"
        | "edge"
        | "face"
        | undefined;
      if (!mode) return;
      setMeshEditMode(mode);
      clearMeshEditSelection();
      backend?.clearMeshEditHighlight();
    };

    const handleExtrude = (e: Event) => {
      const distance = Number((e as CustomEvent).detail?.distance ?? 0.2);
      applyMeshCommand("Extrude Face", (runtimeUuid, faceIndex, d) => {
        return backend ? backend.extrudeMeshFace(runtimeUuid, faceIndex, d) : false;
      }, distance);
    };

    const handleBevel = (e: Event) => {
      const amount = Number((e as CustomEvent).detail?.amount ?? 0.08);
      applyMeshCommand("Bevel Face", (runtimeUuid, faceIndex, a) => {
        return backend ? backend.bevelMeshFace(runtimeUuid, faceIndex, a) : false;
      }, amount);
    };

    window.addEventListener("editor:set-mesh-edit-mode", handleSetMeshEditMode);
    window.addEventListener("editor:mesh-extrude", handleExtrude);
    window.addEventListener("editor:mesh-bevel", handleBevel);

    return () => {
      window.removeEventListener("editor:set-mesh-edit-mode", handleSetMeshEditMode);
      window.removeEventListener("editor:mesh-extrude", handleExtrude);
      window.removeEventListener("editor:mesh-bevel", handleBevel);
    };
  }, [clearMeshEditSelection, setMeshEditMode]);

  // ── Handle transform updates from Inspector ──
  useEffect(() => {
    const handleUpdateTransform = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.uuid || !backend) return;

      const state = useEditorStore.getState();
      const node = state.document.nodes[detail.nodeId];
      if (node) {
        backend.setObjectTransform(detail.uuid, node.transform);
      }
    };

    window.addEventListener("editor:update-transform", handleUpdateTransform);
    return () =>
      window.removeEventListener("editor:update-transform", handleUpdateTransform);
  }, []);

  // ── Handle remove object event ──
  useEffect(() => {
    const handleRemove = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.uuid) {
        backend?.removeObject(detail.uuid);
      }
    };

    window.addEventListener("editor:remove-object", handleRemove);
    return () =>
      window.removeEventListener("editor:remove-object", handleRemove);
  }, []);

  // ── Handle physics (rigid body) ──
  useEffect(() => {
    const handleSetPhysics = (e: Event) => {
      const { uuid, enabled, mass, gravityScale } = (e as CustomEvent).detail ?? {};
      if (!uuid || !backend) return;
      if (enabled) {
        backend.addPhysicsBody(uuid, mass ?? 1, gravityScale ?? 1);
      } else {
        backend.removePhysicsBody(uuid);
      }
    };

    window.addEventListener("editor:set-physics", handleSetPhysics);
    return () =>
      window.removeEventListener("editor:set-physics", handleSetPhysics);
  }, []);

  // ── Sync physics from document (e.g. when selection or doc changes) ──
  useEffect(() => {
    if (!backend) return;
    const doc = useEditorStore.getState().document;
    for (const node of Object.values(doc.nodes)) {
      const uuid = node.runtimeObjectUuid;
      if (!uuid) continue;
      const rb = node.rigidBody;
      if (rb?.enabled) {
        backend.addPhysicsBody(uuid, rb.mass, rb.gravityScale ?? 1);
      } else {
        backend.removePhysicsBody(uuid);
      }
    }
  }, [document]);

  // Sync per-node visibility from document state to runtime objects.
  useEffect(() => {
    if (!backend) return;

    const previous = visibilitySyncRef.current;
    const next = new Map<NodeId, { visible: boolean; runtimeObjectUuid?: string }>();

    for (const node of Object.values(document.nodes)) {
      const runtimeObjectUuid = node.runtimeObjectUuid;
      const previousState = previous.get(node.id);
      const changed =
        !previousState ||
        previousState.visible !== node.visible ||
        previousState.runtimeObjectUuid !== runtimeObjectUuid;

      if (changed && runtimeObjectUuid) {
        backend.setObjectVisibility(runtimeObjectUuid, node.visible);
      }

      next.set(node.id, {
        visible: node.visible,
        runtimeObjectUuid,
      });
    }

    visibilitySyncRef.current = next;
  }, [document.nodes]);

  // ── Add Particle Emitter ──
  useEffect(() => {
    const handleAddParticleEmitter = (e: Event) => {
      const { config } = (e as CustomEvent).detail ?? {};
      if (!backend || !config) return;

      const state = useEditorStore.getState();
      const count = Object.keys(state.document.nodes).length;
      const name = `ParticleEmitter_${count + 1}`;

      const result = backend.addParticleEmitter(config, name);
      const transform = backend.getObjectTransform(result.uuid);

      const nodeId = addSceneNode({
        name,
        type: "particleEmitter",
        runtimeObjectUuid: result.uuid,
        transform: transform ?? undefined,
        particleEmitter: config,
      });

      selectNode(nodeId);
      showToast("Added particle emitter", "info");
    };

    window.addEventListener("editor:add-particle-emitter", handleAddParticleEmitter);
    return () =>
      window.removeEventListener("editor:add-particle-emitter", handleAddParticleEmitter);
  }, [addSceneNode, selectNode]);

  // ── Update Particle Emitter config ──
  useEffect(() => {
    const handleUpdateParticleEmitter = (e: Event) => {
      const { uuid, config } = (e as CustomEvent).detail ?? {};
      if (!backend || !uuid || !config) return;
      backend.updateParticleEmitterConfig(uuid, config);
    };

    window.addEventListener("editor:update-particle-emitter", handleUpdateParticleEmitter);
    return () =>
      window.removeEventListener("editor:update-particle-emitter", handleUpdateParticleEmitter);
  }, []);

  // ── Export Screenshot ──
  useEffect(() => {
    const handleExportScreenshot = () => {
      if (!backend) return;
      const dataUrl = backend.captureScreenshot("image/png");
      const a = window.document.createElement("a");
      a.href = dataUrl;
      a.download = `${useEditorStore.getState().document.projectName.replace(/\s+/g, "_")}_screenshot.png`;
      a.click();
      showToast("Screenshot saved", "success");
    };
    window.addEventListener("editor:export-screenshot", handleExportScreenshot);
    return () => window.removeEventListener("editor:export-screenshot", handleExportScreenshot);
  }, []);

  // ── Export GLB ──
  useEffect(() => {
    const handleExportGLB = async () => {
      if (!backend) return;
      try {
        const buffer = await backend.exportToGLB();
        const blob = new Blob([buffer], { type: "model/gltf-binary" });
        triggerBlobDownload(
          blob,
          `${useEditorStore.getState().document.projectName.replace(/\s+/g, "_")}.glb`
        );
        showToast("Exported as GLB", "success");
      } catch (err) {
        console.error("GLB export failed:", err);
        showToast("Failed to export GLB", "error");
      }
    };
    window.addEventListener("editor:export-glb", handleExportGLB);
    return () => window.removeEventListener("editor:export-glb", handleExportGLB);
  }, [triggerBlobDownload]);

  // ── Export Viewer HTML ──
  useEffect(() => {
    const handleExportViewer = () => {
      const payload = buildViewerExportPayload();
      if (!payload) return;

      const blob = new Blob([payload.html], { type: "text/html" });
      triggerBlobDownload(blob, payload.filename);
      showToast("Viewer exported!", "success");
    };
    window.addEventListener("editor:export-viewer", handleExportViewer);
    return () =>
      window.removeEventListener("editor:export-viewer", handleExportViewer);
  }, [buildViewerExportPayload, triggerBlobDownload]);

  useEffect(() => {
    const handleOpenPreview = () => {
      openViewerPreview();
    };
    const handleClosePreview = () => {
      closeViewerPreview();
    };

    window.addEventListener("editor:preview-viewer", handleOpenPreview);
    window.addEventListener("editor:close-viewer-preview", handleClosePreview);
    return () => {
      window.removeEventListener("editor:preview-viewer", handleOpenPreview);
      window.removeEventListener("editor:close-viewer-preview", handleClosePreview);
    };
  }, [closeViewerPreview, openViewerPreview]);

  useEffect(() => {
    if (!viewerPreviewUrl) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeViewerPreview();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeViewerPreview, viewerPreviewUrl]);

  useEffect(() => {
    return () => revokeViewerPreviewUrl();
  }, [revokeViewerPreviewUrl]);

  // ── Add Camera Marker ──
  useEffect(() => {
    const handleAddCamera = (e: Event) => {
      const { label } = (e as CustomEvent).detail ?? {};
      if (!backend || !label) return;

      const state = useEditorStore.getState();
      const count = Object.keys(state.document.nodes).length;
      const name = label || `Camera_${count + 1}`;

      const result = backend.addCameraMarker(name);
      const transform = backend.getObjectTransform(result.uuid);

      const nodeId = addSceneNode({
        name,
        type: "camera",
        runtimeObjectUuid: result.uuid,
        transform: transform ?? undefined,
        cameraData: { fov: 45, label: name },
      });

      selectNode(nodeId);
      showToast(`Added camera: ${name}`, "info");
    };
    window.addEventListener("editor:add-camera-marker", handleAddCamera);
    return () =>
      window.removeEventListener("editor:add-camera-marker", handleAddCamera);
  }, [addSceneNode, selectNode]);

  // ── Fly to Camera ──
  useEffect(() => {
    const handleFlyTo = (e: Event) => {
      const { uuid } = (e as CustomEvent).detail ?? {};
      if (!uuid || !backend) return;
      backend.flyToCamera(uuid);
    };
    window.addEventListener("editor:fly-to-camera", handleFlyTo);
    return () =>
      window.removeEventListener("editor:fly-to-camera", handleFlyTo);
  }, []);

  // ── Handle Text3D updates ──
  useEffect(() => {
    const handleUpdateText3D = async (e: Event) => {
      const { uuid, text, opts } = (e as CustomEvent).detail ?? {};
      if (!uuid || !text || !backend) return;
      await backend.updateText3D(uuid, text, opts);
    };
    window.addEventListener("editor:update-text3d", handleUpdateText3D);
    return () =>
      window.removeEventListener("editor:update-text3d", handleUpdateText3D);
  }, []);

  // ── Handle material events ──
  useEffect(() => {
    const handleGetMaterial = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.uuid || !backend) return;
      const props = backend.getMaterialProps(detail.uuid);
      if (props) {
        window.dispatchEvent(
          new CustomEvent("editor:material-data", { detail: props })
        );
      }
    };

    const handleApplyMaterial = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.uuid || !detail?.props || !backend) return;
      backend.applyMaterial(detail.uuid, detail.props);
    };

    const handleApplyTexture = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.uuid || !detail?.mapType || !backend) return;
      backend.applyTexture(detail.uuid, detail.mapType, detail.url, detail.fileName);
    };

    window.addEventListener("editor:get-material", handleGetMaterial);
    window.addEventListener("editor:apply-material", handleApplyMaterial);
    window.addEventListener("editor:apply-texture", handleApplyTexture);
    return () => {
      window.removeEventListener("editor:get-material", handleGetMaterial);
      window.removeEventListener("editor:apply-material", handleApplyMaterial);
      window.removeEventListener("editor:apply-texture", handleApplyTexture);
    };
  }, []);

  // ── Handle light events ──
  useEffect(() => {
    const handleAddLight = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.kind || !backend) return;

      const state = useEditorStore.getState();
      const count = Object.keys(state.document.nodes).length;
      const name = detail.name ?? `Light_${count + 1}`;

      const result = backend.addLight(detail.kind, name);
      const transform = backend.getObjectTransform(result.uuid);

      const nodeId = state.addSceneNode({
        name,
        type: "light",
        runtimeObjectUuid: result.uuid,
        transform: transform ?? undefined,
        light: {
          kind: detail.kind,
          color: "#ffffff",
          intensity: 1,
          castShadow: detail.kind !== "ambient",
        },
      });

      state.selectNode(nodeId);
      showToast(`Added ${name}`, "info");
    };

    const handleGetLight = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.uuid || !backend) return;
      const props = backend.getLightProps(detail.uuid);
      if (props) {
        window.dispatchEvent(
          new CustomEvent("editor:light-data", { detail: props })
        );
      }
    };

    const handleUpdateLight = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.uuid || !detail?.props || !backend) return;
      backend.updateLight(detail.uuid, detail.props);
    };

    window.addEventListener("editor:add-light", handleAddLight);
    window.addEventListener("editor:get-light", handleGetLight);
    window.addEventListener("editor:update-light", handleUpdateLight);
    return () => {
      window.removeEventListener("editor:add-light", handleAddLight);
      window.removeEventListener("editor:get-light", handleGetLight);
      window.removeEventListener("editor:update-light", handleUpdateLight);
    };
  }, []);

  // ── Handle scene settings events ──
  useEffect(() => {
    const handleApplySettings = (e: Event) => {
      const settings = (e as CustomEvent).detail;
      if (settings && backend) {
        backend.applySceneSettings(settings);
      }
    };

    window.addEventListener("editor:apply-scene-settings", handleApplySettings);
    return () =>
      window.removeEventListener("editor:apply-scene-settings", handleApplySettings);
  }, []);

  // Keep viewport background mode in sync even if settings are updated from outside ScenePanel events.
  useEffect(() => {
    if (!backend) return;
    backend.applySceneSettings(document.sceneSettings);
  }, [document.sceneSettings.backgroundType, document.sceneSettings.backgroundColor]);

  // ── Handle HDRI events ──
  useEffect(() => {
    const handleLoadHDRI = async (e: Event) => {
      const { url, isEXR } = (e as CustomEvent).detail ?? {};
      if (url && backend) {
        try {
          await backend.loadHDRI(url, isEXR ?? false);
        } catch (err) {
          console.error("Failed to load HDRI:", err);
          showToast("Failed to load HDRI", "error");
        }
      }
    };

    const handleClearHDRI = () => {
      backend?.clearEnvironment();
    };

    window.addEventListener("editor:load-hdri", handleLoadHDRI);
    window.addEventListener("editor:clear-hdri", handleClearHDRI);
    return () => {
      window.removeEventListener("editor:load-hdri", handleLoadHDRI);
      window.removeEventListener("editor:clear-hdri", handleClearHDRI);
    };
  }, []);

  // ── Handle camera preset events ──
  useEffect(() => {
    const handlePreset = (e: Event) => {
      const preset = (e as CustomEvent).detail?.preset;
      if (preset && backend) {
        backend.setCameraPreset(preset);
      }
    };

    window.addEventListener("editor:camera-preset", handlePreset);
    return () =>
      window.removeEventListener("editor:camera-preset", handlePreset);
  }, []);

  // ── Handle timeline control events ──
  useEffect(() => {
    const handlePlay = () => {
      if (!timelineRuntime) return;
      // Ensure the active clip is loaded
      const tl = useEditorStore.getState().document.timeline;
      const activeClip = tl.clips.find((c) => c.id === tl.activeClipId);
      if (activeClip && timelineRuntime.clip?.id !== activeClip.id) {
        timelineRuntime.setClip(activeClip);
      }
      timelineRuntime.play();
    };

    const handlePause = () => timelineRuntime?.pause();
    const handleStop = () => timelineRuntime?.stop();

    const handleSeek = (e: Event) => {
      const time = (e as CustomEvent).detail?.time;
      if (time !== undefined && timelineRuntime) {
        // Make sure clip is loaded
        const tl = useEditorStore.getState().document.timeline;
        const activeClip = tl.clips.find((c) => c.id === tl.activeClipId);
        if (activeClip && !timelineRuntime.clip) {
          timelineRuntime.setClip(activeClip);
        }
        timelineRuntime.seek(time);
      }
    };

    const handleSetClip = (e: Event) => {
      const clipId = (e as CustomEvent).detail?.clipId;
      if (!clipId || !timelineRuntime) return;
      const tl = useEditorStore.getState().document.timeline;
      const clip = tl.clips.find((c) => c.id === clipId);
      if (clip) timelineRuntime.setClip(clip);
    };

    window.addEventListener("timeline:play", handlePlay);
    window.addEventListener("timeline:pause", handlePause);
    window.addEventListener("timeline:stop", handleStop);
    window.addEventListener("timeline:seek", handleSeek);
    window.addEventListener("timeline:set-clip", handleSetClip);
    return () => {
      window.removeEventListener("timeline:play", handlePlay);
      window.removeEventListener("timeline:pause", handlePause);
      window.removeEventListener("timeline:stop", handleStop);
      window.removeEventListener("timeline:seek", handleSeek);
      window.removeEventListener("timeline:set-clip", handleSetClip);
    };
  }, []);

  // ── Handle preview-state event from InteractionsPanel ──
  useEffect(() => {
    const handlePreviewState = (e: Event) => {
      const { nodeId, stateId } = (e as CustomEvent).detail ?? {};
      if (!nodeId || !stateId || !interactionRuntime) return;

      const doc = useEditorStore.getState().document;
      const node = doc.nodes[nodeId];
      if (!node?.interactions) return;

      const state = node.interactions.states.find((s) => s.id === stateId);
      if (state) {
        interactionRuntime.transitionToState(node, state, 400, "easeInOut");
      }
    };

    window.addEventListener("editor:preview-state", handlePreviewState);
    return () =>
      window.removeEventListener("editor:preview-state", handlePreviewState);
  }, []);

  // ── Stats overlay ──
  const [stats, setStats] = useState<{
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
  } | null>(null);

  useEffect(() => {
    if (!showStats) {
      setStats(null);
      return;
    }
    const interval = setInterval(() => {
      if (backend) setStats(backend.getStats());
    }, 500);
    return () => clearInterval(interval);
  }, [showStats]);

  return (
    <div
      className={`viewport-container${
        isTransparentViewport ? " viewport-transparent" : ""
      }`}
    >
      <canvas
        ref={canvasRef}
        className="viewport-canvas"
        onClick={handleCanvasClick}
        onDoubleClick={handleCanvasDoubleClick}
        onMouseMove={handleCanvasMouseMove}
      />
      <input
        ref={projectFileInputRef}
        type="file"
        accept=".multiview.json,.json"
        className="viewport-project-file-input"
        onChange={handleProjectFileInputChange}
      />

      {/* Stats overlay */}
      {showStats && stats && (
        <div className="viewport-stats">
          <div className="viewport-stats-row">
            <span>Draw Calls</span>
            <span>{stats.drawCalls}</span>
          </div>
          <div className="viewport-stats-row">
            <span>Triangles</span>
            <span>{stats.triangles.toLocaleString()}</span>
          </div>
          <div className="viewport-stats-row">
            <span>Geometries</span>
            <span>{stats.geometries}</span>
          </div>
          <div className="viewport-stats-row">
            <span>Textures</span>
            <span>{stats.textures}</span>
          </div>
        </div>
      )}

      {/* Snap indicator */}
      {snapEnabled && (
        <div className="viewport-snap-indicator">
          <span>Snap: {snapValue}</span>
        </div>
      )}

      {isStartupIntroOpen && (
        <div
          className="viewport-startup-overlay"
          onMouseDown={dismissStartupIntro}
          role="presentation"
        >
          <section
            className="viewport-startup-card"
            role="dialog"
            aria-modal="false"
            aria-label="MultiView intro and updates"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="viewport-startup-header">
              <div className="viewport-startup-brand">
                <img
                  src="/assets/Logo.png"
                  alt="MultiVIEW"
                  className="viewport-startup-logo"
                />
                <div className="viewport-startup-heading">
                  <h2>What is new</h2>
                  <p>
                    Version <strong>{appVersion}</strong> is ready. Pick the doc path
                    that fits your workflow and start from there.
                  </p>
                </div>
              </div>
              <button
                className="viewport-startup-close-btn"
                onClick={dismissStartupIntro}
              >
                Start editing
              </button>
            </header>

            <div className="viewport-startup-grid">
              <section className="viewport-startup-panel">
                <h3>Latest updates</h3>
                <ul className="viewport-startup-list">
                  {INTRO_RELEASE_NOTES.map((entry) => (
                    <li key={entry.title} className="viewport-startup-list-item">
                      <strong>{entry.title}</strong>
                      <span>{entry.detail}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="viewport-startup-panel">
                <h3>What's coming next</h3>
                <ul className="viewport-startup-list">
                  {INTRO_COMING_NEXT.map((entry) => (
                    <li key={entry.title} className="viewport-startup-list-item">
                      <div className="viewport-startup-list-heading">
                        <strong>{entry.title}</strong>
                        <span className="viewport-startup-list-chip">{entry.stage}</span>
                      </div>
                      <span>{entry.detail}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <footer className="viewport-startup-footer">
              Click anywhere in the viewport outside this window to close it.
            </footer>
          </section>
        </div>
      )}

      {isProjectLoaderOpen && (
        <div
          className="viewport-project-loader-overlay"
          onMouseDown={closeProjectLoader}
          role="presentation"
        >
          <section
            className="viewport-project-loader-card"
            role="dialog"
            aria-modal="false"
            aria-label="Load project"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="viewport-project-loader-header">
              <div className="viewport-project-loader-heading">
                <h2>Load Project</h2>
                <p>
                  Open saved MultiView projects, known file locations, or load a
                  JSON project from your computer.
                </p>
              </div>
              <div className="viewport-project-loader-actions">
                <button
                  className="viewport-project-loader-btn"
                  onClick={() => void refreshProjectLoaderData()}
                  disabled={isProjectLoaderBusy}
                >
                  Refresh
                </button>
                <button
                  className="viewport-project-loader-btn viewport-project-loader-btn-close"
                  onClick={closeProjectLoader}
                >
                  Close
                </button>
              </div>
            </header>

            {projectLoaderError && (
              <p className="viewport-project-loader-error">{projectLoaderError}</p>
            )}

            <section className="viewport-project-loader-section">
              <div className="viewport-project-loader-section-title">
                <h3>Saved in MultiView</h3>
                <span>{savedProjects.length}</span>
              </div>
              {savedProjects.length > 0 ? (
                <div className="viewport-project-loader-grid">
                  {savedProjects.map((project) => (
                    <button
                      key={project.key}
                      className="viewport-project-loader-tile"
                      onClick={() => void handleLoadSavedProject(project)}
                    >
                      <div className="viewport-project-loader-preview">
                        {project.previewDataUrl ? (
                          <img
                            src={project.previewDataUrl}
                            alt={`${project.name} preview`}
                          />
                        ) : (
                          <span>No preview</span>
                        )}
                      </div>
                      <div className="viewport-project-loader-meta">
                        <strong>{project.name || "Untitled project"}</strong>
                        <span>Saved {formatDateTime(project.savedAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="viewport-project-loader-empty">
                  No internal saved projects yet. Use Save to create your first slot.
                </p>
              )}
            </section>

            {supportsFileSystemAccess ? (
              <section className="viewport-project-loader-section">
                <div className="viewport-project-loader-section-title">
                  <h3>Known files</h3>
                  <span>{knownProjectFiles.length}</span>
                </div>
                {knownProjectFiles.length > 0 ? (
                  <div className="viewport-project-loader-grid">
                    {knownProjectFiles.map((fileItem) => (
                      <button
                        key={fileItem.id}
                        className="viewport-project-loader-tile"
                        onClick={() => void handleLoadKnownProjectFile(fileItem)}
                      >
                        <div className="viewport-project-loader-preview">
                          {fileItem.previewDataUrl ? (
                            <img
                              src={fileItem.previewDataUrl}
                              alt={`${fileItem.name} preview`}
                            />
                          ) : (
                            <span>No preview</span>
                          )}
                        </div>
                        <div className="viewport-project-loader-meta">
                          <strong>{fileItem.name}</strong>
                          <span>Opened {formatDateTime(fileItem.lastOpenedAt)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="viewport-project-loader-empty">
                    No known files yet. Load one from your computer to add it here.
                  </p>
                )}
              </section>
            ) : (
              <p className="viewport-project-loader-empty">
                Known file locations are not supported in this browser.
              </p>
            )}

            <footer className="viewport-project-loader-footer">
              <button
                className="viewport-project-loader-btn viewport-project-loader-btn-primary"
                onClick={() => void handleLoadProjectFromComputer()}
              >
                Load from computer
              </button>
            </footer>
          </section>
        </div>
      )}

      {viewerPreviewUrl && (
        <div className="viewport-viewer-preview">
          <div className="viewport-viewer-preview-shell">
            <div className="viewport-viewer-preview-header">
              <div className="viewport-viewer-preview-text">
                <strong>Viewer Export Preview</strong>
                <span>
                  Renders the exact exported HTML inside an iframe so you can verify
                  materials, lights, and interactions.
                </span>
              </div>
              <div className="viewport-viewer-preview-actions">
                <button
                  className="viewport-viewer-preview-btn"
                  onClick={openViewerPreview}
                >
                  Refresh
                </button>
                <button
                  className="viewport-viewer-preview-btn viewport-viewer-preview-btn-close"
                  onClick={closeViewerPreview}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="viewport-viewer-preview-frame-wrap">
              <iframe
                title="Viewer export preview"
                src={viewerPreviewUrl}
                className="viewport-viewer-preview-frame"
                loading="eager"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
