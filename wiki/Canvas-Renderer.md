# Canvas Renderer

## Overview

The commit graph is rendered entirely with **HTML5 Canvas 2D** — no SVG, no DOM nodes per commit and
no charting library. Viewport culling, pagination and render caches keep it smooth with 10,000+
commits.

**File:** `src/renderer/canvasRenderer.ts`

## Two layers

`GraphRenderer` is constructed with **two stacked canvases**:

| Layer | Content | Redrawn when |
|---|---|---|
| base | background, lanes/edges, nodes, commit subject/author/date, branch-ref pills, commit count | data, scroll, zoom, resize, theme/locale change |
| overlay | hover ring, selection ring, search highlights, row hover bands | interaction state changes only |

All pointer events are attached to the overlay (the base canvas never intercepts input). Both layers
share the same camera and DPR-aware backing store.

## Lifecycle

```ts
const renderer = new GraphRenderer(baseCanvas, overlayCanvas);
renderer.setData(graphData);            // full data set (initial load / page append)
renderer.setCallbacks({ onHover, onClick, onContextMenu, onNearBottom });
renderer.setSelected(commitHash);
renderer.setHighlights(new Set(hashes));
renderer.setTheme("dark" | "light");    // repaints both layers
renderer.setTopInset(px);               // reserve space for banner/search popover chrome
renderer.resetCamera();                 // new repository: offsetY = 0, scale = 1
renderer.refresh();                     // repaint after a locale/theme token change
renderer.destroy();                     // remove every listener
```

## Camera

```ts
interface Camera { offsetX: number; offsetY: number; scale: number }
```

- The graph column is **pinned to the left edge** (`offsetX` fixed); vertical scrolling only.
- Wheel scrolls vertically; `offsetY` is clamped so a graph shorter than the viewport stays at `0`
  (short graphs never jump) and tall graphs cannot overscroll past the content.
- `zoomBy()` zooms around the viewport centre (0.1×–5×); `resetCamera()` restores 1×.
- Drag-panning is intentionally **not** implemented; the graph is a vertical list.
- `setData()` resets the camera when the data identity changes to a different repository (first hash
  changed or the page set shrank), but keeps the scroll offset when a page is appended.
- `devicePixelRatio` is re-read in `handleResize()`, so moving the window to a monitor with another
  scale factor (or Electron zoom changes) re-allocates crisp backing stores.

## Rendering pipeline

1. Clear base canvas and fill `--bg-primary`.
2. Compute the visible row range from `offsetY`/`scale` (culling).
3. Draw lanes/edges as bezier curves with 1.5 px strokes at ~0.8 alpha.
4. Draw nodes (radius 6.5, 2 px ring in the background colour) and the commit text columns.
5. Draw branch-ref pills in a right-hand rail when the viewport is wide enough; pill ink is chosen by
   WCAG relative luminance of the branch colour.
6. Draw the commit-count label in the lower-left gutter.
7. Overlay: clear and draw only the hover/selection/search rings and row bands.

Text metrics are cached (`font\0text → width`), as are formatted dates (`hash → string`); both caches
are cleared on `setData`. Cull bounds include the configurable top inset.

## Hooks used by CommitGraph

- `onClick` / `onContextMenu` receive the node plus screen coordinates; right-click (button 2) only
  opens the context menu — it must not also change the selection.
- `onHover` drives the floating tooltip (hash/author/date/subject), clamped inside the container.
- `onNearBottom` triggers pagination when the last page is scrolled into view.

## Testing

`tests/canvasRenderer.test.ts` stubs a recording 2D context (`tests/helpers/canvasStub.ts`) and covers
wheel clamping for short/tall graphs, DPR re-reads, camera reset on repository switch, localized
commit-count labels, culling, hover/click/context-menu callbacks and the interaction overlay layer.
