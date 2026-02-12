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
import { saveProject, importFromJSON, loadAutoSave } from "../../core/io/projectStorage";
import { rebuildSceneFromDocument } from "../../core/io/sceneRebuilder";
import type { Transform, SceneNode, NodeId } from "../../core/document/types";
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

export const Viewport: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
  const document = useEditorStore((s) => s.document);
  const isTransparentViewport =
    document.sceneSettings.backgroundType === "transparent";
  const [viewerPreviewUrl, setViewerPreviewUrl] = useState<string | null>(null);
  const viewerPreviewUrlRef = useRef<string | null>(null);

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

    // Load autosave if exists (restore last session)
    loadAutoSave().then((savedDoc) => {
      if (!savedDoc || !savedDoc.rootIds?.length || !backend) return;

      const docForRebuild = structuredClone(savedDoc);
      for (const node of Object.values(docForRebuild.nodes)) {
        delete node.runtimeObjectUuid;
      }

      useEditorStore.getState().setDocument(docForRebuild);
      rebuildSceneFromDocument(backend, docForRebuild).then((updatedDoc) => {
        useEditorStore.getState().updateDocument(updatedDoc);
        backend?.applySceneSettings(updatedDoc.sceneSettings);
      });
    });

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
    backend.attachGizmo(uuid);
    backend.highlightSelected(uuid);
  }, [selectedNodeId]);

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

  // ── Handle canvas click → pick & select + fire interaction ──
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!backend) return;
      const result = backend.pick(e.clientX, e.clientY);
      if (result) {
        const state = useEditorStore.getState();
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
    [selectNode]
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

  // ── Handle keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const state = useEditorStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;

      // ── Ctrl shortcuts ──
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
            // Duplicate selected
            if (state.selectedNodeId && backend) {
              const node = state.document.nodes[state.selectedNodeId];
              if (node?.runtimeObjectUuid) {
                const result = backend.duplicateObject(node.runtimeObjectUuid);
                if (result) {
                  const newNodeId = state.addSceneNode({
                    name: node.name + "_copy",
                    type: node.type,
                    runtimeObjectUuid: result.uuid,
                    transform: result.transform,
                    mesh: node.mesh ? { ...node.mesh } : undefined,
                  });
                  state.selectNode(newNodeId);
                  showToast(`Duplicated ${node.name}`, "success");
                }
              }
            }
            return;
          }
          case "s": {
            e.preventDefault();
            saveProject(state.document)
              .then(() => showToast("Project saved", "success"))
              .catch(() => showToast("Failed to save", "error"));
            return;
          }
        }
        return;
      }

      // ── Non-ctrl shortcuts ──
      switch (e.key.toLowerCase()) {
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
            if (node) {
              // Store for undo
              const deletedNode = structuredClone(node);
              const runtimeUuid = node.runtimeObjectUuid;

              commandStack.execute({
                label: `Delete ${node.name}`,
                execute: () => {
                  if (runtimeUuid) backend?.removeObject(runtimeUuid);
                  useEditorStore.getState().removeSceneNode(deletedNode.id);
                },
                undo: () => {
                  // Re-add the node (without runtime — would need re-create primitive)
                  useEditorStore.getState().addSceneNode({
                    name: deletedNode.name,
                    type: deletedNode.type,
                    transform: deletedNode.transform,
                    mesh: deletedNode.mesh,
                  });
                  showToast(`Restored ${deletedNode.name}`, "info");
                },
              });
              state.refreshUndoState();
            }
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

  // ── Handle file import event ──
  useEffect(() => {
    const handleImport = async (e: Event) => {
      const file = (e as CustomEvent).detail?.file as File;
      if (!file || !backend) return;

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const isProjectJson =
        ext === "json" || file.name.toLowerCase().endsWith(".multiview.json");

      try {
        if (isProjectJson) {
          // MultiView project file — rebuild scene from document
          const doc = await importFromJSON(file);
          const { setDocument, updateDocument } = useEditorStore.getState();

          // Strip invalid runtimeObjectUuids before rebuild
          const docForRebuild = structuredClone(doc);
          for (const node of Object.values(docForRebuild.nodes)) {
            delete node.runtimeObjectUuid;
          }

          setDocument(docForRebuild);
          const updatedDoc = await rebuildSceneFromDocument(backend, docForRebuild);
          updateDocument(updatedDoc);
          backend.applySceneSettings(updatedDoc.sceneSettings);

          showToast(`Loaded project: ${doc.projectName}`, "success");
          return;
        }

        const url = URL.createObjectURL(file);
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
            type: info.type === "Mesh" || info.type === "SkinnedMesh" ? "mesh" : "group",
            runtimeObjectUuid: info.uuid,
            mesh:
              info.type === "Mesh" || info.type === "SkinnedMesh"
                ? { geometryType: "imported" }
                : undefined,
          });
        });

        backend.frameBounds(result.rootObjectUuid);
        showToast(`Imported ${file.name}`, "success");
      } catch (err) {
        console.error(`Failed to import ${ext}:`, err);
        showToast(`Failed to import ${file.name}`, "error");
      }
    };

    window.addEventListener("editor:import-file", handleImport);
    return () => window.removeEventListener("editor:import-file", handleImport);
  }, [addSceneNode]);

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
      backend.applyTexture(detail.uuid, detail.mapType, detail.url);
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

      {/* Intro Screen (empty scene) */}
      {Object.keys(document.nodes).length === 0 && (
        <div className="viewport-intro">
          <div className="viewport-intro-content">
            <img
              src="/assets/Logo.png"
              alt="MultiVIEW"
              className="viewport-intro-logo"
            />
            <div className="viewport-intro-subtitle">
              Import a 3D model or add a primitive to begin
            </div>
          </div>
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
