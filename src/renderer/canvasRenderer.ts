import type { GraphData, GraphNode } from "../types";
import { GRAPH_LANE_WIDTH, GRAPH_ROW_HEIGHT } from "../domain/graph/layout";
import { t } from "../i18n";

/** Node dot radius in world units (the background ring extends past it). */
const NODE_RADIUS = 6.5;
/** Width of the surface-colored ring that separates nodes from lanes. */
const NODE_RING_WIDTH = 2;
/** Lane width in screen pixels; hairlines stay 1.5 px at any zoom level. */
const EDGE_WIDTH = 1.5;
/** Lanes are quiet: 80% alpha keeps crossings light without losing hue. */
const EDGE_ALPHA = 0.8;
const PADDING_LEFT = 20;
const PADDING_TOP = 16;
/** Fixed horizontal anchor: the commit graph column is pinned to the left edge. */
const LOCK_OFFSET_X = 16;
/** Horizontal distance between the commit text block and the ref-pill column. */
const LABEL_COLUMN_OFFSET = 420;
const LABEL_HEIGHT = 16;
const LABEL_RADIUS = 8;
const LABEL_PAD_X = 8;
const LABEL_GAP = 6;

interface Camera {
  offsetX: number;
  offsetY: number;
  scale: number;
}

/** Warm fallbacks used only when the CSS custom properties are unavailable (jsdom). */
const FALLBACK_VARS = {
  bg: "#faf9f5",
  bgSecondary: "#ffffff",
  textPrimary: "#1f1e1d",
  textSecondary: "#57544e",
  textMuted: "#8c877c",
  textFaint: "#ada79b",
  accent: "#d97757",
  warning: "#a9762a",
  fontSans: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  fontMono: "ui-monospace, 'Cascadia Code', Consolas, monospace",
};

type CssVars = typeof FALLBACK_VARS;

/**
 * Canvas graph engine with two stacked layers:
 * - base: background, edges, nodes, texts and branch labels (redrawn on data
 *   / camera / theme changes);
 * - overlay: row highlight bands, hover ring, selection ring and search
 *   highlight rings (redrawn on interaction-state changes, O(visible rows)).
 *
 * All pointer events are attached to the top overlay canvas; the base canvas
 * does not intercept them.
 */
export class GraphRenderer {
  private baseCanvas: HTMLCanvasElement;
  private overlayCanvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private overlayCtx: CanvasRenderingContext2D;
  private data: GraphData = { nodes: [], edges: [], maxLane: 0 };
  private camera: Camera = { offsetX: 0, offsetY: 0, scale: 1.0 };
  private dpr: number;
  private width = 0;
  private height = 0;
  private hoveredNode: GraphNode | null = null;
  private selectedHash: string | null = null;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private theme: "dark" | "light" = "dark";
  /** Extra room above the first row, for floating banners / search bars. */
  private topInset = PADDING_TOP;
  private cssVars: CssVars = { ...FALLBACK_VARS };
  private rafId: number | null = null;
  private overlayRafId: number | null = null;
  private highlightHashes: Set<string> = new Set();

  /** Rendering caches, cleared on every setData (data-driven, no staleness). */
  private textWidthCache = new Map<string, number>();
  private dateStrCache = new Map<string, string>();

  // Callbacks
  private onHover: ((node: GraphNode | null) => void) | null = null;
  private onClick: ((node: GraphNode) => void) | null = null;
  private onContextMenu: ((node: GraphNode, x: number, y: number) => void) | null = null;
  private onNearBottom: (() => void) | null = null;

  constructor(base: HTMLCanvasElement, overlay: HTMLCanvasElement) {
    this.baseCanvas = base;
    this.overlayCanvas = overlay;
    const ctx = base.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D context");
    this.ctx = ctx;
    const overlayCtx = overlay.getContext("2d");
    if (!overlayCtx) throw new Error("Failed to get 2D context");
    this.overlayCtx = overlayCtx;
    this.dpr = window.devicePixelRatio || 1;

    this.setupEvents();
    this.handleResize();
  }

  setTheme(theme: "dark" | "light") {
    this.theme = theme;
    // CSS variables feed both layers; repaint everything.
    this.scheduleRender();
    this.scheduleOverlayRender();
  }

  /**
   * Reserve vertical space above the first commit row. The graph container
   * uses this while a floating banner (view-ref) or the search popover is
   * visible so overlay chrome never sits on top of commit text.
   */
  setTopInset(px: number) {
    const next = Math.max(0, Math.round(px));
    if (next === this.topInset) return;
    this.topInset = next;
    this.scheduleRender();
    this.scheduleOverlayRender();
  }

  setCallbacks(callbacks: {
    onHover?: (node: GraphNode | null) => void;
    onClick?: (node: GraphNode) => void;
    onContextMenu?: (node: GraphNode, x: number, y: number) => void;
    onNearBottom?: () => void;
  }) {
    if (callbacks.onHover) this.onHover = callbacks.onHover;
    if (callbacks.onClick) this.onClick = callbacks.onClick;
    if (callbacks.onContextMenu) this.onContextMenu = callbacks.onContextMenu;
    if (callbacks.onNearBottom) this.onNearBottom = callbacks.onNearBottom;
  }

  setData(data: GraphData) {
    const previous = this.data;
    const firstLoad = previous.nodes.length === 0 && data.nodes.length > 0;
    // Cached tab switches swap graphData synchronously without ever passing
    // through an empty state, so detect a repo switch from the graph identity.
    // A shrinking tail also means a different graph (repo switch / filter
    // change); pagination only ever appends, so infinite scroll keeps its view.
    const repoSwitched =
      previous.nodes.length > 0 &&
      data.nodes.length > 0 &&
      (previous.nodes[0].hash !== data.nodes[0].hash ||
        (data.nodes.length < previous.nodes.length &&
          previous.nodes[previous.nodes.length - 1].hash !== data.nodes[data.nodes.length - 1].hash));
    this.data = data;
    // Render caches are data-driven: drop them on every data change.
    this.textWidthCache.clear();
    this.dateStrCache.clear();
    if (firstLoad || repoSwitched) {
      // New repository: start at the top of its history at 100% zoom.
      this.camera.offsetX = LOCK_OFFSET_X;
      this.camera.offsetY = 0;
      if (repoSwitched) this.camera.scale = 1;
    }
    this.scheduleRender();
    this.scheduleOverlayRender();
  }

  setSelected(hash: string | null) {
    this.selectedHash = hash;
    this.scheduleOverlayRender();
  }

  setHighlights(hashes: Set<string>) {
    this.highlightHashes = hashes;
    this.scheduleOverlayRender();
  }

  scrollToNode(hash: string) {
    const node = this.data.nodes.find((n) => n.hash === hash);
    if (!node) return;
    this.camera.offsetY = this.clampOffsetY(this.height / 2 - node.y * this.camera.scale);
    this.selectedHash = hash;
    this.scheduleRender();
    this.scheduleOverlayRender();
  }

  /** Zoom by a factor, anchored at the vertical center (graph stays pinned left). */
  zoomBy(factor: number) {
    const newScale = Math.max(0.1, Math.min(5, this.camera.scale * factor));
    const anchorY = this.screenToWorld(0, this.height / 2).y;
    this.camera.scale = newScale;
    this.camera.offsetY = this.clampOffsetY(this.height / 2 - anchorY * newScale);
    this.scheduleRender();
    this.scheduleOverlayRender();
  }

  /** Reset zoom to 100% and scroll back to the top. */
  resetZoom() {
    this.camera.scale = 1;
    this.camera.offsetY = 0;
    this.scheduleRender();
    this.scheduleOverlayRender();
  }

  /**
   * Reset the camera to the identity view: pinned-left column, 100% zoom, top
   * of history. Called when the active repository changes (cached tab switch),
   * so a new repo never opens at the previous repo's scroll offset.
   */
  resetCamera() {
    this.camera.offsetX = LOCK_OFFSET_X;
    this.camera.offsetY = 0;
    this.camera.scale = 1;
    this.scheduleRender();
    this.scheduleOverlayRender();
  }

  getScale(): number {
    return this.camera.scale;
  }

  /** Repaint both layers (e.g. after a language change affects canvas labels). */
  refresh() {
    this.scheduleRender();
    this.scheduleOverlayRender();
  }

  handleResize() {
    // Re-read the DPR: monitor changes and Electron zoom updates can change it
    // after construction, and a stale ratio leaves the canvas blurry.
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.baseCanvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.baseCanvas.width = rect.width * this.dpr;
    this.baseCanvas.height = rect.height * this.dpr;
    this.overlayCanvas.width = rect.width * this.dpr;
    this.overlayCanvas.height = rect.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.overlayCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.scheduleRender();
    this.scheduleOverlayRender();
  }

  /** Read theme colors and font stacks from CSS variables (falls back for jsdom). */
  private readCssVars() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    this.cssVars = {
      bg: v("--bg-primary", FALLBACK_VARS.bg),
      bgSecondary: v("--bg-secondary", FALLBACK_VARS.bgSecondary),
      textPrimary: v("--text-primary", FALLBACK_VARS.textPrimary),
      textSecondary: v("--text-secondary", FALLBACK_VARS.textSecondary),
      textMuted: v("--text-muted", FALLBACK_VARS.textMuted),
      textFaint: v("--text-faint", FALLBACK_VARS.textFaint),
      accent: v("--accent", FALLBACK_VARS.accent),
      warning: v("--warning", FALLBACK_VARS.warning),
      fontSans: v("--font-sans", FALLBACK_VARS.fontSans),
      fontMono: v("--font-mono", FALLBACK_VARS.fontMono),
    };
  }

  /** Convert a hex color to rgba() with the given alpha. */
  private withAlpha(hex: string, alpha: number): string {
    const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  /** Relative luminance (WCAG) of a hex color; used to pick readable pill ink. */
  private relativeLuminance(hex: string): number {
    const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return 0.5;
    const n = parseInt(m[1], 16);
    const channel = (value: number) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const r = channel((n >> 16) & 255);
    const g = channel((n >> 8) & 255);
    const b = channel(n & 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /**
   * Ink color for a filled ref pill. The palette is mid-tone, so the readable
   * choice flips around L*~50 (0.209 relative luminance); both candidate inks
   * come from theme tokens so light/dark presets stay consistent.
   */
  private labelInk(hex: string, isDark: boolean): string {
    const ink = isDark ? this.cssVars.bg : this.cssVars.textPrimary;
    const paper = isDark ? this.cssVars.textPrimary : this.cssVars.bgSecondary;
    return this.relativeLuminance(hex) > 0.209 ? ink : paper;
  }

  /** Left edge of the commit text block, shared by painting and hit testing. */
  private textStartX(): number {
    return this.data.maxLane * GRAPH_LANE_WIDTH + GRAPH_LANE_WIDTH + 14;
  }

  /** Schedule a base-layer render on the next animation frame (coalesces requests). */
  private scheduleRender() {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.render();
    });
  }

  /** Schedule an overlay-layer render (interaction states only). */
  private scheduleOverlayRender() {
    if (this.overlayRafId !== null) return;
    this.overlayRafId = requestAnimationFrame(() => {
      this.overlayRafId = null;
      this.renderOverlay();
    });
  }

  render() {
    this.readCssVars();
    const { ctx, width, height, camera, data } = this;

    // Clear with the app surface color (canvas and center area read as one).
    ctx.fillStyle = this.cssVars.bg;
    ctx.fillRect(0, 0, width, height);

    const scale = Math.max(0.1, Math.min(5, camera.scale));
    const sx = camera.offsetX + PADDING_LEFT;
    const sy = camera.offsetY + this.topInset;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(scale, scale);

    // Compute visible range for culling
    const viewTop = -sy / scale;
    const viewBottom = (height - sy) / scale;
    const viewLeft = -sx / scale;
    const viewRight = (width - sx) / scale;

    const margin = 100;
    const cullTop = viewTop - margin;
    const cullBottom = viewBottom + margin;

    this.drawEdges(cullTop, cullBottom);

    this.drawNodes(cullTop, cullBottom, viewLeft, viewRight);
    this.drawBranchLabels(cullTop, cullBottom, viewRight);

    ctx.restore();

    // Commit count sits bottom-left (the floating zoom capsule lives
    // bottom-right). Technical data => mono, quiet => text-faint.
    ctx.save();
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.font = `10.5px ${this.cssVars.fontMono}`;
    ctx.fillStyle = this.cssVars.textFaint;
    const n = data.nodes.length;
    // Spaces come from the i18n suffix (" commits" / " 条提交").
    ctx.fillText(`${n}${t("graph.commits")}`, 14, height - 10);
    ctx.restore();

    // Detect scroll near bottom to trigger load more
    if (this.onNearBottom && data.nodes.length > 0) {
      const lastNode = data.nodes[data.nodes.length - 1];
      const lastWorldY = lastNode.y + 100;
      if (viewBottom >= lastWorldY) {
        this.onNearBottom();
      }
    }
  }

  /** Redraw only the interaction layer: row bands, hover / selection / search rings. */
  private renderOverlay() {
    const { overlayCtx, width, height, camera, data } = this;
    overlayCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    overlayCtx.clearRect(0, 0, width, height);

    const scale = Math.max(0.1, Math.min(5, camera.scale));
    const sx = camera.offsetX + PADDING_LEFT;
    const sy = camera.offsetY + this.topInset;
    const viewTop = -sy / scale;
    const viewBottom = (height - sy) / scale;
    const margin = 100;
    const cullTop = viewTop - margin;
    const cullBottom = viewBottom + margin;

    // --- Row highlight bands (screen space, behind the rings) ---
    const rowHeight = GRAPH_ROW_HEIGHT * scale;
    for (const node of data.nodes) {
      if (node.y + NODE_RADIUS < cullTop || node.y - NODE_RADIUS > cullBottom) continue;
      const isSelected = this.selectedHash === node.hash;
      const isHovered = this.hoveredNode?.hash === node.hash;
      const isHighlighted = this.highlightHashes.has(node.hash);
      if (!isSelected && !isHovered && !isHighlighted) continue;
      const screenY = node.y * scale + sy;
      const top = screenY - rowHeight / 2;

      if (isHighlighted && !isSelected) {
        overlayCtx.fillStyle = this.withAlpha(this.cssVars.warning, 0.1);
        overlayCtx.fillRect(0, top, width, rowHeight);
      }
      if (isHovered && !isSelected) {
        overlayCtx.fillStyle = this.withAlpha(this.cssVars.textSecondary, 0.08);
        overlayCtx.fillRect(0, top, width, rowHeight);
      }
      if (isSelected) {
        overlayCtx.fillStyle = this.withAlpha(this.cssVars.accent, 0.11);
        overlayCtx.fillRect(0, top, width, rowHeight);
        // 2.5px accent rule on the row's left edge.
        overlayCtx.fillStyle = this.withAlpha(this.cssVars.accent, 0.85);
        overlayCtx.fillRect(0, top, 2.5, rowHeight);
      }
    }

    // --- Rings (world space so they follow zoom) ---
    overlayCtx.save();
    overlayCtx.translate(sx, sy);
    overlayCtx.scale(scale, scale);

    for (const node of data.nodes) {
      if (node.y + NODE_RADIUS < cullTop || node.y - NODE_RADIUS > cullBottom) continue;
      const isSelected = this.selectedHash === node.hash;
      const isHovered = this.hoveredNode?.hash === node.hash;
      const isHighlighted = this.highlightHashes.has(node.hash);
      if (!isSelected && !isHovered && !isHighlighted) continue;

      if (isHighlighted && !isSelected) {
        overlayCtx.beginPath();
        overlayCtx.arc(node.x, node.y, NODE_RADIUS + 5, 0, Math.PI * 2);
        overlayCtx.fillStyle = this.withAlpha(this.cssVars.warning, 0.18);
        overlayCtx.fill();
        overlayCtx.beginPath();
        overlayCtx.arc(node.x, node.y, NODE_RADIUS + 4.5, 0, Math.PI * 2);
        overlayCtx.lineWidth = 1.25;
        overlayCtx.strokeStyle = this.withAlpha(this.cssVars.warning, 0.6);
        overlayCtx.stroke();
      }
      if (isHovered && !isSelected) {
        overlayCtx.beginPath();
        overlayCtx.arc(node.x, node.y, NODE_RADIUS + 2.5, 0, Math.PI * 2);
        overlayCtx.lineWidth = 1.5;
        overlayCtx.strokeStyle = this.withAlpha(this.cssVars.accent, 0.55);
        overlayCtx.stroke();
      }
      if (isSelected) {
        overlayCtx.beginPath();
        overlayCtx.arc(node.x, node.y, NODE_RADIUS + 4.5, 0, Math.PI * 2);
        overlayCtx.fillStyle = this.withAlpha(this.cssVars.accent, 0.14);
        overlayCtx.fill();
        overlayCtx.beginPath();
        overlayCtx.arc(node.x, node.y, NODE_RADIUS + 3, 0, Math.PI * 2);
        overlayCtx.lineWidth = 2;
        overlayCtx.strokeStyle = this.withAlpha(this.cssVars.accent, 0.9);
        overlayCtx.stroke();
      }
    }

    overlayCtx.restore();
  }

  private drawBranchLabels(cullTop: number, cullBottom: number, viewRight: number) {
    const { ctx, data } = this;
    const refs = data.branchRefs;
    if (!refs) return;
    const labelX = this.textStartX() + LABEL_COLUMN_OFFSET;
    // Only paint the pill rail when the text columns left room for it.
    if (viewRight <= labelX + 70) return;

    // `branchRefs` may be keyed by abbreviated hashes (simple-git's `branch()`
    // reports 7-char commit ids) while nodes carry full hashes. Resolve both
    // forms once per render; without this join the pill rail is never painted.
    const refsByNodeHash = new Map<string, string[]>();
    for (const [key, names] of Object.entries(refs)) {
      if (!names || names.length === 0) continue;
      refsByNodeHash.set(key, names);
      if (key.length < 40) {
        const match = data.nodes.find((candidate) => candidate.hash.startsWith(key));
        if (match) refsByNodeHash.set(match.hash, names);
      }
    }

    const font = `600 10px ${this.cssVars.fontSans}`;
    ctx.font = font;
    ctx.textBaseline = "middle";

    for (const node of data.nodes) {
      if (node.y + LABEL_HEIGHT / 2 < cullTop || node.y - LABEL_HEIGHT / 2 > cullBottom) continue;
      const names = refsByNodeHash.get(node.hash);
      if (!names || names.length === 0) continue;
      let x = labelX;
      for (const rawName of names) {
        const name = rawName.replace(/^remotes\//, "");
        const width = this.cachedMeasure(name, font) + LABEL_PAD_X * 2;
        if (x + width > viewRight - 10) break;
        // Pill: rounded rect filled with the branch color, readable ink on top.
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.roundRect(x, node.y - LABEL_HEIGHT / 2, width, LABEL_HEIGHT, LABEL_RADIUS);
        ctx.fill();
        ctx.fillStyle = this.labelInk(node.color, this.theme === "dark");
        ctx.fillText(name, x + LABEL_PAD_X, node.y + 0.5);
        x += width + LABEL_GAP;
      }
    }
  }

  private drawEdges(cullTop: number, cullBottom: number) {
    const { ctx, data } = this;
    const scale = Math.max(0.1, Math.min(5, this.camera.scale));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const edge of data.edges) {
      const minY = Math.min(edge.fromY, edge.toY);
      const maxY = Math.max(edge.fromY, edge.toY);
      if (maxY < cullTop || minY > cullBottom) continue;

      ctx.strokeStyle = this.withAlpha(edge.color, EDGE_ALPHA);
      // Hairline at every zoom level (1.5 screen px).
      ctx.lineWidth = EDGE_WIDTH / scale;
      ctx.beginPath();

      const fromY = edge.fromY;
      const toY = edge.toY;

      // Draw bezier curve for smooth branch transitions
      if (edge.fromX === edge.toX) {
        // Same lane: straight vertical line
        ctx.moveTo(edge.fromX, fromY);
        ctx.lineTo(edge.toX, toY);
      } else {
        // Different lanes: bezier curve
        ctx.moveTo(edge.fromX, fromY);
        const cornerY1 = fromY + Math.abs(toY - fromY) * 0.3;
        const cornerY2 = toY - Math.abs(toY - fromY) * 0.3;
        ctx.lineTo(edge.fromX, cornerY1);
        ctx.bezierCurveTo(
          edge.fromX, cornerY1 + (cornerY2 - cornerY1) * 0.4,
          edge.toX, cornerY2 - (cornerY2 - cornerY1) * 0.4,
          edge.toX, cornerY2
        );
        ctx.lineTo(edge.toX, toY);
      }
      ctx.stroke();
    }
  }

  /** Format a commit timestamp once per node hash (cache keyed on setData lifecycle). */
  private dateStrFor(ts: number, hash: string): string {
    let s = this.dateStrCache.get(hash);
    if (!s) {
      const d = new Date(ts * 1000);
      // Date only: the exact time is available in the hover tooltip.
      s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      this.dateStrCache.set(hash, s);
    }
    return s;
  }

  /** Measure text width with a bounded cache (evicts the oldest half when full). */
  private cachedMeasure(text: string, font: string): number {
    const key = font + "\u0000" + text;
    let w = this.textWidthCache.get(key);
    if (w === undefined) {
      this.ctx.font = font;
      w = this.ctx.measureText(text).width;
      if (this.textWidthCache.size > 2000) {
        const it = this.textWidthCache.keys();
        for (let i = 0; i < 1000; i++) this.textWidthCache.delete(it.next().value!);
      }
      this.textWidthCache.set(key, w);
    }
    return w;
  }

  /** Truncate text with an ellipsis so that it fits in maxWidth (measure-cached). */
  private truncateToWidth(text: string, maxWidth: number, font: string): string {
    if (maxWidth <= 0) return "";
    if (this.cachedMeasure(text, font) <= maxWidth) return text;
    const ellipsis = "\u2026";
    const ellipsisW = this.cachedMeasure(ellipsis, font);
    if (ellipsisW > maxWidth) return "";
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.cachedMeasure(text.slice(0, mid), font) + ellipsisW <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return lo > 0 ? text.slice(0, lo).trimEnd() + ellipsis : ellipsis;
  }

  private drawNodes(cullTop: number, cullBottom: number, viewLeft: number, viewRight: number) {
    const { ctx, data } = this;
    const textX = this.textStartX();
    // Columns: subject / author / date stay left of the ref-pill column so the
    // pill rail never overlaps commit text (pills are painted afterwards).
    const labelColumnX = textX + LABEL_COLUMN_OFFSET;
    const hasLabelColumn = viewRight > labelColumnX + 70;
    const textRight = hasLabelColumn ? labelColumnX - 10 : viewRight - 12;
    const subjectFont = `13px ${this.cssVars.fontSans}`;
    const authorFont = `11px ${this.cssVars.fontSans}`;
    const dateFont = `10.5px ${this.cssVars.fontMono}`;
    const gapAfterSubject = 9;
    const gapBeforeDate = 12;
    const { textPrimary, textMuted, textFaint } = this.cssVars;

    for (const node of data.nodes) {
      if (node.y + NODE_RADIUS < cullTop || node.y - NODE_RADIUS > cullBottom) continue;
      if (node.x + NODE_RADIUS < viewLeft || node.x - NODE_RADIUS > viewRight) continue;

      // Node dot with a surface-colored ring; interaction rings live on the overlay layer.
      ctx.beginPath();
      ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();
      ctx.lineWidth = NODE_RING_WIDTH;
      ctx.strokeStyle = this.cssVars.bg;
      ctx.stroke();

      // Commit text: subject (primary) / author (muted) / date (mono, faint)
      ctx.textBaseline = "middle";
      const authorW = this.cachedMeasure(node.author, authorFont);
      const dateStr = this.dateStrFor(node.timestamp, node.hash);
      const dateW = this.cachedMeasure(dateStr, dateFont);
      const reserved = authorW + dateW + gapAfterSubject + gapBeforeDate;
      const maxSubjectW = Math.max(40, textRight - textX - reserved);
      const displayText = this.truncateToWidth(node.subject, maxSubjectW, subjectFont);
      const subjW = this.cachedMeasure(displayText, subjectFont);

      ctx.font = subjectFont;
      ctx.fillStyle = textPrimary;
      ctx.fillText(displayText, textX, node.y);

      const authorX = textX + subjW + gapAfterSubject;
      ctx.font = authorFont;
      ctx.fillStyle = textMuted;
      ctx.fillText(node.author, authorX, node.y);

      const dateX = authorX + authorW + gapBeforeDate;
      ctx.font = dateFont;
      ctx.fillStyle = textFaint;
      ctx.fillText(dateStr, dateX, node.y);
    }
  }

  // --- Viewport interaction ---

  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const relativeX = sx - this.camera.offsetX - PADDING_LEFT;
    const relativeY = sy - this.camera.offsetY - this.topInset;
    return {
      x: relativeX / this.camera.scale,
      y: relativeY / this.camera.scale,
    };
  }

  private hitTest(sx: number, sy: number): GraphNode | null {
    const world = this.screenToWorld(sx, sy);
    const hitRadius = NODE_RADIUS + 6;
    const textX = this.textStartX();
    const halfFont = 7;
    const nodes = this.data.nodes;
    if (nodes.length === 0) return null;

    // Binary search for the row nearest to world.y (nodes are sorted by y)
    let lo = 0, hi = nodes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (nodes[mid].y < world.y) lo = mid + 1;
      else hi = mid;
    }

    // Check a small window around the found index
    const searchRadius = 3;
    const start = Math.max(0, lo - searchRadius);
    const end = Math.min(nodes.length - 1, lo + searchRadius);
    for (let i = start; i <= end; i++) {
      const node = nodes[i];
      // Check circle hit
      const dx = node.x - world.x;
      const dy = node.y - world.y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return node;
      }
      // Check text label hit
      if (world.x >= textX && world.y >= node.y - halfFont && world.y <= node.y + halfFont) {
        return node;
      }
    }
    return null;
  }

  private setupEvents() {
    // The overlay canvas sits on top: it receives all pointer events.
    this.overlayCanvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.overlayCanvas.addEventListener("mousedown", this.handleMouseDown);
    this.overlayCanvas.addEventListener("mousemove", this.handleMouseMove);
    this.overlayCanvas.addEventListener("mouseup", this.handleMouseUp);
    this.overlayCanvas.addEventListener("mouseleave", this.handleMouseLeave);
    this.overlayCanvas.addEventListener("contextmenu", this.handleContextMenu);
  }

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();

    // Ctrl/Cmd + wheel zooms; plain wheel scrolls vertically (SourceTree-like).
    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoomBy(zoomFactor);
    } else {
      this.camera.offsetY = this.clampOffsetY(this.camera.offsetY - e.deltaY);
      this.scheduleRender();
      this.scheduleOverlayRender();
    }
  };

  /** Clamp offsetY into [minOffsetY(), 0]; never overscroll above the first row. */
  private clampOffsetY(value: number): number {
    return Math.max(this.minOffsetY(), Math.min(0, value));
  }

  /**
   * Lowest allowed offsetY. 0 when the whole graph fits in the viewport (a
   * short graph must not jump down and strand itself), negative when the graph
   * is taller than the viewport.
   */
  private minOffsetY(): number {
    const last = this.data.nodes[this.data.nodes.length - 1];
    if (!last) return 0;
    const scale = Math.max(0.1, Math.min(5, this.camera.scale));
    // last.y is the last row centre; keep its row plus a little air visible.
    return Math.min(0, this.height - last.y * scale - 40);
  }

  private handleMouseDown = (e: MouseEvent) => {
    // Only the primary button starts a click; right-click drives the context menu.
    // (`typeof` guard: synthetic events in component tests omit `button`.)
    if (typeof e.button === "number" && e.button !== 0) return;
    // Drag-panning is intentionally disabled; track presses only for click detection.
    this.isDragging = true;
    this.dragStartX = e.offsetX;
    this.dragStartY = e.offsetY;
  };

  private handleMouseMove = (e: MouseEvent) => {
    // If the pointer moved while pressed, treat it as a cancelled click.
    if (this.isDragging && (Math.abs(e.offsetX - this.dragStartX) > 2 || Math.abs(e.offsetY - this.dragStartY) > 2)) {
      this.isDragging = false;
    }

    const node = this.hitTest(e.offsetX, e.offsetY);
    if (node !== this.hoveredNode) {
      this.hoveredNode = node;
      this.overlayCanvas.style.cursor = node ? "pointer" : "default";
      this.onHover?.(node);
      this.scheduleOverlayRender();
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (typeof e.button === "number" && e.button !== 0) return;
    if (!this.isDragging) return;
    this.isDragging = false;

    const node = this.hitTest(e.offsetX, e.offsetY);
    if (node) {
      this.selectedHash = node.hash;
      this.onClick?.(node);
      this.scheduleOverlayRender();
    }
  };

  private handleMouseLeave = () => {
    this.isDragging = false;
    if (this.hoveredNode) {
      this.hoveredNode = null;
      this.onHover?.(null);
      this.scheduleOverlayRender();
    }
  };

  private handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const node = this.hitTest(e.offsetX, e.offsetY);
    if (node && this.onContextMenu) {
      this.onContextMenu(node, e.clientX, e.clientY);
    }
  };

  destroy() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.overlayRafId !== null) cancelAnimationFrame(this.overlayRafId);
    this.overlayCanvas.removeEventListener("wheel", this.handleWheel);
    this.overlayCanvas.removeEventListener("mousedown", this.handleMouseDown);
    this.overlayCanvas.removeEventListener("mousemove", this.handleMouseMove);
    this.overlayCanvas.removeEventListener("mouseup", this.handleMouseUp);
    this.overlayCanvas.removeEventListener("mouseleave", this.handleMouseLeave);
    this.overlayCanvas.removeEventListener("contextmenu", this.handleContextMenu);
  }
}

