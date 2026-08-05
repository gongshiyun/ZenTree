import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as path from "path";
import type { AppSettings } from "../electron/settingsRepository";

/**
 * Isolated tests for createMainWindow. BrowserWindow is replaced by a fake
 * that records options, navigation targets and event listeners.
 */
const { FakeBrowserWindow } = vi.hoisted(() => {
  class FakeBrowserWindow {
    static instances: FakeBrowserWindow[] = [];
    opts: Record<string, unknown>;
    listeners: Record<string, (() => void)[]> = {};
    loadedURL: string | null = null;
    loadedFile: string | null = null;
    devToolsOpened = false;
    bounds = { x: 0, y: 0, width: 1024, height: 768 };
    webContents = { openDevTools: () => { this.devToolsOpened = true; } };
    constructor(opts: Record<string, unknown>) {
      this.opts = opts;
      FakeBrowserWindow.instances.push(this);
    }
    on(ev: string, fn: () => void) {
      (this.listeners[ev] = this.listeners[ev] ?? []).push(fn);
    }
    emit(ev: string) {
      for (const fn of this.listeners[ev] ?? []) fn();
    }
    getBounds() { return this.bounds; }
    loadURL(url: string) { this.loadedURL = url; }
    loadFile(file: string) { this.loadedFile = file; }
  }
  return { FakeBrowserWindow };
});

vi.mock("electron", () => ({ BrowserWindow: FakeBrowserWindow }));

import { createMainWindow } from "../electron/windowManager";

class FakeSettings {
  store: AppSettings = {};
  setCalls: [string, unknown][] = [];
  load() { return this.store; }
  get(key: string) { return this.store[key]; }
  set(key: string, value: unknown) {
    this.setCalls.push([key, value]);
    this.store[key] = value;
  }
  save(s: AppSettings) { this.store = s; }
}

let originalArgv: string[];
let originalNodeEnv: string | undefined;

beforeEach(() => {
  FakeBrowserWindow.instances.length = 0;
  originalArgv = process.argv;
  originalNodeEnv = process.env.NODE_ENV;
});

afterEach(() => {
  process.argv = originalArgv;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  vi.useRealTimers();
});

describe("createMainWindow", () => {
  it("uses defaults and secure webPreferences when nothing is persisted", () => {
    delete process.env.NODE_ENV;
    const win = createMainWindow(new FakeSettings() as never);
    expect(win.opts).toMatchObject({ width: 1400, height: 900, minWidth: 900, minHeight: 600, frame: false });
    const prefs = (win.opts.webPreferences ?? {}) as Record<string, unknown>;
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.sandbox).toBe(true);
    expect(String(prefs.preload)).toContain("preload.js");
  });

  it("restores persisted window dimensions", () => {
    const settings = new FakeSettings();
    settings.store = { windowWidth: 1234, windowHeight: 876 };
    const win = createMainWindow(settings as never);
    expect(win.opts.width).toBe(1234);
    expect(win.opts.height).toBe(876);
  });

  it("loads the dev server and opens devtools in dev mode", () => {
    process.env.NODE_ENV = "development";
    const win = createMainWindow(new FakeSettings() as never);
    expect(win.loadedURL).toBe("http://localhost:5173");
    expect(win.devToolsOpened).toBe(true);
    expect(win.loadedFile).toBeNull();
  });

  it("also treats the --dev flag as dev mode", () => {
    delete process.env.NODE_ENV;
    process.argv = [...originalArgv, "--dev"];
    const win = createMainWindow(new FakeSettings() as never);
    expect(win.loadedURL).toBe("http://localhost:5173");
  });

  it("loads the packaged index.html in production", () => {
    delete process.env.NODE_ENV;
    process.argv = originalArgv.filter((a) => a !== "--dev");
    const win = createMainWindow(new FakeSettings() as never);
    expect(win.loadedURL).toBeNull();
    expect(win.loadedFile).not.toBeNull();
    expect(win.loadedFile!.split(path.sep).slice(-2).join("/")).toBe("dist/index.html");
    expect(win.devToolsOpened).toBe(false);
  });

  it("persists resized window bounds after the debounce window", () => {
    vi.useFakeTimers();
    const settings = new FakeSettings();
    const win = createMainWindow(settings as never);
    win.bounds = { x: 0, y: 0, width: 1500, height: 950 };

    win.emit("resize");
    win.emit("resize"); // rapid successive resize: debounce must coalesce
    expect(settings.setCalls).toHaveLength(0);

    vi.advanceTimersByTime(300);
    expect(settings.setCalls).toEqual([["windowWidth", 1500], ["windowHeight", 950]]);
    expect(settings.store.windowWidth).toBe(1500);
  });
});
