// ============================================================
// Timeline Runtime — Keyframe playback engine
// Interpolates properties over time based on keyframes
// ============================================================

import * as THREE from "three";
import type {
  AnimationClip,
  AnimationTrack,
  Keyframe,
  EasingType,
} from "../document/types";

// ── Easing (shared with interactionRuntime) ──

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
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

// ── Keyframe Interpolation ──

function interpolateKeyframes(keyframes: Keyframe[], time: number): number | string | boolean {
  if (keyframes.length === 0) return 0;
  if (keyframes.length === 1) return keyframes[0]!.value;

  // Before first keyframe
  if (time <= keyframes[0]!.time) return keyframes[0]!.value;

  // After last keyframe
  if (time >= keyframes[keyframes.length - 1]!.time) {
    return keyframes[keyframes.length - 1]!.value;
  }

  // Find surrounding keyframes
  for (let i = 0; i < keyframes.length - 1; i++) {
    const kf0 = keyframes[i]!;
    const kf1 = keyframes[i + 1]!;

    if (time >= kf0.time && time <= kf1.time) {
      const segmentDuration = kf1.time - kf0.time;
      if (segmentDuration === 0) return kf1.value;

      const localT = (time - kf0.time) / segmentDuration;
      const easedT = easings[kf1.easing]?.(localT) ?? localT;

      // Numeric interpolation
      if (typeof kf0.value === "number" && typeof kf1.value === "number") {
        return kf0.value + (kf1.value - kf0.value) * easedT;
      }

      // Color interpolation (hex strings)
      if (typeof kf0.value === "string" && typeof kf1.value === "string") {
        const c0 = new THREE.Color(kf0.value);
        const c1 = new THREE.Color(kf1.value);
        c0.lerp(c1, easedT);
        return "#" + c0.getHexString();
      }

      // Boolean — snap at 50%
      if (typeof kf0.value === "boolean") {
        return easedT >= 0.5 ? kf1.value : kf0.value;
      }

      return kf1.value;
    }
  }

  return keyframes[keyframes.length - 1]!.value;
}

// ── Timeline Runtime ──

export type PlaybackState = "stopped" | "playing" | "paused";

export class TimelineRuntime {
  private objectByUuid: Map<string, THREE.Object3D>;
  private getNodeUuid: (nodeId: string) => string | undefined;

  // Playback state
  private _state: PlaybackState = "stopped";
  private _currentTime = 0; // seconds
  private _clip: AnimationClip | null = null;
  private lastTimestamp = 0;
  private rafId = 0;

  // Listeners
  private listeners = new Set<() => void>();

  constructor(
    objectByUuid: Map<string, THREE.Object3D>,
    getNodeUuid: (nodeId: string) => string | undefined
  ) {
    this.objectByUuid = objectByUuid;
    this.getNodeUuid = getNodeUuid;
  }

  // ── Getters ──

  get state() { return this._state; }
  get currentTime() { return this._currentTime; }
  get clip() { return this._clip; }
  get duration() { return this._clip?.duration ?? 0; }

  // ── Subscribe to changes ──

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  // ── Set Active Clip ──

  setClip(clip: AnimationClip | null) {
    this.stop();
    this._clip = clip;
    this._currentTime = 0;
    this.notify();
  }

  // ── Playback Controls ──

  play() {
    if (!this._clip) return;
    if (this._state === "playing") return;

    this._state = "playing";
    this.lastTimestamp = performance.now();
    this.tick();
    this.notify();
  }

  pause() {
    if (this._state !== "playing") return;
    this._state = "paused";
    cancelAnimationFrame(this.rafId);
    this.notify();
  }

  stop() {
    this._state = "stopped";
    this._currentTime = 0;
    cancelAnimationFrame(this.rafId);
    this.notify();
  }

  /** Seek to a specific time */
  seek(time: number) {
    this._currentTime = Math.max(0, Math.min(time, this.duration));
    if (this._clip) {
      this.applyClipAtTime(this._clip, this._currentTime);
    }
    this.notify();
  }

  // ── Tick ──

  private tick = () => {
    if (this._state !== "playing" || !this._clip) return;
    this.rafId = requestAnimationFrame(this.tick);

    const now = performance.now();
    const dt = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;

    this._currentTime += dt;

    if (this._currentTime >= this._clip.duration) {
      if (this._clip.loop) {
        this._currentTime = this._currentTime % this._clip.duration;
      } else {
        this._currentTime = this._clip.duration;
        this._state = "stopped";
        cancelAnimationFrame(this.rafId);
      }
    }

    this.applyClipAtTime(this._clip, this._currentTime);
    this.notify();
  };

  // ── Apply all tracks at a given time ──

  private applyClipAtTime(clip: AnimationClip, time: number) {
    for (const track of clip.tracks) {
      this.applyTrack(track, time);
    }
  }

  private applyTrack(track: AnimationTrack, time: number) {
    const uuid = this.getNodeUuid(track.nodeId);
    if (!uuid) return;

    const obj = this.objectByUuid.get(uuid);
    if (!obj) return;

    const value = interpolateKeyframes(track.keyframes, time);

    switch (track.property) {
      case "position.x": obj.position.x = value as number; break;
      case "position.y": obj.position.y = value as number; break;
      case "position.z": obj.position.z = value as number; break;
      case "rotation.x": obj.rotation.x = THREE.MathUtils.degToRad(value as number); break;
      case "rotation.y": obj.rotation.y = THREE.MathUtils.degToRad(value as number); break;
      case "rotation.z": obj.rotation.z = THREE.MathUtils.degToRad(value as number); break;
      case "scale.x": obj.scale.x = value as number; break;
      case "scale.y": obj.scale.y = value as number; break;
      case "scale.z": obj.scale.z = value as number; break;
      case "visible": obj.visible = value as boolean; break;
      case "opacity": {
        if (obj instanceof THREE.Mesh) {
          const mat = obj.material as THREE.MeshStandardMaterial;
          mat.opacity = value as number;
          mat.transparent = mat.opacity < 1;
        }
        break;
      }
      case "materialColor": {
        if (obj instanceof THREE.Mesh) {
          const mat = obj.material as THREE.MeshStandardMaterial;
          mat.color.set(value as string);
        }
        break;
      }
      case "emissiveIntensity": {
        if (obj instanceof THREE.Mesh) {
          const mat = obj.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = value as number;
        }
        break;
      }
    }
  }

  // ── Cleanup ──

  dispose() {
    this.stop();
    this.listeners.clear();
  }
}
