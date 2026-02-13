// ============================================================
// Scene Panel — Global scene settings (shown when nothing selected)
// Lighting, Environment, Fog, Post-Processing, Camera
// ============================================================

import React from "react";
import { useEditorStore } from "../../store/editorStore";
import { ColorPicker } from "../../ui/ColorPicker";
import { Slider } from "../../ui/Slider";
import { showToast } from "../../ui/Toast";
import type { SceneSettings } from "../../core/document/types";
import { DEFAULT_PARTICLE_EMITTER } from "../../core/document/types";
import {
  DEFAULT_VIEWER_EXPORT_OPTIONS,
  type ViewerExportOptions,
} from "../../core/io/viewerExportOptions";
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
        <span className="scene-icon">FX</span>
        <span>Particle Emitter</span>
      </button>
    </div>
  );
};

// ── Viewer Export Options ──

const ASPECT_RATIO_PRESETS = [
  { label: "16:9", value: "16 / 9", hint: "Widescreen" },
  { label: "4:3", value: "4 / 3", hint: "Classic" },
  { label: "1:1", value: "1 / 1", hint: "Square" },
  { label: "9:16", value: "9 / 16", hint: "Vertical" },
  { label: "21:9", value: "21 / 9", hint: "Ultra-wide" },
] as const;

interface ViewerStylePreset {
  id: string;
  label: string;
  description: string;
  options: Partial<ViewerExportOptions>;
}

const VIEWER_STYLE_PRESETS: ViewerStylePreset[] = [
  {
    id: "studio-dark",
    label: "Studio Dark",
    description: "Neutral dark with blue accent",
    options: {
      theme: "dark",
      showInfoPanel: true,
      loadingBackground: "#101317",
      loadingTextColor: "#ffffff",
      loadingAccentColor: "#4da6ff",
      customCss: "",
    },
  },
  {
    id: "clean-light",
    label: "Clean Light",
    description: "Bright UI for portfolio sections",
    options: {
      theme: "light",
      showInfoPanel: true,
      loadingBackground: "#f3f6fb",
      loadingTextColor: "#1d2530",
      loadingAccentColor: "#267cff",
      customCss: "",
    },
  },
  {
    id: "cinematic",
    label: "Cinematic",
    description: "Dark minimal with warm accent",
    options: {
      theme: "dark",
      showInfoPanel: false,
      loadingBackground: "#080808",
      loadingTextColor: "#f9f2dc",
      loadingAccentColor: "#ff9f1a",
      customCss:
        ".mv-btn{border-radius:999px}.mv-title{text-transform:uppercase;letter-spacing:.08em}",
    },
  },
];

function normalizeAspectRatioInput(value: string): string {
  const trimmed = value.trim();
  const colon = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/;
  const slash = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/;

  const colonMatch = trimmed.match(colon);
  if (colonMatch) return `${colonMatch[1]} / ${colonMatch[2]}`;

  const slashMatch = trimmed.match(slash);
  if (slashMatch) return `${slashMatch[1]} / ${slashMatch[2]}`;

  return "16 / 9";
}

const ViewerExportOptionsSection: React.FC = () => {
  const options = useEditorStore((s) => s.viewerExportOptions);
  const setOptions = useEditorStore((s) => s.setViewerExportOptions);
  const current: ViewerExportOptions = {
    ...DEFAULT_VIEWER_EXPORT_OPTIONS,
    ...options,
  };

  const setOption = <K extends keyof ViewerExportOptions>(
    key: K,
    value: ViewerExportOptions[K]
  ) => {
    setOptions({ [key]: value } as Partial<ViewerExportOptions>);
  };
  const normalizedAspect = normalizeAspectRatioInput(
    current.aspectRatio ?? "16 / 9"
  );
  const applyViewerStylePreset = (preset: ViewerStylePreset) => {
    setOptions(preset.options);
    showToast(`Applied preset "${preset.label}" (export only)`, "info");
  };
  const resetViewerOptions = () => {
    setOptions({
      ...DEFAULT_VIEWER_EXPORT_OPTIONS,
      title: undefined,
      description: undefined,
      customCss: undefined,
      minDistance: undefined,
      maxDistance: undefined,
      previewImageDataUrl: undefined,
    });
    showToast("Viewer export options reset", "info");
  };

  return (
    <div className="scene-section">
      <span className="scene-section-label">Viewer Export</span>
      <span className="scene-help-text">
        Quick presets change only the exported HTML viewer, not this editor viewport.
      </span>
      <div className="scene-subsection">
        <label className="scene-subsection-label">Title</label>
        <input
          type="text"
          className="scene-text-input"
          value={current.title ?? ""}
          onChange={(e) => setOption("title", e.target.value || undefined)}
          title="Optional title shown in the exported viewer and browser tab."
          placeholder="Use project name"
        />
      </div>
      <div className="scene-subsection">
        <label className="scene-subsection-label">Description</label>
        <textarea
          className="scene-textarea"
          value={current.description ?? ""}
          onChange={(e) => setOption("description", e.target.value || undefined)}
          title="Short text for viewer overlay and HTML meta description."
          placeholder="Short description for embed and metadata"
          rows={3}
        />
      </div>
      <div className="scene-subsection">
        <label className="scene-subsection-label">Quick Presets</label>
        <div className="scene-viewer-preset-grid">
          {VIEWER_STYLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className="scene-viewer-preset-btn"
              onClick={() => applyViewerStylePreset(preset)}
              title={preset.description}
            >
              <strong>{preset.label}</strong>
              <small>{preset.description}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="scene-subsection">
        <label className="scene-subsection-label">Theme</label>
        <select
          className="scene-select"
          value={current.theme ?? "dark"}
          onChange={(e) =>
            setOption("theme", (e.target.value as "dark" | "light") ?? "dark")
          }
          title="Switch exported viewer UI between dark and light styling."
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>
      <div className="scene-subsection">
        <label className="scene-subsection-label">Autospin</label>
        <input
          type="number"
          className="scene-numeric-input"
          value={current.autospin ?? 0}
          onChange={(e) =>
            setOption("autospin", parseFloat(e.target.value) || 0)
          }
          title="Camera auto-rotation speed. Negative values reverse direction."
          step={0.1}
          placeholder="0 = off"
        />
      </div>
      <div className="scene-subsection">
        <label className="scene-subsection-label">Min Zoom</label>
        <input
          type="number"
          className="scene-numeric-input"
          value={current.minDistance ?? ""}
          onChange={(e) =>
            setOption(
              "minDistance",
              e.target.value ? parseFloat(e.target.value) : undefined
            )
          }
          title="Minimum zoom distance for orbit controls."
          step={0.5}
          placeholder="default"
        />
      </div>
      <div className="scene-subsection">
        <label className="scene-subsection-label">Max Zoom</label>
        <input
          type="number"
          className="scene-numeric-input"
          value={current.maxDistance ?? ""}
          onChange={(e) =>
            setOption(
              "maxDistance",
              e.target.value ? parseFloat(e.target.value) : undefined
            )
          }
          title="Maximum zoom distance for orbit controls."
          step={1}
          placeholder="default"
        />
      </div>
      <div className="scene-subsection scene-checks">
        <label className="scene-checkbox-row">
          <input
            type="checkbox"
            checked={current.showInfoPanel !== false}
            onChange={(e) => setOption("showInfoPanel", e.target.checked)}
            title="Show or hide the scene stats panel in exported viewer."
          />
          <span>Show Info Panel</span>
        </label>
        <label className="scene-checkbox-row">
          <input
            type="checkbox"
            checked={current.includePreviewImage !== false}
            onChange={(e) => setOption("includePreviewImage", e.target.checked)}
            title="Embed a screenshot poster into the exported HTML loading screen."
          />
          <span>Embed Preview Screenshot</span>
        </label>
      </div>
      <div className="scene-subsection scene-checks">
        <label className="scene-checkbox-row">
          <input
            type="checkbox"
            checked={current.responsiveEmbed === true}
            onChange={(e) => setOption("responsiveEmbed", e.target.checked)}
            title="Enable ratio-based sizing for easy iframe embedding."
          />
          <span>Responsive Embed (Aspect Ratio)</span>
        </label>
      </div>
      {current.responsiveEmbed && (
        <div className="scene-subsection">
          <label className="scene-subsection-label">Aspect Ratio</label>
          <input
            type="text"
            className="scene-text-input"
            value={normalizedAspect}
            onChange={(e) =>
              setOption("aspectRatio", e.target.value || "16 / 9")
            }
            title="Examples: 16 / 9, 4:3, 1:1, 9:16."
            placeholder="16 / 9 or 4:3"
          />
          <div className="scene-pill-row">
            {ASPECT_RATIO_PRESETS.map((ratio) => (
              <button
                key={ratio.label}
                className={`scene-pill-btn ${
                  normalizedAspect === ratio.value ? "active" : ""
                }`}
                onClick={() => setOption("aspectRatio", ratio.value)}
                title={ratio.hint}
              >
                {ratio.label}
              </button>
            ))}
          </div>
          <span className="scene-help-text">
            Aspect presets are optimized for desktop, slides, and mobile embeds.
          </span>
        </div>
      )}
      <div className="scene-subsection scene-checks">
        <label className="scene-checkbox-row">
          <input
            type="checkbox"
            checked={current.loadingEnabled !== false}
            onChange={(e) => setOption("loadingEnabled", e.target.checked)}
            title="Show branded loading overlay while the viewer initializes."
          />
          <span>Loading Screen</span>
        </label>
      </div>
      {current.loadingEnabled !== false && (
        <>
          <div className="scene-subsection">
            <label className="scene-subsection-label">Loading Title</label>
            <input
              type="text"
              className="scene-text-input"
              value={current.loadingTitle ?? ""}
              onChange={(e) =>
                setOption(
                  "loadingTitle",
                  e.target.value || DEFAULT_VIEWER_EXPORT_OPTIONS.loadingTitle
                )
              }
              title="Main heading shown on loading overlay."
              placeholder="Loading Viewer"
            />
          </div>
          <div className="scene-subsection">
            <label className="scene-subsection-label">Loading Subtitle</label>
            <input
              type="text"
              className="scene-text-input"
              value={current.loadingSubtitle ?? ""}
              onChange={(e) =>
                setOption(
                  "loadingSubtitle",
                  e.target.value || DEFAULT_VIEWER_EXPORT_OPTIONS.loadingSubtitle
                )
              }
              title="Secondary loading text for your visitors."
              placeholder="Preparing scene..."
            />
          </div>
          <div className="scene-subsection">
            <ColorPicker
              label="Loading Background"
              value={
                current.loadingBackground ??
                DEFAULT_VIEWER_EXPORT_OPTIONS.loadingBackground ??
                "#101317"
              }
              onChange={(c) => setOption("loadingBackground", c)}
            />
          </div>
          <div className="scene-subsection">
            <ColorPicker
              label="Loading Text"
              value={
                current.loadingTextColor ??
                DEFAULT_VIEWER_EXPORT_OPTIONS.loadingTextColor ??
                "#ffffff"
              }
              onChange={(c) => setOption("loadingTextColor", c)}
            />
          </div>
          <div className="scene-subsection">
            <ColorPicker
              label="Loading Accent"
              value={
                current.loadingAccentColor ??
                DEFAULT_VIEWER_EXPORT_OPTIONS.loadingAccentColor ??
                "#4da6ff"
              }
              onChange={(c) => setOption("loadingAccentColor", c)}
            />
          </div>
        </>
      )}
      <div className="scene-subsection">
        <label className="scene-subsection-label">Custom CSS</label>
        <textarea
          className="scene-textarea scene-textarea-code"
          value={current.customCss ?? ""}
          onChange={(e) => setOption("customCss", e.target.value || undefined)}
          title="Optional CSS injected into the exported viewer. Use with care."
          placeholder=".mv-btn { border-radius: 999px; }"
          rows={4}
        />
        <span className="scene-help-text">
          Tip: style classes like <code>.mv-btn</code>, <code>.mv-title</code>,{" "}
          <code>.mv-info</code>.
        </span>
      </div>
      <div className="scene-subsection scene-action-row">
        <button
          className="scene-reset-btn"
          onClick={resetViewerOptions}
          title="Restore default viewer export settings."
        >
          Reset to Defaults
        </button>
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
        <span className="scene-icon">CAM</span>
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
          { kind: "directional", icon: "D", label: "Directional" },
          { kind: "point", icon: "P", label: "Point" },
          { kind: "spot", icon: "S", label: "Spot" },
        ].map((l) => (
          <button
            key={l.kind}
            className="scene-light-btn"
            onClick={() => handleAddLight(l.kind)}
            title={`Add ${l.label} Light`}
          >
            <span className="scene-icon">{l.icon}</span>
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
    { key: "perspective", label: "Perspective", icon: "P" },
    { key: "front", label: "Front", icon: "F" },
    { key: "back", label: "Back", icon: "B" },
    { key: "left", label: "Left", icon: "L" },
    { key: "right", label: "Right", icon: "R" },
    { key: "top", label: "Top", icon: "T" },
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
            <span className="scene-icon">{p.icon}</span>
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
