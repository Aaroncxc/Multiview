// ============================================================
// Scene Panel — Global scene settings (shown when nothing selected)
// Lighting, Environment, Fog, Post-Processing, Camera
// ============================================================

import React, { useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import { ColorPicker } from "../../ui/ColorPicker";
import { Slider } from "../../ui/Slider";
import { showToast } from "../../ui/Toast";
import type { SceneSettings } from "../../core/document/types";
import { DEFAULT_PARTICLE_EMITTER } from "../../core/document/types";
import "./ScenePanel.css";

// ── Add Particle Emitter ──

const AddParticleEmitterSection: React.FC = () => {
  const handleAdd = () => {
    window.dispatchEvent(
      new CustomEvent("editor:add-particle-emitter", {
        detail: { config: { ...DEFAULT_PARTICLE_EMITTER } },
      })
    );
  };

  return (
    <div className="scene-section">
      <span className="scene-section-label">Particles</span>
      <button
        className="scene-light-btn"
        onClick={handleAdd}
        title="Add particle emitter"
      >
        <span>✨</span>
        <span>Particle Emitter</span>
      </button>
    </div>
  );
};

// ── Viewer Export Options ──

const ViewerExportOptionsSection: React.FC = () => {
  const options = useEditorStore((s) => s.viewerExportOptions);
  const setOptions = useEditorStore((s) => s.setViewerExportOptions);

  return (
    <div className="scene-section">
      <span className="scene-section-label">Viewer Export</span>
      <div className="scene-subsection">
        <label className="scene-subsection-label">Autospin</label>
        <input
          type="number"
          className="scene-numeric-input"
          value={options.autospin ?? 0}
          onChange={(e) =>
            setOptions({ autospin: parseFloat(e.target.value) || 0 })
          }
          step={0.1}
          placeholder="0 = off"
        />
      </div>
      <div className="scene-subsection">
        <label className="scene-subsection-label">Min Zoom</label>
        <input
          type="number"
          className="scene-numeric-input"
          value={options.minDistance ?? ""}
          onChange={(e) =>
            setOptions({
              minDistance: e.target.value ? parseFloat(e.target.value) : undefined,
            })
          }
          step={0.5}
          placeholder="default"
        />
      </div>
      <div className="scene-subsection">
        <label className="scene-subsection-label">Max Zoom</label>
        <input
          type="number"
          className="scene-numeric-input"
          value={options.maxDistance ?? ""}
          onChange={(e) =>
            setOptions({
              maxDistance: e.target.value ? parseFloat(e.target.value) : undefined,
            })
          }
          step={1}
          placeholder="default"
        />
      </div>
    </div>
  );
};

// ── Add Camera Section ──

const AddCameraSection: React.FC = () => {
  const handleAdd = () => {
    const label = window.prompt("Camera label:", "Camera 1") || "Camera";
    window.dispatchEvent(
      new CustomEvent("editor:add-camera-marker", { detail: { label } })
    );
  };

  return (
    <div className="scene-section">
      <span className="scene-section-label">Cameras</span>
      <button
        className="scene-light-btn"
        onClick={handleAdd}
        title="Add a camera viewpoint"
      >
        <span>📷</span>
        <span>Add Camera</span>
      </button>
    </div>
  );
};

// ── Add Light Section ──

const AddLightSection: React.FC = () => {
  const addSceneNode = useEditorStore((s) => s.addSceneNode);
  const selectNode = useEditorStore((s) => s.selectNode);

  const handleAddLight = (kind: string) => {
    const name = `${kind.charAt(0).toUpperCase() + kind.slice(1)}Light`;

    window.dispatchEvent(
      new CustomEvent("editor:add-light", { detail: { kind, name } })
    );
  };

  return (
    <div className="scene-section">
      <span className="scene-section-label">Add Light</span>
      <div className="scene-light-buttons">
        {[
          { kind: "directional", icon: "☀", label: "Directional" },
          { kind: "point", icon: "💡", label: "Point" },
          { kind: "spot", icon: "🔦", label: "Spot" },
        ].map((l) => (
          <button
            key={l.kind}
            className="scene-light-btn"
            onClick={() => handleAddLight(l.kind)}
            title={`Add ${l.label} Light`}
          >
            <span>{l.icon}</span>
            <span>{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ── Background Section ──

const BackgroundSection: React.FC<{
  settings: SceneSettings;
  onChange: (s: Partial<SceneSettings>) => void;
}> = ({ settings, onChange }) => {
  return (
    <div className="scene-section">
      <span className="scene-section-label">Background</span>
      <div className="scene-subsection">
        <div className="scene-toggle-row">
          <label className="scene-toggle">
            <input
              type="radio"
              name="bgType"
              checked={settings.backgroundType === "color"}
              onChange={() => onChange({ backgroundType: "color" })}
            />
            <span>Color</span>
          </label>
          <label className="scene-toggle">
            <input
              type="radio"
              name="bgType"
              checked={settings.backgroundType === "transparent"}
              onChange={() => onChange({ backgroundType: "transparent" })}
            />
            <span>Transparent</span>
          </label>
        </div>
        {settings.backgroundType === "color" && (
          <ColorPicker
            value={settings.backgroundColor}
            onChange={(c) => onChange({ backgroundColor: c })}
          />
        )}
      </div>
    </div>
  );
};

// ── Ambient Light Section ──

const AmbientSection: React.FC<{
  settings: SceneSettings;
  onChange: (s: Partial<SceneSettings>) => void;
}> = ({ settings, onChange }) => (
  <div className="scene-section">
    <span className="scene-section-label">Ambient Light</span>
    <div className="scene-subsection">
      <ColorPicker
        label="Color"
        value={settings.ambientLightColor}
        onChange={(c) => onChange({ ambientLightColor: c })}
      />
    </div>
    <div className="scene-subsection">
      <Slider
        label="Intensity"
        value={settings.ambientLightIntensity}
        onChange={(v) => onChange({ ambientLightIntensity: v })}
        min={0}
        max={3}
        step={0.05}
      />
    </div>
  </div>
);

// ── Fog Section ──

const FogSection: React.FC<{
  settings: SceneSettings;
  onChange: (s: Partial<SceneSettings>) => void;
}> = ({ settings, onChange }) => {
  const fog = settings.fog;

  const updateFog = (partial: Partial<typeof fog>) => {
    onChange({ fog: { ...fog, ...partial } });
  };

  return (
    <div className="scene-section">
      <div className="scene-section-header">
        <span className="scene-section-label">Fog</span>
        <label className="scene-toggle">
          <input
            type="checkbox"
            checked={fog.enabled}
            onChange={(e) => updateFog({ enabled: e.target.checked })}
          />
          <span>{fog.enabled ? "On" : "Off"}</span>
        </label>
      </div>
      {fog.enabled && (
        <>
          <div className="scene-subsection">
            <ColorPicker
              label="Color"
              value={fog.color}
              onChange={(c) => updateFog({ color: c })}
            />
          </div>
          <div className="scene-subsection scene-toggle-row">
            <label className="scene-toggle">
              <input
                type="radio"
                name="fogType"
                checked={fog.type === "exponential"}
                onChange={() => updateFog({ type: "exponential" })}
              />
              <span>Exponential</span>
            </label>
            <label className="scene-toggle">
              <input
                type="radio"
                name="fogType"
                checked={fog.type === "linear"}
                onChange={() => updateFog({ type: "linear" })}
              />
              <span>Linear</span>
            </label>
          </div>
          {fog.type === "exponential" ? (
            <div className="scene-subsection">
              <Slider
                label="Density"
                value={fog.density}
                onChange={(v) => updateFog({ density: v })}
                min={0}
                max={0.2}
                step={0.001}
                precision={3}
              />
            </div>
          ) : (
            <>
              <div className="scene-subsection">
                <Slider
                  label="Near"
                  value={fog.near}
                  onChange={(v) => updateFog({ near: v })}
                  min={0}
                  max={100}
                  step={0.5}
                  precision={1}
                />
              </div>
              <div className="scene-subsection">
                <Slider
                  label="Far"
                  value={fog.far}
                  onChange={(v) => updateFog({ far: v })}
                  min={1}
                  max={200}
                  step={1}
                  precision={0}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

// ── Post-Processing Section ──

const PostProcessingSection: React.FC<{
  settings: SceneSettings;
  onChange: (s: Partial<SceneSettings>) => void;
}> = ({ settings, onChange }) => {
  const pp = settings.postProcessing;

  const updatePP = (partial: Partial<typeof pp>) => {
    onChange({ postProcessing: { ...pp, ...partial } });
  };

  return (
    <div className="scene-section">
      <span className="scene-section-label">Post-Processing</span>

      {/* Exposure */}
      <div className="scene-subsection">
        <Slider
          label="Exposure"
          value={pp.toneMappingExposure}
          onChange={(v) => updatePP({ toneMappingExposure: v })}
          min={0.1}
          max={3}
          step={0.05}
        />
      </div>

      {/* Bloom */}
      <div className="scene-subsection">
        <div className="scene-section-header">
          <span className="scene-subsection-label">Bloom</span>
          <label className="scene-toggle">
            <input
              type="checkbox"
              checked={pp.bloom.enabled}
              onChange={(e) =>
                updatePP({ bloom: { ...pp.bloom, enabled: e.target.checked } })
              }
            />
            <span>{pp.bloom.enabled ? "On" : "Off"}</span>
          </label>
        </div>
        {pp.bloom.enabled && (
          <>
            <Slider
              label="Intensity"
              value={pp.bloom.intensity}
              onChange={(v) =>
                updatePP({ bloom: { ...pp.bloom, intensity: v } })
              }
              min={0}
              max={3}
              step={0.05}
            />
            <Slider
              label="Threshold"
              value={pp.bloom.threshold}
              onChange={(v) =>
                updatePP({ bloom: { ...pp.bloom, threshold: v } })
              }
              min={0}
              max={1}
              step={0.01}
            />
            <Slider
              label="Radius"
              value={pp.bloom.radius}
              onChange={(v) =>
                updatePP({ bloom: { ...pp.bloom, radius: v } })
              }
              min={0}
              max={1}
              step={0.01}
            />
          </>
        )}
      </div>

      {/* Vignette */}
      <div className="scene-subsection">
        <div className="scene-section-header">
          <span className="scene-subsection-label">Vignette</span>
          <label className="scene-toggle">
            <input
              type="checkbox"
              checked={pp.vignette.enabled}
              onChange={(e) =>
                updatePP({
                  vignette: { ...pp.vignette, enabled: e.target.checked },
                })
              }
            />
            <span>{pp.vignette.enabled ? "On" : "Off"}</span>
          </label>
        </div>
        {pp.vignette.enabled && (
          <>
            <Slider
              label="Offset"
              value={pp.vignette.offset}
              onChange={(v) =>
                updatePP({ vignette: { ...pp.vignette, offset: v } })
              }
              min={0}
              max={2}
              step={0.05}
            />
            <Slider
              label="Darkness"
              value={pp.vignette.darkness}
              onChange={(v) =>
                updatePP({ vignette: { ...pp.vignette, darkness: v } })
              }
              min={0}
              max={2}
              step={0.05}
            />
          </>
        )}
      </div>
    </div>
  );
};

// ── Camera Section ──

const CameraSection: React.FC = () => {
  const presets = [
    { key: "perspective", label: "Perspective", icon: "📐" },
    { key: "front", label: "Front", icon: "⬆" },
    { key: "back", label: "Back", icon: "⬇" },
    { key: "left", label: "Left", icon: "⬅" },
    { key: "right", label: "Right", icon: "➡" },
    { key: "top", label: "Top", icon: "🔝" },
  ] as const;

  return (
    <div className="scene-section">
      <span className="scene-section-label">Camera Presets</span>
      <div className="scene-camera-grid">
        {presets.map((p) => (
          <button
            key={p.key}
            className="scene-camera-btn"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("editor:camera-preset", {
                  detail: { preset: p.key },
                })
              );
            }}
            title={p.label}
          >
            <span>{p.icon}</span>
            <span>{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ── HDRI Upload Section ──

const EnvironmentSection: React.FC = () => {
  const handleUploadHDRI = () => {
    const input = window.document.createElement("input");
    input.type = "file";
    input.accept = ".hdr,.exr";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const isEXR = file.name.toLowerCase().endsWith(".exr");
      window.dispatchEvent(
        new CustomEvent("editor:load-hdri", { detail: { url, isEXR } })
      );
      showToast(`Loaded ${isEXR ? "EXR" : "HDR"}: ${file.name}`, "success");
    };
    input.click();
  };

  return (
    <div className="scene-section">
      <span className="scene-section-label">Environment</span>
      <div className="scene-subsection">
        <button className="scene-hdri-btn" onClick={handleUploadHDRI}>
          Upload HDRI (.hdr / .exr)
        </button>
        <button
          className="scene-hdri-btn scene-hdri-clear"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("editor:clear-hdri"));
            showToast("Environment cleared", "info");
          }}
        >
          Clear Environment
        </button>
      </div>
    </div>
  );
};

// ── Main Scene Panel ──

export const ScenePanel: React.FC = () => {
  const document = useEditorStore((s) => s.document);
  const updateDocument = useEditorStore((s) => s.updateDocument);
  const settings = document.sceneSettings;

  const handleSettingsChange = (partial: Partial<SceneSettings>) => {
    const newSettings = { ...settings, ...partial };
    const newDoc = { ...document, sceneSettings: newSettings };
    updateDocument(newDoc);

    // Apply to backend
    window.dispatchEvent(
      new CustomEvent("editor:apply-scene-settings", {
        detail: newSettings,
      })
    );
  };

  return (
    <div className="scene-panel">
      <ViewerExportOptionsSection />
      <CameraSection />
      <AddCameraSection />
      <AddLightSection />
      <AddParticleEmitterSection />
      <BackgroundSection settings={settings} onChange={handleSettingsChange} />
      <AmbientSection settings={settings} onChange={handleSettingsChange} />
      <EnvironmentSection />
      <FogSection settings={settings} onChange={handleSettingsChange} />
      <PostProcessingSection settings={settings} onChange={handleSettingsChange} />
    </div>
  );
};
