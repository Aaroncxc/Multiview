// ============================================================
// Interaction Runtime — Listens for events, runs actions
// The "brain" of the interaction system
// ============================================================

import * as THREE from "three";
import type {
  SceneNode,
  SceneDocument,
  ObjectState,
  InteractionAction,
  InteractionEvent,
  StateOverrides,
  EasingType,
} from "../document/types";

// ── Easing Functions ──

const easings: Record<EasingType, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - (1 - t) ** 3,
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  spring: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  bounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

// ── Active Transition ──

interface ActiveTransition {
  nodeUuid: string;
  fromOverrides: StateOverrides;
  toOverrides: StateOverrides;
  duration: number;
  easing: EasingType;
  elapsed: number;
  onComplete?: () => void;
}

// ── Interaction Runtime ──

export class InteractionRuntime {
  private objectByUuid: Map<string, THREE.Object3D>;
  private getDocument: () => SceneDocument;
  private transitions: ActiveTransition[] = [];
  private activeStatePerNode = new Map<string, string>(); // nodeId → stateId
  private pendingDelays = new Map<string, ReturnType<typeof setTimeout>>(); // nodeUuid → timeout
  private running = false;
  private rafId = 0;
  private lastTime = 0;

  constructor(
    objectByUuid: Map<string, THREE.Object3D>,
    getDocument: () => SceneDocument,
  ) {
    this.objectByUuid = objectByUuid;
    this.getDocument = getDocument;
  }

  // ── Start / Stop ──

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.tick();

    // Fire "start" events
    this.fireEventForAll("start");
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.transitions = [];
    // Clear all pending delays
    for (const timeout of this.pendingDelays.values()) {
      clearTimeout(timeout);
    }
    this.pendingDelays.clear();
  }

  // ── Tick (animation loop for transitions) ──

  private tick = () => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const now = performance.now();
    const dt = (now - this.lastTime) / 1000; // seconds
    this.lastTime = now;

    // Update active transitions
    for (let i = this.transitions.length - 1; i >= 0; i--) {
      const tr = this.transitions[i]!;
      tr.elapsed += dt * 1000; // ms

      const progress = Math.min(tr.elapsed / tr.duration, 1);
      const easedT = easings[tr.easing](progress);

      this.applyInterpolatedOverrides(tr.nodeUuid, tr.fromOverrides, tr.toOverrides, easedT);

      if (progress >= 1) {
        tr.onComplete?.();
        this.transitions.splice(i, 1);
      }
    }
  };

  // ── Apply interpolated overrides to a 3D object ──

  private applyInterpolatedOverrides(
    nodeUuid: string,
    from: StateOverrides,
    to: StateOverrides,
    t: number
  ) {
    const obj = this.objectByUuid.get(nodeUuid);
    if (!obj) return;

    // Position
    if (to.position) {
      const fp = from.position ?? [obj.position.x, obj.position.y, obj.position.z];
      obj.position.set(
        fp[0] + (to.position[0] - fp[0]) * t,
        fp[1] + (to.position[1] - fp[1]) * t,
        fp[2] + (to.position[2] - fp[2]) * t
      );
    }

    // Rotation (degrees → radians)
    if (to.rotation) {
      const fr = from.rotation ?? [
        THREE.MathUtils.radToDeg(obj.rotation.x),
        THREE.MathUtils.radToDeg(obj.rotation.y),
        THREE.MathUtils.radToDeg(obj.rotation.z),
      ];
      obj.rotation.set(
        THREE.MathUtils.degToRad(fr[0] + (to.rotation[0] - fr[0]) * t),
        THREE.MathUtils.degToRad(fr[1] + (to.rotation[1] - fr[1]) * t),
        THREE.MathUtils.degToRad(fr[2] + (to.rotation[2] - fr[2]) * t)
      );
    }

    // Scale
    if (to.scale) {
      const fs = from.scale ?? [obj.scale.x, obj.scale.y, obj.scale.z];
      obj.scale.set(
        fs[0] + (to.scale[0] - fs[0]) * t,
        fs[1] + (to.scale[1] - fs[1]) * t,
        fs[2] + (to.scale[2] - fs[2]) * t
      );
    }

    // Visibility
    if (to.visible !== undefined && t >= 0.5) {
      obj.visible = to.visible;
    }

    // Material color
    const mesh = obj instanceof THREE.Mesh ? obj : null;
    if (mesh) {
      const mat = mesh.material as THREE.MeshStandardMaterial;

      if (to.materialColor && mat.color) {
        const fromColor = new THREE.Color(from.materialColor ?? `#${mat.color.getHexString()}`);
        const toColor = new THREE.Color(to.materialColor);
        mat.color.copy(fromColor).lerp(toColor, t);
      }

      if (to.opacity !== undefined) {
        const fo = from.opacity ?? mat.opacity;
        mat.opacity = fo + (to.opacity - fo) * t;
        mat.transparent = mat.opacity < 1;
      }

      if (to.emissive && mat.emissive) {
        const fromE = new THREE.Color(from.emissive ?? `#${mat.emissive.getHexString()}`);
        const toE = new THREE.Color(to.emissive);
        mat.emissive.copy(fromE).lerp(toE, t);
      }

      if (to.emissiveIntensity !== undefined) {
        const fei = from.emissiveIntensity ?? mat.emissiveIntensity;
        mat.emissiveIntensity = fei + (to.emissiveIntensity - fei) * t;
      }
    }
  }

  // ── Transition to State ──

  transitionToState(
    node: SceneNode,
    state: ObjectState,
    duration = 300,
    easing: EasingType = "easeInOut",
    delay = 0
  ) {
    if (!node.runtimeObjectUuid) return;

    const nodeUuid = node.runtimeObjectUuid;
    const obj = this.objectByUuid.get(nodeUuid);
    if (!obj) return;

    // Cancel any pending delay for this node
    const pendingTimeout = this.pendingDelays.get(nodeUuid);
    if (pendingTimeout !== undefined) {
      clearTimeout(pendingTimeout);
      this.pendingDelays.delete(nodeUuid);
    }

    const startTransition = () => {
      this.pendingDelays.delete(nodeUuid);

      // Capture current as "from" (at the moment the transition actually starts,
      // not when it was requested — this avoids stale captures when delay > 0)
      const fromOverrides = this.captureCurrentOverrides(obj);

      // Remove any existing transition for this node
      this.transitions = this.transitions.filter(
        (tr) => tr.nodeUuid !== nodeUuid
      );

      // Clamp duration to minimum 1ms to avoid division by zero
      const safeDuration = Math.max(duration, 1);

      this.transitions.push({
        nodeUuid,
        fromOverrides,
        toOverrides: state.overrides,
        duration: safeDuration,
        easing,
        elapsed: 0,
        onComplete: () => {
          this.activeStatePerNode.set(node.id, state.id);
        },
      });
    };

    if (delay > 0) {
      const timeoutId = setTimeout(startTransition, delay);
      this.pendingDelays.set(nodeUuid, timeoutId);
    } else {
      startTransition();
    }
  }

  private captureCurrentOverrides(obj: THREE.Object3D): StateOverrides {
    const overrides: StateOverrides = {
      position: [obj.position.x, obj.position.y, obj.position.z],
      rotation: [
        THREE.MathUtils.radToDeg(obj.rotation.x),
        THREE.MathUtils.radToDeg(obj.rotation.y),
        THREE.MathUtils.radToDeg(obj.rotation.z),
      ],
      scale: [obj.scale.x, obj.scale.y, obj.scale.z],
      visible: obj.visible,
    };

    if (obj instanceof THREE.Mesh) {
      const mat = obj.material as THREE.MeshStandardMaterial;
      if (mat.color) overrides.materialColor = "#" + mat.color.getHexString();
      overrides.opacity = mat.opacity;
      if (mat.emissive) overrides.emissive = "#" + mat.emissive.getHexString();
      overrides.emissiveIntensity = mat.emissiveIntensity;
    }

    return overrides;
  }

  // ── Execute Action ──

  executeAction(action: InteractionAction, sourceNode: SceneNode) {
    const doc = this.getDocument();

    switch (action.type) {
      case "transitionToState": {
        const targetNode = action.targetNodeId
          ? doc.nodes[action.targetNodeId]
          : sourceNode;
        if (!targetNode?.interactions) return;

        const state = targetNode.interactions.states.find(
          (s) => s.id === action.targetStateId
        );
        if (state) {
          this.transitionToState(
            targetNode,
            state,
            action.duration ?? 300,
            action.easing ?? "easeInOut",
            action.delay ?? 0
          );
        }
        break;
      }

      case "toggleState": {
        const targetNode = action.targetNodeId
          ? doc.nodes[action.targetNodeId]
          : sourceNode;
        if (!targetNode?.interactions) return;

        const currentState = this.activeStatePerNode.get(targetNode.id);
        const nextStateId =
          currentState === action.stateA ? action.stateB : action.stateA;
        const state = targetNode.interactions.states.find(
          (s) => s.id === nextStateId
        );
        if (state) {
          this.transitionToState(
            targetNode,
            state,
            action.duration ?? 300,
            action.easing ?? "easeInOut",
            action.delay ?? 0
          );
        }
        break;
      }

      case "openLink": {
        if (action.url) window.open(action.url, "_blank");
        break;
      }

      case "setVariable": {
        // Dispatch for UI/store to handle
        if (action.variableId !== undefined) {
          window.dispatchEvent(
            new CustomEvent("editor:set-variable", {
              detail: { id: action.variableId, value: action.variableValue },
            })
          );
        }
        break;
      }

      case "playAnimation": {
        // Dispatch animation play event
        if (action.animationName) {
          window.dispatchEvent(
            new CustomEvent("editor:play-animation", {
              detail: { name: action.animationName },
            })
          );
        }
        break;
      }
    }
  }

  // ── Fire event for a specific node ──

  fireEvent(nodeId: string, trigger: string) {
    const doc = this.getDocument();
    const node = doc.nodes[nodeId];
    if (!node?.interactions) return;

    for (const evt of node.interactions.events) {
      if (evt.trigger === trigger) {
        const action = node.interactions.actions.find(
          (a) => a.id === evt.actionId
        );
        if (action) {
          this.executeAction(action, node);
        }
      }
    }
  }

  // ── Fire event for all nodes (e.g., "start") ──

  fireEventForAll(trigger: string) {
    const doc = this.getDocument();
    for (const node of Object.values(doc.nodes)) {
      if (node.interactions) {
        this.fireEvent(node.id, trigger);
      }
    }
  }

  // ── Get current active state ──

  getActiveState(nodeId: string): string | undefined {
    return this.activeStatePerNode.get(nodeId);
  }
}
