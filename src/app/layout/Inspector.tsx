// ============================================================
// Inspector — Property panel for selected node
// Phase 2: + Full Material Editor with Color Picker, Sliders,
//            Presets, Texture Upload, Glass/Emissive support
// Apple HIG: Contextual, clear labels, scrub-on-label
// ============================================================

import React, { useState, useEffect, useRef } from "react";
import { useEditorStore } from "../../store/editorStore";
import { ColorPicker } from "../../ui/ColorPicker";
import { Slider } from "../../ui/Slider";
import { showToast } from "../../ui/Toast";
import {
  MATERIAL_PRESETS,
  PRESET_CATEGORIES,
  type MaterialPreset,
} from "../../core/materials/presets";
import type {
  ClonerOpts,
  RigidBodyData,
  ParticleEmitterData,
} from "../../core/document/types";
import { ScenePanel } from "./ScenePanel";
import { InteractionsPanel } from "./InteractionsPanel";
import "./Inspector.css";

// ── Numeric Field with drag-to-scrub ──

interface NumericFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  precision?: number;
  color?: string;
}

const NumericField: React.FC<NumericFieldProps> = ({
  label,
  value,
  onChange,
  step = 0.1,
  precision = 2,
  color,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) onChange(v);
  };

  const handleDragStart = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const startVal = value;

    const onMove = (ev: MouseEvent) => {
      const delta = (ev.clientX - startX) * (ev.shiftKey ? 1.0 : 0.1);
      const newVal =
        Math.round((startVal + delta) * 10 ** precision) / 10 ** precision;
      onChange(newVal);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "ew-resize";
  };

  return (
    <div className="numeric-field">
      <label
        className="numeric-label"
        onMouseDown={handleDragStart}
        style={color ? { color } : undefined}
        title={`Drag to scrub ${label}`}
      >
        {label}
      </label>
      <input
        type="number"
        className="numeric-input"
        value={Number(value.toFixed(precision))}
        onChange={handleChange}
        step={step}
      />
    </div>
  );
};

// ── Transform Section ──

const TransformSection: React.FC = () => {
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const document = useEditorStore((s) => s.document);
  const updateTransform = useEditorStore((s) => s.updateNodeTransform);

  const node = selectedNodeId ? document.nodes[selectedNodeId] : null;
  if (!node) return null;

  const { position, rotation, scale } = node.transform;

  const dispatchTransformUpdate = (nodeId: string, uuid: string | undefined) => {
    if (uuid) {
      window.dispatchEvent(
        new CustomEvent("editor:update-transform", {
          detail: { nodeId, uuid },
        })
      );
    }
  };

  const setPos = (axis: 0 | 1 | 2, val: number) => {
    const newPos: [number, number, number] = [...position];
    newPos[axis] = val;
    updateTransform(node.id, { position: newPos });
    dispatchTransformUpdate(node.id, node.runtimeObjectUuid);
  };

  const setRot = (axis: 0 | 1 | 2, val: number) => {
    const newRot: [number, number, number] = [...rotation];
    newRot[axis] = val;
    updateTransform(node.id, { rotation: newRot });
    dispatchTransformUpdate(node.id, node.runtimeObjectUuid);
  };

  const setScale = (axis: 0 | 1 | 2, val: number) => {
    const newScale: [number, number, number] = [...scale];
    newScale[axis] = val;
    updateTransform(node.id, { scale: newScale });
    dispatchTransformUpdate(node.id, node.runtimeObjectUuid);
  };

  const axisColors = ["var(--gizmo-x)", "var(--gizmo-y)", "var(--gizmo-z)"];
  const axisLabels = ["X", "Y", "Z"];

  return (
    <div className="inspector-section">
      <span className="inspector-section-label">Transform</span>
      <div className="inspector-subsection">
        <span className="inspector-subsection-label">Position</span>
        <div className="inspector-row-3">
          {([0, 1, 2] as const).map((i) => (
            <NumericField
              key={`pos-${i}`}
              label={axisLabels[i]!}
              value={position[i]}
              onChange={(v) => setPos(i, v)}
              color={axisColors[i]}
            />
          ))}
        </div>
      </div>
      <div className="inspector-subsection">
        <span className="inspector-subsection-label">Rotation</span>
        <div className="inspector-row-3">
          {([0, 1, 2] as const).map((i) => (
            <NumericField
              key={`rot-${i}`}
              label={axisLabels[i]!}
              value={rotation[i]}
              onChange={(v) => setRot(i, v)}
              step={1}
              precision={1}
              color={axisColors[i]}
            />
          ))}
        </div>
      </div>
      <div className="inspector-subsection">
        <span className="inspector-subsection-label">Scale</span>
        <div className="inspector-row-3">
          {([0, 1, 2] as const).map((i) => (
            <NumericField
              key={`scl-${i}`}
              label={axisLabels[i]!}
              value={scale[i]}
              onChange={(v) => setScale(i, v)}
              step={0.1}
              color={axisColors[i]}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Camera Section ──

const CameraNodeSection: React.FC = () => {
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const document = useEditorStore((s) => s.document);
  const updateDocument = useEditorStore((s) => s.updateDocument);
  const node = selectedNodeId ? document.nodes[selectedNodeId] : null;

  if (!node || node.type !== "camera") return null;

  const cam = node.cameraData ?? { fov: 45, label: node.name };

  const updateCam = (changes: Partial<{ fov: number; label: string }>) => {
    const newDoc = structuredClone(document);
    newDoc.nodes[node.id]!.cameraData = { ...cam, ...changes };
    updateDocument(newDoc);
  };

  const handleFly = () => {
    if (!node.runtimeObjectUuid) return;
    window.dispatchEvent(
      new CustomEvent("editor:fly-to-camera", {
        detail: { uuid: node.runtimeObjectUuid },
      })
    );
  };

  return (
    <div className="inspector-section">
      <span className="inspector-section-label">Camera</span>
      <div className="inspector-subsection">
        <label className="inspector-subsection-label">Label</label>
        <input
          className="inspector-name-input"
          value={cam.label}
          onChange={(e) => updateCam({ label: e.target.value })}
          spellCheck={false}
          style={{ width: "100%" }}
        />
      </div>
      <div className="inspector-subsection">
        <NumericField
          label="FOV"
          value={cam.fov}
          onChange={(v) => updateCam({ fov: Math.max(10, Math.min(120, v)) })}
          step={1}
          precision={0}
        />
      </div>
      <button
        className="modeling-btn"
        style={{ width: "100%", marginTop: 6 }}
        onClick={handleFly}
      >
        Fly to Camera
      </button>
    </div>
  );
};

// ── Text3D Section ──

const Text3DSection: React.FC = () => {
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const document = useEditorStore((s) => s.document);
  const updateDocument = useEditorStore((s) => s.updateDocument);
  const node = selectedNodeId ? document.nodes[selectedNodeId] : null;

  if (!node || !node.mesh || node.mesh.geometryType !== "text3d") return null;

  const text = node.mesh.text3dContent ?? "Hello";
  const size = node.mesh.text3dSize ?? 0.5;
  const depth = node.mesh.text3dDepth ?? 0.2;
  const bevel = node.mesh.text3dBevel ?? true;

  const update = (changes: Partial<{
    text3dContent: string;
    text3dSize: number;
    text3dDepth: number;
    text3dBevel: boolean;
  }>) => {
    const newDoc = structuredClone(document);
    const n = newDoc.nodes[node.id]!;
    n.mesh = { ...n.mesh!, ...changes };
    updateDocument(newDoc);
    // Dispatch to viewport to regenerate
    const newText = changes.text3dContent ?? text;
    const newSize = changes.text3dSize ?? size;
    const newDepth = changes.text3dDepth ?? depth;
    const newBevel = changes.text3dBevel ?? bevel;
    if (node.runtimeObjectUuid) {
      window.dispatchEvent(
        new CustomEvent("editor:update-text3d", {
          detail: {
            uuid: node.runtimeObjectUuid,
            text: newText,
            opts: { size: newSize, depth: newDepth, bevel: newBevel },
          },
        })
      );
    }
  };

  return (
    <div className="inspector-section">
      <span className="inspector-section-label">3D Text</span>
      <div className="inspector-subsection">
        <label className="inspector-subsection-label">Content</label>
        <input
          className="inspector-name-input"
          value={text}
          onChange={(e) => update({ text3dContent: e.target.value })}
          spellCheck={false}
          style={{ width: "100%" }}
        />
      </div>
      <div className="inspector-subsection">
        <NumericField
          label="Size"
          value={size}
          onChange={(v) => update({ text3dSize: Math.max(0.05, v) })}
          step={0.05}
        />
      </div>
      <div className="inspector-subsection">
        <NumericField
          label="Depth"
          value={depth}
          onChange={(v) => update({ text3dDepth: Math.max(0.01, v) })}
          step={0.05}
        />
      </div>
      <div className="inspector-subsection inspector-toggles">
        <label className="inspector-toggle">
          <input
            type="checkbox"
            checked={bevel}
            onChange={(e) => update({ text3dBevel: e.target.checked })}
          />
          <span>Bevel</span>
        </label>
      </div>
    </div>
  );
};

// ── Physics Section (Rigid Body) ──

const PhysicsSection: React.FC = () => {
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const document = useEditorStore((s) => s.document);
  const updateDocument = useEditorStore((s) => s.updateDocument);
  const node = selectedNodeId ? document.nodes[selectedNodeId] : null;

  if (!node || node.type !== "mesh" || !node.runtimeObjectUuid) return null;

  const rb: RigidBodyData = node.rigidBody ?? {
    enabled: false,
    mass: 1,
    gravityScale: 1,
  };

  const updateRb = (next: Partial<RigidBodyData>) => {
    const newDoc = structuredClone(document);
    const n = newDoc.nodes[node.id]!;
    n.rigidBody = { ...rb, ...next };
    updateDocument(newDoc);
    window.dispatchEvent(
      new CustomEvent("editor:set-physics", {
        detail: {
          uuid: node.runtimeObjectUuid,
          enabled: next.enabled ?? rb.enabled,
          mass: next.mass ?? rb.mass,
          gravityScale: next.gravityScale ?? rb.gravityScale ?? 1,
        },
      })
    );
  };

  return (
    <div className="inspector-section">
      <span className="inspector-section-label">Physics</span>
      <div className="inspector-subsection inspector-toggles">
        <label className="inspector-toggle">
          <input
            type="checkbox"
            checked={rb.enabled}
            onChange={(e) => updateRb({ enabled: e.target.checked })}
          />
          <span>Rigid Body</span>
        </label>
      </div>
      {rb.enabled && (
        <>
          <div className="inspector-subsection">
            <NumericField
              label="Mass (kg)"
              value={rb.mass}
              onChange={(v) => updateRb({ mass: Math.max(0, v) })}
              step={0.5}
              precision={1}
            />
          </div>
          <div className="inspector-subsection">
            <NumericField
              label="Gravity Scale"
              value={rb.gravityScale ?? 1}
              onChange={(v) => updateRb({ gravityScale: Math.max(0, v) })}
              step={0.1}
              precision={1}
            />
          </div>
        </>
      )}
    </div>
  );
};

// ── Material Section ──

const MaterialSection: React.FC = () => {
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const document = useEditorStore((s) => s.document);
  const node = selectedNodeId ? document.nodes[selectedNodeId] : null;

  const [matProps, setMatProps] = useState<Record<string, any>>({});
  const [showPresets, setShowPresets] = useState(false);
  const [activeCategory, setActiveCategory] = useState(PRESET_CATEGORIES[0]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load material props from backend when selection changes
  useEffect(() => {
    if (!node?.runtimeObjectUuid) return;
    // Request material props via custom event
    window.dispatchEvent(
      new CustomEvent("editor:get-material", {
        detail: { uuid: node.runtimeObjectUuid },
      })
    );

    const handleMaterialData = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (data) setMatProps(data);
    };

    window.addEventListener("editor:material-data", handleMaterialData);
    return () =>
      window.removeEventListener("editor:material-data", handleMaterialData);
  }, [node?.runtimeObjectUuid, selectedNodeId]);

  if (!node || node.type !== "mesh") return null;

  const textureSlots = [
    { key: "map", label: "Albedo" },
    { key: "normalMap", label: "Normal" },
    { key: "roughnessMap", label: "Rough" },
    { key: "metalnessMap", label: "Metal" },
    { key: "emissiveMap", label: "Emissive" },
  ] as const;

  const textureMaps = (matProps.textureMaps ??
    {}) as Record<
    (typeof textureSlots)[number]["key"],
    { url: string | null; name: string | null } | null
  >;

  const updateMaterial = (key: string, value: any) => {
    const newProps = { ...matProps, [key]: value };
    setMatProps(newProps);

    if (node.runtimeObjectUuid) {
      window.dispatchEvent(
        new CustomEvent("editor:apply-material", {
          detail: { uuid: node.runtimeObjectUuid, props: { [key]: value } },
        })
      );
    }
  };

  const applyPreset = (preset: MaterialPreset) => {
    setMatProps({ ...matProps, ...preset.props });
    if (node.runtimeObjectUuid) {
      window.dispatchEvent(
        new CustomEvent("editor:apply-material", {
          detail: { uuid: node.runtimeObjectUuid, props: preset.props },
        })
      );
    }
    showToast(`Applied ${preset.name}`, "info");
    setShowPresets(false);
  };

  const handleTextureUpload = (mapType: string) => {
    const input = window.document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file || !node.runtimeObjectUuid) return;

      if (file.size > 10 * 1024 * 1024) {
        showToast("File too large (max 10MB)", "error");
        return;
      }

      const url = URL.createObjectURL(file);
      window.dispatchEvent(
        new CustomEvent("editor:apply-texture", {
          detail: { uuid: node.runtimeObjectUuid, mapType, url, fileName: file.name },
        })
      );

      // Keep inspector UI immediately in sync without waiting for re-select.
      setMatProps((prev) => {
        const prevMaps = (prev.textureMaps ??
          {}) as Record<string, { url: string | null; name: string | null } | null>;
        return {
          ...prev,
          textureMaps: {
            ...prevMaps,
            [mapType]: { url, name: file.name },
          },
        };
      });

      const mapLabel = textureSlots.find((slot) => slot.key === mapType)?.label ?? mapType;
      showToast(`${mapLabel} map updated`, "success");
    };
    input.click();
  };

  return (
    <div className="inspector-section">
      <div className="inspector-section-header">
        <span className="inspector-section-label">Material</span>
        <button
          className="inspector-section-btn"
          onClick={() => setShowPresets(!showPresets)}
          title="Material presets"
        >
          {showPresets ? "Close" : "Presets"}
        </button>
      </div>

      {/* ── Preset Browser ── */}
      {showPresets && (
        <div className="material-presets">
          <div className="material-preset-tabs">
            {PRESET_CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`material-preset-tab ${activeCategory === cat ? "active" : ""}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="material-preset-grid">
            {MATERIAL_PRESETS.filter((p) => p.category === activeCategory).map(
              (preset) => (
                <button
                  key={preset.name}
                  className="material-preset-item"
                  onClick={() => applyPreset(preset)}
                  title={preset.name}
                >
                  <span
                    className="material-preset-swatch"
                    style={{ backgroundColor: preset.props.color }}
                  />
                  <span className="material-preset-name">{preset.name}</span>
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* ── Base Properties ── */}
      <div className="inspector-subsection">
        <ColorPicker
          label="Color"
          value={matProps.color ?? "#cccccc"}
          onChange={(v) => updateMaterial("color", v)}
        />
      </div>

      <div className="inspector-subsection">
        <Slider
          label="Metalness"
          value={matProps.metalness ?? 0}
          onChange={(v) => updateMaterial("metalness", v)}
        />
      </div>

      <div className="inspector-subsection">
        <Slider
          label="Roughness"
          value={matProps.roughness ?? 0.5}
          onChange={(v) => updateMaterial("roughness", v)}
        />
      </div>

      <div className="inspector-subsection">
        <Slider
          label="Opacity"
          value={matProps.opacity ?? 1}
          onChange={(v) => updateMaterial("opacity", v)}
        />
      </div>

      {/* ── Emissive ── */}
      <div className="inspector-subsection">
        <ColorPicker
          label="Emissive"
          value={matProps.emissive ?? "#000000"}
          onChange={(v) => updateMaterial("emissive", v)}
        />
      </div>
      <div className="inspector-subsection">
        <Slider
          label="Emissive Intensity"
          value={matProps.emissiveIntensity ?? 0}
          onChange={(v) => updateMaterial("emissiveIntensity", v)}
          min={0}
          max={5}
          step={0.1}
          precision={1}
        />
      </div>

      {/* ── Toggles ── */}
      <div className="inspector-subsection inspector-toggles">
        <label className="inspector-toggle">
          <input
            type="checkbox"
            checked={matProps.wireframe ?? false}
            onChange={(e) => updateMaterial("wireframe", e.target.checked)}
          />
          <span>Wireframe</span>
        </label>
        <label className="inspector-toggle">
          <input
            type="checkbox"
            checked={matProps.flatShading ?? false}
            onChange={(e) => updateMaterial("flatShading", e.target.checked)}
          />
          <span>Flat Shading</span>
        </label>
        <label className="inspector-toggle">
          <input
            type="checkbox"
            checked={matProps.doubleSided ?? false}
            onChange={(e) => updateMaterial("doubleSided", e.target.checked)}
          />
          <span>Double Sided</span>
        </label>
      </div>

      {/* ── Advanced Dropdown (HIG: discoverable, clear affordance) ── */}
      <div className="inspector-dropdown-section">
        <button
          className="inspector-dropdown-btn"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
          aria-controls="material-advanced-content"
          title="Glass, Clearcoat, Sheen, Iridescence"
        >
          <span className="inspector-dropdown-chevron">
            {showAdvanced ? "▾" : "▸"}
          </span>
          <span className="inspector-dropdown-label">Advanced</span>
          <span className="inspector-dropdown-hint">Glass, Clearcoat, Sheen</span>
        </button>
        {showAdvanced && (
        <div
          id="material-advanced-content"
          className="inspector-dropdown-content"
          role="region"
          aria-label="Advanced material settings"
        >
          <div className="inspector-subsection">
            <Slider
              label="Transmission (Glass)"
              value={matProps.transmission ?? 0}
              onChange={(v) => updateMaterial("transmission", v)}
            />
          </div>
          <div className="inspector-subsection">
            <Slider
              label="IOR"
              value={matProps.ior ?? 1.5}
              onChange={(v) => updateMaterial("ior", v)}
              min={1}
              max={2.5}
              step={0.05}
            />
          </div>
          <div className="inspector-subsection">
            <Slider
              label="Thickness"
              value={matProps.thickness ?? 0}
              onChange={(v) => updateMaterial("thickness", v)}
              min={0}
              max={5}
              step={0.1}
              precision={1}
            />
          </div>
          <div className="inspector-subsection">
            <Slider
              label="Clearcoat"
              value={matProps.clearcoat ?? 0}
              onChange={(v) => updateMaterial("clearcoat", v)}
            />
          </div>
          <div className="inspector-subsection">
            <Slider
              label="Clearcoat Roughness"
              value={matProps.clearcoatRoughness ?? 0}
              onChange={(v) => updateMaterial("clearcoatRoughness", v)}
            />
          </div>
          <div className="inspector-subsection">
            <Slider
              label="Sheen"
              value={matProps.sheen ?? 0}
              onChange={(v) => updateMaterial("sheen", v)}
            />
          </div>
          <div className="inspector-subsection">
            <Slider
              label="Iridescence"
              value={matProps.iridescence ?? 0}
              onChange={(v) => updateMaterial("iridescence", v)}
            />
          </div>
        </div>
        )}

      </div>

      {/* ── Texture Maps ── */}
      <div className="inspector-subsection">
        <span className="inspector-subsection-label">Texture Maps</span>
        <div className="texture-map-grid">
          {textureSlots.map((m) => {
            const slot = textureMaps[m.key];
            const hasTexture = !!slot?.url;
            const fileName = slot?.name?.trim() || (hasTexture ? "Texture loaded" : "No image");

            return (
              <button
                key={m.key}
                className={`texture-map-btn${hasTexture ? " has-texture" : ""}`}
                onClick={() => handleTextureUpload(m.key)}
                title={hasTexture ? `${m.label}: ${fileName}` : `Upload ${m.label} map`}
              >
                <div className="texture-map-head">
                  <span
                    className={`texture-map-preview${hasTexture ? " has-image" : ""}`}
                    style={slot?.url ? { backgroundImage: `url(${slot.url})` } : undefined}
                    aria-hidden
                  />
                  <span className="texture-map-icon">{hasTexture ? "IMG" : "TX"}</span>
                  <span className={`texture-map-status${hasTexture ? " is-loaded" : ""}`}>
                    {hasTexture ? "Loaded" : "Empty"}
                  </span>
                </div>
                <span className="texture-map-label">{m.label}</span>
                <span className="texture-map-name">{fileName}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Light Section (shown when a light node is selected) ──

const LightSection: React.FC = () => {
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const document = useEditorStore((s) => s.document);
  const node = selectedNodeId ? document.nodes[selectedNodeId] : null;

  const [lightProps, setLightProps] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!node?.runtimeObjectUuid || node.type !== "light") return;

    window.dispatchEvent(
      new CustomEvent("editor:get-light", {
        detail: { uuid: node.runtimeObjectUuid },
      })
    );

    const handleLightData = (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (data) setLightProps(data);
    };

    window.addEventListener("editor:light-data", handleLightData);
    return () =>
      window.removeEventListener("editor:light-data", handleLightData);
  }, [node?.runtimeObjectUuid, selectedNodeId]);

  if (!node || node.type !== "light") return null;

  const lightKind = node.light?.kind ?? "point";

  const updateLight = (key: string, value: any) => {
    const newProps = { ...lightProps, [key]: value };
    setLightProps(newProps);

    if (node.runtimeObjectUuid) {
      window.dispatchEvent(
        new CustomEvent("editor:update-light", {
          detail: { uuid: node.runtimeObjectUuid, props: { [key]: value } },
        })
      );
    }
  };

  return (
    <div className="inspector-section">
      <span className="inspector-section-label">Light</span>

      <div className="inspector-subsection">
        <span className="inspector-subsection-label">{lightKind}</span>
      </div>

      <div className="inspector-subsection">
        <ColorPicker
          label="Color"
          value={lightProps.color ?? "#ffffff"}
          onChange={(v) => updateLight("color", v)}
        />
      </div>

      <div className="inspector-subsection">
        <Slider
          label="Intensity"
          value={lightProps.intensity ?? 1}
          onChange={(v) => updateLight("intensity", v)}
          min={0}
          max={10}
          step={0.1}
          precision={1}
        />
      </div>

      {/* Cast Shadow toggle (directional, spot, point) */}
      {lightKind !== "ambient" && (
        <div className="inspector-subsection inspector-toggles">
          <label className="inspector-toggle">
            <input
              type="checkbox"
              checked={lightProps.castShadow ?? false}
              onChange={(e) => updateLight("castShadow", e.target.checked)}
            />
            <span>Cast Shadow</span>
          </label>
        </div>
      )}

      {/* Spot light specific controls */}
      {lightKind === "spot" && (
        <>
          <div className="inspector-subsection">
            <Slider
              label="Angle"
              value={lightProps.angle ?? Math.PI / 6}
              onChange={(v) => updateLight("angle", v)}
              min={0}
              max={Math.PI / 2}
              step={0.01}
              precision={2}
            />
          </div>
          <div className="inspector-subsection">
            <Slider
              label="Penumbra"
              value={lightProps.penumbra ?? 0}
              onChange={(v) => updateLight("penumbra", v)}
              min={0}
              max={1}
              step={0.01}
            />
          </div>
        </>
      )}

      {/* Distance / Decay (point, spot) */}
      {(lightKind === "spot" || lightKind === "point") && (
        <>
          <div className="inspector-subsection">
            <Slider
              label="Distance"
              value={lightProps.distance ?? 0}
              onChange={(v) => updateLight("distance", v)}
              min={0}
              max={100}
              step={0.5}
              precision={1}
            />
          </div>
          <div className="inspector-subsection">
            <Slider
              label="Decay"
              value={lightProps.decay ?? 2}
              onChange={(v) => updateLight("decay", v)}
              min={0}
              max={5}
              step={0.1}
              precision={1}
            />
          </div>
        </>
      )}
    </div>
  );
};

// ── Particle Emitter Section ──

const ParticleEmitterSection: React.FC = () => {
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const document = useEditorStore((s) => s.document);
  const updateDocument = useEditorStore((s) => s.updateDocument);
  const node = selectedNodeId ? document.nodes[selectedNodeId] : null;

  if (!node || node.type !== "particleEmitter" || !node.particleEmitter) return null;

  const config = node.particleEmitter;

  const updateConfig = (next: Partial<ParticleEmitterData>) => {
    const newDoc = structuredClone(document);
    const n = newDoc.nodes[node.id]!;
    n.particleEmitter = { ...config, ...next };
    updateDocument(newDoc);
    if (node.runtimeObjectUuid) {
      window.dispatchEvent(
        new CustomEvent("editor:update-particle-emitter", {
          detail: { uuid: node.runtimeObjectUuid, config: { ...config, ...next } },
        })
      );
    }
  };

  return (
    <div className="inspector-section">
      <span className="inspector-section-label">Particle Emitter</span>
      <div className="inspector-subsection">
        <NumericField
          label="Count"
          value={config.count}
          onChange={(v) => updateConfig({ count: Math.max(1, Math.round(v)) })}
          step={50}
          precision={0}
        />
      </div>
      <div className="inspector-subsection">
        <NumericField
          label="Lifetime (s)"
          value={config.lifetime}
          onChange={(v) => updateConfig({ lifetime: Math.max(0.1, v) })}
        />
      </div>
      <div className="inspector-subsection">
        <NumericField
          label="Size"
          value={config.size}
          onChange={(v) => updateConfig({ size: Math.max(0.01, v) })}
        />
      </div>
      <div className="inspector-subsection">
        <ColorPicker
          label="Color"
          value={config.color}
          onChange={(v) => updateConfig({ color: v })}
        />
      </div>
      <div className="inspector-subsection">
        <NumericField
          label="Speed"
          value={config.speed}
          onChange={(v) => updateConfig({ speed: Math.max(0, v) })}
        />
      </div>
      <div className="inspector-subsection">
        <Slider
          label="Spread"
          value={config.spread}
          onChange={(v) => updateConfig({ spread: v })}
          min={0}
          max={1}
          step={0.05}
        />
      </div>
      <div className="inspector-subsection">
        <NumericField
          label="Rate (1/s)"
          value={config.rate}
          onChange={(v) => updateConfig({ rate: Math.max(0, v) })}
          precision={0}
        />
      </div>
      <div className="inspector-subsection inspector-toggles">
        <label className="inspector-toggle">
          <input
            type="checkbox"
            checked={config.loop}
            onChange={(e) => updateConfig({ loop: e.target.checked })}
          />
          <span>Loop</span>
        </label>
      </div>
    </div>
  );
};

// ── Modeling Tools Section (Boolean & Cloner) ──

const ModelingToolsSection: React.FC = () => {
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const document = useEditorStore((s) => s.document);
  const node = selectedNodeId ? document.nodes[selectedNodeId] : null;
  const [boolTarget, setBoolTarget] = useState<string | null>(null);

  if (!node || node.type !== "mesh") return null;

  // Collect other mesh nodes for boolean target
  const otherMeshes = Object.values(document.nodes).filter(
    (n) => n.type === "mesh" && n.id !== node.id
  );

  const handleBoolean = (operation: "subtract" | "union" | "intersect") => {
    if (!boolTarget) {
      showToast("Select a target mesh first", "error");
      return;
    }
    const targetNode = document.nodes[boolTarget];
    if (!targetNode || !node.runtimeObjectUuid || !targetNode.runtimeObjectUuid) return;

    window.dispatchEvent(
      new CustomEvent("editor:boolean-op", {
        detail: {
          objectAUuid: node.runtimeObjectUuid,
          objectBUuid: targetNode.runtimeObjectUuid,
          operation,
          nodeAId: node.id,
          nodeBId: targetNode.id,
        },
      })
    );
  };

  const handleCloner = (mode: "grid" | "radial" | "linear") => {
    if (!node.runtimeObjectUuid) return;

    const opts =
      mode === "grid"
        ? { countX: 3, countY: 1, countZ: 3, spacingX: 1.5, spacingY: 1.5, spacingZ: 1.5 }
        : mode === "radial"
        ? { count: 8, radius: 2.5 }
        : { count: 5, spacingX: 1.5 };

    window.dispatchEvent(
      new CustomEvent("editor:cloner", {
        detail: {
          sourceUuid: node.runtimeObjectUuid,
          sourceNodeId: node.id,
          mode,
          opts,
        },
      })
    );
  };

  return (
    <div className="inspector-section">
      <span className="inspector-section-label">Modeling Tools</span>

      {/* Boolean Operations */}
      <div className="inspector-subsection">
        <span className="inspector-subsection-label">Boolean</span>
        {otherMeshes.length > 0 ? (
          <>
            <select
              className="inspector-select"
              value={boolTarget ?? ""}
              onChange={(e) => setBoolTarget(e.target.value || null)}
            >
              <option value="">Select target mesh…</option>
              {otherMeshes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <div className="modeling-btn-row">
              <button
                className="modeling-btn"
                onClick={() => handleBoolean("union")}
                title="Union: merge both meshes"
              >
                ∪ Union
              </button>
              <button
                className="modeling-btn"
                onClick={() => handleBoolean("subtract")}
                title="Subtract: cut target from selected"
              >
                − Subtract
              </button>
              <button
                className="modeling-btn"
                onClick={() => handleBoolean("intersect")}
                title="Intersect: keep overlapping volume"
              >
                ∩ Intersect
              </button>
            </div>
          </>
        ) : (
          <span className="inspector-hint">Add another mesh for booleans</span>
        )}
      </div>

      {/* Cloner */}
      <div className="inspector-subsection">
        <span className="inspector-subsection-label">Cloner</span>
        <div className="modeling-btn-row">
          <button
            className="modeling-btn"
            onClick={() => handleCloner("grid")}
            title="Grid cloner: 3×1×3"
          >
            ⊞ Grid
          </button>
          <button
            className="modeling-btn"
            onClick={() => handleCloner("radial")}
            title="Radial cloner: 8 copies around a circle"
          >
            ◎ Radial
          </button>
          <button
            className="modeling-btn"
            onClick={() => handleCloner("linear")}
            title="Linear cloner: 5 copies in a row"
          >
            ⊟ Linear
          </button>
        </div>
      </div>
    </div>
  );
};

const PolyEditSection: React.FC = () => {
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const document = useEditorStore((s) => s.document);
  const meshEditMode = useEditorStore((s) => s.meshEditMode);
  const meshEditSelections = useEditorStore((s) => s.meshEditSelections);
  const node = selectedNodeId ? document.nodes[selectedNodeId] : null;

  const [extrudeAmount, setExtrudeAmount] = useState(0.2);
  const [bevelAmount, setBevelAmount] = useState(0.08);

  const currentSelection =
    meshEditMode === "object" ? null : meshEditSelections[meshEditMode];
  const selectedCount =
    meshEditMode === "object"
      ? 0
      : meshEditMode === "face"
        ? currentSelection?.faces.length ?? 0
        : meshEditMode === "edge"
          ? currentSelection?.edges.length ?? 0
          : currentSelection?.vertices.length ?? 0;
  const hasSelection = selectedCount > 0;
  const bevelAllowed = meshEditMode === "vertex" || meshEditMode === "edge";

  const setMode = (mode: "object" | "vertex" | "edge" | "face") => {
    window.dispatchEvent(
      new CustomEvent("editor:set-mesh-edit-mode", {
        detail: { mode },
      })
    );
  };

  const triggerExtrude = () => {
    window.dispatchEvent(
      new CustomEvent("editor:mesh-start-extrude", {
        detail: { distance: extrudeAmount },
      })
    );
  };

  const triggerBevel = () => {
    window.dispatchEvent(
      new CustomEvent("editor:mesh-start-bevel", {
        detail: { amount: bevelAmount },
      })
    );
  };

  useEffect(() => {
    (window as Window & { __meshExtrudeAmount?: number }).__meshExtrudeAmount =
      extrudeAmount;
  }, [extrudeAmount]);

  useEffect(() => {
    (window as Window & { __meshBevelAmount?: number }).__meshBevelAmount =
      bevelAmount;
  }, [bevelAmount]);

  if (!node || node.type !== "mesh") return null;

  const selectionSummary = (() => {
    if (meshEditMode === "object") {
      return "Switch to Vertex/Edge/Face mode and click in the viewport.";
    }
    if (!currentSelection || !hasSelection) {
      return "No component selected yet.";
    }
    if (!currentSelection.active) {
      return `${selectedCount} selected`;
    }
    if (currentSelection.active.kind === "vertex") {
      return `${selectedCount} selected | active vertex #${currentSelection.active.vertex}`;
    }
    if (currentSelection.active.kind === "edge") {
      return `${selectedCount} selected | active edge #${currentSelection.active.edge[0]}-#${currentSelection.active.edge[1]}`;
    }
    return `${selectedCount} selected | active face #${currentSelection.active.face}`;
  })();

  return (
    <div className="inspector-section">
      <span className="inspector-section-label">Poly Edit</span>

      <div className="inspector-subsection">
        <span className="inspector-subsection-label">Mode</span>
        <div className="modeling-btn-row">
          <button
            className={`modeling-btn ${meshEditMode === "object" ? "active" : ""}`}
            onClick={() => setMode("object")}
            title="Object mode (1)"
          >
            Object
          </button>
          <button
            className={`modeling-btn ${meshEditMode === "vertex" ? "active" : ""}`}
            onClick={() => setMode("vertex")}
            title="Vertex mode (2)"
          >
            Vertex
          </button>
          <button
            className={`modeling-btn ${meshEditMode === "edge" ? "active" : ""}`}
            onClick={() => setMode("edge")}
            title="Edge mode (3)"
          >
            Edge
          </button>
          <button
            className={`modeling-btn ${meshEditMode === "face" ? "active" : ""}`}
            onClick={() => setMode("face")}
            title="Face mode (4)"
          >
            Face
          </button>
        </div>
      </div>

      <div className="inspector-subsection">
        <span className="inspector-subsection-label">Selection</span>
        <span className="inspector-hint">{selectionSummary}</span>
        <span className="inspector-hint">
          Box Select: B + Drag | Shift add | Ctrl/Cmd remove
        </span>
      </div>

      <div className="inspector-subsection">
        <span className="inspector-subsection-label">Extrude</span>
        <div className="inspector-poly-edit-row">
          <input
            type="number"
            className="numeric-input"
            value={Number(extrudeAmount.toFixed(3))}
            step={0.05}
            onChange={(e) => {
              const val = Number.parseFloat(e.target.value);
              if (!Number.isNaN(val)) setExtrudeAmount(val);
            }}
          />
          <button
            className="modeling-btn"
            onClick={triggerExtrude}
            disabled={!hasSelection}
            title="Start extrude gizmo (E)"
          >
            Extrude (E)
          </button>
        </div>
      </div>

      <div className="inspector-subsection">
        <span className="inspector-subsection-label">Bevel</span>
        <div className="inspector-poly-edit-row">
          <input
            type="number"
            className="numeric-input"
            value={Number(bevelAmount.toFixed(3))}
            step={0.02}
            min={0.001}
            onChange={(e) => {
              const val = Number.parseFloat(e.target.value);
              if (!Number.isNaN(val)) setBevelAmount(val);
            }}
          />
          <button
            className="modeling-btn"
            onClick={triggerBevel}
            disabled={!hasSelection || !bevelAllowed}
            title={
              !bevelAllowed
                ? "Bevel is disabled in face mode"
                : "Start bevel gizmo (Ctrl+B)"
            }
          >
            Bevel (Ctrl+B)
          </button>
        </div>
        {!bevelAllowed && (
          <span className="inspector-hint">Bevel works in Vertex/Edge mode only.</span>
        )}
      </div>
    </div>
  );
};

// ── Cloner Settings (edit params when a cloner group is selected) ──

const ClonerSettingsSection: React.FC = () => {
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const document = useEditorStore((s) => s.document);
  const node = selectedNodeId ? document.nodes[selectedNodeId] : null;
  const config = node?.clonerConfig;
  const [opts, setOpts] = useState<ClonerOpts>(config?.opts ?? {});

  useEffect(() => {
    if (config?.opts) setOpts(config.opts);
  }, [config?.opts, selectedNodeId]);

  if (!node || !config) return null;

  const sourceExists = !!document.nodes[config.sourceNodeId];
  const handleApply = () => {
    if (!sourceExists) {
      showToast("Source mesh was deleted — cannot update cloner", "error");
      return;
    }
    window.dispatchEvent(
      new CustomEvent("editor:update-cloner", { detail: { nodeId: node.id, opts } })
    );
  };

  return (
    <div className="inspector-section">
      <span className="inspector-section-label">Cloner Settings</span>
      {!sourceExists && (
        <span className="inspector-hint">Source mesh missing — cannot update</span>
      )}

      {config.mode === "grid" && (
        <div className="inspector-subsection">
          <span className="inspector-subsection-label">Grid</span>
          <div className="inspector-row-3">
            <NumericField
              label="X"
              value={opts.countX ?? 3}
              onChange={(v) => setOpts((o) => ({ ...o, countX: v }))}
              step={1}
              precision={0}
            />
            <NumericField
              label="Y"
              value={opts.countY ?? 1}
              onChange={(v) => setOpts((o) => ({ ...o, countY: v }))}
              step={1}
              precision={0}
            />
            <NumericField
              label="Z"
              value={opts.countZ ?? 3}
              onChange={(v) => setOpts((o) => ({ ...o, countZ: v }))}
              step={1}
              precision={0}
            />
          </div>
          <span className="inspector-subsection-label">Spacing</span>
          <div className="inspector-row-3">
            <NumericField
              label="X"
              value={opts.spacingX ?? 1.5}
              onChange={(v) => setOpts((o) => ({ ...o, spacingX: v }))}
            />
            <NumericField
              label="Y"
              value={opts.spacingY ?? 1.5}
              onChange={(v) => setOpts((o) => ({ ...o, spacingY: v }))}
            />
            <NumericField
              label="Z"
              value={opts.spacingZ ?? 1.5}
              onChange={(v) => setOpts((o) => ({ ...o, spacingZ: v }))}
            />
          </div>
        </div>
      )}

      {config.mode === "radial" && (
        <div className="inspector-subsection">
          <span className="inspector-subsection-label">Radial</span>
          <NumericField
            label="Count"
            value={opts.count ?? 8}
            onChange={(v) => setOpts((o) => ({ ...o, count: v }))}
            step={1}
            precision={0}
          />
          <NumericField
            label="Radius"
            value={opts.radius ?? 2.5}
            onChange={(v) => setOpts((o) => ({ ...o, radius: v }))}
          />
        </div>
      )}

      {config.mode === "linear" && (
        <div className="inspector-subsection">
          <span className="inspector-subsection-label">Linear</span>
          <NumericField
            label="Count"
            value={opts.count ?? 5}
            onChange={(v) => setOpts((o) => ({ ...o, count: v }))}
            step={1}
            precision={0}
          />
          <NumericField
            label="Spacing"
            value={opts.spacingX ?? 1.5}
            onChange={(v) => setOpts((o) => ({ ...o, spacingX: v }))}
          />
        </div>
      )}

      <button
        className="modeling-btn"
        style={{ width: "100%", marginTop: 6 }}
        onClick={handleApply}
        disabled={!sourceExists}
      >
        Apply
      </button>
    </div>
  );
};

// ── Inspector Main ──

export const Inspector: React.FC = () => {
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const document = useEditorStore((s) => s.document);
  const renameNode = useEditorStore((s) => s.renameSceneNode);
  const removeNode = useEditorStore((s) => s.removeSceneNode);

  const node = selectedNodeId ? document.nodes[selectedNodeId] : null;

  return (
    <div className="inspector" role="region" aria-label="Inspector">
      <div className="inspector-header">
        <span className="inspector-title">
          {node ? "Inspector" : "Scene Settings"}
        </span>
      </div>

      {!node ? (
        <div className="inspector-content">
          <ScenePanel />
        </div>
      ) : (
        <div className="inspector-content">
          {/* Node Info */}
          <div className="inspector-section">
            <div className="inspector-node-info">
              <input
                className="inspector-name-input"
                value={node.name}
                onChange={(e) => renameNode(node.id, e.target.value)}
                spellCheck={false}
              />
              <span className="inspector-node-type">{node.type}</span>
            </div>
          </div>

          {/* Transform */}
          <TransformSection />

          {/* Camera node */}
          {node.type === "camera" && <CameraNodeSection />}

          {/* Text3D editing */}
          {node.type === "mesh" && node.mesh?.geometryType === "text3d" && (
            <Text3DSection />
          )}

          {/* Physics (meshes only) */}
          {node.type === "mesh" && <PhysicsSection />}

          {/* Particle Emitter (particleEmitter only) */}
          {node.type === "particleEmitter" && <ParticleEmitterSection />}

          {/* Material (only for meshes) */}
          <MaterialSection />

          {/* Light properties (only for lights) */}
          <LightSection />

          {/* Interactions (States, Events, Actions) */}
          <InteractionsPanel />

          {/* Poly Editing (Vertex/Edge/Face + Extrude/Bevel) */}
          <PolyEditSection />

          {/* Modeling Tools (Boolean, Cloner) */}
          <ModelingToolsSection />

          {/* Cloner Settings (when selected node is a cloner) */}
          <ClonerSettingsSection />

          {/* Delete button */}
          <div className="inspector-section">
            <button
              className="inspector-delete-btn"
              onClick={() => {
                if (node.runtimeObjectUuid) {
                  window.dispatchEvent(
                    new CustomEvent("editor:remove-object", {
                      detail: { nodeId: node.id, uuid: node.runtimeObjectUuid },
                    })
                  );
                }
                removeNode(node.id);
              }}
            >
              Delete Object
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
