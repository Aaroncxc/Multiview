// ============================================================
// Three.js Render Backend
// Manages the WebGL scene, camera, controls, gizmos, picking
// ============================================================

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { Evaluator, Brush, SUBTRACTION, ADDITION, INTERSECTION } from "three-bvh-csg";
import {
  EffectComposer,
  BloomEffect,
  VignetteEffect,
  RenderPass,
  EffectPass,
} from "postprocessing";
import * as CANNON from "cannon-es";
import type { Transform, SceneSettings, LightData, ParticleEmitterData } from "../document/types";

export interface LoadGLTFResult {
  rootObjectUuid: string;
  nodeMap: Map<string, { uuid: string; name: string; type: string }>;
  animations: THREE.AnimationClip[];
}

export interface PickResult {
  objectUuid: string;
  point: THREE.Vector3;
}

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export type GizmoMode = "translate" | "rotate" | "scale";

export class ThreeBackend {
  // ── Core ──
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private orbit!: OrbitControls;
  private gizmo!: TransformControls;
  private clock = new THREE.Clock();
  private canvas!: HTMLCanvasElement;

  // ── Loaders ──
  private gltfLoader = new GLTFLoader();
  private fbxLoader = new FBXLoader();
  private objLoader = new OBJLoader();
  private mtlLoader = new MTLLoader();

  // ── Raycaster ──
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  // ── Object Registry ──
  private objectByUuid = new Map<string, THREE.Object3D>();

  /** Expose the registry for the interaction runtime */
  getObjectRegistry() {
    return this.objectByUuid;
  }

  // ── Grid ──
  private gridHelper!: THREE.GridHelper;

  // ── Callbacks ──
  private onGizmoChange?: (uuid: string, transform: Transform) => void;
  private onSelectionRequest?: (uuid: string | null) => void;

  // ── Animation ──
  private mixer: THREE.AnimationMixer | null = null;
  private animationActions = new Map<string, THREE.AnimationAction>();

  // ── Render loop ──
  private animFrameId = 0;

  // ── Hover ──
  private hoveredObject: THREE.Object3D | null = null;
  private hoveredOriginalEmissive = new THREE.Color();

  // ── Post-Processing ──
  private composer!: EffectComposer;
  private bloomEffect!: BloomEffect;
  private vignetteEffect!: VignetteEffect;
  private usePostProcessing = false;

  // ── Selection Outline ──
  private selectionHelper: THREE.BoxHelper | null = null;

  // ── Physics (cannon-es) ──
  private world: CANNON.World | null = null;
  private bodyByUuid = new Map<string, CANNON.Body>();

  // ── Particle emitters ──
  private particleEmitters = new Map<
    string,
    {
      points: THREE.Points;
      config: ParticleEmitterData;
      positions: Float32Array;
      velocities: Float32Array;
      ages: Float32Array;
      emitAccum: number;
      burstDone: boolean;
    }
  >();

  // ── Light helpers ──
  private lightHelpers = new Map<string, THREE.Object3D>();

  // ── Camera markers (helper cones visible in editor) ──
  private cameraMarkers = new Map<string, THREE.Object3D>();

  // ── Camera transition ──
  private cameraTransition: {
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    duration: number;
    elapsed: number;
  } | null = null;

  // ── HDRI / EXR Loaders ──
  private rgbeLoader = new RGBELoader();
  private exrLoader = new EXRLoader();

  // ============================================================
  // Init
  // ============================================================

  init(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor(0x1c1c1c, 1);

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    this.renderer.setSize(w, h, false);

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 2000);
    this.camera.position.set(3, 2.5, 4);
    this.camera.lookAt(0, 0, 0);

    // Orbit Controls
    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.minDistance = 0.5;
    this.orbit.maxDistance = 100;

    // Default Lighting
    this.setupDefaultLighting();

    // Grid
    this.gridHelper = new THREE.GridHelper(20, 40, 0x444444, 0x333333);
    this.scene.add(this.gridHelper);

    // Transform Gizmo
    this.gizmo = new TransformControls(this.camera, canvas);
    this.gizmo.addEventListener("dragging-changed", (event) => {
      this.orbit.enabled = !event.value;
    });
    this.gizmo.addEventListener("objectChange", () => {
      this.handleGizmoChange();
    });
    this.scene.add(this.gizmo.getHelper());

    // Post-processing
    this.setupPostProcessing();

    // Resize observer
    this.setupResize();

    // Start render loop
    this.startLoop();
  }

  // ============================================================
  // Lighting
  // ============================================================

  private setupDefaultLighting() {
    // Ambient
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    ambient.name = "__editor_ambient";
    this.scene.add(ambient);

    // Directional (key light)
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.name = "__editor_key_light";
    dir.position.set(5, 8, 4);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 50;
    dir.shadow.camera.left = -10;
    dir.shadow.camera.right = 10;
    dir.shadow.camera.top = 10;
    dir.shadow.camera.bottom = -10;
    dir.shadow.bias = -0.0001;
    this.scene.add(dir);

    // Fill light
    const fill = new THREE.DirectionalLight(0xb4c6e0, 0.3);
    fill.name = "__editor_fill_light";
    fill.position.set(-3, 4, -2);
    this.scene.add(fill);

    // Ground plane to receive shadows
    const groundGeo = new THREE.PlaneGeometry(40, 40);
    const groundMat = new THREE.ShadowMaterial({
      opacity: 0.15,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = "__editor_ground";
    this.scene.add(ground);
  }

  // ============================================================
  // Resize
  // ============================================================

  private resizeObserver: ResizeObserver | null = null;

  private setupResize() {
    this.resizeObserver = new ResizeObserver(() => {
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      if (w === 0 || h === 0) return;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
      this.composer?.setSize(w, h);
    });
    this.resizeObserver.observe(this.canvas);
  }

  // ============================================================
  // Render Loop
  // ============================================================

  private setupPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomEffect = new BloomEffect({
      intensity: 0.5,
      luminanceThreshold: 0.8,
      radius: 0.5,
    });

    this.vignetteEffect = new VignetteEffect({
      offset: 1.0,
      darkness: 1.0,
    });

    const effectPass = new EffectPass(
      this.camera,
      this.bloomEffect,
      this.vignetteEffect
    );
    this.composer.addPass(effectPass);

    // Disable optional effects by default
    this.bloomEffect.blendMode.opacity.value = 0;
    this.vignetteEffect.blendMode.opacity.value = 0;
  }

  private startLoop() {
    const loop = () => {
      this.animFrameId = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.1); // cap for stability
      this.updateCameraTransition(dt);
      this.orbit.update();
      if (this.mixer) this.mixer.update(dt);
      this.stepPhysics(dt);
      this.updateParticleEmitters(dt);
      this.updateSelectionHelper();

      if (this.usePostProcessing) {
        this.composer.render(dt);
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    };
    loop();
  }

  private updateCameraTransition(dt: number) {
    const t = this.cameraTransition;
    if (!t) return;
    t.elapsed += dt;
    const progress = Math.min(t.elapsed / t.duration, 1);
    // Smooth easeInOut
    const ease =
      progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - (-2 * progress + 2) ** 3 / 2;

    this.camera.position.lerpVectors(t.fromPos, t.toPos, ease);
    const target = new THREE.Vector3().lerpVectors(t.fromTarget, t.toTarget, ease);
    this.orbit.target.copy(target);

    if (progress >= 1) {
      this.cameraTransition = null;
    }
  }

  private stepPhysics(dt: number) {
    if (!this.world || this.bodyByUuid.size === 0) return;
    this.world.step(dt);
    for (const [uuid, body] of this.bodyByUuid) {
      const obj = this.objectByUuid.get(uuid);
      if (!obj) continue;
      obj.position.set(body.position.x, body.position.y, body.position.z);
      obj.quaternion.set(
        body.quaternion.x,
        body.quaternion.y,
        body.quaternion.z,
        body.quaternion.w
      );
    }
  }

  // ============================================================
  // Physics (Rigid Bodies)
  // ============================================================

  addPhysicsBody(objectUuid: string, mass: number, gravityScale = 1) {
    const obj = this.objectByUuid.get(objectUuid);
    if (!obj) return;
    if (this.bodyByUuid.has(objectUuid)) return;

    if (!this.world) {
      this.world = new CANNON.World();
      this.world.gravity.set(0, -9.82, 0);
      this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    }

    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    const halfExtents = new CANNON.Vec3(
      Math.max(size.x / 2, 0.05),
      Math.max(size.y / 2, 0.05),
      Math.max(size.z / 2, 0.05)
    );
    const shape = new CANNON.Box(halfExtents);
    const body = new CANNON.Body({
      mass: mass <= 0 ? 0 : mass,
      material: new CANNON.Material("default"),
      shape,
    });
    body.position.set(obj.position.x, obj.position.y, obj.position.z);
    body.quaternion.set(
      obj.quaternion.x,
      obj.quaternion.y,
      obj.quaternion.z,
      obj.quaternion.w
    );
    // cannon-es has no per-body gravityScale; world.gravity applies to all. Param kept for API/UI.
    this.world.addBody(body);
    this.bodyByUuid.set(objectUuid, body);
  }

  removePhysicsBody(objectUuid: string) {
    const body = this.bodyByUuid.get(objectUuid);
    if (!body || !this.world) return;
    this.world.removeBody(body);
    this.bodyByUuid.delete(objectUuid);
  }

  hasPhysicsBody(objectUuid: string): boolean {
    return this.bodyByUuid.has(objectUuid);
  }

  // ============================================================
  // Particle Emitters
  // ============================================================

  addParticleEmitter(config: ParticleEmitterData, name: string): { uuid: string } {
    const count = Math.min(Math.max(config.count, 1), 10000);
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const ages = new Float32Array(count);
    ages.fill(-1); // -1 = not yet spawned

    const c = new THREE.Color(config.color);
    const material = new THREE.PointsMaterial({
      size: config.size,
      color: c,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
    });

    const points = new THREE.Points(geometry, material);
    points.name = name;
    points.position.set(0, 1, 0); // default above ground
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    this.scene.add(points);
    this.objectByUuid.set(points.uuid, points);

    this.particleEmitters.set(points.uuid, {
      points,
      config: { ...config, count },
      positions,
      velocities,
      ages,
      emitAccum: 0,
      burstDone: false,
    });

    return { uuid: points.uuid };
  }

  private updateParticleEmitters(dt: number) {
    for (const [, em] of this.particleEmitters) {
      const { points, config, positions, velocities, ages } = em;
      const n = config.count;
      const lifetime = config.lifetime;
      const speed = config.speed;
      const spread = config.spread;
      const rate = config.rate;
      const loop = config.loop;

      // Burst once: spawn all particles on first frame
      if (rate === 0 && !em.burstDone) {
        em.burstDone = true;
        for (let i = 0; i < n; i++) {
          ages[i] = lifetime;
          positions[i * 3] = 0;
          positions[i * 3 + 1] = 0;
          positions[i * 3 + 2] = 0;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(1 - 2 * Math.random());
          const s = speed * (1 - spread + Math.random() * spread);
          velocities[i * 3] = s * Math.sin(phi) * Math.cos(theta);
          velocities[i * 3 + 1] = s * Math.cos(phi);
          velocities[i * 3 + 2] = s * Math.sin(phi) * Math.sin(theta);
        }
      }

      if (rate > 0 && loop) em.emitAccum += rate * dt;

      const spawnOne = (i: number) => {
        ages[i] = lifetime;
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(1 - 2 * Math.random());
        const s = speed * (1 - spread + Math.random() * spread);
        velocities[i * 3] = s * Math.sin(phi) * Math.cos(theta);
        velocities[i * 3 + 1] = s * Math.cos(phi);
        velocities[i * 3 + 2] = s * Math.sin(phi) * Math.sin(theta);
      };

      for (let i = 0; i < n; i++) {
        if (ages[i]! > 0) {
          ages[i]! -= dt;
          positions[i * 3]! += velocities[i * 3]! * dt;
          positions[i * 3 + 1]! += velocities[i * 3 + 1]! * dt;
          positions[i * 3 + 2]! += velocities[i * 3 + 2]! * dt;
        }
      }
      while (rate > 0 && loop && em.emitAccum >= 1) {
        let found = -1;
        for (let i = 0; i < n; i++) {
          if (ages[i]! <= 0) {
            found = i;
            break;
          }
        }
        if (found < 0) break;
        em.emitAccum -= 1;
        spawnOne(found);
      }

      (points.geometry.attributes.position as THREE.BufferAttribute).array = positions;
      points.geometry.attributes.position.needsUpdate = true;
    }
  }

  updateParticleEmitterConfig(objectUuid: string, config: ParticleEmitterData) {
    const em = this.particleEmitters.get(objectUuid);
    if (!em) return;
    em.config = { ...config, count: em.config.count };
    const mat = em.points.material as THREE.PointsMaterial;
    mat.size = config.size;
    mat.color.set(config.color);
  }

  removeParticleEmitter(objectUuid: string) {
    const em = this.particleEmitters.get(objectUuid);
    if (!em) return;
    em.points.geometry.dispose();
    (em.points.material as THREE.Material).dispose();
    this.particleEmitters.delete(objectUuid);
  }

  // ============================================================
  // glTF Import
  // ============================================================

  async loadGLTF(url: string): Promise<LoadGLTFResult> {
    const gltf = await this.gltfLoader.loadAsync(url);
    const root = gltf.scene;

    // Enable shadows on all meshes
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    this.scene.add(root);

    // Register all objects
    const nodeMap = new Map<string, { uuid: string; name: string; type: string }>();
    root.traverse((obj) => {
      this.objectByUuid.set(obj.uuid, obj);
      nodeMap.set(obj.uuid, {
        uuid: obj.uuid,
        name: obj.name || obj.type,
        type: obj.type,
      });
    });

    // Setup animation mixer if there are clips
    if (gltf.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(root);
      for (const clip of gltf.animations) {
        const action = this.mixer.clipAction(clip);
        this.animationActions.set(clip.name, action);
      }
    }

    return {
      rootObjectUuid: root.uuid,
      nodeMap,
      animations: gltf.animations,
    };
  }

  // ============================================================
  // FBX Import
  // ============================================================

  async loadFBX(url: string): Promise<LoadGLTFResult> {
    const root = await this.fbxLoader.loadAsync(url);

    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    this.scene.add(root);

    const nodeMap = new Map<string, { uuid: string; name: string; type: string }>();
    root.traverse((obj) => {
      this.objectByUuid.set(obj.uuid, obj);
      nodeMap.set(obj.uuid, {
        uuid: obj.uuid,
        name: obj.name || obj.type,
        type: obj.type,
      });
    });

    // FBX animations
    const animations: THREE.AnimationClip[] = root.animations ?? [];
    if (animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(root);
      for (const clip of animations) {
        const action = this.mixer.clipAction(clip);
        this.animationActions.set(clip.name, action);
      }
    }

    return { rootObjectUuid: root.uuid, nodeMap, animations };
  }

  // ============================================================
  // OBJ Import
  // ============================================================

  async loadOBJ(url: string): Promise<LoadGLTFResult> {
    const root = await this.objLoader.loadAsync(url);

    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        // OBJ often comes without materials — apply a default
        if (!obj.material || (obj.material as THREE.MeshBasicMaterial).type === "MeshBasicMaterial") {
          obj.material = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.5,
            metalness: 0.0,
          });
        }
      }
    });

    this.scene.add(root);

    const nodeMap = new Map<string, { uuid: string; name: string; type: string }>();
    root.traverse((obj) => {
      this.objectByUuid.set(obj.uuid, obj);
      nodeMap.set(obj.uuid, {
        uuid: obj.uuid,
        name: obj.name || obj.type,
        type: obj.type,
      });
    });

    return { rootObjectUuid: root.uuid, nodeMap, animations: [] };
  }

  // ============================================================
  // Add Primitives
  // ============================================================

  addPrimitive(
    type: string,
    name: string
  ): { uuid: string } {
    let geometry: THREE.BufferGeometry;
    let yOffset = 0.5;

    switch (type) {
      case "box":
        geometry = new THREE.BoxGeometry(1, 1, 1);
        break;
      case "sphere":
        geometry = new THREE.SphereGeometry(0.5, 32, 32);
        yOffset = 0.5;
        break;
      case "plane":
        geometry = new THREE.PlaneGeometry(2, 2);
        yOffset = 0;
        break;
      case "cylinder":
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
        break;
      case "cone":
        geometry = new THREE.ConeGeometry(0.5, 1, 32);
        break;
      case "torus":
        geometry = new THREE.TorusGeometry(0.4, 0.15, 24, 48);
        yOffset = 0.4;
        break;
      case "capsule":
        geometry = new THREE.CapsuleGeometry(0.3, 0.6, 16, 32);
        yOffset = 0.6;
        break;
      case "circle":
        geometry = new THREE.CircleGeometry(0.5, 32);
        yOffset = 0;
        break;
      case "ring":
        geometry = new THREE.RingGeometry(0.3, 0.5, 32);
        yOffset = 0;
        break;
      case "dodecahedron":
        geometry = new THREE.DodecahedronGeometry(0.5);
        yOffset = 0.5;
        break;
      case "icosahedron":
        geometry = new THREE.IcosahedronGeometry(0.5);
        yOffset = 0.5;
        break;
      default:
        geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    const material = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0,
      roughness: 0.5,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = yOffset;

    this.scene.add(mesh);
    this.objectByUuid.set(mesh.uuid, mesh);

    return { uuid: mesh.uuid };
  }

  // ============================================================
  // 3D Text
  // ============================================================

  private defaultFont: any = null;
  private fontLoader = new FontLoader();

  async addText3D(
    text: string,
    name: string,
    opts?: { size?: number; depth?: number; bevel?: boolean }
  ): Promise<{ uuid: string }> {
    // Load default font if not cached
    if (!this.defaultFont) {
      const fontUrl = "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/helvetiker_regular.typeface.json";
      this.defaultFont = await this.fontLoader.loadAsync(fontUrl);
    }

    const size = opts?.size ?? 0.5;
    const depth = opts?.depth ?? 0.2;
    const bevel = opts?.bevel ?? true;

    const geometry = new TextGeometry(text, {
      font: this.defaultFont,
      size,
      depth,
      curveSegments: 12,
      bevelEnabled: bevel,
      bevelThickness: 0.02,
      bevelSize: 0.01,
      bevelOffset: 0,
      bevelSegments: 5,
    });

    // Center the text
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    geometry.translate(
      -(bb.max.x - bb.min.x) / 2,
      -(bb.max.y - bb.min.y) / 2,
      -(bb.max.z - bb.min.z) / 2
    );

    const material = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.1,
      roughness: 0.4,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = 0.5;

    this.scene.add(mesh);
    this.objectByUuid.set(mesh.uuid, mesh);

    return { uuid: mesh.uuid };
  }

  /** Regenerate text geometry on an existing text mesh */
  async updateText3D(
    objectUuid: string,
    text: string,
    opts?: { size?: number; depth?: number; bevel?: boolean }
  ) {
    const obj = this.objectByUuid.get(objectUuid);
    if (!obj || !(obj instanceof THREE.Mesh)) return;

    if (!this.defaultFont) {
      const fontUrl = "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/helvetiker_regular.typeface.json";
      this.defaultFont = await this.fontLoader.loadAsync(fontUrl);
    }

    const size = opts?.size ?? 0.5;
    const depth = opts?.depth ?? 0.2;
    const bevel = opts?.bevel ?? true;

    obj.geometry.dispose();
    const geometry = new TextGeometry(text, {
      font: this.defaultFont,
      size,
      depth,
      curveSegments: 12,
      bevelEnabled: bevel,
      bevelThickness: 0.02,
      bevelSize: 0.01,
      bevelOffset: 0,
      bevelSegments: 5,
    });

    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    geometry.translate(
      -(bb.max.x - bb.min.x) / 2,
      -(bb.max.y - bb.min.y) / 2,
      -(bb.max.z - bb.min.z) / 2
    );

    obj.geometry = geometry;
  }

  // ============================================================
  // Shape Extrusion (Star, Heart, Arrow)
  // ============================================================

  addExtrudedShape(
    shapeType: "star" | "heart" | "arrow",
    name: string,
    depth = 0.3
  ): { uuid: string } {
    let shape: THREE.Shape;

    switch (shapeType) {
      case "star":
        shape = this.createStarShape(5, 0.5, 0.25);
        break;
      case "heart":
        shape = this.createHeartShape(0.5);
        break;
      case "arrow":
        shape = this.createArrowShape(0.6);
        break;
      default:
        shape = this.createStarShape(5, 0.5, 0.25);
    }

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 3,
    });

    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    geometry.translate(
      -(bb.max.x + bb.min.x) / 2,
      -(bb.max.y + bb.min.y) / 2,
      -(bb.max.z + bb.min.z) / 2
    );

    const material = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.4,
      metalness: 0.1,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = 0.5;

    this.scene.add(mesh);
    this.objectByUuid.set(mesh.uuid, mesh);

    return { uuid: mesh.uuid };
  }

  private createStarShape(points: number, outerR: number, innerR: number): THREE.Shape {
    const shape = new THREE.Shape();
    for (let i = 0; i < points * 2; i++) {
      const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    return shape;
  }

  private createHeartShape(scale: number): THREE.Shape {
    const s = scale;
    const shape = new THREE.Shape();
    shape.moveTo(0, s * 0.5);
    shape.bezierCurveTo(0, s * 0.7, -s * 0.6, s * 1.0, -s * 1.0, s * 0.5);
    shape.bezierCurveTo(-s * 1.0, 0, 0, -s * 0.4, 0, -s * 0.8);
    shape.bezierCurveTo(0, -s * 0.4, s * 1.0, 0, s * 1.0, s * 0.5);
    shape.bezierCurveTo(s * 0.6, s * 1.0, 0, s * 0.7, 0, s * 0.5);
    return shape;
  }

  private createArrowShape(size: number): THREE.Shape {
    const s = size;
    const shape = new THREE.Shape();
    shape.moveTo(0, s);
    shape.lineTo(s * 0.6, s * 0.3);
    shape.lineTo(s * 0.25, s * 0.3);
    shape.lineTo(s * 0.25, -s);
    shape.lineTo(-s * 0.25, -s);
    shape.lineTo(-s * 0.25, s * 0.3);
    shape.lineTo(-s * 0.6, s * 0.3);
    shape.closePath();
    return shape;
  }

  // ============================================================
  // Boolean Operations (CSG)
  // ============================================================

  booleanOp(
    objectAUuid: string,
    objectBUuid: string,
    operation: "subtract" | "union" | "intersect",
    resultName: string
  ): { uuid: string } | null {
    const objA = this.objectByUuid.get(objectAUuid);
    const objB = this.objectByUuid.get(objectBUuid);

    if (
      !objA || !objB ||
      !(objA instanceof THREE.Mesh) ||
      !(objB instanceof THREE.Mesh)
    ) {
      return null;
    }

    const evaluator = new Evaluator();
    const brushA = new Brush(objA.geometry.clone(), objA.material as THREE.Material);
    const brushB = new Brush(objB.geometry.clone(), objB.material as THREE.Material);

    // Apply world transforms to brushes
    brushA.applyMatrix4(objA.matrixWorld);
    brushB.applyMatrix4(objB.matrixWorld);
    brushA.updateMatrixWorld();
    brushB.updateMatrixWorld();

    let op;
    switch (operation) {
      case "subtract": op = SUBTRACTION; break;
      case "union": op = ADDITION; break;
      case "intersect": op = INTERSECTION; break;
    }

    const result = evaluator.evaluate(brushA, brushB, op);
    result.name = resultName;
    result.castShadow = true;
    result.receiveShadow = true;

    this.scene.add(result);
    this.objectByUuid.set(result.uuid, result);

    // Remove originals from scene
    this.removeObject(objectAUuid);
    this.removeObject(objectBUuid);

    return { uuid: result.uuid };
  }

  // ============================================================
  // Cloner (Grid/Radial/Linear)
  // ============================================================

  addCloner(
    sourceUuid: string,
    mode: "grid" | "radial" | "linear",
    name: string,
    opts?: {
      countX?: number; countY?: number; countZ?: number;
      spacingX?: number; spacingY?: number; spacingZ?: number;
      count?: number; radius?: number;
    }
  ): { uuid: string; childUuids: string[] } | null {
    const source = this.objectByUuid.get(sourceUuid);
    if (!source) return null;

    const group = new THREE.Group();
    group.name = name;
    const childUuids: string[] = [];

    switch (mode) {
      case "grid": {
        const cx = opts?.countX ?? 3;
        const cy = opts?.countY ?? 1;
        const cz = opts?.countZ ?? 3;
        const sx = opts?.spacingX ?? 1.2;
        const sy = opts?.spacingY ?? 1.2;
        const sz = opts?.spacingZ ?? 1.2;

        for (let x = 0; x < cx; x++) {
          for (let y = 0; y < cy; y++) {
            for (let z = 0; z < cz; z++) {
              const clone = source.clone(true);
              clone.position.set(
                (x - (cx - 1) / 2) * sx,
                (y - (cy - 1) / 2) * sy,
                (z - (cz - 1) / 2) * sz
              );
              group.add(clone);
              this.objectByUuid.set(clone.uuid, clone);
              childUuids.push(clone.uuid);
            }
          }
        }
        break;
      }
      case "radial": {
        const count = opts?.count ?? 8;
        const radius = opts?.radius ?? 2;

        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          const clone = source.clone(true);
          clone.position.set(
            Math.cos(angle) * radius,
            0,
            Math.sin(angle) * radius
          );
          clone.rotation.y = -angle;
          group.add(clone);
          this.objectByUuid.set(clone.uuid, clone);
          childUuids.push(clone.uuid);
        }
        break;
      }
      case "linear": {
        const count = opts?.count ?? 5;
        const sx = opts?.spacingX ?? 1.2;

        for (let i = 0; i < count; i++) {
          const clone = source.clone(true);
          clone.position.set((i - (count - 1) / 2) * sx, 0, 0);
          group.add(clone);
          this.objectByUuid.set(clone.uuid, clone);
          childUuids.push(clone.uuid);
        }
        break;
      }
    }

    this.scene.add(group);
    this.objectByUuid.set(group.uuid, group);

    return { uuid: group.uuid, childUuids };
  }

  // ============================================================
  // Duplicate Object
  // ============================================================

  duplicateObject(objectUuid: string): { uuid: string; transform: Transform } | null {
    const original = this.objectByUuid.get(objectUuid);
    if (!original) return null;

    const clone = original.clone(true);
    clone.name = original.name + "_copy";

    // Offset slightly so it's visible
    clone.position.x += 0.5;
    clone.position.z += 0.5;

    // Enable shadows on cloned meshes
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Clone material so it's independent
        child.material = child.material.clone();
      }
    });

    this.scene.add(clone);

    // Register the clone and its children
    clone.traverse((child) => {
      this.objectByUuid.set(child.uuid, child);
    });

    return {
      uuid: clone.uuid,
      transform: {
        position: [clone.position.x, clone.position.y, clone.position.z],
        rotation: [
          THREE.MathUtils.radToDeg(clone.rotation.x),
          THREE.MathUtils.radToDeg(clone.rotation.y),
          THREE.MathUtils.radToDeg(clone.rotation.z),
        ],
        scale: [clone.scale.x, clone.scale.y, clone.scale.z],
      },
    };
  }

  // ============================================================
  // Snapping
  // ============================================================

  setTransformSnap(snapValue: number | null) {
    if (snapValue) {
      this.gizmo.setTranslationSnap(snapValue);
      this.gizmo.setRotationSnap(THREE.MathUtils.degToRad(snapValue * 15));
      this.gizmo.setScaleSnap(snapValue);
    } else {
      this.gizmo.setTranslationSnap(null);
      this.gizmo.setRotationSnap(null);
      this.gizmo.setScaleSnap(null);
    }
  }

  // ============================================================
  // Grid Visibility
  // ============================================================

  setGridVisible(visible: boolean) {
    this.gridHelper.visible = visible;
  }

  // ============================================================
  // Transform
  // ============================================================

  setObjectTransform(objectUuid: string, t: Transform) {
    const obj = this.objectByUuid.get(objectUuid);
    if (!obj) return;
    obj.position.fromArray(t.position);
    obj.rotation.set(
      THREE.MathUtils.degToRad(t.rotation[0]),
      THREE.MathUtils.degToRad(t.rotation[1]),
      THREE.MathUtils.degToRad(t.rotation[2])
    );
    obj.scale.fromArray(t.scale);
    // Sync to physics body if present
    const body = this.bodyByUuid.get(objectUuid);
    if (body) {
      body.position.set(obj.position.x, obj.position.y, obj.position.z);
      body.quaternion.set(
        obj.quaternion.x,
        obj.quaternion.y,
        obj.quaternion.z,
        obj.quaternion.w
      );
    }
  }

  getObjectTransform(objectUuid: string): Transform | null {
    const obj = this.objectByUuid.get(objectUuid);
    if (!obj) return null;
    return {
      position: [obj.position.x, obj.position.y, obj.position.z],
      rotation: [
        THREE.MathUtils.radToDeg(obj.rotation.x),
        THREE.MathUtils.radToDeg(obj.rotation.y),
        THREE.MathUtils.radToDeg(obj.rotation.z),
      ],
      scale: [obj.scale.x, obj.scale.y, obj.scale.z],
    };
  }

  setObjectVisibility(objectUuid: string, visible: boolean) {
    const obj = this.objectByUuid.get(objectUuid);
    if (obj) obj.visible = visible;
  }

  // ============================================================
  // Picking
  // ============================================================

  pick(clientX: number, clientY: number): PickResult | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((clientY - rect.top) / rect.height) * 2 - 1);

    this.raycaster.setFromCamera(this.pointer, this.camera);

    // Build a set of top-level user objects (direct children of scene that
    // are registered in objectByUuid and aren't editor helpers / selection).
    const pickRoots: THREE.Object3D[] = [];
    for (const child of this.scene.children) {
      if (child.name.startsWith("__editor_")) continue;
      if (child.name.startsWith("__selection_")) continue;
      if (child === this.gridHelper) continue;
      if (child === this.gizmo.getHelper()) continue;
      // Must be a user object we track
      if (this.objectByUuid.has(child.uuid)) {
        pickRoots.push(child);
      }
    }

    const hits = this.raycaster.intersectObjects(pickRoots, true);
    if (hits.length === 0) return null;

    // Walk up from hit to find the nearest scene-level registered object
    let target: THREE.Object3D | null = hits[0]!.object;
    while (target) {
      // If this object is a direct child of the scene AND is registered → it's our target
      if (target.parent === this.scene && this.objectByUuid.has(target.uuid)) {
        break;
      }
      target = target.parent;
    }

    if (!target || !this.objectByUuid.has(target.uuid)) return null;

    return {
      objectUuid: target.uuid,
      point: hits[0]!.point,
    };
  }

  // ============================================================
  // Hover highlight
  // ============================================================

  updateHover(clientX: number, clientY: number) {
    const result = this.pick(clientX, clientY);

    // Clear previous hover
    if (this.hoveredObject) {
      if (this.hoveredObject instanceof THREE.Mesh) {
        const mat = this.hoveredObject.material as THREE.MeshStandardMaterial;
        if (mat.emissive) mat.emissive.copy(this.hoveredOriginalEmissive);
      }
      this.hoveredObject = null;
    }

    if (!result) return;

    const obj = this.objectByUuid.get(result.objectUuid);
    if (!obj) return;

    // For groups, find first mesh child for hover tint
    let mesh: THREE.Mesh | null = null;
    if (obj instanceof THREE.Mesh) {
      mesh = obj;
    } else {
      obj.traverse((child) => {
        if (!mesh && child instanceof THREE.Mesh) mesh = child;
      });
    }

    if (mesh) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat.emissive) {
        this.hoveredOriginalEmissive.copy(mat.emissive);
        mat.emissive.set(0x222233);
      }
      this.hoveredObject = mesh;
    }
  }

  // ============================================================
  // Selection Highlight — BoxHelper (built-in, always reliable)
  // ============================================================

  highlightSelected(objectUuid: string | null) {
    // Remove old helper
    if (this.selectionHelper) {
      this.scene.remove(this.selectionHelper);
      this.selectionHelper.dispose();
      this.selectionHelper = null;
    }

    if (!objectUuid) return;

    const obj = this.objectByUuid.get(objectUuid);
    if (!obj) return;

    // Create BoxHelper — bright blue bounding box
    this.selectionHelper = new THREE.BoxHelper(obj, 0x4da6ff);
    this.selectionHelper.name = "__selection_box";
    this.selectionHelper.raycast = () => {}; // not pickable
    this.scene.add(this.selectionHelper);
  }

  /** Call each frame to keep the box helper in sync */
  private updateSelectionHelper() {
    if (this.selectionHelper) {
      this.selectionHelper.update();
    }
  }

  // ============================================================
  // Gizmo
  // ============================================================

  attachGizmo(objectUuid: string | null) {
    if (!objectUuid) {
      this.gizmo.detach();
      return;
    }
    const obj = this.objectByUuid.get(objectUuid);
    if (obj) this.gizmo.attach(obj);
  }

  setGizmoMode(mode: GizmoMode) {
    this.gizmo.setMode(mode);
  }

  private handleGizmoChange() {
    const obj = this.gizmo.object;
    if (!obj || !this.onGizmoChange) return;

    const transform: Transform = {
      position: [obj.position.x, obj.position.y, obj.position.z],
      rotation: [
        THREE.MathUtils.radToDeg(obj.rotation.x),
        THREE.MathUtils.radToDeg(obj.rotation.y),
        THREE.MathUtils.radToDeg(obj.rotation.z),
      ],
      scale: [obj.scale.x, obj.scale.y, obj.scale.z],
    };

    this.onGizmoChange(obj.uuid, transform);
  }

  // ============================================================
  // Camera
  // ============================================================

  frameBounds(objectUuid?: string) {
    let box: THREE.Box3;
    if (objectUuid) {
      const obj = this.objectByUuid.get(objectUuid);
      if (!obj) return;
      box = new THREE.Box3().setFromObject(obj);
    } else {
      box = new THREE.Box3();
      this.scene.traverse((child) => {
        if (!child.name.startsWith("__editor_") && child instanceof THREE.Mesh) {
          box.expandByObject(child);
        }
      });
    }

    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const distance = size / (2 * Math.tan((this.camera.fov * Math.PI) / 360));

    this.orbit.target.copy(center);
    this.camera.position.copy(
      center.clone().add(new THREE.Vector3(distance * 0.7, distance * 0.5, distance * 0.7))
    );
    this.orbit.update();
  }

  // ============================================================
  // Material
  // ============================================================

  applyMaterial(objectUuid: string, materialProps: {
    color?: string;
    metalness?: number;
    roughness?: number;
    emissive?: string;
    emissiveIntensity?: number;
    opacity?: number;
    doubleSided?: boolean;
    transmission?: number;
    ior?: number;
    thickness?: number;
    clearcoat?: number;
    clearcoatRoughness?: number;
    sheen?: number;
    sheenColor?: string;
    iridescence?: number;
    wireframe?: boolean;
    flatShading?: boolean;
  }) {
    const obj = this.objectByUuid.get(objectUuid);
    if (!obj) return;

    // Cloner: apply to all mesh children
    if (obj instanceof THREE.Group) {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          this.applyMaterialToMesh(child as THREE.Mesh, materialProps);
        }
      });
      return;
    }

    if (!(obj instanceof THREE.Mesh)) return;
    this.applyMaterialToMesh(obj, materialProps);
  }

  private applyMaterialToMesh(
    obj: THREE.Mesh,
    materialProps: {
      color?: string;
      metalness?: number;
      roughness?: number;
      emissive?: string;
      emissiveIntensity?: number;
      opacity?: number;
      doubleSided?: boolean;
      transmission?: number;
      ior?: number;
      thickness?: number;
      clearcoat?: number;
      clearcoatRoughness?: number;
      sheen?: number;
      sheenColor?: string;
      iridescence?: number;
      wireframe?: boolean;
      flatShading?: boolean;
    }
  ) {

    let mat = obj.material as THREE.MeshPhysicalMaterial;

    // Upgrade to MeshPhysicalMaterial if needed (for glass/clearcoat/etc.)
    const needsPhysical =
      materialProps.transmission !== undefined ||
      materialProps.clearcoat !== undefined ||
      materialProps.sheen !== undefined ||
      materialProps.iridescence !== undefined ||
      materialProps.ior !== undefined;

    if (needsPhysical && !(mat instanceof THREE.MeshPhysicalMaterial)) {
      const oldMat = obj.material as THREE.MeshStandardMaterial;
      mat = new THREE.MeshPhysicalMaterial({
        color: oldMat.color,
        metalness: oldMat.metalness,
        roughness: oldMat.roughness,
        emissive: oldMat.emissive,
        emissiveIntensity: oldMat.emissiveIntensity,
        opacity: oldMat.opacity,
        transparent: oldMat.transparent,
        side: oldMat.side,
      });
      oldMat.dispose();
      obj.material = mat;
    }

    // Apply standard props
    if (materialProps.color !== undefined) mat.color.set(materialProps.color);
    if (materialProps.metalness !== undefined) mat.metalness = materialProps.metalness;
    if (materialProps.roughness !== undefined) mat.roughness = materialProps.roughness;
    if (materialProps.emissive !== undefined) mat.emissive.set(materialProps.emissive);
    if (materialProps.emissiveIntensity !== undefined) mat.emissiveIntensity = materialProps.emissiveIntensity;
    if (materialProps.opacity !== undefined) {
      mat.opacity = materialProps.opacity;
      mat.transparent = materialProps.opacity < 1 || (materialProps.transmission ?? 0) > 0;
    }
    if (materialProps.doubleSided !== undefined) {
      mat.side = materialProps.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    }
    if (materialProps.wireframe !== undefined) mat.wireframe = materialProps.wireframe;
    if (materialProps.flatShading !== undefined) {
      mat.flatShading = materialProps.flatShading;
      mat.needsUpdate = true;
    }

    // Physical material props
    if (mat instanceof THREE.MeshPhysicalMaterial) {
      if (materialProps.transmission !== undefined) {
        mat.transmission = materialProps.transmission;
        mat.transparent = true;
      }
      if (materialProps.ior !== undefined) mat.ior = materialProps.ior;
      if (materialProps.thickness !== undefined) mat.thickness = materialProps.thickness;
      if (materialProps.clearcoat !== undefined) mat.clearcoat = materialProps.clearcoat;
      if (materialProps.clearcoatRoughness !== undefined) mat.clearcoatRoughness = materialProps.clearcoatRoughness;
      if (materialProps.sheen !== undefined) mat.sheen = materialProps.sheen;
      if (materialProps.sheenColor !== undefined) mat.sheenColor.set(materialProps.sheenColor);
      if (materialProps.iridescence !== undefined) mat.iridescence = materialProps.iridescence;
    }

    mat.needsUpdate = true;
  }

  /** Read current material properties from a mesh (or first mesh in a Group/cloner) */
  getMaterialProps(objectUuid: string): Record<string, any> | null {
    const obj = this.objectByUuid.get(objectUuid);
    if (!obj) return null;

    let mesh: THREE.Mesh | null = null;
    if (obj instanceof THREE.Mesh) {
      mesh = obj;
    } else if (obj instanceof THREE.Group) {
      obj.traverse((child) => {
        if (!mesh && child instanceof THREE.Mesh) mesh = child;
      });
    }
    if (!mesh) return null;

    const mat = mesh.material as THREE.MeshPhysicalMaterial;
    const props: Record<string, any> = {
      color: "#" + mat.color.getHexString(),
      metalness: mat.metalness,
      roughness: mat.roughness,
      emissive: "#" + mat.emissive.getHexString(),
      emissiveIntensity: mat.emissiveIntensity,
      opacity: mat.opacity,
      wireframe: mat.wireframe,
      flatShading: mat.flatShading,
      doubleSided: mat.side === THREE.DoubleSide,
    };

    if (mat instanceof THREE.MeshPhysicalMaterial) {
      props.transmission = mat.transmission;
      props.ior = mat.ior;
      props.thickness = mat.thickness;
      props.clearcoat = mat.clearcoat;
      props.clearcoatRoughness = mat.clearcoatRoughness;
      props.sheen = mat.sheen;
      props.sheenColor = "#" + mat.sheenColor.getHexString();
      props.iridescence = mat.iridescence;
    }

    return props;
  }

  /** Apply a texture to a mesh's material map (or all meshes in a Group/cloner) */
  applyTexture(objectUuid: string, mapType: string, textureUrl: string | null) {
    const obj = this.objectByUuid.get(objectUuid);
    if (!obj) return;

    const meshes: THREE.Mesh[] = [];
    if (obj instanceof THREE.Mesh) {
      meshes.push(obj);
    } else if (obj instanceof THREE.Group) {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) meshes.push(child);
      });
    }
    if (meshes.length === 0) return;

    const loader = new THREE.TextureLoader();
    const applyToOne = (mat: THREE.MeshStandardMaterial) => {
      if (!textureUrl) {
        switch (mapType) {
          case "map": mat.map = null; break;
          case "normalMap": mat.normalMap = null; break;
          case "roughnessMap": mat.roughnessMap = null; break;
          case "metalnessMap": mat.metalnessMap = null; break;
          case "emissiveMap": mat.emissiveMap = null; break;
        }
        mat.needsUpdate = true;
        return;
      }
      const texture = loader.load(textureUrl, () => { mat.needsUpdate = true; });
      texture.colorSpace = mapType === "map" || mapType === "emissiveMap"
        ? THREE.SRGBColorSpace
        : THREE.LinearSRGBColorSpace;
      switch (mapType) {
        case "map": mat.map = texture; break;
        case "normalMap": mat.normalMap = texture; break;
        case "roughnessMap": mat.roughnessMap = texture; break;
        case "metalnessMap": mat.metalnessMap = texture; break;
        case "emissiveMap": mat.emissiveMap = texture; break;
      }
      mat.needsUpdate = true;
    };

    for (const mesh of meshes) {
      applyToOne(mesh.material as THREE.MeshStandardMaterial);
    }
  }

  // ============================================================
  // Stats
  // ============================================================

  getStats(): RenderStats {
    const info = this.renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  // ============================================================
  // Event Callbacks
  // ============================================================

  onGizmoTransformChange(cb: (uuid: string, transform: Transform) => void) {
    this.onGizmoChange = cb;
  }

  onRequestSelect(cb: (uuid: string | null) => void) {
    this.onSelectionRequest = cb;
  }

  // ============================================================
  // Remove Object
  // ============================================================

  removeObject(objectUuid: string) {
    const obj = this.objectByUuid.get(objectUuid);
    if (!obj) return;

    this.removePhysicsBody(objectUuid);
    this.removeParticleEmitter(objectUuid);
    obj.traverse((child) => { this.removePhysicsBody(child.uuid); });

    // Remove from scene
    obj.removeFromParent();

    // Cleanup
    obj.traverse((child) => {
      this.objectByUuid.delete(child.uuid);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }

  // ============================================================
  // Lights — Add/Update/Remove user lights
  // ============================================================

  addLight(
    kind: string,
    name: string,
    props?: Partial<LightData>
  ): { uuid: string } {
    let light: THREE.Light;

    switch (kind) {
      case "directional": {
        const dl = new THREE.DirectionalLight(
          props?.color ?? "#ffffff",
          props?.intensity ?? 1.0
        );
        dl.position.set(3, 5, 2);
        dl.castShadow = props?.castShadow ?? true;
        dl.shadow.mapSize.set(1024, 1024);
        dl.shadow.bias = -0.0001;
        light = dl;
        break;
      }
      case "point": {
        const pl = new THREE.PointLight(
          props?.color ?? "#ffffff",
          props?.intensity ?? 1.0,
          props?.distance ?? 0,
          props?.decay ?? 2
        );
        pl.position.set(0, 2, 0);
        pl.castShadow = props?.castShadow ?? false;
        light = pl;
        break;
      }
      case "spot": {
        const sl = new THREE.SpotLight(
          props?.color ?? "#ffffff",
          props?.intensity ?? 1.0,
          props?.distance ?? 0,
          props?.angle ?? Math.PI / 6,
          props?.penumbra ?? 0.1,
          props?.decay ?? 2
        );
        sl.position.set(0, 4, 2);
        sl.castShadow = props?.castShadow ?? true;
        sl.shadow.mapSize.set(1024, 1024);
        light = sl;
        break;
      }
      default: {
        const al = new THREE.AmbientLight(
          props?.color ?? "#ffffff",
          props?.intensity ?? 0.5
        );
        light = al;
        break;
      }
    }

    light.name = name;
    this.scene.add(light);
    this.objectByUuid.set(light.uuid, light);

    // Add a visual helper
    this.addLightHelper(light);

    return { uuid: light.uuid };
  }

  private addLightHelper(light: THREE.Light) {
    let helper: THREE.Object3D | null = null;

    if (light instanceof THREE.DirectionalLight) {
      helper = new THREE.DirectionalLightHelper(light, 0.5);
    } else if (light instanceof THREE.PointLight) {
      helper = new THREE.PointLightHelper(light, 0.3);
    } else if (light instanceof THREE.SpotLight) {
      helper = new THREE.SpotLightHelper(light);
    }

    if (helper) {
      helper.name = `__helper_${light.uuid}`;
      this.scene.add(helper);
      this.lightHelpers.set(light.uuid, helper);
    }
  }

  updateLight(objectUuid: string, props: Partial<LightData>) {
    const obj = this.objectByUuid.get(objectUuid);
    if (!obj || !(obj instanceof THREE.Light)) return;

    if (props.color !== undefined) obj.color.set(props.color);
    if (props.intensity !== undefined) obj.intensity = props.intensity;

    if (obj instanceof THREE.DirectionalLight || obj instanceof THREE.SpotLight || obj instanceof THREE.PointLight) {
      if (props.castShadow !== undefined) obj.castShadow = props.castShadow;
    }

    if (obj instanceof THREE.SpotLight) {
      if (props.angle !== undefined) obj.angle = props.angle;
      if (props.penumbra !== undefined) obj.penumbra = props.penumbra;
    }

    if (obj instanceof THREE.PointLight || obj instanceof THREE.SpotLight) {
      if (props.distance !== undefined) obj.distance = props.distance;
      if (props.decay !== undefined) obj.decay = props.decay;
    }

    // Update helper
    const helper = this.lightHelpers.get(objectUuid);
    if (helper) {
      if (helper instanceof THREE.DirectionalLightHelper) helper.update();
      if (helper instanceof THREE.SpotLightHelper) helper.update();
    }
  }

  getLightProps(objectUuid: string): Record<string, any> | null {
    const obj = this.objectByUuid.get(objectUuid);
    if (!obj || !(obj instanceof THREE.Light)) return null;

    const props: Record<string, any> = {
      color: "#" + obj.color.getHexString(),
      intensity: obj.intensity,
    };

    if (obj instanceof THREE.DirectionalLight || obj instanceof THREE.SpotLight || obj instanceof THREE.PointLight) {
      props.castShadow = obj.castShadow;
    }

    if (obj instanceof THREE.SpotLight) {
      props.angle = obj.angle;
      props.penumbra = obj.penumbra;
      props.distance = obj.distance;
      props.decay = obj.decay;
    }

    if (obj instanceof THREE.PointLight) {
      props.distance = obj.distance;
      props.decay = obj.decay;
    }

    return props;
  }

  // ============================================================
  // Scene Settings — Background, Fog, Post-Processing
  // ============================================================

  applySceneSettings(settings: SceneSettings) {
    // Background
    if (settings.backgroundType === "transparent") {
      this.renderer.setClearColor(0x000000, 0);
    } else {
      this.renderer.setClearColor(settings.backgroundColor, 1);
    }

    // Ambient light (editor built-in)
    const ambient = this.scene.getObjectByName("__editor_ambient");
    if (ambient instanceof THREE.AmbientLight) {
      ambient.color.set(settings.ambientLightColor);
      ambient.intensity = settings.ambientLightIntensity;
    }

    // Fog
    if (settings.fog.enabled) {
      if (settings.fog.type === "linear") {
        this.scene.fog = new THREE.Fog(
          settings.fog.color,
          settings.fog.near,
          settings.fog.far
        );
      } else {
        this.scene.fog = new THREE.FogExp2(
          settings.fog.color,
          settings.fog.density
        );
      }
    } else {
      this.scene.fog = null;
    }

    // Post-Processing
    const pp = settings.postProcessing;
    const anyPPEnabled = pp.bloom.enabled || pp.vignette.enabled;
    this.usePostProcessing = anyPPEnabled;

    // Bloom
    if (pp.bloom.enabled) {
      this.bloomEffect.intensity = pp.bloom.intensity;
      this.bloomEffect.luminanceMaterial.threshold = pp.bloom.threshold;
      this.bloomEffect.mipmapBlurPass.radius = pp.bloom.radius;
      this.bloomEffect.blendMode.opacity.value = 1;
    } else {
      this.bloomEffect.blendMode.opacity.value = 0;
    }

    // Vignette
    if (pp.vignette.enabled) {
      this.vignetteEffect.offset = pp.vignette.offset;
      this.vignetteEffect.darkness = pp.vignette.darkness;
      this.vignetteEffect.blendMode.opacity.value = 1;
    } else {
      this.vignetteEffect.blendMode.opacity.value = 0;
    }

    // Tone mapping exposure
    this.renderer.toneMappingExposure = pp.toneMappingExposure;
  }

  // ============================================================
  // HDRI Environment
  // ============================================================

  async loadHDRI(url: string, isEXR = false) {
    const loader = isEXR ? this.exrLoader : this.rgbeLoader;
    const texture = await loader.loadAsync(url);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.environment = texture;
    this.scene.background = texture;
  }

  clearEnvironment() {
    this.scene.environment = null;
    this.scene.background = null;
  }

  // ============================================================
  // Camera Presets
  // ============================================================

  // ============================================================
  // Scene Camera Markers (user-placed cameras)
  // ============================================================

  addCameraMarker(name: string): { uuid: string } {
    // Visual cone to represent a camera in the editor
    const coneGeo = new THREE.ConeGeometry(0.15, 0.3, 4);
    coneGeo.rotateX(Math.PI / 2);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x66aaff,
      wireframe: true,
    });
    const marker = new THREE.Mesh(coneGeo, coneMat);
    marker.name = name;
    marker.position.set(
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z
    );
    marker.lookAt(this.orbit.target);

    this.scene.add(marker);
    this.objectByUuid.set(marker.uuid, marker);
    this.cameraMarkers.set(marker.uuid, marker);

    return { uuid: marker.uuid };
  }

  removeCameraMarker(uuid: string) {
    const marker = this.cameraMarkers.get(uuid);
    if (marker) {
      this.scene.remove(marker);
      this.objectByUuid.delete(uuid);
      this.cameraMarkers.delete(uuid);
    }
  }

  /** Fly the editor camera to a camera marker position with smooth transition */
  flyToCamera(objectUuid: string, duration = 1.2) {
    const marker = this.objectByUuid.get(objectUuid);
    if (!marker) return;

    const fromPos = this.camera.position.clone();
    const toPos = marker.position.clone();

    // Target: look 2 units ahead of the marker's facing direction
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(marker.quaternion);
    const toTarget = marker.position.clone().add(dir.multiplyScalar(2));
    const fromTarget = this.orbit.target.clone();

    this.cameraTransition = {
      fromPos,
      toPos,
      fromTarget,
      toTarget,
      duration,
      elapsed: 0,
    };
  }

  /** Get all camera markers UUIDs for the viewer export */
  getCameraMarkerUuids(): string[] {
    return Array.from(this.cameraMarkers.keys());
  }

  setCameraPreset(preset: "front" | "back" | "left" | "right" | "top" | "perspective") {
    const distance = 5;
    this.orbit.target.set(0, 0, 0);

    switch (preset) {
      case "front":
        this.camera.position.set(0, 0, distance);
        break;
      case "back":
        this.camera.position.set(0, 0, -distance);
        break;
      case "left":
        this.camera.position.set(-distance, 0, 0);
        break;
      case "right":
        this.camera.position.set(distance, 0, 0);
        break;
      case "top":
        this.camera.position.set(0, distance, 0.01);
        break;
      case "perspective":
        this.camera.position.set(3, 2.5, 4);
        break;
    }

    this.camera.lookAt(0, 0, 0);
    this.orbit.update();
  }

  getCameraParams() {
    return {
      fov: this.camera.fov,
      near: this.camera.near,
      far: this.camera.far,
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z] as [number, number, number],
    };
  }

  setCameraParams(params: { fov?: number; near?: number; far?: number }) {
    if (params.fov !== undefined) this.camera.fov = params.fov;
    if (params.near !== undefined) this.camera.near = params.near;
    if (params.far !== undefined) this.camera.far = params.far;
    this.camera.updateProjectionMatrix();
  }

  // ============================================================
  // Dispose
  // ============================================================

  dispose() {
    cancelAnimationFrame(this.animFrameId);
    this.resizeObserver?.disconnect();
    if (this.selectionHelper) {
      this.scene.remove(this.selectionHelper);
      this.selectionHelper.dispose();
    }
    this.bodyByUuid.clear();
    this.world = null;
    this.gizmo.dispose();
    this.orbit.dispose();

    // Dispose all geometries and materials
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });

    this.renderer.dispose();
  }
}
