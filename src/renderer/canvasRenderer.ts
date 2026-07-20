import type { GraphData, GraphNode, GraphEdge } from "../types";

const NODE_RADIUS = 7;
const ROW_HEIGHT = 32;
const LANE_WIDTH = 24;
const PADDING_LEFT = 20;
const PADDING_TOP = 16;

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
  private dragCameraStart: Camera = { offsetX: 0, offsetY: 0, scale: 1 };
  private theme: "dark" | "light" = "dark";

  // Callbacks
  private onHover: ((node: GraphNode | null) => void) | null = null;
  private onClick: ((node: GraphNode) => void) | null = null;
  private onContextMenu: ((node: GraphNode, x: number, y: number) => void) | null = null;

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
    this.render();
  }

  setCallbacks(callbacks: {
    onHover?: (node: GraphNode | null) => void;
    onClick?: (node: GraphNode) => void;
    onContextMenu?: (node: GraphNode, x: number, y: number) => void;
  }) {
    if (callbacks.onHover) this.onHover = callbacks.onHover;
    if (callbacks.onClick) this.onClick = callbacks.onClick;
    if (callbacks.onContextMenu) this.onContextMenu = callbacks.onContextMenu;
  }

  setData(data: GraphData) {
    this.data = data;
    if (this.data.nodes.length > 0) {
      const firstNode = this.data.nodes[0];
      this.camera.offsetX = this.width / 2 - firstNode.x;
      this.camera.offsetY = 40;
    }
    this.render();
  }

  setSelected(hash: string | null) {
    this.selectedHash = hash;
    this.render();
  }

  handleResize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.render();
  }

  render() {
    const { ctx, width, height, camera, data } = this;
    const isDark = this.theme === "dark";

    // Clear
    ctx.fillStyle = isDark ? "#1a1b26" : "#fafafa";
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

    ctx.restore();

    // Draw node count info
    ctx.fillStyle = isDark ? "#555" : "#aaa";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(`${data.nodes.length} commits`, 12, height - 8);
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
      const midY = (fromY + toY) / 2;

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
      const r = isSelected ? NODE_RADIUS + 2 : isHovered ? NODE_RADIUS + 1 : NODE_RADIUS;

      // Glow or selection ring
      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? "rgba(97, 175, 239, 0.3)" : "rgba(150, 150, 150, 0.2)";
        ctx.fill();
      }

      // Main node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();

      // Outline
      ctx.strokeStyle = isDark ? "#1a1b26" : "#fafafa";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Commit subject text
      ctx.fillStyle = isDark ? "#abb2bf" : "#555";
      ctx.font = `12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
      ctx.textBaseline = "middle";
      const textX = data.maxLane * LANE_WIDTH + LANE_WIDTH + 12;
      const subj = node.subject; ctx.fillText(subj.length > 60 ? subj.substring(0, 60) + '...' : subj, textX, node.y);
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

  private estimateTextWidth(text: string, fontSize: number): number {
    return text.length * fontSize * 0.6;
  }

  private hitTest(sx: number, sy: number): GraphNode | null {
    const world = this.screenToWorld(sx, sy);
    const hitRadius = NODE_RADIUS + 6;
    const textX = this.data.maxLane * LANE_WIDTH + LANE_WIDTH + 12;
    const halfFont = 7;

    // Search from last (closest to cursor visually) to first
    for (let i = this.data.nodes.length - 1; i >= 0; i--) {
      const node = this.data.nodes[i];
      // Check circle hit
      const dx = node.x - world.x;
      const dy = node.y - world.y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return node;
      }
      // Check text label hit
      const textW = this.estimateTextWidth(node.subject.substring(0, 60), 12);
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

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, this.camera.scale * zoomFactor));

    // Zoom toward cursor
    const mouseX = e.offsetX;
    const mouseY = e.offsetY;

    const worldBefore = this.screenToWorld(mouseX, mouseY);
    this.camera.scale = newScale;
    const worldAfter = this.screenToWorld(mouseX, mouseY);

    this.camera.offsetX += (worldAfter.x - worldBefore.x) * newScale;
    this.camera.offsetY += (worldAfter.y - worldBefore.y) * newScale;

    this.render();
  };

  private handleMouseDown = (e: MouseEvent) => {
    const node = this.hitTest(e.offsetX, e.offsetY);

    if (node) {
      // Start drag on node (but also track for click)
      this.isDragging = false;
      this.dragStartX = e.offsetX;
      this.dragStartY = e.offsetY;
    } else {
      // Start pan
      this.isDragging = true;
      this.dragStartX = e.offsetX;
      this.dragStartY = e.offsetY;
      this.dragCameraStart = { ...this.camera };
    }
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (this.isDragging) {
      const dx = e.offsetX - this.dragStartX;
      const dy = e.offsetY - this.dragStartY;

      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        this.camera.offsetX = this.dragCameraStart.offsetX + dx;
        this.camera.offsetY = this.dragCameraStart.offsetY + dy;
        this.hoveredNode = null;
        this.onHover?.(null);
        this.render();
        return;
      }
    }

    const node = this.hitTest(e.offsetX, e.offsetY);
    if (node !== this.hoveredNode) {
      this.hoveredNode = node;
      this.canvas.style.cursor = node ? "pointer" : "grab";
      this.onHover?.(node);
      this.render();
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (this.isDragging) {
      this.isDragging = false;
      return;
    }

    // Check if click (minimal movement)
    const dx = Math.abs(e.offsetX - this.dragStartX);
    const dy = Math.abs(e.offsetY - this.dragStartY);

    if (dx < 3 && dy < 3) {
      const node = this.hitTest(e.offsetX, e.offsetY);
      if (node) {
        this.selectedHash = node.hash;
        this.onClick?.(node);
        this.render();
      }
    }
  };

  private handleMouseLeave = () => {
    this.isDragging = false;
    if (this.hoveredNode) {
      this.hoveredNode = null;
      this.onHover?.(null);
      this.render();
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
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("mousedown", this.handleMouseDown);
    this.canvas.removeEventListener("mousemove", this.handleMouseMove);
    this.canvas.removeEventListener("mouseup", this.handleMouseUp);
    this.canvas.removeEventListener("mouseleave", this.handleMouseLeave);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
  }
}
