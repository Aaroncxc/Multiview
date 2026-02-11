// ============================================================
// Scene Rebuilder — Restore 3D scene from document (project load)
// Creates objects in backend and maps new runtimeObjectUuids to nodes
// ============================================================

import type { SceneDocument, SceneNode } from "../document/types";
import { flattenTree } from "../document/sceneDocument";
import type { ThreeBackend } from "../engine/threeBackend";

export async function rebuildSceneFromDocument(
  backend: ThreeBackend,
  doc: SceneDocument
): Promise<SceneDocument> {
  backend.clearAllUserObjects();

  const nodeIdToUuid = new Map<string, string>();
  const updatedDoc = structuredClone(doc);
  const nodes = flattenTree(doc);
  const clonerNodes = nodes.filter((n) => n.clonerConfig);
  const nonClonerNodes = nodes.filter((n) => !n.clonerConfig);

  // 1. Create non-cloner objects first
  for (const node of nonClonerNodes) {
    let uuid: string | null = null;

    if (node.type === "mesh" && node.mesh) {
      const geomType = node.mesh.geometryType;

      if (geomType === "text3d") {
        const text = node.mesh.text3dContent ?? "Hello";
        const size = node.mesh.text3dSize ?? 0.5;
        const depth = node.mesh.text3dDepth ?? 0.2;
        const bevel = node.mesh.text3dBevel ?? true;
        const result = await backend.addText3D(node.name, text, {
          size,
          depth,
          bevel,
        });
        uuid = result.uuid;
      } else if (geomType === "star" || geomType === "heart" || geomType === "arrow") {
        const result = backend.addExtrudedShape(geomType, node.name);
        uuid = result.uuid;
      } else if (geomType === "cloner" || !geomType) {
        // Cloner: created in step 2
        continue;
      } else if (geomType === "imported") {
        const result = backend.addPrimitive("box", node.name + " (placeholder)");
        uuid = result.uuid;
      } else {
        // Primitive
        const result = backend.addPrimitive(geomType!, node.name);
        uuid = result.uuid;
      }
    } else if (node.type === "light" && node.light) {
      const result = backend.addLight(node.light.kind, node.name, node.light);
      uuid = result.uuid;
    } else if (node.type === "camera") {
      const result = backend.addCameraMarker(
        node.cameraData?.label ?? node.name
      );
      uuid = result.uuid;
    } else if (node.type === "particleEmitter" && node.particleEmitter) {
      const result = backend.addParticleEmitter(node.particleEmitter, node.name);
      uuid = result.uuid;
    }

    if (uuid) {
      nodeIdToUuid.set(node.id, uuid);
      backend.setObjectTransform(uuid, node.transform);
      backend.setObjectVisibility(uuid, node.visible);

      const nodeInDoc = updatedDoc.nodes[node.id];
      if (nodeInDoc) nodeInDoc.runtimeObjectUuid = uuid;
    }
  }

  // 2. Create cloners (need source UUID)
  for (const node of clonerNodes) {
    const config = node.clonerConfig;
    if (!config || node.type !== "mesh") continue;

    const sourceUuid = nodeIdToUuid.get(config.sourceNodeId);
    if (!sourceUuid) continue;

    const opts = config.opts ?? {};
    const result = backend.addCloner(
      sourceUuid,
      config.mode,
      node.name,
      opts
    );
    if (!result) continue;

    nodeIdToUuid.set(node.id, result.uuid);
    backend.setObjectTransform(result.uuid, node.transform);
    backend.setObjectVisibility(result.uuid, node.visible);

    const nodeInDoc = updatedDoc.nodes[node.id];
    if (nodeInDoc) nodeInDoc.runtimeObjectUuid = result.uuid;
  }

  return updatedDoc;
}
