// ============================================================
// Timeline Panel — Keyframe animation editor
// Phase 5: Play/Pause/Stop, Scrub, Keyframe markers, Clips
// Apple HIG: Clear controls, immediate feedback
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from "react";
import { v4 as uuid } from "uuid";
import { useEditorStore } from "../../store/editorStore";
import { showToast } from "../../ui/Toast";
import type {
  AnimationClip,
  AnimationTrack,
  Keyframe,
  AnimatableProperty,
  EasingType,
  ClipId,
} from "../../core/document/types";
import type { PlaybackState } from "../../core/timeline/timelineRuntime";
import "./TimelinePanel.css";

// ── Property config ──

const PROPERTIES: { value: AnimatableProperty; label: string; group: string }[] = [
  { value: "position.x", label: "Pos X", group: "Position" },
  { value: "position.y", label: "Pos Y", group: "Position" },
  { value: "position.z", label: "Pos Z", group: "Position" },
  { value: "rotation.x", label: "Rot X", group: "Rotation" },
  { value: "rotation.y", label: "Rot Y", group: "Rotation" },
  { value: "rotation.z", label: "Rot Z", group: "Rotation" },
  { value: "scale.x", label: "Scale X", group: "Scale" },
  { value: "scale.y", label: "Scale Y", group: "Scale" },
  { value: "scale.z", label: "Scale Z", group: "Scale" },
  { value: "opacity", label: "Opacity", group: "Material" },
  { value: "emissiveIntensity", label: "Emissive Int", group: "Material" },
];

const EASING_OPTIONS: EasingType[] = [
  "linear", "easeIn", "easeOut", "easeInOut", "spring", "bounce",
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

// ── Timeline Panel ──

export const TimelinePanel: React.FC = () => {
  const document = useEditorStore((s) => s.document);
  const updateDocument = useEditorStore((s) => s.updateDocument);
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const selectedNode = selectedNodeId ? document.nodes[selectedNodeId] : null;

  const timeline = document.timeline;
  const activeClip = timeline.clips.find((c) => c.id === timeline.activeClipId) ?? null;

  // Runtime state (subscribed)
  const [playbackState, setPlaybackState] = useState<PlaybackState>("stopped");
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  // Subscribe to runtime events
  useEffect(() => {
    const handleTick = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setPlaybackState(detail.state);
        setCurrentTime(detail.time);
      }
    };

    window.addEventListener("timeline:tick", handleTick);
    return () => window.removeEventListener("timeline:tick", handleTick);
  }, []);

  // ── Clip Management ──

  const createClip = () => {
    const clipId = uuid();
    const newClip: AnimationClip = {
      id: clipId,
      name: `Clip ${timeline.clips.length + 1}`,
      duration: 3,
      loop: true,
      tracks: [],
    };
    const newTimeline = {
      ...timeline,
      clips: [...timeline.clips, newClip],
      activeClipId: clipId,
    };
    updateDocument({ ...document, timeline: newTimeline });
  };

  const setActiveClip = (clipId: ClipId) => {
    updateDocument({
      ...document,
      timeline: { ...timeline, activeClipId: clipId },
    });
    window.dispatchEvent(
      new CustomEvent("timeline:set-clip", { detail: { clipId } })
    );
  };

  const updateClip = (updatedClip: AnimationClip) => {
    const newTimeline = {
      ...timeline,
      clips: timeline.clips.map((c) => (c.id === updatedClip.id ? updatedClip : c)),
    };
    updateDocument({ ...document, timeline: newTimeline });
  };

  const deleteClip = (clipId: string) => {
    const newClips = timeline.clips.filter((c) => c.id !== clipId);
    updateDocument({
      ...document,
      timeline: {
        ...timeline,
        clips: newClips,
        activeClipId: newClips.length > 0 ? newClips[0]!.id : null,
      },
    });
    window.dispatchEvent(new CustomEvent("timeline:stop"));
  };

  // ── Track Management ──

  const addTrack = (property: AnimatableProperty) => {
    if (!activeClip || !selectedNodeId) return;

    // Don't duplicate
    const exists = activeClip.tracks.find(
      (t) => t.nodeId === selectedNodeId && t.property === property
    );
    if (exists) {
      showToast("Track already exists", "info");
      return;
    }

    const trackId = uuid();
    const newTrack: AnimationTrack = {
      id: trackId,
      nodeId: selectedNodeId,
      property,
      keyframes: [
        { time: 0, value: getDefaultValue(property), easing: "easeInOut" },
        { time: activeClip.duration, value: getDefaultValue(property), easing: "easeInOut" },
      ],
    };

    updateClip({ ...activeClip, tracks: [...activeClip.tracks, newTrack] });
    setSelectedTrackId(trackId);
  };

  const deleteTrack = (trackId: string) => {
    if (!activeClip) return;
    updateClip({
      ...activeClip,
      tracks: activeClip.tracks.filter((t) => t.id !== trackId),
    });
    if (selectedTrackId === trackId) setSelectedTrackId(null);
  };

  // ── Keyframe Management ──

  const addKeyframe = (trackId: string) => {
    if (!activeClip) return;
    const track = activeClip.tracks.find((t) => t.id === trackId);
    if (!track) return;

    // Add keyframe at current playhead position
    const time = currentTime;
    const existing = track.keyframes.find((kf) => Math.abs(kf.time - time) < 0.01);
    if (existing) {
      showToast("Keyframe already exists at this time", "info");
      return;
    }

    const newKf: Keyframe = {
      time,
      value: getDefaultValue(track.property),
      easing: "easeInOut",
    };

    const newKeyframes = [...track.keyframes, newKf].sort((a, b) => a.time - b.time);
    updateClip({
      ...activeClip,
      tracks: activeClip.tracks.map((t) =>
        t.id === trackId ? { ...t, keyframes: newKeyframes } : t
      ),
    });
  };

  const updateKeyframe = (trackId: string, kfIndex: number, updates: Partial<Keyframe>) => {
    if (!activeClip) return;
    updateClip({
      ...activeClip,
      tracks: activeClip.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const newKfs = [...t.keyframes];
        newKfs[kfIndex] = { ...newKfs[kfIndex]!, ...updates };
        return { ...t, keyframes: newKfs.sort((a, b) => a.time - b.time) };
      }),
    });
  };

  const deleteKeyframe = (trackId: string, kfIndex: number) => {
    if (!activeClip) return;
    updateClip({
      ...activeClip,
      tracks: activeClip.tracks.map((t) => {
        if (t.id !== trackId) return t;
        return { ...t, keyframes: t.keyframes.filter((_, i) => i !== kfIndex) };
      }),
    });
  };

  // ── Playback Controls ──

  const handlePlay = () => window.dispatchEvent(new CustomEvent("timeline:play"));
  const handlePause = () => window.dispatchEvent(new CustomEvent("timeline:pause"));
  const handleStop = () => window.dispatchEvent(new CustomEvent("timeline:stop"));

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    window.dispatchEvent(new CustomEvent("timeline:seek", { detail: { time } }));
  };

  // ── Filtered tracks for current selection ──

  const visibleTracks = activeClip?.tracks.filter(
    (t) => !selectedNodeId || t.nodeId === selectedNodeId
  ) ?? [];

  // ── Track ruler ticks ──

  const duration = activeClip?.duration ?? 3;
  const ticks: number[] = [];
  const step = duration <= 5 ? 0.5 : duration <= 15 ? 1 : 2;
  for (let t = 0; t <= duration; t += step) ticks.push(t);

  return (
    <div className="tl-panel">
      {/* ── Header: Clips + Transport ── */}
      <div className="tl-header">
        <div className="tl-clips">
          {timeline.clips.map((clip) => (
            <button
              key={clip.id}
              className={`tl-clip-tab ${clip.id === timeline.activeClipId ? "active" : ""}`}
              onClick={() => setActiveClip(clip.id)}
            >
              {clip.name}
              <span
                className="tl-clip-close"
                onClick={(e) => { e.stopPropagation(); deleteClip(clip.id); }}
              >
                ×
              </span>
            </button>
          ))}
          <button className="tl-clip-add" onClick={createClip} title="New Clip">
            +
          </button>
        </div>

        <div className="tl-transport">
          <button className="tl-transport-btn" onClick={handleStop} title="Stop">⏹</button>
          {playbackState === "playing" ? (
            <button className="tl-transport-btn tl-transport-active" onClick={handlePause} title="Pause">⏸</button>
          ) : (
            <button className="tl-transport-btn" onClick={handlePlay} title="Play">▶</button>
          )}
          <span className="tl-time-display">{formatTime(currentTime)}</span>
          <span className="tl-time-separator">/</span>
          <input
            className="tl-duration-input"
            type="number"
            min={0.5}
            max={120}
            step={0.5}
            value={duration}
            onChange={(e) => {
              if (!activeClip) return;
              updateClip({ ...activeClip, duration: Math.max(0.5, parseFloat(e.target.value) || 3) });
            }}
            title="Clip duration (seconds)"
          />
          <span className="tl-time-unit">s</span>
          <label className="tl-loop-toggle" title="Loop">
            <input
              type="checkbox"
              checked={activeClip?.loop ?? true}
              onChange={(e) => {
                if (!activeClip) return;
                updateClip({ ...activeClip, loop: e.target.checked });
              }}
            />
            <span>Loop</span>
          </label>
        </div>
      </div>

      {!activeClip ? (
        <div className="tl-empty">
          <span>Create a clip to start animating.</span>
        </div>
      ) : (
        <div className="tl-body">
          {/* ── Track List (left) ── */}
          <div className="tl-track-list">
            <div className="tl-track-list-header">
              <span>Tracks</span>
              {selectedNodeId && (
                <div className="tl-add-track-dropdown">
                  <select
                    className="tl-add-track-select"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) addTrack(e.target.value as AnimatableProperty);
                      e.target.value = "";
                    }}
                  >
                    <option value="">+ Track</option>
                    {PROPERTIES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {visibleTracks.map((track) => {
              const propLabel = PROPERTIES.find((p) => p.value === track.property)?.label ?? track.property;
              const nodeName = document.nodes[track.nodeId]?.name ?? "?";
              return (
                <div
                  key={track.id}
                  className={`tl-track-item ${selectedTrackId === track.id ? "selected" : ""}`}
                  onClick={() => setSelectedTrackId(track.id)}
                >
                  <span className="tl-track-node">{nodeName}</span>
                  <span className="tl-track-prop">{propLabel}</span>
                  <button
                    className="tl-track-delete"
                    onClick={(e) => { e.stopPropagation(); deleteTrack(track.id); }}
                    title="Delete track"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {visibleTracks.length === 0 && (
              <div className="tl-track-empty">
                {selectedNodeId ? "Select a property to add a track." : "Select an object first."}
              </div>
            )}
          </div>

          {/* ── Timeline Area (right) ── */}
          <div className="tl-timeline-area">
            {/* Ruler */}
            <div className="tl-ruler">
              {ticks.map((t) => (
                <div
                  key={t}
                  className="tl-ruler-tick"
                  style={{ left: `${(t / duration) * 100}%` }}
                >
                  <span className="tl-ruler-label">{t.toFixed(1)}s</span>
                </div>
              ))}
              {/* Playhead */}
              <div
                className="tl-playhead"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />
            </div>

            {/* Scrub bar */}
            <input
              type="range"
              className="tl-scrub"
              min={0}
              max={duration}
              step={0.01}
              value={currentTime}
              onChange={handleScrub}
            />

            {/* Track rows with keyframe dots */}
            <div className="tl-track-rows">
              {visibleTracks.map((track) => (
                <div
                  key={track.id}
                  className={`tl-track-row ${selectedTrackId === track.id ? "selected" : ""}`}
                  onClick={() => setSelectedTrackId(track.id)}
                >
                  {track.keyframes.map((kf, ki) => (
                    <div
                      key={ki}
                      className="tl-keyframe-dot"
                      style={{ left: `${(kf.time / duration) * 100}%` }}
                      title={`t=${kf.time.toFixed(2)}s  val=${kf.value}  ${kf.easing}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTrackId(track.id);
                      }}
                    />
                  ))}
                  {/* Add keyframe button at playhead */}
                  <button
                    className="tl-add-kf-btn"
                    style={{ left: `${(currentTime / duration) * 100}%` }}
                    onClick={(e) => { e.stopPropagation(); addKeyframe(track.id); }}
                    title="Add keyframe at playhead"
                  >
                    ◆
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Keyframe Editor (bottom strip) ── */}
      {selectedTrackId && activeClip && (
        <KeyframeEditor
          track={activeClip.tracks.find((t) => t.id === selectedTrackId)!}
          duration={duration}
          onUpdateKeyframe={(ki, updates) => updateKeyframe(selectedTrackId, ki, updates)}
          onDeleteKeyframe={(ki) => deleteKeyframe(selectedTrackId, ki)}
        />
      )}
    </div>
  );
};

// ── Keyframe Editor Strip ──

const KeyframeEditor: React.FC<{
  track: AnimationTrack;
  duration: number;
  onUpdateKeyframe: (index: number, updates: Partial<Keyframe>) => void;
  onDeleteKeyframe: (index: number) => void;
}> = ({ track, duration, onUpdateKeyframe, onDeleteKeyframe }) => {
  if (!track) return null;

  return (
    <div className="tl-kf-editor">
      <div className="tl-kf-editor-header">
        <span className="tl-kf-editor-label">Keyframes</span>
      </div>
      <div className="tl-kf-list">
        {track.keyframes.map((kf, i) => (
          <div key={i} className="tl-kf-item">
            <div className="tl-kf-field">
              <label>Time</label>
              <input
                type="number"
                step={0.05}
                min={0}
                max={duration}
                value={kf.time}
                onChange={(e) => onUpdateKeyframe(i, { time: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="tl-kf-field">
              <label>Value</label>
              {typeof kf.value === "number" ? (
                <input
                  type="number"
                  step={0.1}
                  value={kf.value}
                  onChange={(e) => onUpdateKeyframe(i, { value: parseFloat(e.target.value) || 0 })}
                />
              ) : typeof kf.value === "string" ? (
                <input
                  type="text"
                  value={kf.value}
                  onChange={(e) => onUpdateKeyframe(i, { value: e.target.value })}
                />
              ) : (
                <select
                  value={kf.value ? "true" : "false"}
                  onChange={(e) => onUpdateKeyframe(i, { value: e.target.value === "true" })}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              )}
            </div>
            <div className="tl-kf-field">
              <label>Easing</label>
              <select
                value={kf.easing}
                onChange={(e) => onUpdateKeyframe(i, { easing: e.target.value as EasingType })}
              >
                {EASING_OPTIONS.map((ea) => (
                  <option key={ea} value={ea}>{ea}</option>
                ))}
              </select>
            </div>
            <button
              className="tl-kf-delete"
              onClick={() => onDeleteKeyframe(i)}
              title="Delete keyframe"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Helpers ──

function getDefaultValue(property: AnimatableProperty): number {
  if (property.startsWith("scale")) return 1;
  if (property === "opacity") return 1;
  return 0;
}
