// ============================================================
// Core Document Types — Scene Graph Data Model
// Mirrors glTF Node semantics + Three.js Object3D
// ============================================================

export type NodeId = string;
export type MaterialId = string;
export type TextureId = string;

// ── Transform ──

export interface Transform {
  position: [number, number, number];
  rotation: [number, number, number]; // Euler angles in degrees (for UI)
  scale: [number, number, number];
}

export const DEFAULT_TRANSFORM: Transform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

// ── Node Types ──

export type NodeType = "group" | "mesh" | "camera" | "light" | "scene" | "particleEmitter";

export type LightKind = "directional" | "point" | "ambient" | "spot";

export interface LightData {
  kind: LightKind;
  color: string; // #RRGGBB
  intensity: number;
  castShadow: boolean;
  // Spot light specific
  angle?: number;     // radians
  penumbra?: number;  // 0..1
  // Point/Spot
  distance?: number;
  decay?: number;
}

// ── Environment / Scene Settings ──

export interface FogSettings {
  enabled: boolean;
  type: "linear" | "exponential";
  color: string;
  near: number;
  far: number;
  density: number;
}

export interface PostProcessingSettings {
  bloom: { enabled: boolean; intensity: number; threshold: number; radius: number };
  vignette: { enabled: boolean; offset: number; darkness: number };
  toneMappingExposure: number;
}

export interface SceneSettings {
  backgroundColor: string;
  backgroundType: "color" | "transparent";
  ambientLightColor: string;
  ambientLightIntensity: number;
  fog: FogSettings;
  postProcessing: PostProcessingSettings;
}

export const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  backgroundColor: "#1c1c1c",
  backgroundType: "color",
  ambientLightColor: "#ffffff",
  ambientLightIntensity: 0.4,
  fog: {
    enabled: false,
    type: "exponential",
    color: "#cccccc",
    near: 1,
    far: 50,
    density: 0.02,
  },
  postProcessing: {
    bloom: { enabled: false, intensity: 0.5, threshold: 0.8, radius: 0.5 },
    vignette: { enabled: false, offset: 1.0, darkness: 1.0 },
    toneMappingExposure: 1.0,
  },
};

export type PrimitiveType =
  | "imported"
  | "box"
  | "sphere"
  | "plane"
  | "cylinder"
  | "cone"
  | "torus"
  | "capsule"
  | "circle"
  | "ring"
  | "dodecahedron"
  | "icosahedron"
  | "text3d"
  | "star"
  | "heart"
  | "arrow"
  | "cloner";

export type MeshEditMode = "object" | "vertex" | "edge" | "face";

export interface MeshGeometryData {
  /** Flat triangle list positions (x,y,z,...) */
  position: number[];
  /** Optional per-vertex normals (must match position length) */
  normal?: number[];
  /** Optional UVs (2 values per vertex) */
  uv?: number[];
}

export interface MeshData {
  geometryType: PrimitiveType;
  materialId?: MaterialId;
  /** Stored text content for text3d meshes */
  text3dContent?: string;
  text3dSize?: number;
  text3dDepth?: number;
  text3dBevel?: boolean;
  /** Optional baked geometry for mesh edits (poly editing) */
  customGeometry?: MeshGeometryData;
}

// ── Camera Node ──

export interface CameraNodeData {
  fov: number;
  /** Name/label shown in viewer UI */
  label: string;
}

// ── Cloner (stored on node for editable params) ──

export interface ClonerOpts {
  countX?: number;
  countY?: number;
  countZ?: number;
  spacingX?: number;
  spacingY?: number;
  spacingZ?: number;
  count?: number;
  radius?: number;
}

export interface ClonerConfig {
  sourceNodeId: NodeId;
  mode: "grid" | "radial" | "linear";
  opts: ClonerOpts;
}

// ── Physics (Rigid Body) ──

export interface RigidBodyData {
  enabled: boolean;
  mass: number; // kg, 0 = static
  /** Gravity scale (0 = no gravity, 1 = default) */
  gravityScale?: number;
}

// ── Particle Emitter ──

export interface ParticleEmitterData {
  count: number;
  lifetime: number; // seconds
  size: number;
  color: string; // #RRGGBB
  speed: number;
  spread: number; // 0..1, cone/spread of initial velocity
  /** Emit rate per second (0 = burst once) */
  rate: number;
  /** Loop emission */
  loop: boolean;
}

export const DEFAULT_PARTICLE_EMITTER: ParticleEmitterData = {
  count: 200,
  lifetime: 2,
  size: 0.05,
  color: "#ffffff",
  speed: 2,
  spread: 0.5,
  rate: 50,
  loop: true,
};

// ── Scene Node ──

export interface SceneNode {
  id: NodeId;
  name: string;
  type: NodeType;
  parentId: NodeId | null;
  children: NodeId[];
  transform: Transform;
  visible: boolean;
  locked: boolean;

  // Attachable data (only one applies per node type)
  mesh?: MeshData;
  light?: LightData;
  cameraData?: CameraNodeData;

  /** When mesh is a cloner group, stores source + params for editing */
  clonerConfig?: ClonerConfig;

  /** Physics rigid body (mesh only) */
  rigidBody?: RigidBodyData;

  /** Particle emitter config (node type particleEmitter) */
  particleEmitter?: ParticleEmitterData;

  // Interaction system
  interactions?: NodeInteractions;

  // Link to the runtime 3D object
  runtimeObjectUuid?: string;
}

// ── PBR Material ──

export interface PBRMaterial {
  id: MaterialId;
  name: string;
  baseColor: string; // #RRGGBB
  metalness: number; // 0..1
  roughness: number; // 0..1
  emissive: string; // #RRGGBB
  emissiveIntensity: number;
  opacity: number; // 0..1
  doubleSided: boolean;
  maps: {
    baseColor?: TextureId;
    normal?: TextureId;
    roughness?: TextureId;
    metalness?: TextureId;
    emissive?: TextureId;
  };
}

export const DEFAULT_MATERIAL: Omit<PBRMaterial, "id" | "name"> = {
  baseColor: "#cccccc",
  metalness: 0.0,
  roughness: 0.5,
  emissive: "#000000",
  emissiveIntensity: 1.0,
  opacity: 1.0,
  doubleSided: false,
  maps: {},
};

// ── Texture Asset ──

export interface TextureAsset {
  id: TextureId;
  name: string;
  mime: string;
  byteSize: number;
  objectUrl: string; // URL.createObjectURL(file)
}

// ── Interaction System — States, Events, Actions, Variables ──

export type StateId = string;
export type EventId = string;
export type ActionId = string;
export type VariableId = string;

/** Property overrides for a state (partial transforms, material, visibility) */
export interface StateOverrides {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  visible?: boolean;
  materialColor?: string;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
}

/** A named state for a node */
export interface ObjectState {
  id: StateId;
  name: string;
  overrides: StateOverrides;
}

/** Supported event trigger types */
export type EventTrigger =
  | "mouseEnter"
  | "mouseLeave"
  | "click"
  | "doubleClick"
  | "mouseDown"
  | "mouseUp"
  | "keyDown"
  | "keyUp"
  | "start"        // when scene loads
  | "scroll";

/** An event that triggers an action */
export interface InteractionEvent {
  id: EventId;
  trigger: EventTrigger;
  /** For key events: which key */
  key?: string;
  /** The action to fire */
  actionId: ActionId;
}

/** Easing functions for transitions */
export type EasingType =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "spring"
  | "bounce";

/** Supported action types */
export type ActionType =
  | "transitionToState"
  | "toggleState"
  | "setVariable"
  | "openLink"
  | "playAnimation";

/** An action that can be triggered */
export interface InteractionAction {
  id: ActionId;
  type: ActionType;
  label: string;
  /** Target node (if applicable) */
  targetNodeId?: NodeId;
  /** Target state to transition to */
  targetStateId?: StateId;
  /** Transition duration in ms */
  duration?: number;
  /** Easing */
  easing?: EasingType;
  /** Delay before starting (ms) */
  delay?: number;
  /** For toggleState: the two states to toggle between */
  stateA?: StateId;
  stateB?: StateId;
  /** For setVariable */
  variableId?: VariableId;
  variableValue?: string | number | boolean;
  /** For openLink */
  url?: string;
  /** For playAnimation */
  animationName?: string;
}

/** A global variable */
export interface SceneVariable {
  id: VariableId;
  name: string;
  type: "string" | "number" | "boolean";
  defaultValue: string | number | boolean;
}

/** Interaction data attached to a SceneNode */
export interface NodeInteractions {
  states: ObjectState[];
  events: InteractionEvent[];
  actions: InteractionAction[];
  /** Current active state id (runtime only, not persisted as active) */
  defaultStateId?: StateId;
}

// ── Timeline / Animation System ──

export type TrackId = string;
export type ClipId = string;

/** Animatable property paths */
export type AnimatableProperty =
  | "position.x" | "position.y" | "position.z"
  | "rotation.x" | "rotation.y" | "rotation.z"
  | "scale.x"    | "scale.y"    | "scale.z"
  | "opacity"
  | "materialColor"
  | "emissiveIntensity"
  | "visible";

/** A single keyframe */
export interface Keyframe {
  time: number;           // seconds
  value: number | string | boolean;
  easing: EasingType;
}

/** An animation track for one property of one node */
export interface AnimationTrack {
  id: TrackId;
  nodeId: NodeId;
  property: AnimatableProperty;
  keyframes: Keyframe[];
}

/** A named animation clip containing multiple tracks */
export interface AnimationClip {
  id: ClipId;
  name: string;
  duration: number;       // seconds
  loop: boolean;
  tracks: AnimationTrack[];
}

/** Timeline state stored in the document */
export interface TimelineData {
  clips: AnimationClip[];
  activeClipId: ClipId | null;
  fps: number;
}

export const DEFAULT_TIMELINE: TimelineData = {
  clips: [],
  activeClipId: null,
  fps: 30,
};

// ── Scene Document (Source of Truth) ──

export interface SceneDocument {
  version: 1;
  projectName: string;
  nodes: Record<NodeId, SceneNode>;
  rootIds: NodeId[];
  materials: Record<MaterialId, PBRMaterial>;
  textures: Record<TextureId, TextureAsset>;
  sceneSettings: SceneSettings;
  variables: SceneVariable[];
  timeline: TimelineData;
}
