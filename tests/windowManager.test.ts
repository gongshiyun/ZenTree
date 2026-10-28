import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as path from "path";
import type { AppSettings } from "../electron/settingsRepository";

/**
 * Isolated tests for createMainWindow. BrowserWindow/app are replaced by fakes
 * that record options, navigation targets, event listeners and hardening hooks.
 */
const { FakeBrowserWindow, appState } = vi.hoisted(() => {
  const appState = { isPackaged: false };
  class FakeBrowserWindow {
    static instances: FakeBrowserWindow[] = [];
    opts: Record<string, unknown>;
    listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    webContents: Record<string, unknown> & {
      openDevTools: () => void;
      on: (ev: string, fn: (...args: unknown[]) => void) => void;
    };
    loadedURL: string | null = null;
    loadedFile: string | null = null;
    devToolsOpened = false;
    destroyed = false;
    windowOpenHandler: (() => { action: string }) | null = null;
    bounds = { x: 0, y: 0, width: 1024, height: 768 };
    constructor(opts: Record<string, unknown>) {
      this.opts = opts;
      FakeBrowserWindow.instances.push(this);
      const navigationListeners: ((...args: unknown[]) => void)[] = [];
      this.webContents = {
        openDevTools: () => { this.devToolsOpened = true; },
        setWindowOpenHandler: (fn: () => { action: string }) => { this.windowOpenHandler = fn; },
        on: (ev: string, fn: (...args: unknown[]) => void) => {
          if (ev === "will-navigate") navigationListeners.push(fn);
        },
        navigationListeners,
      };
    }
    on(ev: string, fn: () => void) {
      (this.listeners[ev] = this.listeners[ev] ?? []).push(fn);
    }
    emit(ev: string) {
      for (const fn of this.listeners[ev] ?? []) fn();
    }
    getBounds() { return this.bounds; }
    isDestroyed() { return this.destroyed; }
    loadURL(url: string) { this.loadedURL = url; }
    loadFile(file: string) { this.loadedFile = file; }
  }
  return { FakeBrowserWindow, appState };
});

vi.mock("electron", () => ({
  BrowserWindow: FakeBrowserWindow,
  app: { get isPackaged() { return appState.isPackaged; } },
}));

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
  appState.isPackaged = false;
});

afterEach(() => {
  process.argv = originalArgv;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  appState.isPackaged = false;
  vi.useRealTimers();
});

function navigateEvent() {
  return { prevented: false, preventDefault() { this.prevented = true; } };
}

describe("createMainWindow", () => {
  it("uses defaults and secure webPreferences when nothing is persisted", () => {
    delete process.env.NODE_ENV;
    const win = createMainWindow(new FakeSettings() as never) as unknown as InstanceType<typeof FakeBrowserWindow>;
    expect(win.opts).toMatchObject({ width: 1400, height: 900, minWidth: 900, minHeight: 600, frame: false });
    const prefs = (win.opts.webPreferences ?? {}) as Record<string, unknown>;
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.sandbox).toBe(true);
    expect(String(prefs.preload)).toContain("preload.js");
  });

  it("uses the saved theme background colour", () => {
    delete process.env.NODE_ENV;
    const settings = new FakeSettings();
    settings.store = { themePreset: "claude-dark" };
    const win = createMainWindow(settings as never) as unknown as InstanceType<typeof FakeBrowserWindow>;
    expect(win.opts.backgroundColor).toBe("#262624");
  });

  it("restores persisted window dimensions", () => {
    const settings = new FakeSettings();
    settings.store = { windowWidth: 1234, windowHeight: 876 };
    const win = createMainWindow(settings as never) as unknown as InstanceType<typeof FakeBrowserWindow>;
    expect(win.opts.width).toBe(1234);
    expect(win.opts.height).toBe(876);
  });

  it("loads the dev server and opens devtools in dev mode", () => {
    process.env.NODE_ENV = "development";
    const win = createMainWindow(new FakeSettings() as never) as unknown as InstanceType<typeof FakeBrowserWindow>;
    expect(win.loadedURL).toBe("http://localhost:5173");
    expect(win.devToolsOpened).toBe(true);
    expect(win.loadedFile).toBeNull();
  });

  it("also treats the --dev flag as dev mode", () => {
    delete process.env.NODE_ENV;
    process.argv = [...originalArgv, "--dev"];
    const win = createMainWindow(new FakeSettings() as never) as unknown as InstanceType<typeof FakeBrowserWindow>;
    expect(win.loadedURL).toBe("http://localhost:5173");
  });

  it("never loads the dev server in a packaged app, even with --dev", () => {
    appState.isPackaged = true;
    process.env.NODE_ENV = "development";
    process.argv = [...originalArgv, "--dev"];
    const win = createMainWindow(new FakeSettings() as never) as unknown as InstanceType<typeof FakeBrowserWindow>;
    expect(win.loadedURL).toBeNull();
    expect(win.loadedFile).not.toBeNull();
    expect(win.devToolsOpened).toBe(false);
  });

  it("loads the packaged index.html in production", () => {
    delete process.env.NODE_ENV;
    process.argv = originalArgv.filter((a) => a !== "--dev");
    const win = createMainWindow(new FakeSettings() as never) as unknown as InstanceType<typeof FakeBrowserWindow>;
    expect(win.loadedURL).toBeNull();
    expect(win.loadedFile).not.toBeNull();
    expect(win.loadedFile!.split(path.sep).slice(-2).join("/")).toBe("dist/index.html");
    expect(win.devToolsOpened).toBe(false);
  });

  it("denies popups and blocks navigation away from the app origin", () => {
    process.env.NODE_ENV = "development";
    const win = createMainWindow(new FakeSettings() as never) as unknown as InstanceType<typeof FakeBrowserWindow>;
    expect(win.windowOpenHandler?.()).toEqual({ action: "deny" });

    const listeners = (win.webContents as unknown as { navigationListeners: ((e: unknown, url: string) => void)[] }).navigationListeners;
    expect(listeners).toHaveLength(1);
    const blocked = navigateEvent();
    listeners[0](blocked, "https://evil.example.com/");
    expect(blocked.prevented).toBe(true);

    const allowed = navigateEvent();
    listeners[0](allowed, "http://localhost:5173/index.html");
    expect(allowed.prevented).toBe(false);
  });

  it("persists resized window bounds after the debounce window", () => {
    vi.useFakeTimers();
    const settings = new FakeSettings();
    const win = createMainWindow(settings as never) as unknown as InstanceType<typeof FakeBrowserWindow>;
    win.bounds = { x: 0, y: 0, width: 1500, height: 950 };

    win.emit("resize");
    win.emit("resize"); // rapid successive resize: debounce must coalesce
    expect(settings.setCalls).toHaveLength(0);

    vi.advanceTimersByTime(300);
    expect(settings.setCalls).toEqual([["windowWidth", 1500], ["windowHeight", 950]]);
    expect(settings.store.windowWidth).toBe(1500);
  });

  it("clears the resize timer when the window closes", () => {
    vi.useFakeTimers();
    const settings = new FakeSettings();
    const win = createMainWindow(settings as never) as unknown as InstanceType<typeof FakeBrowserWindow>;
    win.bounds = { x: 0, y: 0, width: 1500, height: 950 };
    win.emit("resize");
    win.destroyed = true;
    win.emit("closed");
    // Letting the (cancelled) timer run must not touch the destroyed window.
    vi.advanceTimersByTime(1000);
    expect(settings.setCalls).toHaveLength(0);
  });
});
