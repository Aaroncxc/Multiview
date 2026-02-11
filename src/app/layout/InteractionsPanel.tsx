// ============================================================
// Interactions Panel — States, Events, Actions editor per node
// Phase 4: The "Spline" killer feature
// ============================================================

import React, { useState } from "react";
import { v4 as uuid } from "uuid";
import { useEditorStore } from "../../store/editorStore";
import { Slider } from "../../ui/Slider";
import { ColorPicker } from "../../ui/ColorPicker";
import type {
  ObjectState,
  InteractionEvent,
  InteractionAction,
  StateOverrides,
  EventTrigger,
  ActionType,
  EasingType,
  NodeInteractions,
} from "../../core/document/types";
import "./InteractionsPanel.css";

const EVENT_TRIGGERS: { value: EventTrigger; label: string }[] = [
  { value: "click", label: "Click" },
  { value: "doubleClick", label: "Double Click" },
  { value: "mouseEnter", label: "Mouse Enter" },
  { value: "mouseLeave", label: "Mouse Leave" },
  { value: "mouseDown", label: "Mouse Down" },
  { value: "mouseUp", label: "Mouse Up" },
  { value: "keyDown", label: "Key Down" },
  { value: "keyUp", label: "Key Up" },
  { value: "start", label: "On Start" },
];

const EASING_OPTIONS: EasingType[] = [
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
  "spring",
  "bounce",
];

// ── State Editor ──

const StateEditor: React.FC<{
  state: ObjectState;
  onUpdate: (s: ObjectState) => void;
  onDelete: () => void;
}> = ({ state, onUpdate, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const o = state.overrides;

  const updateOverride = (key: keyof StateOverrides, value: any) => {
    onUpdate({
      ...state,
      overrides: { ...state.overrides, [key]: value },
    });
  };

  const setVec3 = (
    key: "position" | "rotation" | "scale",
    axis: 0 | 1 | 2,
    val: number
  ) => {
    const current: [number, number, number] = o[key] ? [...o[key]!] : [0, 0, 0];
    current[axis] = val;
    updateOverride(key, current);
  };

  return (
    <div className="ip-state">
      <div className="ip-state-header" onClick={() => setExpanded(!expanded)}>
        <span className="ip-expand-icon">{expanded ? "▾" : "▸"}</span>
        <input
          className="ip-state-name"
          value={state.name}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onUpdate({ ...state, name: e.target.value })}
          spellCheck={false}
        />
        <button className="ip-delete-btn" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete state">
          ×
        </button>
      </div>

      {expanded && (
        <div className="ip-state-body">
          {/* Position */}
          <div className="ip-override-group">
            <label className="ip-override-label">
              <input
                type="checkbox"
                checked={!!o.position}
                onChange={(e) =>
                  updateOverride("position", e.target.checked ? [0, 0, 0] : undefined)
                }
              />
              Position
            </label>
            {o.position && (
              <div className="ip-vec3">
                {(["X", "Y", "Z"] as const).map((lbl, i) => (
                  <div className="ip-vec3-field" key={lbl}>
                    <span className="ip-vec3-label">{lbl}</span>
                    <input
                      type="number"
                      step="0.1"
                      value={o.position![i as 0 | 1 | 2]}
                      onChange={(e) => setVec3("position", i as 0 | 1 | 2, parseFloat(e.target.value) || 0)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rotation */}
          <div className="ip-override-group">
            <label className="ip-override-label">
              <input
                type="checkbox"
                checked={!!o.rotation}
                onChange={(e) =>
                  updateOverride("rotation", e.target.checked ? [0, 0, 0] : undefined)
                }
              />
              Rotation
            </label>
            {o.rotation && (
              <div className="ip-vec3">
                {(["X", "Y", "Z"] as const).map((lbl, i) => (
                  <div className="ip-vec3-field" key={lbl}>
                    <span className="ip-vec3-label">{lbl}</span>
                    <input
                      type="number"
                      step="1"
                      value={o.rotation![i as 0 | 1 | 2]}
                      onChange={(e) => setVec3("rotation", i as 0 | 1 | 2, parseFloat(e.target.value) || 0)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Scale */}
          <div className="ip-override-group">
            <label className="ip-override-label">
              <input
                type="checkbox"
                checked={!!o.scale}
                onChange={(e) =>
                  updateOverride("scale", e.target.checked ? [1, 1, 1] : undefined)
                }
              />
              Scale
            </label>
            {o.scale && (
              <div className="ip-vec3">
                {(["X", "Y", "Z"] as const).map((lbl, i) => (
                  <div className="ip-vec3-field" key={lbl}>
                    <span className="ip-vec3-label">{lbl}</span>
                    <input
                      type="number"
                      step="0.1"
                      value={o.scale![i as 0 | 1 | 2]}
                      onChange={(e) => setVec3("scale", i as 0 | 1 | 2, parseFloat(e.target.value) || 0)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Color */}
          <div className="ip-override-group">
            <label className="ip-override-label">
              <input
                type="checkbox"
                checked={o.materialColor !== undefined}
                onChange={(e) =>
                  updateOverride("materialColor", e.target.checked ? "#4da6ff" : undefined)
                }
              />
              Color
            </label>
            {o.materialColor !== undefined && (
              <ColorPicker
                value={o.materialColor}
                onChange={(c) => updateOverride("materialColor", c)}
              />
            )}
          </div>

          {/* Opacity */}
          <div className="ip-override-group">
            <label className="ip-override-label">
              <input
                type="checkbox"
                checked={o.opacity !== undefined}
                onChange={(e) =>
                  updateOverride("opacity", e.target.checked ? 1 : undefined)
                }
              />
              Opacity
            </label>
            {o.opacity !== undefined && (
              <Slider
                label="Opacity"
                value={o.opacity}
                onChange={(v) => updateOverride("opacity", v)}
                min={0}
                max={1}
                step={0.01}
              />
            )}
          </div>

          {/* Emissive */}
          <div className="ip-override-group">
            <label className="ip-override-label">
              <input
                type="checkbox"
                checked={o.emissive !== undefined}
                onChange={(e) =>
                  updateOverride("emissive", e.target.checked ? "#000000" : undefined)
                }
              />
              Emissive
            </label>
            {o.emissive !== undefined && (
              <ColorPicker
                value={o.emissive}
                onChange={(c) => updateOverride("emissive", c)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Event + Action Editor Row ──

const EventActionRow: React.FC<{
  event: InteractionEvent;
  actions: InteractionAction[];
  states: ObjectState[];
  onUpdateEvent: (e: InteractionEvent) => void;
  onUpdateAction: (a: InteractionAction) => void;
  onDelete: () => void;
}> = ({ event, actions, states, onUpdateEvent, onUpdateAction, onDelete }) => {
  const action = actions.find((a) => a.id === event.actionId);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="ip-event-row">
      <div className="ip-event-header" onClick={() => setExpanded(!expanded)}>
        <span className="ip-expand-icon">{expanded ? "▾" : "▸"}</span>
        <select
          className="ip-event-trigger"
          value={event.trigger}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            onUpdateEvent({ ...event, trigger: e.target.value as EventTrigger })
          }
        >
          {EVENT_TRIGGERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <span className="ip-event-arrow">→</span>
        <span className="ip-event-action-label">{action?.label || "Action"}</span>
        <button className="ip-delete-btn" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete">
          ×
        </button>
      </div>

      {expanded && action && (
        <div className="ip-event-body">
          {/* Action type */}
          <div className="ip-field">
            <label>Action Type</label>
            <select
              value={action.type}
              onChange={(e) =>
                onUpdateAction({ ...action, type: e.target.value as ActionType })
              }
            >
              <option value="transitionToState">Transition to State</option>
              <option value="toggleState">Toggle State</option>
              <option value="openLink">Open Link</option>
            </select>
          </div>

          {/* Target state */}
          {action.type === "transitionToState" && (
            <div className="ip-field">
              <label>Target State</label>
              <select
                value={action.targetStateId ?? ""}
                onChange={(e) =>
                  onUpdateAction({ ...action, targetStateId: e.target.value })
                }
              >
                <option value="">— Select —</option>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Toggle states */}
          {action.type === "toggleState" && (
            <>
              <div className="ip-field">
                <label>State A</label>
                <select
                  value={action.stateA ?? ""}
                  onChange={(e) =>
                    onUpdateAction({ ...action, stateA: e.target.value })
                  }
                >
                  <option value="">— Select —</option>
                  {states.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="ip-field">
                <label>State B</label>
                <select
                  value={action.stateB ?? ""}
                  onChange={(e) =>
                    onUpdateAction({ ...action, stateB: e.target.value })
                  }
                >
                  <option value="">— Select —</option>
                  {states.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Open Link */}
          {action.type === "openLink" && (
            <div className="ip-field">
              <label>URL</label>
              <input
                type="text"
                value={action.url ?? ""}
                onChange={(e) =>
                  onUpdateAction({ ...action, url: e.target.value })
                }
                placeholder="https://..."
              />
            </div>
          )}

          {/* Duration */}
          {(action.type === "transitionToState" || action.type === "toggleState") && (
            <>
              <Slider
                label="Duration (ms)"
                value={action.duration ?? 300}
                onChange={(v) => onUpdateAction({ ...action, duration: Math.round(v) })}
                min={0}
                max={3000}
                step={50}
                precision={0}
              />
              <div className="ip-field">
                <label>Easing</label>
                <select
                  value={action.easing ?? "easeInOut"}
                  onChange={(e) =>
                    onUpdateAction({ ...action, easing: e.target.value as EasingType })
                  }
                >
                  {EASING_OPTIONS.map((ea) => (
                    <option key={ea} value={ea}>{ea}</option>
                  ))}
                </select>
              </div>
              <Slider
                label="Delay (ms)"
                value={action.delay ?? 0}
                onChange={(v) => onUpdateAction({ ...action, delay: Math.round(v) })}
                min={0}
                max={2000}
                step={50}
                precision={0}
              />
            </>
          )}

          {/* Key input for key events */}
          {(event.trigger === "keyDown" || event.trigger === "keyUp") && (
            <div className="ip-field">
              <label>Key</label>
              <input
                type="text"
                value={event.key ?? ""}
                onChange={(e) =>
                  onUpdateEvent({ ...event, key: e.target.value })
                }
                placeholder="e.g. Space, Enter, a"
                maxLength={20}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Main Interactions Panel ──

export const InteractionsPanel: React.FC = () => {
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const document = useEditorStore((s) => s.document);
  const updateDocument = useEditorStore((s) => s.updateDocument);

  const node = selectedNodeId ? document.nodes[selectedNodeId] : null;
  if (!node) return null;

  const interactions: NodeInteractions = node.interactions ?? {
    states: [],
    events: [],
    actions: [],
  };

  const updateInteractions = (newInteractions: NodeInteractions) => {
    const newDoc = structuredClone(document);
    newDoc.nodes[node.id]!.interactions = newInteractions;
    updateDocument(newDoc);
  };

  // ── Add State ──
  const addState = () => {
    const stateId = uuid();
    const newState: ObjectState = {
      id: stateId,
      name: `State ${interactions.states.length + 1}`,
      overrides: {},
    };
    updateInteractions({
      ...interactions,
      states: [...interactions.states, newState],
    });
  };

  // ── Update State ──
  const updateState = (updated: ObjectState) => {
    updateInteractions({
      ...interactions,
      states: interactions.states.map((s) => (s.id === updated.id ? updated : s)),
    });
  };

  // ── Delete State ──
  const deleteState = (stateId: string) => {
    updateInteractions({
      ...interactions,
      states: interactions.states.filter((s) => s.id !== stateId),
      // Also remove events/actions that reference this state
      events: interactions.events.filter((e) => {
        const action = interactions.actions.find((a) => a.id === e.actionId);
        return action?.targetStateId !== stateId;
      }),
    });
  };

  // ── Add Event + Action ──
  const addEventAction = () => {
    const actionId = uuid();
    const eventId = uuid();

    const newAction: InteractionAction = {
      id: actionId,
      type: "transitionToState",
      label: "New Action",
      targetNodeId: node.id,
      duration: 300,
      easing: "easeInOut",
    };

    const newEvent: InteractionEvent = {
      id: eventId,
      trigger: "click",
      actionId,
    };

    updateInteractions({
      ...interactions,
      actions: [...interactions.actions, newAction],
      events: [...interactions.events, newEvent],
    });
  };

  // ── Update Event ──
  const updateEvent = (updated: InteractionEvent) => {
    updateInteractions({
      ...interactions,
      events: interactions.events.map((e) => (e.id === updated.id ? updated : e)),
    });
  };

  // ── Update Action ──
  const updateAction = (updated: InteractionAction) => {
    updateInteractions({
      ...interactions,
      actions: interactions.actions.map((a) => (a.id === updated.id ? updated : a)),
    });
  };

  // ── Delete Event + its Action ──
  const deleteEventAction = (eventId: string) => {
    const evt = interactions.events.find((e) => e.id === eventId);
    updateInteractions({
      ...interactions,
      events: interactions.events.filter((e) => e.id !== eventId),
      actions: interactions.actions.filter((a) => a.id !== evt?.actionId),
    });
  };

  // ── Preview State ──
  const previewState = (state: ObjectState) => {
    if (!node.runtimeObjectUuid) return;
    window.dispatchEvent(
      new CustomEvent("editor:preview-state", {
        detail: { nodeId: node.id, stateId: state.id },
      })
    );
  };

  return (
    <div className="ip-panel">
      {/* ── States ── */}
      <div className="ip-section">
        <div className="ip-section-header">
          <span className="ip-section-label">States</span>
          <button className="ip-add-btn" onClick={addState}>
            + State
          </button>
        </div>

        {interactions.states.length === 0 ? (
          <div className="ip-empty">No states defined. Add one to begin.</div>
        ) : (
          interactions.states.map((state) => (
            <StateEditor
              key={state.id}
              state={state}
              onUpdate={updateState}
              onDelete={() => deleteState(state.id)}
            />
          ))
        )}
      </div>

      {/* ── Events & Actions ── */}
      <div className="ip-section">
        <div className="ip-section-header">
          <span className="ip-section-label">Events & Actions</span>
          <button
            className="ip-add-btn"
            onClick={addEventAction}
            disabled={interactions.states.length === 0}
            title={interactions.states.length === 0 ? "Add a state first" : "Add event"}
          >
            + Event
          </button>
        </div>

        {interactions.events.length === 0 ? (
          <div className="ip-empty">
            {interactions.states.length === 0
              ? "Create states first, then add events."
              : "No events. Add one to make this object interactive."}
          </div>
        ) : (
          interactions.events.map((evt) => (
            <EventActionRow
              key={evt.id}
              event={evt}
              actions={interactions.actions}
              states={interactions.states}
              onUpdateEvent={updateEvent}
              onUpdateAction={updateAction}
              onDelete={() => deleteEventAction(evt.id)}
            />
          ))
        )}
      </div>

      {/* ── Preview ── */}
      {interactions.states.length > 0 && (
        <div className="ip-section">
          <div className="ip-section-header">
            <span className="ip-section-label">Preview</span>
          </div>
          <div className="ip-preview-buttons">
            {interactions.states.map((state) => (
              <button
                key={state.id}
                className="ip-preview-btn"
                onClick={() => previewState(state)}
              >
                {state.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
