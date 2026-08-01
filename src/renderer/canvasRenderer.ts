import type { GraphData, GraphNode, GraphEdge } from "../types";
import { GRAPH_LANE_WIDTH } from "../domain/graph/layout";

const NODE_RADIUS = 7;
const PADDING_LEFT = 20;
const PADDING_TOP = 16;
/** Fixed horizontal anchor: the commit graph column is pinned to the left edge. */
const LOCK_OFFSET_X = 16;

interface Camera {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export class GraphRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
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
  private cssVars: { bg: string; textPrimary: string; textSecondary: string; textMuted: string; accent: string; warning: string } = { bg: "#1a1b26", textPrimary: "#cdd6f4", textSecondary: "#a6adc8", textMuted: "#6c7086", accent: "#89b4fa", warning: "#f9e2af" };
  private rafId: number | null = null;
  private highlightHashes: Set<string> = new Set();

  // Callbacks
  private onHover: ((node: GraphNode | null) => void) | null = null;
  private onClick: ((node: GraphNode) => void) | null = null;
  private onContextMenu: ((node: GraphNode, x: number, y: number) => void) | null = null;
  private onNearBottom: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D context");
    this.ctx = ctx;
    this.dpr = window.devicePixelRatio || 1;

    this.setupEvents();
    this.handleResize();
  }

  setTheme(theme: "dark" | "light") {
    this.theme = theme;
    this.scheduleRender();
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
    const firstLoad = this.data.nodes.length === 0 && data.nodes.length > 0;
    this.data = data;
    if (firstLoad) {
      this.camera.offsetX = LOCK_OFFSET_X;
      this.camera.offsetY = 0;
    }
    this.scheduleRender();
  }

  setSelected(hash: string | null) {
    this.selectedHash = hash;
    this.scheduleRender();
  }

  setHighlights(hashes: Set<string>) {
    this.highlightHashes = hashes;
    this.scheduleRender();
  }

  scrollToNode(hash: string) {
    const node = this.data.nodes.find((n) => n.hash === hash);
    if (!node) return;
    this.camera.offsetY = this.height / 2 - node.y * this.camera.scale;
    this.selectedHash = hash;
    this.scheduleRender();
  }

  /** Zoom by a factor, anchored at the vertical center (graph stays pinned left). */
  zoomBy(factor: number) {
    const newScale = Math.max(0.1, Math.min(5, this.camera.scale * factor));
    const anchorY = this.screenToWorld(0, this.height / 2).y;
    this.camera.scale = newScale;
    this.camera.offsetY = this.height / 2 - anchorY * newScale;
    this.scheduleRender();
  }

  /** Reset zoom to 100% and scroll back to the top. */
  resetZoom() {
    this.camera.scale = 1;
    this.camera.offsetY = 0;
    this.scheduleRender();
  }

  getScale(): number {
    return this.camera.scale;
  }

  handleResize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.scheduleRender();
  }

  /** Read theme colors from CSS variables so the canvas follows the active theme. */
  private readCssVars() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    this.cssVars = {
      bg: v("--bg-primary", "#1a1b26"),
      textPrimary: v("--text-primary", "#cdd6f4"),
      textSecondary: v("--text-secondary", "#a6adc8"),
      textMuted: v("--text-muted", "#6c7086"),
      accent: v("--accent", "#89b4fa"),
      warning: v("--warning", "#f9e2af"),
    };
  }

  /** Convert a hex color to rgba() with the given alpha. */
  private withAlpha(hex: string, alpha: number): string {
    const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  /** Schedule a render on the next animation frame (coalesces multiple requests). */
  private scheduleRender() {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.render();
    });
  }

  render() {
    this.readCssVars();
    const { ctx, width, height, camera, data } = this;
    const isDark = this.theme === "dark";

    // Clear
    ctx.fillStyle = this.cssVars.bg;
    ctx.fillRect(0, 0, width, height);

    const scale = Math.max(0.1, Math.min(5, camera.scale));
    const sx = camera.offsetX + PADDING_LEFT;
    const sy = camera.offsetY + PADDING_TOP;

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

    // Draw edges in visible range
    this.drawEdges(cullTop, cullBottom, isDark);

    // Draw nodes in visible range
    this.drawNodes(cullTop, cullBottom, viewLeft, viewRight, isDark);
    this.drawBranchLabels(cullTop, cullBottom, isDark);

    ctx.restore();

    // Draw node count info
    ctx.fillStyle = this.cssVars.textMuted;
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const countText = `${data.nodes.length} commits`;
    ctx.fillText(countText, 12, height - 8);

    // Detect scroll near bottom to trigger load more
    if (this.onNearBottom && data.nodes.length > 0) {
      const lastNode = data.nodes[data.nodes.length - 1];
      const lastWorldY = lastNode.y + 100;
      const viewBottomWorld = viewBottom;
      if (viewBottomWorld >= lastWorldY) {
        this.onNearBottom();
      }
    }
  }


  private drawBranchLabels(cullTop: number, cullBottom: number, isDark: boolean) {
    const { ctx, data } = this;
    const refs = data.branchRefs;
    if (!refs) return;
    const textX = data.maxLane * GRAPH_LANE_WIDTH + GRAPH_LANE_WIDTH + 12;
    const labelX = textX + 420; // position labels after commit text area
    for (const node of data.nodes) {
      if (node.y + NODE_RADIUS < cullTop || node.y - NODE_RADIUS > cullBottom) continue;
      const names = refs[node.hash];
      if (!names || names.length === 0) continue;
      ctx.font = "bold 10.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.textBaseline = "middle";
      const baseY = node.y - 10;
      for (let i = 0; i < names.length; i++) {
        const name = names[i].replace(/^remotes\//, '');
        const w = ctx.measureText(name).width + 12;
        const ly = baseY + i * 18;
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.roundRect(labelX, ly - 8, w, 16, 4);
        ctx.fill();
        ctx.fillStyle = this.cssVars.bg;
        ctx.fillText(name, labelX + 6, ly);
      }
    }
  }

  private drawEdges(cullTop: number, cullBottom: number, isDark: boolean) {
    const { ctx, data } = this;

    for (const edge of data.edges) {
      const minY = Math.min(edge.fromY, edge.toY);
      const maxY = Math.max(edge.fromY, edge.toY);
      if (maxY < cullTop || minY > cullBottom) continue;

      ctx.strokeStyle = edge.color;
      ctx.lineWidth = 2 / (this.camera.scale || 0.5);
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
        // Vertical down from fromX, then horizontal to toX, then vertical to toY
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

  private drawNodes(cullTop: number, cullBottom: number, viewLeft: number, viewRight: number, isDark: boolean) {
    const { ctx, data } = this;

    for (const node of data.nodes) {
      if (node.y + NODE_RADIUS < cullTop || node.y - NODE_RADIUS > cullBottom) continue;
      if (node.x + NODE_RADIUS < viewLeft || node.x - NODE_RADIUS > viewRight) continue;

      const isSelected = this.selectedHash === node.hash;
      const isHovered = this.hoveredNode?.hash === node.hash;
      const isHighlighted = this.highlightHashes.has(node.hash);
      const r = isSelected ? NODE_RADIUS + 2 : isHovered ? NODE_RADIUS + 1 : NODE_RADIUS;

      // Search highlight ring
      if (isHighlighted && !isSelected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 5, 0, Math.PI * 2);
        ctx.fillStyle = this.withAlpha(this.cssVars.warning, 0.35);
        ctx.fill();
      }

      // Glow or selection ring
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? this.withAlpha(this.cssVars.accent, 0.3) : this.withAlpha(this.cssVars.textSecondary, 0.2);
        ctx.fill();
      }

      // Main node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();

      // Outline
      ctx.strokeStyle = this.cssVars.bg;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Commit subject text
      const textX = data.maxLane * GRAPH_LANE_WIDTH + GRAPH_LANE_WIDTH + 12;
      const subj = node.subject;
      const displayText = subj.length > 50 ? subj.substring(0, 50) + "..." : subj;
      ctx.fillStyle = this.cssVars.textPrimary;
      ctx.font = "12.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(displayText, textX, node.y);
      const subjW = ctx.measureText(displayText).width;
      ctx.fillStyle = this.cssVars.textSecondary;
      ctx.font = "11.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText(node.author, textX + subjW + 8, node.y);
      // Date column
      const authorW = ctx.measureText(node.author).width;
      const d = new Date(node.timestamp * 1000);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      ctx.fillStyle = this.cssVars.textMuted;
      ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText(dateStr, textX + subjW + authorW + 20, node.y);
    }
  }

  // --- Viewport interaction ---

  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const relativeX = sx - this.camera.offsetX - PADDING_LEFT;
    const relativeY = sy - this.camera.offsetY - PADDING_TOP;
    return {
      x: relativeX / this.camera.scale,
      y: relativeY / this.camera.scale,
    };
  }

  private hitTest(sx: number, sy: number): GraphNode | null {
    const world = this.screenToWorld(sx, sy);
    const hitRadius = NODE_RADIUS + 6;
    const textX = this.data.maxLane * GRAPH_LANE_WIDTH + GRAPH_LANE_WIDTH + 12;
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
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.canvas.addEventListener("mousedown", this.handleMouseDown);
    this.canvas.addEventListener("mousemove", this.handleMouseMove);
    this.canvas.addEventListener("mouseup", this.handleMouseUp);
    this.canvas.addEventListener("mouseleave", this.handleMouseLeave);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
  }

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();

    // Ctrl/Cmd + wheel zooms; plain wheel scrolls vertically (SourceTree-like).
    if (e.ctrlKey || e.metaKey) {
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoomBy(zoomFactor);
    } else {
      this.camera.offsetY -= e.deltaY;
      this.camera.offsetY = Math.min(120, Math.max(this.minOffsetY(), this.camera.offsetY));
      this.scheduleRender();
    }
  };

  /** Lower bound for vertical scrolling so the graph cannot be scrolled past its end. */
  private minOffsetY(): number {
    const last = this.data.nodes[this.data.nodes.length - 1];
    if (!last) return -this.height;
    return Math.min(120, this.height - last.y * this.camera.scale - 40);
  }

  private handleMouseDown = (e: MouseEvent) => {
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
      this.canvas.style.cursor = node ? "pointer" : "default";
      this.onHover?.(node);
      this.scheduleRender();
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (!this.isDragging) return;
    this.isDragging = false;

    const node = this.hitTest(e.offsetX, e.offsetY);
    if (node) {
      this.selectedHash = node.hash;
      this.onClick?.(node);
      this.scheduleRender();
    }
  };

  private handleMouseLeave = () => {
    this.isDragging = false;
    if (this.hoveredNode) {
      this.hoveredNode = null;
      this.onHover?.(null);
      this.scheduleRender();
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
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("mousedown", this.handleMouseDown);
    this.canvas.removeEventListener("mousemove", this.handleMouseMove);
    this.canvas.removeEventListener("mouseup", this.handleMouseUp);
    this.canvas.removeEventListener("mouseleave", this.handleMouseLeave);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
  }
}
