# Design Guidelines — MultiView 3D Editor

> Based on [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
> adapted for a web-based 3D editor application.

---

## 1. Core Design Principles

### Clarity
- Every UI element must be **immediately understandable**
- Labels, icons, and controls communicate purpose without ambiguity
- Use clear, concise text — avoid jargon in user-facing elements
- Interactive elements are visually distinct from static content

### Deference
- The **3D viewport is the hero** — UI panels defer to content
- Panels use muted, semi-transparent backgrounds that don't compete with the scene
- Chrome (toolbars, sidebars) stays subtle until needed
- Let the user's 3D scene always remain the visual focus

### Depth
- Use **visual layering** to communicate hierarchy (panels float above canvas)
- Subtle shadows and elevation separate interactive surfaces
- Modal overlays use backdrop blur to maintain spatial context
- Z-ordering reflects importance: viewport → panels → modals → tooltips

### Consistency
- Identical actions look and behave identically everywhere
- Follow established patterns for transform tools, color pickers, sliders
- Keyboard shortcuts follow industry-standard conventions (Ctrl+Z undo, etc.)
- Maintain visual rhythm — consistent spacing, alignment, and sizing

---

## 2. Layout & Navigation

### Split-View Editor Layout
- **Primary pane** (Outliner sidebar): persistent, shows scene hierarchy
- **Secondary pane** (Viewport): largest area, the 3D canvas
- **Tertiary pane** (Inspector): contextual properties for selection
- Toolbar at top: global actions and tool modes
- Timeline at bottom: animation controls (collapsible)

### Navigation Rules
- Persistently **highlight active selection** in the Outliner
- Restrict navigation flow: Outliner selects → Viewport highlights → Inspector edits
- Provide **multiple access paths** (click in Outliner OR click in Viewport to select)
- Never leave the user disoriented — always show current context/selection state

### Panel Behavior
- Panels are **resizable** with sensible min/max widths
- Panels can be collapsed but not detached (MVP simplicity)
- Collapsed panels show a slim rail with expand affordance
- Default layout: Outliner 240px | Viewport flex | Inspector 300px

---

## 3. Visual Design

### Color System
- Use a **limited, coordinated palette** with a single key/accent color
- Key color: used for selection highlights, active states, primary actions
- Semantic colors: success (green), warning (amber), error (red), info (blue)
- **Dark theme by default** (standard for 3D editors) with light theme support
- Test all colors for sufficient contrast (minimum **4.5:1** ratio for text)

### Color Accessibility
- Never use color as the **only** differentiator — combine with icons/labels/shapes
- Avoid red-green or blue-orange as sole state indicators
- Support `prefers-color-scheme` and `prefers-contrast` media queries

### Dark Theme Tokens (Primary Palette)

| Token                | Value       | Usage                          |
|----------------------|-------------|--------------------------------|
| `--bg-app`           | `#1a1a1a`  | Application background         |
| `--bg-panel`         | `#242424`  | Panel backgrounds              |
| `--bg-panel-hover`   | `#2a2a2a`  | Panel hover states             |
| `--bg-surface`       | `#2e2e2e`  | Elevated surfaces              |
| `--bg-input`         | `#1e1e1e`  | Input field backgrounds        |
| `--border-subtle`    | `#333333`  | Subtle dividers                |
| `--border-default`   | `#444444`  | Default borders                |
| `--text-primary`     | `#f0f0f0`  | Primary text                   |
| `--text-secondary`   | `#999999`  | Secondary/dimmed text          |
| `--text-disabled`    | `#555555`  | Disabled text                  |
| `--accent`           | `#4a9eff`  | Key/accent color (selection)   |
| `--accent-hover`     | `#5aafff`  | Accent hover                   |
| `--accent-muted`     | `#4a9eff22`| Accent with low opacity        |

### Typography
- Use **system font stack** for optimal legibility and performance:
  `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Monospace for numeric inputs: `'SF Mono', 'Cascadia Code', 'Consolas', monospace`

| Style     | Size  | Weight | Usage                        |
|-----------|-------|--------|------------------------------|
| Title     | 16px  | 600    | Panel headers                |
| Body      | 13px  | 400    | General UI text              |
| Caption   | 11px  | 400    | Labels, hints, metadata      |
| Numeric   | 12px  | 500    | Inspector value fields        |
| Toolbar   | 12px  | 500    | Toolbar button labels         |

### Spacing & Sizing
- Base unit: **4px grid** — all spacing derives from multiples of 4
- Panel padding: 12px (3 units)
- Element gap: 8px (2 units)
- Section gap: 16px (4 units)
- **Minimum interactive target: 32x32px** (adapted from Apple's 44pt for desktop context)
- Border radius: 6px (small), 8px (medium), 12px (large/panels)

---

## 4. Animation & Motion

### Principles
- Animation is **purposeful** — it conveys status, provides feedback, or aids spatial understanding
- Strive for **physical realism**: movements follow natural motion curves
- **Reversibility**: if a panel slides open to the right, it slides closed to the left
- Keep transitions **fast**: 150–250ms for micro-interactions, 300–400ms for layout changes

### Motion Tokens

| Transition         | Duration | Easing                    | Usage                     |
|--------------------|----------|---------------------------|---------------------------|
| `--ease-micro`     | 150ms    | `cubic-bezier(.2,.8,.4,1)`| Hover, focus, toggle      |
| `--ease-standard`  | 250ms    | `cubic-bezier(.2,.8,.4,1)`| Panel expand/collapse     |
| `--ease-dramatic`  | 400ms    | `cubic-bezier(.16,1,.3,1)`| Modal open/close          |
| `--ease-spring`    | 350ms    | `cubic-bezier(.34,1.56,.64,1)` | Selection bounce     |

### Accessibility
- Respect `prefers-reduced-motion`: disable decorative animations, keep essential feedback
- Never use animation as the sole indicator of a state change

---

## 5. Interaction Patterns

### Direct Manipulation
- Objects in the viewport respond to **direct interaction** (click, drag, hover)
- Gizmo handles provide clear visual affordance for translate/rotate/scale
- Drag operations show real-time preview — no "apply" step needed

### Feedback
- **Immediate visual feedback** for every interaction:
  - Hover: subtle highlight on objects and UI elements
  - Active/pressed: slight scale-down or color shift
  - Selection: distinct outline or glow on selected 3D object + accent in Outliner
  - Drag: cursor changes, ghost/preview follows cursor
- **State persistence**: selected items stay visually marked across panel switches

### Undo/Redo
- **Every destructive or transformative action must be undoable**
- Describe operations clearly: "Undo Move Cube", "Redo Change Material"
- Operate in current context only — clear, immediate, predictable effects
- Keyboard shortcuts: `Ctrl+Z` (undo), `Ctrl+Shift+Z` / `Ctrl+Y` (redo)
- Show undo/redo state in toolbar (disabled when stack is empty)

### Keyboard & Shortcuts
- All primary tools accessible via single-key shortcuts:
  - `W` — Translate mode
  - `E` — Rotate mode
  - `R` — Scale mode
  - `Delete` — Delete selected
  - `F` — Focus/frame selected object
  - `Space` — Play/pause animation
- Shortcuts are **discoverable** via tooltips on hover

---

## 6. Controls & Components

### Buttons
- Use **action verbs** in labels ("Import Model", "Save Project")
- Icon-only buttons must have tooltip labels for accessibility
- Primary actions use accent color; secondary actions use subtle styling
- Destructive actions use red and require confirmation

### Sliders
- Horizontal track with thumb control for continuous values (roughness, metalness, etc.)
- Track fills with color to indicate current value
- Allow **click-on-track** to jump to value
- Support **drag precision**: hold Shift while dragging for fine adjustments
- Always show numeric value alongside slider

### Numeric Inputs
- Click to type exact values
- **Drag horizontally** on the label to scrub values (Blender/Spline pattern)
- Hold Shift for 10x increment, Ctrl for 0.1x precision
- Display appropriate decimal places (2 for position, 1 for degrees, 2 for 0-1 ranges)

### Color Pickers
- Show swatch preview next to hex/RGB input
- Support hex input and HSL/RGB modes
- Include eyedropper tool (if browser supports EyeDropper API)

### Tree View (Outliner)
- Expand/collapse with chevron icons
- Drag to reparent nodes in hierarchy
- Right-click context menu for node operations
- Indent 16px per nesting level
- Show node type icon (mesh, light, camera, group)

---

## 7. Accessibility

### Requirements
- All interactive elements are **keyboard navigable** (Tab, Arrow keys, Enter, Escape)
- ARIA roles and labels on custom components (tree, slider, toolbar, dialog)
- Focus indicators are clearly visible (2px accent outline, not relying on color alone)
- Screen reader support for Outliner tree and Inspector controls
- Respect user preferences:
  - `prefers-reduced-motion`
  - `prefers-color-scheme`
  - `prefers-contrast`

### Viewport Accessibility
- Provide text descriptions of scene contents via Outliner
- Keyboard alternatives for mouse-only viewport interactions where feasible
- Status announcements for async operations ("Model imported", "Project saved")

---

## 8. Responsive Behavior

### Desktop First (Primary Target)
- Minimum supported viewport: **1024x768**
- Optimal experience: **1440x900+**
- Panels auto-collapse below breakpoints to preserve viewport space

### Adaptive Layout Breakpoints

| Breakpoint | Behavior                                          |
|------------|---------------------------------------------------|
| ≥ 1440px   | Full layout: Outliner + Viewport + Inspector      |
| 1024–1439  | Inspector collapsible, Outliner slim (200px)      |
| < 1024     | Single-panel mode: Viewport with overlay panels   |

---

## 9. Loading & Empty States

### Loading
- Show a **subtle progress indicator** during model imports and saves
- Never block the entire UI — keep panels interactive during async loads
- Use skeleton placeholders for panels that depend on loaded data

### Empty States
- Welcome state: show helpful onboarding ("Import a model to get started")
- Empty Outliner: show hint text, not blank space
- Empty Inspector: show contextual message ("Select an object to edit properties")

### Error States
- Inline error messages near the source (not global alerts for recoverable errors)
- Provide clear recovery action ("File format not supported. Try .glTF or .GLB")
- Non-blocking toasts for transient feedback ("Saved", "Exported")

---

*These guidelines ensure MultiView feels polished, professional, and intuitive —
following Apple's design philosophy while adapting it for a creative desktop web tool.*
