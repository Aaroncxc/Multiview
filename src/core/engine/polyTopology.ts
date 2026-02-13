// ============================================================
// Poly Topology Helpers - welded vertices, edges, adjacency
// ============================================================

export type MeshEditComponentMode = "vertex" | "edge" | "face";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface TopologyFace {
  id: number;
  corners: [number, number, number];
  vertices: [number, number, number];
  normal: Vec3;
  area: number;
  centroid: Vec3;
}

export interface TopologyEdge {
  id: number;
  vertices: [number, number];
  faces: number[];
}

export interface PolyTopology {
  epsilon: number;
  vertices: Vec3[];
  cornerToVertex: number[];
  faces: TopologyFace[];
  edges: TopologyEdge[];
  edgeByKey: Map<string, number>;
  faceToEdges: number[][];
  vertexToCorners: Map<number, number[]>;
  vertexToFaces: Map<number, number[]>;
}

export interface MeshEditSelectionSet {
  faces: number[];
  edges: Array<[number, number]>;
  vertices: number[];
  active:
    | { kind: "face"; face: number }
    | { kind: "edge"; edge: [number, number] }
    | { kind: "vertex"; vertex: number }
    | null;
}

export function normalizeEdge(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a];
}

export function edgeKey(a: number, b: number): string {
  const [x, y] = normalizeEdge(a, b);
  return `${x}:${y}`;
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

function vecLength(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

function vecNormalize(v: Vec3): Vec3 {
  const len = vecLength(v);
  if (len <= 1e-12 || !Number.isFinite(len)) return { x: 0, y: 1, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function vecScale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function quantize(v: number, epsilon: number): number {
  return Math.round(v / epsilon);
}

export function createEmptyMeshEditSelection(): MeshEditSelectionSet {
  return {
    faces: [],
    edges: [],
    vertices: [],
    active: null,
  };
}

export function dedupeNumbers(values: number[]): number[] {
  return Array.from(new Set(values.filter((v) => Number.isFinite(v)))).sort((a, b) => a - b);
}

export function dedupeEdges(values: Array<[number, number]>): Array<[number, number]> {
  const map = new Map<string, [number, number]>();
  for (const [a, b] of values) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const edge = normalizeEdge(a, b);
    map.set(edgeKey(edge[0], edge[1]), edge);
  }
  return Array.from(map.values()).sort((lhs, rhs) => {
    if (lhs[0] === rhs[0]) return lhs[1] - rhs[1];
    return lhs[0] - rhs[0];
  });
}

export function mergeSelections(
  base: MeshEditSelectionSet,
  patch: Partial<Pick<MeshEditSelectionSet, "faces" | "edges" | "vertices" | "active">>
): MeshEditSelectionSet {
  const faces = patch.faces ? dedupeNumbers([...base.faces, ...patch.faces]) : [...base.faces];
  const edges = patch.edges ? dedupeEdges([...base.edges, ...patch.edges]) : [...base.edges];
  const vertices = patch.vertices
    ? dedupeNumbers([...base.vertices, ...patch.vertices])
    : [...base.vertices];

  return {
    faces,
    edges,
    vertices,
    active: patch.active ?? base.active,
  };
}

export function subtractSelections(
  base: MeshEditSelectionSet,
  patch: Partial<Pick<MeshEditSelectionSet, "faces" | "edges" | "vertices">>
): MeshEditSelectionSet {
  const faceSet = new Set(base.faces);
  for (const face of patch.faces ?? []) faceSet.delete(face);

  const edgeSet = new Map(base.edges.map((edge) => [edgeKey(edge[0], edge[1]), edge] as const));
  for (const edge of patch.edges ?? []) {
    const [a, b] = normalizeEdge(edge[0], edge[1]);
    edgeSet.delete(edgeKey(a, b));
  }

  const vertexSet = new Set(base.vertices);
  for (const v of patch.vertices ?? []) vertexSet.delete(v);

  const next: MeshEditSelectionSet = {
    faces: Array.from(faceSet.values()).sort((a, b) => a - b),
    edges: Array.from(edgeSet.values()).sort((lhs, rhs) => {
      if (lhs[0] === rhs[0]) return lhs[1] - rhs[1];
      return lhs[0] - rhs[0];
    }),
    vertices: Array.from(vertexSet.values()).sort((a, b) => a - b),
    active: base.active,
  };

  if (next.active?.kind === "face" && !faceSet.has(next.active.face)) {
    next.active = null;
  }
  if (
    next.active?.kind === "edge" &&
    !edgeSet.has(edgeKey(next.active.edge[0], next.active.edge[1]))
  ) {
    next.active = null;
  }
  if (next.active?.kind === "vertex" && !vertexSet.has(next.active.vertex)) {
    next.active = null;
  }

  return next;
}

export function toggleSelections(
  base: MeshEditSelectionSet,
  patch: Partial<Pick<MeshEditSelectionSet, "faces" | "edges" | "vertices" | "active">>
): MeshEditSelectionSet {
  const faces = new Set(base.faces);
  for (const face of patch.faces ?? []) {
    if (faces.has(face)) faces.delete(face);
    else faces.add(face);
  }

  const edges = new Map(base.edges.map((edge) => [edgeKey(edge[0], edge[1]), edge] as const));
  for (const edge of patch.edges ?? []) {
    const normalized = normalizeEdge(edge[0], edge[1]);
    const key = edgeKey(normalized[0], normalized[1]);
    if (edges.has(key)) edges.delete(key);
    else edges.set(key, normalized);
  }

  const vertices = new Set(base.vertices);
  for (const vertex of patch.vertices ?? []) {
    if (vertices.has(vertex)) vertices.delete(vertex);
    else vertices.add(vertex);
  }

  const next: MeshEditSelectionSet = {
    faces: Array.from(faces.values()).sort((a, b) => a - b),
    edges: Array.from(edges.values()).sort((lhs, rhs) => {
      if (lhs[0] === rhs[0]) return lhs[1] - rhs[1];
      return lhs[0] - rhs[0];
    }),
    vertices: Array.from(vertices.values()).sort((a, b) => a - b),
    active: patch.active ?? base.active,
  };

  if (next.active?.kind === "face" && !faces.has(next.active.face)) {
    next.active = null;
  }
  if (
    next.active?.kind === "edge" &&
    !edges.has(edgeKey(next.active.edge[0], next.active.edge[1]))
  ) {
    next.active = null;
  }
  if (next.active?.kind === "vertex" && !vertices.has(next.active.vertex)) {
    next.active = null;
  }

  return next;
}

export function buildPolyTopology(
  positions: ArrayLike<number>,
  epsilon = 1e-5
): PolyTopology {
  const cornerCount = Math.floor(positions.length / 3);
  const triCount = Math.floor(cornerCount / 3);

  const vertices: Vec3[] = [];
  const cornerToVertex = new Array<number>(cornerCount);
  const vertexByQuantizedKey = new Map<string, number>();
  const vertexToCorners = new Map<number, number[]>();

  for (let corner = 0; corner < cornerCount; corner++) {
    const base = corner * 3;
    const x = Number(positions[base] ?? 0);
    const y = Number(positions[base + 1] ?? 0);
    const z = Number(positions[base + 2] ?? 0);
    const key = `${quantize(x, epsilon)}:${quantize(y, epsilon)}:${quantize(z, epsilon)}`;

    let vertexId = vertexByQuantizedKey.get(key);
    if (vertexId === undefined) {
      vertexId = vertices.length;
      vertices.push({ x, y, z });
      vertexByQuantizedKey.set(key, vertexId);
      vertexToCorners.set(vertexId, []);
    }

    cornerToVertex[corner] = vertexId;
    vertexToCorners.get(vertexId)!.push(corner);
  }

  const faces: TopologyFace[] = [];
  const vertexToFaces = new Map<number, number[]>();
  const faceToEdges: number[][] = [];
  const edgeByKey = new Map<string, number>();
  const edges: TopologyEdge[] = [];

  const pushVertexFace = (vertexId: number, faceId: number) => {
    const existing = vertexToFaces.get(vertexId);
    if (existing) existing.push(faceId);
    else vertexToFaces.set(vertexId, [faceId]);
  };

  for (let faceId = 0; faceId < triCount; faceId++) {
    const c0 = faceId * 3;
    const c1 = c0 + 1;
    const c2 = c0 + 2;

    const v0 = cornerToVertex[c0]!;
    const v1 = cornerToVertex[c1]!;
    const v2 = cornerToVertex[c2]!;

    const p0 = vertices[v0]!;
    const p1 = vertices[v1]!;
    const p2 = vertices[v2]!;

    const e01 = vecSub(p1, p0);
    const e02 = vecSub(p2, p0);
    const cross = vecCross(e01, e02);
    const area = 0.5 * vecLength(cross);
    const normal = vecNormalize(cross);

    const centroid = {
      x: (p0.x + p1.x + p2.x) / 3,
      y: (p0.y + p1.y + p2.y) / 3,
      z: (p0.z + p1.z + p2.z) / 3,
    };

    faces.push({
      id: faceId,
      corners: [c0, c1, c2],
      vertices: [v0, v1, v2],
      normal,
      area,
      centroid,
    });

    pushVertexFace(v0, faceId);
    pushVertexFace(v1, faceId);
    pushVertexFace(v2, faceId);

    const localEdges: Array<[number, number]> = [
      normalizeEdge(v0, v1),
      normalizeEdge(v1, v2),
      normalizeEdge(v2, v0),
    ];

    const edgeIds: number[] = [];
    for (const [a, b] of localEdges) {
      const key = edgeKey(a, b);
      let edgeId = edgeByKey.get(key);
      if (edgeId === undefined) {
        edgeId = edges.length;
        edges.push({ id: edgeId, vertices: [a, b], faces: [faceId] });
        edgeByKey.set(key, edgeId);
      } else {
        edges[edgeId]!.faces.push(faceId);
      }
      edgeIds.push(edgeId);
    }

    faceToEdges.push(edgeIds);
  }

  for (const [, values] of vertexToFaces) {
    values.sort((a, b) => a - b);
  }

  return {
    epsilon,
    vertices,
    cornerToVertex,
    faces,
    edges,
    edgeByKey,
    faceToEdges,
    vertexToCorners,
    vertexToFaces,
  };
}

export function collectFacesForEdges(
  topology: PolyTopology,
  edges: Array<[number, number]>
): number[] {
  const faceIds = new Set<number>();
  for (const [a, b] of edges) {
    const edgeId = topology.edgeByKey.get(edgeKey(a, b));
    if (edgeId === undefined) continue;
    for (const faceId of topology.edges[edgeId]!.faces) {
      faceIds.add(faceId);
    }
  }
  return Array.from(faceIds.values()).sort((lhs, rhs) => lhs - rhs);
}

export function collectFacesForVertices(topology: PolyTopology, vertices: number[]): number[] {
  const faceIds = new Set<number>();
  for (const vertexId of vertices) {
    const list = topology.vertexToFaces.get(vertexId);
    if (!list) continue;
    for (const faceId of list) faceIds.add(faceId);
  }
  return Array.from(faceIds.values()).sort((lhs, rhs) => lhs - rhs);
}

export function collectVerticesForFaces(topology: PolyTopology, faces: number[]): number[] {
  const vertexIds = new Set<number>();
  for (const faceId of faces) {
    const face = topology.faces[faceId];
    if (!face) continue;
    for (const vertexId of face.vertices) {
      vertexIds.add(vertexId);
    }
  }
  return Array.from(vertexIds.values()).sort((lhs, rhs) => lhs - rhs);
}

export function collectEdgesForFaces(topology: PolyTopology, faces: number[]): Array<[number, number]> {
  const edgeIds = new Set<number>();
  for (const faceId of faces) {
    for (const edgeId of topology.faceToEdges[faceId] ?? []) {
      edgeIds.add(edgeId);
    }
  }
  return Array.from(edgeIds.values())
    .map((id) => topology.edges[id]!.vertices)
    .sort((lhs, rhs) => {
      if (lhs[0] === rhs[0]) return lhs[1] - rhs[1];
      return lhs[0] - rhs[0];
    });
}

export function collectBoundaryEdgesForFaceRegion(
  topology: PolyTopology,
  faceIds: Iterable<number>
): Array<[number, number]> {
  const selected = new Set<number>(faceIds);
  const result: Array<[number, number]> = [];

  for (const edge of topology.edges) {
    let selectedFaceCount = 0;
    for (const faceId of edge.faces) {
      if (selected.has(faceId)) selectedFaceCount += 1;
    }
    if (selectedFaceCount === 1) {
      result.push(edge.vertices);
    }
  }

  return result.sort((lhs, rhs) => {
    if (lhs[0] === rhs[0]) return lhs[1] - rhs[1];
    return lhs[0] - rhs[0];
  });
}

export function computeFaceSelectionCentroidNormal(
  topology: PolyTopology,
  faceIds: number[]
): { centroid: Vec3; normal: Vec3 } | null {
  if (faceIds.length === 0) return null;

  let totalArea = 0;
  let weightedCentroid: Vec3 = { x: 0, y: 0, z: 0 };
  let weightedNormal: Vec3 = { x: 0, y: 0, z: 0 };

  for (const faceId of faceIds) {
    const face = topology.faces[faceId];
    if (!face) continue;
    const w = Math.max(face.area, 1e-8);
    totalArea += w;
    weightedCentroid = vecAdd(weightedCentroid, vecScale(face.centroid, w));
    weightedNormal = vecAdd(weightedNormal, vecScale(face.normal, w));
  }

  if (totalArea <= 1e-10) return null;

  return {
    centroid: vecScale(weightedCentroid, 1 / totalArea),
    normal: vecNormalize(weightedNormal),
  };
}
