// ============================================================
// Scene Document Operations — CRUD for the scene graph
// ============================================================

import { v4 as uuid } from "uuid";
import {
  DEFAULT_SCENE_SETTINGS,
  DEFAULT_TIMELINE,
  type SceneDocument,
  type SceneNode,
  type NodeId,
  type NodeType,
  type Transform,
  type PBRMaterial,
  type MaterialId,
} from "./types";

// ── Factory ──

export function createEmptyDocument(name = "Untitled"): SceneDocument {
  return {
    version: 1,
    projectName: name,
    nodes: {},
    rootIds: [],
    materials: {},
    sceneSettings: structuredClone(DEFAULT_SCENE_SETTINGS),
    textures: {},
    variables: [],
    timeline: structuredClone(DEFAULT_TIMELINE),
  };
}

// ── Node Operations ──

export interface AddNodeOptions {
  name: string;
  type: NodeType;
  parentId?: NodeId | null;
  transform?: Transform;
}

export function addNode(
  doc: SceneDocument,
  opts: AddNodeOptions
): NodeId {
  const id = uuid();
  const node: SceneNode = {
    id,
    name: opts.name,
    type: opts.type,
    parentId: opts.parentId ?? null,
    children: [],
    transform: opts.transform ?? {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    visible: true,
    locked: false,
  };

  doc.nodes[id] = node;

  if (node.parentId && doc.nodes[node.parentId]) {
    doc.nodes[node.parentId]!.children.push(id);
  } else {
    node.parentId = null;
    doc.rootIds.push(id);
  }

  return id;
}

export function removeNode(doc: SceneDocument, nodeId: NodeId): void {
  const node = doc.nodes[nodeId];
  if (!node) return;

  // Recursively remove children first
  for (const childId of [...node.children]) {
    removeNode(doc, childId);
  }

  // Detach from parent
  if (node.parentId && doc.nodes[node.parentId]) {
    const parent = doc.nodes[node.parentId]!;
    parent.children = parent.children.filter((c) => c !== nodeId);
  } else {
    doc.rootIds = doc.rootIds.filter((r) => r !== nodeId);
  }

  delete doc.nodes[nodeId];
}

export function reparentNode(
  doc: SceneDocument,
  nodeId: NodeId,
  newParentId: NodeId | null
): void {
  const node = doc.nodes[nodeId];
  if (!node) return;

  // Prevent parenting to self or descendants
  if (newParentId === nodeId) return;
  if (newParentId && isDescendantOf(doc, newParentId, nodeId)) return;

  // Remove from old parent
  if (node.parentId && doc.nodes[node.parentId]) {
    const oldParent = doc.nodes[node.parentId]!;
    oldParent.children = oldParent.children.filter((c) => c !== nodeId);
  } else {
    doc.rootIds = doc.rootIds.filter((r) => r !== nodeId);
  }

  // Attach to new parent
  node.parentId = newParentId;
  if (newParentId && doc.nodes[newParentId]) {
    doc.nodes[newParentId]!.children.push(nodeId);
  } else {
    node.parentId = null;
    doc.rootIds.push(nodeId);
  }
}

export function renameNode(
  doc: SceneDocument,
  nodeId: NodeId,
  name: string
): void {
  const node = doc.nodes[nodeId];
  if (node) node.name = name;
}

export function setNodeTransform(
  doc: SceneDocument,
  nodeId: NodeId,
  transform: Partial<Transform>
): void {
  const node = doc.nodes[nodeId];
  if (!node) return;

  if (transform.position) node.transform.position = transform.position;
  if (transform.rotation) node.transform.rotation = transform.rotation;
  if (transform.scale) node.transform.scale = transform.scale;
}

export function setNodeVisibility(
  doc: SceneDocument,
  nodeId: NodeId,
  visible: boolean
): void {
  const node = doc.nodes[nodeId];
  if (node) node.visible = visible;
}

// ── Material Operations ──

export function addMaterial(
  doc: SceneDocument,
  material: PBRMaterial
): void {
  doc.materials[material.id] = material;
}

export function assignMaterial(
  doc: SceneDocument,
  nodeId: NodeId,
  materialId: MaterialId
): void {
  const node = doc.nodes[nodeId];
  if (node && node.mesh) {
    node.mesh.materialId = materialId;
  }
}

// ── Helpers ──

export function isDescendantOf(
  doc: SceneDocument,
  candidateId: NodeId,
  ancestorId: NodeId
): boolean {
  let current = doc.nodes[candidateId];
  while (current) {
    if (current.id === ancestorId) return true;
    current = current.parentId ? doc.nodes[current.parentId] : undefined;
  }
  return false;
}

export function collectSubtreeIds(
  doc: SceneDocument,
  rootId: NodeId
): NodeId[] {
  const result: NodeId[] = [];

  const walk = (nodeId: NodeId) => {
    const node = doc.nodes[nodeId];
    if (!node) return;
    result.push(nodeId);
    for (const childId of node.children) {
      walk(childId);
    }
  };

  walk(rootId);
  return result;
}

export function getNodeDepth(doc: SceneDocument, nodeId: NodeId): number {
  let depth = 0;
  let current = doc.nodes[nodeId];
  while (current?.parentId) {
    depth++;
    current = doc.nodes[current.parentId];
  }
  return depth;
}

export function flattenTree(doc: SceneDocument): SceneNode[] {
  const result: SceneNode[] = [];

  function walk(ids: NodeId[]) {
    for (const id of ids) {
      const node = doc.nodes[id];
      if (node) {
        result.push(node);
        walk(node.children);
      }
    }
  }

  walk(doc.rootIds);
  return result;
}
