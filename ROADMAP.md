# MultiView Roadmap — Phasen & Sub-Phasen

> Detaillierte Feature-Planung für den MultiView 3D Editor.  
> Basis: Spline-Analyse + Sketchfab-Viewer-Referenz + Apple HIG.

---

## Legende

| Symbol | Bedeutung |
|--------|-----------|
| ✅ | Erledigt |
| 🔶 | Teilweise |
| ⬜ | Offen |
| 🔴 | Hohe Priorität (Portfolio-Transport) |

---

## Sketchfab-Viewer Analyse (Referenz für Portfolio-Transport)

Sketchfab ist der Referenz-Viewer für Portfolio-Embeds. Diese Features sollen wir übernehmen:

### Embed-Optionen (Sketchfab)
- **autostart** — Modell lädt automatisch
- **autospin** — Turntable (Wert = Geschwindigkeit, negativ = Rückwärts)
- **controls** — Orbit-Controls ein/aus
- **Navigation** — Orbit (Turntable) vs. FPS; Wechsel per UI
- **Theme** — Dark/Light, transparent background
- **Custom UI** — Beschreibung ein/aus, Watermark (je nach Plan)

### Für MultiView abgeleitet
- Orbit-only (kein Edit) als Standard im Viewer
- Kamera-Buttons oben (bereits umgesetzt)
- Wireframe / Polycount / Info-Panel (bereits umgesetzt)
- Autostart, Autospin als Viewer-Optionen
- Loading-Screen / Custom Branding
- Responsive Embed (aspect-ratio)
- Optional: AR-Preview (später)

---

## Phase 1: Editor-Kern ✅

| Sub-Phase | Aufgabe | Status |
|-----------|---------|--------|
| 1.1 | Undo/Redo System | ✅ |
| 1.2 | Erweiterte Primitives (Box, Sphere, Cylinder, etc.) | ✅ |
| 1.3 | Grid Snapping | ✅ |
| 1.4 | Duplicate (Ctrl+D) | ✅ |
| 1.5 | Tool-Modi (Translate, Rotate, Scale) | ✅ |
| 1.6 | OrbitControls + Gizmo | ✅ |
| 1.7 | glTF/GLB Import | ✅ |
| 1.8 | Pivot Point Editing | ⬜ |
| 1.9 | Copy/Paste (Ctrl+C/V) | ⬜ |
| 1.10 | Erweiterte Snap-Ziele (Vertex, Surface) | ⬜ |
| 1.11 | Multi-Selection | ⬜ |
| 1.12 | Gruppen / Hierarchie-Tools | ⬜ |

---

## Phase 2: Material-System ✅

| Sub-Phase | Aufgabe | Status |
|-----------|---------|--------|
| 2.1 | Color Picker | ✅ |
| 2.2 | Metalness / Roughness Slider | ✅ |
| 2.3 | Emissive + Intensity | ✅ |
| 2.4 | Opacity | ✅ |
| 2.5 | Material Presets (Library) | ✅ |
| 2.6 | Texture Maps (Albedo, Normal, etc.) | ✅ |
| 2.7 | Wireframe, Flat Shading, Double Sided | ✅ |
| 2.8 | Advanced (Glass, Clearcoat, Sheen) — UI als Dropdown | 🔶 |
| 2.9 | EyeDropper API (Farbpipette) | ⬜ |
| 2.10 | Material-Preview-Kugel | ⬜ |
| 2.11 | Material-Duplikation / Speichern | ⬜ |
| 2.12 | Glass/Toon Presets | ⬜ |

---

## Phase 3: Licht & Environment ✅

| Sub-Phase | Aufgabe | Status |
|-----------|---------|--------|
| 3.1 | Ambient Light | ✅ |
| 3.2 | Directional, Point, Spot | ✅ |
| 3.3 | HDRI (HDR + EXR) | ✅ |
| 3.4 | Fog | ✅ |
| 3.5 | Post-Processing (Bloom, Vignette) | ✅ |
| 3.6 | Tone Mapping | ✅ |
| 3.7 | Shadow-Qualität konfigurierbar | ⬜ |
| 3.8 | Environment Rotation | ⬜ |
| 3.9 | Mehrere Umgebungs-Presets | ⬜ |

---

## Phase 4: Interaktions-System ✅

| Sub-Phase | Aufgabe | Status |
|-----------|---------|--------|
| 4.1 | State-System (Overrides pro Objekt) | ✅ |
| 4.2 | Event-System (Click, Hover, KeyDown, etc.) | ✅ |
| 4.3 | Action-System (Transition, Toggle, OpenLink) | ✅ |
| 4.4 | Variables (global) | ✅ |
| 4.5 | Duration + Delay + Easing | ✅ |
| 4.6 | Inspector UI (States/Events/Actions) | ✅ |
| 4.7 | Conditional Actions (if variable) | ⬜ |
| 4.8 | Animation Play Action | ✅ |
| 4.9 | Mehrere Events pro Objekt | ✅ |
| 4.10 | Event-Chaining / Sequenzen | ⬜ |

---

## Phase 5: Timeline Animation ✅

| Sub-Phase | Aufgabe | Status |
|-----------|---------|--------|
| 5.1 | Keyframe-Modell | ✅ |
| 5.2 | Tracks (Transform, Material, etc.) | ✅ |
| 5.3 | Clips + Playback | ✅ |
| 5.4 | Scrub, Play/Pause/Stop | ✅ |
| 5.5 | glTF Animation Playback | ✅ |
| 5.6 | Graph Editor (Easing) | ✅ |
| 5.7 | Timeline-Panel Layout | ✅ |
| 5.8 | Keyframe-Drag im UI | ⬜ |
| 5.9 | Mehrere Clips gleichzeitig | ⬜ |
| 5.10 | Cloner Motion (Instanzen animieren) | ⬜ |

---

## Phase 6: 3D Modeling Tools ✅

| Sub-Phase | Aufgabe | Status |
|-----------|---------|--------|
| 6.1 | 3D Text (TextGeometry) | ✅ |
| 6.2 | Boolean (Union, Subtract, Intersect) | ✅ |
| 6.3 | Shape Extrusion (Star, Heart, Arrow) | ✅ |
| 6.4 | Cloner (Grid, Radial, Linear) | ✅ |
| 6.5 | Cloner-Parameter editierbar | ✅ |
| 6.6 | Text3D im Inspector editierbar | ✅ |
| 6.7 | FBX / OBJ Import | ✅ |
| 6.8 | Pen Tool / Kurven | ⬜ |
| 6.9 | Lathe / Revolve | ⬜ |
| 6.10 | Array-Modifier (ähnlich Cloner) | ⬜ |
| 6.11 | Löcher in Shapes | ⬜ |
| 6.12 | Parametrische Geometrie (Radius, Segments) | ⬜ |

---

## Phase 7: Physics & Particles ✅

| Sub-Phase | Aufgabe | Status |
|-----------|---------|--------|
| 7.1 | cannon-es Integration | ✅ |
| 7.2 | Rigid Body pro Mesh | ✅ |
| 7.3 | Particle Emitter | ✅ |
| 7.4 | Physics World Step | ✅ |
| 7.5 | Collision Shapes (Box) | ✅ |
| 7.6 | Particle Config (Count, Lifetime, etc.) | ✅ |
| 7.7 | Mehrere Physics-Bodies | ✅ |
| 7.8 | Kollisions-Shapes (Sphere, Cylinder) | ⬜ |
| 7.9 | Constraints (Hinge, Distance) | ⬜ |
| 7.10 | Color/Size over Lifetime | ⬜ |
| 7.11 | Particle Control Action | ⬜ |
| 7.12 | Force Fields | ⬜ |

---

## Phase 8: Export & Publishing 🔶 🔴

> **Priorität: Portfolio-Transport** — Szenen zuverlässig auf Website einbinden.

### 8A: Viewer Export (Portfolio) 🔴

| Sub-Phase | Aufgabe | Status |
|-----------|---------|--------|
| 8A.1 | Standalone HTML Viewer | ✅ |
| 8A.2 | Szenen-Daten inline | ✅ |
| 8A.3 | Interaktionen (States, Events) | ✅ |
| 8A.4 | Multi-Kamera + Buttons | ✅ |
| 8A.5 | Orbit-only (kein Edit) | ✅ |
| 8A.6 | Wireframe-Toggle | ✅ |
| 8A.7 | Info-Panel (Polycount, etc.) | ✅ |
| 8A.8 | **Autostart / Autospin Option** | ✅ |
| 8A.9 | **Loading-Screen Customization** | ⬜ |
| 8A.10 | **Orbit/Pan/Zoom Limits** | ✅ |
| 8A.11 | **Responsive Embed (aspect-ratio)** | ⬜ |
| 8A.12 | **Custom CSS/Theme** | ⬜ |
| 8A.13 | **Beschreibung / Titel** | ⬜ |
| 8A.14 | **Screenshot-Vorschau** | ⬜ |

### 8B: File Exports

| Sub-Phase | Aufgabe | Status |
|-----------|---------|--------|
| 8B.1 | glTF/GLB Export | ✅ |
| 8B.2 | Projekt JSON Export | ✅ |
| 8B.3 | Screenshot (PNG/JPG) | ✅ |
| 8B.4 | Video Export (WebM) | ⬜ |
| 8B.5 | USDZ (Apple AR) | ⬜ |

### 8C: Code & Components

| Sub-Phase | Aufgabe | Status |
|-----------|---------|--------|
| 8C.1 | Web Component (`<multiview-viewer>`) | ⬜ |
| 8C.2 | Vanilla JS Export | ⬜ |
| 8C.3 | React Component Export | ⬜ |
| 8C.4 | ZIP Bundle (offline-fähig) | ⬜ |
| 8C.5 | Runtime API (findObject, setVariable) | ⬜ |

### 8D: Projekt-Loading 🔴

| Sub-Phase | Aufgabe | Status |
|-----------|---------|--------|
| 8D.1 | **Projekt laden → Szene wiederherstellen** | ✅ |
| 8D.2 | **runtimeObjectUuid Mapping nach Load** | ✅ |
| 8D.3 | IndexedDB Auto-Save | ✅ |
| 8D.4 | Recent Files | ⬜ |

---

## Phase 9: Collaboration & Cloud ⬜

| Sub-Phase | Aufgabe | Status |
|-----------|---------|--------|
| 9.1 | User Auth (OAuth/Magic Link) | ⬜ |
| 9.2 | Project CRUD API | ⬜ |
| 9.3 | Asset Upload → CDN | ⬜ |
| 9.4 | Shareable Links | ⬜ |
| 9.5 | Version History | ⬜ |
| 9.6 | Realtime Collaboration (CRDT) | ⬜ |
| 9.7 | Live Cursors | ⬜ |
| 9.8 | Comments | ⬜ |
| 9.9 | Team Libraries | ⬜ |

---

## Phase 10: AI & Advanced ⬜

| Sub-Phase | Aufgabe | Status |
|-----------|---------|--------|
| 10.1 | AI 3D Generation (Text-to-3D) | ⬜ |
| 10.2 | AI Textures | ⬜ |
| 10.3 | Gaussian Splatting | ⬜ |
| 10.4 | Components/Instancing | ⬜ |
| 10.5 | Multi-Scenes | ⬜ |
| 10.6 | 2D UI Overlays | ⬜ |
| 10.7 | Responsive Layout | ⬜ |

---

## Priorisierte Nächste Schritte

1. ~~**8D.1 / 8D.2** — Projekt-Loading~~ ✅
2. ~~**2.8** — Material Advanced als Dropdown-Button~~ ✅
3. ~~**8A.8 / 8A.10** — Viewer-Optionen (Autospin, Limits)~~ ✅
4. ~~**8B.1** — glTF/GLB Export~~ ✅
5. ~~**8B.3** — Screenshot Export~~ ✅
6. **8A.9–8A.14** — Loading-Screen, Custom CSS, Beschreibung, etc.
7. **1.9** — Copy/Paste
8. **1.12** — Gruppen

---

*Letzte Aktualisierung: Februar 2025*
