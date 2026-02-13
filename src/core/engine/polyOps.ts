// ============================================================
// Poly Edit Operations - region extrude/bevel on triangle meshes
// ============================================================

import type {
  PolyTopology,
  Vec3,
} from "./polyTopology";
import {
  collectVerticesForFaces,
  computeFaceSelectionCentroidNormal,
  edgeKey,
} from "./polyTopology";

export interface PolyOperationResult {
  nextPositions: number[];
  topFaceIds: number[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vecSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vecCross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function vecDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vecScale(v: Vec3, scalar: number): Vec3 {
  return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
}

function vecLerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function pushTri(target: number[], a: Vec3, b: Vec3, c: Vec3): void {
  target.push(
    a.x,
    a.y,
    a.z,
    b.x,
    b.y,
    b.z,
    c.x,
    c.y,
    c.z
  );
}

function pushTriOriented(
  target: number[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  expectedNormal: Vec3
): void {
  const ab = vecSub(b, a);
  const ac = vecSub(c, a);
  const normal = vecCross(ab, ac);
  if (vecDot(normal, expectedNormal) < 0) {
    pushTri(target, a, c, b);
    return;
  }
  pushTri(target, a, b, c);
}

function vertexKey(v: Vec3): string {
  const qx = Math.round(v.x * 1e6);
  const qy = Math.round(v.y * 1e6);
  const qz = Math.round(v.z * 1e6);
  return `${qx}:${qy}:${qz}`;
}

function readTriVertex(positions: number[], triIndex: number, vertexInTri: 0 | 1 | 2): Vec3 {
  const base = triIndex * 9 + vertexInTri * 3;
  return {
    x: positions[base] ?? 0,
    y: positions[base + 1] ?? 0,
    z: positions[base + 2] ?? 0,
  };
}

function orientAppendedTrianglesAgainstBase(
  basePositions: number[],
  appendPositions: number[]
): number[] {
  if (appendPositions.length === 0) return appendPositions;

  const combined = [...basePositions, ...appendPositions];
  const triCount = Math.floor(combined.length / 9);
  const baseTriCount = Math.floor(basePositions.length / 9);
  if (triCount <= 0) return appendPositions;

  const vertexIdByKey = new Map<string, number>();
  const triVertexIds: Array<[number, number, number]> = [];

  const getVertexId = (v: Vec3): number => {
    const key = vertexKey(v);
    const existing = vertexIdByKey.get(key);
    if (existing !== undefined) return existing;
    const next = vertexIdByKey.size;
    vertexIdByKey.set(key, next);
    return next;
  };

  for (let tri = 0; tri < triCount; tri++) {
    const v0 = getVertexId(readTriVertex(combined, tri, 0));
    const v1 = getVertexId(readTriVertex(combined, tri, 1));
    const v2 = getVertexId(readTriVertex(combined, tri, 2));
    triVertexIds.push([v0, v1, v2]);
  }

  type EdgeUse = { tri: number; a: number; b: number };
  const usesByEdge = new Map<string, EdgeUse[]>();
  const addUse = (tri: number, a: number, b: number) => {
    const key = edgeKey(a, b);
    const list = usesByEdge.get(key);
    const use = { tri, a, b };
    if (list) list.push(use);
    else usesByEdge.set(key, [use]);
  };

  for (let tri = 0; tri < triCount; tri++) {
    const [v0, v1, v2] = triVertexIds[tri]!;
    addUse(tri, v0, v1);
    addUse(tri, v1, v2);
    addUse(tri, v2, v0);
  }

  const neighbors: Array<Array<{ tri: number; parity: 0 | 1 }>> = Array.from(
    { length: triCount },
    () => []
  );

  for (const uses of usesByEdge.values()) {
    if (uses.length < 2) continue;
    for (let i = 0; i < uses.length - 1; i++) {
      for (let j = i + 1; j < uses.length; j++) {
        const a = uses[i]!;
        const b = uses[j]!;
        const sameDirection = a.a === b.a && a.b === b.b;
        const parity: 0 | 1 = sameDirection ? 1 : 0;
        neighbors[a.tri]!.push({ tri: b.tri, parity });
        neighbors[b.tri]!.push({ tri: a.tri, parity });
      }
    }
  }

  const flips: Array<0 | 1 | null> = Array.from({ length: triCount }, () => null);
  const queue: number[] = [];
  for (let tri = 0; tri < baseTriCount; tri++) {
    flips[tri] = 0;
    queue.push(tri);
  }

  const processQueue = () => {
    while (queue.length > 0) {
      const tri = queue.shift()!;
      const triFlip = flips[tri] ?? 0;
      for (const n of neighbors[tri] ?? []) {
        const expected = (triFlip ^ n.parity) as 0 | 1;
        if (flips[n.tri] === null) {
          flips[n.tri] = expected;
          queue.push(n.tri);
        }
      }
    }
  };

  processQueue();
  for (let tri = baseTriCount; tri < triCount; tri++) {
    if (flips[tri] !== null) continue;
    flips[tri] = 0;
    queue.push(tri);
    processQueue();
  }

  const oriented = [...appendPositions];
  const swapTri = (triInAppend: number) => {
    const base = triInAppend * 9;
    const b0 = oriented[base + 3]!;
    const b1 = oriented[base + 4]!;
    const b2 = oriented[base + 5]!;
    oriented[base + 3] = oriented[base + 6]!;
    oriented[base + 4] = oriented[base + 7]!;
    oriented[base + 5] = oriented[base + 8]!;
    oriented[base + 6] = b0;
    oriented[base + 7] = b1;
    oriented[base + 8] = b2;
  };

  for (let tri = baseTriCount; tri < triCount; tri++) {
    if ((flips[tri] ?? 0) === 0) continue;
    swapTri(tri - baseTriCount);
  }

  return oriented;
}

function sanitizeFaceIds(topology: PolyTopology, faceIds: number[]): number[] {
  const valid = faceIds
    .filter((faceId) => Number.isInteger(faceId) && faceId >= 0 && faceId < topology.faces.length)
    .sort((a, b) => a - b);
  return Array.from(new Set(valid));
}

function collectOrientedBoundaryEdges(
  topology: PolyTopology,
  selectedFaceIds: number[]
): Array<[number, number]> {
  const selectedFaceSet = new Set(selectedFaceIds);
  const boundaryEdges: Array<[number, number]> = [];
  const seen = new Set<string>();

  for (const faceId of selectedFaceIds) {
    const face = topology.faces[faceId];
    if (!face) continue;

    const orientedEdges: Array<[number, number]> = [
      [face.vertices[0], face.vertices[1]],
      [face.vertices[1], face.vertices[2]],
      [face.vertices[2], face.vertices[0]],
    ];

    for (const [a, b] of orientedEdges) {
      const eId = topology.edgeByKey.get(edgeKey(a, b));
      if (eId === undefined) continue;
      const e = topology.edges[eId];
      if (!e) continue;

      let selectedCount = 0;
      for (const adjFaceId of e.faces) {
        if (selectedFaceSet.has(adjFaceId)) selectedCount += 1;
      }
      if (selectedCount !== 1) continue;

      const directedKey = `${a}:${b}`;
      if (seen.has(directedKey)) continue;
      seen.add(directedKey);
      boundaryEdges.push([a, b]);
    }
  }

  return boundaryEdges;
}

export function extrudeFacesRegion(
  positions: ArrayLike<number>,
  topology: PolyTopology,
  faceIds: number[],
  distance: number
): PolyOperationResult | null {
  const selectedFaceIds = sanitizeFaceIds(topology, faceIds);
  if (selectedFaceIds.length === 0) return null;

  const d = clamp(distance, -10, 10);
  if (Math.abs(d) < 1e-6) return null;

  const centerNormal = computeFaceSelectionCentroidNormal(topology, selectedFaceIds);
  if (!centerNormal) return null;

  const src = Array.from(positions as ArrayLike<number>);
  const append: number[] = [];
  const topFaceIds: number[] = [];

  const selectedFaceSet = new Set(selectedFaceIds);
  const selectedVertexIds = collectVerticesForFaces(topology, selectedFaceIds);
  const movedVertexById = new Map<number, Vec3>();

  for (const vertexId of selectedVertexIds) {
    const v = topology.vertices[vertexId];
    if (!v) continue;
    movedVertexById.set(vertexId, vecAdd(v, vecScale(centerNormal.normal, d)));
  }

  // Replace selected faces with the extruded result (Blender-like region extrude):
  // keep all non-selected triangles, then append moved top cap + boundary sidewalls.
  const base: number[] = [];
  const triCount = Math.floor(src.length / 9);
  for (let tri = 0; tri < triCount; tri++) {
    if (selectedFaceSet.has(tri)) continue;
    const start = tri * 9;
    for (let i = 0; i < 9; i++) {
      base.push(src[start + i]!);
    }
  }

  const initialTriCount = base.length / 9;
  let appendedTriCount = 0;

  for (const faceId of selectedFaceIds) {
    const face = topology.faces[faceId];
    if (!face) continue;

    const t0 = movedVertexById.get(face.vertices[0]);
    const t1 = movedVertexById.get(face.vertices[1]);
    const t2 = movedVertexById.get(face.vertices[2]);
    if (!t0 || !t1 || !t2) continue;

    pushTriOriented(append, t0, t1, t2, face.normal);
    topFaceIds.push(initialTriCount + appendedTriCount);
    appendedTriCount += 1;
  }

  const boundaryEdges = collectOrientedBoundaryEdges(topology, selectedFaceIds);
  for (const [aId, bId] of boundaryEdges) {
    const a = topology.vertices[aId];
    const b = topology.vertices[bId];
    const ta = movedVertexById.get(aId);
    const tb = movedVertexById.get(bId);
    if (!a || !b || !ta || !tb) continue;

    const edgeVector = vecSub(b, a);
    const extrusionVector = vecSub(tb, b);
    const expectedWallNormal = vecCross(edgeVector, extrusionVector);
    pushTriOriented(append, a, b, tb, expectedWallNormal);
    pushTriOriented(append, a, tb, ta, expectedWallNormal);
  }

  if (append.length === 0) return null;
  const orientedAppend = orientAppendedTrianglesAgainstBase(base, append);
  base.push(...orientedAppend);

  return {
    nextPositions: base,
    topFaceIds,
  };
}

export function bevelFacesSimple(
  positions: ArrayLike<number>,
  topology: PolyTopology,
  faceIds: number[],
  amount: number
): PolyOperationResult | null {
  const selectedFaceIds = sanitizeFaceIds(topology, faceIds);
  if (selectedFaceIds.length === 0) return null;

  const bevelAmount = clamp(amount, 0.001, 2);
  if (bevelAmount <= 1e-6) return null;

  const insetFactor = clamp(bevelAmount * 0.35, 0.03, 0.46);
  const height = clamp(bevelAmount * 0.5, 0.005, 1.5);

  const src = Array.from(positions as ArrayLike<number>);
  const append: number[] = [];
  const topFaceIds: number[] = [];

  const initialTriCount = src.length / 9;
  let appendedTriCount = 0;

  for (const faceId of selectedFaceIds) {
    const face = topology.faces[faceId];
    if (!face) continue;

    const v0 = topology.vertices[face.vertices[0]];
    const v1 = topology.vertices[face.vertices[1]];
    const v2 = topology.vertices[face.vertices[2]];
    if (!v0 || !v1 || !v2) continue;

    const centroid = face.centroid;
    const normal = face.normal;

    const r0 = vecLerp(v0, centroid, insetFactor);
    const r1 = vecLerp(v1, centroid, insetFactor);
    const r2 = vecLerp(v2, centroid, insetFactor);
    const t0 = vecAdd(r0, vecScale(normal, height));
    const t1 = vecAdd(r1, vecScale(normal, height));
    const t2 = vecAdd(r2, vecScale(normal, height));

    // Outer bevel ring
    pushTri(append, v0, v1, r1);
    pushTri(append, v0, r1, r0);
    pushTri(append, v1, v2, r2);
    pushTri(append, v1, r2, r1);
    pushTri(append, v2, v0, r0);
    pushTri(append, v2, r0, r2);

    // Upper side ring
    pushTri(append, r0, r1, t1);
    pushTri(append, r0, t1, t0);
    pushTri(append, r1, r2, t2);
    pushTri(append, r1, t2, t1);
    pushTri(append, r2, r0, t0);
    pushTri(append, r2, t0, t2);

    // Top cap
    pushTri(append, t0, t1, t2);

    topFaceIds.push(initialTriCount + appendedTriCount + 12);
    appendedTriCount += 13;
  }

  if (append.length === 0) return null;
  src.push(...append);

  return {
    nextPositions: src,
    topFaceIds,
  };
}
