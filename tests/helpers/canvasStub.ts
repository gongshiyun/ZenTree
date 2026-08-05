import { vi } from "vitest";

/**
 * Shared jsdom canvas fixture: HTMLCanvasElement.prototype.getContext is
 * replaced with a recording stub so GraphRenderer (and components that embed
 * it, e.g. CommitGraph) can initialize inside jsdom, where the real canvas
 * 2D context is unavailable.
 *
 * Also stubs ResizeObserver, which jsdom does not implement.
 */
export function installCanvasStub(): () => void {
  const ctx = {
    fillStyle: "", strokeStyle: "", lineWidth: 0, font: "", textBaseline: "",
    save: vi.fn(), restore: vi.fn(), scale: vi.fn(), setTransform: vi.fn(),
    fillRect: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(),
    fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    bezierCurveTo: vi.fn(), roundRect: vi.fn(), translate: vi.fn(),
    fillText: vi.fn(), measureText: vi.fn(() => ({ width: 10 })),
  } as unknown as CanvasRenderingContext2D;

  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = (() => ctx) as typeof originalGetContext;

  const originalResizeObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;

  return () => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    if (originalResizeObserver === undefined) delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    else (globalThis as { ResizeObserver?: unknown }).ResizeObserver = originalResizeObserver;
  };
}
