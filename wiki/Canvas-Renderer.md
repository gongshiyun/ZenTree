# Canvas Renderer

## Overview

The commit graph is rendered entirely with **HTML5 Canvas 2D** — no SVG, no DOM nodes, no third-party charting libraries. This enables smooth performance with 10,000+ commit nodes through viewport culling and efficient redraws.

**File:** `src/renderer/canvasRenderer.ts`

## Class: `GraphRenderer`

### Lifecycle

```typescript
const renderer = new GraphRenderer(canvasElement);
renderer.setTheme("dark" | "light");
renderer.setData(graphData);
renderer.setSelected(commitHash);
renderer.setCallbacks({ onHover, onClick, onContextMenu, onNearBottom });
// ...
renderer.destroy();  // Removes all event listeners
```

### Camera System

The renderer uses a 2D camera with pan and zoom:

```typescript
interface Camera {
  offsetX: number;  // Pan X (screen pixels)
  offsetY: number;  // Pan Y (screen pixels)
  scale: number;    // Zoom level (0.1 – 5.0)
}
```

- **Pan:** Click-drag on empty space
- **Zoom:** Mouse wheel, zooms toward cursor position
- **DPR-aware:** Canvas backing store scaled by `devicePixelRatio` for crisp rendering on HiDPI displays

### Coordinate Transform

```
Screen → World:
  worldX = (screenX - offsetX - PADDING_LEFT) / scale
  worldY = (screenY - offsetY - PADDING_TOP) / scale
```

### Rendering Pipeline

Each `render()` call:

1. **Clear** — Fill background (theme-aware)
2. **Transform** — Apply camera translate + scale
3. **Compute visible range** — Derive `cullTop`/`cullBottom` from camera
4. **Draw edges** — Bezier curves between parent-child nodes (culled)
5. **Draw nodes** — Circles + commit subject text + author (culled)
6. **Draw branch labels** — Colored rounded-rect tags at branch heads
7. **Restore** — Reset transform
8. **HUD** — Commit count text (screen-space)
9. **Infinite scroll** — If viewport near bottom, fire `onNearBottom`

### Viewport Culling

Only nodes/edges within the visible Y range (plus 100px margin) are drawn:

```typescript
const margin = 100;
const cullTop = viewTop - margin;
const cullBottom = viewBottom + margin;

// Skip nodes outside range
if (node.y + NODE_RADIUS < cullTop || node.y - NODE_RADIUS > cullBottom) continue;
```

This ensures O(visible) draw calls regardless of total commit count.

### Edge Drawing

- **Same lane:** Straight vertical line
- **Different lanes:** Vertical segment → cubic bezier curve → vertical segment

```typescript
// Bezier control points at 30%/70% of vertical distance
const cornerY1 = fromY + Math.abs(toY - fromY) * 0.3;
const cornerY2 = toY - Math.abs(toY - fromY) * 0.3;
ctx.bezierCurveTo(fromX, cornerY1 + ..., toX, cornerY2 - ..., toX, cornerY2);
```

### Hit Testing

`hitTest(screenX, screenY)` converts to world coordinates and checks:
1. Circle proximity (radius + 6px tolerance)
2. Text label bounding box (estimated width via `charCount × fontSize × 0.6`)

Searches nodes in reverse order (topmost first).

### Interaction Events

| Event | Behavior |
|-------|----------|
| `wheel` | Zoom toward cursor (factor 0.9/1.1) |
| `mousedown` | On node: prepare for click; on empty: start pan |
| `mousemove` | Pan (if dragging) or hover detection |
| `mouseup` | If minimal movement (<3px): treat as click → `onClick` |
| `mouseleave` | Clear hover state |
| `contextmenu` | Hit-test → `onContextMenu(node, clientX, clientY)` |

### Layout Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `NODE_RADIUS` | 7 px | Commit circle radius |
| `ROW_HEIGHT` | 32 px | Vertical spacing (renderer) |
| `LANE_WIDTH` | 24 px | Horizontal lane spacing (renderer) |
| `PADDING_LEFT` | 20 px | Left margin |
| `PADDING_TOP` | 16 px | Top margin |

> Note: The store's `buildGraphData()` uses slightly different constants (`ROW_HEIGHT=28`, `LANE_WIDTH=22`) for data layout. The renderer's constants control visual rendering.

### Theme Support

The renderer accepts `"dark"` or `"light"` and adjusts:
- Background fill color
- Node outline color
- Text colors (subject, author)
- Branch label text color
