import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

/**
 * Isolated tests for GraphRenderer (dual-canvas architecture). Browser
 * globals (window/document/rAF) and the canvas 2D contexts are replaced
 * with recording stubs so the renderer can be exercised without a DOM.
 */

interface FakeEvent {
  offsetX?: number; offsetY?: number; clientX?: number; clientY?: number;
  deltaY?: number; ctrlKey?: boolean; preventDefault: () => void;
}

function createFakeCanvas() {
  const listeners: Record<string, ((e: FakeEvent) => void)[]> = {};
  const ctx = {
    translateArgs: [] as number[][],
    texts: [] as string[],
    arcCount: 0,
    measureCount: 0,
    fillStyle: "", strokeStyle: "", lineWidth: 0, font: "", textBaseline: "",
    save() {}, restore() {}, scale() {}, setTransform() {}, fillRect() {}, clearRect() {},
    beginPath() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {}, bezierCurveTo() {}, roundRect() {},
    translate(x: number, y: number) { this.translateArgs.push([x, y]); },
    arc() { this.arcCount += 1; },
    fillText(text: string) { this.texts.push(text); },
    measureText(text: string) { this.measureCount += 1; return { width: text.length * 7 }; },
  };
  const canvas = {
    width: 0, height: 0,
    style: {} as Record<string, string>,
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
    getBoundingClientRect: () => ({ width: 800, height: 600, top: 0, left: 0 }),
    addEventListener(ev: string, fn: (e: FakeEvent) => void) {
      (listeners[ev] = listeners[ev] ?? []).push(fn);
    },
    removeEventListener(ev: string, fn: (e: FakeEvent) => void) {
      const arr = listeners[ev] ?? [];
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
    dispatch(ev: string, e: Partial<FakeEvent> = {}) {
      for (const fn of listeners[ev] ?? []) fn({ preventDefault: () => {}, ...e });
    },
    count(ev: string) { return (listeners[ev] ?? []).length; },
  };
  return { canvas, ctx };
}

// --- global stubs -----------------------------------------------------------
let rafCallbacks: Map<number, () => void>;
let nextRafId: number;

function flushRaf() {
  const pending = [...rafCallbacks.entries()];
  rafCallbacks.clear();
  for (const [, cb] of pending) cb();
}

const savedGlobals: Record<string, unknown> = {};

beforeAll(() => {
  const g = globalThis as Record<string, unknown>;
  for (const key of ["window", "document", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
    savedGlobals[key] = g[key];
  }
  g.window = { devicePixelRatio: 2 };
  g.document = { documentElement: {} };
  g.getComputedStyle = () => ({ getPropertyValue: () => "" });
  rafCallbacks = new Map();
  nextRafId = 1;
  g.requestAnimationFrame = (cb: () => void) => {
    rafCallbacks.set(nextRafId, cb);
    return nextRafId++;
  };
  g.cancelAnimationFrame = (id: number) => { rafCallbacks.delete(id); };
});

afterAll(() => {
  const g = globalThis as Record<string, unknown>;
  for (const [key, value] of Object.entries(savedGlobals)) {
    if (value === undefined) delete g[key];
    else g[key] = value;
  }
});

import { GraphRenderer } from "../src/renderer/canvasRenderer";
import { buildGraphData } from "../src/domain/graph/layout";
import type { CommitLogEntry, GraphNode } from "../src/types";

function entry(hash: string, parents: string[]): CommitLogEntry {
  return { hash, shortHash: hash.slice(0, 7), parents, author: "A", email: "a@b.c", timestamp: 1700000000, subject: `subject ${hash}` };
}

function makeRenderer(count = 3) {
  const base = createFakeCanvas();
  const overlay = createFakeCanvas();
  const renderer = new GraphRenderer(base.canvas as unknown as HTMLCanvasElement, overlay.canvas as unknown as HTMLCanvasElement);
  const entries: CommitLogEntry[] = [];
  for (let i = 0; i < count; i++) {
    entries.push(entry(`c${i}`, i + 1 < count ? [`c${i + 1}`] : []));
  }
  return { base, overlay, renderer, data: buildGraphData(entries) };
}

beforeEach(() => {
  rafCallbacks.clear();
});

describe("GraphRenderer", () => {
  it("throws when any canvas cannot provide a 2D context", () => {
    const bad = { getContext: () => null, addEventListener: () => {}, getBoundingClientRect: () => ({ width: 0, height: 0 }) };
    const good = createFakeCanvas();
    expect(() => new GraphRenderer(bad as unknown as HTMLCanvasElement, good.canvas as unknown as HTMLCanvasElement)).toThrowError(/2D context/);
    expect(() => new GraphRenderer(good.canvas as unknown as HTMLCanvasElement, bad as unknown as HTMLCanvasElement)).toThrowError(/2D context/);
  });

  it("sizes both layers' backing stores using the device pixel ratio", () => {
    const { base, overlay, renderer } = makeRenderer();
    expect(base.canvas.width).toBe(1600); // 800 * dpr(2)
    expect(base.canvas.height).toBe(1200);
    expect(overlay.canvas.width).toBe(1600);
    expect(overlay.canvas.height).toBe(1200);
    renderer.destroy();
  });

  it("pins the graph column on first data load and draws the commit count", () => {
    const { base, renderer, data } = makeRenderer(3);
    renderer.setData(data);
    flushRaf();
    // translate receives camera.offsetX(16) + PADDING_LEFT(20)
    expect(base.ctx.translateArgs.some(([x]) => x === 36)).toBe(true);
    expect(base.ctx.texts).toContain("3 commits");
    renderer.destroy();
  });

  it("fires onNearBottom when the last row is visible", () => {
    const { renderer, data } = makeRenderer(3);
    let nearBottom = 0;
    renderer.setCallbacks({ onNearBottom: () => { nearBottom += 1; } });
    renderer.setData(data);
    flushRaf();
    expect(nearBottom).toBeGreaterThan(0);
    renderer.destroy();
  });

  it("clamps zoom between 0.1 and 5 and resets on demand", () => {
    const { renderer } = makeRenderer();
    renderer.zoomBy(100);
    expect(renderer.getScale()).toBe(5);
    renderer.zoomBy(0.0001);
    expect(renderer.getScale()).toBeCloseTo(0.1, 5);
    renderer.resetZoom();
    expect(renderer.getScale()).toBe(1);
    renderer.destroy();
  });

  it("zooms with ctrl+wheel and scrolls with plain wheel", () => {
    const { overlay, renderer, data } = makeRenderer(50);
    renderer.setData(data);
    flushRaf();
    const before = renderer.getScale();
    overlay.canvas.dispatch("wheel", { deltaY: -100, ctrlKey: true });
    expect(renderer.getScale()).toBeCloseTo(before * 1.1, 5);
    // plain wheel must scroll without changing zoom
    overlay.canvas.dispatch("wheel", { deltaY: -50 });
    expect(renderer.getScale()).toBeCloseTo(before * 1.1, 5);
    renderer.destroy();
  });

  it("selects a node through mousedown+mouseup and reports it via onClick", () => {
    const { overlay, renderer, data } = makeRenderer(3);
    let clicked: GraphNode | null = null;
    renderer.setCallbacks({ onClick: (n) => { clicked = n; } });
    renderer.setData(data);
    flushRaf();

    // node c0 sits at world (22, 15); screen = offset(16)+padding(20) + world
    const sx = 16 + 20 + 22;
    const sy = 16 + 15;
    overlay.canvas.dispatch("mousedown", { offsetX: sx, offsetY: sy });
    overlay.canvas.dispatch("mouseup", { offsetX: sx, offsetY: sy });
    expect(clicked).not.toBeNull();
    expect(clicked!.hash).toBe("c0");
    renderer.destroy();
  });

  it("cancels the click when the pointer drags away before release", () => {
    const { overlay, renderer, data } = makeRenderer(3);
    let clicked = 0;
    renderer.setCallbacks({ onClick: () => { clicked += 1; } });
    renderer.setData(data);
    flushRaf();
    overlay.canvas.dispatch("mousedown", { offsetX: 58, offsetY: 31 });
    overlay.canvas.dispatch("mousemove", { offsetX: 400, offsetY: 400 });
    overlay.canvas.dispatch("mouseup", { offsetX: 400, offsetY: 400 });
    expect(clicked).toBe(0);
    renderer.destroy();
  });

  it("tracks hover state and cursor style", () => {
    const { overlay, renderer, data } = makeRenderer(3);
    const hovers: (GraphNode | null)[] = [];
    renderer.setCallbacks({ onHover: (n) => hovers.push(n) });
    renderer.setData(data);
    flushRaf();

    overlay.canvas.dispatch("mousemove", { offsetX: 58, offsetY: 31 });
    expect(hovers.at(-1)?.hash).toBe("c0");
    expect(overlay.canvas.style.cursor).toBe("pointer");

    overlay.canvas.dispatch("mouseleave");
    expect(hovers.at(-1)).toBeNull();
    renderer.destroy();
  });

  it("opens the context menu for a node under the pointer", () => {
    const { overlay, renderer, data } = makeRenderer(3);
    let menu: { hash: string; x: number; y: number } | null = null;
    renderer.setCallbacks({ onContextMenu: (n, x, y) => { menu = { hash: n.hash, x, y }; } });
    renderer.setData(data);
    flushRaf();
    overlay.canvas.dispatch("contextmenu", { offsetX: 58, offsetY: 31, clientX: 500, clientY: 300 });
    expect(menu).toEqual({ hash: "c0", x: 500, y: 300 });
    renderer.destroy();
  });

  it("scrollToNode ignores unknown hashes and selects known ones", () => {
    const { base, renderer, data } = makeRenderer(3);
    renderer.setData(data);
    flushRaf();
    base.ctx.texts.length = 0;
    renderer.scrollToNode("nope"); // unknown: must not crash or schedule a render
    expect(rafCallbacks.size).toBe(0);
    renderer.scrollToNode("c2");
    flushRaf();
    expect(base.ctx.texts).toContain("3 commits");
    renderer.destroy();
  });

  it("draws interaction rings on the overlay layer only", () => {
    const { overlay, renderer, data } = makeRenderer(3);
    renderer.setData(data);
    flushRaf();
    // Plain render: no arcs on the overlay.
    expect(overlay.ctx.arcCount).toBe(0);

    renderer.setSelected("c0");
    flushRaf();
    expect(overlay.ctx.arcCount).toBeGreaterThan(0);
    renderer.destroy();
  });

  it("caches text measurements and formats dates once per node", () => {
    const { base, renderer, data } = makeRenderer(3);
    renderer.setData(data);
    flushRaf();
    const measuredOnce = base.ctx.measureCount;
    // Re-render without data change: cached measurements, no new measureText calls.
    renderer.setSelected("c0");
    flushRaf();
    // overlay redraw does not measure text; base was not re-rendered.
    renderer.zoomBy(1.2); // forces a base redraw
    flushRaf();
    expect(base.ctx.measureCount).toBe(measuredOnce);
    renderer.destroy();
  });

  it("detaches all listeners and pending frames on destroy", () => {
    const { overlay, renderer } = makeRenderer();
    renderer.destroy();
    for (const ev of ["wheel", "mousedown", "mousemove", "mouseup", "mouseleave", "contextmenu"]) {
      expect(overlay.canvas.count(ev), `listener left for ${ev}`).toBe(0);
    }
    expect(rafCallbacks.size).toBe(0);
  });
});
